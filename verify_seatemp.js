
// 바다 표층 기온 — 위도·계절 근사가 실제 기후와 맞는지 검증
// node verify_seatemp.js
//
// 이 스크립트는 world_chart.html 의 구현을 믿지 않는다. 함수를 통째로 떼어내
// 따로 실행하고, 그 결과를 관측된 위도별 해수면 온도와 맞대어 본다.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('world_chart.html', 'utf8');
let pass = 0, fail = 0;
function chk(name, ok, note){
  if(ok) pass++; else fail++;
  console.log((ok ? '  OK  ' : '  X   ') + name + (note ? '   ' + note : ''));
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ===== 1. 배선 =====
console.log('\n=== 1. 배선 ===');
chk('seaTempC() 가 있다', /function seaTempC\(wy\)/.test(src));
for(const k of ['SEA_T0','SEA_TAMP','SEA_TLAT','SEA_TW','SEA_SAMP',
                'SEA_SLAT','SEA_SW','SEA_SLAG','SEA_SHEM','SEA_FREEZE']){
  chk(k + ' 상수가 있다', new RegExp('const\\s+' + k + '\\s*=').test(src));
}
chk('어는점 아래로 내려가지 않는다', /Math\.max\(SEA_FREEZE,/.test(src));
chk('남반구는 계절이 뒤집힌다', /lat < 0 \? -1 : 1/.test(src));
chk('남반구 진폭이 따로 줄어든다', /lat < 0 \? SEA_SHEM : 1/.test(src));
chk('위도가 극을 넘지 않게 막는다', /Math\.min\(90, Math\.abs\(lat\)\)/.test(src));

// ===== 2. 함수를 떼어내 따로 돌린다 =====
// 구현 코드를 그대로 가져오되, 세계 크기와 날짜는 이 스크립트가 쥔다.
// 이렇게 해야 "게임이 그렇게 계산했으니 맞다" 가 아니라 실제 기후와 맞댈 수 있다.
const consts = (src.match(/const\s+SEA_\w+\s*=\s*[^;]+;/g) || []).join('\n');
const fnSrc  = (src.match(/function seaTempC\(wy\)\{[\s\S]*?\n\}/) || [])[0];
// WORLD_W 와 WORLD_H 는 한 줄에 같이 선언되어 있다. 줄째로 가져온다.
const whSrc  = (src.match(/const\s+WORLD_W\s*=[^;]+;/) || [])[0];

console.log('\n=== 2. 코드 추출 ===');
chk('상수 블록을 찾았다', consts.length > 0, consts.split('\n').length + '개');
chk('seaTempC 본문을 찾았다', !!fnSrc);
chk('세계 크기를 찾았다', !!whSrc && /WORLD_H/.test(whSrc));
if(!fnSrc){ console.log('\n함수를 못 찾아 이후 검사를 건너뛴다.'); process.exit(1); }

const box = { Math, gameDay: 0 };
vm.createContext(box);
vm.runInContext([whSrc,
  'const DEG2PXY = WORLD_H/180;',
  consts, fnSrc].join('\n'), box);

// 위도를 월드 y 로. seaTempC 는 y 를 받으므로 뒤집어 넣는다.
const yOf = lat => vm.runInContext('(90-(' + lat + '))*DEG2PXY', box);
const T = (lat, day) => { box.gameDay = day; return vm.runInContext(
  'seaTempC(' + yOf(lat) + ')', box); };

// 연평균 — 365일을 고르게 훑어 평균낸다
function annual(lat){
  let s = 0;
  for(let d = 0; d < 365; d++) s += T(lat, d);
  return s/365;
}
// 계절 폭 — 한 해 최고와 최저의 차이
function swing(lat){
  let lo = Infinity, hi = -Infinity;
  for(let d = 0; d < 365; d++){ const v = T(lat, d); if(v<lo) lo=v; if(v>hi) hi=v; }
  return {lo, hi, range: hi-lo};
}

// ===== 3. 연평균이 관측과 맞는가 =====
// 기준값은 위도대별 평균 해수면 온도(대양 평균). 해류로 인한 동서 차이는
// 이 근사가 애초에 표현하지 못하므로, 허용 오차를 넉넉히 ±2.5℃ 로 둔다.
const OBS = [[0,27.5],[10,27.3],[20,25.5],[30,22.0],[40,16.0],
             [50,9.0],[60,4.0],[70,0.0],[80,-1.5]];
console.log('\n=== 3. 연평균 해수면 온도 (℃) ===');
console.log('  위도    관측    계산     차이');
for(const [lat, obs] of OBS){
  const got = annual(lat);
  const ok  = near(got, obs, 2.5);
  if(ok) pass++; else fail++;
  console.log('  ' + (ok?'OK ':'X  ') + String(lat).padStart(3) + '°N ' +
    obs.toFixed(1).padStart(7) + got.toFixed(1).padStart(8) +
    (got-obs >= 0 ? '  +' : '  ') + (got-obs).toFixed(1));
}

// ===== 4. 계절 폭 =====
// 적도는 사철 거의 같고, 중위도가 가장 크게 흔들리고, 극은 얼음에 눌려 다시 작다.
console.log('\n=== 4. 여름겨울 차이 (℃) ===');
const SW = [[0, 0, 2], [20, 1, 5], [40, 7, 13], [60, 4, 9], [80, 0, 3]];
console.log('  위도   최저    최고     폭    기대범위');
for(const [lat, lo, hi] of SW){
  const s = swing(lat), ok = s.range >= lo && s.range <= hi;
  if(ok) pass++; else fail++;
  console.log('  ' + (ok?'OK ':'X  ') + String(lat).padStart(3) + '°N ' +
    s.lo.toFixed(1).padStart(7) + s.hi.toFixed(1).padStart(8) +
    s.range.toFixed(1).padStart(7) + '    ' + lo + '~' + hi);
}
chk('중위도가 적도보다 크게 흔들린다', swing(40).range > swing(0).range);
chk('중위도가 극보다 크게 흔들린다',   swing(40).range > swing(80).range);
chk('남반구가 북반구보다 덜 흔들린다', swing(-40).range < swing(40).range,
    '남 ' + swing(-40).range.toFixed(1) + ' vs 북 ' + swing(40).range.toFixed(1));

// ===== 5. 계절이 태양보다 늦게 오는가 =====
// 하지는 6월 21일(연중 171일째)이지만, 가장 더운 물은 그보다 한두 달 뒤에 온다.
// 바다가 데워지는 데 시간이 걸리기 때문이다. 이 지연이 없으면 8월이 6월보다
// 시원해져서 항해 감각이 어긋난다.
function peakDay(lat){
  let best = -1, bv = -Infinity;
  for(let d = 0; d < 365; d++){ const v = T(lat, d); if(v > bv){ bv = v; best = d; } }
  return best;
}
console.log('\n=== 5. 가장 더운 날 ===');
const pN = peakDay(40), pS = peakDay(-40);
const SOLSTICE = 171;                       // 하지
const lag = pN - SOLSTICE;
console.log('  40°N 최고 수온: 연중 ' + pN + '일째 (하지 +' + lag + '일)');
console.log('  40°S 최고 수온: 연중 ' + pS + '일째');
chk('북반구 최고 수온이 하지보다 늦다', lag > 0, lag + '일');
chk('그 지연이 30~80일 사이다', lag >= 30 && lag <= 80);
const gap = Math.abs(pN - pS);
chk('남북 반구 계절이 반대다', near(Math.min(gap, 365-gap), 182.5, 15),
    (Math.min(gap, 365-gap)).toFixed(0) + '일 차이');

// ===== 6. 경계와 단조성 =====
console.log('\n=== 6. 경계 ===');
let mono = true;
for(let lat = 0; lat < 90; lat += 5) if(annual(lat+5) > annual(lat)) mono = false;
chk('적도에서 극으로 갈수록 식는다', mono);
// 어는점 걸림쇠는 "닿는가" 가 아니라 "뚫리지 않는가" 를 본다. 이 근사는 극에서
// 실제(-1.8℃)보다 조금 따뜻해 걸림쇠가 실제로 걸리는 일이 없다. 그래도 상수를
// 건드렸을 때 음수로 새는 것을 잡아내려면 전 범위를 훑어야 한다.
let gmin = Infinity, gmax = -Infinity;
for(let lat = -90; lat <= 90; lat += 2)
  for(let d = 0; d < 365; d += 5){
    const v = T(lat, d); if(v < gmin) gmin = v; if(v > gmax) gmax = v;
  }
chk('어디서도 어는점 아래로 새지 않는다', gmin >= -1.8 - 1e-9,
    '최저 ' + gmin.toFixed(2) + '℃');
chk('열대 최고가 상식 범위다', gmax > 26 && gmax < 32,
    '최고 ' + gmax.toFixed(2) + '℃');
console.log('  (참고) 극지 최저 ' + swing(90).lo.toFixed(2) +
            '℃ — 실제 북극해 -1.8℃ 보다 다소 따뜻하다. 해빙 미구현과 함께 남는 오차.');
chk('극을 넘는 y 도 터지지 않는다', isFinite(T(100, 0)) && isFinite(T(-100, 0)));
chk('경도는 결과를 바꾸지 않는다',
    T(35, 100) === vm.runInContext('seaTempC(' + yOf(35) + ')', box));

// ===== 7. 실제로 쓸 판정 — 눈이 오는 곳 =====
// 이 함수를 만든 이유가 비와 눈을 가르는 것이므로, 그 결과가 상식과 맞는지 본다.
console.log('\n=== 7. 0℃ 아래로 내려가는 위도 (눈이 되는 곳) ===');
for(const day of [0, 91, 182, 273]){
  let edge = 90;
  for(let lat = 0; lat <= 90; lat += 1) if(T(lat, day) < 0){ edge = lat; break; }
  const cal = ['1월 1일','4월 1일','7월 1일','10월 1일'][[0,91,182,273].indexOf(day)];
  console.log('  ' + cal + ' — 북위 ' + edge + '° 이상');
}
chk('한겨울에도 적도는 눈이 오지 않는다', T(0, 0) > 20);
chk('한겨울 고위도는 눈이 온다', T(75, 0) < 0);
chk('한여름 고위도는 눈이 오지 않는다', T(75, 200) > 0);

console.log('\n' + '='.repeat(46));
console.log('  통과 ' + pass + ' / 실패 ' + fail);
console.log('='.repeat(46) + '\n');
process.exit(fail ? 1 : 0);
