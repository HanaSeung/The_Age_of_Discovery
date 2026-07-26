// verify_storm.js — 폭풍 본체(STORMS·stormAt·inStorm)가 옳게 도는가.
// 생성이 강수량을 따르는가 / 세기가 가장자리에서 부드러운가 / 일생을 도는가 /
// 배에서 멀어지면 지워지는가 / 시험 3 이 강제 폭풍인가.
'use strict';
const RELOC_ROOT = require('path').join(__dirname, '..'); // 프로젝트 루트
const fs = require('fs'), vm = require('vm');
let pass = 0, fail = 0;
function chk(name, ok, note){ (ok?pass++:fail++); console.log('  '+(ok?'OK  ':'FAIL')+'   '+name+(note?'  '+note:'')); }
function near(a,b,e){ return Math.abs(a-b) <= (e===undefined?1e-6:e); }

const src = fs.readFileSync(RELOC_ROOT+'/world_chart.html', 'utf8');
function grabFn(name){
  const head = src.indexOf('function ' + name + '(');
  if(head < 0) return '';
  let i = src.indexOf('{', head), depth = 0;
  for(let k=i;k<src.length;k++){ if(src[k]==='{')depth++; else if(src[k]==='}'){depth--; if(depth===0) return src.slice(head,k+1);} }
  return '';
}
function grab(re){ const m = src.match(re); return m ? m[0] : ''; }

console.log('=== 1. 배선 ===');
chk('STORMS 시스템이 있다', /const STORMS = \(function\(\)/.test(src));
chk('stormAt() 가 있다', /function stormAt\(\)/.test(src));
chk('inStorm 이 stormAt 을 본다', /return stormAt\(\) > 0/.test(src));
chk('darknessNow 가 inStorm 을 본다', /inStorm\(\) \? 1 :/.test(src));
chk('폭우 표현(heavy)이 inStorm 을 본다', /const heavy = inStorm\(\);/.test(src));
chk('precipAt 이 폭풍 비를 보장한다', /out\.rate = Math\.max\(out\.rate, sa\)/.test(src));
chk('루프가 매 프레임 STORMS.step 을 부른다', /STORMS\.step\(dt\)/.test(src));
chk('시험 3 은 강제 폭풍', /Math\.round\(P\.precipTest\) === 3\) return 1/.test(src));

// ===== 떼어내 돌린다 =====
// STORMS 는 여러 전역(WORLD_W, KM_PER_PX, ship, zoom, W/H, WIND, PRECIP, isLand,
// sstep, wrapX, Y_TOP/BOT, monthF, TIMEK, P)을 본다. 검증에 필요한 만큼만 가짜로 세운다.
const consts = [
  grab(/const WORLD_W = \d+, WORLD_H = \d+;/),
  grab(/const KM_PER_PX = [^;]+;/),
  (src.match(/const STORM_\w+\s*=\s*[^;\n]+;/g) || []).join('\n').replace(/const /g,'var '),
  'var Y_TOP = 0, Y_BOT = WORLD_H;',
  'var TIMEK = 1;'
].join('\n');

const box = {
  Math, console,
  WIND: null, PRECIP: null,          // 바람·강수 없음 → 이동 0, 생성 확률은 아래서 조절
  ship: { x: 4000, y: 2000 }, zoom: 1, W: 800, H: 600,
  LANDSET: new Set(),                // 육지로 칠 좌표(여기선 안 씀)
  WETVAL: 5,                          // PRECIP.sample 대체값
  RND: 0.0,                           // Math.random 대체 — 아래서 갈아끼운다
};
// 가짜 전역들
vm.createContext(box);
vm.runInContext(consts, box);
vm.runInContext([
  'function wrapX(x){ return ((x%WORLD_W)+WORLD_W)%WORLD_W; }',
  'function sstep(a,b,x){ var t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); }',
  'function isLand(x,y){ return false; }',              // 다 바다
  'function monthF(){ return 0; }',
  'var P = { precipTest: 0, windGain: 1 };',
  // PRECIP.sample 을 WETVAL 로 대신 — 생성 확률 시험용
  'var PRECIP = { sample: function(){ return WETVAL; } };',
  // Math.random 을 RND 로 못박아 생성/자리 고르기를 결정적으로
  'var __rnd = 0; Math.random = function(){ return RND; };',
  grabFn('lifeAmp') || '',
  grab(/const STORMS = \(function\(\)[\s\S]*?\n\}\)\(\);/),
  grabFn('stormAt'),
  grabFn('inStorm')
].join('\n'), box);

chk('STORMS 를 떼어냈다', vm.runInContext('typeof STORMS === "object" && typeof STORMS.at === "function"', box));

