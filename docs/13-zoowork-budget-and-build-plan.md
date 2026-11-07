# ZooWork Budget and Build Plan: the two-agent demo (engineer handoff, v2)

Updated 2026-11-07. **v2 replaces v1 of this file.** v1 planned 4-5 agents and kept most logic in our code; that idea was dropped (see `14-sustainability-flow-build-spec.md`, which explains why the autonomous work must live in the agents). This file is now the single place for **what to build on ZooWork, how to build it as cheaply as possible, and how to stop spending.** Platform facts stay in `12-zoowork-platform-guide.md`.

**Audience:** the automation engineer who builds and runs the two agents on ZooWork. **Constraint:** about **USD 100 total**, and **4-5 hours** of build time once funds arrive. **Goal:** spend as little of the 100 as possible; planned spend below is about 23 (cheap demo model) to about 59 (frontier demo model).

**Evidence labels:** **[Pricing]** zoowork.ai/pricing (rates "checked October 2, 2026"). **[Docs]** ZooWork developer docs. **[Repo]** a file we already built (`prework/...` or `sustain-app/...`). **[Estimate]** our arithmetic; real cost can differ 2-3x until measured. **[Unverified]** not confirmed. Where a value must be measured, it is marked **MEASURE**.

---

## 1. What exists already (do not rebuild)
Everything below was built before the clock, at no ZooWork cost.

| Asset | Where | State |
|---|---|---|
| Two agent templates (config JSON) | `prework/agents/resources/intake.agent.json`, `disposition.agent.json` | Fill `model.primary` at the smoke test; tool_policy already denies unneeded tools |
| Two personas (`AGENTS.md`) | `prework/agents/intake/`, `prework/agents/disposition/` | About 2 KB each |
| Four skills (ZIP + source) | `prework/skills/dist/*.zip`: `label-reading`, `material-tagging`, `disposition-rules`, `reverse-logistics` | Built, about 2-2.6 KB each |
| Custom tool schemas | `prework/agents/custom_tools.json` | intake: `get_batch`, `save_tags`, `hold_for_review`; disposition: `list_inventory`, `send_alert` |
| Daily schedule + Outcome rubric | `prework/agents/resources/disposition.schedule.json` | Ships **disabled**; cron `0 9 * * *` UTC |
| recycler-directory MCP spec + fictional data | `prework/agents/resources/recycler_mcp_spec.md`, `data/recyclers.json` (4 partners) | Served by our app, public, unauthenticated |
| Test data with expected answers | `prework/data/`: 32 intake items, 28 inventory items, expected intake/disposition JSON | Seed set |
| Scorers | `prework/tools/score_intake.py`, `score_disposition.py` | Automatic accuracy score; use them to decide any model upgrade |
| Test prompts | `prework/tests/agent_test_prompts.md` | Smoke, idempotency, one injection check |
| The app (our side) | `sustain-app/` (Next.js on Vercel, repo `pmedhaswi/fashion-tech`) | Custom-tool endpoints, review and approval screens, webhook/event bridge, cost guard, fake ZooWork for offline tests, scripted agent simulators |
| Public replay demo | `sustain-app/preview/index.html` | Recorded run, no ZooWork needed |

**Not verified yet [Unverified]:** the app has never been compiled with `next build` here; its real ZooWork client (`lib/zoo.ts`, `RealZoo`) and event normalizer use SDK names taken from the docs and must be checked against the live API at the smoke test (section 7).

---

## 2. What to build on ZooWork (exactly two agents)

Delegation between agents is not a public API [Docs], so **our app starts each agent**; each agent then runs many steps on its own. Nothing else is created on ZooWork: no extra agents, no Builder subscription, no channels, no Environment.

### 2.1 Agent 1: `sustain-intake` (event: a batch arrives)
- Purpose: read each garment label, tag it (stream, fibre, colour group, condition), score confidence, save confident items, **hold** unsure ones for a person.
- Persona: `AGENTS.md` (Repo). Skills: `label-reading`, `material-tagging`. `include_global_skills:false` (otherwise four unused skills ride in every prompt).
- Custom tools (our app executes): `get_batch`, `save_tags`, `hold_for_review`. `hold_for_review` does not return until a person decides in our Check labels screen; the session shows `awaiting_approval`.
- Built-ins needed: `read`, and `image` only for the photo path. Everything else denied.
- Threshold: 0.80, passed in the message.

