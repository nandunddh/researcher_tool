import {test} from "node:test";
import assert from "node:assert/strict";
import {componentCatalog} from "../src/features/studio/component-catalog";
import {instantiateComponent} from "../src/features/studio/component-instance";
import {readDocument,legacySections} from "../src/features/studio/document";
test("every library entry becomes a persistable existing editor component",()=>{
 const allowed=new Set(["navbar","hero","about","features","gallery","speakers","pricing","faq","contact","footer","custom","image","content","form_button"]);
 const instances=componentCatalog.map(c=>instantiateComponent(c,"My brand"));
 assert.equal(new Set(instances.map(c=>c.id)).size,instances.length);
 for(const item of instances){assert.ok(allowed.has(item.type));assert.ok(item.data);assert.ok(item.library.id)}
 assert.deepEqual(legacySections(readDocument(instances)),instances);
});
test("repeated additions are independent and brand propagates",()=>{
 const item=componentCatalog.find(c=>c.id==="nav-classic")!,a=instantiateComponent(item,"Sample"),b=instantiateComponent(item,"Other");
 assert.notEqual(a.id,b.id);assert.equal(a.data.brand_name,"Sample");a.data.brand_name="Changed";assert.equal(b.data.brand_name,"Other");
});
test("text remains native editable data rather than executable HTML",()=>{const item=componentCatalog.find(c=>c.id==="text-heading")!;const instance=instantiateComponent(item,'<script>alert(1)</script>');assert.equal(instance.type,'content');assert.equal(instance.data.html,undefined);assert.equal((instance.data.nodes as {text:string}[])[0].text,'<script>alert(1)</script>')});

test("modern presets produce independent native editable layouts",()=>{
 const presets=componentCatalog.filter(c=>c.id.startsWith("modern-"));assert.equal(presets.length,11);
 for(const item of presets){const a=instantiateComponent(item,"Sample"),b=instantiateComponent(item,"Sample");assert.equal(a.type,"content");const nodes=a.data.nodes as {id:string;span:number;text:string}[];assert.ok(nodes.length>=2);assert.ok(nodes.every(n=>n.span<=Number(a.data.columns)));assert.notEqual(nodes[0].id,(b.data.nodes as {id:string}[])[0].id);assert.equal(a.data.html,undefined);}
});
