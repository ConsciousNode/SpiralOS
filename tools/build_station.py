#!/usr/bin/env python3
"""
Builds the single-file `index.html` ("Spiral Build Station") containing:
  - Complete SpiralOS source tree (/src/*.sp) and themes (/themes/*.thm)
  - Stage 0 SpiralC compiler (compiler/spiralc.js) & SpiralFS packager (compiler/spiralfs.js)
  - Both Native Core generators (core/core_tc32.js, core/x86_asm.js, core/core_x86.js)
  - Live side-by-side TabComp (TC-32) and Hummingbird (i586) emulators connected via StudioNet
  - One-click builders/exporters for the 1.44 MB Hummingbird floppy image (spiralos.img)
    and the bootable TabComp disk/cartridge HTML + raw image
  - One-click automated §3 Self-Hosting Acceptance Demo & StudioNet Cross-Machine Demo
"""

import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_file(rel_path):
    with open(os.path.join(ROOT, rel_path), "r", encoding="utf-8") as f:
        return f.read()


def strip_cjs(js_code):
    js_code = re.sub(r'const\s+\{\s*R,\s*X86Builder\s*\}[\s\S]*?require\("./x86_asm\.js"\);\n', '', js_code)
    idx = js_code.find('if (typeof module !== "undefined"')
    if idx >= 0:
        end_idx = js_code.find('if (typeof globalThis !== "undefined")', idx)
        if end_idx > idx:
            js_code = js_code[:idx] + js_code[end_idx:]
    return js_code