### 2.2 Agent 2: `sustain-disposition` (daily schedule + "Run now")
- Purpose: find items whose time is up by four date rules, route them, group pickups, search recyclers, request **approval** to book, alert, publish the pickup request file.
- Persona: `AGENTS.md` (Repo). Skills: `disposition-rules`, `reverse-logistics`.
- Custom tools: `list_inventory`, `send_alert`. Built-in: `artifact_publish` (pickup request). Everything else denied.
- Remote MCP server `recyclerdirectory` (no underscore in the name; tools appear as `mcp__recyclerdirectory__search_recyclers` and `__book_pickup`): `search_recyclers` is `always_allow`; **`book_pickup` is `always_ask`** (checkpoint 2, decided in our Approve pickups screen). Use `toolFilter` so only those two tools are exposed, `exposure:"direct"`.
- Scheduled runs carry the Outcome rubric already in `disposition.schedule.json`. `maxIterations` is 2: each extra iteration is another full pass (cost), so do not raise it.

### 2.3 Order of operations (serialize everything; parallel creates fail with 503) [Docs]
1. `list_models()`; note `selectable`, `default_for`, and the model's input modalities (needed for images).
2. Upload the four skill ZIPs; attach with `put_agent_skill` (`enabled:true`, pin a version).
3. `create_agent` Intake, with an **idempotency key**; `start_agent`; poll `status.desired_state` (not `actual_state`); **one agent at a time**.
4. Same for Disposition. Point `mcp[0].url` at the deployed `https://<app>/mcp` (public HTTPS, no auth, no redirects; test with `curl -i`).
5. Create one webhook per agent (events `run.finished`, `approval.requested`, `custom_tool.requested`) **or** let the app poll (see 6.4). Keep the `whsec_` secret server-side.
6. Create the schedule **disabled**. Enable only when the team wants the daily run live.
7. Save a copy of every agent config JSON in the repo: there is no config history API [Docs].

---

## 3. Cost levers: set these, in this order (biggest saving first)

Every model step re-sends the persona, skills, tool definitions and the whole conversation so far. Cost is therefore **steps x context size x price**. The levers:

| # | Lever | How | Why / expected saving [Estimate] |
|---|---|---|---|
| 1 | **Cheap model by default** | DeepSeek Flash Latest or Gemini 3.1 Flash Lite for both agents first; upgrade only if the scorer says accuracy is short | Cheap models are 10-20x cheaper per run than frontier (table in section 4) |
| 2 | **Fewer steps** | In each `AGENTS.md`, instruct: "call tools for several items in the same step" (parallel tool calls). Stronger option: a bulk `save_tags_batch` tool (our app change, I can make it) that saves all confident items in one call | Intake drops from about 40 steps to about 12-15, roughly 60% cheaper. This is the single biggest lever after the model |
| 3 | **Smaller prompt** | `tool_policy` with an explicit allow-list (`read`, `image`, `artifact_publish` where needed) plus the existing deny list. **MEASURE** first-step input tokens with default vs allow-list in the smoke test; keep the smaller. The docs' trivial example already used about 15k input tokens, mostly tool definitions | Each step is cheaper; also raises cache hits |
| 4 | **No thinking tokens** | `model.thinking:"off"` on cheap models; use `low` only if the scorer shows a gap. Thinking is billed as output | Output tokens cost 3-5x input |
| 5 | **Cap output** | `model.max_tokens: 4096` (already set); one-line `reason` per item; short summary | Protects against long rambling |
| 6 | **Stable prefix** | Never edit persona or skills between test runs unless needed; do not put dates or batch ids in the persona (they go in the message) | A stable prefix is more likely to be cached [Unverified]. **MEASURE** cache hit in the smoke test |
| 7 | **Small test batches while building** | Iterate on 10-item subsets; run the full 32 only for scored runs | Keeps iteration under about 5 cents per run |
| 8 | **One session per run, reuse agents** | Never create agents per run; creating leaves permanent workspaces | Avoids waste and the org-wide create serialization |
| 9 | **Stop agents when idle** | Stopped agents release their sandbox; running time is $0.20/h [Pricing] | Sandboxes total about $2 for the whole build |
| 10 | **Waiting costs nothing in tokens** | A run paused at `hold_for_review` or `book_pickup` makes no model calls; only resume steps cost, and the cache is probably cold after a human wait (modelled below) | Do not "poll" with the agent |
| 11 | **Offline first** | Build and test the app against the fake ZooWork client and scripted simulators (`ZOO_MODE=fake`, the default) | $0 until the smoke test |
| 12 | **No images unless needed** | The seed data has `label_text`; use the text path. Photo path only as a stretch, and only with a model whose `list_models` entry lists image input | Image tokens add input; the `image` tool may bill an extra model [Unverified] |

