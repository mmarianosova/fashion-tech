# Current UI (source of truth)

This is the UI as built and live on the Vercel link (design B). If another doc in this repo describes the screens differently (older names such as "Check labels" or "Approve pickups", swipe cards for pickups, a 10-minute expiry, "Start reading labels" on Home), this file wins.

Two places implement it:
- **Demo page** `sustain-app/preview/index.html` (built from `sustain-app/scripts/preview.template.html` + `sustain-app/app/globals.css`). Sample data, plus a live mode for agents: see [agent-bridge.md](agent-bridge.md).
- **Next app** `sustain-app/app/*` (same screens, backed by the real API).

## Screens

A floating tab bar on every screen: **Home, Labels, Pickups, Messages, History**.

| Screen | What it shows | Actions |
| --- | --- | --- |
| **Home** | "N items to review", tiles *Labels to review* and *Pickups to review*, **Start reviewing**, then **Browse** (All labels, All pickups, Messages, Pile guide, History). No agent or cost wording; the agents run in the background. | Start reviewing opens the first waiting item |
| **Items to review** (`/check`, Labels tab) | One label card at a time: the label text, the suggested pile with its icon and a one-line description, why it was held. | Swipe right or **Yes**: accept. Swipe left or **No**: *Delete from pile* or *Send to someone*. **Change this**: pick another pile |
| **Pickups to review** (`/pickups`, Pickups tab) | One card per proposed pickup (no swiping): material icon and description, hand-over date, recycler and address, item ids, **Up next** strip. | **Book pickup**, **Reschedule** (+3 / +7 / +14 days), **Don't book** (outlined), **More options** (adds *Send to someone*), **Edit items** |
| **Messages** (`/messages`) | Incoming messages only, each tagged (PICKUP, REVIEW, REPLY). Tap to read. Outgoing "sent to someone" notes are not shown. | Open a message, jump to the item |
| **History** (`/history`) | What the person already decided: *Label decisions*, *Pickups*, *Alerts seen*, with filter chips. | **Change** reopens that exact item in its review screen with its actions (see below) |
| **Pile guide** (`/guide`) | Each category with an icon, a one-line description and examples: Shred, Denim, Mixed, Throw away, Donation. | Read only |

## Old names, new names

| Old | Current |
| --- | --- |
| Check labels | Items to review / Labels |
| Approve pickups | Pickups to review / Pickups |
| "N things need you" | "N items to review" |
| "Needs a look" / "Needs a yes" chip | "To review" |
| "Do not book" | "Don't book" |
| "The agent thinks" | "Suggested category" |
| Swipe card for pickups | Single card with buttons |
| "Start reading labels" / "Run now" on Home | Removed. Runs start in the background; run controls are on `/team` |

## Rules the UI follows

- **No timers in the UI.** The old "Expires in 10 min" line is gone. If a pickup is not confirmed, the intended behavior is a **Pickup rescheduled** message ("No action was taken on X, so it was rescheduled to <date>. Verify or change") with a *Verify or change* link to the pickup. This is a UI decision. The backend does not do it yet; docs/13 notes ZooWork denies unanswered approvals after 10 minutes, and that mismatch is still open.
- **Edit items** (pickup card): tap an item to leave it out; **Add more items** lists other items of the same kind that are not in a pickup yet. The final list is sent with the decision.
- **History > Change** reopens the item in the real review screen ("Review again", shows the earlier choice). The new choice updates the History row and is emitted as an event with `reopened: true`. *Send to someone* is hidden in this view.
- **Material visuals.** Each item and pickup shows an icon for its material. If an item has an image URL (`image`), the photo is used instead. The dataset's `image_path` is null for all 32 sample items, so today every item uses the icon.
- Plain language for people with little tech experience. No roles, no login in the demo build.

## What is real and what is demo-only

| Feature | Demo page | Next app (real API) |
| --- | --- | --- |
| All screens above, tab bar, History, Pile guide | Yes | Yes (not build-tested: no npm where this was written) |
| Material icons and descriptions | Yes | Yes (Labels, Pickups, Guide) |
| Edit items, add more items | Yes (sent in the output event) | No: the API books the whole pickup |
| History > Change reopening a decided item | Yes | No: the API treats decisions as final |
| "Pickup rescheduled" notice | Yes (sample) | No |
| Fake replies after *Send to someone* | Yes (demo mode only) | No (real replies) |
| Sample data | Demo mode only, clearable | None |

All sample data (items, recyclers, people, History entries, alerts, replies) is fake. Do not treat it as real.

## Connecting agents

Open the demo with `?mode=live` or tap **Clear demo data**, then see [agent-bridge.md](agent-bridge.md) for the input shapes agents send and the output events the UI records.
