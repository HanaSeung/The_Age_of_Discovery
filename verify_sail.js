// verify_sail.js — 돛의 배치·펴는 순서·크기 검증
"use strict";
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'world_chart.html'), 'utf8');
let pass = 0, fail = 0;
const chk = (n, c, note) => { c ? (pass++, console.log('  OK   ' + n + (note ? '  ' + note : '')))
                                : (fail++, console.log('  FAIL ' + n + (note ? '  ' + note : ''))); };

console.log('\n=== 1. 구조 ===');
chk('순서 함수 존재', /function sailRank\(n\)/.test(src));
chk('모든 자리를 훑고 rank 로 거름', /for\(let i=SAIL_MAX-1;i>=0;i--\)/.test(src) &&
    /if\(rank\[i\] >= ship\.sail\) continue;/.test(src));
chk('간격이 최대단수와 무관하게 고정', /const SAIL_GAP  = 3\.4\*s;/.test(src) &&
    !/\(MAST_FORE-MAST_AFT\)\/\(SAIL_MAX-1\)/.test(src));
chk('돛 무리를 선체 중앙에 정렬', /const mx = SAIL_MID \+ \(mid - i\)\*SAIL_GAP;/.test(src));
chk('폭이 중앙 기준 대칭', /hw = 8\.4\*s\*\(1 - 0\.18\*Math\.abs\(i-mid\)\/SAIL_REF\)/.test(src));
chk('깊이가 간격에 묶임', /const dep  = Math\.min\(SAIL_GAP, 4\.8\*s\)/.test(src));
chk('부풀기만 효율 참조', /const bulge = \(-0\.16 \+ 1\.16\*eff\) \* dep \* 0\.6/.test(src));
chk('옛 뱃머리부터 채우기 제거', !/for\(let i=ship\.sail-1;i>=0;i--\)/.test(src));

// ── 코드에서 sailRank 를 그대로 꺼내 실행 ──
const sailRank = new Function(
  src.match(/const SAIL_RANK_CACHE = \{\};[\s\S]*?return \(SAIL_RANK_CACHE\[n\] = rank\);\s*\}/)[0] +
  '; return sailRank;')();

console.log('\n=== 2. 펴는 순서 ===');
function orderOf(n) {                       // rank -> 1-based 자리 번호 순서
  const r = sailRank(n), o = new Array(n);
  r.forEach((k, pos) => { o[k] = pos + 1; });
  return o;
}
for (const n of [2, 3, 4, 5, 6]) console.log(`   ${n}단: ` + orderOf(n).join(', '));
chk('6단 순서가 3,4,2,5,1,6', orderOf(6).join(',') === '3,4,2,5,1,6', orderOf(6).join(','));
chk('5단 순서가 3,4,2,5,1', orderOf(5).join(',') === '3,4,2,5,1', orderOf(5).join(','));
chk('4단 순서가 2,3,1,4', orderOf(4).join(',') === '2,3,1,4', orderOf(4).join(','));
chk('3단 순서가 2,3,1', orderOf(3).join(',') === '2,3,1', orderOf(3).join(','));

// 순서의 성질 — 어떤 단수에서도 성립해야 한다
let bad = [];
for (let n = 1; n <= 8; n++) {
  const r = sailRank(n), o = orderOf(n);
  if (new Set(r).size !== n) bad.push(`${n}단 중복`);
  if (o.some(v => v === undefined)) bad.push(`${n}단 빠짐`);
  if (o[0] !== Math.floor((n + 1) / 2)) bad.push(`${n}단 시작이 주돛 아님`);
  // 펼친 자리가 항상 연속 구간이어야 한다 (중간에 구멍이 뚫리면 안 됨)
  for (let k = 1; k <= n; k++) {
    const set = r.map((v, i) => v < k ? i : -1).filter(i => i >= 0);
    for (let j = 1; j < set.length; j++) if (set[j] !== set[j - 1] + 1) bad.push(`${n}단 ${k}장에서 구멍`);
  }
}
chk('1~8단 모두 성질 만족', bad.length === 0, bad.join(', ') || '중복·누락·구멍 없음');

