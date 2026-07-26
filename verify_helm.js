// verify_helm.js — 조타(돛 단수 · 가감속 · 선회) 검증
//
// 2026.07.27 전면 개정. 옛 파일은 셋이 썩어 있었다:
//   1. 원본 경로가 'D:\MyApp\...' 로 박혀 있어 C 드라이브 기계에서 통째로 터졌다
//   2. <script>\n"use strict" 를 찾는데 원본은 CRLF 라 \n 하나로는 못 잡는다
//   3. 물리 상수(SPEED·ACC_UP…)를 제 안에 베껴 두어, 원본이 바뀌어도 모른 채
//      옛 숫자로 시뮬레이션을 돌리고 있었다
// 이제 상수는 모두 원본에서 뽑아 쓰고, 뽑는 자리가 사라지면 그 자체로 실패한다.
// 또한 옛 파일은 chk() 도 집계도 없이 console.log 만 찍는 '보고서' 였다.
// 다른 검증들과 같은 꼴로 맞춘다.
"use strict";
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'world_chart.html'), 'utf8');
let pass = 0, fail = 0;
function chk(n, c, note){
  if(c){ pass++; console.log('  OK   ' + n + (note ? '  ' + note : '')); }
  else  { fail++; console.log('  FAIL ' + n + (note ? '  ' + note : '')); }
}
// 원본에서 숫자 하나를 뽑는다. 못 찾으면 NaN 이 되어 뒤의 검사가 줄줄이 실패한다 —
// 조용히 옛 값으로 넘어가는 것보다 시끄럽게 터지는 편이 낫다.
function num(re, what){
  const m = src.match(re);
  if(!m){ chk('원본에서 ' + what + ' 를 찾았다', false, '정규식이 안 맞는다'); return NaN; }
  return +m[1];
}

console.log('\n=== 1. 원본에서 제원을 뽑는다 (베끼지 않는다) ===');
const KN_TO_PX   = num(/const KN_TO_PX\s*=\s*\(?([\d.]+)/, 'KN_TO_PX');
const speedKn    = num(/spec\s*:\s*\{\s*speedKn:([\d.]+)/, 'speedKn');
const sailMax    = num(/speedKn:[\d.]+,\s*sailMax:(\d+)/, 'sailMax');
const turnDeg    = num(/sailMax:\d+,\s*turnDeg:([\d.]+)/, 'turnDeg');
const turnIdle   = num(/turnDeg:[\d.]+,\s*turnIdle:([\d.]+)/, 'turnIdle');
const accUpSec   = num(/turnIdle:[\d.]+,\s*accUp:([\d.]+)/, 'accUp');
const accDnSec   = num(/accUp:[\d.]+,\s*accDn:([\d.]+)/, 'accDn');
chk('배 제원을 모두 찾았다',
    [speedKn, sailMax, turnDeg, turnIdle, accUpSec, accDnSec].every(Number.isFinite),
    `${speedKn}kn · 돛 ${sailMax}단 · 선회 ${turnDeg}°/일 · 정지선회율 ${turnIdle}`);
chk('상수를 이 파일에 베껴 두지 않았다',
    !/const\s+(SPEED|ACC_UP|ACC_DN|TURN_FULL|TURN_IDLE)\s*=\s*[\d.]/.test(
      fs.readFileSync(__filename, 'utf8')));

console.log('\n=== 2. 파생 공식이 그대로인가 (syncDerived) ===');
// 아래 시뮬레이션이 이 공식들을 그대로 쓴다. 원본이 바뀌면 여기서 먼저 걸린다.
chk('SPEED = 속력(kn) × KN_TO_PX', /SPEED\s*=\s*s\.speedKn \* KN_TO_PX/.test(src));
chk('ACC_UP = SPEED / accUp',      /ACC_UP\s*=\s*SPEED \/ s\.accUp/.test(src));
chk('ACC_DN = SPEED / accDn',      /ACC_DN\s*=\s*SPEED \/ s\.accDn/.test(src));
chk('TURN_FULL = turnDeg 를 라디안으로', /TURN_FULL\s*=\s*s\.turnDeg \* Math\.PI\/180/.test(src));
chk('TURN_IDLE = turnIdle 그대로', /TURN_IDLE\s*=\s*s\.turnIdle/.test(src));
chk('배를 바꾸면 돛 단수를 다시 맞춘다',
    /if\(ship && ship\.sail > SAIL_MAX\) ship\.sail = SAIL_MAX/.test(src));

console.log('\n=== 3. 조타 코드의 모양 ===');
chk('돛은 단수로 올리고 내린다',
    /ship\.sail = Math\.min\(SAIL_MAX, ship\.sail\+1\)/.test(src) &&
    /ship\.sail = Math\.max\(0, ship\.sail-1\)/.test(src));
chk('자동반복을 막는다 — 키를 누르고 있어도 한 단만 오른다', /if\(!e\.repeat\)/.test(src));
chk('목표 속력 = 돛 단수 비율 × 바람 효율',
    /const target = SPEED \* \(ship\.sail\/SAIL_MAX\) \* sailEff/.test(src));
chk('가속은 목표를 넘지 않는다', /Math\.min\(target, ship\.speed \+ ACC_UP\*dt\)/.test(src));
chk('감속은 목표 아래로 내려가지 않는다', /Math\.max\(target, ship\.speed - ACC_DN\*dt\)/.test(src));
chk('후진이 없다', /if\(ship\.speed < 0\) ship\.speed = 0/.test(src));
chk('선회율이 속력을 따른다',
    /const rf = TURN_IDLE \+ \(1-TURN_IDLE\)\*Math\.min\(1, ship\.speed\/SPEED\)/.test(src));
chk('A/D 로 좌우 회전', /keys\['a'\]\|\|keys\['arrowleft'\]\)\s*turn -= 1/.test(src) &&
    /keys\['d'\]\|\|keys\['arrowright'\]\) turn \+= 1/.test(src));
