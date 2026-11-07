"""Reference implementation of the sustainability-flow rules.

This is the executable version of the rules in roles/05-material-tagger.md,
08-disposition-watcher.md and 09-reverse-logistics.md plus the demo defaults in
research/14. It is used to (1) generate expected results for the synthetic
dataset and (2) score what the ZooWork agents return.

Demo defaults marked [DEFAULT] are proposals, not retailer or regulator rules.
Stdlib only.
"""
from __future__ import annotations

import re
from datetime import date, timedelta

# ---- constants -------------------------------------------------------------
# [DEFAULT] values are team choices to confirm; see research/14 section 5.
THRESHOLD = 0.80                 # [DEFAULT] confidence below this is held for a person
DAYS_SINCE_RECEIVED = 60         # [DEFAULT]
PICKUP_LEAD_DAYS = 7             # [DEFAULT] pickup deadline = today + 7 days
NATURAL_SHARE_FOR_SHRED = 0.70   # [DEFAULT] natural/cellulosic share >= 70% -> shred
SINGLE_FIBRE_NAME_PCT = 85       # [DEFAULT] top fibre >= 85% -> fibre_type is that fibre, else "blend"

# Generic fibre names accepted on US labels, with aliases. Natural/cellulosic
# fibres can be shredded; synthetics push an item to "mixed".
ALIASES = {
    "cotton": "cotton", "linen": "linen", "flax": "linen", "hemp": "hemp",
    "wool": "wool", "silk": "silk", "cashmere": "wool",
    "rayon": "rayon", "viscose": "rayon", "lyocell": "lyocell", "modal": "modal",
    "polyester": "polyester", "nylon": "nylon", "polyamide": "nylon",
    "acrylic": "acrylic", "spandex": "spandex", "elastane": "spandex",
}
NATURAL = {"cotton", "linen", "hemp", "wool", "silk", "rayon", "lyocell", "modal"}

SEASON_END = {  # [DEFAULT] set by a person (Human Reviewer)
    "Summer 2026": date(2026, 8, 31),
    "Fall 2026": date(2026, 10, 31),
    "Spring 2027": date(2027, 5, 31),
}

COLOR_GROUPS = {
    "whites": {"white", "ivory", "cream", "off-white"},
    "darks": {"black", "navy", "charcoal", "dark grey", "brown", "burgundy",
              "forest green", "dark blue", "indigo", "dark wash"},
    "brights": {"red", "orange", "yellow", "pink", "royal blue", "green",
                "purple", "teal", "hot pink"},
}  # anything else (multi, print, stripe, pastel, light blue, tan, grey, light wash) -> mixed

DONATION_EXCLUDED_CATEGORIES = {"swimwear", "intimates", "socks"}  # [DEFAULT]

RECYCLERS = None  # loaded by callers with load_recyclers()


# ---- label parsing ---------------------------------------------------------
def parse_label_text(text: str):
    """Return dict(fibre=[{fibre,pct}], origin, rn, sum_ok, legible).

    fibre is None when no fibre line can be read. Only generic fibre names are
    accepted; anything else is ignored (never guessed).
    """
    fibres = []
    for pct, name in re.findall(r"(\d{1,3})\s*%\s*([A-Za-z]+)", text or ""):
        key = ALIASES.get(name.lower())
        if key:
            fibres.append({"fibre": key, "pct": int(pct)})
    origin = None
    m = re.search(r"MADE IN ([A-Z.]+(?: (?!RN\b)[A-Z.]+)?)", text or "", re.I)
    if m:
        origin = m.group(1).strip().title()
    elif re.search(r"\bIMPORTED\b", text or "", re.I):
        origin = "Imported"
    m = re.search(r"\bRN\s*#?\s*(\d{4,6})", text or "", re.I)
    rn = m.group(1) if m else None
    total = sum(f["pct"] for f in fibres)
    return {
        "fibre": fibres or None,
        "origin": origin,
        "rn": rn,
        "sum_ok": bool(fibres) and total == 100,
        "legible": bool(fibres),
    }


# ---- tagging ---------------------------------------------------------------
def color_group(color: str) -> str:
    c = (color or "").strip().lower()
    for group, names in COLOR_GROUPS.items():
        if c in names:
            return group
    return "mixed"


def natural_share(fibres) -> float:
    if not fibres:
        return 0.0
    total = sum(f["pct"] for f in fibres) or 1
    return sum(f["pct"] for f in fibres if f["fibre"] in NATURAL) / total


def fibre_type(fibres) -> str:
    if not fibres:
        return "unknown"
    top = max(fibres, key=lambda f: f["pct"])
    return top["fibre"] if top["pct"] >= SINGLE_FIBRE_NAME_PCT else "blend"


