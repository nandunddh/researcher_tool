"""
builder_manager.py
==================
Website Builder Core Engine for SciProspect.
Supports multiple dynamic websites with 15 rich pre-built templates,
customized details (Navbar, Hero, Theme modes: Dark / Light / Obsidian, Active Sections),
PostgreSQL cloud storage + local storage, standalone ZIP export, and public live URLs.
"""

import os
import json
import uuid
import re
import io
import zipfile
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
# 15 Built-in Curated Templates Catalog
# -----------------------------------------------------------------------------

TEMPLATES_CATALOG = [
    {
        "id": "genomics",
        "name": "Genomics & Life Sciences Summit",
        "category": "Conferences & Summits",
        "icon": "🧬",
        "theme": {"mode": "dark", "primary_color": "#38bdf8", "accent_color": "#6366f1", "bg_color": "#0b0f19"},
        "description": "High-impact academic conference layout with keynotes, multi-omics sessions, poster hall, and registration tiers."
    },
    {
        "id": "ai_medicine",
        "name": "AI in Medicine & Health Forum",
        "category": "Artificial Intelligence",
        "icon": "🤖",
        "theme": {"mode": "dark", "primary_color": "#06b6d4", "accent_color": "#8b5cf6", "bg_color": "#090d16"},
        "description": "Next-gen tech gradient theme for clinical machine learning, predictive biomarkers, and algorithmic medicine."
    },
    {
        "id": "lab_portal",
        "name": "Academic Research Laboratory Portal",
        "category": "Lab & PI Showcase",
        "icon": "🔬",
        "theme": {"mode": "dark", "primary_color": "#0ea5e9", "accent_color": "#10b981", "bg_color": "#0f172a"},
        "description": "Showcase ongoing NIH/Horizon grants, peer-reviewed publications, PI bio, lab team members, and open postdoc positions."
    },
    {
        "id": "oncology",
        "name": "Clinical Oncology & Immunotherapy",
        "category": "Medical Symposia",
        "icon": "🩺",
        "theme": {"mode": "light", "primary_color": "#2563eb", "accent_color": "#0284c7", "bg_color": "#f8fafc"},
        "description": "Crisp medical light theme for cancer research, clinical trial phases, cellular immunology, and medical faculty."
    },
    {
        "id": "neuroscience",
        "name": "Neuroscience & Brain Connectomics",
        "category": "Brain Sciences",
        "icon": "🧠",
        "theme": {"mode": "dark", "primary_color": "#a855f7", "accent_color": "#3b82f6", "bg_color": "#0b0d17"},
        "description": "Striking dark violet styling tailored for neural mapping, neurodegenerative disease breakthroughs, and cognitive pioneers."
    },
    {
        "id": "crispr",
        "name": "CRISPR & Precision Gene Editing",
        "category": "Biotechnology",
        "icon": "⚡",
        "theme": {"mode": "dark", "primary_color": "#10b981", "accent_color": "#06b6d4", "bg_color": "#09121d"},
        "description": "Cutting-edge biotech design highlighting genetic engineering, molecular diagnostics, and patent portfolios."
    },
    {
        "id": "climate",
        "name": "Global Climate Science & Ecology",
        "category": "Earth & Ecology",
        "icon": "🌍",
        "theme": {"mode": "light", "primary_color": "#059669", "accent_color": "#0d9488", "bg_color": "#f0fdf4"},
        "description": "Fresh, sustainable design for environmental research, planetary modeling, renewable energy, and ecology panels."
    },
    {
        "id": "pharma",
        "name": "Pharmaceutical Discovery & Trials",
        "category": "Pharma & Drug Discovery",
        "icon": "🧪",
        "theme": {"mode": "dark", "primary_color": "#38bdf8", "accent_color": "#ec4899", "bg_color": "#0f172a"},
        "description": "Designed for clinical trials pipelines, small molecule screening, pharmacology keynotes, and biotech investors."
    },
    {
        "id": "quantum",
        "name": "Quantum Computing & DeepTech",
        "category": "Physics & Computing",
        "icon": "⚛️",
        "theme": {"mode": "dark", "primary_color": "#f59e0b", "accent_color": "#ef4444", "bg_color": "#0c0a09"},
        "description": "High-contrast dark obsidian aesthetic for quantum algorithms, theoretical physics, and hardware workshops."
    },
    {
        "id": "univ_dept",
        "name": "University Faculty & Graduate Program",
        "category": "Academic Departments",
        "icon": "🎓",
        "theme": {"mode": "light", "primary_color": "#1d4ed8", "accent_color": "#4338ca", "bg_color": "#ffffff"},
        "description": "Clean institutional layout for university departments, curriculum overviews, professors, admissions, and student research."
    },
    {
        "id": "microbiome",
        "name": "Microbiome & Precision Nutrition",
        "category": "Health & Nutrition",
        "icon": "🌱",
        "theme": {"mode": "dark", "primary_color": "#84cc16", "accent_color": "#06b6d4", "bg_color": "#0d1512"},
        "description": "Vibrant emerald accents for gut microbiome research, metabolic pathways, metagenomics, and clinical nutrition."
    },
    {
        "id": "saas_platform",
        "name": "Scientific Cloud & Bio-Data Software",
        "category": "Scientific Software",
        "icon": "💻",
        "theme": {"mode": "dark", "primary_color": "#6366f1", "accent_color": "#38bdf8", "bg_color": "#0b0f19"},
        "description": "Modern SaaS landing page with product mockups, feature breakdowns, API highlights, and subscription plans."
    },
    {
        "id": "grant_consortium",
        "name": "NIH R01 Grant Consortium & Trials",
        "category": "Grant & Research Consortia",
        "icon": "🏛️",
        "theme": {"mode": "light", "primary_color": "#0f766e", "accent_color": "#0369a1", "bg_color": "#f8fafc"},
        "description": "Official collaborative portal for multi-institution grant deliverables, participating university labs, and annual progress."
    },
    {
        "id": "young_investigators",
        "name": "Young Investigators & Postdoc Expo",
        "category": "Career & Networking",
        "icon": "🚀",
        "theme": {"mode": "dark", "primary_color": "#f43f5e", "accent_color": "#8b5cf6", "bg_color": "#0f172a"},
        "description": "Engaging layout for early-career researcher networking, flash poster competitions, mentor pairings, and job booths."
    },
    {
        "id": "chemistry_symposium",
        "name": "Physical & Synthetic Chemistry Annual",
        "category": "Chemistry & Materials",
        "icon": "⚗️",
        "theme": {"mode": "dark", "primary_color": "#eab308", "accent_color": "#38bdf8", "bg_color": "#0a0f1d"},
        "description": "Tailored for material science, chemical synthesis, catalysis breakthroughs, and international academic poster halls."
    }
]


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
    hero_eyebrow = custom_opts.get("hero_eyebrow") or f"🌟 {tmpl['name'].upper()} 2026"
    hero_headline = custom_opts.get("hero_headline") or f"{site_name}: Breakthroughs & Collaborative Discovery"
    hero_sub = custom_opts.get("hero_subheadline") or tmpl["description"]
    hero_btn1 = custom_opts.get("hero_btn1") or "Register Now"
    hero_btn2 = custom_opts.get("hero_btn2") or "Explore Keynotes"
    hero_img = custom_opts.get("hero_image") or "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=80"

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
                "eyebrow": hero_eyebrow,
                "headline": hero_headline,
                "subheadline": hero_sub,
                "primary_btn_text": hero_btn1,
                "primary_btn_url": "#pricing",
                "secondary_btn_text": hero_btn2,
                "secondary_btn_url": "#features",
                "hero_image": hero_img
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
                "email": "inquiries@sciprospect.internal",
                "phone": "+1 (800) 555-0199",
                "address": "Convention Center & Innovation Complex",
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

    return components, theme


