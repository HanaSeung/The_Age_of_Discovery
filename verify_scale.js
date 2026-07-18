// verify_scale.js - 지도 데이터 분리 + 축척/배율 검증
const fs = require('fs');
const D = 'D:\\MyApp\\The_Age_of_Discovery\\';
const html = fs.readFileSync(D + 'world_chart.html', 'utf8');

console.log('HTML 크기        :', Math.round(html.length/1024), 'KB (구 220KB 데이터 제거됨)');
console.log('land_data.js 연결:', html.includes('src="land_data.js"'));
console.log('LANDBIN 디코더   :', html.includes('const nRings = dv.getUint32'));
console.log('마스크 8192      :', html.includes('const MASK_W  = 8192'));
console.log('ZMAX 13          :', html.includes('const ZMAX=13'));
console.log('배 아이콘 33px   :', html.includes('const s=1.15'));

const src = html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)[1];
const stub = `
const stubCtx=new Proxy({},{get:()=>()=>({data:new Uint8Array(0)})});
const document={getElementById:()=>({getContext:()=>stubCtx,style:{},addEventListener:()=>{},innerHTML:'',width:0,height:0}),createElement:()=>({getContext:()=>stubCtx,width:0,height:0})};
const window={devicePixelRatio:1,innerWidth:1600,innerHeight:900,addEventListener:()=>{},LANDBIN:null,CURRENTS:null};
const performance={now:()=>0}; const requestAnimationFrame=()=>0;
const addEventListener=()=>{}; const Path2D=function(){this.moveTo=this.lineTo=this.closePath=()=>{};};
const atob=s=>Buffer.from(s,'base64').toString('binary');
`;
try { new Function(stub + '\n' + src); console.log('SYNTAX           : OK\n'); }
catch (e) { console.log('SYNTAX ERROR     :', e.message); process.exit(1); }

// --- land_data.js 이진 무결성 + 좌표 검증 ---
eval(fs.readFileSync(D + 'land_data.js', 'utf8').replace('window.LANDBIN', 'var LANDBIN'));
const buf = Buffer.from(LANDBIN.data, 'base64');
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
let off = 0;
const nR = dv.getUint32(off, true); off += 4;
const lens = [];
for (let r = 0; r < nR; r++) { lens.push(dv.getUint32(off, true)); off += 4; }
const total = lens.reduce((a, b) => a + b, 0);
console.log('링 수 :', nR, '| 선언 점수:', LANDBIN.points, '| 합계 일치:', total === LANDBIN.points);
console.log('바이트 정합:', off + total*4 === buf.length, `(${buf.length} bytes)`);

let minLon=999, maxLon=-999, minLat=999, maxLat=-999;
for (let i = 0; i < total; i++) {
  const lo = dv.getInt16(off,true)/100; off+=2;
  const la = dv.getInt16(off,true)/100; off+=2;
  if(lo<minLon)minLon=lo; if(lo>maxLon)maxLon=lo;
  if(la<minLat)minLat=la; if(la>maxLat)maxLat=la;
}
console.log(`경도 ${minLon}~${maxLon} / 위도 ${minLat}~${maxLat} (±180 / ±90 이내여야 함)`);

// --- 축척 표 ---
const WORLD_W=8192, KMPX=40075/WORLD_W, ZMAX=13, ICON=33.3;
console.log('\n=== 축척 ===');
console.log(`1 월드px = ${KMPX.toFixed(2)} km | 마스크 8192 → 충돌 격자 ${(8192/8192*KMPX).toFixed(2)} km`);
console.log(`해안선 정밀도 0.01° = 1.11 km = ${(1.11/KMPX).toFixed(2)} 월드px`);
console.log(`  → ZMAX ${ZMAX} 에서 해안선 오차 ${(1.11/KMPX*ZMAX).toFixed(1)} 화면px (3px 근처면 양호)`);
console.log('\n=== 배 아이콘 실제 크기 (아이콘 12px 고정) ===');
for (const [n,z] of [['최대 줌아웃',1600/8192],['초기 0.42',0.42],['배율 5',5],['최대 ZMAX',ZMAX]]) {
  console.log(`  ${n.padEnd(12)} zoom ${z.toFixed(2).padStart(6)} → ${(ICON/z*KMPX).toFixed(1).padStart(7)} km`);
}
console.log(`\n(이전: 아이콘 33px / ZMAX 2.2 → 최대 줌인에서도 74 km)`);
console.log(`메모리: 마스크 ${(8192*4096/1024/1024).toFixed(1)} MB (Uint8)`);
