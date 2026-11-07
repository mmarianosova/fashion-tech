"""Extract catalog evidence from MAG STOCK without loading its embedded images."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import re

from openpyxl import load_workbook

STYLE = re.compile(r"[A-Za-z0-9][A-Za-z0-9 /._-]*")


def export(path, styles=(), source_url=None):
    selected = {style.strip().upper() for style in styles}
    workbook = load_workbook(path, read_only=True, data_only=True)
    catalog = defaultdict(list)
    try:
        for sheet in workbook:
            rows = iter(sheet.values)
            headers = [str(x or "").strip().lower() for x in next(rows, ())]
            for row_number, cells in enumerate(rows, 2):
                def values(test):
                    return [str(value).strip() for header, value in zip(headers, cells)
                            if value is not None and str(value).strip() and test(header)]

                def first(*names):
                    return next(iter(values(lambda h: h in names)), None)

                style = first("sku", "style number", "style nimber", "style #")
                if not style or not STYLE.fullmatch(style) or not any(c.isdigit() for c in style):
                    continue
                if selected and style.upper() not in selected:
                    continue
                upcs = [v for v in values(lambda h: h.startswith("upc"))
                        if re.fullmatch(r"[0-9]{12,14}", v)]
                urls = [v for v in values(lambda h: "link" in h) if v.startswith("https://")]
                catalog[style.upper()].append({
                    "sheet": sheet.title, "row": row_number, "style": style,
                    "upcs": upcs, "urls": urls, "composition": first("content", "contents"),
                    "color": first("color", "colour"), "description": first("description"),
                })
    finally:
        workbook.close()
    missing = selected - catalog.keys()
    if missing:
        raise ValueError(f"Styles not found: {', '.join(sorted(missing))}")
    return {"sourceUrl": source_url or Path(path).name, "styles": dict(catalog)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook")
    parser.add_argument("--styles", nargs="+", default=[], help="Limit export to these exact style numbers")
    parser.add_argument("--source-url", help="Workbook link for the audit record")
    args = parser.parse_args()
    print(json.dumps(export(args.workbook, args.styles, args.source_url), ensure_ascii=False))
