// verify_minimap.js — 미니맵(좌상 국지 해도) 검증
// 실행: node verify_minimap.js
//
// world_chart.html 의 MINI 절을 잘라 내어 그대로 돌린다. 재구현하지 않는다.
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
const partMini = slice('// ===== 미니맵 — 좌상 카드',
                       '// ===== 바람 화살표', '미니맵');

// ---- 껍데기 캔버스 — 무엇을 몇 번 그렸는지만 센다 ----
const tally = { fill:0, stroke:0, fillRect:0, drawImage:0, text:0, paths:[], xf:[] };
function fakeCtx(){
  return {
    set fillStyle(v){}, set strokeStyle(v){}, set lineWidth(v){}, set lineJoin(v){},
    set lineCap(v){}, set font(v){}, set textAlign(v){}, set textBaseline(v){},
    setTransform(a,b,c,d,e,f){ tally.xf.push([a,b,c,d,e,f]); },
    save(){}, restore(){}, translate(){}, rotate(){}, scale(){},
    beginPath(){}, moveTo(){}, lineTo(){}, closePath(){}, arc(){},
    clearRect(){}, fillRect(){ tally.fillRect++; },
    strokeRect(){ tally.stroke++; },
    fill(p){ tally.fill++; if(p) tally.paths.push(p); },
    stroke(p){ tally.stroke++; if(p) tally.paths.push(p); },
    fillText(){ tally.text++; }, strokeText(){ tally.text++; },
    drawImage(){ tally.drawImage++; }
  };
}
function fakeCanvas(){ const c = { width:0, height:0 }; const g = fakeCtx();
                       c.getContext = () => g; return c; }
const mCanvas = fakeCanvas();
const miniCard = { cls:{}, classList:{ toggle(n,v){ miniCard.cls[n] = !!v; } } };
const mScale = { textContent:'' };
const store = {};

// ---- 그리기에 필요한 바깥값 (원본과 같은 값으로 세운다) ----
const WORLD_W = 8192, WORLD_H = 4096;
const KM_PER_PX = 40075/WORLD_W;
const stubs = `
const WORLD_W=${WORLD_W}, WORLD_H=${WORLD_H};
const KM_PER_PX=${KM_PER_PX};
const DEG2PXX=WORLD_W/360, DEG2PXY=WORLD_H/180;
const DEPTH_COL=['a','b','c','d','e'], LAND_C='#d8bf8e', COAST='#6b4a2a', VOID='#20302d';
const landPath={ __isPath:true };
const ship={ x:2100, y:1500, head:0, grounded:false };
let zoom=0.42, W=1920, H=1080;
const show={ mini:true };
function updateHint(){ globalThis.__hintCalls=(globalThis.__hintCalls||0)+1; }
`;

const sandbox = {
  console: { log(){}, warn(){}, error(m){ throw new Error(m); } },
  Math, parseInt, String, Infinity, NaN,
  document: {
    getElementById(id){ return id === 'mCanvas' ? mCanvas
                             : id === 'mini'    ? miniCard
                             : id === 'mScale'  ? mScale : null; },
    createElement(){ return fakeCanvas(); }
  },
  window: { devicePixelRatio: 1 },
  localStorage: { getItem(k){ return k in store ? store[k] : null; },
                  setItem(k,v){ store[k] = String(v); } }
};
vm.createContext(sandbox);
vm.runInContext(stubs + '\n' + partMini + `
globalThis.__X = { MINI, ship, show, WORLD_W, WORLD_H, KM_PER_PX };
globalThis.__setZoom = v => { zoom = v; };
globalThis.__setWH = (w,h) => { W = w; H = h; };`, sandbox);

const { MINI, ship, show } = sandbox.__X;
const inRect = (a, b, eps) => a.x >= b.x-eps && a.y >= b.y-eps &&
                              a.x+a.w <= b.x+b.w+eps && a.y+a.h <= b.y+b.h+eps;

console.log('\n=== 0. 상수 ===');
console.log(`  축척 ${MINI.SPAN_KM.join(' / ')} km | 지도 ${MINI.MW}x${MINI.MH}` +
            ` | 굽는 여유 ${MINI.OVER}배 | 다시 굽는 문턱 ${MINI.REBAKE}`);
