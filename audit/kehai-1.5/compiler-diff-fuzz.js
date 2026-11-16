// Differential compiler fuzz (Kehai, 2026-11-16): random SpiralC programs compiled by the
// 1.4 compiler (run on the 1.4 TC-32 core) vs the 1.5 compiler (run on the 1.5 TC-32 core,
// and a subset on the 1.5 x86 core). Any disagreement = a miscompile or core bug.
const path=require('path');
const OLD='/home/claude/spiralos', NEW='/tmp/sp15/w';
const N=+process.argv[2]||200, SEED=+process.argv[3]||1, X86=+process.argv[4]||10;
let s=SEED>>>0; const R=()=> (s=(s*1103515245+12345)>>>0)/4294967296; const ri=(a,b)=>a+Math.floor(R()*(b-a+1)); const pick=a=>a[ri(0,a.length-1)];
function expr(d,vars){ if(d<=0||R()<0.3) return R()<0.5?pick(vars):String(ri(-20,40));
  const op=pick(['+','-','*','+','-','<<','&','|','^','/','%']);
  if(op==='/'||op==='%') return `(${expr(d-1,vars)} ${op} ${ri(1,9)})`;
  if(op==='<<') return `(${expr(d-1,vars)} << ${ri(0,4)})`;
  return `(${expr(d-1,vars)} ${op} ${expr(d-1,vars)})`; }
function cmp(vars){ const k=pick([0,0,1,ri(-5,20)]); return `(${expr(1,vars)} ${pick(['==','!=','<','<=','>','>='])} ${k})`; }
function cond(d,vars){ if(d<=0||R()<0.4) return R()<0.15?`!${cmp(vars)}`:cmp(vars); return `(${cond(d-1,vars)} ${pick(['&&','||'])} ${cond(d-1,vars)})`; }
function stmts(d,vars,inLoop){ let o=''; const n=ri(1,3);
  for(let i=0;i<n;i++){ const r=R();
    if(r<0.3) o+=`x = ${expr(2,vars)};\n`;
    else if(r<0.5) o+=`if (${cond(2,vars)}) { ${stmts(d-1,vars,inLoop)} } ${R()<0.5?`else { ${stmts(d-1,vars,inLoop)} }`:''}\n`;
    else if(r<0.6&&d>0) o+=`for (int k${d} = 0; k${d} < ${ri(1,5)}; k${d}++) { x = x + k${d}; ${R()<0.3?`if (${cond(1,[...vars,'k'+d])}) continue;`:''} ${R()<0.3?`if (${cond(1,[...vars,'k'+d])}) break;`:''} ${stmts(d-1,[...vars,'k'+d],true)} }\n`;
    else if(r<0.72) o+=`if (${cond(1,vars)}) return ${expr(2,vars)};\n`;
    else if(r<0.8&&d>0) o+=`while (${cond(1,vars)} && g < 50) { g = g + 1; x = x - 1; }\n`;
    else o+=`x = x + ${expr(1,vars)};\n`; }
  return o; }
function prog(){ const fns=[]; for(let f=0;f<3;f++){ fns.push(`int f${f}(int a, int b) {\n int x = ${expr(1,['a','b'])};\n${stmts(2,['a','b','x'],false)} return x;\n}`); }
  return `int g;\n${fns.join('\n')}\nint main() {\n int t = 0;\n for (int i = -3; i <= 3; i++) { for (int j = 0; j < 4; j++) { g = 0; t = t ^ (f0(i,j) + 3*f1(j,i) - f2(i+j,i-j)); } }\n return t;\n}`; }
function load(root){ const h=require(path.join(root,'tests/harness.js')); h.loadEmulators();
  return { cc:require(path.join(root,'compiler/spiralc.js')), tc:require(path.join(root,'core/core_tc32.js')).buildTC32Core(), x86:require(path.join(root,'core/core_x86.js')).buildX86Core() }; }
function runTC(core,img){ const fs=new globalThis.TabCompFS(), cpu=new globalThis.TabCompCPU(fs); globalThis.initHardwareMemory(cpu); cpu.loadBinary(core.bytes,'');
  cpu.ram.set(img,0x200000); let g=0; while(!cpu.halted&&g<4000){cpu.yielded=false;cpu.stepBatch(50000);g++;} return cpu.halted? cpu.ramDV.getInt32(0x200000+0x0FFD28,true):'TIMEOUT'; }
function runX86(core,img){ const fl=new Uint8Array(1474560); fl.set(core.bytes,0); fl.set(img.subarray(0,0x20000),0x8000);
  const pc=new globalThis.HummingbirdPC({ramSizeMB:16}); pc.insertFloppy?pc.insertFloppy(fl):pc.loadFloppy(fl);
  return pc; }
const oldT=load(OLD); const oldCC=oldT.cc, oldTC=oldT.tc;
for(const k of Object.keys(require.cache)) delete require.cache[k];
const newT=load(NEW);
let agree=0, dis=[], cerr=0, vals=new Set(), diffImg=0;
for(let n=0;n<N;n++){ const src=prog(); let a,b;
  try{ a=runTC(oldTC,oldCC.compileSpiralSource(src).image); b=runTC(newT.tc,newT.cc.compileSpiralSource(src).image);}catch(e){cerr++; if(cerr<3) console.log('compile/run error',e.message); continue;}
  if(a===b){ agree++; vals.add(a); if(oldCC.compileSpiralSource(src).image.length===0) {} diffImg += (Buffer.compare(Buffer.from(oldCC.compileSpiralSource(src).image),Buffer.from(newT.cc.compileSpiralSource(src).image))!==0)?1:0; } else { dis.push({n,a,b}); require('fs').writeFileSync(`dis_${n}.sp`,src); } }
console.log(JSON.stringify({distinctResults:vals.size, timeouts:[...vals].filter(v=>v==="TIMEOUT").length, imagesDiffer:diffImg, oldTCbytes:oldTC.bytes.length, newTCbytes:newT.tc.bytes.length, programs:N,agree,disagree:dis.length,errors:cerr,dis:dis.slice(0,5)}));
