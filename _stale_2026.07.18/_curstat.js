// _curstat.js — 해류 실제 세기 분포 (기준값을 근거로 정하기 위해)
// 게임과 같은 방식으로 base64 → int8 로 풀어 읽는다.
"use strict";
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'currents_data.js'),'utf8');
global.window={};
eval(src);
const C=window.CURRENTS;
const N=C.nx*C.ny;
const buf=Buffer.from(C.data,'base64');
const q=new Int8Array(buf.buffer, buf.byteOffset, buf.length);
console.log('격자', C.nx+'x'+C.ny, '| 칸', N, '| 바이트', buf.length, '(기대', N*2+')');
console.log('양자화 1단위 =', C.quantStep, 'cm/s | refMs(p99) =', C.refMs, 'm/s');

const k=C.quantStep/100;          // int8 -> m/s
const KN=1/0.514444;              // m/s -> 노트
const sp=[]; let zero=0;
for(let j=0;j<C.ny;j++) for(let i=0;i<C.nx;i++){
  const u=q[j*C.nx+i]*k, v=q[N+j*C.nx+i]*k;
  if(u===0 && v===0){ zero++; continue; }      // 육지 등 자료 없음
  sp.push(Math.hypot(u,v)*KN);
}
sp.sort((a,b)=>a-b);
const Q=p=>sp[Math.floor((sp.length-1)*p)];
console.log('\n바다 칸', sp.length, '/ 0인 칸', zero);
console.log('\n유속 분포 (노트)');
for(const p of [0.10,0.25,0.50,0.75,0.90,0.95,0.99,1.0])
  console.log('  p'+String(Math.round(p*100)).padStart(3)+'   '+Q(p).toFixed(3));
console.log('  평균   '+(sp.reduce((a,b)=>a+b,0)/sp.length).toFixed(3));
console.log('  0.05노트 미만(안 그려짐)  ' +
  (sp.filter(x=>x<=0.05).length/sp.length*100).toFixed(1)+'%');

function table(ref, sqrt){
  const out=[];
  for(const p of [0.10,0.25,0.50,0.75,0.90,0.99]){
    let r=Math.min(1, Q(p)/ref);
    if(sqrt) r=Math.sqrt(r);
    out.push('p'+String(Math.round(p*100)).padStart(3)+' '+(r*100).toFixed(0).padStart(3)+'%');
  }
  return out.join(' | ');
}
console.log('\n바늘 길이 (반지름 대비)');
console.log('  지금 기준 1.2노트 ......... ' + table(1.2,false));
console.log('  기준 p90 ('+Q(0.90).toFixed(2)+'노트) ....... ' + table(Q(0.90),false));
console.log('  기준 p90 + 제곱근 ......... ' + table(Q(0.90),true));
console.log('  기준 p75 ('+Q(0.75).toFixed(2)+'노트) + 제곱근 ' + table(Q(0.75),true));
