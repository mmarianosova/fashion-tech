"""Score Intake Agent output against expected_intake.json.

Usage: python score_intake.py agent_output.json [expected_intake.json]
agent_output.json: list of {item_key, tags:{stream,fibre_type,color_group,condition}, confidence, held}
An item counts as held if held is true or confidence < THRESHOLD.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import sustain_ref as R

FIELDS = ["stream", "fibre_type", "color_group", "condition"]

def score(out, exp):
    got = {r["item_key"]: r for r in out}
    n = len(exp); missing = [e["item_key"] for e in exp if e["item_key"] not in got]
    field_ok = {f: 0 for f in FIELDS}; hold_ok = 0; bad_hold = []; bad_tags = []
    for e in exp:
        r = got.get(e["item_key"])
        if not r:
            continue
        held = bool(r.get("held")) or float(r.get("confidence", 1)) < R.THRESHOLD
        if held == e["hold"]:
            hold_ok += 1
        else:
            bad_hold.append(e["item_key"])
        if e["hold"]:
            continue  # tags of held items are not scored
        for f in FIELDS:
            if (r.get("tags") or {}).get(f) == e["tags"][f]:
                field_ok[f] += 1
            else:
                bad_tags.append((e["item_key"], f, (r.get("tags") or {}).get(f), e["tags"][f]))
    scored = sum(1 for e in exp if not e["hold"])
    return {"items": n, "missing": missing,
            "hold_accuracy": round(hold_ok / n, 3), "wrong_hold": bad_hold,
            "field_accuracy": {f: round(field_ok[f] / scored, 3) for f in FIELDS},
            "tag_errors": bad_tags}

if __name__ == "__main__":
    out = json.load(open(sys.argv[1]))
    exp = json.load(open(sys.argv[2] if len(sys.argv) > 2 else
                         os.path.join(os.path.dirname(__file__), "..", "data", "expected_intake.json")))
    print(json.dumps(score(out, exp), indent=1))
