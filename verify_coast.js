// verify_coast.js — 해안선 선분 충돌 검증
// 실행: node verify_coast.js
//
// world_chart.html 의 실제 코드를 잘라 내어 그대로 돌린다.
// Path2D · document 는 껍데기로 채운다 (마스크는 여기서 쓰지 않는다).
"use strict";
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = __dirname;
const src = fs.readFileSync(path.join(DIR, 'world_chart.html'), 'utf8');

let pass = 0, fail = 0;
const chk = (n, c, note) => { c ? (pass++, console.log('  OK   ' + n + (note ? '  ' + note : '')))
                                : (fail++, console.log('  FAIL ' + n + (note ? '  ' + note : ''))); };

// ---- 원본에서 필요한 토막만 오려 낸다 ----
function slice(a, b, what){
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if(i < 0 || j < 0) throw new Error('원본에서 ' + what + ' 를 찾지 못함');
  return src.slice(i, j);
}
const partConst = slice('// ===== 좌표계 / 월드 상수 =====',
                        '// ===== 수심 밴드', '월드 상수');
const partCoast = slice('// ===== 육지 폴리곤 → 단일 Path2D',
                        '// ===== 해류 필드', '해안선/색인');

// ---- 껍데기 환경 ----
const fakeCtx = {
  setTransform(){}, clearRect(){}, fill(){}, set fillStyle(v){},
  getImageData(w0,h0,w,h){ return { data: new Uint8ClampedArray(w*h*4) }; }
};
const sandbox = {
  console: { log(){}, warn(){}, error(m){ throw new Error(m); } },
  Math, Uint8Array, Uint32Array, Int8Array, Float32Array, DataView, Infinity, NaN,
  Path2D: class { moveTo(){} lineTo(){} closePath(){} },
  document: { createElement(){ return { getContext(){ return fakeCtx; } }; } },
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  window: {}
};
new Function('window', 'atob', fs.readFileSync(path.join(DIR, 'land_data.js'), 'utf8'))
  (sandbox.window, sandbox.atob);
vm.createContext(sandbox);
// let/const 는 vm 전역에 붙지 않는다. 같은 실행 안에서 한 번에 내보낸다.
vm.runInContext(partConst + '\n' + partCoast + `
globalThis.__X = { WORLD_W, WORLD_H, KM_PER_PX, COASTSEG, cellStart, cellItem,
                   HULL_KM, HULL_R, COL_CELL, CGW, CGH, COL_ITER,
                   nearestCoast, moveWithCoast, project, wrapX };`, sandbox);

const { WORLD_W, WORLD_H, KM_PER_PX, COASTSEG, cellStart, cellItem,
        HULL_KM, HULL_R, COL_CELL, CGW, CGH, COL_ITER,
        nearestCoast, moveWithCoast, project, wrapX } = sandbox.__X;
const nSeg = COASTSEG.length / 4;
const KM = v => (v * KM_PER_PX);

console.log('\n=== 0. 자료 ===');
console.log(`  선분 ${nSeg} | 색인 칸 ${CGW}x${CGH} | 항목 ${cellItem.length}` +
            ` | 선체반지름 ${HULL_KM}km (${HULL_R.toFixed(4)}px)`);
chk('선분이 실렸다', nSeg > 50000, nSeg + '개');
chk('색인이 만들어졌다', cellItem.length >= nSeg, cellItem.length + '항목');

console.log('\n=== 1. 색인 무결성 ===');
// 모든 선분이 자기 경계상자의 칸 전부에 들어가 있는가
let missing = 0;
for(let i=0;i<nSeg;i++){
  const x0=COASTSEG[i*4], y0=COASTSEG[i*4+1], x1=COASTSEG[i*4+2], y1=COASTSEG[i*4+3];
  let gy0=Math.floor(Math.min(y0,y1)/COL_CELL), gy1=Math.floor(Math.max(y0,y1)/COL_CELL);
  if(gy0<0) gy0=0; if(gy1>CGH-1) gy1=CGH-1;
  const gx0=Math.floor(Math.min(x0,x1)/COL_CELL), gx1=Math.floor(Math.max(x0,x1)/COL_CELL);
  for(let gy=gy0;gy<=gy1 && !missing;gy++) for(let gx=gx0;gx<=gx1;gx++){
    const c = gy*CGW + (((gx%CGW)+CGW)%CGW);
    let found=false;
    for(let k=cellStart[c];k<cellStart[c+1];k++) if(cellItem[k]===i){ found=true; break; }
    if(!found){ missing++; break; }
  }
}
chk('빠진 선분 없음', missing === 0, missing ? missing+'개 빠짐' : '전부 색인됨');
chk('누적합이 어긋나지 않음', cellStart[CGW*CGH] === cellItem.length);

