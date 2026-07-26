// verify_cull.js — 육지 컬링(화면에 걸치는 고리만 그리기) 검증
// 실행: node verify_cull.js
//
// world_chart.html 의 디코드·컬링 절을 그대로 오려 돌린다. 재구현하지 않는다.
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
const partConst = slice('// ===== 좌표계 / 월드 상수 =====', '// ===== 수심 밴드', '월드 상수');
const partLand  = slice('// ===== 육지 폴리곤', '// ===== 충돌 마스크', '디코더+컬링');

// ---- 껍데기 Path2D — 점 수를 안다. addPath 로 모이는 양을 세기 위해서다 ----
class FakePath2D {
  constructor(){ this.n = 0; this.parts = []; }
  moveTo(){ this.n++; }
  lineTo(){ this.n++; }
  closePath(){}
  addPath(p){ this.n += p.n; this.parts.push(p); }
}
const sandbox = {
  console: { log(){}, warn(){}, error(m){ throw new Error(m); } },
  Math, Uint8Array, Uint32Array, Float32Array, DataView, Infinity, NaN,
  Path2D: FakePath2D,
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  window: {}
};
new Function('window', 'atob', fs.readFileSync(path.join(DIR, 'land_data.js'), 'utf8'))
  (sandbox.window, sandbox.atob);
vm.createContext(sandbox);
// landCull 은 W·zoom·ship 을 부를 때 읽는다 — 시험이 갈아 끼울 수 있게 var 로 둔다
vm.runInContext(partConst + '\n' + partLand.replace(/\b(const|let)\b/g, 'var') + `
var W = 1920, H = 1080, zoom = 100;
var ship = { x: 0, y: 0 };
globalThis.__X = { LAND_RINGS, landPath, LAND_CULL_MAX,
                   cull: (x, y, z, k) => { ship.x = x; ship.y = y; zoom = z; return landCull(k||0); } };`,
  sandbox);
const { LAND_RINGS, landPath, LAND_CULL_MAX, cull } = sandbox.__X;
const L = sandbox.window.LANDBIN;
const TOT = L.points;

console.log('\n=== 1. 고리 목록과 경계상자 ===');
chk('고리 수만큼 항목이 있다', LAND_RINGS.length === L.rings, LAND_RINGS.length + ' / ' + L.rings);
chk('점 수 합이 전체와 같다', LAND_RINGS.reduce((s, r) => s + r.n, 0) === TOT);
chk('통짜 landPath 도 전체 점을 담고 있다 (후퇴용)', landPath.n === TOT, landPath.n + '');
let bad = 0;
for(const r of LAND_RINGS) if(!(r.x0 <= r.x1 && r.y0 <= r.y1 && isFinite(r.x0 + r.y1))) bad++;
chk('경계상자가 전부 정상이다 (x0<=x1, y0<=y1, 유한)', bad === 0, bad ? bad + '개 이상' : '');

console.log('\n=== 2. 컬링이 실제로 걸러 내는가 ===');
// project() 와 같은 규칙: x=(lon+180)/360*8192, y=(90-lat)/180*4096
const P = (lon, lat) => [(lon + 180) / 360 * 8192, (90 - lat) / 180 * 4096];
// 표본 자리 주의: 상자 컬링은 보수적이다. 아메리카 본토 상자는 동으로 상호키곶(-34.8도),
// 아프리카·유라시아 상자는 서로 다카르(-17.5도)까지 뻗는다. 그 사이 틈(-34.8~-17.5)만이
// 대륙 상자에 안 잡히는 진짜 먼바다다. -38 같은 자리는 아메리카 상자 안이라 66,467점이 나온다.
const atl = P(-25, 25);              // 대륙 상자들 사이의 틈 — 배율 100
const midAtl = cull(atl[0], atl[1], 100);
chk('대서양 한복판·배율 100 — 그리는 점이 거의 없다', midAtl.n < TOT / 100,
    midAtl.n.toLocaleString() + ' / ' + TOT.toLocaleString());
const lisbon = P(-9.5, 38.6);        // 리스본 앞바다 — 본토 고리가 걸린다
const nearEu = cull(lisbon[0], lisbon[1], 100);
chk('본토 해안 옆·배율 100 — 통짜로 물러서지 않는다  ★핵심', nearEu !== landPath,
    '보이는 점 ' + nearEu.n.toLocaleString() + ' (통짜였다면 ' + TOT.toLocaleString() + ')');
