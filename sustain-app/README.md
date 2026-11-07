# Textile Sustainability Flow: app

Next.js (App Router, TypeScript) interface + backend for two ZooWork agents (Intake, Disposition). ZooWork runs the agents; this app runs the tools, the review/approval UI, the alerts inbox and the cost guard.

## Run it (Codespaces)
```bash
npm install
cp .env.example .env.local        # ZOO_MODE=fake by default: scripted agents, free, full UI
npm run dev                       # http://localhost:3000
npm test                          # 15 tests, plain Node, no network
npm run preview                   # regenerate preview/index.html (standalone replay)
```
`preview/index.html` opens by double-click. It replays a recorded run and is also the fallback demo if a live run stalls.

## Deploy to Vercel
1. Create a Turso (libSQL) database; set `DATABASE_URL` and `DATABASE_AUTH_TOKEN` in Vercel. Serverless disks are not persistent, so the default `file:local.db` only works locally.
2. Set `ZOO_MODE=real` plus the ZooWork variables in `.env.example`.
3. `fake` mode needs a long-lived server (it runs the scripted agent in the background), so use it locally, not on Vercel.
4. Public MCP URL for the Disposition Agent: `https://<your-app>.vercel.app/mcp` (POST JSON-RPC, never redirects; check with `curl -i`).

## What is tested (all offline, `npm test`)
Rules match the Python reference on all 32 seed items and the full disposition plan; Intake run with holds (agent call stays unresolved until a person decides); Disposition run with approvals, denial, repeat run (no duplicate alerts); double-alert guard; redelivered events and failed resolves (tool never runs twice); MCP protocol and minimums; cost guard; webhook signature; server orchestration (`startRun`, `snapshot`).

## NOT verified yet (do these at the smoke test)
- `next build` and the pages have not been compiled or opened in a browser (no npm access where this was written). Expect small type fixes.
- `lib/zoo.ts` `realZoo()` guesses SDK method names from the docs. Check against `node_modules/@zoowork-ai/sdk` types and fix there only.
- `lib/bridge.ts` `normalizeEvent()` guesses event field names (`call_id`, `name`, `input`, `approval_id`). Log one real event and adjust.
- Webhook payload shape in `app/api/zoowork/webhook/route.ts` (`session_id`); webhooks may not work with a Platform key, so the UI also pumps `/api/pump` every 3 s.
- Not built yet: batch upload UI, image upload to the agent workspace, app login (the app is open: keep the URL private), Edit/Reject are in the app but not in the replay preview.

## Map
`lib/rules.ts` rules (port of the Python reference) | `lib/tools.ts` the five custom tools | `lib/bridge.ts` events, reviews, approvals | `lib/mcp.ts` recycler-directory | `lib/zoo.ts` ZooWork boundary + fake | `lib/sim.ts` scripted agents | `lib/app.ts` server wiring, run start, snapshot | `app/` pages and routes | `data/` seed fixtures | `tests/` | `scripts/make-preview.ts`.
