import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../public/tray/live.js',import.meta.url),'utf8').split('// End automatic seat return core.')[0];
const context={AbortSignal};vm.runInNewContext(code,context);
const release=context.TraySeatReturn.release;
const entry={id:'scan-1',studentId:'student_A',date:'2026-10-18',createdAt:'2026-10-18T03:30:00Z'};
const visit={status:'seated',seatId:'T1_s2',groupId:'group1',checkedInAt:Date.parse('2026-10-18T03:00:00Z'),dispatch:{id:'dispatch-1',status:'processing'}};
function fixture({state=visit,readStatus=200,writeStatus=200,etag='"v1"',onWrite}={}){
 const calls=[];const request=async(url,options={})=>{calls.push({url,...options});if(options.method==='PUT'){onWrite?.(options);return new Response('{}',{status:writeStatus});}return new Response(JSON.stringify(state),{status:readStatus,headers:etag?{ETag:etag}:{}});};
 return {calls,run:(data=entry)=>release(data,{base:'https://example.test',request})};
}
test('active student seat is conditionally released with existing fields preserved',async()=>{
 const f=fixture();assert.equal((await f.run()).status,'released');assert.equal(f.calls.length,2);assert.match(f.calls[0].url,/days\/2026-10-18\/arrivals\/student_A.json$/);assert.equal(f.calls[0].headers['X-Firebase-ETag'],'true');assert.equal(f.calls[1].headers['If-Match'],'"v1"');const body=JSON.parse(f.calls[1].body);assert.equal(body.status,'released');assert.equal(body.seatId,visit.seatId);assert.deepEqual(body.dispatch,visit.dispatch);assert.deepEqual(body.releasedAt,{'.sv':'timestamp'});assert.equal(body.wasteScanId,entry.id);
});
test('no seat and already returned seats are successful no-ops',async()=>{for(const state of [null,{...visit,status:'released'}]){const f=fixture({state});assert.notEqual((await f.run()).status,'released');assert.equal(f.calls.length,1);}});
test('a delayed scan never releases a newer visit',async()=>{const f=fixture({state:{...visit,checkedInAt:Date.parse(entry.createdAt)+1}});assert.equal((await f.run()).status,'newer-visit');assert.equal(f.calls.length,1);});
test('missing timestamps or ETags cannot cause unsafe writes',async()=>{for(const opts of [{state:{...visit,checkedInAt:null}},{etag:null}]){const f=fixture(opts);await assert.rejects(f.run());assert.equal(f.calls.length,1);}});
test('read and write denials remain retryable errors',async()=>{await assert.rejects(fixture({readStatus:403}).run(),/조회 실패/);await assert.rejects(fixture({writeStatus:403}).run(),/쓰기 권한/);});
test('conflict refresh protects a newly assigned seat',async()=>{
 let reads=0,writes=0;const result=await release(entry,{base:'https://example.test',request:async(url,o={})=>{if(o.method==='PUT'){writes++;return new Response('{}',{status:412});}reads++;return new Response(JSON.stringify(reads===1?visit:{...visit,checkedInAt:Date.parse(entry.createdAt)+1}),{headers:{ETag:'"'+reads+'"'}});}});assert.equal(result.status,'newer-visit');assert.equal(reads,2);assert.equal(writes,1);
});
test('a conflicting manual return is an idempotent success',async()=>{let reads=0;const result=await release(entry,{base:'https://example.test',request:async(url,o={})=>o.method==='PUT'?new Response('{}',{status:412}):new Response(JSON.stringify(++reads===1?visit:{...visit,status:'released'}),{headers:{ETag:'"v"'}})});assert.equal(result.status,'already-released');});
test('repeated conflicts are bounded and can be retried later',async()=>{const f=fixture({writeStatus:412});await assert.rejects(f.run(),/다음 재시도/);assert.equal(f.calls.length,10);});
test('invalid identities and missing scan times never make a request',async()=>{for(const change of [{studentId:'../other'},{date:'../other'},{createdAt:'bad'}]){const f=fixture();await assert.rejects(f.run({...entry,...change}));assert.equal(f.calls.length,0);}});
test('legacy anonymous waste records are saved without a seat mutation',async()=>{const f=fixture();assert.equal((await f.run({...entry,studentId:undefined})).status,'no-seat');assert.equal(f.calls.length,0);});