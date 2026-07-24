// verify_ship.js — 배 정의 / 일반 탭 / 디버그 탭 대상 고르개
// 실행: node verify_ship.js
"use strict";
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, 'world_chart.html'), 'utf8');
let pass = 0, fail = 0;
function chk(n, c, note){
  if(c){ pass++; console.log('  OK   ' + n + (note ? '  ' + note : '')); }
  else  { fail++; console.log('  FAIL ' + n + (note ? '  ' + note : '')); }
}

console.log('\n=== 1. 배 정의 ===');
const shipsSrc = (src.match(/const SHIPS = \{[\s\S]*?\r?\n\};/) || [''])[0];
chk('SHIPS 정의를 찾았다', shipsSrc.length > 0);
chk('spec·state·cargo 로 나뉜다',
    /spec\s*:/.test(shipsSrc) && /state\s*:/.test(shipsSrc) && /cargo\s*:/.test(shipsSrc));
for(const k of ['speedKn','sailMax','turnDeg','turnIdle','accUp','accDn',
                'nogoDeg','draft','sight','hullMax','crewMax','holdMax'])
  chk('능력치 ' + k, new RegExp(k + '\\s*:').test(shipsSrc));
for(const k of ['hull','crew','morale']) chk('상태 ' + k, new RegExp('\\b'+k+'\\s*:').test(shipsSrc));
for(const k of ['water','food','timber','shot']) chk('물자 ' + k, new RegExp(k + '\\s*:').test(shipsSrc));
chk('초기값을 따로 보존한다', /const SHIP0 = JSON\.parse\(JSON\.stringify\(SHIPS\)\)/.test(src));

console.log('\n=== 2. 배 값이 P 에서 빠졌는가 ===');
const pSrc = (src.match(/const P = \{[\s\S]*?\r?\n\};/) || [''])[0];
for(const k of ['speedKn','turnDeg','nogoDeg','sailMax','accUp','accDn','turnIdle'])
  chk(`P 에 ${k} 가 없다`, !new RegExp('^\\s*'+k+'\\s*:', 'm').test(pSrc));
for(const k of ['hoursPerSec','windMin','windFull','windGain','shipScale','curGain'])
  chk(`P 에 ${k} 는 남았다`, new RegExp('^\\s*'+k+'\\s*:', 'm').test(pSrc));
