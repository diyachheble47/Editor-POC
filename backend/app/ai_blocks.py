"""What the AI may produce, and how its output is checked.

The model is asked for one JSON object per line. Each line is parsed and
sanitised here before anything reaches the editor: unknown block types,
malformed lines and oversized text are dropped, never passed through.
"""
import json
import re
from typing import Optional

MAX_BLOCKS = 200
MAX_TEXT = 2000
MAX_LATEX = 500
MAX_ITEMS = 30
CALLOUT_VARIANTS = {"info", "tip", "warning", "caution"}

# Molecules the editor can draw. The AI only names one; the editor owns the
# atom coordinates (models get those wrong).
MOLECULES = {
    "water", "ammonia", "methane", "carbon_dioxide", "ethene", "ethanol",
    "propane", "acetic_acid", "benzene", "cyclohexane",
}
# Circuit parts the editor has symbols for.
CIRCUIT_PARTS = {
    "battery", "acsource", "resistor", "capacitor", "inductor", "diode", "led",
    "bulb", "switch", "fuse", "ammeter", "voltmeter", "ground", "wire",
}
MAX_TABLE_ROWS, MAX_TABLE_COLS, MAX_CELL = 20, 8, 200
MAX_MATRIX = 6
MAX_TABS, MAX_QUESTIONS, MAX_OPTIONS = 8, 10, 6
MAX_HTML = 20000
# Interactive HTML runs in a locked iframe (no network, no access to the page), which is the
# real protection. This only turns away code that could not work there anyway (it needs a
# network, a CDN or the parent page), so the teacher gets a clear "try again" instead of a
# widget that silently does nothing.
_UNSAFE_HTML = re.compile(
    r"<script[^>]+\bsrc\s*=|<link[^>]+\bhref\s*=|@import|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|"
    r"sendBeacon|window\s*\.\s*(top|parent|opener)|\b(top|parent)\s*\.\s*(location|document)|"
    r"document\s*\.\s*cookie|<iframe|<object|<embed|\bimport\s*\(",
    re.I,
)
_HTML_FENCE = re.compile(r"^```(?:html)?\s*|\s*```$", re.I)


def clean_html(code: object) -> Optional[str]:
    """A model's HTML answer -> a self-contained snippet, or None if empty / needs the network."""
    if not isinstance(code, str):
        return None
    code = _HTML_FENCE.sub("", code.strip()).strip()
    if not code or len(code) > MAX_HTML or "<" not in code:
        return None
    return None if _UNSAFE_HTML.search(code) else code
MAX_FUNCTIONS, MAX_POINTS, MAX_POLYGONS, MAX_SEGMENTS = 5, 30, 6, 30
MAX_PARTS, MAX_WIRES = 30, 60
PLANE = 10  # graph/geometry axes run from -10 to 10
_FORMULA_OK = re.compile(r"^[0-9A-Za-z+\-*/^().,\s]+$")
_PART_ID = re.compile(r"^[A-Za-z0-9_-]{1,20}$")


def _text(value: object, limit: int = MAX_TEXT) -> Optional[str]:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value[:limit] if value else None


def _number(value: object) -> Optional[float]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value != value or abs(value) > 1e6:  # NaN / absurd
        return None
    return float(value)


def _xy(value: object) -> Optional[list]:
    """A [x, y] pair kept inside the drawable plane."""
    if not isinstance(value, list) or len(value) != 2:
        return None
    x, y = _number(value[0]), _number(value[1])
    if x is None or y is None:
        return None
    clamp = lambda n: max(-PLANE, min(PLANE, n))  # noqa: E731
    return [clamp(x), clamp(y)]


def _grid(raw: object, max_rows: int, max_cols: int, cell_limit: int) -> Optional[list]:
    """Rows of short strings, made rectangular."""
    if not isinstance(raw, list) or not raw:
        return None
    rows = []
    for row in raw[:max_rows]:
        if not isinstance(row, list):
            return None
        rows.append([("" if c is None else str(c).strip()[:cell_limit]) for c in row[:max_cols]])
    width = max((len(r) for r in rows), default=0)
    if width == 0:
        return None
    return [r + [""] * (width - len(r)) for r in rows]


_SMILES = re.compile(r"^[A-Za-z0-9@+\-\[\]\(\)=#:/\\.%]{1,150}$")

MAX_MERMAID = 4000
# Mermaid itself runs with securityLevel "strict" on the frontend (scripts/click
# handlers stripped), so this only turns away the obvious attempt to break out of
# that — real text, no markup or script-ish content.
_UNSAFE_MERMAID = re.compile(r"<\s*script|javascript:|on\w+\s*=|<\s*iframe", re.I)
_MERMAID_FENCE = re.compile(r"^```(?:mermaid)?\s*|\s*```$", re.I)


