---
name: reverse-logistics
description: Route due textile items to donate, recycle (shred, denim, mixed) or dispose, group them into partner pickups, handle minimums, and write the alert. Use after disposition-rules has listed the due items.
---

# Reverse logistics: routing, pickups and alerts

## Route each due item
Apply in order:
1. `stream` is `trash` or `condition` is `unusable`: **dispose**.
2. `condition` is `wearable` and category is not swimwear, intimates or socks: **donate**.
3. Otherwise (damaged, or wearable in a category donation partners do not accept):
   - stream `shred`: **recycle_shred**
   - stream `denim`: **recycle_denim**
   - stream `mixed`: **recycle_mixed**

## Group into pickups
- Group due items by route.
- Call `search_recyclers` for each route (not for dispose). Use only the partners it returns. If it returns none, escalate the group as `no_partner`.
- **recycle_shred**: make one lot per colour group (whites, darks, brights, mixed). Never put different colour groups in one lot, and never put `recycle_mixed` items into a shred pickup.
- If a route has fewer items than the partner's `min_items`, do not book. Escalate the group as `below_minimum`.
- **dispose**: never book. Escalate as `dispose_confirm` so a person confirms disposal.
- Pickup deadline: today plus 7 days, unless the message says otherwise.

## Book
For each viable group call `book_pickup` with `partner_id`, `route`, `items`, `lots` (shred only), `deadline`. A person approves each booking. If denied, escalate the group with reason `booking_denied`. Then publish a short pickup request file (partner, address, items, lots, deadline) with `artifact_publish`.

## Alerts: one message per decision
- Booked pickup: `send_alert` type `donate_recycle_due`, items, location(s), deadline, next step "Hand over to <partner> at <address> by <deadline>", `recycler_address`.
- Escalation (`no_partner`, `below_minimum`, `dispose_confirm`, `booking_denied`): `send_alert` type `review_waiting`, items, the reason, and the next step for a person (for example "Hold until 3 more denim items arrive, or approve an alternative partner").
- `summary` format: `short summary, deadline` (the system adds the [TYPE] prefix).
- Never send an alert for an item already alerted. Never send two alerts for one decision.

## Escalate rather than guess
Missing partner, partner below minimum, data that looks wrong, repeated tool failure: escalate with a clear reason. Do not invent partners, change tags, or merge groups to reach a minimum.