def is_denim(garment_type: str) -> bool:
    g = (garment_type or "").lower()
    return "denim" in g or "jeans" in g


def stream_for(garment_type, fibres, condition) -> str:
    """Order matters: unusable -> trash, then denim, then fibre rules."""
    if condition == "unusable":
        return "trash"
    if is_denim(garment_type):
        return "denim"
    if not fibres:
        return "mixed"  # fibre unknown but not unusable
    return "shred" if natural_share(fibres) >= NATURAL_SHARE_FOR_SHRED else "mixed"


def tag_item(garment_type, fibres, color, condition):
    return {
        "stream": stream_for(garment_type, fibres, condition),
        "fibre_type": fibre_type(fibres),
        "color_group": color_group(color),
        "condition": condition,
    }


def should_hold(label: dict, conflict: bool) -> bool:
    """Hold for a person when evidence is weak (confidence would be < THRESHOLD)."""
    return (not label["legible"]) or (not label["sum_ok"]) or conflict


# ---- dates -----------------------------------------------------------------
def d(s):
    return None if s in (None, "") else date.fromisoformat(s)


def due_reasons(row: dict, today: date):
    """Return the list of date rules that make this item due (may be empty)."""
    reasons = []
    se = SEASON_END.get(row.get("season"))
    if se and se < today:
        reasons.append("season_end")
    rw = d(row.get("return_window_close"))
    if rw and rw <= today:
        reasons.append("return_window")
    idue = d(row.get("item_due_date"))
    if idue and idue <= today:
        reasons.append("item_date")
    rec = d(row.get("received_date"))
    if rec and (today - rec).days >= DAYS_SINCE_RECEIVED:
        reasons.append("received_60d")
    return reasons


# ---- routing ---------------------------------------------------------------
def route_for(row: dict) -> str:
    tags = row["tags"]
    if tags["stream"] == "trash" or tags["condition"] == "unusable":
        return "dispose"
    if tags["condition"] == "wearable" and row.get("category") not in DONATION_EXCLUDED_CATEGORIES:
        return "donate"
    # damaged, or wearable in a category donation partners do not accept
    return {"shred": "recycle_shred", "denim": "recycle_denim", "mixed": "recycle_mixed"}[tags["stream"]]


def plan(inventory, recyclers, today: date):
    """Full disposition plan for a list of inventory rows."""
    skipped, due = [], []
    for row in inventory:
        if row["status"] == "held":
            skipped.append({"item_key": row["item_key"], "reason": "held"}); continue
        reasons = due_reasons(row, today)
        if not reasons:
            skipped.append({"item_key": row["item_key"], "reason": "not_due"}); continue
        if row.get("alert_status") == "sent":
            skipped.append({"item_key": row["item_key"], "reason": "already_flagged"}); continue
        due.append((row, reasons))

    routes = []
    for row, reasons in due:
        routes.append({"item_key": row["item_key"], "route": route_for(row),
                       "color_group": row["tags"]["color_group"], "reasons": sorted(reasons)})

    deadline = (today + timedelta(days=PICKUP_LEAD_DAYS)).isoformat()
    by_route = {}
    for r in routes:
        by_route.setdefault(r["route"], []).append(r["item_key"])
    rows = {row["item_key"]: row for row, _ in due}

    pickups, escalations = [], []
    for route in sorted(by_route):
        items = sorted(by_route[route])
        if route == "dispose":
            escalations.append({"items": items, "reason": "dispose_confirm"})
            continue
        partner = next((r for r in recyclers if route in r["accepts"]), None)
        if partner is None:
            escalations.append({"items": items, "reason": "no_partner"}); continue
        if len(items) < partner["min_items"]:
            escalations.append({"items": items, "reason": "below_minimum"}); continue
        lots = {}
        if route == "recycle_shred":
            for k in items:
                lots.setdefault(rows[k]["tags"]["color_group"], []).append(k)
        pickups.append({
            "route": route, "partner_id": partner["id"], "items": items,
            "lots": {g: sorted(v) for g, v in sorted(lots.items())},
            "locations": sorted({rows[k]["location"] for k in items}),
            "deadline": deadline,
        })

    alerts = [{"type": "donate_recycle_due", "items": p["items"], "partner_id": p["partner_id"],
               "deadline": p["deadline"]} for p in pickups]
    alerts += [{"type": "review_waiting", "items": e["items"], "reason": e["reason"]} for e in escalations]
    return {"today": today.isoformat(), "due": [{"item_key": r["item_key"], "reasons": r["reasons"]} for r in routes],
            "routes": routes, "pickups": pickups, "escalations": escalations,
            "alert_events": alerts, "skipped": skipped}
