/* One native-element renderer used by the editor, published pages and ZIPs. */
(function(root){
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=(v,defaultValue,min,max)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):defaultValue;
 const color=(v,fallback)=>/^#[\da-f]{6}$/i.test(v||'')?v:fallback;
 const url=v=>/^(https?:\/\/|mailto:|tel:|#|\/(?!\/))/i.test(String(v||'').trim())?String(v).trim():'#';
 const image=v=>/^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|webp|gif);base64,)/i.test(v||'')?v:'';
 const fonts=['Arial, sans-serif','Georgia, serif','system-ui, sans-serif','monospace'];
 function render(data={},editable=false,component={}){
  const columns=number(data.columns,1,1,4),gap=number(data.gap,24,0,96),mobile=number(data.mobile_columns,1,1,2);
  return `<div class="sci-native-grid" style="--sci-columns:${columns};--sci-gap:${gap}px;--sci-mobile:${mobile}">${(Array.isArray(data.nodes)?data.nodes:[]).slice(0,100).map((node,i)=>{
   const align=['left','center','right'].includes(node.align)?node.align:'left';
   const ink=color(node.color,'var(--text-main,#18233b)'),bg=color(node.background,'transparent');
   const style=`text-align:${align};font-family:${fonts.includes(node.font)?node.font:'system-ui, sans-serif'};font-size:${number(node.size,20,10,120)}px;color:${ink};background:${bg};padding:${number(node.padding,16,0,120)}px;border-radius:${number(node.radius,12,0,80)}px;grid-column:span ${number(node.span,1,1,columns)}`;
   let content='';
   if(node.kind==='button')content=`<a class="sci-native-button" href="${esc(url(node.url))}">${esc(node.text||'Button')}</a>`;
   else if(node.kind==='image')content=image(node.image)?`<img src="${esc(image(node.image))}" alt="${esc(node.alt||'')}" style="object-fit:${node.fit==='contain'?'contain':'cover'};height:${number(node.height,240,40,900)}px">`:'<div class="sci-native-placeholder">Add an image</div>';
   else if(node.kind==='divider')content='<hr>';
   else if(node.kind==='gradient')content=`<div class="sci-native-gradient" style="height:${number(node.height,180,40,900)}px;background:linear-gradient(${number(node.angle,135,0,360)}deg,${color(node.start,'#c7d2fe')},${color(node.end,'#a5f3fc')})"></div>`;
   else if(node.kind==='icon')content=`<svg aria-label="${esc(node.alt||'Decorative symbol')}" role="img" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2">${node.symbol==='circle'?'<circle cx="24" cy="24" r="18"/>':node.symbol==='diamond'?'<path d="M24 4 44 24 24 44 4 24Z"/>':'<rect x="5" y="5" width="14" height="14" rx="3"/><rect x="29" y="5" width="14" height="14" rx="3"/><rect x="5" y="29" width="14" height="14" rx="3"/><rect x="29" y="29" width="14" height="14" rx="3"/>'}</svg>`;
   else content=`<${node.kind==='heading'?'h2':'p'}>${esc(node.text||'Your text')}</${node.kind==='heading'?'h2':'p'}>`;
   const format=component.field_formats?.[JSON.stringify(['nodes',String(i),'text'])];
   if(!editable && format && root.StudioFormatting && ['heading','text','button'].includes(node.kind)) {
    content=content.replace(esc(node.text||'Your text'),root.StudioFormatting.markup(node.text||'Your text',format,node.background||component.studio_style?.background));
   }
   const imageFormat=component.image_formats?.[JSON.stringify(['nodes',String(i),'image'])];
   if(!editable && imageFormat && root.StudioFormatting && node.kind==='image') {
    content=content.replace(/style="([^"]*)"/,(_,base)=>`style="${base};${esc(root.StudioFormatting.css(imageFormat))}"`).replace(/alt="[^"]*"/,`alt="${esc(imageFormat.alt??node.alt??'')}"`);
   }
   return `<div class="sci-native-node" ${editable?`data-native-index="${i}"`:''} style="${style}">${content}</div>`;
  }).join('')}</div>`;
 }
 const css='.sci-native-grid{display:grid;grid-template-columns:repeat(var(--sci-columns),minmax(0,1fr));gap:var(--sci-gap);padding:24px;container-type:inline-size}.sci-native-node{min-width:0;overflow-wrap:anywhere}.sci-native-node h2,.sci-native-node p{font:inherit;color:inherit;margin:0;white-space:pre-wrap}.sci-native-node img{display:block;width:100%;border-radius:inherit}.sci-native-button{display:inline-block;padding:12px 24px;background:var(--primary,#5a50dc);color:white;border-radius:8px;text-decoration:none;font-size:inherit}.sci-native-placeholder{padding:36px;border:1px dashed #aab8cc;color:#64748b}.sci-native-gradient{border-radius:inherit}.sci-native-node hr{border:0;border-top:1px solid currentColor}.mobile-view .sci-native-grid{grid-template-columns:repeat(var(--sci-mobile),minmax(0,1fr))}.mobile-view .sci-native-node{grid-column:auto!important}@media(max-width:600px){.sci-native-grid{grid-template-columns:repeat(var(--sci-mobile),minmax(0,1fr))}.sci-native-node{grid-column:auto!important}}';
 function hydrate(){
  if(typeof document==='undefined')return;
  for(const data of document.querySelectorAll('script[type="application/json"][data-sci-native]')){
   try { const component=JSON.parse(data.textContent);data.previousElementSibling.innerHTML=render(component.data,false,component); } catch(_){}
  }
 }
 const api={render,css,hydrate,url,image};
 if(typeof module==='object')module.exports=api;else root.StudioBlocks=api;
})(typeof globalThis==='object'?globalThis:this);
