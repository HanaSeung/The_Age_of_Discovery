
// 시야 통합 — 검증 (4단계)
// node verify_sight.js
//
// 구현을 믿지 않는다. updateSight 를 떼어내 입력(밤·구름·비)을 이 스크립트가
// 쥐고 돌려서, 곱이 맞는지·바닥이 지켜지는지·손잡이가 듣는지를 잰다.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(__dirname + '/world_chart.html', 'utf8');
const lines = src.split(/\r?\n/);
let pass = 0, fail = 0;
function chk(name, ok, note){
  if(ok) pass++; else fail++;
  console.log((ok ? '  OK  ' : '  X   ') + name + (note ? '   ' + note : ''));
}
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-9);

// ===== 1. 배선 =====
console.log('\n=== 1. 배선 ===');
chk('updateSight() 가 있다', /function updateSight\(\)/.test(src));
chk('skyClearAt() 가 있다', /function skyClearAt\(wx, wy\)/.test(src));
chk('sightNow 그릇이 있다', /const sightNow = \{ factor:1/.test(src));
chk('SIGHT_MIN 바닥이 있다', /const SIGHT_MIN = /.test(src));
for(const k of ['visNight','visCloud','visRain']){
  chk('P 에 ' + k + ' 이 있다', new RegExp('^\\s*' + k + '\\s*:', 'm').test(src));
  chk('패널에 ' + k + ' 칸이 있다', new RegExp("\\['" + k + "',").test(src));
}
chk('그리기 루프가 매 프레임 잰다', /updateSight\(\);/.test(src));
chk('일시정지 중에도 잰다 — 호출이 paused 블록 밖에 있다', (function(){
  const i = lines.findIndex(l => l.includes('updateSight();'));
  // 호출 앞줄이 paused 블록을 닫는 } 여야 한다
  return i > 0 && lines[i-1].trim() === '}';
})());
chk('패널 감시범위가 실효값을 보인다', /row\('감시범위', R\(sightNow\.km\)/.test(src));
chk('별 관측이 같은 하늘을 본다 (skyClearAt)',
    /night \* skyClearAt\(ship\.x, ship\.y\) \* P\.starGain/.test(src));
chk('별 쪽의 옛 인라인 계산이 사라졌다',
    !/night \* \(1 - Math\.min\(1, cloudOpacityAt/.test(src));
chk('시야도 같은 하늘을 본다', /const cloud = 1 - skyClearAt\(ship\.x, ship\.y\)/.test(src));
chk('내리는 동안은 하늘이 닫힌다 (skyClearAt=0)', /if\(p\.rate > 0\) return 0;/.test(src));

// ===== 2. 떼어내 돌린다 =====
console.log('\n=== 2. 코드 추출 ===');
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
const upFn  = grabFn('updateSight');
const skyFn = grabFn('skyClearAt');
const minC  = (src.match(/const SIGHT_MIN = [^;]+;/) || [''])[0];
const nowC  = (src.match(/const sightNow = \{[^;]+;/) || [''])[0];
chk('updateSight 본문을 떼어냈다', !!upFn);
chk('skyClearAt 본문을 떼어냈다', !!skyFn);
chk('SIGHT_MIN 을 떼어냈다', !!minC);
if(!upFn || !skyFn){ console.log('\n추출 실패로 중단.'); process.exit(1); }

// 입력 셋(밤·구름·비)은 이 스크립트가 쥔다. 실제 자료 쪽은 verify_precip 과
// verify_cloudviz 가 이미 검사하므로, 여기서 볼 것은 셋을 엮는 셈뿐이다.
const box = { Math, DARK: 0, CLOUD: 0, RAIN: 0,
              SHIP: { spec: { sight: 20 } },
              ship: { x: 0, y: 0 },
              P: { visNight: 0.85, visCloud: 0.35, visRain: 0.50 },
              precipHere: { type: 0, rate: 0 } };
vm.createContext(box);
vm.runInContext([
  'function darkness(a){ return DARK; }',
  'function sunAlt(x, y){ return 0; }',
  'function cloudOpacityAt(x, y){ return CLOUD; }',
  'function precipAt(x, y, out){ out.rate = RAIN; out.type = RAIN > 0 ? 1 : 0; return out; }',
  minC, skyFn, nowC, upFn
].join('\n'), box);

function S(dark, cloud, rain, sight, p){
  box.DARK = dark; box.CLOUD = cloud; box.RAIN = rain;
  box.SHIP.spec.sight = (sight === undefined) ? 20 : sight;
  if(p) Object.assign(box.P, p);
  vm.runInContext('updateSight()', box);
  const r = vm.runInContext('({f: sightNow.factor, km: sightNow.km})', box);
  box.P.visNight = 0.85; box.P.visCloud = 0.35; box.P.visRain = 0.50;
  return r;
}

// ===== 2-2. 하늘이 닫히는가 =====
// 별 관측이 쓰는 바로 그 함수. 내리기 시작하면 구름 틈이 얼마든 0 이 된다 —
// "눈 오는 밤 별하늘" 은 없다.
console.log('\n=== 2-2. 하늘 ===');
box.CLOUD = 0.3; box.RAIN = 0;
chk('맑은 하늘은 구름만큼만 닫힌다',
    near(vm.runInContext('skyClearAt(0,0)', box), 0.7));
box.RAIN = 0.6;
chk('내리는 동안은 완전히 닫힌다 — 별 전멸',
    vm.runInContext('skyClearAt(0,0)', box) === 0);
box.CLOUD = 0; box.RAIN = 0;

// ===== 3. 곱이 맞는가 =====
console.log('\n=== 3. 셈 ===');
const day = S(0, 0, 0);
chk('맑은 대낮이면 안 깎는다', near(day.f, 1) && near(day.km, 20),
    day.km.toFixed(1) + ' km');
const nite = S(1, 0, 0);
chk('완전한 밤 홀로 = 15%', near(nite.f, 0.15), (nite.f*100).toFixed(1) + '%');
const cld = S(0, 1, 0);
chk('짙은 구름 홀로 = 65%', near(cld.f, 0.65), (cld.f*100).toFixed(1) + '%');
// 비가 오면 하늘은 덮인 것으로 친다(skyClearAt=0) — 구름 몫이 저절로 가득
// 찬다. 그래서 '비 홀로' 는 이제 없다. 비 = 비 + 짙은 구름이다.
const rn = S(0, 0, 1);
chk('세찬 비 = 비 50% × 구름 65% = 32.5%', near(rn.f, 0.65*0.50),
    (rn.f*100).toFixed(1) + '%');
const all = S(1, 1, 1);
chk('셋이 겹치면 곱이다 (0.15×0.65×0.50)', near(all.f, 0.15*0.65*0.50),
    (all.f*100).toFixed(2) + '% → ' + all.km.toFixed(2) + ' km');
const half = S(0.5, 0.5, 0.5);
chk('반쯤 오는 비도 하늘은 통째로 닫는다',
    near(half.f, (1-0.425)*(1-0.35)*(1-0.25)), (half.f*100).toFixed(1) + '%');

// ===== 4. 바닥 =====
console.log('\n=== 4. 바닥 ===');
const low = S(1, 1, 1, 2);              // 감시 2km 짜리 작은 배
chk('아무리 캄캄해도 0.5km 아래로는 안 간다', near(low.km, 0.5),
    '2km × ' + (low.f*100).toFixed(1) + '% = ' + (2*low.f).toFixed(2) +
    ' → 바닥 ' + low.km);
const ok20 = S(1, 1, 1, 20);
chk('바닥에 안 걸리면 곱 그대로다', near(ok20.km, 20*ok20.f), ok20.km.toFixed(2) + ' km');

// ===== 5. 손잡이가 듣는가 =====
console.log('\n=== 5. 손잡이 ===');
const off = S(1, 1, 1, 20, { visNight: 0, visCloud: 0, visRain: 0 });
chk('셋 다 0 으로 내리면 안 깎는다', near(off.f, 1), (off.f*100).toFixed(0) + '%');
const nOnly = S(1, 1, 1, 20, { visNight: 1, visCloud: 0, visRain: 0 });
chk('밤 1.0 이면 밤만으로 시야가 사라진다', near(nOnly.f, 0));
const over = S(1, 0, 0, 20, { visNight: 5 });
chk('손잡이가 1 을 넘어도 음수 시야는 안 나온다', over.f >= 0 && over.km >= 0.5,
    'visNight 5 → ' + (over.f*100).toFixed(0) + '%');

// ===== 6. 단조성 =====
// 어두울수록·흐릴수록·궂을수록 시야는 줄기만 해야 한다.
console.log('\n=== 6. 단조성 ===');
let mono = true;
for(const which of [0, 1, 2]){
  let prev = Infinity;
  for(let v = 0; v <= 1.001; v += 0.1){
    const r = S(which===0?v:0, which===1?v:0, which===2?v:0);
    if(r.f > prev + 1e-12) mono = false;
    prev = r.f;
  }
}
chk('밤·구름·비 어느 쪽이 짙어져도 시야는 줄기만 한다', mono);
let cross = true, prev = Infinity;
for(let v = 0; v <= 1.001; v += 0.1){
  const r = S(v, v, v);
  if(r.f > prev + 1e-12) cross = false;
  prev = r.f;
}
chk('셋이 함께 짙어져도 마찬가지다', cross);

console.log('\n' + '='.repeat(46));
console.log('  통과 ' + pass + ' / 실패 ' + fail);
console.log('='.repeat(46) + '\n');
process.exit(fail ? 1 : 0);