def _sanitize_flowchart(raw: dict) -> Optional[dict]:
    code = raw.get("code")
    if not isinstance(code, str):
        return None
    code = _MERMAID_FENCE.sub("", code.strip()).strip()
    if not code or len(code) > MAX_MERMAID or _UNSAFE_MERMAID.search(code):
        return None
    return {"type": "flowchart", "code": code}


def _sanitize_chart(raw: dict) -> Optional[dict]:
    ctype = raw.get("chartType")
    labels_raw, series_raw = raw.get("labels"), raw.get("series")
    if ctype not in ("bar", "line", "pie") or not isinstance(labels_raw, list) or not isinstance(series_raw, list):
        return None
    labels = [(_text(l, 30) or "") for l in labels_raw[:12]]
    series = []
    for s in series_raw[:4]:
        if not isinstance(s, dict) or not isinstance(s.get("values"), list):
            continue
        values = [_number(v) for v in s["values"][: len(labels)]]
        if len(labels) < 2 or len(values) != len(labels) or any(v is None for v in values):
            continue
        series.append({"name": _text(s.get("name"), 30) or "Series", "values": values})
    if len(labels) < 2 or not series:
        return None
    if ctype == "pie":
        series = series[:1]
    return {"type": "chart", "chartType": ctype, "title": _text(raw.get("title"), 80) or "", "labels": labels, "series": series}


def _sanitize_circuit(raw: dict) -> Optional[dict]:
    parts_raw, wires_raw = raw.get("parts"), raw.get("wires")
    if not isinstance(parts_raw, list) or not isinstance(wires_raw, list):
        return None
    parts, seen = [], set()
    for p in parts_raw[:MAX_PARTS]:
        if not isinstance(p, dict) or p.get("type") not in CIRCUIT_PARTS:
            continue
        pid = p.get("id")
        if not isinstance(pid, str) or not _PART_ID.match(pid) or pid in seen:
            continue
        seen.add(pid)
        part = {"id": pid, "type": p["type"]}
        value = _text(p.get("value"), 20)
        if value:
            part["value"] = value
        if p["type"] == "switch":
            part["closed"] = p.get("closed") is True
        parts.append(part)
    wires = []
    for w in wires_raw[:MAX_WIRES]:
        if isinstance(w, list) and len(w) == 2 and w[0] in seen and w[1] in seen and w[0] != w[1]:
            wires.append([w[0], w[1]])
    return {"type": "circuit", "parts": parts, "wires": wires} if len(parts) >= 2 and wires else None


