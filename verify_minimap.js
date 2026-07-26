// verify_minimap.js — 원형 계기(DIAL)의 해도 쪽 검증
// 실행: node verify_minimap.js
//
// 2026.07.26 미니맵(MINI)과 나침반을 원형 계기(DIAL)로 합쳤다. 이 파일은 해도
// 쪽(굽기·오려붙이기·축척 단·컬링)을 맡고, 계기 쪽(바늘·방위·모서리)은
// verify_compass.js 가 맡는다.
// world_chart.html 의 DIAL 절을 잘라 내어 그대로 돌린다. 재구현하지 않는다.
// 캔버스·DOM 은 호출을 세는 껍데기로 채운다.
"use strict";
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = __dirname;
const src = fs.readFileSync(path.join(DIR, 'world_chart.html'), 'utf8');

let pass = 0, fail = 0;
const chk = (n, c, note) => { c ? (pass++, console.log('  OK   ' + n + (note ? '  ' + note : '')))
                                : (fail++, console.log('  FAIL ' + n + (note ? '  ' + note : ''))); };

function slice(a, b, what){
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if(i < 0 || j < 0) throw new Error('원본에서 ' + what + ' 를 찾지 못함');
  return src.slice(i, j);
}
const partDial = slice('// ===== 원형 계기 — 우하',
                       '// ===== 바람 화살표', '원형 계기');

// ---- 껍데기 캔버스 — 무엇을 몇 번 그렸는지만 센다 ----
// 글자는 개수뿐 아니라 내용도 담는다 — 표시값 넷이 모두 원 안으로 들어와,
// 무엇이 적혔는지 볼 곳이 캔버스밖에 없다.
const tally = { fill:0, stroke:0, fillRect:0, drawImage:0, text:0, paths:[], texts:[] };
function fakeCtx(){
  return {
    set fillStyle(v){}, set strokeStyle(v){}, set lineWidth(v){}, set lineJoin(v){},
    set lineCap(v){}, set font(v){}, set textAlign(v){}, set textBaseline(v){},
    setTransform(){}, save(){}, restore(){}, translate(){}, rotate(){}, scale(){},
    beginPath(){}, moveTo(){}, lineTo(){}, closePath(){}, arc(){}, clip(){},
    clearRect(){}, fillRect(){ tally.fillRect++; },
    strokeRect(){ tally.stroke++; },
    fill(p){ tally.fill++; if(p) tally.paths.push(p); },
    stroke(p){ tally.stroke++; if(p) tally.paths.push(p); },
    fillText(s){ tally.text++; tally.texts.push(String(s)); }, strokeText(){ tally.text++; },
    measureText(s){ return { width: String(s).length * 7 }; },
    drawImage(){ tally.drawImage++; }
  };
}
function fakeCanvas(){ const c = { width:0, height:0 }; const g = fakeCtx();
                       c.getContext = () => g; return c; }
const dCanvas = fakeCanvas();
const dialCard = { cls:{}, classList:{ toggle(n,v){ dialCard.cls[n] = !!v; },
                                       contains(n){ return !!dialCard.cls[n]; },
                                       remove(n){ dialCard.cls[n] = false; } } };
const mkBtn = () => ({ disabled:false, addEventListener(){} });
const dIn = mkBtn(), dOut = mkBtn();
// 모서리 판은 걷어냈다 — 계기가 찾는 DOM 은 캔버스·카드·버튼 둘뿐이다
const store = {};

