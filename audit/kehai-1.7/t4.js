const fs=require('fs');const T='/tmp/k17run/tests/';
const src=fs.readFileSync(T+'spiralos-17.js','utf8');const cut=src.indexOf('function readShellLines');
const body=src.slice(0,src.indexOf('\n}\n',cut)+3).replace(/require\("\.\//g,'require("'+T).replace(/require\("\.\.\//g,'require("/tmp/k17run/');
const m={exports:{}};new Function('require','module','__dirname',body+'\nmodule.exports={createRunner,readShellLines,formatFatVolume,FatOracleVolume,buildFeatureTestStory,StoryMachine};')(require,m,T.slice(0,-1));
const {createRunner,readShellLines,formatFatVolume,FatOracleVolume,buildFeatureTestStory,StoryMachine}=m.exports;
const img=new Uint8Array(fs.readFileSync('/tmp/k17run/spiralos.img'));
const st=buildFeatureTestStory(4); const d=formatFatVolume('FAT16',8192); new FatOracleVolume(d).writeFile('/test_v4.z4',st.bytes);
console.log('story bytes',st.bytes.length);
const r=createRunner('tabcomp',img,{disk2:new Uint8Array(d)}); r.stepFrames(2);
r.typeFast('ls /shelf\r'); r.typeFast('z /shelf/test_v4.z4\r');
for(const n of [4,20,60]){ r.stepFrames(n); console.log("after",n,"hash",r.readVmI32(0x0FFD58),"prompts",r.readVmI32(0x0FFD5C)); }
console.log(readShellLines(r).slice(-6).join('\n'));
const b=Buffer.from(r.raw.ram.buffer); for(const k of ['File not found','Bad story','Unsupported','rror']){const i=b.lastIndexOf(k); if(i>0) console.log(k,'@',i.toString(16),JSON.stringify(b.slice(i-80,i+40).toString('latin1').replace(/[^\x20-\x7e]/g,'.')));}
const zm=new StoryMachine(st.bytes,42); zm.runUntilPrompt(); const tr=String(zm.outputTranscript); console.log('ORACLE says:',JSON.stringify(tr.slice(0,160)));
const probe=tr.replace(/\s+/g,' ').trim().slice(0,12); console.log('probe',JSON.stringify(probe),'found in guest RAM at', b.indexOf(probe));
