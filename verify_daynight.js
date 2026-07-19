// 낮과 밤 — 태양 고도 계산과 화면 적용 검증
// node verify_daynight.js
const fs = require('fs');
const src = fs.readFileSync('world_chart.html', 'utf8');
let pass = 0, fail = 0;
function chk(name, ok, note){
  if(ok) pass++; else fail++;
  console.log((ok ? '  OK  ' : '  X   ') + name + (note ? '   ' + note : ''));
}

// ===== 1. 배선 — 코드가 제자리에 들어갔는가 =====
console.log('\n=== 1. 배선 ===');
chk('P 에 nightMode 가 있다', /^\s*nightMode\s*:/m.test(src));
chk('P 에 nightGain 이 있다', /^\s*nightGain\s*:/m.test(src));
chk('sunDecl() 이 있다',  /function sunDecl\(\)/.test(src));
chk('sunAlt() 이 있다',   /function sunAlt\(wx, wy\)/.test(src));
chk('darkness() 가 있다', /function darkness\(alt\)/.test(src));
chk('nightVeil() 이 있다', /function nightVeil\(\)/.test(src));
// 배 다음, 나침반 앞 — 지도는 어두워지고 계기는 밝게 남는다.
// 구름과 별이 들어오면서 사이에 층이 늘었으므로, 붙어 있는지가 아니라
// 순서가 맞는지를 본다. 구름은 밤보다 앞(흐린 밤이 가장 캄캄해야 하니까),
// 별은 밤보다 뒤(밤과 함께 어두워지면 안 되니까)다.
const _lines = src.split(/\r?\n/);
// 호출 뒤에 주석이 붙어 있을 수 있으므로 줄의 시작만 본다. 없으면 -1
const _ord = n => _lines.findIndex(l => l.trim().startsWith(n));
const _iShip = _ord('drawShip();'), _iNight = _ord('nightVeil();'),
      _iComp = _ord('compass();');
chk('배와 나침반 사이에서 그린다',
    _iShip >= 0 && _iNight > _iShip && _iComp > _iNight,
    'ship ' + _iShip + ' < night ' + _iNight + ' < compass ' + _iComp);
const _iCloud = _ord('cloudVeil();'), _iStar = _ord('starVeil();');
chk('구름이 밤보다 먼저다 (흐린 밤이 더 캄캄하다)',
    _iCloud < 0 || _iCloud < _iNight);
chk('별이 밤보다 나중이다 (밤과 함께 어두워지면 안 된다)',
    _iStar < 0 || _iStar > _iNight);
chk('패널에 밤 표현 칸이 있다', /'nightMode',\s*'밤 표현'/.test(src));
chk('패널에 밤 세기 칸이 있다', /'nightGain',\s*'밤 세기'/.test(src));
chk('세 가지 방식이 다 있다',
    /mode === 2/.test(src) && /mode === 3/.test(src) && /mode === 0/.test(src));
chk('P 에 nightLamp 가 있다', /^\s*nightLamp\s*:/m.test(src));
chk('패널에 등불 거리 칸이 있다', /'nightLamp',\s*'등불 거리'/.test(src));
chk('등불이 거리 기준이다 (배율을 곱한다)',
    /P\.nightLamp \/ KM_PER_PX\) \* zoom/.test(src));
