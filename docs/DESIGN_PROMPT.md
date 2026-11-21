# Daily design prompt (SciStudio)

Use these prompts with any AI (Claude, ChatGPT, Gemini…) to make a new design, then import it:
**Root admin → Design Library → paste the reply → Import.** Sections appear in everyone's Components panel. Templates appear in the template gallery.

The server checks every file. Scripts, embedded pages, raw HTML and private fields are refused, and colors, links and images are cleaned when the design is shown.

---

## Prompt 1: one section (copy everything in the box)

```text
You are a senior web designer creating ONE section for SciStudio, a no-code website builder
(conference-first, but used for any business). Reply with ONLY a JSON object, no explanation.

TODAY'S DESIGN: <describe it, e.g. "a dark, elegant keynote speakers grid with 4 cards">

FORMAT
{
  "format": "scistudio-design",
  "kind": "section",
  "name": "<short catchy name, max 80 chars>",
  "category": "<one of: Hero, About, Features, Speakers, Pricing, Gallery, FAQ, Contact, CTA, Footer, Navigation, Text>",
  "level": "basic | medium | pro",
  "description": "<one sentence, max 300 chars>",
  "section": {
    "type": "content",
    "title": "<same as name>",
    "data": { "columns": 1-6, "mobile_columns": 1, "gap": 0-80, "nodes": [ ...nodes... ] },
    "section_style": { "desktop": { "background": "#hex", "color": "#hex", "paddingY": 0-400,
                                    "gradient": { "from": "#hex", "to": "#hex", "angle": 0-360 } } }
  }
}

NODES (the building blocks, laid out on a grid of "columns"):
{ "kind": "heading" | "text" | "button" | "menu" | "icon" | "divider",
  "text": "<visible text; use \n for new lines>",
  "size": 10-120 (font size px), "span": 1-columns (how many columns it covers),
  "padding": 0-120, "radius": 0-80, "align": "left" | "center",
  "color": "#hex", "background": "#hex",
  "effect": "lift" (hover lift) | "gradient" (then add "start": "#hex", "end": "#hex"),
  "url": "#contact" (buttons only; use #section links or https:// URLs),
  "links": "Label | #anchor\nLabel 2 | #anchor2" (menu only) }

DESIGN RULES
- Modern and premium: generous spacing, clear hierarchy, 2-3 colors max, strong contrast
  (text must be readable on its background, WCAG AA).
- Use span to make bento/asymmetric layouts (e.g. columns 3, a heading with span 3, cards with span 2 and 1).
- Realistic sample text a non-technical user can overwrite. Never invent real names, prices,
  statistics or quotes. Mark placeholders clearly (e.g. "Speaker name", "—").
- Colors only as #hex. No HTML, no <script>, no "javascript:", no keys starting with "_".
- Must look good on mobile (it becomes 1 column automatically).
```

## Prompt 2: a full template (a starter website)

```text
You are a senior web designer creating a complete multi-page starter website for SciStudio.
Reply with ONLY a JSON object, no explanation.

TODAY'S TEMPLATE: <describe it, e.g. "a calm medical research symposium, light theme, teal accent, pages: Home, Program, Speakers, Registration, Contact">

FORMAT
{
  "format": "scistudio-design",
  "kind": "template",
  "name": "<template name>",
  "category": "<e.g. Bold events, Research & programs, Business, Portfolio>",
  "level": "basic | medium | pro",
  "description": "<one sentence>",
  "theme": { "mode": "light" | "dark", "primary_color": "#hex", "accent_color": "#hex", "bg_color": "#hex" },
  "pages": [
    { "name": "Home", "sections": [ ...sections... ] },
    { "name": "Program", "slug": "program", "sections": [ ...sections... ] },
    ... 1-12 pages; the FIRST page is the home page
  ]
}
Each section: { "type": ..., "title": ..., "data": {...}, "section_style": {...} }, 1-30 per page.

LINKS BETWEEN PAGES: write "page:<slug>" (e.g. "page:program", "page:registration");
"page:" alone links to the home page. Links inside the same page: "#contact".
Repeat the same navbar (with page links) at the top and the same footer at the bottom of EVERY page.

SECTION TYPES AND THEIR DATA
- navbar:   { "brand_name", "brand_mode": "text", "layout_variant": "business|portfolio|services|product|editorial",
              "links": [{ "label", "url" }], "cta_label", "cta_link" }
- hero:     { "eyebrow", "headline", "subheadline", "primary_btn_text", "primary_btn_url",
              "secondary_btn_text", "secondary_btn_url", "hero_image": "",
              "layout_variant": "split|centered|image_top|image_left|text_only" }
- features: { "section_title", "section_subtitle", "items": [{ "title", "description", "icon": "" }] }
- about | stats | agenda | sponsors | testimonials | announcement:
            { "section_title", "section_subtitle", "design": "grid|list|spotlight",
              "items": [{ "title", "description", "image": "" }] }
- speakers: { "section_title", "speakers": [{ "name", "role", "affiliation", "photo": "", "bio" }] }
- pricing:  { "section_title", "tiers": [{ "name", "price", "period", "description", "features": ["..."],
              "featured": true|false, "btn_label", "btn_url" }] }
- gallery:  { "section_title", "images": [{ "url": "", "caption" }] }
- faq:      { "section_title", "faqs": [{ "q", "a" }] }
- contact:  { "section_title", "section_subtitle", "email", "phone", "location", "btn_text",
              "form_layout": "split|centered|inline|image|dark" }
- footer:   { "brand_name", "tagline", "copyright", "links": [{ "label", "url" }] }
- content:  the flexible grid of nodes (same as in the section prompt above)

RULES
- Typical conference pages: Home, Program, Speakers, Registration, Venue, Contact.
  Home starts with navbar + hero; every page ends with the footer.
- Leave every image as "" (the user adds their own). Links: "#section" anchors.
- Same design rules as the section prompt: premium, readable, no invented facts, #hex colors only,
  no HTML or scripts, no keys starting with "_".
```

## Prompt 3: a brand-new kind of element (needs code)

Use this when the design needs something the building blocks can't do, such as a countdown timer, a map or a video. The AI writes a short spec, and you give it to Claude Code to build.

```text
Write a short spec for a new SciStudio website element: <e.g. "event countdown timer">.
Include: purpose, the fields a non-technical user edits (name, type, default), layout on
desktop and mobile, accessibility notes, and 2 visual variants. Max 200 words.
```

## Tips

- One design file at a time, or a JSON list `[ {...}, {...} ]` of up to 20.
- If the import says something is wrong, paste the error back to the AI and ask it to fix the JSON.
- Remove a design from the Design Library at any time. Websites that already use it keep their copy.
