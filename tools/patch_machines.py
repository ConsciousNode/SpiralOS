#!/usr/bin/env python3
"""
Patches TabComp 1.3 (tabcomp.html) and Hummingbird 1.1 (hummingbird.html)
for SpiralOS 1.1 ("Real Spiral"):
  1. StudioNet Virtual Network Controller + BroadcastChannel + In-Memory Switch
  2. Deterministic Procedural Sonder Engine behind Station 0x00FE ("sonder.gw")
     with 4 distinct procedural templates, deterministic FNV-1a + xorshift32
     generation, inline <img src='...'> tags, and working <a href='...'> graph.
  3. 128 KB SPIR image boot/reboot support on TabComp.
  4. "strictBios" real-hardware simulation mode on HummingbirdPC:
     - INT 13h rejects cross-track reads/writes ((sect - 1) + count > 18)
     - VBE LFB PhysBasePtr at 0xFD000000
     - VBE mode 0x0112 is 24-bpp only (pitch 1920)
     - No StudioNet card (0x02A0..0x02AF -> 0xFF) and no FDC (0x3F0..0x3F7 -> 0xFF)
"""
import os

STUDIO_NET_SHARED_JS = r"""
  // ==========================================================================
  // StudioNet Virtual Network Controller + In-Memory Switch + BroadcastChannel
  // + Sonder Deterministic Procedural Hypertext Engine (§5)
  //
  // Provenance: The Sonder Procedural Gateway engine below is an original
  // deterministic procedural hypertext generator created by ConsciousNode
  // SoftWorks for SpiralOS 1.1, inspired by early 1990s hyperCard/Gopher/WWW
  // procedural worldbuilders. It hashes the request path with 32-bit FNV-1a,
  // seeds a deterministic xorshift32 PRNG, selects one of 4 distinct document
  // templates (Atlas, Chronicle, Schematic, Archive), and synthesizes
  // interconnected hypertext pages with inline bitmap <img src=...> tags.
  // ==========================================================================
  function generateSonderProceduralPage(rawPath) {
    let path = (rawPath || "/index").trim();
    if (!path.startsWith("/")) path = "/" + path;
    // 32-bit FNV-1a hash of the normalized path
    let h = 0x811C9DC5;
    for (let i = 0; i < path.length; i++) {
      h ^= path.charCodeAt(i) & 0xFF;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    let state = (h || 0x1991B007) >>> 0;
    const nextRand = () => {
      state ^= (state << 13) >>> 0;
      state ^= (state >>> 17) >>> 0;
      state ^= (state << 5) >>> 0;
      return (state >>> 0);
    };
    const pick = (arr) => arr[nextRand() % arr.length];

    const ADJ = ["Aether", "Helix", "Ceres", "Kyoto", "Harmonic", "Sub-Lunar", "Cobalt", "Phosphor", "Phase-Locked", "Isochronous", "Vortex", "Lattice"];
    const NOUN = ["Resonator", "Observatory", "Chronicle", "Switchyard", "Relay", "Cartridge", "Manifold", "Synchrotron", "Telemetry", "Codex", "Archive", "Beacon"];
    const VERB = ["stabilizes", "modulates", "transcribes", "routes", "illuminates", "synchronizes", "anchors", "Indexes"];
    const LOC = ["Sector 7-G", "Station Oberon", "Node Zürich-88", "Bay 14", "Orbital Ring III", "Vault 0x00FE", "Sub-Net Delta", "Mount Hiei Lab"];
    const SLUGS = ["/atlas", "/chronicle", "/schematic", "/archive", "/beacon", "/lattice", "/observatory", "/codex", "/relay", "/synchrotron"];

    let templateId = h % 4;
    if (path.startsWith("/atlas")) templateId = 0;
    else if (path.startsWith("/chronicle")) templateId = 1;
    else if (path.startsWith("/schematic")) templateId = 2;
    else if (path.startsWith("/archive")) templateId = 3;
    const codeHex = (h & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
    const freqMHz = 10 + (nextRand() % 890);
    const driftPpm = (nextRand() % 95) + 5;
    const adj1 = pick(ADJ), noun1 = pick(NOUN);
    const adj2 = pick(ADJ), noun2 = pick(NOUN);
    const loc1 = pick(LOC), verb1 = pick(VERB);
    let link1 = pick(SLUGS);
    if (link1 === path) link1 = SLUGS[(h + 1) % SLUGS.length];
    const link2 = pick(SLUGS), link3 = "/node-" + ((nextRand() % 900) + 100);
    const imgPath = (h & 1) ? "/art/spiral.pic" : "/art/prism.pic";

    if (templateId === 0) {
      // Template 0: Aether Atlas & Topological Survey
      return (
        "<h1>[ATLAS] " + adj1 + " (" + path + ")</h1>\n" +
        "<p>ID:SND-" + codeHex + " " + loc1 + " " + freqMHz + "MHz</p>\n" +
        "<img src='" + imgPath + "'>\n" +
        "<p>" + adj2 + " " + noun2 + " " + verb1 + " (" + driftPpm + "ppm).</p>\n" +
        "<p><a href='" + link1 + "'>Wing</a> <a href='" + link2 + "'>Log</a> <a href='" + link3 + "'>#" + codeHex + "</a></p>"
      );
    } else if (templateId === 1) {
      // Template 1: 1991 Helix Chronicle & Historical Dispatch
      const year = 1984 + (nextRand() % 12);
      return (
        "<h1>[CHRONICLE " + year + "] (" + path + ")</h1>\n" +
        "<p>Ref:CHR-" + codeHex + " @ " + loc1 + "</p>\n" +
        "<img src='" + imgPath + "'>\n" +
        "<p>" + adj2 + " " + noun2 + " " + verb1 + " @ " + freqMHz + "MHz.</p>\n" +
        "<p><a href='" + link1 + "'>Dossier</a> <a href='" + link2 + "'>Notes</a> <a href='" + link3 + "'>#" + codeHex + "</a></p>"
      );
    } else if (templateId === 2) {
      // Template 2: Hardware Schematic & Telemetry Matrix
      return (
        "<h1>[SCHEMATIC] (" + path + ")</h1>\n" +
        "<p>HW-" + codeHex + " | " + freqMHz + "MHz | " + loc1 + "</p>\n" +
        "<img src='" + imgPath + "'>\n" +
        "<p>CH0=" + adj2 + " CH1=" + noun1 + " (" + driftPpm + "us)</p>\n" +
        "<p><a href='" + link1 + "'>Spec</a> <a href='" + link2 + "'>Map</a> <a href='" + link3 + "'>#" + codeHex + "</a></p>"
      );
    } else {
      // Template 3: ConsciousNode Archive & Signal Ledger
      return (
        "<h1>[ARCHIVE] Vault " + codeHex + " (" + path + ")</h1>\n" +
        "<p>Locus: " + loc1 + " | " + driftPpm + "dB</p>\n" +
        "<img src='" + imgPath + "'>\n" +
        "<p>" + adj2 + " " + noun2 + " " + verb1 + " SPIR.</p>\n" +
        "<p><a href='" + link1 + "'>LedgerA</a> <a href='" + link2 + "'>LedgerB</a> <a href='" + link3 + "'>#" + codeHex + "</a></p>"
      );
    }
  }

  if (typeof globalThis !== "undefined") {
    globalThis.generateSonderProceduralPage = generateSonderProceduralPage;
  }

  if (typeof globalThis !== "undefined" && !globalThis.__STUDIONET_SWITCH) {
    globalThis.__STUDIONET_SWITCH = {
      nics: new Set(),
      packetLog: [],
      register(nic) { this.nics.add(nic); },
      unregister(nic) { this.nics.delete(nic); },
      route(srcNic, frameU8) {
        const copy = new Uint8Array(frameU8);
        const dstNode = copy.length >= 2 ? (copy[0] | (copy[1] << 8)) : 0xFFFF;
        const srcNode = copy.length >= 4 ? (copy[2] | (copy[3] << 8)) : srcNic.nodeId;
        this.packetLog.push({
          time: Date.now(),
          srcNode,
          dstNode,
          proto: copy.length >= 5 ? copy[4] : 0,
          len: copy.length,
          bytes: copy
        });
        if (this.packetLog.length > 256) this.packetLog.shift();
        for (const nic of this.nics) {
          if (nic !== srcNic) {
            if (dstNode === 0xFFFF || dstNode === 0x0000 || nic.nodeId === dstNode || nic.promiscuous) {
              nic._enqueueRx(copy);
            }
          }
        }
        // Built-in Sonder Procedural Internet Gateway (Station 0x00FE = "sonder.gw")
        if (dstNode === 0x00FE && copy.length >= 16) {
          const proto = copy[4];
          const srcPort = copy[6] | (copy[7] << 8);
          const dstPort = copy[8] | (copy[9] << 8);
          const seqNum = copy[10] | (copy[11] << 8);
          const reqPayload = new TextDecoder().decode(copy.subarray(16));
          let path = "/index";
          const m = reqPayload.match(/GET\s+([^\s\0]+)/);
          if (m) path = m[1];
          const body = generateSonderProceduralPage(path);
          const bodyBytes = new TextEncoder().encode(body);
          const maxBody = Math.min(480, bodyBytes.length);
          const resp = new Uint8Array(16 + maxBody);
          resp[0] = srcNode & 0xFF; resp[1] = (srcNode >> 8) & 0xFF;
          resp[2] = 0xFE; resp[3] = 0x00;
          resp[4] = proto;
          resp[5] = 0x06; // ACK | PSH
          resp[6] = dstPort & 0xFF; resp[7] = (dstPort >> 8) & 0xFF;
          resp[8] = srcPort & 0xFF; resp[9] = (srcPort >> 8) & 0xFF;
          resp[10] = 1; resp[11] = 0;
          resp[12] = (seqNum + 1) & 0xFF; resp[13] = ((seqNum + 1) >> 8) & 0xFF;
          resp[14] = maxBody & 0xFF; resp[15] = (maxBody >> 8) & 0xFF;
          resp.set(bodyBytes.subarray(0, maxBody), 16);
          srcNic._enqueueRx(resp);
        }
      }
    };
  }

  class StudioNetNIC {
    constructor(host, defaultNodeId = 0x0101) {
      this.host = host;
      this.defaultNodeId = defaultNodeId & 0xFFFF;
      this.nodeId = this.defaultNodeId;
      this.promiscuous = false;
      this.irqEnabled = false;
      this.dmaAddr = 0;
      this.txLen = 0;
      this.lastRxLen = 0;
      this.txCount = 0;
      this.rxCount = 0;
      this.rxQueue = [];
      this.pioTxBuf = [];
      this.pioRxBuf = [];
      this.pioRxIdx = 0;
      this.instanceId = Math.random().toString(36).slice(2);
      this.bc = null;
      if (typeof BroadcastChannel !== "undefined" && typeof process === "undefined") {
        try {
          this.bc = new BroadcastChannel("studionet-v1");
          this.bc.onmessage = (ev) => {
            const d = ev && ev.data;
            if (!d || d.srcId === this.instanceId || !d.frame) return;
            const u8 = new Uint8Array(d.frame);
            const dstNode = u8.length >= 2 ? (u8[0] | (u8[1] << 8)) : 0xFFFF;
            if (dstNode === 0xFFFF || dstNode === 0x0000 || dstNode === this.nodeId || this.promiscuous) {
              this._enqueueRx(u8);
            }
          };
        } catch (e) {}
      }
      if (typeof globalThis !== "undefined" && globalThis.__STUDIONET_SWITCH) {
        globalThis.__STUDIONET_SWITCH.register(this);
      }
    }

    reset() {
      this.nodeId = this.defaultNodeId;
      this.irqEnabled = false;
      this.dmaAddr = 0;
      this.txLen = 0;
      this.lastRxLen = 0;
      this.txCount = 0;
      this.rxCount = 0;
      this.rxQueue = [];
      this.pioTxBuf = [];
      this.pioRxBuf = [];
      this.pioRxIdx = 0;
    }

    _enqueueRx(frameU8) {
      if (this.rxQueue.length >= 128) this.rxQueue.shift();
      this.rxQueue.push(new Uint8Array(frameU8));
      this.rxCount = (this.rxCount + 1) | 0;
      if (this.host && this.host.pic && this.irqEnabled) {
        this.host.pic.raiseIRQ(10);
      }
      if (this.host && this.host._syncStudioNetMMIO) {
        this.host._syncStudioNetMMIO();
      }
    }

    sendFrame(frameU8) {
      if (!frameU8 || frameU8.length === 0) return 0;
      const copy = new Uint8Array(frameU8.subarray(0, Math.min(512, frameU8.length)));
      this.txCount = (this.txCount + 1) | 0;
      if (typeof globalThis !== "undefined" && globalThis.__STUDIONET_SWITCH) {
        globalThis.__STUDIONET_SWITCH.route(this, copy);
      }
      if (this.bc) {
        try {
          this.bc.postMessage({ srcId: this.instanceId, frame: Array.from(copy) });
        } catch (e) {}
      }
      if (this.host && this.host._syncStudioNetMMIO) {
        this.host._syncStudioNetMMIO();
      }
      return copy.length;
    }

    recvFrame() {
      if (this.rxQueue.length === 0) {
        this.lastRxLen = 0;
        return null;
      }
      const f = this.rxQueue.shift();
      this.lastRxLen = f.length;
      if (this.host && this.host._syncStudioNetMMIO) {
        this.host._syncStudioNetMMIO();
      }
      return f;
    }

    // Hummingbird I/O Port Interface (0x02A0 .. 0x02AF)
    portRead(port) {
      const off = port - 0x02A0;
      switch (off) {
        case 0x00: return 0x53; // 'S'
        case 0x01: return 0x4E; // 'N'
        case 0x02: return (this.rxQueue.length > 0 ? 0x01 : 0x00) | 0x04 | (this.irqEnabled ? 0x08 : 0x00);
        case 0x03: return 0x00;
        case 0x04: return this.nodeId & 0xFF;
        case 0x05: return (this.nodeId >>> 8) & 0xFF;
        case 0x06: {
          const l = this.lastRxLen || (this.rxQueue.length > 0 ? this.rxQueue[0].length : 0);
          return l & 0xFF;
        }
        case 0x07: {
          const l = this.lastRxLen || (this.rxQueue.length > 0 ? this.rxQueue[0].length : 0);
          return (l >>> 8) & 0xFF;
        }
        case 0x08: return this.dmaAddr & 0xFF;
        case 0x09: return (this.dmaAddr >>> 8) & 0xFF;
        case 0x0A: return (this.dmaAddr >>> 16) & 0xFF;
        case 0x0B: return (this.dmaAddr >>> 24) & 0xFF;
        case 0x0C: {
          if (this.pioRxIdx < this.pioRxBuf.length) {
            return this.pioRxBuf[this.pioRxIdx++] & 0xFF;
          }
          return 0x00;
        }
        case 0x0D: return (this.txCount & 0xFF);
        case 0x0E: return this.rxCount & 0xFF;
        case 0x0F: return (this.rxCount >>> 8) & 0xFF;
        default: return 0x00;
      }
    }

    portWrite(port, val) {
      val &= 0xFF;
      const off = port - 0x02A0;
      switch (off) {
        case 0x02: { // Command register
          if (val === 0x01) { // CMD_TX_SEND
            const len = Math.max(0, Math.min(512, this.txLen));
            if (len > 0 && this.host && this.host.ram) {
              const addr = this.dmaAddr >>> 0;
              const frame = this.host.ram.subarray(addr, addr + len);
              this.sendFrame(frame);
            } else if (this.pioTxBuf.length > 0) {
              this.sendFrame(new Uint8Array(this.pioTxBuf));
              this.pioTxBuf = [];
            }
          } else if (val === 0x02) { // CMD_RX_POP
            const f = this.recvFrame();
            if (f && this.host && this.host.ram) {
              const addr = this.dmaAddr >>> 0;
              for (let i = 0; i < f.length; i++) {
                this.host.physWrite8(addr + i, f[i]);
              }
              this.pioRxBuf = f;
              this.pioRxIdx = 0;
            } else {
              this.lastRxLen = 0;
            }
          } else if (val === 0x03) { // CMD_RESET
            this.reset();
          } else if (val === 0x04) { // CMD_IRQ_EN
            this.irqEnabled = true;
          } else if (val === 0x05) { // CMD_IRQ_DIS
            this.irqEnabled = false;
          }
          break;
        }
        case 0x04: this.nodeId = (this.nodeId & 0xFF00) | val; break;
        case 0x05: this.nodeId = (this.nodeId & 0x00FF) | (val << 8); break;
        case 0x06: this.txLen = (this.txLen & 0xFF00) | val; break;
        case 0x07: this.txLen = (this.txLen & 0x00FF) | (val << 8); break;
        case 0x08: this.dmaAddr = ((this.dmaAddr & 0xFFFFFF00) | val) >>> 0; break;
        case 0x09: this.dmaAddr = ((this.dmaAddr & 0xFFFF00FF) | (val << 8)) >>> 0; break;
        case 0x0A: this.dmaAddr = ((this.dmaAddr & 0xFF00FFFF) | (val << 16)) >>> 0; break;
        case 0x0B: this.dmaAddr = ((this.dmaAddr & 0x00FFFFFF) | (val << 24)) >>> 0; break;
        case 0x0C: this.pioTxBuf.push(val); break;
      }
    }
  }
"""

