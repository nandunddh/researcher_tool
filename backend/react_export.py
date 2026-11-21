"""Package the React-rendered visitor pages and their local assets."""
import io
import json
import re
import subprocess
import zipfile
from pathlib import Path

from public_site import visitor_page

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"


def _page_files(pages, home):
    names = {}
    used = {"index"}
    for index, page in enumerate(pages, 1):
        if page is home:
            names[page["id"]] = "index.html"
            continue
        stem = re.sub(r"[^a-z0-9_-]+", "-", (page.get("slug") or "").lower()).strip("-")[:80]
        if not stem or re.fullmatch(r"con|prn|aux|nul|com[1-9]|lpt[1-9]", stem):
            stem = f"page-{index}"
        candidate = stem
        suffix = 2
        while candidate in used:
            candidate = f"{stem}-{suffix}"
            suffix += 1
        used.add(candidate)
        names[page["id"]] = candidate + ".html"
    return names


def export_zip(site, media_dir):
    pages = site.get("pages") or []
    home = next((p for p in pages if p.get("is_home")), pages[0] if pages else None)
    files = _page_files(pages, home)
    assets = {}
    media = re.compile(r'(?<=")/api/builder/media/' + re.escape(site["site_id"]) + r'/([a-f0-9]{32}\.(?:jpg|gif|webp|png))(?=")')

    def local_asset(match):
        name = match[1]
        path = media_dir / name
        if not path.is_file():
            raise FileNotFoundError("An uploaded image used by this site is missing.")
        assets[name] = path
        return "./media/" + name

    inputs = []
    for page in pages or [None]:
        public = visitor_page(site, page_id=page["id"] if page else None)
        inputs.append({"site": public, "files": files, "filename": files[page["id"]] if page else "index.html"})
    data = media.sub(local_asset, json.dumps(inputs, ensure_ascii=False))
    result = subprocess.run(["node", "scripts/render-export.mjs"], input=data, cwd=FRONTEND,
                            capture_output=True, encoding="utf-8", timeout=90, check=True)
    rendered = json.loads(result.stdout)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in rendered.items():
            archive.writestr(name, content)
        for name, path in assets.items():
            archive.write(path, "media/" + name)
        exported_pages = json.loads(data)
        homepage = next(item["site"] for item in exported_pages if item["filename"] == "index.html")
        config = dict(homepage)
        config["pages"] = [{**ref, "schema_json": item["site"]["schema_json"]}
                           for ref, item in zip(homepage["pages"], exported_pages)]
        archive.writestr("site_config.json", json.dumps(config, indent=2))
        archive.writestr("README.md", "Open index.html or upload this folder to your static host. "
                         "Keep the HTML, stylesheet, script and media together. "
                         "Form submissions and registration payments require a same-origin /api/public/forms backend.\n")
    slug = re.sub(r"[^A-Za-z0-9_-]", "-", site.get("slug") or "website")
    return buf.getvalue(), f"{slug}_website.zip"
