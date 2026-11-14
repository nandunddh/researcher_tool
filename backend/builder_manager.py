"""
builder_manager.py
==================
Website Builder Core Engine for SciProspect.
Supports multiple dynamic websites with six distinct starter templates,
customized details (Navbar, Hero, Theme modes: Dark / Light / Obsidian, Active Sections),
PostgreSQL cloud storage + local storage, standalone ZIP export, and public live URLs.
"""

import os
import json
import uuid
import re
import io
import zipfile
from html import escape as escape_html
from studio_formatting import apply_component_formatting, contrast_color
from studio_blocks import render_native_blocks, native_runtime
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import psycopg2
from app_config import get_data_dir

# Oracle PostgreSQL Cloud Config
PG_CONFIG = {
    "host": os.environ.get("SCIPROSPECT_DB_HOST", ""),
    "port": int(os.environ.get("SCIPROSPECT_DB_PORT", "5432")),
    "dbname": os.environ.get("SCIPROSPECT_DB_NAME", "sciprospect_db"),
    "user": os.environ.get("SCIPROSPECT_DB_USER", ""),
    "password": os.environ.get("SCIPROSPECT_DB_PASSWORD", ""),
    "connect_timeout": 3,
}

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


# -----------------------------------------------------------------------------
# Standalone HTML Compiler (Supporting Dark, Pitch Obsidian, and Clean Light)
# -----------------------------------------------------------------------------

