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
  // 구름 막이 쓴다. 진짜 캔버스처럼 알파를 담을 자리를 내어 주어야
  // 그리기 코드를 흉내만 내지 않고 실제로 돌려 볼 수 있다.
  c.createImageData = (w,h) => ({ width:w, height:h,
                                  data: new Uint8ClampedArray((w|0)*(h|0)*4) });
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
    querySelectorAll(){ return []; }, contains(){ return false; },
    // 조정 패널은 슬라이더에서 줄 전체(부모)를 잡아 말풍선과 라벨 두 번 누르기를
    // 단다. 부모와 그 안의 라벨까지 흉내 내 두어야 본문이 끝까지 돈다.
    parentElement:{ addEventListener(){},
                    querySelector(){ return { addEventListener(){} }; } },
  };
  els[id] = e; return e;
}
for(const id of ['c','cCanvas','hud','hint','toggles','tune','info','cWind','cCur',
                 'dCanvas','dial','dIn','dOut'])
  mkEl(id);
const document_ = {
  getElementById(id){ return els[id] || mkEl(id); },
  createElement(t){ return mkEl('_'+t); },
  addEventListener(){}, querySelector(){ return null; },
  // 말풍선처럼 body 에 직접 붙이는 요소가 있다 — 흉내만 내 둔다
  body:{ classList: mkEl('_body').classList, appendChild(){}, contains(){ return false; } },
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
for(const f of ['land_data.js','bathy_data.js','currents_data.js','wind_data.js',
                'cloud_data.js']){
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
  for(const fn of ['resize','DIAL.draw','drawShip','frameVignette']){
    let e2 = null;
    try { vm.runInContext(fn + '();', sandbox, {filename: fn}); } catch(e){ e2 = e; }
    chk(fn + '() 가 돈다', !e2, e2 ? (e2.name + ': ' + e2.message) : '');
  }
  // 좌상단 항해일지는 걷어냈다. 부르는 곳이 남아 있으면 매 프레임 죽는다.
  chk('drawHUD 가 남아 있지 않다', !/drawHUD/.test(html));
  chk('#hud 요소·규칙이 없다', !/id="hud"/.test(html) && !/^\s*#hud/m.test(html));
  chk('전용 도우미도 함께 지웠다', !/const DIRS/.test(html) && !/function fmt\(/.test(html));

  console.log('\n=== 4. 원형 계기가 제 캔버스에 그려지는가 ===');
  drawn.length = 0;
  try { vm.runInContext('DIAL.draw();', sandbox, {filename:'dial'}); } catch(e){}
  const onCard = drawn.filter(s => s.startsWith('dCanvas:')).length;
  const onMap  = drawn.filter(s => s.startsWith('c:')).length;
  chk('계기 캔버스에 그린다', onCard > 10, onCard + '회');
  chk('지도 캔버스를 건드리지 않는다', onMap === 0, onMap + '회');
  // 표시값 넷은 모두 원 안이다 — DOM 이 아니라 캔버스에 실린다.
  // 여기서는 계기가 모서리 DOM 을 찾지 않는지만 본다 (모양은 verify_compass 가 맡는다).
  const ro = ['dGeo','dWind','dCur','dGs'].filter(k => els[k] !== undefined);
  chk('모서리 DOM 을 찾지 않는다 — 값이 모두 원 안이다', ro.length === 0,
      ro.length ? '아직 찾는다: ' + ro.join(', ') : '');
  chk('캔버스 크기가 잡혔다', els.dCanvas.width > 0, els.dCanvas.width + 'px');

  console.log('\n=== 5. 조정 패널이 만들어지는가 ===');
  chk('패널 내용이 채워졌다', els.tune.innerHTML.length > 500, els.tune.innerHTML.length + '자');
  for(const s of ['mi_gen','mi_set','mi_dbg','pane_dbg','cHint','tuneOut'])
    chk(s + ' 생성됨', els.tune.innerHTML.includes(s));
}

// ===== 6. 검증들이 기계를 가리지 않는가 =====
// 작업을 C: 와 D: 두 기계에서 번갈아 한다. 검증이 원본을 절대경로로 열면
// 한쪽 기계에서만 돌고 다른 쪽에서는 파일을 못 찾아 통째로 터진다 —
// 그러면 그 파일의 검사가 하나도 돌지 않으면서 목록에는 실패 하나로만 보인다.
// verify_helm.js 가 실제로 그랬다. 되풀이되지 않게 여기서 지킨다.
console.log('\n=== 6. 검증들이 기계를 가리지 않는가 ===');
{
  const fsx = require('fs'), px = require('path');
  const files = fsx.readdirSync(__dirname).filter(f => /^verify_.*\.js$/.test(f));
  const bad = [];
  for(const f of files){
    const t = fsx.readFileSync(px.join(__dirname, f), 'utf8');
    for(const ln of t.split(/\r?\n/)){
      if(/^\s*\/\//.test(ln)) continue;            // 주석 속 경로는 설명이라 봐준다
      // 구분자 뒤에 낱말이 이어져야 경로로 본다 — 'c:/ 처럼 끝나는 정규식 리터럴을
      // 경로로 잘못 잡지 않기 위해서다 (verify_ship.js 에 실제로 그런 줄이 있다)
      if(/['"`][A-Za-z]:[\\/]{1,2}\w/.test(ln)) bad.push(f + ' ← ' + ln.trim().slice(0, 60));
    }
  }
  chk('검증 파일을 찾았다', files.length > 10, files.length + '개');
  chk('절대경로를 박은 곳이 없다 — 두 기계에서 같이 돈다', bad.length === 0,
      bad.length ? bad.join(' / ') : '__dirname 기준으로만 연다');
}

console.log(`\n${fail === 0 ? '전부 통과' : '실패 있음'} — 통과 ${pass}, 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);
