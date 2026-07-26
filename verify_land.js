// verify_land.js — land_data.js 델타 형식과 디코더 검증
// 실행: node verify_land.js
//
// world_chart.html 의 디코더를 그대로 오려 돌리고, 그 결과를 원본 geojson 에서
// 독립적으로 다시 계산한 값과 맞춰 본다. 디코더가 인코더와 어긋나면 여기서 걸린다.
"use strict";
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = __dirname;
const src = fs.readFileSync(path.join(DIR, 'world_chart.html'), 'utf8');

let pass = 0, fail = 0;
const chk = (n, c, note) => { c ? (pass++, console.log('  OK   ' + n + (note ? '  ' + note : '')))
                                : (fail++, console.log('  FAIL ' + n + (note ? '  ' + note : ''))); };

function slice(a, b, what){
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if(i < 0 || j < 0) throw new Error('원본에서 ' + what + ' 를 찾지 못함');
  return src.slice(i, j);
}
const partConst = slice('// ===== 좌표계 / 월드 상수 =====',
                        '// ===== 수심 밴드', '월드 상수');
const partLand  = slice('// ===== 육지 폴리곤',
                        '// ===== 충돌 마스크', '육지 디코더');

// ---- 껍데기: Path2D 는 부른 명령을 기록한다 ----
const ops = [];
class FakePath2D {
  moveTo(x,y){ ops.push(['M',x,y]); }
  lineTo(x,y){ ops.push(['L',x,y]); }
  closePath(){ ops.push(['C']); }
  addPath(p){}                        // 고리 경로를 통짜에 합칠 때 — 점을 다시 세면 안 된다
}
const sandbox = {
  console: { log(){}, warn(){}, error(m){ throw new Error(m); } },
  Math, Uint8Array, Uint32Array, Float32Array, DataView, Infinity, NaN,
  Path2D: FakePath2D,
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  window: {}
};
new Function('window', 'atob', fs.readFileSync(path.join(DIR, 'land_data.js'), 'utf8'))
  (sandbox.window, sandbox.atob);
vm.createContext(sandbox);
vm.runInContext(partConst + '\n' + partLand + `
globalThis.__X = { COASTSEG, WORLD_W, WORLD_H, KM_PER_PX, DEG2PXX, DEG2PXY, project };`, sandbox);
const { COASTSEG, WORLD_W, WORLD_H, KM_PER_PX, DEG2PXX, DEG2PXY } = sandbox.__X;
const L = sandbox.window.LANDBIN;

console.log('\n=== 0. 형식 머리 ===');
console.log(`  고리 ${L.rings} | 점 ${L.points} | scale ${L.scale} | 형식 ${L.format}` +
            ` | .js ${(fs.statSync(path.join(DIR,'land_data.js')).size/1024).toFixed(0)} KB`);
chk('형식이 delta8 이다', L.format === 'delta8', L.format);
chk('scale 이 1000 이다 (격자 0.111km)', L.scale === 1000,
    (111.32/L.scale).toFixed(3) + ' km');
chk('예전 int16 절대좌표로는 담을 수 없는 정밀도다', 180*L.scale > 32767,
    '180 x ' + L.scale + ' = ' + (180*L.scale) + ' > 32,767');
chk('디코더가 형식을 확인한다', /L\.format !== 'delta8'/.test(src));

console.log('\n=== 1. 디코더가 끝까지 읽었다 ===');
const nM = ops.filter(o => o[0]==='M').length;
const nL = ops.filter(o => o[0]==='L').length;
const nC = ops.filter(o => o[0]==='C').length;
chk('고리 수만큼 moveTo 했다', nM === L.rings, nM + ' / ' + L.rings);
chk('고리 수만큼 closePath 했다', nC === L.rings, nC + ' / ' + L.rings);
chk('점 수가 맞는다 (moveTo + lineTo)', nM + nL === L.points, (nM+nL) + ' / ' + L.points);
chk('선분 수가 점 수와 같다 (닫힌 고리)', COASTSEG.length/4 === L.points,
    (COASTSEG.length/4) + ' / ' + L.points);

