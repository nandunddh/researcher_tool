import { modernPreset } from "./modern-presets";
import type { LibraryComponent } from "./component-catalog";
export type ComponentInstance={id:string;type:string;title:string;data:Record<string,unknown>;library:{id:string;version:number};studio_style?:Record<string,unknown>;section_style?:Record<string,unknown>};
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function instantiateComponent(item:LibraryComponent,name="Your brand"):ComponentInstance{
 if(item.preset){const data=structuredClone(item.preset.data);if(Array.isArray(data.nodes))data.nodes=data.nodes.map(n=>({...(n as object),id:crypto.randomUUID()}));
  return {id:`comp_${crypto.randomUUID()}`,type:item.preset.type,title:item.name,data,library:{id:item.id,version:item.version},...(item.preset.studio_style?{studio_style:structuredClone(item.preset.studio_style)}:{}),...(item.preset.section_style?{section_style:structuredClone(item.preset.section_style)}:{})};}
 let type=item.variant,data:Record<string,unknown>={};
 const title={section_title:item.name,section_tag:"",section_subtitle:"Replace this sample with your own content."};
 if(item.variant.startsWith("modern-")){type="content";const preset=modernPreset(item.variant,name);data={...preset,nodes:preset.nodes.map(node=>({...node,id:crypto.randomUUID()}))};}
 else if(item.category==="Navigation"){type="navbar";data={brand_name:name,brand_mode:"text",logo_url:"",layout_variant:item.variant,links:[{label:"Home",url:"#"},{label:"About",url:"#about"},{label:"Contact",url:"#contact"}],cta_label:item.variant==="product"?"Start free":item.variant==="services"?"Book a consultation":item.variant==="editorial"?"Subscribe":"Get in touch",cta_link:"#contact"}}
 else if(type==="hero")data={eyebrow:"INTRODUCING YOUR BRAND",headline:"Make something meaningful.",subheadline:"A clear introduction to what you do and why it matters.",primary_btn_text:"Get started",primary_btn_url:"#contact",secondary_btn_text:"Learn more",secondary_btn_url:"#about",hero_image:"",layout_variant:"split"};
 else if(type==="about")data={...title,section_title:"Our story",items:[{title:"Our purpose",description:"Share your purpose and the people behind your work.",image:""}],design:"spotlight"};
 else if(type==="features")data={...title,section_title:"What we do",items:["Strategy","Design","Development"].map(title=>({title,description:"Describe the value you bring.",icon:"fa-solid fa-layer-group"}))};
 else if(type==="gallery")data={...title,section_title:"Selected work",images:[1,2,3].map(n=>({url:"",caption:`Project ${n}`}))};
 else if(type==="team"){type="speakers";data={...title,section_title:"Meet the people",speakers:[1,2,3].map(n=>({name:`Team member ${n}`,role:"Role / expertise",affiliation:"",photo:"",bio:"Add a short biography."}))}}
 else if(type==="pricing")data={...title,section_title:"Choose your plan",tiers:["Starter","Growth","Scale"].map((name,n)=>({name,price:`$${[19,49,99][n]}`,period:"/ month",description:"Sample pricing - edit before publishing",features:["Feature one","Feature two"],featured:n===1,btn_label:"Choose plan",btn_url:"#contact"}))};
 else if(type==="faq")data={...title,section_title:"Frequently asked questions",faqs:[{q:"How does it work?",a:"Add your answer here."},{q:"How can I get in touch?",a:"Use our contact details below."}]};
 else if(type==="contact"||type.startsWith("contact-")){const layout=type.split("-")[1]||"split";type="contact";data={...title,section_title:"Start a conversation",email:"hello@example.com",phone:"",location:"",btn_text:"Send message",form_layout:layout}}
 else if(type==="registration"){data={section_tag:"REGISTRATION",section_title:"Register for the conference",section_subtitle:"Choose your registration type. Prices change automatically after each deadline.",currency:"USD",early_bird_ends:"2027-03-31",standard_ends:"2027-05-31",btn_text:"Continue to payment",success_message:"",
  categories:[["academic","Academic",699,799,899],["industry","Industry",799,899,999],["student","Student",499,599,699],["virtual","Virtual",399,399,499]].map(([id,name,early,standard,late])=>({id,name,early,standard,late})),
  addons:[{id:"accommodation",name:"Accommodation (per night)",price:190,max:5},{id:"guest",name:"Accompanying person",price:300,max:5}],discount_codes:[]}}
 else if(type==="form-button"){type="form_button";data={section_title:"",btn_label:"Contact us",popup_title:"Send us a message",popup_text:"We usually reply within two working days.",submit_label:"Send"}}
 else if(type==="footer")data={brand_name:name,tagline:"A short introduction to your business.",copyright:"Your copyright text",links:[{label:"Privacy",url:"#privacy"},{label:"Terms",url:"#terms"}]};
 else if(type==="image")data={image_url:"",caption:"Your image"};
 else if(type==="cta"){type="hero";data={headline:"Ready for your next step?",subheadline:"Give visitors one clear action.",layout_variant:"text_only",primary_btn_text:"Get started",primary_btn_url:"#contact",secondary_btn_text:"",hero_image:""}}
 else if(['text','button','columns','divider','icons','svg','gradient'].includes(item.variant)) {
  type='content';
  const node=(kind:string,text='')=>({id:crypto.randomUUID(),kind,text,size:kind==='heading'?36:18,padding:16});
  const nodes=item.variant==='columns'?[node('text','Column one'),node('text','Column two')]:item.variant==='icons'?[{...node('icon'),symbol:'grid'},{...node('icon'),symbol:'circle'},{...node('icon'),symbol:'diamond'}]:[item.variant==='text'?node('heading',name):item.variant==='button'?{...node('button','Get started'),url:'#contact'}:item.variant==='svg'?{...node('icon'),symbol:'circle'}:node(item.variant)];
  data={columns:item.variant==='columns'?2:item.variant==='icons'?3:1,mobile_columns:1,gap:24,nodes};
 }
 else {
  type="custom";
  const html:Record<string,string>={text:`<h2>${escape(name)}</h2>`,button:'<a class="action" href="#contact">Get started</a>',columns:'<div class="columns"><div><h3>Column 1</h3><p>Add your content.</p></div><div><h3>Column 2</h3><p>Add your content.</p></div></div>',divider:'<hr>',icons:'<div class="icons">'+[0,1,2].map(n=>`<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="${["M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z","M12 3 2 8l10 5 10-5-10-5z M2 12l10 5 10-5","M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M4 21v-3a8 8 0 0 1 16 0v3"][n]}"/></svg>`).join("")+'</div>',svg:'<svg viewBox="0 0 400 180" role="img" aria-label="Orbit illustration"><ellipse cx="200" cy="90" rx="140" ry="55" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="200" cy="90" r="35" fill="currentColor"/></svg>',gradient:'<div class="gradient"></div>'};
  data={height:["svg","gradient"].includes(item.variant)?260:180,html:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:32px;box-sizing:border-box;font:16px/1.6 system-ui;color:#5543b5;background:white}h2{margin:0;font-size:32px}.action{display:inline-block;background:#5a50dc;color:white;padding:12px 24px;border-radius:8px;text-decoration:none}.columns{display:grid;grid-template-columns:1fr 1fr;gap:24px}.columns>div{border:1px dashed #c8bdeb;padding:12px}.icons{display:flex;gap:30px}svg{max-height:180px;width:auto}hr{border:0;border-top:1px solid #dfe4ef}.gradient{height:190px;border-radius:16px;background:radial-gradient(ellipse at 15% 30%,#b7b2ff,transparent 65%),radial-gradient(ellipse at 90% 75%,#a4e8ef,transparent 65%),#f3e6f7}@media(max-width:500px){.columns{grid-template-columns:1fr}}</style></head><body>${html[item.variant]||""}</body></html>`};
 }
 return {id:`comp_${crypto.randomUUID()}`,type,title:item.name,data,library:{id:item.id,version:item.version}};
}
