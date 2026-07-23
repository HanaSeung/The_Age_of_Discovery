
// 비와 눈 — 강수 판정 검증 (2단계: 계산만, 화면 없음)
// node verify_precip.js
//
// 구현을 믿지 않는다. precipAt 을 실측 강수 자료와 함께 따로 실행해서,
// 나오는 분포가 지구의 다우대·건조대와 맞는지 본다.
const fs = require('fs');
const vm = require('vm');
const D   = __dirname + '/';
const src = fs.readFileSync(D + 'world_chart.html', 'utf8');
let pass = 0, fail = 0;
function chk(name, ok, note){
  if(ok) pass++; else fail++;
  console.log((ok ? '  OK  ' : '  X   ') + name + (note ? '   ' + note : ''));
}

// ===== 1. 배선 =====
console.log('\n=== 1. 배선 ===');
chk('precip_data.js 를 불러온다', /<script src="precip_data\.js"><\/script>/.test(src));
chk('PRECIP 모듈이 있다', /const PRECIP = \(function\(\)/.test(src));
chk('precipAt() 가 있다', /function precipAt\(wx, wy, out\)/.test(src));
chk('돌려 쓰는 precipHere 가 있다', /const precipHere = \{type:0, rate:0\}/.test(src));
for(const k of ['PRECIP_NONE','PRECIP_RAIN','PRECIP_SNOW','PRECIP_FULL','PRECIP_MIN','PRECIP_ST'])
  chk(k + ' 상수가 있다', src.includes(k));
chk('운량이 아니라 강수량에서 끌어온다',
    /PRECIP\.sample\(wx, wy, monthF\(\)\)/.test(src) &&
    !/const pct = CLOUD\.sample\(wx, wy, monthF\(\)\) \* 0\.01;/.test(src));
chk('airtemp_data.js 를 불러온다', /<script src="airtemp_data\.js"><\/script>/.test(src));
chk('AIRTEMP 모듈이 있다', /const AIRTEMP = \(function\(\)/.test(src));
chk('실측 기온으로 비와 눈을 가른다',
    /airTempC\(wx, wy\) < PRECIP_ST \? PRECIP_SNOW : PRECIP_RAIN/.test(src));
chk('기온 자료가 없으면 위도 근사로 물러선다',
    /AIRTEMP \? AIRTEMP\.sample\(wx, wy, monthF\(\)\) : seaTempC\(wy\)/.test(src));
chk('두 겹을 곱한다 (지역 x 현재)', /out\.rate = wet \* here/.test(src));
chk('구름이 없으면 비도 없다', /if\(here <= 0\) return out/.test(src));
chk('결과 객체를 새로 만들지 않는다', !/return \{\s*type/.test(src));

// ===== 2. 실측 강수 자료와 함께 따로 돌린다 =====
// precipAt 본체와 그것이 기대는 조각(강수 모듈, 수온)만 떼어내고,
// '지금 구름 밑인가'(cloudOpacityAt) 는 이 스크립트가 쥔다. 그 층은
// verify_cloudviz.js 가 이미 검사한다. 여기서 볼 것은 남은 한 겹이다.
//
// 함수를 정규식으로 떼어내면 한 줄짜리 함수에서 끝 중괄호가 어긋난다
// (wrapX 처럼 본문이 한 줄이면 \n} 가 다음 블록의 것을 집는다). 중괄호를 센다.
function grabFn(name){
  const head = src.indexOf('function ' + name + '(');
  if(head < 0){ console.log('  X   ' + name + ' 을 찾지 못했다'); fail++; return ''; }
  let i = src.indexOf('{', head), depth = 0;
  for(let k = i; k < src.length; k++){
    if(src[k] === '{') depth++;
    else if(src[k] === '}'){ depth--; if(depth === 0) return src.slice(head, k+1); }
  }
  console.log('  X   ' + name + ' 의 끝을 찾지 못했다'); fail++; return '';
}
const grab = (re, what) => {
  const m = src.match(re);
  if(!m){ console.log('  X   ' + what + ' 를 떼어내지 못했다'); fail++; return ''; }
  return m[0];
};
const precipMod = grab(/const PRECIP = \(function\(\)\{[\s\S]*?\n\}\)\(\);/, 'PRECIP 모듈');
const airMod    = grab(/const AIRTEMP = \(function\(\)\{[\s\S]*?\n\}\)\(\);/, 'AIRTEMP 모듈');
const seaFn     = grabFn('seaTempC');
const airFn     = grabFn('airTempC');
const seaC      = (src.match(/const\s+SEA_\w+\s*=\s*[^;]+;/g) || []).join('\n');
const wrapFn    = grabFn('wrapX');
const worldC    = grab(/const\s+WORLD_W\s*=[^;]+;/, '세계 크기');
const precipFn  = grabFn('precipAt');
const precipC   = (src.match(/const PRECIP_\w+[^;]*;/g) || []).join('\n');

console.log('\n=== 2. 코드 추출 ===');
chk('PRECIP 모듈을 떼어냈다', !!precipMod);
chk('AIRTEMP 모듈을 떼어냈다', !!airMod);
chk('precipAt 본문을 떼어냈다', !!precipFn);
chk('PRECIP 상수를 떼어냈다', precipC.length > 0);
if(!precipFn || !precipMod || !airMod){ console.log('\n추출 실패로 중단.'); process.exit(1); }

const box = { Math, console, atob: s => Buffer.from(s, 'base64').toString('binary'),
              window: {}, Uint8Array, gameDay: 0, HERE: 1,
              P: { precipTest: 0 } };
vm.createContext(box);
vm.runInContext(fs.readFileSync(D + 'precip_data.js', 'utf8'), box);
vm.runInContext(fs.readFileSync(D + 'airtemp_data.js', 'utf8'), box);
vm.runInContext([
  worldC, 'const DEG2PXY = WORLD_H/180;',
  wrapFn, seaC, seaFn, precipMod, airMod, precipC, airFn, precipFn,
  // 구름 층은 이 스크립트가 쥔다. HERE 를 바꿔가며 시험한다.
  'function cloudOpacityAt(wx, wy){ return HERE; }',
  'let MF = 0;',
  'function monthF(){ return MF; }',
  'const out = {type:0, rate:0};'
].join('\n'), box);
chk('precip_data.js 를 읽었다', !!vm.runInContext('!!window.PRECIP', box));
chk('airtemp_data.js 를 읽었다', !!vm.runInContext('!!window.AIRTEMP', box));

// 위도·경도·월(0=1월)로 부른다.
function P(lat, lon, month, here){
  box.HERE = (here === undefined) ? 1 : here;
  vm.runInContext('MF = ' + month + ';', box);
  box.gameDay = month*30.4 + 15;
  const y = vm.runInContext('(90-(' + lat + '))*DEG2PXY', box);
  const x = vm.runInContext('((' + lon + ')+180)/360*WORLD_W', box);
  vm.runInContext('precipAt(' + x + ',' + y + ', out)', box);
  return { type: vm.runInContext('out.type', box),
           rate: vm.runInContext('out.rate', box),
           mmd:  vm.runInContext('PRECIP.sample(' + x + ',' + y + ', MF)', box),
           degC: vm.runInContext('airTempC(' + x + ',' + y + ')', box) };
}
const NAME = ['없음','비','눈'];

// ===== 3. 다우대와 건조대 =====
// 7월 기준. 적도수렴대는 계절을 따라 남북으로 움직이므로 위도를 계절에 맞춰
// 골랐다 (앞선 판에서는 5°N 에서 재어 수렴대를 놓쳤다).
console.log('\n=== 3. 바다별 강수 (7월, 구름 밑이라고 두고) ===');
const SPOT = [
  ['적도수렴대 대서양',  8, -25, 'wet'],
  ['적도수렴대 태평양',  8, -140, 'wet'],
  ['벵골만 (남서몬순)', 15, 90, 'wet'],
  ['남극해',           -55, 0, 'wet'],
  ['페루 앞바다',      -20, -90, 'dry'],
  ['나미비아 앞바다',   -22, 5, 'dry'],
  ['남대서양 고압대',   -25, -10, 'dry'],
  ['말위도 (카나리아)',  25, -30, 'dry'],
];
const bucket = {wet:[], dry:[]};
console.log('  ' + '바다'.padEnd(20) + '위도  경도   mm/일    세기   종류');
for(const [nm, lat, lon, kind] of SPOT){
  const r = P(lat, lon, 6);
  bucket[kind].push(r.rate);
  console.log('  ' + nm.padEnd(20) + String(lat).padStart(4) + String(lon).padStart(6) +
    r.mmd.toFixed(2).padStart(8) + r.rate.toFixed(3).padStart(8) + '   ' + NAME[r.type]);
}
const wetMin = Math.min(...bucket.wet), dryMax = Math.max(...bucket.dry);
chk('가장 마른 다우대가 가장 젖은 건조대보다 젖어 있다', wetMin > dryMax,
    '다우 최소 ' + wetMin.toFixed(3) + ' > 건조 최대 ' + dryMax.toFixed(3));
chk('건조대에서는 비가 거의 오지 않는다', dryMax < 0.15, dryMax.toFixed(3));
chk('다우대에서는 비가 뚜렷하다', wetMin > 0.15, wetMin.toFixed(3));

// 이 한 줄이 이번 판을 다시 만든 이유다. 운량으로 재던 때는 뒤집혀 있었다.
const peru = P(-20, -90, 6).rate, itcz = P(8, -25, 6).rate;
chk('페루 앞바다가 적도수렴대보다 메마르다', peru < itcz,
    '페루 ' + peru.toFixed(3) + ' < 수렴대 ' + itcz.toFixed(3));

// ===== 4. 계절이 움직이는가 =====
console.log('\n=== 4. 계절 (mm/일) ===');
const SEASON = [
  ['벵골만 몬순',     15, 90,  0, 6, 'summer'],
  ['아라비아해 몬순', 15, 60,  0, 6, 'summer'],
  ['북대서양 폭풍대', 55, -25, 0, 6, 'winter'],
];
for(const [nm, lat, lon, m1, m2, when] of SEASON){
  const a = P(lat, lon, m1).mmd, b = P(lat, lon, m2).mmd;
  const ok = (when === 'summer') ? b > a*2 : a > b*2;
  console.log('  ' + nm.padEnd(16) + '1월 ' + a.toFixed(2).padStart(6) +
              '   7월 ' + b.toFixed(2).padStart(6));
  chk(nm + ' 은 ' + (when === 'summer' ? '여름' : '겨울') + '에 젖는다', ok,
      (when === 'summer' ? (b/Math.max(a,0.01)) : (a/Math.max(b,0.01))).toFixed(1) + '배');
}

// ===== 5. 비인가 눈인가 =====
console.log('\n=== 5. 비와 눈 ===');
const CASES = [
  ['적도 한겨울',       0, -25, 0, 1],
  ['북대서양 겨울',    55, -25, 0, 1],
  ['그린란드해 겨울',  72, -5,  0, 2],
  ['그린란드해 여름',  72, -5,  6, 1],
  ['남극해 겨울',     -65, 0,   6, 2],
  ['남극해 여름',     -55, 0,   0, 1],
];
for(const [nm, lat, lon, mo, want] of CASES){
  const r = P(lat, lon, mo);
  chk(nm + ' 은 ' + NAME[want], r.type === want,
      NAME[r.type] + ' (' + r.degC.toFixed(1) + '도, ' +
      r.mmd.toFixed(2) + 'mm/일, 세기 ' + r.rate.toFixed(2) + ')');
}

// ===== 5-2. 위도만으로는 나올 수 없는 것 =====
// 같은 위도의 동서 차이. 만류가 데우는 노르웨이해와 한류가 얼리는 래브라도해가
// 갈라져야 한다. 앞선 판의 위도 근사는 이 둘을 같은 온도로 주었다.
console.log('\n=== 5-2. 같은 위도, 다른 바다 (1월) ===');
const nor = P(62, 2, 0), lab = P(60, -55, 0);
console.log('  노르웨이해 62N     ' + nor.degC.toFixed(1).padStart(6) + '도  ' + NAME[nor.type]);
console.log('  래브라도해 60N     ' + lab.degC.toFixed(1).padStart(6) + '도  ' + NAME[lab.type]);
chk('노르웨이해가 래브라도해보다 따뜻하다', nor.degC > lab.degC + 3,
    (nor.degC - lab.degC).toFixed(1) + '도 차이');
chk('만류 쪽은 비, 한류 쪽은 눈', nor.type === 1 && lab.type === 2);

// ===== 6. 두 겹이 정말 곱해지는가 =====
console.log('\n=== 6. 구름 층과의 곱 ===');
const full = P(8, -25, 6, 1), half = P(8, -25, 6, 0.5), none = P(8, -25, 6, 0);
console.log('  구름 1.0 -> ' + full.rate.toFixed(3) +
            ' | 0.5 -> ' + half.rate.toFixed(3) +
            ' | 0.0 -> ' + none.rate.toFixed(3));
chk('구름이 없으면 비도 없다', none.rate === 0 && none.type === 0);
chk('구름 절반이면 세기도 절반이다', Math.abs(half.rate - full.rate/2) < 1e-9);

// ===== 7. 값의 범위 =====
console.log('\n=== 7. 범위 ===');
let lo = Infinity, hi = -Infinity, bad = 0, wetCells = 0, total = 0;
for(let mo = 0; mo < 12; mo += 3)
  for(let lat = -80; lat <= 80; lat += 10)
    for(let lon = -180; lon < 180; lon += 15){
      const r = P(lat, lon, mo);
      total++;
      if(r.rate < lo) lo = r.rate;
      if(r.rate > hi) hi = r.rate;
      if(!isFinite(r.rate) || r.rate < 0 || r.rate > 1) bad++;
      if(r.rate > 0.5) wetCells++;
      if(r.rate > 0 && r.type === 0) bad++;      // 세기가 있는데 종류가 없다
      if(r.rate === 0 && r.type !== 0) bad++;    // 종류가 있는데 세기가 없다
    }
chk('0~1 을 벗어나지 않는다', bad === 0,
    '최저 ' + lo.toFixed(3) + ' 최고 ' + hi.toFixed(3) + ', 어긋남 ' + bad + '건');
console.log('  표본 ' + total + '칸 중 세기 0.5 이상 ' + wetCells + '칸 (' +
            (wetCells/total*100).toFixed(1) + '%)');
chk('온 세상이 비는 아니다', wetCells/total < 0.35);
chk('비 오는 곳이 아예 없지는 않다', wetCells > 0);
chk('상한 1 에 닿는 곳이 있다', hi > 0.85, hi.toFixed(3));

// ===== 8. 시험 손잡이 (precipTest) =====
// 실측을 제쳐 두고 강제로 내리게 하는 손잡이. 구름이 없어도, 지구에서 가장
// 메마른 바다에서도 내려야 시험 단추 노릇을 한다.
console.log('\n=== 8. 시험 손잡이 ===');
chk('P 에 precipTest 가 있다', /precipTest\s*:\s*0/.test(src));
chk('패널에 기상 시험 칸이 있다', /'precipTest','기상 시험'/.test(src));
box.P.precipTest = 1;
const tR = P(-20, -90, 6, 0);          // 페루 앞바다, 구름 0 — 최악의 조건
chk('시험 1 이면 맨하늘 건조대에도 비가 온다', tR.type === 1 && tR.rate === 1,
    NAME[tR.type] + ' 세기 ' + tR.rate);
box.P.precipTest = 2;
const tS = P(-20, -90, 6, 0);
chk('시험 2 면 눈이 온다', tS.type === 2 && tS.rate === 1);
box.P.precipTest = 3;
const tH = P(-20, -90, 6, 0);
chk('시험 3(폭우)도 판정은 비다', tH.type === 1 && tH.rate === 1,
    '몸집 차이는 그리기(precipVeil) 쪽 검사');
box.P.precipTest = 0;
const tOff = P(-20, -90, 6, 0);
chk('시험을 끄면 실측으로 돌아온다', tOff.type === 0 && tOff.rate === 0);

console.log('\n' + '='.repeat(46));
console.log('  통과 ' + pass + ' / 실패 ' + fail);
console.log('='.repeat(46) + '\n');
process.exit(fail ? 1 : 0);
