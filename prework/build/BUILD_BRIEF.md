# Build brief: sustainability flow app (Next.js on Vercel)

Organizer rule: all code is built in the team's own Codespaces with their own AI. ZooWork only hosts and runs the two agents. This brief is the contract between the pieces. Items marked VERIFY are from the docs but untested.

## 1. Pieces
| Piece | Where it runs | Purpose |
|---|---|---|
| Intake Agent, Disposition Agent | ZooWork Managed Agents | The autonomous work |
| Next.js app (UI + API routes + webhook handler) | Vercel | Interface, state, tool execution, approvals, cost guard |
| `/mcp` route (recycler-directory) | Same Vercel project | Public, unauthenticated, no redirects, fictional data |
| Database (libSQL/Turso or Neon) | Hosted | Items, reviews, approvals, alerts, events |

The API key lives only in Vercel/Codespaces env vars and server code.

## 2. How the agents talk to the app (the key design)
Custom tools and approvals are asynchronous: the agent pauses, our app answers later. So no HTTP call from ZooWork to us is held open.

1. App starts a run: create session on the agent, send `user.message` with an `idempotency_key` in the body.
2. Agent calls a custom tool. ZooWork emits `agent.custom_tool_use` (and a webhook `custom_tool.requested`; VERIFY webhooks work with a Platform key).
3. App handler executes the tool against the DB and answers with `resolve_custom_tool_call` (or a `user.custom_tool_result` event with a stable idempotency key). Dedupe with `handled_calls`.
4. `hold_for_review` is the exception: store a `reviews` row with the call id and do NOT resolve. When a person decides in the UI, resolve that call with `{decision, tags}`. Pending calls survive restarts (`list_custom_tool_calls`).
5. MCP `book_pickup` is `always_ask`: ZooWork emits an approval (`approval.requested`); store in `approvals`; the UI shows Approve/Deny; call `resolve_approval` (`allow-once` or `deny`). Unresolved approvals auto-deny after 10 minutes.
6. Every event is stored in `events` (dedupe on session_id + cursor) and streamed to the browser.

Two ways to get events (build both, switch by env flag):
- Webhook route `/api/zoowork/webhook`: verify the Standard Webhooks signature on the RAW body (+/-300 s), dedupe by event id, then read the resource to confirm (webhooks can duplicate or arrive out of order).
- Fallback poller: `/api/runs/[sessionId]/pump` reads the stream/`list_all_events` with the opaque `cursor` (never `seq`). Use if webhooks are unavailable on the key or for local Codespaces dev.

Serverless caution: keep every handler short and idempotent. Do not hold a stream open inside a Vercel function longer than its limit; the browser gets live updates from our own `/api/events/stream` (SSE from the DB) or by polling.

## 3. Tool contracts (match agents/custom_tools.json)
- `get_batch({batch_id})` returns `{items:[{item_key,garment_type,color,category,label_text,image_path,visible_note,condition}]}`. For items with images: before the run, `upload_file` the image to the agent `/workspace` and put the workspace path in `image_path`. Text-only items need no upload. Keep batches small (images upload at about 100 KB/s).
- `save_tags({item_key,tags,confidence,reason,label_data?})` writes tags, sets `status='tagged'`. Return `{ok:true}`.
- `hold_for_review({item_key,reason,proposed_tags?,confidence,label_data?})` creates a review, sets `status='held'`, returns later `{decision:'approve'|'edit'|'reject', tags?}`. approve/edit set `tagged`; reject sets `rejected`.
- `list_inventory({today})` returns all rows with `status`, `alert_status`, dates, tags, location, season.
- `send_alert({type,items,location?,deadline?,next_step,recycler_address?,summary})` inserts an alert, sets `alert_status='sent'` on those items, returns `{alert_id}`. Reject (return an error) if any item is already `sent`: that is the double-alert guard.
- MCP (`/mcp`): `search_recyclers({route})`, `book_pickup({partner_id,route,items,lots,deadline})`; data from `data/recyclers.json`; `book_pickup` also validates `min_items`. Tools appear as `mcp__recyclerdirectory__*`.
Validate every tool input (zod). Never take user or tenant identity from tool input.

## 4. Screens (mobile first, one job per screen)

