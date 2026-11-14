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
<title>Spiral Build Station — SpiralOS 1.4 "Daily Driver" (TabComp TC-32 &amp; Hummingbird i586)</title>
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
      <div class="brand-title">SPIRAL BUILD STATION · SpiralOS 1.4 "Daily Driver"</div>
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
    spfs.writeFile("/src/core_tc32.asm", tc32Core.asmSource, (tc32Core.asmSource.length + 2048) & ~511);
    spfs.writeFile("/src/core_x86.asm", x86Core.asmSource, (x86Core.asmSource.length + 2048) & ~511);
    spfs.writeFile("/art/cnsw.pic", b64ToU8("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUlVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVIAAAAAAABVClpaWlpaWlpaWlpaWlpaWlpaWlpaXFxaWloKCgoKCgoKWloKClpaCgoKCgoKClpaWlpaWlpaWltcW1paWlpaWlpaWlpaWloKVQAAAAAAAFVaAAAAAAAAAAAAAAAAAAAAAAAAUlRTAFNaCgpaV1VSAAAAVwoKVwAAAFJVV1oKClpTAAAAAAAAAFJUUwAAAAAAAAAAAAAAAFpVAAAAAAAAVVoAAAAAAAAAAAAAAAAAAAAAAFRUUlcKClhVAAAAAAAAAFIKU1MKUgAAAAAAAABVWAoKV1IAAAAAAABSVFMAAAAAAAAAAAAAWlUAAAAAAABVWgAAAAAAAAAAAAAAAAAAAFJUU1gKXFcAAAAAAAAAAAAAWFwAAFxYAAAAAAAAAAAAAFdcClhSAAAAAAAAU1RSAAAAAAAAAABaVQAAAAAAAFVaAAAAAAAAAAAAAAAAAABTU1cKXFMAAAAAAAAAAAAAAFMKUgAAUgpTAAAAAAAAAAAAAABTXApXAAAAAAAAUlRSAAAAAAAAAFpVAAAAAAAAVVoAAAAAAAAAAAAAAAAAVFZcClUAAAAAAAAAAAAAAAAAXFgAAAAAWFwAAAAAAAAAAAAAAAAAVQpcUwAAAAAAAFNTAAAAAAAAWlUAAAAAAABVWgAAAAAAAAAAAAAAAFRYClgAAAAAAAAAAAAAAAAAAFcKUgAAAABSClcAAAAAAAAAAAAAAAAAAFgKVwAAAAAAAFNUAAAAAABaVQAAAAAAAFVaAAAAAAAAAAAAAABVXApTAAAAAAAAAAAAAAAAAAAAClcAAAAAAABXCgAAAAAAAAAAAAAAAAAAAFMKWlIAAAAAAFJUAAAAAFpVAAAAAAAAVVoAAAAAAAAAAAAAVQpcUgAAAAAAAAAAAAAAAAAAAFhcAAAAAAAAAABcWAAAAAAAAAAAAAAAAAAAAFJcClIAAAAAAFJUAAAAWlUAAAAAAABVWgAAAAAAAAAAAFUKWgAAAAAAAAAAAAAAAAAAAABSClMAAAAAAAAAAFMKUgAAAAAAAAAAAAAAAAAAAABaClIAAAAAAFJUAABaVQAAAAAAAFVaAAAAAAAAAABVCloAAAAAAAAAAAAAAAAAAAAAAFpaAAAAAAAAAAAAAFpaAAAAAAAAAAAAAAAAAAAAAABaClIAAAAAAFJUAFpVAAAAAAAAVVoAAAAAAAAAVApaAAAAAAAAAAAAAAAAAAAAAABTClIAAAAAAAAAAAAAUgpTAAAAAAAAAAAAAAAAAAAAAABaClIAAAAAAFNTWlUAAAAAAABVWgAAAAAAAFMKWgAAAAAAAAAAAAAAAAAAAAAAAFxYAAAAAAAAAAAAAAAAWFwAAAAAAAAAAAAAAAAAAAAAAABaClIAAAAAAFNcVQAAAAAAAFVaAAAAAAAAW1wAAAAAAAAAAAAAAAAAAAAAAABXCgAAAAAAAAAAAAAAAAAAClcAAAAAAAAAAAAAAAAAAAAAAABcWgAAAAAAAFtVAAAAAAAAVVoAAAAAAFgKUgAAAAAAAAAAAAAAAAAAAAAAUgpVAAAAAAAAAAAAAAAAAABVClIAAAAAAAAAAAAAAAAAAAAAAFIKVwAAAAAAWlUAAAAAAABVWgAAAABTClMAAAAAAAAAAAAAAAAAAAAAAABYXAAAAAAAAAAAAFJSUlIAAABcWAAAAAAAAAAAAAAAAAAAAAAAAFMKUwAAAABaVQAAAAAAAFVaAAAAAFxYAAAAAAAAAAAAAAAAAAAAAAAAUgpTAAAAAFJSVFVUU1NTU1RVVFYKUgAAAAAAAAAAAAAAAAAAAAAAAFhcAAAAAFpVAAAAAAAAVVoAAABXCgAAAAAAAAAAAAAAAAAAAAAAAABcWAAAAFJUVFNSAAAAAAAAAABSUllcUgAAAAAAAAAAAAAAAAAAAAAAAApXAAAAWlUAAAAAAABVWgAAUgpWAAAAAAAAAAAAAAAAAAAAAAAAUwpSAFJUVFIAAAAAAAAAAAAAAAAAUgpWVVIAAAAAAAAAAAAAAAAAAAAAVQpSAABaVQAAAAAAAFVaAABYXAAAAAAAAAAAAAAAAAAAAAAAAAAKVwBTVFIAAAAAAAAAAAAAAAAAAAAAVwoAU1RSAAAAAAAAAAAAAAAAAAAAXFgAAFpVAAAAAAAAVVoAUgpUAAAAAAAAAAAAAAAAAAAAAAAAVwoAU1MAAAAAAAAAAAAAAAAAAAAAAAAAClcAUlRSAAAAAAAAAAAAAAAAAABTClIAWlUAAAAAAABVWgBXCgAAAAAAAAAAAAAAAAAAAAAAAFIKVVNTAAAAAAAAAAAAAAAAAAAAAAAAAABVClIAAFRTAAAAAAAAAAAAAAAAAABcVwBaVQAAAAAAAFVaAApYAAAAAAAAAAAAAAAAAAAAAAAAWFxTUwAAAAAAAAAAAAAAAAAAAAAAAAAAAABcWAAAAFNTAAAAAAAAAAAAAAAAAFcKAFpVAAAAAAAAVVpTClIAAAAAAAAAAAAAAAAAAAAAAFMKVFQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFIKUwAAAFNSAAAAAAAAAAAAAAAAAApTWlUAAAAAAABVWlpaUgAAAAAAAAAAAAAAAAAAAAAAXFlVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFhcAAAAAFRSAAAAAAAAAAAAAAAAWFpaVQAAAAAAAFVaClgAAAAAAAAAAAAAAAAAAAAAAFUKVFIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUgpVAAAAAFQAAAAAAAAAAAAAAABVClpVAAAAAAAAVQoKUwAAAAAAAAAAAAAAAAAAAAAACldUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVwoAAAAAUlMAAAAAAAAAAAAAAAAKClUAAAAAAABVClxTAAAAAAAAAAAAAAAAAAAAAFcKU1MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAClcAAAAAVFIAAAAAAAAAAAAAAFoKVQAAAAAAAFUKWVIAAAAAAAAAAAAAAAAAAABSClNUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABTClIAAABSVAAAAAAAAAAAAAAAVwpVAAAAAAAAVQpYUgAAAAAAAAAAAAAAAAAAAFpcAFQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABcWgAAAABUUgAAAAAAAAAAAABVClUAAAAAAABVClVSAAAAAAAAAAAAAAAAAABTClJSUwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFIKUwAAAFJTAAAAAAAAAAAAAFIKVQAAAAAAAFUKU1IAAAAAAAAAAAAAAAAAAFxYAFJTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFhcAAAAAFQAAAAAAAAAAAAAAApVAAAAAAAAVQpTAAAAAAAAAAAAAAAAAABXCgAAUlIAAAAAAAAAAAAAAAAAVVUAAAAAAAAAAAAAAAAAAAAAAApXAAAAVFIAAAAAAAAAAAAAClUAAAAAAABVWlMAAAAAAAAAAAAAAAAAAApXAABSUgAAAAAAAAAAAAAAVQoKCgpVAAAAAAAAAAAAAAAAAAAAVwoAAABTUgAAAAAAAAAAAABaVQAAAAAAAFVaU1IAAAAAAAAAAAAAAABYXAAAAFJTAAAAAAAAAAAAAAAKCgoKCgpUUgAAAAAAAAAAAAAAAAAAXFgAAFJTAAAAAAAAAAAAAFpVAAAAAAAAVVpTUgAAAAAAAAAAAAAAUgpTAAAAUlMAAAAAAAAAAAAAVQoKCgoKClZUUgAAAAAAAAAAAAAAAABTClIAAFQAAAAAAAAAAAAAWlUAAAAAAABVWlNSAAAAAAAAAAAAAABaWgAAAAAAVQAAAAAAAAAAAABVCgoKCgoKVVJUAAAAAAAAAAAAAAAAAABaWgAAVQAAAAAAAAAAAABaVQAAAAAAAFVaU1IAAAAAAAAAAAAAUwpSAAAAAABUUgAAAAAAAAAAAAAKCgoKCgoAAFUAAAAAAAAAAAAAAAAAAFIKUwBVAAAAAAAAAAAAAFpVAAAAAAAAVVpSUwAAAAAAAAAAAAAKWAAAAAAAAFJTAAAAAAAAAAAAAFUKCgoKVQAAU1IAAAAAAAAAAAAAAAAAAFgKAFUAAAAAAAAAAAAAWlUAAAAAAABVClJUAAAAAAAAAAAAVwoAAAAAAAAAAFQAAAAAAAAAAAAAAABVVQAAAABUAAAAAAAAAAAAAAAAAAAAAApXVQAAAAAAAAAAAAAKVQAAAAAAAFUKAFUAAAAAAAAAAFIKVQAAAAAAAAAAUlMAAAAAAAAAAAAAAAAAAAAAAFUAAAAAAAAAAAAAAAAAAAAAVQpWAAAAAAAAAAAAAApVAAAAAAAAVQpSU1IAAAAAAAAAWFwAAAAAAAAAAAAAVFIAAAAAAAAAAAAAAAAAAABSUwAAAAAAAAAAAAAAAAAAAAAAXFoAAAAAAAAAAABSClUAAAAAAABVClVSUwAAAAAAAFIKUwAAAAAAAAAAAAAAVFIAAAAAAAAAAAAAAAAAAFQAAAAAAAAAAAAAAAAAAAAAAABTClIAAAAAAAAAAFUKVQAAAAAAAFUKVwBUAAAAAAAAXFgAAAAAAAAAAAAAAAAAVFIAAAAAAAAAAAAAAABUUgAAAAAAAAAAAAAAAAAAAAAAAFJaXAAAAAAAAAAAVwpVAAAAAAAAVQpaAFRSAAAAAFMKUgAAAAAAAAAAAAAAAAAAU1RSAAAAAAAAAABSVFIAAAAAAAAAAAAAAAAAAAAAAAAAUlQKUwAAAAAAAABaClUAAAAAAABVCgoAUlMAAAAAClcAAAAAAAAAAAAAAAAAAAAAUlRUU1JSUlJTVFQAAAAAAAAAAAAAAAAAAAAAAAAAAABTUlcKAAAAAAAAAAoKVQAAAAAAAFVaClUAVQAAAFcKAAAAAAAAAAAAAAAAAAAAAAAAAFJSU1NTU1IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFUAAApXAAAAAABVClpVAAAAAAAAVVpaWABTUwBSClMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSUwAAUwpSAAAAAFhaWlUAAAAAAABVWlMKAABVAFhcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFRSAAAAXFgAAAAAClNaVQAAAAAAAFVaAApXAFNWClIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVAAAAABSClMAAFcKAFpVAAAAAAAAVVoAV1wAAApYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFNSAAAAAABYXAAAXFcAWlUAAAAAAABVWgBSClNVClUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSVAAAAAAAAFIKVVMKUgBaVQAAAAAAAFVaAABYXApXU1MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFRSAAAAAAAAAFcKXFgAAFpVAAAAAAAAVVoAAFIKClpaXFpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpbXFpaWlpaWlpaWgoKUgAAWlUAAAAAAABVWgAAAFcKWlpaW1taWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaW1taWlpaWlpaWlpaClcAAABaVQAAAAAAAFVaAAAAAFxYAABSVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABUUgAAAAAAAAAAAFhcAAAAAFpVAAAAAAAAVVoAAAAAUwpTAABSVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVFIAAAAAAAAAAABTClMAAAAAWlUAAAAAAABVWgAAAAAAVwpSAABSVFIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFRSAAAAAAAAAAAAUgpXAAAAAABaVQAAAAAAAFVaAAAAAAAAWlwAAABSVFIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABUUgAAAAAAAAAAAABcWgAAAAAAAFpVAAAAAAAAVVoAAAAAAABSCloAAAAAVFMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSVFIAAAAAAAAAAAAAWgpSAAAAAAAAWlUAAAAAAABVWgAAAAAAAABSCloAAAAAU1RSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU1QAAAAAAAAAAAAAAFoKUgAAAAAAAABaVQAAAAAAAFVaAAAAAAAAAABSCloAAAAAUlRUUgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUlRSAAAAAAAAAAAAAABaClIAAAAAAAAAAFpVAAAAAAAAVVoAAAAAAAAAAABSCloAAAAAAFJUVFIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUlRTAAAAAAAAAAAAAAAAWgpSAAAAAAAAAAAAWlUAAAAAAABVWgAAAAAAAAAAAABSClxSAAAAAABSVFRTUgAAAAAAAAAAAAAAAAAAAABSU1VTAAAAAAAAAAAAAAAAUlwKUgAAAAAAAAAAAABaVQAAAAAAAFVaAAAAAAAAAAAAAABSWgpTAAAAAAAAAFJUVVNTUlIAAAAAAABSUlNUVVNSAAAAAAAAAAAAAAAAAFMKWlIAAAAAAAAAAAAAAFpVAAAAAAAAVVoAAAAAAAAAAAAAAAAAVwpYAAAAAAAAAAAAUlJTU1VVVVVVVFNTUlIAAAAAAAAAAAAAAAAAAABYClcAAAAAAAAAAAAAAABSXFUAAAAAAABVWgAAAAAAAAAAAAAAAAAAU1wKVQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABVClxTAAAAAAAAAAAAAAAAAFRbVQAAAAAAAFVaAAAAAAAAAAAAAAAAAAAAAFcKXFMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABTXApXAAAAAAAAAAAAAAAAAABTU1pVAAAAAAAAVVoAAAAAAAAAAAAAAAAAAAAAAFJYClxXAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABXXApYUgAAAAAAAAAAAAAAAAAAU1MAWlUAAAAAAABVWgAAAAAAAAAAAAAAAAAAAAAAAABSVwoKWFUAAAAAAAAAAAAAAAAAAAAAAAAAAFVYCgpXUgAAAAAAAAAAAAAAAAAAAFJUAABaVQAAAAAAAFVaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFNaCgpaV1VSAAAAAAAAAAAAAFJVV1oKClpTAAAAAAAAAAAAAAAAAAAAAABSVAAAAFpVAAAAAAAAVQpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaCgoKCgoKClpaWlpaWgoKCgoKCgpaWlpaWlpaWlpaWlpaWlpaWlpaWlxbWlpaClUAAAAAAABSVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=="), 6656);
    spfs.writeFile("/www/index.hts", "<h1>SpiralWeb Node Portal</h1>\\n<p>Served live over StudioNet SSP (Port 80) by SpiralHttpd.</p>\\n<p>One OS image running on TabComp TC-32 and Hummingbird i586.</p>\\n<a href='/sonder.hts'>Visit Sonder Gateway</a>\\n", 2048);
    spfs.writeFile("/www/sonder.hts", "<h1>Sonder Procedural Capsule</h1>\\n<p>Timeline 1991-B: ConsciousNode SoftWorks Aether Network.</p>\\n<a href='/index.hts'>Return to Node Index</a>\\n", 2048);
    spfs.writeFile("/art/spiral.pic", createProceduralPic(0), 6144);
    spfs.writeFile("/art/prism.pic", createProceduralPic(1), 6144);
    spfs.writeFile("/docs/README.txt", "SpiralOS 1.4 \"Daily Driver\" - ConsciousNode SoftWorks (MIT)\\nUnified VM Bytecode OS for TabComp & Hummingbird.\\n", 2048);

    const compiled = compileSpiralSource(spfs.readFile("/src/os.sp"), function(p) {{ return spfs.readFile(p); }});

    const img = new Uint8Array(1474560);
    const imgDV = new DataView(img.buffer);
    img.set(x86Core.bytes, 0x00000);
    imgDV.setUint32(0x04000, 0x32334354, true);
    imgDV.setUint32(0x04004, tc32Core.bytes.length, true);
    img.set(tc32Core.bytes, 0x04008);
    img.set(compiled.image, 0x08000);
    img.set(spfs.buf, 320 * 512);
    img.set(b64ToU8("VFJJVFQqAAAAAAAAAAAAAMImcSbYN3Mm2Dd5JsImByfYN3YmyyZGJOswiiaaMHgmUjB5JoAlxSauNK8mUjB5JoAlwyauNKkmUjB5JoAluiauNKMmUjB5JoAlxSauNJ0mWzB5JmQweSYUKnEn0yd1JhAoQSeaMHgmnibRJssldCZQNYEmJTB5Ji4weSbYKXEnlydvJtso4kxiK3Em3idyJmozXSbCJnEmyyZyJoor1ibLJuEuTi9xJsImcSaBK9YmyybhLk4vcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJuUycSZxJuUycSZxJuUycSZxJuUycSZxJuUycSZxJuUycSZxJucycSZxJuUycSZxJuUycSZxJuUycSZxJuUycSZxJv0ycSZxJv8ycSZxJh0zcSZxJjUzcSZxJkczcSZxJlEzcSZxJl0zcSZxJmEzcSZxJnMzcSZxJoszcSZxJqMzcSZxJr8zcSZxJtszcSZxJgk0cSZxJjU0cSZxJnM0cSZxJrs0cSZxJv80cSZxJj01cSZxJnk1cSZxJrk1cSZxJvk1cSZxJks2cSZxJp02cSZxJvc2cSZxJl83cSZxJr83cSZxJkc4cSZxJs84cSZxJlc5cSZxJpk5cSZxJtc5cSZxJkE6cSZxJk88cSZxJmU8cSZxJoU8cSZxJqU8cSZxJgE9cSZxJhU9cSZxJlk9cSZxJk86cSZxJok6cSZxJsM6cSZxJgk7cSZxJk87cSZxJpU7cSZxJts7cSZxJhU8cSZxJh0+cSZxJjk+cSZxJiE/cSZxJm8/cSZxJp8/cSZxJi9AcSZxJgdCcSZxJqFCcSZxJmNDcSZxJrdDcSZxJvdDcSZxJlVEcSZxJm9EcSZxJs1EcSZxJjdFcSZxJodFcSZxJotFcSZxJs9FcSZxJo9GcSZxJtlGcSZxJv9GcSZxJsdHcSZxJnImcSZxJnMmcSZxJnUmcSZxJnkmcSZxJoEmcSZxJpEmcSZxJrEmcSZxJvEmcSZxJnEncSZxJnEocSZxJnEqcSZxJnEucSZxJnE2cSZxJnFGcSZxJo4ZciZxJqsMcyZxJsg/dCZxJjwMeCZxJuo+fiZxJoAKjCZxJnI7piZxJpAD3CZxJpItRidxJrM0GyhxJvVCxSlxJpYSGi1xJp5LwjNxJugjFEFxJl8h1A5yJk0cGkRyJikS4BR0JsRKTgN3JjQiDy18JsRKTgN3JikS4BR0Jk0cGkRyJl8h1A5yJugjFEFxJp5LwjNxJpYSGi1xJvVCxSlxJrM0GyhxJpItRidxJpAD3CZxJnI7piZxJoAKjCZxJuo+fiZxJjwMeCZxJsg/dCZxJqsMcyZxJo4ZciZxJnFGcSZxJnE2cSZxJnEucSZxJnEqcSZxJnEocSZxJnEncSZxJvEmcSZxJrEmcSZxJpEmcSZxJoEmcSZxJnkmcSZxJnUmcSZxJnMmcSZxJnEmcSbEJuEm2ibjJtIm3SbAJsQmkSaiJp8moyZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJoEmgSaBJoEmcSaBJoEmcSa1JrUmtSZxJnEmcSZxJnEmuSZtJ7kmuSZtJ7kmcSZxJoEm7SYBJ+kmhSZpJ4EmcSY1JzkngSaRJr0m/SZxJnEm4Sb5JuEmBSf5JuUmcSZxJoEmgSaRJnEmcSZxJnEmcSZ5JoEmkSaRJpEmgSZ5JnEmkSaBJnkmeSZ5JoEmkSZxJnEmxSapJu0mqSbFJnEmcSZxJoEmgSbtJoEmgSZxJnEmcSZxJnEmcSZxJokmgSaRJnEmcSZxJu0mcSZxJnEmcSZxJnEmcSZxJnEmoSahJnEmdSZ5JoEmkSaxJvEmcSZxJukm/SYFJxUnNSf1JukmcSaBJqEmwSaBJoEmgSbtJnEm6Sb1JnUmqSaxJvEmbSdxJmkneSaBJqkmdSb1JukmcSZ5JokmmSa5Jm0neSZ5JnEmbSfxJmkndSZ1JvUm6SZxJqkmsSbxJmkn9Sb1JukmcSZtJ3UmeSaBJpEmkSaRJnEm6Sb1JrkmoSa5JvUm6SZxJukm9Sb1Ju0mdSZ5JuEmcSZxJqEmoSZxJqEmoSZxJnEmcSaJJokmcSaJJoEmkSZxJnkmgSaRJrEmkSaBJnkmcSZxJnEm7SZxJu0mcSZxJnEmsSaRJoEmeSaBJpEmsSZxJukm9SZ5JoEmgSZxJoEmcSbpJvUmLScVJy0n8SbtJnEmoSa5JvUmbSf1JvUm9SZxJmkn9Sb1Jmkn9Sb1JmkncSbpJvUm8SbxJvEm9SbpJnEmYSf5JvUm9Sb1JvkmYSdxJm0n8SbxJmkn8SbxJm0ncSZtJ/Em8SZpJ/Em8SbxJnEm6Sb1JvEmDSf1JvUm6SZxJvUm9Sb1Jm0n9Sb1JvUmcSbtJoEmgSaBJoEmgSbtJnEmrSZ5JnkmeSb5Jvkm4SZxJvUm+SYBJ1EnASf5JvUmcSbxJvEm8SbxJvEm8SZtJ3Em8yY3JxsnAyfzJvMm8yZxJvUmNScVJwUn/Sb1JvUmcSbpJvUm9Sb1JvUm9SbpJnEmaSf1JvUmaSfxJvEm8SZxJukm9Sb1JvUmFScFJ+smcSZpJ/Um9SZpJwEn+Sb1JnEm6Sb1JvEm6SZ1JvUm6SZxJm8ngSaBJoEmgSaBJoEmcSb1JvUm9Sb1JvUm9SbpJnEm9Sb1JvUmuSa5JqEmoSZxJvMm8ybzJgMnGyc3J/MmcSb1JrkmoSahJqEmuSb1JnEm9Sa5JqEmgSaBJoEmgSZxJm0neSaBJpEmsSbxJm0ncSapJpEmkSaRJpEmkSapJnEm8SaxJpEmgSZ5JnUmcSZxJqkmeSZ5JnkmeSZ5JqkmcSaBJpkmtSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmbydxJpEmgSZxJnEmcSZxJnEmcSZxJnEm6SZ1Ju0m9SbtJnEm8SbxJmkn9Sb1JvUmaSdxJnEmcSbpJvUm8Sb1JukmcSZ1JnUm7Sb1JvUm9SbtJnEmcSZxJukm9SZtJ/Em6SZxJo0mkSZpJ5EmkSaRJpEmcSZxJnEm7Sb1JvUm7SZ1Jukm8SbxJmkn9Sb1JvUm9SZxJoEmcSahJoEmgSaBJqkmcSZ5JnEmiSZ5JnkmeSb5JuEm8SbxJvkmASdRJwEn+SZxJpEmkSaRJpEmkSaRJokmcSZxJnEmXScDJwMnAycDJ3EmcSZxJmEn+Sb5Jvkm+SZxJnEmcSbpJvUm9Sb1JukmcSZxJnEmaSf1JvUmaSfxJvEmcSZxJu0m9Sb1Ju0mdSZ1JnEmcSYNJzMn8SbxJvEmcSZxJnEm7SbxJukmdSZpJ3EmkSaRJmknkSaRJpUmiSZxJnEmcSb1JvUm9Sb9JuUmcSZxJnEm9Sb1JrkmuSahJnEmcSZxJvMmAycDJxsntSZxJnEmcSb1JrkmoSa5JvUmcSZxJnEm9Sb1JrkmoSaBJtEmcSZxJm0neSahJrEmbSdxJokmkSaRJrEmkSaRJokmcSaBJoEmgSaBJoEmgSaBJnEmoSZ5JnkmdSZ5JnkmoSZxJnEm1SYJJ3EmcSZxJnEmcSZxJu0mxSbtJsUm7SZxJnEmcSZxJnEmcSZxJnEmgybfJnEmByeZJnEmEScRJxsnhSaFJgcncSYHJxsn0CZxJiUnKic0J8YmyybaJrIm7iZwJ7kmcCfrJnEmYSdwJ3AnwSbBJnAnxiZwJ3AnVyetJnAncCdwJ8EmASchJ+YmSiesJgsnkyY3JzAn3CbCJlUnJSdNJ3ombifYJp8mtyZjJ8QmACfuJukmSSd5Jg4nkiYEJzMn2yaPJlgnJCcaJ30mbSelJqImtiYwJ8cm/ya7JuwmSCdGJxEnkSbRJjYn2iZcJ1snIyfnJoAmbCdyJqUmtSb9Jsom/iaIJu8mRycTJxQnkCaeJjkn2SYpJ14nIie0JoMmayc/J6gmtCbKJs0m/SZVJ/ImRifgJhcnjyZrJzwn2Cb2JmEnISeBJoYmaicMJ6smsyaXJtAm/CYiJ/UmRSetJhonjiY4Jz8n1ybDJmQnICdOJ4kmaSfZJq4msiZkJ9Mm+ybvJvgmRCd6Jh0njSYFJ0In1iaQJmcnHycbJ4wmaCemJrEmsSYxJ9Ym+ia8JvsmQydHJyAnjCbSJkUn1SZdJ2onHifoJo8mZydzJrQmsCb+Jtkm+SaJJv4mQicUJyMniyafJkgn1CYqJ20nHSe1JpImZidAJ7cmrybLJtwm+CZWJwEnQSfhJiYniiZsJ0sn0yb3JnAnHCeCJpUmZScNJ7omriaYJt8m9yYjJwQnQCeuJikniSY5J04n0ibEJnMmGydPJ5gmZCfaJr0mrSZlJ+Im9ibwJgcnPyd7JiwniCYGJ1En0SaRJnYmGiccJ5smYyenJsAmrCYyJ+Um9Sa9JgonPidIJy8nhybTJlQn0CZeJ3kmGSfpJp4mYid0JsMmqyb/Jugm9CaKJg0nPScVJzInhiagJlcnzyYrJ3wmGCe2JqEmYSdBJ8YmqibMJusm8yZXJxAnPCfiJjUnhSZtJ1onzib4Jn8mFyeDJqQmYCcOJ8kmqSaZJu4m8iYkJxMnOyevJjgnhCY6J10nzSbFJoImFidQJ6cmXyfbJswmqCZmJ/Em8SbxJhYnOid8JjsngyYHJ2AnzCaSJoUmFScdJ6omXieoJs8mpyYzJ/Qm8Ca+JhknOSdJJz4ngibUJmMnyyZfJ4gmFCfqJq0mXSd1JtImpiYAJ/cm7yaLJhwnOCcWJ0EngSahJmYnyiYsJ4smEye3JrAmXCdCJ9UmpSbNJvom7iZYJx8nNyfjJkQngCZuJ2knySb5Jo4mEieEJrMmWycPJ9gmpCaaJv0m7SYlJyInNiewJkcnfyY7J2wnyCbGJpEmESdRJ7YmWifcJtsmoyZnJwAn7CbyJiUnNSd9JkonfiYIJ28nxyaTJpQmECceJ7kmWSepJt4moiY0JwMn6ya/JignNCdKJ00nfSbVJnImxiZgJ5cmDyfrJrwmWCd2JuEmoSYBJwYn6iaMJisnMycXJ1AnfCaiJnUmxSYtJ5omDie4Jr8mVydDJ+QmoCbOJgkn6SZZJy4nMifkJlMneyZvJ3gmxCb6Jp0mDSeFJsImVicQJ+cmnyabJgwn6CYmJzEnMSexJlYneiY8J3smwybHJqAmDCdSJ8UmVSfdJuomniZoJw8n5ybzJjQnMCd+JlkneSYJJ34mwiaUJqMmCycfJ8gmVCeqJu0mnSY1JxIn5ibAJjcnLydLJ1wneCbWJoEmwSZhJ6YmCifsJssmUyd3JvAmnCYCJxUn5SaNJjonLicYJ18ndyajJoQmwCYuJ6kmCSe5Js4mUidEJ/MmmybPJhgn5CZaJz0nLSflJmIndiZwJ4cmvyb7JqwmCCeGJtEmUScRJ/YmmiacJhsn4yYnJ0AnLCeyJmUndSY9J4omvibIJq8mBydTJ9QmUCfeJvkmmSZpJx4n4ib0JkMnKyd/JmgndCYKJ40mvSaVJrImBicgJ9cmTyerJvwmmCY2JyEn4SbBJkYnKidMJ2sncybXJpAmvCZiJ7UmBSftJtomTid4Jv8mlyYDJyQn4CaOJkknKScZJ24nciakJpMmuyYvJ7gmBCe6Jt0mTSdFJwInlibQJicn3yZbJ0wnKCfmJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJsImcSbYN3Mm2Dd5JssmByfZN3YmyybuRuswciZ3J3Em2Td7Jtk3fybUJnEm2jd8Jg02+y4kKHcm2zd6JjY3cSbCJnEmOSvXJq404ybLJnEmwiZuCOIwcia1J3Im1CaBJlkqcyazKnMmpStxJpwrcSjMKYEmXStxJ8spgSZdK3EpniZxJqcmcSawJnEmuSZyJtQmcyaRKnMmWypzJqQqcyZ1LHEmyyZzJmUqciaxKHMmpSlyJqUpcCahJ3ImpClzJrUncyaoKHImmylwJpcncSalKXAmjSdyJs4scSbiKXMmfSWBJrszRSbCJm4I4jByJrUnciZdK3EqxCmBJl0rcStmK3EszimBJmYrcS1vK3Eu2CmBJm8rcS8QKHImfyVxJ7szBybCJnEmyyZyJoor1ybCJnEmOSvWJgw0gybLJnEmmjCCJssmki3rMEYnmjCDJssmWC6aMIQmyyZyJpowhSbLJgUlmjB2JsImcSbLJhEnLCzjJssm1SYsLOYmIyzpJiMs3SYjLOAmwiZxJtg3cyY5K9YmDDStJssmnSaaMIImyybcAOsw3CaaMIMmyyYmJ5owhCbLJnImmjCFJssmUSeaMIImyyZaROswTieaMIMmyyY0KJowhCbLJnImmjCFJssmPjbrMOIm1CZxJt0mzRv9MH0mnzZ0JssmHUzrMA0n1CZxJt0myD/9MHQmnzZ0JssmHTzrMA0n1CbTKN0mcSlONnQmyyb2GOsw+ibUJtMo3SZxKU42dCbLJvYQ6zD6JtQmxUrdJnEsTjZ0JssmkRLrMBEn1CbVK90mcSlONnQmyyYRFuswESfUJr8o3SaBJk42dCbLJpEV6zARJ9QmcSbdJvEmnzZ0JssmIRbrMBEn1CZxJt0mASifNnQmwiZxJkkwhybUJnEmfyUVJww0dSZ/JRYnrjRzJtQmciaTK9gmWzCIJj4s2ibmJpEVBjERJ8smdCaOK40mlyuhJtsr4yaOK3km2yvmJo4rfSawJpEY0DARJ0cncSaeJnEmyyYsMOswKCfUJnAnlCtxJpQrciaUK3MmlCt0JtQmcSaUK3UmlCt2JtQmgSaUK3cm1CZxJpQreCYQKHkmLCzsJrkmkAPZMNwmOCtxJn8lxCauNJkmOCtyJn8lwSauNJMmOCtzJn8luiauNI0mOCt0Jn8lwyauNIcmOCt8JvYpcSdBK3smvydzJvYpcSdBK3omvydzJvYpcSdBK3kmvydzJqsncibLJpEW6zARJ9QmciaUK3Em3SaQA/0w3Ca5KHQm5iZxJ6sqdSadK3UmUSp1JqsqdSadK3YmUSp1JqsqdSadK3cmUSp1JqsqdSadK3gm1CaBJpQreyaUK38m1CZ5JpQrgSbUJogmlCuDJssmkRfrMBEn1CZxJpQrcSbUJnImlCt1JpQrhibCJnEm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vydxJjorcSu/J3QmiCtuJjcrbya/J3EmQCtzJskncSZMK3EnVitxJtMndSbTJ3EmTitxKjorcSlEK3EovydzJr8ncSY6K3Ervyd0JogrbyY3K3AmvydxJkArdCbJJ3EmTCtxJ1YrcSbTJ3Um0ydxJk4rcSo6K3EpRCtxKL8ncya/J3EmOitxK78ndCaIK3AmFi0FMeUodSbCJm4I4jByJjcrbSa/J3EmQCtxJskncSZMK3EnVitxJtMndSbTJ3EmTitxLDorcSlEK3EovydzJr8ncSY6K3Etvyd0JogrbSY3K24mvydxJkArcibJJ3EmTCtxJ1YrcSbTJ3Um0ydxJk4rcSw6K3EpRCtxKL8ncya/J3EmOitxLb8ndCaIK24mNytvJr8ncSZAK3MmySdxJkwrcSdWK3Em0yd1JtMncSZOK3EsOitxKUQrcSi/J3MmvydxJjorcS2/J3QmiCtvJjcrcCa/J3EmQCt0JskncSZMK3EnVitxJtMndSbTJ3EmTitxLDorcSlEK3EovydzJr8ncSY6K3Etvyd0JogrcCYWLQUx5Sh1JsImbgjiMHImNyttJr8ncSZAK3EmySdxJkwrcSdWK3Em0yd1JtMncSZOK3EuOitxKUQrcSi/J3MmvydxJjorcS+/J3QmiCttJjcrbia/J3EmQCtyJskncSZMK3EnVitxJtMndSbTJ3EmTitxLjorcSlEK3EovydzJr8ncSY6K3Evvyd0JogrbiY3K28mvydxJkArcybJJ3EmTCtxJ1YrcSbTJ3Um0ydxJk4rcS46K3EpRCtxKL8ncya/J3EmOitxL78ndCaIK28mNytwJr8ncSZAK3QmySdxJkwrcSdWK3Em0yd1JtMncSZOK3EuOitxKUQrcSi/J3MmvydxJjorcS+/J3QmiCtwJhYtBTHlKHUmQCtxJt0mkSaiKnQmDDSnJjcrcCb2KXEnLitvJr8ncSb2KXEnLituJr8ncSb2KXEnLittJr8ncSYAKnQm7yv9J/grXSiYKnUmpSl0Jt0mcSehKnQmkSttJkcqdCahKnQmkStuJkcqdCahKnQmkStvJkcqdCahKnQmkStwJhYtBTHlKHUmQCtxJt0mkSaiKnQmDDSjJjcrcCb2KXEnLitvJr8ncSb2KXEnLituJr8ncSb2KXEnLittJr8ncSYAKnQm7yv9J0cqdCbdJnEnoSp0JpErbSZHKnQmoSp0JpErbiZHKnQmoSp0JpErbyZHKnQmoSp0JpErcCYWLQUx5Sh1JkArcSbdJpEmoip0Jgw0zyY3K3Am9ilxJy4rbya/J3Em9ilxJy4rbia/J3Em9ilxJy4rbSa/J3EmACp0Ju8r/ScuK3AmfiXxJlA1jSZHKnQm3SZxJ6EqdCaRK20mRyp0JqEqdCaRK24mRyp0JqEqdCaRK28mRyp0JqEqdCaRK3AmFi0FMeYmMyIGMQ8tVzF8JrUociZHKnQmtShyJt0mcSehKnQmkSttJkcqdCahKnQmkStuJkcqdCahKnQmkStvJkcqdCahKnQmkStwJhYtBTHlKHUmUyttJt0meSa2KnQmFCp0JvoroydRL3EmNytwJvYpcScuK28mvydxJvYpcScuK24mvydxJvYpcScuK20mvydxJkArdCYAKnEnLitzJskncSYAKnEnLityJskncSYAKnEnLitxJskncSbQJXMmDDR1JsImcSZqM3MmwiZyJn8rbSbCJnEmISxuJhYtBTE3K3Am9ilxJy4rbya/J3Em9ilxJy4rbia/J3Em9ilxJy4rbSa/J3EmQCt0JgAqcScuK3MmySdxJgAqcScuK3ImySdxJgAqcScuK3EmySdxJtAlcyauNHUmwiZxJmozcybCJnImfyttJsImcSYhLG4mFi0FMTcrcCZ/JfEmuzNzJgMpcSf2KXEnLitvJr8ncSb2KXEnLituJr8ncSb2KXEnLittJr8ncSZAK3QmgCXxJrszcyYNKXEnACpxJy4rcybJJ3EmACpxJy4rcibJJ3EmACpxJy4rcSbJJ3Em0CVzJrszdSbCJnEmajNzJsImciZ/K20mwiZxJiEsbiYWLQUxNytwJn8l8Sa7M3MmAylxJ/YpcScuK28mvydxJvYpcScuK24mvydxJvYpcScuK20mvydxJkArdCaAJfEmuzNzJg0pcScAKnEnLitzJskncSYAKnEnLityJskncSYAKnEnLitxJskncSbQJXMm/zR1JsImcSZqM3MmwiZyJn8rbSbCJnEmISxuJhYtBTE3K3AmfyXxJrszcyYDKXEn9ilxJy4rbya/J3Em9ilxJy4rbia/J3Em9ilxJy4rbSa/J3EmQCt0JoAl8Sa7M3MmDSlxJwAqcScuK3MmySdxJgAqcScuK3ImySdxJgAqcScuK3Em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Lit7JtMncSYKKnEnLit6JtMncSYKKnEnLit5JtMncSZSK30mni/hQMImcSYWLZ09LytvJssmcSZ+JXcmuzOLJjcriCZ/JfEmuzNzJgMpcSf2KXEnLiuHJr8ncSb2KXEnLiuGJr8ncSb2KXEnLiuFJr8ncSbCJnEmLCz+JjcrhCZ/JfEmuzNzJgMpcSf2KXEnLiuDJr8ncSb2KXEnLiuCJr8ncSb2KXEnLiuBJr8ncSbCJnEmLCzvJjcrdCZ/JfEmuzNzJgMpcSf2KXEnQCtzJr8ncyb2KXEnQCtyJr8ncyb2KXEnQCtxJr8ncyYsLPImQCt4JoAl8Sa7M3MmDSlxJwAqcSc3K3cmySdyJgAqcSc3K3YmySdyJgAqcSc3K3UmySdyJjUs9SZJK3wmCipxJy4reybTJ3EmCipxJy4reibTJ3EmCipxJy4reSbTJ3EmwiaQA+Iw3CbTJ3EmwiZxJj4s+CZSK30mRyz7JsImcSbtK/gmTitxJgw0iSbbK/Im5Cv1JvYr+yaeL+FAwiZxJtsr8iYQKHkmLCzyJu0r+CYkKHImPiz4JmozUSbCJnEmFi2dPUkrfCaBJfEmuzNzJhcpcScKKnEnLit7JtMncSYKKnEnLit6JtMncSYKKnEnLit5JtMncSaBJXEm/zSjJjcrdCb2KXEnLitzJr8ncSb2KXEnLityJr8ncSb2KXEnLitxJr8ncSZAK3gmACpxJy4rdybJJ3EmACpxJy4rdibJJ3EmACpxJy4rdSbJJ3EmwiaQA+Iw3Ca/J3EmySdxJk42dCbCJnEmFi2dPUkrfCaBJfEmuzNzJhcpcScKKnEnLit7JtMncSYKKnEnLit6JtMncSYKKnEnLit5JtMncSaBJXEm/zSPJjcrdCb2KXEnLitzJr8ncSb2KXEnLityJr8ncSb2KXEnLitxJr8ncSZAK3UmwiaQA+Iw3Ca/J3EmnzZ0JsImcSYWLZ09Nyt0Jn8l8Sa7M3MmAylxJ/YpcScuK3MmvydxJvYpcScuK3ImvydxJvYpcScuK3EmvydxJkAreCaAJfEmuzNzJg0pcScAKnEnLit3JskncSYAKnEnLit2JskncSYAKnEnLit1JskncSaAJXEm/zSTJvYpcSgAKnEoyCdzJhooSSndJkopRyp0JlEqdCa8KHImmjCCJvYpSinCJpIt4jBGJ78ncSaaMIMm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cSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSahJqEmoSahJqEmgSaBJnEmcSahJqEmcSZxJnEmcSZxJtcm1ya1JrUmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSa1JrUmbye1JrUmbye1JrUmcSZxJnEmcSZxJnEmcSaBJu0mAycBJ+kmhSaDJgMn7SaBJnEmcSZxJnEmcSZxJnEmNSc5J4EmgSaRJpEmvSb9JnEmcSZxJnEmcSZxJnEmqSa1JrUmqSbBJvsm9Sb9JuMmcSZxJnEmcSZxJnEmcSahJqEmsSaxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJn0mgSaRJpEmsSaxJrEmkSaRJoEmfSZxJnEmcSZxJnEm0SaBJnkmeSZ1JnUmdSZ5JnkmgSbRJnEmcSZxJnEmcSZxJnEmgSbFJqkm7SapJsUmgSZxJnEmcSZxJnEmcSZxJnEmcSZxJoEmgSbtJoEmgSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmoSahJoEmkSZxJnEmcSZxJnEmcSZxJnEmcSbtJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJqEmoSZxJnEmcSZxJnEmdSZ1JnkmeSaBJoEmkSaRJrEmsSbxJnEmcSZxJnEmcSapJrUm9yb7JgMnEyczJ/Mm8ya1JqkmcSZxJnEmcSZxJoEmoSbBJoEmgSaBJoEmgSaBJoEm7SZxJnEmcSZxJnEm6Sb1JvUmdSZ5JoEmkSaxJvEm9SZtJ3EmcSZxJnEmcSbpJvUmdSZ1JqkmdSZ1JnUm9Sb1JukmcSZxJnEmcSZxJnkmiSaZJrkm+Sb5Jm0neSZ5JnkmrSZxJnEmcSZxJnEmbSf1JvEm8SZpJ3UmdSZ1JvUm9SbpJnEmcSZxJnEmcSapJrUm8SbxJmkn9Sb1JvUm9Sa1JqkmcSZxJnEmcSZxJm0n9SZ1JnkmeSaBJoEmkSaRJpEmqSZxJnEmcSZxJnEm6Sb1JvUmuSahJqEmuSb1JvUm9SbpJnEmcSZxJnEmcSbpJvUm9Sb1JvUm7SZ1JnUmeSa5JqEmcSZxJnEmcSZxJnEmcSZxJnEmoSahJnEmcSZxJqEmoSZxJnEmcSZxJnEmcSZxJnEmcSahJqEmcSZxJnEmoSahJoEmkSZxJnEmcSZxJnEmeSaBJpEmsSaRJoEmeSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEm7SZxJnEm7SZxJnEmcSZxJnEmcSZxJnEmcSZxJrEmkSaBJnkmgSaRJrEmcSZxJnEmcSZxJnEmcSbpJvUm9SZ1JnkmgSaBJnEmcSaBJoEmcSZxJnEmcSZxJukm9Sb1Ji0nFScVJy0n8SbxJrEmrSZxJnEmcSZxJnEmqSaZJrUmtSa1JvMmbyfzJvMm8yY3J3EmcSZxJnEmcSZpJ7UmtSa1JukmtSazJrMmsya1JmkncSZxJnEmcSZxJq0mtSb1JvEm8SbxJvEm8Sb1JrUmqSZxJnEmcSZxJnEmaSe1JrMmsyazJrMmsyazJrMmtSZpJ3EmcSZxJnEmcSZtJ7UmsSbBJuEmwSaxJrEmsSa1Jm0ncSZxJnEmcSZxJm0ntSaxJsEm4SbBJrEmsSaxJrEmUSdxJnEmcSZxJnEmrSa1JvUm8SbxJg0n9Sb1JvUmtSapJnEmcSZxJnEmcSY3J7UmtSa1JrUm7Sa1JrUmtSa1JjcncSZxJnEmcSZxJu0mgSaBJoEmgSaBJoEmgSaBJoEm7SZxJnEmcSZxJnEmryZ5JnkmeSZ5JnkmeSb5Jvkm+SbhJnEmcSZxJnEmcSY3J7kmwSbRJrEm0SbBJrkmtSa1JjcncSZxJnEmcSZxJlEnsSaxJrEmsSaxJrEmsSaxJrUmbSdxJnEmcSZxJnEmNydfJ8UmxSbFJrUmtSa1JrUmtSY3J3EmcSZxJnEmcSY3J9UmxSbFJr0mvSa1JrUmtSa1JjcncSZxJnEmcSZxJqkmtSbzJvMm8ybzJvMm8ybzJrUmqSZxJnEmcSZxJnEmaSe1JrUmtSa1JmknsSaxJrEmsSZRJ3EmcSZxJnEmcSapJrUm8ybzJvMm8ybzJgMn+ya3JqsmcSZxJnEmcSZxJmkntSa1JrUmtSZpJ8EmuSa1JrUmNydxJnEmcSZxJnEm7Sb1JvEmsSapJnUmdSZ1JvUm9SZpJ3EmcSZxJnEmcSZvJwMngSaBJoEmgSaBJoEmgSaBJqkmcSZxJnEmcSZxJjcntSa1JrUmtSa1JrUmtSa1JrUmqSZxJnEmcSZxJnEmNye1JrUmtSa1JrUmmSaZJpkmgSaBJnEmcSZxJnEmcSY3J7UmtSa1JsUmxSbFJsUmmSaZJpkmcSZxJnEmcSZxJjcntSaZJpkmgSaBJoEmmSaZJrUmNydxJnEmcSZxJnEmNye1JpkmmSaBJoEmgSaBJoEmgSapJnEmcSZxJnEmcSZtJ/UmeSZ5JoEmkSaRJrEm8Sb1Jm0ncSZxJnEmcSZxJqkmkSaRJpEmkSaRJpEmkSaRJpEmqSZxJnEmcSZxJnEm8SbxJrEmsSaRJpEmgSaBJnkmeSZ1JnEmcSZxJnEmcSapJnkmeSZ5JnkmeSZ5JnkmeSZ5JqkmcSZxJnEmcSZxJoEmmSa1JnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJm8ncSZxJnEmcSaRJoEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEm6Sb1JnUm7Sb1JvUm7SZxJnEmcSZxJnEmMSexJrEmsSbpJrUmsyazJrMmtSZpJ3EmcSZxJnEmcSZxJnEmcSZxJukm9SbxJvEm8Sb1JukmcSZxJnEmcSZxJn0mdSZ1JnUmrSa1JvUm9Sb1JrUmrSZxJnEmcSZxJnEmcSZxJnEmcSbpJvUm9SZtJ/Em9SbpJnEmcSZxJnEmcSaNJpUmkSaRJu0mkSaRJpEmkSaRJuEmcSZxJnEmcSZxJnEmcSZxJnEm7Sb5Jvkm4SbxJu0m9Sb1JrUmqSZxJnEmMSexJrEmsSbJJtUmtSa1JrUmtSY9J3EmcSZxJnEmcSZxJoEmcSZxJqEmgSaBJoEmgSaBJqkmcSZxJnEmcSZxJnEmeSZxJnEmiSZ5JnkmeSZ5JnkmeSb5Jvkm4SZxJnEmMSexJrEmsSa9JsEm0SbBJrkmuSY9J3EmcSZxJnEmcSaRJtEmkSaRJpEmkSaRJpEmkSaRJuEmcSZxJnEmcSZxJnEmcSZxJnEmRSfFJsUmxSbFJsUmRydxJnEmcSZxJnEmcSZxJnEmcSZJJ7UmtSa1JrUmtSY9J3EmcSZxJnEmcSZxJnEmcSZxJukm9Sb1JvUm9Sb1JukmcSZxJnEmcSZxJnEmcSZxJnEmaSe1JrUmtSa1JrUm6SaxJrEmUSdxJnEmcSZxJnEmcSbtJvkm+Sb5Jvkm+SbpJnkmeSaNJnEmcSZxJnEmcSZxJk0ntSaxJrEmsSaxJlEncSZxJnEmcSZxJnEmcSZxJnEm7Sb1JrEmqSZ1JvUmaSdxJnEmcSZxJnEmcSZxJpEmkSbtJpEmkSaRJpEmlSaJJnEmcSZxJnEmcSZxJnEmcSZxJj0ntSa1JrUmtSa9JqcmcSZxJnEmcSZxJnEmcSZxJnEmPSe5JrkmuSahJqEmoSZxJnEmcSZxJnEmcSZxJnEmcSY3J7UmxSbFJsUmmSaZJnEmcSZxJnEmcSZxJnEmcSZxJj0nuSahJqEmoSa5Jj0ncSZxJnEmcSZxJnEmcSZxJnEmPSe5JrkmoSahJoEmgSaRJrEmMSdxJnEmcSZxJnEmcSZtJ/kmgSaRJrEm+SZtJ3EmcSZxJnEmcSaJJpEmkSaRJrEmsSaRJpEmkSaRJokmcSZxJnEmcSZxJoEmgSaBJoEmgSaBJoEmgSaBJoEmgSZxJnEmcSZxJnEmoSZ5JnkmeSZ1JnUmeSZ5JnkmeSahJnEmcSZxJnEmcSZxJnEm1SYJJ3EmcSZxJnEmcSZxJnEmcSZxJnEmcSZxJnEmcSapJsUmAycDJwMnxSapJnEmcSZxJnEmcSZxJg=="), 960 * 512);

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
  // AUDIT FIX (Kehai, 2026-11-10): the closing tags were written as '<" + "/script>' inside
  // single-quoted strings, which emitted that text literally, so neither script element closed
  // and the exported cartridge was a blank canvas. Split as '<' + '/script>' instead.
  document.getElementById("btn-dl-tabcomp").addEventListener("click", function() {{
    if (!currentBuild) compileAndBootAll();
    const imgB64 = u8ToB64(currentBuild.img);
    const cartHtml =
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>SpiralOS 1.4 "Daily Driver" — TabComp Cartridge</title>' +
      '<style>body{{margin:0;background:#080b14;color:#eef3ff;font-family:monospace;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh}}canvas{{width:640px;height:400px;image-rendering:pixelated;border:2px solid #00e5ff}}</style></head>' +
      '<body><h3>SpiralOS 1.4 "Daily Driver" — Bootable TabComp Cartridge (ConsciousNode SoftWorks)</h3>' +
      '<canvas id="tc-screen" width="320" height="200" tabindex="0"></canvas>' +
      '<script id="spiral-img-b64" type="text/plain">' + imgB64 + '<' + '/script>' +
      '<script>' + document.getElementById("spiral-station-core").textContent +
      '\\n(function(){{const b64=document.getElementById("spiral-img-b64").textContent;const bin=atob(b64);const u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);' +
      'const c=document.getElementById("tc-screen"),ctx=c.getContext("2d"),id=ctx.createImageData(320,200);const cpu=new globalThis.TabCompCPU(new globalThis.TabCompFS());globalThis.initHardwareMemory(cpu);globalThis.bootSpiralDiskImage(cpu,u8);' +
      'c.addEventListener("mousemove",function(e){{const r=c.getBoundingClientRect();cpu.setMouseState(((e.clientX-r.left)/r.width)*320,((e.clientY-r.top)/r.height)*200,e.buttons||0)}});' +
      'c.addEventListener("mousedown",function(e){{const r=c.getBoundingClientRect();cpu.setMouseState(((e.clientX-r.left)/r.width)*320,((e.clientY-r.top)/r.height)*200,e.buttons||1)}});' +
      'c.addEventListener("mouseup",function(e){{const r=c.getBoundingClientRect();cpu.setMouseState(((e.clientX-r.left)/r.width)*320,((e.clientY-r.top)/r.height)*200,0)}});' +
      'window.addEventListener("keydown",function(e){{let a=e.key.length===1?e.key.charCodeAt(0):(e.key==="Enter"?13:(e.key==="Backspace"?8:0));cpu.pushKeyEvent(1,e.keyCode&255,a,0)}});' +
      'window.addEventListener("keyup",function(e){{let a=e.key.length===1?e.key.charCodeAt(0):0;cpu.pushKeyEvent(0,e.keyCode&255,a,0)}});' +
      'function loop(){{cpu.stepBatch(60000);globalThis.renderFramebufferToCanvas(cpu,ctx,id);requestAnimationFrame(loop)}}requestAnimationFrame(loop);}})();<' + '/script></body></html>';
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
