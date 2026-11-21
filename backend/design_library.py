"""Imported designs (sections and templates) shared by every workspace. Root admin imports them as JSON design files."""
import copy
import json
import re
import uuid

import db
from psycopg2.extras import Json

FORMAT = "scistudio-design"
# Section types the React renderer draws. "custom" (raw HTML) is left out on purpose.
SECTION_TYPES = {
    "navbar", "hero", "features", "speakers", "pricing", "gallery", "faq", "contact", "footer", "about", "stats", "agenda",
    "sponsors", "testimonials", "announcement", "image", "content", "form_button", "registration",
}
LEVELS = {"basic", "medium", "pro"}
MAX_BYTES = 200_000
MAX_SECTIONS = 30
_HEX = re.compile(r"^#[0-9a-fA-F]{3,8}$")
_BLOCKED = re.compile(r"<\s*script|javascript:|vbscript:|data:text/html|<\s*iframe", re.I)
TEMPLATE_PREFIX = "lib-"


def _text(value, limit, field, required=False):
    value = str(value or "").strip()
    if required and not value:
        raise ValueError(f"The design needs a {field}.")
    if len(value) > limit:
        raise ValueError(f"The {field} is too long (max {limit} characters).")
    return value


def _scan(value, path="design"):
    """Blocks scripts and private fields anywhere in the design (the renderer sanitizes too; this is the first wall)."""
    if isinstance(value, dict):
        for key, item in value.items():
            if str(key).startswith("_"):
                raise ValueError(f"Private field '{key}' is not allowed ({path}).")
            _scan(item, f"{path}.{key}")
    elif isinstance(value, list):
        for i, item in enumerate(value):
            _scan(item, f"{path}[{i}]")
    elif isinstance(value, str) and _BLOCKED.search(value):
        raise ValueError(f"Scripts and embedded pages are not allowed ({path}).")


def _section(raw, index):
    if not isinstance(raw, dict):
        raise ValueError(f"Section {index + 1} must be an object.")
    kind = str(raw.get("type") or "")
    if kind not in SECTION_TYPES:
        raise ValueError(f"Section {index + 1}: unknown type '{kind}'. Use one of: {', '.join(sorted(SECTION_TYPES))}.")
    data = raw.get("data")
    if not isinstance(data, dict):
        raise ValueError(f"Section {index + 1} needs a 'data' object.")
    clean = {"type": kind, "title": _text(raw.get("title") or kind.replace("_", " ").title(), 80, "section title"), "data": data}
    for key in ("section_style", "studio_style"):  # section background/padding per screen size
        if isinstance(raw.get(key), dict):
            clean[key] = raw[key]
    return clean


def validate(pack) -> dict:
    """Returns a clean design or raises ValueError with a plain-language reason."""
    if not isinstance(pack, dict):
        raise ValueError("A design file must be a JSON object.")
    if len(json.dumps(pack)) > MAX_BYTES:
        raise ValueError("This design file is too large (max 200 KB).")
    if pack.get("format") != FORMAT:
        raise ValueError(f"This is not a SciStudio design file (\"format\" must be \"{FORMAT}\").")
    _scan(pack)
    kind = pack.get("kind")
    clean = {
        "kind": kind,
        "name": _text(pack.get("name"), 80, "name", required=True),
        "category": _text(pack.get("category") or "Imported", 40, "category"),
        "level": pack.get("level") if pack.get("level") in LEVELS else "basic",
        "description": _text(pack.get("description"), 300, "description"),
    }
    if kind == "section":
        clean["section"] = _section(pack.get("section"), 0)
    elif kind == "template":
        sections = pack.get("sections")
        if not isinstance(sections, list) or not 1 <= len(sections) <= MAX_SECTIONS:
            raise ValueError(f"A template needs a 'sections' list with 1 to {MAX_SECTIONS} sections.")
        clean["sections"] = [_section(s, i) for i, s in enumerate(sections)]
        theme = pack.get("theme") if isinstance(pack.get("theme"), dict) else {}
        clean["theme"] = {k: theme[k] for k in ("primary_color", "accent_color", "bg_color") if _HEX.match(str(theme.get(k, "")))}
        clean["theme"]["mode"] = "dark" if theme.get("mode") == "dark" else "light"
    else:
        raise ValueError("\"kind\" must be \"section\" or \"template\".")
    return clean


def fresh_ids(section: dict) -> dict:
    """Copy of a library section with new ids, ready to place on a site."""
    out = copy.deepcopy(section)
    out["id"] = f"comp_{uuid.uuid4().hex}"
    for node in out["data"].get("nodes") or []:
        if isinstance(node, dict):
            node["id"] = str(uuid.uuid4())
    return out


# ---------------------------------------------------------------- storage
def save(design: dict, created_by: str) -> dict:
    item_id = uuid.uuid4().hex[:12]
    with db.transaction() as cur:
        cur.execute("INSERT INTO library_items (id, kind, name, payload, created_by) VALUES (%s, %s, %s, %s, %s)",
                    (item_id, design["kind"], design["name"], Json(design), created_by))
    return {"id": item_id, **design}


def list_items(kind=None):
    with db.transaction() as cur:
        cur.execute("SELECT id, payload, created_at FROM library_items WHERE %s IS NULL OR kind = %s ORDER BY created_at DESC", (kind, kind))
        return [{"id": i, **payload, "created_at": created.isoformat()} for i, payload, created in cur.fetchall()]


def delete(item_id: str) -> bool:
    with db.transaction() as cur:
        cur.execute("DELETE FROM library_items WHERE id = %s", (item_id,))
        return cur.rowcount > 0


def templates_for_gallery():
    return [{"id": TEMPLATE_PREFIX + t["id"], "name": t["name"], "category": t["category"], "layout": "imported",
             "theme": t["theme"], "description": t["description"], "imported": True} for t in list_items("template")]


def template_components(template_id: str):
    """(components, theme) for an imported template id like 'lib-abc123', or None."""
    item_id = template_id[len(TEMPLATE_PREFIX):]
    with db.transaction() as cur:
        cur.execute("SELECT payload FROM library_items WHERE id = %s AND kind = 'template'", (item_id,))
        row = cur.fetchone()
    if not row:
        return None
    return [fresh_ids(s) for s in row[0]["sections"]], dict(row[0]["theme"])
