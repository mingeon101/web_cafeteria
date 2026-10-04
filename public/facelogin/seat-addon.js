/* 기존 스크립트 아래에 추가합니다. 기존 함수·이벤트·HTML을 재작성하지 않습니다. */
(function(){
  'use strict';
  const C=window.CafeteriaSeatCore,$=id=>document.getElementById(id);
  const root=document.createElement('div');root.id='sr-root';
  root.innerHTML=`<button id="sr-launch" class="sr-primary" hidden>좌석예약 · 같이 앉기 <span id="sr-badge" hidden></span></button>
  <div id="sr-toast" role="status" aria-live="polite" hidden><div id="sr-toast-text"></div><button id="sr-toast-open">확인하기</button><button id="sr-toast-dismiss">닫기</button></div>
  <div id="sr-overlay" hidden><section id="sr-panel" role="dialog" aria-modal="true" aria-labelledby="sr-title" tabindex="-1">
  <div class="sr-head"><div><h2 id="sr-title">좌석예약 · 같이 앉기</h2><div id="sr-date" class="sr-date"></div></div><button id="sr-close" aria-label="좌석예약 창 닫기">닫기 ✕</button></div>
  <div id="sr-message" role="status" aria-live="polite">좌석 정보를 불러오는 중입니다.</div>
  <section id="sr-inbox" class="sr-box" hidden><h3>친구에게 받은 초대</h3><div id="sr-invites"></div></section>
  <div class="sr-grid"><div>
    <section id="sr-new" class="sr-box"><h3>예약 시작</h3><label>급식 시간대<select id="sr-slot"></select></label><button id="sr-create" class="sr-primary sr-wide-button">혼자 예약 / 같이 앉기 시작</button><p class="sr-small">본인 포함 최대 8명. 그룹을 만든 학생이 모두의 좌석을 선택합니다.</p></section>
    <section id="sr-group-box" class="sr-box" hidden><h3 id="sr-group-title">우리 그룹</h3><div id="sr-members"></div><div id="sr-pending"></div><p id="sr-group-note" class="sr-small"></p>
    <button id="sr-show-invite" class="sr-wide-button">＋ 같이 앉기 · 친구 초대</button>
    <form id="sr-invite-form" hidden><div class="sr-student-fields"><label>학년<input id="sr-grade" type="number" min="1" max="999" required></label><label>반<input id="sr-class" type="number" min="1" max="999" required></label><label>번호<input id="sr-number" type="number" min="1" max="999" required></label></div><button id="sr-send" class="sr-primary sr-wide-button">친구에게 초대 보내기</button></form>
    <button id="sr-leave" class="sr-wide-button sr-danger">그룹 나가기</button><button id="sr-cancel" class="sr-wide-button sr-danger">그룹 취소</button></section>
    <section id="sr-reservation" class="sr-box" hidden><h3>확정된 좌석</h3><div id="sr-assignment"></div></section>
    <p class="sr-small">알림은 이 페이지에서 학생 확인을 마친 상태일 때 실시간으로 표시됩니다. 페이지를 닫은 동안 받은 초대는 다시 접속해 학생 확인 후 볼 수 있습니다.</p>
  </div><div style="min-width:0"><section class="sr-box"><h3 id="sr-map-title">급식실 배치도</h3><div id="sr-map-scroll"><div id="sr-map"></div></div><div class="sr-legend"><span style="--swatch:#ebf6ff">예약 가능</span><span style="--swatch:#276d98">선택</span><span style="--swatch:#e8d5d5">예약 완료</span><span style="--swatch:#e3f1e8">현장 우선</span><span style="--swatch:#f9e29a">우리 그룹</span></div><p id="sr-selection"></p><button id="sr-book" class="sr-primary sr-wide-button" disabled>선택한 좌석으로 예약 확정</button><p class="sr-small">같은 테이블의 이어진 자리 또는 바로 인접한 테이블의 자리를 선택하세요. 떨어져 있는 좌석은 함께 예약할 수 없습니다.</p><p id="sr-layout-info" class="sr-small"></p></section></div></div>
  <button id="sr-retry">연결 다시 확인</button>
  </section></div>`;
  document.body.append(root);
  let actor=null,identity='',generation=0,subscription=null,configSubscription=null,dayState=null,seed=null,ready=false,busy=false,selected=[],seenInvites=new Set(),previousGroup=null,previousFocus=null,currentConfig=null;
  const message=(text,error=false)=>{$('sr-message').textContent=text;$('sr-message').classList.toggle('sr-error',error);};
  const person=p=>`${p.name} (${p.grade}학년 ${p.classNum}반 ${p.number}번)`;
  const group=()=>dayState?.groups?.[dayState?.memberGroups?.[actor?.uid]];
  const meta=()=>dayState?.meta||seed?.meta;
  const operating=()=>typeof systemOperating==='undefined'||systemOperating;
  function toast(text){if(!$('sr-overlay').hidden){message(text);$('sr-toast').hidden=true;return;}$('sr-toast-text').textContent=text;$('sr-toast').hidden=false;}
  function open(){if(!actor)return;previousFocus=document.activeElement;$('sr-overlay').hidden=false;$('sr-panel').focus();render();}
  function close(){$('sr-overlay').hidden=true;if(previousFocus?.isConnected)previousFocus.focus();}
  $('sr-launch').onclick=open;$('sr-close').onclick=close;$('sr-toast-open').onclick=()=>{$('sr-toast').hidden=true;open();};$('sr-toast-dismiss').onclick=()=>$('sr-toast').hidden=true;
  $('sr-overlay').addEventListener('click',e=>{if(e.target===$('sr-overlay'))close();});
  $('sr-panel').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const nodes=[...$('sr-panel').querySelectorAll('button,input,select,[tabindex]')].filter(x=>!x.disabled&&x.getClientRects().length);if(!nodes.length)return;if(e.shiftKey&&(document.activeElement===nodes[0]||document.activeElement===$('sr-panel'))){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}}});
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  function actionButton(label,fn){const b=el('button',label);b.type='button';b.disabled=busy;b.onclick=fn;return b;}
  function detach(){if(subscription){subscription.ref.off('value',subscription.fn);subscription=null;}if(configSubscription){configSubscription.ref.off('value',configSubscription.fn);configSubscription=null;}}
  function activeStudent(){
    try{const page=document.querySelector('.page.active')?.id;if(!['page-preorder','page-final-confirm','page-complete'].includes(page))return null;return user?.uid?C.profile(user):null;}catch{return null;}
  }
  function syncIdentity(){
    const next=activeStudent(),key=next?`${next.uid}/${C.dayKey()}`:'';
    if(key===identity){$('sr-launch').disabled=!operating();return;}
    identity=key;generation++;detach();actor=next;dayState=null;seed=null;ready=false;selected=[];seenInvites=new Set();previousGroup=null;busy=false;close();$('sr-toast').hidden=true;$('sr-badge').hidden=true;$('sr-invite-form').reset();$('sr-invite-form').hidden=true;$('sr-launch').hidden=!next;
    if(next){$('sr-date').textContent=`${C.dayKey()} · ${person(next)}`;bootstrap(generation);}else render();
  }
  async function bootstrap(token){
    ready=false;message('저장된 배치도와 예약 시간표를 불러오는 중입니다.');render();
    try{
      const date=C.dayKey(),[cfgSnap,stateSnap]=await Promise.all([db.ref('cafeteriaLayoutEditor/reservationConfig').once('value'),db.ref(`cafeteriaSeatReservations/days/${date}`).once('value')]);
      if(token!==generation)return;
      currentConfig=cfgSnap.val();const cfg=C.config(currentConfig);dayState=stateSnap.val();
      let versionId=dayState?.meta?.layoutVersionId,layout=dayState?.meta?.layout;
      if(!layout){
        if(currentConfig.layoutVersionId){if(!/^[-_a-zA-Z0-9]+$/.test(currentConfig.layoutVersionId))throw Error('배치도 버전 ID가 올바르지 않습니다.');versionId=currentConfig.layoutVersionId;layout=(await db.ref(`cafeteriaLayoutEditor/layoutVersions/${versionId}`).once('value')).val();}
        else{const layouts=(await db.ref('cafeteriaLayoutEditor/layoutVersions').orderByKey().limitToLast(1).once('value')).val()||{};versionId=Object.keys(layouts)[0];layout=layouts[versionId];}
        layout=C.normalizeLayout(layout);
      }
      if(token!==generation)return;
      seed={date,layoutVersionId:versionId,layout,config:currentConfig,meta:{date,layoutVersionId:versionId,layout,...cfg}};
      const r=db.ref(`cafeteriaSeatReservations/days/${date}`);
      const fn=s=>{if(token!==generation)return;dayState=s.val();ready=true;notifyChanges();render();};
      subscription={ref:r,fn};r.on('value',fn,e=>{if(token!==generation)return;ready=false;message('예약 데이터 연결 실패: '+e.message,true);render();});
      const cr=db.ref('cafeteriaLayoutEditor/reservationConfig');
      const cf=s=>{if(token!==generation)return;currentConfig=s.val();if(currentConfig?.enabled!==true){message('관리자가 좌석예약을 잠시 닫았습니다.',true);}render();};
      configSubscription={ref:cr,fn:cf};cr.on('value',cf,e=>{if(token!==generation)return;currentConfig=null;message('예약 설정 조회 실패: '+e.message,true);render();});
      message('시간대를 선택해 그룹을 만들거나, 받은 친구 초대를 수락하세요.');render();
    }catch(e){if(token!==generation)return;ready=false;message(e.message,true);render();}
  }
  function notifyChanges(){
    if(!actor||!dayState)return;
    const incoming=C.invitations(dayState,actor.uid);for(const g of incoming){const key=`${g.id}/${g.invites[actor.uid].createdAt}`;if(!seenInvites.has(key)){seenInvites.add(key);toast(`${g.members[g.leaderUid]?.name||'친구'}님이 같이 앉기에 초대했습니다. 수락 여부를 선택하세요.`);}}
    const g=group();
    if(g){if(g.status==='reserved'&&previousGroup?.status!=='reserved')toast('우리 그룹의 좌석예약이 확정되었습니다. 내 좌석을 확인하세요.');
      if(g.leaderUid===actor.uid&&previousGroup?.id===g.id&&Object.keys(g.members).length>previousGroup.members)toast('친구가 초대를 수락했습니다. 인원이 모이면 좌석을 선택하세요.');
      previousGroup={id:g.id,status:g.status,members:Object.keys(g.members).length};
    }else if(previousGroup){toast('그룹이 취소되었거나 참여가 해제되었습니다. 좌석예약을 다시 시작할 수 있습니다.');previousGroup=null;selected=[];}
  }
  async function send(action){
    if(busy)throw Error('이전 요청을 처리 중입니다.');if(!actor||!ready||!seed)throw Error('학생과 배치도 정보를 먼저 확인하세요.');if(!operating()||currentConfig?.enabled!==true)throw Error('현재 좌석예약을 이용할 수 없습니다.');if(!navigator.onLine)throw Error('인터넷 연결 후 다시 시도하세요.');
    const token=generation,requestActor={...actor},requestDate=seed.date,request={...action,actor:requestActor},context={...seed,now:Date.now()};
    busy=true;render();message('요청을 처리하고 있습니다.');
    try{
      const ref=db.ref(`cafeteriaSeatReservations/days/${requestDate}`);await ref.once('value');
      if(token!==generation)throw Error('학생이 바뀌어 요청을 취소했습니다.');let rejected='';
      const result=await ref.transaction(current=>{try{const next=C.apply(current,request,{...context,now:Date.now()});rejected='';return next;}catch(e){rejected=e.message;return;}},undefined,false);
      if(!result.committed)throw Error(rejected||'동시에 변경된 내용이 있습니다. 다시 시도하세요.');
      if(token===generation){dayState=result.snapshot.val();selected=[];notifyChanges();render();message({create:'그룹을 만들었습니다. 혼자 예약하거나 친구를 초대하세요.',invite:'초대를 전송했습니다. 상대방의 알림에 표시됩니다.',accept:'초대를 수락했습니다. 그룹장이 함께 앉을 좌석을 선택합니다.',decline:'초대를 거절했습니다.',revoke:'대기 초대를 취소했습니다.',leave:'그룹에서 나왔습니다.',cancel:'그룹과 좌석예약을 취소했습니다.',book:'좌석예약을 확정했습니다. 친구들도 각자의 좌석을 확인할 수 있습니다.'}[action.type]);}
      return result.snapshot.val();
    }finally{if(token===generation){busy=false;render();}}
  }
  function run(action){return send(action).catch(e=>message(e.message,true));}
  function refreshSlots(){const m=meta(),select=$('sr-slot'),old=select.value;select.replaceChildren();for(const s of Object.values(m?.slots||{})){const option=new Option(s.label,s.id);option.disabled=C.timeAt(m.date,s.start)<=Date.now();select.add(option);}if([...select.options].some(o=>o.value===old&&!o.disabled))select.value=old;else select.value=[...select.options].find(o=>!o.disabled)?.value||'';}
  function render(){
    const m=meta(),g=group(),live=ready&&!!actor&&currentConfig?.enabled===true&&operating(),lead=g?.leaderUid===actor?.uid,forming=g?.status==='forming',upcoming=!!g&&!!m&&C.timeAt(m.date,m.slots[g.slotId].start)>Date.now();
    const incoming=actor?C.invitations(dayState,actor.uid):[];$('sr-badge').hidden=!incoming.length;$('sr-badge').textContent=String(incoming.length);$('sr-inbox').hidden=!incoming.length;$('sr-invites').replaceChildren();
    for(const invite of incoming){const box=el('div',undefined,'sr-invitation');box.append(el('p',`${person(invite.members[invite.leaderUid])}님의 초대`),el('p',m?.slots[invite.slotId]?.label||'', 'sr-small'));const row=el('div',undefined,'sr-row');const yes=actionButton('수락',()=>run({type:'accept',groupId:invite.id})),no=actionButton('거절',()=>run({type:'decline',groupId:invite.id}));yes.disabled=no.disabled=busy||!live;row.append(yes,no);box.append(row);$('sr-invites').append(box);}
    $('sr-new').hidden=!!g;refreshSlots();$('sr-create').disabled=busy||!live||!$('sr-slot').value;
    $('sr-group-box').hidden=!g;$('sr-reservation').hidden=g?.status!=='reserved';$('sr-members').replaceChildren();$('sr-pending').replaceChildren();
    if(g){
      $('sr-group-title').textContent=`우리 그룹 ${Object.keys(g.members).length}/${m.maxMembers}명 · ${m.slots[g.slotId].label}`;
      for(const p of Object.values(g.members)){const row=el('div',undefined,'sr-person');row.append(el('span',person(p)),el('span',p.uid===g.leaderUid?'그룹장':'참여 완료','sr-tag'));$('sr-members').append(row);}
      for(const i of C.pending(g)){const row=el('div',undefined,'sr-person');row.append(el('span',`${person(i.recipient)} · 응답 대기`));if(lead)row.append(actionButton('초대 취소',()=>run({type:'revoke',groupId:g.id,recipientUid:i.recipient.uid})));$('sr-pending').append(row);}
      $('sr-group-note').textContent=!upcoming&&forming?'시간이 지나 예약할 수 없습니다. 그룹을 취소하고 다시 시작하세요.':forming?(C.pending(g).length?'초대에 응답하지 않은 친구가 있습니다. 응답을 기다리거나 대기 초대를 취소하세요.':lead?'참여 인원에 맞는 붙어 있는 좌석을 선택하세요.':'그룹장이 좌석을 선택하면 예약 결과가 함께 표시됩니다.'):'좌석예약이 확정되었습니다. 변경하려면 그룹장이 전체 예약을 취소한 뒤 다시 예약하세요.';
      $('sr-show-invite').hidden=!(lead&&forming&&upcoming);$('sr-show-invite').disabled=busy||!live||Object.keys(g.members).length+C.pending(g).length>=m.maxMembers;
      if(!(lead&&forming&&upcoming))$('sr-invite-form').hidden=true;
      $('sr-send').disabled=busy||!live||Object.keys(g.members).length+C.pending(g).length>=m.maxMembers;
      $('sr-leave').hidden=lead||!forming;$('sr-cancel').hidden=!lead;$('sr-cancel').textContent=g.status==='reserved'?'그룹 전체 좌석예약 취소':'그룹 취소';$('sr-leave').disabled=$('sr-cancel').disabled=busy||!live;
      if(g.status==='reserved'){
        const seats=Object.fromEntries(C.allSeats(m.layout).map(s=>[s.id,s]));$('sr-assignment').replaceChildren(el('p',`${m.date} ${m.slots[g.slotId].label}`));
        for(const [uid,id] of Object.entries(g.reservation.assignments))$('sr-assignment').append(el('p',`${uid===actor.uid?'내 자리 · ':''}${g.members[uid]?.name||'학생'}: ${seats[id]?.label||id}`,uid===actor.uid?'sr-reserved':''));
      }
    }
    drawMap();
  }
  function drawMap(){
    const m=meta(),g=group(),map=$('sr-map');map.replaceChildren();
    if(!m){map.style.width='100%';map.style.height='150px';map.append(el('p','배치도와 시간표 등록 후 좌석이 표시됩니다.'));$('sr-book').disabled=true;$('sr-selection').textContent='';return;}
    const slotId=g?.slotId||$('sr-slot').value,taken=C.occupied(dayState||{},slotId),mine=new Set(g?.reservation?.seatIds||[]),seats=C.allSeats(m.layout);
    selected=selected.filter(id=>!taken[id]||mine.has(id));
    const selectable=ready&&!busy&&currentConfig?.enabled===true&&operating()&&g?.leaderUid===actor?.uid&&g?.status==='forming'&&!C.pending(g).length&&C.timeAt(m.date,m.slots[g.slotId].start)>Date.now();
    const n=Object.keys(g?.members||{}).length;map.style.width=m.layout.columns*30+'px';map.style.height=m.layout.rows*30+'px';$('sr-map-title').textContent=m.layout.name;
    for(const t of Object.values(m.layout.tables)){const table=el('div',t.label,'sr-table');Object.assign(table.style,t.rotation===90?{left:(t.x*30+25)+'px',top:(t.y*30+12)+'px',width:'40px',height:'156px'}:{left:(t.x*30+12)+'px',top:(t.y*30+25)+'px',width:'156px',height:'40px'});map.append(table);}
    for(const s of seats){const button=el('button',String(s.number),'sr-seat');button.type='button';button.dataset.seat=s.id;button.dataset.state=mine.has(s.id)?'mine':taken[s.id]?'taken':s.zone==='onsite'?'onsite':selected.includes(s.id)?'selected':'free';button.style.left=s.x*30+'px';button.style.top=s.y*30+'px';button.title=s.label;button.setAttribute('aria-label',`${s.label} · ${{mine:'우리 그룹',taken:'예약 완료',onsite:'현장 우선',selected:'선택됨',free:'예약 가능'}[button.dataset.state]}`);button.setAttribute('aria-pressed',String(selected.includes(s.id)));button.disabled=!selectable||!!taken[s.id]||s.zone==='onsite';button.onclick=()=>{if(selected.includes(s.id))selected=selected.filter(id=>id!==s.id);else if(selected.length<n)selected.push(s.id);else{message(`${n}명에 맞춰 ${n}석만 선택하세요.`,true);return;}drawMap();};map.append(button);}
    $('sr-selection').textContent=g?.status==='reserved'?'노란색으로 표시된 좌석이 우리 그룹의 자리입니다.':`선택 ${selected.length} / ${n}석${selected.length?' · '+selected.map(id=>seats.find(s=>s.id===id)?.label).join(', '):''}`;
    $('sr-book').disabled=!selectable||selected.length!==n||!C.connected(m.layout,selected);
    $('sr-layout-info').textContent=`총 ${m.layout.totalSeats}석 · 현장 최소 ${m.minOnsiteSeats}석 유지 · 배치 버전 ${m.layoutVersionId}`;
  }
  $('sr-slot').onchange=()=>{selected=[];drawMap();$('sr-create').disabled=!ready||busy||!$('sr-slot').value;};
  $('sr-create').onclick=()=>run({type:'create',groupId:db.ref('cafeteriaSeatReservations/groupKeys').push().key,slotId:$('sr-slot').value});
  $('sr-show-invite').onclick=()=>{$('sr-invite-form').hidden=!$('sr-invite-form').hidden;if(!$('sr-invite-form').hidden)$('sr-grade').focus();};
  $('sr-invite-form').onsubmit=async e=>{
    e.preventDefault();if(busy)return;const token=generation,uid=actor?.uid,gid=group()?.id;const grade=Number($('sr-grade').value),classNum=Number($('sr-class').value),number=Number($('sr-number').value);
    if(![grade,classNum,number].every(n=>Number.isInteger(n)&&n>0&&n<1000)){message('학년·반·번호를 올바르게 입력하세요.',true);return;}
    busy=true;render();message('친구를 찾고 있습니다.');
    try{
      // 기존 students 자료형(숫자/문자열 및 한글 필드)을 모두 지원합니다.
      const snap=await db.ref('students').once('value'),found=[];
      snap.forEach(child=>{const s=child.val()||{};if(Number(s.grade??s['학년'])===grade&&Number(s.class??s.classNum??s.classNo??s['반'])===classNum&&Number(s.number??s['번호'])===number)found.push({uid:child.key,name:s.name||s['이름']||'학생',grade,classNum,number});});
      if(token!==generation||actor?.uid!==uid)return;if(found.length!==1)throw Error(found.length?'동일한 학년·반·번호의 학생이 여러 명입니다. 등록 정보를 확인하세요.':'해당 학년·반·번호의 학생을 찾지 못했습니다.');
      busy=false;await send({type:'invite',groupId:gid,recipient:found[0]});if(token===generation)$('sr-invite-form').reset();
    }catch(err){if(token===generation)message(err.message,true);}finally{if(token===generation){busy=false;render();}}
  };
  $('sr-book').onclick=()=>run({type:'book',groupId:group()?.id,seatIds:[...selected]});
  $('sr-cancel').onclick=()=>{if(confirm('우리 그룹과 좌석예약을 취소할까요? 친구들도 다시 예약해야 합니다.'))run({type:'cancel',groupId:group()?.id});};
  $('sr-leave').onclick=()=>run({type:'leave',groupId:group()?.id});
  $('sr-retry').onclick=()=>{if(busy)return;generation++;detach();bootstrap(generation);};
  // 기존 user 및 페이지 상태를 관찰만 합니다. 기존 함수 재정의나 이벤트 교체 없음.
  document.querySelectorAll('.page').forEach(page=>new MutationObserver(syncIdentity).observe(page,{attributes:true,attributeFilter:['class']}));
  setInterval(syncIdentity,500);setInterval(()=>{if(actor&&!$('sr-overlay').hidden)render();},30000);
  syncIdentity();
})();

