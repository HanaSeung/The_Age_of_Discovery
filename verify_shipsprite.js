// verify_shipsprite.js — 배 그림(스프라이트)이 옳게 구워졌고 게임이 옳게 무는가.
//
// Node 에는 Image 가 없어 실제로 그려 볼 수는 없다. 그래서 두 갈래로 나눠 본다.
//   A. 데이터 — ship_sprite.js 가 실은 두 PNG 가 유효하고, 크기·hullLen 이 성하고,
//      배경이 실제로 투명한가(PNG 를 직접 뜯어 알파를 확인).
//   B. 코드 — world_chart.html 이 스프라이트를 물되, 그림이 없으면(검증 환경 포함)
//      옛 도형 배로 떨어지는 안전장치가 살아 있는가.
'use strict';
const fs = require('fs'), zlib = require('zlib');
let pass = 0, fail = 0;
function chk(name, ok, note){
  (ok ? pass++ : fail++);
  console.log('  ' + (ok ? 'OK  ' : 'FAIL') + '   ' + name + (note ? '  ' + note : ''));
}

const html = fs.readFileSync('world_chart.html', 'utf8');
const sjs  = fs.readFileSync('ship_sprite.js', 'utf8');

// ---- base64 PNG 를 풀어 폭·높이·알파채널을 읽는 최소 파서 ----
function pngInfo(dataUrl){
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  if(buf.slice(0,8).toString('hex') !== '89504e470d0a1a0a') throw new Error('PNG 서명 아님');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const bitDepth = buf[24], colorType = buf[25];
  // IDAT 을 모아 푼다
  let p = 8, idat = [];
  while(p < buf.length){
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p+4, p+8);
    if(type === 'IDAT') idat.push(buf.slice(p+8, p+8+len));
    p += 12 + len;
    if(type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  return { w, h, bitDepth, colorType, raw };
}

// PNG 를 스캔라인으로 되풀어 네 귀퉁이와 전체 알파 통계를 낸다 (RGBA, 8bit 만).
function alphaStats(info){
  const { w, h, raw, colorType, bitDepth } = info;
  if(colorType !== 6 || bitDepth !== 8) throw new Error('RGBA8 아님 ct='+colorType+' bd='+bitDepth);
  const stride = w * 4;
  const rows = [];
  let q = 0;
  const prev = Buffer.alloc(stride);
  for(let y = 0; y < h; y++){
    const filt = raw[q++];
    const cur = Buffer.alloc(stride);
    for(let i = 0; i < stride; i++){
      const x = raw[q++];
      const a = i >= 4 ? cur[i-4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i-4] : 0;
      let v;
      if(filt === 0) v = x;
      else if(filt === 1) v = x + a;
      else if(filt === 2) v = x + b;
      else if(filt === 3) v = x + ((a + b) >> 1);
      else { const pp=a+b-c, pa=Math.abs(pp-a), pb=Math.abs(pp-b), pc=Math.abs(pp-c);
             v = x + (pa<=pb&&pa<=pc ? a : pb<=pc ? b : c); }
      cur[i] = v & 255;
    }
    cur.copy(prev);
    rows.push(cur);
  }
  const A = (x,y) => rows[y][x*4+3];
  const corners = [A(0,0), A(w-1,0), A(0,h-1), A(w-1,h-1)];
  let opaque = 0, pink = 0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const a = rows[y][x*4+3];
    if(a > 200) opaque++;
    if(a > 40){
      const r=rows[y][x*4], g=rows[y][x*4+1], b=rows[y][x*4+2];
      if((r+b)/2 - g > 40) pink++;
    }
  }
  return { corners, opaque, pink, total: w*h };
}

console.log('\n=== A. 데이터 (ship_sprite.js) ===');
chk('SHIP_SPRITE 정의', /const SHIP_SPRITE\s*=/.test(sjs));
const mW = sjs.match(/w:\s*(\d+)/), mH = sjs.match(/h:\s*(\d+)/), mHL = sjs.match(/hullLen:\s*(\d+)/);
chk('w·h·hullLen 숫자로 있다', mW && mH && mHL,
    mW ? mW[1]+'x'+mH[1]+' 선체 '+mHL[1] : '');
