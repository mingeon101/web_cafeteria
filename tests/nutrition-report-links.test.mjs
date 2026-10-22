import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const admin=fs.readFileSync(new URL('../public/admin/index.html',import.meta.url),'utf8');
const functionSource=admin.slice(admin.indexOf('function nrLink('),admin.indexOf('function nrLinkMarkup'));
const emailSource=admin.slice(admin.indexOf('function nrEmailDraft('),admin.indexOf('\nfunction ',admin.indexOf('function nrEmailDraft(')+1));
function run(href,{configured='',uid='-P0FbP_R13P4uC9kX1P5',date='2026-10-22',meal='lunch'}={}){
 const context={URL,location:{href},nrEl:id=>({value:id==='nrReportBaseUrl'?configured:date}),nrMealType:()=>meal,escapeHTML:x=>x};vm.createContext(context);vm.runInContext(functionSource+emailSource,context);return{link:new URL(context.nrLink(uid)),context};
}
for(const adminUrl of ['https://test-cafeteria.netlify.app/admin/','https://test-cafeteria.netlify.app/admin/index.html','https://test-cafeteria.netlify.app/admin'])test('Netlify student route from '+adminUrl,()=>{
 const {link}=run(adminUrl);assert.equal(link.pathname,'/student/');assert.equal(link.searchParams.get('studentId'),'-P0FbP_R13P4uC9kX1P5');assert.equal(link.searchParams.get('date'),'2026-10-22');assert.equal(link.searchParams.get('meal'),'lunch');
});
for(const suffix of ['admin/','admin/index.html','admin'])test('GitHub Pages keeps /web_cafeteria/public/ from '+suffix,()=>{
 const {link}=run('https://mingeon101.github.io/web_cafeteria/public/'+suffix);assert.equal(link.pathname,'/web_cafeteria/public/student/');
});
test('admin query and hash do not leak into report links',()=>{const{link}=run('https://school.example/admin/?debug=1#settings',{meal:'dinner'});assert.equal(link.searchParams.get('debug'),null);assert.equal(link.hash,'');assert.equal(link.searchParams.get('meal'),'dinner');});
test('explicit custom viewer keeps its route/options and receives the current student',()=>{const{link}=run('https://school.example/admin/',{configured:'https://reports.example/view/?uid=old&studentId=old&date=2020-01-01&meal=lunch&period=week',uid:'new+id',meal:'dinner'});assert.equal(link.origin,'https://reports.example');assert.equal(link.pathname,'/view/');assert.equal(link.searchParams.get('uid'),null);assert.equal(link.searchParams.get('studentId'),'new+id');assert.equal(link.searchParams.get('date'),'2026-10-22');assert.equal(link.searchParams.get('meal'),'dinner');assert.equal(link.searchParams.get('period'),'week');});
test('email uses the saved report date and meal even if the form changes',()=>{const{context}=run('https://school.example/admin/',{date:'2026-10-22',meal:'lunch'});const mail=context.nrEmailDraft({studentId:'u1',studentName:'학생1',date:'2026-10-21',mealType:'dinner'});const link=new URL(mail.link);assert.equal(link.pathname,'/student/');assert.equal(link.searchParams.get('date'),'2026-10-21');assert.equal(link.searchParams.get('meal'),'dinner');assert(mail.text.includes(mail.link));assert(mail.html.includes(mail.link));});
test('default destination exists in the repository and portal points to it',()=>{assert(fs.existsSync(new URL('../public/student/index.html',import.meta.url)));const portal=fs.readFileSync(new URL('../public/link/index.html',import.meta.url),'utf8');assert(portal.includes('href="../student/"'));assert(!portal.includes('https://test-cafeteria.netlify.app/student.html'));});
