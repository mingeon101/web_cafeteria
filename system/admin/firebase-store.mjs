import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {getDatabase,ref,get,push,set,serverTimestamp,query,orderByKey,limitToLast} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import {firebaseConfig} from './firebase-config.mjs';
import {toRecord,fromRecord} from './layout-core.mjs';
const app=getApps().find(a=>a.name==='cafeteria-layout')||initializeApp(firebaseConfig,'cafeteria-layout');
const db=getDatabase(app);
export async function saveLayout(layout){
  const data=toRecord(layout);
  // 수정할 때마다 새 버전으로 저장합니다. 기존 예약에서 참조한 좌석을 덮어쓰지 않습니다.
  const target=push(ref(db,'cafeteriaLayoutEditor/layoutVersions'));
  await set(target,{...data,createdAt:serverTimestamp()});
  return target.key;
}
export async function listLayouts(){
  
  const snap=await get(query(ref(db,'cafeteriaLayoutEditor/layoutVersions'),orderByKey(),limitToLast(20)));
  return Object.entries(snap.val()||{}).reverse().map(([id,value])=>({id,name:value.name,createdAt:value.createdAt,totalSeats:value.totalSeats}));
}
export async function loadLayout(id){
  if(!/^[-_a-zA-Z0-9]+$/.test(id))throw Error('잘못된 버전 ID입니다.');
  return fromRecord((await get(ref(db,`cafeteriaLayoutEditor/layoutVersions/${id}`))).val());
}
