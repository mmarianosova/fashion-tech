"""Import a textile drop-off directory for the app's manual reference page."""
import csv
import json
import sys
from pathlib import Path

COLUMNS = {
    "Name": "name",
    "What they accept / guidelines": "guidelines",
    "Materials accepted": "materials",
    "Address": "address",
    "Drop-off days and times": "hours",
    "Source": "sources",
}

source = Path(sys.argv[1])
with source.open(encoding="utf-8-sig", newline="") as stream:
    reader = csv.DictReader(stream, strict=True)
    if reader.fieldnames != list(COLUMNS):
        raise SystemExit("Unexpected drop-off directory columns")
    sites = []
    for row in reader:
        if None in row or any(not row[column] or not row[column].strip() for column in COLUMNS):
            raise SystemExit(f"Incomplete drop-off row {reader.line_num}")
        sites.append({key: row[column].strip() for column, key in COLUMNS.items()})

if not sites:
    raise SystemExit("The drop-off directory is empty")
target = Path(__file__).resolve().parents[1] / "data" / "dropoff-sites.local.json"
target.write_text(json.dumps(sites, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Imported {len(sites)} drop-off sites")
