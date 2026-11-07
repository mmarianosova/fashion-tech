"""Turn the team's own dataset (Kaggle download or researched set) into the
test format used by the Intake Agent and the scorer.

Usage:
  python ingest_dataset.py INPUT.(csv|json|jsonl) [--out data_big] [--limit 200] [--images-dir PATH]

Accepts flexible column names (case-insensitive). Recognised columns:
  item_key | id | sku                     -> item_key (generated if absent)
  image | image_path | file | filename     -> image_path (kept as-is; never read here)
  label_text | text | ocr | ocr_text | composition | fibre_text | material
  garment_type | garment | type | product_type | article
  color | colour
  category | department
  condition   (wearable|damaged|unusable; default "wearable" when absent)
  stream | fibre_type | color_group         -> if all present, used as ground truth
Rows without ground-truth tags get expected tags from the reference rules
(sustain_ref), so the label text must contain readable "NN% FIBRE" lines.
Rows with no readable fibre are expected to be HELD.
Outputs: intake_items.json (agent-visible) and expected_intake.json.
"""
import csv, json, os, sys, argparse
sys.path.insert(0, os.path.dirname(__file__))
import sustain_ref as R

ALIASES = {
    "item_key": ["item_key", "id", "sku", "item_id"],
    "image_path": ["image_path", "image", "file", "filename", "img"],
    "label_text": ["label_text", "text", "ocr", "ocr_text", "composition", "fibre_text", "fiber_text", "material"],
    "garment_type": ["garment_type", "garment", "type", "product_type", "article", "articletype"],
    "color": ["color", "colour", "basecolour", "basecolor"],
    "category": ["category", "department", "mastercategory"],
    "condition": ["condition"],
    "visible_note": ["visible_note", "note", "notes"],
}

def pick(row, key):
    low = {k.lower().strip(): v for k, v in row.items()}
    for a in ALIASES[key]:
        if a in low and str(low[a]).strip() not in ("", "nan", "None"):
            return str(low[a]).strip()
    return ""

def load(path):
    if path.endswith(".csv"):
        return list(csv.DictReader(open(path, newline="", encoding="utf-8")))
    if path.endswith(".jsonl"):
        return [json.loads(l) for l in open(path) if l.strip()]
    data = json.load(open(path))
    return data if isinstance(data, list) else data.get("items", [])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input"); ap.add_argument("--out", default="data_big")
    ap.add_argument("--limit", type=int, default=0); ap.add_argument("--images-dir", default="")
    a = ap.parse_args()
    rows = load(a.input)
    if a.limit:
        rows = rows[: a.limit]
    items, expected, skipped = [], [], 0
    for i, row in enumerate(rows, 1):
        text, garment = pick(row, "label_text"), pick(row, "garment_type") or "garment"
        img = pick(row, "image_path")
        if not text and not img:
            skipped += 1; continue
        cond = pick(row, "condition") or "wearable"
        if cond not in ("wearable", "damaged", "unusable"):
            cond = "wearable"
        color = pick(row, "color") or "multi"
        label = R.parse_label_text(text)
        key = pick(row, "item_key") or f"X-{i:05d}"
        items.append({"item_key": key, "garment_type": garment, "color": color,
                      "category": (pick(row, "category") or "tops").lower(), "label_text": text,
                      "visible_note": pick(row, "visible_note"), "condition": cond,
                      "image_path": (os.path.join(a.images_dir, img) if img and a.images_dir else img) or None})
        low = {k.lower(): v for k, v in row.items()}
        if all(low.get(k) for k in ("stream", "fibre_type", "color_group")):
            tags = {"stream": low["stream"], "fibre_type": low["fibre_type"],
                    "color_group": low["color_group"], "condition": cond}
            hold = False
        else:
            tags = R.tag_item(garment, label["fibre"], color, cond)
            hold = R.should_hold(label, False)
        expected.append({"item_key": key, "tags": tags, "hold": hold,
                         "confidence_band": "low" if hold else "high"})
    os.makedirs(a.out, exist_ok=True)
    json.dump(items, open(os.path.join(a.out, "intake_items.json"), "w"), indent=1)
    json.dump(expected, open(os.path.join(a.out, "expected_intake.json"), "w"), indent=1)
    print(f"wrote {len(items)} items to {a.out} (skipped {skipped} rows without text or image); "
          f"expected held: {sum(e['hold'] for e in expected)}")

if __name__ == "__main__":
    main()
