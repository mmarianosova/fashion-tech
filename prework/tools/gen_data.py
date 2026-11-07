"""Generate the small TEXT-ONLY seed fixtures (no images).

Purpose: offline tests of the rules/scorers and a smoke test on ZooWork.
The real, large dataset (images + label text + tags) is supplied by the team;
see tools/ingest_dataset.py and research_prompt_dataset.md.

Writes to data/: intake_items.json (agent-visible), expected_intake.json,
inventory.json, recyclers.json, expected_disposition.json
"""
import json, os, sys
from datetime import date
sys.path.insert(0, os.path.dirname(__file__))
import sustain_ref as R

OUT = os.path.join(os.path.dirname(__file__), "..", "data")
TODAY = date(2026, 11, 7)

# (key, garment, color, category, label_text, visible_note, condition, conflict)
C = []
def add(*a): C.append(a)

W, D_, U = "wearable", "damaged", "unusable"
# 8 clear cotton (shred when damaged, donate when wearable)
add("T-001","t-shirt","white","tops","100% COTTON  MADE IN INDIA  RN 12345","",W,False)
add("T-002","t-shirt","black","tops","100% COTTON  MADE IN INDIA  RN 12345","",D_,False)
add("T-003","t-shirt","navy","tops","100% COTTON  MADE IN BANGLADESH  RN 12345","",D_,False)
add("T-004","sweatshirt","red","tops","100% COTTON  MADE IN PAKISTAN  RN 12345","",D_,False)
add("T-005","t-shirt","cream","tops","100% COTTON  MADE IN INDIA  RN 12345","",D_,False)
add("T-006","button-down shirt","white","tops","100% COTTON  IMPORTED  RN 12345","",D_,False)
add("T-007","t-shirt","royal blue","tops","100% COTTON  MADE IN INDIA  RN 12345","",W,False)
add("T-008","hoodie","charcoal","tops","100% COTTON  MADE IN VIETNAM  RN 12345","",D_,False)
# 6 blends (mixed)
add("B-001","t-shirt","black","tops","60% COTTON 40% POLYESTER  MADE IN INDIA","",D_,False)
add("B-002","leggings","black","bottoms","90% POLYESTER 10% SPANDEX  MADE IN CHINA","",D_,False)
add("B-003","blouse","pink","tops","100% POLYESTER  MADE IN CHINA","",D_,False)
add("B-004","cardigan","grey","tops","55% ACRYLIC 45% WOOL  MADE IN CHINA","",D_,False)
add("B-005","dress","teal","dresses","95% VISCOSE 5% ELASTANE  MADE IN INDIA","",D_,False)
add("B-006","polo","white","tops","50% COTTON 50% POLYESTER  MADE IN INDIA","",D_,False)
# 5 denim (denim stream regardless of colour)
add("D-001","jeans","indigo","bottoms","98% COTTON 2% ELASTANE  MADE IN MEXICO","",D_,False)
add("D-002","denim jacket","light wash","outerwear","100% COTTON  MADE IN TURKEY","",D_,False)
add("D-003","jeans","black","bottoms","99% COTTON 1% SPANDEX  MADE IN MEXICO","",D_,False)
add("D-004","denim shorts","light wash","bottoms","100% COTTON  MADE IN TURKEY","",W,False)
add("D-005","jeans","dark wash","bottoms","80% COTTON 20% POLYESTER  MADE IN CHINA","",D_,False)
# 4 damaged natural / linen / silk
add("N-001","linen shirt","ivory","tops","100% LINEN  MADE IN PORTUGAL","",D_,False)
add("N-002","wool sweater","burgundy","tops","100% WOOL  MADE IN ITALY","",D_,False)
add("N-003","silk blouse","pink","tops","100% SILK  MADE IN CHINA","",D_,False)
add("N-004","hemp tote","tan","accessories","100% HEMP  MADE IN NEPAL","",D_,False)
# 3 missing / unreadable fibre -> hold
add("M-001","t-shirt","white","tops","","care tag cut out; no fibre content visible",D_,False)
add("M-002","sweater","grey","tops","MADE IN ??  RN 1","fibre line smudged and unreadable",D_,False)
add("M-003","scarf","multi","accessories","","no label",W,False)
# 2 label/photo conflict -> hold
add("X-001","t-shirt","black","tops","100% COTTON  MADE IN INDIA","photo shows a shiny stretch knit, looks synthetic",D_,True)
add("X-002","hoodie","navy","tops","100% POLYESTER  MADE IN CHINA","photo shows a heavy brushed cotton fleece",D_,True)
# 2 unusable (trash)
add("U-001","t-shirt","white","tops","100% COTTON  MADE IN INDIA","mildew through the fabric",U,False)
add("U-002","jeans","indigo","bottoms","100% COTTON  MADE IN MEXICO","oil contamination",U,False)
# 2 category exclusions (not donated even if wearable)
add("S-001","swim top","pink","swimwear","80% NYLON 20% SPANDEX  MADE IN CHINA","",W,False)
add("S-002","bra","white","intimates","92% NYLON 8% SPANDEX  MADE IN CHINA","",W,False)

