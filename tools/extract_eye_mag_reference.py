"""Generate parity reference tables (fields, shorthand aliases, lists) from a local OpenEMR checkout.

Usage: python tools/extract_eye_mag_reference.py <path-to-openemr> [output-dir]

Outputs FIELDS.md, SHORTHAND.md and LISTS.md. No code is copied into the output.
LISTS.md reproduces OpenEMR's GPL-licensed seed data, so it is git-ignored and must stay
local; see CONTRIBUTING.md (seed data rule)."""
import re, sys, pathlib, collections

if len(sys.argv) < 2:
    sys.exit(__doc__)
OE = pathlib.Path(sys.argv[1])
OUT = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else pathlib.Path(__file__).resolve().parent.parent / "docs" / "spec"
OUT.mkdir(parents=True, exist_ok=True)
sql = (OE / "sql" / "database.sql").read_text(encoding="utf-8", errors="replace")
js = (OE / "interface/forms/eye_mag/js/shorthand_eye.js").read_text(encoding="utf-8", errors="replace")

# ---------- FIELDS ----------
tables = collections.OrderedDict()
for m in re.finditer(r"CREATE TABLE `(form_eye_[a-z_]+)` \((.*?)\n\s*\)\s*ENGINE", sql, re.S):
    cols = []
    for line in m.group(2).splitlines():
        line = line.strip().rstrip(",")
        c = re.match(r"`([^`]+)`\s+([a-zA-Z]+(?:\([^)]*\))?)(.*)", line)
        if c:
            extra = c.group(3)
            dflt = re.search(r"DEFAULT\s+('[^']*'|\S+)", extra, re.I)
            cmt = re.search(r"COMMENT\s+'([^']*)'", extra, re.I)
            cols.append((c.group(1), c.group(2), dflt.group(1) if dflt else "", cmt.group(1) if cmt else ""))
        elif line.upper().startswith(("PRIMARY KEY", "UNIQUE KEY", "KEY")):
            cols.append(("_key_", line, "", ""))
    tables[m.group(1)] = cols

def eye_of(name):
    n = name.upper()
    if n.startswith("OD") or (n.startswith("R") and len(n) > 2): return "OD"
    if n.startswith("OS") or (n.startswith("L") and len(n) > 2): return "OS"
    return ""

with open(OUT / "FIELDS.md", "w", encoding="utf-8") as f:
    f.write("# eye_mag field reference (generated)\n\n")
    f.write("Every data field in OpenEMR eye_mag's tables, extracted from `sql/database.sql`. "
            "Field names double as shorthand targets (typing `RUL:ptosis;` writes column `RUL`). "
            "The *Eye* column is a naming-convention guess (R*/OD* = right, L*/OS* = left); verify per field.\n\n")
    total = 0
    for t, cols in tables.items():
        real = [c for c in cols if c[0] != "_key_"]
        total += len(real)
        f.write(f"## `{t}` ({len(real)} columns)\n\n| Column | Type | Default | Eye (guess) | Comment |\n|---|---|---|---|---|\n")
        for name, typ, d, cmt in real:
            f.write(f"| `{name}` | {typ} | {d} | {eye_of(name)} | {cmt} |\n")
        keys = [c[1] for c in cols if c[0] == "_key_"]
        if keys:
            f.write("\nKeys: " + "; ".join(f"`{k}`" for k in keys) + "\n")
        f.write("\n")
    f.write(f"_Total: {len(tables)} tables, {total} columns._\n")

# ---------- SHORTHAND ----------
# aliases: split into condition/body chunks
chunks = re.split(r"(?=\b(?:else\s+)?if\s*\()", js)
alias = collections.OrderedDict()
for ch in chunks:
    cond = re.match(r"(?:else\s+)?if\s*\((.*?)\)\s*\{", ch, re.S)
    if not cond: continue
    codes = re.findall(r"field\s*==\s*['\"]([^'\"]+)['\"]", cond.group(1))
    if not codes: continue
    body = ch[cond.end():]
    targets = re.findall(r"field2\s*=\s*['\"]([^'\"]+)['\"]", body)
    targets += re.findall(r"\bfield\s*=\s*['\"]([^'\"]+)['\"]", body)
    targets += re.findall(r"\$\(\s*['\"]#([A-Za-z0-9_]+)['\"]\s*\)\.val\(", body)
    targets = list(dict.fromkeys(t for t in targets if t not in codes or len(targets) == 1))
    key = " / ".join(dict.fromkeys(codes))
    if targets:
        alias.setdefault(key, [])
        for t in targets:
            if t not in alias[key]: alias[key].append(t)

vocab = re.findall(r"\.replace\(/(.*?)/([gim]*),\s*['\"](.*?)['\"]\)", js[: js.find("}", js.find("function expand_vocab"))+1] if "function expand_vocab" in js else "")
def clean(rx):
    return rx.replace("\\b", "").replace("(\\s+)", " ").replace("\\/", "/").replace("\\s", " ")

