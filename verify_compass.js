// verify_compass.js — 나침반 카드 검증
// 실행: node verify_compass.js
// 주의: world_chart.html 은 CRLF 다. 블록 끝은 \r?\n 으로 잡는다.
"use strict";
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'world_chart.html'), 'utf8');
let pass = 0, fail = 0;
function chk(n, c, note){
  if(c){ pass++; console.log('  OK   ' + n + (note ? '  ' + note : '')); }
  else  { fail++; console.log('  FAIL ' + n + (note ? '  ' + note : '')); }
}

console.log('\n=== 1. 카드 구조 ===');
const cardCss = (src.match(/#compass\{[^}]*\}/) || [''])[0];
const tuneCss = (src.match(/#tune\{[^}]*\}/) || [''])[0];
chk('#compass 규칙을 찾았다', cardCss.length > 0);
chk('HTML 카드가 있다', /<div id="compass">/.test(src));
chk('전용 캔버스가 있다', /<canvas id="cCanvas">/.test(src));
chk('숫자가 HTML 이다', /id="cWind"/.test(src) && /id="cCur"/.test(src));
const CW = +(cardCss.match(/width:\s*(\d+)px/) || [])[1];
const TW = +(tuneCss.match(/width:\s*(\d+)px/) || [])[1];
chk('카드 폭이 조정 패널과 같다', CW === TW, `${CW}px = ${TW}px`);
chk('오른쪽 끝도 패널과 맞는다',
    (cardCss.match(/right:\s*(\d+)px/)||[])[1] === (tuneCss.match(/right:\s*(\d+)px/)||[])[1]);
chk('카드 모습이 패널과 같다',
    /background:rgba\(18,28,26,\.93\)/.test(cardCss) &&
    /border:1px solid rgba\(122,90,52,\.55\)/.test(cardCss) &&
    /border-radius:6px/.test(cardCss));
chk('box-sizing 이 border-box 다 (폭에 여백 포함)', /box-sizing:\s*border-box/.test(cardCss));
chk('지도 조작을 막지 않는다', /pointer-events:\s*none/.test(cardCss));

console.log('\n=== 2. 폭·높이가 실제로 들어맞는가 ===');
const SIZE = +(src.match(/COMPASS_SIZE = (\d+)/) || [])[1];
const csCanvas = (src.match(/#compass canvas\{[^}]*\}/) || [''])[0];
const cssSize = +(csCanvas.match(/width:\s*(\d+)px/) || [])[1];
chk('캔버스 크기가 JS·CSS 에서 같다', SIZE === cssSize, `JS ${SIZE} / CSS ${cssSize}`);
// 여백·간격은 이제 .body 가 갖는다
const bodyCss = (src.match(/#compass \.body\{[^}]*\}/) || [''])[0];
const geoCss  = (src.match(/#compass \.geo\{[^}]*\}/) || [''])[0];
chk('.body 규칙이 있다', bodyCss.length > 0);
chk('.geo 띠 규칙이 있다', geoCss.length > 0);
const padc = +(bodyCss.match(/padding:\s*(\d+)px/) || [])[1];
const gapc = +(bodyCss.match(/gap:\s*(\d+)px/) || [])[1];
const left = CW - 2 - padc*2 - gapc - SIZE;      // 숫자에 남는 폭
chk('숫자 자리가 남는다', left >= 60,
    `${CW} − 테두리2 − 여백${padc*2} − 사이${gapc} − 나침반${SIZE} = ${left}px`);
// 띠 높이 = 위아래 여백 + 글자 + 아래 경계선
const geoPadY = +(geoCss.match(/padding:\s*(\d+)px/) || [])[1];
const geoFS   = +(geoCss.match(/font-size:\s*([\d.]+)px/) || [])[1];
const bandH = geoPadY*2 + Math.round(geoFS*1.35) + 1;
const cardH = bandH + padc*2 + SIZE + 2;
chk('카드 높이를 계산했다', true, `띠 ${bandH} + 여백 ${padc*2} + 캔버스 ${SIZE} + 테두리 2 = ${cardH}px`);

console.log('\n=== 3. 조정 패널이 카드를 비켜나는가 ===');
const TOP = +(tuneCss.match(/top:\s*(\d+)px/) || [])[1];
const SUB = +(tuneCss.match(/max-height:\s*calc\(100vh\s*-\s*(\d+)px\)/) || [])[1];
const BOT = +(cardCss.match(/bottom:\s*(\d+)px/) || [])[1];
const need = TOP + cardH + BOT;                  // 최소로 비워야 하는 세로 길이
chk('max-height 가 카드 자리를 비운다', SUB >= need,
    `100vh−${SUB} / 필요 ${need} (여백 ${SUB - need}px)`);
chk('여백이 과하지 않다 (30px 이하)', SUB - need <= 30, `${SUB - need}px`);
for(const H of [1080, 900, 768, 720]){
  const panelMax = H - SUB, cardTop = H - BOT - cardH;
  chk(`높이 ${H} 에서 겹치지 않는다`, TOP + panelMax <= cardTop,
      `패널 바닥 ${TOP + panelMax} <= 카드 윗변 ${cardTop}`);
  chk(`높이 ${H} 에서 패널이 쓸 만하다`, panelMax >= 160, `${panelMax}px`);
}

console.log('\n=== 4. 그리는 대상이 전역 캔버스가 아닌가 ===');
const cmp = (src.match(/function compass\(\)\{[\s\S]*?\r?\n\}/) || [''])[0];
chk('compass() 본문을 찾았다', cmp.length > 0, `${cmp.length}자`);
// 전역 ctx 에 그리면 나침반이 지도 위에 겹쳐 나온다 — 눈으로는 늦게 발견된다
chk('전역 ctx 를 쓰지 않는다', !/\bctx\./.test(cmp), 
    (cmp.match(/\bctx\.\w+/g) || []).slice(0,3).join(' '));
chk('전용 컨텍스트(g)로 그린다', /const R0 = COMPASS_R0, g = ctxC/.test(cmp));
chk('screenTransform 을 쓰지 않는다', !/screenTransform/.test(cmp));
chk('매 프레임 지운다', /g\.clearRect\(0,0,COMPASS_SIZE,COMPASS_SIZE\)/.test(cmp));
chk('중심으로 옮긴다', /g\.translate\(COMPASS_SIZE\/2, COMPASS_SIZE\/2\)/.test(cmp));
chk('배율을 건다', /g\.scale\(COMPASS_S, COMPASS_S\)/.test(cmp));
chk('고해상도를 반영한다', /g\.setTransform\(d,0,0,d,0,0\)/.test(cmp) &&
    /function resizeCompass/.test(src));
chk('창 크기가 바뀌면 캔버스도 다시 잡는다', /resizeCompass\(\)/.test(src.match(/function resize\(\)\{[\s\S]*?\r?\n\}/)[0]));

console.log('\n=== 5. 배율이 캔버스에 꼭 맞는가 ===');
const R0  = +(src.match(/COMPASS_R0 = (\d+)/) || [])[1];
const PAD = +(src.match(/COMPASS_PAD = (\d+)/) || [])[1];
chk('배율을 손으로 적지 않고 유도한다',
    /COMPASS_S = \(COMPASS_SIZE\/2\) \/ \(COMPASS_R0 \+ COMPASS_PAD\)/.test(src));
const S = (SIZE/2)/(R0+PAD);
chk('바깥 원이 캔버스에 꽉 찬다', Math.abs((R0+PAD)*S - SIZE/2) < 1e-9,
    `(${R0}+${PAD})×${S.toFixed(3)} = ${SIZE/2}`);
// 방위 글자가 금색 원과 바깥 원 사이에 들어가는가
const FS = Math.max(...(cmp.match(/font='(\d+)px Georgia'/g) || []).map(s => +s.match(/\d+/)[0]));
const LR = R0 + PAD/2, half = FS/2;
chk('방위 글자가 금색 원 바깥이다', LR - half > R0, `여유 ${(LR-half-R0).toFixed(1)}`);
chk('방위 글자가 캔버스 안이다', LR + half < R0 + PAD, `여유 ${(R0+PAD-LR-half).toFixed(1)}`);
console.log('  ── 화면 크기: 지름 ' + SIZE + 'px, 금색 원 지름 ' + (R0*S*2).toFixed(0) + 'px');

console.log('\n=== 6. 바람·해류 바늘 ===');
const HIN  = +((cmp.match(/HAND_IN = (\d+)/) || [])[1]);
const HOUT = +((cmp.match(/HAND_OUT = (\d+)/) || [])[1]);
chk('길이가 고정 상수다', Number.isFinite(HIN) && Number.isFinite(HOUT), `${HIN} ~ ${HOUT}`);
chk('바늘이 금색 원 안에 머문다', HOUT < R0, `${HOUT} < ${R0}`);
const WW = +((cmp.match(/#8fd3e8'; g\.fillRect\(HAND_IN, -([\d.]+)/) || [])[1]);
const CW2 = +((cmp.match(/#c0392b'; g\.fillRect\(HAND_IN, -([\d.]+)/) || [])[1]);
chk('둘 다 직사각형이다', Number.isFinite(WW) && Number.isFinite(CW2));
chk('해류가 바람보다 얇다', CW2 < WW, `${CW2*2} < ${WW*2}`);
chk('폭 차이가 두 배 이상이다', WW/CW2 >= 2, `${(WW/CW2).toFixed(1)}배`);
chk('해류를 바람 위에 그린다',
    cmp.indexOf("#c0392b'; g.fillRect") > cmp.indexOf("#8fd3e8'; g.fillRect"));
chk('바람은 불어오는 쪽', /wFrom = Math\.atan2\(-windVec\.y, -windVec\.x\)/.test(cmp));
chk('해류는 흘러가는 쪽', /rotate\(Math\.atan2\(curVec\.y, curVec\.x\)\)/.test(cmp));
chk('세기로 걸러내지 않는다', /if\(cs > 1e-9\)/.test(cmp));
chk('길이가 세기를 따라가지 않는다', !/HAND_OUT[^;]*(windMs|ckn|cs\b)/.test(cmp));

console.log('\n=== 7. 침로 표식·가운데 속력·숫자 ===');
chk('침로가 금색 원 위의 붉은 점이다', /g\.rotate\(ship\.head\)[\s\S]{0,140}arc\(R0,0,/.test(cmp));
chk('중심 바늘이 없다', !/moveTo\(R0-4,0\)/.test(cmp));
// 가운데 속력 — 원판 위에 숫자와 단위
const DISC = +((cmp.match(/DISC_R = ([\d.]+)/) || [])[1]);
chk('가운데 원판이 있다', Number.isFinite(DISC), `반지름 ${DISC} (화면 ${(DISC*S*2).toFixed(0)}px)`);
chk('바늘이 원판을 침범하지 않는다', HIN >= DISC, `바늘 시작 ${HIN} >= 원판 ${DISC}`);
chk('원판을 바늘보다 나중에 그린다',
    cmp.indexOf('arc(0,0,DISC_R') > cmp.indexOf("#c0392b'; g.fillRect"));
chk('대지속력이다 (해류를 더한다)',
    /Math\.hypot\(ship\.vx \+ curVec\.x, ship\.vy \+ curVec\.y\) \* PX_TO_KN/.test(cmp));
chk('단위를 함께 적는다', /fillText\('kn', 0,/.test(cmp));
// 숫자가 원판 안에 들어가는가 — 글꼴 크기로 폭을 어림한다
const gsFS = +((cmp.match(/g\.font='([\d.]+)px Georgia'; g\.fillStyle='#ffe9b8'/) || [])[1]);
chk('속력 글꼴을 찾았다', Number.isFinite(gsFS), `${gsFS} (화면 ${(gsFS*S).toFixed(0)}px)`);
chk('숫자가 원판 안에 들어간다', gsFS*0.55*4/2 < DISC,
    `"88.8" 반폭 ${(gsFS*0.55*4/2).toFixed(1)} < 원판 ${DISC}`);
// 왼쪽 숫자는 HTML 이 맡는다
chk('숫자를 캔버스에 그리지 않는다', !/fillText\('바람'|fillText\('해류'/.test(cmp));
chk('숫자를 DOM 으로 넣는다', /getElementById\('cWind'\)\.textContent/.test(cmp));
chk('값만 넣고 단위는 HTML 에 둔다',
    /const wTxt = \(ship\.windMs\|\|0\)\.toFixed\(1\);/.test(cmp) &&
    /<div class="u">m\/s<\/div>/.test(src));
chk('한글 라벨이다', /class="k">바람</.test(src) && /class="k2">해류</.test(src));

console.log('\n=== 7-1. 위도·경도 띠 ===');
chk('띠 요소가 캔버스보다 앞이다',
    src.indexOf('<div class="geo" id="cGeo">') < src.indexOf('<canvas id="cCanvas">'));
chk('띠가 카드 안에 있다', /<div id="compass">\s*\r?\n\s*<div class="geo" id="cGeo">/.test(src));
chk('geo\\(\\) 도우미가 있다', /function geo\(v, pos, neg\)/.test(src));
chk('부호 대신 N\\/S·E\\/W 를 붙인다', /\(v>=0\?pos:neg\)/.test(src));
chk('배 위치에서 위도·경도를 낸다',
    /const lon = wrapX\(ship\.x\)\/WORLD_W\*360-180/.test(cmp) &&
    /const lat = 90 - ship\.y\/WORLD_H\*180/.test(cmp));
chk('띠에 값을 넣는다', /getElementById\('cGeo'\)\.innerHTML/.test(cmp));
chk('값이 바뀔 때만 건드린다', /if\(gTxt !== cGeoTxt\)/.test(cmp));
chk('띠가 조정 패널 날짜 띠와 같은 모습이다',
    /background:#121c1a/.test(geoCss) && /border-radius:5px 5px 0 0/.test(geoCss));
chk('사라진 항해일지의 fmt 를 되살리지 않았다', !/function fmt\(/.test(src));

console.log('\n=== 7-2. 왼쪽 숫자 크기 ===');
const cssV = (src.match(/#compass \.v \{[^}]*\}|#compass \.v\{[^}]*\}/) || [''])[0];
const vFS = +((cssV.match(/font-size:(\d+)px/) || [])[1]);
const kFS = +((src.match(/#compass \.k \{font-size:(\d+)px/) || [])[1]);
chk('값 글꼴이 커졌다', vFS >= 24, `${vFS}px`);
chk('라벨도 함께 커졌다', kFS >= 12, `${kFS}px`);
chk('단위가 아랫줄로 내려갔다', /#compass \.u \{/.test(src) && /#compass \.u2\{/.test(src));
// 26px Georgia 로 "0.08" 은 대략 4×0.55×26 = 57px. 칸은 82px.
const est = 4 * 0.55 * vFS;
chk('네 글자가 칸에 들어간다', est < left, `"0.08" 약 ${est.toFixed(0)}px < 칸 ${left}px`);
// 세로로도 넘치지 않아야 한다 (칸 높이 = 캔버스 높이)
const stackH = kFS + vFS*1.05 + 12 + 16 + kFS + vFS*1.05 + 12;
chk('여섯 줄이 세로로 들어간다', stackH < SIZE, `약 ${stackH.toFixed(0)}px < ${SIZE}px`);

console.log('\n=== 8. 걷어낸 것 ===');
for(const dead of ['compassPos', 'COMPASS_CX', 'COMPASS_CY', 'COMPASS_RING', 'FRAME_PAD', 'COMPASS_GAP'])
  chk(`${dead} 제거됨`, !src.includes(dead));

console.log(`\n${fail === 0 ? '전부 통과' : '실패 있음'} — 통과 ${pass}, 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);
