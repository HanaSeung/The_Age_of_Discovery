
// 소리 — 검증
// node verify_sound.js
//
// 소리는 귀로 듣는 것이라 그림보다도 자동 검증이 어렵다. 그래도 잴 수 있는
// 것은 잰다: 세기->음량 곡선과 천둥 파형은 순수 함수라 수치로 재고,
// 배선(패널·루프·번개와의 동기·눈은 무음)은 소스에서 확인한다.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(__dirname + '/world_chart.html', 'utf8');
let pass = 0, fail = 0;
function chk(name, ok, note){
  if(ok) pass++; else fail++;
  console.log((ok ? '  OK  ' : '  X   ') + name + (note ? '   ' + note : ''));
}

// ===== 1. 배선 =====
console.log('\n=== 1. 배선 ===');
for(const k of ['sndOn','sndVol','sndRainBright','sndWind','sndHowl',
                'sndWander','sndQ','sndThLow','sndThDur','sndThWob'])
  chk('P 에 ' + k + ' 가 있다', new RegExp('^\\s*' + k + '\\s*:', 'm').test(src));
chk('패널에 @소리 묶음이 있다', /\['@소리'\]/.test(src));
for(const lab of ['소리 크기','비 밝기','바람 세기','바람 높이','바람 요동',
                  '바람 공명','천둥 낮음','천둥 길이','천둥 요동'])
  chk('패널에 ' + lab + ' 칸이 있다', src.includes("'" + lab + "'"));
chk('SND 모듈이 있다', /const SND = \(function\(\)\{/.test(src));
chk('루프가 매 프레임 소리를 잰다', /SND\.step\(\);/.test(src));
chk('첫 클릭에서 깨어난다', /pointerdown', \(\) => SND\.wake\(\), \{ once:true \}/.test(src));
chk('첫 키에서도 깨어난다', /keydown',\s+\(\) => SND\.wake\(\), \{ once:true \}/.test(src));
chk('천둥은 번개의 씨앗으로 터진다', /SND\.thunder\(ltnSeed\)/.test(src));
chk('눈은 무음이다', /precipHere\.type === PRECIP_RAIN\) \? precipHere\.rate : 0/.test(src));
chk('소리 0 이면 천둥도 없다', /if\(!ac \|\| Math\.round\(P\.sndOn\) === 0\) return;/.test(src));
chk('바람 울음은 폭풍에 물린다', /const w = inStorm\(\) \? P\.sndWind : 0;/.test(src));

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
const lvFn = grabFn('sndRainLevel');
const twFn = grabFn('thunderWave');
chk('sndRainLevel 을 떼어냈다', !!lvFn);
chk('thunderWave 를 떼어냈다', !!twFn);
if(!lvFn || !twFn){ console.log('\n추출 실패로 중단.'); process.exit(1); }
const box = { Math, Float32Array };
vm.createContext(box);
vm.runInContext(lvFn + '\n' + twFn, box);
const L = r => vm.runInContext('sndRainLevel(' + r + ')', box);
const W = (seed, low, dur, wob) => vm.runInContext(
  'thunderWave(' + seed + ',' + low + ',' + dur + ',' + wob + ', 44100)', box);

// ===== 3. 세기 -> 음량 =====
console.log('\n=== 3. 빗소리 곡선 ===');
chk('안 오면 무음이다', L(0) === 0);
chk('세기 1 이면 절반 음량이다 (귀는 로그다)', Math.abs(L(1) - 0.5) < 1e-9);
let mono = true, prev = -1;
for(let r = 0; r <= 1.001; r += 0.1){ const v = L(r); if(v < prev) mono = false; prev = v; }
chk('셀수록 커지기만 한다', mono);
chk('범위를 벗어나도 터지지 않는다', L(-1) === 0 && Math.abs(L(2) - 0.5) < 1e-9);
chk('절반 세기는 절반보다 작다 (아래로 눌린 곡선)', L(0.5) < 0.25,
    L(0.5).toFixed(3));

// ===== 4. 천둥 파형 =====
console.log('\n=== 4. 천둥 ===');
const w1 = W(7, 170, 3.2, 0.55);
chk('길이가 맞다 (dur + 꼬리 0.3초)', w1.length === Math.floor(44100*3.5),
    w1.length + ' 표본');
let bad = 0, peak = 0;
for(const v of w1){ if(!isFinite(v)) bad++; const a = Math.abs(v); if(a > peak) peak = a; }
chk('비정상 표본이 없다', bad === 0, bad + '개');
chk('꼭짓점이 1 로 맞춰져 있다 (넘치지 않게)', Math.abs(peak - 1) < 1e-6,
    peak.toFixed(6));
const rms = (w, a, b) => {
  let s = 0; const i0 = Math.floor(44100*a), i1 = Math.floor(44100*b);
  for(let i = i0; i < i1; i++) s += w[i]*w[i];
  return Math.sqrt(s/(i1 - i0));
};
chk('우르릉이 사그라든다 (끝 0.4초 << 첫 0.4초)',
    rms(w1, 3.0, 3.4) < rms(w1, 0, 0.4)*0.2,
    rms(w1, 0, 0.4).toFixed(3) + ' -> ' + rms(w1, 3.0, 3.4).toFixed(4));
const w1b = W(7, 170, 3.2, 0.55);
let same = true;
for(let i = 0; i < w1.length; i += 997) if(w1[i] !== w1b[i]){ same = false; break; }
chk('같은 씨앗이면 같은 천둥이다', same);
const w2 = W(8, 170, 3.2, 0.55);
let diff = false;
for(let i = 0; i < Math.min(w1.length, w2.length); i += 997)
  if(w1[i] !== w2[i]){ diff = true; break; }
chk('씨앗이 다르면 다른 천둥이다', diff);
const wShort = W(3, 60, 1, 0);
chk('짧고 무거운 천둥도 멀쩡하다', wShort.length === Math.floor(44100*1.3) &&
    [...wShort.slice(0, 100)].every(isFinite));

console.log('\n' + '='.repeat(46));
console.log('  통과 ' + pass + ' / 실패 ' + fail);
console.log('='.repeat(46) + '\n');
process.exit(fail ? 1 : 0);
