// verify_zoom.js — 배율 확장 + 조정 패널 검증
// 실행: node verify_zoom.js
"use strict";
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'world_chart.html'), 'utf8');

let pass = 0, fail = 0;
function chk(name, cond, note) {
  if (cond) { pass++; console.log('  OK   ' + name + (note ? '  ' + note : '')); }
  else { fail++; console.log('  FAIL ' + name + (note ? '  ' + note : '')); }
}
function grab(re, label) {
  const m = src.match(re);
  if (!m) { fail++; console.log('  FAIL ' + label + ' — 패턴 없음'); return null; }
  return m;
}

console.log('\n=== 1. 배율 상수 ===');
const mZmax = grab(/const ZMAX=(\d+)/, 'ZMAX');
const mLim = grab(/const ZDATA_LIMIT=(\d+)/, 'ZDATA_LIMIT');
const ZMAX = mZmax ? +mZmax[1] : 0;
const ZDATA_LIMIT = mLim ? +mLim[1] : 0;
chk('ZMAX = 100', ZMAX === 100, '(원래 13)');
chk('ZDATA_LIMIT = 13', ZDATA_LIMIT === 13);

console.log('\n=== 2. 파라미터 객체 ===');
const KEYS = ['speedKn','hoursPerSec','turnDeg','accUp','accDn',
              'turnIdle','boost','sailMax','shipScale','curGain'];
for (const k of KEYS) chk('P.' + k, new RegExp(k + '\\s*:').test(src));
chk('P0 초기값 보존', /const P0 = Object\.assign\(\{\}, P\)/.test(src));
chk('syncDerived 정의', /function syncDerived\(\)/.test(src));
chk('파생값 let 선언', /let SPEED, SAIL_MAX, ACC_UP, ACC_DN, TURN_FULL, TURN_IDLE, TIMEK/.test(src));
chk('돛 단수 축소 시 클램프', /if\(ship && ship\.sail > SAIL_MAX\)/.test(src));

