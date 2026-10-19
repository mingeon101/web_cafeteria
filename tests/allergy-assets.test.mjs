import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const root=new URL('../public/',import.meta.url);
for(const path of ['index.html','facelogin/index.html','facelogin/admin/index.html']){
 test(path+' defines the allergy core before use, without external allergy assets',()=>{
  const html=fs.readFileSync(new URL(path,root),'utf8');
  assert.doesNotMatch(html,/(?:src|href)=["'][^"']*allergy-(?:core|client|ui)\.(?:js|css)/);
  const script=html.match(/<script data-allergy-inline="core">([\s\S]*?)<\/script>/);assert(script);
  const normalize=text=>text.replace(/\r\n/g,'\n').trim();
  assert.equal(normalize(script[1]),normalize(fs.readFileSync(new URL('allergy-core.js',root),'utf8')));
  const context={};vm.runInNewContext(script[1],context);assert.equal(context.CafeteriaAllergy.normalize('2')[0],'우유');
  assert(html.indexOf('data-allergy-inline="core"')<html.indexOf('const firebaseConfig'));
  assert.match(html,/<style data-allergy-inline="style">[\s\S]*?\.allergy-blocked/);
  const style=html.match(/<style data-allergy-inline="style">([\s\S]*?)<\/style>/);
  assert.equal(normalize(style[1]),normalize(fs.readFileSync(new URL('allergy-ui.css',root),'utf8')));
  if(!path.includes('/admin/')){const client=html.match(/<script data-allergy-inline="client">([\s\S]*?)<\/script>/);assert(client);assert.equal(normalize(client[1]),normalize(fs.readFileSync(new URL('allergy-client.js',root),'utf8')));}
 });
}
