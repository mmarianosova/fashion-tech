# Textile Sustainability Flow: app

> **Current UI:** screen names and behavior are in [../docs/ui-current.md](../docs/ui-current.md). Older names in this file (Check labels, Approve pickups) are now Items to review and Pickups to review.

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

## Connecting the UI to agents

The demo page has a **live mode**: tap **Clear demo data** (or open `?mode=live`) to empty it, let an agent send inputs (`TextileFlow.push(...)`, `postMessage`, or polling `GET {api}/inputs`), and record every decision as an output event (`TextileFlow.outputs`, **Export outputs**, `POST {api}/events`). An adapter for the existing Next API (`?api=...&adapter=next`) is included. Full schema: [docs/agent-bridge.md](../docs/agent-bridge.md). No agent is connected yet; sample data is demo only.

## Deploy to Vercel
1. Create a Turso (libSQL) database; set `DATABASE_URL` and `DATABASE_AUTH_TOKEN` in Vercel. Serverless disks are not persistent, so the default `file:local.db` only works locally.
2. Set `ZOO_MODE=real` plus the ZooWork variables in `.env.example`.
3. `fake` mode needs a long-lived server (it runs the scripted agent in the background), so use it locally, not on Vercel.
4. Public MCP URL for the Disposition Agent: `https://<your-app>.vercel.app/mcp` (POST JSON-RPC, never redirects; check with `curl -i`).

## Textile drop-off directory
Run `python3 scripts/import-dropoffs.py /path/to/tri_state_textile_dropoff_sites.csv` from the app folder. The local data is ignored by Git. Open the directory from Approve pickups. It lists drop-off conditions for a person to review. The MCP partner list and automated bookings use a separate dataset.

## Disposition-only demo

1. From the app folder, run `node scripts/prepare-disposition-demo.ts` to create a fresh local database. The script refuses to overwrite an existing file. It seeds seven fictional items and leaves Intake empty.
2. Set `DATABASE_URL=file:local.db.disposition-demo` and `DEMO_TODAY=2026-11-07`. For a live run, set `ZOO_MODE=real`, `ZOOWORK_API_KEY`, and `DISPOSITION_AGENT_ID`. Start the test agent with the current Disposition persona and a reachable public HTTPS MCP endpoint. Keep its schedule off.
3. Run the app on loopback. Expose only `POST /mcp` to ZooWork. Set `ENABLE_ZOOWORK_ARTIFACT_DOWNLOAD=1` on the loopback app to enable **Download ZooWork request**.
4. Choose **Run now**. Expect one donation proposal, one denim recycling proposal, and one mixed-fibre group below the partner minimum. Approve the two proposals in **Approve pickups**. Expect two booked pickups and three entries in **Messages**.
5. Open each **Pickup request**, then use **Download ZooWork request** once the agent has published its file. Run again on the same database and verify the counts stay at two bookings and three alerts. Stop the agent and close the temporary MCP endpoint after the demo.

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
catalog intake checks only the material. Material records do not enter disposition.
Import writes the batch atomically to `DATABASE_URL` (default `file:local.db`).
Repeated batch IDs are rejected. The same style may appear in separate batches.

Intake retains the workbook sheet and row, source composition and color, UPCs,
product links, and lookup outcome in `intake_assessments`. The Check labels screen
shows the relevant workbook rows. Uncertain materials go to Check labels. Separate compositions for outer fabric and lining are retained when the source gives both.

Live product lookup is enabled by default. Set `INTAKE_WEB_LOOKUP=0` for an
offline run. When the catalog cannot verify the required fields, Intake tries
eligible Macy's links first. When a page cannot verify the product details,
it searches the Marcus Adler storefront by exact SKU or UPC and verifies the
identifier again against variant data from the product page. Set
`BRAVE_SEARCH_API_KEY` to enable a web-index fallback after the storefront.
Intake can use explicit product fields tied to a verified SKU or UPC in an
indexed excerpt or open an allowlisted product URL found by the index. The review audit
records attempted sources, verified fields and the product link. A mismatched
UPC in a workbook link is skipped. Catalog pages cannot provide the condition
of the physical item.
The local test run uses scripted ZooWork events. Live mode requires deployed
agents and credentials and must be verified against that environment.

## Team walkthrough

This uses the team's existing Textile Flow preview in live UI mode with
scripted agents and fictional inventory. The app sends no real pickup requests.

```sh
npm install
node scripts/prepare-team-demo.ts
DATABASE_URL=file:local.db.team-demo ZOO_MODE=fake DEMO_TODAY=2026-11-07 TEXTILE_FLOW_BRIDGE=1 TEXTILE_FLOW_ORIGIN=http://127.0.0.1:4319 INTAKE_WEB_LOOKUP=0 npm run dev -- --hostname 127.0.0.1 --port 4319
```

Open http://127.0.0.1:4319/team-preview.html?mode=live&api=http://127.0.0.1:4319&adapter=events.
In another terminal, start Intake with:

```sh
curl -fsS -X POST http://127.0.0.1:4319/api/runs/intake -H 'Content-Type: application/json' -d '{"batch_id":"TEAM-DEMO"}'
```

Open **Labels**. Three complete labels are accepted. For the faded label,
choose **No** then **Delete from pile** so it does not enter Disposition.
After Intake finishes, start Disposition:

```sh
curl -fsS -X POST http://127.0.0.1:4319/api/runs/disposition
```

Open **Pickups** and choose **Book pickup** for the three denim items. Open
**Messages** to see the handover notice for Blue Cycle Denim (fictional).
Use **Export outputs** to inspect the interface events.

The walkthrough includes fictional condition, location and due dates. Catalog-only
material results stay out of Disposition until the physical inventory is recorded.
The existing UI's **Change this** sends a sorting pile, so it cannot send corrected
fibre percentages. Pickup item edits and reopening finished decisions are also
unsupported by the backend. Keep the bridge on loopback or behind access control.
