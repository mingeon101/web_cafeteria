(function(){
 'use strict';
 const A=CafeteriaAllergy,preorder=document.body.dataset.allergyMode==='preorder';
 let uid=null,meal='',values={},ready={},subscriptions=[],failure='',signature='';
 const status=()=>failure||!uid||!['student','menu','metadata'].every(k=>ready[k])?FOODS.map(food=>({food,blocked:!!uid,unknown:true,matches:[]})):A.evaluate(values.student,values.menu,values.metadata,FOODS);
 function blocked(i){return !!status()[i]?.blocked;}
 function sanitize(array){const next=A.sanitize(array,status());array.splice(0,array.length,...next);return array;}
 function disable(el,value){if(value){if(!el.hasAttribute('data-allergy-disabled'))el.dataset.allergyDisabled=String(el.disabled);el.disabled=true;}else if(el.hasAttribute('data-allergy-disabled')){el.disabled=el.dataset.allergyDisabled==='true';delete el.dataset.allergyDisabled;}}
 function decorate(card,i){
  if(!card)return;const s=status()[i],bad=!!s?.blocked;card.classList.toggle('allergy-blocked',bad);
  let note=card.querySelector(':scope > .allergy-note');if(bad){if(!note){note=document.createElement('span');note.className='allergy-note';note.setAttribute('role','status');card.append(note);}note.textContent=s.unknown?'알레르기 정보 확인 필요 · 선택 및 배식 불가':'알레르기 함유 음식 · 선택 및 배식 불가 ('+s.matches.join(', ')+')'+(s.global?' · 급식 전체 정보 기준':'');}else note?.remove();
  card.querySelectorAll('button,input').forEach(el=>{if(['serve-next'].includes(el.id))return;disable(el,bad);});
 }
 function paint(){
  if(!uid)return;
  for(const selector of preorder?['#preorder-food-grid > .food-circle','#final-confirm-list > .final-row']:['#menu-grid > .menu-chip','#preorder-counts > .preorder-count','#progress-list > .progress-item','#edit-rows > .edit-row'])document.querySelectorAll(selector).forEach(decorate);
  if(!preorder){if(!failure&&['student','menu','metadata'].every(k=>ready[k])&&blocked(serveStep)){counts[serveStep]=0;const count=document.getElementById('serve-count-display');if(count)count.textContent='0';}const target=document.getElementById('serve-food-name')?.closest('.card');if(target)decorate(target,serveStep);document.querySelectorAll('#progress-list > .progress-item').forEach((el,i)=>{if(blocked(i)){el.querySelector('.progress-state').textContent='배식 차단';el.querySelector('.progress-icon').textContent='⛔';}});}
  for(const parent of preorder?['page-preorder','page-final-confirm']:['page-dashboard','page-serve']){
   const box=document.getElementById(parent);if(!box)continue;let note=box.querySelector(':scope > .allergy-banner');if(!note){note=document.createElement('p');note.className='allergy-banner';note.setAttribute('role','status');box.prepend(note);}
   const list=A.normalize(values.student),hasBlocked=status().some(x=>x.blocked);
   note.hidden=!failure&&!list.length&&!hasBlocked;
   note.textContent=failure||(!ready.student?'학생 알레르기 정보를 확인 중입니다.':list.length?'학생 알레르기: '+list.join(', ')+(hasBlocked?' · 빨간색 음식은 수량 0으로 제외됩니다.':''):'');
  }
 }
 function changed(){
  if(preorder){if(!failure&&['student','menu','metadata'].every(k=>ready[k]))sanitize(preorderCounts);renderPreorderSelection();renderFinalConfirm();}
  paint();
 }
 function context(){return{uid:user?.uid||null,meal:preorder&&typeof pmMeal!=='undefined'?pmMeal:'lunch'};}
 function bind(){
  const next=context();if(next.uid===uid&&next.meal===meal)return;
  for(const [ref,fn] of subscriptions)ref.off('value',fn);subscriptions=[];uid=next.uid;meal=next.meal;values={};ready={};failure='';signature='';
  if(!uid){document.querySelectorAll('.allergy-banner,.allergy-note').forEach(n=>n.remove());document.querySelectorAll('.allergy-blocked').forEach(n=>n.classList.remove('allergy-blocked'));document.querySelectorAll('[data-allergy-disabled]').forEach(n=>disable(n,false));return;}
  for(const [key,path] of [['student',`students/${uid}/allergies`],['menu',meal==='dinner'?'menus/dinner':'menu'],['metadata',meal==='dinner'?'menuAllergiesDinner':'menuAllergies']]){
   const expected=uid,expectedMeal=meal,ref=db.ref(path),fn=ref.on('value',snap=>{if(uid!==expected||meal!==expectedMeal)return;values[key]=snap.val()??(key==='student'?[]:null);ready[key]=true;failure='';changed();},()=>{if(uid!==expected||meal!==expectedMeal)return;ready[key]=false;failure='알레르기 정보를 불러오지 못했습니다. 확인 전에는 선택·배식을 진행할 수 없습니다.';changed();});subscriptions.push([ref,fn]);
  }paint();
 }
 async function refresh(){
  bind();const expected=uid,expectedMeal=meal;if(!expected)throw Error('학생을 먼저 확인해 주세요.');
  try{
   const paths=[`students/${expected}/allergies`,expectedMeal==='dinner'?'menus/dinner':'menu',expectedMeal==='dinner'?'menuAllergiesDinner':'menuAllergies'];
   const snaps=await Promise.all(paths.map(p=>db.ref(p).once('value')));
   const active=context();if(active.uid!==expected||active.meal!==expectedMeal)throw Error('학생 또는 급식이 변경되었습니다. 다시 확인해 주세요.');
   values={student:snaps[0].val()??[],menu:snaps[1].val(),metadata:snaps[2].val()};ready={student:true,menu:true,metadata:true};failure='';changed();return status();
  }catch(error){failure='알레르기 정보 확인 실패 · 선택 및 배식 불가';paint();throw error;}
 }
 window.AllergyClient={blocked,sanitize,paint,refresh,status,ready:()=>!failure&&['student','menu','metadata'].every(k=>ready[k])};
 setInterval(()=>{bind();const next=JSON.stringify([uid,meal,values,ready,failure]);if(next!==signature){signature=next;changed();}},250);bind();
})();
