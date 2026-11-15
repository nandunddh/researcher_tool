import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const state=require('../../backend/static/studio-state.js');
const blocks=require('../../backend/static/studio-blocks.js');
test('history captures pages and SEO, synchronizes active canvas and excludes credentials',()=>{
 const site={name:'Before',token:'secret',schema_json:[{id:'new'}],active_page_id:'home',pages:[{id:'home',schema_json:[]}],meta_config:{title:'Before'}};
 const saved=state.snapshot(site);site.name='After';site.meta_config.title='After';
 state.restore(site,saved);assert.equal(site.name,'Before');assert.equal(site.meta_config.title,'Before');assert.deepEqual(site.pages[0].schema_json,[{id:'new'}]);assert.ok(!saved.includes('secret'));
});
test('queued saves serialize and preserve the latest snapshot',async()=>{
 let release:()=>void=()=>{};const sent:number[]=[];
 const save=state.createSaver(async(p:{value:number})=>{sent.push(p.value);if(p.value===1)await new Promise<void>(r=>{release=r});});
 const first=save({value:1});save({value:2});save({value:3});release();await first;assert.deepEqual(sent,[1,3]);
});
test('failed save can be retried',async()=>{let fail=true;const save=state.createSaver(async()=>{if(fail)throw Error('offline')});await assert.rejects(save({}),/offline/);fail=false;await save({});});
test('native renderer escapes text and rejects unsafe links and images',()=>{
 const html=blocks.render({nodes:[{kind:'text',text:'<script>bad</script>'},{kind:'button',text:'Go',url:'javascript:alert(1)'},{kind:'image',image:'javascript:alert(1)'}]});assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('javascript:'));assert.ok(html.includes('href="#"'));
});
test('reordering preserves element formatting',()=>{
 const component={data:{nodes:[{id:'b'},{id:'a'}]},field_formats:{'["nodes","0","text"]':{style:{color:'#123456'}}}};
 state.reindexFormats(component,['a','b']);assert.deepEqual(component.field_formats,{'["nodes","1","text"]':{style:{color:'#123456'}}});
});
