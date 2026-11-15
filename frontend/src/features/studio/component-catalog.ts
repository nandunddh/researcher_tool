import { modernComponents } from "./modern-presets";
export type LibraryLevel = "basic" | "medium" | "pro";
export type LibraryFilter = "all" | LibraryLevel;
export type NavigationVariant = "business" | "portfolio" | "services" | "product" | "editorial";
export type LibraryGroup = "Sections" | "Elements" | "Assets";
export type LibraryComponent = {id:string;version:number;name:string;category:string;group:LibraryGroup;level:LibraryLevel;description:string;variant:string;features:string[]};
export const componentCatalog:LibraryComponent[] = [
 ...modernComponents,
 {id:"nav-classic",version:2,name:"Northstar / Business",category:"Navigation",group:"Sections",level:"basic",description:"A confident business header with a services dropdown and a clear next step.",variant:"business",features:["Services dropdown","Primary CTA","Mobile menu"]},
 {id:"nav-centered",version:2,name:"Atelier / Portfolio",category:"Navigation",group:"Sections",level:"basic",description:"An editorial wordmark, quiet navigation and a warm, expressive canvas.",variant:"portfolio",features:["Centered brand","Contact action","Mobile menu"]},
 {id:"nav-split",version:2,name:"Forma / Services",category:"Navigation",group:"Sections",level:"medium",description:"Contact details and availability above a practical, appointment-focused header.",variant:"services",features:["Contact strip","Service categories","Booking CTA"]},
 {id:"nav-floating",version:2,name:"Orbit / Product",category:"Navigation",group:"Sections",level:"pro",description:"A floating product header with a rich mega menu and separate account actions.",variant:"product",features:["Mega menu","Login + signup","Floating header"]},
 {id:"nav-editorial",version:2,name:"Fieldnotes / Editorial",category:"Navigation",group:"Sections",level:"pro",description:"A publication masthead with topic navigation, article search and subscription CTA.",variant:"editorial",features:["Topic navigation","Article search","Subscribe action"]},
 {"id": "hero-split", "version": 1, "name": "Split hero", "category": "Hero", "group": "Sections", "level": "basic", "description": "Headline, supporting copy and visual in a balanced split layout.", "variant": "hero", "features": []},
 {"id": "about-story", "version": 1, "name": "Our story", "category": "About", "group": "Sections", "level": "basic", "description": "A focused introduction with space for your story.", "variant": "about", "features": []},
 {"id": "features-grid", "version": 1, "name": "Service cards", "category": "Features", "group": "Sections", "level": "basic", "description": "Three services with icons and short descriptions.", "variant": "features", "features": []},
 {"id": "gallery-grid", "version": 1, "name": "Image grid", "category": "Gallery", "group": "Sections", "level": "medium", "description": "A responsive visual grid with image captions.", "variant": "gallery", "features": []},
 {"id": "team-grid", "version": 1, "name": "People cards", "category": "Team", "group": "Sections", "level": "medium", "description": "Portrait placeholders, names and roles.", "variant": "team", "features": []},
 {"id": "pricing-cards", "version": 1, "name": "Pricing comparison", "category": "Pricing", "group": "Sections", "level": "pro", "description": "Three plans with features and calls to action.", "variant": "pricing", "features": []},
 {"id": "faq-list", "version": 1, "name": "FAQ accordion", "category": "FAQ", "group": "Sections", "level": "basic", "description": "Expandable questions and answers.", "variant": "faq", "features": []},
 {"id": "contact-form", "version": 1, "name": "Contact form", "category": "Contact", "group": "Sections", "level": "medium", "description": "Labeled fields and a clear submit action.", "variant": "contact", "features": []},
 {"id": "cta-band", "version": 1, "name": "Call to action", "category": "CTA", "group": "Sections", "level": "basic", "description": "A compact conversion section with a single next step.", "variant": "cta", "features": []},
 {"id": "footer-columns", "version": 1, "name": "Column footer", "category": "Footer", "group": "Sections", "level": "basic", "description": "Brand information, grouped links and legal line.", "variant": "footer", "features": []},
 {"id": "text-heading", "version": 1, "name": "Heading", "category": "Text", "group": "Elements", "level": "basic", "description": "A standalone editable heading.", "variant": "text", "features": []},
 {"id": "button-primary", "version": 1, "name": "Primary button", "category": "Buttons", "group": "Elements", "level": "basic", "description": "A prominent standalone action.", "variant": "button", "features": []},
 {"id": "image-frame", "version": 1, "name": "Image frame", "category": "Images", "group": "Elements", "level": "basic", "description": "An image placeholder with caption.", "variant": "image", "features": []},
 {"id": "layout-columns", "version": 1, "name": "Two columns", "category": "Layout", "group": "Elements", "level": "medium", "description": "A responsive two-column container.", "variant": "columns", "features": []},
 {"id": "divider-line", "version": 1, "name": "Section divider", "category": "Dividers", "group": "Elements", "level": "basic", "description": "A subtle separator for content.", "variant": "divider", "features": []},
 {"id": "icons-outline", "version": 1, "name": "Outline icons", "category": "Icons", "group": "Assets", "level": "basic", "description": "Consistent SVG interface icons.", "variant": "icons", "features": []},
 {"id": "svg-orbit", "version": 1, "name": "Orbit illustration", "category": "Illustrations", "group": "Assets", "level": "pro", "description": "A scalable geometric SVG illustration.", "variant": "svg", "features": []},
 {"id": "background-aurora", "version": 1, "name": "Aurora gradient", "category": "Backgrounds", "group": "Assets", "level": "medium", "description": "A soft multicolor gradient background.", "variant": "gradient", "features": []},
];
const rank:Record<LibraryLevel,number>={basic:0,medium:1,pro:2};
// Browsing filters only: all designs are available during testing.
export function filterComponents(level:LibraryFilter,query="",group?:LibraryGroup,category="All"){
 return componentCatalog.filter(item=>(!group||item.group===group)&&(category==="All"||item.category===category)&&(level==="all"||rank[item.level]<=rank[level])&&`${item.name} ${item.category} ${item.description} ${item.features.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
}
