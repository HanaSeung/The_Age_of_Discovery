// verify_starviz.js — 별이 진짜 그 시각 그 위도의 하늘인가
// 실행: node verify_starviz.js
//
// 화면에 찍힌 좌표를 거꾸로 풀어 고도·방위를 되찾은 뒤, 코드가 쓴 공식과
// 무관한 성질로 따진다.
//   - 하늘은 강체다: 별끼리의 각거리는 시간이 가도 변하지 않는다
//   - 하루 동안 거의 안 움직이는 점이 있다: 천구의 극이다
//   - 그 점의 고도가 곧 위도다 — 1500년 항해술의 전부이자 이 구현의 시금석
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
chk('star_data.js 를 읽어들인다', /<script src="star_data\.js"><\/script>/.test(html));
chk('STARS 모듈이 있다', /const STARS = \(function\(\)\{/.test(html));
chk('starVeil 함수가 있다', /function starVeil\(\)\{/.test(html));
chk('구름이 별을 가리는 함수가 있다', /function cloudOpacityAt\(/.test(html));
chk('패널에 별 항목 셋이 있다',
    /\['starMode',/.test(html) && /\['starCount',/.test(html)
    && /\['starGain',/.test(html));
const oNight = html.indexOf('\n  nightVeil()'), oStar = html.indexOf('\n  starVeil()');
chk('별을 밤보다 뒤에 그린다', oNight > 0 && oStar > oNight,
    '밤에 함께 어두워지면 안 된다');


// ── 페이지를 실제로 띄운다 ──────────────────────────────────
const HITS = [];                     // starVeil 이 찍은 별들
function makeCtx(){
  const c = {}, noop = () => () => {};
  for(const m of ['save','restore','beginPath','closePath','moveTo','lineTo','fill',
      'stroke','strokeRect','clearRect','rect','translate','scale','rotate',
      'setTransform','fillText','strokeText','quadraticCurveTo','bezierCurveTo',
      'clip','drawImage','ellipse','putImageData','measureText','setLineDash','arcTo'])
    c[m] = noop();
  c.createRadialGradient = () => ({ addColorStop(){} });
  c.createLinearGradient = () => ({ addColorStop(){} });
  c.measureText = () => ({ width: 10 });
  c.getImageData = () => ({ data: new Uint8ClampedArray(4) });
  c.createImageData = (w,h) => ({ width:w, height:h,
                                  data: new Uint8ClampedArray((w|0)*(h|0)*4) });
  c.globalAlpha = 1;
  c._rec = false;
  c.arc = (x,y,r) => { if(c._rec) HITS.push({x, y, s:r*2, a:c.globalAlpha}); };
  c.fillRect = (x,y,w,h) => { if(c._rec) HITS.push({x:x+w/2, y:y+h/2, s:w, a:c.globalAlpha}); };
  return c;
}
const els = {};
function mkEl(id){
  const e = { id, style:{}, width:0, height:0, innerHTML:'', textContent:'', value:'',
    classList:{ _s:new Set(), add(x){this._s.add(x);}, remove(x){this._s.delete(x);},
                toggle(){}, contains(){ return false; } },
    _ctx:null, getContext(){ return this._ctx || (this._ctx = makeCtx()); },
    addEventListener(){}, appendChild(){}, querySelector(){ return null; },
    querySelectorAll(){ return []; } };
  els[id] = e; return e;
}
for(const id of ['c','cCanvas','hud','hint','toggles','tune','info','cWind','cCur'])
  mkEl(id);


const SCRW = 1600, SCRH = 900;
const doc = {
  getElementById: id => els[id] || mkEl(id),
  createElement: t => mkEl('_'+t+Math.random()),
  addEventListener(){}, querySelector(){ return null; },
  body:{ classList: mkEl('_body').classList },
};
const sandbox = {
  window:{ innerWidth:SCRW, innerHeight:SCRH, devicePixelRatio:1,
           addEventListener(){}, matchMedia:()=>({matches:false}) },
  document: doc, console:{ log(){}, warn(){}, error(){} },
  localStorage:{ getItem:()=>null, setItem(){}, removeItem(){} },
  performance:{ now:()=>0 }, requestAnimationFrame:()=>0, addEventListener(){},
  atob: s => Buffer.from(s,'base64').toString('binary'),
  Math, JSON, Date, Object, Array, String, Number, Boolean, Error,
  isNaN, parseFloat, parseInt, DataView, ArrayBuffer,
  Uint8Array, Int8Array, Uint8ClampedArray, Uint16Array, Int16Array,
  Float32Array, Float64Array, Int32Array,
  setTimeout(){}, clearTimeout(){},
  navigator:{ clipboard:{ writeText:()=>Promise.resolve() } }, Promise,
  Path2D: class { moveTo(){} lineTo(){} arc(){} rect(){} closePath(){} addPath(){}
                  quadraticCurveTo(){} bezierCurveTo(){} ellipse(){} },
  ImageData: class { constructor(w,h){ this.width=w; this.height=h;
                     this.data = new Uint8ClampedArray((w|0)*(h|0)*4); } },
  Image: class { set src(v){} addEventListener(){} },
  OffscreenCanvas: class { constructor(w,h){ this.width=w; this.height=h; }
                           getContext(){ return makeCtx(); } },
};
sandbox.window.document = doc;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);


console.log('\n=== 2. 페이지가 뜨는가 ===');
for(const f of ['land_data.js','bathy_data.js','currents_data.js',
                'wind_data.js','cloud_data.js','star_data.js'])
  vm.runInContext(fs.readFileSync(path.join(D,f),'utf8'), sandbox, {filename:f});
const body = html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)[1];
let bootErr = null;
try { vm.runInContext(body, sandbox, {filename:'world_chart.html'}); }
catch(e){ bootErr = e; }
chk('본문이 오류 없이 실행된다', !bootErr,
    bootErr ? (bootErr.name+': '+bootErr.message) : '');
if(bootErr){ console.log('\n실패 있음\n'); process.exit(1); }
const W = vm.runInContext('W', sandbox), H = vm.runInContext('H', sandbox);
chk('별 데이터가 실렸다', vm.runInContext('STARS !== null && STARS.n > 100', sandbox),
    vm.runInContext('STARS.n', sandbox) + '개');

// ── 하늘을 그리고, 찍힌 점을 고도·방위로 되돌린다 ───────────
// 지평선까지의 화면 거리. starVeil 이 쓰는 값과 반드시 같아야 한다 —
// 여기가 어긋나면 고도가 통째로 부풀거나 쪼그라들어 아래 검사가 전부 헛돈다.
const SKYSPAN = 1;
const R = (Math.min(W, H)/2) * SKYSPAN, DEG = 180/Math.PI;
function sky(lon, lat, day, opt){
  opt = opt || {};
  HITS.length = 0;
  els['c']._ctx._rec = true;
  vm.runInContext(`(function(){
    const p = project(${lon}, ${lat});
    ship.x = p[0]; ship.y = p[1];
    gameDay = ${day};
    zoom = ${opt.zoom === undefined ? 4 : opt.zoom};
    P.starMode = 1; P.starGain = 1;
    P.skySpan = ${SKYSPAN};
    P.starCount = ${opt.count === undefined ? 300 : opt.count};
    P.cloudMode = ${opt.cloud === undefined ? 0 : opt.cloud};
    P.nightMode = 1; P.nightGain = 1;
    starVeil();
  })()`, sandbox);
  els['c']._ctx._rec = false;
  // 화면 좌표 -> 고도·방위 (starVeil 이 쓴 것과 반대 방향으로 푼다)
  return HITS.map(h => {
    const dx = h.x - W/2, dy = h.y - H/2;
    const r = Math.hypot(dx, dy);
    return { alt: 90*(1 - r/R), az: (Math.atan2(-dx, -dy)*DEG + 360) % 360,
             s: h.s, a: h.a, x: h.x, y: h.y };
  });
}
function vec(p){                       // 고도·방위 -> 단위벡터 (각거리 계산용)
  const A = p.alt/DEG, Z = p.az/DEG;
  return [Math.cos(A)*Math.cos(Z), Math.cos(A)*Math.sin(Z), Math.sin(A)];
}
function ang(p, q){
  const a = vec(p), b = vec(q);
  return Math.acos(Math.max(-1, Math.min(1, a[0]*b[0]+a[1]*b[1]+a[2]*b[2])))*DEG;
}


// 그 위경도에서 가장 깊은 밤이 되는 시각을 찾는다 (경도마다 다르므로)
function midnight(lon, dayBase){
  let best = dayBase, bestD = -1;
  for(let k=0;k<48;k++){
    const d = Math.floor(dayBase) + k/48;
    vm.runInContext(`gameDay = ${d};`, sandbox);
    const dk = vm.runInContext(`darkness(sunAlt(project(${lon},0)[0], ship.y))`, sandbox);
    if(dk > bestD){ bestD = dk; best = d; }
  }
  return best;
}

console.log('\n=== 3. 밤에만 보이는가 ===');
const t0 = midnight(-25, 10);
const nightSky = sky(-25, 35, t0);
chk('한밤에는 별이 뜬다', nightSky.length > 40, `${nightSky.length}개`);
const noonSky = sky(-25, 35, t0 + 0.5);
chk('한낮에는 하나도 안 보인다', noonSky.length === 0, `${noonSky.length}개`);
chk('모두 지평선 위에 있다', nightSky.every(p => p.alt > -0.01),
    `가장 낮은 별 ${Math.min(...nightSky.map(p=>p.alt)).toFixed(1)}°`);
chk('천정을 넘어가지 않는다', nightSky.every(p => p.alt <= 90.01));

console.log('\n=== 4. 지도 배율과 무관한가 ===');
const zA = sky(-25, 35, t0, {zoom:0.5}), zB = sky(-25, 35, t0, {zoom:100});
let zsame = zA.length === zB.length;
if(zsame) for(let i=0;i<zA.length;i++)
  if(Math.abs(zA[i].x-zB[i].x) > 1e-9 || Math.abs(zA[i].y-zB[i].y) > 1e-9){ zsame = false; break; }
chk('배율 0.5 와 100 의 하늘이 똑같다', zsame,
    `${zA.length}개 · ${zB.length}개`);

console.log('\n=== 5. 하늘이 강체로 도는가 ===');
// 별끼리의 각거리는 어떤 회전에도 변하지 않는다. 짧은 시간을 흘려보내고
// 가까운 것끼리 짝지어 거리를 다시 잰다. 투영이나 좌표변환이 틀어져 있으면
// 여기서 벌어진다.
//
// 짝짓기가 헷갈리면 이 검사 자체가 거짓말을 한다. 이웃 별과 뒤바뀌면 코드는
// 멀쩡한데 거리가 어긋난 것처럼 보인다. 그래서 '가장 가까운 것' 이 '두 번째'
// 보다 뚜렷하게 가까울 때만 짝으로 인정한다.
function match(A, B, lim){
  lim = lim === undefined ? 0.6 : lim;
  const out = [];
  for(const a of A){
    let b1 = null, d1 = 9, d2 = 9;
    for(const b of B){
      const t = ang(a,b);
      if(t < d1){ d2 = d1; d1 = t; b1 = b; } else if(t < d2) d2 = t;
    }
    if(b1 && d1 < lim && d2 > d1*4) out.push([a, b1]);
  }
  return out;
}
const A = sky(-25, 35, t0, {count:400});
const B = sky(-25, 35, t0 + 0.0005, {count:400});
const pair = match(A, B);
chk('짝지을 별이 넉넉하다', pair.length > 40, `${pair.length}쌍`);
let worst = 0;
for(let i=0;i<pair.length;i++) for(let j=i+1;j<pair.length;j++)
  worst = Math.max(worst, Math.abs(ang(pair[i][0],pair[j][0]) - ang(pair[i][1],pair[j][1])));
chk('별 사이 각거리가 그대로다', worst < 0.1,
    `가장 어긋난 짝 ${(worst*60).toFixed(2)}분 (좌표 양자화 한계 약 0.4분)`);


console.log('\n=== 6. 하늘이 도는 축이 천구의 극인가 ===');
// 회전이라면 모든 별의 이동 벡터가 회전축과 직각이다. 그러니 이동 벡터들에
// 가장 직각인 방향 하나를 찾으면 그게 축이다 (최소자승). 외적을 그냥 평균 내면
// 거의 나란한 짝이 섞여 들어와 흔들리므로, 행렬의 가장 작은 고유벡터로 푼다.
// 코드가 쓴 식은 한 줄도 빌리지 않고 화면에 찍힌 점만으로 구한다.
function spinAxis(lon, lat, day){
  const A = sky(lon, lat, day, {count:400});
  const B = sky(lon, lat, day + 0.002, {count:400});
  const d = [];
  for(const [a, bb] of match(A, B)){
    const L = ang(a, bb);
    if(L < 0.02) continue;                            // 극 바로 옆은 방향이 흔들린다
    const va = vec(a), vb = vec(bb);
    d.push([(vb[0]-va[0])/L, (vb[1]-va[1])/L, (vb[2]-va[2])/L]);
  }
  if(d.length < 8) return null;
  // M = sum(d dT). 축은 M 의 가장 작은 고유벡터.
  const M = [[0,0,0],[0,0,0],[0,0,0]];
  for(const v of d) for(let i=0;i<3;i++) for(let j=0;j<3;j++) M[i][j] += v[i]*v[j];
  const tr = M[0][0]+M[1][1]+M[2][2];
  const Mp = M.map((r,i) => r.map((x,j) => (i===j ? tr : 0) - x));   // 부호 뒤집기
  let v = [0.3, 0.5, 0.81];
  for(let k=0;k<80;k++){
    const w = [ Mp[0][0]*v[0]+Mp[0][1]*v[1]+Mp[0][2]*v[2],
                Mp[1][0]*v[0]+Mp[1][1]*v[1]+Mp[1][2]*v[2],
                Mp[2][0]*v[0]+Mp[2][1]*v[1]+Mp[2][2]*v[2] ];
    const L = Math.hypot(...w); if(L < 1e-12) break;
    v = [w[0]/L, w[1]/L, w[2]/L];
  }
  if(v[2] < 0) v = [-v[0], -v[1], -v[2]];            // 지평선 위쪽 극으로
  return { alt: Math.asin(v[2])*DEG, az: (Math.atan2(v[1],v[0])*DEG+360)%360,
           n: d.length };
}
for(const [lon, lat] of [[-25, 35], [-25, 55], [-30, -30]]){
  const t = midnight(lon, 10);
  const p = spinAxis(lon, lat, t);
  if(!p){ chk(`위도 ${lat}° 축을 찾았다`, false, '별이 모자람'); continue; }
  const wantAz = lat >= 0 ? 0 : 180;
  const dAz = Math.abs(((p.az - wantAz + 540) % 360) - 180);
  chk(`위도 ${lat}° 에서 축의 고도가 위도와 같다`, Math.abs(p.alt - Math.abs(lat)) < 1.2,
      `축 고도 ${p.alt.toFixed(2)}° (위도 ${Math.abs(lat)}°)`);
  chk(`위도 ${lat}° 에서 축이 ${lat>=0?'북':'남'}쪽에 있다`, dAz < 2,
      `방위 ${p.az.toFixed(1)}° (기댓값 ${wantAz}°)`);
}


console.log('\n=== 7. 북극성이 제 노릇을 하는가 ===');
// 1500년 북극성은 극에서 3.4도 떨어져 있다. 극 근처에서 가장 밝은 별이어야 하고,
// 그 고도가 위도에서 3.4도 안쪽으로 들어와야 한다.
{
  const lon = -25, lat = 38, t = midnight(lon, 10);
  const p = spinAxis(lon, lat, t);
  const S = sky(lon, lat, t, {count:300});
  const near = S.filter(q => ang(q, p) < 6).sort((a,b) => b.s - a.s);
  chk('극 가까이에 별이 있다', near.length > 0, `${near.length}개`);
  if(near.length){
    const pol = near[0];
    chk('그 별이 극에서 3~4도 떨어져 있다', ang(pol,p) > 2.5 && ang(pol,p) < 4.5,
        `${ang(pol,p).toFixed(2)}° — 1500년 실제값 3.42°`);
    chk('그 별의 고도가 위도와 3.5도 안쪽으로 맞는다', Math.abs(pol.alt-lat) < 3.6,
        `고도 ${pol.alt.toFixed(2)}° / 위도 ${lat}° (차 ${(pol.alt-lat).toFixed(2)}°)`);
  }
  // 남반구에서 북극성이 안 뜬다는 것은 6장의 '축이 남쪽' 으로 이미 증명됐다.
  // 여기서는 대신 축이 하루 뒤에도 제자리에 붙박여 있는지 본다 — 그게 극이다.
  // (반나절 뒤로 하면 대낮이라 별이 없다)
  const p2 = spinAxis(lon, lat, t + 1);
  chk('축이 하루 뒤에도 같은 자리다',
      p2 && Math.abs(p2.alt-p.alt) < 0.5 &&
      Math.abs(((p2.az-p.az+540)%360)-180) < 1.0,
      p2 ? `고도 ${p.alt.toFixed(2)}° -> ${p2.alt.toFixed(2)}° · ` +
           `방위 ${p.az.toFixed(1)}° -> ${p2.az.toFixed(1)}°` : '축을 못 찾음');
}

console.log('\n=== 8. 계절과 위치에 따라 하늘이 달라지는가 ===');
{
  const lon = -25, t = midnight(lon, 10);
  const w = sky(lon, 35, t, {count:200});                    // 1월
  const s = sky(lon, 35, midnight(lon, 190), {count:200});   // 7월
  let same = 0;
  for(const a of w) if(s.some(b => ang(a,b) < 0.3)) same++;
  chk('반년 뒤 같은 시각의 하늘이 다르다', same < w.length*0.35,
      `겹치는 별 ${same}/${w.length}개`);
  const eq = sky(lon, 2, t, {count:200});
  let same2 = 0;
  for(const a of w) if(eq.some(b => ang(a,b) < 0.3)) same2++;
  chk('위도가 달라지면 하늘이 기운다', same2 < w.length*0.35,
      `북위 35° 대 북위 2° 겹침 ${same2}/${w.length}개`);
}


console.log('\n=== 9. 구름·개수·밝기 ===');
{
  const lon = -25, lat = 35, t = midnight(lon, 10);
  const clear = sky(lon, lat, t, {cloud:0});
  const cloudy = sky(lon, lat, t, {cloud:1});     // 안개 모드 = 그 지역 운량 그대로
  const avgA = arr => arr.reduce((s,p)=>s+p.a,0) / Math.max(1,arr.length);
  chk('구름이 끼면 별이 흐려진다', avgA(cloudy) < avgA(clear)*0.85,
      `맑음 평균 ${avgA(clear).toFixed(3)} -> 흐림 ${avgA(cloudy).toFixed(3)}`);
  const few = sky(lon, lat, t, {count:100}), many = sky(lon, lat, t, {count:900});
  chk('개수를 늘리면 별이 늘어난다', many.length > few.length*2,
      `100개 설정 ${few.length}개 -> 900개 설정 ${many.length}개`);
  chk('밝은 별이 더 크게 찍힌다',
      Math.max(...clear.map(p=>p.s)) > Math.min(...clear.map(p=>p.s))*1.8,
      `가장 큰 ${Math.max(...clear.map(p=>p.s)).toFixed(2)}px / ` +
      `가장 작은 ${Math.min(...clear.map(p=>p.s)).toFixed(2)}px`);
  // 끄면 아무것도 안 그린다
  HITS.length = 0;
  els['c']._ctx._rec = true;
  vm.runInContext('P.starMode = 0; starVeil();', sandbox);
  els['c']._ctx._rec = false;
  chk('별 표현 0 이면 아무것도 안 그린다', HITS.length === 0, `${HITS.length}개`);
}

console.log('\n=== 10. 하늘이 도는 빠르기 ===');
// 하늘은 하루에 정확히 한 바퀴 도는 것이 아니다. 지구가 태양을 도는 만큼
// 조금 더 돌아 1년에 한 바퀴를 더 번다. 그래서 별은 하루에 약 4분(0.99도)씩
// 앞당겨 뜬다 — 계절마다 밤하늘이 바뀌는 이유가 바로 이것이다.
// 이걸 빠뜨리면 하늘이 태양에 붙박여 일 년 내내 같은 별만 뜬다.
{
  const lon = -25, lat = 35, t = midnight(lon, 10);
  const ax = spinAxis(lon, lat, t);
  const n = [Math.cos(ax.alt/DEG)*Math.cos(ax.az/DEG),
             Math.cos(ax.alt/DEG)*Math.sin(ax.az/DEG), Math.sin(ax.alt/DEG)];
  function turn(dt){                       // dt 게임일 동안 하늘이 돈 각도(도)
    const A = sky(lon, lat, t, {count:400});
    const B = sky(lon, lat, t + dt, {count:400});
    const th = [];
    for(const [a, b] of match(A, B, 1.6)){
      const va = vec(a), vb = vec(b);
      const da = va[0]*n[0]+va[1]*n[1]+va[2]*n[2];
      const db = vb[0]*n[0]+vb[1]*n[1]+vb[2]*n[2];
      const pa = [va[0]-da*n[0], va[1]-da*n[1], va[2]-da*n[2]];
      const pb = [vb[0]-db*n[0], vb[1]-db*n[1], vb[2]-db*n[2]];
      const La = Math.hypot(...pa), Lb = Math.hypot(...pb);
      if(La < 0.35 || Lb < 0.35) continue;             // 극 근처는 각이 흔들린다
      const cr = [pa[1]*pb[2]-pa[2]*pb[1], pa[2]*pb[0]-pa[0]*pb[2],
                  pa[0]*pb[1]-pa[1]*pb[0]];
      const s = (cr[0]*n[0]+cr[1]*n[1]+cr[2]*n[2])/(La*Lb);
      const c = (pa[0]*pb[0]+pa[1]*pb[1]+pa[2]*pb[2])/(La*Lb);
      th.push(Math.atan2(s, c)*DEG);
    }
    th.sort((x,y)=>x-y);
    return { med: th[th.length>>1], n: th.length };
  }
  const d1 = turn(1);
  // 하루치 앞섬은 날짜마다 다르다. 평균은 0.986도지만, 태양이 황도를 따라
  // 도는 것을 적도에 비추면 계절마다 빨라지고 느려지기 때문이다 (균시차의 원인).
  // 1월 10일 무렵의 이론값은 1.05도다 — 평균만 맞으면 오히려 태양 모형이
  // 어딘가 뭉개졌다는 뜻이 된다.
  chk('하루 뒤 별이 제자리에서 약 1도 앞서 있다',
      d1.n > 30 && Math.abs(d1.med) > 0.88 && Math.abs(d1.med) < 1.10,
      `${d1.med.toFixed(3)}° (연평균 ${(360/365).toFixed(3)}°, 이 날짜의 이론값 1.050°)`);
  // 1년이 지나면 하늘은 365 바퀴가 아니라 366 바퀴를 돌아 정확히 제자리로 온다.
  // 이 한 바퀴 차이가 계절마다 밤하늘이 바뀌는 이유의 전부다.
  const y0 = sky(lon, lat, t, {count:300});
  const y1 = sky(lon, lat, t + 365, {count:300});
  let same = 0;
  for(const a of y0) if(y1.some(b => ang(a,b) < 0.02)) same++;
  chk('1년 뒤 하늘이 정확히 제자리로 돌아온다',
      y0.length > 50 && same === y0.length,
      `${same}/${y0.length}개가 같은 자리 — 1년에 366바퀴`);
  // 실시간으로 얼마나 빠른지 — 맞고 틀림이 아니라 시계 설정의 결과다
  const hps = vm.runInContext('P.hoursPerSec', sandbox);
  const secPerTurn = 24/hps * (365/366);
  console.log(`  ...  시계 ${hps}시간/초 이면 하늘 한 바퀴에 ` +
              `실시간 ${secPerTurn.toFixed(1)}초 (초당 ${(360/secPerTurn).toFixed(0)}도)`);
}

console.log(`\n${fail === 0 ? '전부 통과' : '실패 있음'} - 통과 ${pass}, 실패 ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
