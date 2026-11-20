const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('backend/static/app.js','utf8');
const inlineCode = source.slice(source.indexOf('  function wireStudioInlineEditing()'),source.indexOf('  // Preserve the selected viewport width;'));
function textNode(text) {
 return {dataset:{},textContent:text,children:[],classList:{add(){}},contentEditable:'false',focus(){},blur(){this.onblur?.();},get isContentEditable(){return this.contentEditable==='plaintext-only';}};
}
const headline=textNode('My conference'), nested=textNode('Alice'), ambiguous=textNode('Duplicate');
let renders=0;
const site={schema_json:[{id:'a',data:{headline:'My conference',speakers:[{name:'Alice'}],first:'Duplicate',second:'Duplicate'}}]};
const wrapper={dataset:{compId:'a'},querySelectorAll(selector){return selector.endsWith('img')?[]:[headline,nested,ambiguous];}};
const context={currentSite:site,canvasSectionsList:{querySelectorAll(){return [wrapper];}},StudioFormatting:require('../backend/static/studio-formatting.js'),reopenStudioQuick(){},selectComponentForEditing(){},renderCanvas(){renders++;},renderInspector(){},document:{createRange(){return {selectNodeContents(){}};}},window:{getSelection(){return {removeAllRanges(){},addRange(){}};}}};
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

// Test component palette selection and count badges
const paletteCode = source.slice(source.indexOf('  function updateComponentPaletteStatus()'), source.indexOf('  window.duplicateStudioSection ='));
function mockPaletteBtn(type) {
  let classes = new Set(), attrs = {}, children = [];
  return {
    getAttribute(name) { return name === 'data-type' ? type : attrs[name]; },
    setAttribute(name, val) { attrs[name] = val; },
    removeAttribute(name) { delete attrs[name]; },
    classList: {
      add(cls) { classes.add(cls); },
      remove(cls) { classes.delete(cls); },
      contains(cls) { return classes.has(cls); }
    },
    querySelector(sel) {
      if (sel === '.comp-count-badge') return children.find(c => c.className?.includes('comp-count-badge')) || null;
      if (sel === '.comp-palette-remove-quick') return children.find(c => c.className?.includes('comp-palette-remove-quick')) || null;
      return null;
    },
    appendChild(child) { children.push(child); return child; }
  };
}
const btnCustom = mockPaletteBtn('custom');
const btnHero = mockPaletteBtn('hero');
const btnFaq = mockPaletteBtn('faq');
context.currentSite = {
  schema_json: [
    { id: '1', type: 'custom' },
    { id: '2', type: 'custom' },
    { id: '3', type: 'custom' },
    { id: '4', type: 'hero' }
  ]
};
context.activeComponentId = '1';
context.document.querySelectorAll = sel => sel === '.btn-add-comp' ? [btnCustom, btnHero, btnFaq] : [];
context.document.createElement = tag => ({ className: '', textContent: '', title: '', remove() {} });
vm.runInContext(paletteCode, context);
vm.runInContext('updateComponentPaletteStatus()', context);

// Custom: added 3 times -> selected + count badge 3
assert.equal(btnCustom.classList.contains('is-added'), true);
assert.equal(btnCustom.querySelector('.comp-count-badge')?.textContent, '3');
assert.equal(btnCustom.querySelector('.comp-count-badge')?.className, 'comp-count-badge is-multiple');

// Hero: added 1 time -> selected + single checkmark badge
assert.equal(btnHero.classList.contains('is-added'), true);
assert.equal(btnHero.querySelector('.comp-count-badge')?.textContent, '✓');
assert.equal(btnHero.querySelector('.comp-count-badge')?.className, 'comp-count-badge is-single');

// FAQ: not added -> unselected, no badge
assert.equal(btnFaq.classList.contains('is-added'), false);
assert.equal(btnFaq.querySelector('.comp-count-badge'), null);
console.log('Inline commit, Escape cancel, nested fields, ambiguous fields and viewport zoom checks passed.');

// Quick Add must insert the variant on the card, even when a different design is previewed.
const quickAddSource = source.match(/^  function wirePaletteAdd\(card\) \{[\s\S]*?^  \}/m);
assert.ok(quickAddSource, 'The palette provides a quick-add handler');
const insertions = [];
const created = [];
const quickAddContext = {
  window: {studioActivePreviewType: 'navbar', studioActivePreviewVariant: 'business'},
  currentSite: {schema_json: []},
  addNewComponent(type, variant) { insertions.push([type, variant]); },
  document: {
    createElement(tag) {
      const node = {
        tag,
        children: [],
        append(...nodes) { this.children.push(...nodes); },
        setAttribute(name, value) { this[name] = value; },
        addEventListener(type, handler) { this['on' + type] = handler; },
      };
      created.push(node);
      return node;
    },
  },
};
vm.createContext(quickAddContext);
vm.runInContext(quickAddSource[0], quickAddContext);
const card = {
  dataset: {type: 'navbar', variant: 'portfolio'},
  querySelector() { return {textContent: 'Navbar · Portfolio'}; },
  replaceWith(row) { this.row = row; },
};
quickAddContext.wirePaletteAdd(card);
const row = card.row;
const add = created.find(node => node.className === 'studio-palette-add');
assert.equal(add?.tag, 'button');
assert.equal(row.className, 'studio-palette-item');
assert.equal(add['aria-label'], 'Add Navbar \u00b7 Portfolio to page');
assert.deepEqual(row.children, [card, add], 'Both actions are siblings');
const clickAdd = detail => add.onclick({detail, stopPropagation() {}, preventDefault() {}});
clickAdd(1);
clickAdd(2);
assert.deepEqual(insertions, [['navbar', 'portfolio']]);
clickAdd(0);
assert.equal(insertions.length, 2, 'Keyboard activation adds another instance');