console.log('\n=== 2. nearestCoast 가 브루트포스와 일치 ===');
function bruteDist(x, y){                    // 전 선분을 다 뒤진 참값
  let best = Infinity;
  for(let i=0;i<nSeg;i++){
    let ax=COASTSEG[i*4], ay=COASTSEG[i*4+1], bx=COASTSEG[i*4+2], by=COASTSEG[i*4+3];
    // 경도 감기 보정 — 배와 가까운 쪽으로 당긴다
    const sh = Math.round((x - (ax+bx)/2)/WORLD_W)*WORLD_W;
    ax+=sh; bx+=sh;
    const vx=bx-ax, vy=by-ay, L2=vx*vx+vy*vy;
    let t = L2>0 ? ((x-ax)*vx+(y-ay)*vy)/L2 : 0;
    if(t<0) t=0; else if(t>1) t=1;
    const dx=x-(ax+vx*t), dy=y-(ay+vy*t), d=Math.hypot(dx,dy);
    if(d<best) best=d;
  }
  return best;
}
const out = {d:0,tx:0,ty:0};
let worst = 0, n2 = 0;
for(let t=0;t<600;t++){
  // 해안 정점 근처를 골라 표본한다 (먼바다는 둘 다 Infinity 라 뜻이 없다)
  const i = (Math.random()*nSeg)|0;
  const x = COASTSEG[i*4] + (Math.random()-0.5)*6;
  const y = COASTSEG[i*4+1] + (Math.random()-0.5)*6;
  if(y<0||y>=WORLD_H) continue;
  const R = 8;
  nearestCoast(x, y, R, out);
  const b = bruteDist(x, y);
  const mine = out.d===Infinity ? R : Math.min(out.d, R);
  const ref  = Math.min(b, R);
  worst = Math.max(worst, Math.abs(mine-ref)); n2++;
}
chk('반경 안에서 참값과 같음', worst < 1e-3, `표본 ${n2}점, 최대 오차 ${worst.toExponential(1)}px`);

console.log('\n=== 3. 육지 관통이 없는가 ===');
// 배가 해안선 안쪽(육지)에 들어가는지 — evenodd 교차수로 직접 확인한다
const rowSeg = new Array(WORLD_H);
for(let i=0;i<nSeg;i++){
  const y0=COASTSEG[i*4+1], y1=COASTSEG[i*4+3];
  if(y0===y1) continue;
  const r0=Math.max(0,Math.floor(Math.min(y0,y1))), r1=Math.min(WORLD_H-1,Math.floor(Math.max(y0,y1)));
  for(let r=r0;r<=r1;r++) (rowSeg[r]||(rowSeg[r]=[])).push(i);
}
function inLand(x, y){
  const b = rowSeg[Math.floor(y)]; if(!b) return false;
  const wx = wrapX(x);
  let c = 0;
  for(const i of b){
    const ax=COASTSEG[i*4], ay=COASTSEG[i*4+1], bx=COASTSEG[i*4+2], by=COASTSEG[i*4+3];
    if((ay>y)!==(by>y)){ if(ax + (y-ay)*(bx-ax)/(by-ay) < wx) c++; }
  }
  return (c&1)===1;
}
const M = {x:0,y:0,hit:false,stop:false};
function sail(x, y, head, steps, stepLen){
  let bad = 0, hits = 0;
  for(let s=0;s<steps;s++){
    head += (Math.random()-0.5)*0.25;                  // 조금씩 침로를 흔든다
    moveWithCoast(x, y, Math.cos(head)*stepLen, Math.sin(head)*stepLen, M);
    x = wrapX(M.x); y = M.y;
    if(M.hit) hits++;
    if(inLand(x,y)) bad++;
  }
  return {bad, hits, x, y};
}
// 시작점: 바다인 곳만 고른다
const starts = [];
while(starts.length < 120){
  const x = Math.random()*WORLD_W, y = 200 + Math.random()*(WORLD_H-400);
  if(!inLand(x,y)) starts.push([x,y]);
}
let totBad = 0, totHit = 0;
for(const [x,y] of starts){
  const r = sail(x, y, Math.random()*Math.PI*2, 400, 0.30);   // 기본 시계 한 걸음 = 0.30px
  totBad += r.bad; totHit += r.hits;
}
chk('기본 시계 48,000걸음 관통 없음', totBad === 0, `해안 접촉 ${totHit}회, 관통 ${totBad}회`);

