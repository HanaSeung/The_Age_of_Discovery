// verify_gl.js — 육지 GPU 그리기(WebGL) 1단계 검증
// 실행: node verify_gl.js
//
// Node 에는 WebGL 이 없다. 그래서 세 겹으로 검증한다:
//   ① 삼각분할(순수 JS)은 원본 그대로 오려 실제 earcut 으로 돌려 수치로 대조
//   ② 해안선 stroke 수집은 브루트포스 전수 목록과 대조
//   ③ GL 배선(3층 캔버스·후퇴 경로·loop)은 원본 글 검사
// 실제 화소는 브라우저 실측이 최종 판정이다 — 이 한계를 기록에 남긴다.
"use strict";
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = __dirname;
const src = fs.readFileSync(path.join(DIR, 'world_chart.html'), 'utf8');
const earcut = require(path.join(DIR, 'earcut.min.js'));   // 실제 배포본 — 재구현 금지

let pass = 0, fail = 0;
const chk = (n, c, note) => { c ? (pass++, console.log('  OK   ' + n + (note ? '  ' + note : '')))
                                : (fail++, console.log('  FAIL ' + n + (note ? '  ' + note : ''))); };
function slice(a, b, what){
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if(i < 0 || j < 0) throw new Error('원본에서 ' + what + ' 를 찾지 못함');
  return src.slice(i, j);
}

// ---- 디코더를 돌려 LAND_RINGS(좌표 포함)를 얻는다 (verify_land 와 같은 틀) ----
const partConst = slice('// ===== 좌표계 / 월드 상수 =====', '// ===== 수심 밴드', '월드 상수');
const partLand  = slice('// ===== 육지 폴리곤', '// ===== 충돌 마스크', '디코더+컬링');
const partSeg   = slice('// ===== 해안선 stroke 수집', '// ===== 해류 필드', 'stroke 수집');
const partColl  = slice('// ===== 해안선 선분 격자 색인', '// ===== 해안선 stroke 수집', '충돌 색인');
const partTris  = slice('// --- 삼각분할 (순수 함수', '// --- 삼각분할 끝', '삼각분할');

class FakePath2D {
  moveTo(){} lineTo(){} closePath(){} addPath(){}
}
const sandbox = {
  console: { log(){}, warn(){}, error(m){ throw new Error(m); } },
  Math, Uint8Array, Uint32Array, Int8Array, Float32Array, Float64Array, Map, DataView,
  Infinity, NaN, Path2D: FakePath2D, performance: { now: () => 0 },
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  window: {}
};
new Function('window', 'atob', fs.readFileSync(path.join(DIR, 'land_data.js'), 'utf8'))
  (sandbox.window, sandbox.atob);
vm.createContext(sandbox);
vm.runInContext(partConst + '\n' + partLand.replace(/\b(const|let)\b/g, 'var'), sandbox);
const LAND_RINGS = vm.runInContext('LAND_RINGS', sandbox);
const TOT = sandbox.window.LANDBIN.points;

console.log('\n=== 1. 고리 좌표가 디코더에 남는다 (삼각분할 원료) ===');
chk('모든 고리에 c(Float32Array) 가 있다',
    LAND_RINGS.every(r => r.c && r.c.length === r.n*2));
chk('좌표 총량이 점 수와 같다',
    LAND_RINGS.reduce((s, r) => s + r.c.length/2, 0) === TOT, TOT.toLocaleString() + '점');

console.log('\n=== 2. 삼각분할 — 원본 토막 + 실제 earcut ===');
const triBox = { Math, Map, Float32Array, Float64Array };
vm.createContext(triBox);
vm.runInContext('var buildLandTris;\n' +
  partTris.replace(/\bfunction buildLandTris/, 'buildLandTris = function')
          .replace(/^\s*out\.buildLandTris.*$/m, '')     // 토막 끝의 모듈 내보내기 줄 — 밖의 out 을 참조하므로 걷는다
          .replace(/\b(const|let)\b/g, 'var'), triBox);
const built = triBox.buildLandTris(LAND_RINGS, earcut);
chk('삼각형이 만들어졌다', built.tris > 100000, built.tris.toLocaleString() + '개');
chk('구멍을 하나 이상 찾았다 (카스피해)', built.holes >= 1, built.holes + '개');
chk('정점 수 = 삼각형 x 3', built.verts.length === built.tris*3*2);
let badV = 0;
for(let i = 0; i < built.verts.length; i++) if(!isFinite(built.verts[i])) badV++;
chk('정점 좌표가 전부 유한하다', badV === 0);

console.log('\n=== 3. 면적 대조 — 삼각형 합 = 뭍 - 구멍 (브루트포스) ===');
// 느린 참값: 고리 부호 면적의 절대값을 뭍/구멍으로 갈라 직접 합한다
const ringArea = c => { let s = 0; for(let i = 0, n = c.length/2; i < n; i++){ const j = (i+1)%n;
  s += c[i*2]*c[j*2+1] - c[j*2]*c[i*2+1]; } return s/2; };
