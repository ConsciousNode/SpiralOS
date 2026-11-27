const {FatOracleVolume}=require('/tmp/in17/spiralos-1.7/tests/fat-oracle.js');const fs=require('fs');
const raw=fs.readFileSync(process.argv[2]); console.log('raw text at', raw.indexOf('written in the browser'));
const v=new FatOracleVolume(new Uint8Array(raw)); console.log('FAT copies match:', v.verifyFatCopiesMatch());
const f=v.dumpAllFiles();for(const k in f)console.log(k,f[k].length,JSON.stringify(Buffer.from(f[k]).toString('latin1').slice(0,40)));
