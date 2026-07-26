// verify_windsail.js — 바람 통합 및 돛 물리 검증
// 실행: node verify_windsail.js
//
// [2026.07.27 전면 개정] 이 파일은 세 겹으로 썩어 있었다.
//   1. polar() 이 SHIP.spec 을 보게 바뀌었는데 P 만 넘겨 주어 첫 호출에서 터졌다
//   2. windMin/windFull 을 제 안에 베껴 두었다 — 그것도 실제와 다른 값(1.5/10, 실제 0.5/9)으로.
//      즉 없는 세계를 검사하며 통과하고 있었다. 검증이 거짓말을 하고 있던 셈이다
//   3. 걷어낸 HUD 판의 글자를 아직 찾고 있었다
// 이제 제원·세계값·손잡이표를 모두 _specsrc.js 로 원본에서 뽑아 쓴다.
// 뽑는 자리가 사라지면 그 자체로 실패하므로, 값이 어긋난 채 통과할 방법이 없다.
"use strict";
const RELOC_ROOT = require('path').join(__dirname, '..'); // 프로젝트 루트
const fs = require('fs'), path = require('path');
const S = require('./_specsrc.js');
const src = S.read();
let pass = 0, fail = 0;
function chk(n, c, note) {
  if (c) { pass++; console.log('  OK   ' + n + (note ? '  ' + note : '')); }
  else { fail++; console.log('  FAIL ' + n + (note ? '  ' + note : '')); }
}

