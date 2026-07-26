// verify_weather.js — 날씨 아이콘 판정(weatherNow)과 아이콘 조각(weatherIcon)이
// rate 경계·눈·폭우·흐림·밤낮에서 옳은 낱말과 그림을 내는가.
'use strict';
const RELOC_ROOT = require('path').join(__dirname, '..'); // 프로젝트 루트
const fs = require('fs'), vm = require('vm');
let pass = 0, fail = 0;
function chk(name, ok, note){ (ok?pass++:fail++); console.log('  '+(ok?'OK  ':'FAIL')+'   '+name+(note?'  '+note:'')); }

const src = fs.readFileSync(RELOC_ROOT+'/world_chart.html', 'utf8');

function grabFn(name){
  const head = src.indexOf('function ' + name + '(');
  if(head < 0) return '';
  let i = src.indexOf('{', head), depth = 0;
  for(let k=i;k<src.length;k++){ if(src[k]==='{')depth++; else if(src[k]==='}'){depth--; if(depth===0) return src.slice(head,k+1);} }
  return '';
}

console.log('=== 1. 배선 ===');
chk('weatherNow() 가 있다', /function weatherNow\(\)/.test(src));
chk('weatherIcon() 가 있다', /function weatherIcon\(kind\)/.test(src));
chk('경계 상수 4개가 있다',
  /WX_RAIN_LIGHT/.test(src) && /WX_RAIN_HEAVY/.test(src) && /WX_CLOUDY/.test(src) && /WX_NIGHT/.test(src));
chk('카드가 아이콘을 얹는다', /weatherIcon\(weatherNow\(\)\)/.test(src));
chk('아이콘이 오른쪽 끝에 고정된다(absolute)',
  /position:absolute;right:0/.test(src) && /weatherIcon\(weatherNow\(\)\)/.test(src));

// 상수 값을 뽑아 온다 (vm 에선 const 가 스코프에 안 남아 var 로 바꿔 주입)
const consts = ['WX_RAIN_LIGHT','WX_RAIN_HEAVY','WX_CLOUDY','WX_NIGHT']
  .map(n => (src.match(new RegExp('const '+n+'\\s*=\\s*[^;\\n]+;'))||[''])[0].replace('const ','var '))
  .join('\n');

// weatherNow 를 떼어내 가짜 세계에서 돌린다
const box = {
  RATE:0, TYPE:0, STORM:false, CLOUD:0, DARK:0, PRECIP_SNOW:2,
  ship:{x:0,y:0},
  precipAt(x,y,out){ out.rate=box.RATE; out.type=box.TYPE; return out; },
  inStorm(){ return box.STORM; },
  cloudOpacityAt(){ return box.CLOUD; },
  darknessNow(){ return box.DARK; }
};
vm.createContext(box);
vm.runInContext(consts + '\n' + grabFn('weatherNow'), box);
function W(rate,type,storm,cloud,dark){
  box.RATE=rate; box.TYPE=type; box.STORM=storm; box.CLOUD=cloud; box.DARK=dark;
  return vm.runInContext('weatherNow()', box);
}

console.log('\n=== 2. 판정 ===');
chk('맑은 낮 → clear',  W(0,0,false,0,0)   === 'clear');
chk('맑은 밤 → moon',   W(0,0,false,0,1)   === 'moon',  '어둠 1');
chk('옅은 구름 낮 → clear', W(0,0,false,0.3,0) === 'clear', '구름 0.3 < 0.55');
chk('두꺼운 구름 → cloud',  W(0,0,false,0.8,0) === 'cloud', '구름 0.8');
chk('두꺼운 구름 밤도 → cloud', W(0,0,false,0.8,1) === 'cloud', '흐림은 밤낮 무관');
chk('약한 비(0.2) → rainL', W(0.2,1,false,1,0) === 'rainL');
chk('보통 비(0.45) → rain', W(0.45,1,false,1,0) === 'rain');
chk('센 비(0.7) → storm',   W(0.7,1,false,1,0) === 'storm', 'rate>=0.6 은 폭우 그림');
chk('폭풍(inStorm) → storm', W(0,0,true,0,0)   === 'storm');
chk('눈은 세기와 무관하게 snow', W(0.2,2,false,1,1) === 'snow' && W(0.9,2,false,1,0) === 'snow');
chk('경계 정확히 0.3 → rain(약한비 아님)', W(0.3,1,false,1,0) === 'rain');
chk('경계 정확히 0.6 → storm', W(0.6,1,false,1,0) === 'storm');

console.log('\n=== 3. 아이콘 조각 ===');
vm.runInContext('const WX_ICON_CACHE={};\n' + grabFn('weatherIcon'), box);
function I(k){ return vm.runInContext('weatherIcon("'+k+'")', box); }
for(const k of ['clear','moon','cloud','rainL','rain','storm','snow']){
  const svg = I(k);
  chk(k+' 아이콘이 SVG 다', /^<svg /.test(svg) && /<\/svg>$/.test(svg));
}
chk('폭우에만 번개가 있다',
  /path d="M2\.5,5/.test(I('storm')) && !/path d="M2\.5,5/.test(I('rain')));
chk('맑음엔 해, 밤엔 달',
  /circle cx="0" cy="0" r="8\.5"/.test(I('clear')) && /a11,11 0 1,0/.test(I('moon')));
chk('약한 비는 빗줄기 2줄, 비는 3줄',
  (I('rainL').match(/<line /g)||[]).length === 2 &&
  (I('rain').match(/<line /g)||[]).length === 3);
chk('눈은 송이 3개', (I('snow').match(/<circle /g)||[]).length === 3);

console.log('\n' + (fail?'FAIL':'전부 통과') + ' — 통과 ' + pass + ' 실패 ' + fail);
process.exit(fail?1:0);