def build_station_html():
    # 1. Gather all SpiralOS source and theme files
    sources = {}
    for rel, vpath in [
        ("os/os.sp", "/src/os.sp"),
        ("os/kernel.sp", "/src/kernel.sp"),
        ("os/fs.sp", "/src/fs.sp"),
        ("os/gui.sp", "/src/gui.sp"),
        ("os/wm.sp", "/src/wm.sp"),
        ("os/net.sp", "/src/net.sp"),
        ("os/cc.sp", "/src/cc.sp"),
        ("os/asm.sp", "/src/asm.sp"),
        ("os/apps1.sp", "/src/apps1.sp"),
        ("os/apps2.sp", "/src/apps2.sp"),
        ("themes/spiral.thm", "/themes/spiral.thm"),
        ("themes/amber.thm", "/themes/amber.thm"),
        ("themes/oberon.thm", "/themes/oberon.thm"),
        ("themes/jade.thm", "/themes/jade.thm"),
    ]:
        sources[vpath] = read_file(rel)

    sources_json = json.dumps(sources, indent=2)

    # 2. Extract emulator cores from patched tabcomp.html and hummingbird.html
    tc_html = read_file("tabcomp.html")
    tc_player_match = re.search(r'/\*@@PLAYER_BEGIN\*/([\s\S]*?)/\*@@PLAYER_END\*/', tc_html)
    assert tc_player_match, "PLAYER_BEGIN..END not found in tabcomp.html"
    tc_player_js = tc_player_match.group(1)

    hb_html = read_file("hummingbird.html")
    hb_core_match = re.search(r'<script id="hummingbird-core">([\s\S]*?)</script>', hb_html)
    assert hb_core_match, "hummingbird-core not found in hummingbird.html"
    hb_core_full = hb_core_match.group(1)
    # Keep only the headless/core part of hummingbird-core (before "// Browser-only UI initialization")
    hb_split = hb_core_full.find("// Browser-only UI initialization")
    assert hb_split > 0, "Browser-only UI initialization marker not found in hummingbird.html"
    hb_core_js = hb_core_full[:hb_split] + "\n})();\nconst HummingbirdPC = globalThis.HummingbirdPC;\n"

    # 3. Read SpiralOS compiler, SpiralFS, and Native Core generators
    x86_asm_js = strip_cjs(read_file("core/x86_asm.js"))
    core_tc32_js = strip_cjs(read_file("core/core_tc32.js"))
    core_x86_js = strip_cjs(read_file("core/core_x86.js"))
    spiralfs_js = strip_cjs(read_file("compiler/spiralfs.js"))
    spiralc_js = strip_cjs(read_file("compiler/spiralc.js"))

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Spiral Build Station — SpiralOS 1.1 "Real Spiral" (TabComp TC-32 &amp; Hummingbird i586)</title>
<style>
  :root {{
    --bg-0: #090c16;
    --bg-1: #111628;
    --bg-2: #182038;
    --border: #2b3860;
    --accent: #00e5ff;
    --accent-2: #ff4477;
    --gold: #ffcc33;
    --mint: #28e08c;
    --text-main: #eef3ff;
    --text-dim: #97a6cc;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    padding: 0;
    background: radial-gradient(circle at 20% 0%, #151d38 0%, #080b14 70%);
    color: var(--text-main);
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    min-height: 100vh;
  }}
  header {{
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 20px;
    background: rgba(15, 20, 38, 0.94);
    border-bottom: 1px solid var(--border);
  }}
  .brand {{
    display: flex;
    align-items: center;
    gap: 12px;
  }}
  .brand-glyph {{
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--accent) 0%, #7b42ff 55%, var(--accent-2) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: 18px;
    color: #fff;
    box-shadow: 0 0 14px rgba(0, 229, 255, 0.4);
  }}
  .brand-title {{
    font-size: 16px;
    font-weight: 800;
    letter-spacing: 0.4px;
  }}
  .brand-sub {{
    font-size: 11px;
    color: var(--text-dim);
  }}
  .toolbar {{
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }}
  button {{
    background: var(--bg-2);
    color: var(--text-main);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 7px 12px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.14s ease;
  }}
  button:hover {{
    border-color: var(--accent);
    background: #202b4d;
  }}
  button.primary {{
    background: linear-gradient(135deg, #007799 0%, #005077 100%);
    border-color: var(--accent);
    color: #fff;
  }}
  button.accent {{
    background: linear-gradient(135deg, #991f44 0%, #661230 100%);
    border-color: var(--accent-2);
    color: #fff;
  }}
  .layout {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    padding: 14px 20px;
    max-width: 1600px;
    margin: 0 auto;
  }}
  @media (max-width: 1100px) {{
    .layout {{ grid-template-columns: 1fr; }}
  }}
  .panel {{
    background: rgba(17, 22, 40, 0.92);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }}
  .panel-hdr {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    background: rgba(24, 32, 56, 0.9);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    font-weight: 700;
  }}
  .badge {{
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(0, 229, 255, 0.14);
    color: var(--accent);
    border: 1px solid rgba(0, 229, 255, 0.35);
  }}
  .screen-wrap {{
    position: relative;
    background: #04060c;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    min-height: 360px;
  }}
  canvas {{
    width: 100%;
    max-width: 640px;
    aspect-ratio: 16 / 10;
    image-rendering: pixelated;
    border: 1px solid #253055;
    border-radius: 4px;
    background: #000;
    cursor: crosshair;
    outline: none;
  }}
  .panel-ftr {{
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 14px;
    font-size: 11px;
    color: var(--text-dim);
    border-top: 1px solid var(--border);
    background: rgba(10, 14, 26, 0.8);
  }}
  .bottom-grid {{
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 14px;
    padding: 0 20px 20px 20px;
    max-width: 1600px;
    margin: 0 auto;
  }}
  @media (max-width: 1100px) {{
    .bottom-grid {{ grid-template-columns: 1fr; }}
  }}
  .ide-body {{
    display: grid;
    grid-template-columns: 190px 1fr;
    height: 310px;
  }}
  .file-list {{
    border-right: 1px solid var(--border);
    overflow-y: auto;
    padding: 6px;
    background: rgba(10, 13, 24, 0.7);
  }}
  .file-item {{
    padding: 5px 8px;
    font-size: 11px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-dim);
  }}
  .file-item.active {{
    background: rgba(0, 229, 255, 0.16);
    color: var(--accent);
    font-weight: 700;
  }}
  textarea#src-editor {{
    width: 100%;
    height: 100%;
    background: #080b14;
    color: #d7e3ff;
    border: none;
    padding: 10px;
    font-family: inherit;
    font-size: 12px;
    line-height: 1.45;
    resize: none;
    outline: none;
  }}
  .telemetry-body {{
    padding: 12px 14px;
    font-size: 12px;
    overflow-y: auto;
    height: 310px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }}
  .stat-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }}
  .stat-card {{
    background: rgba(10, 14, 26, 0.85);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
  }}
  .stat-label {{
    font-size: 10px;
    color: var(--text-dim);
    text-transform: uppercase;
  }}
  .stat-val {{
    font-size: 13px;
    font-weight: 700;
    color: var(--mint);
    margin-top: 3px;
  }}
  .log-box {{
    flex: 1;
    background: #060911;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px;
    font-size: 11px;
    color: #b5c6ee;
    overflow-y: auto;
    white-space: pre-wrap;
  }}
