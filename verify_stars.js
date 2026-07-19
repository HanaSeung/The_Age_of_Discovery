// verify_stars.js — star_data.js 가 1500년의 진짜 하늘인가
// 실행: node verify_stars.js
//
// build_stars.py 가 쓴 세차 공식(Meeus 21장의 zeta/z/theta)을 여기서 그대로
// 다시 쓰면 검증이 아니다. 같은 실수를 두 번 해도 통과하기 때문이다.
//
// 그래서 다른 길로 간다. 세차운동은 '황도 극을 축으로 한 회전'이다. 그러니
//   - 별의 황위(ecliptic latitude)는 변하지 않아야 하고
//   - 황경은 모든 별이 똑같은 각도만큼 밀려야 한다
// 이 두 성질은 공식과 무관한 기하학적 사실이라, 빌드 쪽이 틀리면 걸린다.
"use strict";
const fs = require('fs'), path = require('path');
const D = __dirname;
const src = fs.readFileSync(path.join(D, 'star_data.js'), 'utf8');
let pass = 0, fail = 0;
function chk(n, c, note){
  if(c){ pass++; console.log('  OK   ' + n + (note ? '  ' + note : '')); }
  else  { fail++; console.log('  FAIL ' + n + (note ? '  ' + note : '')); }
}

const F = n => parseFloat(src.match(new RegExp(n + '\\s*:\\s*([0-9.eE+-]+)'))[1]);
const N = F('count')|0, EPOCH = F('epoch'), MMIN = F('magMin'), MSTEP = F('magStep');
const buf = Buffer.from(src.match(/data:\s*"([^"]+)"/)[1], 'base64');
const RA  = i => buf.readUInt16LE(i*2) / 65536 * 360;
const DEC = i => buf.readInt16LE(N*2 + i*2) / 32767 * 90;
const MAG = i => buf[N*4 + i] * MSTEP + MMIN;
const NAMES = JSON.parse('{' + (src.match(/names:\s*\{([^}]*)\}/)[1] || '')
                .replace(/(\d+):/g, '"$1":') + '}');


const R = Math.PI/180;
// 적도좌표 -> 황도좌표. eps 는 그 시대의 황도경사각이다.
function toEcl(ra, dec, eps){
  const a = ra*R, d = dec*R, e = eps*R;
  const lon = Math.atan2(Math.sin(a)*Math.cos(e) + Math.tan(d)*Math.sin(e),
                         Math.cos(a)) / R;
  const lat = Math.asin(Math.sin(d)*Math.cos(e)
                        - Math.cos(d)*Math.sin(e)*Math.sin(a)) / R;
  return [ (lon%360+360)%360, lat ];
}
function obliquity(year){                 // 황도경사각도 아주 천천히 변한다
  const T = (year-2000)/100;
  return 23.439291 - 0.0130042*T - 1.64e-7*T*T + 5.04e-7*T*T*T;
}
// J2000 부터 그 해까지 황경이 밀린 총량 (일반세차). zeta/z/theta 와는
// 다른 계열의 식이라 서로 베끼지 않는다.
function precLon(year){
  const T = (year-2000)/100;
  return (5028.796195*T + 1.1054348*T*T + 0.00007964*T*T*T) / 3600;
}
function sep(ra1,d1,ra2,d2){              // 두 점 사이 각거리(도)
  const c = Math.sin(d1*R)*Math.sin(d2*R)
          + Math.cos(d1*R)*Math.cos(d2*R)*Math.cos((ra1-ra2)*R);
  return Math.acos(Math.max(-1,Math.min(1,c)))/R;
}
function nearest(ra, dec){
  let bi = -1, bd = 1e9;
  for(let i=0;i<N;i++){ const d = sep(ra,dec,RA(i),DEC(i)); if(d<bd){bd=d;bi=i;} }
  return [bi, bd];
}


// 밝은 별의 J2000 좌표 (도, 도, V등급). 널리 쓰이는 값을 그대로 적었다.
const KNOWN = [
  ['시리우스',   101.2872, -16.7161, -1.46],
  ['카노푸스',    95.9880, -52.6957, -0.72],
  ['아르크투루스',213.9153,  19.1825, -0.05],
  ['베가',       279.2347,  38.7837,  0.03],
  ['카펠라',      79.1723,  45.9980,  0.08],
  ['리겔',        78.6345,  -8.2017,  0.13],
  ['프로키온',   114.8255,   5.2250,  0.34],
  ['아케르나르',  24.4285, -57.2367,  0.46],
  ['안타레스',   247.3519, -26.4320,  1.06],
  // 아크룩스는 짝별이다. 맨눈에는 0.77등급 하나로 보이지만 목록에는
  // 알파1(1.33)과 알파2(1.73)로 따로 실려 있다. 목록 쪽 값을 써야 맞다.
  ['아크룩스',   186.6496, -63.0991,  1.33],
  ['북극성',      37.9545,  89.2641,  2.02],
];

