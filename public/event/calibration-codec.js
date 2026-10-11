(function(root){'use strict';
const LENGTH=160*120*4,ENCODED_LENGTH=Math.ceil(LENGTH/3)*4;
function encode(bytes){if(bytes.length!==LENGTH)throw Error('기준 화면 크기가 올바르지 않습니다');let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.slice(i,i+8192));return btoa(binary);}
function decode(value){if(typeof value!=='string'||value.length!==ENCODED_LENGTH||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('기준 화면 데이터 형식이 올바르지 않습니다');const binary=atob(value);if(binary.length!==LENGTH)throw Error('기준 화면 데이터 크기가 올바르지 않습니다');return Array.from(binary,c=>c.charCodeAt(0));}
function pack(s,bg,empty){return{schemaVersion:2,encoding:'rgba8-base64',width:160,height:120,s:{...s},bg:encode(bg),empty:encode(empty),updatedAt:{'.sv':'timestamp'}};}
function unpack(value){if(value?.schemaVersion!==2)return value;if(value.encoding!=='rgba8-base64'||value.width!==160||value.height!==120)throw Error('지원하지 않는 기준 화면 형식입니다');return{...value,schemaVersion:1,bg:decode(value.bg),empty:decode(value.empty)};}
async function responseError(response,action){let detail='';try{const text=await response.text();try{detail=JSON.parse(text).error||'';}catch{detail=text;}detail=String(detail).slice(0,350);}catch{}if(detail.includes('maximum size'))detail='Firebase 요청 크기 제한을 초과했습니다. 페이지를 새로고침한 뒤 다시 저장해 주세요.';return Error(`${action} (HTTP ${response.status})${detail?' · '+detail:''}`);}
root.CalibrationCodec={pack,unpack,responseError};
})(globalThis);