const W = +mW[1], H = +mH[1], HL = +mHL[1];
chk('가로로 누운 그림 (w > h)', W > H, W+' > '+H);
chk('선체가 그림보다 짧다 (hullLen < w)', HL < W && HL > W*0.5, HL+' vs '+W);

// data URL 두 개를 뽑는다
const urls = {};
for(const key of ['set','furl']){
  const m = sjs.match(new RegExp(key+"\\s*:\\s*'(data:image/png;base64,[^']+)'"));
  chk(key+' base64 PNG 있다', !!m, m ? (m[1].length/1024|0)+' KB' : '없음');
  if(m) urls[key] = m[1];
}

const geo = {};
for(const key of ['set','furl']){
  if(!urls[key]) continue;
  let info, st;
  try { info = pngInfo(urls[key]); st = alphaStats(info); }
  catch(e){ chk(key+' PNG 해독', false, e.message); continue; }
  geo[key] = info;
  chk(key+' PNG 크기가 헤더와 일치', info.w === W && info.h === H, info.w+'x'+info.h);
  chk(key+' 네 귀퉁이가 투명', st.corners.every(a => a === 0), '알파 '+st.corners.join(','));
  const pinkPct = 100*st.pink/st.total;
  chk(key+' 분홍 테두리가 거의 없다', pinkPct < 1.0, pinkPct.toFixed(2)+'%');
  const opPct = 100*st.opaque/st.total;
  chk(key+' 배가 실제로 그려져 있다', opPct > 5 && opPct < 60, opPct.toFixed(1)+'% 불투명');
}
if(geo.set && geo.furl){
  chk('두 그림 크기가 똑같다', geo.set.w===geo.furl.w && geo.set.h===geo.furl.h,
      geo.set.w+'x'+geo.set.h+' = '+geo.furl.w+'x'+geo.furl.h);
  // 돛 편 배가 접은 배보다 넓게 덮는다 (돛이 갑판을 가리므로)
  const os = alphaStats(geo.set).opaque, of = alphaStats(geo.furl).opaque;
  chk('돛 편 배가 더 넓게 덮는다', os > of, '편 '+os+' > 접은 '+of);
}

console.log('\n=== B. 코드 (world_chart.html) ===');
chk('ship_sprite.js 를 불러온다', /<script src="ship_sprite\.js">/.test(html));
chk('스프라이트 로더가 있다', /loadShipSprite/.test(html) && /shipSprite\s*=\s*\{[^}]*ready:false/.test(html));
chk('Image 없으면 로드를 건너뛴다(검증 안전)', /typeof Image==='undefined'/.test(html));
chk('두 장을 미리 얹는다', /shipSprite\.set\s*=/.test(html) && /shipSprite\.furl\s*=/.test(html));

// drawShip 안: 스프라이트 분기 + 도형 폴백
const ds = html.slice(html.indexOf('function drawShip'), html.indexOf('function drawShip')+2600);
chk('그림 준비됐을 때만 스프라이트를 쓴다', /if\(shipSprite\.ready\)/.test(ds));
chk('돛 단수로 편/접은 그림을 고른다', /ship\.sail>0\s*\?\s*shipSprite\.set\s*:\s*shipSprite\.furl/.test(ds));
chk('선체 길이 29*s 에 맞춰 그린다', /29\*s\)\s*\/\s*SHIP_SPRITE\.hullLen/.test(ds));
chk('그림을 중심 대칭으로 그린다', /drawImage\(sp,\s*-dw\/2,\s*-dh\/2/.test(ds));
chk('그림을 쓰면 도형 그리기를 건너뛴다(return)', /ctx\.restore\(\);\s*\n\s*return;/.test(ds));
chk('옛 도형 배가 폴백으로 남아 있다', /예전 도형 배/.test(ds) && /quadraticCurveTo/.test(ds));

// 배 크기 슬라이더는 그대로 살아 있어야 한다 (그림도 이걸 따른다)
chk('배 크기 슬라이더 그대로', /'shipScale',\s*'배 크기'/.test(html));

console.log('\n' + (fail ? 'FAIL' : '전부 통과') + ' — 통과 ' + pass + ' 실패 ' + fail);
process.exit(fail ? 1 : 0);