console.log('\n=== 3. 자리 좌표 — 최대단수가 바뀌어도 가운데 칸은 그대로 ===');
const s = 1.15, GAP = 3.4 * s, MID = 1.0 * s, REF = 2.5;
function geom(SMAX, sail, eff) {
  const dep = Math.min(GAP, 4.8 * s);
  const bulge = (-0.16 + 1.16 * eff) * dep * 0.6;
  const mid = (SMAX - 1) / 2;
  const r = sailRank(SMAX), out = [];
  for (let i = 0; i < SMAX; i++) {
    if (r[i] >= sail) continue;
    const mx = MID + (mid - i) * GAP;
    const hw = 8.4 * s * (1 - 0.18 * Math.abs(i - mid) / REF);
    let minX = mx;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const c = mx - dep * 0.5 - bulge;
      minX = Math.min(minX, (1 - t) ** 2 * mx + 2 * (1 - t) * t * c + t * t * (mx - dep));
    }
    out.push({ i, order: r[i] + 1, mx, hw, minX, gap: GAP, dep });
  }
  return out;
}
// 참 조건은 '6단 격자와 일치'가 아니다. 짝수 단수는 칸과 칸 사이가 중심이고
// 홀수 단수는 칸 하나가 중심이므로, 둘을 같은 격자에 올릴 수는 없다.
// 실제로 지켜야 할 성질은 두 가지뿐이다 — 간격이 일정하고, 중심이 선체 중앙일 것.
const SLOT6 = geom(6, 6, 1).map(o => o.mx);
console.log('   6단 기준 칸: ' + SLOT6.map(v => v.toFixed(1)).join(', '));
console.log('   최대단수 | 돛 좌표                          | 중심   | 간격');
let badGrid = [];
for (const SMAX of [2, 3, 4, 5, 6]) {
  const g = geom(SMAX, SMAX, 1).sort((a, b) => a.i - b.i);
  const xs = g.map(o => o.mx);
  const center = (xs[0] + xs[xs.length - 1]) / 2;
  const gaps = xs.slice(1).map((v, k) => xs[k] - v);
  const evenGap = gaps.every(v => Math.abs(v - GAP) < 1e-9);
  if (Math.abs(center - MID) > 1e-9) badGrid.push(`${SMAX}단 중심 ${center.toFixed(2)}`);
  if (!evenGap) badGrid.push(`${SMAX}단 간격 불균등`);
  console.log(`      ${SMAX}    | ${xs.map(v => v.toFixed(1).padStart(5)).join(' ').padEnd(32)} | ${center.toFixed(2).padStart(5)} | ${gaps[0] ? gaps[0].toFixed(2) : '-'}`);
}
chk('모든 최대단수가 중앙 정렬 + 등간격', badGrid.length === 0, badGrid.join(', ') || '2~6단 통과');
// 짝수 단수는 6단 격자와 정확히 겹쳐야 한다 (2단 = 3·4번, 4단 = 2·3·4·5번)
const slotOf = o => SLOT6.findIndex(v => Math.abs(v - o.mx) < 1e-6) + 1;
chk('2단이면 3·4번 칸', geom(2, 2, 1).map(slotOf).join(',') === '3,4');
chk('4단이면 2·3·4·5번 칸', geom(4, 4, 1).map(slotOf).join(',') === '2,3,4,5');
chk('홀수 단수는 반칸 어긋남(정상)', Math.abs(geom(3, 3, 1)[1].mx - MID) < 1e-9,
  `3단 가운데 돛이 선체 중앙 ${MID.toFixed(2)}`);
chk('돛 무리가 선체 중앙 대칭', Math.abs((SLOT6[0] + SLOT6[5]) / 2 - MID) < 1e-9,
  `중심 ${((SLOT6[0]+SLOT6[5])/2).toFixed(2)}`);

console.log('\n=== 4. 단수를 올릴 때 화면 변화 (6단 기준) ===');
console.log('   올린단수 | 펼쳐진 자리');
for (let n = 1; n <= 6; n++)
  console.log(`      ${n}/6   | ` + geom(6, n, 1).map(o => o.i + 1).join(', '));
chk('1장이면 3번 자리만', geom(6, 1, 1).map(o => o.i + 1).join(',') === '3');
chk('2장이면 3,4번', geom(6, 2, 1).map(o => o.i + 1).join(',') === '3,4');
chk('3장이면 2,3,4번', geom(6, 3, 1).map(o => o.i + 1).join(',') === '2,3,4');
chk('가운데부터 바깥으로 퍼짐', geom(6, 4, 1).map(o => o.i + 1).join(',') === '2,3,4,5');

console.log('\n=== 5. 크기가 바람과 무관한지 ===');
let varies = [];
for (const SMAX of [4, 6]) for (let n = 1; n <= SMAX; n++) {
  const a = geom(SMAX, n, 0), b = geom(SMAX, n, 1);
  for (let i = 0; i < a.length; i++)
    if (Math.abs(a[i].mx - b[i].mx) > 1e-9 || Math.abs(a[i].hw - b[i].hw) > 1e-9)
      varies.push(`${SMAX}단 ${n}장`);
}
chk('효율이 변해도 위치·폭 동일', varies.length === 0, varies.join(',') || '위치와 활대 길이 불변');
const b0 = geom(6, 1, 0)[0].minX, b1 = geom(6, 1, 1)[0].minX;
chk('부풀기만 달라짐', b1 < b0, `역풍 ${b0.toFixed(2)} → 순풍 ${b1.toFixed(2)}`);

