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
    "sponsors", "testimonials", "announcement", "image", "content", "form_button", "registration", "key_dates", "submission", "schedule", "sponsor_tiers", "countdown", "venue",
}
LEVELS = {"basic", "medium", "pro"}
MAX_BYTES = 200_000
MAX_SECTIONS = 30
_HEX = re.compile(r"^#[0-9a-fA-F]{3,8}$")
_BLOCKED = re.compile(r"<\s*script|javascript:|vbscript:|data:text/html|<\s*iframe", re.I)
TEMPLATE_PREFIX = "lib-"
MAX_PAGES = 12
_PAGE_LINK = re.compile(r"^page:([a-z0-9-]*)$")


def _slug(text) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")[:40]


def _pages_of(design: dict) -> list:
    """Stored templates before multi-page support kept a flat 'sections' list."""
    return design.get("pages") or [{"name": "Home", "slug": "", "sections": design.get("sections") or []}]


def _resolve_links(value, site_slug: str, slugs: set):
    """Template links like "page:program" become this site's page addresses (unknown pages → "#")."""
    if isinstance(value, dict):
        return {k: _resolve_links(v, site_slug, slugs) for k, v in value.items()}
    if isinstance(value, list):
        return [_resolve_links(v, site_slug, slugs) for v in value]
    match = _PAGE_LINK.match(value) if isinstance(value, str) else None
    if not match:
        return value
    if not site_slug or match.group(1) not in slugs:
        return "#"
    return f"/sites/{site_slug}" + (f"/{match.group(1)}" if match.group(1) else "")


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
        # Either "pages": [{name, slug, sections}] (first page = home) or a one-page "sections" list.
        raw_pages = pack.get("pages") if "pages" in pack else [{"name": "Home", "sections": pack.get("sections")}]
        if not isinstance(raw_pages, list) or not 1 <= len(raw_pages) <= MAX_PAGES:
            raise ValueError(f"A template needs a 'pages' list with 1 to {MAX_PAGES} pages.")
        clean["pages"], used = [], set()
        for n, page in enumerate(raw_pages):
            if not isinstance(page, dict):
                raise ValueError(f"Page {n + 1} must be an object.")
            name = _text(page.get("name") or f"Page {n + 1}", 40, f"name of page {n + 1}")
            slug = "" if n == 0 else (_slug(page.get("slug") or name) or f"page-{n + 1}")
            while slug in used:
                slug += "-2"
            used.add(slug)
            sections = page.get("sections")
            if not isinstance(sections, list) or not 1 <= len(sections) <= MAX_SECTIONS:
                raise ValueError(f"Page \"{name}\" needs a 'sections' list with 1 to {MAX_SECTIONS} sections.")
            clean["pages"].append({"name": name, "slug": slug, "sections": [_section(s, i) for i, s in enumerate(sections)]})
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
             "theme": t["theme"], "description": t["description"], "imported": True, "page_count": len(_pages_of(t))}
            for t in list_items("template")]


def _load_template(template_id: str):
    with db.transaction() as cur:
        cur.execute("SELECT payload FROM library_items WHERE id = %s AND kind = 'template'", (template_id[len(TEMPLATE_PREFIX):],))
        row = cur.fetchone()
    return row[0] if row else None


def template_site(template_id: str, site_slug: str = ""):
    """(pages, theme) for an imported template id like 'lib-abc123', or None.
    Pages are ready to store on a site: ids, fresh section ids and resolved page links."""
    design = _load_template(template_id)
    if not design:
        return None
    raw = _pages_of(design)
    slugs = {p.get("slug", "") for p in raw}
    pages = [{"id": "page_home" if n == 0 else f"page_{uuid.uuid4().hex[:8]}", "name": p.get("name") or "Page", "slug": p.get("slug", ""),
              "is_home": n == 0, "schema_json": [fresh_ids(_resolve_links(sec, site_slug, slugs)) for sec in p.get("sections") or []]}
             for n, p in enumerate(raw)]
    return pages, dict(design.get("theme") or {})


def template_components(template_id: str):
    """(home page components, theme) for previews and the template gallery, or None."""
    found = template_site(template_id)
    return (found[0][0]["schema_json"], found[1]) if found else None
