import { modernComponents } from "./modern-presets";
export type LibraryLevel = "basic" | "medium" | "pro";
export type LibraryFilter = "all" | LibraryLevel;
export type NavigationVariant = "business" | "portfolio" | "services" | "product" | "editorial";
export type LibraryGroup = "Sections" | "Elements" | "Assets";
export type LibraryComponent = {id:string;version:number;name:string;category:string;group:LibraryGroup;level:LibraryLevel;description:string;variant:string;features:string[];
 /** Imported designs carry their finished section; built-in ones are created in component-instance.ts. */
 preset?:{type:string;title?:string;data:Record<string,unknown>;studio_style?:Record<string,unknown>;section_style?:Record<string,unknown>};imported?:boolean};
export const componentCatalog:LibraryComponent[] = [
 ...modernComponents,
 {id:"nav-classic",version:2,name:"Northstar / Business",category:"Navigation",group:"Sections",level:"basic",description:"A confident business header with a clear next step.",variant:"business",features:["Brand and links","Primary button","Mobile menu"]},
 {id:"nav-centered",version:2,name:"Atelier / Portfolio",category:"Navigation",group:"Sections",level:"basic",description:"An editorial wordmark, quiet navigation and a warm, expressive canvas.",variant:"portfolio",features:["Centered brand","Contact button","Mobile menu"]},
 {id:"nav-split",version:2,name:"Forma / Services",category:"Navigation",group:"Sections",level:"medium",description:"A practical header with a colour accent bar and a booking button.",variant:"services",features:["Colour accent bar","Booking button","Mobile menu"]},
 {id:"nav-floating",version:2,name:"Orbit / Product",category:"Navigation",group:"Sections",level:"pro",description:"A floating header that stays at the top while visitors scroll, with a clear action button.",variant:"product",features:["Floating header that stays on top","Primary button","Mobile menu"]},
 {id:"nav-editorial",version:2,name:"Fieldnotes / Editorial",category:"Navigation",group:"Sections",level:"pro",description:"A centered publication masthead with a subscribe button.",variant:"editorial",features:["Centered masthead","Subscribe button","Mobile menu"]},
 {id:"nav-conference",version:1,name:"Summit / Conference",category:"Navigation",group:"Sections",level:"basic",description:"A frosted header that stays at the top while visitors scroll, with a Register button.",variant:"conference",features:["Stays at the top","Register button","Mobile menu"]},
 {id:"nav-dark",version:1,name:"Nightfall / Dark",category:"Navigation",group:"Sections",level:"basic",description:"A dark header for dark themes and image-led pages that stays at the top.",variant:"dark",features:["Dark bar","Stays at the top","Mobile menu"]},
 {"id": "hero-split", "version": 1, "name": "Split hero", "category": "Hero", "group": "Sections", "level": "basic", "description": "Headline, supporting copy and visual in a balanced split layout.", "variant": "hero", "features": []},
 {"id": "about-story", "version": 1, "name": "Our story", "category": "About", "group": "Sections", "level": "basic", "description": "A focused introduction with space for your story.", "variant": "about", "features": []},
 {"id": "features-grid", "version": 1, "name": "Service cards", "category": "Features", "group": "Sections", "level": "basic", "description": "Three services with icons and short descriptions.", "variant": "features", "features": []},
 {"id": "gallery-grid", "version": 1, "name": "Image grid", "category": "Gallery", "group": "Sections", "level": "medium", "description": "A responsive visual grid with image captions.", "variant": "gallery", "features": []},
 {"id": "team-grid", "version": 1, "name": "People cards", "category": "Team", "group": "Sections", "level": "medium", "description": "Portrait placeholders, names and roles.", "variant": "team", "features": []},
 {"id": "pricing-cards", "version": 1, "name": "Pricing comparison", "category": "Pricing", "group": "Sections", "level": "pro", "description": "Three plans with features and calls to action.", "variant": "pricing", "features": []},
 {"id": "abstract-form", "version": 1, "name": "Abstract submission", "category": "Contact", "group": "Sections", "level": "pro", "description": "Title, track, authors, abstract with a word limit and a PDF/Word file. Each submission gets an ID.", "variant": "abstract-form", "features": ["File upload", "Word limit"]},
 {"id": "schedule-days", "version": 1, "name": "Schedule by day", "category": "Agenda", "group": "Sections", "level": "medium", "description": "Sessions grouped by day, with time, room, track and speaker.", "variant": "schedule", "features": ["Grouped by day","Time, room and track","Speaker names"]},
 {"id": "sponsors-tiers", "version": 1, "name": "Sponsors by tier", "category": "Sponsors", "group": "Sections", "level": "medium", "description": "Sponsor logos grouped by tier, the top tier largest, each linking out to the sponsor website.", "variant": "sponsor_tiers", "features": ["Grouped by tier","Logos that link out","Name shown until a logo is added"]},
 {"id": "key-dates", "version": 1, "name": "Key dates", "category": "Agenda", "group": "Sections", "level": "basic", "description": "Deadlines and event dates from Event details, in date order. Past dates fade.", "variant": "key-dates", "features": ["From Event details"]},
 {"id": "faq-list", "version": 1, "name": "FAQ accordion", "category": "FAQ", "group": "Sections", "level": "basic", "description": "Expandable questions and answers.", "variant": "faq", "features": []},
 {"id": "contact-centered", "version": 1, "name": "Contact · centered card", "category": "Contact", "group": "Sections", "level": "basic", "description": "A centered form card with your details below.", "variant": "contact-centered", "features": []},
 {"id": "contact-inline", "version": 1, "name": "Contact · compact row", "category": "Contact", "group": "Sections", "level": "basic", "description": "Short fields in one row, ideal for quick enquiries.", "variant": "contact-inline", "features": []},
 {"id": "contact-image", "version": 1, "name": "Contact · with image", "category": "Contact", "group": "Sections", "level": "medium", "description": "An image or map beside the form.", "variant": "contact-image", "features": []},
 {"id": "contact-dark", "version": 1, "name": "Contact · dark band", "category": "Contact", "group": "Sections", "level": "medium", "description": "A full-width dark section with the form.", "variant": "contact-dark", "features": []},
 {"id": "registration-form", "version": 1, "name": "Registration with payment", "category": "Pricing", "group": "Sections", "level": "pro", "description": "Registration types with early-bird prices, add-ons, discount codes and a payment step.", "variant": "registration", "features": []},
 {"id": "form-button", "version": 1, "name": "Button that opens a form", "category": "Contact", "group": "Elements", "level": "basic", "description": "A button that opens your form in a popup.", "variant": "form-button", "features": []},
 {"id": "contact-form", "version": 1, "name": "Contact · details beside form", "category": "Contact", "group": "Sections", "level": "medium", "description": "Labeled fields and a clear submit action.", "variant": "contact", "features": []},
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
