(function(root){
 'use strict';
 // Allergen numbers: https://www.ice.go.kr/icefood/cm/cntnts/cntntsView.do?cntntsId=629&mi=10779
 const names=['난류','우유','메밀','땅콩','대두','밀','고등어','게','새우','돼지고기','복숭아','토마토','아황산류','호두','닭고기','쇠고기','오징어','조개류','잣'];
 const aliases={계란:'난류',달걀:'난류',달걀류:'난류',난백:'난류',난황:'난류',egg:'난류',eggs:'난류',milk:'우유',콩:'대두',soy:'대두',대두콩:'대두',wheat:'밀',소고기:'쇠고기',소:'쇠고기',아황산염:'아황산류',굴:'조개류',전복:'조개류',홍합:'조개류',조개:'조개류'};
 function normalize(value){
  const out=new Set();
  function add(v){
   if(v===null||v===undefined||v===false)return;
   if(Array.isArray(v)){v.forEach(add);return;}
   if(typeof v==='object'){for(const [k,x] of Object.entries(v)){if(x===true)add(k);else add(x);}return;}
   let text=String(v).replace(/[①-⑲]/g,c=>','+(c.charCodeAt(0)-0x2460+1)+',').normalize('NFKC');
   if(/^(없음|해당없음|알레르기없음|none|0|-)$/i.test(text.replace(/\s/g,'')))return;
   text=text.replace(/조개류\([^)]*\)/g,'조개류');
   for(let token of text.split(/[,;\/|·\n]+/)){
    token=token.trim();if(!token)continue;
    if(/^[\d.\s()]+$/.test(token)){for(const n of token.match(/\d+/g)||[])if(+n>=1&&+n<=19)out.add(names[+n-1]);continue;}
    token=token.replace(/^([^()]+)\(.*$/,'$1').replace(/[()]/g,'').replace(/^\d{1,2}[.)]\s*/,'').replace(/\s*(함유|알레르기)\s*$/,'').replace(/\s+/g,'').toLowerCase();
    if(token)out.add(aliases[token]||names.find(n=>n===token)||token.slice(0,40));
   }
  }add(value);return [...out].sort();
 }
 function info(value){
  if(value===null||value===undefined||typeof value==='string'&&(!value.trim()||/^(미등록|정보\s*없음|확인\s*필요)$/.test(value.trim())))return{known:false,tokens:[]};
  return{known:true,tokens:normalize(value)};
 }
 function evaluate(student,menu,metadata,foods=['밥','국','김치']){
  const mine=normalize(student),perFood=metadata&&typeof metadata==='object'&&!Array.isArray(metadata)&&foods.some(f=>Object.hasOwn(metadata,f));
  return foods.map(food=>{
   if(!mine.length)return{food,blocked:false,matches:[],unknown:false,global:false};
   let data=info(perFood?metadata[food]:metadata);
   if(!perFood&&Array.isArray(metadata)&&!metadata.length)data={known:false,tokens:[]};
   const annotations=[...String(menu?.[food]||'').matchAll(/[（(]([\d.\s,·]+)[）)]/g)].flatMap(m=>normalize(m[1]));
   const tokens=new Set([...data.tokens,...annotations]),known=data.known||annotations.length>0,matches=mine.filter(x=>tokens.has(x));
   return{food,blocked:!known||matches.length>0,matches,unknown:!known,global:!perFood&&matches.length>0};
  });
 }
 function sanitize(counts,statuses){return counts.map((v,i)=>statuses[i]?.blocked?0:Math.max(0,Number(v)||0));}
 root.CafeteriaAllergy={names,normalize,evaluate,sanitize};
})(globalThis);