chk('축척이 여러 단이다', MINI.SPAN_KM.length >= 2, MINI.SPAN_KM.length + '단');
chk('축척이 오름차순이다',
    MINI.SPAN_KM.every((v,i) => i === 0 || v > MINI.SPAN_KM[i-1]));
chk('굽는 조각이 보이는 것보다 넓다', MINI.OVER > 1, MINI.OVER + '배');
chk('문턱이 여유 안쪽이다', MINI.REBAKE > 0 && MINI.REBAKE < 1, MINI.REBAKE);
chk('세계 전체보다 좁다 — 국지 미니맵이다',
    MINI.SPAN_KM[MINI.SPAN_KM.length-1] < 40075,
    MINI.SPAN_KM[MINI.SPAN_KM.length-1] + 'km < 40,075km(적도 한 바퀴)');

console.log('\n=== 1. 지도가 담는 범위 ===');
for(let s=0;s<MINI.SPAN_KM.length;s++){
  MINI.setStep(s); MINI.doBake();
  const v = MINI.viewRect();
  const km = v.w * KM_PER_PX;
  chk(`${s}단 가로가 ${MINI.SPAN_KM[s]}km`, Math.abs(km - MINI.SPAN_KM[s]) < 1e-6,
      km.toFixed(1) + 'km');
  chk(`${s}단 비율이 지도와 같다`,
      Math.abs(v.h/v.w - MINI.MH/MINI.MW) < 1e-9,
      (v.w/v.h).toFixed(3) + ' : 1');
}