with open(OUT / "SHORTHAND.md", "w", encoding="utf-8") as f:
    f.write("# eye_mag shorthand reference (generated)\n\n")
    f.write("Grammar and behavior rules live in BEHAVIOR.md. This file lists the *vocabulary* extracted from "
            "`js/shorthand_eye.js`: codes that map to fields other than their own name, and the abbreviation expansions. "
            "Any field name in FIELDS.md is also a valid code on its own.\n\n")
    f.write("Known defects in the original (do not replicate): `LCN5` maps to `LCNVI` (should be `LCNV`); "
            "`LH` maps to `OLHERTEL` (should be `OSHERTEL`); `BC` is claimed by both conjunctiva and cup (cup branch unreachable); "
            "`BCNVII`/`CNVII`/`CN7` writes into the CN V fields `RCNV`/`LCNV` instead of `RCNVII`/`LCNVII` (shorthand_eye.js:543-551). "
            "Review every row against FIELDS.md during implementation.\n\n")
    f.write(f"## Field aliases ({len(alias)})\n\n| Code(s) typed | Writes to field(s) |\n|---|---|\n")
    for k, v in alias.items():
        f.write(f"| `{k}` | {', '.join('`'+x+'`' for x in v)} |\n")
    f.write(f"\n## Abbreviation expansion ({len(vocab)})\n\nApplied to entered text. `i` flag = case-insensitive.\n\n| Typed | Becomes | Flags |\n|---|---|---|\n")
    for rx, fl, rep in vocab:
        f.write(f"| `{clean(rx)}` | {rep} | {fl.replace('g','')} |\n")

# ---------- LISTS ----------
def parse_tuple(s):
    vals, i = [], 0
    while i < len(s):
        ch = s[i]
        if ch == "'":
            j, buf = i + 1, []
            while j < len(s):
                if s[j] == "\\" and j + 1 < len(s): buf.append(s[j+1]); j += 2; continue
                if s[j] == "'" and j + 1 < len(s) and s[j+1] == "'": buf.append("'"); j += 2; continue
                if s[j] == "'": break
                buf.append(s[j]); j += 1
            vals.append("".join(buf)); i = j + 1
        elif ch.isdigit() or (ch == "-" and s[i+1:i+2].isdigit()):
            m = re.match(r"-?\d+(\.\d+)?", s[i:]); vals.append(m.group(0)); i += len(m.group(0))
        elif s[i:i+4].upper() == "NULL": vals.append(""); i += 4
        else: i += 1
    return vals

want = lambda lid: lid.startswith("Eye_") or lid in ("CTLManufacturer", "CTLSupplier", "CTLBrand")
lists = collections.OrderedDict()
titles = {}
header = None
for line in sql.splitlines():
    hm = re.match(r"INSERT INTO `?list_options`?\s*\((.*?)\)\s*VALUES\s*(.*)", line, re.I)
    if hm:
        header = [c.strip(" `") for c in hm.group(1).split(",")]
        rest = hm.group(2).strip()
        if rest.startswith("("):
            row = dict(zip(header, parse_tuple(rest[1:rest.rfind(")")])))
            if row.get("list_id") == "lists" and want(row.get("option_id", "")):
                titles[row["option_id"]] = row.get("title", "")
            elif want(row.get("list_id", "")):
                lists.setdefault(row["list_id"], []).append(row)
        continue
    if header and line.startswith("('"):
        body = line.strip().rstrip(",;")
        row = dict(zip(header, parse_tuple(body[1:body.rfind(")")])))
        if want(row.get("list_id", "")):
            lists.setdefault(row["list_id"], []).append(row)
    elif not line.strip():
        header = None

with open(OUT / "LISTS.md", "w", encoding="utf-8") as f:
    f.write("# eye_mag seed lists (generated)\n\n")
    f.write("Clinical seed data shipped with eye_mag in `list_options`. In the new app these become editable seed data "
            "(quick picks, defaults, coding terms, tests, lens options). Column meaning per list is explained in BEHAVIOR.md; "
            "here: `mapping`/`notes`/`codes`/`subtype` are the raw values.\n\n")
    for lid, rows in lists.items():
        rows.sort(key=lambda r: int(float(r.get("seq") or 0)))
        f.write(f"## `{lid}` ({len(rows)}) {('- ' + titles[lid]) if lid in titles else ''}\n\n")
        cols = [c for c in ("option_id", "title", "mapping", "notes", "codes", "subtype") if any(r.get(c) for r in rows)]
        f.write("| " + " | ".join(cols) + " |\n|" + "---|" * len(cols) + "\n")
        for r in rows:
            f.write("| " + " | ".join((r.get(c) or "").replace("|", "\\|") for c in cols) + " |\n")
        f.write("\n")

print("tables", len(tables), "cols", sum(len([c for c in v if c[0] != '_key_']) for v in tables.values()))
print("aliases", len(alias), "vocab", len(vocab))
print("lists", {k: len(v) for k, v in lists.items()})
