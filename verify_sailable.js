// verify_sailable.js — 새 기본값으로 '실제로 항해가 되는지' 검증
// 실행: node verify_sailable.js
"use strict";
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'world_chart.html'), 'utf8');

// world_chart.html 의 P 기본값을 그대로 읽어온다 (문서와 코드가 어긋나지 않게)
const pbody = src.match(/const P = \{[\s\S]*?\n\};/)[0];
const P = new Function(pbody.replace('const P =', 'return ') .replace(/;\s*$/, ''))();
const polar = new Function('P', src.match(/function polar\(deg\)\{[\s\S]*?\n\}/)[0] + '; return polar;')(P);
const windPower = new Function('P', src.match(/function windPower\(ms\)\{[\s\S]*?\n\}/)[0] + '; return windPower;')(P);

let pass = 0, fail = 0;
const chk = (n, c, note) => { c ? (pass++, console.log('  OK   ' + n + (note ? '  ' + note : '')))
                                : (fail++, console.log('  FAIL ' + n + (note ? '  ' + note : ''))); };

const wsrc = fs.readFileSync(path.join(__dirname, 'wind_data.js'), 'utf8');
const NX = 90, NY = 45, NM = 12, QS = 0.2, N = NX * NY;
const buf = Buffer.from(wsrc.match(/data:\s*"([^"]+)"/)[1], 'base64');
const s8 = b => b > 127 ? b - 256 : b;
function wind(m, lat, lon) {           // windGain 적용 후 값
  const j = Math.max(0, Math.min(NY - 1, Math.floor((90 - lat) / 4)));
  const i = Math.max(0, Math.min(NX - 1, Math.floor(((lon + 180) % 360) / 4)));
  const k = j * NX + i;
  return { u: s8(buf[m * N + k]) * QS * P.windGain,
           v: s8(buf[NM * N + m * N + k]) * QS * P.windGain };
}
function best(m, lat, lon) {            // 360도 훑어 최고 효율과 항해 가능 방향 수
  const w = wind(m, lat, lon), ms = Math.hypot(w.u, w.v);
  const wa = Math.atan2(-w.v, w.u);
  let bestE = 0, okCount = 0;
  for (let c = 0; c < 360; c += 5) {
    const head = (c - 90) * Math.PI / 180;
    const d = Math.abs(((head - wa + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const e = polar(180 - d * 180 / Math.PI) * windPower(ms);
    if (e > bestE) bestE = e;
    if (e > 0.15) okCount++;
  }
  return { ms, bestE, okPct: okCount / 72 * 100 };
}
console.log('\n=== 기본값 확인 ===');
console.log(`  windGain ${P.windGain} / windMin ${P.windMin} / windFull ${P.windFull} / nogo ${P.nogoDeg}도`);

console.log('\n=== 1. 게임 시작 지점 (31N 24W) — 12개월 전부 ===');
const MN = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
let worst = 1;
for (let m = 0; m < 12; m++) {
  const r = best(m, 31, -24);
  if (r.bestE < worst) worst = r.bestE;
  console.log(`  ${MN[m].padStart(3)} | 풍속 ${r.ms.toFixed(1).padStart(4)} m/s | 최고효율 ${(r.bestE*100).toFixed(0).padStart(3)}% | 항해가능 방위 ${r.okPct.toFixed(0).padStart(3)}%`);
}
// '멈춤'과 '느림'은 다르다. 어느 달에도 전진은 되어야 하고,
// 출항하는 달(1월)은 답답하지 않아야 한다. 계절에 따라 느린 달이 있는 것은 정상이다.
chk('어느 달에도 멈추지 않음', worst > 0.10, `최악의 달(12월) ${(worst*100).toFixed(0)}%`);
chk('출항 시점(1월)이 항해 가능', best(0, 31, -24).bestE > 0.35,
  `${(best(0,31,-24).bestE*100).toFixed(0)}%`);
chk('계절 차이가 남아 있음', best(6, 31, -24).bestE > best(11, 31, -24).bestE * 2,
  `7월 ${(best(6,31,-24).bestE*100).toFixed(0)}% vs 12월 ${(best(11,31,-24).bestE*100).toFixed(0)}%`);

console.log('\n=== 2. 주요 해역이 막히지 않는지 ===');
const SPOTS = [
  ['북대서양 무역풍 15N 40W', 15, -40], ['카리브 15N 70W', 15, -70],
  ['희망봉 35S 20E', -35, 20],          ['인도양 10S 70E', -10, 70],
  ['아라비아해 12N 65E', 12, 65],       ['남중국해 12N 113E', 12, 113],
  ['태평양 20N 160W', 20, -160],        ['북해 56N 3E', 56, 3],
  ['지중해 36N 16E', 36, 16],           ['적도 대서양 0N 25W', 0, -25],
];
let stuck = [];
for (const [nm, la, lo] of SPOTS) {
  const jan = best(0, la, lo), jul = best(6, la, lo);
  const bad = jan.bestE < 0.15 && jul.bestE < 0.15;
  if (bad) stuck.push(nm);
  console.log(`  ${nm.padEnd(24)} 1월 ${(jan.bestE*100).toFixed(0).padStart(3)}% (${jan.ms.toFixed(1)}m/s)` +
              `  7월 ${(jul.bestE*100).toFixed(0).padStart(3)}% (${jul.ms.toFixed(1)}m/s)`);
}
chk('갇히는 해역 없음', stuck.length === 0, stuck.length ? stuck.join(', ') : '10곳 전부 항해 가능');

console.log('\n=== 3. 무풍대는 여전히 어려워야 한다 (평탄해지지 않았는지) ===');
const doldrum = best(0, 2, -25), trade = best(0, 15, -40);
chk('무풍대가 무역풍대보다 불리', doldrum.bestE < trade.bestE * 0.8,
  `무풍대 ${(doldrum.bestE*100).toFixed(0)}% < 무역풍 ${(trade.bestE*100).toFixed(0)}%`);
chk('역풍 방향은 여전히 막힘', best(0, 15, -40).okPct < 75,
  `무역풍대 항해가능 방위 ${trade.okPct.toFixed(0)}%`);

console.log('\n=== 4. 돛 그림이 바람이 아니라 단수에 연동되는지 ===');
// 상세 검증은 verify_sail.js. 여기서는 회귀 방지용 최소 확인만 한다.
chk('돛이 단수만큼 여러 장', /if\(rank\[i\] >= ship\.sail\) continue;/.test(src));
chk('펴는 순서 함수', /function sailRank\(n\)/.test(src));
chk('부풀기 = 바람 효율', /const bulge = \(-0\.16 \+ 1\.16\*eff\)/.test(src));
chk('옛 속력 연동 제거', !/const sf = 0\.30 \+ 0\.70\*Math\.min\(1, ship\.speed\/SPEED\)/.test(src));
chk('옛 단일 돛 제거', !/const hh = 7\.0\*s\*set/.test(src));

console.log('\n=== 5. 기타 ===');
chk('windGain 이 물리에 적용', /windVec\.x \*= P\.windGain/.test(src));
chk('windGain 이 화살표에도 적용', /Math\.hypot\(v\.x, v\.y\) \* P\.windGain/.test(src));
chk('저장 키 갱신 (옛 값 무효화)', /'aod_tune_v2'/.test(src));
chk('windGain 슬라이더', /\['windGain'/.test(src));
try { new Function(src.split('<script>').pop().split('</script>')[0]); chk('script 파싱', true); }
catch (e) { chk('script 파싱', false, e.message); }

console.log('\n=== 결과 ===');
console.log('  통과 ' + pass + ' / 실패 ' + fail + '  (총 ' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
