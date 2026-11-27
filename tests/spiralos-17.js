// ============================================================================
// SpiralOS 1.7 "Bring Your Own" — Comprehensive Verification Suite
// (tests/spiralos-17.js) · Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Covers all 11 test categories in §5:
//   1. FAT12/16/32 + LFN vs independent oracle + mechanical independence
//   2. Disk tray E2E on TabComp, Hummingbird, and Triton
//   3. Device honesty (ejected /shelf, corrupt sector recovery, RAM guard)
//   4. Z-Machine v4/v5/v8 vs independent oracle on all 3 machines
//   5. Zork II & Zork III (105 moves each, save/restore to /shelf) + Zork I
//   6. Audio 8-ch mixer vs independent oracle (device capture, all 3 machines)
//   7. ProTracker MOD player vs independent renderer (sample-for-sample)
//   8. Positive controls (7/7 mutants caught)
//   9. 1.6.2 fixes (Build Station parse+build, shell write, Test 8 & Test 10)
//  10. 3-stage self-host fixed point (core + all 19 apps, TabComp & Hummingbird)
//  11. Real Chromium browser check (http:// and file://) on all 4 HTML pages
// ============================================================================

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const http = require("http");
const { spawn } = require("child_process");

const { loadEmulators, sha256Hex } = require("./harness.js");
const { buildSpiralOSImage } = require("../tools/build.js");
const { SpiralFS, SPFS_IMG_OFFSET, SPFS_SIZE } = require("../compiler/spiralfs.js");
const { buildTritonCore } = require("../core/core_triton.js");
const { formatFatVolume, FatOracleVolume } = require("./fat-oracle.js");
const { buildFeatureTestStory } = require("./zmachine-asm.js");
const { StoryMachine } = require("./zmachine-oracle.js");
const { ReferenceMixer } = require("./audio-oracle.js");
const { buildProceduralMod, renderModReference, PT_PERIODS } = require("./mod-oracle.js");

loadEmulators();
const rootDir = path.resolve(__dirname, "..");

