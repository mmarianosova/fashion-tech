# Textile Sustainability Flow: app

Next.js (App Router, TypeScript) interface + backend for two ZooWork agents (Intake, Disposition). ZooWork runs the agents; this app runs the tools, the two human checkpoints (Check labels, Approve pickups), the Messages inbox and the cost guard. It is mobile first: Home has three big buttons, and every screen has one job.

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
- Not built yet: batch upload UI, image upload to the agent workspace, app login (the app is open: keep the URL private), the replay preview is a recording: whatever you choose on a card, the story continues the same way. The pickup request page is built by the app from the booking; the real agent's own `artifact_publish` file is a separate copy (link not wired in yet). Nothing times out: held items and pickups wait until a person decides.

## Map
`lib/rules.ts` rules (port of the Python reference) | `lib/tools.ts` the five custom tools | `lib/bridge.ts` events, reviews, approvals | `lib/mcp.ts` recycler-directory | `lib/zoo.ts` ZooWork boundary + fake | `lib/sim.ts` scripted agents | `lib/app.ts` server wiring, run start, snapshot | `app/` pages and routes | `data/` seed fixtures | `tests/` | `scripts/make-preview.ts`.

## Intake from MAG STOCK

Intake uses text and catalog records. The workbook contains style variants and
order/catalog rows, so import only the physical items being assessed. Run the
exporter from the repository root with Python and `openpyxl` installed. Keep the
workbook and derived JSON outside Git.

```sh
styles=(STYLE_A STYLE_B)
python prework/tools/export_mag_stock.py /path/to/MAG-STOCK.xlsx --styles "${styles[@]}" > /tmp/mag-stock-demo.json
cd sustain-app
node scripts/import-intake.ts /tmp/mag-stock-demo.json MAG-DEMO "${styles[@]}"
npm run dev
```

Start intake for the imported batch on the Intake screen. The separate eight-style
demo sample covers single-fibre and blended fabrics, missing or incomplete composition,
a composition conflict, and a product link with a mismatched UPC. It keeps every
source row for each selected style. Pass `--source-url` to retain the workbook link. The workbook has no physical condition, so
these records start without one. Add an optional suffix such as `STYLE_A:damaged`
only when the physical condition has been observed.
Import writes the batch atomically to `DATABASE_URL` (default `file:local.db`).
Repeated batch IDs are rejected. The same style may appear in separate batches.

Intake retains the workbook sheet and row, source composition and color, UPCs,
product links, and lookup outcome in `intake_assessments`. The Check labels screen
shows the relevant workbook rows. Uncertain items stay outside disposition
until a reviewer approves or edits them. Missing physical condition requires
an edit or rejection.

The workbook points to Macy's. A sampled product page returned HTTP 403.
The app's `ProductLookup` adapter (`lib/intake.ts`, injected via
`Deps.lookupProduct`) defaults to unconfigured. An authorized provider must
return evidence from a verified variant; the URL's UPC query parameter is
only a hint. Catalog pages cannot provide the condition of the physical item.
The local test run uses scripted ZooWork events. Live mode requires deployed
agents and credentials and must be verified against that environment.
