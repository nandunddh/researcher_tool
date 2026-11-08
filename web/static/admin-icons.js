/* Consistent outline icons for both static and dynamically rendered admin controls. */
(()=>{
 const paths={
 user:'M20 21v-2a7 7 0 0 0-14 0v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
 building:'M4 21V5h16v16M2 21h20M8 9h1m6 0h1M8 13h1m6 0h1M10 21v-4h4v4',
 shield:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z',
 layout:'M3 3h18v18H3zM3 9h18M9 9v12',
 stop:'M7 3h10l4 4v10l-4 4H7l-4-4V7zM8 12h8',
 plus:'M12 5v14M5 12h14',
 trial:'M9 3h6M10 3v7L5 19q-1 2 2 2h10q3 0 2-2l-5-9V3M8 15h8',
 diamond:'M3 8l4-5h10l4 5-9 13zM3 8h18M8 8l4 13 4-13',
 bolt:'M13 2L3 14h9l-1 8 10-12h-9z',
 copy:'M8 8h13v13H8zM16 8V3H3v13h5',
 clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2',
 play:'M7 3l14 9-14 9z',
 edit:'M4 16L16 4l4 4L8 20H4z',
 lock:'M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3',
 trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
 check:'M5 12l4 4L19 6',
 close:'M6 6l12 12M6 18L18 6',
 info:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 11v6M12 7v1',
 warning:'M12 3L2 21h20zM12 9v5M12 17v1'
 };
 const symbols={'🛡':'shield','📑':'copy','🏢':'building','👤':'user','👥':'user','🎨':'layout','⛔':'stop','✨':'plus','🧪':'trial','💎':'diamond','⚡':'bolt','🎉':'check','📋':'copy','⏳':'clock','▶':'play','📝':'edit','🔒':'lock','🗑':'trash','ℹ':'info','✅':'check','❌':'close','⚠':'warning'};
 const pattern=new RegExp('('+Object.keys(symbols).join('|')+')\uFE0F?','gu');
 function decorate(root){
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];
   while(walker.nextNode()){const node=walker.currentNode;if(!node.parentElement?.closest('script,style,textarea,option,title,svg,[contenteditable]'))nodes.push(node);}
   for(const node of nodes){pattern.lastIndex=0;if(!pattern.test(node.data))continue;pattern.lastIndex=0;const fragment=document.createDocumentFragment();let offset=0;for(const match of node.data.matchAll(pattern)){fragment.append(node.data.slice(offset,match.index));const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','16');svg.setAttribute('height','16');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.style.cssText='display:inline-block;vertical-align:-3px;flex-shrink:0';const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[symbols[match[1]]]);svg.append(path);fragment.append(svg);offset=match.index+match[0].length;}fragment.append(node.data.slice(offset));node.replaceWith(fragment);}
 }
 const observer=new MutationObserver(records=>{observer.disconnect();for(const record of records){if(record.type==='characterData')decorate(record.target.parentNode);else for(const node of record.addedNodes)if(node.nodeType===1)decorate(node);else if(node.nodeType===3&&node.parentNode)decorate(node.parentNode);}observe();});
 function observe(){observer.observe(document.body,{childList:true,subtree:true,characterData:true});}
 decorate(document.body);observe();
})();