// ===== 2. 세기 번짐 (at) — 폭풍 하나를 직접 꽂아 거리별 세기를 본다 =====
console.log('\n=== 2. 세기 번짐 ===');
// list 에 성숙한 폭풍(나이 = 수명 절반, 세기 1) 하나를 꽂는다
vm.runInContext('STORMS.list.length = 0; STORMS.list.push({cx:4000, cy:2000, age:3, life:6});', box);
const Rpx = vm.runInContext('STORM_R_PX', box);
function at(dx){ box.ship.x = 4000 + dx; box.ship.y = 2000; return vm.runInContext('STORMS.at(ship.x, ship.y)', box); }
chk('중심은 세기 1', near(at(0), 1, 1e-3), at(0).toFixed(3));
chk('반경 밖은 0', at(Rpx*1.01) === 0);
chk('가장자리 안쪽은 0~1 사이', (v=>v>0&&v<1)(at(Rpx*0.85)), at(Rpx*0.85).toFixed(3));
chk('중심에 가까울수록 세다', at(Rpx*0.2) > at(Rpx*0.7));
box.ship.x = 4000; box.ship.y = 2000;

// ===== 3. 일생 (lifeAmp 를 at 로 간접 확인) =====
console.log('\n=== 3. 일생 ===');
function ampAtAge(age){ vm.runInContext('STORMS.list.length=0; STORMS.list.push({cx:4000,cy:2000,age:'+age+',life:6});', box); return vm.runInContext('STORMS.at(4000,2000)', box); }
chk('갓 생긴 폭풍은 약하다 (age 0.1)', ampAtAge(0.1) < 0.6, ampAtAge(0.1).toFixed(2));
chk('한창때는 세기 1 (age 3)', near(ampAtAge(3), 1, 1e-3));
chk('사그라들 때 약하다 (age 5.9)', ampAtAge(5.9) < 0.6, ampAtAge(5.9).toFixed(2));
chk('수명 넘으면 0 (age 6+)', ampAtAge(6.1) === 0);

// ===== 4. 생성이 강수량을 따르는가 =====
console.log('\n=== 4. 생성 ===');
// step 을 부르되 Math.random 을 조절해 생성 분기를 탄다.
// 생성 조건: list.length<MAX && random < SPAWN*gd  →  spawn()
// spawn: pickSpot(육지 아님이므로 성공) → random > (wet/WET_REF) 면 취소
function trySpawn(rnd, wet){
  box.RND = rnd; box.WETVAL = wet;
  vm.runInContext('STORMS.list.length = 0;', box);
  vm.runInContext('STORMS.step(1);', box);   // dt=1, TIMEK=1 → gd=1
  return vm.runInContext('STORMS.list.length', box);
}
// wet 높고 rnd 낮으면 생긴다
chk('비 잦고 주사위 낮으면 생긴다', trySpawn(0.0, 10) === 1);
// rnd 가 SPAWN*gd 보다 크면 아예 생성 시도 안 함
const SPAWN = vm.runInContext('STORM_SPAWN', box);
chk('주사위가 생성 문턱보다 크면 안 생긴다', trySpawn(Math.min(0.99, SPAWN+0.3), 10) === 0);
// 메마른 바다(wet 낮음)면 spawn 안에서 취소 — rnd 가 wet/ref 보다 크게
box.RND = 0.0;  // step 진입은 통과시키되
// wet/ref = 0.1/6 ≈ 0.017. rnd 0.0 이면 통과라 생긴다. rnd 를 취소구간에 두려면
// step 의 첫 random(<SPAWN*gd)과 spawn 의 둘째 random(>p)이 같은 값이라
// 하나의 rnd 로 둘을 다 만족시키긴 어렵다 — 대신 wet=0 이면 p=0 이라 어떤 rnd>0 도 취소.
chk('완전히 메마르면(wet 0) 안 생긴다', trySpawn(0.0001, 0) === 0);

// ===== 5. 배에서 멀어지면 지워진다 =====
console.log('\n=== 5. 컬링 ===');
box.RND = 0.99;  // 생성 안 되게(step 첫 분기 막음)
vm.runInContext('STORMS.list.length=0; STORMS.list.push({cx:4000,cy:2000,age:3,life:6});', box);
// 배를 아주 멀리 옮기고 step — WIND 없어 폭풍은 안 움직이므로 거리만으로 컬
box.ship.x = 4000 + vm.runInContext('STORM_R_PX', box) * 5; box.ship.y = 2000;
vm.runInContext('STORMS.step(0.01);', box);
chk('배에서 멀면 폭풍이 지워진다', vm.runInContext('STORMS.list.length', box) === 0);
box.ship.x = 4000;

// ===== 6. 시험 3 강제 폭풍 =====
console.log('\n=== 6. 시험 손잡이 ===');
vm.runInContext('STORMS.list.length = 0;', box);   // 자연 폭풍 없음
vm.runInContext('P.precipTest = 3;', box);
chk('시험 3 이면 폭풍 없어도 stormAt=1', vm.runInContext('stormAt()', box) === 1);
chk('시험 3 이면 inStorm 참', vm.runInContext('inStorm()', box) === true);
vm.runInContext('P.precipTest = 0;', box);
chk('시험 끄면 자연 폭풍 없을 때 stormAt=0', vm.runInContext('stormAt()', box) === 0);

console.log('\n' + (fail?'FAIL':'전부 통과') + ' — 통과 ' + pass + ' 실패 ' + fail);
process.exit(fail?1:0);
