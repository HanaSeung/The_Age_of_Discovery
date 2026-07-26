// verify_speed.js - 시간 압축 고정 후 속도/단위 정합성 검증
const fs = require('fs');
const D = 'D:\\MyApp\\The_Age_of_Discovery\\';
const html = fs.readFileSync(D + 'world_chart.html', 'utf8');

console.log('시간압축 상수 :', html.includes('const DAY_PER_SEC = 1'));
console.log('SPEED=8노트   :', html.includes('const SPEED = 8 * KN_TO_PX'));
console.log('해류 실측적용 :', html.includes('const s = MS_TO_PX'));
console.log('HUD 실노트    :', html.includes('(sp*PX_TO_KN).toFixed(1)'));
console.log('임의배율 제거 :', !html.includes('CUR_MAX'));

const src = html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)[1];
const stub = `
const stubCtx=new Proxy({},{get:()=>()=>({data:new Uint8Array(0)})});
const document={getElementById:()=>({getContext:()=>stubCtx,style:{},addEventListener:()=>{},innerHTML:'',width:0,height:0}),createElement:()=>({getContext:()=>stubCtx,width:0,height:0})};
const window={devicePixelRatio:1,innerWidth:1600,innerHeight:900,addEventListener:()=>{},LANDBIN:null,CURRENTS:null};
const performance={now:()=>0}; const requestAnimationFrame=()=>0;
const addEventListener=()=>{}; const Path2D=function(){this.moveTo=this.lineTo=this.closePath=()=>{};};
const atob=s=>Buffer.from(s,'base64').toString('binary');
`;
try { new Function(stub + '\n' + src); console.log('SYNTAX        : OK\n'); }
catch (e) { console.log('SYNTAX ERROR  :', e.message); process.exit(1); }

const WORLD_W=8192, EQ=40075, KMPX=EQ/WORLD_W, DPS=1;
const KN_TO_PX=(1.852*24*DPS)/KMPX, MS_TO_PX=(3.6*24*DPS)/KMPX, PX_TO_KN=1/KN_TO_PX;
const SPEED=8*KN_TO_PX, SAIL_MAX=4;
console.log('=== 환산 상수 ===');
console.log(`1 월드px = ${KMPX.toFixed(3)} km | 게임 1초 = 실제 ${DPS}일`);
console.log(`1 노트 = ${KN_TO_PX.toFixed(3)} px/s | 1 m/s = ${MS_TO_PX.toFixed(2)} px/s`);
console.log(`전속 SPEED = ${SPEED.toFixed(1)} px/s = ${(SPEED*PX_TO_KN).toFixed(1)} kn  (이전 235 px/s)`);
console.log(`→ 속도가 이전의 ${(SPEED/235*100).toFixed(0)}% 로 감소\n`);

console.log('=== 돛 단수별 실제 속력 ===');
for(let s=0;s<=SAIL_MAX;s++){
  const px=SPEED*(s/SAIL_MAX), kn=px*PX_TO_KN;
  console.log(`  돛 ${s}/4 → ${px.toFixed(1).padStart(5)} px/s = ${kn.toFixed(1).padStart(4)} kn = 하루 ${(kn*1.852*24).toFixed(0).padStart(4)} km`);
}
console.log(`  Shift 순풍 → ${(SPEED*1.25*PX_TO_KN).toFixed(1)} kn`);

console.log('\n=== 해류 (OSCAR 실측, 증폭 없음) ===');
for(const [n,ms] of [['p99 기준',0.746],['만류',0.51],['쿠로시오',0.32],['실측 최대',2.48]]){
  const px=ms*MS_TO_PX;
  console.log(`  ${n.padEnd(10)} ${ms.toFixed(2)} m/s = ${(ms*3.6/1.852).toFixed(2).padStart(4)} kn → ${px.toFixed(1).padStart(5)} px/s (전속 대비 ${(100*px/SPEED).toFixed(0)}%)`);
}
console.log(`  안전상한 55 px/s = ${(55*PX_TO_KN).toFixed(1)} kn → 실측최대 ${(2.48*MS_TO_PX).toFixed(1)} px/s 이므로 사실상 미작동`);

console.log('\n=== 항해 소요 ===');
for(const [n,km] of [['적도 일주',EQ],['리스본→희망봉 약',11000],['대서양 횡단 약',6000]]){
  const days=km/(8*1.852*24);
  console.log(`  ${n.padEnd(16)} ${km.toLocaleString()} km → 실제 ${days.toFixed(0).padStart(3)}일 = 게임 ${(days/DPS).toFixed(0).padStart(3)}초`);
}
console.log(`\n선회 반경(전속): ${(SPEED/1.15).toFixed(0)} px = ${(SPEED/1.15*KMPX).toFixed(0)} km (이전 1000 km)`);
