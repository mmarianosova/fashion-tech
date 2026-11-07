"""Build one ZIP per skill with SKILL.md at the ZIP root (ZooWork requirement)."""
import os, zipfile, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SK = os.path.join(ROOT, "skills"); DIST = os.path.join(SK, "dist")
os.makedirs(DIST, exist_ok=True)
ok = True
for name in sorted(os.listdir(SK)):
    d = os.path.join(SK, name)
    if not os.path.isdir(d) or name == "dist":
        continue
    text = open(os.path.join(d, "SKILL.md"), encoding="utf-8").read()
    m = re.match(r"---\nname: ([a-z0-9-]+)\ndescription: (.+?)\n---\n", text, re.S)
    if not m or m.group(1) != name:
        print("BAD FRONTMATTER", name); ok = False; continue
    out = os.path.join(DIST, f"{name}.zip")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for base, _, files in os.walk(d):
            for f in files:
                full = os.path.join(base, f)
                z.write(full, os.path.relpath(full, d))   # SKILL.md lands at the root
    names = zipfile.ZipFile(out).namelist()
    print(("ok  " if "SKILL.md" in names else "BAD ") + out, len(text.split()), "words")
sys.exit(0 if ok else 1)