def patch_tabcomp():
    src_path = "user_uploaded_files/ttl=63d/user_uploaded/tabcomp_1_3_the_computer_that_fits_in_your_tab.html"
    with open(src_path, "r", encoding="utf-8") as f:
        html = f.read()

    old_regions = """  const HARDWARE_REGIONS = [
    { name: "FONT_ROM",   start: 0x0EF000, size: 768   }, // 0x0EF000..0x0EF2FF
    { name: "VRAM",       start: 0x0F0000, size: 64000 }, // 0x0F0000..0x0FF9FF
    { name: "PALETTE",    start: 0x0FFA00, size: 768   }, // 0x0FFA00..0x0FFCFF
    { name: "TIMER_MS",   start: 0x0FFD00, size: 4     }, // 0x0FFD00..0x0FFD03
    { name: "VSYNC_CNT",  start: 0x0FFD04, size: 4     }, // 0x0FFD04..0x0FFD07
    { name: "SOUND_REGS", start: 0x0FFD20, size: 32    }  // 0x0FFD20..0x0FFD3F
  ];"""
    new_regions = """  const HARDWARE_REGIONS = [
    { name: "FONT_ROM",   start: 0x0EF000, size: 768   }, // 0x0EF000..0x0EF2FF
    { name: "VRAM",       start: 0x0F0000, size: 64000 }, // 0x0F0000..0x0FF9FF
    { name: "PALETTE",    start: 0x0FFA00, size: 768   }, // 0x0FFA00..0x0FFCFF
    { name: "TIMER_MS",   start: 0x0FFD00, size: 4     }, // 0x0FFD00..0x0FFD03
    { name: "VSYNC_CNT",  start: 0x0FFD04, size: 4     }, // 0x0FFD04..0x0FFD07
    { name: "MOUSE_REGS", start: 0x0FFD08, size: 16    }, // 0x0FFD08..0x0FFD17
    { name: "SOUND_REGS", start: 0x0FFD20, size: 32    }, // 0x0FFD20..0x0FFD3F
    { name: "STUDIONET",  start: 0x0FFD40, size: 64    }  // 0x0FFD40..0x0FFD7F
  ];"""
    assert old_regions in html, "old_regions not found"
    html = html.replace(old_regions, STUDIO_NET_SHARED_JS + "\n" + new_regions, 1)

    old_init_end = """    for (let i = 16; i < 256; i++) {
      cpu.ram[0x0FFA00 + i * 3 + 0] = (i * 37) & 255;
      cpu.ram[0x0FFA00 + i * 3 + 1] = (i * 73) & 255;
      cpu.ram[0x0FFA00 + i * 3 + 2] = (i * 139) & 255;
    }
  }"""
    new_init_end = """    for (let i = 16; i < 256; i++) {
      cpu.ram[0x0FFA00 + i * 3 + 0] = (i * 37) & 255;
      cpu.ram[0x0FFA00 + i * 3 + 1] = (i * 73) & 255;
      cpu.ram[0x0FFA00 + i * 3 + 2] = (i * 139) & 255;
    }
    cpu.ramDV.setInt32(0x0FFD08, cpu.mouseX || 160, true);
    cpu.ramDV.setInt32(0x0FFD0C, cpu.mouseY || 100, true);
    cpu.ramDV.setInt32(0x0FFD10, cpu.mouseButtons || 0, true);
    cpu._syncStudioNetMMIO();
  }"""
    assert old_init_end in html, "old_init_end not found"
    html = html.replace(old_init_end, new_init_end, 1)

    old_cpu_ctor = """      this.hooks = {};
      this.jit = this.wasmMem ? new TabCompWasmJIT(this) : null;
    }"""
    new_cpu_ctor = """      this.hooks = {};
      this.mouseX = 160;
      this.mouseY = 100;
      this.mouseButtons = 0;
      this.spiralDiskImage = null;
      this.snet = new StudioNetNIC(this, 0x0101);
      this.jit = this.wasmMem ? new TabCompWasmJIT(this) : null;
      this._syncStudioNetMMIO();
    }

    setMouseState(x, y, buttons) {
      this.mouseX = Math.max(0, Math.min(319, x | 0));
      this.mouseY = Math.max(0, Math.min(199, y | 0));
      this.mouseButtons = buttons & 7;
      this.ramDV.setInt32(0x0FFD08, this.mouseX, true);
      this.ramDV.setInt32(0x0FFD0C, this.mouseY, true);
      this.ramDV.setInt32(0x0FFD10, this.mouseButtons, true);
    }

    _syncStudioNetMMIO() {
      if (!this.ramDV || !this.snet) return;
      this.ramDV.setInt32(0x0FFD40, 0x534E4554, true); // 'SNET'
      const st = (this.snet.rxQueue.length > 0 ? 1 : 0) | 4;
      this.ramDV.setInt32(0x0FFD44, st, true);
      this.ramDV.setInt32(0x0FFD4C, this.snet.nodeId, true);
      const rxHeadLen = this.snet.lastRxLen || (this.snet.rxQueue.length > 0 ? this.snet.rxQueue[0].length : 0);
      this.ramDV.setInt32(0x0FFD50, rxHeadLen, true);
      this.ramDV.setInt32(0x0FFD58, this.snet.txCount, true);
      this.ramDV.setInt32(0x0FFD5C, this.snet.rxCount, true);
    }

    _handleStudioNetMMIOWrite(addr, val) {
      if (addr === 0x0FFD4C) {
        this.snet.nodeId = val & 0xFFFF;
        this._syncStudioNetMMIO();
      } else if (addr === 0x0FFD48) {
        const dma = this.ramDV.getInt32(0x0FFD54, true) & 0xFFFFFF;
        const len = Math.max(0, Math.min(512, this.ramDV.getInt32(0x0FFD50, true) | 0));
        if (val === 1 && len > 0) {
          this.snet.sendFrame(this.ram.subarray(dma, dma + len));
        } else if (val === 2) {
          const f = this.snet.recvFrame();
          if (f) {
            this.ram.set(f, dma);
            this.ramDV.setInt32(0x0FFD50, f.length, true);
          } else {
            this.ramDV.setInt32(0x0FFD50, 0, true);
          }
        } else if (val === 3) {
          this.snet.reset();
          this._syncStudioNetMMIO();
        }
      }
    }"""
    assert old_cpu_ctor in html, "old_cpu_ctor not found"
    html = html.replace(old_cpu_ctor, new_cpu_ctor, 1)

    old_stw = """          case 0x23: {
            const addr = (reg[ra] + imm16) & 0xFFFFFF;
            dv.setInt32(addr, reg[rd], true);
            if (this.jitEnabled && addr < 0x050000 && this.jit) this.jit.invalidateAll();
            break;
          }"""
    new_stw = """          case 0x23: {
            const addr = (reg[ra] + imm16) & 0xFFFFFF;
            dv.setInt32(addr, reg[rd], true);
            if (addr >= 0x0FFD40 && addr < 0x0FFD80) this._handleStudioNetMMIOWrite(addr, reg[rd]);
            if (this.jitEnabled && addr < 0x050000 && this.jit) this.jit.invalidateAll();
            break;
          }"""
    assert old_stw in html, "old_stw not found"
    html = html.replace(old_stw, new_stw, 1)

    old_sys30 = """        case 30: { // PCM_PLAY(samples_ptr, len, rate) -> 0
          const ptr = r[0] & 0xFFFFFF;
          const len = Math.max(0, Math.min(262144, r[1] | 0));
          const rate = r[2] | 0;
          if (this.hooks.onPlayPCM && len > 0) {
            r[0] = this.hooks.onPlayPCM(this.ram.subarray(ptr, ptr + len), rate);
          } else {
            r[0] = 0;
          }
          break;
        }"""
    new_sys30 = old_sys30 + """
        case 31: { // MOUSE_POLL(out_ptr) -> (buttons << 20) | ((y & 0x3FF) << 10) | (x & 0x3FF)
          const ptr = r[0] & 0xFFFFFF;
          if (ptr) {
            this.ramDV.setInt32(ptr, this.mouseX, true);
            this.ramDV.setInt32(ptr + 4, this.mouseY, true);
            this.ramDV.setInt32(ptr + 8, this.mouseButtons, true);
          }
          r[0] = ((this.mouseButtons & 7) << 20) | ((this.mouseY & 0x3FF) << 10) | (this.mouseX & 0x3FF);
          break;
        }
        case 32: { // NET_SEND(buf_ptr, len) -> bytes_sent
          const ptr = r[0] & 0xFFFFFF;
          const len = Math.max(0, Math.min(512, r[1] | 0));
          r[0] = len > 0 ? this.snet.sendFrame(this.ram.subarray(ptr, ptr + len)) : 0;
          break;
        }
        case 33: { // NET_RECV(buf_ptr, max_len) -> bytes_received or 0
          const ptr = r[0] & 0xFFFFFF;
          const maxLen = Math.max(0, Math.min(512, r[1] | 0));
          const f = this.snet.recvFrame();
          if (!f) { r[0] = 0; break; }
          const copyLen = Math.min(maxLen, f.length);
          this.ram.set(f.subarray(0, copyLen), ptr);
          r[0] = copyLen;
          break;
        }
        case 34: { // NET_INFO(cmd, val) -> value
          const cmd = r[0] | 0;
          if (cmd === 0) r[0] = this.snet.nodeId;
          else if (cmd === 1) { this.snet.nodeId = r[1] & 0xFFFF; this._syncStudioNetMMIO(); r[0] = this.snet.nodeId; }
          else if (cmd === 2) r[0] = this.snet.txCount;
          else if (cmd === 3) r[0] = this.snet.rxCount;
          else r[0] = 0;
          break;
        }
        case 35: { // DISK_SYNC(img_ram_base, start_sector, sector_count) -> 0
          const base = r[0] & 0xFFFFFF;
          const startSec = Math.max(0, r[1] | 0);
          const countSec = Math.max(0, r[2] | 0);
          const byteOff = startSec * 512;
          const byteLen = countSec * 512;
          if (this.spiralDiskImage && byteOff + byteLen <= this.spiralDiskImage.length) {
            this.spiralDiskImage.set(this.ram.subarray(base + byteOff, base + byteOff + byteLen), byteOff);
            if (this.fs) this.fs.writeFile("/spiralos.img", this.spiralDiskImage);
          }
          r[0] = 0;
          break;
        }
        case 36: { // REBOOT_SPIRAL(img_ram_base) -> reloads SpiralOS image & restarts Core
          const base = r[0] & 0xFFFFFF;
          if (this.spiralDiskImage && base > 0) {
            const copyLen = Math.min(this.spiralDiskImage.length, 960 * 512);
            this.spiralDiskImage.set(this.ram.subarray(base, base + copyLen), 0);
          }
          if (this.spiralDiskImage) {
            bootSpiralDiskImage(this, this.spiralDiskImage);
          }
          r[0] = 0;
          break;
        }"""
    assert old_sys30 in html, "old_sys30 not found"
    html = html.replace(old_sys30, new_sys30, 1)

    old_player_end = "  /*@@PLAYER_END*/"
    boot_helper = """  function bootSpiralDiskImage(targetCpu, imgBytes) {
    const u8 = new Uint8Array(imgBytes);
    targetCpu.spiralDiskImage = u8;
    const coreMagic = u8[0x4000] | (u8[0x4001] << 8) | (u8[0x4002] << 16) | (u8[0x4003] << 24);
    let coreLen = 16384;
    if (coreMagic === 0x32334354) {
      coreLen = (u8[0x4004] | (u8[0x4005] << 8) | (u8[0x4006] << 16) | (u8[0x4007] << 24)) >>> 0;
      const coreCode = u8.subarray(0x4008, 0x4008 + coreLen);
      targetCpu.loadBinary(coreCode, "");
    } else {
      const coreCode = u8.subarray(0x4000, 0x4000 + coreLen);
      targetCpu.loadBinary(coreCode, "");
    }
    const mountLen = Math.min(u8.length, 0x180000);
    targetCpu.ram.fill(0, 0x00200000, 0x00600000);
    targetCpu.ram.set(u8.subarray(0, mountLen), 0x00400000);
    targetCpu.ram.set(u8.subarray(0x8000, 0x28000), 0x00200000);
    targetCpu.ram.set(targetCpu.ram.subarray(0x0EF000, 0x0EF300), 0x002EF000);
    targetCpu.rebootCount = (targetCpu.rebootCount || 0) + 1;
  }
  /*@@PLAYER_END*/"""
    assert old_player_end in html, "old_player_end not found"
    html = html.replace(old_player_end, boot_helper, 1)

    old_import = """    if (statusEl) {
      statusEl.textContent = "Imported " + destPath + " (" + uint8Data.length + " bytes)";
    }
    return destPath;"""
    new_import = """    if (uint8Data.length >= 0x10000 &&
        uint8Data[0x8000] === 0x53 && uint8Data[0x8001] === 0x50 &&
        uint8Data[0x8002] === 0x49 && uint8Data[0x8003] === 0x52) {
      bootDone = true;
      bootSpiralDiskImage(cpu, uint8Data);
      if (statusEl) statusEl.textContent = "Booted SpiralOS from " + cleanName + " (" + uint8Data.length + " bytes)";
      return destPath;
    }
    if (statusEl) {
      statusEl.textContent = "Imported " + destPath + " (" + uint8Data.length + " bytes)";
    }
    return destPath;"""
    assert old_import in html, "old_import not found"
    html = html.replace(old_import, new_import, 1)

    old_end = """  requestAnimationFrame(mainLoop);
})();"""
    new_end = """  if (canvas && canvas.addEventListener) {
    const updateMouse = function(ev) {
      const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 320, height: 200 };
      const w = rect.width || 320;
      const h = rect.height || 200;
      const mx = Math.floor(((ev.clientX - rect.left) / w) * 320);
      const my = Math.floor(((ev.clientY - rect.top) / h) * 200);
      cpu.setMouseState(mx, my, ev.buttons || 0);
    };
    canvas.addEventListener("mousemove", updateMouse);
    canvas.addEventListener("mousedown", updateMouse);
    canvas.addEventListener("mouseup", updateMouse);
  }

  if (typeof globalThis !== "undefined") {
    globalThis.TabCompCPU = TabCompCPU;
    globalThis.TabCompFS = TabCompFS;
    globalThis.TabCompWasmJIT = TabCompWasmJIT;
    globalThis.StudioNetNIC = StudioNetNIC;
    globalThis.initHardwareMemory = initHardwareMemory;
    globalThis.renderFramebufferToCanvas = renderFramebufferToCanvas;
    globalThis.compileTabTalk = compileTabTalk;
    globalThis.bootSpiralDiskImage = bootSpiralDiskImage;
    globalThis.runAllSelfTestsSync = runAllSelfTestsSync;
  }

  requestAnimationFrame(mainLoop);
})();"""
    assert old_end in html, "old_end not found"
    html = html.replace(old_end, new_end, 1)

    with open("tabcomp.html", "w", encoding="utf-8") as f:
        f.write(html)
    print("Patched tabcomp.html successfully! Size:", len(html))


