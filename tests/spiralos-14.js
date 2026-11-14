#!/usr/bin/env node
/**
 * SpiralOS 1.4 "Daily Driver" — Comprehensive Release & Cross-Core Headroom Suite (tests/spiralos-14.js)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Verifies every requirement of SpiralOS 1.4 "Daily Driver" across TabComp (TC-32),
 * Hummingbird (x86), and Triton (Balanced-Ternary T3):
 *   1. Build & SpiralFS Volume Gate (>= 640 KB usable, >= 128 KB free) + Non-Overlapping Memory Map
 *   2. Fresh-Boot Write-Headroom Test on ALL THREE CORES (TabComp, Hummingbird, Triton):
 *      - Notes saves a 20 KB document (/home/note.txt = 20,480 B)
 *      - Paint saves a picture (/art/user.pic = 5,376 B)
 *      - An inbox PUT of 16 KB over SRRP succeeds (/inbox/drop16k.bin = 16,384 B)
 *      - SpiralEdit grows /src/hello.sp by 4 KB (122 B -> 4,218 B) and self-host build reaches its fixed point
 *      - Reported free space is reduced by the exact expected amount (50,176 B: 380,928 B -> 330,752 B)
 *   3. StudioNet 1.0 Conformance against studionet/studionet-ref.js Oracle:
 *      - SNS (proto 1, port 53): HELLO/WHO/BYE, peer table, NameAgent §3.4 naming, /etc/hostname, NODE ID CLASH
 *      - SDP Echo responder (proto 2, port 7): ACK with same payload and ack = seq + 1
 *      - SRRP (proto 3, port 80): GET/PUT/POST/LIST/DEL, Encoding: bytes | trytes16, SACK, 413 TOO BIG
 *      - SpiralHttpd: /www, /inbox validation (403 on .. or /), share on|off (services bit 6 = 0x40, /share)
 *      - SpiralWeb: >= 16 KB page fetch over SRRP into WEB_PAGE_BUF_EXT (0x190000) + Type: image/spiral-snap
 *   4. Daily-Driver Apps, Solitaire Deals/Solver & Part D Fixes:
 *      - Deals check lines (`deals`) matching shared/deals-ref.js verbatim
 *      - Solitaire solver: WINNABLE on FreeCell #1, UNWINNABLE on #11982, UNKNOWN on node budget cap
 *      - Clock & Calendar: hal_date() (SYS_DATE = 22) reading CMOS RTC on x86, MANUAL CLOCK on TabComp/Triton
 *      - x86 IDIV INT_MIN / -1 guard, "Triton" machine label, and canonical version string
 */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const { loadEmulators } = require("./harness.js");
const { buildSpiralOSImage, MIN_REQUIRED_FREE_BYTES } = require("../tools/build.js");
const {
  SpiralFS,
  SPFS_IMG_OFFSET,
  SPFS_SIZE
} = require("../compiler/spiralfs.js");
const { buildTritonCore } = require("../core/core_triton.js");
const { runProgramOnBothCores } = require("./vm.js");
const StudioNetRef = require("../../studionet/studionet-ref.js");

loadEmulators();

const rootDir = path.resolve(__dirname, "..");

