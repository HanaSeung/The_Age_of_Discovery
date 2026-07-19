// verify_shipforce.js — 강제 속력이 물리를 제대로 가로채는가
// 실행: node verify_shipforce.js
//
// 이 값은 바람·돛 사슬을 끊고 배의 속력을 직접 박는다. 확인해야 할 것은 셋이다.
//   1. 정말 그 속력이 되는가 (단위 변환이 맞는가)
//   2. 0 이면 물리가 그대로 살아 있는가
//   3. 해류는 죽지 않았는가 — 이게 이 값을 만든 이유다
"use strict";
const fs = require('fs'), path = require('path'), vm = require('vm');
const D = __dirname;
const html = fs.readFileSync(path.join(D, 'world_chart.html'), 'utf8');
let pass = 0, fail = 0;
function chk(n, c, note){
  if(c){ pass++; console.log('  OK   ' + n + (note ? '  ' + note : '')); }
  else  { fail++; console.log('  FAIL ' + n + (note ? '  ' + note : '')); }
}

console.log('\n=== 1. 코드 구조 ===');
chk('P 에 shipForce 가 있다', /shipForce\s*:\s*0/.test(html));
chk('패널에 강제 속력 항목이 있다', /\['shipForce',/.test(html));
chk('값 복사에 들어간다', /shipForce\s*:\s*'\+P\.shipForce/.test(html));
// 가로채는 자리가 맞는지 — 가감속 뒤, 침로 반영 앞이어야 한다
const iAcc = html.indexOf('ship.speed < 0) ship.speed = 0');
const iForce = html.indexOf('if(P.shipForce > 0) ship.speed');
const iVx = html.indexOf('ship.vx = Math.cos(ship.head)*ship.speed');
chk('가감속 뒤, 침로 반영 앞에서 가로챈다',
    iAcc > 0 && iForce > iAcc && iVx > iForce,
    '이 순서가 아니면 물리가 덮어쓰거나 속도가 안 실린다');
chk('해류를 건드리지 않는다',
    !/shipForce[\s\S]{0,200}curVec/.test(html), '해류는 따로 더해진다');


// ── 페이지를 띄운다 ────────────────────────────────────────
function makeCtx(){ const c={}, n=()=>()=>{};
  for(const m of ['save','restore','beginPath','closePath','moveTo','lineTo','fill','arc',
    'stroke','fillRect','strokeRect','clearRect','rect','translate','scale','rotate',
    'setTransform','fillText','strokeText','quadraticCurveTo','bezierCurveTo','clip',
    'drawImage','ellipse','putImageData','measureText','setLineDash','arcTo']) c[m]=n();
  c.createRadialGradient=()=>({addColorStop(){}}); c.createLinearGradient=()=>({addColorStop(){}});
  c.measureText=()=>({width:10}); c.getImageData=()=>({data:new Uint8ClampedArray(4)});
  c.createImageData=(w,h)=>({width:w,height:h,data:new Uint8ClampedArray((w|0)*(h|0)*4)});
  return c; }
const els={}; function mkEl(id){ const e={id,style:{},width:0,height:0,innerHTML:'',
  textContent:'',value:'',classList:{_s:new Set(),add(){},remove(){},toggle(){},contains(){return false}},
  _ctx:null,getContext(){return this._ctx||(this._ctx=makeCtx())},addEventListener(){},
  appendChild(){},querySelector(){return null},querySelectorAll(){return []}};
  els[id]=e; return e; }
for(const id of ['c','cCanvas','hud','hint','toggles','tune','info','cWind','cCur']) mkEl(id);
const doc={getElementById:id=>els[id]||mkEl(id),createElement:t=>mkEl('_'+t+Math.random()),
  addEventListener(){},querySelector(){return null},body:{classList:mkEl('_b').classList}};
const sb={window:{innerWidth:1600,innerHeight:900,devicePixelRatio:1,addEventListener(){},
  matchMedia:()=>({matches:false})},document:doc,console:{log(){},warn(){},error(){}},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}},performance:{now:()=>0},
  requestAnimationFrame:()=>0,addEventListener(){},
  atob:s=>Buffer.from(s,'base64').toString('binary'),
  Math,JSON,Date,Object,Array,String,Number,Boolean,Error,isNaN,parseFloat,parseInt,
  DataView,ArrayBuffer,Uint8Array,Int8Array,Uint8ClampedArray,Uint16Array,Int16Array,
  Float32Array,Float64Array,Int32Array,setTimeout(){},clearTimeout(){},
  navigator:{clipboard:{writeText:()=>Promise.resolve()}},Promise,
  Path2D:class{moveTo(){}lineTo(){}arc(){}rect(){}closePath(){}addPath(){}
    quadraticCurveTo(){}bezierCurveTo(){}ellipse(){}},
  ImageData:class{constructor(w,h){this.width=w;this.height=h;
    this.data=new Uint8ClampedArray((w|0)*(h|0)*4)}},
  Image:class{set src(v){}addEventListener(){}},
  OffscreenCanvas:class{constructor(w,h){this.width=w;this.height=h}getContext(){return makeCtx()}}};
