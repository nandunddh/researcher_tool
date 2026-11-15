"use client";
import { modernPreset } from "./modern-presets";
import { Icon } from "@/components/icon";
import { NavigationPreview } from "./navigation-preview";
import type { LibraryComponent,NavigationVariant } from "./component-catalog";
export function SectionPreview({item,brand,accent,logo,interactive=true}:{item:LibraryComponent;brand?:string;accent?:string;logo?:string;interactive?:boolean}){
 if(item.variant.startsWith("modern-")) {
  const preset=modernPreset(item.variant,brand);
  return <section className="modern-preset-preview" aria-label={`${item.name} preview`} style={{display:"grid",gridTemplateColumns:`repeat(${preset.columns}, minmax(0,1fr))`,gap:16,padding:24,background:"#fff"}}>
   <style>{`.modern-preset-preview>div{min-width:0;overflow-wrap:anywhere}.modern-preset-preview h2,.modern-preset-preview p{margin:0;font:inherit;white-space:pre-wrap;color:inherit}@media(max-width:600px){.modern-preset-preview{grid-template-columns:1fr!important}.modern-preset-preview>div{grid-column:auto!important}}`}</style>
   {preset.nodes.map((node,i)=><div key={i} style={{gridColumn:`span ${node.span}`,padding:node.padding,borderRadius:node.radius,background:node.background,color:node.color,fontSize:node.size,fontFamily:"system-ui, sans-serif",textAlign:node.align}}>
    {node.kind==="heading"?<h2>{node.text}</h2>:node.kind==="button"?<button type="button" style={{padding:"12px 24px",border:0,borderRadius:8,background:accent||"#5a50dc",color:"white",font:"inherit"}}>{node.text}</button>:<p>{node.text}</p>}
   </div>)}
  </section>;
 }
 if(item.category==="Navigation")return <NavigationPreview variant={item.variant as NavigationVariant} brand={brand} accent={accent} logo={logo} interactive={interactive}/>;
 const heading=brand||"Make something meaningful.";
 const visual=<div className="component-visual"><Icon name="layers" size={48}/><span>Your image</span></div>;
 const button=<button type="button" className="component-action">Get started <Icon name="external" size={14}/></button>;
 return <section className={`component-sample component-${item.variant}`} style={accent?{"--component-accent":accent} as React.CSSProperties:undefined} aria-label={`${item.name} preview`}>
 {item.variant==="hero"&&<div className="component-columns"><div><small>INTRODUCING YOUR BRAND</small><h2>{heading}</h2><p>A clear introduction to what you do and why it matters.</p>{button}</div>{visual}</div>}
 {item.variant==="about"&&<><small>OUR STORY</small><h2>{heading}</h2><p>Share your purpose, your approach and the people behind your work. Replace this sample with your own story.</p></>}
 {item.variant==="features"&&<><small>WHAT WE DO</small><h2>Thoughtful services. Clear outcomes.</h2><div className="component-three">{["Strategy","Design","Development"].map(t=><article key={t}><Icon name="layers" size={26}/><h3>{t}</h3><p>Describe the value you bring to your customers.</p></article>)}</div></>}
 {item.variant==="gallery"&&<><h2>Selected work</h2><div className="component-three">{[1,2,3].map(n=><figure key={n}>{visual}<figcaption>Project {n}</figcaption></figure>)}</div></>}
 {item.variant==="team"&&<><h2>Meet the people</h2><div className="component-three">{[1,2,3].map(n=><article key={n}><div className="component-avatar"><Icon name="user" size={32}/></div><h3>Team member {n}</h3><p>Role / expertise</p></article>)}</div></>}
 {item.variant==="pricing"&&<><h2>A plan for your next step</h2><div className="component-three">{["Starter","Growth","Scale"].map((t,n)=><article key={t}><small>{t}</small><h2>${[19,49,99][n]}<small> / month</small></h2><p>Feature one<br/>Feature two<br/>Feature three</p><button type="button" className="component-action">Choose {t}</button></article>)}</div><small>Sample prices only. Payments are not connected.</small></>}
 {item.variant==="faq"&&<><h2>Good questions. Clear answers.</h2>{["How does it work?","Can I customize my website?","How do I get in touch?"].map(t=><details key={t}><summary>{t}</summary><p>Add your own answer here. This accordion expands and collapses.</p></details>)}</>}
 {item.variant==="contact"&&<div className="component-columns"><div><small>LET'S TALK</small><h2>Start a conversation.</h2><p>Tell us a little about your next project.</p></div><form onSubmit={e=>e.preventDefault()}><label>Name<input placeholder="Your name"/></label><label>Email<input type="email" placeholder="you@example.com"/></label><label>Message<textarea placeholder="How can we help?"/></label><button className="component-action" type="button">Send message</button><small>Preview only. No information is sent.</small></form></div>}
 {item.variant==="cta"&&<><h2>{heading}</h2><p>Give visitors one clear next step.</p>{button}</>}
 {item.variant==="footer"&&<><div className="component-three"><div><h2>{brand||"Your brand"}</h2><p>A short introduction to your business.</p></div><div><h3>Explore</h3><p>About<br/>Services<br/>Contact</p></div><div><h3>Stay connected</h3><p>hello@example.com<br/>Social links</p></div></div><hr/><small>Copyright / Privacy / Terms</small></>}
 {item.variant==="text"&&<h2>{heading}</h2>}{item.variant==="button"&&button}{item.variant==="image"&&visual}
 {item.variant==="columns"&&<div className="component-columns"><div className="component-slot">Column 1</div><div className="component-slot">Column 2</div></div>}
 {item.variant==="divider"&&<hr/>}{item.variant==="icons"&&<div className="component-icon-set">{(["grid","layers","user","search","edit","external"] as const).map(n=><Icon key={n} name={n} size={32}/>)}</div>}
 {item.variant==="svg"&&<svg viewBox="0 0 400 180" className="component-svg" role="img" aria-label="Geometric orbit illustration"><ellipse cx="200" cy="90" rx="140" ry="55" fill="none" stroke="currentColor" strokeWidth="2"/><ellipse cx="200" cy="90" rx="140" ry="55" fill="none" stroke="currentColor" strokeWidth="2" transform="rotate(-25 200 90)"/><circle cx="200" cy="90" r="35" fill="currentColor"/><circle cx="330" cy="65" r="12" fill="currentColor"/></svg>}
 {item.variant==="gradient"&&<div className="component-gradient"/>}
 </section>
}
