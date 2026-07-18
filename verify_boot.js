// verify_boot.js — 페이지가 실제로 뜨는가 (선언 순서·오타 같은 치명 오류 잡기)
// 실행: node verify_boot.js
// 정규식 검사는 "코드가 이렇게 쓰였나"만 본다. 이 파일은 "실행되나"를 본다.
// 앞서 const 를 뒤에서 선언해 resize() 가 죽은 일이 있었고, 눈으로 볼 때까지 몰랐다.
"use strict";
const fs = require('fs'), path = require('path'), vm = require('vm');
const D = __dirname;
const html = fs.readFileSync(path.join(D, 'world_chart.html'), 'utf8');
let pass = 0, fail = 0;
function chk(n, c, note){
  if(c){ pass++; console.log('  OK   ' + n + (note ? '  ' + note : '')); }
  else  { fail++; console.log('  FAIL ' + n + (note ? '  ' + note : '')); }
}

// ── 아주 작은 DOM·캔버스 대역 ────────────────────────────────
const drawn = [];                       // 어느 캔버스에 무엇을 그렸는지 기록
function makeCtx(tag){
  const c = { _tag: tag };
  const noop = name => (...a) => { drawn.push(tag + ':' + name); };
  for(const m of ['save','restore','beginPath','closePath','moveTo','lineTo','arc',
                  'fill','stroke','fillRect','strokeRect','clearRect','rect',
                  'translate','scale','rotate','setTransform','fillText','strokeText',
                  'quadraticCurveTo','bezierCurveTo','clip','drawImage','ellipse',
                  'createRadialGradient','createLinearGradient','putImageData',
                  'getImageData','measureText','setLineDash','arcTo'])
    c[m] = noop(m);
  c.createRadialGradient = () => ({ addColorStop(){} });
  c.createLinearGradient = () => ({ addColorStop(){} });
  c.measureText = () => ({ width: 10 });
  c.getImageData = () => ({ data: new Uint8ClampedArray(4) });
  return c;
}
const els = {};
function mkEl(id){
  const e = {
    id, style:{}, width:0, height:0, innerHTML:'', textContent:'', value:'',
    classList:{ _s:new Set(), add(x){this._s.add(x);}, remove(x){this._s.delete(x);},
                toggle(x,f){ f===undefined ? (this._s.has(x)?this._s.delete(x):this._s.add(x)) : (f?this._s.add(x):this._s.delete(x)); },
                contains(x){ return this._s.has(x); } },
    getContext: () => makeCtx(id),
    addEventListener(){}, appendChild(){}, querySelector(){ return null; },
    querySelectorAll(){ return []; },
  };
  els[id] = e; return e;
}
for(const id of ['c','cCanvas','hud','hint','toggles','tune','info','cWind','cCur'])
  mkEl(id);
const document_ = {
  getElementById(id){ return els[id] || mkEl(id); },
  createElement(t){ return mkEl('_'+t); },
  addEventListener(){}, querySelector(){ return null; },
  body:{ classList: mkEl('_body').classList },
};
const sandbox = {
  window:{ innerWidth:1600, innerHeight:900, devicePixelRatio:1,
           addEventListener(){}, matchMedia:()=>({matches:false}) },
  document: document_,
  console: { log(){}, warn(){}, error(){} },
  localStorage: { _d:{}, getItem(k){ return this._d[k] ?? null; },
                  setItem(k,v){ this._d[k]=String(v); }, removeItem(k){ delete this._d[k]; } },
  performance: { now: () => 0 },
  requestAnimationFrame(){ return 0; },       // 루프는 한 번도 돌리지 않는다
  addEventListener(){},
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  Math, JSON, Date, Object, Array, String, Number, Boolean, Error, isNaN, parseFloat, parseInt,
  Uint8Array, Int8Array, Uint8ClampedArray, Float32Array, Int32Array,
  setTimeout(){}, clearTimeout(){}, navigator:{ clipboard:{ writeText(){ return Promise.resolve(); } } },
  Promise,
  // 브라우저 전용 객체들 — 있기만 하면 된다
  Path2D: class { moveTo(){} lineTo(){} arc(){} rect(){} closePath(){} addPath(){}
                  quadraticCurveTo(){} bezierCurveTo(){} ellipse(){} },
  ImageData: class { constructor(w,h){ this.width=w; this.height=h;
                     this.data = new Uint8ClampedArray((w|0)*(h|0)*4); } },
  Image: class { set src(v){} addEventListener(){} },
  OffscreenCanvas: class { constructor(w,h){ this.width=w; this.height=h; }
                           getContext(){ return makeCtx('offscreen'); } },
};
sandbox.window.document = document_;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

