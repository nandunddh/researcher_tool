"""
builder_manager.py
==================
Website Builder Core Engine for SciProspect.
Supports multiple dynamic websites with six distinct starter templates,
customized details (Navbar, Hero, Theme modes: Dark / Light / Obsidian, Active Sections),
PostgreSQL cloud storage + local storage, standalone ZIP export, and public live URLs.
"""

import uuid
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import psycopg2
import psycopg2.errors
from psycopg2.extras import Json

import db
from app_config import get_data_dir

# Oracle PostgreSQL Cloud Config
# PostgreSQL access lives in db.py (settings from environment / backend/.env).

def get_websites_dir() -> Path:
    d = get_data_dir() / "websites"
    d.mkdir(parents=True, exist_ok=True)
    return d


# -----------------------------------------------------------------------------
# Six design-led starter templates
# -----------------------------------------------------------------------------

TEMPLATES_CATALOG = [{'id': 'summit', 'name': 'Summit', 'category': 'Bold events', 'layout': 'split', 'theme': {'mode': 'light', 'primary_color': '#6148c7', 'accent_color': '#db7251', 'bg_color': '#ffffff'}, 'description': 'A bold image-led conference website with clear registration and event highlights.'}, {'id': 'academic', 'name': 'Academic', 'category': 'Research & programs', 'layout': 'conference_program', 'theme': {'mode': 'light', 'primary_color': '#244c83', 'accent_color': '#467b95', 'bg_color': '#f8fafc'}, 'description': 'A clear research-first layout with event details, scientific content and speakers.'}, {'id': 'spotlight', 'name': 'Spotlight', 'category': 'Speakers & community', 'layout': 'centered', 'theme': {'mode': 'light', 'primary_color': '#a04467', 'accent_color': '#d87a91', 'bg_color': '#ffffff'}, 'description': 'A centered introduction followed by speakers, designed around the people at your event.'}, {'id': 'future', 'name': 'Future', 'category': 'Technology & innovation', 'layout': 'image_top', 'theme': {'mode': 'dark', 'primary_color': '#8b82ff', 'accent_color': '#38bdf8', 'bg_color': '#0b0f19'}, 'description': 'An immersive dark design with a large visual, bright accents and innovation highlights.'}, {'id': 'editorial', 'name': 'Editorial', 'category': 'Stories & discovery', 'layout': 'image_left', 'theme': {'mode': 'light', 'primary_color': '#9b573b', 'accent_color': '#ad8a65', 'bg_color': '#ffffff'}, 'description': 'An image-first editorial layout with warm accents and room for your conference story.'}, {'id': 'compact', 'name': 'Compact', 'category': 'Focused one-page events', 'layout': 'text_only', 'theme': {'mode': 'light', 'primary_color': '#365d9e', 'accent_color': '#6555b7', 'bg_color': '#ffffff'}, 'description': 'A concise typography-led page focused on registration, questions and contact details.'}]


# -----------------------------------------------------------------------------
# Dynamic Template Component Generator
# -----------------------------------------------------------------------------

