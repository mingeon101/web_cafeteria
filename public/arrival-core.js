(function(global){
 'use strict';const C=global.CafeteriaSeatCore,fail=m=>{throw Error(m)},clone=x=>JSON.parse(JSON.stringify(x));
 function initialize(state,ctx){return state?clone(state):{schemaVersion:1,meta:{date:ctx.date,layoutVersionId:ctx.layoutVersionId,layout:C.normalizeLayout(ctx.layout),...C.config(ctx.config)},groups:{},memberGroups:{}};}
 function occupied(state,slotId,exceptUid){
  const held=new Set();for(const g of Object.values(state.groups||{}))if(g.status==='reserved'&&g.slotId===slotId){
   for(const [uid,id] of Object.entries(g.reservation?.assignments||{})){
    const visit=state.arrivals?.[uid];if(uid===exceptUid)continue;
    if(visit?.status==='released'&&visit.groupId===g.id)continue;held.add(id);
   }
  }
  for(const [uid,v] of Object.entries(state.arrivals||{}))if(uid!==exceptUid&&v.status==='seated')held.add(v.seatId);
  return held;
 }
 function arrive(current,ctx){
  const p=C.profile(ctx.student),now=ctx.now??Date.now();if(C.dayKey(now)!==ctx.date)fail('날짜가 바뀌었습니다. 학생을 다시 확인하세요.');
  const state=initialize(current,ctx);if(state.meta?.date!==ctx.date)fail('좌석 데이터 날짜가 맞지 않습니다.');
  state.groups??={};state.memberGroups??={};state.arrivals??={};
  const old=state.arrivals[p.uid],seats=C.allSeats(state.meta.layout),seatById=Object.fromEntries(seats.map(s=>[s.id,s]));
  if(old?.status==='seated'){if(!seatById[old.seatId])fail('기존 배정 좌석을 확인할 수 없습니다.');return {state,result:{...old,label:seatById[old.seatId].label,reused:true}};}
  if(ctx.fulfilled)return {state:current,result:{status:'fulfilled',message:'오늘 선주문은 이미 배식 처리되었습니다. 추가 좌석을 배정하지 않았습니다.'}};
  const currentGroup=state.groups[state.memberGroups[p.uid]],slotList=Object.values(state.meta.slots||{});
  const currentSlot=slotList.find(s=>C.timeAt(ctx.date,s.start)<=now&&now<C.timeAt(ctx.date,s.end));
  let groupId,seatId,slot,source;
  if(currentGroup?.status==='reserved'&&currentGroup.reservation?.assignments?.[p.uid]&&!(old?.status==='released'&&old.groupId===currentGroup.id)){
   slot=state.meta.slots[currentGroup.slotId];if(!slot)fail('예약 시간표가 없습니다.');
   if(now<C.timeAt(ctx.date,slot.start))fail(`예약 시간은 ${slot.label}입니다. 예약 시간에 다시 확인하세요.`);
   if(now<C.timeAt(ctx.date,slot.end)){
    seatId=currentGroup.reservation.assignments[p.uid];groupId=currentGroup.id;source=currentGroup.mode==='onsite'?'onsite':'reservation';
    if(!seatById[seatId])fail('예약한 좌석이 배치도에 없습니다.');
    if(occupied(state,currentGroup.slotId,p.uid).has(seatId))fail('예약 좌석을 아직 다른 학생이 이용 중입니다. 빈자리로 임의 변경하지 않고 기다립니다.');
   }
  }
  if(!seatId){
   if(!currentSlot)fail('현재 이용 가능한 급식 시간대가 아닙니다.');
   if(currentGroup?.status==='forming')fail('함께 앉기 그룹의 좌석이 아직 확정되지 않았습니다. 예약 화면에서 그룹을 확정하거나 취소한 뒤 다시 확인하세요.');
   slot=currentSlot;const held=occupied(state,slot.id,p.uid),rank={onsite:0,flex:1,reservation:2};
   const available=seats.filter(s=>!held.has(s.id)).sort((a,b)=>rank[a.zone]-rank[b.zone]||String(state.meta.layout.tables[a.tableId].label).localeCompare(String(state.meta.layout.tables[b.tableId].label),'ko',{numeric:true})||a.tableId.localeCompare(b.tableId)||a.number-b.number);
   if(!available.length)fail('지금은 만석입니다. 좌석 반납 후 다시 확인하면 빈자리를 순서대로 배정합니다.');
   seatId=available[0].id;groupId=`walkin_${p.uid}`;source='onsite';
   state.groups[groupId]={id:groupId,leaderUid:p.uid,slotId:slot.id,status:'reserved',mode:'onsite',members:{[p.uid]:p},createdAt:now,reservation:{layoutVersionId:state.meta.layoutVersionId,seatIds:[seatId],assignments:{[p.uid]:seatId},createdAt:now}};
   state.memberGroups[p.uid]=groupId;
  }
  const visit={status:'seated',groupId,slotId:slot.id,seatId,source,checkedInAt:now};state.arrivals[p.uid]=visit;
  return {state,result:{...visit,label:seatById[seatId].label,reused:false}};
 }
 function release(current,uid,now=Date.now()){
  if(!current?.arrivals?.[uid]||current.arrivals[uid].status!=='seated')fail('현재 사용 중인 좌석이 없습니다.');
  const state=clone(current);state.arrivals[uid].status='released';state.arrivals[uid].releasedAt=now;return state;
 }
 global.CafeteriaArrivalCore={arrive,release,occupied};
})(typeof window==='undefined'?globalThis:window);
