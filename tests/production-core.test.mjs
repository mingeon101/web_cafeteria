import test from 'node:test';
import assert from 'node:assert/strict';
import {koreaDate, validDate, orderPath, collectOrders, summarize, menuName, toCsv} from '../public/production/production-core.mjs';

const date = '2026-10-22';
const row = (foods, extra = {}) => ({date, status:'pending', grade:1, classNum:2, foods, ...extra});

test('Seoul date and lunch/dinner paths are distinct and reject impossible dates', () => {
  assert.equal(koreaDate(new Date('2026-10-21T15:30:00Z')), date);
  assert.equal(orderPath(date, 'lunch'), 'preorders/2026-10-22');
  assert.equal(orderPath(date, 'dinner'), 'preorders/2026-10-22__dinner');
  assert.equal(validDate('2026-02-30'), false); assert.equal(validDate('2028-02-29'), true);
  assert.throws(() => orderPath('2026-99-99', 'lunch')); assert.throws(() => orderPath(date, 'breakfast'));
});

test('aggregate distinct students and quantities, including fulfilled original orders, not actual servings', () => {
  const {rows,excluded} = collectOrders({
    a:row({'밥':2,'국':1,'김치':0},{name:'do not expose',pin:'1234',menuSnapshot:{'밥':'잡곡밥'}}),
    b:row({'밥':1,'국':0,'김치':3},{status:'fulfilled',actual:{'밥':100},grade:2,classNum:1}),
    c:row({'밥':1,'국':1,'김치':1},{status:'cancelled'}),
    d:row({'밥':0,'국':0,'김치':0}),
    e:row({'밥':1},{status:'unknown'}),
    f:row({'밥':1},{mealType:'dinner'})
  },date,'lunch');
  assert.deepEqual(excluded,{cancelled:1,empty:1,invalid:2});
  const s = summarize(rows); assert.equal(s.students,2); assert.equal(s.pending,1); assert.equal(s.fulfilled,1); assert.equal(s.portions,7);
  assert.equal(s.foods['밥'].total,3); assert.equal(s.foods['김치'].total,3); assert.equal(s.foods['김치'].students,1);
  assert.equal(s.classes.length,2); assert.equal(summarize(rows,'1').portions,3);
  assert.equal('name' in rows[0],false); assert.equal('pin' in rows[0],false);
});

test('legacy statuses and numeric strings work; malformed values do not silently become quantities', () => {
  const {rows,excluded} = collectOrders({
    a:row({'밥':'2','국':'0','김치':1},{status:undefined,classNum:undefined,classNo:'3'}),
    b:row({'밥':-1}), c:row({'밥':1.5}), d:row({'밥':true}), e:row({'밥':'1e3'}), f:row({'밥':10001}),
    g:row({'밥':1},{date:'2026-10-21'}), h:null
  },date,'lunch');
  assert.equal(rows.length,1); assert.equal(rows[0].classNum,3); assert.equal(excluded.invalid,7);
  assert.deepEqual(collectOrders(null,date,'lunch').rows,[]); assert.throws(() => collectOrders([],date,'lunch'));
});

test('unknown class rows stay visible, sorted last, and class sums equal top-level totals', () => {
  const {rows} = collectOrders({a:row({'밥':2}),b:row({'김치':1},{grade:null,classNum:null}),c:row({'국':3},{grade:1,classNum:1})},date,'lunch');
  const s=summarize(rows); assert.equal(s.classes.at(-1).grade,null); assert.equal(s.classes[0].classNum,1);
  assert.equal(summarize(rows,'unknown').students,1);
  for (const key of ['밥','국','김치']) assert.equal(s.classes.reduce((n,c)=>n+c.foods[key],0),s.foods[key].total);
});

test('historical/future plans never label a different date with the current menu', () => {
  const food = {key:'김치',names:[]}, menu = {'김치':'배추김치'};
  assert.equal(menuName(food,menu,date,'lunch',date).name,'배추김치');
  assert.equal(menuName(food,menu,'2026-10-21','lunch',date).name,'메뉴명 미등록');
  assert.equal(menuName(food,menu,date,'dinner',date).name,'메뉴명 미등록');
  assert.equal(menuName(food,{...menu,date},date,'dinner',date).name,'배추김치');
  const mixed = menuName({...food,names:['나물','김치']},menu,date,'lunch',date);
  assert.equal(mixed.mixed,true); assert.equal(mixed.source,'신청 당시 메뉴');
});

test('CSV is Korean Excel compatible, quoted, and protects formula-like menu text', () => {
  const csv = toCsv([['반찬','나물,볶음','a"b','=1+2','\t@SUM(A1)']]);
  assert(csv.startsWith('\ufeff')); assert(csv.includes('"나물,볶음"')); assert(csv.includes('"a""b"'));
  assert(csv.includes('"\'=1+2"')); assert(csv.includes('"\'\t@SUM(A1)"'));
});
