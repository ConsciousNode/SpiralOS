const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('/tmp/k171/hummingbird.html','utf8');
const s=html.match(/<script id="spiral-disk-tray-script">([\s\S]*?)<\/script>/)[1];
const ctx={console,Uint8Array,Uint16Array,Uint32Array,DataView,ArrayBuffer,TextEncoder,TextDecoder,Math,Object,Array,String,Number,Date,JSON,setTimeout};ctx.globalThis=ctx;
vm.runInNewContext(s,ctx);
const img=new Uint8Array(fs.readFileSync(process.argv[2]));
const f=ctx.spiralDiskTray.extractFatFiles(img);
for(const k in f) console.log(k,f[k].length,JSON.stringify(Buffer.from(f[k]).toString('latin1').slice(0,30)));