chk('본토 옆이라도 통짜보다 훨씬 적다', nearEu.n < TOT * 0.5,
    (100 * nearEu.n / TOT).toFixed(1) + '%');
const world = cull(4096, 2048, 0.075);   // 최소 배율 — 세계가 다 보인다
chk('세계 전체가 보이면 통짜로 물러난다 (복사 회피)', world === landPath);

console.log('\n=== 3. 놓치는 고리가 없는가 (브루트포스 대조) ===');
// 색인·최적화는 반드시 느린 참값과 대조한다 (부록 C). 화면 상자와 겹치는 고리의
// 전수 목록을 따로 만들어, landCull 이 모은 것과 점 수로 맞춘다.
function brute(x, y, z, k){
  const hw = (1920 / 2) / z, hh = (1080 / 2) / z;
  const vx0 = x - hw - (k||0) * 8192, vx1 = x + hw - (k||0) * 8192;
  const vy0 = y - hh, vy1 = y + hh;
  let n = 0;
  for(const r of LAND_RINGS)
    if(!(r.x1 < vx0 || r.x0 > vx1 || r.y1 < vy0 || r.y0 > vy1)) n += r.n;
  return n;
}
const SPOTS = [ ['대서양', ...P(-38, 25)], ['리스본', ...P(-9.5, 38.6)],
                ['카스피해', ...P(50.5, 42)], ['말라카', ...P(100, 4)],
                ['혼곶', ...P(-67, -56)], ['북극해', ...P(30, 82)] ];
let miss = 0;
for(const [name, x, y] of SPOTS){
  for(const z of [100, 20, 3]){
    const got = cull(x, y, z), want = brute(x, y, z);
    const gn = (got === landPath) ? TOT : got.n;
    if(got !== landPath && gn !== want){ miss++; console.log('    어긋남:', name, 'z' + z, gn, '!=', want); }
  }
}
chk('여섯 곳 x 세 배율 전부 전수 목록과 일치', miss === 0);

console.log('\n=== 4. 구멍(짝홀) — 카스피해가 바다로 남는가 ===');
// 카스피해 구멍 고리의 상자는 본토 고리의 상자 안에 있어야 한다. 그래야
// '구멍이 보이면 바깥도 함께 뽑힌다'는 컬링의 전제가 성립한다.
const csp = P(50.5, 42);
const inCaspian = cull(csp[0], csp[1], 100);
const main = LAND_RINGS.reduce((a, b) => (a.n > b.n ? a : b));   // 최대 고리 = 유라시아·아프리카 본토
chk('카스피해 화면에 본토 고리가 뽑혀 있다 (구멍의 바깥)',
    inCaspian === landPath || inCaspian.parts.includes(main.p),
    '보이는 점 ' + ((inCaspian === landPath) ? TOT : inCaspian.n).toLocaleString());
const holes = LAND_RINGS.filter(r => r !== main &&
  r.x0 >= main.x0 && r.x1 <= main.x1 && r.y0 >= main.y0 && r.y1 <= main.y1);
chk('본토 상자 안에 다른 고리가 있다 (구멍 또는 내부 섬)', holes.length > 0, holes.length + '개');

console.log('\n=== 5. 문턱과 회귀 ===');
chk('후퇴 문턱이 이름 있는 상수다', typeof LAND_CULL_MAX === 'number', 'LAND_CULL_MAX = ' + LAND_CULL_MAX.toLocaleString());
chk('본토 고리 하나로는 물러나지 않는 값이다  ★핵심', LAND_CULL_MAX > main.n,
    main.n.toLocaleString() + ' < ' + LAND_CULL_MAX.toLocaleString());
chk('전체가 보이면 물러나는 값이다', LAND_CULL_MAX < TOT,
    LAND_CULL_MAX.toLocaleString() + ' < ' + TOT.toLocaleString());
chk('drawWorld 가 landCull 을 쓴다', /landCull\(k\)/.test(src));
chk('순환 오프셋 k 를 화면 상자에 반영한다', /k\*WORLD_W/.test(slice('function landCull', '\n}', 'landCull')));
chk('디코드 실패 시 통짜로 물러난다', /if\(!LAND_RINGS\)\s*return landPath/.test(src));
chk('COASTSEG(충돌)는 이번 변경과 무관하게 그대로다',
    /COASTSEG\[s\+\+\]/.test(partLand) && /moveWithCoast/.test(src));

console.log('\n' + (fail ? '실패 있음' : '모두 통과') + ' — 통과 ' + pass + ' / 실패 ' + fail);
process.exit(fail ? 1 : 0);