console.log('\n=== 1. 파일 구조 ===');
chk('별 개수를 읽었다', N > 100, `${N}개`);
chk('데이터 길이 = ra2 + dec2 + mag1', buf.length === N*5, `${buf.length} bytes`);
chk('연도가 1500년이다', EPOCH === 1500, `${EPOCH}`);
chk('적경이 0~360 안에 있다',
    [...Array(N).keys()].every(i => RA(i) >= 0 && RA(i) < 360));
chk('적위가 -90~90 안에 있다',
    [...Array(N).keys()].every(i => Math.abs(DEC(i)) <= 90.001));
let sorted = true;
for(let i=1;i<N;i++) if(MAG(i) < MAG(i-1) - 1e-9){ sorted = false; break; }
chk('밝은 별이 앞에 온다', sorted, '개수를 줄일 때 앞에서 자르면 된다');
chk('가장 밝은 별이 시리우스급이다', MAG(0) < -1.4, `${MAG(0).toFixed(2)}등급`);
chk('가장 어두운 별이 한계등급 부근이다', MAG(N-1) > 4.3 && MAG(N-1) <= 4.55,
    `${MAG(N-1).toFixed(2)}등급`);


console.log('\n=== 2. 세차운동이 황도 극을 축으로 한 회전인가 ===');
// 이것이 이 검증의 핵심이다. 회전이라면 황위는 그대로여야 하고 황경은
// 모든 별이 같은 각도만큼 밀려야 한다. 빌드 쪽 공식과 무관한 검사다.
const E2000 = obliquity(2000), E1500 = obliquity(EPOCH);
const dLonWant = precLon(EPOCH);          // 음수 = 뒤로 밀림
let worstLat = 0, lons = [];
const found = [];
for(const [nm, ra0, dec0, m0] of KNOWN){
  const [l0, b0] = toEcl(ra0, dec0, E2000);
  // 황경만 밀고 황위는 그대로 둔 채 1500년 적도좌표로 되돌린다 (독립 계산)
  const l1 = (l0 + dLonWant + 720) % 360, b1 = b0;
  const e = E1500*R, L = l1*R, B = b1*R;
  const ra1 = (Math.atan2(Math.sin(L)*Math.cos(e) - Math.tan(B)*Math.sin(e),
                          Math.cos(L))/R + 360) % 360;
  const dec1 = Math.asin(Math.sin(B)*Math.cos(e)
                         + Math.cos(B)*Math.sin(e)*Math.sin(L))/R;
  const [i, d] = nearest(ra1, dec1);
  found.push([nm, i, m0]);
  const [l2, b2] = toEcl(RA(i), DEC(i), E1500);
  const dLat = Math.abs(b2 - b0);
  let dLon = ((l2 - l0 + 540) % 360) - 180;
  worstLat = Math.max(worstLat, dLat);
  lons.push(dLon);
  chk(`${nm} 이 제자리에 있다`, d < 0.12 && Math.abs(MAG(i)-m0) < 0.12,
      `어긋남 ${(d*60).toFixed(1)}' · 등급 ${MAG(i).toFixed(2)} (참값 ${m0.toFixed(2)})`);
}
chk('황위가 보존된다 (회전축이 황도 극이다)', worstLat < 0.15,
    `최대 어긋남 ${(worstLat*60).toFixed(1)}'`);
const lmin = Math.min(...lons), lmax = Math.max(...lons);
// 완전히 같지는 않다. 여기서 쓴 식은 황도면이 고정돼 있다고 보지만, 실제로는
// 다른 행성들이 끌어당겨 황도면 자체가 500년에 0.065도쯤 기운다. 그 몫이
// 위 '황위 어긋남 4분' 과 아래 폭으로 나타난다. 축이나 부호를 틀리면
// 분(分)이 아니라 도(度) 단위로 벌어지므로 그건 여기서 걸린다.
chk('황경이 거의 같은 만큼 밀렸다', lmax - lmin < 0.3,
    `${lmin.toFixed(3)}° ~ ${lmax.toFixed(3)}° (이론값 ${dLonWant.toFixed(3)}°, ` +
    `폭 ${((lmax-lmin)*60).toFixed(1)}')`);