// ---- 그리기에 필요한 바깥값 (원본과 같은 값으로 세운다) ----
const WORLD_W = 8192, WORLD_H = 4096;
const KM_PER_PX = 40075/WORLD_W;
const stubs = `
var WORLD_W=${WORLD_W}, WORLD_H=${WORLD_H};
var KM_PER_PX=${KM_PER_PX}, PX_TO_KN=1;
var DEPTH_COL=['a','b','c','d','e'], LAND_C='#d8bf8e', COAST='#6b4a2a', VOID='#20302d';
var landPath={ __isPath:true };
// 가짜 고리 다섯 — 굽기 컬링 대조용. 상자가 곧 정답표다.
// 3번은 1번(큰 것) 안의 구멍 흉내: 상자가 안에 있으니 함께 뽑혀야 한다.
var LAND_RINGS=[
  { p:{__ring:0}, x0:1900, y0:1300, x1:2600, y1:1800 },
  { p:{__ring:1}, x0:1000, y0:1000, x1:5000, y1:2600 },
  { p:{__ring:2}, x0:7900, y0:1900, x1:8190, y1:2100 },
  { p:{__ring:3}, x0:2900, y0:1900, x1:3100, y1:2050 },
  { p:{__ring:4}, x0:100,  y0:3800, x1:300,  y1:3950 }
];
globalThis.__RINGS = LAND_RINGS;      // 시험이 정답표로 쓴다 (null 로 갈아 끼워도 원본 유지)
class Path2D{ constructor(){ this.parts=[]; } addPath(p){ this.parts.push(p); } }
var ship={ x:2100, y:1500, head:0.4, grounded:false, windMs:8, vx:0.1, vy:0 };
var zoom=100, W=1920, H=1080;
var WIND={}, windVec={x:1,y:0.2}, curVec={x:0.02,y:0.01};
var P={ windMin:0.5 }, SHIP={ spec:{ nogoDeg:40 } };
function wrapX(x){ return ((x % WORLD_W) + WORLD_W) % WORLD_W; }
function geo(v, pos, neg){ return Math.abs(v).toFixed(1)+'\u00b0'+(v>=0?pos:neg); }
`;

const sandbox = {
  console: { log(){}, warn(){}, error(m){ throw new Error(m); } },
  Math, parseInt, String, isFinite, Infinity, NaN,
  document: {
    getElementById(id){ return id === 'dCanvas' ? dCanvas
                             : id === 'dial'    ? dialCard
                             : id === 'dIn'     ? dIn
                             : id === 'dOut'    ? dOut : null; },
    createElement(){ return fakeCanvas(); },
    documentElement: { addEventListener(){} }
  },
  window: { devicePixelRatio: 1 },
  addEventListener(){},
  localStorage: { getItem(k){ return k in store ? store[k] : null; },
                  setItem(k,v){ store[k] = String(v); },
                  removeItem(k){ delete store[k]; } }
};
vm.createContext(sandbox);
vm.runInContext(stubs + '\n' + partDial + `
globalThis.__X = { DIAL, ship };
globalThis.__setZoom = v => { zoom = v; };
globalThis.__setWH = (w,h) => { W = w; H = h; };
globalThis.__killRings = () => { globalThis.__save = LAND_RINGS; LAND_RINGS = null; };
globalThis.__reviveRings = () => { LAND_RINGS = globalThis.__save; };`, sandbox);

const { DIAL, ship } = sandbox.__X;
const inRect = (a, b, eps) => a.x >= b.x-eps && a.y >= b.y-eps &&
                              a.x+a.w <= b.x+b.w+eps && a.y+a.h <= b.y+b.h+eps;
const N = DIAL.SPAN_KM.length;

console.log('\n=== 0. 상수 ===');
console.log(`  축척 ${DIAL.SPAN_KM.join(' / ')} km | 원 ${DIAL.SIZE} (해도 지름 ${DIAL.RC*2})` +
            ` | 굽는 여유 ${DIAL.OVER}배 | 다시 굽는 문턱 ${DIAL.REBAKE}`);
chk('단이 7개다 (0 + 여섯 단)', N === 7, N + '개');
chk('0단은 해도 없음(거리 0)이다', DIAL.SPAN_KM[0] === 0);
chk('1~6단이 오름차순이다',
    DIAL.SPAN_KM.slice(1).every((v,i) => i === 0 || v > DIAL.SPAN_KM[i]));
chk('여섯 단이 배증이다 (250·500·…·8000)',
    DIAL.SPAN_KM.slice(2).every((v,i) => v === DIAL.SPAN_KM[i+1]*2),
    DIAL.SPAN_KM.slice(1).join('·'));
chk('확대 끝이 1단이다 — 0(해도 없음)은 버튼 밖', DIAL.BTN_MIN === 1);
chk('상한이 가질 수 있는 가장 큰 값이 마지막 단이다', DIAL.CAP_MAX === N-1,
    DIAL.CAP_MAX + '단');
