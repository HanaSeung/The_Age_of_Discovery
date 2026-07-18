// verify_helm.js - 조타 방식(돛 단수 + 회전) 검증
const fs = require('fs');
const D = 'D:\\MyApp\\The_Age_of_Discovery\\';
const html = fs.readFileSync(D + 'world_chart.html', 'utf8');

console.log('돛 단수 입력   :', html.includes("ship.sail = Math.min(SAIL_MAX, ship.sail+1)"));
console.log('자동반복 차단  :', html.includes('if(!e.repeat)'));
console.log('침로 전진      :', html.includes('ship.vx = Math.cos(ship.head)*ship.speed'));
console.log('침로 파생 제거 :', !html.includes('ship.head = Math.atan2(ship.vy,ship.vx)'));
console.log('돛 크기 연동   :', html.includes('const sf = 0.30 + 0.70*Math.min(1, ship.speed/SPEED)'));

const src = html.match(/<script>\n"use strict";([\s\S]*?)<\/script>/)[1];
const stub = `
const stubCtx=new Proxy({},{get:()=>()=>({data:new Uint8Array(0)})});
const document={getElementById:()=>({getContext:()=>stubCtx,style:{},addEventListener:()=>{},innerHTML:'',width:0,height:0}),createElement:()=>({getContext:()=>stubCtx,width:0,height:0})};
const window={devicePixelRatio:1,innerWidth:1600,innerHeight:900,addEventListener:()=>{},CURRENTS:null};
const performance={now:()=>0}; const requestAnimationFrame=()=>0;
const addEventListener=()=>{}; const Path2D=function(){this.moveTo=this.lineTo=this.closePath=()=>{};};
const atob=s=>Buffer.from(s,'base64').toString('binary');
`;
try { new Function(stub + '\n' + src); console.log('SYNTAX         : OK\n'); }
catch (e) { console.log('SYNTAX ERROR   :', e.message); process.exit(1); }

// --- 물리 재현 시뮬레이션 ---
const SPEED=235, SAIL_MAX=4, ACC_UP=70, ACC_DN=130, TURN_FULL=1.15, TURN_IDLE=0.12;
function sim(sail, secs, turning) {
  let speed=0, head=0, dt=1/60;
  for (let t=0; t<secs; t+=dt) {
    const target = SPEED*(sail/SAIL_MAX);
    if (speed<target) speed=Math.min(target, speed+ACC_UP*dt);
    else speed=Math.max(target, speed-ACC_DN*dt);
    const rf = TURN_IDLE + (1-TURN_IDLE)*Math.min(1, speed/SPEED);
    if (turning) head += TURN_FULL*rf*dt;
  }
  return { speed, deg: head*180/Math.PI };
}
console.log('돛 단수별 도달 속력 (30초 후)');
for (let s=0; s<=SAIL_MAX; s++) {
  const r = sim(s, 30, false);
  const sf = 0.30 + 0.70*Math.min(1, r.speed/SPEED);
  console.log(`  돛 ${s}/4 → ${r.speed.toFixed(0).padStart(3)} px/s (${(r.speed/10).toFixed(1)} kn) | 돛크기 ${(sf*100).toFixed(0)}%`);
}
console.log('\n선회 성능 (10초간 A/D 유지)');
console.log(`  정지(돛0)  : ${sim(0,10,true).deg.toFixed(0).padStart(4)}° 회전  ← 거의 안 돎`);
console.log(`  돛2/4      : ${sim(2,10,true).deg.toFixed(0).padStart(4)}° 회전`);
console.log(`  전속(돛4)  : ${sim(4,10,true).deg.toFixed(0).padStart(4)}° 회전  ← 잘 돎`);
console.log('\n전속에서 완전정지까지:', (SPEED/ACC_DN).toFixed(1), '초 / 정지→전속:', (SPEED/ACC_UP).toFixed(1), '초');
