// _runall.js — 모든 verify_*.js 를 돌려 통과/실패만 모은다
"use strict";
const fs=require('fs'), path=require('path'), cp=require('child_process');
const DIR=__dirname;
const files=fs.readdirSync(DIR).filter(f=>/^verify_.*\.js$/.test(f)).sort();
let bad=[];
for(const f of files){
  const r=cp.spawnSync(process.execPath,[f],{cwd:DIR,encoding:'utf8'});
  const out=(r.stdout||'')+(r.stderr||'');
  const m=out.match(/통과\s+(\d+)\s*\/\s*실패\s+(\d+)/);
  const tag = r.status===0 ? 'OK  ' : 'FAIL';
  if(r.status!==0) bad.push(f);
  console.log(`${tag} ${f.padEnd(26)} ${m?('통과 '+m[1]+' / 실패 '+m[2]):'(요약 없음, exit '+r.status+')'}`);
}
console.log('\n실패한 파일: ' + (bad.length?bad.join(', '):'없음'));