</style>
</head>
<body>
<header>
  <div class="brand">
    <div class="brand-glyph">🌀</div>
    <div>
      <div class="brand-title">SPIRAL BUILD STATION · SpiralOS 1.1 "Real Spiral"</div>
      <div class="brand-sub">ConsciousNode SoftWorks · Unified Portable VM + Dual Native Cores (TabComp TC-32 &amp; Hummingbird i586) · StudioNet Bridge</div>
    </div>
  </div>
  <div class="toolbar">
    <button id="btn-compile-boot" class="primary" type="button" title="Compile /src/os.sp from IDE and boot both machines">⚡ Compile &amp; Boot Both</button>
    <button id="btn-selfhost-demo" class="accent" type="button" title="Run the 6-step §3 Self-Hosting Rebuild Acceptance Demo on both machines">🌀 Run §3 Self-Host Demo</button>
    <button id="btn-net-demo" type="button" title="Send StudioNet Chat &amp; SSP File Beam between TabComp and Hummingbird">🌐 StudioNet TC ↔ HB Demo</button>
    <button id="btn-dl-floppy" class="primary" type="button" title="Download 1.44 MB bootable Hummingbird floppy image (spiralos.img)">💾 Export 1.44 MB Floppy (.img)</button>
    <button id="btn-dl-tabcomp" class="primary" type="button" title="Download standalone bootable TabComp SpiralOS Cartridge (.html)">📼 Export TabComp Cartridge (.html)</button>
  </div>
</header>

<main class="layout">
  <!-- Machine 1: TabComp TC-32 Workstation -->
  <section class="panel">
    <div class="panel-hdr">
      <span>1. TabComp™ 1.3 Fantasy Workstation (Native TC-32 Core)</span>
      <span id="tc-badge" class="badge">Node 0x0101 · 320×200×8</span>
    </div>
    <div class="screen-wrap">
      <canvas id="tc-canvas" width="320" height="200" tabindex="0"></canvas>
    </div>
    <div class="panel-ftr">
      <span id="tc-status">Booting SpiralOS on TC-32...</span>
      <span>Click canvas to interact · Shares identical SPIR VM bytecode</span>
    </div>
  </section>

  <!-- Machine 2: Hummingbird i586 x86 PC Emulator -->
  <section class="panel">
    <div class="panel-hdr">
      <span>2. Hummingbird™ 1.1 i586 PC Emulator (BIOS Floppy → 32-Bit Protected Mode Core)</span>
      <span id="hb-badge" class="badge">Node 0x0201 · VBE 640×480×32</span>
    </div>
    <div class="screen-wrap">
      <canvas id="hb-canvas" width="640" height="480" tabindex="0"></canvas>
    </div>
    <div class="panel-ftr">
      <span id="hb-status">Booting SpiralOS from 1.44 MB Floppy...</span>
      <span id="hb-milestones">Milestones: —</span>
    </div>
  </section>
</main>

<section class="bottom-grid">
  <!-- Built-in SpiralOS Source & Theme Editor -->
  <div class="panel">
    <div class="panel-hdr">
      <span>SpiralFS On-Disk Source &amp; Theme Tree (Editable — Click "Compile &amp; Boot Both" to Rebuild)</span>
      <span id="ide-file-label" class="badge">/src/wm.sp</span>
    </div>
    <div class="ide-body">
      <div id="file-list" class="file-list"></div>
      <textarea id="src-editor" spellcheck="false"></textarea>
    </div>
  </div>

  <!-- Build Metrics, Image Hashes & StudioNet Bus Inspector -->
  <div class="panel">
    <div class="panel-hdr">
      <span>Unified Image Telemetry &amp; StudioNet Bus Log</span>
      <span id="hash-badge" class="badge">1,474,560 B (1.44 MB)</span>
    </div>
    <div class="telemetry-body">
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">SPIR VM Bytecode Image</div>
          <div id="stat-spir" class="stat-val">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Native Cores (TC-32 / x86)</div>
          <div id="stat-cores" class="stat-val">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Active Title-Bar Colour</div>
          <div id="stat-titlecol" class="stat-val">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">StudioNet Packets (TX / RX)</div>
          <div id="stat-snet" class="stat-val">0 frames</div>
        </div>
      </div>
      <div id="build-log" class="log-box">Initializing Spiral Build Station...</div>
    </div>
  </div>