# -----------------------------------------------------------------------------
# Standalone HTML Compiler (Supporting Dark, Pitch Obsidian, and Clean Light)
# -----------------------------------------------------------------------------

def compile_website_html(site_data: dict) -> Tuple[str, str]:
    """
    Compiles the dynamic component tree into pure, standalone production-ready HTML and CSS.
    Handles Light Mode, Dark Mode, and Pitch Obsidian modes cleanly.
    Returns (html_content, css_content).
    """
    title = site_data.get("name", "Website")
    theme = site_data.get("theme_config", {})
    mode = theme.get("mode", "dark")
    is_light = (mode == "light")

    primary_color = theme.get("primary_color", "#2563eb" if is_light else "#38bdf8")
    accent_color = theme.get("accent_color", "#0284c7" if is_light else "#6366f1")
    bg_color = theme.get("bg_color", "#f8fafc" if is_light else "#0b0f19")
    card_bg = "#ffffff" if is_light else "#131b2e"
    card_hover = "#f1f5f9" if is_light else "#1e293b"
    text_color = theme.get("text_color", "#0f172a" if is_light else "#f8fafc")
    text_muted = "#64748b" if is_light else "#94a3b8"
    border_glass = "rgba(0, 0, 0, 0.08)" if is_light else "rgba(255, 255, 255, 0.08)"
    border_focus = "rgba(37, 99, 235, 0.4)" if is_light else "rgba(56, 189, 248, 0.4)"
    nav_bg = "rgba(255, 255, 255, 0.92)" if is_light else "rgba(11, 15, 25, 0.88)"
    input_bg = "#ffffff" if is_light else "rgba(0, 0, 0, 0.35)"
    input_border = "#e2e8f0" if is_light else "rgba(255, 255, 255, 0.12)"
    input_color = "#0f172a" if is_light else "#fff"
    font_family = theme.get("font_family", "'Outfit', 'Inter', sans-serif")

    components = site_data.get("schema_json", [])
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
  height: 72px;
}}
.nav-brand {{
  font-size: 1.35rem;
  font-weight: 800;
  color: {'#0f172a' if is_light else '#fff'};
}}
.nav-links {{
  display: flex;
  gap: 1.75rem;
  align-items: center;
}}
.nav-link {{
  font-size: 0.92rem;
  font-weight: 500;
  color: {'#334155' if is_light else '#cbd5e1'};
  transition: color 0.2s;
}}
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
  background: linear-gradient(135deg, var(--accent), var(--primary));
  color: #fff;
  padding: 0.85rem 1.85rem;
  border-radius: 10px;
  font-weight: 700;
  font-size: 1rem;
  transition: all 0.25s;
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.35);
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
  .hero-content {{
    grid-template-columns: 1fr;
    text-align: center;
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

    body_html_parts = []

    for comp in components:
        c_type = comp.get("type", "")
        data = comp.get("data", {})

        if c_type == "navbar":
            links_html = "".join([f'<a class="nav-link" href="{l.get("url", "#")}">{l.get("label", "")}</a>' for l in data.get("links", [])])
            body_html_parts.append(f"""
<nav class="site-navbar">
  <div class="site-container nav-inner">
    <a href="#" class="nav-brand">{data.get("brand_name", title)}</a>
    <div class="nav-links">
      {links_html}
      <a href="{data.get("cta_link", "#pricing")}" class="btn-nav">{data.get("cta_label", "Register")}</a>
    </div>
  </div>
</nav>
""")

        elif c_type == "hero":
            body_html_parts.append(f"""
<header class="site-section hero-wrap">
  <div class="site-container hero-content">
    <div>
      <span class="section-tag">{data.get("eyebrow", "")}</span>
      <h1 class="hero-headline">{data.get("headline", title)}</h1>
      <p class="hero-subhead">{data.get("subheadline", "")}</p>
      <div class="hero-actions">
        <a href="{data.get("primary_btn_url", "#pricing")}" class="btn-primary">{data.get("primary_btn_text", "Get Started")}</a>
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
        <button type="submit" class="btn-primary" style="cursor: pointer; border: none;">{data.get("form_button_label", "Submit Inquiry")}</button>
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

    full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
  <style>
{css}
  </style>
</head>
<body>
{"".join(body_html_parts)}
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
                    conn.commit()
        except Exception as e:
            print(f"[BUILDER] PostgreSQL connection warning: {e}")

    def list_templates(self) -> List[dict]:
        """Returns the full 15 curated starter templates."""
        return TEMPLATES_CATALOG

    def list_sites(self, user_email: str) -> List[dict]:
        """Lists all websites belonging to the user."""
        sites = []
        user_email_clean = (user_email or "").strip().lower()

        # 1. Try PostgreSQL
        try:
            if not PG_CONFIG["host"]:
                raise RuntimeError("Cloud database is not configured")
            with psycopg2.connect(**PG_CONFIG) as conn:
                with conn.cursor() as cur:
                    if user_email_clean in ("root@sciprospect.internal", "admin"):
                        cur.execute("SELECT site_id, user_email, name, slug, custom_domain, status, created_at, updated_at FROM user_websites ORDER BY updated_at DESC;")
                    else:
                        cur.execute("SELECT site_id, user_email, name, slug, custom_domain, status, created_at, updated_at FROM user_websites WHERE LOWER(user_email) = %s ORDER BY updated_at DESC;", (user_email_clean,))
                    rows = cur.fetchall()
                    for r in rows:
                        sites.append({
                            "site_id": r[0],
                            "user_email": r[1],
                            "name": r[2],
                            "slug": r[3],
                            "custom_domain": r[4] or "",
                            "status": r[5] or "draft",
                            "created_at": str(r[6]),
                            "updated_at": str(r[7]),
                            "url": f"/sites/{r[3]}"
                        })
                    return sites
        except Exception as e:
            print(f"[BUILDER] PostgreSQL list error: {e}")

        # 2. Local Fallback
        base_dir = get_websites_dir()
        for s_dir in base_dir.glob("site_*"):
            if s_dir.is_dir():
                cfg_file = s_dir / "site_config.json"
                if cfg_file.exists():
                    try:
                        cfg = json.loads(cfg_file.read_text(encoding="utf-8"))
                        if user_email_clean in ("root@sciprospect.internal", "admin") or cfg.get("user_email", "").lower() == user_email_clean:
                            sites.append({
                                "site_id": cfg.get("site_id"),
                                "user_email": cfg.get("user_email"),
                                "name": cfg.get("name"),
                                "slug": cfg.get("slug"),
                                "custom_domain": cfg.get("custom_domain", ""),
                                "status": cfg.get("status", "draft"),
                                "created_at": cfg.get("created_at", ""),
                                "updated_at": cfg.get("updated_at", ""),
                                "url": f"/sites/{cfg.get('slug')}"
                            })
                    except Exception:
                        pass
        return sites

    def create_site(
        self,
        user_email: str,
        name: str,
        slug: Optional[str] = None,
        template_id: Optional[str] = "genomics",
        theme_config: Optional[dict] = None,
        custom_options: Optional[dict] = None
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
        
        # Merge theme
        if theme_config:
            t_theme.update(theme_config)

        site_data = {
            "site_id": site_id,
            "user_email": user_email.strip().lower(),
            "name": clean_name,
            "slug": slug,
            "custom_domain": "",
            "status": "draft",
            "template_id": template_id,
            "theme_config": t_theme,
            "schema_json": components,
            "created_at": now_str,
            "updated_at": now_str
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
                        INSERT INTO user_websites (site_id, user_email, name, slug, custom_domain, status, theme_config, schema_json, compiled_html, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                        ON CONFLICT (site_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            slug = EXCLUDED.slug,
                            theme_config = EXCLUDED.theme_config,
                            schema_json = EXCLUDED.schema_json,
                            compiled_html = EXCLUDED.compiled_html,
                            updated_at = NOW();
                    """, (site_id, user_email.lower(), clean_name, slug, "", "draft", json.dumps(t_theme), json.dumps(components), compiled_html))
                    conn.commit()
        except Exception as e:
            print(f"[BUILDER] PostgreSQL insert error: {e}")

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
                        SELECT site_id, user_email, name, slug, custom_domain, status, theme_config, schema_json, compiled_html, created_at, updated_at
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
                            "url": f"/sites/{row[3]}"
                        }
        except Exception as e:
            print(f"[BUILDER] PostgreSQL get error: {e}")

        # 2. Local Fallback
        cfg_file = get_websites_dir() / clean_id / "site_config.json"
        if cfg_file.exists():
            try:
                return json.loads(cfg_file.read_text(encoding="utf-8"))
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
                        SET name = %s,
                            slug = %s,
                            custom_domain = %s,
                            status = %s,
                            theme_config = %s,
                            schema_json = %s,
                            compiled_html = %s,
                            updated_at = NOW()
                        WHERE site_id = %s;
                    """, (
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
            print(f"[BUILDER] PostgreSQL update error: {e}")

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
        """Bundles standalone compiled site into a downloadable ZIP archive."""
        site = self.get_site(site_id)
        if not site:
            return None, "Site not found"

        compiled_html, compiled_css = compile_website_html(site)
        slug = site.get("slug", "website")

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("index.html", compiled_html)
            zf.writestr("style.css", compiled_css)
            zf.writestr("site_config.json", json.dumps(site, indent=2))
            readme = f"""# {site.get('name', 'Website')}
Generated with SciProspect Website Builder.

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
