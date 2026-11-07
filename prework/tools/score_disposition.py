"""Score Disposition Agent output against expected_disposition.json.

Usage: python score_disposition.py agent_output.json [expected_disposition.json]
agent_output.json: {routes:[{item_key,route,color_group}], pickups:[{route,items,lots?}],
                    escalations:[{items,reason}], skipped:[{item_key}]}
"""
import json, os, sys

def S(xs): return set(xs)

def score(out, exp):
    r_exp = {r["item_key"]: r["route"] for r in exp["routes"]}
    r_got = {r["item_key"]: r["route"] for r in out.get("routes", [])}
    due_exp, due_got = S(r_exp), S(r_got)
    route_ok = sum(1 for k, v in r_exp.items() if r_got.get(k) == v)
    p_exp = {(p["route"], tuple(sorted(p["items"]))) for p in exp["pickups"]}
    p_got = {(p["route"], tuple(sorted(p["items"]))) for p in out.get("pickups", [])}
    e_exp = {(e["reason"], tuple(sorted(e["items"]))) for e in exp["escalations"]}
    e_got = {(e["reason"], tuple(sorted(e["items"]))) for e in out.get("escalations", [])}
    lots_exp = {p["route"]: p["lots"] for p in exp["pickups"] if p.get("lots")}
    lots_got = {p["route"]: {g: sorted(v) for g, v in (p.get("lots") or {}).items()} for p in out.get("pickups", [])}
    lots_ok = all(lots_got.get(k) == v for k, v in lots_exp.items())
    # hard failures: flagging something that must be skipped, or mixing mixed into shred
    skip_exp = {s["item_key"] for s in exp["skipped"]}
    wrongly_due = sorted(due_got & skip_exp)
    mixed_in_shred = any(r_got.get(k) == "recycle_mixed" for p in out.get("pickups", [])
                         if p["route"] == "recycle_shred" for k in p["items"])
    return {
        "due_set_match": due_exp == due_got, "missed_due": sorted(due_exp - due_got), "wrongly_due": wrongly_due,
        "route_accuracy": round(route_ok / max(1, len(r_exp)), 3),
        "pickups_match": p_exp == p_got, "pickups_missing": sorted(p_exp - p_got), "pickups_extra": sorted(p_got - p_exp),
        "escalations_match": e_exp == e_got, "escalations_missing": sorted(e_exp - e_got), "escalations_extra": sorted(e_got - e_exp),
        "shred_lots_by_color_ok": lots_ok, "mixed_never_in_shred": not mixed_in_shred,
    }

if __name__ == "__main__":
    out = json.load(open(sys.argv[1]))
    exp = json.load(open(sys.argv[2] if len(sys.argv) > 2 else
                         os.path.join(os.path.dirname(__file__), "..", "data", "expected_disposition.json")))
    print(json.dumps(score(out, exp), indent=1))
