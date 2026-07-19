// verify_cloudviz.js — 구름 막이 데이터를 제대로 화면에 옮기는가
// 실행: node verify_cloudviz.js
//
// 정규식으로 "코드가 이렇게 쓰였나"만 보면 부족하다. 격자 좌표를 한 칸 어긋나게
// 쓰거나 남북을 뒤집어도 정규식은 통과한다. 그래서 이 파일은 world_chart.html 을
// 실제로 실행해 cloudVeil() 을 돌리고, 나온 알파 배열을 cloud_data.js 에서
// 독립적으로 계산한 값과 맞춰 본다. 사하라 위에 배를 두었을 때 화면이 실제로
// 맑아지는지를 숫자로 확인하는 것이다.
"use strict";
const fs = require('fs'), path = require('path'), vm = require('vm');
const D = __dirname;
const html = fs.readFileSync(path.join(D, 'world_chart.html'), 'utf8');
let pass = 0, fail = 0;
function chk(n, c, note){
  if(c){ pass++; console.log('  OK   ' + n + (note ? '  ' + note : '')); }
  else  { fail++; console.log('  FAIL ' + n + (note ? '  ' + note : '')); }
}

// ── 1. 코드 구조 ────────────────────────────────────────────
console.log('\n=== 1. 코드 구조 ===');
chk('cloud_data.js 를 읽어들인다', /<script src="cloud_data\.js"><\/script>/.test(html));
chk('CLOUD 모듈이 있다', /const CLOUD = \(function\(\)\{/.test(html));
chk('cloudVeil 함수가 있다', /function cloudVeil\(\)\{/.test(html));
chk('P 에 cloudMode 가 있다', /cloudMode\s*:\s*\d/.test(html));
chk('P 에 cloudGain 가 있다', /cloudGain\s*:\s*[\d.]/.test(html));
chk('패널에 구름 항목 셋이 있다',
    /\['cloudMode',/.test(html) && /\['cloudGain',/.test(html)
    && /\['cloudDrift',/.test(html));

// ── 2. cloud_data.js 를 독립적으로 읽는다 ───────────────────
// world_chart.html 의 CLOUD 모듈을 쓰지 않는다. 같은 코드로 같은 답을 얻으면
// 서로 틀려도 알 수 없다. 여기서 처음부터 다시 푼다.
const cjs = fs.readFileSync(path.join(D, 'cloud_data.js'), 'utf8');
const CF = n => parseFloat(cjs.match(new RegExp(n + '\\s*:\\s*([0-9.eE+-]+)'))[1]);
const CNX = CF('nx')|0, CNY = CF('ny')|0, CNM = CF('months')|0, CQS = CF('quantStep');
const CN = CNX * CNY;
const cq = Buffer.from(cjs.match(/data:\s*"([^"]+)"/)[1], 'base64');

const WORLD_W = 8192, WORLD_H = 4096;          // world_chart.html 과 같은 값
function wrapX(x){ return ((x % WORLD_W) + WORLD_W) % WORLD_W; }
function ccell(m,j,i){ return cq[m*CN + j*CNX + i] * CQS; }
function cpct(wx, wy, mf){                     // 월드좌표 -> 운량 % (쌍선형 + 월 보간)
  const lon = wrapX(wx)/WORLD_W*360 - 180;
  const lat = 90 - wy/WORLD_H*180;
  let fx = (lon+180)/4 - 0.5, fy = (90-lat)/4 - 0.5;
  let i0 = Math.floor(fx), j0 = Math.floor(fy);
  const tx = fx-i0, ty = fy-j0;
  if(j0 < 0) j0 = 0; if(j0 > CNY-2) j0 = CNY-2;
  const i1 = ((i0+1)%CNX+CNX)%CNX; i0 = ((i0%CNX)+CNX)%CNX;
  const j1 = j0+1;
  const w00=(1-tx)*(1-ty), w10=tx*(1-ty), w01=(1-tx)*ty, w11=tx*ty;
  const m0 = Math.floor(mf)%CNM, m1 = (m0+1)%CNM, mt = mf - Math.floor(mf);
  const a = ccell(m0,j0,i0)*w00 + ccell(m0,j0,i1)*w10
          + ccell(m0,j1,i0)*w01 + ccell(m0,j1,i1)*w11;
  const b = ccell(m1,j0,i0)*w00 + ccell(m1,j0,i1)*w10
          + ccell(m1,j1,i0)*w01 + ccell(m1,j1,i1)*w11;
  return a + (b-a)*mt;
}

// ── 3. 페이지를 실제로 띄운다 (verify_boot.js 와 같은 대역) ──
function makeCtx(){
  const c = {};
  const noop = () => () => {};
  for(const m of ['save','restore','beginPath','closePath','moveTo','lineTo','arc',
                  'fill','stroke','fillRect','strokeRect','clearRect','rect',
                  'translate','scale','rotate','setTransform','fillText','strokeText',
                  'quadraticCurveTo','bezierCurveTo','clip','drawImage','ellipse',
                  'putImageData','measureText','setLineDash','arcTo'])
    c[m] = noop();
  c.createRadialGradient = () => ({ addColorStop(){} });
  c.createLinearGradient = () => ({ addColorStop(){} });
  c.measureText = () => ({ width: 10 });
  c.getImageData = () => ({ data: new Uint8ClampedArray(4) });
  c.createImageData = (w,h) => ({ width:w, height:h,
                                  data: new Uint8ClampedArray((w|0)*(h|0)*4) });
  // 그린 자리를 기록해 둔다 — 화면 전체를 덮는지 확인해야 한다
  c.drawImage = (img,dx,dy,dw,dh) => { c._last = {dx,dy,dw,dh}; };
  return c;
}
const els = {};
function mkEl(id){
  const e = { id, style:{}, width:0, height:0, innerHTML:'', textContent:'', value:'',
    classList:{ _s:new Set(), add(x){this._s.add(x);}, remove(x){this._s.delete(x);},
                toggle(x,f){ f===undefined ? (this._s.has(x)?this._s.delete(x):this._s.add(x))
                                           : (f?this._s.add(x):this._s.delete(x)); },
                contains(x){ return this._s.has(x); } },
    _ctx: null,
    getContext(){ return this._ctx || (this._ctx = makeCtx()); },
    addEventListener(){}, appendChild(){}, querySelector(){ return null; },
    querySelectorAll(){ return []; } };
  els[id] = e; return e;
}
for(const id of ['c','cCanvas','hud','hint','toggles','tune','info','cWind','cCur'])
  mkEl(id);

const SCRW = 1600, SCRH = 900;
const document_ = {
  getElementById(id){ return els[id] || mkEl(id); },
  createElement(t){ return mkEl('_' + t + '_' + Math.random()); },
  addEventListener(){}, querySelector(){ return null; },
  body:{ classList: mkEl('_body').classList },
};
const sandbox = {
  window:{ innerWidth:SCRW, innerHeight:SCRH, devicePixelRatio:1,
           addEventListener(){}, matchMedia:()=>({matches:false}) },
  document: document_,
  console: { log(){}, warn(){}, error(){} },
  localStorage: { _d:{}, getItem(){ return null; }, setItem(){}, removeItem(){} },
  performance: { now: () => 0 },
  requestAnimationFrame(){ return 0; },       // 루프는 돌리지 않는다 — 우리가 직접 부른다
  addEventListener(){},
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  Math, JSON, Date, Object, Array, String, Number, Boolean, Error,
  isNaN, parseFloat, parseInt,
  Uint8Array, Int8Array, Uint8ClampedArray, Float32Array, Int32Array,
  setTimeout(){}, clearTimeout(){},
  navigator:{ clipboard:{ writeText(){ return Promise.resolve(); } } },
  Promise,
  Path2D: class { moveTo(){} lineTo(){} arc(){} rect(){} closePath(){} addPath(){}
                  quadraticCurveTo(){} bezierCurveTo(){} ellipse(){} },
  ImageData: class { constructor(w,h){ this.width=w; this.height=h;
                     this.data = new Uint8ClampedArray((w|0)*(h|0)*4); } },
  Image: class { set src(v){} addEventListener(){} },
  OffscreenCanvas: class { constructor(w,h){ this.width=w; this.height=h; }
                           getContext(){ return makeCtx(); } },
};
sandbox.window.document = document_;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

console.log('\n=== 2. 페이지가 뜨는가 ===');
for(const f of ['land_data.js','bathy_data.js','currents_data.js',
                'wind_data.js','cloud_data.js'])
  vm.runInContext(fs.readFileSync(path.join(D,f),'utf8'), sandbox, {filename:f});
const body = html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)[1];
let bootErr = null;
try { vm.runInContext(body, sandbox, {filename:'world_chart.html'}); }
catch(e){ bootErr = e; }
chk('본문이 오류 없이 실행된다', !bootErr,
    bootErr ? (bootErr.name + ': ' + bootErr.message) : '');
if(bootErr){ console.log('\n실패 있음 — 이후 검사를 건너뛴다\n'); process.exit(1); }

// 화면 크기가 대역대로 잡혔는지. 이게 어긋나면 아래 좌표 계산이 전부 무의미하다.
const W = vm.runInContext('W', sandbox), H = vm.runInContext('H', sandbox);
chk('화면 크기가 잡혔다', W === SCRW && H === SCRH, `${W}x${H}`);
chk('CLOUD 모듈이 살아 있다', vm.runInContext('CLOUD !== null', sandbox));

// ── 4. 그리기 상수를 소스에서 직접 읽는다 ───────────────────
const SF = n => parseFloat(html.match(new RegExp('const ' + n + '\\s*=\\s*([0-9.]+)'))[1]);
const STEP = SF('CLOUD_STEP'), MAXA = SF('CLOUD_MAXA');
const GW = Math.ceil(W/STEP)+1, GH = Math.ceil(H/STEP)+1;

// 화면 좌표 -> 월드 좌표. cloudVeil 안의 식과 같아야 하지만, 여기서는
// drawWorld 가 쓰는 식(W/2 + (wx-ship.x)*zoom)에서 거꾸로 유도한 것이다.
function screenToWorld(sx, sy, shipX, shipY, zoom){
  return [ shipX + (sx - W/2)/zoom, shipY + (sy - H/2)/zoom ];
}

// ── 5. 실제로 cloudVeil() 을 돌려 알파를 받아 온다 ──────────
function run(lon, lat, day, zoom, gain, mode, size){
  vm.runInContext(`(function(){
    const p = project(${lon}, ${lat});
    ship.x = p[0]; ship.y = p[1];
    gameDay = ${day};
    zoom = ${zoom};
    P.cloudGain = ${gain};
    P.cloudMode = ${mode};
    P.cloudSize = ${size === undefined ? 90 : size};
    cloudVeil();
  })()`, sandbox);
  return {
    img: vm.runInContext('cloudImg', sandbox),
    mf : vm.runInContext('monthF()', sandbox),
    x  : vm.runInContext('ship.x', sandbox),
    y  : vm.runInContext('ship.y', sandbox),
  };
}

console.log('\n=== 3. 알파 배열이 데이터와 맞는가 ===');
// 리스본 앞바다, 7월 중순, 배율 4. 화면에 대서양이 넓게 들어온다.
const r = run(-12, 38, 195, 4, 1.0, 1);
chk('알파 그림이 만들어졌다', !!r.img, r.img ? `${r.img.width}x${r.img.height}` : '');
chk('격자 크기가 화면에 맞다', r.img.width === GW && r.img.height === GH,
    `${GW}x${GH} (간격 ${STEP}px)`);

let worst = 0, worstAt = '';
for(const [ix,jy] of [[0,0],[17,9],[33,19],[50,29],[GW-1,GH-1],[5,30],[60,4]]){
  const [wx,wy] = screenToWorld(ix*STEP, jy*STEP, r.x, r.y, 4);
  const want = cpct(wx, wy, r.mf) * 0.01 * MAXA * 255;
  const got  = r.img.data[(jy*GW + ix)*4 + 3];
  const d = Math.abs(got - want);
  if(d > worst){ worst = d; worstAt = `(${ix},${jy}) 기댓값 ${want.toFixed(1)} 실제 ${got}`; }
}
chk('모든 표본이 독립 계산과 일치한다', worst <= 1,
    worst <= 1 ? `최대 오차 ${worst.toFixed(2)}/255` : worstAt);

console.log('\n=== 4. 눈에 보이는 차이 ===');
// 격자 한 칸을 잘못 짚거나 남북을 뒤집어도 3장은 통과할 수 있다 (자기 실수를
// 그대로 따라 계산하므로). 여기서는 "사하라 위가 남극해 위보다 맑아야 한다"는,
// 코드와 무관한 사실을 묻는다.
function meanA(res){
  const d = res.img.data; let s = 0, n = 0;
  for(let p = 3; p < d.length; p += 4){ s += d[p]; n++; }
  return s/n;
}
const sahara = meanA(run(12, 24, 195, 60, 1.0, 1));     // 7월 사하라 상공
const soOcean = meanA(run(0, -58, 195, 60, 1.0, 1));    // 7월 남극해
chk('사하라가 남극해보다 훨씬 맑다', soOcean - sahara > 40,
    `사하라 평균 알파 ${sahara.toFixed(1)} vs 남극해 ${soOcean.toFixed(1)}`);

const janIndia = meanA(run(72, 16, 15, 60, 1.0, 1));    // 1월 인도 서해안
const julIndia = meanA(run(72, 16, 195, 60, 1.0, 1));   // 7월 (몬순)
chk('인도 서해안이 여름에 흐려진다', julIndia - janIndia > 40,
    `1월 ${janIndia.toFixed(1)} -> 7월 ${julIndia.toFixed(1)}`);

console.log('\n=== 5. 조절이 먹히는가 ===');
const half = meanA(run(-12, 38, 195, 4, 0.5, 1));
const full = meanA(run(-12, 38, 195, 4, 1.0, 1));
chk('진하기 0.5 가 1.0 의 절반이다', Math.abs(half*2 - full) < 1.5,
    `${half.toFixed(1)} x2 = ${(half*2).toFixed(1)} vs ${full.toFixed(1)}`);

// 끄면 정말 안 그리는가. 알파에 표시를 남겨 두고 불러 본다.
vm.runInContext(`(function(){
  const d = cloudImg.data;
  for(let p = 3; p < d.length; p += 4) d[p] = 77;
  P.cloudMode = 0; cloudVeil();
})()`, sandbox);
const untouched = vm.runInContext('cloudImg.data[3]', sandbox);
chk('구름 표현 0 이면 아무것도 하지 않는다', untouched === 77,
    `표시값 77 이 ${untouched} 로 남음`);

console.log('\n=== 6. 화면을 빈틈없이 덮는가 ===');
// 표본은 칸의 모서리에 있으므로 반 칸씩 밀어 그려야 한다. 밀지 않으면
// 왼쪽·위 가장자리에 반 칸 폭의 띠가 남는다. 눈으로는 놓치기 쉬운 자국이다.
run(-12, 38, 195, 1.0, 1.0, 1);
const rect = els['c']._ctx._last;
chk('drawImage 를 불렀다', !!rect);
if(rect){
  chk('왼쪽 위로 반 칸 밀어 그린다',
      Math.abs(rect.dx + STEP/2) < 1e-9 && Math.abs(rect.dy + STEP/2) < 1e-9,
      `dx ${rect.dx}, dy ${rect.dy} (반 칸 = ${STEP/2})`);
  chk('오른쪽 끝이 화면 밖까지 간다', rect.dx + rect.dw >= W,
      `${(rect.dx+rect.dw).toFixed(1)} >= ${W}`);
  chk('아래쪽 끝이 화면 밖까지 간다', rect.dy + rect.dh >= H,
      `${(rect.dy+rect.dh).toFixed(1)} >= ${H}`);
}

console.log('\n=== 7. 그리는 순서 ===');
// 구름은 배 다음, 밤 앞이다. 밤보다 뒤로 가면 흐린 밤이 오히려 밝아진다.
const order = ['drawShip()','cloudVeil()','nightVeil()','compass()','frameVignette()']
  .map(f => html.indexOf('\n  ' + f));
chk('배·구름·밤·나침반·테두리 순서다',
    order.every((v,i) => v > 0 && (i === 0 || v > order[i-1])),
    order.join(' < '));

console.log('\n=== 8. 덩어리 모드 — 모양이 있는가 ===');
// 안개와 덩어리를 가르는 것은 '같은 자리에서도 알파가 제각각인가' 하나다.
// 안개는 이웃한 칸끼리 값이 거의 같지만, 덩어리는 뭉친 곳과 뚫린 곳이 갈린다.
function stats(res){
  const d = res.img.data; let s = 0, n = 0;
  for(let p = 3; p < d.length; p += 4){ s += d[p]; n++; }
  const m = s/n; let v = 0;
  for(let p = 3; p < d.length; p += 4) v += (d[p]-m)*(d[p]-m);
  return { mean:m, sd:Math.sqrt(v/n), n };
}
const fog  = stats(run(-30, 10, 195, 0.5, 1.0, 1));
const lump = stats(run(-30, 10, 195, 0.5, 1.0, 2));
chk('덩어리가 안개보다 훨씬 들쭉날쭉하다', lump.sd > fog.sd * 3,
    `표준편차 안개 ${fog.sd.toFixed(1)} vs 덩어리 ${lump.sd.toFixed(1)}`);
chk('완전히 뚫린 곳과 꽉 찬 곳이 둘 다 있다',
    (() => { const d = run(-30, 10, 195, 0.5, 1.0, 2).img.data;
      let lo = 0, hi = 0;
      for(let p = 3; p < d.length; p += 4){ if(d[p] < 10) lo++; if(d[p] > 190) hi++; }
      return lo > 50 && hi > 50; })(), '맑은 칸과 짙은 칸이 함께 나온다');

console.log('\n=== 9. 덮인 넓이가 운량과 맞는가 ===');
// 문턱값을 그냥 0.5 로 잡으면 운량 20% 든 80% 든 화면 절반이 덮인다.
// 노이즈 분포를 재어 문턱을 옮기는 까닭이 여기 있다.
//
// 배율을 너무 낮추면 화면이 지구 절반을 담아 어디를 재든 세계 평균(약 46%)이
// 나와 버린다. 반대로 너무 높이면 구름 덩어리 한두 개만 들어와 통계가 안 된다.
// 배율 2 면 화면이 35°x20° — 덩어리 350개쯤이 들어와 둘 사이가 맞는다.
const MAXA2 = SF('CLOUD_MAXA2'), ST2 = SF('CLOUD_STEP2'), ZM = 2;
for(const [nm, lon, lat, day] of [['사하라 7월', 12, 24, 195],
                                  ['인도양 7월', 70, 12, 195],
                                  ['남극해 1월',  0, -58, 15]]){
  const res = run(lon, lat, day, ZM, 1.0, 2);
  const d = res.img.data, half = MAXA2*255*0.5;
  let cov = 0, want = 0, n = 0;
  for(let jy=0; jy<res.img.height; jy++)
    for(let ix=0; ix<res.img.width; ix++){
      const [wx,wy] = screenToWorld(ix*ST2, jy*ST2, res.x, res.y, ZM);
      want += cpct(wx, wy, res.mf)*0.01; n++;
      if(d[(jy*res.img.width+ix)*4+3] >= half) cov++;
    }
  cov /= n; want /= n;
  chk(nm + ' 덮인 넓이가 운량과 맞는다', Math.abs(cov-want) < 0.12,
      `덮임 ${(cov*100).toFixed(0)}% / 운량 ${(want*100).toFixed(0)}%`);
}

console.log('\n=== 10. 바람에 실려 흐르는가 ===');
const KMPX = vm.runInContext('KM_PER_PX', sandbox);
// windVec 은 update() 에서 이미 windGain 이 곱해진 값이다. 여기서 8 m/s 를
// 직접 넣으므로 기댓값에도 windGain 을 곱하면 안 된다 — 곱하면 코드가
// 이중으로 곱하는 버그를 그대로 통과시킨다.
vm.runInContext(`(function(){
  windVec.x = 8; windVec.y = 0;
  cloudDX = 0; cloudDY = 0; cloudLastDay = gameDay;
  P.cloudMode = 2; P.cloudGain = 1; P.cloudDrift = 1;
  cloudVeil();
})()`, sandbox);
const a0 = Float64Array.from(vm.runInContext('cloudImg.data', sandbox));
vm.runInContext('gameDay += 2; cloudVeil();', sandbox);
const a1 = Float64Array.from(vm.runInContext('cloudImg.data', sandbox));
const dx = vm.runInContext('cloudDX', sandbox);
const wantDx = 8 * 86.4 / KMPX * 2;
chk('이틀치가 바람 속도만큼 밀린다', Math.abs(dx - wantDx) < 0.5,
    `${dx.toFixed(1)} vs 기댓값 ${wantDx.toFixed(1)} 월드px ` +
    `(8m/s 로 이틀 = ${(dx*KMPX).toFixed(0)}km, 실제로도 1382km)`);
chk('동풍이면 동쪽으로 민다', dx > 0);
let moved = 0;
for(let p = 3; p < a0.length; p += 4) if(Math.abs(a0[p]-a1[p]) > 6) moved++;
chk('무늬가 실제로 움직였다', moved > a0.length/4*0.15,
    `칸의 ${(moved/(a0.length/4)*100).toFixed(0)}% 가 바뀜`);
// 바람이 없으면 흐르지 않아야 한다. 알파를 그대로 비교하면 안 된다 —
// 날이 가면 달이 넘어가고 운량 자체가 조금씩 바뀌기 때문이다. 그건 구름이
// 흐른 것이 아니라 계절이 바뀐 것이다. 흐른 거리만 본다.
const dxA = vm.runInContext('cloudDX', sandbox);
vm.runInContext('windVec.x = 0; windVec.y = 0; gameDay += 2; cloudVeil();', sandbox);
const dxB = vm.runInContext('cloudDX', sandbox);
chk('무풍이면 구름도 멈춘다', dxA === dxB, `흐른 거리 ${dxA.toFixed(1)} 그대로`);

// 배가 움직여도 구름이 흐르는 거리는 달라지지 않아야 한다. 구름은 세계 위에서
// 바람만 따라 흐르고, 배는 그 아래를 지나갈 뿐이다.
function driftWhileShipMoves(shipStep){
  vm.runInContext(`(function(){
    const p = project(-30, 10);
    ship.x = p[0]; ship.y = p[1];
    windVec.x = 8; windVec.y = 0;
    cloudDX = 0; cloudDY = 0; cloudLastDay = gameDay;
    P.cloudMode = 2; P.cloudDrift = 1; zoom = 4;
    cloudVeil();
    for(let i=0;i<10;i++){
      ship.x += ${shipStep};              // 배만 움직인다. 바람은 그대로다
      gameDay += 0.2; cloudVeil();
    }
  })()`, sandbox);
  return vm.runInContext('cloudDX', sandbox);
}
const still = driftWhileShipMoves(0);
const east  = driftWhileShipMoves(40);     // 배가 동쪽으로 달림
const west  = driftWhileShipMoves(-40);    // 배가 서쪽으로 달림
chk('배의 방향·속도가 구름 흐름을 바꾸지 않는다',
    Math.abs(east-still) < 1e-9 && Math.abs(west-still) < 1e-9,
    `정지 ${still.toFixed(1)} / 동진 ${east.toFixed(1)} / 서진 ${west.toFixed(1)} 월드px`);

console.log('\n=== 11. 세계를 한 바퀴 돌면 이어지는가 ===');
// 경도로 되풀이되지 않으면 날짜변경선 부근에서 구름이 뚝 끊긴다.
const fbm = (x,y) => vm.runInContext(`cfbm(${x},${y},cloudCells(90),4)`, sandbox);
let seam = 0;
for(let k=0;k<12;k++){
  const y = 800 + k*211;
  seam = Math.max(seam, Math.abs(fbm(37+k*13, y) - fbm(37+k*13 + 8192, y)));
}
chk('경도 8192px 마다 무늬가 되풀이된다', seam < 1e-9, `최대 어긋남 ${seam.toExponential(1)}`);
const q0 = vm.runInContext('cthr(0,4)', sandbox), q1 = vm.runInContext('cthr(1,4)', sandbox);
chk('운량이 늘수록 문턱이 내려간다', q1 < q0, `운량 0 -> ${q0.toFixed(3)} / 100% -> ${q1.toFixed(3)}`);

console.log('\n=== 12. 구름 크기 ===');
// 크기를 줄이면 한 줄을 훑을 때 구름과 빈 하늘이 더 자주 갈마들어야 한다.
// 그 횟수를 세면 덩어리가 실제로 잘아졌는지 눈으로 안 보고도 알 수 있다.
function crossings(size){
  const res = run(-30, 10, 195, 4, 1.0, 2, size);
  const d = res.img.data, w = res.img.width, h = res.img.height;
  const half = SF('CLOUD_MAXA2')*255*0.5;
  let c = 0;
  for(let jy=0; jy<h; jy++){
    let prev = d[(jy*w)*4+3] >= half;
    for(let ix=1; ix<w; ix++){
      const cur = d[(jy*w+ix)*4+3] >= half;
      if(cur !== prev) c++;
      prev = cur;
    }
  }
  return c;
}
const big = crossings(400), small = crossings(40);
chk('크기를 줄이면 덩어리가 잘아진다', small > big*2,
    `400km 일 때 경계 ${big}번 / 40km 일 때 ${small}번`);
chk('격자 수가 정수로 떨어진다',
    [0,20,90,157,333,500].every(km => {
      const n = vm.runInContext(`cloudCells(${km})`, sandbox);
      return Number.isInteger(n) && n >= 16;
    }), '경도 되풀이가 깨지지 않는다');

// 크기를 바꿔도 덮인 넓이는 운량을 따라야 한다 (층수별 분위수 표가 하는 일)
for(const km of [40, 90, 300]){
  const res = run(70, 12, 195, ZM, 1.0, 2, km);
  const d = res.img.data, half = MAXA2*255*0.5;
  let cov = 0, want = 0, n = 0;
  for(let jy=0; jy<res.img.height; jy++)
    for(let ix=0; ix<res.img.width; ix++){
      const [wx,wy] = screenToWorld(ix*ST2, jy*ST2, res.x, res.y, ZM);
      want += cpct(wx, wy, res.mf)*0.01; n++;
      if(d[(jy*res.img.width+ix)*4+3] >= half) cov++;
    }
  cov /= n; want /= n;
  chk(`크기 ${km}km 에서도 덮인 넓이가 맞는다`, Math.abs(cov-want) < 0.14,
      `덮임 ${(cov*100).toFixed(0)}% / 운량 ${(want*100).toFixed(0)}%`);
}

console.log('\n=== 13. 크기 0 — 잡음이 되지 않는가 ===');
// 표본 간격보다 잘게 만들면 덩어리가 표본 사이를 빠져나가 지지직거린다.
// 0 은 '없음'이 아니라 '화면이 보여 줄 수 있는 가장 잘게'여야 한다.
for(const z of [0.5, 4, 40]){
  run(-30, 10, 195, z, 1.0, 2, 0);
  const n = vm.runInContext('cloudNCell', sandbox);
  const cellPx = (8192/n) * z;                 // 덩어리 하나의 화면 크기
  chk(`배율 ${z} 에서 덩어리가 표본보다 크다`, cellPx >= ST2*2 - 1e-6,
      `덩어리 ${cellPx.toFixed(1)}px >= 표본간격x2 ${ST2*2}px ` +
      `(약 ${((8192/n)*4.892).toFixed(0)}km)`);
}
// 확대할수록 더 잘아져야 한다 — 화면이 더 잘게 보여 줄 수 있으므로
run(-30,10,195,0.5,1.0,2,0);
const nFar = vm.runInContext('cloudNCell', sandbox);
run(-30,10,195,40,1.0,2,0);
const nNear = vm.runInContext('cloudNCell', sandbox);
chk('확대하면 크기 0 의 구름이 더 잘아진다', nNear > nFar,
    `배율 0.5 에서 격자 ${nFar} -> 배율 40 에서 ${nNear}`);
// 0 이어도 구름은 있어야 한다 (꺼지는 것이 아니다)
const z0 = stats(run(-30, 10, 195, 4, 1.0, 2, 0));
chk('크기 0 이어도 구름이 사라지지 않는다', z0.mean > 20,
    `평균 알파 ${z0.mean.toFixed(1)}`);

console.log(`\n${fail === 0 ? '전부 통과' : '실패 있음'} - 통과 ${pass}, 실패 ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
