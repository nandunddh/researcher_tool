import type { LibraryComponent } from "./component-catalog";
export type ModernNode = {kind:string;text:string;size:number;padding:number;radius:number;span:number;color:string;background:string;align:"left"|"center";url?:string;links?:string;effect?:string;start?:string;end?:string};
const card=(kind:string,text:string,size=18,span=1,background="#f4f5fa",color="#18223b"):ModernNode=>({kind,text,size,span,background,color,padding:28,radius:20,align:"left"});
export const modernComponents:LibraryComponent[] = [
 ["mega","Conference navigation menu","Navigation","pro","A brand, a grouped list of links to tracks, speakers and registration, and a Register button."],
 ["motion","Conference hero with motion","Hero","pro","Animated gradient with reduced-motion support."],
 ["interactive-bento","Program highlights grid","Features","pro","Asymmetric cards with subtle hover elevation."],
 ["launch","Conference introduction","Hero","pro","A split layout for the event title, summary, and contact action."],
 ["bento","Scientific tracks grid","Features","pro","An asymmetric grid for the scientific tracks in your program."],
 ["process","Abstract submission steps","About","medium","Three numbered milestones with generous spacing and clear hierarchy."],
 ["metrics","Conference statistics","Features","medium","Four editable tiles for verified event figures."],
 ["quote","Participant testimonial","About","basic","An oversized editorial quote with an attribution panel."],
 ["offer","Registration pass spotlight","Pricing","pro","A single pass with its fee, inclusions, and registration action."],
 ["editorial","Research introduction","About","medium","Warm editorial typography and a spacious story layout."],
 ["contact","Organiser contact banner","CTA","basic","A dark statement panel with a bright next-step action."],
].map(([id,name,category,level,description])=>({id:`modern-${id}`,variant:`modern-${id}`,version:1,name,category,level:level as LibraryComponent["level"],description,group:"Sections",features:["Native editable elements","Responsive layout","Custom colors"]}));
export function modernPreset(variant:string,brand="Your brand") {
 let columns=3;
 let nodes:ModernNode[]=[];
 switch(variant){
 case "modern-mega":
  columns=4;
  nodes=[
   {...card("heading",brand,28,2,"#f8fafc"),padding:16,radius:8},
   {...card("menu","Program",16,1,"#f8fafc"),padding:16,radius:8,links:"Scientific tracks | #features\nSpeakers | #speakers\nContact | #contact"},
   {...card("button","Register",16,1,"#f8fafc"),padding:16,radius:8,align:"center"},
  ];
  break;
 case "modern-motion":
  nodes=[
   {...card("text","SCIENTIFIC CONFERENCE",14,3,"#eef5fb","#214362"),padding:16},
   {...card("heading","Research and discovery",56,3,"#e6f0f7","#102b43"),effect:"gradient",start:"#e9f0fb",end:"#c7e5e4"},
   {...card("text","Join keynote talks, scientific sessions, and poster presentations.",22,3,"#eef5fb","#284966"),padding:16},
   {...card("button","Register",17,1,"#eef5fb"),padding:16},
   {...card("button","Contact the organisers",17,2,"#eef5fb"),padding:16},
  ];
  break;
 case "modern-interactive-bento": nodes=[card("heading","Program highlights",42,3,"#ffffff"),{...card("heading","Keynote lectures",36,2,"#e9e3ff"),effect:"lift"},{...card("text","Poster presentations",24,1,"#dcf5ec"),effect:"lift"},{...card("text","Panel discussions",24,1,"#fff0d9"),effect:"lift"},{...card("heading","Research workshops",32,2,"#e2efff"),effect:"lift"},card("button","Discover more",18,3,"#ffffff")];break;
 case "modern-launch": nodes=[card("text",`${brand} / SCIENTIFIC CONFERENCE`,14,3,"#f0edff","#6451ca"),card("heading","Scientific research conference",56,2,"#e9e3ff"),card("text","Explore the latest research and meet colleagues working across disciplines.",22,1,"#ecf8f5"),card("button","Contact the organisers",18,3,"#ffffff")];break;
 case "modern-bento": nodes=[card("heading","Scientific tracks",40,3,"#ffffff"),card("heading","Experimental research",32,2,"#e9e3ff"),card("text","Methods and instrumentation",20,1,"#dff5ef"),card("text","Computational research",20,1,"#fff0dc"),card("heading","Research applications",30,2,"#eef2ff")];break;
 case "modern-process": nodes=[card("heading","Submit an abstract",40,3,"#ffffff"),...[["Review the guidelines","Check the submission format and eligibility requirements."],["Prepare your abstract","Summarise your objectives, methods, and results."],["Submit for review","Submit before the deadline and keep your confirmation."]].map(([h,t],i)=>card("text",`${h}\n\n${t}`,22,1,["#ece8ff","#e4f5f0","#fff0df"][i]))];break;
 case "modern-metrics": columns=4;nodes=[card("heading","Conference statistics",38,4,"#ffffff"),...["—\nScientific sessions","—\nInvited speakers","—\nPoster presentations","—\nResearch workshops"].map(t=>card("text",t,28)),card("text","Illustrative values — replace with your verified metrics.",12,4,"#ffffff")];break;
 case "modern-quote": nodes=[card("heading","“A thoughtful experience, from the first conversation to the final detail.”",40,2,"#f1ecff"),card("text","Client name\nRole / Company\n\nSample testimonial — replace with an approved customer quote.",18,1,"#f5f6fa")];break;
 case "modern-offer": nodes=[card("heading","Conference registration",44,2,"#e8e4ff"),card("heading","Registration fee",40,1,"#e5f5ef"),card("text","Pass includes\n\nScientific sessions\nPoster presentations\nConference materials",20,2),card("button","Register",18,1,"#fff0df"),card("text","Set the registration fee before publishing.",12,3,"#ffffff")];break;
 case "modern-editorial": nodes=[{...card("heading",`${brand}.\nResearch overview`,48,2,"#f6eddf"),color:"#403327"},card("text","Introduce the research themes and explain who the conference is for.",22,1,"#f8f5ef"),card("button","Contact the organisers",16,3,"#ffffff")];break;
 case "modern-contact": nodes=[card("heading","Contact the organisers",48,2,"#18223b","#ffffff"),card("text","Questions about registration, accessibility, or abstract submission?",24,1,"#e8e3ff"),card("button","Start a conversation",18,3,"#f3f0ff")];break;
 }
 return {columns,mobile_columns:1,gap:16,nodes:nodes.map(n=>n.kind==="button"?{...n,url:n.text==="Register"?"#pricing":"#contact"}:n)};
}