---

## 4. Cost model per run [Estimate]

Rates [Pricing], USD per 1M tokens (input / cached input / output): DeepSeek Flash 0.22 / 0.007 / 0.66; Gemini 3.1 Flash Lite 0.25 / 0.025 / 1.5; GLM-5 0.6 / 0.12 / 1.92; Claude Opus 5 5 / 0.5 / 25; GPT-5.5 5 / 0.5 / 30. Only these five models were seen; 37 are listed; other tiers, media, search and cache writes can carry separate charges. Credits: 200 credits = USD 1 [Docs].

**Assumptions (seed set).** Intake: 32 items, 40 steps (one `save_tags` per step), average 16k input tokens per step, 8k output, 5 holds. Disposition: 28 items, 25 steps, 18k average input, 5k output, 4 approvals. Each human wait adds one cold-cache step of about 20k uncached input.

| Model | 80% cached: intake / disposition / **pair** | 50% cached: **pair** | 0% cached (worst): **pair** |
|---|---|---|---|
| DeepSeek Flash | 0.06 / 0.04 / **0.10** | 0.17 | 0.29 |
| Gemini 3.1 Flash Lite | 0.08 / 0.06 / **0.14** | 0.21 | 0.34 |
| GLM-5 | 0.21 / 0.16 / **0.37** | 0.53 | 0.79 |
| Claude Opus 5 | 1.60 / 1.16 / **2.75** | 4.22 | 6.68 |
| GPT-5.5 | 1.64 / 1.18 / **2.82** | 4.29 | 6.74 |

"Pair" = one Intake run plus one Disposition run. With lever 2 (batched steps) subtract roughly 40% from the Intake figure. The 5-item smoke test costs a few cents on a cheap model.

**Takeaways.** (1) A cheap model makes build and test nearly free: even the worst case is about 30 cents per pair. (2) A frontier model costs 6-20x more per run; use it only if the scorer shows it fixes a real accuracy gap, and only for rehearsals and the live demo. (3) Cache hit rate is the biggest unknown; it is not documented, so measure it.

---

## 5. Budget (total USD 100)

Worst-case (0% cache) numbers, so the plan holds even if caching does not work.

| Bucket | Plan A: cheap demo model (GLM-5) | Plan B: frontier demo (Opus 5) |
|---|---|---|
| Smoke test (list models, 5-item intake, MCP + approval check, usage read) | 2 | 2 |
| Build and iterate (about 20 pair runs on small batches, DeepSeek/Gemini) | 8 | 8 |
| Full seed-set scored runs (6 pairs on GLM-5) | 5 | 5 |
| Model comparison (one full pair on each of Gemini, GLM; Opus only in Plan B) | 1 | 8 |
| Idempotency re-run + injection check | 1 | 1 |
| Rehearsals (3 pairs) | 2.4 | 20 |
| Live demo (2 pairs: one run, one fallback) | 1.6 | 13.4 |
| Sandboxes (2 agents x about 5 h x $0.20, worst case) | 2 | 2 |
| **Planned total** | **about 23** | **about 59** |
| Untouched reserve | about 77 | about 41 |

**Recommended: Plan A.** Switch to Plan B only if the scorer shows the cheap model misses expected tags or routes, and a stronger model fixes it. Decide at the 3:15 mark of the timeline (section 8) from the measured numbers, not before.

**Funding.** Minimum top-up is $5 [Pricing]. Fund in tranches: **$30 first** (covers Plan A with margin), then +$20 only if Plan B is chosen. Natural stop points beat a big balance. Credits are shared by all Projects.

**Spending rules for the team**
1. Nobody starts a run that is not on the plan above.
2. At **$30 spent** (check `/usage`) stop and hold a 2-minute team decision before spending more.
3. Hard floor: the app refuses new runs when the balance is below `BALANCE_FLOOR_USD` (set 20, or 10 if only the first $30 tranche was loaded).
4. Per-run limit: set `RUN_COST_LIMIT_USD` to **1** on cheap models (expected run under $0.40, so a loop is caught early) and 3 on Opus.

---

## 6. How the app and the agents interact (the engineer must know this)

