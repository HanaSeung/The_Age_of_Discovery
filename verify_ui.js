// verify_ui.js — 토글 색상 표시와 판 겹침 검증
"use strict";
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'world_chart.html'), 'utf8');
let pass = 0, fail = 0;
const chk = (n, c, note) => { c ? (pass++, console.log('  OK   ' + n + (note ? '  ' + note : '')))
                                : (fail++, console.log('  FAIL ' + n + (note ? '  ' + note : ''))); };

// 옛 1절('나침반이 패널에 가리지 않는지')은 걷어냈다. 나침반이 원형 계기로
// 흡수되면서 화면 구석을 떠도는 일이 없어졌고, 계기는 position:fixed 로 제자리에
// 붙박여 패널이 열려도 비켜나지 않는다. 그래서 TUNE_W·tuneOpen()·compassPos() 가
// 모두 사라졌고, 그것들을 찾던 검사도 함께 지운다.
// 패널과 계기의 폭이 짝인지는 verify_compass.js 2절이 본다.

console.log('\n=== 2. 토글 색상 표시 ===');
chk('toggles 요소 존재', /<span id="toggles"><\/span>/.test(src));
chk('updateHint 정의', /function updateHint\(\)/.test(src));
chk('최초 1회 호출', /updateHint\(\);\s+\/\/ 최초 1회/.test(src));
chk('키 입력 시 갱신', /if\('ghckblp '\.includes\(k\)\) updateHint\(\)/.test(src));
// 갱신은 상태를 다 바꾼 뒤여야 한다. 앞에 두면 방금 누른 키가 한 박자 늦게 나온다.
chk('갱신이 상태 변경 뒤에 온다',
    /if\(k===' ' && !e\.repeat\) paused = !paused;[\s\S]{0,200}includes\(k\)\) updateHint\(\)/.test(src));