chk('회전은 선회율을 거쳐 침로에 더한다',
    /ship\.head \+= turn \* TURN_FULL \* rf \* dt/.test(src));
chk('침로대로 나아간다 — 속도에서 침로를 거꾸로 뽑지 않는다',
    /ship\.vx = Math\.cos\(ship\.head\)\*ship\.speed/.test(src) &&
    !/ship\.head = Math\.atan2\(ship\.vy,ship\.vx\)/.test(src));
chk('강제 속력은 계산을 끊고 결과만 덮는다 — 표시값은 살아 있다',
    /if\(P\.shipForce > 0\) ship\.speed = P\.shipForce \/ PX_TO_KN/.test(src));

// ── 원본 공식을 그대로 옮긴 시뮬레이션 ──────────────────────
// 값은 1절에서 뽑은 것만 쓴다. 바람 효율(sailEff)은 1.0(순풍 만재)으로 두어
// 조타만 따로 본다 — 돛과 바람의 관계는 verify_windsail.js 가 맡는다.
const SPEED = speedKn * KN_TO_PX;
const ACC_UP = SPEED / accUpSec, ACC_DN = SPEED / accDnSec;
const TURN_FULL = turnDeg * Math.PI/180;
function sim(sail, secs, turning, v0){
  let speed = v0 === undefined ? 0 : v0, head = 0;
  const dt = 1/60;
  for(let t = 0; t < secs; t += dt){
    const target = SPEED * (sail/sailMax);
    if(speed < target) speed = Math.min(target, speed + ACC_UP*dt);
    else               speed = Math.max(target, speed - ACC_DN*dt);
    if(speed < 0) speed = 0;
    const rf = turnIdle + (1-turnIdle)*Math.min(1, speed/SPEED);
    if(turning) head += TURN_FULL*rf*dt;
  }
  return { speed, deg: head*180/Math.PI };
}

console.log('\n=== 4. 돛 단수별 도달 속력 ===');
const reach = [];
for(let s = 0; s <= sailMax; s++) reach.push(sim(s, 30, false).speed);
for(let s = 0; s <= sailMax; s++)
  console.log(`   돛 ${s}/${sailMax} → ${reach[s].toFixed(0).padStart(4)} px/일` +
              `  (${(reach[s]/KN_TO_PX).toFixed(1).padStart(4)} kn)`);
chk('돛 0 이면 멈춘다', reach[0] === 0);
chk('돛을 올릴수록 빨라진다', reach.every((v,i) => i === 0 || v > reach[i-1]));
chk('만재에서 제원 속력에 이른다', Math.abs(reach[sailMax] - SPEED) < 1e-6,
    `${(reach[sailMax]/KN_TO_PX).toFixed(1)} kn = 제원 ${speedKn} kn`);
chk('단수가 고르게 나뉜다', Math.abs(reach[1]*sailMax - reach[sailMax]) < 1e-6);

console.log('\n=== 5. 가속은 느리고 감속은 빠르다 ===');
const upSec = accUpSec, dnSec = accDnSec;
console.log(`   정지→전속 ${upSec.toFixed(1)}일 / 전속→정지 ${dnSec.toFixed(1)}일`);
chk('감속이 가속보다 빠르다 — 돛을 내리면 곧 선다', ACC_DN > ACC_UP,
    `${dnSec}일 < ${upSec}일`);
chk('둘의 차이가 뚜렷하다', ACC_DN/ACC_UP >= 1.5, (ACC_DN/ACC_UP).toFixed(1) + '배');
// 전속에서 돛을 내리면 실제로 서는지 — 감속 시간만큼 돌려 본다
chk('전속에서 돛을 내리면 선다', sim(0, dnSec + 0.1, false, SPEED).speed === 0);

console.log('\n=== 6. 선회 — 속력이 있어야 돈다 ===');
// 각 단수의 '정상 속력'에서 출발해 잰다. 0 에서 출발하면 가속하는 동안의
// 느린 선회가 섞여 제원과 안 맞는다 — 여기서 보려는 것은 도달 상태의 선회율이다.
const half = Math.floor(sailMax/2);
const t0 = sim(0, 10, true, 0).deg,
      t2 = sim(half, 10, true, SPEED*half/sailMax).deg,
      t4 = sim(sailMax, 10, true, SPEED).deg;
console.log(`   정지(돛0) ${(t0/10).toFixed(1).padStart(5)}°/일` +
            `   돛${half}/${sailMax} ${(t2/10).toFixed(1).padStart(5)}°/일` +
            `   전속 ${(t4/10).toFixed(1).padStart(5)}°/일`);
chk('멈춘 배는 거의 안 돈다', t0 < t4*0.3, `전속의 ${(t0/t4*100).toFixed(0)}%`);
chk('빠를수록 잘 돈다', t0 < t2 && t2 < t4);
chk('정지 선회율이 0 은 아니다 — 조금은 돌 수 있다', t0 > 0, `정지선회율 ${turnIdle}`);
chk('전속 선회가 제원에 이른다', Math.abs(t4/10 - turnDeg) < 0.5,
    `${(t4/10).toFixed(1)}°/일 = 제원 ${turnDeg}°/일`);
chk('정지 선회가 제원의 turnIdle 배다', Math.abs(t0/t4 - turnIdle) < 0.01,
    `${(t0/t4).toFixed(3)} = ${turnIdle}`);

console.log(`\n${fail === 0 ? '전부 통과' : '실패 있음'} — 통과 ${pass}, 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);
