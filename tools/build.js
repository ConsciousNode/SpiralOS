#!/usr/bin/env node
/**
 * SpiralOS — Unified Image Builder & Packager (tools/build.js)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Produces the unified 1.44 MB bootable SpiralOS disk image (spiralos.img,
 * 1,474,560 bytes = 2,880 sectors of 512 bytes) that boots unchanged on BOTH:
 *   1. Hummingbird (i586 PC Emulator, via BIOS Sector 0 -> 32-bit Protected Mode Core)
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
  // 1. Build both Native Cores
  const tc32Core = buildTC32Core();
  const x86Core = buildX86Core();

  // 2. Populate SpiralFS (256 KB volume for Sectors 192..703)
  const spfs = new SpiralFS();

  const sourceFiles = [
    ["os/os.sp",     "/src/os.sp"],
    ["os/kernel.sp", "/src/kernel.sp"],
    ["os/fs.sp",     "/src/fs.sp"],
    ["os/gui.sp",    "/src/gui.sp"],
    ["os/wm.sp",     "/src/wm.sp"],
    ["os/net.sp",    "/src/net.sp"],
    ["os/cc.sp",     "/src/cc.sp"],
    ["os/apps1.sp",  "/src/apps1.sp"],
    ["os/apps2.sp",  "/src/apps2.sp"]
  ];

  for (const [diskRel, vfsPath] of sourceFiles) {
    const content = fs.readFileSync(path.join(rootDir, diskRel), "utf8");
    spfs.writeFile(vfsPath, content, 12288);
  }

  // Add sample standalone program & assembly listings for Stretch §3
  spfs.writeFile(
    "/src/hello.sp",
    "// Sample SpiralC Program\nconst RETURN_VAL = 77;\nint main() { return RETURN_VAL; }\n",
    2048
  );
  spfs.writeFile(
    "/src/core_tc32.asm",
    "; SpiralOS TabComp TC-32 Native Core Assembly\n.org 0x000000\nboot_entry:\n  LUI16 R8, 0x0000\n  LHI   R8, 0x0020 ; VM_BASE = 0x00200000\n  JMP   vm_loop\n",
    2048
  );
  spfs.writeFile(
    "/src/core_x86.asm",
    "; SpiralOS Hummingbird i586 Native Core Assembly\n[bits 16]\n[org 0x7C00]\nboot_entry:\n  cli\n  xor ax, ax\n  mov ds, ax\n  jmp 0x0008:0x00008000\n",
    2048
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
    "<p>One OS image running on TabComp TC-32 and Hummingbird i586.</p>\n" +
    "<a href='/sonder.hts'>Visit Sonder Gateway</a>\n",
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
    "SpiralOS 1.0 - ConsciousNode SoftWorks (MIT)\n" +
    "Unified VM Bytecode OS for TabComp & Hummingbird.\n" +
    "Edit /src/wm.sp in SpiralEdit and click Rebuild!\n",
    2048
  );

  // 3. Compile /src/os.sp (expanding all imports from SpiralFS)
  const expandedSource = expandImports("/src/os.sp", (p) => spfs.readText(p));
  const compiled = compileSpiralSource(expandedSource);

  // 4. Assemble unified 1.44 MB floppy/disk image (1,474,560 bytes = 2,880 sectors)
  const img = new Uint8Array(1474560);
  const imgDV = new DataView(img.buffer);

  // Sectors 0..31 (0x00000..0x03FFF, 16 KB): Hummingbird x86 Bootloader + Protected Mode Core
  img.set(x86Core.bytes, 0x00000);

  // Sectors 32..63 (0x04000..0x07FFF, 16 KB): TabComp TC-32 Native Core ('TC32' header + code)
  imgDV.setUint32(0x04000, 0x32334354, true); // 'TC32'
  imgDV.setUint32(0x04004, tc32Core.bytes.length, true);
  img.set(tc32Core.bytes, 0x04008);

  // Sectors 64..191 (0x08000..0x17FFF, 64 KB): SPIR Portable VM Bytecode Image
  img.set(compiled.image, 0x08000);

  // Sectors 192..703 (0x18000..0x57FFF, 256 KB): SPFS SpiralFS Filesystem Volume
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
  console.log("=== SpiralOS Unified Build Complete ===");
  console.log(`  Output Image      : ${outPath} (${res.img.length} bytes / 1.44 MB)`);
  console.log(`  x86 Native Core   : ${res.x86Core.totalBytes} bytes (Boot: 512 B, PM Core: ${res.x86Core.pmCore.length} B)`);
  console.log(`  TC-32 Native Core : ${res.tc32Core.bytes.length} bytes (${res.tc32Core.wordCount} words)`);
  console.log(`  SPIR VM Bytecode  : ${res.compiled.codeBytes} code bytes + ${res.compiled.stringBytes} string bytes (${res.compiled.funcCount} functions)`);
  console.log(`  SpiralFS Volume   : ${res.spfs.listFiles().length} files mounted in Sectors 192..703`);
}

module.exports = { buildSpiralOSImage };