// 시계를 최대로 올린 경우 — 한 걸음이 훨씬 커진다
let fastBad = 0, fastHit = 0;
for(const [x,y] of starts){
  const r = sail(x, y, Math.random()*Math.PI*2, 400, 3.60);   // hoursPerSec 24 상당
  fastBad += r.bad; fastHit += r.hits;
}
chk('빠른 시계 48,000걸음 관통 없음', fastBad === 0, `해안 접촉 ${fastHit}회, 관통 ${fastBad}회`);

console.log('\n=== 4. 좁은 해협을 지나는가 ===');
// 직선 항로가 열려 있는 해협에서 실제로 배를 몰아 본다.
// (굽은 해협은 조타가 필요해 충돌 검증의 몫이 아니다 — 아래 5번이 그 자리를 맡는다)
function maskLand(x, y){ return inLand(Math.floor(x)+0.5, Math.floor(y)+0.5); }
function runStrait(name, lon0, lat0, lon1, lat1){
  const a = project(lon0, lat0), b = project(lon1, lat1);
  const dx = b[0]-a[0], dy = b[1]-a[1], L = Math.hypot(dx,dy);
  const ux = dx/L, uy = dy/L;
  // 직선 항로의 최소 여유 — 선체 반지름보다 좁으면 애초에 못 지나는 길이다
  let minD = Infinity;
  const P0 = {d:0,tx:0,ty:0};
  for(let s=0;s<=400;s++){
    nearestCoast(a[0]+dx*s/400, a[1]+dy*s/400, 4, P0);
    if(P0.d < minD) minD = P0.d;
  }
  // 그 길을 따라 실제로 몰아 본다
  let x=a[0], y=a[1], gone=0;
  for(let s=0;s<8000 && gone<L;s++){
    moveWithCoast(x, y, ux*0.05, uy*0.05, M);
    const adv = Math.hypot(M.x-x, M.y-y);
    if(adv < 1e-6) break;
    x=M.x; y=M.y; gone += adv;
  }
  const ok = gone >= L*0.98;
  let mBlock = false;
  for(let s=0;s<=400;s++){ if(maskLand(a[0]+dx*s/400, a[1]+dy*s/400)){ mBlock=true; break; } }
  console.log(`  ${name.padEnd(12)} 길이 ${(L*KM_PER_PX).toFixed(1).padStart(5)}km` +
              ` | 최소여유 ${(minD*KM_PER_PX).toFixed(2).padStart(5)}km` +
              ` | 옛 마스크 ${mBlock?'막힘':'통과'} | 선분 충돌 ${ok?'통과':'막힘'}`);
  return ok;
}
const straits = [
  ['싱가포르해협',103.40, 1.22, 104.10, 1.22],
  ['도버',         1.45,50.95,   1.65,51.05],
  ['메시나',      15.58,38.13,  15.65,38.27],
  ['바브엘만데브', 43.32,12.58,  43.48,12.72],
];
let opened = 0;
for(const s of straits) if(runStrait(...s)) opened++;
chk('직선으로 열린 해협 전부 통과', opened === straits.length, `${opened}/${straits.length}`);

console.log('\n=== 5. 옛 마스크가 막던 바다가 열렸는가 (이번 문제) ===');
// 폴리곤상 바다 + 여유가 선체 반지름 이상 + 그런데 4.9km 마스크는 육지 —
// 배율 100배에서 "분명히 바다인데 못 지나가던" 바로 그 자리다.
const D0 = {d:0,tx:0,ty:0};
const freed = [];
for(let t=0;t<300000 && freed.length<300;t++){
  const i = (Math.random()*nSeg)|0;
  const x = COASTSEG[i*4] + (Math.random()-0.5)*4;
  const y = COASTSEG[i*4+1] + (Math.random()-0.5)*4;
  if(y<1 || y>=WORLD_H-1) continue;
  if(inLand(x,y)) continue;                    // 진짜 바다여야 한다
  nearestCoast(x, y, 2, D0);
  if(D0.d < HULL_R*1.5) continue;              // 배가 들어갈 만큼 넓어야 한다
  if(!maskLand(x,y)) continue;                 // 옛 마스크가 막던 곳만
  freed.push([x,y]);
}
console.log(`  되찾은 바다 표본 ${freed.length}곳`);
chk('그런 자리가 실제로 있다', freed.length > 50, freed.length + '곳');
// 그 자리에서 배가 움직이는가 (옛 방식이면 그 자리에서 좌초였다)
let moveOk = 0;
for(const [x,y] of freed){
  const h = Math.random()*Math.PI*2;
  moveWithCoast(x, y, Math.cos(h)*0.02, Math.sin(h)*0.02, M);
  if(!M.stop && Math.hypot(M.x-x, M.y-y) > 0.01) moveOk++;
}
chk('되찾은 바다에서 배가 나아간다', moveOk > freed.length*0.9, `${moveOk}/${freed.length}`);

