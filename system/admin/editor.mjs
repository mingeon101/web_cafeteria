import {blankLayout,footprint,seatsFor,validate,addTable,updateTable,toRecord,fromRecord,ZONES} from './layout-core.mjs';
const $=id=>document.getElementById(id),cell=32;
let layout=blankLayout(),selected=null,history=[],dirty=false,store=null,busy=false,drag=null;
const message=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
function commit(next){validate(next);history.push(structuredClone(layout));if(history.length>40)history.shift();layout=next;dirty=true;render();}
function attempt(fn){try{fn();}catch(e){message(e.message,true);}}
function buttons(){ $('save').disabled=busy;$('refreshVersions').disabled=busy;$('load').disabled=busy||!$('versions').value; }
function render(){
 $('layoutName').value=layout.name;$('columns').value=layout.columns;$('rows').value=layout.rows;
 $('undo').disabled=!history.length;const count=layout.tables.reduce((n,t)=>n+t.capacity,0);$('metrics').textContent=`테이블 ${layout.tables.length}개 · 좌석 ${count}석`;
 $('saveState').textContent=dirty?'저장하지 않은 변경사항이 있습니다.':'변경사항이 없습니다.';
 const map=$('map');map.style.width=layout.columns*cell+'px';map.style.height=layout.rows*cell+'px';map.replaceChildren();$('tableList').replaceChildren();
 for(const t of layout.tables){
  const f=footprint(t),el=document.createElement('button');el.type='button';el.className='table'+(t.id===selected?' selected':'');el.dataset.id=t.id;el.dataset.zone=t.zone;
  el.style.left=t.x*cell+'px';el.style.top=t.y*cell+'px';el.style.width=f.w*cell+'px';el.style.height=f.h*cell+'px';el.setAttribute('aria-label',`${t.label}, ${t.capacity}석, ${ZONES[t.zone]}`);
  const top=document.createElement('span');top.className='top';top.textContent=t.label;Object.assign(top.style,t.rotation===90?{left:'27px',top:'12px',width:'38px',height:'164px'}:{left:'12px',top:'27px',width:'164px',height:'38px'});el.append(top);
  for(const s of seatsFor(t)){const seat=document.createElement('span');seat.className='seat';seat.textContent=String(s.number);seat.style.left=(s.x-t.x)*cell+'px';seat.style.top=(s.y-t.y)*cell+'px';el.append(seat);}
  el.addEventListener('pointerdown',e=>{if(e.button!==0)return;selected=t.id;refreshProperties();map.querySelectorAll('.table').forEach(x=>x.classList.toggle('selected',x.dataset.id===selected));el.focus();drag={id:t.id,x:e.clientX,y:e.clientY,tx:t.x,ty:t.y};el.setPointerCapture(e.pointerId);});
  el.addEventListener('pointermove',e=>{if(!drag||drag.id!==t.id)return;el.style.left=(drag.tx+Math.round((e.clientX-drag.x)/cell))*cell+'px';el.style.top=(drag.ty+Math.round((e.clientY-drag.y)/cell))*cell+'px';});
  el.addEventListener('pointerup',e=>{if(!drag||drag.id!==t.id)return;const d=drag;drag=null;const x=d.tx+Math.round((e.clientX-d.x)/cell),y=d.ty+Math.round((e.clientY-d.y)/cell);try{if(x!==d.tx||y!==d.ty)commit(updateTable(layout,t.id,{x,y}));else render();}catch(err){render();message(err.message,true);}});
  el.addEventListener('pointercancel',()=>{drag=null;render();});
  el.addEventListener('keydown',e=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.preventDefault();selected=t.id;attempt(()=>{commit(updateTable(layout,t.id,{x:t.x+delta[0],y:t.y+delta[1]}));[...map.children].find(x=>x.dataset.id===t.id)?.focus();});});
  map.append(el);const item=document.createElement('button');item.textContent=`${t.label} · ${t.capacity}석 · ${ZONES[t.zone]}`;item.onclick=()=>{selected=t.id;render();};$('tableList').append(item);
 }
 refreshProperties();buttons();
}
function refreshProperties(){const t=layout.tables.find(t=>t.id===selected);$('properties').disabled=!t;$('noSelection').hidden=!!t;if(!t)return;for(const key of ['label','capacity','zone','x','y'])$(key).value=t[key];}
$('add').onclick=()=>attempt(()=>{const next=addTable(layout,Number($('newCapacity').value));selected=next.tables.at(-1).id;commit(next);});
$('apply').onclick=()=>attempt(()=>commit(updateTable(layout,selected,{label:$('label').value.trim(),capacity:Number($('capacity').value),zone:$('zone').value,x:Number($('x').value),y:Number($('y').value)})));
$('rotate').onclick=()=>attempt(()=>{const t=layout.tables.find(t=>t.id===selected);commit(updateTable(layout,selected,{rotation:t.rotation===0?90:0}));});
$('delete').onclick=()=>{if(!selected)return;const next=structuredClone(layout);next.tables=next.tables.filter(t=>t.id!==selected);selected=null;commit(next);};
$('undo').onclick=()=>{if(!history.length)return;layout=history.pop();dirty=true;render();};
$('resize').onclick=()=>attempt(()=>commit({...layout,columns:Number($('columns').value),rows:Number($('rows').value)}));
$('layoutName').onchange=()=>attempt(()=>commit({...layout,name:$('layoutName').value.trim()}));
$('export').onclick=()=>attempt(()=>{const blob=new Blob([JSON.stringify(toRecord(layout),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cafeteria-layout.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('import').onclick=()=>$('file').click();
$('file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1e6)throw Error('1MB 이하 JSON만 불러올 수 있습니다.');const next=fromRecord(JSON.parse(await file.text()));if(dirty&&!confirm('저장하지 않은 변경사항을 교체할까요?'))return;selected=null;commit(next);message('JSON을 불러왔습니다. Firebase 저장은 별도로 진행하세요.');}catch(err){message(err.message,true);}finally{e.target.value='';}};
async function connect(){
 if(!store)store=await import('./firebase-store.mjs');
 return store;
}
async function versionList(){const entries=await (await connect()).listLayouts();$('versions').replaceChildren(new Option(entries.length?'버전을 선택하세요':'저장된 배치도가 없습니다.',''));for(const e of entries){const date=e.createdAt?new Date(e.createdAt).toLocaleString('ko-KR'):'';$('versions').add(new Option(`${e.name} / ${e.totalSeats}석 / ${date}`,e.id));}buttons();}
$('refreshVersions').onclick=async()=>{busy=true;buttons();try{await versionList();message('최근 저장 버전을 조회했습니다.');}catch(e){message('조회 실패: '+e.message,true);}finally{busy=false;buttons();}};
$('versions').onchange=buttons;
$('save').onclick=async()=>{if(busy)return;busy=true;buttons();const snapshot=structuredClone(layout);try{validate(snapshot);if(!navigator.onLine)throw Error('인터넷 연결 후 저장하세요.');message('Firebase에 저장 중입니다. 완료 전 페이지를 닫지 마세요.');const id=await (await connect()).saveLayout(snapshot);if(JSON.stringify(snapshot)===JSON.stringify(layout))dirty=false;render();message(`저장 완료 · ${snapshot.tables.reduce((n,t)=>n+t.capacity,0)}석\n버전: ${id}`);}catch(e){message('저장 실패: '+e.message,true);}finally{busy=false;buttons();}};
$('load').onclick=async()=>{if(dirty&&!confirm('저장하지 않은 변경사항을 교체하고 선택한 버전을 불러올까요?'))return;busy=true;buttons();const before=JSON.stringify(layout);try{const next=await (await connect()).loadLayout($('versions').value);if(JSON.stringify(layout)!==before){message('조회 중 편집 내용이 바뀌어 불러오기를 취소했습니다.',true);return;}history.push(structuredClone(layout));layout=next;selected=null;dirty=false;render();message('저장된 배치도를 불러왔습니다.');}catch(e){message('불러오기 실패: '+e.message,true);}finally{busy=false;buttons();}};
window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
render();
// Firebase/CDN 연결이 실패해도 로컬 배치 편집과 JSON 내보내기는 동작합니다.
connect().catch(()=>message('Firebase 연결을 확인하지 못했습니다. 배치도 편집과 JSON 저장은 사용할 수 있습니다.',true));