### 6.1 Intake, per item
`get_batch` returns items. Confident items: `save_tags`. Unsure items (confidence under 0.80, or label and garment contradict): `hold_for_review`. The app shows a card in **Check labels** with three buttons:
- **Yes** (or swipe right): app resolves the custom-tool call with the proposed tags; the agent then saves them.
- **Change this**: the person picks one of four piles; app resolves with edited tags.
- **No** (or swipe left): either **Send to someone** or **Delete from pile**. *Send to someone* resolves nothing: the item stays in the queue marked "With <name>", the call stays pending, no tokens are spent. *Delete from pile* resolves the call with a "rejected" result and the agent records it as held.

Nothing is ever auto-denied or timed out by our app. **Set the custom-tool timeout well above the default 600,000 ms** (default is 10 minutes [Docs]); **MEASURE** at the smoke test what happens when a custom tool call times out (run error vs continues) and what the maximum timeout is.

### 6.2 Disposition, per pickup
`book_pickup` is `always_ask`. The app shows an **Approve pickups** card with three buttons:
- **Yes, book it** -> `resolve_approval(allow-once)`; the booking is confirmed; the agent publishes the pickup request file and sends the alert.
- **Do not book** -> `resolve_approval(deny)`. Not final: items return on the next run.
- **Reschedule** -> the app records the new date and resolves with **deny** (so the agent is not left waiting). On the next Disposition run the app appends "use these deadlines" to the message so the pickup is proposed again with the new date.
- **Send to someone** -> nothing is resolved; the pickup stays in the queue.

**Known mismatch to resolve: ZooWork denies pending approvals after 10 minutes [Docs].** Our product rule is "never auto-deny, keep everything in queues". At the smoke test, **MEASURE** whether the 10-minute limit really applies to our setup. If it does, the engineer should choose one (cost shown per demo, [Estimate]):

> **UI note.** The pickup screen is now called Pickups to review, with Book pickup / Reschedule / Don't book and no expiry text. The UI's intended answer to an unanswered approval is a "Pickup rescheduled" message, not a silent denial. See [ui-current.md](ui-current.md). This mismatch is still open on the backend.
1. **Keep decisions fast in the demo** (decide within 10 minutes). Free. Recommended for the live demo.
2. **Treat a timed-out approval as "expired, still in the queue"** in the app: the card stays; when a person answers Yes, the app starts one short targeted Disposition run that re-proposes only that pickup. Costs one extra small run (about $0.02-0.15 each) per expired pickup. Requires an app change (I can do it).
3. Ask ZooWork whether the timeout is configurable (support@zoowork.ai).

`hold_for_review` is a custom tool, not a permission approval, so the 10-minute approval rule applies to `book_pickup` only [Docs: permission policies do not apply to custom tools]; its own limit is the custom-tool timeout in 6.1.

### 6.3 Messages and "send to someone"
Messages and replies are entirely **our app**: no agent is involved and no ZooWork spend. Incoming messages in the demo are simulated about 6 seconds after "Send to someone" (`DEMO_REPLY_MS`; off when `ZOO_MODE=real`). The agents never talk to the reviewers.

### 6.4 Events: webhooks or polling
The app's bridge normalizes events and is idempotent (events table with cursor, handled-calls table). Webhooks are **[Unverified] on a Platform key**; the safe path is polling `stream_events` with the opaque `cursor` (never `seq`) while a run is active. Poll only during runs; never leave a stream open unattended. If a webhook is created, verify the signature on the raw body, dedupe by event id, and re-read the resource.

### 6.5 Run start messages (copy exactly)
- Intake: `Process batch <BATCH_ID> with a confidence threshold of 0.80. Tag every item and hold anything you are not sure about. Finish with the summary.`
- Disposition: `Run the daily disposition review. Today is <DEMO_TODAY>. Pickup lead time is 7 days. Review all inventory, route due items, book pickups, send alerts, and finish with the summary.` Fixed date `2026-11-07` for the demo.

---