const areas = LAND_RINGS.map(r => ringArea(r.c));
let posN = 0; for(const a of areas) if(a > 0) posN++;
const holeSign = (posN > areas.length/2) ? -1 : 1;
let landA = 0, holeA = 0;
for(const a of areas){ if(a !== 0 && Math.sign(a) === holeSign) holeA += Math.abs(a);
                       else landA += Math.abs(a); }
let triA = 0;
const V = built.verts;
for(let t = 0; t < built.tris; t++){ const o = t*6;
  triA += Math.abs((V[o+2]-V[o])*(V[o+5]-V[o+1]) - (V[o+4]-V[o])*(V[o+3]-V[o+1]))/2; }
const want = landA - holeA;
chk('삼각형 면적 합이 (뭍-구멍) 과 일치한다 (0.1% 이내)  ★핵심',
    Math.abs(triA - want)/want < 0.001,
    triA.toFixed(0) + ' vs ' + want.toFixed(0) + ' (차 ' + (100*Math.abs(triA-want)/want).toFixed(4) + '%)');
chk('구멍 면적이 실제로 빠졌다 (뭍 총합보다 작다)', triA < landA*0.9999,
    '구멍 몫 ' + holeA.toFixed(0));

console.log('\n=== 4. 카스피해가 삼각형 밖이다 (구멍 관통 검사) ===');
// 가장 큰 구멍 고리의 안쪽 점(상자 중심 주변에서 고리 안에 드는 점)을 찾아
// 어떤 삼각형에도 담기지 않음을 전수로 확인한다
const inPoly = (x, y, c) => { let w = false;
  for(let i = 0, n = c.length/2, j = n-1; i < n; j = i++){
    const xi = c[i*2], yi = c[i*2+1], xj = c[j*2], yj = c[j*2+1];
    if((yi > y) !== (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) w = !w; }
  return w; };
let hole = null, hi = -1;
for(let i = 0; i < areas.length; i++)
  if(areas[i] !== 0 && Math.sign(areas[i]) === holeSign)
    if(!hole || Math.abs(areas[i]) > Math.abs(areas[hi])){ hole = LAND_RINGS[i]; hi = i; }
chk('구멍 고리를 찾았다', !!hole, hole ? ('점 ' + hole.n + ', 상자 폭 ' + (hole.x1-hole.x0).toFixed(0) + 'px') : '');
if(hole){
  let px = 0, py = 0, found = false;
  for(let ty = 0.3; ty <= 0.7 && !found; ty += 0.1) for(let tx = 0.3; tx <= 0.7 && !found; tx += 0.1){
    px = hole.x0 + (hole.x1-hole.x0)*tx; py = hole.y0 + (hole.y1-hole.y0)*ty;
    if(inPoly(px, py, hole.c)) found = true;
  }
  chk('구멍 안쪽 표본점을 잡았다', found);
  const inTri = (x, y, o) => {
    const d1 = (x-V[o+2])*(V[o+1]-V[o+3]) - (V[o]-V[o+2])*(y-V[o+3]);
    const d2 = (x-V[o+4])*(V[o+3]-V[o+5]) - (V[o+2]-V[o+4])*(y-V[o+5]);
    const d3 = (x-V[o])*(V[o+5]-V[o+1]) - (V[o+4]-V[o])*(y-V[o+1]);
    return !(((d1<0)||(d2<0)||(d3<0)) && ((d1>0)||(d2>0)||(d3>0)));
  };
  let hit = 0;
  for(let t = 0; t < built.tris; t++) if(inTri(px, py, t*6)) hit++;
  chk('그 점을 담는 삼각형이 없다  ★카스피해가 바다로 남는다', hit === 0, hit ? hit + '개 관통' : '전수 통과');
}

console.log('\n=== 5. 해안선 stroke 수집 — 전수 목록과 대조 ===');
const segBox = Object.assign(Object.create(null), sandbox);
vm.createContext(segBox);
vm.runInContext(partConst + '\n'
  + partLand.replace(/\b(const|let)\b/g, 'var') + '\n'
  + partColl.replace(/\b(const|let)\b/g, 'var') + '\n'
  + partSeg.replace(/\b(const|let)\b/g, 'var') + `
var W=1920, H=1080, zoom=100, ship={x:0,y:0};
globalThis.__S = { go:(x,y,z,k)=>{ ship.x=x; ship.y=y; zoom=z; return coastStrokePath(k||0); },
                   COASTSEG, COL_CELL, CGW, CGH, cellStart, cellItem };`, segBox);
const S = segBox.__S;
chk('충돌 색인이 섰다 (재사용 확인)', S.cellStart && S.cellItem && S.cellItem.length > 0);

// 참값: 화면 상자와 선분 상자가 겹치는 선분 수 (느리지만 확실)
function bruteCount(x, y, z, k){
  const hw = (1920/2)/z, hh = (1080/2)/z;
  const vx0 = x-hw-(k||0)*8192, vx1 = x+hw-(k||0)*8192, vy0 = y-hh, vy1 = y+hh;
  let n = 0;
  const C = S.COASTSEG;
  for(let i = 0; i < C.length/4; i++){
    const o = i*4;
    const sx0 = Math.min(C[o],C[o+2]), sx1 = Math.max(C[o],C[o+2]);
    const sy0 = Math.min(C[o+1],C[o+3]), sy1 = Math.max(C[o+1],C[o+3]);
    if(!(sx1 < vx0 || sx0 > vx1 || sy1 < vy0 || sy0 > vy1)) n++;
  }
  return n;
}
// Path2D 껍데기가 없으므로 수집된 선분 수를 lineTo 수로 센다
class CountPath { constructor(){ this.lines = 0; } moveTo(){} lineTo(){ this.lines++; } }
vm.runInContext('Path2D = ' + CountPath.toString().replace('class CountPath','class'), segBox);
const P = (lon, lat) => [(lon+180)/360*8192, (90-lat)/180*4096];
const SPOTS = [ ['리스본', ...P(-9.5, 38.6)], ['지중해', ...P(15, 38)], ['말라카', ...P(100, 4)] ];
let ok = true, note = [];
for(const [name, x, y] of SPOTS){
  const p = S.go(x, y, 100);
  const want = bruteCount(x, y, 100);
  // 수집은 셀 단위라 참값보다 많을 수 있으나(셀 여백), 적어서는 안 된다.
  // 셀 여백 상한: 화면 둘레 + 1셀 두께만큼만 더 담긴다.
  if(!p || p.lines < want){ ok = false; }
  note.push(name + ' ' + (p ? p.lines : 'null') + '/' + want);
}
chk('세 곳 모두 참값 이상을 담는다 (놓친 선분 없음)  ★핵심', ok, note.join(' · '));
const lis = S.go(...P(-9.5, 38.6), 100);
chk('리스본에서 통짜(41만)가 아니라 수천 규모다', lis && lis.lines < 50000,
    lis ? lis.lines.toLocaleString() + '선분' : 'null');
const world = S.go(4096, 2048, 0.075);
chk('세계 전체가 보이면 null (통짜 후퇴)', world === null || world.lines > 300000,
    world === null ? 'null' : world.lines + '');

console.log('\n=== 6. 배선 — 3층·후퇴·loop (원본 글 검사) ===');
chk('캔버스 3층이 순서대로 있다 (cb→cg→c)',
    src.indexOf('<canvas id="cb">') < src.indexOf('<canvas id="cg">') &&
    src.indexOf('<canvas id="cg">') < src.indexOf('<canvas id="c">'));
chk('earcut 을 land_data 보다 먼저 싣는다',
    src.indexOf('earcut.min.js') < src.indexOf('src="land_data.js"') && src.indexOf('earcut.min.js') > 0);
chk('resize 가 세 캔버스를 함께 키운다', /bcv\.width = W\*DPR/.test(src) && /gcv\.width = W\*DPR/.test(src));
chk('drawWorld: GL 이면 GLL.draw, 아니면 landCull 후퇴',
    /if\(GLL\.ok\)\{\s*\n?\s*GLL\.draw\(k\)/.test(src) && /\}else\{[\s\S]{0,200}landCull\(k\)/.test(src));
chk('loop 이 아래층에 VOID, 위층은 clearRect', /bctx\.fillStyle=VOID/.test(src) && /ctx\.clearRect\(0,0,W,H\)/.test(src));
const loopBody = slice('function loop(now){', 'requestAnimationFrame', 'loop 본문');
chk('loop 이 GLL.frame 을 오프셋 앞에서 한 번 부른다',
    loopBody.indexOf('GLL.frame()') > 0 && loopBody.indexOf('GLL.frame()') < loopBody.indexOf('drawWorld(k)'));
chk('바다·수심·격자가 아래층(bctx)으로 갔다',
    /bctx\.fillStyle = DEPTH_COL\[0\]/.test(src) && /drawRhumb\(bctx\)/.test(src) && /drawGraticule\(bctx\)/.test(src));
chk('SEG_STROKE_MAX 가 이름 있는 상수다', /const SEG_STROKE_MAX\s*=\s*\d+/.test(src));
const segFn = slice('function coastStrokePath', '\n}', 'stroke 함수 본문');
chk('칸 순회 전에 즉시 포기한다 (세계 전체 1fps 사고 재발 방지)  ★핵심',
    /const SEG_STROKE_CELLS\s*=\s*\d+/.test(src) &&
    segFn.indexOf('SEG_STROKE_CELLS') > 0 &&
    segFn.indexOf('SEG_STROKE_CELLS') < segFn.indexOf('for(let gy'),
    '포기가 순회보다 앞에 있어야 한다');
chk('카메라 상대 좌표 셰이더다 (정밀도)', /aP\.x \+ uOff - uCam\.x/.test(src));
chk('SOURCES_LICENSE 에 earcut 이 있다',
    /earcut/.test(fs.readFileSync(path.join(DIR,'SOURCES_LICENSE.md'),'utf8')));

console.log('\n' + (fail ? '실패 있음' : '모두 통과') + ' — 통과 ' + pass + ' / 실패 ' + fail);
process.exit(fail ? 1 : 0);
