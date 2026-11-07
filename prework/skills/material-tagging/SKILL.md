---
name: material-tagging
description: Assign a recycling stream, fibre type, colour group and condition to a garment from its label reading, and score confidence. Use after label-reading, before saving tags or holding an item.
---

# Material tagging

## Tags to produce
- `stream`: `shred`, `denim`, `mixed`, or `trash`
- `fibre_type`: the single fibre name, `blend`, or `unknown`
- `color_group`: `whites`, `darks`, `brights`, or `mixed`
- `condition`: `wearable`, `damaged`, or `unusable` (use the `condition` field given on the item)

## Stream rules, apply in this order
1. `condition` is `unusable` (contaminated, mildew, oil, soiled beyond cleaning): stream `trash`.
2. Garment is jeans or denim: stream `denim`, whatever the colour or blend.
3. No readable fibre: stream `mixed`, fibre_type `unknown`. Do not guess.
4. Natural or cellulosic fibres (cotton, linen, hemp, wool, silk, rayon/viscose, lyocell, modal) add up to 70% or more: stream `shred`.
5. Otherwise: stream `mixed`.

Never put a mixed item into shred.

## fibre_type
- One fibre at 85% or more: that fibre's name (for example `cotton`).
- Otherwise `blend`.
- No readable fibre: `unknown`.

## color_group
- whites: white, ivory, cream, off-white
- darks: black, navy, charcoal, dark grey, brown, burgundy, forest green, dark blue, indigo, dark wash
- brights: red, orange, yellow, pink, royal blue, green, purple, teal, hot pink
- mixed: anything else (multi, printed, striped, pastel, light blue, tan, grey, light wash)

## Confidence
Start from the evidence, not from a feeling:
- 0.95: clear label, percentages add to 100, no conflict
- 0.85: clear label with a minor ambiguity (for example an unfamiliar but mappable fibre name)
- 0.60: no readable fibre line or sum is not 100
- 0.40: label and garment conflict

Confidence below the threshold (default 0.80) means hold for review. A held item's proposed tags are still worth supplying so the person can approve or edit quickly.

## Reason
One short sentence that names the deciding fact, for example "60% cotton, 40% polyester, so mixed" or "denim garment, stream denim regardless of colour".

## Examples
| Item | Result |
|---|---|
| white t-shirt, 100% cotton, damaged | shred, cotton, whites, damaged, 0.95 |
| black leggings, 90% polyester 10% spandex | mixed, polyester, darks, 0.95 |
| indigo jeans, 98% cotton 2% elastane | denim, cotton, darks, 0.95 |
| 70% cotton 30% polyester | shred, blend, by colour |
| 69% cotton 31% polyester | mixed, blend, by colour |
| sweater, label smudged | mixed, unknown, 0.60, hold |
| t-shirt, mildew | trash, by label, unusable |