sb.window.document=doc; sb.globalThis=sb; vm.createContext(sb);


console.log('\n=== 2. 페이지가 뜨는가 ===');
for(const f of ['land_data.js','bathy_data.js','currents_data.js',
                'wind_data.js','cloud_data.js','star_data.js'])
  vm.runInContext(fs.readFileSync(path.join(D,f),'utf8'), sb, {filename:f});
const body = html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)[1];
let bootErr = null;
try { vm.runInContext(body, sb, {filename:'world_chart.html'}); }
catch(e){ bootErr = e; }
chk('본문이 오류 없이 실행된다', !bootErr,
    bootErr ? (bootErr.name+': '+bootErr.message) : '');
if(bootErr){ console.log('\n실패 있음\n'); process.exit(1); }
const PX_TO_KN = vm.runInContext('PX_TO_KN', sb);

// 배를 어느 지점에 놓고 update 를 한 번 돌린다. 돌리기 전후 위치 차이로
// 실제 이동을 재면, 코드가 무엇을 더했는지 밖에서 확인할 수 있다.
function run(lon, lat, force, opt){
  opt = opt || {};
  return vm.runInContext(`(function(){
    const p = project(${lon}, ${lat});
    ship.x = p[0]; ship.y = p[1];
    ship.head = ${opt.head === undefined ? 0 : opt.head};
    ship.speed = 0; ship.sail = ${opt.sail === undefined ? 2 : opt.sail};
    ship.grounded = false;
    gameDay = ${opt.day === undefined ? 100 : opt.day};
    P.shipForce = ${force};
    P.curGain = ${opt.curGain === undefined ? 1 : opt.curGain};
    const x0 = ship.x, y0 = ship.y;
    update(${opt.dt === undefined ? 0.05 : opt.dt});
    return { kn: ship.speed*${PX_TO_KN},
             vx: ship.vx, vy: ship.vy,
             cx: curVec.x, cy: curVec.y,
             moved: Math.hypot(ship.x-x0, ship.y-y0),
             gs: Math.hypot(ship.vx+curVec.x, ship.vy+curVec.y)*${PX_TO_KN},
             wind: ship.windMs, head: ship.head, grounded: ship.grounded };
  })()`, sb);
}


console.log('\n=== 3. 정말 그 속력이 되는가 ===');
// 대서양 한복판. 가속 곡선을 건너뛰고 한 프레임 만에 그 값이 되어야 한다.
for(const kn of [0.5, 3, 8, 20]){
  const r = run(-30, 20, kn);
  chk(`${kn} kn 으로 고정된다`, Math.abs(r.kn - kn) < 1e-6,
      `실제 ${r.kn.toFixed(4)} kn`);
}
// 돛을 다 내려도, 바람이 없어도 나아간다 — 그게 이 값의 목적이다
const noSail = run(-30, 20, 6, {sail:0});
chk('돛을 내려도 그 속력이 나온다', Math.abs(noSail.kn - 6) < 1e-6,
    `돛 0단인데 ${noSail.kn.toFixed(2)} kn`);
chk('그래도 바람 계산은 살아 있다', noSail.wind > 0,
    `풍속 ${noSail.wind.toFixed(2)} m/s — 나침반 표시가 죽지 않는다`);

console.log('\n=== 4. 0 이면 물리가 그대로인가 ===');
const off = run(-30, 20, 0, {sail:2, dt:0.05});
chk('한 프레임에 최고속으로 튀지 않는다', off.kn < 3,
    `${off.kn.toFixed(3)} kn — 가속 곡선을 탄다`);
// 여러 프레임 돌리면 서서히 붙는다. 다만 뱃머리를 아무 데나 두면 안 된다 —
// 무역풍대에서 동쪽으로 두면 역풍 사각에 걸려 영영 0 이다 (그게 옳은 물리다).
// 그래서 바람이 가는 쪽으로 뱃머리를 맞춰 두고 잰다.
const ramp = vm.runInContext(`(function(){
  const p = project(-30, 20); ship.x=p[0]; ship.y=p[1];
  ship.head=0; ship.speed=0; ship.sail=2; P.shipForce=0; gameDay=100;
  update(0.001);                                  // 바람을 한 번 샘플
  ship.head = Math.atan2(windVec.y, windVec.x);   // 정후풍으로
  ship.speed = 0;
  const out=[];
  for(let i=0;i<200;i++){ update(0.05); out.push(ship.speed*${PX_TO_KN}); }
  return { first: out[0], last: out[199], eff: ship.sailEff };
})()`, sb);
chk('시간이 지나면 물리대로 속력이 오른다', ramp.last > ramp.first*3,
    `첫 프레임 ${ramp.first.toFixed(3)} -> 200프레임 뒤 ${ramp.last.toFixed(3)} kn ` +
    `(돛효율 ${ramp.eff.toFixed(2)})`);


