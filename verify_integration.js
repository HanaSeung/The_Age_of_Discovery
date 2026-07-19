// verify_integration.js - world_chart.html 통합 코드 문법 + 해류 샘플링 검증
const fs = require('fs');
// 작업 폴더가 컴퓨터마다 다르므로(C:/D:) 경로를 박아두지 않는다.
// 이 스크립트가 있는 자리를 기준으로 삼는다.
const D = __dirname + '\\';
const html = fs.readFileSync(D + 'world_chart.html', 'utf8');

// 1) script 태그 연결 확인
console.log('script tag linked :', html.includes('src="currents_data.js"'));
console.log('CUR module        :', html.includes('const CUR = (function()'));
// 시간 변수가 dt 에서 gdt(게임 시간) 로 바뀌었다. 이름에 묶이지 않게 본다.
console.log('current applied   :', /\(ship\.vx \+ curVec\.x\)\s*\*\s*g?dt/.test(html));

// 2) 문법 검증 (브라우저 전역 스텁)
// 저장소는 LF, Windows 작업트리는 CRLF 다(.gitattributes 의 text=auto).
// 어느 쪽이든 받도록 \r 을 열어둔다. 없으면 여기서 통째로 터진다.
const _m = html.match(/<script>\r?\n"use strict";([\s\S]*?)<\/script>/);
if(!_m){ console.log('X  <script> "use strict" 블록을 찾지 못했다'); process.exit(1); }
const src = _m[1];
const stub = `
const stubCtx = new Proxy({}, {get:()=>()=>({data:new Uint8Array(0)})});
const document={getElementById:()=>({getContext:()=>stubCtx,style:{},addEventListener:()=>{},innerHTML:'',width:0,height:0}),createElement:()=>({getContext:()=>stubCtx,width:0,height:0})};
const window={devicePixelRatio:1,innerWidth:1600,innerHeight:900,addEventListener:()=>{},CURRENTS:null};
const performance={now:()=>0}; const requestAnimationFrame=()=>0;
const addEventListener=()=>{}; const Path2D=function(){this.moveTo=this.lineTo=this.closePath=()=>{};};
const atob=s=>Buffer.from(s,'base64').toString('binary');
`;
try { new Function(stub + '\n' + src); console.log('SYNTAX            : OK'); }
catch (e) { console.log('SYNTAX ERROR      :', e.message); process.exit(1); }

// 3) 해류 샘플링 로직 재현 검증 (실제 상수 사용)
eval(fs.readFileSync(D + 'currents_data.js', 'utf8').replace('window.CURRENTS', 'var CURRENTS'));
const WORLD_W = 8192, WORLD_H = 4096, CUR_MAX = 94;
const C = CURRENTS, NXC = C.nx, NYC = C.ny, N = NXC * NYC;
const bin = Buffer.from(C.data, 'base64');
const q = new Int8Array(N * 2);
for (let i = 0; i < N * 2; i++) q[i] = bin[i] > 127 ? bin[i] - 256 : bin[i];
const k = C.quantStep / 100, s = CUR_MAX / C.refMs;
const cU = (i,j) => q[j*NXC+i]*k*s, cV = (i,j) => q[N+j*NXC+i]*k*s;
function sample(lon, lat) {
  let fx = (lon+180)/2 - 0.5, fy = (90-lat)/2 - 0.5;
  let i0 = Math.floor(fx), j0 = Math.floor(fy);
  const tx = fx-i0, ty = fy-j0;
  if (j0 < 0) j0 = 0; if (j0 > NYC-2) j0 = NYC-2;
  const i1 = ((i0+1)%NXC+NXC)%NXC; i0 = ((i0%NXC)+NXC)%NXC;
  const j1 = j0+1;
  const a=(1-tx)*(1-ty), b=tx*(1-ty), c=(1-tx)*ty, d=tx*ty;
  return { x: cU(i0,j0)*a + cU(i1,j0)*b + cU(i0,j1)*c + cU(i1,j1)*d,
           y: -(cV(i0,j0)*a + cV(i1,j0)*b + cV(i0,j1)*c + cV(i1,j1)*d) };
}
const SPEED = 235;
console.log('\n해류 → 월드px/초 (선박 최고속 ' + SPEED + ' 대비)');
const T = [['만류',-68,38],['쿠로시오',143,36],['남적도해류',-140,-2],
           ['ACC 태평양',-120,-55],['태평양 중앙',-150,20]];
for (const [n, lo, la] of T) {
  const c2 = sample(lo, la), m = Math.hypot(c2.x, c2.y);
  console.log(`  ${n.padEnd(12)} vx=${c2.x.toFixed(1).padStart(7)} vy=${c2.y.toFixed(1).padStart(7)}` +
              ` | ${m.toFixed(1).padStart(6)} px/s = 선박속 ${(100*m/SPEED).toFixed(1)}%`);
}
// 경도 순환 연속성 (보간 포함)
const L = sample(-179.9, 0), R = sample(179.9, 0);
console.log(`  wrap 연속성: lon-179.9 vx=${L.x.toFixed(1)} / lon+179.9 vx=${R.x.toFixed(1)} (연속이어야 함)`);
const mx = Math.max(...Array.from({length:N},(_,i)=>Math.hypot(q[i],q[N+i])))*k*s;
console.log(`  최대 해류 세기: ${mx.toFixed(1)} px/s = 선박속 ${(100*mx/SPEED).toFixed(1)}%`);
