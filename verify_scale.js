// verify_scale.js — 지도 자료 분리 + 축척/배율 검증
// 실행: node verify_scale.js
//
// 2026.07 개정 세 가지:
//  1. 경로가 'D:\MyApp\...' 로 박혀 있어 C: 컴퓨터에서는 아예 돌지 않았다 → __dirname
//  2. land_data.js 이진을 자기 안에서 다시 해석하고 있었다. 형식이 delta8 로 바뀌자
//     그대로 터졌다 — 부록 C의 '재구현하면 시험과 코드가 갈라진다'에 걸린 경우다.
//     이진 무결성은 verify_land.js 가 원본 디코더를 오려서 검사한다. 여기서는 뺀다.
//  3. ZMAX 13 · 배 아이콘 33px 은 낡은 값이었다 → 기준 배율 100
"use strict";
const fs = require('fs'), path = require('path');
const DIR = __dirname;
const html = fs.readFileSync(path.join(DIR, 'world_chart.html'), 'utf8');

let pass = 0, fail = 0;
const chk = (n, c, note) => { c ? (pass++, console.log('  OK   ' + n + (note ? '  ' + note : '')))
                                : (fail++, console.log('  FAIL ' + n + (note ? '  ' + note : ''))); };

console.log('\n=== 0. 자료 분리 ===');
console.log(`  world_chart.html ${Math.round(html.length/1024)} KB` +
            ` | land_data.js ${Math.round(fs.statSync(path.join(DIR,'land_data.js')).size/1024)} KB`);
chk('지도 자료가 HTML 밖에 있다', html.includes('src="land_data.js"'));
chk('HTML 안에 좌표가 박혀 있지 않다', html.length < 400*1024,
    Math.round(html.length/1024) + ' KB');
chk('디코더가 원본에 있다', html.includes('const nRings = dv.getUint32'));
chk('마스크가 8192', html.includes('const MASK_W  = 8192'));

console.log('\n=== 1. 문법 ===');
const src = html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)[1];
const stub = `
const stubCtx=new Proxy({},{get:()=>()=>({data:new Uint8Array(0)})});
const document={getElementById:()=>({getContext:()=>stubCtx,style:{},addEventListener:()=>{},innerHTML:'',width:0,height:0}),createElement:()=>({getContext:()=>stubCtx,width:0,height:0})};
const window={devicePixelRatio:1,innerWidth:1600,innerHeight:900,addEventListener:()=>{},LANDBIN:null,CURRENTS:null};
const performance={now:()=>0}; const requestAnimationFrame=()=>0;
const addEventListener=()=>{}; const Path2D=function(){this.moveTo=this.lineTo=this.closePath=()=>{};};
const atob=s=>Buffer.from(s,'base64').toString('binary');
`;
let syn = true, synMsg = '';
try { new Function(stub + '\n' + src); } catch (e) { syn = false; synMsg = e.message; }
chk('script 파싱', syn, synMsg);

console.log('\n=== 2. 기준 배율 ===');
const grab = re => { const m = html.match(re); return m ? Number(m[1]) : NaN; };
const ZMAX  = grab(/const ZMAX=(\d+)/);
const ZDATA = grab(/const ZDATA_LIMIT=(\d+)/);
const Z0    = grab(/let zoom = ([\d.]+)/);
chk('ZMAX 가 100 이다 (2026.07 확정)', ZMAX === 100, String(ZMAX));
chk('임시값 딱지가 떨어졌다', !/ZMAX=\d+;\s*\/\/\s*★ 임시값/.test(html));
chk('시작 배율이 기준 배율이다', Z0 === ZMAX, `시작 ${Z0} / 상한 ${ZMAX}`);
chk('자료 한계가 기준 배율보다 위다', ZDATA > ZMAX, `ZDATA_LIMIT ${ZDATA} > ZMAX ${ZMAX}`);

console.log('\n=== 3. 축척 ===');
const WORLD_W = 8192, KMPX = 40075/WORLD_W;
// land_data.js 는 window 에 붙으므로 require 하지 않는다 — 머리글만 글로 읽는다
const ldjs = fs.readFileSync(path.join(DIR, 'land_data.js'), 'utf8').slice(0, 800);
const scale = Number((ldjs.match(/scale:\s*(\d+)/) || [])[1]);
const fmt = (ldjs.match(/format:\s*"(\w+)"/) || [])[1];
const degKm = 111.32/scale;
console.log(`  1 월드px = ${KMPX.toFixed(3)} km | 해안선 격자 1/${scale}° = ${degKm.toFixed(3)} km` +
            ` = ${(degKm/KMPX).toFixed(4)} 월드px | 형식 ${fmt}`);
const errPx = degKm/KMPX*ZMAX;
console.log(`  → 배율 ${ZMAX} 에서 좌표 오차 ${errPx.toFixed(2)} 화면px` +
            ` | 3px 이 되는 배율 ${Math.round(3*KMPX/degKm)}`);
chk('기준 배율에서 좌표 오차가 3px 아래다', errPx < 3, errPx.toFixed(2) + 'px');
chk('ZDATA_LIMIT 이 계산과 맞는다',
    Math.abs(ZDATA - 3*KMPX/degKm) < 3, `${ZDATA} vs ${Math.round(3*KMPX/degKm)}`);
chk('형식이 delta8 이다', fmt === 'delta8', String(fmt));

console.log('\n=== 4. 배가 화면에서 얼마나 큰가 ===');
const iconPx = grab(/function shipLenPx\(\)\{ return (\d+)/);
chk('shipLenPx 가 살아 있다', isFinite(iconPx), '선체 ' + iconPx + 'px');
for (const [n,z] of [['최소 ZMIN', 1600/8192], ['0.42(옛 시작)', 0.42],
                     ['5', 5], ['기준 100', ZMAX]]) {
  console.log(`  ${n.padEnd(14)} zoom ${z.toFixed(2).padStart(7)} → 화면 폭이 담는 거리 ` +
              `${(1920/z*KMPX).toFixed(0).padStart(6)} km | 배 ${(iconPx/z*KMPX).toFixed(2).padStart(7)} km`);
}
console.log(`  마스크 메모리 ${(8192*4096/1048576).toFixed(1)} MB (Uint8)`);

console.log('\n=== 결과 ===');
console.log(`  통과 ${pass} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