chk('안쪽 원은 바깥 원의 비율로 따라온다', /r1\s*\*\s*LAMP_CORE/.test(src));
chk('등불 거리 최소가 0 이다', /'nightLamp',\s*'등불 거리',\s*0,/.test(src));
chk('등불 0 이면 통째로 덮는다', /if\(r1 < 1\)\{/.test(src));

// ===== 1-4. 값 칸 직접 입력 =====
console.log('\n=== 1-4. 값 칸 직접 입력 ===');
chk('값 칸이 입력칸이다', /<input type="text" class="val"/.test(src));
chk('span 이던 값 칸이 남아 있지 않다', !/<span class="val"/.test(src));
chk('Enter 로 확정한다', /e\.key === 'Enter'/.test(src));
chk('Escape 로 되돌린다', /e\.key === 'Escape'/.test(src));
chk('입력 도중이 아니라 change 에서 반영한다',
    /box\.addEventListener\('change'/.test(src));
chk('숫자가 아니면 되돌린다', /if\(!isFinite\(v\)\)\{ pull\(\); return; \}/.test(src));
chk('아래로만 막고 위로는 열어 둔다', /pset\(key, Math\.max\(sp\[2\], v\)\)/.test(src));
chk('타이핑 중인 칸은 덮어쓰지 않는다',
    /document\.activeElement !== vals\[id\]/.test(src));
chk('조타 키가 입력칸에서 차단된다',
    /t==='INPUT'\|\|t==='SELECT'\|\|t==='TEXTAREA'/.test(src));

// ===== 1-2. 등불 크기 — km 가 화면에서 몇 px 이 되는가 =====
const KM_PER_PX = 40075/8192;                       // 월드 1px = 4.892 km
const lamp = Number((src.match(/nightLamp\s*:\s*(\d+)/) || [])[1]);
const SH = 1080;                                    // 흔한 화면 높이로 가정
const lampPx = z => (lamp / KM_PER_PX) * z;
console.log('\n=== 1-2. 등불 거리 ' + lamp.toLocaleString() + ' km 가 화면에서 ===');
for(const z of [0.42, 1, 4, 13, 40]){
  const px = lampPx(z);
  console.log('  배율 ' + String(z).padStart(5) + '×   반지름 ' +
              px.toFixed(0).padStart(6) + ' px' +
              (px > SH ? '   ← 화면 밖, 밤이 거의 안 보임'
               : px < 20 ? '   ← 점만 남고 온통 캄캄' : ''));
}

// ===== 1-3. 배율별로 화면 절반(540px)을 채우려면 등불 거리를 얼마로 =====
console.log('\n=== 1-3. 배율별 알맞은 등불 거리 (화면 절반 기준) ===');
for(const z of [0.075, 0.42, 1, 4, 13, 40]){
  const km = (SH/2) / z * KM_PER_PX;
  console.log('  배율 ' + String(z).padStart(6) + '×   등불 ' +
              Math.round(km/25)*25 + ' km 안팎');
}

// ===== 2. 천문 — 같은 식을 따로 세워 값을 확인한다 =====
const AXIAL = 23.44 * Math.PI/180;
const decl = doy => AXIAL * Math.sin(2*Math.PI*(doy - 80.5)/365);
// 그날 그 위도의 낮 길이(시간). cos(H0) = -tan(lat)tan(decl)
function dayLen(latDeg, doy){
  const lat = latDeg*Math.PI/180, d = decl(doy);
  const c = -Math.tan(lat)*Math.tan(d);
  if(c <= -1) return 24;               // 백야
  if(c >=  1) return 0;                // 극야
  return 2*Math.acos(c)/(2*Math.PI)*24;
}
const VERNAL = 80.5, SUMMER = 80.5+91.3, WINTER = 80.5+273.8;

console.log('\n=== 2. 적위 ===');
chk('춘분에 적위 ≈ 0',    Math.abs(decl(VERNAL)*180/Math.PI) < 0.1,
    decl(VERNAL).toFixed(4) + ' rad');
chk('하지에 적위 ≈ +23.4', Math.abs(decl(SUMMER)*180/Math.PI - 23.44) < 0.3,
    (decl(SUMMER)*180/Math.PI).toFixed(2) + '°');
chk('동지에 적위 ≈ -23.4', Math.abs(decl(WINTER)*180/Math.PI + 23.44) < 0.3,
    (decl(WINTER)*180/Math.PI).toFixed(2) + '°');

console.log('\n=== 3. 낮 길이 ===');
const hm = h => Math.floor(h) + '시간 ' + Math.round((h%1)*60) + '분';
chk('적도는 춘분에 12시간', Math.abs(dayLen(0, VERNAL) - 12) < 0.05, hm(dayLen(0,VERNAL)));
chk('적도는 하지에도 12시간', Math.abs(dayLen(0, SUMMER) - 12) < 0.05, hm(dayLen(0,SUMMER)));
chk('리스본 하지 ≈ 14시간 45분', Math.abs(dayLen(38.7, SUMMER) - 14.75) < 0.3, hm(dayLen(38.7,SUMMER)));
chk('리스본 동지 ≈ 9시간 15분',  Math.abs(dayLen(38.7, WINTER) -  9.25) < 0.3, hm(dayLen(38.7,WINTER)));
chk('리스본 여름밤 + 겨울밤 = 24시간',
    Math.abs(dayLen(38.7,SUMMER) + dayLen(38.7,WINTER) - 24) < 0.05);
chk('북위 60° 하지 ≈ 18시간 30분', Math.abs(dayLen(60, SUMMER) - 18.5) < 0.4, hm(dayLen(60,SUMMER)));
chk('북극권(67°N) 하지는 백야', dayLen(67, SUMMER) === 24);
chk('북극권(67°N) 동지는 극야', dayLen(67, WINTER) === 0);
chk('남반구는 계절이 뒤집힌다', dayLen(-38.7, SUMMER) < 10 && dayLen(-38.7, WINTER) > 14,
    hm(dayLen(-38.7,SUMMER)) + ' / ' + hm(dayLen(-38.7,WINTER)));

console.log('\n=== 4. 위도별 낮 길이 (하지 / 동지) ===');
for(const lat of [0, 15, 30, 38.7, 45, 60, 70, 84]){
  console.log('  ' + (lat+'°N').padStart(6) +
              '   하지 ' + hm(dayLen(lat,SUMMER)).padStart(10) +
              '   동지 ' + hm(dayLen(lat,WINTER)).padStart(10));
}

// ===== 5. 실시간 체감 =====
const hps = (src.match(/hoursPerSec\s*:\s*([\d.]+)/) || [])[1];
console.log('\n=== 5. 지금 시계 설정 ===');
console.log('  시계 ' + hps + '시간/초 → 하루 ' + (24/hps).toFixed(1) + '초');
console.log('  리스본 한여름  낮 ' + (dayLen(38.7,SUMMER)/hps).toFixed(1) +
            '초 / 밤 ' + ((24-dayLen(38.7,SUMMER))/hps).toFixed(1) + '초');
console.log('  리스본 한겨울  낮 ' + (dayLen(38.7,WINTER)/hps).toFixed(1) +
            '초 / 밤 ' + ((24-dayLen(38.7,WINTER))/hps).toFixed(1) + '초');
console.log('  여름에서 겨울까지 ' + (182.5*24/hps/60).toFixed(1) + '분');

console.log('\n' + (fail === 0 ? '전부 통과' : '실패 있음') + ' — 통과 ' + pass + ', 실패 ' + fail + '\n');
