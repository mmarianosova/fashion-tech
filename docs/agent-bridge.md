# Agent bridge: connecting the UI to the agents

The phone UI (`sustain-app/preview/index.html`, served by Vercel) has two modes.

- **Demo mode (default).** Replays a recorded run with sample data so people can see the flow. Nothing in it is real. "Clear demo data" in the top strip switches to live mode.
- **Live mode.** Starts empty. Shows only what an agent sends in, and records every decision the person makes as an output event.

The screens never read agent data directly. Inputs go through `push()`, outputs come out through `emit()`, so the agents and the UI only have to agree on the shapes below.

## Switching to live mode

| How | Effect |
| --- | --- |
| Tap **Clear demo data** in the top strip | Clears all sample data (items, partners, history, alerts) and starts empty |
| Open the page with `?mode=live` | Starts empty |
| `TextileFlow.clear()` / `TextileFlow.demo()` | Same, from code |
| `postMessage({type:'tf:clear'})` / `{type:'tf:demo'}` | Same, from a parent page |

URL options: `api=<base url>` (connect to a backend), `adapter=events|next`, `poll=<ms>` (default 3000), `embed=1` (hide the top strip), `lock=1` (hide "Back to demo"), `origin=<https://parent.site>` (allow postMessage with that site).

## Inputs: what an agent sends

Any of these can be sent. Everything is upserted by `id` (items by `key`), so send everything again or only what changed.

```json
{
  "today": "2026-11-07",
  "items":     [{ "key": "D-001", "garment": "jeans", "color": "indigo", "label": "98% COTTON 2% ELASTANE", "stream": "denim", "state": "tagged", "image": "https://.../d-001.jpg" }],
  "reviews":   [{ "id": "rv_1", "item": "D-001", "label": "98% COTTON", "proposed": { "stream": "denim" }, "reason": "Label is faded", "state": "pending" }],
  "approvals": [{ "id": "ap_1", "state": "pending", "input": { "route": "recycle_denim", "partner_id": "blue-cycle", "items": ["D-001", "D-003"], "deadline": "2026-11-14" } }],
  "pickups":   [{ "id": "bk_1", "route": "recycle_denim", "partner": "blue-cycle", "deadline": "2026-11-14", "n": 2, "items": ["D-001", "D-003"] }],
  "alerts":    [{ "id": "al_1", "type": "review_waiting", "summary": "D-001 needs a look", "items": ["D-001"], "deadline": "2026-11-14", "next": "Open Items to review", "ref": "review", "read": false }],
  "partners":  { "blue-cycle": { "name": "Blue Cycle Denim", "address": "22 Indigo St" } },
  "people":    ["Vendor manager", "Compliance owner"]
}
```

- `stream` / `proposed.stream`: `shred`, `denim`, `mixed`, `trash`. `route`: `donate`, `recycle_shred`, `recycle_denim`, `recycle_mixed`, `dispose`.
- A review or approval leaves the queue when its `state` is not `pending`.
- `image` must be a URL the browser can load. If it is missing, the UI shows the default icon for the material (see the Pile guide). The dataset's `image_path` values are workspace paths, so they must be served as URLs first.
- `alerts[].type`: `review_waiting`, `donate_recycle_due`, `reply`, `rescheduled`, `dispute_deadline`, `delay_risk`. `ref`: `review` or `approval` links the alert to its item.

Ways to send it: `TextileFlow.push(obj)` in the page, `window.postMessage({type:'tf:input', payload: obj}, ...)` from the parent (needs `?origin=`), or let the page poll `GET {api}/inputs` (adapter `events`) every `poll` ms.

## Outputs: what the UI records

One event per decision, in this order of fields: `id`, `at` (ISO time), `mode`, then:

| `type` | Fields |
| --- | --- |
| `review.decision` | `review_id`, `item`, `decision`: `approve` / `edit` / `reject`, `tags` (`{stream}` for edit and approve), `reopened` (true when changed again from History) |
| `review.send` | `review_id`, `to` |
| `approval.decision` | `approval_id`, `route`, `partner_id`, `decision`: `allow` / `deny` / `reschedule`, `deadline` (for reschedule), `items` (final list), `items_added`, `items_removed` |
| `approval.send` | `approval_id`, `to` |
| `alert.read` | `alert_id` |

Where they go:
- **Recorded** in the page (`TextileFlow.outputs`, saved in the browser's localStorage, last 500) in live mode. **Export outputs** in the top strip downloads them as JSON.
- **Event** `tf:output` on `window` (`TextileFlow.on(fn)`), in demo and live mode.
- **POST `{api}/events`** with the event as JSON (adapter `events`).
- **postMessage** to the parent page, only when `?origin=` is set.

Demo-mode decisions are emitted as events only. They are never stored or sent to `api`.

## Adapters

- `events` (default): `GET {api}/inputs` returns the input object above; the UI POSTs each output event to `{api}/events`.
- `next`: uses the existing Next app backend. Polls `GET {api}/api/state` and POSTs the same bodies the old screens used: `/api/reviews/:id` (`{decision, tags}`), `/api/approvals/:id` (`{allow}` / `{reschedule:{deadline}}` / `{send:{to}}`), `/api/alerts/read`. The backend must allow cross-origin requests from the page.

## What is not wired yet

- No agent is connected. Today the page shows demo data until something calls `push()` or `api` is set.
- The `next` adapter cannot carry item edits (`items_added`, `items_removed`) or re-deciding an item from History: the Next API treats decisions as final and books the whole pickup. Those are recorded in the output event only.
- The "rescheduled" notice and the fake replies after "Send to someone" are demo-only. In live mode the agent sends real alerts and replies.
- Browser-only storage: clear it with `TextileFlow.clearOutputs()`.