console.log('\n=== 6. 해안에서 미끄러지는가 (완전 정지가 아님) ===');
// 해안선 선분 하나를 골라 그 바깥에서 육지 쪽으로 비스듬히 밀어 본다
let slid = 0, tries = 0;
for(let t=0;t<400;t++){
  const i = (Math.random()*nSeg)|0;
  const ax=COASTSEG[i*4], ay=COASTSEG[i*4+1], bx=COASTSEG[i*4+2], by=COASTSEG[i*4+3];
  const vx=bx-ax, vy=by-ay, L=Math.hypot(vx,vy); if(L<0.5) continue;
  const mx=(ax+bx)/2, my=(ay+by)/2;
  const nx=-vy/L, ny=vx/L;                       // 법선
  for(const sgn of [1,-1]){
    const px=mx+nx*sgn*HULL_R*1.5, py=my+ny*sgn*HULL_R*1.5;
    if(py<0||py>=WORLD_H) continue;
    if(inLand(px,py)) continue;                  // 바다 쪽만
    // 해안을 45도로 받는 방향
    const hx=(-nx*sgn+vx/L)/Math.SQRT2, hy=(-ny*sgn+vy/L)/Math.SQRT2;
    moveWithCoast(px, py, hx*0.30, hy*0.30, M);
    tries++;
    if(Math.hypot(M.x-px, M.y-py) > 0.30*0.2) slid++;   // 의도의 20% 이상 나아갔으면 미끄러진 것
  }
}
chk('비스듬히 받으면 미끄러진다', slid > tries*0.9, `${slid}/${tries}`);

console.log('\n=== 7. 정면으로 받으면 멈춘다 ===');
let stopped = 0, st = 0;
for(let t=0;t<300;t++){
  const i = (Math.random()*nSeg)|0;
  const ax=COASTSEG[i*4], ay=COASTSEG[i*4+1], bx=COASTSEG[i*4+2], by=COASTSEG[i*4+3];
  const vx=bx-ax, vy=by-ay, L=Math.hypot(vx,vy); if(L<0.5) continue;
  const mx=(ax+bx)/2, my=(ay+by)/2, nx=-vy/L, ny=vx/L;
  for(const sgn of [1,-1]){
    const px=mx+nx*sgn*HULL_R*1.5, py=my+ny*sgn*HULL_R*1.5;
    if(py<0||py>=WORLD_H || inLand(px,py)) continue;
    st++;
    moveWithCoast(px, py, -nx*sgn*0.30, -ny*sgn*0.30, M);   // 법선 정반대 = 정면 충돌
    if(Math.hypot(M.x-px, M.y-py) < HULL_R) stopped++;
  }
}
chk('정면은 거의 나아가지 못한다', stopped > st*0.8, `${stopped}/${st}`);

console.log('\n=== 8. 해안에 붙어도 바다 쪽으로 돌리면 빠져나온다 ===');
// 접선만 보고 미끄러지면 한 번 닿은 배는 영영 해안을 떠나지 못한다.
// 특히 뱃머리를 바다로 정확히 돌리면 접선 성분이 0 이라 오히려 완전히 멈춘다.
// 바깥 법선 성분을 살려야 한다 — 그것을 여기서 확인한다.
const E = {d:0,nx:0,ny:0};
let escaped = 0, et = 0, headOn = 0;
for(let t=0;t<400;t++){
  const i = (Math.random()*nSeg)|0;
  const ax=COASTSEG[i*4], ay=COASTSEG[i*4+1], bx=COASTSEG[i*4+2], by=COASTSEG[i*4+3];
  const vx=bx-ax, vy=by-ay, L=Math.hypot(vx,vy); if(L<0.5) continue;
  const mx=(ax+bx)/2, my=(ay+by)/2, nx=-vy/L, ny=vx/L;
  for(const sgn of [1,-1]){
    // 해안에 딱 붙은 자리 (여유가 선체 반지름 언저리) 에 배를 둔다
    const px=mx+nx*sgn*HULL_R*1.02, py=my+ny*sgn*HULL_R*1.02;
    if(py<0||py>=WORLD_H || inLand(px,py)) continue;
    nearestCoast(px, py, 1, E);
    if(E.d > HULL_R*1.3) continue;            // 붙어 있지 않으면 시험 대상이 아니다
    et++;
    // ① 해안을 등지고 정면으로 바다를 향한다 — 예전 코드가 가장 확실히 멈추던 방향
    moveWithCoast(px, py, nx*sgn*0.30, ny*sgn*0.30, M);
    const gone = Math.hypot(M.x-px, M.y-py);
    if(gone > 0.29 && !M.stop) headOn++;
    // ② 비스듬히 바다 쪽으로 — 실제 조타에 가까운 경우
    const hx=(nx*sgn+vx/L)/Math.SQRT2, hy=(ny*sgn+vy/L)/Math.SQRT2;
    moveWithCoast(px, py, hx*0.30, hy*0.30, M);
    nearestCoast(M.x, M.y, 2, E);
    if(!M.stop && E.d > HULL_R*2) escaped++;
  }
}
chk('바다로 정면으로 돌리면 그대로 나아간다', headOn > et*0.95, `${headOn}/${et}`);
chk('비스듬히 돌리면 해안에서 멀어진다', escaped > et*0.9, `${escaped}/${et}`);