def sanitize_block(raw: object) -> Optional[dict]:
    """Returns a clean block, or None if it isn't something we accept."""
    if not isinstance(raw, dict):
        return None
    kind = raw.get("type")

    if kind == "keep":
        # Edit mode only: "leave block #ref exactly as it was".
        ref = raw.get("ref")
        if isinstance(ref, bool) or not isinstance(ref, int) or not 0 <= ref < 1000:
            return None
        return {"type": "keep", "ref": ref}

    if kind == "section":
        # Starts a card in the editor (a level-2 heading that groups what follows).
        text = _text(raw.get("text"), 200)
        return {"type": "section", "text": text} if text else None

    if kind == "toc":
        return {"type": "toc"}

    if kind == "html":
        code = clean_html(raw.get("code"))
        return {"type": "html", "title": _text(raw.get("title"), 80) or "", "code": code} if code else None

    if kind == "tabs":
        items = raw.get("items")
        if not isinstance(items, list):
            return None
        clean = []
        for item in items[:MAX_TABS]:
            if not isinstance(item, dict):
                continue
            title, text = _text(item.get("title"), 80), _text(item.get("text"), 600)
            if title and text:
                clean.append({"title": title, "text": text})
        return {"type": "tabs", "items": clean} if len(clean) >= 2 else None

    if kind == "quiz":
        questions = raw.get("questions")
        if not isinstance(questions, list):
            return None
        clean_q = []
        for item in questions[:MAX_QUESTIONS]:
            if not isinstance(item, dict):
                continue
            q = _text(item.get("q"), 300)
            opts = item.get("options")
            if not q or not isinstance(opts, list):
                continue
            options = [t for t in (_text(o, 200) for o in opts[:MAX_OPTIONS]) if t]
            answer = item.get("answer")
            if len(options) < 2 or isinstance(answer, bool) or not isinstance(answer, int) or not 0 <= answer < len(options):
                continue
            clean_q.append({"q": q, "options": options, "answer": answer, "why": _text(item.get("why"), 300) or ""})
        return {"type": "quiz", "questions": clean_q} if clean_q else None

    if kind == "heading":
        text = _text(raw.get("text"), 200)
        level = raw.get("level")
        if text is None:
            return None
        return {"type": "heading", "level": level if level in (1, 2, 3) else 2, "text": text}

    if kind == "paragraph":
        text = _text(raw.get("text"))
        return {"type": "paragraph", "text": text} if text else None

    if kind in ("bullets", "numbered"):
        items = raw.get("items")
        if not isinstance(items, list):
            return None
        clean = [t for t in (_text(i, 500) for i in items[:MAX_ITEMS]) if t]
        return {"type": "list", "ordered": kind == "numbered", "items": clean} if clean else None

    if kind == "equation":
        chem = _text(raw.get("chem"), MAX_LATEX)
        latex = _text(raw.get("latex"), MAX_LATEX)
        if chem:
            return {"type": "equation", "value": chem}  # shown as a chemical equation
        if latex:
            return {"type": "math", "latex": latex}  # a maths/physics formula, not a chemical equation
        return None

    if kind == "callout":
        text = _text(raw.get("text"), 500)
        variant = raw.get("variant")
        if not text:
            return None
        return {"type": "callout", "variant": variant if variant in CALLOUT_VARIANTS else "info", "text": text}

    if kind == "quote":
        text = _text(raw.get("text"), 500)
        return {"type": "quote", "text": text} if text else None

    if kind == "divider":
        return {"type": "divider"}

    if kind == "code":
        text = raw.get("text")
        if not isinstance(text, str) or not text.strip():
            return None
        language = raw.get("language")
        return {
            "type": "code",
            "language": language[:20] if isinstance(language, str) and language.isalnum() else "plain",
            "text": text.strip("\n")[:MAX_TEXT],
        }

    if kind == "table":  # editable spreadsheet grid; cells starting with = are formulas
        rows = _grid(raw.get("rows"), MAX_TABLE_ROWS, MAX_TABLE_COLS, MAX_CELL)
        return {"type": "table", "rows": rows} if rows else None

    if kind == "matrix":  # a maths matrix
        rows = _grid(raw.get("rows"), MAX_MATRIX, MAX_MATRIX, 12)
        return {"type": "matrix", "rows": rows} if rows else None

    if kind == "graph":
        functions = [
            f.strip() for f in (raw.get("functions") or [])[:MAX_FUNCTIONS]
            if isinstance(f, str) and f.strip() and len(f) <= 80 and _FORMULA_OK.match(f)
        ] if isinstance(raw.get("functions"), list) else []
        points = [p for p in (_xy(p) for p in (raw.get("points") or [])[:MAX_POINTS]) if p] if isinstance(raw.get("points"), list) else []
        if not functions and not points:
            return None
        return {"type": "graph", "functions": functions, "points": points, "connect": raw.get("connect") is True}

    if kind == "geometry":
        polygons, segments = [], []
        if isinstance(raw.get("polygons"), list):
            for poly in raw["polygons"][:MAX_POLYGONS]:
                pts = [p for p in (_xy(p) for p in poly[:12])] if isinstance(poly, list) else []
                if len(pts) >= 3 and all(pts):
                    polygons.append(pts)
        if isinstance(raw.get("segments"), list):
            for seg in raw["segments"][:MAX_SEGMENTS]:
                pts = [_xy(p) for p in seg] if isinstance(seg, list) and len(seg) == 2 else []
                if len(pts) == 2 and all(pts):
                    segments.append(pts)
        return {"type": "geometry", "polygons": polygons, "segments": segments} if polygons or segments else None

    if kind == "molecule":
        name = raw.get("name")
        name = name.strip().lower().replace(" ", "_") if isinstance(name, str) else ""
        smiles = raw.get("smiles")
        if isinstance(smiles, str) and _SMILES.match(smiles.strip()):
            return {"type": "molecule", "smiles": smiles.strip()}
        return {"type": "molecule", "name": name} if name in MOLECULES else None

    if kind == "circuit":
        return _sanitize_circuit(raw)

    if kind == "chart":
        return _sanitize_chart(raw)

    if kind == "flowchart":
        return _sanitize_flowchart(raw)

    return None


_FENCE = re.compile(r"^\s*```")


def parse_block_line(line: str) -> Optional[dict]:
    """One line of model output -> a clean block, or None (blank, fence, junk)."""
    if not line.strip() or _FENCE.match(line):
        return None
    start, end = line.find("{"), line.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        return sanitize_block(json.loads(line[start : end + 1]))
    except ValueError:
        return None


