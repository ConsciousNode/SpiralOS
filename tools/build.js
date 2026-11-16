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

const LAUNCHER_LAYOUT = {
  baseAddr: 0x04DC00,
  entriesAddr: 0x04DC20,
  stride: 16,
  visRows: 17,
  totalItems: 18,
  topArrow: { x: 4, y: 12, w: 100, h: 3 },
  botArrow: { x: 4, y: 168, w: 100, h: 8 }
};


function verifyVmMemoryMap(expandedSource, globalWords = 780) {
  const constMap = new Map();
  const re = /\bconst\s+(?:int\s+)?([A-Z0-9_]+)\s*=\s*(0x[0-9A-Fa-f]+|\d+)\s*;/g;
  let m;
  while ((m = re.exec(expandedSource)) !== null) {
    constMap.set(m[1], Number(m[2]));
  }
  const addr = (name, fallback) => {
    if (!constMap.has(name) && fallback === undefined) {
      throw new Error("Memory map check: missing constant " + name + " in os/*.sp");
    }
    return constMap.has(name) ? constMap.get(name) : fallback;
  };

  const regions = [
    { name: "SPIR_BYTECODE",    start: 0x000000, size: 0x020000, relocated: false, note: "128 KB SPIR header + strings + code" },
    { name: "SPIR_GLOBALS",     start: 0x020000, size: Math.max(4096, globalWords * 4), relocated: false, note: globalWords + " global words" },
    { name: "CC_IDENT_BUF",     start: addr("CC_IDENT_BUF"),     size: 0x000100, relocated: true,  orig: 0x060000, note: "256 B compiler ident scratch" },
    { name: "CC_STR_BUF",       start: addr("CC_STR_BUF"),       size: 0x000300, relocated: true,  orig: 0x060100, note: "768 B compiler string scratch" },
    { name: "CC_LOC_TAB",       start: addr("CC_LOC_TAB"),       size: 0x001000, relocated: true,  orig: 0x072000, note: "128 * 32B local symbol table" },
    { name: "CC_BREAK_TAB",     start: addr("CC_BREAK_TAB"),     size: 0x001000, relocated: true,  orig: 0x080000, note: "512 * 8B break patch table" },
    { name: "CC_CONT_TAB",      start: addr("CC_CONT_TAB"),      size: 0x001000, relocated: true,  orig: 0x081000, note: "512 * 8B continue patch table" },
    { name: "CC_CONST_HEAD",    start: addr("CC_CONST_HEAD"),    size: 0x000400, relocated: true,  orig: 0x07A000, note: "256 * 4B const hash buckets" },
    { name: "CC_GLOB_HEAD",     start: addr("CC_GLOB_HEAD"),     size: 0x000400, relocated: true,  orig: 0x07A400, note: "256 * 4B global hash buckets" },
    { name: "CC_FUNC_HEAD",     start: addr("CC_FUNC_HEAD"),     size: 0x000400, relocated: true,  orig: 0x07A800, note: "256 * 4B func hash buckets" },
    { name: "CC_POOL_HEAD",     start: addr("CC_POOL_HEAD"),     size: 0x000400, relocated: true,  orig: 0x07AC00, note: "256 * 4B string pool buckets" },
    { name: "ASM_LBL_TAB",      start: addr("ASM_LBL_TAB"),      size: 0x002400, relocated: true,  orig: 0x082000, note: "256 * 36B assembler labels" },
    { name: "ASM_FIX_TAB",      start: addr("ASM_FIX_TAB"),      size: 0x006000, relocated: true,  orig: 0x085000, note: "512 * 48B assembler fixups" },
    { name: "ASM_TOK_BUF",      start: addr("ASM_TOK_BUF"),      size: 0x000100, relocated: true,  orig: 0x08E000, note: "256 B assembler token scratch" },
    { name: "NOTES_UNDO_BUF",   start: addr("NOTES_UNDO_BUF"),   size: 0x001000, relocated: true,  orig: 0x1CF200, note: "4 KB Notes undo buffer" },
    { name: "EDIT_UNDO_BUF",    start: addr("EDIT_UNDO_BUF"),    size: 0x001000, relocated: true,  orig: 0x1D0200, note: "4 KB SpiralEdit undo buffer" },
    { name: "NOTES_CLIP_BUF",   start: addr("NOTES_CLIP_BUF"),   size: 0x006000, relocated: true,  orig: 0x1C9000, note: "24 KB shared OS clipboard" },
    { name: "NOTES_FIND_BUF",   start: addr("NOTES_FIND_BUF"),   size: 0x000040, relocated: true,  orig: 0x1CF000, note: "64 B Notes find query" },
    { name: "NOTES_PATH_BUF",   start: addr("NOTES_PATH_BUF"),   size: 0x000040, relocated: true,  orig: 0x1CF040, note: "64 B Notes current file path" },
    { name: "DLG_FOLDER_BUF",   start: addr("DLG_FOLDER_BUF"),   size: 0x000020, relocated: true,  orig: 0x1CF080, note: "32 B dialog folder path" },
    { name: "DLG_NAME_BUF",     start: addr("DLG_NAME_BUF"),     size: 0x000040, relocated: true,  orig: 0x1CF0A0, note: "64 B dialog filename field" },
    { name: "DLG_FULL_BUF",     start: addr("DLG_FULL_BUF"),     size: 0x000040, relocated: true,  orig: 0x1CF0E0, note: "64 B dialog full path" },
    { name: "FM_INPUT_BUF",     start: addr("FM_INPUT_BUF"),     size: 0x000040, relocated: true,  orig: 0x1CF120, note: "64 B Files modal input" },
    { name: "SHELL_CWD_BUF",    start: addr("SHELL_CWD_BUF"),    size: 0x000040, relocated: true,  orig: 0x1CF160, note: "64 B Shell CWD path" },
    { name: "SOL_PILES_BUF",    start: addr("SOL_PILES_BUF"),    size: 0x000400, relocated: true,  orig: 0x1D8000, note: "1,024 B Solitaire piles" },
    { name: "SOL_LEN_BUF",      start: addr("SOL_LEN_BUF"),      size: 0x000040, relocated: true,  orig: 0x1D8400, note: "64 B Solitaire pile lengths" },
    { name: "SOL_UP_BUF",       start: addr("SOL_UP_BUF"),       size: 0x000040, relocated: true,  orig: 0x1D8440, note: "64 B Solitaire face-up idx" },
    { name: "SOL_TT_BUF",       start: addr("SOL_TT_BUF"),       size: 0x001000, relocated: true,  orig: 0x1D9000, note: "4 KB Solitaire solver TT" },
    { name: "ASM_WORK_BUF",     start: addr("ASM_WORK_BUF"),     size: 0x004000, relocated: true,  orig: 0x0A0000, note: "16 KB assembler output buf" },
    { name: "SRRP_SCRATCH_BUF", start: addr("SRRP_SCRATCH_BUF"), size: 0x001000, relocated: true,  orig: 0x1C0000, note: "4 KB SRRP & sh_buf scratch" },
    { name: "SHELL_CMD_RING",   start: addr("SHELL_CMD_RING"),   size: 0x000C00, relocated: true,  orig: 0x1D1200, note: "32 * 96B Shell history ring" },
    { name: "NET_TX_BUF",       start: addr("NET_TX_BUF"),       size: 0x000400, relocated: false, note: "1 KB StudioNet TX frame" },
    { name: "NET_RX_BUF",       start: addr("NET_RX_BUF"),       size: 0x000400, relocated: false, note: "1 KB StudioNet RX frame" },
    { name: "CHAT_LOG_BUF",     start: addr("CHAT_LOG_BUF"),     size: 0x000100, relocated: false, note: "256 B Chat log" },
    { name: "WEB_PAGE_BUF",     start: addr("WEB_PAGE_BUF"),     size: 0x000800, relocated: false, note: "2 KB legacy Web page mirror" },
    { name: "FTX_LAST_FILE",    start: addr("FTX_LAST_FILE"),    size: 0x000040, relocated: false, note: "64 B last received filename" },
    { name: "SNS_MY_NAME_BUF",  start: addr("SNS_MY_NAME_BUF"),  size: 0x000020, relocated: false, note: "32 B SNS base hostname" },
    { name: "SNS_DISP_BUF",     start: addr("SNS_DISP_BUF"),     size: 0x000020, relocated: false, note: "32 B SNS display name" },
    { name: "SNS_CLASH_BUF",    start: addr("SNS_CLASH_BUF"),    size: 0x000040, relocated: false, note: "64 B SNS clash warning" },
    { name: "SNS_PEER_TAB",     start: addr("SNS_PEER_TAB"),     size: 0x000200, relocated: false, note: "8 * 64B SNS peer table" },
    { name: "WEB_HIST_BUF",     start: addr("WEB_HIST_BUF"),     size: 0x000200, relocated: false, note: "8 * 64B SpiralWeb history" },
    { name: "WEB_CUR_URL",      start: addr("WEB_CUR_URL"),      size: 0x000040, relocated: false, note: "64 B SpiralWeb current URL" },
    { name: "WEB_IMG_SRC",      start: addr("WEB_IMG_SRC"),      size: 0x000040, relocated: false, note: "64 B SpiralWeb img src" },
    { name: "WEB_LINK_TAB",     start: addr("WEB_LINK_TAB"),     size: 0x000240, relocated: false, note: "12 * 48B SpiralWeb link tab" },
    { name: "SHELL_OUT_BUF",    start: addr("SHELL_OUT_BUF"),    size: 0x0000F0, relocated: false, note: "240 B Shell status mirror" },
    { name: "SHELL_IN_BUF",     start: addr("SHELL_IN_BUF"),     size: 0x000080, relocated: false, note: "128 B Shell input line" },
    { name: "CHAT_IN_BUF",      start: addr("CHAT_IN_BUF"),      size: 0x000080, relocated: false, note: "128 B Chat input line" },
    { name: "PAINT_CANVAS",     start: addr("PAINT_CANVAS"),     size: 0x001500, relocated: false, note: "96x56 (5,376 B) Paint canvas" },
    { name: "LAUNCHER_TAB",     start: addr("LAUNCHER_TAB"),     size: 0x000140, relocated: false, note: "320 B Launcher box table" },
    { name: "NUM_STR_BUF",      start: addr("NUM_STR_BUF"),      size: 0x000040, relocated: false, note: "64 B hal_itoa buffer" },
    { name: "SHELL_HIST_BUF",   start: addr("SHELL_HIST_BUF"),   size: 0x000C00, relocated: false, note: "32 * 96B Shell scrollback" },
    { name: "EDIT_BUF",         start: addr("EDIT_BUF"),         size: 0x009000, relocated: false, note: "36 KB SpiralEdit buffer" },
    { name: "EDIT_SCRATCH",     start: addr("EDIT_SCRATCH"),     size: 0x007000, relocated: false, note: "28 KB SpiralEdit splice buf" },
    { name: "CC_ERR_MSG",       start: addr("CC_ERR_MSG"),       size: 0x000080, relocated: false, note: "128 B SpiralC error string" },
    { name: "CC_CONST_TAB",     start: addr("CC_CONST_TAB"),     size: 0x003000, relocated: false, note: "12 KB SpiralC const table" },
    { name: "CC_GLOB_TAB",      start: addr("CC_GLOB_TAB"),      size: 0x004000, relocated: false, note: "16 KB SpiralC global table" },
    { name: "CC_FUNC_TAB",      start: addr("CC_FUNC_TAB"),      size: 0x006000, relocated: true,  orig: 0x06C000, note: "24 KB SpiralC func table" },
    { name: "CC_FIXUP_TAB",     start: addr("CC_FIXUP_TAB"),     size: 0x006000, relocated: true,  orig: 0x074000, note: "24 KB SpiralC fixup table" },
    { name: "CC_POOL_TAB",      start: addr("CC_POOL_TAB"),      size: 0x006000, relocated: false, note: "24 KB SpiralC string pool" },
    { name: "VMRAM_FONT_SERIF", start: addr("VMRAM_FONT_SERIF"), size: 0x000800, relocated: false, note: "2 KB CNSW Serif 8x16 font" },
    { name: "VMRAM_FONT_SANS2", start: addr("VMRAM_FONT_SANS2"), size: 0x000800, relocated: false, note: "2 KB CNSW Sans 8x16 font" },
    { name: "CC_WORK_BUF",      start: addr("CC_WORK_BUF"),      size: 0x020000, relocated: false, note: "128 KB SpiralC output image" },
    { name: "VMRAM_VRAM",       start: addr("VMRAM_VRAM"),       size: 0x00FA00, relocated: false, note: "64,000 B 320x200 framebuffer" },
    { name: "VMRAM_PALETTE",    start: addr("VMRAM_PALETTE"),    size: 0x000300, relocated: false, note: "768 B RGB palette" },
    { name: "VMRAM_STATUS",     start: addr("VMRAM_STATUS"),     size: 0x000100, relocated: false, note: "256 B status & RTC block" },
    { name: "VMRAM_TCB_BASE",   start: addr("VMRAM_TCB_BASE"),   size: 0x000100, relocated: false, note: "256 B task control blocks" },
    { name: "VMRAM_SCHED_HDR",  start: addr("VMRAM_SCHED_HDR"),  size: 0x000100, relocated: false, note: "256 B scheduler header" },
    { name: "WEB_PAGE_BUF_EXT", start: addr("WEB_PAGE_BUF_EXT"), size: 0x010000, relocated: false, note: "64 KB SpiralWeb page buffer" },
    { name: "SRRP_RX_BUF",      start: addr("SRRP_RX_BUF"),      size: 0x010000, relocated: false, note: "64 KB SRRP RX reassembly" },
    { name: "SRRP_TX_BUF",      start: addr("SRRP_TX_BUF"),      size: 0x010000, relocated: false, note: "64 KB SRRP TX buffer" },
    { name: "NOTES_BUF",        start: addr("NOTES_BUF"),        size: 0x008000, relocated: false, note: "32 KB Notes text buffer" },
    { name: "VMRAM_IMG_BASE",   start: addr("VMRAM_IMG_BASE"),   size: 0x180000, relocated: false, note: "1.44 MB disk image & SpiralFS" }
  ].map(r => ({ ...r, end: r.start + r.size - 1 })).sort((a, b) => a.start - b.start);

  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const A = regions[i];
      const B = regions[j];
      if (A.start < B.start + B.size && B.start < A.start + A.size) {
        throw new Error(
          "VM Memory Map Overlap Detected: " + A.name +
          " [0x" + A.start.toString(16) + "..0x" + A.end.toString(16) + "] overlaps " +
          B.name + " [0x" + B.start.toString(16) + "..0x" + B.end.toString(16) + "]"
        );
      }
    }
  }
  return regions;
}

