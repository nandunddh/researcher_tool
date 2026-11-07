const assert=require('node:assert/strict');
const f=require('../web/static/studio-formatting.js');
assert.equal(f.contrast('#ffffff','#ffffff'),'#172033');
assert.equal(f.contrast('#000000','#000000'),'#ffffff');
assert.equal(f.contrast('#ffffff','#3344aa'),'#3344aa');
assert.ok(f.css({size:900,radius:-8}).includes('font-size:120px'));
assert.ok(!f.css({color:'red;position:fixed',font:'bad;'}).includes('position'));
const html=f.markup('🧬 Hi <',{style:{font:'Georgia, serif'},runs:[{start:2,end:4,style:{weight:'700'}}]});
assert.ok(html.includes('<span style="font-weight:700">Hi</span>'));
assert.ok(html.includes('&lt;'));
assert.ok(f.markup('Hello',{style:{color:'#ffffff'}},'#ffffff').includes('color:#172033'));
console.log('Client formatting: contrast, bounded styles, Unicode ranges and escaping passed.');

assert.ok(!f.markup('Hello',{style:{href:'javascript:alert(1)'}}).includes('href='));
assert.ok(f.markup('Hello',{style:{href:'#contact'}}).includes('href="#contact"'));
