import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const ctx={};vm.runInNewContext(fs.readFileSync(new URL('../public/allergy-core.js',import.meta.url),'utf8'),ctx);const A=ctx.CafeteriaAllergy,plain=x=>JSON.parse(JSON.stringify(x));
test('numeric codes, circled numbers and aliases normalize without 1/11 confusion',()=>{assert.deepEqual(plain(A.normalize('①②/5.6, 계란, 소고기')),['난류','대두','밀','쇠고기','우유'].sort());assert.deepEqual(plain(A.normalize('11')),['복숭아']);});
test('student record formats and custom allergens remain supported',()=>{assert.deepEqual(plain(A.normalize({milk:true,'땅콩':false,'기타':['키위']})),['우유','키위']);assert.deepEqual(plain(A.normalize('없음')),[]);});
test('food-level metadata only blocks matching foods',()=>{const s=A.evaluate(['우유'],{밥:'밥',국:'국',김치:'반찬'},{밥:'없음',국:'우유, 대두',김치:[]});assert.equal(s[0].blocked,false);assert.equal(s[1].blocked,true);assert.equal(s[2].blocked,false);assert.deepEqual(plain(A.sanitize([2,3,1],s)),[2,0,1]);});
test('legacy flat metadata matches conservatively without guessing which dish contains it',()=>{const s=A.evaluate(['우유'],{},['우유','대두']);assert(s.every(x=>x.blocked&&x.global));});
test('unknown dish metadata is blocked for allergic students',()=>{assert(A.evaluate(['난류'],{},null).every(x=>x.blocked&&x.unknown));assert(A.evaluate(['난류'],{},[]).every(x=>x.blocked));assert.equal(A.evaluate(['난류'],{밥:'밥(1.2)'},null)[0].blocked,true);});
test('students with no registered allergies retain current food selection',()=>{assert(A.evaluate([],{},null).every(x=>!x.blocked));});
test('annotated meal codes add to explicit metadata',()=>{assert.equal(A.evaluate(['새우'],{밥:'볶음밥(9)'},{밥:[],국:[],김치:[]})[0].blocked,true);});
test('buckwheat and wheat, peanuts and walnuts remain distinct',()=>{assert.equal(A.evaluate(['밀'],{}, {밥:'메밀',국:'우유',김치:'없음'})[0].blocked,false);assert.equal(A.evaluate(['땅콩'],{}, {밥:'호두',국:'없음',김치:'없음'})[0].blocked,false);});

test('parenthesized allergen labels still match the registered food',()=>{assert.deepEqual(plain(A.normalize('난류(계란), 우유(2), (땅콩)')),['난류','땅콩','우유']);});