function buildSpiralOSImage(rootDir = path.resolve(__dirname, ".."), opts = {}) {
  if (rootDir && typeof rootDir === "object" && !Array.isArray(rootDir)) {
    opts = rootDir;
    rootDir = opts.rootDir || path.resolve(__dirname, "..");
  }
  const pcMode = opts.positiveControl || null;
  const versionStr = readCanonicalVersion(rootDir);

  // 1. Build all three Native Cores (TC-32, x86, and Triton T3)
  const tc32Core = buildTC32Core();
  const x86Core = buildX86Core("SpiralOS 1.2", { brokenTimeMs: pcMode === "b" });
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
    const fullP = path.join(rootDir, diskRel);
    if (!fs.existsSync(fullP)) throw new Error("Missing required in-repo build input: " + diskRel);
    let content = fs.readFileSync(fullP, "utf8");
    if (pcMode === "a" && diskRel === "os/os.sp") content = content.replace("const PC_LAUNCHER_DRIFT    = 0;", "const PC_LAUNCHER_DRIFT    = 1;");
    if (pcMode === "c" && diskRel === "os/apps1.sp") content = content.replace("const PC_ISOLATED_CLIP = 0;", "const PC_ISOLATED_CLIP = 1;");
    if (pcMode === "d" && diskRel === "os/apps1.sp") content = content.replace("const PC_LS_COUNT_ONLY = 0;", "const PC_LS_COUNT_ONLY = 1;");
    if (pcMode === "e" && diskRel === "os/apps2.sp") content = content.replace("const PC_SNAKE_NO_SELF = 0;", "const PC_SNAKE_NO_SELF = 1;");
    if (pcMode === "f" && diskRel === "os/os.sp") content = content.replace("const PC_SHUTDOWN_NO_FLUSH = 0;", "const PC_SHUTDOWN_NO_FLUSH = 1;");
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
    const fullP = path.join(rootDir, diskRel);
    if (!fs.existsSync(fullP)) throw new Error("Missing required in-repo build input: " + diskRel);
    const content = fs.readFileSync(fullP, "utf8");
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
  // KEHAI FIX (2026-11-15): the mark lived outside the repo (../cnsw-mark.svg), so every
  // in-repo build silently shipped an all-zero (black) logo. Look in the repo too, and fail loudly.
  const svgMarkPath = [path.resolve(rootDir, "delivery-1.4/cnsw-mark.svg"), path.resolve(rootDir, "cnsw-mark.svg")]
    .find(p => fs.existsSync(p));
  if (!svgMarkPath) throw new Error("cnsw-mark.svg not found: the splash logo would be blank");
  const splashBmp = rasterizeCnswMark(svgMarkPath, 80, 80);
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
  const memoryMap = verifyVmMemoryMap(expandedSource, compiled.globalWords);

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
    expandedSource,
    memoryMap
  };
}

