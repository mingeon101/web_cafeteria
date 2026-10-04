export const ZONES = {flex:'전환 가능', reservation:'예약 우선', onsite:'현장 우선'};
export const blankLayout = () => ({schemaVersion:1,name:'우리 학교 급식실',columns:24,rows:18,tables:[]});
export const footprint = t => t.rotation===90 ? {w:3,h:6} : {w:6,h:3};
export function seatsFor(t) {
  const half=t.capacity/2;
  return Array.from({length:t.capacity},(_,i)=>{
    const x=1+(i%half)*4/Math.max(1,half-1),y=i<half?0.35:2.65;
    return {id:`${t.id}_s${i+1}`,number:i+1,x:t.x+(t.rotation===90?3-y:x),y:t.y+(t.rotation===90?x:y)};
  });
}
export function validate(layout) {
  if(layout.schemaVersion!==1)throw Error('지원하지 않는 배치도 형식입니다.');
  if(typeof layout.name!=='string'||!layout.name.trim()||layout.name.length>60)throw Error('배치도 이름은 1~60자로 입력하세요.');
  for(const k of ['columns','rows'])if(!Number.isInteger(layout[k])||layout[k]<6||layout[k]>60)throw Error('가로·세로는 6~60칸으로 입력하세요.');
  if(!Array.isArray(layout.tables)||layout.tables.length>100)throw Error('테이블은 최대 100개까지 배치할 수 있습니다.');
  const ids=new Set(),labels=new Set();
  for(const t of layout.tables){
    if(!/^t_[a-zA-Z0-9_-]+$/.test(t.id)||ids.has(t.id))throw Error('테이블 ID가 잘못되었거나 중복되었습니다.');ids.add(t.id);
    if(typeof t.label!=='string'||!t.label.trim()||t.label.length>20||labels.has(t.label.trim()))throw Error('테이블 이름은 서로 다르게 1~20자로 입력하세요.');labels.add(t.label.trim());
    if(![2,4,6,8].includes(t.capacity)||![0,90].includes(t.rotation)||!Object.hasOwn(ZONES,t.zone))throw Error('테이블 설정이 올바르지 않습니다.');
    const {w,h}=footprint(t);
    if(!Number.isInteger(t.x)||!Number.isInteger(t.y)||t.x<0||t.y<0||t.x+w>layout.columns||t.y+h>layout.rows)throw Error(`${t.label}: 급식실 경계를 벗어납니다.`);
  }
  for(let i=0;i<layout.tables.length;i++)for(let j=i+1;j<layout.tables.length;j++){
    const a=layout.tables[i],b=layout.tables[j],af=footprint(a),bf=footprint(b);
    if(a.x<b.x+bf.w&&a.x+af.w>b.x&&a.y<b.y+bf.h&&a.y+af.h>b.y)throw Error(`${a.label}와 ${b.label}의 좌석 영역이 겹칩니다.`);
  }
  return layout;
}
export function addTable(layout,capacity=4){
  const labels=new Set(layout.tables.map(t=>t.label));let n=1;while(labels.has(`T${n}`))n++;
  const table={id:`t_${crypto.randomUUID()}`,label:`T${n}`,x:0,y:0,capacity,rotation:0,zone:'flex'};
  for(let y=0;y<=layout.rows-3;y++)for(let x=0;x<=layout.columns-6;x++){
    table.x=x;table.y=y;
    try{const next=structuredClone(layout);next.tables.push({...table});validate(next);return next;}catch{}
  }
  throw Error('테이블을 놓을 공간이 없습니다. 배치도 크기를 늘리거나 테이블을 옮겨주세요.');
}
export function updateTable(layout,id,patch){
  const next=structuredClone(layout),t=next.tables.find(t=>t.id===id);if(!t)throw Error('테이블을 선택하세요.');
  Object.assign(t,patch);validate(next);return next;
}
export function toRecord(layout){
  validate(layout);if(!layout.tables.length)throw Error('저장하려면 테이블을 한 개 이상 추가하세요.');
  return {schemaVersion:1,name:layout.name.trim(),columns:layout.columns,rows:layout.rows,totalSeats:layout.tables.reduce((sum,t)=>sum+t.capacity,0),tables:Object.fromEntries(layout.tables.map(t=>[t.id,{...t,label:t.label.trim(),seats:Object.fromEntries(seatsFor(t).map(s=>[s.id,s]))}]))};
}
export function fromRecord(record){
  if(!record||typeof record!=='object')throw Error('배치도 데이터를 읽을 수 없습니다.');
  const layout={schemaVersion:record.schemaVersion,name:record.name,columns:record.columns,rows:record.rows,tables:Object.values(record.tables||{}).map(({seats,...t})=>t)};
  return validate(layout);
}