chk('굽는 조각이 보이는 것보다 넓다', DIAL.OVER > 1, DIAL.OVER + '배');
chk('문턱이 여유 안쪽이다', DIAL.REBAKE > 0 && DIAL.REBAKE < 1, DIAL.REBAKE);
chk('세계 전체보다 좁다 — 국지 해도다', DIAL.SPAN_KM[N-1] < 40075,
    DIAL.SPAN_KM[N-1] + 'km < 40,075km(적도 한 바퀴)');
chk('해도 반지름이 띠에서 유도된다', DIAL.RC === DIAL.SIZE/2 - DIAL.BAND,
    `${DIAL.SIZE}/2 − ${DIAL.BAND} = ${DIAL.RC}`);
chk('점이 금색 원을 안팎으로 걸친다 — 띠를 넘지 않는다',
    DIAL.DOT_R > 0 && DIAL.RC + DIAL.DOT_R <= DIAL.SIZE/2,
    `${DIAL.RC - DIAL.DOT_R} ~ ${DIAL.RC + DIAL.DOT_R} (반지름 ${DIAL.SIZE/2} 안)`);

console.log('\n=== 1. 지도가 담는 범위 — 원이라 가로세로가 같다 ===');
for(let s=1;s<N;s++){
  DIAL.setStep(s); DIAL.doBake();
  const v = DIAL.viewRect();
  const km = v.w * KM_PER_PX;
  chk(`${s}단 지름이 ${DIAL.SPAN_KM[s]}km`, Math.abs(km - DIAL.SPAN_KM[s]) < 1e-6,
      km.toFixed(1) + 'km');
  chk(`${s}단 가로세로가 같다`, Math.abs(v.h - v.w) < 1e-9);
}
// 0단은 이제 상한을 0 으로 내렸을 때에만 나온다 (setStep 으로는 못 간다)
DIAL.setCap(0);
chk('0단은 담는 거리가 0 — 구울 것이 없다', DIAL.spanPx() === 0 && DIAL.need() === false);
DIAL.setCap(DIAL.CAP_MAX);

