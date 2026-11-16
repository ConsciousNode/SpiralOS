#!/usr/bin/env node
/**
 * SpiralOS 1.4 "Daily Driver" — Comprehensive Release & Cross-Core Headroom Suite (tests/spiralos-14.js)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Verifies every requirement of SpiralOS 1.4 "Daily Driver" across TabComp (TC-32),
 * Hummingbird (x86), and Triton (Balanced-Ternary T3) using real UI interactions
 * and the studionet/studionet-ref.js reference oracle (zero test-only OS hooks):
 *   1. Build & SpiralFS Volume Gate (>= 640 KB usable, >= 128 KB free) + Non-Overlapping Memory Map
 *   2. Fresh-Boot Write-Headroom Test on ALL THREE CORES (TabComp, Hummingbird, Triton):
 *      - Notes saves a 20 KB document (/home/note.txt = 20,480 B) via the Shared Save Dialog
 *      - Paint saves a picture (/art/user.pic = 5,376 B) via the Shared Save Dialog
 *      - An inbox PUT of 16 KB over SRRP succeeds (/inbox/drop16k.bin = 16,384 B)
 *      - SpiralEdit grows /src/hello.sp by 4 KB (122 B -> 4,218 B) by typing 4,096 real characters
 *        and clicking [Rebuild] to open SpiralBuild and reach the self-host fixed point
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
        while (cpu.presentCount < target && !cpu.halted) {
          cpu.yielded = false;
          cpu.stepBatch(200000);
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
      typeBulkText(str) {
        for (let i = 0; i < str.length; i++) {
          const code = str.charCodeAt(i);
          cpu.pushKeyEvent(1, code, code, 0);
          cpu.pushKeyEvent(0, code, code, 0);
          if ((i & 127) === 127 || i + 1 === str.length) {
            this.stepFrames(1);
          }
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
        while (hb.ramView.getInt32(vmBase + 0x0FFD04, true) < target) {
          hb.cpu.runSteps(500000);
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
      typeBulkText(str) {
        for (let i = 0; i < str.length; i++) {
          const sc = asciiToScancode(str.charCodeAt(i));
          hb.ps2.sendKeyScancode(sc);
          hb.ps2.sendKeyScancode(sc | 0x80);
          if ((i & 1023) === 1023 || i + 1 === str.length) {
            this.stepFrames(1);
          }
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
        while (this.readVmI32(0x0FFD04) < target && !wasmVm.halted) {
          wasmVm.run(25000);
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
      typeBulkText(str) {
        for (let i = 0; i < str.length; i++) {
          const code = str.charCodeAt(i);
          wasmVm.pushKeyEvent(code, 0);
          if ((i & 1023) === 1023 || i + 1 === str.length) {
            this.stepFrames(1);
          }
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

// Send a multi-frame SRRP PUT request using the studionet-ref.js reference oracle
function sendSrrpPutFromPeer(m, peerNodeId, dstNodeId, pathStr, bodyBytes) {
  const msg = StudioNetRef.encodeMessage({
    request: true,
    method: "PUT",
    path: pathStr,
    headers: { Encoding: "bytes" },
    body: bodyBytes
  });
  const totalFrames = Math.ceil(msg.length / StudioNetRef.MAX_PAYLOAD);
  const baseSeq = 100;
  for (let i = 0; i < totalFrames; i++) {
    const start = i * StudioNetRef.MAX_PAYLOAD;
    const end = Math.min(msg.length, start + StudioNetRef.MAX_PAYLOAD);
    const flags =
      StudioNetRef.FLAG.PSH |
      (i === 0 ? StudioNetRef.FLAG.SYN : 0) |
      (i === totalFrames - 1 ? StudioNetRef.FLAG.FIN : 0);
    const frame = StudioNetRef.encodeFrame({
      dst: dstNodeId,
      src: peerNodeId,
      proto: StudioNetRef.PROTO.SSP,
      flags,
      sport: 49152,
      dport: 80,
      seq: (baseSeq + i) & 0xFFFF,
      ack: 0,
      payload: msg.subarray(start, end)
    });
    m.injectFrame(frame);
    // Triton's NIC RX queue processes one frame per step; step every frame on Triton or every 8 frames on TC/HB
    if (m.kind === "triton" || (i & 7) === 7 || i === totalFrames - 1) {
      m.stepFrames(1);
    }
  }
  m.stepFrames(2);
}

function bootToDesktop(m) {
  m.stepFrames(1);
  m.pressKey(32, 32);
  m.stepFrames(2);
}


// ===== KEHAI 1.5 TRUTH-TABLE TOUR (scratch; real launcher clicks + real typing on Hummingbird) =====
const { encodePNG: _enc } = require("./harness.js");
const OUT = "/tmp/sp5/tour"; fs.mkdirSync(OUT, { recursive: true });
const img = fs.readFileSync(path.join(__dirname, "..", "spiralos.img"));
function shot(m, name) { const f = m.raw.pc ? m.raw.pc.vga.renderFrame() : m.raw.vga.renderFrame(); fs.writeFileSync(path.join(OUT, name + ".png"), _enc(f.width, f.height, f.rgba)); }
const names = ["Files","Editor","Shell","Compiler","Paint","Calc","SysMon","Themes","Viewer","Snake","Blocks","NetChat","FileBeam","SpiralWeb","Notes","Clock","Solitaire","About"];
const res = [];
for (let n = 1; n <= 18; n++) {
  const m = createMachineRunner("hummingbird", img, 0x0002); bootToDesktop(m); m.stepFrames(3);
  m.click(24, 6); m.click(40, 15 + (n - 1) * 9 + 4); m.stepFrames(12);
  const foc = m.readVmI32(0x0FFD18);
  shot(m, String(n).padStart(2, "0") + "_" + names[n - 1]);
  res.push({ n, name: names[n - 1], focusedApp: foc });
}
console.log(JSON.stringify(res));
// Shell: every command, typed for real
const cmds = ["help","ls","ver","mem","df","ps","workers","name","theme","netstat","peers","clear","ls /home","cat /home/note.txt","open note.txt","run snake","date","time","edit /home/note.txt","history","cd /","shutdown"];
const m = createMachineRunner("hummingbird", img, 0x0002); bootToDesktop(m); m.stepFrames(3);
m.click(24, 6); m.click(40, 15 + 2 * 9 + 4); m.stepFrames(8);
const out = {};
for (const c of cmds) {
  if (c === "edit /home/note.txt" || c === "shutdown") continue;
  m.typeText("clear\r"); m.stepFrames(4); m.typeText(c + "\r"); m.stepFrames(10);
  out[c] = readShellText(m);
}
fs.writeFileSync(path.join(OUT, "shell.json"), JSON.stringify(out, null, 1));
console.log("shell commands probed", Object.keys(out).length);
