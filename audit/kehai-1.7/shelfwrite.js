const fs=require('fs');const T='/tmp/in17/spiralos-1.7/tests/';
// reuse the suite's own createRunner by loading spiralos-17.js internals is not exported; extract it textually
const src=fs.readFileSync(T+'spiralos-17.js','utf8');
const cut=src.indexOf('function readShellLines');
const body=src.slice(0, src.indexOf('\n}\n', cut)+3).replace('loadEmulators();','loadEmulators();').replace(/require\("\.\//g,'require("'+T).replace(/require\("\.\.\//g,'require("/tmp/in17/spiralos-1.7/');
const m={exports:{}}; const fn=new Function('require','module','__dirname',body+'\nmodule.exports={createRunner,readShellLines,formatFatVolume,FatOracleVolume};');
fn(require,m,T.slice(0,-1)); const {createRunner,readShellLines,formatFatVolume,FatOracleVolume}=m.exports;
const img=new Uint8Array(fs.readFileSync('/tmp/in17/spiralos-1.7/spiralos.img'));
for(const kind of process.argv.slice(2)){
  const r=createRunner(kind,img,{disk2:formatFatVolume('FAT16',8192)}); r.stepFrames(2);
  r.typeFast('write /shelf/back.txt written by kehai\r'); r.stepFrames(10);
  r.typeFast('write /home/back.txt written by kehai\r'); r.stepFrames(6);
  r.typeFast('cat /shelf/back.txt\r'); r.stepFrames(4);
  const v=new FatOracleVolume(new Uint8Array(r.getDisk2())); const b=v.readFile('/back.txt');
  console.log(kind,'FAT back.txt =',b?JSON.stringify(Buffer.from(b).toString()):b,'| shell:',readShellLines(r).slice(-4).join(' / '));
}
