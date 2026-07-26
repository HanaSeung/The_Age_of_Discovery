// verify_fps.js — 안내줄 초당 프레임 표시 검증
// 실행: node verify_fps.js
//
// world_chart.html 의 '초당 프레임' 절을 잘라 내어 그대로 돌린다. 재구현하지 않는다.
// 재구현하면 시험과 코드가 갈라진다 (부록 C).
"use strict";
const RELOC_ROOT = require('path').join(__dirname, '..'); // 프로젝트 루트
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = RELOC_ROOT;
const src = fs.readFileSync(path.join(DIR, 'world_chart.html'), 'utf8');

let pass = 0, fail = 0;
const chk = (n, c, note) => { c ? (pass++, console.log('  OK   ' + n + (note ? '  ' + note : '')))
                                : (fail++, console.log('  FAIL ' + n + (note ? '  ' + note : ''))); };

function slice(a, b, what){
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if(i < 0 || j < 0) throw new Error('원본에서 ' + what + ' 를 찾지 못함');
  return src.slice(i, j);
}
const partFps = slice('// ===== 초당 프레임', '// ===== 해류 시각화', '초당 프레임');

console.log('\n1. 자리 — 안내줄 안에 숫자 칸이 있는가');
const hintBlock = slice('<div id="hint"', '</div>', '안내줄 묶음');
chk('안내줄 안에 id="fps" 칸이 있다', /id="fps"/.test(hintBlock));
chk('그 칸이 토글 목록 뒤에 온다',
    hintBlock.indexOf('id="toggles"') < hintBlock.indexOf('id="fps"'));