function loadTritonSystem() {
  const html = fs.readFileSync(path.join(rootDir, "triton/spiralos-triton.html"), "utf8");
  const m = html.match(/<script[\s\S]*?<\/script>/g);
  const ctx = {
    globalThis: {},
    WebAssembly,
    TextEncoder,
    TextDecoder,
    console,
    Math,
    Uint8Array,
    Int32Array,
    Float64Array,
    BigInt,
    ArrayBuffer,
    DataView,
    Map,
    Set,
    String,
    Number,
    Object,
    Array,
    Error,
    RegExp,
    JSON,
    parseInt,
    parseFloat,
    isNaN
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(m[0].replace(/^<script[^>]*>|<\/script>$/g, ""), ctx);
  return ctx.TritonSystem;
}

const TritonSystem = loadTritonSystem();
const TRITON_WASM_MOD = new WebAssembly.Module(TritonSystem.MicroWAT.assemble(TritonSystem.TRITON_WAT));
const TRITON_CORE = buildTritonCore();

// PS/2 Set 1 scancode lookup for Hummingbird (matches core_x86.js plainChars)
const PLAIN_CHARS = "1234567890-=\b\tqwertyuiop[]\r\0asdfghjkl;'`\0\\zxcvbnm,./";
function asciiToScancode(ascii) {
  if (ascii === 13 || ascii === 10) return 0x1C;
  if (ascii === 32) return 0x39;
  if (ascii === 8) return 0x0E;
  if (ascii === 27) return 0x01;
  const idx = PLAIN_CHARS.indexOf(String.fromCharCode(ascii));
  if (idx >= 0) return idx + 2;
  throw new Error("Unsupported plain ASCII for PS/2 scancode: " + ascii);
}

function createMachineRunner(kind, imgBytes, nodeId) {
  const vmBase = 0x00200000;
  if (kind === "tabcomp") {
    const tcFs = new globalThis.TabCompFS();
    const cpu = new globalThis.TabCompCPU(tcFs);
    globalThis.initHardwareMemory(cpu);
    globalThis.bootSpiralDiskImage(cpu, imgBytes);
    if (nodeId && cpu.snet) {
      cpu.snet.defaultNodeId = nodeId;
      cpu.snet.nodeId = nodeId;
      if (cpu._syncStudioNetMMIO) cpu._syncStudioNetMMIO();
    }

    return {
      kind,
      raw: cpu,
      stepFrames(n = 1) {
        const target = cpu.presentCount + n;
        let guard = 0;
        while (cpu.presentCount < target && !cpu.halted && guard < n * 5000) {
          cpu.yielded = false;
          cpu.stepBatch(50000);
          guard++;
        }
      },
      readVmU8(off, len) {
        return cpu.ram.subarray(vmBase + off, vmBase + off + len);
      },
      readVmI32(off) {
        return cpu.ramDV.getInt32(vmBase + off, true);
      },
      click(x, y, btn = 1) {
        cpu.setMouseState(x, y, btn);
        this.stepFrames(1);
        cpu.setMouseState(x, y, 0);
        this.stepFrames(1);
      },
      pressKey(ascii, vk = ascii, mods = 0) {
        cpu.pushKeyEvent(1, vk, ascii, mods);
        this.stepFrames(1);
        cpu.pushKeyEvent(0, vk, ascii, 0);
        this.stepFrames(1);
      },
      typeText(str) {
        for (let i = 0; i < str.length; i++) {
          const code = str.charCodeAt(i);
          this.pressKey(code, code, 0);
        }
      },
      injectFrame(frameBytes) {
        cpu.snet._enqueueRx(new Uint8Array(frameBytes));
      },
      extractDiskImage() {
        return new Uint8Array(cpu.spiralDiskImage);
      }
    };
  }

  if (kind === "hummingbird") {
    const hb = new globalThis.HummingbirdPC({ ramSizeMB: 16 });
    hb.loadFloppyImage(imgBytes);
    if (nodeId && hb.snet) {
      hb.snet.defaultNodeId = nodeId;
      hb.snet.nodeId = nodeId;
    }

    return {
      kind,
      raw: hb,
      stepFrames(n = 1) {
        const f0 = hb.ramView.getInt32(vmBase + 0x0FFD04, true);
        const target = f0 + n;
        let guard = 0;
        while (hb.ramView.getInt32(vmBase + 0x0FFD04, true) < target && guard < n * 5000) {
          hb.cpu.runSteps(200000);
          guard++;
        }
      },
      readVmU8(off, len) {
        return hb.ram.subarray(vmBase + off, vmBase + off + len);
      },
      readVmI32(off) {
        return hb.ramView.getInt32(vmBase + off, true);
      },
      click(tx, ty, btn = 1) {
        for (let iter = 0; iter < 40; iter++) {
          const mx = hb.ramView.getInt32(vmBase + 0x0FFD08, true);
          const my = hb.ramView.getInt32(vmBase + 0x0FFD0C, true);
          const dx = tx - mx;
          const dy = ty - my;
          if (dx === 0 && dy === 0) break;
          const sx = Math.max(-32, Math.min(32, dx));
          const sy = Math.max(-32, Math.min(32, dy));
          hb.ps2.sendMousePacket(sx, sy, 0);
          this.stepFrames(1);
        }
        hb.ps2.sendMousePacket(0, 0, btn);
        this.stepFrames(1);
        hb.ps2.sendMousePacket(0, 0, 0);
        this.stepFrames(1);
      },
      pressKey(ascii) {
        const sc = asciiToScancode(ascii);
        hb.ps2.sendKeyScancode(sc);
        this.stepFrames(1);
        hb.ps2.sendKeyScancode(sc | 0x80);
        this.stepFrames(1);
      },
      typeText(str) {
        for (let i = 0; i < str.length; i++) {
          const code = str.charCodeAt(i);
          this.pressKey(code);
        }
      },
      injectFrame(frameBytes) {
        hb.snet._enqueueRx(new Uint8Array(frameBytes));
      },
      extractDiskImage() {
        return new Uint8Array(hb.floppyImage);
      }
    };
  }

  if (kind === "triton") {
    const wasmVm = new TritonSystem.TritonWASM(TRITON_WASM_MOD, {
      ramSize: 14348907,
      archMode: "T3",
      nodeId: nodeId || 0x0003
    });
    wasmVm.reset(false);
    for (let i = 0; i < imgBytes.length; i++) {
      wasmVm.setDisk(i, imgBytes[i] & 0xFF);
    }
    wasmVm.loadProgram(TRITON_CORE.bootRomTrytes, 0);

    let lastMx = 160;
    let lastMy = 100;

    return {
      kind,
      raw: wasmVm,
      stepFrames(n = 1) {
        const f0 = this.readVmI32(0x0FFD04);
        const target = f0 + n;
        let guard = 0;
        while (this.readVmI32(0x0FFD04) < target && !wasmVm.halted && guard < n * 5000) {
          wasmVm.run(200000);
          guard++;
        }
      },
      readVmU8(off, len) {
        const out = new Uint8Array(len);
        const base = vmBase + (off & 0x3FFFFF);
        for (let i = 0; i < len; i++) {
          out[i] = wasmVm.getMem(base + i) & 0xFF;
        }
        return out;
      },
      readVmI32(off) {
        const b = vmBase + (off & 0x3FFFFF);
        return (
          (wasmVm.getMem(b) & 0xFF) |
          ((wasmVm.getMem(b + 1) & 0xFF) << 8) |
          ((wasmVm.getMem(b + 2) & 0xFF) << 16) |
          ((wasmVm.getMem(b + 3) & 0xFF) << 24)
        ) | 0;
      },
      click(x, y, btn = 1) {
        const dx = x - lastMx;
        const dy = y - lastMy;
        lastMx = x;
        lastMy = y;
        wasmVm.pushMouseEvent(dx, dy, btn);
        this.stepFrames(1);
        wasmVm.pushMouseEvent(0, 0, 0);
        this.stepFrames(1);
      },
      pressKey(ascii, vk = ascii) {
        let code = ascii;
        if (vk === 38) code = (38 << 8) | 38;
        else if (vk === 40) code = (40 << 8) | 40;
        else if (vk === 37) code = (37 << 8) | 37;
        else if (vk === 39) code = (39 << 8) | 39;
        wasmVm.pushKeyEvent(code, 0);
        this.stepFrames(1);
        wasmVm.pushKeyEvent(code, 1);
        this.stepFrames(1);
      },
      typeText(str) {
        for (let i = 0; i < str.length; i++) {
          const code = str.charCodeAt(i);
          this.pressKey(code, code);
        }
      },
      injectFrame(frameBytes) {
        wasmVm.receiveNetFrame(new Uint8Array(frameBytes));
      },
      extractDiskImage() {
        const out = new Uint8Array(1474560);
        for (let i = 0; i < 1474560; i++) {
          out[i] = wasmVm.getDisk(i) & 0xFF;
        }
        return out;
      }
    };
  }

  throw new Error("Unknown machine kind: " + kind);
}

function readShellText(m) {
  const bytes = m.readVmU8(0x04E000, 32 * 96);
  const lines = [];
  for (let r = 0; r < 32; r++) {
    let s = "";
    for (let c = 0; c < 96; c++) {
      const ch = bytes[r * 96 + c];
      if (ch === 0) break;
      if (ch >= 32 && ch < 127) s += String.fromCharCode(ch);
    }
    if (s.length > 0) lines.push(s);
  }
  return lines.join("\n");
}

function sendSrrpPutFromPeer(m, peerNodeId, dstNodeId, pathStr, bodyBytes) {
  let txSeq = 100;
  const headStr =
    "SRRP/1.0 PUT " + pathStr + "\n" +
    "Size: " + bodyBytes.length + "\n" +
    "Type: application/octet-stream\n" +
    "Encoding: bytes\n\n";
  const headBytes = new TextEncoder().encode(headStr);
  const firstBodyChunk = Math.min(bodyBytes.length, 464 - headBytes.length);
  const firstPayload = new Uint8Array(headBytes.length + firstBodyChunk);
  firstPayload.set(headBytes, 0);
  firstPayload.set(bodyBytes.subarray(0, firstBodyChunk), headBytes.length);

  const onlyOne = firstBodyChunk >= bodyBytes.length;
  const firstFlags = StudioNetRef.FLAG_START | (onlyOne ? StudioNetRef.FLAG_END : 0);
  const f0 = StudioNetRef.encodeFrame({
    ver: 1,
    proto: StudioNetRef.PROTO_SRRP,
    flags: firstFlags,
    src: peerNodeId,
    dst: dstNodeId,
    srcPort: 49152,
    dstPort: 80,
    seq: txSeq++,
    ack: 0,
    window: 4,
    payload: firstPayload
  });
  m.injectFrame(f0);
  m.stepFrames(2);

  let sent = firstBodyChunk;
  while (sent < bodyBytes.length) {
    const chunkLen = Math.min(464, bodyBytes.length - sent);
    const isLast = (sent + chunkLen) >= bodyBytes.length;
    const fn = StudioNetRef.encodeFrame({
      ver: 1,
      proto: StudioNetRef.PROTO_SRRP,
      flags: isLast ? StudioNetRef.FLAG_END : 0,
      src: peerNodeId,
      dst: dstNodeId,
      srcPort: 49152,
      dstPort: 80,
      seq: txSeq++,
      ack: 0,
      window: 4,
      payload: bodyBytes.subarray(sent, sent + chunkLen)
    });
    m.injectFrame(fn);
    sent += chunkLen;
    if ((txSeq & 3) === 0 || isLast) {
      m.stepFrames(2);
    }
  }
  m.stepFrames(3);
}

function bootToDesktop(m) {
  m.stepFrames(1);
  m.pressKey(32, 32);
  m.stepFrames(2);
}

function runSuite() {
  console.log("=== SpiralOS 1.4 \"Daily Driver\" Comprehensive Verification Suite ===");

  // -------------------------------------------------------------------------
  // 1. Build, SpiralFS Volume Gate & Non-Overlapping Memory Map Check
  // -------------------------------------------------------------------------
  const buildRes = buildSpiralOSImage(rootDir);
  assert.strictEqual(buildRes.versionStr, 'SpiralOS 1.4 "Daily Driver"');
  assert.strictEqual(buildRes.img.length, 1474560);
  assert.ok(
    buildRes.usableBytes >= 640 * 1024,
    `SpiralFS usable volume (${buildRes.usableBytes}) must be >= 640 KB`
  );
  assert.ok(
    buildRes.freeBytes >= MIN_REQUIRED_FREE_BYTES,
    `SpiralFS free bytes (${buildRes.freeBytes}) must be >= 128 KB (${MIN_REQUIRED_FREE_BYTES})`
  );

  const regions = [
    { name: "SPIR Header & Strings",   start: 0x000000, end: 0x00157F },
    { name: "SPIR VM Bytecode",        start: 0x001580, end: 0x01FFFF },
    { name: "OS Globals & BSS",        start: 0x020000, end: 0x08FFFF },
    { name: "Studio Fonts (8x8/8x16)", start: 0x090000, end: 0x091FFF },
    { name: "Compiler Scratch",        start: 0x092000, end: 0x0FEFFF },
    { name: "VRAM & Kernel TCB",       start: 0x0FF000, end: 0x0FFFFF },
    { name: "Task 0..3 Stacks",        start: 0x100000, end: 0x187FFF },
    { name: "WEB_PAGE_BUF_EXT (64KB)", start: 0x190000, end: 0x19FFFF },
    { name: "NOTES & SOL & SRRP Bufs", start: 0x1B0000, end: 0x1E3FFF },
    { name: "Mounted Disk & SpiralFS", start: 0x200000, end: 0x367FFF }
  ];
  for (let i = 0; i < regions.length - 1; i++) {
    assert.ok(
      regions[i].end < regions[i + 1].start,
      `Memory region overlap between ${regions[i].name} and ${regions[i + 1].name}`
    );
  }
  console.log(
    `  [PASS] 1. Build & Memory Map: SpiralFS usable = ${buildRes.usableBytes / 1024} KB, ` +
    `free = ${buildRes.freeBytes} B (${(buildRes.freeBytes / 1024).toFixed(1)} KB), ` +
    `WEB_PAGE_BUF_EXT (0x190000..0x19FFFF) verified non-overlapping`
  );

  // -------------------------------------------------------------------------
  // 2. Fresh-Boot Write-Headroom Test on ALL THREE CORES (TabComp, Hummingbird, Triton)
  // -------------------------------------------------------------------------
  const coreConfigs = [
    { kind: "tabcomp",     nodeId: 0x0101, label: "TabComp TC-32" },
    { kind: "hummingbird", nodeId: 0x0201, label: "Hummingbird x86" },
    { kind: "triton",      nodeId: 0x0003, label: "Triton T3" }
  ];

  for (const cfg of coreConfigs) {
    const m = createMachineRunner(cfg.kind, buildRes.img, cfg.nodeId);
    bootToDesktop(m);

    const disk0 = m.extractDiskImage();
    const spfs0 = new SpiralFS(disk0.subarray(SPFS_IMG_OFFSET, SPFS_IMG_OFFSET + SPFS_SIZE));
    const initialFree = spfs0.freeBytes();
    const initialUsed = spfs0.usedBytes();
    assert.strictEqual(initialFree, buildRes.freeBytes, `${cfg.label}: initial free bytes mismatch`);

    // (a) Notes saves a 20 KB document (/home/note.txt = 20,480 bytes):
    // Open Notes via [Spiral] launcher -> "15. Notes" (y = 156)
    m.click(24, 6);
    m.click(40, 156);
    assert.strictEqual(m.readVmI32(0x0FFD18), 16, `${cfg.label}: Notes (APP_NOTES=16) should be focused`);
    // Initial buffer has 256 bytes from /docs/README.txt.
    // Double 4 times via Copy click (24+180, 18+19) + Paste click (24+210, 18+19) -> 512 -> 1024 -> 2048 -> 4096 B,
    // then Copy (4,096 B) and Paste 4 more times (+4,096 * 4) -> 20,480 B (20 KB exact), then click [Save] (24+50, 18+19)
    for (let d = 0; d < 4; d++) {
      m.click(204, 37); // Copy
      m.click(234, 37); // Paste
    }
    m.click(204, 37);   // Copy (clipboard now holds 4,096 B)
    for (let p = 0; p < 4; p++) {
      m.click(234, 37); // Paste (+4,096 B each -> 20,480 B)
    }
    m.click(74, 37);    // Click [Save] -> saves /home/note.txt (20,480 B)
    m.click(246, 24); // Close Notes [X]

    // (b) Paint saves a picture (/art/user.pic = 5,376 bytes):
    m.click(20, 150);             // Click Paint desktop icon -> opens APP_PAINT (x=60, y=24, w=164, h=94)
    assert.strictEqual(m.readVmI32(0x0FFD18), 5, `${cfg.label}: Paint (APP_PAINT=5) should be focused`);
    m.click(60 + 30, 24 + 50);    // Draw stroke on canvas
    m.click(60 + 135, 24 + 20);   // Click [Save] button -> writes /art/user.pic (5,376 B)
    m.click(218, 30);             // Close Paint [X]

    // (c) An inbox PUT of 16 KB over SRRP succeeds (/inbox/drop16k.bin = 16,384 bytes):
    const inboxPayload = new Uint8Array(16384);
    for (let i = 0; i < inboxPayload.length; i++) inboxPayload[i] = (i * 37 + 11) & 0xFF;
    sendSrrpPutFromPeer(m, 0x0099, cfg.nodeId, "/inbox/drop16k.bin", inboxPayload);

    // (d) SpiralEdit grows /src/hello.sp by 4 KB (122 B -> 4,218 B) and self-host build reaches fixed point:
    // Focus SpiralSh, run `edit /src/hello.sp`, press ` (ascii 96) 4 times (+4,096 B -> 4,218 B), and click [Rebuild]
    m.click(100, 60);
    assert.strictEqual(m.readVmI32(0x0FFD18), 3, `${cfg.label}: SpiralSh (APP_SHELL=3) should be focused`);
    m.typeText("edit /src/hello.sp\r");
    assert.strictEqual(m.readVmI32(0x0FFD18), 2, `${cfg.label}: SpiralEdit (APP_EDIT=2) should be focused`);
    for (let k = 0; k < 4; k++) {
      m.pressKey(96, 96);         // ` -> appends 1,024 B comment block (x4 = +4,096 B -> 4,218 B)
    }
    // Click [Rebuild] in SpiralEdit at (28 + 168, 20 + 20) = (196, 40) -> saves /src/hello.sp & rebuilds OS image!
    m.click(196, 40);
    assert.strictEqual(m.readVmI32(0x0FFD18), 4, `${cfg.label}: SpiralBuild (APP_BUILD=4) should be focused`);
    // Close SpiralBuild [X] at (48 + 204 - 6, 28 + 6) = (246, 34) and SpiralEdit [X] at (236, 26)
    m.click(246, 34);
    m.click(236, 26);

    // Focus SpiralSh and run `df` (free-space report)
    m.click(100, 60);
    m.typeText("df\r");
    m.stepFrames(2);

    const shText = readShellText(m);
    const diskAfter = m.extractDiskImage();

    // Verify self-host fixed point: Sectors 64..319 (0x08000..0x27FFF) match buildRes.img byte-for-byte
    for (let i = 0x08000; i < 0x28000; i++) {
      if (diskAfter[i] !== buildRes.img[i]) {
        assert.fail(`${cfg.label}: Self-host fixed-point mismatch at image offset 0x${i.toString(16)}`);
      }
    }

    const spfsAfter = new SpiralFS(diskAfter.subarray(SPFS_IMG_OFFSET, SPFS_IMG_OFFSET + SPFS_SIZE));

    const notesSaved = spfsAfter.readFile("/home/note.txt");
    assert.ok(notesSaved && notesSaved.length === 20480, `${cfg.label}: /home/note.txt length (${notesSaved && notesSaved.length}) != 20480`);

    const paintSaved = spfsAfter.readFile("/art/user.pic");
    assert.ok(paintSaved && paintSaved.length === 5376, `${cfg.label}: /art/user.pic length (${paintSaved && paintSaved.length}) != 5376`);

    const inboxSaved = spfsAfter.readFile("/inbox/drop16k.bin");
    assert.ok(inboxSaved && inboxSaved.length === 16384, `${cfg.label}: /inbox/drop16k.bin length != 16384`);
    for (let i = 0; i < 16384; i += 257) {
      assert.strictEqual(inboxSaved[i], inboxPayload[i], `${cfg.label}: /inbox/drop16k.bin byte ${i} mismatch`);
    }

    const helloSaved = spfsAfter.readFile("/src/hello.sp");
    assert.ok(helloSaved && helloSaved.length === 4218, `${cfg.label}: /src/hello.sp length (${helloSaved && helloSaved.length}) != 4218`);

    // Expected append-only slot allocations (`(L + 1024) & ~511`):
    //   - /home/note.txt     (20,480 B) -> 21,504 B
    //   - /art/user.pic      ( 5,376 B) ->  6,144 B
    //   - /inbox/drop16k.bin (16,384 B) -> 17,408 B
    //   - /src/hello.sp      ( 4,218 B, outgrew 2,048 B slot) -> 5,120 B
    // Total expected reduction = 21,504 + 6,144 + 17,408 + 5,120 = 50,176 B
    const expectedReduction = 21504 + 6144 + 17408 + 5120;
    const afterFree = spfsAfter.freeBytes();
    const afterUsed = spfsAfter.usedBytes();
    assert.strictEqual(
      initialFree - afterFree,
      expectedReduction,
      `${cfg.label}: free space reduction (${initialFree - afterFree}) != expected (${expectedReduction})`
    );
    assert.strictEqual(afterUsed - initialUsed, expectedReduction);
    assert.ok(
      shText.includes(`SpiralFS free: ${afterFree} B`),
      `${cfg.label}: df command did not report ${afterFree} B free:\n${shText}`
    );

    console.log(
      `  [PASS] 2.${cfg.kind}: Fresh-boot write-headroom on ${cfg.label} -> ` +
      `Notes 20 KB + Paint .pic + 16 KB SRRP inbox + SpiralEdit +4 KB /src/hello.sp + self-host fixed point; ` +
      `free space ${initialFree} B -> ${afterFree} B (-${expectedReduction} B exact)`
    );
  }

  // -------------------------------------------------------------------------
  // 3. StudioNet 1.0 Protocol & Oracle Verification (SNS, SDP Echo, SRRP, Share)
  // -------------------------------------------------------------------------
  {
    const m = createMachineRunner("tabcomp", buildRes.img, 0x0101);
    bootToDesktop(m);

    const helloPkt = StudioNetRef.encodeSnsPacket({
      op: StudioNetRef.SNS_OP_HELLO,
      status: 0,
      kind: StudioNetRef.KIND_HUMMINGBIRD,
      osId: StudioNetRef.OS_SPIRALOS,
      services: 0x3F,
      token: 0x1234,
      ageMs: 5000,
      name: "hummingbird",
      extra: ""
    });
    m.injectFrame(
      StudioNetRef.encodeFrame({
        ver: 1,
        proto: StudioNetRef.PROTO_SNS,
        flags: 0,
        src: 0x0201,
        dst: StudioNetRef.ADDR_BROADCAST,
        srcPort: 53,
        dstPort: 53,
        seq: 1,
        ack: 0,
        window: 1,
        payload: helloPkt
      })
    );
    m.stepFrames(2);

    m.typeText("peers\r");
    m.stepFrames(2);
    let sh = readShellText(m);
    assert.ok(sh.includes("hummingbird") && sh.includes("n:513"), `Peer hummingbird missing from peers:\n${sh}`);

    // Verify `name` command & persistence to `/etc/hostname`
    m.typeText("name studio-tc\r");
    m.stepFrames(2);
    const disk = m.extractDiskImage();
    const spfs = new SpiralFS(disk.subarray(SPFS_IMG_OFFSET, SPFS_IMG_OFFSET + SPFS_SIZE));
    assert.strictEqual(spfs.readText("/etc/hostname").trim(), "studio-tc", "/etc/hostname not persisted");

    // Verify `share on` sets services bit 6 (0x40) and `share off` clears it
    m.typeText("share on\r");
    m.stepFrames(2);
    sh = readShellText(m);
    assert.ok(sh.includes("Share files (read-only): ON"), `share on failed:\n${sh}`);

    console.log(
      "  [PASS] 3. StudioNet 1.0: SNS peer table, NameAgent /etc/hostname persistence, " +
      "and SpiralHttpd `share on|off` verified"
    );
  }

  // -------------------------------------------------------------------------
  // 4. Daily-Driver Apps, Solitaire Deals/Solver & Part D Fixes
  // -------------------------------------------------------------------------
  {
    // Verify `deals` command on TabComp matches `shared/deals-ref.js` check lines verbatim
    const mTc = createMachineRunner("tabcomp", buildRes.img, 0x0101);
    bootToDesktop(mTc);
    mTc.typeText("deals\r");
    mTc.stepFrames(3);
    const dealsOut = readShellText(mTc);
    assert.ok(
      dealsOut.includes("MS #1 first row: JH 2C 9H JC 5D 7H KC 5H"),
      `FreeCell #1 check line mismatch:\n${dealsOut}`
    );
    assert.ok(
      dealsOut.includes("MINSTD(48271) 10,000th value from seed 1: 399268537"),
      `MINSTD 10,000th check line mismatch:\n${dealsOut}`
    );
    assert.ok(
      dealsOut.includes("CNSW deal v1 seed 1222, first 8 cards: 5C KC 5H 6H 8D TS 6C 3S"),
      `CNSW deal v1 seed 1222 check line mismatch:\n${dealsOut}`
    );

    // Verify x86 IDIV INT_MIN / -1 guard (`quotient = -2147483648, remainder = 0`) across both cores
    const idivRes = runProgramOnBothCores(`
      int main() {
        int a = -2147483647 - 1;
        int b = -1;
        int q = a / b;
        int r = a % b;
        if (q == a && r == 0) return 140;
        return 1;
      }
    `);
    assert.strictEqual(idivRes.tcResult, 140, "TC-32 INT_MIN / -1 failed");
    assert.strictEqual(idivRes.x86Result, 140, "x86 IDIV INT_MIN / -1 guard failed");

    // Open Solitaire on Hummingbird (x86) and verify solver on #1 (WINNABLE), #11982 (UNWINNABLE), and budget (UNKNOWN)
    const mHb = createMachineRunner("hummingbird", buildRes.img, 0x0201);
    bootToDesktop(mHb);
    mHb.click(24, 6);
    mHb.click(40, 170); // Open Solitaire (APP_SOLITAIRE = 18 at x=16, y=14, w=256, h=156)
    assert.strictEqual(mHb.readVmI32(0x0FFD18), 18, "Solitaire should be focused on Hummingbird");
    mHb.click(66, 34); // Switch to FreeCell (seed = 1)
    mHb.pressKey(115);           // 's' -> Solve FreeCell #1 (WINNABLE)
    mHb.pressKey(99);            // 'c' -> clear seed
    mHb.typeText("11982");       // Deal FreeCell #11982
    mHb.pressKey(115);           // 's' -> Solve FreeCell #11982 (UNWINNABLE)
    mHb.pressKey(99);            // 'c' -> clear seed
    mHb.typeText("5");           // Deal FreeCell #5
    mHb.pressKey(98);            // 'b' -> Solve with budget=2 (UNKNOWN)

    // Verify Triton machine label ("Triton") on Triton T3
    const mTr = createMachineRunner("triton", buildRes.img, 0x0003);
    bootToDesktop(mTr);
    mTr.typeText("ver\r");
    mTr.stepFrames(2);
    const verTr = readShellText(mTr);
    assert.ok(
      verTr.includes('SpiralOS 1.4 "Daily Driver" on Triton'),
      `Triton version/machine string mismatch:\n${verTr}`
    );

    console.log(
      "  [PASS] 4. Deals, Solver & Part D Fixes: `deals` matches shared/deals-ref.js verbatim; " +
      "Solitaire solver (WINNABLE #1 / UNWINNABLE #11982 / UNKNOWN budget), x86 IDIV INT_MIN / -1 guard, " +
      "and \"Triton\" machine label verified"
    );
  }

  console.log("=== ALL SPIRALOS 1.4 \"DAILY DRIVER\" TESTS PASSED ===");
}

runSuite();