console.log('\n=== 5. 해류가 살아 있는가 — 이 값을 만든 이유 ===');
// 강제 속력을 켜도 해류는 그대로 더해져야 한다. 그래야 '해류가 배를 얼마나
// 밀어내는가' 를 다른 변수 없이 볼 수 있다.
{
  // 해류가 뚜렷한 곳을 찾는다 (멕시코 만류·적도 해류 근처)
  let spot = null;
  for(const [lo,la] of [[-75,26],[-45,5],[-20,-5],[140,35],[-160,0],[-30,-40]]){
    const r = run(lo, la, 5);
    const cs = Math.hypot(r.cx, r.cy)*PX_TO_KN;
    if(!spot || cs > spot.cs) spot = { lo, la, cs, r };
  }
  chk('해류가 있는 곳을 찾았다', spot.cs > 0.05,
      `북위 ${spot.la}° 서경 ${-spot.lo}° 에서 ${spot.cs.toFixed(2)} kn`);
  chk('강제 속력을 켜도 해류가 죽지 않는다',
      Math.hypot(spot.r.cx, spot.r.cy) > 1e-9,
      '나침반 해류 바늘이 그대로 산다');
  // 대지속력은 강제 속력과 달라야 한다 — 해류가 더해지니까
  chk('대지속력이 강제 속력과 다르다', Math.abs(spot.r.gs - 5) > 0.01,
      `강제 5.00 kn -> 대지속력 ${spot.r.gs.toFixed(3)} kn ` +
      `(차 ${(spot.r.gs-5).toFixed(3)})`);
  // 침로를 뒤집으면 순류/역류가 뒤바뀌어 대지속력이 갈린다
  const east = run(spot.lo, spot.la, 5, {head:0});
  const west = run(spot.lo, spot.la, 5, {head:Math.PI});
  chk('순류와 역류에서 대지속력이 갈린다',
      Math.abs(east.gs - west.gs) > 0.05,
      `동진 ${east.gs.toFixed(3)} kn / 서진 ${west.gs.toFixed(3)} kn`);
  // 해류 배율 0 이면 대지속력이 강제 속력과 같아진다
  const noCur = run(spot.lo, spot.la, 5, {curGain:0});
  chk('해류를 끄면 대지속력이 강제 속력과 같다', Math.abs(noCur.gs - 5) < 1e-6,
      `${noCur.gs.toFixed(4)} kn`);
}


console.log('\n=== 6. 다른 것들이 망가지지 않았는가 ===');
{
  // 실제로 그만큼 움직였는가 — 속도만 박고 이동에 안 실리면 소용없다
  const r = run(-30, 20, 10, {curGain:0, dt:0.05});
  const TIMEK = vm.runInContext('TIMEK', sb);
  const want = (10/PX_TO_KN) * 0.05 * TIMEK;
  chk('박은 속력이 실제 이동에 실린다', Math.abs(r.moved - want) < 1e-6,
      `${r.moved.toFixed(4)} 월드px (기댓값 ${want.toFixed(4)})`);
  // 침로 조타가 살아 있는가
  const turned = vm.runInContext(`(function(){
    const p = project(-30, 20); ship.x=p[0]; ship.y=p[1];
    ship.head=0; ship.speed=0; ship.sail=2; P.shipForce=6; gameDay=100;
    keys['d']=true; update(0.05); keys['d']=false;
    return ship.head;
  })()`, sb);
  chk('강제 속력 중에도 조타가 된다', turned > 1e-6,
      `침로가 ${(turned*180/Math.PI).toFixed(2)}° 돌았다`);
  // 육지는 여전히 막는가.
  //
  // 주의: 이 대역에는 진짜 육지가 없다. 마스크는 캔버스에 폴리곤을 그린 뒤
  // 픽셀을 되읽어 만드는데, 대역 캔버스의 getImageData 는 빈 배열을 돌려준다.
  // 그래서 샌드박스에서는 온 세계가 바다다 — 실제 해안선으로 시험하면
  // 무조건 통과해 버린다. 대신 isLand 를 가짜 벽으로 바꿔 끼워 충돌 경로만 본다.
  const hit = vm.runInContext(`(function(){
    const p = project(-30, 20);
    const wallX = p[0] + 40;                 // 배 동쪽 40 월드px 에 남북으로 선 벽
    const real = isLand;
    isLand = (wx, wy) => wx >= wallX;
    ship.x=p[0]; ship.y=p[1]; ship.head=0; ship.speed=0; ship.sail=2;
    P.shipForce=25; P.curGain=0; gameDay=100;
    let blocked=0;
    for(let i=0;i<400;i++){ const x0=ship.x; update(0.05); if(ship.x===x0) blocked++; }
    const stopped = ship.x, g = ship.grounded;
    isLand = real;
    return { blocked, grounded:g, gap: wallX - stopped };
  })()`, sb);
  chk('강제 속력이어도 벽에 막힌다', hit.blocked > 300,
      `400프레임 중 ${hit.blocked}프레임 전진 차단`);
  chk('벽 코앞에서 멈춘다', hit.gap > 0 && hit.gap < 1.2,
      `벽까지 ${hit.gap.toFixed(3)} 월드px 남기고 정지`);
}

console.log(`\n${fail === 0 ? '전부 통과' : '실패 있음'} - 통과 ${pass}, 실패 ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