def build_template_components(
    template_id: str,
    site_name: str,
    custom_opts: Optional[dict] = None
) -> Tuple[List[dict], dict]:
    """
    Builds the tailored dynamic components and theme config based on the chosen template
    and the user's customized wizard options.
    """
    if str(template_id or "").startswith("lib-"):
        import design_library
        imported = design_library.template_components(template_id)
        if imported:
            return imported
    tmpl = next((t for t in TEMPLATES_CATALOG if t["id"] == template_id), TEMPLATES_CATALOG[0])
    theme = dict(tmpl["theme"])
    theme["animated_background"] = True
    custom_opts = custom_opts or {}

    # Override theme if chosen in wizard
    if "mode" in custom_opts:
        theme["mode"] = custom_opts["mode"]
        if custom_opts["mode"] == "light":
            theme["bg_color"] = "#f8fafc"
            theme["text_color"] = "#0f172a"
        else:
            theme["bg_color"] = "#0b0f19"
            theme["text_color"] = "#f8fafc"
    if "primary_color" in custom_opts and custom_opts["primary_color"]:
        theme["primary_color"] = custom_opts["primary_color"]
    if "accent_color" in custom_opts and custom_opts["accent_color"]:
        theme["accent_color"] = custom_opts["accent_color"]

    # Active section toggles from wizard
    sections_enabled = custom_opts.get("sections", {
        "hero": True,
        "features": True,
        "speakers": True,
        "pricing": True,
        "gallery": True,
        "faq": True,
        "contact": True,
        "footer": True
    })

    # Custom hero options
    hero_eyebrow = custom_opts.get("hero_eyebrow") or "Research. Exchange. Discover."
    hero_headline = custom_opts.get("hero_headline") or site_name
    hero_sub = custom_opts.get("hero_subheadline") or tmpl["description"]
    hero_btn1 = custom_opts.get("hero_btn1") or "Register Now"
    hero_btn2 = custom_opts.get("hero_btn2") or "Explore Keynotes"
    hero_img = custom_opts.get("hero_image") or "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=80"

    # Client briefing integration
    brief = custom_opts.get("client_brief") or {}
    brief_start_date = (brief.get("start_date") or "").strip()
    brief_end_date = (brief.get("end_date") or "").strip()
    brief_venue = (brief.get("venue_format") or "").strip()
    brief_email = (brief.get("contact_email") or "").strip()

    if brief_start_date and brief_end_date:
        event_date_val = f"{brief_start_date} – {brief_end_date}"
    elif brief_start_date:
        event_date_val = brief_start_date
    elif brief_end_date:
        event_date_val = brief_end_date
    else:
        event_date_val = custom_opts.get("event_date") or "October 14–18, 2026"

    event_location_val = brief_venue or custom_opts.get("event_location") or "Boston Convention Center, MA"
    event_format_val = custom_opts.get("event_format") or brief.get("event_format") or brief.get("venue_format") or "Format to be announced"
    hero_layout = custom_opts.get("hero_layout_variant") or ("conference_program" if brief else tmpl.get("layout", "split"))

    nav_brand = custom_opts.get("nav_brand") or site_name
    nav_cta = custom_opts.get("nav_cta") or "Register Now"

    # Assemble sections
    components = []

    # 1. Navbar
    nav_links = [
        {"label": "About", "url": "#features"},
        {"label": "Speakers", "url": "#speakers"},
        {"label": "Pricing", "url": "#pricing"},
        {"label": "FAQ", "url": "#faq"},
        {"label": "Contact", "url": "#contact"}
    ]
    components.append({
        "id": "comp_navbar_1",
        "type": "navbar",
        "title": "Navigation Bar",
        "data": {
            "brand_name": nav_brand,
            "logo_url": "",
            "links": nav_links,
            "cta_label": nav_cta,
            "cta_link": "#pricing"
        }
    })

    # 2. Hero
    if sections_enabled.get("hero", True):
        components.append({
            "id": "comp_hero_1",
            "type": "hero",
            "title": "Hero Header",
            "data": {
                "layout_variant": hero_layout,
                "eyebrow": hero_eyebrow,
                "headline": hero_headline,
                "subheadline": hero_sub,
                "primary_btn_text": hero_btn1,
                "primary_btn_url": "#pricing",
                "secondary_btn_text": hero_btn2,
                "secondary_btn_url": "#features",
                "hero_image": hero_img,
                "event_date": event_date_val,
                "event_location": event_location_val,
                "event_format": event_format_val
            }
        })

    # 3. Features
    if sections_enabled.get("features", True):
        components.append({
            "id": "comp_features_1",
            "type": "features",
            "title": "Information & Highlights",
            "data": {
                "section_tag": "KEY FOCUS",
                "section_title": "Why Attend This Symposium?",
                "section_subtitle": "Designed by researchers for researchers to accelerate scientific outreach.",
                "items": [
                    {
                        "icon": "fa-solid fa-microscope",
                        "title": "Cutting-Edge Research",
                        "description": "Explore high-impact findings, peer-reviewed data, and novel methodologies."
                    },
                    {
                        "icon": "fa-solid fa-dna",
                        "title": "Precision Genetics & Biomarkers",
                        "description": "Connect directly with laboratory directors, grant recipients, and lead authors."
                    },
                    {
                        "icon": "fa-solid fa-chart-line",
                        "title": "Accelerated Collaboration & Data",
                        "description": "Establish partnerships, co-author publications, and share verified datasets."
                    }
                ]
            }
        })

    # 4. Speakers
    if sections_enabled.get("speakers", True):
        components.append({
            "id": "comp_speakers_1",
            "type": "speakers",
            "title": "Distinguished Speakers",
            "data": {
                "section_tag": "KEYNOTE FACULTY",
                "section_title": "Featured Faculty & Panelists",
                "section_subtitle": "Leading minds presenting revolutionary scientific insights.",
                "speakers": [
                    {
                        "name": "Dr. Elena Rostova",
                        "role": "Chief Scientist & Chair",
                        "affiliation": "Oxford Genomic Technologies",
                        "photo": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80",
                        "bio": "Pioneering novel transcriptomic sequencing and precision therapies."
                    },
                    {
                        "name": "Prof. Marcus Vance",
                        "role": "Director of Molecular Biology",
                        "affiliation": "Stanford Research Institute",
                        "photo": "https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=600&q=80",
                        "bio": "Principal Investigator on ongoing NIH-funded translational research."
                    },
                    {
                        "name": "Dr. Sarah Al-Mansoor",
                        "role": "Head of Computational Medicine",
                        "affiliation": "Karolinska Institute",
                        "photo": "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=600&q=80",
                        "bio": "Specializing in large-scale machine learning for genomic discovery."
                    }
                ]
            }
        })

    # 5. Pricing
    if sections_enabled.get("pricing", True):
        components.append({
            "id": "comp_pricing_1",
            "type": "pricing",
            "title": "Registration Passes",
            "data": {
                "section_tag": "RESERVE PASS",
                "section_title": "Registration & Access Passes",
                "section_subtitle": "Select the registration option that best suits your team or laboratory.",
                "tiers": [
                    {
                        "name": "Academic / Student",
                        "price": "$149",
                        "period": "one-time",
                        "featured": False,
                        "description": "For PhD students and postdoctoral fellows.",
                        "features": [
                            "Full 3-Day Keynote Access",
                            "Poster Session Entry",
                            "Coffee & Networking Breaks",
                            "Certificate of Attendance"
                        ],
                        "btn_label": "Select Pass",
                        "btn_url": "#contact"
                    },
                    {
                        "name": "Standard Researcher",
                        "price": "$349",
                        "period": "one-time",
                        "featured": True,
                        "badge": "MOST POPULAR",
                        "description": "Comprehensive access for PIs and industry specialists.",
                        "features": [
                            "All Academic Access Included",
                            "Exclusive Workshop Roundtables",
                            "Evening Gala Dinner",
                            "Complete Dataset Archives",
                            "1-on-1 Speaker Booking"
                        ],
                        "btn_label": "Select Pass",
                        "btn_url": "#contact"
                    },
                    {
                        "name": "Institutional VIP",
                        "price": "$799",
                        "period": "one-time",
                        "featured": False,
                        "description": "Full access for department chairs and lab heads.",
                        "features": [
                            "VIP Front-Row Seating",
                            "Private PI Breakfast Lounge",
                            "Permanent Video On-Demand Access",
                            "Company / Lab Program Logo"
                        ],
                        "btn_label": "Select VIP Pass",
                        "btn_url": "#contact"
                    }
                ]
            }
        })

    # 6. Gallery
    if sections_enabled.get("gallery", True):
        components.append({
            "id": "comp_gallery_1",
            "type": "gallery",
            "title": "Photo Gallery",
            "data": {
                "section_tag": "VENUE & SESSIONS",
                "section_title": "Event Venue & Facilities",
                "section_subtitle": "Auditoriums, breakout zones, and scientific discussions.",
                "images": [
                    {
                        "url": "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80",
                        "caption": "Grand Keynote Auditorium"
                    },
                    {
                        "url": "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80",
                        "caption": "Collaborative Networking Space"
                    },
                    {
                        "url": "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80",
                        "caption": "Interactive Poster Presentations"
                    }
                ]
            }
        })

    # 7. FAQ
    if sections_enabled.get("faq", True):
        components.append({
            "id": "comp_faq_1",
            "type": "faq",
            "title": "Frequently Asked Questions",
            "data": {
                "section_tag": "FAQ",
                "section_title": "Frequently Asked Questions",
                "section_subtitle": "Key logistics, registration, and abstract submission details.",
                "faqs": [
                    {
                        "q": "How can our laboratory register as a group?",
                        "a": "Laboratories registering 3 or more members automatically receive an institutional discount. Contact us for invoice details."
                    },
                    {
                        "q": "Are poster abstracts published in the proceedings?",
                        "a": "Yes, all accepted poster abstracts are compiled into the digital symposium proceedings with assigned DOIs."
                    },
                    {
                        "q": "Will recorded sessions be available after the summit?",
                        "a": "Attendees with Standard or VIP passes receive permanent access to digital presentation recordings."
                    }
                ]
            }
        })

    # 8. Contact
    if sections_enabled.get("contact", True):
        components.append({
            "id": "comp_contact_1",
            "type": "contact",
            "title": "Contact & Inquiries",
            "data": {
                "section_tag": "INQUIRIES",
                "section_title": "Get in Touch with Organizers",
                "section_subtitle": "Have questions about participation or sponsorship? Send a message below.",
                "email": brief_email or "inquiries@sciprospect.internal",
                "phone": "+1 (800) 555-0199",
                "address": brief_venue or "Convention Center & Innovation Complex",
                "form_button_label": "Submit Registration Inquiry"
            }
        })

    # 9. Footer
    components.append({
        "id": "comp_footer_1",
        "type": "footer",
        "title": "Footer",
        "data": {
            "brand_name": nav_brand,
            "tagline": "Accelerating global scientific research and collaborative discovery.",
            "copyright": f"© {datetime.now().year} {site_name}. All rights reserved.",
            "links": [
                {"label": "Privacy Policy", "url": "#"},
                {"label": "Terms of Service", "url": "#"},
                {"label": "Code of Conduct", "url": "#"}
            ]
        }
    })

    # Each starter has its own section hierarchy, not only a different palette.
    orders = {
        "summit": ["navbar", "hero", "features", "speakers", "pricing", "gallery", "faq", "contact", "footer"],
        "academic": ["navbar", "hero", "features", "speakers", "faq", "pricing", "contact", "footer"],
        "spotlight": ["navbar", "hero", "speakers", "gallery", "features", "pricing", "contact", "footer"],
        "future": ["navbar", "hero", "features", "gallery", "speakers", "pricing", "faq", "contact", "footer"],
        "editorial": ["navbar", "hero", "features", "gallery", "speakers", "contact", "footer"],
        "compact": ["navbar", "hero", "pricing", "faq", "contact", "footer"],
    }
    order = orders.get(tmpl["id"], orders["summit"])
    if "sections" not in custom_opts:
        components = [component for component in components if component["type"] in order]
    components.sort(key=lambda component: order.index(component["type"]) if component["type"] in order else len(order)-1)
    return components, theme


