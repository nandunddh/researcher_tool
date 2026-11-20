"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { SectionPreview } from "./section-preview";
import { componentCatalog,filterComponents,type LibraryGroup,type LibraryFilter,type LibraryComponent } from "./component-catalog";
export function ComponentThumbnail({item}:{item:LibraryComponent}){
 const container = useRef<HTMLDivElement>(null);
 const content = useRef<HTMLDivElement>(null);
 const [scale, setScale] = useState<number>();
 useEffect(() => {
  const frame = container.current;
  const preview = content.current;
  if (!frame || !preview) return;
  const fit = () => {
   if (!preview.offsetHeight) return;
   setScale(Math.min((frame.clientWidth - 24) / preview.offsetWidth, (frame.clientHeight - 24) / preview.offsetHeight));
  };
  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(frame);
  observer.observe(preview);
  return () => observer.disconnect();
 }, []);
 return (
  <div ref={container} className="navigation-thumbnail" inert aria-hidden="true">
   <div ref={content} style={{transform: `translate(-50%, -50%) scale(${scale ?? 1})`, visibility: scale === undefined ? "hidden" : "visible"}}>
    <SectionPreview item={item} interactive={false}/>
   </div>
  </div>
 );
}
export function ComponentLibrary({onClose,onAdd}:{onClose:()=>void;onAdd?:(item:LibraryComponent)=>void}){
 const [level,setLevel]=useState<LibraryFilter>("all"),[query,setQuery]=useState(""),[preview,setPreview]=useState<LibraryComponent|null>(null),[device,setDevice]=useState("desktop"),[brand,setBrand]=useState(""),[accent,setAccent]=useState(""),[logo,setLogo]=useState(""),[uploadError,setUploadError]=useState("");
 const [group,setGroup]=useState<LibraryGroup>("Sections"),[category,setCategory]=useState("All");
 const categories=["All",...new Set(componentCatalog.filter(c=>c.group===group).map(c=>c.category))];
 const items=filterComponents(level,query,group,category);
 function open(item:LibraryComponent){setPreview(item);setBrand("");setAccent("");setLogo("");setUploadError("");setDevice("desktop")}
 return <Modal wide title={preview?preview.name:"Component Library"} onClose={onClose}>{preview?<><div className="library-preview-toolbar"><button onClick={()=>setPreview(null)}><Icon name="arrow"/>All designs</button><div className="actions" aria-label="Preview device">{["desktop","mobile"].map(d=><button key={d} aria-pressed={device===d} className={device===d?"primary":""} onClick={()=>setDevice(d)}>{d==="desktop"?"Desktop":"Mobile"}</button>)}</div><span className="badge">{preview.level} / Available</span>{onAdd&&<button className="primary" onClick={()=>onAdd(preview)}><Icon name="plus"/>Add component</button>}</div><div className="library-customize"><label>Brand name<input value={brand} onChange={e=>setBrand(e.target.value)} placeholder="Try your brand name" maxLength={40}/></label><label>Accent<input type="color" aria-label="Preview accent color" value={accent||"#6356dc"} onChange={e=>setAccent(e.target.value)}/></label>{preview.category==="Navigation"&&<label>Logo image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>2*1024*1024||!["image/png","image/jpeg","image/webp"].includes(file.type)){setUploadError("Choose a PNG, JPEG or WebP image under 2 MB.");return}const reader=new FileReader();reader.onload=()=>{setLogo(String(reader.result));setUploadError("")};reader.readAsDataURL(file)}}/></label>}{logo&&<button onClick={()=>setLogo("")}>Use text logo</button>}</div>{uploadError&&<p role="alert" className="alert">{uploadError}</p>}<div className={`library-live-stage ${device==="mobile"?"mobile-stage":""}`}><SectionPreview key={`${preview.id}-${device}`} item={preview} brand={brand} accent={accent} logo={logo}/></div><p className="library-footnote">Interactive design preview. Try menus, search and mobile navigation. Changes are temporary. Buttons and forms are samples; forms and links need your own configuration before publishing.</p></>:<><div className="library-group-tabs" aria-label="Library type">{(["Sections","Elements","Assets"] as const).map(g=><button key={g} className={group===g?"primary":""} aria-pressed={group===g} onClick={()=>{setGroup(g);setCategory("All")}}>{g}</button>)}</div><div className="library-category-tabs" aria-label="Component category">{categories.map(c=><button key={c} aria-pressed={category===c} className={category===c?"category-active":""} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="library-controls"><label>Library level<select value={level} onChange={e=>setLevel(e.target.value as LibraryFilter)}>{["all","basic","medium","pro"].map(value=><option key={value} value={value}>{value.charAt(0).toUpperCase()+value.slice(1)}</option>)}</select></label><label>Search components<input placeholder="Search components..." value={query} onChange={e=>setQuery(e.target.value)}/></label></div><div className="library-section-heading"><h3>{category==="All"?group:category}</h3><small>{items.length} {items.length === 1 ? "design" : "designs"}</small></div><div className="navigation-design-grid">{items.map(item=><article className="template-card" key={item.id}><ComponentThumbnail item={item}/><div className="card-content"><div className="site-heading"><h3>{item.name}</h3><span className="badge">{item.level}</span></div><p>{item.description}</p><div className="actions"><button onClick={()=>open(item)}>Preview<Icon name="external"/></button>{onAdd&&<button className="primary" onClick={()=>onAdd(item)}><Icon name="plus"/>Add</button>}</div></div></article>)}</div>{!items.length&&<p role="status">No matching designs.</p>}</>}</Modal>
}
