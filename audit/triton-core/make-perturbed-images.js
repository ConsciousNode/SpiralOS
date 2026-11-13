const fs=require('fs');const C=require('/tmp/tcb/spiralos/core/core_triton.js');
for (const opt of ['shiftMod64','noWrap32']) {
  const core=C.buildTritonCore({[opt]:true});
  const img=new Uint8Array(fs.readFileSync('/tmp/tc13/spiralos-1.3.img'));
  img.fill(0,960*512,1024*512); img.set(core.diskRecordBytes,960*512);
  fs.writeFileSync(`/tmp/tc13/img-${opt}.img`,img);
  fs.writeFileSync(`/tmp/tc13/bootrom-${opt}.json`,JSON.stringify(core.bootRomTrytes));
}
