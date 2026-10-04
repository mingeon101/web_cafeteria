/* 추가 기능 전용. 기존 학생 신청 코드의 변수와 함수를 변경하지 않습니다. */
(function(global){
  'use strict';
  const fail=message=>{throw new Error(message);};
  const copy=value=>JSON.parse(JSON.stringify(value));
  const count=value=>Object.keys(value||{}).length;
  const dayKey=(now=Date.now())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(now);
  const timeAt=(date,time)=>Date.parse(`${date}T${time}:00+09:00`);
  function profile(p){
    if(!p||!/^[-_a-zA-Z0-9]+$/.test(p.uid||''))fail('학생 식별 정보를 확인하세요.');
    const result={uid:p.uid,name:String(p.name||'학생').slice(0,60),grade:Number(p.grade),classNum:Number(p.classNum),number:Number(p.number)};
    if(![result.grade,result.classNum,result.number].every(n=>Number.isInteger(n)&&n>0&&n<1000))fail('학년·반·번호를 확인하세요.');
    return result;
  }
  function config(raw){
    if(!raw||raw.enabled!==true)fail('좌석예약 시간표가 아직 열리지 않았습니다. 설정 안내에 따라 시간표를 등록하세요.');
    const slots=Object.entries(raw.slots||{}).map(([id,s])=>({id,label:String(s.label||`${s.start} ~ ${s.end}`).slice(0,60),start:s.start,end:s.end})).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
    if(!slots.length||slots.length>20)fail('예약 시간대를 1~20개 등록하세요.');
    for(let i=0;i<slots.length;i++){
      const s=slots[i];
      if(!/^[-_a-zA-Z0-9]+$/.test(s.id)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.end)||s.start>=s.end)fail('예약 시간표 형식을 확인하세요.');
      if(i&&slots[i-1].end>s.start)fail('예약 시간대가 서로 겹칩니다.');
    }
    const maxFriends=raw.maxFriends??7,minOnsiteSeats=raw.minOnsiteSeats??0;
    if(!Number.isInteger(maxFriends)||maxFriends<0||maxFriends>7)fail('친구 수 제한은 0~7명이어야 합니다.');
    if(!Number.isInteger(minOnsiteSeats)||minOnsiteSeats<0)fail('현장 최소 좌석 수를 확인하세요.');
    return {slots:Object.fromEntries(slots.map(s=>[s.id,s])),maxMembers:maxFriends+1,minOnsiteSeats};
  }
  function normalizeLayout(raw){
    if(raw?.schemaVersion!==1||!raw.tables)fail('배치도 편집기에서 먼저 배치도를 저장하세요.');
    const tables=copy(raw.tables),all=new Set();
    if(!Number.isInteger(raw.columns)||!Number.isInteger(raw.rows)||raw.columns<6||raw.rows<6||raw.columns>60||raw.rows>60||!count(tables)||count(tables)>100)fail('배치도 크기가 올바르지 않습니다.');
    for(const [id,t] of Object.entries(tables)){
      if(t.id!==id||!/^t_[-_a-zA-Z0-9]+$/.test(id)||![0,90].includes(t.rotation)||![2,4,6,8].includes(t.capacity)||!['flex','reservation','onsite'].includes(t.zone))fail('테이블 설정을 확인하세요.');
      if(!Number.isInteger(t.x)||!Number.isInteger(t.y)||t.x<0||t.y<0||t.x+(t.rotation===90?3:6)>raw.columns||t.y+(t.rotation===90?6:3)>raw.rows)fail('배치도에 경계를 벗어난 테이블이 있습니다.');
      const seats={};for(let i=0;i<t.capacity;i++){
        const half=t.capacity/2,x=1+(i%half)*4/Math.max(1,half-1),y=i<half?.35:2.65,seatId=`${id}_s${i+1}`;
        seats[seatId]={id:seatId,number:i+1,x:t.x+(t.rotation===90?3-y:x),y:t.y+(t.rotation===90?x:y)};all.add(seatId);
      }
      t.seats=seats;t.label=String(t.label||id).slice(0,20);
    }
    const list=Object.values(tables);for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
      const a=list[i],b=list[j],aw=a.rotation===90?3:6,ah=a.rotation===90?6:3,bw=b.rotation===90?3:6,bh=b.rotation===90?6:3;
      if(a.x<b.x+bw&&a.x+aw>b.x&&a.y<b.y+bh&&a.y+ah>b.y)fail('배치도에 겹친 테이블이 있습니다.');
    }
    return {schemaVersion:1,name:String(raw.name||'급식실').slice(0,60),columns:raw.columns,rows:raw.rows,tables,totalSeats:all.size};
  }
  function allSeats(layout){return Object.values(layout.tables).flatMap(t=>Object.values(t.seats).map(s=>({...s,tableId:t.id,label:`${t.label}-${s.number}`,zone:t.zone})));}
  function connected(layout,ids){
    if(!ids.length)return false;const seats=Object.fromEntries(allSeats(layout).map(s=>[s.id,s]));if(ids.some(id=>!seats[id]))return false;
    const adjacent=(a,b)=>{
      if(a.tableId===b.tableId){const half=layout.tables[a.tableId].capacity/2,ai=a.number-1,bi=b.number-1;return (Math.floor(ai/half)===Math.floor(bi/half)&&Math.abs(ai-bi)===1)||Math.abs(ai-bi)===half;}
      const t=layout.tables[a.tableId],u=layout.tables[b.tableId],tw=t.rotation===90?3:6,th=t.rotation===90?6:3,uw=u.rotation===90?3:6,uh=u.rotation===90?6:3;
      const dx=Math.max(0,t.x-(u.x+uw),u.x-(t.x+tw)),dy=Math.max(0,t.y-(u.y+uh),u.y-(t.y+th));
      const tableNear=(dx<=1&&Math.min(t.y+th,u.y+uh)>Math.max(t.y,u.y))||(dy<=1&&Math.min(t.x+tw,u.x+uw)>Math.max(t.x,u.x));
      return tableNear&&Math.hypot(a.x-b.x,a.y-b.y)<=3.25;
    };
    const seen=new Set([ids[0]]),queue=[ids[0]];
    while(queue.length){const a=queue.shift();for(const b of ids)if(!seen.has(b)&&adjacent(seats[a],seats[b])){seen.add(b);queue.push(b);}}
    return seen.size===ids.length;
  }
  const pending=g=>Object.values(g.invites||{}).filter(i=>i.status==='pending');
  function occupied(state,slotId,except){const result={};for(const g of Object.values(state.groups||{}))if(g.id!==except&&g.status==='reserved'&&g.slotId===slotId)for(const id of g.reservation.seatIds)result[id]=g.id;return result;}
  function invitations(state,uid,now=Date.now()){return Object.values(state?.groups||{}).filter(g=>g.status==='forming'&&g.invites?.[uid]?.status==='pending'&&timeAt(state.meta.date,state.meta.slots[g.slotId].start)>now);}
  function cancel(state,g,now){g.status='cancelled';g.updatedAt=now;for(const uid of Object.keys(g.members||{}))if(state.memberGroups[uid]===g.id)delete state.memberGroups[uid];for(const i of Object.values(g.invites||{}))if(i.status==='pending')i.status='cancelled';delete g.reservation;}
  function apply(current,action,context){
    const now=context.now??Date.now(),actor=profile(action.actor);
    if(context.date!==dayKey(now))fail('날짜가 변경되었습니다. 새로고침 후 다시 진행하세요.');
    let state=current?copy(current):{schemaVersion:1,meta:{date:context.date,layoutVersionId:context.layoutVersionId,layout:normalizeLayout(context.layout),...config(context.config)},groups:{},memberGroups:{}};
    state.groups=state.groups||{};state.memberGroups=state.memberGroups||{};
    if(state.schemaVersion!==1||state.meta.date!==context.date)fail('예약 데이터의 날짜나 버전을 확인하세요.');
    const own=state.groups[state.memberGroups[actor.uid]],g=state.groups[action.groupId];
    const open=group=>{if(!group||group.status!=='forming')fail('모집 중인 그룹이 아닙니다.');if(timeAt(context.date,state.meta.slots[group.slotId].start)<=now)fail('예약 시간이 지났습니다.');};
    const leader=()=>{if(!g||g.leaderUid!==actor.uid)fail('그룹을 만든 학생만 진행할 수 있습니다.');};
    switch(action.type){
      case 'create':{
        if(own)fail('이미 오늘의 예약 그룹이 있습니다. 먼저 기존 그룹을 취소하거나 나가세요.');
        const slot=state.meta.slots[action.slotId];if(!slot||timeAt(context.date,slot.start)<=now)fail('선택한 시간에는 예약할 수 없습니다.');
        if(!/^[-_a-zA-Z0-9]+$/.test(action.groupId||'')||g)fail('그룹 식별자가 중복되었습니다. 다시 시도하세요.');
        state.groups[action.groupId]={id:action.groupId,leaderUid:actor.uid,slotId:action.slotId,status:'forming',createdAt:now,updatedAt:now,members:{[actor.uid]:actor},invites:{}};state.memberGroups[actor.uid]=action.groupId;break;
      }
      case 'invite':{
        leader();open(g);const recipient=profile(action.recipient);g.invites=g.invites||{};
        if(recipient.uid===actor.uid||g.members[recipient.uid])fail('본인이나 이미 참여한 친구는 초대할 수 없습니다.');
        if(state.memberGroups[recipient.uid])fail('이 친구는 이미 다른 그룹 또는 좌석예약에 참여 중입니다.');
        if(g.invites[recipient.uid]?.status==='pending')fail('이미 초대한 친구입니다.');
        if(count(g.members)+pending(g).length>=state.meta.maxMembers)fail(`본인 포함 최대 ${state.meta.maxMembers}명입니다. 대기 중인 초대도 인원에 포함됩니다.`);
        g.invites[recipient.uid]={recipient,status:'pending',createdAt:now};g.updatedAt=now;break;
      }
      case 'accept':{
        open(g);if(g.invites?.[actor.uid]?.status!=='pending')fail('유효한 초대가 아닙니다.');
        if(own)fail('이미 참여한 그룹이 있습니다. 먼저 기존 그룹을 나가거나 취소하세요.');
        if(count(g.members)>=state.meta.maxMembers)fail('그룹 인원이 가득 찼습니다.');
        g.members[actor.uid]=actor;state.memberGroups[actor.uid]=g.id;g.invites[actor.uid].status='accepted';g.invites[actor.uid].respondedAt=now;
        for(const other of Object.values(state.groups))if(other.id!==g.id&&other.invites?.[actor.uid]?.status==='pending')other.invites[actor.uid].status='declined';
        g.updatedAt=now;break;
      }
      case 'decline':{
        open(g);if(g.invites?.[actor.uid]?.status!=='pending')fail('유효한 초대가 아닙니다.');g.invites[actor.uid].status='declined';g.invites[actor.uid].respondedAt=now;break;
      }
      case 'revoke':{
        leader();open(g);if(g.invites?.[action.recipientUid]?.status!=='pending')fail('대기 중인 초대가 아닙니다.');g.invites[action.recipientUid].status='cancelled';break;
      }
      case 'leave':{
        open(g);if(!g.members[actor.uid]||g.leaderUid===actor.uid)fail('참여 중인 친구만 나갈 수 있습니다.');delete g.members[actor.uid];delete state.memberGroups[actor.uid];if(g.invites?.[actor.uid])g.invites[actor.uid].status='left';break;
      }
      case 'cancel':{
        leader();if(!['forming','reserved'].includes(g.status))fail('이미 취소된 그룹입니다.');cancel(state,g,now);break;
      }
      case 'book':{
        leader();open(g);if(pending(g).length)fail('친구의 응답을 기다리거나 대기 초대를 취소한 뒤 좌석을 선택하세요.');
        const ids=action.seatIds||[],members=Object.keys(g.members).sort((a,b)=>a===g.leaderUid?-1:b===g.leaderUid?1:a.localeCompare(b));
        if(ids.length!==members.length||new Set(ids).size!==ids.length)fail(`참여한 ${members.length}명에 맞춰 서로 다른 좌석을 선택하세요.`);
        const seats=Object.fromEntries(allSeats(state.meta.layout).map(s=>[s.id,s])),taken=occupied(state,g.slotId,g.id);
        if(ids.some(id=>!seats[id]||seats[id].zone==='onsite'))fail('예약 가능한 좌석을 선택하세요. 현장 우선석은 예약할 수 없습니다.');
        if(ids.some(id=>taken[id]))fail('다른 학생이 먼저 예약한 좌석이 있습니다. 빈자리를 다시 선택하세요.');
        if(count(taken)+ids.length>state.meta.layout.totalSeats-state.meta.minOnsiteSeats)fail('현장 이용자를 위해 남겨야 하는 좌석 수를 초과했습니다.');
        if(!connected(state.meta.layout,ids))fail('서로 이어진 좌석을 선택하세요. 한 테이블 또는 바로 인접한 테이블에서 함께 앉을 수 있습니다.');
        g.status='reserved';g.updatedAt=now;g.reservation={layoutVersionId:state.meta.layoutVersionId,seatIds:ids,assignments:Object.fromEntries(members.map((uid,i)=>[uid,ids[i]])),createdAt:now};break;
      }
      default:fail('지원하지 않는 요청입니다.');
    }
    return state;
  }
  global.CafeteriaSeatCore={dayKey,timeAt,profile,config,normalizeLayout,allSeats,connected,pending,occupied,invitations,apply};
})(typeof window==='undefined'?globalThis:window);

