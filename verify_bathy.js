// verify_bathy.js - 수심 밴드 통합 + 지형 검증
const fs=require('fs'), D='D:\\MyApp\\The_Age_of_Discovery\\';
const html=fs.readFileSync(D+'world_chart.html','utf8');
console.log('bathy_data 연결 :', html.includes('src="bathy_data.js"'));
console.log('BATHY 디코더    :', html.includes('const BATHY = (function()'));
console.log('밴드 채색       :', html.includes("ctx.fill(BATHY[b].path,'evenodd')"));
console.log('위도 그라데 제거:', !html.includes('seaGrad'));
console.log('수심 팔레트     :', html.includes('const DEPTH_COL'));

const src=html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)[1];
const stub=`const stubCtx=new Proxy({},{get:()=>()=>({data:new Uint8Array(0)})});
const document={getElementById:()=>({getContext:()=>stubCtx,style:{},addEventListener:()=>{},innerHTML:'',width:0,height:0}),createElement:()=>({getContext:()=>stubCtx,width:0,height:0})};
const window={devicePixelRatio:1,innerWidth:1600,innerHeight:900,addEventListener:()=>{},LANDBIN:null,BATHY:null,CURRENTS:null};
const performance={now:()=>0}; const requestAnimationFrame=()=>0; const addEventListener=()=>{};
const Path2D=function(){this.moveTo=this.lineTo=this.closePath=()=>{};};
const atob=s=>Buffer.from(s,'base64').toString('binary');`;
try{ new Function(stub+'\n'+src); console.log('SYNTAX          : OK\n'); }
catch(e){ console.log('SYNTAX ERROR    :',e.message); process.exit(1); }

eval(fs.readFileSync(D+'bathy_data.js','utf8').replace('window.BATHY','var BATHY'));
const buf=Buffer.from(BATHY.data,'base64');
const dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength);
let off=0; const nB=dv.getUint32(off,true); off+=4;
const meta=[];
for(let b=0;b<nB;b++){ meta.push({d:dv.getUint32(off,true),n:dv.getUint32(off+4,true)}); off+=8; }
for(const m of meta){ m.lens=[]; for(let r=0;r<m.n;r++){ m.lens.push(dv.getUint32(off,true)); off+=4; } }
let tot=0;
for(const m of meta){ m.rings=[];
  for(let r=0;r<m.n;r++){ const pts=[];
    for(let i=0;i<m.lens[r];i++){ pts.push([dv.getInt16(off,true)/100, dv.getInt16(off+2,true)/100]); off+=4; tot++; }
    m.rings.push(pts); } }
console.log('밴드 수:',nB,'| 선언 점수:',BATHY.points,'| 실제:',tot,'| 일치:',tot===BATHY.points);
console.log('바이트 정합:',off===buf.length,`(${buf.length} bytes, ${Math.round(buf.length/1024)} KB)`);
console.log('밴드별 링수:',meta.map(m=>`${m.d}m:${m.n}`).join('  '));

function inRing(pts,x,y){ let c=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const [xi,yi]=pts[i],[xj,yj]=pts[j];
    if((yi>y)!==(yj>y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) c=!c; }
  return c; }
function zone(lon,lat){ let z=0;
  for(const m of meta){ let c=false;
    for(const r of m.rings) if(inRing(r,lon,lat)) c=!c;
    if(c) z=m.d; }
  return z; }
const NAME={0:'연안 0-200m',200:'대륙사면 200-1000m',1000:'심해 1000-4000m',4000:'심해평원 4000-6000m',6000:'해구 6000m+'};
const T=[['북해',3,56,0],['페르시아만',51,27,0],['순다대륙붕',108,3,0],['황해',123,35,0],
 ['파타고니아붕',-64,-48,0],['태평양 심해분지',-160,20,4000],['대서양 심해평원',-55,30,4000],
 ['대서양 중앙해령',-45,30,1000],['일본해구',144.3,38,6000],['마리아나 해구',142.5,11.5,6000],
 ['통가 해구',-173.2,-21,6000]];
let ok=0;
console.log('\n=== 지형 검증 ===');
for(const [n,lo,la,exp] of T){ const z=zone(lo,la); const p=(z===exp); ok+=p;
  console.log(`  [${p?'OK':'XX'}] ${n.padEnd(16)} ${NAME[z]}`); }
console.log(`\n${ok}/${T.length} 통과`);
const KMPX=40075/8192, tol=BATHY.tolDeg;
console.log(`\n단순화 오차 ${(tol*111.32).toFixed(2)} km = ${(tol*111.32/KMPX).toFixed(2)} 월드px`);
console.log(`→ 밴드 경계가 화면 3px 이내로 유지되는 한계 배율 = ${(3/(tol*111.32/KMPX)).toFixed(1)}`);
