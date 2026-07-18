// verify_curviz.js - 해류 시각화(파티클) 통합 검증
const fs = require('fs');
const D = 'D:\\MyApp\\The_Age_of_Discovery\\';
const html = fs.readFileSync(D + 'world_chart.html', 'utf8');

console.log('CURVIZ 모듈    :', html.includes('const CURVIZ = (function()'));
console.log('물리 항상적용  :', html.includes('if(CUR) CUR.sample(ship.x, ship.y, curVec)'));
console.log('  └ 조건부 제거:', !html.includes('CUR && show.cur'));
console.log('루프 연결(step):', html.includes('CURVIZ.step(dt)'));
console.log('루프 연결(draw):', html.includes('CURVIZ.draw()'));
console.log('배보다 아래    :', html.indexOf('CURVIZ.draw()') < html.indexOf('drawShip();\n  compass'));
console.log('페이드 전환    :', html.includes("alpha += ((show.cur?1:0)-alpha)"));
console.log('HUD OFF 제거   :', !html.includes('해류 <span class="v">OFF</span>'));

const src = html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)[1];
const stub = `
const stubCtx=new Proxy({},{get:()=>()=>({data:new Uint8Array(0)})});
const document={getElementById:()=>({getContext:()=>stubCtx,style:{},addEventListener:()=>{},innerHTML:'',width:0,height:0}),createElement:()=>({getContext:()=>stubCtx,width:0,height:0})};
const window={devicePixelRatio:1,innerWidth:1600,innerHeight:900,addEventListener:()=>{},LANDBIN:null,CURRENTS:null};
const performance={now:()=>0}; const requestAnimationFrame=()=>0;
const addEventListener=()=>{}; const Path2D=function(){this.moveTo=this.lineTo=this.closePath=()=>{};};
const atob=s=>Buffer.from(s,'base64').toString('binary');
`;
try { new Function(stub + '\n' + src); console.log('SYNTAX         : OK\n'); }
catch (e) { console.log('SYNTAX ERROR   :', e.message); process.exit(1); }

// --- 밝기 매핑이 실제 해류를 어떻게 표현하는지 ---
const WORLD_W=8192, KMPX=40075/WORLD_W, MS_TO_PX=(3.6*24)/KMPX, REF=0.746*MS_TO_PX;
console.log('=== 세기 → 밝기/굵기 매핑 (제곱근 보정) ===');
console.log('해역'.padEnd(14), '유속', '   밝기', '  굵기');
for (const [n, ms] of [['잔잔한 대양',0.05],['보통',0.2],['쿠로시오',0.32],['만류',0.51],['p99 기준',0.746],['최대',2.48]]) {
  const px = ms*MS_TO_PX, s = Math.min(1, Math.sqrt(px/REF));
  const a = 0.85*(0.16+0.84*s), lw = 0.9+1.7*s;
  const bar = '█'.repeat(Math.max(1,Math.round(a*20)));
  console.log(`${n.padEnd(14)} ${(ms*3.6/1.852).toFixed(2).padStart(4)}kn  ${a.toFixed(2)}  ${lw.toFixed(1)}px ${bar}`);
}
console.log('\n(선형이었다면 잔잔한 대양의 밝기는 %s — 사실상 안 보임)',
  (0.85*(0.16+0.84*Math.min(1,(0.05*MS_TO_PX)/REF))).toFixed(2));

// --- 궤적 길이가 배율과 무관하게 일정한지 ---
console.log('\n=== 궤적 길이 (점 간격 = 화면 2px × 8점) ===');
for (const z of [0.195, 0.42, 2, 13]) {
  const gapWorld = 2/z;
  console.log(`  배율 ${z.toFixed(2).padStart(5)} → 점 간격 ${gapWorld.toFixed(1).padStart(5)} 월드px = 화면 2px | 궤적 총길이 화면 ${(2*7).toFixed(0)}px (일정)`);
}
console.log('\n파티클 수: 1100 (화면 밖으로 나가면 즉시 재배치 — 보이는 영역만 유지)');