## 7. Smoke test: first 30 minutes of the clock (about $2)
Goal: prove every assumption on the cheapest possible runs, and **measure** the numbers that drive cost.
1. Owner creates the API key (org owner only) and funds $30. Confirm `GET /balance`. Billing setup can fail (`platform.billing_not_ready`, `key_credentials_not_bound`): the owner must sign in to Platform. Resolve this first.
2. `list_models()`: confirm the cheap model is `selectable`; note which models take image input.
3. Create Intake on the cheap model with the default tool surface; send a 5-item batch; read `/usage` and compute credits per step. Then switch the same agent to the allow-list `tool_policy` (`update_agent` replaces `tool_policy` whole) and repeat. **Record: first-step input tokens, cache hit, credits per run.**
4. Verify the custom-tool round trip: `get_batch` -> `save_tags`; `hold_for_review` blocks, then a person decision resumes the run.
5. Verify the MCP tools appear as `mcp__recyclerdirectory__*` and that `book_pickup` pauses for approval and resumes on approve. **Time the 10-minute denial** (section 6.2).
6. Verify `artifact_publish` produces a downloadable file.
7. Verify `user.interrupt` stops a run (closing the stream does not).
8. Verify the app's `RealZoo` method names and event shapes against the live API; fix `lib/zoo.ts` and `normalizeEvent` if they differ.
9. Delete the test run's leftovers; keep the two real agents stopped until needed.
10. **Update section 4 with the measured numbers** and re-check the section 5 plan.

Pass criteria: round trips work, approval pauses and resumes, usage reads, measured pair cost within 3x of section 4. If not, stop and re-plan before spending more.

---

## 8. Timeline: 4-5 hours [Estimate]
| Time | Work | Spend checkpoint |
|---|---|---|
| 0:00-0:30 | Key, funding, smoke test (section 7) | Expect about $2 |
| 0:30-1:00 | Provision both agents (serialized), skills, MCP, tools; upload nothing large | |
| 1:00-2:15 | Intake: small batches, then full seed set; score with `score_intake.py`; tune persona/skills | About $8 cumulative |
| 2:15-3:15 | Disposition: manual runs, MCP search, `book_pickup` approval, alerts, artifact; score with `score_disposition.py`; idempotency re-run; then schedule (disabled) | About $15 cumulative |
| 3:15-3:45 | **Model decision** from measured accuracy and cost; wire live viewer and cost panel | |
| 3:45-4:30 | Two rehearsals on the demo model; record fallback video | About $20-23 (Plan A) |
| 4:30-5:00 | Buffer; stop agents; disable/delete schedules; final `/usage` check | |
Cut first if short: batched-save lever, memory, webhooks, model upgrade, image path (use text path), the daily schedule going live.

---

## 9. Kill switches and teardown (ZooWork has no spending cap [Docs])
- App cost guard: before each run read `GET /balance`; refuse below the floor; watch `GET /usage?range=24h&group_by=session`; on breach send `user.interrupt`. (Built into the app; transcript cost fields read 0, so only `/usage` is reliable. Usage lags: keep the reserve.)
- Never leave a stream or loop unattended; the SDK never retries, so any retry loop is ours and must be capped.
- **Schedules fire as soon as enabled and keep firing.** Ship disabled. A stopped agent skips firings. If enabled for the live demo, disable it right after.
- Deny `cron` in both tool policies so agents cannot create their own schedules (already set).
- Teardown, in this order: delete schedules, stop agents, delete agents (deleting does not stop an agent or remove schedules; schedule routes 404 afterward).
- Final check: `/usage` and `GET /balance`; record the spend in this file.

## 10. Risks and open items
1. Cache behavior and real token counts unknown until the smoke test; the plan assumes the worst case.
2. 10-minute approval auto-deny vs "never auto-deny" (section 6.2): needs a decision.
3. Custom-tool timeout and behavior on timeout for long human holds (section 6.1).
4. `RealZoo` SDK names and `normalizeEvent` shape unverified; `next build` not yet run.
5. Webhooks may not work on a Platform key: use polling.
6. Developer Preview: API can change; pin SDK versions (Python 0.9.0, TypeScript 0.14.0 when read).
7. Sandbox network is unrestricted and cannot be changed with Platform keys: keep real credentials and confidential retailer material out; the data is synthetic and the recycler list fictional.
8. Funding delivery and amount still unknown; section 5 works with a first tranche of $30.
9. The agent's own `artifact_publish` link is not yet wired into the app's pickup request page (the app builds its own copy).
10. Dataset licence unresolved if a public dataset is ingested; the seed data is synthetic.
11. Pricing conflict: one blog says API pricing is "contact sales"; the pricing page shows pay-as-you-go. Confirm in Platform > Billing.

## 11. Decisions needed from the team (answers go here)
- Plan A (cheap model for the demo) or Plan B (frontier model), or decide at 3:15 from the scorer?
- Approval timeout: option 1, 2 or 3 from section 6.2?
- Build the batched `save_tags_batch` tool (about 40% cheaper intake)?
- Photo path or text path for the demo?
- First funding tranche: $30 OK?