if (require.main === module) {
  const rootDir = path.resolve(__dirname, "..");
  const res = buildSpiralOSImage(rootDir);
  const outPath = path.join(rootDir, "spiralos.img");
  fs.writeFileSync(outPath, res.img);
  const tritonImgPath = path.join(rootDir, "triton/spiralos-1.4.img");
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
  const reloc = res.memoryMap.filter(r => r.relocated);
  console.log("  Memory-Map Check  : PASS (" + res.memoryMap.length + " total regions, " + reloc.length + " relocated buffers verified pairwise disjoint, 0 overlaps)");
  for (const r of reloc) {
    const sHex = "0x" + r.start.toString(16).toUpperCase().padStart(6, "0");
    const eHex = "0x" + r.end.toString(16).toUpperCase().padStart(6, "0");
    const oHex = "0x" + r.orig.toString(16).toUpperCase().padStart(6, "0");
    console.log("    [OK] " + r.name.padEnd(17, " ") + ": " + sHex + ".." + eHex + " (" + String(r.size).padStart(6, " ") + " B, was " + oHex + ") — " + r.note);
  }
}

module.exports = { buildSpiralOSImage, readCanonicalVersion, MIN_REQUIRED_FREE_BYTES, LAUNCHER_LAYOUT, verifyVmMemoryMap };
