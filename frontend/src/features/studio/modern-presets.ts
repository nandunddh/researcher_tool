import type { LibraryComponent } from "./component-catalog";
export type ModernNode = {kind:string;text:string;size:number;padding:number;radius:number;span:number;color:string;background:string;align:"left"|"center";url?:string};
const card=(kind:string,text:string,size=18,span=1,background="#f4f5fa",color="#18223b"):ModernNode=>({kind,text,size,span,background,color,padding:28,radius:20,align:"left"});
export const modernComponents:LibraryComponent[] = [
 ["launch","Aurora / Launch hero","Hero","pro","A bold introduction with a lavender headline panel and contrasting action."],
 ["bento","Prism / Feature grid","Features","pro","Asymmetric cards for your product benefits and standout capabilities."],
 ["process","Path / Process steps","About","medium","Three numbered milestones with generous spacing and clear hierarchy."],
 ["metrics","Signal / Statistics","Features","medium","Four crisp metric tiles with editable sample values."],
 ["quote","Voice / Testimonial","About","basic","An oversized editorial quote with an attribution panel."],
 ["offer","Scale / Pricing spotlight","Pricing","pro","One focused offer with a contrasting price and action."],
 ["editorial","Journal / Introduction","About","medium","Warm editorial typography and a spacious story layout."],
 ["contact","Connect / Contact banner","CTA","basic","A dark statement panel with a bright next-step action."],
].map(([id,name,category,level,description])=>({id:`modern-${id}`,variant:`modern-${id}`,version:1,name,category,level:level as LibraryComponent["level"],description,group:"Sections",features:["Native editable elements","Responsive layout","Custom colors"]}));
export function modernPreset(variant:string,brand="Your brand") {
 let columns=3;
 let nodes:ModernNode[]=[];
 switch(variant){
 case "modern-launch": nodes=[card("text",`${brand} / NEXT CHAPTER`,14,3,"#f0edff","#6451ca"),card("heading","A brighter idea.\nA better way forward.",56,2,"#e9e3ff"),card("text","Built for people who want to do meaningful work. Introduce your product and its value here.",22,1,"#ecf8f5"),card("button","Explore what’s possible",18,3,"#ffffff")];break;
 case "modern-bento": nodes=[card("heading","Less friction. More possibility.",40,3,"#ffffff"),card("heading","01 / Create with clarity",32,2,"#e9e3ff"),card("text","02 / Stay connected\nBring your ideas and people together.",20,1,"#dff5ef"),card("text","03 / Make it yours\nAdapt every detail to your workflow.",20,1,"#fff0dc"),card("heading","Space for your next big idea.",30,2,"#eef2ff")];break;
 case "modern-process": nodes=[card("heading","From first idea to next chapter.",40,3,"#ffffff"),...[["01 / Discover","Understand the goal. Define what success looks like."],["02 / Create","Turn the brief into something useful and distinctive."],["03 / Launch","Share your work. Learn, refine, and grow."]].map(([h,t],i)=>card("text",`${h}\n\n${t}`,22,1,["#ece8ff","#e4f5f0","#fff0df"][i]))];break;
 case "modern-metrics": columns=4;nodes=[card("heading","Your impact, at a glance.",38,4,"#ffffff"),...["120+\nProjects delivered","24\nTeam members","12\nCountries reached","98%\nSample satisfaction"].map(t=>card("text",t,28)),card("text","Illustrative values — replace with your verified metrics.",12,4,"#ffffff")];break;
 case "modern-quote": nodes=[card("heading","“A thoughtful experience, from the first conversation to the final detail.”",40,2,"#f1ecff"),card("text","Client name\nRole / Company\n\nSample testimonial — replace with an approved customer quote.",18,1,"#f5f6fa")];break;
 case "modern-offer": nodes=[card("heading","One plan.\nRoom to grow.",44,2,"#e8e4ff"),card("heading","$49\nper month",40,1,"#e5f5ef"),card("text","Your core features\n\nPersonalized workspace\nFlexible collaboration\nSupport when you need it",20,2),card("button","Explore this plan",18,1,"#fff0df"),card("text","Sample pricing. Connect the button to your checkout or contact page.",12,3,"#ffffff")];break;
 case "modern-editorial": nodes=[{...card("heading",`${brand}.\nA considered approach.`,48,2,"#f6eddf"),color:"#403327"},card("text","OUR PERSPECTIVE\n\nGood work begins with curiosity. Tell your story, share your purpose, and give visitors a reason to stay.",22,1,"#f8f5ef"),card("button","Read our story",16,3,"#ffffff")];break;
 case "modern-contact": nodes=[card("heading","Let’s make\nsomething great.",48,2,"#18223b","#ffffff"),card("text","Have an idea in mind?\nWe would love to hear it.",24,1,"#e8e3ff"),card("button","Start a conversation",18,3,"#f3f0ff")];break;
 }
 return {columns,mobile_columns:1,gap:16,nodes:nodes.map(n=>n.kind==="button"?{...n,url:"#contact"}:n)};
}
