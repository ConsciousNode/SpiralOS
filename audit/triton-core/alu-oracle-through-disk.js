'use strict';
// Kehai's independent ALU oracle for the SpiralOS Triton Core.
// Programs go in on the disk image (sectors 64..319); results come back via SYSCALL 10 (DISK_SYNC)
// into disk sectors 1100+. No reads or writes of guest RAM.
const fs = require('fs');
const { loadHtmlModule } = require('/tmp/tcb/triton/tests/t3-common.js');
const { T } = loadHtmlModule('triton3.html');
const base = new Uint8Array(fs.readFileSync('/tmp/tc13/spiralos-1.3.img'));
const bootRom = JSON.parse(fs.readFileSync('/tmp/tc13/bootrom.json'));
const engine = process.argv[2] || 'wasm';
const W = (op, a, imm) => [imm & 255, (imm >>> 8) & 255, a & 255, op];
const push32 = v => [...W(0x03, 0, v & 0xFFFF), ...W(0x04, 0, (v >>> 16) & 0xFFFF)];
const OPS = [['ADD',0x15],['SUB',0x16],['MUL',0x17],['DIV',0x18],['MOD',0x19],['AND',0x1A],['OR',0x1B],['XOR',0x1C],
  ['SHL',0x1D],['SHR',0x1E],['SAR',0x1F], ...['EQ','NE','LT','LE','GT','GE','ULT','UGT'].map((n,i)=>[n,0x20,i])];
function ref(name, a, b) { a|=0; b|=0;
  switch (name) {
    case 'ADD': return (a+b)|0; case 'SUB': return (a-b)|0; case 'MUL': return Math.imul(a,b);
    case 'DIV': return b===0?0:Math.trunc(a/b)|0; case 'MOD': return b===0?0:(a%b)|0;
    case 'AND': return a&b; case 'OR': return a|b; case 'XOR': return a^b;
    case 'SHL': return a<<(b&31); case 'SHR': return (a>>>(b&31))|0; case 'SAR': return a>>(b&31);
    case 'EQ': return +(a===b); case 'NE': return +(a!==b); case 'LT': return +(a<b); case 'LE': return +(a<=b);
    case 'GT': return +(a>b); case 'GE': return +(a>=b); case 'ULT': return +((a>>>0)<(b>>>0)); case 'UGT': return +((a>>>0)>(b>>>0));
  } }
let s = 0x13579BDF; const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s | 0; };
const edges = [0,1,-1,2,-2,3,7,8,31,32,33,63,255,256,0x7FFF,0x8000,0xFFFF,0x10000,0x7FFFFFFF,-0x80000000,-0x7FFFFFFF,0x12345678,-0x12345678,1000000007];
const vecs = [];
for (const [n,op,cc] of OPS) { for (const a of edges) for (const b of edges) vecs.push([n,op,cc,a,b]);
  for (let i=0;i<1500;i++) { const a=rnd(), b=(i%5===0)? (rnd()&63) : rnd(); vecs.push([n,op,cc,a,b]); } }
const BATCH = 4000, RES_SEC = 1100, RES_VM = 0x200000 + RES_SEC*512;
let total=0, bad=0, batches=0; const fails=[];
for (let off=0; off<vecs.length; off+=BATCH) {
  const vb = vecs.slice(off, off+BATCH);
  const code = [];
  vb.forEach(([n,op,cc,a,b],i) => { code.push(...push32(RES_VM+i*4), ...push32(a), ...push32(b), ...W(op,0,op===0x20?cc:0), ...W(0x14,0,0)); });
  const nsec = Math.ceil(vb.length*4/512);
  code.push(...W(0x03,0,RES_SEC), ...W(0x03,0,nsec), ...W(0x27,2,10), ...W(0x06,0,0), ...W(0x03,0,7), ...W(0x01,0,0));
  const spir = new Uint8Array(131072); spir.set([83,80,73,82]); spir.set([0x20,0,0,0],8); spir.set(code,0x20);
  if (0x20+code.length > 131072) throw new Error('batch too big');
  const img = base.slice(); img.set(spir, 64*512); img.fill(0, RES_SEC*512, RES_SEC*512+nsec*512);
  const vm = engine==='js' ? new T.TritonVM({archMode:'T3', ramSize:14348907}) : T.TritonWASM.createSync({archMode:'T3', ramSize:14348907});
  vm.reset(false);
  for (let i=0;i<img.length;i++) (vm.setDisk ? vm.setDisk(i,img[i]) : (vm.disk[i]=img[i]));
  vm.loadProgram(bootRom, 0);
  let steps=0; while(!vm.halted && steps<60e6){ vm.run(2e6); steps+=2e6; }
  if (!vm.halted) throw new Error('did not halt, batch '+batches);
  const rd = i => (vm.getDisk ? vm.getDisk(i) : vm.disk[i]) & 255;
  vb.forEach(([n,op,cc,a,b],i) => { const p=RES_SEC*512+i*4;
    const got=(rd(p)|(rd(p+1)<<8)|(rd(p+2)<<16)|(rd(p+3)<<24))|0, want=ref(n,a,b); total++;
    if (got!==want) { bad++; if (fails.length<15) fails.push({n,a,b,got,want}); } });
  batches++;
}
console.log(JSON.stringify({engine, batches, total, mismatches:bad, perOp:OPS.length, fails}));
