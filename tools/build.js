#!/usr/bin/env node
/**
 * SpiralOS 1.4 "Daily Driver" — Unified Image Builder & Packager (tools/build.js)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Produces the unified 1.44 MB bootable SpiralOS disk image (spiralos.img,
 * 1,474,560 bytes = 2,880 sectors of 512 bytes) that boots unchanged on ALL THREE:
 *   1. Hummingbird & Real PCs (i586 x86 Core, Sectors 0..31)
 *   2. TabComp (TC-32 Core, Sectors 32..63)
 *   3. Triton (Balanced-Ternary T3 Core, Sectors 960..1023)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { buildTC32Core } = require("../core/core_tc32.js");
const { buildX86Core } = require("../core/core_x86.js");
const { buildTritonCore, TRITON_IMG_DISK_OFF } = require("../core/core_triton.js");
const {
  SpiralFS,
  SPFS_IMG_OFFSET,
  SPFS_SIZE,
  SPFS_HOLE_START,
  SPFS_USABLE_SIZE
} = require("../compiler/spiralfs.js");
const { compileSpiralSource, expandImports } = require("../compiler/spiralc.js");
const { rasterizeCnswMark } = require("./rasterize-splash.js");

const MIN_REQUIRED_FREE_BYTES = 128 * 1024; // 131,072 bytes (128 KB)

function readCanonicalVersion(rootDir) {
  const ksp = fs.readFileSync(path.join(rootDir, "os/kernel.sp"), "utf8");
  const m = ksp.match(/int\s+os_version_str\s*\(\s*\)\s*\{\s*return\s+"((?:\\.|[^"\\])*)"/);
  return m ? m[1].replace(/\\"/g, '"') : 'SpiralOS 1.4 "Daily Driver"';
}

function createProceduralPic(style = 0) {
  const pic = new Uint8Array(96 * 56);
  for (let y = 0; y < 56; y++) {
    for (let x = 0; x < 96; x++) {
      if (style === 0) {
        const dx = x - 48;
        const dy = y - 28;
        const d = Math.floor(Math.sqrt(dx * dx + dy * dy));
        pic[y * 96 + x] = 64 + ((d + (x ^ y)) & 15);
      } else {
        pic[y * 96 + x] = 80 + (((x >> 2) + (y >> 2)) & 15);
      }
    }
  }
  return pic;
}

function buildSpiralOSImage(rootDir = path.resolve(__dirname, "..")) {
  const versionStr = readCanonicalVersion(rootDir);

  // 1. Build all three Native Cores (TC-32, x86, and Triton T3)
  const tc32Core = buildTC32Core();
  const x86Core = buildX86Core();
  const tritonCore = buildTritonCore();

  // 2. Populate SpiralFS (768 KB usable volume across Sectors 320..1919, skipping 960..1023)
  const spfs = new SpiralFS();

  const sourceFiles = [
    ["os/os.sp",     "/src/os.sp"],
    ["os/kernel.sp", "/src/kernel.sp"],
    ["os/fs.sp",     "/src/fs.sp"],
    ["os/gui.sp",    "/src/gui.sp"],
    ["os/wm.sp",     "/src/wm.sp"],
    ["os/net.sp",    "/src/net.sp"],
    ["os/cc.sp",     "/src/cc.sp"],
    ["os/asm.sp",    "/src/asm.sp"],
    ["os/apps1.sp",  "/src/apps1.sp"],
    ["os/apps2.sp",  "/src/apps2.sp"]
  ];

  for (const [diskRel, vfsPath] of sourceFiles) {
    const content = fs.readFileSync(path.join(rootDir, diskRel), "utf8");
    const cap = Math.max(8192, (content.length + 3072) & ~511);
    spfs.writeFile(vfsPath, content, cap);
  }

  spfs.writeFile(
    "/src/hello.sp",
    "// Sample SpiralC Standalone Program\nconst BASE = 35;\nint add7(int x) { return x + 7; }\nint main() { return add7(BASE); }\n",
    2048
  );
  spfs.writeFile(
    "/src/core_tc32.asm",
    tc32Core.asmSource,
    (tc32Core.asmSource.length + 2048) & ~511
  );
  spfs.writeFile(
    "/src/core_x86.asm",
    x86Core.asmSource,
    (x86Core.asmSource.length + 2048) & ~511
  );

  // Add the 4 plain-text Theme files
  const themeFiles = [
    ["themes/spiral.thm", "/themes/spiral.thm"],
    ["themes/amber.thm",  "/themes/amber.thm"],
    ["themes/oberon.thm", "/themes/oberon.thm"],
    ["themes/jade.thm",   "/themes/jade.thm"]
  ];
  for (const [diskRel, vfsPath] of themeFiles) {
    const content = fs.readFileSync(path.join(rootDir, diskRel), "utf8");
    spfs.writeFile(vfsPath, content, 2048);
  }

  // Add Hypertext Web Pages for SpiralHttpd & SpiralWeb
  spfs.writeFile(
    "/www/index.hts",
    "<h1>SpiralWeb Node Portal</h1>\n" +
    "<p>Served live over StudioNet SRRP (Port 80) by SpiralHttpd.</p>\n" +
    "<img src='/art/spiral.pic'>\n" +
    "<a href='/sonder.hts'>Visit Sonder Capsule</a>\n",
    2048
  );
  spfs.writeFile(
    "/www/sonder.hts",
    "<h1>Sonder Procedural Capsule</h1>\n" +
    "<p>Timeline 1991-B: ConsciousNode SoftWorks Aether Network.</p>\n" +
    "<a href='/index.hts'>Return to Node Index</a>\n",
    2048
  );

  // Add sample .pic bitmap art files + build-time rasterized CNSW splash logo (/art/cnsw.pic)
  spfs.writeFile("/art/spiral.pic", createProceduralPic(0), 6144);
  spfs.writeFile("/art/prism.pic", createProceduralPic(1), 6144);
  const svgMarkPath = path.resolve(rootDir, "../cnsw-mark.svg");
  const splashBmp = fs.existsSync(svgMarkPath)
    ? rasterizeCnswMark(svgMarkPath, 80, 80)
    : new Uint8Array(6400);
  spfs.writeFile("/art/cnsw.pic", splashBmp, 8192);

  // Add on-disk documentation using the single canonical version string
  spfs.writeFile(
    "/docs/README.txt",
    versionStr + " - ConsciousNode SoftWorks (MIT)\n" +
    "Unified VM Bytecode OS for TabComp, Hummingbird, and Triton.\n" +
    "Includes StudioNet 1.0 (SNS/SDP/SRRP), Notes, Clock, Solitaire,\n" +
    "self-hosting SpiralC compiler (/src/cc.sp) & assemblers (/src/asm.sp).\n",
    2048
  );

  const freeBytes = spfs.freeBytes();
  const usedBytes = spfs.usedBytes();
  if (freeBytes < MIN_REQUIRED_FREE_BYTES) {
    throw new Error(`SpiralFS free space check failed: ${freeBytes} bytes free < required ${MIN_REQUIRED_FREE_BYTES} bytes (128 KB)`);
  }

  // Embed Triton Core into the reserved 32 KB hole (0x50000..0x57FFF = Sectors 960..1023) inside spfs.buf
  spfs.buf.set(tritonCore.diskRecordBytes, SPFS_HOLE_START);

  // 3. Compile /src/os.sp
  const osEntryBytes = spfs.readFile("/src/os.sp");
  const compiled = compileSpiralSource(osEntryBytes, (p) => spfs.readFile(p));
  const expandedSource = expandImports("/src/os.sp", (p) => spfs.readText(p));

  // 4. Assemble unified 1.44 MB floppy/disk image (1,474,560 bytes = 2,880 sectors)
  const img = new Uint8Array(1474560);
  const imgDV = new DataView(img.buffer);

  // Sectors 0..31 (0x00000..0x03FFF, 16 KB): Hummingbird x86 Bootloader + Stage 2 + Protected Mode Core
  img.set(x86Core.bytes, 0x00000);

  // Sectors 32..63 (0x04000..0x07FFF, 16 KB): TabComp TC-32 Native Core ("TC32" header + code)
  imgDV.setUint32(0x04000, 0x32334354, true); // "TC32"
  imgDV.setUint32(0x04004, tc32Core.bytes.length, true);
  img.set(tc32Core.bytes, 0x04008);

  // Sectors 64..319 (0x08000..0x27FFF, 128 KB): SPIR Portable VM Bytecode Image
  img.set(compiled.image, 0x08000);

  // Sectors 320..1919 (0x28000..0xEFFFF, 800 KB span = 768 KB SpiralFS + 32 KB Triton Core at 960..1023)
  img.set(spfs.buf, SPFS_IMG_OFFSET);

  // Ensure Sectors 960..1023 (0x78000..0x7FFFF, 32 KB) contain the Triton 3.1 Core ("TRIT" record)
  img.set(tritonCore.diskRecordBytes, TRITON_IMG_DISK_OFF);

  return {
    img,
    versionStr,
    tc32Core,
    x86Core,
    tritonCore,
    splashBmp,
    compiled,
    spfs,
    freeBytes,
    usedBytes,
    usableBytes: SPFS_USABLE_SIZE,
    expandedSource
  };
}

if (require.main === module) {
  const rootDir = path.resolve(__dirname, "..");
  const res = buildSpiralOSImage(rootDir);
  const outPath = path.join(rootDir, "spiralos.img");
  fs.writeFileSync(outPath, res.img);
  const tritonImgPath = path.join(rootDir, "triton/spiralos-1.3.img");
  if (fs.existsSync(path.dirname(tritonImgPath))) {
    fs.writeFileSync(tritonImgPath, res.img);
  }
  console.log("=== " + res.versionStr + " Unified Build Complete ===");
  console.log("  Output Image      : " + outPath + " (" + res.img.length + " bytes / 1.44 MB)");
  console.log("  x86 Native Core   : " + res.x86Core.totalBytes + " bytes");
  console.log("  TC-32 Native Core : " + res.tc32Core.bytes.length + " bytes (" + res.tc32Core.wordCount + " words)");
  console.log("  Triton T3 Core    : " + res.tritonCore.diskRecordBytes.length + " bytes (" + res.tritonCore.tryteCount + " trytes)");
  console.log("  SPIR VM Bytecode  : " + res.compiled.codeBytes + " code bytes + " + res.compiled.stringBytes + " string bytes (" + res.compiled.funcCount + " functions, " + res.compiled.globalWords + " global words)");
  console.log("  SpiralFS Volume   : " + res.spfs.listFiles().length + " files mounted in Sectors 320..1919 (" + (res.usableBytes / 1024) + " KB usable, " + res.usedBytes + " B used, " + res.freeBytes + " B / " + (res.freeBytes / 1024).toFixed(1) + " KB free)");
}

module.exports = { buildSpiralOSImage, readCanonicalVersion, MIN_REQUIRED_FREE_BYTES };
