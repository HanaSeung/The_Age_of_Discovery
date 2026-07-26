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
chk('모서리 판을 걷어냈다 — 네 값이 모두 원 안이다',
    !/id="dGeo"/.test(src) && !/id="dWind"/.test(src) && !/id="dCur"/.test(src) &&
    !/#dial \.ro/.test(src));
chk('원 밖에 남은 것은 버튼뿐이다',
    !/class="ro (tl|tr|bl|br)"/.test(src) && !/id="dGs"/.test(src));
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
// 조정 패널이 계기와 같은 폭으로 선다 — CSS 는 SIZE 를 읽지 못하니 값으로 대조한다
const tuneW = +((src.match(/#tune\{[^}]*width:(\d+)px/) || [])[1]);
chk('조정 패널 폭이 계기 지름과 같다', tuneW === SIZE, `패널 ${tuneW}px = 계기 ${SIZE}px`);
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

console.log('\n=== 5. 세 점 — 금색 원 위에 얹혀 돈다 ===');
const DOT_R = +((dial.match(/const DOT_R\s*=\s*([\d.]+)/) || [])[1]);
const DOT_EDGE_W = +((dial.match(/const DOT_EDGE_W\s*=\s*([\d.]+)/) || [])[1]);
const col = n => ((dial.match(new RegExp('const ' + n + "\\s*=\\s*'(#[0-9a-f]{6})'", 'i')) || [])[1] || '');
const DOT_EDGE = col('DOT_EDGE'), HEAD_C = col('HEAD_C'),
      WIND_C = col('WIND_C'), CUR_C = col('CUR_C');
chk('점 상수를 찾았다', Number.isFinite(DOT_R) && Number.isFinite(DOT_EDGE_W),
    `반지름 ${DOT_R}, 테두리 ${DOT_EDGE_W}`);
chk('셋이 한 함수를 나눠 쓴다 — 크기·테두리가 어긋날 수 없다',
    /function dot\(ang, ?fill\)\{/.test(drw));
chk('원이다 — 중심이 금색 원 위다', /arc\(RC\*d, ?0, ?DOT_R\*d/.test(drw),
    `${RC - DOT_R} ~ ${RC + DOT_R} (금색 원 ${RC})`);
chk('채운 뒤 테두리를 두른다', /g\.fill\(\); ?g\.stroke\(\)/.test(drw));
chk('테두리 색·굵기가 상수다',
    /strokeStyle=DOT_EDGE; ?g\.lineWidth=DOT_EDGE_W\*d/.test(drw));
chk('색 넷을 상수로 뽑았다', !!(DOT_EDGE && HEAD_C && WIND_C && CUR_C),
    `테두리 ${DOT_EDGE} / 침로 ${HEAD_C} / 바람 ${WIND_C} / 해류 ${CUR_C}`);
chk('세 채움색이 서로 다르다 — 크기가 같아 색이 유일한 구분이다',
    new Set([HEAD_C, WIND_C, CUR_C]).size === 3);
chk('바람이 자수정색이다', WIND_C.toLowerCase() === '#8e6bb5', WIND_C);
chk('해류가 하늘색이다 — 물빛', CUR_C.toLowerCase() === '#8fd3e8', CUR_C);
chk('침로가 테두리색과 다르다 — 채움이 묻히지 않는다',
    HEAD_C.toLowerCase() !== DOT_EDGE.toLowerCase());
// 그리는 차례가 곧 겹칠 때의 위아래다. 크기가 같아진 뒤로 이것이 유일한 구분 수단이다
const iW = drw.indexOf('dot(wFrom'), iC = drw.indexOf('dot(Math.atan2(curVec'),
      iH = drw.indexOf('dot(ship.head');
chk('셋을 모두 그린다', iW > 0 && iC > 0 && iH > 0);
chk('차례가 바람 → 해류 → 침로다 — 침로가 늘 맨 위다', iW < iC && iC < iH);
chk('바람은 불어오는 쪽이다', /dot\(wFrom, ?WIND_C\)/.test(drw));
chk('해류는 흘러가는 쪽이다', /dot\(Math\.atan2\(curVec\.y, curVec\.x\), ?CUR_C\)/.test(drw));
chk('세기로 걸러낸다 — 0 이면 안 그린다', /if\(cs > 1e-9\)/.test(drw));
chk('무풍이면 바람 점이 없다', /if\(wFrom !== null\) dot\(wFrom/.test(drw));
chk('침로는 늘 그린다 — 걸러내지 않는다', /\r?\n\s*dot\(ship\.head, ?HEAD_C\);/.test(drw));
chk('크기가 세기를 따라가지 않는다', !/DOT_R[^;]*(windMs|\bcs\b)/.test(drw));
// 파수꾼 — 옛 막대의 잔재가 남으면 알린다
chk('옛 막대 상수가 지워졌다',
    !/BAR_LEN|BAR_W2?\b|BAR_EDGE/.test(dial), '(BAR_LEN·BAR_W·BAR_W2·BAR_EDGE)');
chk('옛 막대 그리기가 지워졌다', !/strokeRect|fillRect/.test(drw.slice(0, iH)));

console.log('\n=== 6. 금색 원·방위 글자·배 ===');
// 침로 점의 모양은 5절이 본다. 여기서는 그것이 따로 그려지지 않는지만 지킨다 —
// 손으로 따로 그리는 순간 바람·해류와 크기가 어긋난다
chk('침로 점을 따로 그리지 않는다 — dot() 하나로 모았다',
    !/g\.rotate\(ship\.head\);\r?\n\s*g\.fillStyle='#/.test(drw));
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

console.log('\n=== 8. 표시값 넷 — 모두 원 안, 캔버스가 그린다 ===');
const num = n => +((dial.match(new RegExp('const ' + n + '\\s*=\\s*([\\d.]+)')) || [])[1]);
const RING_R = num('RING_R'), GEO_GAP = num('GEO_GAP'), GEO_F = num('GEO_F'),
      SIDE_W = num('SIDE_W'), TAG_GAP = num('TAG_GAP'), VAL_GAP = num('VAL_GAP'),
      TAG_R = num('TAG_R'), VAL_F = num('VAL_F'), UNIT_F = num('UNIT_F'),
      GS_F = num('GS_F'), DOT_R2 = num('DOT_R');
chk('자리·크기를 모두 상수로 뽑았다',
    [RING_R,GEO_GAP,GEO_F,SIDE_W,TAG_GAP,VAL_GAP,TAG_R,VAL_F,UNIT_F,GS_F].every(Number.isFinite));
chk('글자를 한 도우미로 그린다 — 외곽선 두르기가 어긋날 수 없다',
    /function lab\(s, ?x, ?y, ?sz, ?fill, ?al\)\{/.test(drw));
chk('어두운 외곽선을 먼저 두르고 채운다 — 지형 위에서도 읽힌다',
    /strokeStyle='rgba\(20,30,28,\.9\)'[\s\S]{0,90}strokeText\(s, ?x, ?y\); ?g\.fillStyle=fill; ?g\.fillText\(s, ?x, ?y\)/.test(drw));
// 넷이 한 자리를 나눠 쓴다 — 자리 상수가 하나뿐이어야 어긋날 수 없다
chk('기준 원을 한 번만 잰다', /const ringR = RC\*RING_R\*d/.test(drw),
    `바깥 끝이 해도 반지름의 ${(RING_R*100).toFixed(0)}% = ${(RC*RING_R).toFixed(1)}px`);
chk('옛 자리 상수 셋이 하나로 합쳐졌다', !/GEO_R|SIDE_IN|GS_R|UNIT_DY/.test(dial));
// 넷의 '바깥 끝'을 맞춘다 — 기준점의 뜻이 자리마다 달라 각자 제 몫만큼 물려 그린다
chk('위경도가 글자 절반만큼 물러난다 — 윗줄의 바깥 끝이 기준 원이다',
    /const geoY = cy - ringR \+ GEO_F\/2\*d/.test(drw) &&
    /lab\(geo\(lat,'N','S'\), cx, geoY, ?GEO_F/.test(drw) &&
    /geoY \+ GEO_GAP\*d, ?GEO_F/.test(drw));
chk('대지속력이 글자 절반만큼 물러난다', /cx, cy \+ ringR - GS_F\/2\*d, ?GS_F/.test(drw));
chk('해류는 색점 반지름만큼 물러난다 — 색점이 블록의 바깥 끝이다',
    /side\(cx - ringR \+ TAG_R\*d, ?1,/.test(drw));
chk('바람은 블록 너비만큼 물러난다 — 단위가 바깥 끝이다',
    /side\(cx \+ ringR - SIDE_W\*d, ?1,/.test(drw), `${SIDE_W}px`);
chk('물러나는 양이 모두 제 크기에서 나온다 — 글자 크기를 바꿔도 따라간다',
    /GEO_F\/2\*d/.test(drw) && /GS_F\/2\*d/.test(drw) && /TAG_R\*d, ?1,/.test(drw));
// 위도·경도
chk('위도·경도를 배 위치에서 낸다',
    /const lon = wrapX\(ship\.x\)\/WORLD_W\*360-180/.test(drw) &&
    /const lat = 90 - ship\.y\/WORLD_H\*180/.test(drw));
chk('geo() 도우미를 쓴다', /function geo\(v, pos, neg\)/.test(src) && /geo\(lat,'N','S'\)/.test(drw));
// 해류(좌)·바람(우) — 색점·값·단위가 한 줄
chk('좌우를 한 도우미로 그린다', /function side\(tagX, ?dir, ?val, ?unit, ?tagC, ?valC, ?unitC\)\{/.test(drw));
chk('색점을 따로 그린다 — 이름표를 색이 대신한다', /function tag\(x, ?y, ?fill\)\{/.test(drw));
chk('색점·값·단위가 한 줄이다 — 셋 다 cy 에 앉는다',
    /tag\(tagX, ?cy, ?tagC\)/.test(drw) && /lab\(val, ?vx, ?cy/.test(drw) &&
    /lab\(unit, ?ux, ?cy/.test(drw));
chk('색점이 값보다 먼저 온다 — 좌우가 같은 읽기 차례다',
    /const vx = tagX \+ dir\*TAG_GAP\*d/.test(drw) && !/dir ?< ?0/.test(drw));
chk('단위가 값 너비만큼 밀려난다', /g\.measureText\(val\)\.width \+ VAL_GAP\*d/.test(drw));
chk('해류가 왼쪽, 바람이 오른쪽이다',
    drw.indexOf('CUR_C, CUR_V, CUR_U') < drw.indexOf('WIND_C, WIND_V, WIND_U') &&
    /side\(cx - ringR[\s\S]{0,80}CUR_C/.test(drw) && /side\(cx \+ ringR[\s\S]{0,90}WIND_C/.test(drw));
chk('색점이 원 위의 점과 같은 색을 쓴다 — 상수를 공유한다',
    /side\([^;]*CUR_C, ?CUR_V, ?CUR_U\)/.test(drw) && /side\([^;]*WIND_C, ?WIND_V, ?WIND_U\)/.test(drw));
chk('단위가 값보다 작다', UNIT_F < VAL_F, `${UNIT_F} < ${VAL_F}`);
chk('단위가 제 것을 적는다', /'kn', ?CUR_C/.test(drw) && /'m\/s', ?WIND_C/.test(drw));
chk('해류는 노트, 바람은 초속이다',
    /\(cs\*PX_TO_KN\)\.toFixed\(2\)/.test(drw) && /\(ship\.windMs\|\|0\)\.toFixed\(1\)/.test(drw));
// 대지속력 — 값은 바뀌지 않았다
chk('대지속력을 배 속도와 해류의 합에서 낸다',
    /const gs = Math\.hypot\(ship\.vx \+ curVec\.x, ship\.vy \+ curVec\.y\)\*PX_TO_KN/.test(drw));
chk('대지속력이 넷 중 가장 크다', GS_F >= VAL_F && GS_F >= GEO_F,
    `${GS_F} ≥ 값 ${VAL_F}, 위경도 ${GEO_F}`);
chk('대지속력이 배보다 먼저 그려진다 — 배가 위에 온다',
    drw.indexOf('cy + ringR') < drw.indexOf('// 10. 배'));
// 바깥 끝이 곧 기준 원이다 — 원 위의 점(반지름 RC±DOT_R)에 닿지 않아야 한다
const inner = RC - DOT_R2, ringPx = RC*RING_R;
chk('바깥 끝이 점에 닿지 않는다', ringPx < inner,
    `${ringPx.toFixed(1)} < ${inner}  (여유 ${(inner - ringPx).toFixed(1)}px)`);
chk('바깥 끝이 금색 원 안이다', ringPx < RC, `${ringPx.toFixed(1)} < ${RC}`);
chk('위경도 아랫줄은 안쪽으로 들어온다', GEO_GAP > 0, `${(ringPx - GEO_GAP).toFixed(1)}px`);
chk('대지속력이 S 방위 글자와 겹치지 않는다', ringPx < RL - 6,
    `${ringPx.toFixed(1)} < ${RL - 6}  (S 반지름 ${RL})`);
chk('배(중앙)에서 충분히 내려와 있다', ringPx - GS_F > 60, (ringPx - GS_F).toFixed(1) + 'px');
chk('왼쪽 색점이 배와 겹치지 않는다', ringPx - 2*TAG_R > 12,
    `${(ringPx - 2*TAG_R).toFixed(1)}px > 12px (배 반지름)`);
chk('오른쪽 색점이 배와 겹치지 않는다', ringPx - SIDE_W > 12,
    `${(ringPx - SIDE_W).toFixed(1)}px > 12px`);
chk('오른쪽 블록이 흔한 자릿수에서 기준 원에 닿는다', SIDE_W > TAG_GAP + VAL_F + VAL_GAP,
    `${SIDE_W}px (틈 ${TAG_GAP} + 값 + 틈 ${VAL_GAP} + 단위)`);
// 파수꾼 — 모서리 판으로 되돌아가지 않는가
chk('DOM 캐시를 걷어냈다', !/tGeo|tWind|tCur|tGs/.test(dial));
chk('DOM 을 건드리지 않는다', !/innerHTML|textContent/.test(drw));

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
