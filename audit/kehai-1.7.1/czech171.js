// Kehai's independent Z-machine probe: run CZECH (Karger/Robertson, public-domain-derived) inside SpiralOS 1.7.
const fs=require('fs'), path=require('path');
const T='/tmp/k171/tests/';
const {loadEmulators}=require(T+'harness.js'); loadEmulators();
const {formatFatVolume,FatOracleVolume}=require(T+'fat-oracle.js');
const {StoryMachine}=require(T+'zmachine-oracle.js');
const story=new Uint8Array(fs.readFileSync(process.argv[2]));
const name=path.basename(process.argv[2]);
const img=new Uint8Array(fs.readFileSync('/tmp/k171/spiralos.img'));
// Neon's oracle on the same story
try{ const zm=new StoryMachine(story,42); zm.runUntilPrompt(); const t=zm.outputTranscript||''; console.log('ORACLE tail:', JSON.stringify(String(t).slice(-260))); }catch(e){ console.log('ORACLE threw', e.message); }
const disk=formatFatVolume('FAT16',8192); new FatOracleVolume(disk).writeFile('/'+name, story);
const vmBase=0x00200000;
const fsx=new globalThis.TabCompFS(); const cpu=new globalThis.TabCompCPU(fsx);
globalThis.initHardwareMemory(cpu); globalThis.bootSpiralDiskImage(cpu,img); cpu.loadDisk2Image(disk);
const step=n=>{const tgt=cpu.presentCount+n;let g=0;while(cpu.presentCount<tgt&&!cpu.halted&&g<n*400){cpu.yielded=false;cpu.stepBatch(200000);g++;}};
step(2); const cmd=`z /shelf/${name}\r`; for(const ch of cmd){const c=ch.charCodeAt(0);cpu.pushKeyEvent(1,c,c,0);cpu.pushKeyEvent(0,c,c,0);} 
const ram=cpu.ram; const find=s=>{const b=Buffer.from(ram.buffer,ram.byteOffset,ram.length);return b.indexOf(s);};
for(let f=0;f<int(process.argv[3]||'600');f+=20){ step(20); if(find('Last test')>=0||find('Failed:')>=0) break; }
function int(x){return parseInt(x,10);}
const b=Buffer.from(ram.buffer,ram.byteOffset,ram.length);
for(const key of ['Performed','Failed:','ERROR','rror','Last test']){ let i=b.indexOf(key); if(i>=0){ console.log('['+key+'] @',i.toString(16), JSON.stringify(b.slice(Math.max(0,i-200),i+120).toString('latin1').replace(/[^\x20-\x7e\n]/g,'.'))); } }
// dump full transcript: find banner start before 'Performed'
const end=b.indexOf('Last test: quit!'); let st=b.lastIndexOf('CZECH',end); if(st<0) st=end-30000;
const os=b.slice(st,end+20).toString('latin1');
fs.writeFileSync('/tmp/k17probe/'+name+'.spiralos.txt', os);
try{ const zm=new StoryMachine(story,42); zm.runUntilPrompt(); const t=String(zm.outputTranscript); fs.writeFileSync('/tmp/k17probe/'+name+'.oracle.txt', t.slice(t.indexOf('CZECH'))); }catch(e){}
