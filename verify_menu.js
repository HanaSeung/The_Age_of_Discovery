// verify_menu.js — 조정 패널 상단 메뉴 검증
// 실행: node verify_menu.js
// 주의: world_chart.html 은 CRLF 다. 블록 경계는 \n 대신 \s* / \r?\n 으로 잡는다.
"use strict";
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'world_chart.html'), 'utf8');
let pass = 0, fail = 0;
function chk(n, c, note){
  if(c){ pass++; console.log('  OK   ' + n + (note ? '  ' + note : '')); }
  else  { fail++; console.log('  FAIL ' + n + (note ? '  ' + note : '')); }
}

console.log('\n=== 1. 메뉴 세 칸이 있는가 ===');
const tabs = (src.match(/const TABS\s*=\s*\[([\s\S]*?)\];/) || [])[1] || '';
chk('TABS 정의를 찾았다', tabs.length > 0);
for(const [id,lab] of [['gen','일반'],['set','설정'],['dbg','디버그']])
  chk(`${lab}(${id}) 칸 있음`, tabs.includes(`'${id}'`) && tabs.includes(`'${lab}'`));
chk('칸이 정확히 3개다', (tabs.match(/\[/g) || []).length === 3);

console.log('\n=== 2. 스크롤해도 메뉴가 남고, 좌우로 밀리지 않는가 ===');
const tuneCss = (src.match(/#tune\{[^}]*\}/) || [''])[0];
const menuCss = (src.match(/#tune \.menu\{[^}]*\}/) || [''])[0];
const bodyCss = (src.match(/#tune \.body\{[^}]*\}/) || [''])[0];
chk('.menu 규칙을 찾았다', menuCss.length > 0);
chk('.body 규칙을 찾았다', bodyCss.length > 0);
// 핵심: 메뉴가 스크롤 상자 밖에 있어야 스크롤바가 생겨도 안 밀린다
chk('카드는 세로 flex 다', /display:\s*none;\s*flex-direction:\s*column/.test(tuneCss) ||
    (/flex-direction:\s*column/.test(tuneCss)));
chk('카드 자신은 스크롤하지 않는다', /overflow:\s*hidden/.test(tuneCss) &&
    !/overflow-y:\s*auto/.test(tuneCss));
chk('스크롤은 .body 만 갖는다', /overflow-y:\s*auto/.test(bodyCss));
chk('메뉴는 줄어들지 않는다(flex:0 0 auto)', /flex:\s*0 0 auto/.test(menuCss));
chk('메뉴에 음수 여백이 없다', !/margin:\s*0 -/.test(menuCss));
chk('메뉴는 sticky 가 아니다 (이제 필요 없다)', !/position:\s*sticky/.test(menuCss));
chk('.body 가 flex 안에서 줄 수 있다(min-height:0)', /min-height:\s*0/.test(bodyCss));
chk('스크롤바 자리를 늘 잡아 둔다', /scrollbar-gutter:\s*stable/.test(bodyCss));
// 스크롤바 폭 + 오른 여백 = 왼 여백 이어야 좌우가 맞아 보인다
const SBW = +((src.match(/#tune \.body::-webkit-scrollbar\{width:\s*(\d+)px/) || [])[1]);
const p = (bodyCss.match(/padding:\s*(\d+)px (\d+)px (\d+)px (\d+)px/) || []).slice(1).map(Number);
chk('스크롤바 폭을 정했다', Number.isFinite(SBW), `${SBW}px`);
chk('좌우 여백이 시각적으로 맞는다', p.length === 4 && p[1] + SBW === p[3],
    `오른쪽 ${p[1]} + 스크롤바 ${SBW} = ${p[1] + SBW} / 왼쪽 ${p[3]}`);
chk('#tune 자체 padding 은 0 이다', /padding:\s*0;/.test(tuneCss));
chk('메뉴 배경은 불투명이다', /background:\s*#[0-9a-fA-F]{3,8}\b/.test(menuCss));

console.log('\n=== 3. 지금 내용이 디버그 칸에 들어갔는가 ===');
const build = (src.match(/function build\(\)\{[\s\S]*?\r?\n  \}/) || [''])[0];
chk('build() 본문을 찾았다', build.length > 0, `${build.length}자`);
const dbgStart = build.indexOf('pane_dbg');
const dbgEnd   = build.indexOf('el.innerHTML');
chk('pane_dbg 를 연다', dbgStart > 0);
const dbgHtml = build.slice(dbgStart, dbgEnd);
for(const [n,s] of [['슬라이더 루프', 'for(const sp of SPEC)'], ['출력 상자', 'tuneOut'],
                    ['값 복사 단추', 'tCopy'], ['되돌리기 단추', 'tReset'],
                    ['안내문', 'class="note"']])
  chk(n + ' 이 디버그 칸 안에 있다', dbgHtml.includes(s));
chk('일반 칸을 renderGeneral 이 채운다',
    /<div class="pane" id="pane_gen"><\/div>/.test(build) && /function renderGeneral\(\)/.test(src));
chk('설정 칸에 체크상자가 있다', /pane_set[\s\S]{0,200}type="checkbox" id="cHint"/.test(build));
chk('빈 칸 문구가 남아 있지 않다', !/아직 비어 있습니다/.test(src));
chk('세 칸이 .body 안에 들어 있다', /<div class="body">[\s\S]*pane_gen/.test(build));
chk('.body 를 닫는다', /<\/div><\/div>';/.test(build));
chk('맨 위 띠가 메뉴 앞에 있다', /'<div class="head" id="tHead"><\/div><div class="menu">'/.test(build));
chk('P 로 열 때 class 를 켠다', /t\.classList\.toggle\('on'\)/.test(src));
// 열림 판정이 한 곳이라도 옛 방식(style.display)으로 남아 있으면 조용히 깨진다
chk('열림 판정이 전부 class 다', !/getElementById\('tune'\)\.style\.display/.test(src));
chk('갱신 루프도 class 를 본다', /getElementById\('tune'\)\.classList\.contains\('on'\)/.test(src));
chk('칸 전환 시 .body 스크롤을 올린다', /querySelector\('\.body'\)[\s\S]{0,60}scrollTop = 0/.test(src));

console.log('\n=== 4. 전환 동작 ===');
chk('showTab() 이 있다', /function showTab\(/.test(src));
chk('세 칸 모두에 click 을 건다', /for\(const \[id\] of TABS\)[\s\S]{0,120}addEventListener\('click'/.test(src));
chk('선택 칸을 저장한다', /localStorage\.setItem\(LS_TAB/.test(src));
chk('저장값이 TABS 에 있는지 검사한다', /TABS\.some\(/.test(src));
chk('기본은 디버그다', /let t0 = 'dbg'/.test(src));
chk('전환 시 스크롤을 위로 올린다', /scrollTop = 0/.test(src));

console.log('\n=== 5. 카드형 — 화면 끝에 붙지 않는가 ===');
const TOP   = +(tuneCss.match(/top:\s*(\d+)px/) || [])[1];
const RIGHT = +(tuneCss.match(/right:\s*(\d+)px/) || [])[1];
const WIDTH = +(tuneCss.match(/width:\s*(\d+)px/) || [])[1];
const SUB   = +(tuneCss.match(/max-height:\s*calc\(100vh\s*-\s*(\d+)px\)/) || [])[1];
chk('위·오른쪽이 화면 끝에서 떨어져 있다', TOP > 0 && RIGHT > 0, `top=${TOP} right=${RIGHT}`);
chk('bottom 이 없다 (높이는 내용만큼)', !/bottom:/.test(tuneCss));
chk('max-height 가 있다', Number.isFinite(SUB), `100vh-${SUB}px`);
chk('네 변에 테두리가 있다', /border:\s*1px solid/.test(tuneCss) && !/border-left:/.test(tuneCss));
chk('모서리가 둥글다', /border-radius:\s*\d+px/.test(tuneCss));
chk('맨 위 띠가 둥근 윗모서리를 맡는다', /#tune \.head\{[^}]*border-radius:5px 5px 0 0/.test(src));

console.log('\n=== 6. 좌표 — 나침반 카드와 어긋나지 않는가 ===');
const cardCss = (src.match(/#compass\{[^}]*\}/) || [''])[0];
const bodyC   = (src.match(/#compass \.body\{[^}]*\}/) || [''])[0];
const geoC    = (src.match(/#compass \.geo\{[^}]*\}/) || [''])[0];
const SIZE = +(src.match(/COMPASS_SIZE = (\d+)/) || [])[1];
const padc = +(bodyC.match(/padding:\s*(\d+)px/) || [])[1];   // 여백은 .body 가 갖는다
const cBot = +(cardCss.match(/bottom:\s*(\d+)px/) || [])[1];
const bandH = +(geoC.match(/padding:\s*(\d+)px/) || [])[1]*2 +
              Math.round(+(geoC.match(/font-size:\s*([\d.]+)px/) || [])[1]*1.35) + 1;
const cardH = bandH + padc*2 + SIZE + 2;     // 띠 + 여백 + 캔버스 + 테두리
chk('카드 폭이 패널과 같다', +(cardCss.match(/width:\s*(\d+)px/)||[])[1] === WIDTH,
    `${WIDTH}px`);
chk('패널이 카드 위에서 끝난다', SUB >= TOP + cardH + cBot,
    `100vh−${SUB} / 필요 ${TOP + cardH + cBot} (카드 ${cardH}px)`);
// 출처 표시는 제거됐다. 관련 규칙·토글이 남아 있으면 죽은 코드다.
chk('#src 규칙이 남아 있지 않다', !/#src/.test(src));
chk('tune-open 토글이 남아 있지 않다', !/tune-open/.test(src));
// 메뉴 높이 = padding 11*2 + 칸 높이(padding 6*2 + 테두리 2 + 글자 약 15) + 경계선 1
const MENU_H = 11*2 + (6*2 + 2 + 15) + 1;
for(const H of [1080, 900, 768, 720]){
  const panelH = H - SUB;                    // 최대로 늘어났을 때의 패널 높이
  chk(`높이 ${H} 에서 메뉴 아래에 내용 자리가 남는다`, panelH - MENU_H > 120,
      `패널 최대 ${panelH}px − 메뉴 약 ${MENU_H}px = ${panelH - MENU_H}px`);
}

console.log('\n=== 7. 스르륵 열림 ===');
const onCss = (src.match(/#tune\.on\{[^}]*\}/) || [''])[0];
chk('#tune.on 규칙이 있다', onCss.length > 0);
chk('닫힘일 때 오른쪽 화면 밖에 있다', /transform:\s*translateX\(calc\(100% \+ \d+px\)\)/.test(tuneCss));
chk('열리면 제자리로 온다', /transform:\s*none/.test(onCss));
chk('transform 에 전환이 걸려 있다', /transition:[^;]*transform/.test(tuneCss) &&
    /transition:[^;]*transform/.test(onCss));
chk('display 로 숨기지 않는다 (전환이 안 걸린다)', !/display:\s*none/.test(tuneCss));
chk('display 는 flex 다', /display:\s*flex/.test(tuneCss));
// 닫힘일 때 화면 밖에 있어도 클릭·탭 이동이 닿으면 안 된다
chk('닫힘일 때 손이 닿지 않는다', /visibility:\s*hidden/.test(tuneCss) &&
    /pointer-events:\s*none/.test(tuneCss));
chk('열림일 때 손이 닿는다', /visibility:\s*visible/.test(onCss) &&
    /pointer-events:\s*auto/.test(onCss));
// visibility 는 전환이 안 되므로 닫힐 때만 지연시켜야 사라지는 게 안 튄다
chk('닫힐 때 visibility 를 지연시킨다', /visibility 0s \.\d+s/.test(tuneCss));
chk('열릴 때 visibility 를 지연시키지 않는다', /visibility 0s(?!\s*\.)/.test(onCss));
// 밀려나는 거리가 카드를 완전히 화면 밖으로 보내는가 (오른 여백 + 테두리 몫)
const OUT = +((tuneCss.match(/translateX\(calc\(100% \+ (\d+)px\)\)/) || [])[1]);
chk('밀려나는 거리가 오른쪽 여백보다 크다', OUT > RIGHT, `+${OUT}px > right ${RIGHT}px`);
chk('움직임을 줄이는 설정을 존중한다', /prefers-reduced-motion[\s\S]{0,90}transition:\s*none/.test(src));

console.log('\n=== 8. 설정 탭 — 안내줄 켜고 끄기 ===');
chk('applyHint() 가 있다', /function applyHint\(/.test(src));
chk('통째로 끈다 (#hint 전체)', /getElementById\('hint'\)\.classList\.toggle\('hidden'/.test(src));
chk('.hidden 규칙이 있다', /#hint\.hidden\{display:\s*none/.test(src));
chk('상태를 저장한다', /localStorage\.setItem\(LS_HINT/.test(src));
chk('저장값을 읽어 켠다', /localStorage\.getItem\(LS_HINT\) !== '0'/.test(src));
chk('체크상자와 화면이 한 통로로 묶여 있다', /ch\.addEventListener\('change'[\s\S]{0,40}applyHint\(ch\.checked\)/.test(src));
chk('처음 열 때 저장값을 반영한다', /ch\.checked = on; applyHint\(on\)/.test(src));

console.log('\n=== 9. 안내줄에서 뺀 것 ===');
const hintHtml = (src.match(/<div id="hint"[\s\S]*?<\/div>/) || [''])[0];
chk('안내줄을 찾았다', hintHtml.length > 0);
for(const s of ['W</kbd>/<kbd>S', 'A</kbd>/<kbd>D', '확대', '미세'])
  chk(`"${s}" 가 빠졌다`, !hintHtml.includes(s));
for(const s of ['L', 'P', 'I'])
  chk(`${s} 안내는 남아 있다`, new RegExp('<kbd>'+s+'</kbd>').test(hintHtml));
chk('토글 자리는 그대로다', /id="toggles"/.test(hintHtml));
// 키 조작 자체는 살아 있어야 한다 — 안내만 지운 것이지 기능을 지운 게 아니다
for(const [n,re] of [['W/S 돛', /k==='w'\|\|k==='arrowup'/], ['A/D 선회', /keys\['a'\]\|\|keys\['arrowleft'\]/],
                     ['휠 확대', /addEventListener\('wheel'/]])
  chk(n + ' 조작은 살아 있다', re.test(src));

console.log(`\n${fail === 0 ? '전부 통과' : '실패 있음'} — 통과 ${pass}, 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);
