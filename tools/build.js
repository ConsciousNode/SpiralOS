#!/usr/bin/env node
/**
 * SpiralOS 1.1 — Unified Image Builder & Packager (tools/build.js)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Produces the unified 1.44 MB bootable SpiralOS disk image (spiralos.img,
 * 1,474,560 bytes = 2,880 sectors of 512 bytes) that boots unchanged on BOTH:
 *   1. Hummingbird (i586 PC Emulator & QEMU/Real Hardware, via BIOS Sector 0 -> Stage 2 -> 32-bit PM Core)
 *   2. TabComp (TC-32 Fantasy Computer, via Sectors 32..63 Native TC-32 Core)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { buildTC32Core } = require("../core/core_tc32.js");
const { buildX86Core } = require("../core/core_x86.js");
const { SpiralFS, SPFS_IMG_OFFSET, SPFS_SIZE } = require("../compiler/spiralfs.js");
const { compileSpiralSource, expandImports } = require("../compiler/spiralc.js");

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
  // 1. Build both Native Cores (including their full symbolic assembly sources)
  const tc32Core = buildTC32Core();
  const x86Core = buildX86Core();

  // 2. Populate SpiralFS (320 KB volume for Sectors 320..959)
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

  // Add sample standalone program & full symbolic assembly sources for both Native Cores (§2)
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
    "<p>Served live over StudioNet SSP (Port 80) by SpiralHttpd.</p>\n" +
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

  // Add sample .pic bitmap art files for Paint & Image Viewer
  spfs.writeFile("/art/spiral.pic", createProceduralPic(0), 6144);
  spfs.writeFile("/art/prism.pic", createProceduralPic(1), 6144);

  // Add on-disk documentation
  spfs.writeFile(
    "/docs/README.txt",
    "SpiralOS 1.2.1 'Real Spiral' - ConsciousNode SoftWorks (MIT)\n" +
    "Unified VM Bytecode OS for TabComp & Hummingbird.\n" +
    "Includes full self-hosting SpiralC compiler (/src/cc.sp)\n" +
    "and symbolic native core assemblers (/src/asm.sp).\n",
    2048
  );

  // 3. Compile /src/os.sp (using in-place import resolution matching /src/cc.sp 1-to-1)
  const osEntryBytes = spfs.readFile("/src/os.sp");
  const compiled = compileSpiralSource(osEntryBytes, (p) => spfs.readFile(p));
  const expandedSource = expandImports("/src/os.sp", (p) => spfs.readText(p));

  // 4. Assemble unified 1.44 MB floppy/disk image (1,474,560 bytes = 2,880 sectors)
  const img = new Uint8Array(1474560);
  const imgDV = new DataView(img.buffer);

  // Sectors 0..31 (0x00000..0x03FFF, 16 KB): Hummingbird x86 Bootloader + Stage 2 + Protected Mode Core
  img.set(x86Core.bytes, 0x00000);

  // Sectors 32..63 (0x04000..0x07FFF, 16 KB): TabComp TC-32 Native Core ('TC32' header + code)
  imgDV.setUint32(0x04000, 0x32334354, true); // 'TC32'
  imgDV.setUint32(0x04004, tc32Core.bytes.length, true);
  img.set(tc32Core.bytes, 0x04008);

  // Sectors 64..319 (0x08000..0x27FFF, 128 KB): SPIR Portable VM Bytecode Image
  img.set(compiled.image, 0x08000);

  // Sectors 320..959 (0x28000..0x77FFF, 320 KB): SPFS SpiralFS Filesystem Volume
  img.set(spfs.buf, SPFS_IMG_OFFSET);

  return {
    img,
    tc32Core,
    x86Core,
    compiled,
    spfs,
    expandedSource
  };
}

if (require.main === module) {
  const rootDir = path.resolve(__dirname, "..");
  const res = buildSpiralOSImage(rootDir);
  const outPath = path.join(rootDir, "spiralos.img");
  fs.writeFileSync(outPath, res.img);
  console.log("=== SpiralOS 1.2.1 Unified Build Complete ===");
  console.log(`  Output Image      : ${outPath} (${res.img.length} bytes / 1.44 MB)`);
  console.log(`  x86 Native Core   : ${res.x86Core.totalBytes} bytes (Stage1: 512 B, Stage2: 512 B, PM Core: ${res.x86Core.pmCore.length} B)`);
  console.log(`  TC-32 Native Core : ${res.tc32Core.bytes.length} bytes (${res.tc32Core.wordCount} words)`);
  console.log(`  SPIR VM Bytecode  : ${res.compiled.codeBytes} code bytes + ${res.compiled.stringBytes} string bytes (${res.compiled.funcCount} functions, ${res.compiled.globalWords} global words)`);
  console.log(`  SpiralFS Volume   : ${res.spfs.listFiles().length} files mounted in Sectors 320..959`);
}

module.exports = { buildSpiralOSImage };
