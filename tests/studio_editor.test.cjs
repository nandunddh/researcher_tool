const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('web/static/app.js','utf8');
const moduleCode = source.slice(source.indexOf('  // Editor history stores'), source.indexOf('  window.openBuilderStudio ='));
const nodes = new Map();
function element() { return {textContent:'',value:'',disabled:false,dataset:{},children:[],handlers:{},classList:{add(){},remove(){},contains(){return false;}},addEventListener(name,fn){this.handlers[name]=fn;},replaceChildren(){this.children=[];},append(child){this.children.push(child);}}; }
const studio = element();
const context = {console,crypto:require('node:crypto').webcrypto, currentSite:{name:'Demo',schema_json:[{id:'a',type:'hero',title:'Hero',data:{headline:'Original'}},{id:'b',type:'footer',title:'Footer',data:{}}],theme_config:{}},activeComponentId:null,
 document:{getElementById(id){if(!nodes.has(id)) nodes.set(id,element());return nodes.get(id);},querySelectorAll(){return [];},createElement:element,addEventListener(){}},window:{addEventListener(){}},builderStudioView:studio,studioSiteName:element(),themePrimaryColor:element(),themeAccentColor:element(),themeBgPreset:element(),labelPrimaryColor:element(),labelAccentColor:element(),inspectorContent:element(),escapeHtml:s=>String(s),saveSiteDraft(){},renderInspector(){},selectComponentForEditing(id){context.activeComponentId=id;}};
vm.createContext(context);
context.renderCanvas = () => vm.runInContext('studioRecord()',context);
vm.runInContext(moduleCode,context);
vm.runInContext('studioSaved = studioSnapshot(); studioRecord();',context);
assert.equal(vm.runInContext('studioStatus()',context),false);
context.window.duplicateStudioSection('a');
assert.equal(context.currentSite.schema_json.length,3);
assert.notEqual(context.currentSite.schema_json[1].id,'a');
context.currentSite.schema_json[1].data.headline='Independent';
assert.equal(context.currentSite.schema_json[0].data.headline,'Original');
vm.runInContext('studioTravel(-1)',context);
assert.equal(context.currentSite.schema_json.length,2);
assert.equal(vm.runInContext('studioStatus()',context),false);
vm.runInContext('studioTravel(1)',context);
assert.equal(context.currentSite.schema_json.length,3);
context.window.updateStudioStyle('a','padding','40');
assert.equal(context.currentSite.schema_json[0].studio_style.padding,'40');
assert.equal(vm.runInContext('studioSectionStyle(currentSite.schema_json[0])',context),'padding:40px');
// Simulate a section being dropped after the footer.
vm.runInContext('studioDrag = {id:"a"}',context);
const target={dataset:{compId:'b'},classList:{contains(){return true;}}};
studio.handlers.drop({preventDefault(){},target:{closest(selector){return selector.startsWith('#') ? {} : target;}}});
assert.equal(context.currentSite.schema_json.at(-1).id,'a');
vm.runInContext('studioTravel(-1)',context);
assert.equal(context.currentSite.schema_json[0].id,'a');
vm.runInContext('studioTravel(-1)',context);
context.window.updateStudioStyle('a','radius','20');
assert.equal(nodes.get('studio-redo').disabled,true);
console.log('Editor history, duplication, style updates, drag ordering and redo branching passed.');
// Saving must not overwrite edits made while the request is in flight.
(async () => {
  let completeRequest;
  context.fetch = () => new Promise(resolve => completeRequest = resolve);
  context.showToast = () => {};
  context.studioSiteName.value = context.currentSite.name;
  const saveCode = source.slice(source.indexOf('  async function saveSiteDraft('),source.indexOf('  if (btnStudioSave)'));
  vm.runInContext(saveCode,context);
  const pending = vm.runInContext('saveSiteDraft()',context);
  assert.equal(vm.runInContext('studioSaving',context),true);
  context.window.updateStudioStyle('a','radius','32');
  completeRequest({ok:true,json:async()=>({site:{name:'Stale server copy'}})});
  assert.equal(await pending,true);
  assert.equal(context.currentSite.schema_json.find(c=>c.id==='a').studio_style.radius,'32');
  assert.equal(vm.runInContext('studioStatus()',context),true);
  context.fetch = async () => ({ok:false,json:async()=>({detail:'Offline'})});
  assert.equal(await vm.runInContext('saveSiteDraft()',context),false);
  assert.equal(vm.runInContext('studioStatus()',context),true);
  console.log('Save race and failed-save dirty-state checks passed.');
})().catch(error => { console.error(error); process.exitCode=1; });
