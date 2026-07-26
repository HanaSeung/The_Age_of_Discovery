// _specsrc.js — 원본에서 제원·세계값·손잡이표를 뽑아 온다. 검증 스크립트 공용.
//
// 왜 있는가: 검증이 상수를 제 안에 베껴 두면 원본이 바뀌어도 아무도 모른다.
// verify_helm 이 SPEED=235 를 베껴 두었다가 시뮬레이션이 거짓말할 뻔했던 일(2026.07.27)이
// 그 예다. 뽑아 쓰면 뽑는 자리가 사라지는 순간 그 자체로 실패한다.
//
// 쓰는 곳: verify_sail · verify_sailable · verify_windsail
"use strict";
const fs = require('fs'), path = require('path');

function read(){
  return fs.readFileSync(path.join(__dirname, 'world_chart.html'), 'utf8');
}

// 배 제원 — SHIPS.player.spec 을 통째로 읽는다
function shipSpec(src){
  const m = src.match(/spec\s*:\s*\{([\s\S]*?)\},\s*\r?\n\s*state\s*:/);
  if(!m) throw new Error('SHIPS.player.spec 을 찾지 못했다 — 원본 구조가 바뀌었는가');
  const spec = {};
  for(const mm of m[1].matchAll(/(\w+)\s*:\s*(-?[\d.]+)/g)) spec[mm[1]] = +mm[2];
  return spec;
}

// 세계값 P 기본값
function worldP(src){
  const m = src.match(/const P = \{[\s\S]*?\n\};/);
  if(!m) throw new Error('const P 를 찾지 못했다');
  return new Function(m[0].replace('const P =', 'return ').replace(/;\s*$/, ''))();
}

// 손잡이 표 — SHIP_SPEC 과 WORLD_SPEC 이 갈라져 있어 둘을 합쳐 글자로 돌려준다.
// 옛 검증들이 'const SPEC = [' 를 찾다가 깨진 자리다 (표가 concat 으로 합쳐지며
// 대괄호가 사라졌다). 표가 또 갈려도 여기 한 곳만 고치면 된다.
function specTable(src){
  let out = '';
  for(const name of ['SHIP_SPEC', 'WORLD_SPEC']){
    const m = src.match(new RegExp('const ' + name + ' = \\[[\\s\\S]*?\\n  \\];'));
    if(!m) throw new Error(name + ' 을 찾지 못했다 — 손잡이 표 구조가 바뀌었는가');
    out += m[0] + '\n';
  }
  return out;
}

// 원본에서 함수를 오려 내어 실제로 돌린다. SHIP·P 를 둘 다 넘겨 준다 —
// polar() 가 SHIP.spec 을, windPower() 가 P 를 보기 때문이다.
// 어느 한쪽만 넘기면 '베껴 두기'로 되돌아가게 된다.
function lift(src, name, SHIP, P){
  const m = src.match(new RegExp('function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}'));
  if(!m) throw new Error(name + '() 를 찾지 못했다');
  return new Function('SHIP', 'P', m[0] + '; return ' + name + ';')(SHIP, P);
}

module.exports = { read, shipSpec, worldP, specTable, lift };
