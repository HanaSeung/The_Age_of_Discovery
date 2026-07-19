
// 비와 눈 — 그리기 검증 (3단계)
// node verify_precipviz.js
//
// 그림 자체는 눈으로 봐야 하지만, 그리기 코드가 지켜야 할 성질은 잴 수 있다.
// 순서, 배선, 그리고 방울이 실제로 '떨어지는가' 를 시간을 흘려 보며 확인한다.
const fs = require('fs');
const vm = require('vm');
const D   = __dirname + '/';
const src = fs.readFileSync(D + 'world_chart.html', 'utf8');
const lines = src.split(/\r?\n/);
let pass = 0, fail = 0;
function chk(name, ok, note){
  if(ok) pass++; else fail++;
  console.log((ok ? '  OK  ' : '  X   ') + name + (note ? '   ' + note : ''));
}

// ===== 1. 배선 =====
console.log('\n=== 1. 배선 ===');
chk('precipVeil() 이 있다', /function precipVeil\(\)/.test(src));
chk('P 에 precipMode 가 있다', /^\s*precipMode\s*:/m.test(src));
chk('P 에 precipGain 이 있다', /^\s*precipGain\s*:/m.test(src));
chk('패널에 비눈 표현 칸이 있다', /'precipMode','비눈 표현'/.test(src));
chk('패널에 비눈 세기 칸이 있다', /'precipGain','비눈 세기'/.test(src));
chk('표현 0 이면 그리지 않는다',
    /Math\.round\(P\.precipMode\) === 0 \|\| P\.precipGain <= 0/.test(src));