console.log('\n=== 1. 배선 ===');
chk('data/wind_data.js 로드', /<script src="data\/wind_data\.js"><\/script>/.test(src));
chk('data/wind_data.js 존재', fs.existsSync(path.join(RELOC_ROOT, 'data/wind_data.js')));
chk('WIND 샘플러 정의', /const WIND = \(function\(\)\{/.test(src));
chk('월 보간 (12개월)', /const m0 = Math\.floor\(monthF\)%NMW, m1=\(m0\+1\)%NMW/.test(src));
chk('달력 존재', /function calendar\(\)/.test(src) && /let gameDay = 0/.test(src));
chk('게임일 누적', /gameDay \+= dt \* TIMEK/.test(src));
chk('극곡선 polar()', /function polar\(deg\)/.test(src));
chk('풍력 windPower()', /function windPower\(ms\)/.test(src));

console.log('\n=== 2. Shift 순풍 제거 ===');
chk('물리에서 boost 제거', !/keys\['shift'\]\?P\.boost:1/.test(src));
chk('추진력이 sailEff 로 결정', /const target = SPEED \* \(ship\.sail\/SAIL_MAX\) \* sailEff/.test(src));
chk('안내문에서 Shift 삭제', !/Shift<\/kbd> 순풍/.test(src));
chk('패널에서 순풍 슬라이더 삭제', !/'순풍\(Shift\)'/.test(src));

console.log('\n=== 3. 표시 ===');
// (2026.07.26 나침반이 원형 계기 DIAL 로 합쳐졌다. 주석 글자 대신 동작을 본다 —
//  주석을 다듬을 때마다 남의 검증이 깨지는 것이 이 파일의 옛 약점이었다.)
chk('원형 계기 — 역풍 사각 부채꼴', /SHIP\.spec\.nogoDeg\*Math\.PI\/180/.test(src) &&
    /rgba\(200,60,40,\.16\)/.test(src));
chk('원형 계기 — 바람 바늘', /wFrom = Math\.atan2\(-windVec\.y, -windVec\.x\)/.test(src));
chk('원형 계기 — 해류 바늘', /Math\.atan2\(curVec\.y, curVec\.x\)/.test(src));
chk('바람 화살표', /function drawWindArrows\(\)/.test(src));
chk('B 키 토글', /if\(k==='b'\) show\.wind=!show\.wind/.test(src));
chk('그리기 순서에 포함', /CURVIZ\.draw\(\);\s*\n\s*drawWindArrows\(\);/.test(src));
// 옛 좌상단 HUD 판은 걷어냈다. 날짜는 위쪽 띠(verify_ship §5-3)가, 바람은
// 원형 계기(verify_compass §8)가 맡는다. verify_ui 의 '옛 HUD 판의 잔재가 없다'와
// 같은 방식으로 뒤집어 둔다 — 저쪽은 판을, 여기는 거기 찍히던 글자를 지킨다.
chk('HUD 날짜 글자의 잔재가 없다', !/항해 '\+Math\.floor\(gameDay\)\+'일차/.test(src));
chk('HUD 바람 글자의 잔재가 없다', !/windTxt\+'<br>'/.test(src));

console.log('\n=== 4. 패널 ===');
// 배 능력치는 's:' 접두어가 붙는다 (P 에서 SHIP 으로 옮기며 생긴 규칙).
// 접두어 없이 찾던 옛 검사는 손잡이가 멀쩡히 있는데도 못 찾고 있었다.
const table = S.specTable(src);
for (const k of ['s:nogoDeg', 'windMin', 'windFull'])
  chk('슬라이더 ' + k, new RegExp("\\['" + k.replace(':', ':') + "'").test(table));
chk('복사에 바람 값이 든다',
    /'windMin    : '\+P\.windMin/.test(src) && /'windFull   : '\+P\.windFull/.test(src));
chk('복사에 역풍 사각이 든다 — 이제 배 제원 쪽이다',
    /nogoDeg:'\+sp\.nogoDeg/.test(src));

console.log('\n=== 5. 문법 ===');
try { new Function(src.split('<script>').pop().split('</script>')[0]); chk('script 파싱', true); }
catch (e) { chk('script 파싱', false, '→ ' + e.message); }

console.log('\n=== 6. 극곡선·풍력 동작 (원본에서 뽑아 실제 실행) ===');
// 제원과 세계값을 원본에서 뽑는다. 베껴 두지 않으므로 원본이 바뀌면 여기도 함께 움직인다.
const SPEC = S.shipSpec(src);
const P = S.worldP(src);
const SHIP = { spec: SPEC };
const polar = S.lift(src, 'polar', SHIP, P);
const windPower = S.lift(src, 'windPower', SHIP, P);
const NOGO = SPEC.nogoDeg, WMIN = P.windMin, WFULL = P.windFull;
console.log(`   제원 nogoDeg ${NOGO}°  |  세계 windMin ${WMIN} · windFull ${WFULL} m/s`);
chk('상수를 이 파일에 베껴 두지 않았다',
    !/nogoDeg\s*:\s*\d/.test(fs.readFileSync(__filename, 'utf8').split('=== 6.')[1] || ''),
    '원본에서 뽑아 쓴다');

console.log('   각도 | 추진효율   (0=정면역풍, 180=정후풍)');
console.log('  ------+---------');
for (const a of [0, 30, NOGO, NOGO + 5, 60, 90, 120, 135, 160, 180])
  console.log('  ' + String(a).padStart(5) + ' | ' + (polar(a) * 100).toFixed(0).padStart(5) + '%');

chk('역풍 사각 안은 0%', polar(0) === 0 && polar(NOGO / 2) === 0 && polar(NOGO) === 0,
    `0 ~ ${NOGO}°`);
chk('사각 바로 밖은 전진 가능', polar(NOGO + 5) > 0.1, `${NOGO + 5}° = ${(polar(NOGO+5)*100).toFixed(0)}%`);
chk('횡풍(90도)이 최대', polar(90) >= polar(60) && polar(90) >= polar(135));
chk('정후풍이 횡풍보다 느림', polar(180) < polar(90), `${(polar(180)*100).toFixed(0)}% < 100%`);
chk('사각과 횡풍 사이가 단조 증가', polar(NOGO + 20) < polar(NOGO + 30) && polar(75) < polar(90));

console.log('\n   풍속 | 추진배수');
console.log('  ------+---------');
for (const w of [0, WMIN, WMIN + 1, (WMIN + WFULL) / 2, WFULL, WFULL + 5])
  console.log('  ' + w.toFixed(1).padStart(4) + '  | ' + (windPower(w) * 100).toFixed(0).padStart(5) + '%');
chk('무풍 기준 이하는 0%', windPower(0) === 0 && windPower(WMIN) === 0, `≤ ${WMIN} m/s`);
chk('최대 풍속 이상은 100%', windPower(WFULL) === 1 && windPower(WFULL + 5) === 1, `≥ ${WFULL} m/s`);
chk('중간값이 절반', Math.abs(windPower((WMIN + WFULL) / 2) - 0.5) < 0.01,
    `${((WMIN + WFULL) / 2).toFixed(2)} m/s = 50%`);
chk('무풍과 최대 사이가 뒤집히지 않았다', WMIN < WFULL, `${WMIN} < ${WFULL}`);

console.log('\n=== 7. 실제 항해 시나리오 (데이터 + 극곡선 결합) ===');
// data/wind_data.js 를 직접 읽어 특정 지점/월에서 침로별 실효 속력을 계산
const wsrc = fs.readFileSync(path.join(RELOC_ROOT, 'data/wind_data.js'), 'utf8');
const NX = 90, NY = 45, NM = 12, QS = 0.2;
const buf = Buffer.from(wsrc.match(/data:\s*"([^"]+)"/)[1], 'base64');
const N = NX * NY;
function s8(b) { return b > 127 ? b - 256 : b; }
function wind(m, lat, lon) {
  const j = Math.max(0, Math.min(NY - 1, Math.floor((90 - lat) / 4)));
  const i = Math.max(0, Math.min(NX - 1, Math.floor((((lon + 180) % 360)) / 4)));
  const k = j * NX + i;
  return { u: s8(buf[m * N + k]) * QS, v: s8(buf[NM * N + m * N + k]) * QS };
}
const DIRS = ['N','NE','E','SE','S','SW','W','NW'];
// 침로(0=북, 시계방향)로 갈 때 실효 속력 비율
function eff(m, lat, lon, courseDeg) {
  const w = wind(m, lat, lon);
  const ms = Math.hypot(w.u, w.v);
  // 바람이 불어가는 방향(수학각, 화면좌표: y남쪽+)
  const wa = Math.atan2(-w.v, w.u);
  const head = (courseDeg - 90) * Math.PI / 180;   // 침로 0(북) -> head=-90도
  let d = Math.abs(((head - wa + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const off = 180 - d * 180 / Math.PI;
  return { ms, eff: polar(off) * windPower(ms), off };
}
function row(label, m, lat, lon) {
  const w = wind(m, lat, lon);
  // 바람이 '불어오는' 방향 = -u, -v (두 성분 모두 부호 반전)
  const from = DIRS[Math.round((((Math.atan2(-w.u, -w.v) * 180 / Math.PI) + 360) % 360) / 45) % 8];
  const cells = [0, 45, 90, 135, 180, 225, 270, 315]
    .map(c => (eff(m, lat, lon, c).eff * 100).toFixed(0).padStart(4));
  console.log('  ' + label.padEnd(24) + from.padStart(3) + '풍 ' +
    Math.hypot(w.u, w.v).toFixed(1).padStart(4) + ' | ' + cells.join(' '));
  return cells.map(Number);
}
console.log('  지점 / 월                  바람     |   북   NE    동   SE    남   SW    서   NW');
console.log('  ' + '-'.repeat(74));
const r1 = row('대서양 15N 40W · 1월', 0, 15, -40);
const r2 = row('아라비아해 12N 65E · 1월', 0, 12, 65);
const r3 = row('아라비아해 12N 65E · 7월', 6, 12, 65);
const r4 = row('남빙양 45S 20E · 1월', 0, -45, 20);

// 주의: 실효 속력에는 풍속 배수(windPower)가 곱해지므로 절대 %로 기준을 잡으면 안 된다.
//       실제 풍속이 6 m/s면 정후풍이라도 상한이 그만큼 눌린다. 방향 간 '상대 비교'가 옳다.
chk('무역풍대에서 동진 불가', r1[2] === 0, '동쪽 침로 0%');
chk('무역풍대에서 서진 가능', r1[6] > 30 && r1[6] > r1[2], `서 ${r1[6]}% > 동 ${r1[2]}%`);
chk('계절풍 1월: 남서진 가능 / 7월 불가', r2[5] > 25 && r3[5] === 0,
  `1월 SW ${r2[5]}% / 7월 SW ${r3[5]}%`);
chk('계절풍 7월: 북동진 가능 / 1월 불가', r3[1] > 25 && r2[1] === 0,
  `1월 NE ${r2[1]}% / 7월 NE ${r3[1]}%`);
chk('편서풍대에서 동진이 서진보다 유리', r4[2] > 25 && r4[2] > r4[6],
  `동 ${r4[2]}% > 서 ${r4[6]}%`);
chk('편서풍대에서 서진 불가', r4[6] === 0, `서쪽 ${r4[6]}%`);
chk('계절풍 방향 역전이 항로를 뒤집음',
  (r2[5] > r3[5]) && (r3[1] > r2[1]),
  '1월엔 남서로, 7월엔 북동으로');

console.log('\n=== 결과 ===');
console.log('  통과 ' + pass + ' / 실패 ' + fail + '  (총 ' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