console.log('\n=== 1. 데이터 파일 ===');
for(const f of ['land_data.js','bathy_data.js','currents_data.js','wind_data.js']){
  const p = path.join(D, f);
  const ok = fs.existsSync(p);
  chk(f + ' 있음', ok, ok ? (fs.statSync(p).size/1024).toFixed(0)+' KB' : '');
  if(ok) try { vm.runInContext(fs.readFileSync(p,'utf8'), sandbox, {filename:f}); }
         catch(e){ chk(f + ' 실행됨', false, e.message); }
}

console.log('\n=== 2. 본문 스크립트가 끝까지 실행되는가 ===');
const m = html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/);
chk('본문 스크립트를 찾았다', !!m, m ? m[1].length + '자' : '');
let err = null;
try { vm.runInContext(m[1], sandbox, { filename: 'world_chart.html' }); }
catch(e){ err = e; }
chk('오류 없이 끝까지 실행된다', !err, err ? (err.name + ': ' + err.message) : '');
if(err && err.stack){
  const line = (err.stack.match(/world_chart\.html:(\d+)/) || [])[1];
  if(line) console.log('       (스크립트 시작에서 ' + line + '번째 줄 근처)');
}

if(!err){
  console.log('\n=== 3. 첫 프레임을 그릴 수 있는가 ===');
  for(const fn of ['resize','compass','drawShip','frameVignette']){
    let e2 = null;
    try { vm.runInContext(fn + '();', sandbox, {filename: fn}); } catch(e){ e2 = e; }
    chk(fn + '() 가 돈다', !e2, e2 ? (e2.name + ': ' + e2.message) : '');
  }
  // 좌상단 항해일지는 걷어냈다. 부르는 곳이 남아 있으면 매 프레임 죽는다.
  chk('drawHUD 가 남아 있지 않다', !/drawHUD/.test(html));
  chk('#hud 요소·규칙이 없다', !/id="hud"/.test(html) && !/^\s*#hud/m.test(html));
  chk('전용 도우미도 함께 지웠다', !/const DIRS/.test(html) && !/function fmt\(/.test(html));

  console.log('\n=== 4. 나침반이 제 캔버스에 그려지는가 ===');
  drawn.length = 0;
  try { vm.runInContext('compass();', sandbox, {filename:'compass'}); } catch(e){}
  const onCard = drawn.filter(s => s.startsWith('cCanvas:')).length;
  const onMap  = drawn.filter(s => s.startsWith('c:')).length;
  chk('나침반 캔버스에 그린다', onCard > 10, onCard + '회');
  chk('지도 캔버스를 건드리지 않는다', onMap === 0, onMap + '회');
  chk('숫자를 DOM 에 넣는다', els.cWind.textContent !== '' && els.cCur.textContent !== '',
      `바람 "${els.cWind.textContent}" / 해류 "${els.cCur.textContent}"`);
  chk('캔버스 크기가 잡혔다', els.cCanvas.width > 0, els.cCanvas.width + 'px');

  console.log('\n=== 5. 조정 패널이 만들어지는가 ===');
  chk('패널 내용이 채워졌다', els.tune.innerHTML.length > 500, els.tune.innerHTML.length + '자');
  for(const s of ['mi_gen','mi_set','mi_dbg','pane_dbg','cHint','tuneOut'])
    chk(s + ' 생성됨', els.tune.innerHTML.includes(s));
}

console.log(`\n${fail === 0 ? '전부 통과' : '실패 있음'} — 통과 ${pass}, 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);
