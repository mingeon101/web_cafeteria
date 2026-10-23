'use strict';
(function(){
 const ui=document.createElement('div');
 ui.className='student-face';
 ui.innerHTML='<div class="student-face-view"><video id="student-face-video" autoplay playsinline muted aria-label="학생 얼굴 확인 카메라"></video></div><div class="student-face-info"><b id="student-identity-title">얼굴 자동 확인</b><p id="student-face-status" role="status" aria-live="polite">얼굴 카메라를 준비합니다.</p><label>얼굴 카메라 <select id="student-face-device" aria-label="얼굴 확인용 카메라"><option value="">기본 전면 카메라</option></select></label><button type="button" id="student-face-retry">카메라 다시 연결</button><button type="button" id="student-card-mode">학생증 인식</button><button type="button" id="student-card-capture" hidden>학생증 촬영</button><button type="button" id="student-face-mode" hidden>얼굴 자동 인식으로</button></div>';
 qrCard.querySelector('#student-form').before(ui);
 const style=document.createElement('style');
 style.textContent='.student-face{display:flex;align-items:flex-start;gap:16px;padding:14px;margin:12px 0;border:1px solid #e3def3;border-radius:12px;background:#f9f7ff}.student-face-view{width:144px;aspect-ratio:4/3;flex:none;background:#211c36;border-radius:10px;overflow:hidden}.student-face video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}.student-face-info{min-width:0;flex:1}.student-face-info>b{font-size:14px}.student-face p{font-size:12px;line-height:1.6;margin:6px 0;color:#65577c}.student-face p.error{color:#a03232}.student-face label{display:block;font-size:11px}.student-face select{max-width:100%;padding:5px;border:1px solid #cfc6e2;border-radius:6px;margin:4px 0;font:inherit}.student-face [hidden]{display:none!important}.student-face button{font-size:11px;padding:5px 8px;margin-top:4px}@media(max-width:600px){.student-face{gap:10px;padding:10px}.student-face-view{width:105px}.student-face p{font-size:11px}}';
 document.head.append(style);
 const video=$('student-face-video'),device=$('student-face-device');
 const MODEL_URL='https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
 let identityMode="face",cardBusy=false,cardEndpoint="";
 let media=null,generation=0,timer=null,opening=false,paused=false,modelReady=false,modelPromise=null;
 let directory=null,directoryUntil=0,directoryPromise=null,blockedUid=null,absentSince=null;
 function message(text,error=false){$('student-face-status').textContent=text;$('student-face-status').classList.toggle('error',error);}
 function context(){return !paused&&!document.hidden&&currentTab==='live'?window.StudentQR?.faceContext():null;}
 function stopFace(){generation++;clearTimeout(timer);timer=null;media?.getTracks().forEach(t=>t.stop());media=null;video.srcObject=null;opening=false;}
 async function models(){
  if(modelReady)return;
  if(!window.faceapi)throw Error('얼굴 인식 모듈을 불러오지 못했습니다. 다시 연결하거나 학년·반·번호를 입력하세요.');
  if(!modelPromise)modelPromise=Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)]).then(()=>{modelReady=true;}).finally(()=>{modelPromise=null;});
  await modelPromise;
 }
 async function students(){
  if(directory&&Date.now()<directoryUntil)return directory;
  if(!directoryPromise)directoryPromise=(async()=>{
   const ids=await studentRead('students.json?shallow=true');
   const keys=ids&&typeof ids==='object'&&!Array.isArray(ids)?Object.keys(ids).filter(StudentQRCore.validUid):[];
   const entries=[];let cursor=0;
   await Promise.all(Array.from({length:Math.min(8,keys.length)},async()=>{
    while(cursor<keys.length){
     const uid=keys[cursor++],values=await studentRead('students/'+encodeURIComponent(uid)+'/faceDescriptor.json');
     if(Array.isArray(values)&&values.length===128&&values.every(v=>typeof v==='number'&&Number.isFinite(v)))entries.push({uid,descriptor:new Float32Array(values)});
    }
   }));
   directory=entries;directoryUntil=Date.now()+30000;return entries;
  })().finally(()=>{directoryPromise=null;});
  return directoryPromise;
 }
 async function identity(uid){
  const prefix='students/'+encodeURIComponent(uid)+'/';
  const [name,grade,room,classNum,classNo,number]=await Promise.all(['name','grade','class','classNum','classNo','number'].map(field=>studentRead(prefix+field+'.json')));
  return{uid,name:typeof name==='string'?name:'등록 학생',grade:Number(grade),room:Number(room??classNum??classNo),number:Number(number)};
 }
 async function scan(token){
  const sequence=context();if(token!==generation||sequence===null||!media||identityMode!=='face')return;
  const current=()=>token===generation&&context()===sequence;
  try{
   if(!video.videoWidth){message('카메라 준비를 기다려 주세요.');return;}
   const detections=await faceapi.detectAllFaces(video,new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:.5})).withFaceLandmarks().withFaceDescriptors();
   if(!current())return;
   if(!detections.length){
    if(absentSince===null)absentSince=performance.now();
    if(performance.now()-absentSince>=700)blockedUid=null;
    message('얼굴을 카메라에 보여주세요. 자동으로 확인합니다.');return;
   }
   absentSince=null;
   if(detections.length!==1){message('한 사람만 카메라에 나오게 해주세요.');return;}
   const list=await students();if(!current())return;
   let best=null;
   for(const entry of list){const distance=faceapi.euclideanDistance(detections[0].descriptor,entry.descriptor);if(Number.isFinite(distance)&&(!best||distance<best.distance))best={uid:entry.uid,distance};}
   if(!best||best.distance>.5){message('등록된 얼굴과 일치하지 않습니다. 다시 비추거나 학년·반·번호를 입력하세요.',true);return;}
   if(best.uid===blockedUid){message('완료된 학생입니다. 다음 학생이 얼굴을 보여주세요.');return;}
   const student=await identity(best.uid);if(!current())return;
   if(window.StudentQR.confirmFace(student,sequence))message(student.name+' 학생 확인 완료 · 식판을 놓으세요.');
  }catch(error){if(current())message(error.message||'학생 얼굴을 확인하지 못했습니다.',true);}
  finally{if(token===generation&&context()!==null)timer=setTimeout(()=>scan(token),500);}
 }
 async function cameraOptions(){
  if(!navigator.mediaDevices.enumerateDevices)return;
  const selected=device.value,list=await navigator.mediaDevices.enumerateDevices();
  device.replaceChildren(new Option('기본 전면 카메라',''));
  list.filter(d=>d.kind==='videoinput').forEach((d,i)=>device.append(new Option(d.label||'카메라 '+(i+1),d.deviceId)));
  if([...device.options].some(o=>o.value===selected))device.value=selected;
 }
 async function startFace(){
  if(context()===null||opening||media)return;
  stopFace();opening=true;const token=generation;
  message(identityMode==='card'?'학생증 촬영 카메라를 준비합니다.':'얼굴 카메라와 인식 모델을 준비하고 있습니다.');
  try{
   if(identityMode==='face')await models();if(token!==generation||context()===null)return;
   if(!navigator.mediaDevices?.getUserMedia)throw Error('HTTPS에서 카메라 권한을 허용하세요.');
   const stream=await navigator.mediaDevices.getUserMedia({video:{...(device.value?{deviceId:{exact:device.value}}:{facingMode:{ideal:'user'}}),width:{ideal:640},height:{ideal:480}},audio:false});
   if(token!==generation||context()===null){stream.getTracks().forEach(t=>t.stop());return;}
   media=stream;video.srcObject=stream;await video.play();
   if(token!==generation||context()===null)return;
   cameraOptions().catch(()=>{});
   if(identityMode==='face')timer=setTimeout(()=>scan(token),0);
   else message('학생증을 비추고 학생증 촬영 버튼을 누르세요.');
  }catch(error){
   if(token!==generation)return;
   stopFace();message('얼굴 카메라를 열지 못했습니다. 다른 얼굴 카메라를 선택하거나 학년·반·번호로 확인하세요.',true);
  }finally{if(token===generation)opening=false;}
 }

 function modeButtons(){
  $('student-card-mode').hidden=identityMode==='card';
  $('student-card-capture').hidden=$('student-face-mode').hidden=identityMode!=='card';
  $('student-identity-title').textContent=identityMode==='card'?'학생증 인식':'얼굴 자동 확인';
 }
 function setMode(mode){
  if(context()===null)return;
  identityMode=mode;stopFace();modeButtons();sync();
 }
 async function cardStudent(info,sequence,current){
  if(info.uid){const row=await identity(info.uid);return StudentCardCore.choose([row],info);}
  if(info.grade&&info.classNum&&info.number){const row=await findStudent(info.grade,info.classNum,info.number,sequence);if(!row)throw Error('학생증 정보와 일치하는 등록 학생이 없습니다.');return StudentCardCore.choose([row],info);}
  const ids=await studentRead('students.json?shallow=true'),keys=Object.keys(ids||{}).filter(StudentQRCore.validUid);
  const key=name=>String(name??'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  const matching=[];let cursor=0;
  await Promise.all(Array.from({length:Math.min(8,keys.length)},async()=>{while(cursor<keys.length&&current()){
   const uid=keys[cursor++],name=await studentRead('students/'+encodeURIComponent(uid)+'/name.json');
   if(typeof name==='string'&&key(name)===key(info.name))matching.push(uid);
  }}));
  if(!current()){const error=Error('취소된 학생증 인식입니다.');error.name='AbortError';throw error;}
  return StudentCardCore.choose(await Promise.all(matching.map(identity)),info);
 }
 async function captureCard(){
  const sequence=context();if(sequence===null||identityMode!=='card'||cardBusy)return;
  const token=generation,current=()=>token===generation&&context()===sequence&&identityMode==='card';
  const button=$('student-card-capture');cardBusy=true;button.disabled=true;
  message('Gemini로 학생증 정보를 확인하고 있습니다...');
  try{
   const info=await StudentCardCore.read(video,{current,getEndpoint:async()=>{
    if(!cardEndpoint){
     const response=await fetch('/.netlify/functions/get-key',{cache:'no-store',signal:AbortSignal.timeout(15000)});
     if(!response.ok)throw Error('Gemini 연결 정보를 불러오지 못했습니다. Netlify 배포 주소에서 다시 촬영하세요.');
     const data=await response.json();if(typeof data.apiKey!=='string'||!data.apiKey)throw Error('Gemini API 키가 설정되어 있지 않습니다.');
     cardEndpoint='https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key='+encodeURIComponent(data.apiKey);
    }
    return cardEndpoint;
   }});
   if(!current())return;
   const student=await cardStudent(info,sequence,current);if(!current())return;
   if(StudentQR.confirmIdentity(student,sequence,'student-card-gemini'))message(student.name+' 학생 확인 완료 · 식판을 놓으세요.');
  }catch(error){if(current())message(error.message||'학생증 인식에 실패했습니다.',true);}
  finally{cardBusy=false;button.disabled=false;}
 }
 $('student-card-mode').onclick=()=>setMode('card');
 $('student-face-mode').onclick=()=>setMode('face');
 $('student-card-capture').onclick=captureCard;

 function sync(){if(context()===null)stopFace();else startFace();}
 $('student-face-retry').onclick=()=>{paused=false;directoryUntil=0;stopFace();sync();};
 device.onchange=()=>{stopFace();sync();};
 document.addEventListener('cafeteria-student-selected',event=>{blockedUid=event.detail.uid;absentSince=null;stopFace();message('학생 확인 완료 · 식판을 놓으세요.');});
 document.addEventListener('cafeteria-student-reset',()=>{setTimeout(sync,0);});
 document.addEventListener('cafeteria-student-state',sync);
 const oldTab=selectTab;selectTab=function(id){oldTab(id);sync();};
 const oldStop=stop;stop=async function(){paused=true;stopFace();await oldStop();};
 const oldStart=$('start').onclick;$('start').onclick=async function(){paused=false;await oldStart();sync();};
 document.addEventListener('visibilitychange',sync);window.addEventListener('pagehide',()=>{paused=true;stopFace();directory=null;directoryUntil=0;});
 window.addEventListener('pageshow',event=>{if(event.persisted){paused=false;sync();}});
 sync();
})();