console.log('\n=== 3. 이름 충돌 (CURVIZ 파티클 배열) ===');
const curvizBody = src.split('const CURVIZ = (function(){')[1].split('return {step, draw};')[0];
chk('파티클 배열이 PT 로 개명', /const PT = \[\];/.test(curvizBody));
chk('CURVIZ 안 const P = [] 없음', !/const P = \[\]/.test(curvizBody));
chk('CURVIZ 안 for(const p of P) 없음', !/for\(const p of P\)\{/.test(curvizBody));
chk('CURVIZ 안 P.push 없음', !/[^T]\.push\(p\)/.test(curvizBody));
chk('CURVIZ 가 전역 P.curGain 참조', /P\.curGain/.test(curvizBody));

console.log('\n=== 4. 시계(TIMEK) 적용 지점 ===');
chk('TIMEK 정의 = hoursPerSec/24', /TIMEK\s*=\s*P\.hoursPerSec \/ 24/.test(src));
chk('배 이동에 gdt 적용', /const gdt = dt \* TIMEK;/.test(src));
chk('배 x 이동', /let nx = ship\.x \+ \(ship\.vx \+ curVec\.x\)\*gdt/.test(src));
chk('배 y 이동', /let ny = ship\.y \+ \(ship\.vy \+ curVec\.y\)\*gdt/.test(src));
chk('해류 파티클에도 적용', /const gdt = dt\*TIMEK\*P\.curGain/.test(src));
chk('가속은 실시간 유지(dt)', /ship\.speed \+ ACC_UP\*dt/.test(src));
chk('선회도 실시간 유지(dt)', /TURN_FULL \* rf \* dt/.test(src));
chk('해류 배율 적용', /curVec\.x\*=P\.curGain/.test(src));
// Shift 순풍은 바람 구현으로 폐기됨 — 물리에 남아 있으면 오히려 오류
chk('구 Shift 순풍이 물리에서 제거됨', !/keys\['shift'\]\?P\.boost:1/.test(src));

console.log('\n=== 5. 입력 안전장치 ===');
chk('패널 입력 중 조타 키 차단', /t==='INPUT'\|\|t==='SELECT'\|\|t==='TEXTAREA'/.test(src));
chk('P 키 패널 토글', /if\(k==='p'\)\{ const t=document\.getElementById\('tune'\)/.test(src));
chk('L 키 배율 고정', /if\(k==='l'\)\{ zoomLock=!zoomLock/.test(src));
chk('안내문에 P 표기', /<kbd>P<\/kbd> 조정패널/.test(src));

console.log('\n=== 6. 패널 기능 ===');
chk('패널 DOM 존재', /<div id="tune"><\/div>/.test(src));
chk('슬라이더 스펙 배열', /const SPEC = \[/.test(src));
chk('자동 저장(localStorage)', /localStorage\.setItem\(LS/.test(src));
chk('복원(load)', /localStorage\.getItem\(LS\)/.test(src));
chk('값 복사 버튼', /id="tCopy"/.test(src) && /navigator\.clipboard/.test(src));
chk('되돌리기 버튼', /id="tReset"/.test(src) && /Object\.assign\(P, P0\)/.test(src));
chk('초기값 병기', /P0\[key\]/.test(src));
chk('배 크기가 P 참조', /const s=P\.shipScale;/.test(src));
chk('선체길이 동적 함수', /function shipLenPx\(\)\{ return 29\*P\.shipScale; \}/.test(src));
chk('루프에서 패널 갱신', /TUNE\.refresh\(\)/.test(src));

console.log('\n=== 7. 문법 검사 (script 블록 전체) ===');
const body = src.split('<script>').pop().split('</script>')[0];
try { new Function(body); chk('script 블록 파싱', true); }
catch (e) { chk('script 블록 파싱', false, '→ ' + e.message); }

console.log('\n=== 8. 시계 배속별 항해 시간 (전속 8kn 기준) ===');
const WORLD_W = 8192, KM_PER_PX = 40075 / WORLD_W;
const SCREEN_W = 1920;
function calc(kn, hoursPerSec, zoom) {
  const KN_TO_PX = (1.852 * 24) / KM_PER_PX;   // 기준: 1일/초
  const SPEED = kn * KN_TO_PX;
  const TIMEK = hoursPerSec / 24;
  const atlDays = (6000 / KM_PER_PX) / SPEED;
  return {
    atlDays,
    atlSec: atlDays / TIMEK,
    crossSec: (SCREEN_W / zoom) / (SPEED * TIMEK),
    worldDays: WORLD_W / SPEED
  };
}
function t(s) {
  if (s < 60) return s.toFixed(1) + '초';
  if (s < 3600) return Math.floor(s / 60) + '분' + Math.round(s % 60) + '초';
  return (s / 3600).toFixed(1) + '시간';
}
console.log('  시계(1초=) | 화면횡단@×100 | 대서양 실시간 | 대서양 게임일 | 적도일주 실시간');
console.log('  -----------+---------------+---------------+---------------+----------------');
for (const h of [24, 12, 6, 3, 1]) {
  const r = calc(8, h, 100);
  console.log('  ' + (h + '시간').padStart(10) + ' | ' + t(r.crossSec).padStart(13) +
    ' | ' + t(r.atlSec).padStart(13) + ' | ' + (r.atlDays.toFixed(0) + '일').padStart(13) +
    ' | ' + t(r.worldDays / (h / 24)).padStart(14));
}
console.log('\n  ※ 게임 내 기간(대서양 14일)은 시계를 바꿔도 변하지 않는다.');
console.log('    바뀌는 것은 그 14일을 지켜보는 실시간뿐이다.');

console.log('\n=== 9. 속력별 비교 (시계 6시간/초, 배율 ×100) ===');
console.log('   속력 | 화면횡단 | 대서양 실시간 | 대서양 게임일');
console.log('  ------+----------+---------------+---------------');
for (const kn of [3, 4, 5, 8, 12]) {
  const r = calc(kn, 6, 100);
  console.log('  ' + (kn + 'kn').padStart(5) + ' | ' + t(r.crossSec).padStart(8) +
    ' | ' + t(r.atlSec).padStart(13) + ' | ' + (r.atlDays.toFixed(0) + '일').padStart(13));
}

console.log('\n=== 결과 ===');
console.log('  통과 ' + pass + ' / 실패 ' + fail + '  (총 ' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