console.log('\n=== 3. 회전이면 별끼리의 거리는 그대로다 ===');
// 각거리는 어떤 회전에도 변하지 않는다. 별 하나가 엉뚱한 데로 갔다면 여기서 걸린다.
let worstPair = 0, worstName = '';
for(let a=0; a<KNOWN.length; a++)
  for(let b=a+1; b<KNOWN.length; b++){
    const d0 = sep(KNOWN[a][1], KNOWN[a][2], KNOWN[b][1], KNOWN[b][2]);
    const ia = found[a][1], ib = found[b][1];
    const d1 = sep(RA(ia), DEC(ia), RA(ib), DEC(ib));
    if(Math.abs(d1-d0) > worstPair){
      worstPair = Math.abs(d1-d0); worstName = `${KNOWN[a][0]}-${KNOWN[b][0]}`;
    }
  }
chk('별 사이 각거리가 그대로다', worstPair < 0.1,
    `가장 어긋난 짝 ${worstName} ${(worstPair*60).toFixed(1)}'`);

console.log('\n=== 4. 1500년의 하늘다운가 ===');
// 북극성이 극에서 얼마나 떨어져 있나. 지금은 0.74도, 1500년에는 3.4도쯤이었다.
// 당시 항해사들이 이 어긋남을 표로 보정해 가며 위도를 쟀다.
const pi = found.find(f => f[0] === '북극성')[1];
const poleDist = 90 - DEC(pi);
chk('북극성이 극에서 3.4도쯤 떨어져 있다', poleDist > 3.0 && poleDist < 3.8,
    `${poleDist.toFixed(2)}° (2000년에는 0.74°)`);
chk('그래도 북극성이 가장 북쪽 밝은 별이다',
    !([...Array(N).keys()].some(i => DEC(i) > DEC(pi) && MAG(i) < MAG(pi))),
    '북쪽을 찾는 별로 여전히 쓸 만하다');
// 남십자성은 남반구 별이라 북쪽에서는 안 보여야 한다
const ai = found.find(f => f[0] === '아크룩스')[1];
chk('남십자성이 남쪽 깊이 있다', DEC(ai) < -55,
    `적위 ${DEC(ai).toFixed(1)}° — 북위 ${(90+DEC(ai)).toFixed(0)}° 위에서는 안 뜬다`);


console.log('\n=== 5. 하늘 전체에 고르게 퍼져 있는가 ===');
// 좌표를 잘못 풀면 별이 한쪽에 몰리거나 띠를 이룬다. 은하수 때문에 완전히
// 고르지는 않지만, 어느 한 구역이 텅 비거나 몰리면 안 된다.
const bins = new Array(12).fill(0);
for(let i=0;i<N;i++) bins[Math.min(11, Math.floor(RA(i)/30))]++;
chk('적경 30도 구역마다 별이 있다', bins.every(b => b > 20),
    `가장 적은 구역 ${Math.min(...bins)}개 / 가장 많은 구역 ${Math.max(...bins)}개`);
let north = 0;
for(let i=0;i<N;i++) if(DEC(i) > 0) north++;
chk('남북이 얼추 반반이다', Math.abs(north/N - 0.5) < 0.1,
    `북 ${north} / 남 ${N-north}`);
// 같은 자리에 별이 겹치는 일 자체는 정상이다. 밝은 별 목록은 짝별(이중성)을
// 따로 싣기 때문이다 — 알파 센타우리 A/B, 남십자성 아크룩스 A/B 같은 것들.
// 좌표 푸는 데 문제가 있으면 몇 건이 아니라 수십·수백 건이 겹친다.
let dup = 0;
for(let i=0;i<N;i++) for(let j=i+1;j<Math.min(N,i+40);j++)
  if(sep(RA(i),DEC(i),RA(j),DEC(j)) < 0.005) dup++;
chk('겹친 별이 짝별 몇 쌍뿐이다', dup < 15, `겹침 ${dup}건 / 별 ${N}개`);
chk('이름표가 밝은 별에 붙어 있다', Object.keys(NAMES).length > 10,
    `${Object.keys(NAMES).length}개`);

console.log(`\n${fail === 0 ? '전부 통과' : '실패 있음'} - 통과 ${pass}, 실패 ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
