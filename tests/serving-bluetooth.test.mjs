import assert from 'node:assert/strict';
await import('../public/serving-bluetooth-core.js');
const Session = globalThis.CafeteriaBluetoothSession;
const encoder = new TextEncoder();
let writes = [], changes = [], parallel = 0, maximum = 0;
const s = new Session({ write: async b => { parallel++; maximum = Math.max(maximum, parallel); await new Promise(r => setTimeout(r, 2)); writes.push(new TextDecoder().decode(b)); parallel--; }, change: state => changes.push(state) });
s.receive('배식 시작\n배식 완료\n'); assert.equal(s.state, 'idle');
const counts = [2, 3, 1]; const sent = s.send(counts, { uid: 'one', key: 'k' }); counts[0] = 19; counts[2] = 19;
await assert.rejects(s.send([1, 1, 1], { uid: 'two' }), /진행 중/); await sent;
assert.deepEqual(writes, ['2\n', '1\n', '3']); assert.equal(maximum, 1); assert.equal(s.snapshot.counts[0], 2); assert.equal(s.snapshot.uid, 'one');
assert.equal(s.state, 'serving');
s.receive('배식을 시작합니다.\n'); assert.equal(s.state, 'serving');
s.receive('아직 배식 시작 안 함\n'); assert.equal(s.state, 'serving');
const bytes = encoder.encode('배식 시작\n배식 완료\n');
for (let i = 0; i < bytes.length; i++) s.receive(bytes.subarray(i, i + 1));
assert.equal(s.state, 'complete'); s.receive('배식 완료\n'); assert.equal(changes.filter(x => x === 'complete').length, 1);
writes = []; await s.send([0, 4, 0], {}, true); assert.deepEqual(writes, ['0\n', '0\n', '4']); s.fail('disconnected'); assert.equal(s.state, 'error'); s.receive('배식 시작\n배식 완료\n'); assert.equal(s.state, 'error');
let call = 0; const partial = new Session({ write: async () => { if (++call === 2) throw Error('broken'); } });
await assert.rejects(partial.send([1, 2, 3], {}), /broken/); assert.equal(call, 2); assert.equal(partial.state, 'error');
let early; let count = 0; early = new Session({ write: async () => { if (++count === 3) early.receive('배식 시작\n배식 완료\n'); } });
await early.send([1, 2, 3], {}); assert.equal(early.state, 'complete');
let blocked; blocked = new Session({ write: async () => { blocked.fail('disconnect during write'); } });
await assert.rejects(blocked.send([1, 1, 1], {})); assert.equal(blocked.state, 'error');
await assert.rejects(new Session({ write() {} }).send([1, NaN, 1], {}));
console.log('PASS ordered separate writes, frozen student/counts, zero quantities, serialized writes, duplicate submit, exact Korean messages, fragmented UTF-8, start response optional, duplicate replies, partial write/disconnect, early notifications, invalid counts.');

// The supplied Arduino sketch emits these exact messages, with Serial.println CRLF.
let legacyCompletions = 0;
const legacy = new Session({ write: async () => {}, change: state => { if (state === 'complete') legacyCompletions++; } });
await legacy.send([2, 3, 1], { uid: 'legacy' });
legacy.receive('System Initializing...\r\n');
assert.equal(legacy.state, 'serving');
const started = encoder.encode('물체 감지됨: 자동 시퀀스 시작\r\n');
for (let i = 0; i < started.length; i++) legacy.receive(started.subarray(i, i + 1));
assert.equal(legacy.state, 'serving');
legacy.receive('자동 시퀀스 종료. 대기 중...\r\n');
assert.equal(legacy.state, 'complete');
legacy.receive('자동 시퀀스 종료. 대기 중...\r\n'); assert.equal(legacyCompletions, 1);
console.log('PASS supplied Arduino sketch start/end strings, CRLF and split UTF-8; startup ignored and optional start supported.');

// Firmware with BT.parseInt(): CRLF responses and zero-valued groups.
const firmware = new Session({ write: async () => {} });
await firmware.send([0, 2, 1], { uid: 'firmware-v2' });
assert.equal(firmware.state, 'serving');
const messages = encoder.encode('배식을 완료했습니다\r\n');
for(let i=0;i<messages.length;i++) firmware.receive(messages.subarray(i,i+1));
assert.equal(firmware.state,'complete');
// Model the sketch's available()/parseInt() loop, including unconsumed separators.
let buffer = '', batches = [];
function parseIntLikeArduino(){ while(buffer.length && !/[0-9-]/.test(buffer[0])) buffer=buffer.slice(1); let token=''; while(buffer.length && /[0-9-]/.test(buffer[0])){token+=buffer[0];buffer=buffer.slice(1);} return Number(token||0); }
for(const quantities of [[2,3,1],[0,2,0]]){
  let sent=[];const wire=new Session({write:async bytes=>sent.push(new TextDecoder().decode(bytes))});
  await wire.send(quantities,{});buffer+=sent.join('');const values=[];while(values.length<3&&buffer.length)values.push(parseIntLikeArduino());
  batches.push(values);assert.equal(buffer,'','no separator remains to trigger a phantom zero at next loop');
}
assert.deepEqual(batches,[[2,1,3],[0,0,2]]);
console.log('PASS new BT responses, split UTF-8/CRLF, numeric-only ordered commands, zero groups, consecutive parseInt batches without phantom zero.');
