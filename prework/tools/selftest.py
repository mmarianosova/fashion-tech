"""Offline self-test: rules, fixtures, scorers, ingest adapter. No network, no ZooWork."""
import copy, csv, json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sustain_ref as R, score_intake as SI, score_disposition as SD
from datetime import date

DATA = os.path.join(HERE, "..", "data")
L = lambda n: json.load(open(os.path.join(DATA, n)))
fails = []
def check(name, cond):
    print(("PASS " if cond else "FAIL ") + name)
    if not cond: fails.append(name)

# rule unit checks
p = R.parse_label_text("60% COTTON 40% POLYESTER MADE IN INDIA RN 12345")
check("parse blend", p["sum_ok"] and p["origin"] == "India" and p["rn"] == "12345")
check("missing fibre not legible", not R.parse_label_text("MADE IN ??")["legible"])
check("denim beats colour", R.stream_for("jeans", R.parse_label_text("100% COTTON")["fibre"], "damaged") == "denim")
check("70% natural -> shred", R.stream_for("t-shirt", [{"fibre":"cotton","pct":70},{"fibre":"polyester","pct":30}], "damaged") == "shred")
check("69% natural -> mixed", R.stream_for("t-shirt", [{"fibre":"cotton","pct":69},{"fibre":"polyester","pct":31}], "damaged") == "mixed")
check("unusable -> trash", R.stream_for("t-shirt", None, "unusable") == "trash")
check("colour groups", [R.color_group(c) for c in ("white","navy","red","multi")] == ["whites","darks","brights","mixed"])
check("swimwear not donated", R.route_for({"category":"swimwear","tags":{"stream":"mixed","condition":"wearable"}}) == "recycle_mixed")

# fixtures + scorers
items, exp = L("intake_items.json"), L("expected_intake.json")
check("32 intake items", len(items) == 32 and len(exp) == 32)
perfect = [{"item_key": e["item_key"], "tags": e["tags"], "confidence": 0.5 if e["hold"] else 0.95, "held": e["hold"]} for e in exp]
r = SI.score(perfect, exp)
check("intake scorer perfect", r["hold_accuracy"] == 1 and all(v == 1 for v in r["field_accuracy"].values()))
bad = copy.deepcopy(perfect); bad[0]["tags"]["stream"] = "trash"; bad[-1]["held"] = True; bad[-1]["confidence"] = 0.2
r = SI.score(bad, exp)
check("intake scorer detects errors", r["field_accuracy"]["stream"] < 1 and r["hold_accuracy"] < 1)

inv, rec, dexp = L("inventory.json"), L("recyclers.json"), L("expected_disposition.json")
again = R.plan(inv, rec, date(2026, 11, 7))
check("plan deterministic", again == dexp)
agent_like = {"routes": dexp["routes"], "pickups": dexp["pickups"], "escalations": dexp["escalations"]}
r = SD.score(agent_like, dexp)
check("disposition scorer perfect", r["due_set_match"] and r["pickups_match"] and r["escalations_match"] and r["shred_lots_by_color_ok"])
broken = copy.deepcopy(agent_like); broken["routes"].append({"item_key": dexp["skipped"][0]["item_key"], "route": "donate"})
check("disposition scorer flags wrongly due", SD.score(broken, dexp)["wrongly_due"] != [])
check("expected has success+below_min+dispose", {e["reason"] for e in dexp["escalations"]} >= {"below_minimum", "dispose_confirm"} and len(dexp["pickups"]) >= 2)
check("shred lots split by colour", all(len(p["lots"]) >= 2 for p in dexp["pickups"] if p["route"] == "recycle_shred"))
check("nothing held is due", not ({s["item_key"] for s in dexp["skipped"] if s["reason"] == "held"} & {r["item_key"] for r in dexp["routes"]}))
check("already flagged skipped", any(s["reason"] == "already_flagged" for s in dexp["skipped"]))

# ingest adapter with a Kaggle-style CSV
with tempfile.TemporaryDirectory() as td:
    src = os.path.join(td, "k.csv")
    with open(src, "w", newline="") as f:
        w = csv.writer(f); w.writerow(["Id", "Image", "Composition", "ArticleType", "BaseColour"])
        w.writerow(["a1", "a1.jpg", "100% Cotton", "Tshirts", "White"])
        w.writerow(["a2", "a2.jpg", "", "Jeans", "Blue"])
        w.writerow(["", "", "", "", ""])
    out = os.path.join(td, "o")
    subprocess.run([sys.executable, os.path.join(HERE, "ingest_dataset.py"), src, "--out", out], check=True, capture_output=True)
    ie = json.load(open(os.path.join(out, "expected_intake.json")))
    check("ingest rows", len(ie) == 2 and ie[0]["tags"]["fibre_type"] == "cotton" and ie[1]["hold"])

print("\nALL PASS" if not fails else f"\nFAILED: {fails}")
sys.exit(1 if fails else 0)
