# Prompt pack for your Codespaces builds (paste into Claude Code / Claude Pro)

Setup for every session: put the whole `prework/` folder in the repo (or open it beside the repo) so the assistant can read `build/BUILD_BRIEF.md`, `build/schema.sql`, `agents/custom_tools.json`, `data/`, `tools/`. Tell it: "Read build/BUILD_BRIEF.md first. Do not guess ZooWork API shapes; read the SDK types in node_modules/@zoowork-ai/sdk and the docs."

Suggested split for 3-4 people. WP1 first (30 min), then WP2, WP3, WP4 in parallel, WP5 last.

---
## WP1: Foundation (one person, first)
> Create a Next.js (App Router, TypeScript, Tailwind) app. Read build/BUILD_BRIEF.md. Add: `lib/db.ts` using libSQL (@libsql/client) with schema from build/schema.sql applied by `scripts/migrate.ts`; `scripts/seed.ts` that loads data/intake_items.json as batch SEED-1 and data/inventory.json as inventory rows; `lib/zoowork.ts` (server-only) creating the SDK client from env (see build/.env.example); `lib/guard.ts` implementing the cost guard in section 5 (balance floor, run cost limit, interrupt); `lib/events.ts` storing events with dedupe on (session_id, cursor) and an SSE route `/api/events/stream?session=` that reads from the DB. Add zod types for every tool contract in section 3. Write unit tests with vitest for db, guard and event dedupe. Do not call ZooWork for real; use an injectable fake client.

## WP2: Agent bridge (one person)
> Read build/BUILD_BRIEF.md sections 2, 3, 6. Implement: (a) `app/api/zoowork/webhook/route.ts` verifying Standard Webhooks signatures on the raw body, deduping by event id, then handling `custom_tool.requested` and `approval.requested` by reading the resource; (b) `app/api/runs/[sessionId]/pump/route.ts` poller fallback using `list_all_events` and the opaque cursor; (c) `lib/tools/*.ts` one handler per custom tool in agents/custom_tools.json (get_batch, save_tags, hold_for_review, list_inventory, send_alert) with zod validation, idempotency via `handled_calls`, and `send_alert` rejecting items already alerted; (d) `hold_for_review` stores a review and does NOT resolve; `POST /api/reviews/[id]` resolves the call later; (e) `POST /api/approvals/[id]` calls resolve_approval; (f) `scripts/provision.ts` and `scripts/teardown.ts` per section 6, serialized, with idempotency keys; (g) `POST /api/runs/intake` and `/api/runs/disposition` starting sessions through the cost guard, sending the messages from tests/agent_test_prompts.md with DEMO_TODAY. Test everything against a fake transport that replays a recorded event sequence (tool calls, a hold, an approval). Never log the API key or artifact URLs.

## WP3: Interface (one or two people)
> Read build/BUILD_BRIEF.md section 4. Build four pages: `/` Intake with batch picker, threshold slider, Start, live per-item feed, counters; `/review` held-item queue with Approve, Edit (4 dropdowns), Reject; `/disposition` Run button, due/skipped table with reasons, pending pickup approvals with Approve/Deny, resulting routes and colour lots, pickup file link; `/alerts` inbox with unread badge plus a cost panel (balance, 24h usage, session cost, Stop button). Consume SSE from `/api/events/stream`. Use mock data from data/ and the fake event feed until WP2 lands. Readable at projector size, status shown by text label as well as colour, empty and error states for every list. Add a Playwright smoke test that walks Intake -> Review -> Disposition -> Alerts on the fake feed.

## WP4: Recycler-directory MCP server (one person, short)
> Read agents/resources/recycler_mcp_spec.md and data/recyclers.json. Add `app/mcp/route.ts` implementing an MCP server over streamable HTTP (use @modelcontextprotocol/sdk or `mcp-handler`) with tools `search_recyclers` and `book_pickup` exactly as specced. No auth. It must not redirect: confirm with `curl -i https://<deployed>/mcp` that you get 200/405/etc and never a 3xx, including trailing slash and www variants. `book_pickup` returns an error below `min_items`. Write a test client that lists tools and calls both. Deploy to Vercel early.

## WP5: Rehearsal and demo (everyone, last)
> Write `scripts/export-results.ts` exporting DB state into the formats read by tools/score_intake.py and tools/score_disposition.py. Write `DEMO.md`: a 6-minute script (Intake run, a held item resolved live, Disposition run, pickup approval, alerts inbox, cost panel, repeat run showing no duplicate alerts), plus a fallback plan if a live run stalls (recorded run replay at `/replay`). Add a `/replay` mode that plays a stored event log through the UI.

---
## Review prompt (run before the clock)
> Review the repo against build/BUILD_BRIEF.md. List every place where a secret could reach the browser, every handler that is not idempotent, every ZooWork call without the cost guard, and every place a stream is held longer than a Vercel function allows. Fix what you find.
