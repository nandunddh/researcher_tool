/* Shared editor formatting rules. No HTML supplied by users is evaluated here. */
(function(root) {
  const fonts=['Inter, sans-serif','Outfit, sans-serif','Georgia, serif','Arial, sans-serif','Consolas, monospace'];
  const escape=text=>String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function contrast(background,preferred) {
    const valid=color=>/^#[0-9a-f]{6}$/i.test(color || '');
    const lum=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    if(!valid(background))return preferred||'#172033';
    const light=lum(background);
    if(valid(preferred)){const other=lum(preferred);if((Math.max(light,other)+.05)/(Math.min(light,other)+.05)>=4.5)return preferred;}
    return (light+.05)/(lum('#172033')+.05)>=4.5?'#172033':'#ffffff';
  }
  function css(style={},background) {
    const rules=[];
    for(const [key,prop,low,high] of [['size','font-size',10,120],['lineHeight','line-height',1,2.5],['radius','border-radius',0,100],['height','height',40,1200]]) if(style[key]!==undefined&&Number.isFinite(Number(style[key]))) rules.push(`${prop}:${Math.min(high,Math.max(low,Number(style[key])))}${key==='lineHeight'?'':'px'}`);
    if(fonts.includes(style.font))rules.push('font-family:'+style.font);
    if(/^#[0-9a-f]{6}$/i.test(style.color||'')){const color=background?contrast(background,style.color):style.color;rules.push('color:'+color,'-webkit-text-fill-color:'+color);}
    for(const [key,prop,values] of [['weight','font-weight',['400','500','600','700','800']],['italic','font-style',['normal','italic']],['decoration','text-decoration',['none','underline']],['fit','object-fit',['cover','contain']],['position','object-position',['center','top','bottom','left','right']]]) if(values.includes(String(style[key])))rules.push(prop+':'+style[key]);
    if(['left','center','right'].includes(style.align))rules.push('display:block','text-align:'+style.align);
    return rules.join(';');
  }
  const safeLink=value=>typeof value==='string'&&/^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(value);
  function markup(text,format={},background) {
    const chars=Array.from(text), runs=(format.runs||[]).slice(0,100).filter(r=>Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end>r.start&&r.end<=chars.length);
    const boundaries=[...new Set([0,chars.length,...runs.flatMap(r=>[r.start,r.end])])].sort((a,b)=>a-b);
    const chunks=[];
    for(let i=0;i<boundaries.length-1;i++){const start=boundaries[i],end=boundaries[i+1],style={};for(const run of runs)if(run.start<=start&&run.end>=end)Object.assign(style,run.style);const rules=css(style,background),text=escape(chars.slice(start,end).join(''));let chunk=rules?`<span style="${escape(rules)}">${text}</span>`:text;if(safeLink(style.href))chunk=`<a href="${escape(style.href)}" style="color:inherit">${chunk}</a>`;chunks.push(chunk);}
    const whole=css(format.style,background),html=chunks.join('');let result=whole?`<span style="${escape(whole)}">${html}</span>`:html;if(safeLink(format.style?.href)&&!runs.some(run=>safeLink(run.style?.href)))result=`<a href="${escape(format.style.href)}" style="color:inherit">${result}</a>`;return result;
  }
  const api={fonts,escape,contrast,css,markup};
  if(typeof module!=='undefined')module.exports=api;else root.StudioFormatting=api;
})(globalThis);
