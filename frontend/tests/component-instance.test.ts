import {test} from "node:test";
import assert from "node:assert/strict";
import {componentCatalog} from "../src/features/studio/component-catalog";
import {instantiateComponent} from "../src/features/studio/component-instance";
import {readDocument,legacySections} from "../src/features/studio/document";
test("every library entry becomes a persistable existing editor component",()=>{
 const allowed=new Set(["navbar","hero","about","features","gallery","speakers","pricing","faq","contact","footer","custom","image"]);
 const instances=componentCatalog.map(c=>instantiateComponent(c,"My brand"));
 assert.equal(new Set(instances.map(c=>c.id)).size,instances.length);
 for(const item of instances){assert.ok(allowed.has(item.type));assert.ok(item.data);assert.ok(item.library.id)}
 assert.deepEqual(legacySections(readDocument(instances)),instances);
});
test("repeated additions are independent and brand propagates",()=>{
 const item=componentCatalog[0],a=instantiateComponent(item,"Sample"),b=instantiateComponent(item,"Other");
 assert.notEqual(a.id,b.id);assert.equal(a.data.brand_name,"Sample");a.data.brand_name="Changed";assert.equal(b.data.brand_name,"Other");
});
test("custom text escapes user supplied markup",()=>{const item=componentCatalog.find(c=>c.id==="text-heading")!;const instance=instantiateComponent(item,'<script>alert(1)</script>');assert.ok(String(instance.data.html).includes('&lt;script&gt;'));assert.ok(!String(instance.data.html).includes('<script>'))});