> **Superseded.** The screen list below describes the first UI (names such as Check labels and Approve pickups, swipe cards for pickups, a start card on Home). The current UI is in [docs/ui-current.md](../../docs/ui-current.md); it wins where they differ.
The app is built for people with little tech experience: big type, one thing to do per screen, plain words. Same screens for everyone (no roles, no login in the demo build). It shows only the six steps in the use-case one-pager and the two human checkpoints.
1. **Home** (`/`): a banner "N things need you", three big buttons with count badges (Check labels, Approve pickups, Messages), and one start card: "Start reading labels" when a new batch arrives (starts the Intake Agent), then "Run now" (starts the Disposition Agent; it also runs on its daily schedule).
2. **Check labels** (`/check`): checkpoint 1. Cards for items the Intake Agent held (confidence under 0.80). Three buttons: No / Change this / Yes. Yes (or swipe right) approves the proposed tags. Change this opens the pile picker. No (or swipe left) offers Send to someone (a named person from `data/people.json`; the item stays in the queue with a "With X" chip, the agent keeps waiting) or Delete from pile (reject).
3. **Approve pickups** (`/pickups`): checkpoint 2. One card per proposed pickup (route, collector, hand-over date, items). Swipe right or "Yes, book it" approves `book_pickup`. Left: Send to someone, or Do not book it (deny). Once booked, the pickup request file opens from the list.
4. **Messages** (`/messages`): the manager's inbox of INCOMING messages only: agent alerts (`donate_recycle_due`, `review_waiting`) and replies from the people an item was sent to. Outgoing "send to someone" messages are not shown. Tap a message to read it in full; opening it counts as checked (no button), with a link to the related label or pickup. DEMO ONLY: a made-up reply arrives about 6 seconds after Send to someone (`DEMO_REPLY_MS`, off when `ZOO_MODE=real`).
Tech-team page (`/team`, linked small at the bottom of Home): ZooWork balance, runs with a Stop button, every item, the raw live agent feed.
**No timeouts:** nothing is auto-denied; held items and pickups wait in their queues until a person decides.

## 5. Cost guard (mandatory)
Before every run start: read `GET /balance` and `GET /usage?range=24h&group_by=session`; refuse if balance < BALANCE_FLOOR_USD. While running: if session cost > RUN_COST_LIMIT_USD, send `user.interrupt`. Closing a stream does not cancel a run. No retry loops without a cap. Transcript cost fields read 0; only `/usage` counts, and it lags.

## 6. Provisioning script (`scripts/provision.ts`, run from Codespaces)
Serialize everything: (1) upload the four skill ZIPs; (2) `createAgent` for intake, wait, then disposition (parallel creates give 503); use idempotency keys; (3) `put_agent_skill` for each; (4) start agents and poll `status.desired_state`; (5) create webhooks (VERIFY); (6) create the disposition schedule with a far-future cron, `enabled` per plan; (7) print agent ids for `.env`. `scripts/teardown.ts`: delete schedules, stop agents, delete agents.
Use the TypeScript SDK `@zoowork-ai/sdk` (0.14.0+, Node 22+). Do not use urllib or any default Python User-Agent (403). Confirm exact request shapes against the SDK reference when coding; the JSON in `agents/resources/` is a template.

## 7. Testing without spending
Write a fake ZooWork transport (SDK accepts a custom transport/fetch) that replays recorded events: a tool call per item, a hold, an approval. Run the whole UI against it. Only then do the paid smoke test. Score real runs with `tools/score_intake.py` and `tools/score_disposition.py` after exporting results from the DB in the scorer formats.

## 8. Risks
- Webhooks may not work with a Platform key: keep the poller path.
- Vercel function time limits: short handlers, state in DB.
- MCP endpoint redirects (www, trailing slash) break ZooWork: test `curl -i`.
- Approval timeout: the use-case PDFs mention an auto-deny after 10 minutes. Team decision: nothing is ever auto-denied by our app, and held items and pickups stay in their queues until a person decides. At the smoke test, check whether ZooWork itself ends a waiting approval after a timeout. If it does, the agent gets a denial and sends a `review_waiting` alert, and the team must decide whether to re-run. Demo approvals right away.
- Artifact URLs are credentials; do not log or expose them.
- Image upload speed: use few or no images in the live demo; pre-upload before the clock if allowed.