def patch_hummingbird():
    src_path = "user_uploaded_files/ttl=63d/user_uploaded/Hummingbird — i586 x86 PC Emulator.html"
    with open(src_path, "r", encoding="utf-8") as f:
        html = f.read()

    target = "class HummingbirdPC {"
    assert target in html, "class HummingbirdPC not found"
    html = html.replace(target, STUDIO_NET_SHARED_JS + "\n" + target, 1)

    # 1. VGADisplay.getVbeModes: in strictBios mode, 0x0112 is 24-bpp (pitch 1920)
    old_vbe_modes = """  getVbeModes() {
    return [
      { mode: 0x0118, width: 1024, height: 768, bpp: 32, pitch: 4096 },
      { mode: 0x0115, width: 800,  height: 600, bpp: 32, pitch: 3200 },
      { mode: 0x0112, width: 640,  height: 480, bpp: 32, pitch: 2560 },
      { mode: 0x0117, width: 1024, height: 768, bpp: 16, pitch: 2048 },
      { mode: 0x0114, width: 800,  height: 600, bpp: 16, pitch: 1600 },
      { mode: 0x0111, width: 640,  height: 480, bpp: 16, pitch: 1280 }
    ];
  }"""
    new_vbe_modes = """  getVbeModes() {
    if (this.pc && this.pc.strictBios) {
      return [
        { mode: 0x0118, width: 1024, height: 768, bpp: 24, pitch: 3072 },
        { mode: 0x0115, width: 800,  height: 600, bpp: 24, pitch: 2400 },
        { mode: 0x0112, width: 640,  height: 480, bpp: 24, pitch: 1920 },
        { mode: 0x0117, width: 1024, height: 768, bpp: 16, pitch: 2048 },
        { mode: 0x0114, width: 800,  height: 600, bpp: 16, pitch: 1600 },
        { mode: 0x0111, width: 640,  height: 480, bpp: 16, pitch: 1280 }
      ];
    }
    return [
      { mode: 0x0118, width: 1024, height: 768, bpp: 32, pitch: 4096 },
      { mode: 0x0115, width: 800,  height: 600, bpp: 32, pitch: 3200 },
      { mode: 0x0112, width: 640,  height: 480, bpp: 32, pitch: 2560 },
      { mode: 0x0142, width: 640,  height: 480, bpp: 32, pitch: 2560 },
      { mode: 0x0117, width: 1024, height: 768, bpp: 16, pitch: 2048 },
      { mode: 0x0114, width: 800,  height: 600, bpp: 16, pitch: 1600 },
      { mode: 0x0111, width: 640,  height: 480, bpp: 16, pitch: 1280 }
    ];
  }"""
    assert old_vbe_modes in html, "old_vbe_modes not found"
    html = html.replace(old_vbe_modes, new_vbe_modes, 1)

    # 2. HummingbirdPC options.strictBios & vbeLfbPhysBase
    old_hb_opts = "    this.deterministic = options.deterministic !== undefined ? Boolean(options.deterministic) : true;"
    new_hb_opts = """    this.deterministic = options.deterministic !== undefined ? Boolean(options.deterministic) : true;
    this.strictBios = Boolean(options.strictBios);
    this.vbeLfbPhysBase = (this.strictBios ? 0xFD000000 : 0xE0000000) >>> 0;"""
    assert old_hb_opts in html, "old_hb_opts not found"
    html = html.replace(old_hb_opts, new_hb_opts, 1)

    old_fdc_init = "    this.fdc = new FDC82077AA(this);\n    this.cpu = new X86CPU(this);"
    new_fdc_init = "    this.fdc = new FDC82077AA(this);\n    this.snet = new StudioNetNIC(this, 0x0201);\n    this.cpu = new X86CPU(this);"
    assert old_fdc_init in html, "old_fdc_init not found"
    html = html.replace(old_fdc_init, new_fdc_init, 1)

    old_fdc_reset = "    this.dma.reset();\n    this.fdc.reset();"
    new_fdc_reset = "    this.dma.reset();\n    this.fdc.reset();\n    if (this.snet) this.snet.reset();"
    assert old_fdc_reset in html, "old_fdc_reset not found"
    html = html.replace(old_fdc_reset, new_fdc_reset, 1)

    # 3. VBE 4F01h PhysBasePtr & 24-bpp masks
    old_4f01_lfb = """      if (info.bpp === 32) {
        this.ram[addr + 0x1F] = 8;  // RedMaskSize
        this.ram[addr + 0x20] = 16; // RedFieldPosition
        this.ram[addr + 0x21] = 8;  // GreenMaskSize
        this.ram[addr + 0x22] = 8;  // GreenFieldPosition
        this.ram[addr + 0x23] = 8;  // BlueMaskSize
        this.ram[addr + 0x24] = 0;  // BlueFieldPosition
        this.ram[addr + 0x25] = 8;  // RsvedMaskSize
        this.ram[addr + 0x26] = 24; // RsvedFieldPosition
      } else {"""
    new_4f01_lfb = """      if (info.bpp === 32 || info.bpp === 24) {
        this.ram[addr + 0x1F] = 8;  // RedMaskSize
        this.ram[addr + 0x20] = 16; // RedFieldPosition
        this.ram[addr + 0x21] = 8;  // GreenMaskSize
        this.ram[addr + 0x22] = 8;  // GreenFieldPosition
        this.ram[addr + 0x23] = 8;  // BlueMaskSize
        this.ram[addr + 0x24] = 0;  // BlueFieldPosition
        this.ram[addr + 0x25] = info.bpp === 32 ? 8 : 0;
        this.ram[addr + 0x26] = info.bpp === 32 ? 24 : 0;
      } else {"""
    assert old_4f01_lfb in html, "old_4f01_lfb not found"
    html = html.replace(old_4f01_lfb, new_4f01_lfb, 1)

    old_phys_ptr = "      this.ramView.setUint32(addr + 0x28, 0xE0000000, true); // PhysBasePtr (LFB)"
    new_phys_ptr = "      this.ramView.setUint32(addr + 0x28, this.vbeLfbPhysBase >>> 0, true); // PhysBasePtr (LFB)"
    assert old_phys_ptr in html, "old_phys_ptr not found"
    html = html.replace(old_phys_ptr, new_phys_ptr, 1)

    # 4. INT 13h strictBios cross-track rejection
    old_int13_check = """        if (lba < 0 || sect === 0) {
          cpu.setReg8(REG_EAX + 4, 0x04); // Sector not found
          this.setStackCF(1);
          return;
        }"""
    new_int13_check = """        if (lba < 0 || sect === 0 || sect > secPerTrk) {
          cpu.setReg8(REG_EAX + 4, 0x04); // Sector not found
          this.setStackCF(1);
          return;
        }
        if (this.strictBios && ((sect - 1) + count > secPerTrk)) {
          cpu.setReg8(REG_EAX + 4, 0x09); // Cross-track / DMA boundary error in strict BIOS mode!
          cpu.setReg8(REG_EAX, 0);
          this.setStackCF(1);
          return;
        }"""
    assert old_int13_check in html, "old_int13_check not found"
    html = html.replace(old_int13_check, new_int13_check, 1)

    # 5. Physical memory and TLB LFB mapping for both 0xE0000000 and 0xFD000000 (vbeLfbPhysBase)
    old_phys_rw = """    if (physAddr >= 0xE0000000 && physAddr < 0xE0000000 + this.vga.vbeLfbSize) {
      return this.vga.vbeLfb[physAddr - 0xE0000000];
    }"""
    new_phys_rw = """    if (physAddr >= this.vbeLfbPhysBase && physAddr < (this.vbeLfbPhysBase + this.vga.vbeLfbSize) >>> 0) {
      return this.vga.vbeLfb[(physAddr - this.vbeLfbPhysBase) >>> 0];
    }"""
    assert old_phys_rw in html, "old_phys_rw not found"
    html = html.replace(old_phys_rw, new_phys_rw, 1)

    old_phys_w8 = """    if (physAddr >= 0xE0000000 && physAddr < 0xE0000000 + this.vga.vbeLfbSize) {
      this.vga.vbeLfb[physAddr - 0xE0000000] = val & 0xFF;
    }"""
    new_phys_w8 = """    if (physAddr >= this.vbeLfbPhysBase && physAddr < (this.vbeLfbPhysBase + this.vga.vbeLfbSize) >>> 0) {
      this.vga.vbeLfb[(physAddr - this.vbeLfbPhysBase) >>> 0] = val & 0xFF;
    }"""
    assert old_phys_w8 in html, "old_phys_w8 not found"
    html = html.replace(old_phys_w8, new_phys_w8, 1)

    old_phys_r16 = """    if (physAddr >= 0xE0000000 && physAddr + 1 < 0xE0000000 + this.vga.vbeLfbSize) {
      const off = physAddr - 0xE0000000;"""
    new_phys_r16 = """    if (physAddr >= this.vbeLfbPhysBase && physAddr + 1 < (this.vbeLfbPhysBase + this.vga.vbeLfbSize) >>> 0) {
      const off = (physAddr - this.vbeLfbPhysBase) >>> 0;"""
    assert old_phys_r16 in html, "old_phys_r16 not found"
    html = html.replace(old_phys_r16, new_phys_r16)

    old_phys_r32 = """    if (physAddr >= 0xE0000000 && physAddr + 3 < 0xE0000000 + this.vga.vbeLfbSize) {
      const off = physAddr - 0xE0000000;"""
    new_phys_r32 = """    if (physAddr >= this.vbeLfbPhysBase && physAddr + 3 < (this.vbeLfbPhysBase + this.vga.vbeLfbSize) >>> 0) {
      const off = (physAddr - this.vbeLfbPhysBase) >>> 0;"""
    assert old_phys_r32 in html, "old_phys_r32 not found"
    html = html.replace(old_phys_r32, new_phys_r32)

    old_tlb_lfb = "else if (physPage >= 0xE0000000 && physPage < (0xE0000000 + this.vbeLfbSize) >>> 0) flags = 5;"
    new_tlb_lfb = "else if (physPage >= this.pc.vbeLfbPhysBase && physPage < (this.pc.vbeLfbPhysBase + this.vbeLfbSize) >>> 0) flags = 5;"
    assert old_tlb_lfb in html, "old_tlb_lfb not found"
    html = html.replace(old_tlb_lfb, new_tlb_lfb)

    # 6. Port reads/writes for StudioNet and FDC (respecting strictBios)
    old_port_read = """      // 82077AA Floppy Disk Controller (0x3F0..0x3F5, 0x3F7)
      case 0x3F0:
      case 0x3F1:
      case 0x3F2:
      case 0x3F3:
      case 0x3F4:
      case 0x3F5:
      case 0x3F7:
        return this.fdc.portRead(port);"""
    new_port_read = """      // StudioNet Virtual Network Controller (0x02A0..0x02AF)
      case 0x2A0: case 0x2A1: case 0x2A2: case 0x2A3:
      case 0x2A4: case 0x2A5: case 0x2A6: case 0x2A7:
      case 0x2A8: case 0x2A9: case 0x2AA: case 0x2AB:
      case 0x2AC: case 0x2AD: case 0x2AE: case 0x2AF:
        if (this.strictBios) return 0xFF;
        return this.snet.portRead(port);

      // 82077AA Floppy Disk Controller (0x3F0..0x3F5, 0x3F7)
      case 0x3F0:
      case 0x3F1:
      case 0x3F2:
      case 0x3F3:
      case 0x3F4:
      case 0x3F5:
      case 0x3F7:
        if (this.strictBios) return 0xFF;
        return this.fdc.portRead(port);"""
    assert old_port_read in html, "old_port_read not found"
    html = html.replace(old_port_read, new_port_read, 1)

    old_port_write = """      case 0x3F7:
        this.fdc.portWrite(port, val);
        return;"""
    new_port_write = """      case 0x3F7:
        if (!this.strictBios) this.fdc.portWrite(port, val);
        return;
      case 0x2A0: case 0x2A1: case 0x2A2: case 0x2A3:
      case 0x2A4: case 0x2A5: case 0x2A6: case 0x2A7:
      case 0x2A8: case 0x2A9: case 0x2AA: case 0x2AB:
      case 0x2AC: case 0x2AD: case 0x2AE: case 0x2AF:
        if (!this.strictBios) this.snet.portWrite(port, val);
        return;"""
    assert old_port_write in html, "old_port_write not found"
    html = html.replace(old_port_write, new_port_write, 1)

    old_boot_menu_ms = """    if (row2.includes('KolibriOS') && row7.includes('2 seconds')) {
      this.recordMilestone('boot_menu', '2. Boot menu shows', 'Blue VESA 3.0 boot menu displayed (2s countdown)');
    }"""
    new_boot_menu_ms = """    if ((row2.includes('KolibriOS') && row7.includes('2 seconds')) || row2.includes('SpiralOS')) {
      this.recordMilestone('boot_menu', '2. Boot menu shows', row2.includes('SpiralOS') ? 'SpiralOS VBE 3.0 bootloader banner displayed' : 'Blue VESA 3.0 boot menu displayed (2s countdown)');
    }"""
    assert old_boot_menu_ms in html, "old_boot_menu_ms not found"
    html = html.replace(old_boot_menu_ms, new_boot_menu_ms, 1)

    old_runtime_ms = """    // Check if desktop is drawn (Milestone 4)"""
    new_runtime_ms = """    // Check SpiralOS protected-mode milestones (vmRam mapped at 0x00200000, status block at 0x002FFD00)
    if (this.milestoneMap.has('protected_mode_paging') && this.ramSize >= 0x00400000) {
      const spMagic = this.ramView.getUint32(0x002FFD00, true);
      if (spMagic === 0x53504F53) { // 'SPOS' desktop ready marker
        const mx = this.ramView.getInt32(0x002FFD08, true);
        const my = this.ramView.getInt32(0x002FFD0C, true);
        const winCount = this.ramView.getInt32(0x002FFD14, true);
        const activeApp = this.ramView.getInt32(0x002FFD18, true);
        if (!this.milestoneMap.has('desktop_drawn') && this.vga.isVbe) {
          this.initialMousePos = { x: mx, y: my };
          this.recordMilestone('desktop_drawn', '4. Desktop draws', `SpiralOS VBE ${this.vga.width}x${this.vga.height}x${this.vga.bpp} desktop drawn (${winCount} windows)`);
        }
        if (this.milestoneMap.has('desktop_drawn') && !this.milestoneMap.has('mouse_moved') && this.initialMousePos) {
          if (mx !== this.initialMousePos.x || my !== this.initialMousePos.y) {
            this.recordMilestone('mouse_moved', '5. Mouse moves pointer', `Pointer moved from (${this.initialMousePos.x},${this.initialMousePos.y}) to (${mx},${my})`);
          }
        }
        if (this.milestoneMap.has('desktop_drawn') && !this.milestoneMap.has('apps_work') && activeApp > 0) {
          this.recordMilestone('apps_work', '6. Apps open and work', `SpiralOS active app ID ${activeApp} running`);
        }
      }
    }
    // Check if desktop is drawn (Milestone 4)"""
    assert old_runtime_ms in html, "old_runtime_ms not found"
    html = html.replace(old_runtime_ms, new_runtime_ms, 1)

    old_ps2_status = "    if (!this.hasOut && this.queue.length > 0 && this.queue[0].isResp) {"
    new_ps2_status = "    if (!this.hasOut && this.queue.length > 0) {"
    assert old_ps2_status in html, "old_ps2_status not found"
    html = html.replace(old_ps2_status, new_ps2_status, 1)

    old_exports = "  globalThis.FDC82077AA = FDC82077AA;"
    new_exports = "  globalThis.FDC82077AA = FDC82077AA;\n  globalThis.StudioNetNIC = StudioNetNIC;\n  globalThis.generateSonderProceduralPage = generateSonderProceduralPage;"
    assert old_exports in html, "old_exports not found"
    html = html.replace(old_exports, new_exports, 1)

    with open("hummingbird.html", "w", encoding="utf-8") as f:
        f.write(html)
    print("Patched hummingbird.html successfully! Size:", len(html))


if __name__ == "__main__":
    patch_tabcomp()
    patch_hummingbird()