// 오목한 모서리에 몰아넣은 뒤 바다로 돌려 빠져나오는지.
// 빠져나올 때는 매 프레임 '지금 가장 가까운 해안의 바깥쪽'으로 뱃머리를 잡는다
// — 사람이 조타하는 방식이다. 처음 방향을 고정해 두면 해안을 따라 밀려간 뒤
// 그 방향이 더는 바다 쪽이 아니게 되어, 충돌이 아니라 시험이 틀리게 된다.
let cornerOut = 0, ct = 0;
for(let t=0;t<400;t++){
  const i = (Math.random()*nSeg)|0;
  const ax=COASTSEG[i*4], ay=COASTSEG[i*4+1], bx=COASTSEG[i*4+2], by=COASTSEG[i*4+3];
  const vx=bx-ax, vy=by-ay, L=Math.hypot(vx,vy); if(L<0.5) continue;
  const nx=-vy/L, ny=vx/L;
  for(const sgn of [1,-1]){
    let px=ax+nx*sgn*HULL_R*1.02, py=ay+ny*sgn*HULL_R*1.02;   // 선분 끝점 = 모서리
    if(py<0||py>=WORLD_H || inLand(px,py)) continue;
    nearestCoast(px, py, 1, E);
    if(E.d > HULL_R*1.3) continue;
    ct++;
    // 모서리에 10프레임 밀어붙인다
    for(let s=0;s<10;s++){ moveWithCoast(px,py,-nx*sgn*0.05,-ny*sgn*0.05,M); px=M.x; py=M.y; }
    // 30프레임 동안 '지금의 바깥 법선' 쪽으로 조타해 빠져나온다
    for(let s=0;s<30;s++){
      nearestCoast(px, py, 3, E);
      if(E.d === Infinity || E.d > HULL_R*3) break;
      moveWithCoast(px, py, E.nx*0.05, E.ny*0.05, M); px=M.x; py=M.y;
    }
    nearestCoast(px, py, 3, E);
    if(E.d > HULL_R*3) cornerOut++;
  }
}
chk('모서리에 끼어도 빠져나온다', cornerOut > ct*0.98, `${cornerOut}/${ct}`);

console.log('\n=== 9. 회귀 ===');
chk('마스크 isLand 는 남아 있다', /function isLand\(wx,wy\)/.test(src));
chk('배 이동이 isLand 를 쓰지 않는다', !/if\(!isLand\(nx, ?ship\.y\)\)/.test(src));
chk('좌초해도 돛을 내리지 않는다', !/ship\.sail=0; ship\.grounded=true/.test(src));
chk('선체 반지름이 이름 있는 상수', /const HULL_KM\s*=/.test(src));
chk('충돌 표시가 선체 띠를 그린다', /lineWidth=HULL_R\*2/.test(src));
chk('접촉 처리가 접선이 아니라 법선을 쓴다', /ux\*HIT\.nx \+ uy\*HIT\.ny/.test(src),
    '접선만 보면 해안에 붙은 배가 바다로 나가지 못한다');
chk('nearestCoast 가 바깥 법선을 돌려준다', /out\.nx = \(x-bpx\)\/d/.test(src));
try { new Function(src.split('<script>').pop().split('</script>')[0]); chk('script 파싱', true); }
catch (e) { chk('script 파싱', false, e.message); }

console.log('\n=== 결과 ===');
console.log('  통과 ' + pass + ' / 실패 ' + fail + '  (총 ' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
