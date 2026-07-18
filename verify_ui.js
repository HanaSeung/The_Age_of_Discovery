// verify_ui.js — 나침반 회피 및 토글 색상 표시 검증
"use strict";
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'world_chart.html'), 'utf8');
let pass = 0, fail = 0;
const chk = (n, c, note) => { c ? (pass++, console.log('  OK   ' + n + (note ? '  ' + note : '')))
                                : (fail++, console.log('  FAIL ' + n + (note ? '  ' + note : ''))); };

console.log('\n=== 1. 나침반이 패널에 가리지 않는지 ===');
chk('패널 열림 판정 함수', /function tuneOpen\(\)/.test(src));
chk('패널 폭 상수', /const TUNE_W = 290/.test(src));
chk('위치 계산이 한 곳에 모임', /function compassPos\(\)/.test(src));
chk('열리면 왼쪽으로 비켜남', /cx: W - 58 - \(open \? TUNE_W : 0\)/.test(src));
chk('열리면 위로도 올라감', /cy: H - \(open \? 150 : 80\)/.test(src));
chk('compass 가 compassPos 사용', /const \{cx, cy, R\} = compassPos\(\)/.test(src));
// CSS 의 실제 패널 폭과 상수가 일치하는지 (어긋나면 나침반이 반쯤 가려진다)
const cssW = src.match(/#tune\{[^}]*width:(\d+)px/);
chk('CSS 폭과 상수 일치', cssW && +cssW[1] === 290, cssW ? `CSS ${cssW[1]}px` : 'CSS 폭 못 찾음');

console.log('\n=== 2. 토글 색상 표시 ===');
chk('toggles 요소 존재', /<span id="toggles"><\/span>/.test(src));
chk('updateHint 정의', /function updateHint\(\)/.test(src));
chk('최초 1회 호출', /updateHint\(\);\s+\/\/ 최초 1회/.test(src));
chk('키 입력 시 갱신', /if\('ghckb'\.includes\(k\)\) updateHint\(\)/.test(src));
chk('on/off 클래스 분기', /show\[f\]\?'on':'off'/.test(src));
chk('CSS .on 정의', /#hint \.on \{color:#ffd98a;/.test(src));
chk('CSS .off 정의', /#hint \.off\{color:#7d8884;\}/.test(src));
chk('kbd 색도 함께 바뀜', /#hint \.on kbd\{/.test(src) && /#hint \.off kbd\{/.test(src));

console.log('\n=== 2-1. 배경 위에서 읽히는지 (대비 확보) ===');
chk('안내줄 배경판', /#hint\{[^}]*background:rgba\(14,24,22,\.78\)/.test(src));
chk('안내줄 불투명(opacity 제거)', !/#hint\{[^}]*opacity/.test(src));
chk('HUD 배경판', /#hud\{[^}]*background:rgba\(14,24,22,\.62\)/.test(src));
chk('정적 안내 밝기 상향', /#hint \.dim\{color:#a99e86;\}/.test(src));
chk('꺼짐도 읽히는 회색', /#hint \.off\{color:#7d8884;\}/.test(src));

console.log('\n=== 3. 5개 토글이 모두 등록됐는지 ===');
const spec = src.match(/const TOGGLES = \[[\s\S]*?\];/)[0];
for (const [k, label, f] of [['b','바람','wind'], ['k','해류','cur'], ['g','경위선','grat'],
                             ['h','나침선','rhumb'], ['c','충돌영역','coll']]) {
  chk(`${k.toUpperCase()} ${label}`, spec.includes(`'${k}','${label}','${f}'`));
  chk(`  └ 키 처리 존재`, new RegExp(`k==='${k}'\\) show\\.${f}=!show\\.${f}`).test(src));
}

console.log('\n=== 4. 구조/문법 ===');
const opens = (src.match(/<div/g) || []).length, closes = (src.match(/<\/div>/g) || []).length;
chk('div 여닫이 균형', opens === closes, `<div> ${opens} / </div> ${closes}`);
chk('안내줄에 정적 부분 유지', /class="dim"/.test(src));
try { new Function(src.split('<script>').pop().split('</script>')[0]); chk('script 파싱', true); }
catch (e) { chk('script 파싱', false, e.message); }

console.log('\n=== 5. 화면 요소 겹침 (좌표 계산) ===');
// CSS/JS 에서 실제 값을 뽑아 사각형으로 만들고 나침반 원과 겹치는지 본다.
function css(sel, prop) {
  const m = src.match(new RegExp(sel.replace(/[#.]/g, '\\$&') + '\\{[^}]*' + prop + ':\\s*([\\d.]+)(px|vw)'));
  return m ? { v: +m[1], unit: m[2] } : null;
}
const TUNE_W = +src.match(/const TUNE_W = (\d+)/)[1];
const CY = src.match(/cy: H - \(open \? (\d+) : (\d+)\)/);
const CY_OPEN = +CY[1], CY_SHUT = +CY[2];
const CX_OFF = +src.match(/cx: W - (\d+) - \(open/)[1];
const R_OUT = 42;                                   // 원 반지름 34 + 테두리 8

function boxes(W, H, open) {
  const hintMax = src.match(/#hint\{[^}]*max-width:(\d+)vw/);
  const hintW = Math.min(W - 32, (hintMax ? +hintMax[1] : 74) / 100 * W);
  return {
    // 안내줄은 좁은 화면에서 두 줄로 접힐 수 있으므로 넉넉히 70px 로 본다
    '안내줄': { x: 16, y: H - 12 - 70, w: hintW, h: 70 },
    '출처':   { x: W - 16 - 340 - (open ? 290 : 0), y: 16, w: 340, h: 34 },
    '조정패널': open ? { x: W - TUNE_W, y: 0, w: TUNE_W, h: H } : null,
  };
}
function hits(cx, cy, r, b) {
  if (!b) return false;
  const nx = Math.max(b.x, Math.min(cx, b.x + b.w));
  const ny = Math.max(b.y, Math.min(cy, b.y + b.h));
  return (nx - cx) ** 2 + (ny - cy) ** 2 < r * r;
}
let clash = [];
for (const [W, H] of [[1920, 1080], [1600, 900], [1366, 768], [1280, 720]]) {
  for (const open of [false, true]) {
    const cx = W - CX_OFF - (open ? TUNE_W : 0), cy = H - (open ? CY_OPEN : CY_SHUT);
    const bs = boxes(W, H, open);
    const bad = Object.entries(bs).filter(([, b]) => hits(cx, cy, R_OUT, b)).map(([n]) => n);
    const tag = `${W}x${H} 패널${open ? '열림' : '닫힘'}`;
    if (bad.length) clash.push(tag + ' ← ' + bad.join(','));
    console.log(`  ${tag.padEnd(20)} 나침반 중심 (${cx},${cy})  ${bad.length ? '겹침: ' + bad.join(', ') : '겹침 없음'}`);
  }
}
chk('모든 해상도에서 나침반이 안 가림', clash.length === 0, clash.join(' / ') || '8가지 조합 통과');
chk('출처가 우상단으로 이동', /#src\{top:16px;right:16px/.test(src));
chk('패널 열리면 출처도 비켜남', /body\.tune-open #src\{right:306px;\}/.test(src));
chk('패널 토글이 body 클래스 갱신', /classList\.toggle\('tune-open', open\)/.test(src));

console.log('\n=== 6. 바람 화살표 — 세기를 굵기로 ===');
chk('길이 고정 상수', /const WARR_LEN = 26/.test(src));
chk('굵기 범위 상수', /const WARR_W0 = 1\.4, WARR_W1 = 7\.0/.test(src));
chk('길이가 세기에 안 흔들림', /const L = WARR_LEN;/.test(src) && !/const L = 12 \+ 20\*p/.test(src));
chk('굵기가 세기에 비례', /const lw = WARR_W0 \+ \(WARR_W1-WARR_W0\)\*p/.test(src));
chk('화살촉이 굵기 따라 커짐', /const hd = 3\.0 \+ lw\*0\.9/.test(src));
chk('밝기도 같은 방향', /0\.24\+0\.46\*p/.test(src));

// 굵기 차이가 실제로 눈에 구분되는 폭인지 계산
const W0 = 1.4, W1 = 7.0, FULL = +src.match(/windFull\s*:\s*([\d.]+)/)[1];
const GAIN = +src.match(/windGain\s*:\s*([\d.]+)/)[1];
console.log('\n   실측 풍속 | 보정후 | 굵기');
console.log('   ---------+--------+------');
for (const raw of [1, 2, 3, 4, 5, 6, 8]) {
  const m = raw * GAIN, p = Math.min(1, m / FULL);
  const lw = W0 + (W1 - W0) * p;
  console.log(`   ${raw.toFixed(1).padStart(6)} m/s | ${m.toFixed(1).padStart(5)} | ${lw.toFixed(1).padStart(4)} px`);
}
const spread = W1 / W0;
chk('굵기 폭이 4배 이상', spread >= 4, `${W0} → ${W1} px (${spread.toFixed(1)}배)`);
// 흔한 구간(실측 2~5 m/s)에서 굵기가 충분히 벌어지는지 — 여기서 안 벌어지면 무의미하다
const lwAt = r => W0 + (W1 - W0) * Math.min(1, r * GAIN / FULL);
const d = lwAt(5) - lwAt(2);
chk('흔한 구간에서 구분 가능', d >= 2.0,
  `2 m/s ${lwAt(2).toFixed(1)}px vs 5 m/s ${lwAt(5).toFixed(1)}px (차이 ${d.toFixed(1)}px)`);

console.log('\n=== 결과 ===');
console.log('  통과 ' + pass + ' / 실패 ' + fail + '  (총 ' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
