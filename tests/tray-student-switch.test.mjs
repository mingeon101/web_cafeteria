import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={};vm.runInNewContext(fs.readFileSync(new URL('../public/tray/live-core.js',import.meta.url),'utf8'),context);
const {Gate}=context.TrayLiveCore;
const tray={present:true,stable:true,absent:false};
function recorded(){const g=new Gate();g.hasRecorded=true;g.reset();return g;}
test('a changed confirmed student clears the removal wait and resets timers',()=>{const g=recorded();g.clearSince=100;g.stableSince=200;g.prepareStudent(true);assert.equal(g.waitClear,false);assert.equal(g.hasRecorded,false);assert.equal(g.clearSince,null);assert.equal(g.stableSince,null);assert.equal(g.step(tray,0),false);assert.equal(g.step(tray,1500),true);assert.equal(g.waitClear,true);});
test('the same student cannot bypass the wait after a recorded tray',()=>{const g=recorded();g.prepareStudent(false);assert.equal(g.waitClear,true);assert.equal(g.step(tray,0),false);assert.equal(g.step(tray,5000),false);});
test('default camera and checkbox preparation cannot bypass removal',()=>{const g=recorded();g.prepareStudent();assert.equal(g.waitClear,true);});
test('only explicit true signals a confirmed change',()=>{for(const value of ['true',1,{},null]){const g=recorded();g.prepareStudent(value);assert.equal(g.waitClear,true);}});
test('a new student still needs a stable image before recording',()=>{const g=recorded();g.prepareStudent(true);assert.equal(g.step(tray,0),false);assert.equal(g.step({...tray,stable:false},1000),false);assert.equal(g.step(tray,1200),false);assert.equal(g.step(tray,2699),false);assert.equal(g.step(tray,2700),true);});
test('unchanged student can resume normally after actual removal',()=>{const g=recorded();g.step({present:false,stable:true,absent:true},0);g.step({present:false,stable:true,absent:true},900);assert.equal(g.waitClear,false);g.prepareStudent(false);assert.equal(g.step(tray,1000),false);assert.equal(g.step(tray,2500),true);});