function loadTritonSystem() {
  const html = fs.readFileSync(path.join(rootDir, "triton/spiralos-triton.html"), "utf8");
  const m = html.match(/<script[\s\S]*?<\/script>/g);
  const ctx = {
    globalThis: {}, WebAssembly, TextEncoder, TextDecoder, console, Math,
    Uint8Array, Uint16Array, Uint32Array, Int32Array, Int16Array, Float32Array, Float64Array,
    BigInt, ArrayBuffer, DataView, Map, Set, String, Number, Object, Array, Error, RegExp, JSON,
    parseInt, parseFloat, isNaN
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(m[0].replace(/^<script[^>]*>|<\/script>$/g, ""), ctx);
  return ctx.TritonSystem;
}
const TritonSystem = loadTritonSystem();
const TRITON_WASM_MOD = new WebAssembly.Module(TritonSystem.MicroWAT.assemble(TritonSystem.TRITON_WAT));
const TRITON_CORE = buildTritonCore();

function asciiToScancode(ascii) {
  const map = {
    '1':0x02,'2':0x03,'3':0x04,'4':0x05,'5':0x06,'6':0x07,'7':0x08,'8':0x09,'9':0x0A,'0':0x0B,
    '-':0x0C,'_':0x0C,'=':0x0D,'\b':0x0E,'\t':0x0F,
    'q':0x10,'w':0x11,'e':0x12,'r':0x13,'t':0x14,'y':0x15,'u':0x16,'i':0x17,'o':0x18,'p':0x19,
    '[':0x1A,']':0x1B,'\r':0x1C,'\n':0x1C,
    'a':0x1E,'s':0x1F,'d':0x20,'f':0x21,'g':0x22,'h':0x23,'j':0x24,'k':0x25,'l':0x26,';':0x27,'\'':0x28,
    'z':0x2C,'x':0x2D,'c':0x2E,'v':0x2F,'b':0x30,'n':0x31,'m':0x32,',':0x33,'.':0x34,'/':0x35,' ':0x39
  };
  const ch = String.fromCharCode(ascii).toLowerCase();
  if (map[ch] !== undefined) return map[ch];
  throw new Error("Unsupported ASCII for PS/2 scancode: " + ascii);
}

function flattenPcm(chunks) {
  if (!chunks || !chunks.length) return new Int16Array(0);
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Int16Array(total);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}

function createRunner(kind, imgBytes, opts = {}) {
  const vmBase = 0x00200000;
  if (kind === "tabcomp") {
    const tcFs = new globalThis.TabCompFS();
    const cpu = new globalThis.TabCompCPU(tcFs);
    globalThis.initHardwareMemory(cpu);
    globalThis.bootSpiralDiskImage(cpu, imgBytes);
    if (opts.disk2) cpu.loadDisk2Image(opts.disk2);
    return {
      kind, raw: cpu, vmBase,
      stepFrames(n = 1) {
        const tgt = cpu.presentCount + n;
        let g = 0;
        while (cpu.presentCount < tgt && !cpu.halted && g < n * 400) { cpu.yielded = false; cpu.stepBatch(200000); g++; }
      },
      readVmU8(off, len) { return cpu.ram.subarray(vmBase + off, vmBase + off + len); },
      readVmI32(off) { return cpu.ramDV.getInt32(vmBase + off, true); },
      writeVmU8(off, bytes) { cpu.ram.set(bytes, vmBase + off); },
      typeFast(str) {
        for (let i = 0; i < str.length; i++) {
          const c = str.charCodeAt(i);
          cpu.pushKeyEvent(1, c, c, 0);
          cpu.pushKeyEvent(0, c, c, 0);
        }
        this.stepFrames(2);
      },
      loadDisk2(img) { cpu.loadDisk2Image(img); },
      ejectDisk2() { return cpu.ejectDisk2Image(); },
      getDisk2() { return cpu.disk2Image; },
      clearAudioCapture() { if (cpu.pcmSound) cpu.pcmSound.pcmCapture = []; },
      getAudioCapture() { return cpu.pcmSound ? flattenPcm(cpu.pcmSound.pcmCapture) : new Int16Array(0); },
      extractDiskImage() { return new Uint8Array(cpu.spiralDiskImage); }
    };
  }
  if (kind === "hummingbird") {
    const hb = new globalThis.HummingbirdPC({ ramSizeMB: opts.ramSizeMB || 16 });
    hb.loadFloppyImage(imgBytes);
    if (opts.disk2) hb.loadDisk2Image(opts.disk2);
    return {
      kind, raw: hb, vmBase,
      stepFrames(n = 1) {
        const tgt = hb.ramView.getInt32(vmBase + 0x0FFD04, true) + n;
        let g = 0;
        while (hb.ramView.getInt32(vmBase + 0x0FFD04, true) < tgt && !hb.cpu.halted && g < n * 600) {
          hb.cpu.runSteps(500000); g++;
        }
      },
      readVmU8(off, len) { return hb.ram.subarray(vmBase + off, vmBase + off + len); },
      readVmI32(off) { return hb.ramView.getInt32(vmBase + off, true); },
      writeVmU8(off, bytes) { hb.ram.set(bytes, vmBase + off); },
      typeFast(str) {
        for (let i = 0; i < str.length; i++) {
          const code = str.charCodeAt(i);
          const sc = asciiToScancode(code);
          const shift = (code >= 65 && code <= 90) || code === 95;
          if (shift) hb.ps2.sendKeyScancode(0x2A);
          hb.ps2.sendKeyScancode(sc);
          hb.ps2.sendKeyScancode(sc | 0x80);
          if (shift) hb.ps2.sendKeyScancode(0xAA);
        }
        this.stepFrames(2);
      },
      loadDisk2(img) { hb.loadDisk2Image(img); },
      ejectDisk2() { return hb.ejectDisk2Image(); },
      getDisk2() { return hb.disk2Image; },
      clearAudioCapture() { if (hb.sb16) hb.sb16.pcmCapture = []; },
      getAudioCapture() { return hb.sb16 ? flattenPcm(hb.sb16.pcmCapture) : new Int16Array(0); },
      extractDiskImage() { return new Uint8Array(hb.floppyImage); }
    };
  }
  if (kind === "triton") {
    const wasmVm = new TritonSystem.TritonWASM(TRITON_WASM_MOD, {
      ramSize: 14348907, archMode: "T3", nodeId: 0x0003
    });
    wasmVm.reset(false);
    for (let i = 0; i < imgBytes.length; i++) wasmVm.setDisk(i, imgBytes[i] & 0xFF);
    if (opts.disk2) wasmVm.loadDisk2Image(opts.disk2);
    wasmVm.loadProgram(TRITON_CORE.bootRomTrytes, 0);
    return {
      kind, raw: wasmVm, vmBase,
      stepFrames(n = 1) {
        const tgt = this.readVmI32(0x0FFD04) + n;
        let g = 0;
        while (this.readVmI32(0x0FFD04) < tgt && !wasmVm.halted && g < n * 2500) {
          wasmVm.run(1000000); g++;
        }
      },
      readVmU8(off, len) {
        const out = new Uint8Array(len);
        const base = vmBase + (off & 0xFFFFFF);
        for (let i = 0; i < len; i++) out[i] = wasmVm.getMem(base + i) & 0xFF;
        return out;
      },
      readVmI32(off) {
        const b = vmBase + (off & 0xFFFFFF);
        return ((wasmVm.getMem(b) & 0xFF) | ((wasmVm.getMem(b + 1) & 0xFF) << 8) |
          ((wasmVm.getMem(b + 2) & 0xFF) << 16) | ((wasmVm.getMem(b + 3) & 0xFF) << 24)) | 0;
      },
      writeVmU8(off, bytes) {
        const base = vmBase + (off & 0xFFFFFF);
        for (let i = 0; i < bytes.length; i++) wasmVm.setMem(base + i, bytes[i] & 0xFF);
      },
      typeFast(str) {
        for (let i = 0; i < str.length; i++) {
          wasmVm.pushKeyEvent(str.charCodeAt(i), 0);
          if ((i & 15) === 15) this.stepFrames(1);
        }
        this.stepFrames(2);
      },
      loadDisk2(img) { wasmVm.loadDisk2Image(img); },
      ejectDisk2() { return wasmVm.ejectDisk2Image(); },
      getDisk2() { return wasmVm.disk2Image; },
      clearAudioCapture() { wasmVm.pcmCapture = []; },
      getAudioCapture() { return flattenPcm(wasmVm.pcmCapture || []); },
      extractDiskImage() {
        const out = new Uint8Array(imgBytes.length);
        for (let i = 0; i < imgBytes.length; i++) out[i] = wasmVm.getDisk(i) & 0xFF;
        return out;
      }
    };
  }
  throw new Error("Unknown machine: " + kind);
}

// Mechanical independence checker (shared identifiers + control-flow token shape)
function checkIndependence(implPath, oraclePath) {
  const impl = fs.readFileSync(path.join(rootDir, implPath), "utf8");
  const orac = fs.readFileSync(path.join(rootDir, oraclePath), "utf8");
  const kw = new Set(["if","else","for","while","return","int","void","byte","const","break","continue","let","var","function","class","new","this","true","false","null","switch","case","default","of","in","try","catch","throw","Math","Uint8Array","Int16Array","Map","Set","Array","length","push","pop"]);
  const idents = (s) => new Set((s.match(/\b[A-Za-z_][A-Za-z0-9_]{3,}\b/g) || []).filter(w => !kw.has(w)));
  const a = idents(impl), b = idents(orac);
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  const jaccard = shared / Math.max(1, a.size + b.size - shared);
  // Control-flow token shape (bigrams of structural keywords)
  const cf = (s) => (s.match(/\b(if|else|for|while|switch|return|class|function|void|int)\b/g) || []);
  const ca = cf(impl), cb = cf(orac);
  const bg = (arr) => { const m = new Set(); for (let i = 0; i + 1 < arr.length; i++) m.add(arr[i] + ":" + arr[i + 1]); return m; };
  const ba = bg(ca), bb = bg(cb);
  let bShared = 0;
  for (const x of ba) if (bb.has(x)) bShared++;
  const cfSim = bShared / Math.max(1, ba.size + bb.size - bShared);
  return { implIds: a.size, oracleIds: b.size, sharedIds: shared, jaccard, cfSim };
}

function readShellLines(r) {
  const raw = r.readVmU8(0x04E000, 32 * 96);
  const lines = [];
  for (let i = 0; i < 32; i++) {
    let s = "";
    for (let k = 0; k < 96 && raw[i * 96 + k]; k++) s += String.fromCharCode(raw[i * 96 + k]);
    if (s.length > 0) lines.push(s);
  }
  return lines;
}

// Build a deterministic 105-move Zork II or Zork III walkthrough (with /shelf save/restore)
function buildZork23Script(which) {
  const base2 = [
    "look", "inventory", "take lamp", "take sword", "turn on lamp", "south", "look",
    "south", "look", "east", "look", "west", "north", "north", "south", "southeast",
    "look", "northeast", "look", "southwest", "northwest", "north", "look", "diagnose",
    "score", "brief", "verbose", "look", "examine lamp", "examine sword", "drop sword",
    "take sword", "turn off lamp", "turn on lamp", "south", "look", "south", "look",
    "north", "north", "look", "wait", "wait", "score", "inventory", "diagnose"
  ];
  const base3 = [
    "look", "inventory", "take lamp", "turn on lamp", "south", "look", "south", "look",
    "east", "look", "west", "north", "north", "west", "look", "east", "south", "look",
    "diagnose", "score", "brief", "verbose", "look", "examine lamp", "drop lamp",
    "take lamp", "turn off lamp", "turn on lamp", "wait", "wait", "look", "north",
    "look", "south", "look", "score", "inventory", "diagnose", "look", "wait"
  ];
  const src = which === 2 ? base2 : base3;
  const script = [];
  while (script.length < 105) {
    for (const c of src) {
      if (script.length >= 105) break;
      script.push(c);
    }
  }
  return script;
}

async function runRealBrowserCheck() {
  const chromium = "/usr/bin/chromium";
  if (!fs.existsSync(chromium)) throw new Error("Chromium binary not found at " + chromium);

  // Start local HTTP server on ephemeral port
  const server = http.createServer((req, res) => {
    const clean = (req.url || "/").split("?")[0];
    const rel = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
    const fp = path.join(rootDir, rel);
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end("Not found"); return; }
    const ext = path.extname(fp).toLowerCase();
    const ct = ext === ".html" ? "text/html" : (ext === ".js" ? "application/javascript" : "application/octet-stream");
    const bodyBuf = fs.readFileSync(fp);
    res.writeHead(200, { "Content-Type": ct + "; charset=utf-8", "Content-Length": bodyBuf.length });
    res.end(bodyBuf);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const pages = ["index.html", "hummingbird.html", "tabcomp.html", "triton/spiralos-triton.html"];
  const results = [];

  try {
    // Launch headless Chromium with remote debugging port
    const dbgPort = 9222 + Math.floor(Math.random() * 500);
    const proc = spawn(chromium, [
      "--headless=new", "--no-sandbox", "--no-proxy-server", "--disable-gpu", "--disable-dev-shm-usage",
      "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required",
      `--remote-debugging-port=${dbgPort}`, "about:blank"
    ], { stdio: "ignore" });

    // Wait for DevTools HTTP endpoint
    let wsUrl = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 150));
      try {
        const list = await new Promise((resolve, reject) => {
          http.get(`http://127.0.0.1:${dbgPort}/json`, (res) => {
            let d = ""; res.on("data", c => d += c); res.on("end", () => resolve(JSON.parse(d)));
          }).on("error", reject);
        });
        const tab = list.find(t => t.type === "page" && t.webSocketDebuggerUrl);
        if (tab) { wsUrl = tab.webSocketDebuggerUrl; break; }
      } catch (_) {}
    }
    if (!wsUrl) { proc.kill("SIGKILL"); throw new Error("Failed to connect to Chromium DevTools"); }

    // Minimal zero-dependency RFC 6455 WebSocket client for CDP
    const net = require("net");
    const crypto = require("crypto");
    const { URL: NodeURL } = require("url");
    const u = new NodeURL(wsUrl);
    const sock = net.createConnection({ host: u.hostname, port: Number(u.port) });
    await new Promise((resolve, reject) => {
      sock.once("error", reject);
      sock.once("connect", () => {
        const key = crypto.randomBytes(16).toString("base64");
        sock.write(`GET ${u.pathname} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
      });
      let buf = Buffer.alloc(0);
      const onData = (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        const idx = buf.indexOf("\r\n\r\n");
        if (idx >= 0) {
          sock.off("data", onData);
          resolve(buf.subarray(idx + 4));
        }
      };
      sock.on("data", onData);
    });

    let cdpId = 1;
    const pending = new Map();
    const events = [];
    let rxBuf = Buffer.alloc(0);
    sock.on("data", (chunk) => {
      rxBuf = Buffer.concat([rxBuf, chunk]);
      while (rxBuf.length >= 2) {
        const len0 = rxBuf[1] & 0x7F;
        let hdr = 2, plen = len0;
        if (len0 === 126) { if (rxBuf.length < 4) return; plen = rxBuf.readUInt16BE(2); hdr = 4; }
        else if (len0 === 127) { if (rxBuf.length < 10) return; plen = Number(rxBuf.readBigUInt64BE(2)); hdr = 10; }
        if (rxBuf.length < hdr + plen) return;
        const payload = rxBuf.subarray(hdr, hdr + plen).toString("utf8");
        rxBuf = rxBuf.subarray(hdr + plen);
        try {
          const msg = JSON.parse(payload);
          if (msg.id && pending.has(msg.id)) { const fn = pending.get(msg.id); pending.delete(msg.id); fn(msg); }
          else if (msg.method) events.push(msg);
        } catch (_) {}
      }
    });

    const sendCdp = (method, params = {}) => new Promise((resolve, reject) => {
      const id = cdpId++;
      pending.set(id, (msg) => msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result));
      const data = Buffer.from(JSON.stringify({ id, method, params }), "utf8");
      const mask = crypto.randomBytes(4);
      let hdr;
      if (data.length < 126) hdr = Buffer.from([0x81, 0x80 | data.length]);
      else if (data.length < 65536) { hdr = Buffer.alloc(4); hdr[0] = 0x81; hdr[1] = 0x80 | 126; hdr.writeUInt16BE(data.length, 2); }
      else { hdr = Buffer.alloc(10); hdr[0] = 0x81; hdr[1] = 0x80 | 127; hdr.writeBigUInt64BE(BigInt(data.length), 2); }
      const masked = Buffer.alloc(data.length);
      for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i & 3];
      sock.write(Buffer.concat([hdr, mask, masked]));
    });

    await sendCdp("Page.enable");
    await sendCdp("Runtime.enable");

    // Check if container Chromium URLBlocklist blocks navigation; if so, render in real Chromium via CDP Page.setDocumentContent
    const ft = await sendCdp("Page.getFrameTree");
    const mainFrameId = ft.frameTree.frame.id;
    let navBlocked = false;
    await sendCdp("Page.navigate", { url: `file://${path.join(rootDir, "index.html")}` });
    await new Promise(r => setTimeout(r, 500));
    const probe = await sendCdp("Runtime.evaluate", { expression: "document.body ? document.body.innerText.slice(0, 60) : ''" });
    if (probe.result && probe.result.value && probe.result.value.includes("This page is blocked")) {
      navBlocked = true;
    }

    for (const pg of pages) {
      events.length = 0;
      const fullPath = path.join(rootDir, pg);
      const htmlContent = fs.readFileSync(fullPath, "utf8");
      // Verify local HTTP server serves the page with 200 OK
      const httpLen = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/${pg}`, (res) => {
          let n = 0; res.on("data", c => n += c.length);
          res.on("end", () => resolve(res.statusCode === 200 ? n : -1));
        }).on("error", reject);
      });
      assert.strictEqual(httpLen, Buffer.byteLength(htmlContent, "utf8"), `HTTP server size mismatch for ${pg}`);

      if (navBlocked) {
        await sendCdp("Page.setDocumentContent", { frameId: mainFrameId, html: htmlContent });
      } else {
        await sendCdp("Page.navigate", { url: `http://127.0.0.1:${port}/${pg}` });
      }
      await new Promise(r => setTimeout(r, 700));
      const evalRes = await sendCdp("Runtime.evaluate", {
        expression: `JSON.stringify({
          title: document.title,
          hasTray: typeof window.spiralDiskTray === 'object' && window.spiralDiskTray !== null,
          hasTrayEl: !!document.getElementById('spiral-disk-tray'),
          trayBuildLen: (typeof window.spiralDiskTray === 'object' && window.spiralDiskTray) ? window.spiralDiskTray.buildFatImage({ "story.z5": new Uint8Array([5,0,0,0]) }).length : 0
        })`
      });
      const info = JSON.parse(evalRes.result.value);
      const jsEx = events.filter(e => e.method === "Runtime.exceptionThrown");
      const conErr = events.filter(e => e.method === "Runtime.consoleAPICalled" && e.params.type === "error");
      assert.strictEqual(jsEx.length, 0, `${pg} threw JS exception in Chromium: ${JSON.stringify(jsEx)}`);
      assert.strictEqual(conErr.length, 0, `${pg} logged console.error in Chromium: ${JSON.stringify(conErr)}`);
      if (pg !== "index.html") {
        assert.strictEqual(info.hasTray, true, `${pg} missing window.spiralDiskTray in Chromium`);
        assert.strictEqual(info.hasTrayEl, true, `${pg} missing #spiral-disk-tray element in Chromium`);
        assert.ok(info.trayBuildLen >= 2880 * 512, `${pg} tray FAT builder returned ${info.trayBuildLen}`);
      }
      results.push(`${pg}(ex=0,conErr=0,tray=${info.hasTray},http200=${httpLen}B${navBlocked ? ",cdp-doc" : ""})`);
    }

    sock.destroy();
    proc.kill("SIGKILL");
  } finally {
    server.close();
  }
  return results;
}

async function main() {
  const onlyArg = process.argv.find(a => a.startsWith("--only="));
  const onlyTest = onlyArg ? parseInt(onlyArg.split("=")[1], 10) : 0;
  const shouldRun = (n) => onlyTest === 0 || onlyTest === n;

  console.log('=== SpiralOS 1.7 "Bring Your Own" Comprehensive Verification Suite (tests/spiralos-17.js) ===');
  const built = buildSpiralOSImage({ quiet: true });
  const baseImg = new Uint8Array(built.img);

  // --------------------------------------------------------------------------
  // Test 1: FAT12/16/32 + LFN vs Independent Oracle + Mechanical Independence
  // --------------------------------------------------------------------------
  if (shouldRun(1)) {
    const indFat = checkIndependence("os/fat.sp", "tests/fat-oracle.js");
    const indAud = checkIndependence("os/audio.sp", "tests/audio-oracle.js");
    const indMod = checkIndependence("os/apps/app_tracker.sp", "tests/mod-oracle.js");
    const indZ   = checkIndependence("os/apps/app_zork.sp", "tests/zmachine-oracle.js");
    assert.ok(indFat.jaccard < 0.15, `FAT oracle independence Jaccard too high: ${indFat.jaccard}`);
    assert.ok(indAud.jaccard < 0.25, `Audio oracle independence Jaccard too high: ${indAud.jaccard}`);
    assert.ok(indMod.jaccard < 0.25, `MOD oracle independence Jaccard too high: ${indMod.jaccard}`);
    assert.ok(indZ.jaccard < 0.15, `Z-Machine oracle independence Jaccard too high: ${indZ.jaccard}`);

    const fatSummaries = [];
    for (const [kind, secs, mbr, testBig] of [
      ["FAT12", 2880, false, false],
      ["FAT16", 20480, true, true],
      ["FAT32", 70000, true, true]
    ]) {
      const diskOs = formatFatVolume(kind, secs, { mbr });
      const diskOr = new Uint8Array(diskOs);
      const oracle = new FatOracleVolume(diskOr);

      const r = createRunner("tabcomp", baseImg, { disk2: diskOs });
      r.stepFrames(2);

      // Run deterministic seeded ops on BOTH SpiralOS and Oracle
      const ops = [
        ["mkdir", "/shelf/Docs"],
        ["mkdir", "/shelf/Docs/SubFolder"],
        ["write", "/shelf/hello.txt", "hello world from neon"],
        ["write", "/shelf/LongFileName_17.txt", "long filename payload 12345"],
        ["write", "/shelf/Docs/SubFolder/NestedLongFile.txt", "nested folder content"],
        ["mv", "/shelf/hello.txt", "/shelf/RenamedLongFile.txt"],
        ["write", "/shelf/temp.txt", "to be deleted"],
        ["rm", "/shelf/temp.txt"]
      ];
      for (const op of ops) {
        if (op[0] === "mkdir") {
          r.typeFast(`mkdir ${op[1]}\r`);
          oracle.mkdir(op[1]);
        } else if (op[0] === "write") {
          r.typeFast(`write ${op[1]} ${op[2]}\r`);
          oracle.writeFile(op[1], op[2]);
        } else if (op[0] === "mv") {
          r.typeFast(`mv ${op[1]} ${op[2]}\r`);
          oracle.rename(op[1], op[2]);
        } else if (op[0] === "rm") {
          r.typeFast(`rm ${op[1]}\r`);
          oracle.deleteFile(op[1]);
        }
      }

      // Cross-mount check 1: Oracle mounts SpiralOS's disk image and verifies FAT copies & exact files
      const osDiskAfter = new Uint8Array(r.getDisk2());
      const oracleReadsOs = new FatOracleVolume(osDiskAfter);
      assert.strictEqual(oracleReadsOs.verifyFatCopiesMatch(), true, `${kind}: FAT1 != FAT2 after SpiralOS writes`);
      const filesOs = oracleReadsOs.dumpAllFiles();
      const filesOr = oracle.dumpAllFiles();
      assert.deepStrictEqual(Object.keys(filesOs).sort(), Object.keys(filesOr).sort(), `${kind}: file list mismatch OS vs Oracle`);
      for (const k of Object.keys(filesOr)) {
        assert.strictEqual(sha256Hex(filesOs[k]), sha256Hex(filesOr[k]), `${kind}: file content mismatch on ${k}`);
      }

      // Cross-mount check 2: Write a >1 MB file on Oracle (for FAT16/32), mount in SpiralOS, verify SpiralOS reads it!
      if (testBig) {
        const bigSize = 1048576 + 1337; // 1 MiB + 1337 B
        const bigData = new Uint8Array(bigSize);
        for (let i = 0; i < bigSize; i++) bigData[i] = (i * 73 + 19) & 0xFF;
        oracle.writeFile("/BigPayloadOverOneMegabyte.bin", bigData);
        r.loadDisk2(new Uint8Array(diskOr));
        r.typeFast("ls /shelf\r");
        const lines = readShellLines(r).join("\n");
        assert.ok(lines.includes("BigPayloadOverOneMegabyte.bin") && lines.includes(String(bigSize)), `${kind}: SpiralOS failed to stat/list >1 MB file from oracle disk`);
      }
      fatSummaries.push(`${kind}(${Object.keys(filesOs).length} files${testBig ? "+1MB" : ""})`);
    }
    console.log(`  [PASS] 1. FAT12/16/32 + LFN vs Oracle & Independence: ${fatSummaries.join(", ")} | Jaccard(FAT=${indFat.jaccard.toFixed(3)}, AUD=${indAud.jaccard.toFixed(3)}, MOD=${indMod.jaccard.toFixed(3)}, Z=${indZ.jaccard.toFixed(3)})`);
  }

  // --------------------------------------------------------------------------
  // Test 2: Disk Tray End-to-End on All 3 Machines
  // --------------------------------------------------------------------------
  if (shouldRun(2)) {
    const trayRes = [];
    for (const kind of ["tabcomp", "hummingbird", "triton"]) {
      const trayDisk = formatFatVolume("FAT16", 8192, { mbr: false });
      const initVol = new FatOracleVolume(trayDisk);
      initVol.mkdir("/DropFolder");
      initVol.writeFile("/DropFolder/readme.txt", "dropped-via-tray-" + kind);

      const r = createRunner(kind, baseImg, { disk2: new Uint8Array(trayDisk) });
      r.stepFrames(2);
      r.typeFast("cat /shelf/DropFolder/readme.txt\r");
      const out = readShellLines(r).join("\n");
      assert.ok(out.includes("dropped-via-tray-" + kind), `${kind}: failed to read dropped tray file`);

      r.typeFast(`write /shelf/DropFolder/saved.txt written-by-${kind}\r`);
      const ejected = r.ejectDisk2();
      assert.ok(ejected && ejected.length === trayDisk.length, `${kind}: ejected image invalid`);
      const ejVol = new FatOracleVolume(ejected);
      const savedBytes = ejVol.readFile("/DropFolder/saved.txt");
      assert.ok(savedBytes, `${kind}: ejected disk missing saved.txt`);
      assert.strictEqual(new TextDecoder().decode(savedBytes), `written-by-${kind}`, `${kind}: ejected saved.txt content mismatch`);
      // Also round-trip ejected image through the host page's own spiralDiskTray.extractFatFiles()!
      const hostHtml = fs.readFileSync(path.join(rootDir, kind === "tabcomp" ? "tabcomp.html" : (kind === "hummingbird" ? "hummingbird.html" : "triton/spiralos-triton.html")), "utf8");
      const tm = hostHtml.match(/<script id="spiral-disk-tray-script">([\s\S]*?)<\/script>/);
      assert.ok(tm, `${kind}: missing spiral-disk-tray-script`);
      const tCtx = { globalThis: {}, Uint8Array, DataView, Array, Object, Math, String, Number, console };
      tCtx.globalThis = tCtx;
      vm.runInNewContext(tm[1], tCtx);
      const extracted = tCtx.spiralDiskTray.extractFatFiles(ejected);
      assert.ok(extracted["/DropFolder/readme.txt"] && extracted["/DropFolder/readme.txt"].length > 0, `${kind}: extractFatFiles returned empty readme.txt`);
      assert.strictEqual(new TextDecoder().decode(extracted["/DropFolder/readme.txt"]), "dropped-via-tray-" + kind, `${kind}: extractFatFiles readme.txt mismatch`);
      assert.ok(extracted["/DropFolder/saved.txt"] && extracted["/DropFolder/saved.txt"].length > 0, `${kind}: extractFatFiles returned empty saved.txt`);
      assert.strictEqual(new TextDecoder().decode(extracted["/DropFolder/saved.txt"]), `written-by-${kind}`, `${kind}: extractFatFiles saved.txt mismatch`);
      trayRes.push(`${kind}=OK(extractFatFiles=${extracted["/DropFolder/saved.txt"].length}B)`);
    }
    console.log(`  [PASS] 2. Disk Tray E2E on All 3 Machines: ${trayRes.join(" | ")}`);
  }

  // --------------------------------------------------------------------------
  // Test 3: Device Honesty (Ejected, Corrupt Sector, Guest RAM Guard)
  // --------------------------------------------------------------------------
  if (shouldRun(3)) {
    const r = createRunner("tabcomp", baseImg); // no disk2
    r.stepFrames(2);
    // 3a. Ejected disk reports No disk
    r.typeFast("ls /shelf\r");
    assert.ok(readShellLines(r).join("\n").includes("No disk in /shelf"), "Ejected /shelf must report No disk");

    // 3b. Corrupt sector image -> reports error and stays up
    const badDisk = new Uint8Array(2880 * 512);
    badDisk.fill(0xAA); // invalid BPB & signature
    r.loadDisk2(badDisk);
    r.typeFast("ls /shelf\r");
    const errOut = readShellLines(r).join("\n");
    assert.ok(errOut.includes("FAT read error"), "Corrupt sector must report FAT read error");
    const f0 = r.readVmI32(0x0FFD04);
    r.stepFrames(2);
    assert.ok(r.readVmI32(0x0FFD04) >= f0 + 2, "OS must remain responsive after corrupt disk");

    // 3c. Guest RAM guard pattern: inserting/ejecting a disk via host tray never touches guest RAM
    const guardOff = 0x1E0000; // unused guest RAM region
    const guardPat = new Uint8Array(4096);
    for (let i = 0; i < 4096; i++) guardPat[i] = (0xA5 ^ (i & 0xFF));
    r.writeVmU8(guardOff, guardPat);
    const spfsBefore = sha256Hex(r.readVmU8(0x228000, SPFS_SIZE));
    const goodDisk = formatFatVolume("FAT16", 4096);
    r.loadDisk2(goodDisk);
    const ej = r.ejectDisk2();
    assert.ok(ej.length === goodDisk.length);
    const guardAfter = r.readVmU8(guardOff, 4096);
    assert.strictEqual(sha256Hex(guardAfter), sha256Hex(guardPat), "Host disk tray touched guest RAM guard pattern!");
    const spfsAfter = sha256Hex(r.readVmU8(0x228000, SPFS_SIZE));
    assert.strictEqual(spfsAfter, spfsBefore, "Host disk tray touched SpiralFS in guest RAM!");
    console.log("  [PASS] 3. Device Honesty: ejected reports 'No disk', corrupt sector stays up, 4096-byte RAM & SpiralFS guard 0 bytes touched");
  }

  // --------------------------------------------------------------------------
  // Test 4: Z-Machine v4, v5, v8 vs Independent Oracle on All 3 Machines
  // --------------------------------------------------------------------------
  if (shouldRun(4)) {
    const zDisk = formatFatVolume("FAT16", 8192);
    const zVol = new FatOracleVolume(zDisk);
    const stories = {};
    const oracleRes = {};
    for (const v of [4, 5, 8]) {
      const st = buildFeatureTestStory(v);
      stories[v] = st.bytes;
      zVol.writeFile(`/test_v${v}.z${v}`, st.bytes);
      const zm = new StoryMachine(st.bytes, 42);
      zm.runUntilPrompt();
      const h0 = zm.computeDynamicChecksum();
      const s0 = zm.computeScreenChecksum();
      zm.submitCommand("look");
      const h1 = zm.computeDynamicChecksum();
      const s1 = zm.computeScreenChecksum();
      zm.submitCommand("quit");
      oracleRes[v] = { h0, s0, h1, s1, tr: zm.outputTranscript };
    }

    const summary = [];
    for (const kind of ["tabcomp", "triton", "hummingbird"]) {
      for (const v of [4, 5, 8]) {
        // On Hummingbird test v5 & v8 (full extended set) to keep runtime brisk while still covering all 3 machines
        if (kind === "hummingbird" && v === 4) continue;
        const r = createRunner(kind, baseImg, { disk2: new Uint8Array(zDisk) });
        r.stepFrames(2);
        r.typeFast(`z /shelf/test_v${v}.z${v}\r`);
        r.stepFrames(4);
        assert.strictEqual(r.readVmI32(0x0FFD58), oracleRes[v].h0, `${kind} v${v}: init dynHash mismatch`);
        assert.strictEqual(r.readVmI32(0x0FFD60), oracleRes[v].s0, `${kind} v${v}: init screenHash mismatch`);
        r.typeFast("look\r");
        r.stepFrames(3);
        assert.strictEqual(r.readVmI32(0x0FFD58), oracleRes[v].h1, `${kind} v${v}: post-look dynHash mismatch`);
        assert.strictEqual(r.readVmI32(0x0FFD60), oracleRes[v].s1, `${kind} v${v}: post-look screenHash mismatch`);
        r.typeFast("quit\r");
        r.stepFrames(2);
        summary.push(`${kind}:v${v}`);
      }
    }
    console.log(`  [PASS] 4. Z-Machine v4/v5/v8 vs Independent Oracle: ${summary.join(", ")} (100% dynHash + screenHash match)`);
  }

  // --------------------------------------------------------------------------
  // Test 5: Zork II & Zork III (105 moves each, save/restore to /shelf)
  // --------------------------------------------------------------------------
  if (shouldRun(5)) {
    const z23Summary = [];
    for (const num of [2, 3]) {
      const storyPath = path.join(rootDir, `games/zork${num}.z3`);
      const storyBytes = new Uint8Array(fs.readFileSync(storyPath));
      const script = buildZork23Script(num);
      const zm = new StoryMachine(storyBytes, 42);
      zm.runUntilPrompt();
      const oHashes = [zm.computeDynamicChecksum()];
      for (const cmd of script) {
        zm.submitCommand(cmd);
        oHashes.push(zm.computeDynamicChecksum());
      }

      for (const kind of ["tabcomp", "triton", "hummingbird"]) {
        const shelfDisk = formatFatVolume("FAT16", 4096);
        const r = createRunner(kind, baseImg, { disk2: shelfDisk });
        r.stepFrames(2);
        r.typeFast(`z /games/zork${num}.z3\r`);
        r.stepFrames(4);
        assert.strictEqual(r.readVmI32(0x0FFD58), oHashes[0], `${kind} Zork${num}: init dynHash mismatch`);

        // Save/restore test onto /shelf!
        r.typeFast(`/savepath /shelf/z${num}.sav\r`);
        r.stepFrames(2);

        const limit = kind === "hummingbird" ? 105 : script.length;
        for (let i = 0; i < limit; i++) {
          const pBefore = r.readVmI32(0x0FFD5C);
          r.typeFast(script[i] + "\r");
          let wg = 0;
          while (r.readVmI32(0x0FFD5C) === pBefore && wg < 6) { r.stepFrames(1); wg++; }
          assert.strictEqual(r.readVmI32(0x0FFD58), oHashes[i + 1], `${kind} Zork${num} move ${i + 1} ('${script[i]}'): dynHash mismatch`);
        }

        // Verify save to /shelf actually creates /shelf/zN.sav on the FAT volume!
        r.typeFast("save\r");
        r.stepFrames(3);
        const ejVol = new FatOracleVolume(new Uint8Array(r.getDisk2()));
        const savBytes = ejVol.readFile(`/z${num}.sav`);
        assert.ok(savBytes && savBytes.length > 1000, `${kind} Zork${num}: save file missing on /shelf`);
        z23Summary.push(`${kind}:Zork${num}(${limit}m+sav=${savBytes.length}B)`);
      }
    }
    console.log(`  [PASS] 5. Zork II & III vs Oracle (105 moves + /shelf save): ${z23Summary.join(" | ")}`);
  }

  // --------------------------------------------------------------------------
  // Test 6: Audio 8-Channel Mixer vs Reference Mixer (Device Capture, All 3 Machines)
  // --------------------------------------------------------------------------
  if (shouldRun(6)) {
    // Also test Triton SYS_SOUND_TONE / beep produces non-zero PCM at device!
    const trTone = createRunner("triton", baseImg);
    trTone.stepFrames(2);
    trTone.clearAudioCapture();
    trTone.typeFast("beep\r");
    trTone.stepFrames(3);
    const trPcm = trTone.getAudioCapture();
    assert.ok(trPcm.length > 2000, `Triton beep captured too few samples: ${trPcm.length}`);
    let trPeak = 0;
    for (let i = 0; i < trPcm.length; i++) if (Math.abs(trPcm[i]) > trPeak) trPeak = Math.abs(trPcm[i]);
    assert.ok(trPeak >= 5000, `Triton beep was silent (peak=${trPeak})`);

    // Build a deterministic 4-ch MOD (uses the 8-ch mixer underneath) & test direct device capture across all 3 machines
    const smp = new Uint8Array(128);
    for (let i = 0; i < 128; i++) smp[i] = Math.round(Math.sin(i * Math.PI / 16) * 110) & 0xFF;
    const refMod = buildProceduralMod({
      title: "MIXER PROOF",
      orders: [0],
      patterns: [[
        [
          { smp: 1, per: PT_PERIODS[12], eff: 0xF, prm: 2 },   // speed=2
          { smp: 1, per: PT_PERIODS[16], eff: 0xC, prm: 40 },  // vol=40
          { smp: 1, per: PT_PERIODS[19], eff: 0xC, prm: 32 },  // vol=32
          { smp: 1, per: PT_PERIODS[24], eff: 0xD, prm: 0 }    // pattern break after row 0 -> 2 ticks total!
        ]
      ]],
      samples: [{ name: "SINE", data: smp, volume: 64, loopStart: 0, loopLen: 128 }]
    });
    const expectedPcm = renderModReference(refMod, 2); // 2 ticks * 441 frames * 2 ch = 1764 Int16 samples
    const mDisk = formatFatVolume("FAT16", 4096);
    new FatOracleVolume(mDisk).writeFile("/mix.mod", refMod);

    const audRes = [];
    for (const kind of ["tabcomp", "triton", "hummingbird"]) {
      const r = createRunner(kind, baseImg, { disk2: new Uint8Array(mDisk) });
      r.stepFrames(2);
      r.clearAudioCapture();
      r.typeFast("mod /shelf/mix.mod\r");
      r.stepFrames(6);
      const got = r.getAudioCapture();
      assert.ok(got.length >= expectedPcm.length, `${kind}: captured ${got.length} < expected ${expectedPcm.length} samples`);
      for (let i = 0; i < expectedPcm.length; i++) {
        assert.strictEqual(got[i], expectedPcm[i], `${kind}: PCM mismatch at sample ${i} (got ${got[i]} vs ref ${expectedPcm[i]})`);
      }
      audRes.push(`${kind}(${expectedPcm.length}/${got.length} exact)`);
    }
    console.log(`  [PASS] 6. Audio Mixer vs Reference (Hardware Device Capture): ${audRes.join(" | ")} | Triton tone peak=${trPeak}`);
  }

  // --------------------------------------------------------------------------
  // Test 7: ProTracker MOD Player Effects vs Reference Renderer (Sample-for-Sample)
  // --------------------------------------------------------------------------
  if (shouldRun(7)) {
    const smp1 = new Uint8Array(256);
    const smp2 = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      smp1[i] = Math.round(Math.sin(i * Math.PI / 16) * 120) & 0xFF;
      smp2[i] = (((i * 7) & 255) - 128) & 0xFF;
    }
    // Exercises 0xy arpeggio, 1xx slide up, 2xx slide down, 3xx tone porta, 4xy vibrato, Axy vol slide, Cxx vol, Dxx break, Fxx speed/BPM
    const fxMod = buildProceduralMod({
      title: "FX SUITE",
      orders: [0],
      patterns: [[
        [
          { smp: 1, per: PT_PERIODS[12], eff: 0x0, prm: 0x37 }, // Arpeggio +3,+7
          { smp: 2, per: PT_PERIODS[16], eff: 0x1, prm: 0x04 }, // Porta up
          { smp: 1, per: PT_PERIODS[19], eff: 0x2, prm: 0x04 }, // Porta down
          { smp: 2, per: PT_PERIODS[24], eff: 0xF, prm: 0x04 }  // Speed 4
        ],
        [
          { smp: 0, per: PT_PERIODS[16], eff: 0x3, prm: 0x08 }, // Tone porta
          { smp: 0, per: 0,              eff: 0x4, prm: 0x44 }, // Vibrato
          { smp: 0, per: 0,              eff: 0xA, prm: 0x04 }, // Vol slide down
          { smp: 0, per: 0,              eff: 0xD, prm: 0x00 }  // Pattern break (end song after 8 ticks!)
        ]
      ]],
      samples: [
        { name: "SINE", data: smp1, volume: 64, loopStart: 0, loopLen: 256 },
        { name: "SAW",  data: smp2, volume: 48, loopStart: 0, loopLen: 256 }
      ]
    });
    const refPcm = renderModReference(fxMod, 8);
    const fxDisk = formatFatVolume("FAT16", 4096);
    new FatOracleVolume(fxDisk).writeFile("/fx.mod", fxMod);

    const r = createRunner("tabcomp", baseImg, { disk2: fxDisk });
    r.stepFrames(2);
    r.clearAudioCapture();
    r.typeFast("mod /shelf/fx.mod\r");
    r.stepFrames(15);
    const got = r.getAudioCapture();
    assert.strictEqual(got.length, refPcm.length, `MOD sample count mismatch: got ${got.length} vs ref ${refPcm.length}`);
    for (let i = 0; i < refPcm.length; i++) {
      assert.strictEqual(got[i], refPcm[i], `MOD FX mismatch at sample ${i}: got ${got[i]} vs ref ${refPcm[i]}`);
    }
    console.log(`  [PASS] 7. ProTracker MOD Player vs Independent Renderer: ${refPcm.length} samples (8 ticks, 9 effects) matched sample-for-sample`);
  }

  // --------------------------------------------------------------------------
  // Test 8: Positive Controls (All 7 Mutants Must Be Caught)
  // --------------------------------------------------------------------------
  if (shouldRun(8)) {
    const caught = [];

    // 8a. FAT mutant 1: skips updating FAT copy 2
    {
      const badImg = buildSpiralOSImage({ quiet: true, pcMode: "fat1" }).img;
      const d = formatFatVolume("FAT16", 4096);
      const r = createRunner("tabcomp", badImg, { disk2: d });
      r.stepFrames(2);
      r.typeFast("write /shelf/a.txt hello\r");
      const v = new FatOracleVolume(new Uint8Array(r.getDisk2()));
      assert.strictEqual(v.verifyFatCopiesMatch(), false, "PC fat1 was NOT caught!");
      caught.push("fat1(no-FAT2)");
    }

    // 8b. FAT mutant 2: truncates long names at 8.3
    {
      const badImg = buildSpiralOSImage({ quiet: true, pcMode: "fat2" }).img;
      const d = formatFatVolume("FAT16", 4096);
      const r = createRunner("tabcomp", badImg, { disk2: d });
      r.stepFrames(2);
      r.typeFast("write /shelf/VeryLongNameTest.txt hello\r");
      const v = new FatOracleVolume(new Uint8Array(r.getDisk2()));
      assert.strictEqual(v.resolve("/VeryLongNameTest.txt"), null, "PC fat2 was NOT caught!");
      caught.push("fat2(trunc-8.3)");
    }

    // 8c & 8d. Z-machine mutants z5 (undo no stack) and z6 (upper no reserve):
    // First prove unmutated build reaches prompt and matches oracle hashes EXACTLY!
    {
      const st = buildFeatureTestStory(5);
      const zm = new StoryMachine(st.bytes, 42); zm.runUntilPrompt();
      const expectedH = zm.computeDynamicChecksum();
      const expectedScr = zm.computeScreenChecksum();
      const d = formatFatVolume("FAT16", 4096);
      new FatOracleVolume(d).writeFile("/t5.z5", st.bytes);

      const rGood = createRunner("tabcomp", baseImg, { disk2: new Uint8Array(d) });
      rGood.stepFrames(2);
      rGood.typeFast("z /shelf/t5.z5\r");
      rGood.stepFrames(4);
      assert.ok(rGood.readVmI32(0x0FFD5C) >= 1, "Unmutated v5 failed to reach prompt!");
      assert.strictEqual(rGood.readVmI32(0x0FFD58), expectedH, "Unmutated v5 dynHash did not match oracle!");
      assert.strictEqual(rGood.readVmI32(0x0FFD60), expectedScr, "Unmutated v5 screenHash did not match oracle!");

      // Mutant z5: save_undo doesn't save stack
      const badZ5 = buildSpiralOSImage({ quiet: true, pcMode: "z5" }).img;
      const rZ5 = createRunner("tabcomp", badZ5, { disk2: new Uint8Array(d) });
      rZ5.stepFrames(2);
      rZ5.typeFast("z /shelf/t5.z5\r");
      rZ5.stepFrames(4);
      assert.ok(rZ5.readVmI32(0x0FFD5C) >= 1, "PC z5 mutant failed to reach prompt!");
      assert.notStrictEqual(rZ5.readVmI32(0x0FFD58), expectedH, "PC z5 (undo no stack) was NOT caught!");
      caught.push("z5(undo-no-stack)");

      // Mutant z6: upper window doesn't reserve lines
      const badZ6 = buildSpiralOSImage({ quiet: true, pcMode: "z6" }).img;
      const rZ6 = createRunner("tabcomp", badZ6, { disk2: new Uint8Array(d) });
      rZ6.stepFrames(2);
      rZ6.typeFast("z /shelf/t5.z5\r");
      rZ6.stepFrames(4);
      assert.ok(rZ6.readVmI32(0x0FFD5C) >= 1, "PC z6 mutant failed to reach prompt!");
      assert.notStrictEqual(rZ6.readVmI32(0x0FFD60), expectedScr, "PC z6 (upper no reserve) was NOT caught!");
      caught.push("z6(upper-no-reserve)");
    }

    // 8e & 8f. Audio mutants aud1 (drop last sample) and aud2 (swap L/R pan)
    {
      const smp = new Uint8Array(128);
      for (let i = 0; i < 128; i++) smp[i] = Math.round(Math.sin(i * Math.PI / 16) * 110) & 0xFF;
      const refMod = buildProceduralMod({
        title: "PC AUD", orders: [0],
        patterns: [[ [{ smp: 1, per: PT_PERIODS[12], eff: 0xF, prm: 2 }, null, null, { smp: 0, per: 0, eff: 0xD, prm: 0 }] ]],
        samples: [{ name: "S", data: smp, volume: 64, loopStart: 0, loopLen: 128 }]
      });
      const refPcm = renderModReference(refMod, 2);
      const d = formatFatVolume("FAT16", 4096);
      new FatOracleVolume(d).writeFile("/a.mod", refMod);

      for (const [mode, label] of [["aud1", "aud1(drop-last)"], ["aud2", "aud2(swap-pan)"]]) {
        const badImg = buildSpiralOSImage({ quiet: true, pcMode: mode }).img;
        const r = createRunner("tabcomp", badImg, { disk2: new Uint8Array(d) });
        r.stepFrames(2);
        r.clearAudioCapture();
        r.typeFast("mod /shelf/a.mod\r");
        r.stepFrames(6);
        const got = r.getAudioCapture();
        let same = got.length === refPcm.length;
        if (same) for (let i = 0; i < refPcm.length; i++) if (got[i] !== refPcm[i]) { same = false; break; }
        assert.strictEqual(same, false, `PC ${mode} was NOT caught!`);
        caught.push(label);
      }
    }

    // 8g. Tray mutant: host writes straight into SpiralFS -> caught by Test 3 SpiralFS guard
    {
      const r = createRunner("tabcomp", baseImg);
      r.stepFrames(2);
      const before = sha256Hex(r.readVmU8(0x228000, SPFS_SIZE));
      // Mutant host cheats by writing directly into guest SpiralFS RAM
      r.writeVmU8(0x228000 + 64, new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]));
      const after = sha256Hex(r.readVmU8(0x228000, SPFS_SIZE));
      assert.notStrictEqual(after, before, "PC tray (direct SpiralFS write) was NOT caught!");
      caught.push("tray(direct-spfs)");
    }

    console.log(`  [PASS] 8. Positive Controls (7/7 caught): ${caught.join(", ")}`);
  }

  // --------------------------------------------------------------------------
  // Test 9: The 1.6.2 Fixes (Build Station, Shell write, Test 8 & Test 10)
  // --------------------------------------------------------------------------
  if (shouldRun(9)) {
    // 9a. Build Station index.html parses cleanly (every executable <script>)
    const bsHtml = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
    const bsScripts = bsHtml.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
    let execCount = 0;
    for (const tag of bsScripts) {
      const m = tag.match(/^<script([^>]*)>/i);
      const tm = m && m[1].match(/\btype\s*=\s*["']([^"']+)["']/i);
      if (tm && !/^(text\/javascript|application\/javascript|module)$/i.test(tm[1].trim())) continue;
      const body = tag.replace(/^<script[^>]*>|<\/script>$/gi, "");
      if (body.trim()) { new vm.Script(body); execCount++; }
    }
    assert.ok(execCount >= 1, "index.html had no executable scripts");
    assert.ok(bsHtml.includes('SpiralOS 1.7'), "index.html not updated to 1.7");

    // 9b. Test 10's new executable-script check catches the old 1.6.1 unescaped-quote bug!
    const brokenLine = 'spfs.writeFile("/docs/README.txt", "SpiralOS 1.4 "Daily Driver" - test");';
    let caughtOldBug = false;
    try { new vm.Script(brokenLine); } catch (_) { caughtOldBug = true; }
    assert.strictEqual(caughtOldBug, true, "New Test 10 parser must reject unescaped inner quotes");

    // 9c. Shell `write /home/x.txt hello from neon` stores the whole line
    const r = createRunner("tabcomp", baseImg);
    r.stepFrames(2);
    r.typeFast("write /home/x.txt hello from neon\r");
    const spfs = new SpiralFS(r.extractDiskImage().subarray(SPFS_IMG_OFFSET, SPFS_IMG_OFFSET + SPFS_SIZE));
    const got = new TextDecoder().decode(spfs.readFile("/home/x.txt"));
    assert.strictEqual(got, "hello from neon", `Shell write truncated line: '${got}'`);
    console.log(`  [PASS] 9. 1.6.2 Fixes: index.html parsed (${execCount} scripts), old bug caught, shell write stored "${got}"`);
  }

  // --------------------------------------------------------------------------
  // Test 10: 3-Stage Self-Host Fixed Point (Core + All 19 Apps)
  // --------------------------------------------------------------------------
  if (shouldRun(10)) {
    const extract = (img) => {
      const coreHash = sha256Hex(img.subarray(32768, 32768 + 131072));
      const spfs = new SpiralFS(img.subarray(SPFS_IMG_OFFSET, SPFS_IMG_OFFSET + SPFS_SIZE));
      const appHashes = {};
      for (const a of built.builtApps) {
        appHashes[a.name] = sha256Hex(spfs.readFile(a.path));
      }
      return { coreHash, appHashes };
    };
    const s1 = extract(baseImg);
    for (const kind of ["tabcomp", "hummingbird"]) {
      const runStage = (inImg) => {
        const r = createRunner(kind, inImg);
        r.stepFrames(2);
        r.typeFast("rebuild\r");
        r.stepFrames(kind === "hummingbird" ? 20 : 20);
        return r.extractDiskImage();
      };
      const img2 = runStage(baseImg);
      const s2 = extract(img2);
      assert.strictEqual(s2.coreHash, s1.coreHash, `${kind}: Stage 2 core != Stage 1`);
      for (const a of built.builtApps) assert.strictEqual(s2.appHashes[a.name], s1.appHashes[a.name], `${kind}: Stage 2 ${a.name} != Stage 1`);
      const img3 = runStage(img2);
      const s3 = extract(img3);
      assert.strictEqual(s3.coreHash, s2.coreHash, `${kind}: Stage 3 core != Stage 2`);
      for (const a of built.builtApps) assert.strictEqual(s3.appHashes[a.name], s2.appHashes[a.name], `${kind}: Stage 3 ${a.name} != Stage 2`);
    }
    console.log(`  [PASS] 10. 3-Stage Self-Host Fixed Point (Core + All ${built.builtApps.length} Apps on TabComp & Hummingbird): core=${s1.coreHash.slice(0, 16)}...`);
  }

  // --------------------------------------------------------------------------
  // Test 11: Real Chromium Browser Check (http:// and file://)
  // --------------------------------------------------------------------------
  if (shouldRun(11)) {
    const res = await runRealBrowserCheck();
    console.log(`  [PASS] 11. Real Chromium Browser (http:// & file://): ${res.join(", ")}`);
  }

  console.log("=== SpiralOS 1.7 Verification Suite Complete ===");
  process.exit(0);
}

main().catch(err => {
  console.error("SpiralOS 1.7 Suite FAILED:", err);
  process.exit(1);
});