console.log('\n=== 6. 겹침 ===');
console.log('   최대단수 | 간격 | 깊이 | 뒷자락 여유');
let overlap = [];
for (const SMAX of [2, 3, 4, 5, 6]) {
  const g = geom(SMAX, SMAX, 1).sort((a, b) => a.i - b.i);
  let worst = Infinity;
  for (let i = 0; i < g.length - 1; i++) worst = Math.min(worst, g[i].minX - g[i + 1].mx);
  const lim = -g[0].gap * 0.05;
  console.log(`      ${SMAX}    | ${g[0].gap.toFixed(2).padStart(5)} | ${g[0].dep.toFixed(2).padStart(4)} | ${worst.toFixed(2).padStart(6)}`);
  if (worst < lim) overlap.push(`${SMAX}단(${worst.toFixed(2)})`);
}
chk('어떤 단수에서도 뭉치지 않음', overlap.length === 0, overlap.join(', ') || '2~6단 통과');

console.log('\n=== 7. 선체 대비 ===');
let hullHalf = 0;
for (let t = 0; t <= 1.0001; t += 0.002)
  hullHalf = Math.max(hullHalf, 2 * (1 - t) * t * 7 * s + t * t * 5 * s);
const g6 = geom(6, 6, 1).sort((a, b) => a.i - b.i);
const wMax = Math.max(...g6.map(o => o.hw)), wMin = Math.min(...g6.map(o => o.hw));
console.log(`   선체 실제 최대 반폭 ${hullHalf.toFixed(2)} / 활대 ${wMin.toFixed(2)} ~ ${wMax.toFixed(2)}`);
chk('가운데 돛이 가장 넓음', Math.abs(g6[2].hw - wMax) < 1e-9 && Math.abs(g6[3].hw - wMax) < 1e-9,
  `3·4번 ${wMax.toFixed(2)}`);
chk('활대가 선체보다 넓음(가로돛다움)', wMax > hullHalf, `${wMax.toFixed(2)} > ${hullHalf.toFixed(2)}`);
chk('활대가 과하게 넓지 않음(1.6배 이내)', wMax < hullHalf * 1.6, `< ${(hullHalf*1.6).toFixed(2)}`);
chk('돛이 선미 밖으로 안 나감', g6[5].minX >= -13 * s, `${g6[5].minX.toFixed(2)} ≥ ${(-13*s).toFixed(2)}`);
chk('첫 돛이 선수 밖으로 안 나감', g6[0].mx <= 16 * s, `${g6[0].mx.toFixed(2)} ≤ ${(16*s).toFixed(2)}`);

console.log('\n=== 8. 문법 ===');
try { new Function(src.split('<script>').pop().split('</script>')[0]); chk('script 파싱', true); }
catch (e) { chk('script 파싱', false, e.message); }

console.log('\n=== 9. 패널 슬라이더 범위 ===');
const spec = src.match(/const SPEC = \[[\s\S]*?\n  \];/)[0];
function range(key) {
  const m = spec.match(new RegExp("\\['" + key + "',\\s*'[^']*',\\s*([\\d.]+),\\s*([\\d.]+)"));
  return m ? { lo: +m[1], hi: +m[2] } : null;
}
const rSpeed = range('speedKn'), rSail = range('sailMax');
console.log(`   전속    ${rSpeed.lo} ~ ${rSpeed.hi} kn`);
console.log(`   돛 단수 ${rSail.lo} ~ ${rSail.hi} 단`);
chk('전속 상한 20kn', rSpeed.hi === 20, `${rSpeed.lo}~${rSpeed.hi}`);
chk('돛 단수 1~6단', rSail.lo === 1 && rSail.hi === 6, `${rSail.lo}~${rSail.hi}`);

console.log('\n=== 10. 1단 배가 정상인지 ===');
const one = geom(1, 1, 1);
console.log(`   돛 1장: x=${one[0].mx.toFixed(2)} 활대반길이=${one[0].hw.toFixed(2)}`);
chk('1단이면 돛 1장', one.length === 1);
chk('그 돛이 선체 중앙', Math.abs(one[0].mx - MID) < 1e-9, `${one[0].mx.toFixed(2)} = ${MID.toFixed(2)}`);
chk('1단 돛이 가장 넓은 폭', Math.abs(one[0].hw - 8.4 * s) < 1e-9, `${one[0].hw.toFixed(2)}`);
chk('sailRank(1) 정상', sailRank(1).length === 1 && sailRank(1)[0] === 0);
chk('1단에서 선체 밖으로 안 나감', one[0].minX >= -13 * s && one[0].mx <= 16 * s);

// 전속을 올려도 물리식이 성립하는지 (SPEED 는 노트 * KN_TO_PX 로만 정의)
const KM_PER_PX = 40075 / 8192, KN_TO_PX = (1.852 * 24) / KM_PER_PX;
console.log('\n   전속별 하루 항행거리 (게임 내)');
for (const kn of [2, 8, 14, 20])
  console.log(`   ${String(kn).padStart(2)} kn → ${(kn * KN_TO_PX * KM_PER_PX).toFixed(0).padStart(4)} km/일`);
chk('20kn 이 물리적으로 계산됨', Math.abs(20 * KN_TO_PX * KM_PER_PX - 20 * 1.852 * 24) < 1e-6,
  `${(20*1.852*24).toFixed(0)} km/일`);

console.log('\n=== 결과 ===');
console.log('  통과 ' + pass + ' / 실패 ' + fail + '  (총 ' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
