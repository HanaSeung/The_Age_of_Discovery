// verify_compass.js — 원형 계기(DIAL)의 계기 쪽 검증
// 실행: node verify_compass.js
//
// 2026.07.26 나침반 카드와 미니맵을 원형 계기(DIAL)로 합쳤다. 이 파일은 계기
// 쪽(바늘·침로·방위 글자·역풍 부채꼴·모서리 표시·조정 패널 연결)을 맡고,
// 해도 쪽(굽기·축척 단·컬링)은 verify_minimap.js 가 맡는다.
// 주의: world_chart.html 은 CRLF 다. 블록 끝은 \r?\n 으로 잡는다.
"use strict";
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'world_chart.html'), 'utf8');
let pass = 0, fail = 0;
function chk(n, c, note){
  if(c){ pass++; console.log('  OK   ' + n + (note ? '  ' + note : '')); }
  else  { fail++; console.log('  FAIL ' + n + (note ? '  ' + note : '')); }
}
const cut = (a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if(i < 0 || j < 0) throw new Error('원본에서 절을 찾지 못함: ' + a);
  return src.slice(i, j);
};
const dial = cut('// ===== 원형 계기 — 우하', '// ===== 바람 화살표');

console.log('\n=== 1. 구조 — 사각 카드가 없다 ===');
const dialCss = (src.match(/#dial\{[^}]*\}/) || [''])[0];
chk('#dial 규칙을 찾았다', dialCss.length > 0);
chk('HTML 계기가 있다', /<div id="dial">/.test(src));
chk('전용 캔버스가 있다', /<canvas id="dCanvas">/.test(src));
chk('모서리 표시 넷이 있다', /id="dGeo"/.test(src) && /id="dWind"/.test(src) &&
    /id="dCur"/.test(src) && /id="dGs"/.test(src));
chk('버튼 둘이 있다', /id="dOut"/.test(src) && /id="dIn"/.test(src));
chk('버튼에 뜻이 적혀 있다', /title="축소 — 넓게 보기"/.test(src) &&
    /title="확대 — 좁게 보기"/.test(src));
chk('사각 카드 배경이 없다', !/#dial\{[^}]*background/.test(src) &&
    !/#dial\{[^}]*border:/.test(src));

console.log('\n=== 2. 치수 — JS·CSS 가 짝인가 ===');
const SIZE = +((dial.match(/const SIZE = (\d+)/) || [])[1]);
const BAND = +((dial.match(/const BAND = (\d+)/) || [])[1]);
const RC = SIZE/2 - BAND, RL = SIZE/2 - BAND/2;
chk('SIZE 상수를 찾았다', Number.isFinite(SIZE), SIZE + 'px');
chk('CSS 원 크기가 같다',
    new RegExp('#dial\\{[^}]*width:' + SIZE + 'px[^}]*height:' + SIZE + 'px').test(src) &&
    new RegExp('#dial canvas\\{[^}]*width:' + SIZE + 'px[^}]*height:' + SIZE + 'px').test(src));
chk('해도 반지름이 띠에서 유도된다', /const RC\s*=\s*SIZE\/2 - BAND/.test(dial),
    `${SIZE}/2 − ${BAND} = ${RC}`);
chk('방위 글자가 띠 한가운데다', /const RL\s*=\s*SIZE\/2 - BAND\/2/.test(dial), 'RL ' + RL);
// 모서리 판 — 원에 닿지 않아야 한다 (닿으면 원 테두리를 갉아먹는다)
const roCss = (src.match(/#dial \.ro\{[^}]*\}/) || [''])[0];
const roW = +((roCss.match(/width:(\d+)px/) || [])[1]);
const roH = +((roCss.match(/height:(\d+)px/) || [])[1]);
const clear = Math.hypot(SIZE/2 - roW, SIZE/2 - roH) - SIZE/2;
chk('모서리 판 크기를 찾았다', Number.isFinite(roW) && Number.isFinite(roH), `${roW}x${roH}`);
chk('모서리 판이 원에 닿지 않는다', clear > 0, `여유 ${clear.toFixed(1)}px`);
chk('네 모서리에 하나씩이다', /\.ro\.tl\{left:0;top:0/.test(src) && /\.ro\.tr\{right:0;top:0/.test(src) &&
    /\.ro\.bl\{left:0;bottom:0/.test(src) && /\.ro\.br\{right:0;bottom:0/.test(src));
chk('판이 어두운 반투명이다', /\.ro\{[^}]*background:rgba\(18,28,26,\.72\)/.test(src));
// 버튼 — 링 좌우, 세로 중심이 원 중심과 같다
const zoTop = +((src.match(/#dial \.zo\{left:2px;top:(\d+)px/) || [])[1]);
const btnH = +((src.match(/#dial button\{[^}]*height:(\d+)px/) || [])[1]);
chk('버튼이 링 좌우다', /\.zo\{left:2px/.test(src) && /\.zi\{right:2px/.test(src));
chk('버튼 세로 중심이 원 중심이다', zoTop + btnH/2 === SIZE/2,
    `${zoTop} + ${btnH}/2 = ${zoTop + btnH/2}`);

console.log('\n=== 3. 그리는 대상 — 전역 캔버스가 아니다 ===');
const drw = (dial.match(/function draw\(\)\{[\s\S]*?\r?\n  \}/) || [''])[0];
chk('draw() 본문을 찾았다', drw.length > 200, drw.length + '자');
chk('전역 ctx 를 쓰지 않는다', !/\bctx\./.test(drw),
    (drw.match(/\bctx\.\w+/g) || []).slice(0,3).join(' '));
chk('전용 컨텍스트(ctxD→g)로 그린다', /const cvD\s*=\s*byId\('dCanvas'\)/.test(dial) &&
    /g = ctxD/.test(drw));
chk('매 프레임 지운다', /g\.clearRect\(0,0,pw,pw\)/.test(drw));
chk('고해상도를 반영한다', /Math\.min\(window\.devicePixelRatio\|\|1, 2\)/.test(dial));

console.log('\n=== 4. 해도 자르기와 역풍 부채꼴 ===');
const clipAt = drw.indexOf('g.clip()');
const wedgeAt = drw.indexOf("rgba(200,60,40,.16)");
const restoreAt = drw.indexOf('g.restore()', clipAt);
chk('안쪽을 원으로 자른다', clipAt > 0 && /arc\(cx,cy,RC\*d,0,7\); g\.clip\(\)/.test(drw));
chk('역풍 부채꼴이 자르기 안에 있다 — 원 밖으로 새지 않는다',
    clipAt > 0 && wedgeAt > clipAt && wedgeAt < restoreAt);
chk('부채꼴이 배의 역풍 사각을 쓴다', /SHIP\.spec\.nogoDeg\*Math\.PI\/180/.test(drw));
chk('바람은 불어오는 쪽이다', /wFrom = Math\.atan2\(-windVec\.y, -windVec\.x\)/.test(drw));
chk('무풍이면 부채꼴이 없다', /ship\.windMs > P\.windMin/.test(drw));

console.log('\n=== 5. 바람·해류 막대 — 금색 원을 가로질러 걸친다 ===');
const BAR_LEN = +((dial.match(/const BAR_LEN = (\d+)/) || [])[1]);
const BAR_W  = +((dial.match(/const BAR_W\s*= ([\d.]+)/) || [])[1]);
const BAR_W2 = +((dial.match(/const BAR_W2\s*= ([\d.]+)/) || [])[1]);
chk('직사각형이다 — fillRect 로 그린다', /fillRect\(\(RC-BAR_LEN\/2\)\*d/.test(drw));
chk('안팎으로 반씩 걸친다', /\(RC-BAR_LEN\/2\)\*d, -halfW\*d, BAR_LEN\*d/.test(drw),
    `${RC - BAR_LEN/2} ~ ${RC + BAR_LEN/2} (금색 원 ${RC})`);
chk('테두리선을 먼저 두르고 채운다',
    drw.indexOf('strokeRect((RC-BAR_LEN/2)') < drw.indexOf('fillRect((RC-BAR_LEN/2)'));
chk('테두리선이 어두운 색이다', /strokeStyle='rgba\(20,30,28,\.85\)'; g\.lineWidth=BAR_EDGE\*d/.test(drw));
chk('해류가 바람보다 얇다', BAR_W2 < BAR_W, `${BAR_W2} < ${BAR_W}`);
chk('폭 차이가 두 배 이상이다', BAR_W/BAR_W2 >= 2, (BAR_W/BAR_W2).toFixed(1) + '배');
chk('해류를 바람 뒤에 그린다 — 겹쳐도 위에 온다',
    drw.indexOf("bar(wFrom, BAR_W/2, '#8fd3e8')") < drw.indexOf("BAR_W2/2, '#c0392b'"));
chk('해류는 흘러가는 쪽이다', /bar\(Math\.atan2\(curVec\.y, curVec\.x\)/.test(drw));
chk('세기로 걸러낸다 — 0 이면 안 그린다', /if\(cs > 1e-9\)/.test(drw));
chk('길이가 세기를 따라가지 않는다', !/BAR_LEN[^;]*(windMs|\bcs\b)/.test(drw));

console.log('\n=== 6. 침로·방위 글자·배 ===');
chk('침로가 금색 원 위의 붉은 점이다',
    /g\.rotate\(ship\.head\);\r?\n\s*g\.fillStyle='#c0392b'[\s\S]{0,120}arc\(RC\*d,0,HEAD_R\*d/.test(drw));
chk('금색 원을 긋는다', /strokeStyle='#c9b483'[\s\S]{0,80}arc\(cx,cy,RC\*d,0,7\); g\.stroke\(\)/.test(drw));
chk('북만 밝다', /#f2e6bf'; g\.fillText\('N'/.test(drw) &&
    /#b6a988'/.test(drw) && /fillText\('S'/.test(drw));
chk('방위 글자가 띠 한가운데다(RL)', /fillText\('N', cx, cy-RL\*d\)/.test(drw));
chk('배가 한가운데서 침로대로 돈다',
    /g\.translate\(cx,cy\); g\.rotate\(ship\.head\);\r?\n\s*g\.fillStyle = ship\.grounded/.test(drw));
chk('좌초하면 배 색이 바뀐다', /ship\.grounded \? '#e0705f' : '#ffd98a'/.test(drw));

console.log('\n=== 7. 0단 — 8방위 별이 돌아온다 ===');
chk('0단 가지가 있다', /\} else \{\r?\n\s*\/\/ 0단/.test(drw));
chk('별이 8개다', /for\(let i=0;i<8;i\+\+\)/.test(drw));
chk('원래 나침반의 색이다', /rgba\(201,180,131,\.5\)/.test(drw) && /#e7d6a6/.test(drw));
chk('0단은 화면 테두리를 그리지 않는다', /if\(step > 0\)\{\r?\n\s*const k2/.test(drw));

console.log('\n=== 8. 모서리 표시값 — HTML 이 맡는다 ===');
chk('위도·경도를 배 위치에서 낸다',
    /const lon = wrapX\(ship\.x\)\/WORLD_W\*360-180/.test(drw) &&
    /const lat = 90 - ship\.y\/WORLD_H\*180/.test(drw));
chk('geo() 도우미를 쓴다', /function geo\(v, pos, neg\)/.test(src) && /geo\(lat,'N','S'\)/.test(drw));
chk('값이 바뀔 때만 DOM 을 건드린다',
    /if\(sGeo !== tGeo\)/.test(drw) && /if\(sWind !== tWind\)/.test(drw) &&
    /if\(sCur !== tCur\)/.test(drw) && /if\(sGs !== tGs\)/.test(drw));
chk('대지속력이다 — 해류를 더한다',
    /Math\.hypot\(ship\.vx \+ curVec\.x, ship\.vy \+ curVec\.y\)\*PX_TO_KN/.test(drw));
chk('단위를 함께 적는다', /\+' m\/s'/.test(drw) && /\+' kn'/.test(drw));
chk('캔버스에 숫자를 그리지 않는다', !/fillText\('바람'|fillText\('해류'|fillText\('kn'/.test(drw));
chk('이름표가 한글이다', /<s>바람<\/s>/.test(src) && /<s>해류<\/s>/.test(src) &&
    /<s>대지속력<\/s>/.test(src));

console.log('\n=== 9. 조정 패널 연결 ===');
chk('해도 단 손잡이가 있다', /\['\*dialStep', '해도 단',\s*0,\s*6,\s*1,/.test(src));
chk('말풍선이 있다', /'\*dialStep' : '우하 원형 계기/.test(src));
chk('단마다 뜻이 적혀 있다', /'\*dialStep' : '0 없음\(방위\) · 1 250/.test(src));
chk('읽기가 DIAL.step 을 본다', /if\(key === '\*dialStep'\) return DIAL\.step;/.test(src));
chk('쓰기가 DIAL.setStep 을 부른다', /if\(key === '\*dialStep'\)\{ DIAL\.setStep\(v\); return; \}/.test(src));
chk('기본값 칸은 비운다', /key === '\*zoom' \|\| key === '\*dialStep'/.test(src));
chk('되돌리기 스냅샷에 든다', /dial:DIAL\.step/.test(src) &&
    /if\(typeof o\.dial === 'number'\) DIAL\.setStep\(o\.dial\);/.test(src));
chk('저장 키가 v4 로 올랐다', /const LS = 'aod_tune_v4'/.test(src) && !/aod_tune_v3/.test(src));

console.log('\n=== 10. 걷어낸 것 ===');
for(const dead of ['COMPASS_R0','COMPASS_PAD','COMPASS_SIZE','COMPASS_S','resizeCompass',
                   'function compass()','cCanvas','cWind','cGeo','DISC_R','HAND_IN','HAND_OUT',
                   '#compass','id="mini"','mScale','MINI.draw','barKm','BAR_NICE','GRAT_DEG'])
  chk(`${dead} 제거됨`, !src.includes(dead));
chk('여닫기 저장(aod_mini)은 청소 코드에만 남는다',
    (src.match(/aod_mini/g) || []).length === 3,
    (src.match(/aod_mini/g) || []).length + '곳 (removeItem 2 + 주석 1)');

console.log(`\n${fail === 0 ? '전부 통과' : '실패 있음'} — 통과 ${pass}, 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);