console.log('\n=== 2. 좌표가 월드 안에 있다 ===');
let oob = 0, nan = 0;
for(let i=0;i<COASTSEG.length;i++){
  const v = COASTSEG[i];
  if(!isFinite(v)){ nan++; continue; }
  const lim = (i%2===0) ? WORLD_W : WORLD_H;
  if(v < -0.001 || v > lim+0.001) oob++;
}
chk('NaN·무한대 없음', nan === 0, nan ? nan+'개' : '전부 유한');
chk('월드 사각형 밖으로 나간 좌표 없음', oob === 0, oob ? oob+'개' : '전부 안쪽');

console.log('\n=== 3. 원본 geojson 과 점 하나하나 대조 (브루트포스) ===');
// 디코더를 믿지 않는다. build_land.py 와 같은 규칙으로 Node 에서 다시 만들어 맞춘다.
const GJ = path.join(DIR, 'ne_10m_land.geojson');
if(!fs.existsSync(GJ)){
  console.log('  --   ne_10m_land.geojson 이 없어 건너뜀 (python build_land.py 로 내려받는다)');
} else {
  const gj = JSON.parse(fs.readFileSync(GJ, 'utf8'));
  const MIN_AREA = 0.001, NDEC = 3;
  const r3 = v => Math.round(v*1000)/1000;
  const area = pts => { let a=0; const n=pts.length;
    for(let i=0;i<n;i++){ const p=pts[i], q=pts[(i+1)%n]; a += p[0]*q[1] - q[0]*p[1]; }
    return Math.abs(a)/2; };
  const want = [];
  for(const f of gj.features){
    const g=f.geometry, c=g.coordinates;
    const polys = g.type==='Polygon' ? [c] : c;
    for(const poly of polys){
      if(!poly || !poly.length) continue;
      if(area(poly[0]) < MIN_AREA) continue;
      for(const ring of poly){
        const pts=[]; let last=null;
        for(const xy of ring){
          const q=[r3(xy[0]), r3(xy[1])];
          if(!last || q[0]!==last[0] || q[1]!==last[1]){ pts.push(q); last=q; }
        }
        if(pts.length>=4) want.push(pts);
      }
    }
  }
  const wantPts = want.reduce((a,r)=>a+r.length, 0);
  chk('고리 수가 원본과 같다', want.length === L.rings, want.length + ' / ' + L.rings);
  // Python 의 round() 는 은행가 반올림(0.5→짝수), JS 의 Math.round 는 올림이다.
  // 415,936 점 중 극소수가 한 격자(0.001도) 어긋나고, 그 때문에 중복 제거 결과도
  // 몇 점 달라진다. 이것은 형식이 아니라 반올림 규칙의 차이이므로 허용한다.
  chk('점 수가 원본과 사실상 같다', Math.abs(wantPts - L.points) <= 8,
      wantPts + ' / ' + L.points + ' (차이 ' + Math.abs(wantPts-L.points) + ')');

  // 고리마다 두 포인터로 훑는다. 반올림으로 한 점이 더 있거나 없어도 다시 맞춘다.
  // 잡으려는 것은 '델타 누적이 어긋나 오차가 점점 커지는 것'이다.
  const QPX = (1/L.scale) * DEG2PXX;          // 격자 한 칸 = 0.02276 월드px
  const TOL = QPX * 1.2;
  let k = 0, mismatch = 0, skipped = 0, worst = 0, worstAt = '';
  for(let r=0; r<want.length; r++){
    const ring = want[r];
    if(!ops[k] || ops[k][0] !== 'M'){ mismatch++; worstAt = '고리 '+r+' 시작이 moveTo 가 아님'; break; }
    const dec = [];
    dec.push(ops[k++]);
    while(ops[k] && ops[k][0] === 'L') dec.push(ops[k++]);
    if(ops[k] && ops[k][0] === 'C') k++;
    let si = 0;
    for(let di=0; di<dec.length; di++){
      const op = dec[di];
      let d = Infinity, use = si;
      for(let t=si; t<Math.min(si+3, ring.length); t++){
        const ex = sandbox.__X.project(ring[t][0], ring[t][1]);
        const e = Math.max(Math.abs(op[1]-ex[0]), Math.abs(op[2]-ex[1]));
        if(e < d){ d = e; use = t; }
      }
      if(d > worst){ worst = d; worstAt = '고리 '+r+' 점 '+di; }
      if(d > TOL){ mismatch++; break; }
      skipped += (use - si);
      si = use + 1;
    }
  }
  chk('모든 점이 원본과 일치한다 (드리프트 없음)', mismatch === 0,
      mismatch ? mismatch+'점 어긋남 @ '+worstAt
               : '최대 오차 ' + worst.toFixed(5) + '월드px (격자 ' + QPX.toFixed(5) + 'px 이내)');
  chk('반올림 때문에 건너뛴 점이 극소수다', skipped <= 8, skipped + '점');
}