chk('자료가 없으면 그리지 않는다', /function precipVeil\(\)\{\s*\r?\n\s*if\(!PRECIP\) return;/.test(src));
for(const k of ['PRECIP_N','RAIN_RGB','SNOW_RGB','RAIN_LEN','RAIN_FALL',
                'SNOW_FALL','SNOW_R','PRECIP_TILT'])
  chk(k + ' 상수가 있다', src.includes('const ' + k));

// ===== 2. 그리는 순서 =====
// 구름 다음, 밤 앞. 비는 구름 속에서 내리므로 구름보다 앞에 오고, 밤은
// 지도·구름·비를 한꺼번에 덮어야 하므로 셋 다 뒤에 온다.
console.log('\n=== 2. 그리는 순서 ===');
const ord = n => lines.findIndex(l => l.trim().startsWith(n));
const iShip = ord('drawShip();'), iCloud = ord('cloudVeil();'),
      iPrec = ord('precipVeil();'), iNight = ord('nightVeil();'),
      iStar = ord('starVeil();'), iComp = ord('compass();');
console.log('  배 ' + iShip + ' < 구름 ' + iCloud + ' < 비 ' + iPrec +
            ' < 밤 ' + iNight + ' < 별 ' + iStar + ' < 나침반 ' + iComp);
chk('비를 그린다', iPrec > 0);
chk('구름 다음에 비가 온다', iCloud < iPrec);
chk('비 다음에 밤이 온다', iPrec < iNight);
chk('나침반은 맨 뒤에 남는다', iComp > iStar);

// ===== 3. 시계 =====
// 게임 시계가 아니라 실제 시계를 따라야 한다. 시계 배속을 48시간으로 올렸다고
// 비가 24배 빨리 떨어지면 화면이 깨진다.
console.log('\n=== 3. 시계 ===');
chk('precipT 를 update() 가 올린다', /precipT \+= dt;/.test(src));
chk('게임 배속(TIMEK)을 곱하지 않는다', !/precipT \+= dt \* TIMEK/.test(src));

// ===== 4. 실제로 그려 본다 =====
// 가짜 ctx 로 붓질을 받아 적고, 시간을 흘려 방울이 정말 떨어지는지 잰다.
function grabFn(name){
  const head = src.indexOf('function ' + name + '(');
  if(head < 0){ console.log('  X   ' + name + ' 을 찾지 못했다'); fail++; return ''; }
  let i = src.indexOf('{', head), depth = 0;
  for(let k = i; k < src.length; k++){
    if(src[k] === '{') depth++;
    else if(src[k] === '}'){ depth--; if(depth === 0) return src.slice(head, k+1); }
  }
  return '';
}
const grab = re => (src.match(re) || [''])[0];

// 붓질을 받아 적는 가짜 ctx
const strokes = [], arcs = [];
let mode = null, cur = null;
const ctx = {
  setTransform(){},
  beginPath(){ cur = []; },
  moveTo(x, y){ if(cur) cur.push([x, y]); },
  lineTo(x, y){ if(cur && cur.length) strokes.push([cur[cur.length-1], [x, y]]); },
  arc(x, y, r){ arcs.push([x, y, r]); },
  stroke(){}, fill(){},
  set strokeStyle(v){ this._ss = v; }, get strokeStyle(){ return this._ss; },
  set fillStyle(v){ this._fs = v; },   get fillStyle(){ return this._fs; },
  set lineWidth(v){ this._lw = v; },   get lineWidth(){ return this._lw; }
};

const box = {
  Math, console, ctx, atob: s => Buffer.from(s, 'base64').toString('binary'),
  window: {}, Uint8Array, Float32Array,
  gameDay: 0, HERE: 1,
  W: 1600, H: 900, zoom: 1, DPR: 1,
  ship: { x: 0, y: 0 },
  windVec: { x: 0, y: 0 },
  P: { precipMode: 1, precipGain: 1 }
};
vm.createContext(box);
vm.runInContext(fs.readFileSync(D + 'precip_data.js', 'utf8'), box);
vm.runInContext(fs.readFileSync(D + 'airtemp_data.js', 'utf8'), box);
vm.runInContext([
  grab(/const\s+WORLD_W\s*=[^;]+;/), 'const DEG2PXY = WORLD_H/180;',
  grabFn('wrapX'),
  grab(/const PRECIP = \(function\(\)\{[\s\S]*?\n\}\)\(\);/),
  grab(/const AIRTEMP = \(function\(\)\{[\s\S]*?\n\}\)\(\);/),
  (src.match(/const PRECIP_\w+[^;]*;/g) || []).join('\n'),
  (src.match(/const (RAIN|SNOW)_\w+[^;]*;/g) || []).join('\n'),
  'let precipT = 0;',
  grab(/const precipDrops = \(function\(\)\{[\s\S]*?\n\}\)\(\);/),
  grabFn('airTempC'), grabFn('precipAt'), grabFn('precipVeil'),
  'const precipHere = {type:0, rate:0};',
  'function screenTransform(){}',
  'function cloudOpacityAt(wx, wy){ return HERE; }',
  'let MF = 0;',
  'function monthF(){ return MF; }'
].join('\n'), box);

console.log('\n=== 4. 그려 본다 ===');
chk('precipVeil 을 실행할 수 있다', typeof vm.runInContext('precipVeil', box) === 'function');

// 위경도를 배 위치로 옮기고 한 프레임 그린다.
function frame(lat, lon, month, t, gain, windX){
  box.gameDay = month*30.4 + 15;
  vm.runInContext('MF = ' + month + ';', box);
  vm.runInContext('precipT = ' + t + ';', box);
  box.ship.y = vm.runInContext('(90-(' + lat + '))*DEG2PXY', box);
  box.ship.x = vm.runInContext('((' + lon + ')+180)/360*WORLD_W', box);
  box.P.precipGain = (gain === undefined) ? 1 : gain;
  box.windVec.x = windX || 0;
  strokes.length = 0; arcs.length = 0;
  vm.runInContext('precipVeil()', box);
  return { rain: strokes.slice(), snow: arcs.slice() };
}

// 다우대·건조대를 가르려면 배율을 올려야 한다. zoom 1 이면 화면 하나가
// 경도 70도를 덮어서, 페루 앞바다를 한가운데 둬도 가장자리는 적도수렴대다.
// 화면이 한 기후대 안에 들어오도록 최대 배율(13)로 잰다.
box.zoom = 13;
const wet  = frame(15, 90, 6, 0);
const dry  = frame(-20, -90, 6, 0);
console.log('  (배율 13 — 화면 가로 약 5.4도)');
console.log('  벵골만 7월    빗줄기 ' + wet.rain.length + '  눈 ' + wet.snow.length);
console.log('  페루 앞바다   빗줄기 ' + dry.rain.length + '  눈 ' + dry.snow.length);
chk('다우대에서는 비가 그려진다', wet.rain.length > 100);
chk('건조대에서는 아무것도 안 그려진다', dry.rain.length === 0 && dry.snow.length === 0);

// 추운 곳은 눈으로만 나와야 한다. 비와 눈이 같은 자리에 함께 오면 안 된다.
const cold = frame(-65, 0, 6, 0);
console.log('  남극해 7월    빗줄기 ' + cold.rain.length + '  눈 ' + cold.snow.length);
chk('추운 곳은 눈으로 그린다', cold.snow.length > 0);
chk('추운 곳에 비가 섞이지 않는다', cold.rain.length === 0);
chk('따뜻한 곳에 눈이 섞이지 않는다', wet.snow.length === 0);

// 배율을 낮추면 화면이 여러 기후대에 걸친다. 그때는 한 화면에 비 오는 곳과
// 갠 곳이 함께 나오는 것이 맞다 - 지도 위의 강수를 그리는 것이므로.
box.zoom = 1;
const wide = frame(-20, -90, 6, 0);
console.log('  페루 앞바다 (배율 1 — 화면 가로 약 70도)  빗줄기 ' + wide.rain.length);
chk('넓게 보면 이웃 기후대의 비가 함께 보인다', wide.rain.length > 0,
    '배율 13 에서 ' + dry.rain.length + ' -> 배율 1 에서 ' + wide.rain.length);
box.zoom = 13;

// ===== 5. 정말 떨어지는가 =====
// 방울 하나하나를 따라가야 한다. 그리는 집합이 프레임마다 바뀌면 중앙값 같은
// 통계로는 움직임이 묻힌다. 그래서 '어디나 비' 로 바꿔 900개를 모두 그리게
// 하고, 붓질 순서가 곧 방울 번호가 되게 만든 다음 같은 번호끼리 견준다.
console.log('\n=== 5. 떨어지는가 ===');
vm.runInContext(
  'const _real = precipAt;' +
  'function _all(wx, wy, out){ out.type = PRECIP_RAIN; out.rate = 1; return out; }' +
  'precipAt = _all;', box);
const a0 = frame(15, 90, 6, 0);
const a1 = frame(15, 90, 6, 0.01);      // 10ms 뒤
vm.runInContext('precipAt = _real;', box);
chk('모든 방울이 그려졌다', a0.rain.length === vm.runInContext('PRECIP_N', box),
    a0.rain.length + ' / ' + vm.runInContext('PRECIP_N', box));

let down = 0, wrapped = 0, dySum = 0;
for(let i = 0; i < a0.rain.length; i++){
  const y0 = a0.rain[i][0][1], y1 = a1.rain[i][0][1];
  if(y1 > y0){ down++; dySum += (y1 - y0); }
  else wrapped++;                       // 화면 아래로 나가 위에서 되들어온 것
}
const dy = dySum / Math.max(1, down) / 0.01;
console.log('  아래로 간 방울 ' + down + ' / 되돌아온 방울 ' + wrapped);
console.log('  평균 낙하 ' + dy.toFixed(0) + ' px/초 (상수 RAIN_FALL 780 x 빠르기편차 0.75~1.25)');
chk('거의 모든 방울이 아래로 내려간다', down > a0.rain.length*0.9);
chk('일부는 화면을 벗어나 되돌아온다', wrapped > 0);
chk('떨어지는 빠르기가 상수와 맞는다', dy > 600 && dy < 1000, dy.toFixed(0) + ' px/초');
chk('방울 수가 프레임마다 널뛰지 않는다', a0.rain.length === a1.rain.length);

// ===== 6. 바람에 기우는가 =====
console.log('\n=== 6. 바람 =====');
const calm = frame(15, 90, 6, 0, 1, 0);
const east = frame(15, 90, 6, 0, 1, 9);     // 동풍 9m/s = 45도
const west = frame(15, 90, 6, 0, 1, -9);
const slope = f => { const s = f.rain[0]; return (s[1][0] - s[0][0]) / (s[1][1] - s[0][1]); };
console.log('  무풍 기울기 ' + slope(calm).toFixed(2) +
            '  동풍 ' + slope(east).toFixed(2) + '  서풍 ' + slope(west).toFixed(2));
chk('무풍이면 곧게 떨어진다', Math.abs(slope(calm)) < 0.01);
chk('바람이 불면 기운다', Math.abs(slope(east)) > 0.5);
chk('바람 방향에 따라 반대로 기운다', slope(east) * slope(west) < 0);
chk('9m/s 에서 45도쯤 눕는다', Math.abs(Math.abs(slope(east)) - 1) < 0.25,
    Math.abs(slope(east)).toFixed(2));

// ===== 7. 세기 손잡이 =====
console.log('\n=== 7. 세기 ===');
const g0 = frame(15, 90, 6, 0, 0);
const g5 = frame(15, 90, 6, 0, 0.5);
const g1 = frame(15, 90, 6, 0, 1.0);
console.log('  세기 0 -> ' + g0.rain.length + '  0.5 -> ' + g5.rain.length +
            '  1.0 -> ' + g1.rain.length + ' 줄');
chk('세기 0 이면 아무것도 안 그린다', g0.rain.length === 0 && g0.snow.length === 0);
chk('세기를 올리면 방울이 는다', g1.rain.length > g5.rain.length);
chk('표현 0 이면 아무것도 안 그린다', (function(){
  box.P.precipMode = 0;
  const r = frame(15, 90, 6, 0);
  box.P.precipMode = 1;
  return r.rain.length === 0 && r.snow.length === 0;
})());

// ===== 8. 화면을 벗어나지 않는가 =====
// 화면 밖에 그리면 보이지 않을 뿐 값은 낭비된다. 빗줄기 길이만큼의
// 여유는 인정한다 — 위에서 들어오고 아래로 나가야 자연스럽다.
console.log('\n=== 8. 화면 범위 ===');
let outX = 0, outY = 0;
const margin = 40;
for(const s of g1.rain)
  for(const p of s){
    if(p[0] < -margin || p[0] > box.W + margin) outX++;
    if(p[1] < -margin || p[1] > box.H + margin) outY++;
  }
for(const a of g1.snow){
  if(a[0] < -margin || a[0] > box.W + margin) outX++;
  if(a[1] < -margin || a[1] > box.H + margin) outY++;
}
chk('가로로 삐져나가지 않는다', outX === 0, outX + '개');
chk('세로로 삐져나가지 않는다', outY === 0, outY + '개');

// ===== 9. 값이 얼마나 드는가 =====
// precipAt 은 구름·강수·기온을 모두 훑으므로 싸지 않다. 한 프레임에
// 몇 번 부르는지 세어 둔다. 구름은 이미 프레임당 수천 번을 쓴다.
console.log('\n=== 9. 비용 ===');
let calls = 0;
vm.runInContext('const _pa = precipAt; COUNT = 0;', box);
box.COUNT = 0;
vm.runInContext('precipAt = function(a,b,c){ COUNT++; return _pa(a,b,c); };', box);
frame(15, 90, 6, 0);
calls = box.COUNT;
console.log('  한 프레임에 precipAt 호출 ' + calls + '회 (방울 ' +
            vm.runInContext('PRECIP_N', box) + '개 x 비/눈 2회전)');
chk('호출 수가 방울 수의 두 배를 넘지 않는다',
    calls <= vm.runInContext('PRECIP_N', box)*2, calls + '회');

console.log('\n' + '='.repeat(46));
console.log('  통과 ' + pass + ' / 실패 ' + fail);
console.log('='.repeat(46) + '\n');
process.exit(fail ? 1 : 0);