class WebsiteBuilderEngine:
    """Manages websites. PostgreSQL (`websites` table) is the only store: one row
    per site, with pages, sections, theme and SEO kept in the `document` column."""

    ADMIN_EMAILS = ("root@sciprospect.internal", "admin")
    VERSIONS_KEPT = 50

    @staticmethod
    def _document(site: dict) -> dict:
        """The stored JSON document: everything except columns and derived values."""
        return {k: v for k, v in site.items() if k not in ("compiled_html", "url")}

    @staticmethod
    def _from_row(row) -> dict:
        site_id, owner, slug, domain, status, conference_id, document, created_at, updated_at = row
        site = dict(document or {})
        site.update({
            "site_id": site_id, "user_email": owner, "slug": slug, "custom_domain": domain or "",
            "status": status or "draft", "conference_id": conference_id or None,
            "created_at": created_at.isoformat() if created_at else site.get("created_at", ""),
            "updated_at": updated_at.isoformat() if updated_at else site.get("updated_at", ""),
            "url": f"/sites/{slug}",
        })
        site.setdefault("client_brief", {})
        return site

    _SELECT = ("SELECT site_id, owner_email, slug, custom_domain, status, conference_id, document, "
               "created_at, updated_at FROM websites")

    def list_templates(self) -> List[dict]:
        """Returns the curated starter templates plus templates the root admin imported."""
        import db
        if not db.is_configured():
            return TEMPLATES_CATALOG
        import design_library
        return TEMPLATES_CATALOG + design_library.templates_for_gallery()

    def list_sites(self, user_email: str, conference_id: Optional[str] = None) -> List[dict]:
        """Lists the user's websites (all websites for the root admin), newest first."""
        email = (user_email or "").strip().lower()
        conf = (conference_id or "").strip()
        where, params = [], []
        if email not in self.ADMIN_EMAILS:
            where.append("lower(owner_email) = %s")
            params.append(email)
        if conf and conf != "all":
            where.append("conference_id = %s")
            params.append(conf)
        sql = ("SELECT site_id, owner_email, document->>'name', slug, custom_domain, status, created_at, updated_at, conference_id "
               "FROM websites" + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY updated_at DESC")
        with db.transaction() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
        return [{
            "site_id": r[0], "user_email": r[1], "name": r[2] or "", "slug": r[3], "custom_domain": r[4] or "",
            "status": r[5] or "draft", "created_at": r[6].isoformat() if r[6] else "", "updated_at": r[7].isoformat() if r[7] else "",
            "conference_id": r[8] or None, "url": f"/sites/{r[3]}",
        } for r in rows]

    def create_site(
        self,
        user_email: str,
        name: str,
        slug: Optional[str] = None,
        template_id: Optional[str] = "genomics",
        theme_config: Optional[dict] = None,
        custom_options: Optional[dict] = None,
        conference_id: Optional[str] = None,
        initial_components: Optional[list] = None
    ) -> dict:
        """Creates a new website from the chosen template and wizard options."""
        clean_name = (name or "My Website").strip()
        site_id = f"site_{uuid.uuid4().hex[:8]}"
        base_slug = re.sub(r'[^a-z0-9]+', '-', (slug or clean_name).lower()).strip('-') or f"site-{int(time.time())}"
        new_slug = f"{base_slug}-{uuid.uuid4().hex[:4]}"

        now_str = datetime.now().isoformat()
        components, t_theme = build_template_components(template_id or "genomics", clean_name, custom_options)
        if template_id == "blank":
            components = []
        if initial_components is not None:
            components = initial_components
        if theme_config:
            t_theme.update(theme_config)

        site_data = {
            "site_id": site_id,
            "conference_id": (conference_id.strip() if isinstance(conference_id, str) and conference_id.strip() else None),
            "user_email": user_email.strip().lower(),
            "name": clean_name,
            "slug": new_slug,
            "custom_domain": "",
            "status": "draft",
            "template_id": template_id,
            "theme_config": t_theme,
            "schema_json": components,
            "created_at": now_str,
            "updated_at": now_str,
            "client_brief": (custom_options.get("client_brief") or {}) if custom_options else {},
        }
        if str(template_id or "").startswith("lib-") and initial_components is None:
            import design_library
            found = design_library.template_site(template_id, new_slug)
            if found:  # multi-page imported template: every page, home first
                site_data.update(pages=found[0], active_page_id=found[0][0]["id"], schema_json=found[0][0]["schema_json"])

        with db.transaction() as cur:
            cur.execute(
                "INSERT INTO websites (site_id, owner_email, slug, custom_domain, status, conference_id, document) "
                "VALUES (%s, %s, %s, '', 'draft', %s, %s)",
                (site_id, site_data["user_email"], new_slug, site_data["conference_id"], Json(self._document(site_data))),
            )
        site_data["url"] = f"/sites/{new_slug}"
        return site_data

    def get_site(self, site_id: str) -> Optional[dict]:
        """Gets a website (all pages, sections and settings) by id."""
        with db.transaction() as cur:
            cur.execute(self._SELECT + " WHERE site_id = %s", ((site_id or "").strip(),))
            row = cur.fetchone()
        return self._from_row(row) if row else None

    def update_site(self, site_id: str, payload: dict) -> Tuple[bool, str, Optional[dict]]:
        """Updates a website, keeps the previous version, and recompiles its HTML."""
        site = self.get_site(site_id)
        if not site:
            return False, "Site not found", None
        previous = self._document(site)

        if "name" in payload and payload["name"]:
            site["name"] = payload["name"].strip()
        if "slug" in payload and payload["slug"]:
            site["slug"] = re.sub(r'[^a-z0-9\-]+', '-', payload["slug"].lower().strip()).strip('-')
        if "custom_domain" in payload:
            site["custom_domain"] = (payload["custom_domain"] or "").strip().lower()
        if "status" in payload:
            site["status"] = payload["status"]
        if "theme_config" in payload:
            site["theme_config"] = payload["theme_config"]
        if "schema_json" in payload:
            site["schema_json"] = payload["schema_json"]
        if "conference_id" in payload:
            raw_conf = payload["conference_id"]
            site["conference_id"] = (raw_conf.strip() if isinstance(raw_conf, str) and raw_conf.strip() else None)
        for meta_k in ("meta_config", "meta_title", "meta_description", "meta_keywords",
                       "og_image", "ga_tracking_id", "custom_head_code", "custom_body_code",
                       "pages", "active_page_id"):
            if meta_k in payload:
                site[meta_k] = payload[meta_k]

        site["updated_at"] = datetime.now().isoformat()

        try:
            with db.transaction() as cur:
                cur.execute("INSERT INTO website_versions (site_id, document) VALUES (%s, %s)", (site_id, Json(previous)))
                cur.execute(
                    "DELETE FROM website_versions WHERE site_id = %s AND id NOT IN "
                    "(SELECT id FROM website_versions WHERE site_id = %s ORDER BY id DESC LIMIT %s)",
                    (site_id, site_id, self.VERSIONS_KEPT),
                )
                cur.execute(
                    "UPDATE websites SET slug = %s, custom_domain = %s, status = %s, conference_id = %s, "
                    "document = %s, updated_at = now() WHERE site_id = %s",
                    (site["slug"], site.get("custom_domain", ""), site.get("status", "draft"), site.get("conference_id"),
                     Json(self._document(site)), site_id),
                )
        except psycopg2.errors.UniqueViolation:
            return False, "That web address or domain is already used by another website.", None

        site["url"] = f"/sites/{site['slug']}"
        return True, "Site saved successfully.", site

    def delete_site(self, site_id: str) -> Tuple[bool, str]:
        """Deletes a website, its versions and its media records (uploaded files too)."""
        clean_id = (site_id or "").strip()
        with db.transaction() as cur:
            cur.execute("DELETE FROM websites WHERE site_id = %s", (clean_id,))
        media_dir = get_websites_dir() / "media" / clean_id
        if re.fullmatch(r"site_[a-f0-9]{8}", clean_id) and media_dir.is_dir():
            import shutil
            shutil.rmtree(media_dir, ignore_errors=True)
        return True, f"Website {clean_id} deleted."

    def get_site_by_slug(self, slug: str) -> Optional[dict]:
        """Fetches a website by its public address."""
        with db.transaction() as cur:
            cur.execute(self._SELECT + " WHERE lower(slug) = %s", ((slug or "").strip().lower(),))
            row = cur.fetchone()
        return self._from_row(row) if row else None

    def record_media(self, site_id: str, media_id: str, mime: str, size_bytes: int) -> None:
        """Records an uploaded image (the file itself stays in server storage)."""
        with db.transaction() as cur:
            cur.execute(
                "INSERT INTO media (id, site_id, mime, size_bytes) VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
                (media_id, site_id, mime, size_bytes),
            )

    def export_site_zip(self, site_id: str) -> Tuple[Optional[bytes], str]:
        from react_export import export_zip
        site = self.get_site(site_id)
        if not site:
            return None, "Site not found"
        return export_zip(site, get_websites_dir() / "media" / site_id)



class _LazyEngine:
    """Creates the engine on first use so importing this module never connects to the database."""
    def __init__(self, factory):
        self._factory, self._instance = factory, None

    def __getattr__(self, name):
        if self._instance is None:
            self._instance = self._factory()
        return getattr(self._instance, name)


builder_engine = _LazyEngine(WebsiteBuilderEngine)