console.log('\n=== 2. 불변식 — 보이는 조각은 늘 구운 조각 안에 있다 ===');
// 이것이 깨지면 화면에 굽지 않은 자리가 나온다. 배를 오래 걷게 하며 매 걸음 확인.
let bad = 0, bakes = 0, steps = 0;
let rng = 12345;
const rand = () => (rng = (rng*1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for(let s=0;s<MINI.SPAN_KM.length;s++){
  MINI.setStep(s);
  ship.x = 2100; ship.y = 1500; MINI.doBake(); bakes++;
  for(let i=0;i<20000;i++){
    // 한 걸음은 기본 시계(0.30px)에서 빠른 시계(3.6px) 사이
    const a = rand()*Math.PI*2, len = 0.3 + rand()*3.3;
    ship.x = ((ship.x + Math.cos(a)*len) % WORLD_W + WORLD_W) % WORLD_W;  // 원본과 같이 wrapX
    ship.y = Math.max(0, Math.min(WORLD_H, ship.y + Math.sin(a)*len));
    if(MINI.need()){ MINI.doBake(); bakes++; }
    steps++;
    if(!inRect(MINI.viewRect(), MINI.bakeRect(), 1e-6)) bad++;
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
MINI.setStep(2);
ship.x = WORLD_W - 3; ship.y = 2000; MINI.doBake();
let seamBad = 0, seamOff = 0;
for(let i=0;i<400;i++){
  ship.x = ((ship.x + 1.5) % WORLD_W + WORLD_W) % WORLD_W;      // 이음매를 걸어서 넘는다
  if(MINI.need()) MINI.doBake();
  const v = MINI.viewRect(), b = MINI.bakeRect();
  if(!inRect(v, b, 1e-6)) seamBad++;
  // 지도 한가운데가 배여야 한다 (조각 좌표로 옮겨 놓아도)
  if(Math.abs((v.x + v.w/2) - (v.x + v.w/2)) > 1e-9) seamOff++;
}
chk('이음매를 넘어도 조각 안이다', seamBad === 0, seamBad ? seamBad + '프레임' : '400걸음');
// 되돌아 넘어도 같아야 한다
ship.x = 2; MINI.doBake();
let backBad = 0;
for(let i=0;i<400;i++){
  ship.x = ((ship.x - 1.5) % WORLD_W + WORLD_W) % WORLD_W;
  if(MINI.need()) MINI.doBake();
  if(!inRect(MINI.viewRect(), MINI.bakeRect(), 1e-6)) backBad++;
}
chk('거꾸로 넘어도 조각 안이다', backBad === 0, backBad ? backBad + '프레임' : '400걸음');

console.log('\n=== 4. 극 ===');
// 조각이 지도 위아래 바깥으로 삐져나가는 자리. 바다 띠가 세계 안쪽만 덮어야 한다.
for(const y of [0, 30, WORLD_H-30, WORLD_H]){
  ship.x = 4000; ship.y = y; MINI.setStep(2); MINI.doBake();
  const b = MINI.bakeRect();
  const out = (b.y < 0) || (b.y + b.h > WORLD_H);
  chk(`y=${y} 에서 굽기가 터지지 않는다`, isFinite(b.x+b.y+b.w+b.h) && b.w > 0,
      out ? '조각이 지도 밖까지 걸침(정상 — VOID 로 채움)' : '지도 안');
}

console.log('\n=== 5. 축척 단 ===');
MINI.setStep(0); ship.x = 2100; ship.y = 1500; MINI.doBake();
const w0 = MINI.viewRect().w;
MINI.setStep(1);
chk('단을 바꾸면 반드시 다시 굽는다', MINI.need() === true);
MINI.doBake();
chk('단을 바꾸면 담는 범위가 넓어진다', MINI.viewRect().w > w0,
    (MINI.viewRect().w/w0).toFixed(1) + '배');

console.log('\n=== 6. 축척 막대 ===');
for(let s=0;s<MINI.SPAN_KM.length;s++){
  MINI.setStep(s);
  const km = MINI.barKm(), frac = km/MINI.SPAN_KM[s];
  chk(`${s}단 막대 ${km}km 가 지도 폭 안이다`, frac > 0.1 && frac < 0.5,
      '지도 폭의 ' + (frac*100).toFixed(0) + '%');
}

console.log('\n=== 7. 화면 테두리 ===');
// 배율 100 에서 본 화면은 94km 다. 미니맵 위에서 몇 px 인가 — 점이 되면 안 된다.
sandbox.__setWH(1920, 1080);
for(const z of [0.42, 13, 100]){
  sandbox.__setZoom(z);
  for(let s=0;s<MINI.SPAN_KM.length;s++){
    MINI.setStep(s); MINI.doBake();
    const v = MINI.viewRect(), k = MINI.MW / v.w;      // 월드px → 지도px (배율 1 기준)
    const raw = (1920/z) * k;
    const shown = Math.max(MINI.VIEW_MIN, raw);
    if(z === 100 && s === 0)
      chk('배율 100·최소축척에서 테두리가 보인다', raw >= MINI.VIEW_MIN,
          raw.toFixed(1) + 'px (최소 ' + MINI.VIEW_MIN + 'px)');
    if(z === 100 && s === 2)
      chk('배율 100·최대축척에서도 최소크기가 받쳐 준다', shown >= MINI.VIEW_MIN,
          raw.toFixed(2) + 'px → ' + shown.toFixed(1) + 'px 로 올림');
    if(z === 0.42 && s === 2)
      chk('기본 배율에서는 본 화면이 미니맵보다 넓다 → 테두리를 그리지 않는다',
          raw > MINI.MW, raw.toFixed(0) + 'px > 지도 266px');
  }
}

console.log('\n=== 8. 굽기가 실제로 그린다 ===');
tally.fill = 0; tally.stroke = 0; tally.fillRect = 0; tally.paths.length = 0;
MINI.setStep(1); ship.x = 2100; ship.y = 1500; MINI.doBake();
chk('바다·해도밖을 칠했다', tally.fillRect >= 2, tally.fillRect + '회');
chk('육지를 채웠다', tally.fill >= 1, tally.fill + '회');
chk('해안선·경위선을 그었다', tally.stroke >= 2, tally.stroke + '회');
chk('본편과 같은 landPath 를 썼다', tally.paths.some(p => p && p.__isPath));

console.log('\n=== 9. 여닫기 · 축척 넘기기 ===');
chk('처음에는 켜져 있다', MINI.on === true);
MINI.toggle();
chk('M 으로 닫힌다', MINI.on === false && miniCard.cls.off === true);
chk('닫히면 안내줄 상태도 따라간다', show.mini === false);
chk('닫힌 채로는 그리지 않는다', (() => { const n = tally.drawImage;
                                          MINI.draw(); return tally.drawImage === n; })());
MINI.toggle();
chk('M 으로 다시 열린다', MINI.on === true && miniCard.cls.off === false);
const s0 = MINI.step;
MINI.cycle();
chk('Shift+M 이 축척을 넘긴다', MINI.step === (s0+1) % MINI.SPAN_KM.length,
    MINI.SPAN_KM[s0] + 'km → ' + MINI.SPAN_KM[MINI.step] + 'km');
for(let i=0;i<MINI.SPAN_KM.length;i++) MINI.cycle();
chk('한 바퀴 돌면 제자리다', MINI.step === (s0+1) % MINI.SPAN_KM.length);
MINI.toggle();                                   // 닫아 두고
MINI.cycle();
chk('닫힌 채 축척을 넘기면 열어 준다', MINI.on === true);

console.log('\n=== 10. 한 프레임 그리기 ===');
tally.drawImage = 0; tally.text = 0;
sandbox.__setZoom(100); ship.x = 2100; ship.y = 1500; MINI.setStep(0);
MINI.draw();
chk('구운 조각을 잘라 붙였다', tally.drawImage === 1, tally.drawImage + '회');
chk('북 표식·축척 글자를 얹었다', tally.text >= 4, tally.text + '회');
chk('지도 캔버스 크기가 CSS 와 짝이다',
    mCanvas.width === MINI.MW && mCanvas.height === MINI.MH,
    mCanvas.width + 'x' + mCanvas.height);
chk('맨 위 띠에 축척이 적힌다', mScale.textContent === MINI.SPAN_KM[MINI.step] + ' km',
    '"' + mScale.textContent + '"');

console.log('\n=== 11. 원본 규약 (world_chart.html 을 글로 검사) ===');
chk('카드가 좌상에 있다', /#mini\{[^}]*left:16px[^}]*top:14px/.test(src));
chk('조정 패널(우상)과 겹치지 않는다', /#tune\{[^}]*right:16px/.test(src));
chk('손이 닿지 않는다 — 클릭 기능 없음', /#mini\{[\s\S]{0,400}?pointer-events:none/.test(src));
chk('CSS 지도 크기가 상수와 같다',
    new RegExp('#mini canvas\\{[^}]*width:' + MINI.MW + 'px[^}]*height:' + MINI.MH + 'px').test(src),
    MINI.MW + 'x' + MINI.MH);
chk('M 키가 미니맵에 물려 있다', /if\(k==='m'\)\{ if\(e\.shiftKey\) MINI\.cycle\(\); else MINI\.toggle\(\); \}/.test(src));
chk('M 이 다른 키와 겹치지 않는다', (src.match(/if\(k==='m'\)/g) || []).length === 1);
chk('안내줄에 미니맵이 있다', /\['m','미니맵','mini'\]/.test(src));
chk('안내줄 색이 M 에도 갱신된다', /'ghckbm'\.includes\(k\)/.test(src));
chk('show 에 mini 가 있다', /const show = \{[^}]*mini:true/.test(src));
chk('그리기 고리가 MINI.draw 를 부른다', /\n\s*MINI\.draw\(\);/.test(src));
chk('덮개(밤·비) 뒤에 그린다 — 별도 캔버스',
    src.indexOf('MINI.draw();') > src.indexOf('nightVeil();'));
chk('본 화면(#c)에 그리지 않는다', !/ctx\.[a-zA-Z]+[\s\S]{0,80}mCanvas/.test(src));

console.log('\n=== 12. 이름 충돌 — 남의 검증을 깨지 않는가 ===');
// 검증 스크립트 몇은 원본을 글로 훑어 상수 무리를 통째로 긁어 자기 샌드박스에 넣는다.
// 미니맵 절이 그 무리와 같은 꼴로 상수를 지으면, 미니맵과 상관없는 검증이 죽는다.
// (SEA_C 로 지었다가 verify_precip·verify_seatemp 를 깨뜨린 적이 있다.)
const HARVEST = [/const\s+SEA_\w+/, /const\s+PRECIP_\w+/, /const\s+(RAIN|SNOW)_\w+/,
                 /const\s+LTN_\w+/, /const\s+STORM_\w+/];
for(const re of HARVEST){
  const hit = partMini.match(new RegExp(re.source, 'g'));
  chk('미니맵이 ' + re.source.replace('const\\s+','') + ' 무리를 쓰지 않는다',
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