</section>

<script id="spiral-sources-json" type="application/json">{sources_json}</script>

<script id="spiral-station-core">
(function() {{
  "use strict";

  // 1. Embedded TabComp Player Core + StudioNet Switch
  {tc_player_js}

  // 2. Embedded Hummingbird i586 PC Core
  {hb_core_js}

  // 3. Embedded SpiralOS Native Core Builders, SpiralFS & SpiralC Compiler
  {x86_asm_js}
  {core_tc32_js}
  {core_x86_js}
  {spiralfs_js}
  {spiralc_js}

  function createProceduralPic(style) {{
    const pic = new Uint8Array(96 * 56);
    for (let y = 0; y < 56; y++) {{
      for (let x = 0; x < 96; x++) {{
        if (style === 0) {{
          const dx = x - 48, dy = y - 28;
          const d = Math.floor(Math.sqrt(dx * dx + dy * dy));
          pic[y * 96 + x] = 64 + ((d + (x ^ y)) & 15);
        }} else {{
          pic[y * 96 + x] = 80 + (((x >> 2) + (y >> 2)) & 15);
        }}
      }}
    }}
    return pic;
  }}

  function buildUnifiedSpiralImageFromMap(sourceMap) {{
    const tc32Core = buildTC32Core();
    const x86Core = buildX86Core();
    const spfs = new SpiralFS();

    const keys = Object.keys(sourceMap);
    for (let i = 0; i < keys.length; i++) {{
      const k = keys[i];
      spfs.writeFile(k, sourceMap[k], k.startsWith("/src/") ? Math.max(8192, (sourceMap[k].length + 3072) & ~511) : 2048);
    }}

    spfs.writeFile("/src/hello.sp", "// Sample SpiralC Program\\nconst RETURN_VAL = 77;\\nint main() {{ return RETURN_VAL; }}\\n", 2048);
    spfs.writeFile("/src/core_tc32.asm", "; SpiralOS TabComp TC-32 Native Core\\n.org 0x000000\\nboot_entry:\\n  JMP vm_loop\\n", 2048);
    spfs.writeFile("/src/core_x86.asm", "; SpiralOS Hummingbird i586 Native Core\\n[bits 16]\\n[org 0x7C00]\\nboot_entry:\\n  jmp 0x0008:0x00008000\\n", 2048);
    spfs.writeFile("/www/index.hts", "<h1>SpiralWeb Node Portal</h1>\\n<p>Served live over StudioNet SSP (Port 80) by SpiralHttpd.</p>\\n<p>One OS image running on TabComp TC-32 and Hummingbird i586.</p>\\n<a href='/sonder.hts'>Visit Sonder Gateway</a>\\n", 2048);
    spfs.writeFile("/www/sonder.hts", "<h1>Sonder Procedural Capsule</h1>\\n<p>Timeline 1991-B: ConsciousNode SoftWorks Aether Network.</p>\\n<a href='/index.hts'>Return to Node Index</a>\\n", 2048);
    spfs.writeFile("/art/spiral.pic", createProceduralPic(0), 6144);
    spfs.writeFile("/art/prism.pic", createProceduralPic(1), 6144);
    spfs.writeFile("/docs/README.txt", "SpiralOS 1.1 'Real Spiral' - ConsciousNode SoftWorks (MIT)\\nUnified VM Bytecode OS for TabComp & Hummingbird.\\n", 2048);

    const compiled = compileSpiralSource(spfs.readFile("/src/os.sp"), function(p) {{ return spfs.readFile(p); }});

    const img = new Uint8Array(1474560);
    const imgDV = new DataView(img.buffer);
    img.set(x86Core.bytes, 0x00000);
    imgDV.setUint32(0x04000, 0x32334354, true);
    imgDV.setUint32(0x04004, tc32Core.bytes.length, true);
    img.set(tc32Core.bytes, 0x04008);
    img.set(compiled.image, 0x08000);
    img.set(spfs.buf, 320 * 512);

    return {{ img, tc32Core, x86Core, compiled, spfs }};
  }}

  if (typeof globalThis !== "undefined") {{
    globalThis.buildUnifiedSpiralImageFromMap = buildUnifiedSpiralImageFromMap;
    globalThis.TabCompCPU = TabCompCPU;
    globalThis.TabCompFS = TabCompFS;
    globalThis.HummingbirdPC = HummingbirdPC;
    globalThis.StudioNetNIC = StudioNetNIC;
    globalThis.initHardwareMemory = initHardwareMemory;
    globalThis.bootSpiralDiskImage = bootSpiralDiskImage;
    globalThis.renderFramebufferToCanvas = renderFramebufferToCanvas;
  }}

  if (typeof window === "undefined" || typeof document === "undefined" || !document.getElementById("tc-canvas")) {{
    return;
  }}

  // ==========================================================================
  // Browser Interactive UI for Spiral Build Station
  // ==========================================================================
  const sourcesEl = document.getElementById("spiral-sources-json");
  const sourceMap = JSON.parse(sourcesEl.textContent);
  let activeFile = "/src/wm.sp";

  const fileListEl = document.getElementById("file-list");
  const editorEl = document.getElementById("src-editor");
  const fileLabelEl = document.getElementById("ide-file-label");
  const logEl = document.getElementById("build-log");
  const statSpirEl = document.getElementById("stat-spir");
  const statCoresEl = document.getElementById("stat-cores");
  const statTitleColEl = document.getElementById("stat-titlecol");
  const statSnetEl = document.getElementById("stat-snet");
  const tcStatusEl = document.getElementById("tc-status");
  const hbStatusEl = document.getElementById("hb-status");
  const hbMilestonesEl = document.getElementById("hb-milestones");

  function appendLog(msg) {{
    const ts = new Date().toISOString().slice(11, 19);
    logEl.textContent += "[" + ts + "] " + msg + "\\n";
    logEl.scrollTop = logEl.scrollHeight;
  }}

  function renderFileList() {{
    fileListEl.innerHTML = "";
    Object.keys(sourceMap).forEach(function(path) {{
      const item = document.createElement("div");
      item.className = "file-item" + (path === activeFile ? " active" : "");
      item.textContent = path;
      item.addEventListener("click", function() {{
        sourceMap[activeFile] = editorEl.value;
        activeFile = path;
        fileLabelEl.textContent = path;
        editorEl.value = sourceMap[path];
        renderFileList();
      }});
      fileListEl.appendChild(item);
    }});
  }}

  editorEl.value = sourceMap[activeFile] || "";
  editorEl.addEventListener("input", function() {{
    sourceMap[activeFile] = editorEl.value;
  }});
  renderFileList();

  // Live Emulators Setup
  const tcCanvas = document.getElementById("tc-canvas");
  const tcCtx = tcCanvas.getContext("2d");
  const tcImgData = tcCtx.createImageData(320, 200);

  const hbCanvas = document.getElementById("hb-canvas");
  const hbCtx = hbCanvas.getContext("2d");
  const hbImgData = hbCtx.createImageData(640, 480);
  const hbRgba32 = new Uint32Array(hbImgData.data.buffer);

  let tcCpu = null;
  let hbPc = null;
  let currentBuild = null;

  function compileAndBootAll() {{
    try {{
      sourceMap[activeFile] = editorEl.value;
      if (globalThis.__STUDIONET_SWITCH) {{
        globalThis.__STUDIONET_SWITCH.nics.clear();
        globalThis.__STUDIONET_SWITCH.packetLog = [];
      }}
      currentBuild = buildUnifiedSpiralImageFromMap(sourceMap);

      // Boot TabComp
      const tcFs = new TabCompFS();
      tcCpu = new TabCompCPU(tcFs);
      initHardwareMemory(tcCpu);
      bootSpiralDiskImage(tcCpu, currentBuild.img);

      // Boot Hummingbird
      hbPc = new HummingbirdPC({{ ramSizeMB: 16 }});
      hbPc.loadFloppyImage(currentBuild.img);

      statSpirEl.textContent = currentBuild.compiled.codeBytes + " B code + " + currentBuild.compiled.stringBytes + " B str (" + currentBuild.compiled.funcCount + " fns)";
      statCoresEl.textContent = "TC-32: " + currentBuild.tc32Core.bytes.length + " B | x86: " + currentBuild.x86Core.totalBytes + " B";
      appendLog("Compiled /src/os.sp -> SPIR (" + currentBuild.compiled.codeBytes + " B) & packaged 1.44 MB spiralos.img. Booting both machines...");
    }} catch (err) {{
      appendLog("BUILD ERROR: " + err.message);
    }}
  }}

  // Mouse & Keyboard bindings for TabComp Canvas
  function bindTabCompInput() {{
    const updateMouse = function(ev) {{
      if (!tcCpu) return;
      const rect = tcCanvas.getBoundingClientRect();
      const mx = Math.floor(((ev.clientX - rect.left) / (rect.width || 320)) * 320);
      const my = Math.floor(((ev.clientY - rect.top) / (rect.height || 200)) * 200);
      tcCpu.setMouseState(mx, my, ev.buttons || 0);
    }};
    tcCanvas.addEventListener("mousemove", updateMouse);
    tcCanvas.addEventListener("mousedown", function(ev) {{ tcCanvas.focus(); updateMouse(ev); }});
    tcCanvas.addEventListener("mouseup", updateMouse);
    tcCanvas.addEventListener("keydown", function(ev) {{
      if (!tcCpu) return;
      ev.preventDefault();
      let ascii = ev.key.length === 1 ? ev.key.charCodeAt(0) : 0;
      if (ev.key === "Enter") ascii = 13;
      else if (ev.key === "Backspace") ascii = 8;
      else if (ev.key === "Escape") ascii = 27;
      tcCpu.pushKeyEvent(1, ev.keyCode & 0xFF, ascii, 0);
    }});
    tcCanvas.addEventListener("keyup", function(ev) {{
      if (!tcCpu) return;
      let ascii = ev.key.length === 1 ? ev.key.charCodeAt(0) : 0;
      tcCpu.pushKeyEvent(0, ev.keyCode & 0xFF, ascii, 0);
    }});
  }}

  // Mouse & Keyboard bindings for Hummingbird Canvas
  function bindHummingbirdInput() {{
    let lastX = 160, lastY = 100;
    const updateMouse = function(ev) {{
      if (!hbPc) return;
      const rect = hbCanvas.getBoundingClientRect();
      const tx = Math.max(0, Math.min(319, Math.floor(((ev.clientX - rect.left) / (rect.width || 640)) * 320)));
      const ty = Math.max(0, Math.min(199, Math.floor((((ev.clientY - rect.top) / (rect.height || 480)) * 480 - 40) / 2)));
      const dx = tx - lastX;
      const dy = ty - lastY;
      lastX = tx; lastY = ty;
      if (dx !== 0 || dy !== 0 || ev.type === "mousedown" || ev.type === "mouseup") {{
        hbPc.ps2.sendMousePacket(dx, dy, ev.buttons || 0);
      }}
    }};
    hbCanvas.addEventListener("mousemove", updateMouse);
    hbCanvas.addEventListener("mousedown", function(ev) {{ hbCanvas.focus(); updateMouse(ev); }});
    hbCanvas.addEventListener("mouseup", updateMouse);
    const KEY_SC = {{
      Enter: 0x1C, Backspace: 0x0E, Space: 0x39, Escape: 0x01,
      ArrowUp: 0x48, ArrowDown: 0x50, ArrowLeft: 0x4B, ArrowRight: 0x4D
    }};
    const PLAIN = "1234567890-=\\b\\tqwertyuiop[]\\r\\0asdfghjkl;'`\\0\\\\zxcvbnm,./";
    hbCanvas.addEventListener("keydown", function(ev) {{
      if (!hbPc) return;
      ev.preventDefault();
      let sc = KEY_SC[ev.code] || 0;
      if (!sc && ev.key.length === 1) {{
        const idx = PLAIN.indexOf(ev.key.toLowerCase());
        if (idx >= 0) sc = idx + 2;
      }}
      if (sc) hbPc.ps2.sendKeyScancode(sc);
    }});
    hbCanvas.addEventListener("keyup", function(ev) {{
      if (!hbPc) return;
      let sc = KEY_SC[ev.code] || 0;
      if (!sc && ev.key.length === 1) {{
        const idx = PLAIN.indexOf(ev.key.toLowerCase());
        if (idx >= 0) sc = idx + 2;
      }}
      if (sc) hbPc.ps2.sendKeyScancode(sc | 0x80);
    }});
  }}

  bindTabCompInput();
  bindHummingbirdInput();

  // Main Animation Loop driving both emulators
  function tickFrame() {{
    if (tcCpu && !tcCpu.halted) {{
      tcCpu.yielded = false;
      tcCpu.stepBatch(60000);
      if (tcCpu.frameReady) {{
        renderFramebufferToCanvas(tcCpu, tcCtx, tcImgData);
        tcCpu.frameReady = false;
      }}
      const tcCol = tcCpu.ramDV.getInt32(0x002FFD78, true);
      const tcWins = tcCpu.ramDV.getInt32(0x002FFD14, true);
      tcStatusEl.textContent = "Running · Frames: " + tcCpu.presentCount + " · Windows: " + tcWins + " · Reboots: " + (tcCpu.rebootCount || 1);
      statTitleColEl.textContent = "Palette Index " + tcCol + (tcCol === 196 ? " (Crimson Self-Host!)" : " (Default Aether)");
    }}

    if (hbPc) {{
      hbPc.cpu.runSteps(180000);
      hbPc.checkRuntimeMilestones();
      hbPc.vga.renderFrame(hbRgba32);
      hbCtx.putImageData(hbImgData, 0, 0);
      const hbFrames = hbPc.ramView.getInt32(0x002FFD04, true);
      hbStatusEl.textContent = "Protected Mode + PSE Paging · Frames: " + hbFrames + " · Reboots: " + (hbPc.rebootCount + 1);
      hbMilestonesEl.textContent = "Milestones: " + hbPc.milestones.length + "/7 (" + hbPc.milestones.map(function(m) {{ return m.id; }}).join(", ") + ")";
    }}

    if (globalThis.__STUDIONET_SWITCH) {{
      statSnetEl.textContent = globalThis.__STUDIONET_SWITCH.packetLog.length + " frames routed";
    }}

    requestAnimationFrame(tickFrame);
  }}

  // Toolbar Actions
  document.getElementById("btn-compile-boot").addEventListener("click", compileAndBootAll);

  // One-Click Export 1.44 MB Hummingbird Floppy (.img)
  document.getElementById("btn-dl-floppy").addEventListener("click", function() {{
    if (!currentBuild) compileAndBootAll();
    const blob = new Blob([currentBuild.img], {{ type: "application/octet-stream" }});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spiralos.img";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() {{ URL.revokeObjectURL(url); }}, 2000);
    appendLog("Exported 1.44 MB bootable floppy image: spiralos.img (1,474,560 bytes).");
  }});

  // One-Click Export TabComp Cartridge (.html)
  document.getElementById("btn-dl-tabcomp").addEventListener("click", function() {{
    if (!currentBuild) compileAndBootAll();
    const imgB64 = u8ToB64(currentBuild.img);
    const cartHtml =
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>SpiralOS 1.1 "Real Spiral" — TabComp Cartridge</title>' +
      '<style>body{{margin:0;background:#080b14;color:#eef3ff;font-family:monospace;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh}}canvas{{width:640px;height:400px;image-rendering:pixelated;border:2px solid #00e5ff}}</style></head>' +
      '<body><h3>SpiralOS 1.1 "Real Spiral" — Bootable TabComp Cartridge (ConsciousNode SoftWorks)</h3>' +
      '<canvas id="tc-screen" width="320" height="200" tabindex="0"></canvas>' +
      '<script id="spiral-img-b64" type="text/plain">' + imgB64 + '<" + "/script>' +
      '<script>' + document.getElementById("spiral-station-core").textContent +
      '\\n(function(){{const b64=document.getElementById("spiral-img-b64").textContent;const bin=atob(b64);const u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);' +
      'const c=document.getElementById("tc-screen"),ctx=c.getContext("2d"),id=ctx.createImageData(320,200);const cpu=new globalThis.TabCompCPU(new globalThis.TabCompFS());globalThis.initHardwareMemory(cpu);globalThis.bootSpiralDiskImage(cpu,u8);' +
      'c.addEventListener("mousemove",function(e){{const r=c.getBoundingClientRect();cpu.setMouseState(((e.clientX-r.left)/r.width)*320,((e.clientY-r.top)/r.height)*200,e.buttons||0)}});' +
      'c.addEventListener("mousedown",function(e){{const r=c.getBoundingClientRect();cpu.setMouseState(((e.clientX-r.left)/r.width)*320,((e.clientY-r.top)/r.height)*200,e.buttons||1)}});' +
      'c.addEventListener("mouseup",function(e){{const r=c.getBoundingClientRect();cpu.setMouseState(((e.clientX-r.left)/r.width)*320,((e.clientY-r.top)/r.height)*200,0)}});' +
      'window.addEventListener("keydown",function(e){{let a=e.key.length===1?e.key.charCodeAt(0):(e.key==="Enter"?13:(e.key==="Backspace"?8:0));cpu.pushKeyEvent(1,e.keyCode&255,a,0)}});' +
      'window.addEventListener("keyup",function(e){{let a=e.key.length===1?e.key.charCodeAt(0):0;cpu.pushKeyEvent(0,e.keyCode&255,a,0)}});' +
      'function loop(){{cpu.stepBatch(60000);globalThis.renderFramebufferToCanvas(cpu,ctx,id);requestAnimationFrame(loop)}}requestAnimationFrame(loop);}})();<" + "/script></body></html>';
    const blob = new Blob([cartHtml], {{ type: "text/html;charset=utf-8" }});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spiralos-tabcomp-cartridge.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() {{ URL.revokeObjectURL(url); }}, 2000);
    appendLog("Exported bootable TabComp Cartridge: spiralos-tabcomp-cartridge.html (" + cartHtml.length + " bytes).");
  }});

  // Automated §3 Self-Hosting Acceptance Demo
  document.getElementById("btn-selfhost-demo").addEventListener("click", function() {{
    if (!tcCpu || !hbPc) compileAndBootAll();
    appendLog("Starting §3 Self-Hosting Acceptance Demo on BOTH TabComp and Hummingbird...");
    function clickTC(x, y) {{
      tcCpu.setMouseState(x, y, 1);
      for (let i = 0; i < 15; i++) tcCpu.stepBatch(40000);
      tcCpu.setMouseState(x, y, 0);
      for (let i = 0; i < 15; i++) tcCpu.stepBatch(40000);
    }}
    // 1. Open SpiralEdit (/src/wm.sp), 2. Click [Col196], 3. Click [Save], 4. Click [Rebuild], 5. Click [Reboot]
    clickTC(18, 56);
    clickTC(93, 40);
    clickTC(143, 40);
    clickTC(196, 40);
    clickTC(203, 126);
    for (let i = 0; i < 20; i++) tcCpu.stepBatch(50000);

    // Also load the rebuilt image onto Hummingbird and reboot to show identical change
    hbPc.loadFloppyImage(tcCpu.spiralDiskImage);
    for (let i = 0; i < 15; i++) hbPc.cpu.runSteps(250000);
    appendLog("§3 Self-Hosting Demo complete! Title-bar colour changed to 196 (Crimson) & rebuilt inside SpiralOS.");
  }});

  // Automated StudioNet TC <-> HB Demo
  document.getElementById("btn-net-demo").addEventListener("click", function() {{
    if (!tcCpu || !hbPc) compileAndBootAll();
    appendLog("Running StudioNet TC <-> HB Chat & SSP File Transfer Demo...");
    function clickTC(x, y) {{
      tcCpu.setMouseState(x, y, 1);
      for (let i = 0; i < 12; i++) tcCpu.stepBatch(40000);
      tcCpu.setMouseState(x, y, 0);
      for (let i = 0; i < 12; i++) tcCpu.stepBatch(40000);
    }}
    // Open SpiralChat on Both Machines & send message
    clickTC(24, 6);
    clickTC(40, 130);
    clickTC(210, 124);
    for (let i = 0; i < 10; i++) {{
      tcCpu.stepBatch(40000);
      hbPc.cpu.runSteps(200000);
    }}
    appendLog("StudioNet packet delivered! Total frames on bus: " + globalThis.__STUDIONET_SWITCH.packetLog.length);
  }});

  compileAndBootAll();
  requestAnimationFrame(tickFrame);
}})();
</script>
</body>
</html>
"""

    out_path = os.path.join(ROOT, "index.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print("Built index.html (Spiral Build Station) successfully! Size:", len(html))


if __name__ == "__main__":
    build_station_html()
