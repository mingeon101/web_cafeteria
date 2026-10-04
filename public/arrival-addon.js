(function(){
 'use strict';
 const C=window.CafeteriaSeatCore,A=window.CafeteriaArrivalCore,get=id=>document.getElementById(id);
 const originalDashboard=showDashboard,originalStartServe=startServe;
 let token=0,timer=null,visit=null,uid=null,busy=false,dispatching=false,context=null,observedUid=null;
 const root=document.createElement('div');root.id='arrival-root';root.innerHTML=`<div id="arrival-overlay" hidden><section role="dialog" aria-modal="true" aria-labelledby="arrival-heading" tabindex="-1" id="arrival-panel"><h2 id="arrival-heading">좌석을 확인하고 있어요</h2><p id="arrival-name"></p><div id="arrival-seat">…</div><p id="arrival-detail"></p><p id="arrival-message" role="status" aria-live="polite"></p><div class="arrival-actions"><button id="arrival-continue" hidden>지금 배식 진행</button><button id="arrival-retry" hidden>다시 확인</button><button id="arrival-dashboard">대시보드 보기</button></div></section></div>`;
 document.body.append(root);
 const stop=()=>{clearInterval(timer);timer=null;};
 const message=(s,error=false)=>{get('arrival-message').textContent=s;get('arrival-message').style.color=error?'#ae3d32':'#476676';};
 function show(){get('arrival-overlay').hidden=false;get('arrival-panel').focus();}
 function hide(){stop();get('arrival-overlay').hidden=true;}
 function badge(){for(const id of ['page-dashboard','page-serve','page-progress','page-complete']){
  let box=get(`arrival-${id}`);if(!box){box=document.createElement('div');box.id=`arrival-${id}`;box.className='arrival-badge';get(id)?.prepend(box);}box.replaceChildren();
  if(visit?.seatId&&visit.status==='seated'&&user?.uid===uid){const text=document.createElement('strong');text.textContent=`내 좌석: ${visit.label}`;box.append(text);const detail=document.createElement('span');detail.textContent=visit.source==='reservation'?'사전예약 좌석':'현장 자동 배정';box.append(detail);
   if(id==='page-complete'){const button=document.createElement('button');button.textContent='식사 후 좌석 반납';button.onclick=returnSeat;box.append(button);}
   box.hidden=false;
  }else box.hidden=true;
 }}
 async function setup(date){
  const [stateSnap,cfgSnap]=await Promise.all([db.ref(`cafeteriaSeatReservations/days/${date}`).once('value'),db.ref('cafeteriaLayoutEditor/reservationConfig').once('value')]);
  const state=stateSnap.val(),config=cfgSnap.val();if(config?.enabled!==true)throw Error('좌석 운영이 열려 있지 않습니다. 운영 시간표를 확인하세요.');
  if(state?.meta)return {date,config,layout:state.meta.layout,layoutVersionId:state.meta.layoutVersionId};
  C.config(config);let id=config.layoutVersionId,layout;
  if(id){if(!/^[-_a-zA-Z0-9]+$/.test(id))throw Error('배치도 버전 ID가 올바르지 않습니다.');layout=(await db.ref(`cafeteriaLayoutEditor/layoutVersions/${id}`).once('value')).val();}
  else{const items=(await db.ref('cafeteriaLayoutEditor/layoutVersions').orderByKey().limitToLast(1).once('value')).val()||{};id=Object.keys(items)[0];layout=items[id];}
  return {date,config,layout:C.normalizeLayout(layout),layoutVersionId:id};
 }
 async function entry(){
  if(!user?.uid||!systemOperating)return;const current=++token,student={...user},date=C.dayKey();stop();uid=student.uid;busy=true;visit=null;badge();show();
  get('arrival-heading').textContent='선주문과 좌석을 확인하고 있어요';get('arrival-name').textContent=`${student.name} · ${userMeta(student)}`;get('arrival-seat').textContent='…';get('arrival-detail').textContent='';get('arrival-retry').hidden=true;get('arrival-continue').hidden=true;message('잠시만 기다려 주세요.');
  try{
   const [ctx,preorder]=await Promise.all([setup(date),db.ref(`students/${student.uid}/preorders/${date}`).once('value')]);if(current!==token||user?.uid!==student.uid)return;
   context=ctx;todayPreorder=preorder.val();const ref=db.ref(`cafeteriaSeatReservations/days/${date}`);let result,error;
   const transaction=await ref.transaction(state=>{try{const answer=A.arrive(state,{...ctx,student,fulfilled:todayPreorder?.status==='fulfilled',now:Date.now()});result=answer.result;error=null;return answer.state||undefined;}catch(e){error=e;return;}},undefined,false);
   if(current!==token||user?.uid!==student.uid)return;
   if(!transaction.committed&&result?.status!=='fulfilled')throw error||Error('좌석 확인 중 충돌이 발생했습니다. 다시 확인하세요.');
   if(result?.status==='fulfilled'){get('arrival-heading').textContent='이미 배식이 완료되었어요';get('arrival-seat').textContent='배식 완료';message(result.message);return;}
   visit=result;badge();get('arrival-heading').textContent=visit.source==='reservation'?'예약한 좌석으로 안내할게요':'빈 좌석을 자동 배정했어요';get('arrival-seat').textContent=visit.label;
   const slot=transaction.snapshot.val().meta.slots[visit.slotId];get('arrival-detail').textContent=`${date} · ${slot.label}`;
   if(todayPreorder?.status==='fulfilled'){message('이미 처리된 선주문입니다. 좌석만 안내하고 배식을 다시 등록하지 않습니다.');return;}
   get('arrival-continue').hidden=false;let remaining=4;message(`${remaining}초 후 ${todayPreorder?'선주문으로 바로 배식을 진행':'기존 배식 수량 선택 화면으로 이동'}합니다.`);
   timer=setInterval(()=>{if(current!==token||user?.uid!==student.uid||!systemOperating){stop();return;}remaining--;if(remaining<=0){stop();proceed();}else message(`${remaining}초 후 배식 절차로 이동합니다.`);},1000);
  }catch(e){if(current===token){get('arrival-heading').textContent='좌석 안내를 확인해 주세요';get('arrival-seat').textContent='확인 필요';message(e.message,true);get('arrival-retry').hidden=false;}}
  finally{if(current===token)busy=false;}
 }
 async function proceed(){
  if(dispatching||busy)return;stop();if(!user?.uid||user.uid!==uid||!visit||!systemOperating)return;dispatching=true;get('arrival-continue').disabled=true;
  const studentId=uid,current=token,ref=db.ref(`cafeteriaSeatReservations/days/${context.date}/arrivals/${studentId}`);let lock=null;
  try{
   // 화면 재진입 시 선주문 상태를 다시 읽어 이미 처리한 주문을 재사용하지 않습니다.
   const latest=(await db.ref(`students/${studentId}/preorders/${context.date}`).once('value')).val();if(current!==token||user?.uid!==studentId)return;todayPreorder=latest;
   if(latest?.status==='fulfilled'){message('이미 배식 처리된 선주문입니다. 좌석 안내만 유지합니다.');get('arrival-continue').hidden=true;return;}
   if(latest){
    lock=`dispatch_${Date.now()}_${Math.random().toString(36).slice(2)}`;const attempt=await ref.transaction(v=>{if(!v||v.status!=='seated'||v.dispatch)return;return {...v,dispatch:{id:lock,status:'processing'}};},undefined,false);
    if(!attempt.committed)throw Error('이 학생의 선주문 배식이 이미 진행 중입니다. 중복 처리하지 않습니다.');
   }
   if(current!==token||user?.uid!==studentId)return;
   await originalStartServe();
   if(current===token)hide();
  }catch(e){if(lock){try{const served=(await db.ref(`students/${studentId}/preorders/${context.date}`).once('value')).val()?.status==='fulfilled';if(!served)await ref.transaction(v=>{if(v?.dispatch?.id!==lock)return;const n={...v};delete n.dispatch;return n;},undefined,false);}catch{}}
   if(current===token){show();message('배식 진행 실패: '+e.message,true);get('arrival-continue').hidden=false;}
  }finally{dispatching=false;get('arrival-continue').disabled=false;}
 }
 async function returnSeat(){
  if(!user?.uid||user.uid!==uid||!visit||busy)return;if(!confirm('실제로 식사를 마치고 자리를 비웠나요? 좌석을 반납합니다.'))return;
  const current=token,studentId=uid,ctx=context;busy=true;
  try{const ref=db.ref(`cafeteriaSeatReservations/days/${ctx.date}`);let error;const out=await ref.transaction(state=>{try{return A.release(state,studentId);}catch(e){error=e;return;}},undefined,false);if(!out.committed)throw error||Error('좌석 반납 실패');if(current===token){visit=null;badge();alert('좌석을 반납했습니다.');}}
  catch(e){alert(e.message);}finally{if(current===token)busy=false;}
 }
 // 학생 확인 다음 동작만 확장합니다. 원래 대시보드/배식/카메라/제스처 함수는 유지합니다.
 showDashboard=entry;
 get('btn-start-serve').addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();if(visit?.status==='seated'&&user?.uid===uid)proceed();else entry();},true);
 get('arrival-continue').onclick=proceed;get('arrival-retry').onclick=entry;
 get('arrival-dashboard').onclick=()=>{token++;busy=false;hide();originalDashboard();};
 // 자동 이동을 멈추고 대시보드로 돌아가도 배정 좌석은 유지합니다.
 setInterval(()=>{const next=user?.uid||null;if(observedUid!==next){observedUid=next;if(uid&&next!==uid){token++;stop();visit=null;uid=null;busy=false;hide();badge();}}if(!systemOperating)stop();},200);
})();
