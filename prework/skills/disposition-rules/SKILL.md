---
name: disposition-rules
description: Decide which tagged inventory items are due for donation, recycling or disposal today, and why. Use at the start of every Disposition run, after list_inventory.
---

# Disposition rules: which items are due

Use only the date given in the run message as "today". Never use another date.

## Skip first
Skip an item, and say why, when:
- `status` is `held` (a person has not cleared it)
- `alert_status` is `sent` (already flagged; never alert twice)

## Due if any of these is true
1. **Time in stock**: today minus `received_date` is 60 days or more.
2. **Item date**: `item_due_date` is today or earlier.
3. **Return window**: `return_window_close` is today or earlier.
4. **Season end**: the item's `season` ended before today. Season ends: Summer 2026 on 2026-08-31, Fall 2026 on 2026-10-31, Spring 2027 on 2027-05-31.

An item that meets none of these is "not due". Record every reason that applies, not only the first.

## Output of this step
A list of due items, each with its reasons, and a list of skipped items, each with its reason (`held`, `already_flagged`, `not_due`).

## Examples (today = 2026-11-07)
- Received 2026-08-01, nothing else: due, time in stock (98 days).
- Received 2026-10-20, no dates: not due (18 days).
- Return window closed 2026-11-01: due, return window.
- Season Fall 2026: due, season end.
- alert_status sent: skipped, already flagged, even if due.
- status held: skipped, held.

## Note
These thresholds are the programme's defaults. If the run message gives different values, use the message.