chk('.fps 글자색 규칙이 있다', /#hint\s+\.fps\{/.test(src));
chk('구분점을 CSS 가 붙인다 (빈 칸에 점만 남지 않게)',
    /#hint\s+\.fps:not\(:empty\)::before\{[^}]*content/.test(src));

console.log('\n2. 배선 — 자르기 전 간격으로 세는가');
const loopSrc = slice('function loop(now){', 'if(!paused){', 'loop 머리');
chk('loop 안에서 fpsTick 을 부른다', /fpsTick\(/.test(loopSrc));
chk('dt 상한(0.05)보다 먼저 부른다  ★핵심',
    loopSrc.indexOf('fpsTick(') < loopSrc.indexOf('dt>0.05'),
    '뒤에 두면 20 아래가 전부 20 으로 뭉개진다');
chk('물리용 상한은 그대로 남아 있다', /if\(dt>0\.05\)\s*dt=0\.05/.test(loopSrc));

console.log('\n3. 상수 — 이름과 값');
const num = k => { const m = new RegExp('const\\s+' + k + '\\s*=\\s*([\\d.]+)').exec(partFps);
                   return m ? parseFloat(m[1]) : null; };
const WIN = num('FPS_WIN'), SKIP = num('FPS_SKIP');
chk('FPS_WIN 이 명명 상수다', WIN !== null, 'FPS_WIN = ' + WIN);
chk('FPS_SKIP 이 명명 상수다', SKIP !== null, 'FPS_SKIP = ' + SKIP);
chk('표본 구간이 눈으로 읽을 만하다 (0.2~1초)', WIN >= 0.2 && WIN <= 1.0);
chk('버리는 문턱이 표본 구간보다 크다', SKIP > WIN);
chk('숫자를 코드에 박아 두지 않았다',
    !/fpsAcc\s*<\s*0\.\d/.test(partFps) && !/raw\s*>\s*\d\.\d/.test(partFps));

console.log('\n4. 이름 충돌 감시 — 다른 verify 가 긁어 가는 접두와 겹치지 않는가');
// 미니맵 세션의 SEA_C 사고 재발 방지. verify_precip·verify_seatemp 등이
// 'const 접두*' 를 정규식으로 훑어 상수를 거둬 간다.
const HARVEST = ['SEA_', 'PRECIP_', 'RAIN_', 'SNOW_', 'LTN_', 'STORM_'];
const mine = (partFps.match(/const\s+([A-Z][A-Z0-9_]*)/g) || [])
             .map(s => s.replace(/const\s+/, ''));
chk('이번 절의 상수가 남의 접두를 밟지 않는다',
    mine.every(n => !HARVEST.some(p => n.startsWith(p))),
    mine.join(', '));

console.log('\n5. 동작 — 원본 토막을 그대로 돌려 값을 확인한다');
// const/let 은 컨텍스트 객체에 붙지 않아 밖에서 못 읽는다. var 로 바꿔 넣는다 (부록 C).
const el = { textContent: '' };
const box = { document: { getElementById: id => (id === 'fps' ? el : null) } };
vm.createContext(box);
vm.runInContext(partFps.replace(/\b(const|let)\b/g, 'var'), box);

function reset(){ box.fpsAcc = 0; box.fpsN = 0; el.textContent = ''; }
function feed(raw, n){ for(let i = 0; i < n; i++) box.fpsTick(raw); }

reset(); feed(1/60, 40);
chk('60fps 로 먹이면 60 이 나온다', el.textContent === '60 fps', el.textContent);

reset(); feed(1/30, 20);
chk('30fps 로 먹이면 30 이 나온다', el.textContent === '30 fps', el.textContent);

// 0.1초 = 10fps. dt 상한 0.05 의 두 배라, 상한에 물렸다면 20 이 나온다.
reset(); feed(0.1, 10);
chk('10fps 로 먹이면 10 이 나온다  ★상한에 안 물린다', el.textContent === '10 fps',
    el.textContent + ' (상한에 물렸다면 20)');

reset(); feed(0.25, 8);
chk('4fps 로 먹이면 4 가 나온다', el.textContent === '4 fps', el.textContent);

console.log('\n6. 갱신 시점과 뒷정리');
reset(); feed(1/60, 10);           // 0.167초 — 아직 창을 못 채웠다
chk('표본 구간을 채우기 전에는 쓰지 않는다', el.textContent === '', '"' + el.textContent + '"');
chk('그동안 값은 모이고 있다', box.fpsN === 10 && box.fpsAcc > 0.16);

// 갱신은 창을 채우는 순간 일어난다. 넉넉히 먹이면 그 뒤 프레임이 다시 쌓이므로
// '갱신된 바로 그때' 를 잡아야 한다.
reset();
let guard = 0;
while(el.textContent === '' && ++guard < 1000) box.fpsTick(1/60);
chk('갱신 뒤 누적이 0 으로 돌아간다', box.fpsAcc === 0 && box.fpsN === 0,
    guard + '프레임째 갱신');

reset(); feed(1/60, 40); const first = el.textContent;
el.textContent = ''; feed(1/60, 40);
chk('두 번째 창도 같은 값을 낸다', el.textContent === first, first);

console.log('\n7. 다른 탭에 다녀온 프레임 버리기');
reset(); box.fpsTick(SKIP + 0.5);
chk('문턱보다 긴 간격은 세지 않는다', box.fpsN === 0 && box.fpsAcc === 0);
reset(); feed(1/60, 20); box.fpsTick(3.0); feed(1/60, 20);
chk('건너뛴 프레임이 평균을 망치지 않는다', el.textContent === '60 fps', el.textContent);

console.log('\n8. 안내줄을 꺼도 터지지 않는가');
const box2 = { document: { getElementById: () => null } };
vm.createContext(box2);
vm.runInContext(partFps.replace(/\b(const|let)\b/g, 'var'), box2);
let threw = false;
try{ for(let i = 0; i < 40; i++) box2.fpsTick(1/60); }catch(e){ threw = true; }
chk('칸을 못 찾아도 예외를 내지 않는다', !threw);

console.log('\n' + (fail ? '실패 있음' : '모두 통과') + ' — 통과 ' + pass + ' / 실패 ' + fail);
process.exit(fail ? 1 : 0);