def build():
    items, expected = [], []
    for key, g, col, cat, text, note, cond, conflict in C:
        label = R.parse_label_text(text)
        hold = R.should_hold(label, conflict)
        tags = R.tag_item(g, label["fibre"], col, cond)
        items.append({"item_key": key, "garment_type": g, "color": col, "category": cat,
                      "label_text": text, "visible_note": note, "condition": cond,
                      "image_path": None})
        expected.append({"item_key": key, "tags": tags, "hold": hold,
                         "confidence_band": "low" if hold else "high"})
    return items, expected

# date scenarios cycled over non-held items
SCEN = [
    dict(received_date="2026-08-01"),                                       # 98 d -> received_60d
    dict(received_date="2026-10-20"),                                       # not due
    dict(received_date="2026-10-25", return_window_close="2026-11-01"),     # return_window
    dict(received_date="2026-10-30", item_due_date="2026-11-05"),           # item_date
    dict(received_date="2026-10-28", season="Fall 2026"),                   # season_end
    dict(received_date="2026-08-05", alert_status="sent"),                  # already flagged
    dict(received_date="2026-10-22"),                                       # not due
]
LOCS = ["Store 14", "Store 14", "DC East", "Store 22"]

def inventory(items, expected):
    inv, n = [], 0
    for it, ex in zip(items, expected):
        if ex["hold"]:
            continue
        s = SCEN[n % len(SCEN)]
        row = {"item_key": it["item_key"], "category": it["category"], "tags": ex["tags"],
               "location": LOCS[n % len(LOCS)], "season": "Spring 2027",
               "received_date": None, "return_window_close": None, "item_due_date": None,
               "alert_status": "none", "status": "tagged"}
        row.update(s); inv.append(row); n += 1
    # one item still held by a person
    inv.append({"item_key": "H-001", "category": "tops",
                "tags": {"stream": "mixed", "fibre_type": "unknown", "color_group": "mixed", "condition": "damaged"},
                "location": "Store 14", "season": "Spring 2027", "received_date": "2026-06-01",
                "return_window_close": None, "item_due_date": None, "alert_status": "none", "status": "held"})
    return inv

RECYCLERS = [
    {"id": "R-DON", "name": "Greenway Donation Network (fictional)", "accepts": ["donate"], "min_items": 3,
     "address": "100 Giving Way", "contact": "pickups@greenway.example"},
    {"id": "R-SHR", "name": "Fiber Loop Shredders (fictional)", "accepts": ["recycle_shred"], "min_items": 4,
     "address": "7 Mill Rd", "contact": "intake@fiberloop.example", "notes": "colour-sorted lots"},
    {"id": "R-DEN", "name": "Blue Cycle Denim (fictional)", "accepts": ["recycle_denim"], "min_items": 3,
     "address": "22 Indigo St", "contact": "denim@bluecycle.example"},
    {"id": "R-MIX", "name": "Mixed Fibre Co-op (fictional)", "accepts": ["recycle_mixed"], "min_items": 10,
     "address": "5 Co-op Ln", "contact": "mixed@coop.example"},
]

def main():
    os.makedirs(OUT, exist_ok=True)
    items, expected = build()
    inv = inventory(items, expected)
    p = R.plan(inv, RECYCLERS, TODAY)
    for name, obj in [("intake_items.json", items), ("expected_intake.json", expected),
                      ("inventory.json", inv), ("recyclers.json", RECYCLERS),
                      ("expected_disposition.json", p)]:
        with open(os.path.join(OUT, name), "w") as f:
            json.dump(obj, f, indent=1)
    print(f"items={len(items)} held_expected={sum(e['hold'] for e in expected)} inventory={len(inv)}")
    print("due", len(p["due"]), "pickups", [(x['route'], len(x['items'])) for x in p['pickups']])
    print("escalations", [(e['reason'], len(e['items'])) for e in p['escalations']])
    print("skipped", {s['reason'] for s in p['skipped']})

if __name__ == "__main__":
    main()