chk('죽은 boost 가 사라졌다', !/boost/.test(src));
// 옛 참조가 하나라도 남으면 undefined 로 조용히 굴러간다
const stale = (src.match(/P\.(speedKn|turnDeg|nogoDeg|sailMax|accUp|accDn|turnIdle|boost)\b/g) || []);
chk('옛 P.* 참조가 없다', stale.length === 0, stale.join(' '));
chk('syncDerived 가 SHIP.spec 을 읽는다', /function syncDerived\(\)\{\s*\r?\n\s*const s = SHIP\.spec;/.test(src));
chk('polar 가 SHIP.spec 을 읽는다', /const nogo = SHIP\.spec\.nogoDeg/.test(src));

console.log('\n=== 3. 디버그 탭 — 대상 고르개 ===');
chk('고르개가 있다', /<select id="tTarget">/.test(src));
chk('SHIPS 에서 항목을 만든다', /for\(const key in SHIPS\)[\s\S]{0,120}<option value=/.test(src));
chk('고르면 패널을 다시 짓는다',
    /tTarget'\)\.addEventListener\('change'[\s\S]{0,160}build\(\); refresh\(\)/.test(src));
chk('배 이름·범장을 함께 보여준다', /class="tgt2">'\+SHIP\.name/.test(src));
// 키 앞 표시로 저장 위치를 가른다
chk('키 표시 규칙이 있다', /const GRP = \{ s:'spec', t:'state', c:'cargo' \}/.test(src));
for(const [pre,grp] of [['s','능력치'],['t','상태'],['c','물자']])
  chk(`${grp} 슬라이더가 있다`, new RegExp("'"+pre+":").test(src));
chk('읽기·쓰기를 한 통로로 한다', /function pget\(/.test(src) && /function pset\(/.test(src));
chk('id 에서 특수문자를 뺀다', /idOf = k => k\.replace\(\/\[\*:\]\/g, '_'\)/.test(src));
// 상태·물자 상한을 정원과 묶지 않았는지 (묶으면 정원을 줄일 때 현재값이 잘린다)
const specSrc = (src.match(/const SHIP_SPEC = \[[\s\S]*?\r?\n  \];/) || [''])[0];
chk('상태 상한이 고정 숫자다', /'t:crew',[^\]]*\b300\b/.test(specSrc));
chk('물자 상한이 고정 숫자다', /'c:water',[^\]]*\b999\b/.test(specSrc));

console.log('\n=== 4. 저장·되돌리기·값 복사 ===');
chk('저장에 배가 들어간다', /localStorage\.setItem\(LS, JSON\.stringify\(\{ P:P, zoom:targetZoom, ships:SHIPS \}\)\)/.test(src));
chk('저장 키를 올렸다 (옛 값 무효화)', /const LS = 'aod_tune_v3'/.test(src));
chk('있는 항목만 덮어쓴다', /if\(typeof src\[grp\]\[k\]==='number'\) SHIPS\[key\]\[grp\]\[k\] = src\[grp\]\[k\]/.test(src));
chk('되돌리기가 배까지 되돌린다', /Object\.assign\(SHIPS\[key\]\[grp\], SHIP0\[key\]\[grp\]\)/.test(src));
chk('값 복사가 능력치와 시작값을 나눈다',
    /능력치 — 확정하면/.test(src) && /상태·물자 — 확정값이 아니라 시작값이다/.test(src));

console.log('\n=== 5. 일반 탭 ===');
chk('renderGeneral() 이 있다', /function renderGeneral\(\)/.test(src));
chk('refresh 에서 함께 그린다', /pull\(\);\s*\r?\n\s*renderGeneral\(\);/.test(src));
const gen = (src.match(/function renderGeneral\(\)\{[\s\S]*?\r?\n  \}/) || [''])[0];
// 배 성능 — 이 일곱 개만, 이 순서로, 전부 막대
const WANT = ['선회력','추진력','내구도','흘수','감시범위','승무원','컨디션'];
const shown = (gen.match(/(?:row|num)\('([^']+)'/g) || []).map(s => s.match(/'([^']+)'/)[1]);
const perf = shown.slice(0, 7);
chk('배 성능이 일곱 줄이다', perf.length === 7, perf.join(' · '));
chk('항목과 순서가 맞는다', perf.join(',') === WANT.join(','), perf.join(' · '));
for(const x of ['역풍 사각','돛 단수'])
  chk(`${x} 는 빠졌다`, !gen.includes("'"+x+"'"));
for(const lab of WANT) chk(`${lab} 에 막대가 있다`, new RegExp("row\\('"+lab+"'").test(gen));
// 단위 제거 — 배 성능 일곱 줄에는 단위 글자가 없어야 한다
// 주의: 함수 정의 쪽 주석에도 '물자' 가 나오므로 소제목 표시로 잘라야 한다
const perfBlock = gen.slice(gen.indexOf("'<h4>배 성능</h4>'"), gen.indexOf("'<h4>물자</h4>'"));
chk('배 성능 구간을 잘라냈다', perfBlock.length > 100, perfBlock.length + '자');
for(const u of ["'°/초'", "'kn'", "'m'", "'km'"])
  chk(`단위 ${u} 가 없다`, !perfBlock.includes(u));
chk('정원은 남긴다 (/ 200 같은 것)', /\/ '\+s\.hullMax/.test(perfBlock));

console.log('\n=== 5-2. 막대 척도와 눈금 ===');
chk('척도를 슬라이더 범위에서 만든다',
    /for\(const sp of SHIP_SPEC\) if\(sp\[0\]\[0\] !== '@'\) RANGE\[sp\[0\]\] = \[sp\[2\], sp\[3\]\]/.test(src));
chk('rng\\(\\) 로 비율을 낸다', /const rng = \(key, v\) =>/.test(src));
for(const k of ['s:turnDeg','s:speedKn','s:draft','s:sight'])
  chk(`${k} 를 척도로 쓴다`, gen.includes("rng('"+k+"'"));
chk('흘수만 뒤집는다', /1-rng\('s:draft'/.test(gen));
chk('다른 능력치는 안 뒤집는다', !/1-rng\('s:(turnDeg|speedKn|sight)'/.test(gen));
// 눈금 — 출항할 때의 값
chk('처음값을 SHIP0 에서 가져온다', /const s0 = SHIP0\[SHIP\.key\]\.spec, t0 = SHIP0\[SHIP\.key\]\.state/.test(gen));
chk('눈금을 그린다', /<u style="left:'\+\(cl\(tick\)\*100\)/.test(gen));
chk('눈금 CSS 가 있다', /#tune \.gr \.gb u\{position:absolute/.test(src));
chk('막대 칸이 눈금을 자르지 않는다', !/#tune \.gr \.gb\{[^}]*overflow:hidden/.test(src));
chk('상태 눈금이 처음 상태다', /t0\.crew\/s\.crewMax/.test(gen) && /t0\.morale\/100/.test(gen));
chk('컨디션 색이 값에 따라 바뀐다', /mor > 60 \? '#9fe0a0' : mor > 30/.test(gen));
chk('적재 초과를 붉게 알린다', /load > s\.holdMax \? '#e0705f'/.test(gen));

console.log('\n=== 5-3. 맨 위 띠 ===');
chk('renderBands() 가 있다', /function renderBands\(\)/.test(src));
chk('refresh 에서 함께 그린다', /renderGeneral\(\);\s*\r?\n\s*renderBands\(\);/.test(src));
chk('띠가 메뉴보다 앞이다', /'<div class="head" id="tHead"><\/div><div class="menu">'/.test(src));
chk('띠가 스크롤 밖이다', /#tune \.head\{flex:0 0 auto/.test(src));
chk('날짜를 표기 표에서 만든다', /const f = DATEFMT\.find\(x => x\[0\] === dateFmt\)/.test(src));
chk('표기마다 글자 크기를 함께 준다', /'<b style="font-size:'\+f\[3\]\+'px">'/.test(src));
chk('항해일이 그 아래 줄이다', /<em>항해 <b>'\+\(Math\.floor\(gameDay - voyageStartDay\)\+1\)/.test(src));
chk('em 이 블록으로 줄을 바꾼다', /#tune \.head em\{display:block/.test(src));

console.log('\n=== 5-3-1. 숫자 글꼴이 한 벌인가 ===');
chk('숫자 글꼴을 변수 하나로 둔다', /:root\{ --numfont: [^}]+\}/.test(src));
chk('CSS 에 Georgia 를 직접 적은 곳이 없다',
    !/font-family:Georgia,serif/.test(src.split('</style>')[0]));
const numSpots = (src.split('</style>')[0].match(/var\(--numfont\)/g) || []).length;
chk('숫자 자리가 모두 변수를 쓴다', numSpots >= 5, `${numSpots}곳`);
chk('날짜 줄을 통째로 <b> 로 감쌌다', /'<b style="font-size:'[\s\S]{0,80}\+f\[2\]\(c\)\+'<\/b>'/.test(src));
chk('띠 숫자에 글꼴을 건다', /#tune \.head b\{font-family:var\(--numfont\)/.test(src));
chk('monospace 숫자가 남아 있지 않다',
    !/#tune \.head em b\{[^}]*monospace/.test(src) && !/#tune \.gr>b\{[^}]*monospace/.test(src));
// 캔버스 글자는 CSS 변수를 못 읽으므로 따로 맞춰야 한다 — 잊지 않도록 주석을 남겼는지 본다
chk('캔버스는 따로라는 것을 적어 뒀다', /캔버스에 직접 그리는 나침반 글자는 CSS 변수를 못 읽/.test(src));
chk('아래 띠는 없앴다', !/class="foot"/.test(src) && !/tFoot/.test(src));
chk('항해일 기준이 출항일이다', /let voyageStartDay = 0;/.test(src));
chk('출항 함수를 미리 만들어 뒀다', /function departPort\(\)\{ voyageStartDay = gameDay; \}/.test(src));
chk('메뉴의 둥근 윗모서리를 띠에 넘겼다',
    /#tune \.head\{[^}]*border-radius:5px 5px 0 0/.test(src) &&
    !/#tune \.menu\{[^}]*border-radius/.test(src));

console.log('\n=== 6. 물·식량 소비 규칙 (실제로 돌려본다) ===');
const consumeSrc = (src.match(/const RATION_PER30[\s\S]*?\r?\nfunction consume\(days\)\{[\s\S]*?\r?\n\}/) || [''])[0];
chk('consume() 을 찾았다', consumeSrc.length > 0);
chk('update 에서 게임일 기준으로 부른다', /consume\(dt \* TIMEK\)/.test(src));
const box = { SHIP:{ state:{ hull:200, crew:32, morale:90 }, cargo:{ water:40, food:40, timber:20, shot:60 } }, Math };
vm.createContext(box);
vm.runInContext(consumeSrc, box);
// 하루씩 60일 굴려본다
const log = [];
for(let d=1; d<=60; d++){
  vm.runInContext('consume(1)', box);
  if([10,20,30,36,40,50,60].includes(d))
    log.push([d, box.SHIP.cargo.water.toFixed(1), box.SHIP.state.morale.toFixed(0), box.SHIP.state.crew.toFixed(1)]);
}
console.log('     일차   물    컨디션  승무원');
for(const [d,w,m,c] of log) console.log('     ' + String(d).padStart(3) + '  ' + String(w).padStart(5) +
                                        '   ' + String(m).padStart(4) + '   ' + String(c).padStart(5));
chk('물이 실제로 준다', box.SHIP.cargo.water < 40);
chk('언젠가 바닥난다', box.SHIP.cargo.water === 0);
chk('바닥난 뒤 컨디션이 깎인다', box.SHIP.state.morale < 90);
chk('컨디션이 0 아래로 안 간다', box.SHIP.state.morale >= 0);
chk('컨디션이 0 이 된 뒤에야 승무원이 준다', box.SHIP.state.crew < 32);
chk('승무원이 음수가 안 된다', box.SHIP.state.crew >= 0);
// 보급하면 회복되는가
box.SHIP.cargo.water = 999; box.SHIP.cargo.food = 999;
const m0 = box.SHIP.state.morale;
vm.runInContext('consume(10)', box);
chk('보급하면 컨디션이 회복된다', box.SHIP.state.morale > m0,
    `${m0.toFixed(0)} → ${box.SHIP.state.morale.toFixed(0)}`);

console.log('\n=== 7. 스페이스바 정지 ===');
chk('paused 상태가 있다', /let paused = false;/.test(src));
chk('스페이스바가 토글한다', /if\(k===' ' && !e\.repeat\)\{ paused = !paused/.test(src));
chk('자동반복을 무시한다', /k===' ' && !e\.repeat/.test(src));
// 시간만 멈추고 그리기는 계속 돌아야 배율·패널 조작이 살아 있다
const loopSrc = (src.match(/function loop\(now\)\{[\s\S]*?\r?\n\}/) || [''])[0];
chk('loop() 를 찾았다', loopSrc.length > 0);
chk('정지 중에는 update 를 건너뛴다', /if\(!paused\)\{[\s\S]{0,120}update\(dt\)/.test(loopSrc));
chk('해류 입자도 함께 멈춘다', /if\(!paused\)\{[\s\S]{0,160}CURVIZ\.step\(dt\)/.test(loopSrc));
chk('그리기는 정지 밖에 있다',
    loopSrc.indexOf('drawWorld') > loopSrc.indexOf('if(!paused)') &&
    !/if\(!paused\)\{[\s\S]*drawWorld/.test(loopSrc.slice(0, loopSrc.indexOf('drawWorld'))));
chk('나침반도 계속 그린다', /compass\(\);/.test(loopSrc));
// 좌상단 항해일지는 걷어냈다. 정지 표시는 안내줄 하나만 남는다.
chk('안내줄에 표시한다', /paused\?'on':'off'[\s\S]{0,60}Space/.test(src));
chk('사라진 항해일지를 참조하지 않는다', !/drawHUD|getElementById\('hud'\)/.test(src));
chk('브라우저 스크롤을 막는다', /includes\(k\)\) e\.preventDefault\(\)/.test(src) &&
    /'arrowright',' '\]/.test(src));

console.log('\n=== 5-1. 정수로만 보이는가 ===');
// 속은 실수로 두되 화면에는 정수만 나와야 한다.
// 물자는 sup() 이 한 곳에서 반올림한다 (예전엔 네 줄이 각자 했다)
chk('물자를 sup() 이 반올림해 찍는다', /return row\(lab, R\(v\)\+' <i>\/ '\+R\(base\)/.test(gen));
chk('R 이 Math.round 다', /const R = Math\.round, cl =/.test(gen));
chk('막대 줄의 값도 정수다', /R\(t\.hull\)/.test(gen) && /R\(t\.crew\)/.test(gen) &&
    /R\(mor\)/.test(gen) && /R\(load\)/.test(gen));
// 디버그 탭 슬라이더도 소수자리 0 이어야 한다
for(const k of ['c:water','c:food','c:timber','c:shot','t:hull','t:crew'])
  chk(`슬라이더 ${k} 가 소수자리 0`, new RegExp("'"+k+"'[^\\]]*,\\s*0\\s*\\]").test(specSrc));
// 실수로 남겨야 하는 것 — 반올림해 저장하면 조금씩 주는 소비가 영영 반영 안 된다
chk('저장값을 반올림하지 않는다', !/cg\.water = Math\.round/.test(src) &&
    !/st\.crew = Math\.round/.test(src));

console.log('\n=== 5-4. 물자 막대 ===');
for(const lab of ['물','식량','자재','포탄'])
  chk(`${lab} 에 막대가 있다`, new RegExp("sup\\('"+lab+"'").test(gen));
chk('sup() 이 row() 를 쓴다', /function sup\(lab, v, base, col\)\{[\s\S]{0,220}return row\(/.test(gen));
chk('척도가 출항할 때 실은 양이다', /const c0 = |c0 = SHIP0\[SHIP\.key\]\.cargo/.test(gen) &&
    /sup\('물',\s+c\.water,\s+c0\.water/.test(gen));
chk('슬라이더 범위(0~999)를 안 쓴다', !/rng\('c:/.test(gen));
chk('0 으로 나누지 않는다', /const b = base > 0 \? base : 1;/.test(gen));
chk('막대가 100% 를 넘지 않는다', /cl\(r\)\*100/.test(gen));
chk('적게 남으면 붉어진다', /r < 0\.25 \? '#e0705f'/.test(gen));
chk('남은 양과 처음 양을 함께 적는다', /R\(v\)\+' <i>\/ '\+R\(base\)/.test(gen));
chk('쓰지 않는 num\\(\\) 이 남아 있지 않다', !/const num = \(lab,v,u\)/.test(gen));
// 값이 실제로 그럴듯하게 나오는가 — 비율을 손으로 계산해 본다
for(const [lab,v,b] of [['물',28,40],['식량',9,40],['자재',20,20]]){
  const r = v/b, red = r < 0.25;
  console.log('     ' + lab.padEnd(3) + ' ' + String(v).padStart(3) + '/' + String(b).padEnd(4) +
              ' → ' + (r*100).toFixed(0).padStart(3) + '%' + (red ? '  (붉음)' : ''));
}
chk('경고 문턱이 4분의 1이다', /r < 0\.25/.test(gen));

console.log('\n=== 5-5. 날짜 표기 ===');
chk('요일이 영문이다', /const DOW = \['Sun','Mon','Tue','Wed','Thu','Fri','Sat'\]/.test(src));
chk('한글 요일도 함께 둔다', /const DOWK = \['일','월','화','수','목','금','토'\]/.test(src));
chk('줄인 달 이름이 있다', /const MON = \['Jan','Feb','Mar'/.test(src));
chk('전체 달 이름이 있다', /const MONF = \['January','February','March'/.test(src));
chk('시작 요일 상수가 있다', /const EPOCH_DOW = 3;/.test(src));
chk('dow() 가 gameDay 로 센다', /function dow\(\)\{ return DOW\[\(EPOCH_DOW \+ Math\.floor\(gameDay\)\) % 7\]; \}/.test(src));

console.log('\n=== 5-5-1. 표기 고르개 ===');
chk('DATEFMT 표가 있다', /const DATEFMT = \[[\s\S]*?\r?\n\];/.test(src));
chk('설정 탭에 고르개가 있다', /<select id="cDate">/.test(src));
chk('이름 뒤에 쌍점과 보기가 붙는다',
    /f\[1\]\+': '\+f\[2\]\(\{y:1500, m:0, d:4, w:'Sat', k:'토'\}\)/.test(src));
chk('보기에서 A.D. 와 연도가 붙지 않는다', /\.replace\(\/<\\\/s>\/g,' '\)/.test(src));
chk('고른 값을 저장한다', /localStorage\.setItem\(LS_DATE, dateFmt\)/.test(src));
chk('저장값이 표에 있는지 검사한다', /DATEFMT\.some\(x=>x\[0\]===s\)/.test(src));
chk('바꾸면 바로 다시 그린다', /dateFmt = cd\.value;[\s\S]{0,120}renderBands\(\)/.test(src));
chk('처음 골라져 있는 것이 기본이다', /let dateFmt = 'head';/.test(src));
chk('한글식만 UI 글꼴을 쓴다 — 이제는 아니다', !/\(f\[3\] \? '' : ' class="ko"'\)/.test(src));

// 표기마다 가장 긴 날짜가 띠에 들어가는가 — Georgia 자폭(em)으로 어림해 잰다
const EM = { 'A':.722,'D':.776,'.':.27,',':.27,' ':.25,'(':.333,')':.333,
             'J':.437,'F':.611,'M':.888,'S':.6,'O':.75,'N':.776,
             'a':.509,'n':.56,'e':.482,'b':.567,'r':.406,'p':.568,'y':.5,'u':.564,'l':.29,
             'g':.5,'c':.443,'t':.36,'o':.535,'v':.5,'d':.567,'i':.29,'W':1.06,'T':.593,'h':.567,
             's':.42,'m':.87,'0':.55,'1':.55,'2':.55,'3':.55,'4':.55,'5':.55,'6':.55,'7':.55,'8':.55,'9':.55 };
const emOf = s => [...s].reduce((a,ch) => a + (/[가-힣]/.test(ch) ? 1 : (EM[ch] ?? .55)), 0);
const headCss = (src.match(/#tune \.head\{[^}]*\}/) || [''])[0];
const hPad = +((headCss.match(/padding:\d+px (\d+)px/) || [])[1]);
const adFS = +((src.match(/#tune \.head b s\{font-size:(\d+)px/) || [])[1]);
const panelW = +((src.match(/#tune\{[^}]*width:(\d+)px/) || [])[1]);
const avail = panelW - 2 - hPad*2;
chk('자간을 0 으로 줄였다', /letter-spacing:0/.test(headCss));

// 코드의 DATEFMT 를 그대로 실행해 본다 — 정규식으로 흉내 내면 표와 어긋난다.
// 주의: vm 안의 const 는 sandbox 의 속성이 되지 않는다. 마지막에 손으로 내보내야 한다.
const fmtBox = { console:{log(){}} };
vm.createContext(fmtBox);
vm.runInContext(
  (src.match(/const DOW = \[[\s\S]*?const DATEFMT = \[[\s\S]*?\r?\n\];/) || [''])[0]
    .replace(/function dow\(\)[^\n]*\n/, '').replace(/function dowK\(\)[^\n]*\n/, '')
    .replace(/const EPOCH_DOW[^\n]*\n/, '')
  + '\nthis.DATEFMT = DATEFMT;',
  fmtBox);
chk('DATEFMT 를 실행할 수 있다', Array.isArray(fmtBox.DATEFMT) && fmtBox.DATEFMT.length >= 6,
    (fmtBox.DATEFMT||[]).length + '가지');
chk('고르개 이름이 "날짜표기" 다', /<span>날짜표기<\/span>/.test(src));
// 첫 항목 이름이 '기본' 인데 다른 것이 골라져 있으면 말과 실제가 어긋난다
chk('여섯 항목에 이름이 다 있다',
    (fmtBox.DATEFMT||[]).every(f => typeof f[1] === 'string' && f[1].length > 0),
    (fmtBox.DATEFMT||[]).map(f=>f[1]).join(' · '));
chk('첫 항목 이름이 기본식이다', ((fmtBox.DATEFMT||[])[0]||[])[1] === '기본식');
chk('이름이 모두 "…식" 으로 끝난다',
    (fmtBox.DATEFMT||[]).every(f => /식$/.test(f[1])),
    (fmtBox.DATEFMT||[]).map(f=>f[1]).join(' · '));
chk('기본값이 곧 첫 항목이다',
    (src.match(/let dateFmt = '(\w+)';/) || [])[1] === ((fmtBox.DATEFMT||[])[0]||[])[0],
    `기본값 ${(src.match(/let dateFmt = '(\w+)';/)||[])[1]} / 첫 항목 ${((fmtBox.DATEFMT||[])[0]||[])[0]}`);
chk('한글 표기가 서기로 시작한다',
    (fmtBox.DATEFMT||[]).filter(f => f[2]({y:1500,m:0,d:4,w:'Sat',k:'토'}).startsWith('서기')).length === 2);
chk('요일 있는 한글식이 있다',
    (fmtBox.DATEFMT||[]).some(f => /^서기[\s\S]*\(토\)$/.test(f[2]({y:1500,m:0,d:4,w:'Sat',k:'토'}))));
chk('요일을 괄호로 줄여 적는다',
    (fmtBox.DATEFMT||[]).some(f => /일 \(토\)$/.test(f[2]({y:1500,m:0,d:4,w:'Sat',k:'토'}))) &&
    !(fmtBox.DATEFMT||[]).some(f => /요일$/.test(f[2]({y:1500,m:0,d:4,w:'Sat',k:'토'}))));
chk('요일 없는 한글식이 있다',
    (fmtBox.DATEFMT||[]).some(f => /^서기[\s\S]*일$/.test(f[2]({y:1500,m:0,d:4,w:'Sat',k:'토'}))));
chk('한글식도 게임 표준 숫자를 쓴다',
    !/class="ko"/.test(src) && !/#tune \.head b\.ko\{/.test(src) &&
    (fmtBox.DATEFMT||[]).every(f => f.length === 4));
chk('글꼴 목록에 한글이 뒤따른다', /--numfont: Georgia, 'Malgun Gothic', sans-serif/.test(src));
// 가장 넓은 조합: 네 자리 연도 + 가장 넓은 달 + 두 자리 일 + 가장 넓은 요일
let over = [];
for(const f of (fmtBox.DATEFMT || [])){
  let worst = 0, worstTxt = '';
  for(let m = 0; m < 12; m++){
    const html = f[2]({ y:1888, m:m, d:28, w:'Wed', k:'수' });
    const plain = html.replace(/<[^>]+>/g, '');
    const adPart = /A\.D\./.test(plain) ? emOf('A.D.')*adFS + 3 : 0;
    const rest = emOf(plain.replace('A.D.', ''))*f[3];
    if(adPart + rest > worst){ worst = adPart + rest; worstTxt = plain; }
  }
  const ok = worst <= avail;
  if(!ok) over.push(f[0]);
  console.log('     ' + f[0].padEnd(5) + String(f[3]).padStart(2) + 'px  ' +
              worst.toFixed(0).padStart(3) + 'px  ' + (ok ? '  ' : '넘침') + '  "' + worstTxt + '"');
}
chk('모든 표기가 띠 폭에 들어간다', over.length === 0,
    over.length ? '넘침: ' + over.join(', ') : `폭 ${avail}px`);
// 시작 요일이 실제와 맞는가 — 율리우스력 JDN 으로 검산한다
function jdnJulian(Y,M,D){
  const a = Math.floor((14-M)/12), y = Y+4800-a, m = M+12*a-3;
  return D + Math.floor((153*m+2)/5) + 365*y + Math.floor(y/4) - 32083;
}
const EY = +(src.match(/const EPOCH_Y = (\d+)/) || [])[1];
const jdn = jdnJulian(EY, 1, 1);
const realIdx = (jdn + 1) % 7;                 // 0=Sun
const codeIdx = +(src.match(/const EPOCH_DOW = (\d+)/) || [])[1];
const NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
chk('시작 요일이 율리우스력과 맞는다', realIdx === codeIdx,
    `${EY}-01-01 = ${NAMES[realIdx]} (JDN ${jdn}) / 코드 ${NAMES[codeIdx]}`);
// 며칠 뒤 요일이 하루씩 밀리는가
const seq = [];
for(let d=0; d<8; d++) seq.push(NAMES[(codeIdx + d) % 7]);
console.log('     Jan 1 부터 8일까지: ' + seq.join(' '));
chk('7일마다 같은 요일로 돌아온다', seq[0] === seq[7]);
chk('윤년 없음을 주석에 남겼다', /윤년이 없다/.test(src));
// 월 이름이 열두 개 다 있고 달력의 월 배열과 길이가 같은가
const mons = (src.match(/const MON = \[([^\]]+)\]/) || [])[1].split(',').length;
const mdays = (src.match(/const MDAYS=\[([^\]]+)\]/) || [])[1].split(',').length;
chk('월 이름이 열두 개다', mons === 12, `${mons}개`);
chk('달력의 월 수와 맞는다', mons === mdays, `MON ${mons} / MDAYS ${mdays}`);

console.log('\n=== 5-6. 한 줄형 배치와 글자 크기 ===');
// 한 줄에 [라벨][막대][값] — 두 줄형이면 값이 막대 위에 떠서 시선이 계단처럼 움직인다
chk('한 줄에 셋을 넣는다',
    /<div class="gr"><span>'\+lab\+'<\/span>'\+\s*\r?\n\s*'<span class="gb">/.test(gen));
chk('막대가 span 이다 (줄 안에 들어간다)', /<span class="gb">/.test(gen) && !/<div class="gb">/.test(gen));
chk('값이 줄 끝에 온다', /'<b>'\+txt\+'<\/b><\/div>'/.test(gen));
chk('.gr 이 가로 배치다', /#tune \.gr\{display:flex;align-items:center/.test(src));
chk('값이 오른쪽 정렬이다', /#tune \.gr>b\{[^}]*text-align:right/.test(src));
// 폭 배분이 실제로 들어맞는가 — 패널 내용폭에서 셋을 빼고 막대가 남는지 본다
const bodyCss2 = (src.match(/#tune \.body\{[^}]*\}/) || [''])[0];
const bp = (bodyCss2.match(/padding:(\d+)px (\d+)px (\d+)px (\d+)px/) || []).slice(1).map(Number);
const sbw = +((src.match(/#tune \.body::-webkit-scrollbar\{width:(\d+)px/) || [])[1]);
const tuneW = +((src.match(/#tune\{[^}]*width:(\d+)px/) || [])[1]);
const inner = tuneW - 2 - bp[3] - bp[1] - sbw;          // 테두리·좌우여백·스크롤바
const labW = +((src.match(/#tune \.gr>span:first-child\{flex:0 0 (\d+)px/) || [])[1]);
const valW = +((src.match(/#tune \.gr>b\{flex:0 0 (\d+)px/) || [])[1]);
const gapW = +((src.match(/#tune \.gr\{[^}]*gap:(\d+)px/) || [])[1]);
const barW = inner - labW - valW - gapW*2;
chk('폭 셋을 다 읽었다', [labW, valW, gapW].every(Number.isFinite),
    `라벨 ${labW} · 값 ${valW} · 사이 ${gapW}`);
chk('막대에 자리가 남는다', barW >= 90,
    `내용폭 ${inner} − 라벨${labW} − 값${valW} − 사이${gapW*2} = 막대 ${barW}px`);
// 글자가 자기 칸에 들어가는가 — 라벨은 '가장 긴 것'을 목록에서 직접 뽑는다.
// 앞서 일반 탭 라벨만 눈대중으로 보다가 디버그 탭의 '가속(→전속)' 을 빠뜨려 두 줄로 접혔다.
const worldSrc = (src.match(/const WORLD_SPEC = \[[\s\S]*?\r?\n  \];/) || [''])[0];
const allLabels = [...(specSrc + worldSrc).matchAll(/'[^']+',\s*'([^']+)'/g)].map(m => m[1]);
function w13(s){                       // 13px 기준 대략폭: 한글 13, 나머지 7
  return [...s].reduce((a,ch) => a + (/[가-힣]/.test(ch) ? 13 : 7), 0);
}
const longest = allLabels.reduce((a,b) => w13(b) > w13(a) ? b : a, '');
chk('라벨 목록을 읽었다', allLabels.length >= 20, allLabels.length + '개');
chk('가장 긴 라벨이 한 줄에 들어간다', w13(longest) <= labW,
    `"${longest}" 약 ${w13(longest)}px <= ${labW}px`);
chk('넘치면 잘라서 보여준다 (두 줄로 안 접힌다)',
    /#tune \.gr>span:first-child\{[^}]*white-space:nowrap/.test(src) &&
    /#tune \.row>\.nm\{[^}]*white-space:nowrap/.test(src));
chk('가장 긴 값이 들어간다', 3*8.3 + 6*6.1 <= valW, `"200 / 200" 약 62px <= ${valW}px`);
// 글자 크기가 커졌는가
const labFS = +((src.match(/#tune \.gr>span:first-child\{[^}]*font-size:(\d+)px/) || [])[1]);
const valFS = +((src.match(/#tune \.gr>b\{[^}]*font-size:(\d+)px/) || [])[1]);
chk('라벨이 커졌다', labFS >= 13, `${labFS}px`);
chk('값이 커졌다', valFS >= 15, `${valFS}px`);
// 12항목의 세로 길이 — 한 줄형이 두 줄형보다 실제로 짧아야 바꾼 보람이 있다
const rowMg = +((src.match(/#tune \.gr\{[^}]*margin:(\d+)px 0/) || [])[1]);
const rowH  = Math.max(valFS + 4, 20) + rowMg*2;         // 한 줄형: 값 글자 + 위아래 여백
const rowH2 = rowH + 6 + 7;                              // 두 줄형이었다면: 막대 줄이 하나 더
const head  = 22 + 2*26;                                 // 배 이름 + 소제목 둘
const one = head + 12*rowH, two = head + 12*rowH2;
chk('한 줄형이 두 줄형보다 짧다', one < two,
    `한 줄형 약 ${one}px / 두 줄형이면 약 ${two}px (${(100-one/two*100).toFixed(0)}% 절약)`);
console.log('     ── 화면 높이별로 스크롤 없이 보이는가');
for(const H of [1080, 900, 768, 720]){
  const avail = H - 275 - 52 - 28;                       // 화면 − 카드몫 − 메뉴 − 띠
  console.log('     ' + H + '  자리 ' + String(avail).padStart(3) + 'px  → ' +
              (one <= avail ? '한 번에 보임' : '스크롤 ' + (one-avail) + 'px'));
}
chk('큰 화면에서는 한 번에 보인다', one <= 900 - 275 - 52 - 28, `900 기준`);
chk('작은 화면에서는 스크롤로 받는다', /#tune \.body\{[^}]*overflow-y:auto/.test(src));

console.log('\n=== 5-7. 디버그 탭도 같은 한 줄형인가 ===');
const build = (src.match(/function build\(\)\{[\s\S]*?\r?\n  \}/) || [''])[0];
chk('한 줄에 [라벨][슬라이더][값] 이다',
    // 값 칸은 span 이 아니라 직접 입력되는 <input class="val"> 다 (타이핑 기능)
    /<div class="row" title="기본값[\s\S]{0,120}<span class="nm">'\+lab[\s\S]{0,200}<input type="range"[\s\S]{0,160}<input type="text" class="val"/.test(build));
chk('.row 가 가로 배치다', /#tune \.row\{display:flex;align-items:center/.test(src));
chk('슬라이더가 남는 폭을 먹는다', /#tune \.row>input\[type=range\]\{flex:1 1 auto/.test(src));
chk('값이 오른쪽 정렬이다', /#tune \.row>\.val\{[^}]*text-align:right/.test(src));
chk('옛 두 줄 구조가 없다', !/class="lab"/.test(src) && !/class="def"/.test(src));
chk('죽은 .lab·.def 규칙도 지웠다', !/#tune \.lab\{/.test(src) && !/#tune \.def\{/.test(src));
// 라벨·값 칸이 일반 탭과 같은 폭이어야 두 탭이 한 벌로 보인다
const rLab = +((src.match(/#tune \.row>\.nm\{flex:0 0 (\d+)px/) || [])[1]);
const rVal = +((src.match(/#tune \.row>\.val\{flex:0 0 (\d+)px/) || [])[1]);
chk('라벨 칸이 일반 탭과 같다', rLab === labW, `디버그 ${rLab} / 일반 ${labW}`);
chk('값 칸은 단위 때문에 조금 넓다', rVal >= valW, `디버그 ${rVal} / 일반 ${valW}`);
// 슬라이더가 줄어들 수 있어야 값 칸이 밀려나지 않는다 (이번에 잘린 원인)
chk('슬라이더가 min-width:0 이다', /#tune \.row>input\[type=range\]\{[^}]*min-width:0/.test(src));
chk('막대도 min-width:0 이다', /#tune \.gr \.gb\{[^}]*min-width:0/.test(src));
chk('값이 줄바꿈하지 않는다', /#tune \.row>\.val\{[^}]*white-space:nowrap/.test(src) &&
    /#tune \.gr>b\{[^}]*white-space:nowrap/.test(src));
const rGap = +((src.match(/#tune \.row\{[^}]*gap:(\d+)px/) || [])[1]);
const sldW = inner - rLab - rVal - rGap*2;
chk('슬라이더에 자리가 남는다', sldW >= 90,
    `내용폭 ${inner} − 라벨${rLab} − 값${rVal} − 사이${rGap*2} = 슬라이더 ${sldW}px`);
// 가장 긴 값이 칸에 들어가는가 (단위 포함)
const rValFS = +((src.match(/#tune \.row>\.val\{[^}]*font-size:(\d+)px/) || [])[1]);
chk('가장 긴 값이 들어간다', 3*(rValFS*0.55) + 4*(rValFS*0.75) <= rVal,
    `"120 °/초" 약 ${(3*(rValFS*0.55)+4*(rValFS*0.75)).toFixed(0)}px <= ${rVal}px`);
// 기본값은 줄에서 빼고 title 로 넘겼다
chk('기본값을 title 로 넘긴다', /title="기본값 '\+pdef\(k\)\+'"/.test(build));
chk('줄에 기본값을 적지 않는다', !/d_'\+id/.test(build));
chk('바뀐 값을 색으로 알린다', /classList\.toggle\('ch', typeof df === 'number'/.test(src));
chk('바뀜 색 규칙이 있다', /#tune \.row>\.val\.ch\{color:/.test(src));
chk('zoom 처럼 기본값 없는 항목은 색이 안 붙는다', /typeof df === 'number'/.test(src));

console.log(`\n${fail === 0 ? '전부 통과' : '실패 있음'} — 통과 ${pass}, 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);
