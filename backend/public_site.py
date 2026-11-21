"""Visitor-facing projection of a published SciStudio page."""
from collections import OrderedDict
from time import monotonic


def _public_content(value):
    if isinstance(value, dict):
        return {k: _public_content(v) for k, v in value.items()
                if not k.startswith("_payment") and k not in {"discount_codes", "user_email", "owner_email"}}
    if isinstance(value, list):
        return [_public_content(item) for item in value]
    return value


def public_event(event):
    """Event details visitors may see: never discount codes."""
    if not isinstance(event, dict):
        return {}
    return _public_content({k: event[k] for k in ("basics", "periods", "tickets", "addons", "speakers", "deadlines") if k in event})


def published_page(site, address=None):
    if not site or site.get("status") != "published":
        return None
    return visitor_page(site, address)


def visitor_page(site, address=None, *, page_id=None):
    """Project visitor content after the caller has checked publication or ownership."""
    pages = site.get("pages") or []
    home = next((p for p in pages if p.get("is_home")), pages[0] if pages else {})
    page = next((p for p in pages if (p.get("slug") or "").strip("/") == address), None) if address else home
    if page_id is not None:
        page = next((p for p in pages if p.get("id") == page_id), None)
    if page is None:
        return None
    meta = site.get("meta_config")
    if not isinstance(meta, dict):
        meta = {}
    seo = {k: meta.get(k) or site.get(k) for k in (
        "meta_title", "meta_description", "meta_keywords", "og_image", "robots", "canonical_url", "ga_tracking_id")}
    seo["ga_tracking_id"] = seo["ga_tracking_id"] or site.get("ga_code")
    for key in ("meta_title", "meta_description", "meta_keywords"):
        seo[key] = page.get(key) or seo[key]
    config = site.get("theme_config")
    studio = config.get("studio") if isinstance(config, dict) else {}
    return {
        "site_id": site["site_id"], "slug": site["slug"], "name": site.get("name") or site["slug"],
        "schema_json": _public_content(page.get("schema_json", []) if pages else site.get("schema_json", [])),
        "pages": [{**{k: p.get(k) for k in ("id", "name", "slug")}, "is_home": p is home} for p in pages],
        "page_name": page.get("name") if page is not home else None,
        "event": public_event(site.get("event")),
        "meta_config": {k: v for k, v in seo.items() if isinstance(v, str)},
        "theme_config": {"studio": {k: studio[k] for k in ("accent", "ink", "headingFont", "bodyFont", "radius")
                                    if isinstance(studio, dict) and isinstance(studio.get(k), (int, str))}},
    }


class FormRateLimit:
    """Fixed-window limit per peer address for a single application worker."""
    def __init__(self, limit=60, seconds=60):
        self.limit = limit
        self.seconds = seconds
        self.windows = OrderedDict()

    def allow(self, peer):
        now = monotonic()
        while self.windows and next(iter(self.windows.values()))[0] <= now:
            self.windows.popitem(last=False)
        expiry, count = self.windows.get(peer, (now + self.seconds, 0))
        if count >= self.limit:
            return False
        self.windows[peer] = (expiry, count + 1)
        return True