console.log('\n=== 4. 해상도 — 배율 100 에서 무엇이 달라졌는가 ===');
const seg = [];
for(let i=0;i<COASTSEG.length;i+=4){
  let dx = COASTSEG[i+2]-COASTSEG[i];
  if(Math.abs(dx) > WORLD_W/2) dx -= Math.sign(dx)*WORLD_W;   // 이음매를 걸친 변
  seg.push(Math.hypot(dx, COASTSEG[i+3]-COASTSEG[i+1]) * KM_PER_PX);
}
seg.sort((a,b)=>a-b);
const q = f => seg[Math.min(seg.length-1, Math.floor(seg.length*f))];
const mean = seg.reduce((a,b)=>a+b,0)/seg.length;
const PX_AT_100 = 100 / KM_PER_PX;       // 배율 100 에서 1km 가 화면 몇 px 인가
console.log(`  선분 ${seg.length} | 평균 ${mean.toFixed(2)}km | 중앙 ${q(.5).toFixed(3)}km` +
            ` | p10 ${q(.1).toFixed(3)}km | 배율100 에서 중앙 ${(q(.5)*PX_AT_100).toFixed(0)}px`);
chk('선분이 예전(60,527)보다 훨씬 많다', seg.length > 300000, seg.length.toLocaleString() + '개');
chk('중앙 선분이 예전(11.0km)의 절반 아래다', q(.5) < 5.5, q(.5).toFixed(3) + 'km');
chk('배율 100 에서 중앙 선분이 배 길이 안쪽이다',
    q(.5) < 5.6, q(.5).toFixed(2) + 'km < 배 5.6km');
chk('격자에 눌러붙은 흔적이 없다 — p10 이 격자값과 다르다',
    Math.abs(q(.1) - 111.32/L.scale) > 0.02,
    'p10 ' + q(.1).toFixed(3) + 'km vs 격자 ' + (111.32/L.scale).toFixed(3) + 'km');

console.log('\n=== 5. 생성기 규약 ===');
const py = fs.readFileSync(path.join(DIR, 'build_land.py'), 'utf8');
chk('10m 자료를 쓴다', /ne_10m_land\.geojson/.test(py));
chk('NDEC = 3', /^NDEC = 3/m.test(py));
chk('탈출 부호가 -128 이다', /^ESC = -128/m.test(py));
chk('탈출이 int16 을 넘으면 멈춘다', /assert -32768 <= dx <= 32767/.test(py));
chk('첫 점은 int32 로 담는다', /struct\.pack\("<ii", px, py\)/.test(py));
chk('보통 델타는 int8 둘', /struct\.pack\("<bb", dx, dy\)/.test(py));
chk('탈출은 int8+int16+int16', /struct\.pack\("<bhh", ESC, dx, dy\)/.test(py));

console.log('\n=== 결과 ===');
console.log(`  통과 ${pass} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