chk('on/off 클래스 분기', /\(isOn\(\)\?'on':'off'\)/.test(src));
chk('CSS .on 정의', /#hint \.on \{color:#ffd98a;/.test(src));
chk('CSS .off 정의', /#hint \.off\{color:#7d8884;\}/.test(src));
chk('kbd 색도 함께 바뀜', /#hint \.on kbd\{/.test(src) && /#hint \.off kbd\{/.test(src));

console.log('\n=== 2-1. 배경 위에서 읽히는지 (대비 확보) ===');
chk('안내줄 배경판', /#hint\{[^}]*background:rgba\(14,24,22,\.78\)/.test(src));
chk('안내줄 불투명(opacity 제거)', !/#hint\{[^}]*opacity/.test(src));
// 옛 #hud 판은 걷어냈다 — verify_boot.js 가 '없어야 한다'로 지키고 있어,
// 여기서 '있어야 한다'로 찾으면 두 검증이 정반대를 요구하게 된다
chk('옛 HUD 판의 잔재가 없다', !/id="hud"/.test(src) && !/#hud\{/.test(src));
// 늘 회색이던 .dim 칸은 걷어냈다 — 안내줄이 전부 토글이 되었다 (2026.07.27).
chk('.dim 잔재가 없다', !/class="dim"/.test(src) && !/#hint \.dim/.test(src));
chk('꺼짐도 읽히는 회색', /#hint \.off\{color:#7d8884;\}/.test(src));

console.log('\n=== 3. 토글 여덟이 모두 등록됐는지 ===');
// 셋째 칸이 '켜졌는가'를 돌려주는 함수다. 상태가 사는 곳이 저마다 달라도
// (변수 · DOM 클래스 · show 객체) 표는 하나로 유지된다.
const spec = src.match(/const TOGGLES = \[[\s\S]*?\n\];/)[0];
for (const [key, label, read] of [
      ['L','배율고정','()=>zoomLock'],   ['P','조정패널','()=>tuneOpen()'],
      ['Space','정지','()=>paused'],     ['B','바람','()=>show.wind'],
      ['K','해류','()=>show.cur'],       ['G','경위선','()=>show.grat'],
      ['H','나침선','()=>show.rhumb'],   ['C','충돌영역','()=>show.coll']]) {
  chk(`${key} ${label}`, spec.includes(`'${key}','${label}'`) && spec.includes(read));
}
chk('여덟 줄뿐이다 — 빠뜨린 것도 남는 것도 없다',
    (spec.match(/\n\s*\['/g) || []).length === 8,
    (spec.match(/\n\s*\['/g) || []).length + '줄');
// 화면 토글 다섯은 키 처리도 함께 있어야 한다
for (const [k, f] of [['b','wind'],['k','cur'],['g','grat'],['h','rhumb'],['c','coll']])
  chk(`  └ ${k.toUpperCase()} 키 처리 존재`,
      new RegExp(`k==='${k}'\\) show\\.${f}=!show\\.${f}`).test(src));
// 나머지 셋은 읽는 곳이 다르므로 그 진실이 하나인지를 본다
chk('  └ L 은 zoomLock 을 뒤집는다', /if\(k==='l'\)\{ zoomLock=!zoomLock/.test(src));
chk('  └ P 는 class 로 여닫는다', /t\.classList\.toggle\('on'\)/.test(src));
chk('  └ 패널 열림을 DOM 에서 읽는다 (상태를 따로 두지 않는다)',
    /function tuneOpen\(\)\{[\s\S]{0,160}classList\.contains\('on'\)/.test(src));
chk('  └ Space 는 paused 를 뒤집는다', /if\(k===' ' && !e\.repeat\) paused = !paused/.test(src));

console.log('\n=== 3-1. 안내줄에서 뺀 것 ===');
const hintHtml = (src.match(/<div id="hint"[\s\S]*?<\/div>/) || [''])[0];
chk('I 정보 안내가 빠졌다', !/<kbd>I<\/kbd>/.test(hintHtml));
// 안내만 지운 것이지 기능을 지운 게 아니다 (W/S·A/D 때와 같은 처리)
chk('I 키 조작은 살아 있다', /if\(k==='i'\)\{ const p=document\.getElementById\('info'\)/.test(src));
// 카드가 실제로 화면을 덮는가 — position 이 없으면 top/right/z-index 가 전부 죽는다
chk('정보 카드가 화면에 고정된다', /#info\{position:fixed;/.test(src),
    'position 이 없으면 흐름 끝의 블록이 되어 캔버스에 가린다');

console.log('\n=== 4. 구조/문법 ===');
// 세는 범위를 HTML 본문(첫 <script> 앞)으로 좁힌다. 스크립트 안에서는 조정 패널을
// 문자열로 짜는데, 구역을 한 곳에서 열고 세 곳(구역 경계 둘 + 끝 하나)에서 닫으므로
// 글자를 세는 방식으로는 짝이 맞을 수 없다 — 실행될 때 비로소 맞는다.
const markup = src.split('<script>')[0];
const opens = (markup.match(/<div/g) || []).length, closes = (markup.match(/<\/div>/g) || []).length;
chk('본문 div 여닫이 균형', opens === closes, `<div> ${opens} / </div> ${closes}`);
try { new Function(src.split('<script>').pop().split('</script>')[0]); chk('script 파싱', true); }
catch (e) { chk('script 파싱', false, e.message); }

console.log('\n=== 5. 판과 계기가 어긋나지 않는가 ===');
// 옛 검사는 화면을 떠도는 나침반이 판에 가리는지를 여덟 해상도에서 셈했다.
// 계기가 position:fixed 로 붙박이가 된 뒤로는 가릴 일도 비켜날 일도 없어,
// 이제 볼 것은 오른쪽에 세로로 늘어선 셋(조정 패널·출처·계기)의 폭과 여백뿐이다.
const cssNum = (sel, prop) => {
  const m = src.match(new RegExp(sel.replace(/[#.]/g, '\\$&') + '\\{[^}]*' + prop + ':(\\d+)px'));
  return m ? +m[1] : NaN;
};
const tuneW = cssNum('#tune', 'width'), dialW = cssNum('#dial', 'width');
const tuneR = cssNum('#tune', 'right'), dialR = cssNum('#dial', 'right');
chk('패널·계기 폭을 찾았다', Number.isFinite(tuneW) && Number.isFinite(dialW),
    `패널 ${tuneW}px / 계기 ${dialW}px`);
chk('패널 폭이 계기 지름과 같다', tuneW === dialW, `${tuneW} = ${dialW}`);
chk('오른쪽 기준이 같다 — 왼쪽 변도 따라 맞는다', tuneR === dialR,
    `right ${tuneR}px = ${dialR}px`);
chk('패널이 계기를 덮지 않는다 — 높이를 계기만큼 비워 둔다',
    new RegExp('max-height:calc\\(100vh - ' + (14 + dialW + 16 + 14) + 'px\\)').test(src),
    `100vh − ${14 + dialW + 16 + 14}px`);
// 옛 '출처(#src)' 판과 body.tune-open 도 함께 사라졌다 — 찾던 검사를 지운다
chk('옛 출처 판의 잔재가 없다', !/#src\{/.test(src) && !/tune-open/.test(src));

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