console.log('\n=== 2. 불변식 — 보이는 조각은 늘 구운 조각 안에 있다 ===');
// 이것이 깨지면 화면에 굽지 않은 자리가 나온다. 배를 오래 걷게 하며 매 걸음 확인.
let bad = 0, bakes = 0, steps = 0;
let rng = 12345;
const rand = () => (rng = (rng*1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for(let s=1;s<N;s++){
  DIAL.setStep(s);
  ship.x = 2100; ship.y = 1500; DIAL.doBake(); bakes++;
  for(let i=0;i<20000;i++){
    // 한 걸음은 기본 시계(0.30px)에서 빠른 시계(3.6px) 사이
    const a = rand()*Math.PI*2, len = 0.3 + rand()*3.3;
    ship.x = ((ship.x + Math.cos(a)*len) % WORLD_W + WORLD_W) % WORLD_W;  // 원본과 같이 wrapX
    ship.y = Math.max(0, Math.min(WORLD_H, ship.y + Math.sin(a)*len));
    if(DIAL.need()){ DIAL.doBake(); bakes++; }
    steps++;
    if(!inRect(DIAL.viewRect(), DIAL.bakeRect(), 1e-6)) bad++;
  }
}
chk('벗어난 프레임 없음', bad === 0, bad ? bad + '프레임 벗어남' : steps.toLocaleString() + '걸음 검사');
console.log(`  다시 구운 횟수 ${bakes} / ${steps.toLocaleString()}걸음` +
            ` (${(steps/bakes).toFixed(0)}걸음마다 한 번)`);
chk('굽기가 드물다 — 프레임마다 굽지 않는다', steps/bakes > 50,
    (steps/bakes).toFixed(0) + '걸음마다');

console.log('\n=== 3. 경도 이음매 ===');
// ship.x 는 wrapX 로 [0,W) 에 갇혀 있고 구운 조각은 절대좌표다. 이음매를 넘는
// 순간 둘이 월드 폭만큼 어긋난다 — 그때도 잘라 붙일 자리가 맞아야 한다.
DIAL.setStep(6);
ship.x = WORLD_W - 3; ship.y = 2000; DIAL.doBake();
let seamBad = 0;
for(let i=0;i<400;i++){
  ship.x = ((ship.x + 1.5) % WORLD_W + WORLD_W) % WORLD_W;      // 이음매를 걸어서 넘는다
  if(DIAL.need()) DIAL.doBake();
  if(!inRect(DIAL.viewRect(), DIAL.bakeRect(), 1e-6)) seamBad++;
}
chk('이음매를 넘어도 조각 안이다', seamBad === 0, seamBad ? seamBad + '프레임' : '400걸음');
ship.x = 2; DIAL.doBake();
let backBad = 0;
for(let i=0;i<400;i++){
  ship.x = ((ship.x - 1.5) % WORLD_W + WORLD_W) % WORLD_W;
  if(DIAL.need()) DIAL.doBake();
  if(!inRect(DIAL.viewRect(), DIAL.bakeRect(), 1e-6)) backBad++;
}
chk('거꾸로 넘어도 조각 안이다', backBad === 0, backBad ? backBad + '프레임' : '400걸음');

console.log('\n=== 4. 극 ===');
// 조각이 지도 위아래 바깥으로 삐져나가는 자리. 바다 띠가 세계 안쪽만 덮어야 한다.
for(const y of [0, 30, WORLD_H-30, WORLD_H]){
  ship.x = 4000; ship.y = y; DIAL.setStep(6); DIAL.doBake();
  const b = DIAL.bakeRect();
  const out = (b.y < 0) || (b.y + b.h > WORLD_H);
  chk(`y=${y} 에서 굽기가 터지지 않는다`, isFinite(b.x+b.y+b.w+b.h) && b.w > 0,
      out ? '조각이 지도 밖까지 걸침(정상 — VOID 로 채움)' : '지도 안');
}

console.log('\n=== 5. 단 전환 — 세 입구가 같은 값을 본다 ===');
DIAL.setCap(DIAL.CAP_MAX);                  // 상한을 전부 열어 두고 시작한다
DIAL.setStep(2); ship.x = 2100; ship.y = 1500; DIAL.doBake();
const w2 = DIAL.viewRect().w;
DIAL.setStep(3);
chk('단을 바꾸면 반드시 다시 굽는다', DIAL.need() === true);
DIAL.doBake();
chk('단을 올리면 담는 범위가 넓어진다', DIAL.viewRect().w > w2,
    (DIAL.viewRect().w/w2).toFixed(1) + '배');
DIAL.setStep(1); DIAL.stepIn();
chk('+ 는 1단 아래로 못 간다 — 0(해도 없음)은 버튼 밖', DIAL.step === 1);
DIAL.setStep(6); DIAL.stepOut();
chk('− 는 상한 위로 못 간다', DIAL.step === 6);
DIAL.setStep(3); DIAL.stepIn();
chk('+ 가 좁게 본다 (단 감소)', DIAL.step === 2,
    DIAL.SPAN_KM[3] + 'km → ' + DIAL.SPAN_KM[2] + 'km');
DIAL.stepOut(); DIAL.stepOut();
chk('− 가 넓게 본다 (단 증가)', DIAL.step === 4);
DIAL.setStep(5); DIAL.setStep(9); DIAL.setStep(-1);
chk('표에 없는 단은 버린다', DIAL.step === 5, DIAL.step + '단');
chk('단이 저장된다 (aod_dial_step)', store['aod_dial_step'] === '5',
    '"' + store['aod_dial_step'] + '"');
chk('옛 미니맵 저장 키를 청소했다', !('aod_mini' in store) && !('aod_mini_step' in store));

console.log('\n=== 5-1. 해도 최대 — 상한이 단을 가둔다 ===');
// 합법 범위는 상한이 0 이면 {0} 하나뿐이고, 1 이상이면 1…상한이다.
// 값을 따로 적지 않고 이 범위에서 끌어내므로 아래 여섯 가지가 한 규칙에서 나온다.
DIAL.setCap(DIAL.CAP_MAX); DIAL.setStep(6);
DIAL.setCap(3);
chk('상한을 내리면 보고 있던 단이 딸려 내려온다', DIAL.step === 3,
    '6단에서 상한 3 → ' + DIAL.step + '단');
DIAL.stepOut();
chk('− 가 상한에서 멈춘다', DIAL.step === 3);
DIAL.setCap(6);
chk('상한을 올리면 보고 있던 단은 그대로다', DIAL.step === 3);
DIAL.stepOut();
chk('올린 뒤에는 더 넓게 갈 수 있다', DIAL.step === 4);
DIAL.setCap(0);
chk('상한 0 이면 해도가 꺼진다 — 방위만 남는다',
    DIAL.step === 0 && DIAL.spanPx() === 0 && DIAL.need() === false);
DIAL.stepIn(); DIAL.stepOut();
chk('상한 0 에서는 두 버튼 다 아무 일도 못 한다', DIAL.step === 0);
DIAL.setCap(3);
chk('0 에서 풀리면 1단으로 열린다', DIAL.step === 1, '가장 가까운 합법값');
DIAL.setCap(9); DIAL.setCap(-1);
chk('표에 없는 상한은 버린다', DIAL.cap === 3, DIAL.cap + '단');
DIAL.setCap(5);
chk('상한이 저장된다 (aod_dial_cap)', store['aod_dial_cap'] === '5',
    '"' + store['aod_dial_cap'] + '"');
DIAL.setCap(DIAL.CAP_MAX);                  // 뒤 절들이 쓰도록 되돌려 둔다

console.log('\n=== 6. 화면 테두리 — 해도에 남은 유일한 크기 단서 ===');
// 축척 막대·숫자·경위선을 다 없앴으므로(2026.07.26 결정) 이것만 남았다.
sandbox.__setWH(1920, 1080);
{
  sandbox.__setZoom(100);
  DIAL.setStep(1); DIAL.doBake();
  let k = (DIAL.RC*2) / DIAL.viewRect().w;
  let raw = (1920/100) * k;
  chk('배율 100·1단에서 테두리가 보인다', raw >= DIAL.VIEW_MIN,
      raw.toFixed(1) + 'px (최소 ' + DIAL.VIEW_MIN + 'px)');
  DIAL.setStep(6); DIAL.doBake();
  k = (DIAL.RC*2) / DIAL.viewRect().w;
  raw = (1920/100) * k;
  chk('배율 100·6단에서는 최소크기가 받쳐 준다', raw < DIAL.VIEW_MIN,
      raw.toFixed(2) + 'px → ' + DIAL.VIEW_MIN + 'px 로 올림');
  sandbox.__setZoom(0.5);
  raw = (1920/0.5) * k;
  chk('낮은 배율에서는 본 화면이 해도보다 넓다 → 테두리를 그리지 않는다',
      raw > DIAL.RC*2, raw.toFixed(0) + 'px > 해도 ' + DIAL.RC*2 + 'px');
  sandbox.__setZoom(100);
}

console.log('\n=== 7. 굽기가 실제로 그린다 — 바다와 육지 둘뿐 ===');
tally.fill = 0; tally.stroke = 0; tally.fillRect = 0; tally.text = 0; tally.paths.length = 0;
DIAL.setStep(2); ship.x = 2100; ship.y = 1500; DIAL.doBake();
chk('바다·해도밖을 칠했다', tally.fillRect >= 2, tally.fillRect + '회');
chk('육지를 채웠다', tally.fill >= 1, tally.fill + '회');
chk('해안선을 그었다', tally.stroke >= 1, tally.stroke + '회');
chk('경위선·축척 글자는 없다 — 육지 획 하나뿐', tally.stroke === tally.fill && tally.text === 0,
    `획 ${tally.stroke} = 채움 ${tally.fill}, 글자 ${tally.text}`);
// 굽기 컬링 (2026.07.26): 통짜 landPath 를 사본마다 긋던 것이 이동 중 순간 멈춤의
// 원인이라, 조각과 겹치는 고리만 landFor 로 모아 굽는다. 전수 목록과 대조한다.
chk('조각과 겹치는 고리만 구웠다 (전수 대조)  ★끊김 재발 방지', (() => {
  const br = DIAL.bakeRect();
  const want = sandbox.__RINGS.filter(r =>
    !(r.x1 < br.x || r.x0 > br.x + br.w || r.y1 < br.y || r.y0 > br.y + br.h)).map(r => r.p);
  const got = tally.paths.find(p => p && p.parts);
  return got && got.parts.length === want.length && want.every(w => got.parts.includes(w));
})());
chk('구멍 흉내(큰 고리 안 상자)가 바깥과 함께 뽑혔다', (() => {
  const got = tally.paths.find(p => p && p.parts);
  const inHole = got && got.parts.some(p => p.__ring === 3);
  const outer  = got && got.parts.some(p => p.__ring === 1);
  return !inHole || outer;      // 구멍이 뽑혔다면 바깥도 반드시 있어야 한다
})());
chk('통짜 landPath 는 더 이상 긋지 않는다', !tally.paths.some(p => p && p.__isPath));
chk('LAND_RINGS 가 없으면 통짜로 후퇴한다', (() => {
  sandbox.__killRings();
  tally.paths.length = 0; DIAL.doBake();
  const usedWhole = tally.paths.some(p => p && p.__isPath);
  sandbox.__reviveRings();
  DIAL.doBake();
  return usedWhole;
})());

console.log('\n=== 8. 한 프레임 그리기 ===');
sandbox.__setZoom(100); ship.x = 2100; ship.y = 1500;
DIAL.setStep(2); DIAL.doBake();
tally.drawImage = 0; tally.text = 0; tally.fill = 0; tally.texts.length = 0;
DIAL.draw();
chk('구운 조각을 잘라 붙였다', tally.drawImage === 1, tally.drawImage + '회');
chk('글자를 얹었다 — 방위 넷 + 표시값 넷', tally.text >= 16, tally.text + '회');
chk('캔버스 크기가 CSS 와 짝이다',
    dCanvas.width === DIAL.SIZE && dCanvas.height === DIAL.SIZE,
    dCanvas.width + 'x' + dCanvas.height);
const T = tally.texts;
chk('원 안에 위도·경도가 적힌다',
    T.some(s => /°[NS]$/.test(s)) && T.some(s => /°[EW]$/.test(s)),
    '"' + T.filter(s => /°[NSEW]$/.test(s)).join('  ') + '"');
chk('원 안에 바람·해류 값과 단위가 적힌다',
    T.includes('m/s') && T.includes('kn') && T.filter(s => /^\d+\.\d+$/.test(s)).length >= 2,
    T.filter(s => /^\d+\.\d+$/.test(s)).join(' | '));
chk('대지속력이 단위를 달고 적힌다', T.some(s => / kn$/.test(s)),
    '"' + (T.find(s => / kn$/.test(s)) || '') + '"');
chk('방위 넷을 적는다', ['N','S','E','W'].every(s => T.includes(s)));
DIAL.setCap(0);
tally.drawImage = 0; tally.fill = 0;
DIAL.draw();
chk('0단은 조각을 붙이지 않는다', tally.drawImage === 0);
chk('0단은 8방위 별을 되살린다', tally.fill >= 9,
    tally.fill + '회 채움 (별 8 + 띠 바탕)');
DIAL.setCap(DIAL.CAP_MAX);

console.log('\n=== 9. 커서 감지 — 계기는 통과, 좌표로 원 안을 잰다 ===');
sandbox.__setWH(1920, 1080);
const CX = 1920 - 16 - DIAL.SIZE/2, CY = 1080 - 16 - DIAL.SIZE/2;
chk('중심이 원 안이다', DIAL.inCircle(CX, CY) === true);
chk('반지름 바로 안이 원 안이다', DIAL.inCircle(CX + DIAL.SIZE/2 - 1, CY) === true);
chk('반지름 바로 밖이 원 밖이다', DIAL.inCircle(CX + DIAL.SIZE/2 + 1, CY) === false);
chk('원에 외접하는 사각 모서리는 원 밖이다',
    DIAL.inCircle(CX - DIAL.SIZE/2 + 2, CY - DIAL.SIZE/2 + 2) === false);
chk('화면 반대편은 원 밖이다', DIAL.inCircle(10, 10) === false);

console.log('\n=== 10. 원본 규약 (world_chart.html 을 글로 검사) ===');
chk('계기가 우하에 있다', /#dial\{[^}]*right:16px[^}]*bottom:16px/.test(src));
chk('손이 닿지 않는다 — 마우스를 통과시킨다', /#dial\{[\s\S]{0,200}?pointer-events:none/.test(src));
chk('버튼만 마우스를 받는다', /#dial button\{[\s\S]{0,200}?pointer-events:auto/.test(src));
chk('버튼은 평시 투명, 커서가 오면 나타난다',
    /#dial button\{[^}]*opacity:0/.test(src) && /#dial\.near button\{opacity:1/.test(src));
chk('CSS 원 크기가 상수와 같다',
    new RegExp('#dial\\{[^}]*width:' + DIAL.SIZE + 'px[^}]*height:' + DIAL.SIZE + 'px').test(src) &&
    new RegExp('#dial canvas\\{[^}]*width:' + DIAL.SIZE + 'px').test(src), DIAL.SIZE + 'px');
chk('계기 위 휠은 아무 일도 하지 않는다',
    /cv\.addEventListener\('wheel'[\s\S]{0,400}?DIAL\.inCircle\(e\.clientX, e\.clientY\)\) return;/.test(src));
// 안내줄 갱신 키 목록을 뽑아 본다 — 목록을 못박지 않아야 항목이 늘어도 안 깨진다
const hintKeys = (src.match(/'([a-z ]+)'\.includes\(k\)\) updateHint/) || ['',''])[1];
chk('M 키가 비었다 — 새 기능 예약석',
    !/if\(k==='m'\)/.test(src) && hintKeys.length > 0 && !hintKeys.includes('m'),
    `안내줄 갱신 키: ${hintKeys.trim()}`);
chk('안내줄에서 미니맵이 빠졌다', !/\['m','미니맵'/.test(src) && !/mini:true/.test(src));
chk('옛 미니맵·나침반이 걷혔다',
    !/const MINI =/.test(src) && !/function compass\(\)/.test(src) &&
    !/COMPASS_SIZE/.test(src) && !/id="mCanvas"/.test(src) && !/id="cCanvas"/.test(src) &&
    !/barKm/.test(src) && !/GRAT_DEG/.test(src) && !/BAR_NICE/.test(src));
chk('그리기 고리가 DIAL.draw 를 부른다', /\n\s*DIAL\.draw\(\);/.test(src));
chk('덮개(밤·비) 뒤에 그린다 — 별도 캔버스',
    src.indexOf('DIAL.draw();') > src.indexOf('nightVeil();'));
chk('본 화면(#c)에 그리지 않는다', !/ctx\.[a-zA-Z]+[\s\S]{0,80}dCanvas/.test(src));

console.log('\n=== 11. 이름 충돌 — 남의 검증을 깨지 않는가 ===');
// 검증 스크립트 몇은 원본을 글로 훑어 상수 무리를 통째로 긁어 자기 샌드박스에 넣는다.
// 계기 절이 그 무리와 같은 꼴로 상수를 지으면, 계기와 상관없는 검증이 죽는다.
// (미니맵 시절 SEA_C 로 지었다가 verify_precip·verify_seatemp 를 깨뜨린 적이 있다.)
const HARVEST = [/const\s+SEA_\w+/, /const\s+PRECIP_\w+/, /const\s+(RAIN|SNOW)_\w+/,
                 /const\s+LTN_\w+/, /const\s+STORM_\w+/];
for(const re of HARVEST){
  const hit = partDial.match(new RegExp(re.source, 'g'));
  chk('계기가 ' + re.source.replace('const\\s+','') + ' 무리를 쓰지 않는다',
      !hit, hit ? hit.join(', ') : '없음');
}
// 감시 목록 자체가 낡지 않도록, 원본을 긁어 가는 검증이 늘면 알아채게 한다
const harvesters = fs.readdirSync(DIR).filter(f => /^verify_.*\.js$/.test(f) && f !== 'verify_minimap.js')
  .map(f => [f, fs.readFileSync(path.join(DIR,f),'utf8')])
  .filter(([f,t]) => /src\.match\(\/const[^)]*\/g\)/.test(t))
  .map(([f]) => f);
console.log('  원본에서 상수를 긁어 가는 검증: ' + harvesters.join(', '));
chk('긁어 가는 검증이 알려진 것뿐이다',
    harvesters.every(f => ['verify_precip.js','verify_precipviz.js',
                           'verify_seatemp.js','verify_storm.js'].includes(f)),
    harvesters.length + '개');

console.log('\n=== 결과 ===');
console.log(`  통과 ${pass} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