def compile_website_html(site_data: dict, page_id=None) -> Tuple[str, str]:
    """
    Compiles the dynamic component tree into pure, standalone production-ready HTML and CSS.
    Handles Light Mode, Dark Mode, Pitch Obsidian modes, multi-page routing, SEO meta tags, and GA analytics.
    Returns (html_content, css_content).
    """
    site_name = site_data.get("name", "Website")
    meta_cfg = site_data.get("meta_config") or {}
    pages = site_data.get("pages") or []

    target_page = None
    if pages and isinstance(pages, list):
        if page_id:
            clean_pid = page_id.strip("/").lower()
            target_page = next((p for p in pages if p.get("id") == page_id or (p.get("slug") or "").strip("/").lower() == clean_pid), None)
        if not target_page:
            active_pid = site_data.get("active_page_id")
            if active_pid:
                target_page = next((p for p in pages if p.get("id") == active_pid), None)
        if not target_page:
            target_page = next((p for p in pages if p.get("is_home")), pages[0])

    if target_page:
        components = target_page.get("schema_json", [])
        page_name = target_page.get("name") or "Home"
        is_home_page = bool(target_page.get("is_home", False) or target_page.get("slug") in ("/", "", None))
        title = target_page.get("meta_title") or meta_cfg.get("meta_title") or site_data.get("meta_title") or (site_name if is_home_page else f"{page_name} · {site_name}")
        meta_desc = target_page.get("meta_description") or meta_cfg.get("meta_description") or site_data.get("meta_description") or ""
        meta_kw = target_page.get("meta_keywords") or meta_cfg.get("meta_keywords") or site_data.get("meta_keywords") or ""
    else:
        components = site_data.get("schema_json", [])
        title = meta_cfg.get("meta_title") or site_data.get("meta_title") or site_name
        meta_desc = meta_cfg.get("meta_description") or site_data.get("meta_description") or ""
        meta_kw = meta_cfg.get("meta_keywords") or site_data.get("meta_keywords") or ""

    theme = site_data.get("theme_config", {})
    mode = theme.get("mode", "dark")
    bg_color = theme.get("bg_color", "#f8fafc" if mode == "light" else "#0b0f19")
    is_light = (mode == "light") or (contrast_color(bg_color) != '#ffffff')

    primary_color = theme.get("primary_color", "#2563eb" if is_light else "#38bdf8")
    accent_color = theme.get("accent_color", "#0284c7" if is_light else "#6366f1")
    card_bg = "#ffffff" if is_light else "#131b2e"
    card_hover = "#f1f5f9" if is_light else "#1e293b"
    preferred_text = theme.get("text_color")
    text_color = contrast_color(bg_color, preferred_text if preferred_text else ("#0f172a" if is_light else "#f8fafc"))
    text_muted = "#64748b" if is_light else "#94a3b8"
    border_glass = "rgba(0, 0, 0, 0.08)" if is_light else "rgba(255, 255, 255, 0.08)"
    border_focus = "rgba(37, 99, 235, 0.4)" if is_light else "rgba(56, 189, 248, 0.4)"
    nav_bg = "rgba(255, 255, 255, 0.92)" if is_light else "rgba(11, 15, 25, 0.88)"
    input_bg = "#ffffff" if is_light else "rgba(0, 0, 0, 0.35)"
    input_border = "#e2e8f0" if is_light else "rgba(255, 255, 255, 0.12)"
    input_color = "#0f172a" if is_light else "#fff"
    font_family = theme.get("font_family", "'Outfit', 'Inter', sans-serif")

    if isinstance(components, str):
        try:
            components = json.loads(components)
        except Exception:
            components = []

    css = f"""
/* Standalone Compiled CSS - {title} */
:root {{
  --primary: {primary_color};
  --accent: {accent_color};
  --bg-dark: {bg_color};
  --bg-card: {card_bg};
  --bg-card-hover: {card_hover};
  --text-main: {text_color};
  --text-muted: {text_muted};
  --border-glass: {border_glass};
  --border-focus: {border_focus};
}}

* {{
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}}

html {{
  scroll-behavior: smooth;
}}

body {{
  background-color: var(--bg-dark);
  color: var(--text-main);
  font-family: {font_family};
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}}

a {{
  color: inherit;
  text-decoration: none;
}}

.site-container {{
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
}}

.section-tag {{
  display: inline-block;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--primary);
  background: {'rgba(37, 99, 235, 0.08)' if is_light else 'rgba(56, 189, 248, 0.1)'};
  padding: 0.35rem 0.85rem;
  border-radius: 9999px;
  border: 1px solid {'rgba(37, 99, 235, 0.2)' if is_light else 'rgba(56, 189, 248, 0.25)'};
  margin-bottom: 0.85rem;
}}

.section-heading {{
  font-size: 2.25rem;
  font-weight: 800;
  letter-spacing: -0.5px;
  margin-bottom: 0.75rem;
}}

.section-subheading {{
  font-size: 1.05rem;
  color: var(--text-muted);
  max-width: 680px;
  margin: 0 auto 3rem auto;
}}

.text-center {{
  text-align: center;
}}

.site-section {{
  padding: 5rem 0;
}}

/* Navbar */
.site-navbar {{
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: {nav_bg};
  border-bottom: 1px solid var(--border-glass);
}}
.nav-inner {{
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 72px;
  flex-wrap: wrap;
  gap: 16px;
  padding-top: 12px;
  padding-bottom: 12px;
}}
.nav-brand {{
  font-size: 1.35rem;
  font-weight: 800;
  color: {'#0f172a' if is_light else '#fff'};
}}
.nav-links {{
  display: flex;
  flex-wrap: wrap;
  gap: 1.75rem;
  align-items: center;
}}
.nav-link {{
  font-size: 0.92rem;
  font-weight: 500;
  color: {'#334155' if is_light else '#cbd5e1'};
  transition: color 0.2s;
}}
.studio-auto-contrast .nav-link,.studio-auto-contrast .nav-brand {{ color:var(--text-main); }}
.nav-link:hover {{
  color: var(--primary);
}}
.btn-nav {{
  background: linear-gradient(135deg, var(--accent), var(--primary));
  color: #fff !important;
  font-weight: 700;
  padding: 0.6rem 1.25rem;
  border-radius: 8px;
  font-size: 0.9rem;
  transition: transform 0.2s, box-shadow 0.2s;
}}
.btn-nav:hover {{
  transform: translateY(-1px);
  box-shadow: 0 4px 18px rgba(56, 189, 248, 0.35);
}}

/* Hero Section */
.hero-wrap {{
  padding: 6rem 0 5rem 0;
  position: relative;
}}
.hero-content {{
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 3.5rem;
  align-items: center;
}}
.hero-headline {{
  font-size: 3.25rem;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -1px;
  margin: 1rem 0 1.25rem 0;
  color: var(--text-main);
}}
.hero-subhead {{
  font-size: 1.15rem;
  color: var(--text-muted);
  line-height: 1.6;
  margin-bottom: 2rem;
}}
.hero-actions {{
  display: flex;
  gap: 1rem;
}}
.btn-primary {{
  background: var(--primary);
  color: #fff;
  padding: 0.85rem 1.85rem;
  border-radius: 10px;
  font-weight: 700;
  font-size: 1rem;
  transition: all 0.25s;
  box-shadow: 0 4px 16px rgba(56, 189, 248, 0.28);
}}
.btn-primary.btn-gradient {{
  background: linear-gradient(135deg, var(--accent), var(--primary));
}}
.btn-primary:hover {{
  transform: translateY(-2px);
  box-shadow: 0 8px 26px rgba(56, 189, 248, 0.45);
}}
.btn-secondary {{
  background: {'#f1f5f9' if is_light else 'rgba(255, 255, 255, 0.05)'};
  border: 1px solid var(--border-glass);
  color: {'#0f172a' if is_light else '#fff'};
  padding: 0.85rem 1.85rem;
  border-radius: 10px;
  font-weight: 600;
  font-size: 1rem;
  transition: all 0.25s;
}}
.btn-secondary:hover {{
  background: {'#e2e8f0' if is_light else 'rgba(255, 255, 255, 0.1)'};
}}
.hero-img-box {{
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 20px 45px rgba(0, 0, 0, {'0.15' if is_light else '0.6'});
  border: 1px solid var(--border-glass);
}}
.hero-img-box img {{
  width: 100%;
  height: auto;
  display: block;
}}

/* Conference Program Hero Layout */
.hero-program-wrap {{
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 3.5rem;
  align-items: center;
}}
.hero-program-content {{
  display: flex;
  flex-direction: column;
}}
.hero-program-card {{
  background: var(--bg-card);
  border: 1px solid var(--border-glass);
  border-radius: 18px;
  padding: 2.25rem;
  box-shadow: 0 20px 45px rgba(0, 0, 0, {'0.08' if is_light else '0.45'});
  position: relative;
  overflow: hidden;
}}
.hero-program-card::before {{
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--primary), var(--accent));
}}
.program-card-header {{
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}}
.program-card-title {{
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}}
.program-card-badge {{
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
  background: {'rgba(37, 99, 235, 0.08)' if is_light else 'rgba(56, 189, 248, 0.12)'};
  color: var(--primary);
  border: 1px solid {'rgba(37, 99, 235, 0.2)' if is_light else 'rgba(56, 189, 248, 0.25)'};
}}
.program-meta-list {{
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin-bottom: 2rem;
}}
.program-meta-item {{
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}}
.program-meta-icon {{
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: {'rgba(37, 99, 235, 0.08)' if is_light else 'rgba(56, 189, 248, 0.12)'};
  border: 1px solid var(--border-glass);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
  font-size: 1.1rem;
  flex-shrink: 0;
}}
.program-meta-details {{
  display: flex;
  flex-direction: column;
}}
.program-meta-label {{
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-muted);
  font-weight: 600;
  margin-bottom: 0.2rem;
}}
.program-meta-val {{
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.4;
}}
.btn-program-reg {{
  display: block;
  text-align: center;
  width: 100%;
  padding: 0.95rem 1.5rem;
  font-size: 1.05rem;
  font-weight: 700;
  border-radius: 10px;
  box-sizing: border-box;
}}

/* Features Grid */
.features-grid {{
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 2rem;
}}
.feature-card {{
  background: var(--bg-card);
  border: 1px solid var(--border-glass);
  border-radius: 14px;
  padding: 2.25rem;
  transition: all 0.25s;
  box-shadow: 0 4px 15px rgba(0,0,0,{'0.04' if is_light else '0.3'});
}}
.feature-card:hover {{
  transform: translateY(-4px);
  border-color: var(--border-focus);
}}
.feature-icon {{
  font-size: 2.2rem;
  margin-bottom: 1.25rem;
}}
.feature-title {{
  font-size: 1.3rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
}}
.feature-desc {{
  color: var(--text-muted);
  font-size: 0.95rem;
}}

/* Speakers Grid */
.speakers-grid {{
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 2rem;
}}
.speaker-card {{
  background: var(--bg-card);
  border: 1px solid var(--border-glass);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.25s;
  box-shadow: 0 4px 15px rgba(0,0,0,{'0.04' if is_light else '0.3'});
}}
.speaker-card:hover {{
  transform: translateY(-4px);
  border-color: var(--border-focus);
}}
.speaker-photo {{
  width: 100%;
  height: 260px;
  object-fit: cover;
  display: block;
}}
.speaker-body {{
  padding: 1.5rem;
}}
.speaker-name {{
  font-size: 1.15rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}}
.speaker-role {{
  font-size: 0.85rem;
  color: var(--primary);
  font-weight: 600;
  margin-bottom: 0.35rem;
}}
.speaker-affil {{
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-bottom: 0.85rem;
}}
.speaker-bio {{
  font-size: 0.85rem;
  color: {'#475569' if is_light else '#cbd5e1'};
  line-height: 1.5;
}}

/* Pricing */
.pricing-grid {{
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
  gap: 2rem;
  align-items: stretch;
}}
.pricing-card {{
  background: var(--bg-card);
  border: 1px solid var(--border-glass);
  border-radius: 18px;
  padding: 2.5rem 2rem;
  display: flex;
  flex-direction: column;
  position: relative;
  transition: all 0.25s;
  box-shadow: 0 4px 15px rgba(0,0,0,{'0.04' if is_light else '0.3'});
}}
.pricing-card.featured {{
  border-color: var(--primary);
  background: {'linear-gradient(180deg, rgba(37,99,235,0.04) 0%, #ffffff 100%)' if is_light else 'linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, var(--bg-card) 100%)'};
  transform: scale(1.03);
}}
.pricing-badge {{
  position: absolute;
  top: -12px;
  right: 24px;
  background: linear-gradient(135deg, var(--accent), var(--primary));
  color: #fff;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 1px;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
}}
.tier-name {{
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}}
.tier-price {{
  font-size: 2.75rem;
  font-weight: 800;
  margin-bottom: 0.5rem;
}}
.tier-desc {{
  font-size: 0.88rem;
  color: var(--text-muted);
  margin-bottom: 1.75rem;
}}
.tier-features {{
  list-style: none;
  margin-bottom: 2rem;
  flex-grow: 1;
}}
.tier-features li {{
  font-size: 0.9rem;
  color: {'#334155' if is_light else '#cbd5e1'};
  margin-bottom: 0.65rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}}
.tier-features li::before {{
  content: "✓";
  color: var(--primary);
  font-weight: 900;
}}
.pricing-btn {{
  width: 100%;
  text-align: center;
  padding: 0.85rem 1rem;
  border-radius: 10px;
  font-weight: 700;
  background: {'#f1f5f9' if is_light else 'rgba(255, 255, 255, 0.08)'};
  border: 1px solid var(--border-glass);
  color: {'#0f172a' if is_light else '#fff'};
  transition: all 0.2s;
}}
.pricing-card.featured .pricing-btn {{
  background: linear-gradient(135deg, var(--accent), var(--primary));
  color: #fff;
  border: none;
}}
.pricing-btn:hover {{
  opacity: 0.95;
  transform: translateY(-2px);
}}

/* Gallery */
.gallery-grid {{
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
}}
.gallery-item {{
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--border-glass);
  position: relative;
}}
.gallery-item img {{
  width: 100%;
  height: 250px;
  object-fit: cover;
  display: block;
  transition: transform 0.3s;
}}
.gallery-item:hover img {{
  transform: scale(1.04);
}}
.gallery-caption {{
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0.85rem 1.25rem;
  background: linear-gradient(0deg, rgba(0,0,0,0.85) 0%, transparent 100%);
  font-size: 0.85rem;
  font-weight: 600;
  color: #fff;
}}

/* FAQ */
.faq-wrap {{
  max-width: 800px;
  margin: 0 auto;
}}
.faq-card {{
  background: var(--bg-card);
  border: 1px solid var(--border-glass);
  border-radius: 12px;
  margin-bottom: 1rem;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0,0,0,{'0.03' if is_light else '0.2'});
}}
.faq-question {{
  padding: 1.25rem 1.5rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}}
.faq-question:hover {{
  color: var(--primary);
}}
.faq-answer {{
  padding: 0 1.5rem 1.25rem 1.5rem;
  color: var(--text-muted);
  font-size: 0.95rem;
  line-height: 1.6;
}}

/* Contact Form */
.contact-wrap {{
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 3rem;
  background: var(--bg-card);
  border: 1px solid var(--border-glass);
  border-radius: 20px;
  padding: 3rem;
  box-shadow: 0 6px 25px rgba(0,0,0,{'0.06' if is_light else '0.4'});
}}
.contact-form {{
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}}
.form-input {{
  background: {input_bg};
  border: 1px solid {input_border};
  color: {input_color};
  padding: 0.85rem 1rem;
  border-radius: 8px;
  font-family: inherit;
  font-size: 0.95rem;
  outline: none;
}}
.form-input:focus {{
  border-color: var(--primary);
}}
textarea.form-input {{
  min-height: 110px;
  resize: vertical;
}}

/* Footer */
.site-footer {{
  border-top: 1px solid var(--border-glass);
  padding: 3rem 0;
  margin-top: 5rem;
  background: {'#f1f5f9' if is_light else 'rgba(0, 0, 0, 0.4)'};
}}
.footer-inner {{
  display: flex;
  justify-content: space-between;
  align-items: center;
}}
.footer-links {{
  display: flex;
  gap: 1.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}}
.footer-links a:hover {{
  color: var(--primary);
}}

/* Responsive Breakpoints */
@media (max-width: 900px) {{
  .hero-content, .hero-program-wrap {{
    grid-template-columns: 1fr;
    text-align: center;
    gap: 2.5rem;
  }}
  .hero-program-content {{
    align-items: center;
  }}
  .hero-program-card {{
    text-align: left;
    width: 100%;
    padding: 1.75rem 1.25rem;
  }}
  .hero-actions {{
    justify-content: center;
  }}
  .hero-headline {{
    font-size: 2.4rem;
  }}
  .contact-wrap {{
    grid-template-columns: 1fr;
  }}
  .footer-inner {{
    flex-direction: column;
    gap: 1.5rem;
    text-align: center;
  }}
}}
"""

    css += """
.hero-design-centered .hero-content,.hero-design-image_top .hero-content,.hero-design-text_only .hero-content { display:flex;flex-direction:column;text-align:center; }
.hero-design-centered .hero-actions,.hero-design-image_top .hero-actions,.hero-design-text_only .hero-actions { justify-content:center; }
.hero-design-image_left .hero-img-box { order:-1; }
.hero-design-image_top .hero-img-box { order:-1;width:100%; }
.hero-design-text_only .hero-img-box { display:none; }
.hero-design-text_only .hero-content { max-width:920px; }
"""
    css += """
.studio-content-section { padding:48px 28px; color:var(--section-ink); }
.studio-content-section > h2 { font-size:30px; line-height:1.2; margin:0 0 12px; color:var(--section-ink); }
.studio-content-section p { color:var(--section-muted); line-height:1.7; white-space:pre-line; overflow-wrap:anywhere; }
.studio-content-items { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr)); gap:20px; margin-top:28px; }
.studio-content-items article { background:var(--section-card); padding:24px; border-radius:14px; min-width:0; }
.studio-content-items h3 { color:var(--section-ink); font-size:19px; margin:0 0 10px; overflow-wrap:anywhere; }
.studio-content-items img { display:block; max-width:100%; height:140px; object-fit:contain; margin:0 auto 18px; border-radius:8px; }
.studio-content-section.design-list .studio-content-items { grid-template-columns:1fr; }
.studio-content-section.design-list article { background:transparent; border-bottom:1px solid #94a3b844; border-radius:0; padding:20px 0; }
.studio-content-section.design-spotlight { text-align:center; }
.studio-content-section.design-spotlight .studio-content-items { grid-template-columns:1fr; max-width:780px; margin:28px auto 0; }
.studio-content-section.design-spotlight article { padding:36px; }
@media(max-width:600px) { .studio-content-section { padding:32px 18px; } .studio-content-section > h2 { font-size:25px; } }
"""
    css += """
.studio-auto-contrast > nav,.studio-auto-contrast > header,.studio-auto-contrast > section,.studio-auto-contrast > footer { background:transparent!important; }
.studio-auto-contrast h1,.studio-auto-contrast h2,.studio-auto-contrast h3,.studio-auto-contrast h4 { color:var(--text-main)!important; -webkit-text-fill-color:var(--text-main); }
.studio-auto-contrast p { color:var(--text-muted)!important; }
"""
    body_html_parts = []

    for comp in components:
        if comp.get("hidden") is True:
            continue
        background_override = (comp.get('studio_style') or {}).get('background')
        is_light = (contrast_color(background_override) != '#ffffff') if re.fullmatch(r'#[0-9a-fA-F]{6}', str(background_override or '')) else (mode == 'light')
        part_start = len(body_html_parts)
        c_type = comp.get("type", "")
        data = comp.get("data", {})

        if c_type == 'content':
            body_html_parts.append(render_native_blocks(comp))
        elif c_type == 'image':
            image_url=str(data.get('image_url',''))
            if re.match(r'^(https?://|/(?!/)|data:image/(?:png|jpeg|webp|gif);base64,)',image_url):
                caption=escape_html(str(data.get('caption','')))
                body_html_parts.append(f'<figure style="margin:0;padding:24px"><img src="{escape_html(image_url,quote=True)}" alt="{caption}" style="display:block;width:100%;height:auto;border-radius:12px"><figcaption>{caption}</figcaption></figure>')
        elif c_type in ("about", "stats", "agenda", "sponsors", "testimonials", "announcement"):
            design = data.get("design", "grid")
            if design not in ("grid", "list", "spotlight"):
                design = "grid"
            item_html = []
            for item in data.get("items", []):
                image_url = str(item.get("image", ""))
                image = ""
                if re.match(r"^(https?://|/(?!/)|data:image/(?:png|jpeg|webp|gif);base64,)", image_url):
                    image = f'<img src="{escape_html(image_url, quote=True)}" alt="{escape_html(str(item.get("title", "")), quote=True)}" loading="lazy">'
                item_html.append(f'<article>{image}<h3>{escape_html(str(item.get("title", "")))}</h3><p>{escape_html(str(item.get("description", "")))}</p></article>')
            ink, muted, card = ("#18233b", "#64748b", "#f4f6fb") if is_light else ("#f8fafc", "#a5b4cc", "#172033")
            body_html_parts.append(f'<section class="studio-content-section design-{design}" style="--section-ink:{ink};--section-muted:{muted};--section-card:{card}"><h2>{escape_html(str(data.get("section_title", "")))}</h2><p>{escape_html(str(data.get("section_subtitle", "")))}</p><div class="studio-content-items">{"".join(item_html)}</div></section>')
        elif c_type == "custom":
            try:
                embed_height = min(2000, max(100, int(data.get("height", 300))))
            except (ValueError, TypeError):
                embed_height = 300
            body_html_parts.append(f'<iframe title="Custom section" sandbox="" srcdoc="{escape_html(str(data.get("html", "")), quote=True)}" style="display:block;width:100%;height:{embed_height}px;border:0"></iframe>')
        elif c_type == "navbar":
            variant = data.get("layout_variant", "business")
            if variant not in ("business", "portfolio", "services", "product", "editorial"):
                variant = "business"
            logo_html = ""
            logo_url = str(data.get("logo_url", ""))
            if re.match(r'^(https?://|/(?!/)|data:image/(?:png|jpeg|webp|gif);base64,)', logo_url):
                try:
                    logo_height = min(120, max(20, int(data.get("logo_height") or 40)))
                except (ValueError, TypeError):
                    logo_height = 40
                logo_alt = escape_html(str(data.get("logo_alt") or data.get("brand_name") or "Logo"), quote=True)
                logo_html = f'<img src="{escape_html(logo_url, quote=True)}" alt="{logo_alt}" style="height:{logo_height}px;width:auto;max-width:240px;object-fit:contain;">'
            brand_mode = data.get("brand_mode") or ("image" if logo_html else "text")
            brand_html = logo_html if brand_mode == "image" else escape_html(str(data.get("brand_name", title)))
            links_html = "".join([f'<a class="{"btn-nav" if l.get("style") == "button" else "nav-link"}" href="{l.get("url", "#")}">{l.get("label", "")}</a>' for l in data.get("links", [])])
            body_html_parts.append(f"""
<nav class="site-navbar library-nav-{variant}">
  <div class="site-container nav-inner">
    <a href="#" class="nav-brand" style="display:flex;align-items:center;gap:10px;">{brand_html}</a>
    <div class="nav-links">
      {links_html}
      <a href="{data.get("cta_link", data.get("cta_url", "#pricing"))}" class="btn-nav">{data.get("cta_label", "Register")}</a>
    </div>
  </div>
</nav>
""")

        elif c_type == "hero":
            variant = data.get("layout_variant") or "split"
            headline_text = data.get("headline", title)
            headline_style = ""
            if data.get("headline_gradient") is not False:
                preset = data.get("gradient_preset") or ("navy_blue" if is_light else "cyan_blue")
                if preset == "cyan_blue":
                    grad_str = "linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)"
                elif preset == "emerald_teal":
                    grad_str = "linear-gradient(135deg, #34d399 0%, #06b6d4 100%)"
                elif preset == "purple_violet":
                    grad_str = "linear-gradient(135deg, #c084fc 0%, #ec4899 100%)"
                elif preset == "sunset_amber":
                    grad_str = "linear-gradient(135deg, #fbbf24 0%, #f43f5e 100%)"
                elif preset == "navy_blue":
                    grad_str = "linear-gradient(135deg, #0f172a 0%, #2563eb 100%)"
                elif preset == "custom" and data.get("custom_grad_color1") and data.get("custom_grad_color2"):
                    grad_str = f"linear-gradient(135deg, {data.get('custom_grad_color1')} 0%, {data.get('custom_grad_color2')} 100%)"
                else:
                    grad_str = "linear-gradient(135deg, #0f172a 0%, #2563eb 100%)" if is_light else f"linear-gradient(135deg, {primary_color} 0%, #818cf8 100%)"
                headline_style = f' style="background:{grad_str};-webkit-background-clip:text;-webkit-text-fill-color:transparent;"'

            primary_btn_style = data.get("primary_btn_style")
            primary_btn_bg = data.get("primary_btn_bg")
            btn_class = "btn-primary btn-gradient" if primary_btn_style == "gradient" else "btn-primary"
            btn_custom_style = f' style="background:{primary_btn_bg};"' if (primary_btn_bg and primary_btn_style != "gradient") else ''

            if variant == "conference_program":
                event_date = data.get("event_date") or "October 14–18, 2026"
                event_location = data.get("event_location") or "Boston Convention Center, MA"
                event_format = data.get("event_format") or "Hybrid (In-Person & Live Stream)"
                reg_btn_text = data.get("primary_btn_text") or "Register for Conference"
                reg_btn_url = data.get("primary_btn_url") or "#pricing"
                sec_btn_text = data.get("secondary_btn_text") or ""
                sec_btn_url = data.get("secondary_btn_url") or "#features"

                sec_btn_html = f'<div style="margin-top: 1.5rem;"><a href="{sec_btn_url}" class="btn-secondary">{sec_btn_text}</a></div>' if sec_btn_text else ''

                body_html_parts.append(f"""
<header class="site-section hero-wrap">
  <div class="site-container hero-program-wrap">
    <div class="hero-program-content">
      <span class="section-tag">{data.get("eyebrow", "")}</span>
      <h1 class="hero-headline"{headline_style}>{headline_text}</h1>
      <p class="hero-subhead">{data.get("subheadline", "")}</p>
      {sec_btn_html}
    </div>
    <div class="hero-program-card">
      <div class="program-card-header">
        <div class="program-card-title">
          <i class="fa-solid fa-calendar-check" style="color: var(--primary);"></i>
          <span>Conference Program</span>
        </div>
        <span class="program-card-badge">Official Event</span>
      </div>
      <div class="program-meta-list">
        <div class="program-meta-item">
          <div class="program-meta-icon"><i class="fa-regular fa-calendar-days"></i></div>
          <div class="program-meta-details">
            <span class="program-meta-label">Dates & Schedule</span>
            <span class="program-meta-val">{event_date}</span>
          </div>
        </div>
        <div class="program-meta-item">
          <div class="program-meta-icon"><i class="fa-solid fa-location-dot"></i></div>
          <div class="program-meta-details">
            <span class="program-meta-label">Location & Venue</span>
            <span class="program-meta-val">{event_location}</span>
          </div>
        </div>
        <div class="program-meta-item">
          <div class="program-meta-icon"><i class="fa-solid fa-video"></i></div>
          <div class="program-meta-details">
            <span class="program-meta-label">Event Format</span>
            <span class="program-meta-val">{event_format}</span>
          </div>
        </div>
      </div>
      <a href="{reg_btn_url}" class="{btn_class} btn-program-reg"{btn_custom_style}>{reg_btn_text}</a>
    </div>
  </div>
</header>
""")
            else:
                hero_variant = data.get("layout_variant", "split")
                if hero_variant not in ("split", "centered", "image_left", "image_top", "text_only"):
                    hero_variant = "split"
                body_html_parts.append(f"""
<header class="site-section hero-wrap hero-design-{hero_variant}">
  <div class="site-container hero-content">
    <div>
      <span class="section-tag">{data.get("eyebrow", "")}</span>
      <h1 class="hero-headline"{headline_style}>{headline_text}</h1>
      <p class="hero-subhead">{data.get("subheadline", "")}</p>
      <div class="hero-actions">
        <a href="{data.get("primary_btn_url", "#pricing")}" class="{btn_class}"{btn_custom_style}>{data.get("primary_btn_text", "Get Started")}</a>
        <a href="{data.get("secondary_btn_url", "#features")}" class="btn-secondary">{data.get("secondary_btn_text", "Learn More")}</a>
      </div>
    </div>
    <div class="hero-img-box">
      <img src="{data.get("hero_image", "")}" alt="{title}" loading="lazy">
    </div>
  </div>
</header>
""")

        elif c_type == "features":
            items_html = "".join([f"""
<div class="feature-card">
  <div class="feature-icon">
    {f'<i class="{item.get("icon", "fa-solid fa-microscope")}"></i>' if "fa-" in str(item.get("icon", "")) else f'<span>{item.get("icon", "✦")}</span>'}
  </div>
  <h3 class="feature-title">{item.get("title", "")}</h3>
  <p class="feature-desc">{item.get("description", "")}</p>
</div>
""" for item in data.get("items", [])])
            body_html_parts.append(f"""
<section class="site-section" id="features">
  <div class="site-container">
    <div class="text-center">
      <span class="section-tag">{data.get("section_tag", "HIGHLIGHTS")}</span>
      <h2 class="section-heading">{data.get("section_title", "Key Highlights")}</h2>
      <p class="section-subheading">{data.get("section_subtitle", "")}</p>
    </div>
    <div class="features-grid">
      {items_html}
    </div>
  </div>
</section>
""")

        elif c_type == "speakers":
            speakers_html = "".join([f"""
<div class="speaker-card">
  <img src="{s.get("photo", "")}" alt="{s.get("name", "")}" class="speaker-photo" loading="lazy">
  <div class="speaker-body">
    <h3 class="speaker-name">{s.get("name", "")}</h3>
    <div class="speaker-role">{s.get("role", "")}</div>
    <div class="speaker-affil">{s.get("affiliation", "")}</div>
    <p class="speaker-bio">{s.get("bio", "")}</p>
  </div>
</div>
""" for s in data.get("speakers", [])])
            body_html_parts.append(f"""
<section class="site-section" id="speakers">
  <div class="site-container">
    <div class="text-center">
      <span class="section-tag">{data.get("section_tag", "KEYNOTES")}</span>
      <h2 class="section-heading">{data.get("section_title", "Featured Faculty")}</h2>
      <p class="section-subheading">{data.get("section_subtitle", "")}</p>
    </div>
    <div class="speakers-grid">
      {speakers_html}
    </div>
  </div>
</section>
""")

        elif c_type == "pricing":
            tiers_html = "".join([f"""
<div class="pricing-card {'featured' if t.get('featured') else ''}">
  {'<span class="pricing-badge">' + t.get('badge', 'FEATURED') + '</span>' if t.get('featured') else ''}
  <h3 class="tier-name">{t.get("name", "")}</h3>
  <div class="tier-price">{t.get("price", "$0")}</div>
  <p class="tier-desc">{t.get("description", "")}</p>
  <ul class="tier-features">
    {''.join([f'<li>{f}</li>' for f in t.get("features", [])])}
  </ul>
  <a href="{t.get("btn_url", "#contact")}" class="pricing-btn">{t.get("btn_label", "Select Plan")}</a>
</div>
""" for t in data.get("tiers", [])])
            body_html_parts.append(f"""
<section class="site-section" id="pricing">
  <div class="site-container">
    <div class="text-center">
      <span class="section-tag">{data.get("section_tag", "PRICING")}</span>
      <h2 class="section-heading">{data.get("section_title", "Registration Passes")}</h2>
      <p class="section-subheading">{data.get("section_subtitle", "")}</p>
    </div>
    <div class="pricing-grid">
      {tiers_html}
    </div>
  </div>
</section>
""")

        elif c_type == "gallery":
            imgs_html = "".join([f"""
<div class="gallery-item">
  <img src="{img.get("url", "")}" alt="{img.get("caption", "")}" loading="lazy">
  <div class="gallery-caption">{img.get("caption", "")}</div>
</div>
""" for img in data.get("images", [])])
            body_html_parts.append(f"""
<section class="site-section" id="gallery">
  <div class="site-container">
    <div class="text-center">
      <span class="section-tag">{data.get("section_tag", "GALLERY")}</span>
      <h2 class="section-heading">{data.get("section_title", "Event & Lab Showcase")}</h2>
      <p class="section-subheading">{data.get("section_subtitle", "")}</p>
    </div>
    <div class="gallery-grid">
      {imgs_html}
    </div>
  </div>
</section>
""")

        elif c_type == "faq":
            faqs_html = "".join([f"""
<div class="faq-card">
  <div class="faq-question">{faq.get("q", "")} <span>▾</span></div>
  <div class="faq-answer">{faq.get("a", "")}</div>
</div>
""" for faq in data.get("faqs", [])])
            body_html_parts.append(f"""
<section class="site-section" id="faq">
  <div class="site-container faq-wrap">
    <div class="text-center">
      <span class="section-tag">{data.get("section_tag", "FAQ")}</span>
      <h2 class="section-heading">{data.get("section_title", "Frequently Asked Questions")}</h2>
      <p class="section-subheading">{data.get("section_subtitle", "")}</p>
    </div>
    <div class="faq-list">
      {faqs_html}
    </div>
  </div>
</section>
""")

        elif c_type == "contact":
            body_html_parts.append(f"""
<section class="site-section" id="contact">
  <div class="site-container">
    <div class="contact-wrap">
      <div>
        <span class="section-tag">{data.get("section_tag", "CONTACT")}</span>
        <h2 class="section-heading" style="font-size: 2rem;">{data.get("section_title", "Get in Touch")}</h2>
        <p style="color: var(--text-muted); margin-bottom: 2rem;">{data.get("section_subtitle", "")}</p>
        <div style="display: flex; flex-direction: column; gap: 1rem; font-size: 0.95rem;">
          <div>📧 <strong>Email:</strong> {data.get("email", "")}</div>
          <div>📞 <strong>Phone:</strong> {data.get("phone", "")}</div>
          <div>📍 <strong>Address:</strong> {data.get("address", "")}</div>
        </div>
      </div>
      <form class="contact-form" onsubmit="event.preventDefault(); alert('Inquiry received! We will follow up shortly.');">
        <input type="text" class="form-input" placeholder="Your Full Name" required>
        <input type="email" class="form-input" placeholder="Your Work / Institutional Email" required>
        <input type="text" class="form-input" placeholder="Organization / University Lab">
        <textarea class="form-input" placeholder="Your message or registration questions..." required></textarea>
        <button type="submit" class="btn-primary" style="cursor: pointer; border: none;">{data.get("btn_text", data.get("form_button_label", "Submit Inquiry"))}</button>
      </form>
    </div>
  </div>
</section>
""")

        elif c_type == "footer":
            f_links = "".join([f'<a href="{l.get("url", "#")}">{l.get("label", "")}</a>' for l in data.get("links", [])])
            body_html_parts.append(f"""
<footer class="site-footer">
  <div class="site-container footer-inner">
    <div>
      <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 0.25rem;">{data.get("brand_name", title)}</div>
      <div style="font-size: 0.85rem; color: var(--text-muted);">{data.get("tagline", "")}</div>
      <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.5rem;">{data.get("copyright", "")}</div>
    </div>
    <div class="footer-links">
      {f_links}
    </div>
  </div>
</footer>
""")

        if (comp.get('field_formats') or comp.get('image_formats')) and len(body_html_parts) > part_start:
            body_html_parts[part_start:] = [apply_component_formatting(''.join(body_html_parts[part_start:]), comp, bg_color)]

        # Restrict shared section appearance to safe, bounded CSS values.
        appearance = comp.get("studio_style") or {}
        rules = []
        for key, css_property, maximum in (("padding", "padding", 160), ("radius", "border-radius", 80)):
            if appearance.get(key) not in (None, ""):
                try:
                    value = min(maximum, max(0, float(appearance[key])))
                    if value != value:
                        value = 0
                    rules.append(f"{css_property}:{value:g}px")
                except (ValueError, TypeError):
                    pass
        background = str(appearance.get("background", ""))
        if re.fullmatch(r"#[0-9a-fA-F]{6}", background):
            rules.append(f"background:{background}")
            foreground = contrast_color(background)
            light_section = foreground != '#ffffff'
            rules.extend([f'--text-main:{foreground}', f'--text-muted:{foreground}', f'--section-ink:{foreground}', f'--section-muted:{foreground}', f'--bg-card:{"#f1f5f9" if light_section else "#182235"}', f'color:{foreground}'])
        gradient_colors = {"ocean": ("#dbeafe", "#cffafe"), "lavender": ("#ede9fe", "#fce7f3"), "sunset": ("#ffedd5", "#ffe4e6"), "midnight": ("#0f172a", "#312e81")}.get(appearance.get("gradient"))
        if appearance.get("gradient") == "custom" and re.fullmatch(r"#[0-9a-fA-F]{6}", background):
            end_color = str(appearance.get("gradient_end", "#dbeafe"))
            if re.fullmatch(r"#[0-9a-fA-F]{6}", end_color):
                gradient_colors = (background, end_color)
        if gradient_colors:
            try:
                angle = min(360, max(0, float(appearance.get("gradient_angle") or 135)))
            except (ValueError, TypeError):
                angle = 135
            rules.append(f"background:linear-gradient({angle:g}deg,{gradient_colors[0]},{gradient_colors[1]})")
        if rules and len(body_html_parts) > part_start:
            section_html = "".join(body_html_parts[part_start:])
            body_html_parts[part_start:] = [f'<div class="{'studio-auto-contrast' if re.fullmatch(r'#[0-9a-fA-F]{6}', background) else 'studio-section-style'}" style="{";".join(rules)}">{section_html}</div>']

        if comp.get("elements") and len(body_html_parts) > part_start:
            elements = []
            for item in comp["elements"]:
                if not isinstance(item, dict):
                    continue
                def coordinate(value):
                    try:
                        return min(95, max(0, float(value)))
                    except (ValueError, TypeError):
                        return 0
                position = f'left:{coordinate(item.get("x", 10)):g}%;top:{coordinate(item.get("y", 10)):g}%'
                text = escape_html(str(item.get("text", "")))
                if item.get("kind") == "button":
                    url = str(item.get("url", "#")).strip()
                    if not re.match(r'^(https?://|mailto:|tel:|#|/(?!/))', url, re.I):
                        url = "#"
                    elements.append(f'<a class="studio-placed-element studio-placed-button" style="{position}" href="{escape_html(url, quote=True)}">{text}</a>')
                else:
                    elements.append(f'<div class="studio-placed-element" style="{position}">{text}</div>')
            section_html = "".join(body_html_parts[part_start:])
            body_html_parts[part_start:] = [f'<div class="studio-positioned-section">{"".join(elements)}{section_html}</div>']

    css += """
.studio-positioned-section {position:relative;min-height:160px;}
.studio-placed-element {position:absolute;z-index:2;max-width:90%;overflow-wrap:anywhere;font-size:20px;white-space:pre-wrap;}
.studio-placed-button {display:inline-block;padding:12px 22px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-size:16px;}
@media(max-width:600px){.studio-placed-element{position:relative;left:auto!important;top:auto!important;margin:12px;max-width:calc(100% - 24px);}}
"""
    css += '.library-nav-portfolio .nav-inner,.library-nav-portfolio.editor-library-nav{flex-direction:column!important;gap:18px;background:#f4eee5!important}.library-nav-portfolio .nav-brand,.library-nav-portfolio.editor-library-nav>div:first-child{font-family:Georgia,serif!important;font-style:italic;font-size:28px!important}.library-nav-services .nav-inner,.library-nav-services.editor-library-nav{border-top:6px solid #265852;background:#edf2ef!important}.library-nav-product.site-navbar,.library-nav-product.editor-library-nav{margin:16px;border-radius:18px!important;border:1px solid #d5c9f7!important;background:linear-gradient(120deg,#f3edff,#e7efff)!important}.library-nav-editorial .nav-inner,.library-nav-editorial.editor-library-nav{flex-direction:column!important;gap:20px;border-bottom:2px solid currentColor!important}.library-nav-editorial .nav-brand,.library-nav-editorial.editor-library-nav>div:first-child{font-family:Georgia,serif!important;font-size:32px!important;letter-spacing:2px}.editor-library-nav{flex-wrap:wrap;gap:16px}.editor-library-nav>div:last-child{display:flex;flex-wrap:wrap;gap:10px}@media(max-width:600px){.site-navbar .nav-inner{flex-wrap:wrap;gap:16px}.site-navbar .nav-links{display:flex!important;flex-wrap:wrap;gap:12px}}'
    ambient = bool(theme.get("animated_background"))
    if ambient:
        css += (Path(__file__).parent / "static" / "studio-ambient.css").read_text(encoding="utf-8")
    og_image = meta_cfg.get("og_image") or site_data.get("og_image") or ""
    meta_author = meta_cfg.get("meta_author") or site_data.get("meta_author") or site_name
    canonical_url = meta_cfg.get("canonical_url") or site_data.get("canonical_url") or ""
    robots = meta_cfg.get("robots") or site_data.get("robots") or "index, follow"
    ga_code = meta_cfg.get("ga_tracking_id") or site_data.get("ga_tracking_id") or site_data.get("ga_code") or ""
    custom_head = meta_cfg.get("custom_head_code") or site_data.get("custom_head_code") or ""
    custom_body = meta_cfg.get("custom_body_code") or site_data.get("custom_body_code") or ""

    meta_tags = []
    if meta_desc:
        meta_tags.append(f'  <meta name="description" content="{escape_html(meta_desc)}">')
        meta_tags.append(f'  <meta property="og:description" content="{escape_html(meta_desc)}">')
        meta_tags.append(f'  <meta name="twitter:description" content="{escape_html(meta_desc)}">')
    if meta_kw:
        meta_tags.append(f'  <meta name="keywords" content="{escape_html(meta_kw)}">')
    if meta_author:
        meta_tags.append(f'  <meta name="author" content="{escape_html(meta_author)}">')
    meta_tags.append(f'  <meta name="robots" content="{escape_html(robots)}">')
    if canonical_url:
        meta_tags.append(f'  <link rel="canonical" href="{escape_html(canonical_url)}">')
    meta_tags.append(f'  <meta property="og:title" content="{escape_html(title)}">')
    meta_tags.append('  <meta property="og:type" content="website">')
    meta_tags.append(f'  <meta name="twitter:title" content="{escape_html(title)}">')
    if og_image:
        meta_tags.append(f'  <meta property="og:image" content="{escape_html(og_image)}">')
        meta_tags.append(f'  <meta name="twitter:image" content="{escape_html(og_image)}">')
        meta_tags.append('  <meta name="twitter:card" content="summary_large_image">')
    else:
        meta_tags.append('  <meta name="twitter:card" content="summary">')

    meta_html = "\n".join(meta_tags)
    ga_script = ""
    if ga_code and re.match(r'^[A-Za-z0-9\-_]+$', ga_code.strip()):
        clean_ga = ga_code.strip()
        ga_script = f"""  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id={clean_ga}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){{dataLayer.push(arguments);}}
    gtag('js', new Date());
    gtag('config', '{clean_ga}');
  </script>"""

    full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{escape_html(title)}</title>
{meta_html}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
  <style>
{css}
  </style>
{ga_script}
{custom_head}
</head>
<body class="{'studio-ambient' if ambient else ''}">
{"".join(body_html_parts)}
{native_runtime() if any(c.get('type') == 'content' for c in components) else ''}
{custom_body}
</body>
</html>
"""
    return full_html, css


# -----------------------------------------------------------------------------
# Website Builder Engine Class
# -----------------------------------------------------------------------------

class WebsiteBuilderEngine:
    """Manages full lifecycle of dynamic websites across PostgreSQL and local storage."""

    def __init__(self):
        self._ensure_storage()

    def _ensure_storage(self):
        get_websites_dir()
        try:
            if not PG_CONFIG["host"]:
                raise RuntimeError("Cloud database is not configured")
            with psycopg2.connect(**PG_CONFIG) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS user_websites (
                            site_id VARCHAR(64) PRIMARY KEY,
                            conference_id VARCHAR(64),
                            user_email VARCHAR(255) NOT NULL,
                            name VARCHAR(255) NOT NULL,
                            slug VARCHAR(255) UNIQUE NOT NULL,
                            custom_domain VARCHAR(255),
                            status VARCHAR(32) DEFAULT 'draft',
                            theme_config JSONB NOT NULL DEFAULT '{}'::jsonb,
                            schema_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                            compiled_html TEXT,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                    """)
                    cur.execute("ALTER TABLE user_websites ADD COLUMN IF NOT EXISTS conference_id VARCHAR(64);")
                    conn.commit()
        except Exception as e:
            print(f"[BUILDER] PostgreSQL connection warning: {e}")

    def list_templates(self) -> List[dict]:
        """Returns the full 15 curated starter templates."""
        return TEMPLATES_CATALOG

    def list_sites(self, user_email: str, conference_id: Optional[str] = None) -> List[dict]:
        """Lists all websites belonging to the user, optionally filtered by conference_id."""
        sites = []
        user_email_clean = (user_email or "").strip().lower()
        conf_filter = (conference_id or "").strip()

        # 1. Try PostgreSQL
        try:
            if not PG_CONFIG["host"]:
                raise RuntimeError("Cloud database is not configured")
            with psycopg2.connect(**PG_CONFIG) as conn:
                with conn.cursor() as cur:
                    if user_email_clean in ("root@sciprospect.internal", "admin"):
                        cur.execute("SELECT site_id, user_email, name, slug, custom_domain, status, created_at, updated_at, conference_id FROM user_websites ORDER BY updated_at DESC;")
                    else:
                        cur.execute("SELECT site_id, user_email, name, slug, custom_domain, status, created_at, updated_at, conference_id FROM user_websites WHERE LOWER(user_email) = %s ORDER BY updated_at DESC;", (user_email_clean,))
                    rows = cur.fetchall()
                    for r in rows:
                        site_item = {
                            "site_id": r[0],
                            "user_email": r[1],
                            "name": r[2],
                            "slug": r[3],
                            "custom_domain": r[4] or "",
                            "status": r[5] or "draft",
                            "created_at": str(r[6]),
                            "updated_at": str(r[7]),
                            "conference_id": r[8] or None,
                            "url": f"/sites/{r[3]}"
                        }
                        if not conf_filter or conf_filter == "all" or site_item["conference_id"] == conf_filter:
                            sites.append(site_item)
                    return sites
        except Exception as e:
            pass

        # 2. Local Fallback
        base_dir = get_websites_dir()
        for s_dir in base_dir.glob("site_*"):
            if s_dir.is_dir():
                cfg_file = s_dir / "site_config.json"
                if cfg_file.exists():
                    try:
                        cfg = json.loads(cfg_file.read_text(encoding="utf-8"))
                        if user_email_clean in ("root@sciprospect.internal", "admin") or cfg.get("user_email", "").lower() == user_email_clean:
                            site_conf = cfg.get("conference_id")
                            if not conf_filter or conf_filter == "all" or site_conf == conf_filter:
                                sites.append({
                                    "site_id": cfg.get("site_id"),
                                    "user_email": cfg.get("user_email"),
                                    "name": cfg.get("name"),
                                    "slug": cfg.get("slug"),
                                    "custom_domain": cfg.get("custom_domain", ""),
                                    "status": cfg.get("status", "draft"),
                                    "conference_id": site_conf or None,
                                    "created_at": cfg.get("created_at", ""),
                                    "updated_at": cfg.get("updated_at", ""),
                                    "url": f"/sites/{cfg.get('slug')}"
                                })
                    except Exception:
                        pass
        sites.sort(key=lambda s: s.get("updated_at", ""), reverse=True)
        return sites

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
        """Creates a brand new website configured with the chosen template and wizard options."""
        clean_name = (name or "My Website").strip()
        site_id = f"site_{uuid.uuid4().hex[:8]}"

        # Format slug
        if not slug:
            slug = re.sub(r'[^a-z0-9]+', '-', clean_name.lower()).strip('-')
        else:
            slug = re.sub(r'[^a-z0-9]+', '-', slug.lower()).strip('-')

        if not slug:
            slug = f"site-{int(time.time())}"

        # Ensure slug uniqueness
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"

        now_str = datetime.now().isoformat()
        components, t_theme = build_template_components(template_id or "genomics", clean_name, custom_options)
        
        if template_id == "blank":
            components = []

        if initial_components is not None:
            components = initial_components

        # Merge theme
        if theme_config:
            t_theme.update(theme_config)

        site_data = {
            "site_id": site_id,
            "conference_id": (conference_id.strip() if isinstance(conference_id, str) and conference_id.strip() else None),
            "user_email": user_email.strip().lower(),
            "name": clean_name,
            "slug": slug,
            "custom_domain": "",
            "status": "draft",
            "template_id": template_id,
            "theme_config": t_theme,
            "schema_json": components,
            "created_at": now_str,
            "updated_at": now_str,
            "client_brief": (custom_options.get("client_brief") or {}) if custom_options else {}
        }

        compiled_html, compiled_css = compile_website_html(site_data)
        site_data["compiled_html"] = compiled_html

        # 1. Save Locally
        s_dir = get_websites_dir() / site_id
        s_dir.mkdir(parents=True, exist_ok=True)
        (s_dir / "site_config.json").write_text(json.dumps(site_data, indent=2), encoding="utf-8")
        (s_dir / "index.html").write_text(compiled_html, encoding="utf-8")
        (s_dir / "style.css").write_text(compiled_css, encoding="utf-8")

        # 2. Save in PostgreSQL
        try:
            if not PG_CONFIG["host"]:
                raise RuntimeError("Cloud database is not configured")
            with psycopg2.connect(**PG_CONFIG) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO user_websites (site_id, conference_id, user_email, name, slug, custom_domain, status, theme_config, schema_json, compiled_html, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                        ON CONFLICT (site_id) DO UPDATE SET
                            conference_id = EXCLUDED.conference_id,
                            name = EXCLUDED.name,
                            slug = EXCLUDED.slug,
                            theme_config = EXCLUDED.theme_config,
                            schema_json = EXCLUDED.schema_json,
                            compiled_html = EXCLUDED.compiled_html,
                            updated_at = NOW();
                    """, (site_id, site_data["conference_id"], user_email.lower(), clean_name, slug, "", "draft", json.dumps(t_theme), json.dumps(components), compiled_html))
                    conn.commit()
        except Exception as e:
            pass

        site_data["url"] = f"/sites/{slug}"
        return site_data

    def get_site(self, site_id: str) -> Optional[dict]:
        """Gets full site schema and metadata by site_id."""
        clean_id = site_id.strip()

        # 1. Try PostgreSQL
        try:
            if not PG_CONFIG["host"]:
                raise RuntimeError("Cloud database is not configured")
            with psycopg2.connect(**PG_CONFIG) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT site_id, user_email, name, slug, custom_domain, status, theme_config, schema_json, compiled_html, created_at, updated_at, conference_id
                        FROM user_websites WHERE site_id = %s;
                    """, (clean_id,))
                    row = cur.fetchone()
                    if row:
                        return {
                            "site_id": row[0],
                            "user_email": row[1],
                            "name": row[2],
                            "slug": row[3],
                            "custom_domain": row[4] or "",
                            "status": row[5] or "draft",
                            "theme_config": row[6] if isinstance(row[6], dict) else json.loads(row[6] or "{}"),
                            "schema_json": row[7] if isinstance(row[7], list) else json.loads(row[7] or "[]"),
                            "compiled_html": row[8] or "",
                            "created_at": str(row[9]),
                            "updated_at": str(row[10]),
                            "conference_id": row[11] or None,
                            "url": f"/sites/{row[3]}"
                        }
        except Exception as e:
            pass

        # 2. Local Fallback
        cfg_file = get_websites_dir() / clean_id / "site_config.json"
        if cfg_file.exists():
            try:
                data = json.loads(cfg_file.read_text(encoding="utf-8"))
                data.setdefault("conference_id", None)
                data.setdefault("client_brief", {})
                return data
            except Exception:
                pass
        return None

    def update_site(self, site_id: str, payload: dict) -> Tuple[bool, str, Optional[dict]]:
        """Updates site components, name, theme, and re-compiles standalone HTML."""
        site = self.get_site(site_id)
        if not site:
            return False, "Site not found", None

        if "name" in payload and payload["name"]:
            site["name"] = payload["name"].strip()
        if "slug" in payload and payload["slug"]:
            site["slug"] = re.sub(r'[^a-z0-9\-]+', '-', payload["slug"].lower().strip()).strip('-')
        if "custom_domain" in payload:
            site["custom_domain"] = payload["custom_domain"].strip().lower()
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
        compiled_html, compiled_css = compile_website_html(site)
        site["compiled_html"] = compiled_html

        # Save locally
        s_dir = get_websites_dir() / site_id
        s_dir.mkdir(parents=True, exist_ok=True)
        (s_dir / "site_config.json").write_text(json.dumps(site, indent=2), encoding="utf-8")
        (s_dir / "index.html").write_text(compiled_html, encoding="utf-8")
        (s_dir / "style.css").write_text(compiled_css, encoding="utf-8")

        # Save to PostgreSQL
        try:
            if not PG_CONFIG["host"]:
                raise RuntimeError("Cloud database is not configured")
            with psycopg2.connect(**PG_CONFIG) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE user_websites
                        SET conference_id = %s,
                            name = %s,
                            slug = %s,
                            custom_domain = %s,
                            status = %s,
                            theme_config = %s,
                            schema_json = %s,
                            compiled_html = %s,
                            updated_at = NOW()
                        WHERE site_id = %s;
                    """, (
                        site.get("conference_id"),
                        site["name"],
                        site["slug"],
                        site.get("custom_domain", ""),
                        site.get("status", "draft"),
                        json.dumps(site.get("theme_config", {})),
                        json.dumps(site.get("schema_json", [])),
                        compiled_html,
                        site_id
                    ))
                    conn.commit()
        except Exception as e:
            pass

        site["url"] = f"/sites/{site['slug']}"
        return True, "Site saved successfully.", site

    def delete_site(self, site_id: str) -> Tuple[bool, str]:
        """Deletes a website record locally and from PostgreSQL."""
        clean_id = site_id.strip()

        try:
            if not PG_CONFIG["host"]:
                raise RuntimeError("Cloud database is not configured")
            with psycopg2.connect(**PG_CONFIG) as conn:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM user_websites WHERE site_id = %s;", (clean_id,))
                    conn.commit()
        except Exception as e:
            print(f"[BUILDER] PostgreSQL delete error: {e}")

        s_dir = get_websites_dir() / clean_id
        if s_dir.exists():
            import shutil
            shutil.rmtree(s_dir, ignore_errors=True)

        return True, f"Website {clean_id} deleted."

    def get_site_by_slug(self, slug: str) -> Optional[dict]:
        """Fetches published website by slug for public delivery."""
        clean_slug = slug.strip().lower()

        try:
            if not PG_CONFIG["host"]:
                raise RuntimeError("Cloud database is not configured")
            with psycopg2.connect(**PG_CONFIG) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT site_id, name, slug, compiled_html, status
                        FROM user_websites WHERE LOWER(slug) = %s;
                    """, (clean_slug,))
                    row = cur.fetchone()
                    if row:
                        return {
                            "site_id": row[0],
                            "name": row[1],
                            "slug": row[2],
                            "compiled_html": row[3],
                            "status": row[4]
                        }
        except Exception as e:
            print(f"[BUILDER] PostgreSQL slug lookup error: {e}")

        for s_dir in get_websites_dir().glob("site_*"):
            cfg = s_dir / "site_config.json"
            if cfg.exists():
                try:
                    data = json.loads(cfg.read_text(encoding="utf-8"))
                    if data.get("slug", "").lower() == clean_slug:
                        return data
                except Exception:
                    pass
        return None

    def export_site_zip(self, site_id: str) -> Tuple[Optional[bytes], str]:
        """Bundles standalone compiled site into a downloadable ZIP archive, supporting multi-page exports."""
        site = self.get_site(site_id)
        if not site:
            return None, "Site not found"

        pages = site.get("pages") or []
        slug = site.get("slug", "website")
        buf = io.BytesIO()

        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            if pages and isinstance(pages, list) and len(pages) > 1:
                # Multi-page website export
                for p in pages:
                    p_id = p.get("id")
                    p_slug = (p.get("slug") or "/").strip("/").replace("/", "_")
                    is_home = bool(p.get("is_home") or not p_slug)
                    file_name = "index.html" if is_home else f"{p_slug}.html"
                    p_html, _ = compile_website_html(site, page_id=p_id)
                    zf.writestr(file_name, p_html)
                # Global shared stylesheet
                _, compiled_css = compile_website_html(site)
                zf.writestr("style.css", compiled_css)
            else:
                compiled_html, compiled_css = compile_website_html(site)
                zf.writestr("index.html", compiled_html)
                zf.writestr("style.css", compiled_css)

            zf.writestr("site_config.json", json.dumps(site, indent=2))
            readme = f"""# {site.get('name', 'Website')}
Generated with SciProspect Website Builder (Multi-Page & SEO Enabled).

## Included Files:
- {'\n- '.join([p.get('name', 'Page') + ' -> ' + ('index.html' if p.get('is_home') or not (p.get('slug') or '').strip('/') else (p.get('slug') or '').strip('/') + '.html') for p in pages]) if pages and len(pages) > 1 else '- index.html (Homepage)'}
- style.css (Global design tokens & typography)
- site_config.json (Complete schema configuration)

## Hosting Instructions:
- **Netlify / Vercel**: Drag and drop this unzipped folder into Netlify Drop or run `vercel`.
- **Apache / Nginx / cPanel**: Upload all files to your `public_html` or web root directory.
- **GitHub Pages**: Push this repository and enable GitHub Pages in settings.

Enjoy your website!
"""
            zf.writestr("README.md", readme)

        buf.seek(0)
        return buf.getvalue(), f"{slug}_website.zip"


builder_engine = WebsiteBuilderEngine()
