const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('web/static/app.js','utf8');
const inlineCode = source.slice(source.indexOf('  function wireStudioInlineEditing()'),source.indexOf('  // Preserve the selected viewport width;'));
function textNode(text) {
 return {dataset:{},textContent:text,children:[],classList:{add(){}},contentEditable:'false',focus(){},blur(){this.onblur?.();},get isContentEditable(){return this.contentEditable==='plaintext-only';}};
}
const headline=textNode('My conference'), nested=textNode('Alice'), ambiguous=textNode('Duplicate');
let renders=0;
const site={schema_json:[{id:'a',data:{headline:'My conference',speakers:[{name:'Alice'}],first:'Duplicate',second:'Duplicate'}}]};
const wrapper={dataset:{compId:'a'},querySelectorAll(selector){return selector.endsWith('img')?[]:[headline,nested,ambiguous];}};
const context={currentSite:site,canvasSectionsList:{querySelectorAll(){return [wrapper];}},StudioFormatting:require('../web/static/studio-formatting.js'),reopenStudioQuick(){},selectComponentForEditing(){},renderCanvas(){renders++;},renderInspector(){},document:{createRange(){return {selectNodeContents(){}};}},window:{getSelection(){return {removeAllRanges(){},addRange(){}};}}};
vm.createContext(context);vm.runInContext(inlineCode,context);vm.runInContext('wireStudioInlineEditing()',context);
const event={preventDefault(){},stopPropagation(){}};
assert.equal(ambiguous.ondblclick,undefined);
headline.ondblclick(event); headline.textContent='Updated conference'; headline.blur();
assert.equal(site.schema_json[0].data.headline,'Updated conference');
nested.ondblclick(event); nested.textContent='Wrong name'; nested.onkeydown({...event,key:'Escape'});
assert.equal(site.schema_json[0].data.speakers[0].name,'Alice');
nested.ondblclick(event); nested.textContent='Bob'; nested.onkeydown({...event,key:'Enter'});
assert.equal(site.schema_json[0].data.speakers[0].name,'Bob');
assert.equal(renders,3);
// Fixed viewport sizes and explicit zoom must remain independent of panel width.
const fitCode=source.slice(source.indexOf('  function fitStudioCanvas()'),source.indexOf('  const canvasResizeObserver'));
let mobile=false,tablet=false,zoom='fit';
const frame={style:{},classList:{contains(name){return name==='mobile-view'?mobile:tablet;}},parentElement:{clientWidth:1056}};
context.builderCanvasFrame=frame;context.getComputedStyle=()=>({paddingLeft:'28px',paddingRight:'28px'});
context.document.getElementById=id=>id==='studio-zoom'?{value:zoom}:{};
vm.runInContext(fitCode,context);vm.runInContext('fitStudioCanvas()',context);
assert.equal(frame.style.width,'1440px'); assert.equal(Number(frame.style.zoom),1000/1440);
tablet=true;vm.runInContext('fitStudioCanvas()',context);assert.equal(frame.style.width,'768px');assert.equal(Number(frame.style.zoom),1);
mobile=true;vm.runInContext('fitStudioCanvas()',context);assert.equal(frame.style.width,'380px');
zoom='0.75';vm.runInContext('fitStudioCanvas()',context);assert.equal(Number(frame.style.zoom),0.75);
console.log('Inline commit, Escape cancel, nested fields, ambiguous fields and viewport zoom checks passed.');
