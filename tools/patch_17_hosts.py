#!/usr/bin/env python3
"""
SpiralOS 1.7 "Bring Your Own" — Host Page Patcher (tools/patch_17_hosts.py)
Studio: ConsciousNode SoftWorks · Licence: MIT

Applies surgical, documented hardware & Disk Tray additions to:
  1. hummingbird.html:
     - Slave 8237A 16-bit DMA controller (Ch 4..7, ports 0xC0..0xDF, page 0x89..0x8B)
     - Sound Blaster 16 ISA device (0x224..0x22F, DSP + Mixer + 8/16-bit DMA + IRQ 5)
     - Second BIOS hard disk (drive 0x81) via INT 13h extensions (AH=41h/42h/43h/48h)
     - Disk Tray UI + FAT16/FAT32 LFN image builder/extractor (never touches guest RAM)
  2. tabcomp.html:
     - Second disk unit (TC-32 syscalls 37 DISK2_INFO, 38 DISK2_READ, 39 DISK2_WRITE)
     - PCM stereo 16-bit DMA audio device (TC-32 syscalls 40 AUDIO_INFO, 41 AUDIO_WRITE)
     - Disk Tray UI + FAT16/FAT32 LFN image builder/extractor
  3. triton/spiralos-triton.html:
     - Second disk unit on DMA disk controller (Port 28 DISK_UNIT, Port 29 DISK2_SECTORS,
       Unit 1 512-byte sectors via Ports 17..21 in both TritonCPU and TritonWASM)
     - PCM stereo 16-bit DMA audio device (Port 30 AUDIO_DMA_ADDR, Port 31 AUDIO_COUNT,
       Port 32 AUDIO_CMD/STATUS in both TritonCPU and TritonWASM)
     - Disk Tray UI + FAT16/FAT32 LFN image builder/extractor
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ============================================================================
# Shared Disk Tray UI + Host-Side FAT16/FAT32 LFN Image Builder/Reader
# (Strictly host-side: creates/parses FAT disk images inserted into Disk 2;
#  NEVER reads or writes SpiralFS or guest memory.)
# ============================================================================
DISK_TRAY_SNIPPET = r'''
<!-- [INLINE: SpiralOS 1.7 Disk Tray UI & Host FAT Image Builder (tools/patch_17_hosts.py)] -->
<div id="spiral-disk-tray" style="position:fixed;bottom:8px;left:8px;z-index:9998;background:#101522;color:#dce6ff;border:1px solid #354468;padding:6px 10px;font:12px monospace;border-radius:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;max-width:680px;box-shadow:0 4px 16px rgba(0,0,0,0.45);">
  <span style="color:#6be6ff;font-weight:bold;">/shelf Tray:</span>
  <span id="tray-status" style="color:#9eb0d6;">Empty</span>
  <label style="background:#1c2540;border:1px solid #3c4f7a;padding:2px 6px;border-radius:4px;cursor:pointer;">
    Drop/Pick Files<input id="tray-pick-files" type="file" multiple style="display:none;">
  </label>
  <label style="background:#1c2540;border:1px solid #3c4f7a;padding:2px 6px;border-radius:4px;cursor:pointer;">
    Pick Folder<input id="tray-pick-dir" type="file" webkitdirectory directory multiple style="display:none;">
  </label>
  <label style="background:#1c2540;border:1px solid #3c4f7a;padding:2px 6px;border-radius:4px;cursor:pointer;">
    Insert .IMG<input id="tray-pick-img" type="file" accept=".img,.fat,.bin,.vhd" style="display:none;">
  </label>
  <button id="tray-eject-img" type="button" style="background:#261a2c;color:#ff9ec4;border:1px solid #6b3a58;padding:2px 7px;border-radius:4px;font:12px monospace;cursor:pointer;">Eject .IMG</button>
  <button id="tray-eject-files" type="button" style="background:#1a2b28;color:#7ff0c2;border:1px solid #346858;padding:2px 7px;border-radius:4px;font:12px monospace;cursor:pointer;">Eject Files</button>
</div>
<script id="spiral-disk-tray-script">
(function() {
  "use strict";
  function trayLfnChecksum(sfn11) {
    let sum = 0;
    for (let i = 0; i < 11; i++) sum = ((((sum & 1) ? 0x80 : 0) + (sum >>> 1)) + sfn11[i]) & 0xFF;
    return sum;
  }
  function trayMake83(name, seq) {
    const out = new Uint8Array(11);
    out.fill(0x20);
    const clean = name.replace(/^\.+/, "").toUpperCase();
    const dot = clean.lastIndexOf(".");
    let base = (dot >= 0 ? clean.slice(0, dot) : clean).replace(/[^A-Z0-9_$!#%&\-@^_`{}~]/g, "_");
    let ext = (dot >= 0 ? clean.slice(dot + 1) : "").replace(/[^A-Z0-9_$!#%&\-@^_`{}~]/g, "_");
    const needTil = (seq > 0) || (base.length > 8) || (ext.length > 3) || (name.toUpperCase() !== name) || (clean !== name.toUpperCase()) || (name.indexOf(" ") >= 0);
    if (needTil) {
      const suf = "~" + (seq > 0 ? seq : 1);
      base = (base.slice(0, 8 - suf.length) || "F") + suf;
    }
    for (let i = 0; i < Math.min(8, base.length); i++) out[i] = base.charCodeAt(i) & 0xFF;
    for (let i = 0; i < Math.min(3, ext.length); i++) out[8 + i] = ext.charCodeAt(i) & 0xFF;
    return { sfn: out, needsLfn: needTil || name.length > 12 };
  }
  function trayBuildDirEntries(items, allocCluster, isFat32, selfClus, parentClus) {
    const ents = [];
    const push32 = (u) => ents.push(u);
    if (selfClus !== 0) {
      for (const [nm, cl] of [[".          ", selfClus], ["..         ", parentClus]]) {
        const e = new Uint8Array(32);
        for (let i = 0; i < 11; i++) e[i] = nm.charCodeAt(i);
        e[11] = 0x10;
        e[20] = (cl >>> 16) & 0xFF; e[21] = (cl >>> 24) & 0xFF;
        e[26] = cl & 0xFF; e[27] = (cl >>> 8) & 0xFF;
        push32(e);
      }
    }
    let seq = 1;
    for (const it of items) {
      const { sfn, needsLfn } = trayMake83(it.name, seq++);
      if (needsLfn) {
        const chk = trayLfnChecksum(sfn);
        const chars = [];
        for (let i = 0; i < it.name.length; i++) chars.push(it.name.charCodeAt(i));
        chars.push(0x0000);
        while (chars.length % 13 !== 0) chars.push(0xFFFF);
        const nLfn = chars.length / 13;
        for (let ord = nLfn; ord >= 1; ord--) {
          const le = new Uint8Array(32);
          le[0] = ord | (ord === nLfn ? 0x40 : 0);
          le[11] = 0x0F;
          le[13] = chk;
          const base = (ord - 1) * 13;
          const offs = [1,3,5,7,9, 14,16,18,20,22,24, 28,30];
          for (let k = 0; k < 13; k++) {
            const c = chars[base + k];
            le[offs[k]] = c & 0xFF;
            le[offs[k] + 1] = (c >>> 8) & 0xFF;
          }
          push32(le);
        }
      }
      const de = new Uint8Array(32);
      de.set(sfn, 0);
      de[11] = it.isDir ? 0x10 : 0x20;
      const cl = it.startCluster >>> 0;
      de[20] = (cl >>> 16) & 0xFF; de[21] = (cl >>> 24) & 0xFF;
      de[26] = cl & 0xFF; de[27] = (cl >>> 8) & 0xFF;
      const sz = it.isDir ? 0 : (it.data.length >>> 0);
      de[28] = sz & 0xFF; de[29] = (sz >>> 8) & 0xFF;
      de[30] = (sz >>> 16) & 0xFF; de[31] = (sz >>> 24) & 0xFF;
      push32(de);
    }
    const raw = new Uint8Array(ents.length * 32);
    for (let i = 0; i < ents.length; i++) raw.set(ents[i], i * 32);
    return raw;
  }

  // Build a FAT16 disk image (with LFN & nested folders) from a map of { "path/to/file": Uint8Array }
  function buildTrayFatImage(fileMap, minSizeBytes) {
    let totalData = 0;
    const tree = { name: "", isDir: true, children: new Map() };
    for (const [rawPath, bytes] of Object.entries(fileMap || {})) {
      const parts = rawPath.replace(/^\/+/, "").split("/").filter(Boolean);
      if (parts.length === 0) continue;
      let node = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!node.children.has(parts[i])) {
          node.children.set(parts[i], { name: parts[i], isDir: true, children: new Map() });
        }
        node = node.children.get(parts[i]);
      }
      const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      node.children.set(parts[parts.length - 1], { name: parts[parts.length - 1], isDir: false, data: u8 });
      totalData += ((u8.length + 4095) & ~4095);
    }
    // Always use FAT16 with 4 KB clusters (8 sectors/cluster) and >= 4600 clusters (~19 MB max or sized to fit + 2 MB free)
    const secPerClus = 8; // 4096 B/cluster
    const bytesPerClus = secPerClus * 512;
    const minBytes = Math.max(minSizeBytes || (20 * 1024 * 1024), totalData + 4 * 1024 * 1024);
    const dataClusters = Math.max(4200, Math.min(65000, Math.ceil(minBytes / bytesPerClus)));
    const fatSectors = Math.ceil(((dataClusters + 2) * 2) / 512);
    const rootEntries = 512;
    const rootSectors = (rootEntries * 32) / 512; // 32
    const rsvdSectors = 1;
    const numFats = 2;
    const dataStartSec = rsvdSectors + numFats * fatSectors + rootSectors;
    const totalSectors = dataStartSec + dataClusters * secPerClus;

    const img = new Uint8Array(totalSectors * 512);
    const dv = new DataView(img.buffer);
    img[0] = 0xEB; img[1] = 0x3C; img[2] = 0x90;
    const oem = "SPIRAL17";
    for (let i = 0; i < 8; i++) img[3 + i] = oem.charCodeAt(i);
    dv.setUint16(11, 512, true);
    img[13] = secPerClus;
    dv.setUint16(14, rsvdSectors, true);
    img[16] = numFats;
    dv.setUint16(17, rootEntries, true);
    dv.setUint16(19, totalSectors < 65536 ? totalSectors : 0, true);
    img[21] = 0xF8;
    dv.setUint16(22, fatSectors, true);
    dv.setUint16(24, 63, true);
    dv.setUint16(26, 255, true);
    dv.setUint32(32, totalSectors >= 65536 ? totalSectors : 0, true);
    img[36] = 0x80;
    img[38] = 0x29;
    dv.setUint32(39, 0x53501701, true);
    const lbl = "SHELF      ";
    for (let i = 0; i < 11; i++) img[43 + i] = lbl.charCodeAt(i);
    const ftype = "FAT16   ";
    for (let i = 0; i < 8; i++) img[54 + i] = ftype.charCodeAt(i);
    img[510] = 0x55; img[511] = 0xAA;

    const fat1Off = rsvdSectors * 512;
    const fat2Off = (rsvdSectors + fatSectors) * 512;
    const setFat = (cl, val) => {
      dv.setUint16(fat1Off + cl * 2, val & 0xFFFF, true);
      dv.setUint16(fat2Off + cl * 2, val & 0xFFFF, true);
    };
    setFat(0, 0xFFF8);
    setFat(1, 0xFFFF);

    let nextClus = 2;
    function writeChain(bytes) {
      if (!bytes || bytes.length === 0) return 0;
      const nClus = Math.ceil(bytes.length / bytesPerClus);
      const first = nextClus;
      for (let i = 0; i < nClus; i++) {
        const c = nextClus++;
        setFat(c, i === nClus - 1 ? 0xFFFF : c + 1);
        const dstOff = (dataStartSec + (c - 2) * secPerClus) * 512;
        const slice = bytes.subarray(i * bytesPerClus, Math.min(bytes.length, (i + 1) * bytesPerClus));
        img.set(slice, dstOff);
      }
      return first;
    }

    function populateDir(dirNode, selfClus, parentClus) {
      const items = [];
      for (const child of dirNode.children.values()) {
        if (child.isDir) {
          const cl = nextClus++;
          setFat(cl, 0xFFFF);
          child.startCluster = cl;
          populateDir(child, cl, selfClus);
        } else {
          child.startCluster = writeChain(child.data);
        }
        items.push(child);
      }
      const rawDir = trayBuildDirEntries(items, null, false, selfClus, parentClus);
      if (selfClus === 0) {
        img.set(rawDir.subarray(0, rootSectors * 512), (rsvdSectors + numFats * fatSectors) * 512);
      } else {
        const nClus = Math.max(1, Math.ceil(rawDir.length / bytesPerClus));
        let cur = selfClus;
        for (let i = 0; i < nClus; i++) {
          if (i > 0) {
            const nc = nextClus++;
            setFat(cur, nc);
            cur = nc;
          }
          setFat(cur, 0xFFFF);
          const dstOff = (dataStartSec + (cur - 2) * secPerClus) * 512;
          img.set(rawDir.subarray(i * bytesPerClus, Math.min(rawDir.length, (i + 1) * bytesPerClus)), dstOff);
        }
      }
    }
    populateDir(tree, 0, 0);
    return img;
  }

  // Extract all files from a FAT12/16/32 image (with LFN) into { "/path": Uint8Array }
  function extractTrayFatFiles(img) {
    if (!img || img.length < 512) return {};
    const dv = new DataView(img.buffer, img.byteOffset, img.byteLength);
    let baseOff = 0;
    // Check for MBR partition table
    if (img[510] === 0x55 && img[511] === 0xAA && (img[0] !== 0xEB && img[0] !== 0xE9)) {
      for (let p = 0; p < 4; p++) {
        const pOff = 446 + p * 16;
        const pType = img[pOff + 4];
        const lba = dv.getUint32(pOff + 8, true);
        if (pType !== 0 && lba > 0 && lba * 512 < img.length) { baseOff = lba * 512; break; }
      }
    }
    const bps = dv.getUint16(baseOff + 11, true) || 512;
    const spc = img[baseOff + 13] || 1;
    const rsvd = dv.getUint16(baseOff + 14, true);
    const nfats = img[baseOff + 16];
    const rootEnt = dv.getUint16(baseOff + 17, true);
    const tot16 = dv.getUint16(baseOff + 19, true);
    const fsz16 = dv.getUint16(baseOff + 22, true);
    const tot32 = dv.getUint32(baseOff + 32, true);
    const fsz32 = dv.getUint32(baseOff + 36, true);
    const fatSz = fsz16 || fsz32;
    const totSec = tot16 || tot32;
    const rootSecs = Math.ceil((rootEnt * 32) / bps);
    const dataSec = rsvd + nfats * fatSz + rootSecs;
    const countClus = Math.floor((totSec - dataSec) / spc);
    const fatType = countClus < 4085 ? 12 : (countClus < 65525 ? 16 : 32);
    const fatOff = baseOff + rsvd * bps;
    const eoc = fatType === 12 ? 0xFF8 : (fatType === 16 ? 0xFFF8 : 0x0FFFFFF8);

    function nextCluster(c) {
      if (fatType === 12) {
        const o = fatOff + Math.floor(c * 3 / 2);
        const v = img[o] | (img[o + 1] << 8);
        return (c & 1) ? (v >>> 4) : (v & 0xFFF);
      } else if (fatType === 16) {
        return dv.getUint16(fatOff + c * 2, true);
      } else {
        return dv.getUint32(fatOff + c * 4, true) & 0x0FFFFFFF;
      }
    }
    function readChain(startClus, maxBytes) {
      if (startClus < 2) return new Uint8Array(0);
      const chunks = [];
      let cur = startClus, total = 0, guard = 0;
      const clusBytes = spc * bps;
      while (cur >= 2 && cur < eoc && guard++ < 65536) {
        const off = baseOff + (dataSec + (cur - 2) * spc) * bps;
        if (off + clusBytes > img.length) break;
        chunks.push(img.subarray(off, off + clusBytes));
        total += clusBytes;
        if (maxBytes !== undefined && total >= maxBytes) break;
        cur = nextCluster(cur);
      }
      const outLen = maxBytes !== undefined ? Math.min(total, maxBytes) : total;
      const out = new Uint8Array(outLen);
      let pos = 0;
      for (const ch of chunks) {
        const n = Math.min(ch.length, outLen - pos);
        if (n <= 0) break;
        out.set(ch.subarray(0, n), pos);
        pos += n;
      }
      return out;
    }

    const outFiles = {};
    function walkDir(dirBytes, prefix) {
      const ddv = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);
      let lfnParts = [];
      for (let off = 0; off + 32 <= dirBytes.length; off += 32) {
        const first = dirBytes[off];
        if (first === 0x00) break;
        if (first === 0xE5) { lfnParts = []; continue; }
        const attr = dirBytes[off + 11];
        if (attr === 0x0F) {
          const ord = first & 0x1F;
          const offs = [1,3,5,7,9, 14,16,18,20,22,24, 28,30];
          let seg = "";
          for (const o of offs) {
            const code = dirBytes[off + o] | (dirBytes[off + o + 1] << 8);
            if (code === 0x0000 || code === 0xFFFF) break;
            seg += String.fromCharCode(code);
          }
          lfnParts[ord - 1] = seg;
          continue;
        }
        if ((attr & 0x08) !== 0) { lfnParts = []; continue; }
        let name = lfnParts.filter(Boolean).join("");
        lfnParts = [];
        if (!name) {
          let b = "", e = "";
          for (let i = 0; i < 8; i++) b += String.fromCharCode(dirBytes[off + i]);
          for (let i = 0; i < 3; i++) e += String.fromCharCode(dirBytes[off + 8 + i]);
          b = b.trim(); e = e.trim();
          name = e ? (b + "." + e) : b;
        }
        if (name === "." || name === "..") continue;
        const hi = ddv.getUint16(off + 20, true);
        const lo = ddv.getUint16(off + 26, true);
        const clus = fatType === 32 ? ((hi << 16) | lo) : lo;
        const fsz = ddv.getUint32(off + 28, true);
        const fullPath = prefix + "/" + name;
        if ((attr & 0x10) !== 0) {
          if (clus >= 2) walkDir(readChain(clus), fullPath);
        } else {
          outFiles[fullPath] = readChain(clus, fsz);
        }
      }
    }
    if (fatType === 32) {
      const rootClus = dv.getUint32(baseOff + 44, true);
      walkDir(readChain(rootClus), "");
    } else {
      const rootOff = baseOff + (rsvd + nfats * fatSz) * bps;
      walkDir(img.subarray(rootOff, rootOff + rootSecs * bps), "");
    }
    return outFiles;
  }

  function getActiveHost() {
    return globalThis._activeSpiralHost || null;
  }
  function updateTrayStatus(text) {
    const el = typeof document !== "undefined" ? document.getElementById("tray-status") : null;
    if (el) el.textContent = text;
  }
  function insertImageToHost(u8, label) {
    const host = getActiveHost();
    if (!host || typeof host.loadDisk2Image !== "function") {
      updateTrayStatus("No active VM");
      return false;
    }
    host.loadDisk2Image(u8);
    updateTrayStatus((label || "Disk") + " (" + Math.round(u8.length / 1024) + " KB)");
    return true;
  }
  function ejectFromHost() {
    const host = getActiveHost();
    if (!host || typeof host.ejectDisk2Image !== "function") return null;
    const img = host.ejectDisk2Image();
    updateTrayStatus("Empty");
    return img;
  }

  globalThis.spiralDiskTray = {
    buildFatImage: buildTrayFatImage,
    extractFatFiles: extractTrayFatFiles,
    insertFiles(fileMap, label) {
      const img = buildTrayFatImage(fileMap);
      insertImageToHost(img, label || (Object.keys(fileMap).length + " file(s)"));
      return img;
    },
    insertImage(u8, label) {
      return insertImageToHost(u8 instanceof Uint8Array ? u8 : new Uint8Array(u8), label || "Disk.img");
    },
    ejectImage() {
      return ejectFromHost();
    },
    ejectFiles() {
      const img = ejectFromHost();
      return img ? extractTrayFatFiles(img) : {};
    }
  };

  if (typeof document !== "undefined") {
    const handleFileList = async (fileList) => {
      const map = {};
      for (const f of Array.from(fileList || [])) {
        const rel = f.webkitRelativePath || f.name;
        const buf = await f.arrayBuffer();
        map[rel] = new Uint8Array(buf);
      }
      if (Object.keys(map).length > 0) {
        globalThis.spiralDiskTray.insertFiles(map, Object.keys(map).length + " file(s)");
      }
    };
    const fPick = document.getElementById("tray-pick-files");
    if (fPick) fPick.addEventListener("change", (e) => handleFileList(e.target.files));
    const dPick = document.getElementById("tray-pick-dir");
    if (dPick) dPick.addEventListener("change", (e) => handleFileList(e.target.files));
    const iPick = document.getElementById("tray-pick-img");
    if (iPick) iPick.addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const u8 = new Uint8Array(await f.arrayBuffer());
      globalThis.spiralDiskTray.insertImage(u8, f.name);
    });
    const ejImg = document.getElementById("tray-eject-img");
    if (ejImg) ejImg.addEventListener("click", () => {
      const img = globalThis.spiralDiskTray.ejectImage();
      if (!img) return;
      const blob = new Blob([img], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "shelf-disk.img";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
    const ejFiles = document.getElementById("tray-eject-files");
    if (ejFiles) ejFiles.addEventListener("click", () => {
      const files = globalThis.spiralDiskTray.ejectFiles();
      for (const [p, u8] of Object.entries(files)) {
        const blob = new Blob([u8], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = p.replace(/^\/+/, "").replace(/\//g, "_");
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    });
    window.addEventListener("dragover", (e) => { e.preventDefault(); });
    window.addEventListener("drop", async (e) => {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 1 && /\.(img|fat|vhd)$/i.test(files[0].name)) {
          const u8 = new Uint8Array(await files[0].arrayBuffer());
          globalThis.spiralDiskTray.insertImage(u8, files[0].name);
        } else {
          await handleFileList(files);
        }
      }
    });
  }
})();
</script>
'''


def patch_hummingbird():
    path = os.path.join(ROOT, "hummingbird.html")
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    if "class SoundBlaster16" in html:
        print("hummingbird.html already patched.")
        return

    # 1. Extend DMA8237 with Slave 16-bit DMA (Channels 4..7, ports 0xC0..0xDF, page 0x89..0x8B)
    old_dma_reset = '''  reset() {
    this.baseAddr = new Uint16Array(4);
    this.currAddr = new Uint16Array(4);
    this.baseCount = new Uint16Array(4);
    this.currCount = new Uint16Array(4);
    this.page = new Uint8Array(4);
    this.mode = new Uint8Array(4);
    this.mask = 0x0F;
    this.status = 0x00;
    this.command = 0x00;
    this.flipFlop = 0;
  }'''

    new_dma_reset = '''  reset() {
    this.baseAddr = new Uint16Array(8);
    this.currAddr = new Uint16Array(8);
    this.baseCount = new Uint16Array(8);
    this.currCount = new Uint16Array(8);
    this.page = new Uint8Array(8);
    this.mode = new Uint8Array(8);
    this.mask = 0xFF;
    this.status = 0x00;
    this.command = 0x00;
    this.flipFlop = 0;
    this.flipFlop2 = 0;
  }

  getPhysAddr16(ch) {
    // 8237 Slave 16-bit DMA (channels 4..7): A23..A17 from page[ch]&0xFE, A16..A1 from currAddr[ch]
    const c = ch & 7;
    return ((((this.page[c] & 0xFE) << 16) | ((this.currAddr[c] & 0xFFFF) << 1)) >>> 0);
  }

  transferFromMemory16(ch, wordCount) {
    const c = ch & 7;
    const avail = (this.currCount[c] & 0xFFFF) + 1;
    const words = Math.min(wordCount, avail);
    const out = new Int16Array(words);
    const autoInit = (this.mode[c] & 0x10) !== 0;
    for (let i = 0; i < words; i++) {
      const phys = this.getPhysAddr16(c);
      if (phys + 1 < this.pc.ram.length) {
        const lo = this.pc.ram[phys];
        const hi = this.pc.ram[phys + 1];
        const v = lo | (hi << 8);
        out[i] = (v & 0x8000) ? (v - 0x10000) : v;
      }
      this.currAddr[c] = (this.currAddr[c] + 1) & 0xFFFF;
      if (this.currCount[c] === 0) {
        if (autoInit) {
          this.currAddr[c] = this.baseAddr[c];
          this.currCount[c] = this.baseCount[c];
        } else {
          this.currCount[c] = 0xFFFF;
        }
        break;
      } else {
        this.currCount[c] = (this.currCount[c] - 1) & 0xFFFF;
      }
    }
    return out;
  }'''
    assert old_dma_reset in html, "DMA8237.reset not found"
    html = html.replace(old_dma_reset, new_dma_reset, 1)

    old_dma_pw_end = '''      case 0x81: this.page[2] = val; break;
      case 0x82: this.page[3] = val; break;
    }
  }
}'''
    new_dma_pw_end = '''      case 0x81: this.page[2] = val; break;
      case 0x82: this.page[3] = val; break;
      // Slave 16-bit 8237 DMA (Channels 4..7, ports 0xC0..0xDF, page 0x8B/0x89/0x8A)
      case 0x8B: this.page[5] = val; break;
      case 0x89: this.page[6] = val; break;
      case 0x8A: this.page[7] = val; break;
      case 0xD4: {
        const c = 4 + (val & 3);
        if (val & 4) this.mask |= (1 << c);
        else this.mask &= ~(1 << c);
        break;
      }
      case 0xD6: this.mode[4 + (val & 3)] = val; break;
      case 0xD8: this.flipFlop2 = 0; break;
      case 0xC0: case 0xC2: case 0xC4: case 0xC6:
      case 0xC8: case 0xCA: case 0xCC: case 0xCE: {
        const c = 4 + ((port - 0xC0) >>> 2);
        const isCnt = ((port - 0xC0) & 2) !== 0;
        if (this.flipFlop2 === 0) {
          this.flipFlop2 = 1;
          if (isCnt) { this.baseCount[c] = (this.baseCount[c] & 0xFF00) | val; this.currCount[c] = this.baseCount[c]; }
          else { this.baseAddr[c] = (this.baseAddr[c] & 0xFF00) | val; this.currAddr[c] = this.baseAddr[c]; }
        } else {
          this.flipFlop2 = 0;
          if (isCnt) { this.baseCount[c] = (this.baseCount[c] & 0x00FF) | (val << 8); this.currCount[c] = this.baseCount[c]; }
          else { this.baseAddr[c] = (this.baseAddr[c] & 0x00FF) | (val << 8); this.currAddr[c] = this.baseAddr[c]; }
        }
        break;
      }
    }
  }
}

// ============================================================================
// [INLINE: Sound Blaster 16 ISA Device (Base 0x220, DMA1/DMA5, IRQ 5)]
// ============================================================================
class SoundBlaster16 {
  constructor(pc) {
    this.pc = pc;
    this.audioCtx = null;
    this.nextPlayTime = 0;
    this.pcmCapture = []; // Array of Int16Array stereo interleaved frames
    this.totalFrames = 0;
    this.irqCount = 0;
    this.reset();
  }
  reset() {
    this.dspState = 0;
    this.readBuf = [];
    this.cmd = 0;
    this.cmdParams = [];
    this.cmdExpect = 0;
    this.sampleRate = 22050;
    this.speakerOn = false;
    this.mixerIndex = 0;
    this.mixerRegs = new Uint8Array(256);
    this.mixerRegs[0x80] = 0x02; // IRQ 5
    this.mixerRegs[0x81] = 0x22; // DMA 1 (8-bit) + DMA 5 (16-bit)
    this.mixerRegs[0x82] = 0x00; // IRQ status
    this.mixerRegs[0x22] = 0xFF; // Master volume
    this.mixerRegs[0x04] = 0xFF; // Voice volume
  }
  _playStereoI16(stereoI16, rate) {
    this.pcmCapture.push(stereoI16);
    this.totalFrames += (stereoI16.length >>> 1);
    if (typeof window === "undefined") return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (!this.audioCtx) this.audioCtx = new AC();
      if (this.audioCtx.state === "suspended") this.audioCtx.resume();
      const frames = stereoI16.length >>> 1;
      if (frames <= 0) return;
      const buf = this.audioCtx.createBuffer(2, frames, Math.max(8000, Math.min(48000, rate || 22050)));
      const chL = buf.getChannelData(0);
      const chR = buf.getChannelData(1);
      for (let i = 0; i < frames; i++) {
        chL[i] = stereoI16[i * 2] / 32768.0;
        chR[i] = stereoI16[i * 2 + 1] / 32768.0;
      }
      const src = this.audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(this.audioCtx.destination);
      const now = this.audioCtx.currentTime;
      const startAt = Math.max(now, this.nextPlayTime);
      src.start(startAt);
      this.nextPlayTime = startAt + (frames / buf.sampleRate);
    } catch (_) {}
  }
  portRead(port) {
    switch (port) {
      case 0x225: return this.mixerRegs[this.mixerIndex & 0xFF];
      case 0x22A: return this.readBuf.length > 0 ? this.readBuf.shift() : 0xAA;
      case 0x22C: return 0x00; // Bit 7 = 0: ready for DSP command/data write
      case 0x22E: { // 8-bit IRQ ack & read buffer status
        this.mixerRegs[0x82] &= ~0x01;
        return this.readBuf.length > 0 ? 0x80 : 0x00;
      }
      case 0x22F: { // 16-bit IRQ ack
        this.mixerRegs[0x82] &= ~0x02;
        return 0xFF;
      }
      default: return 0xFF;
    }
  }
  portWrite(port, val) {
    val &= 0xFF;
    if (port === 0x224) { this.mixerIndex = val; return; }
    if (port === 0x225) { this.mixerRegs[this.mixerIndex & 0xFF] = val; return; }
    if (port === 0x226) {
      if (val & 1) {
        this.dspState = 1;
        this.cmdExpect = 0;
        this.cmdParams = [];
      } else if (this.dspState === 1) {
        this.dspState = 0;
        this.readBuf = [0xAA];
      }
      return;
    }
    if (port === 0x22C) {
      if (this.cmdExpect > 0) {
        this.cmdParams.push(val);
        this.cmdExpect--;
        if (this.cmdExpect === 0) this._execCmd(this.cmd, this.cmdParams);
        return;
      }
      this.cmd = val;
      this.cmdParams = [];
      if (val === 0xE1) { this.readBuf.push(0x04, 0x05); return; } // SB16 DSP v4.5
      if (val === 0xD1) { this.speakerOn = true; return; }
      if (val === 0xD3) { this.speakerOn = false; return; }
      if (val === 0xD5 || val === 0xD6 || val === 0xD9 || val === 0xDA) return;
      if (val === 0x40) { this.cmdExpect = 1; return; }
      if (val === 0x41 || val === 0x42) { this.cmdExpect = 2; return; }
      if ((val & 0xF0) === 0xB0 || (val & 0xF0) === 0xC0) { this.cmdExpect = 3; return; }
    }
  }
  _execCmd(cmd, p) {
    if (cmd === 0x40) {
      const tc = p[0];
      this.sampleRate = Math.round(1000000 / Math.max(1, 256 - tc));
      return;
    }
    if (cmd === 0x41 || cmd === 0x42) {
      this.sampleRate = ((p[0] << 8) | p[1]) || 22050;
      return;
    }
    if ((cmd & 0xF0) === 0xB0) {
      // 16-bit DMA DAC via 8237 Slave Channel 5
      const mode = p[0];
      const wordCount = ((p[1] | (p[2] << 8)) + 1);
      const isStereo = (mode & 0x20) !== 0;
      const raw = this.pc.dma.transferFromMemory16(5, wordCount);
      let stereo;
      if (isStereo) {
        stereo = raw;
      } else {
        stereo = new Int16Array(raw.length * 2);
        for (let i = 0; i < raw.length; i++) { stereo[i * 2] = raw[i]; stereo[i * 2 + 1] = raw[i]; }
      }
      this._playStereoI16(stereo, this.sampleRate);
      this.mixerRegs[0x82] |= 0x02;
      this.irqCount++;
      this.pc.pic.raiseIRQ(5);
      return;
    }
    if ((cmd & 0xF0) === 0xC0) {
      // 8-bit DMA DAC via 8237 Master Channel 1
      const mode = p[0];
      const byteCount = ((p[1] | (p[2] << 8)) + 1);
      const isStereo = (mode & 0x20) !== 0;
      const isSigned = (mode & 0x10) !== 0;
      const raw = this.pc.dma.transferFromMemory(1, byteCount);
      const frames = isStereo ? (raw.length >>> 1) : raw.length;
      const stereo = new Int16Array(frames * 2);
      for (let i = 0; i < frames; i++) {
        const bL = isStereo ? raw[i * 2] : raw[i];
        const bR = isStereo ? raw[i * 2 + 1] : raw[i];
        const sL = isSigned ? ((bL & 0x80 ? bL - 256 : bL) << 8) : ((bL - 128) << 8);
        const sR = isSigned ? ((bR & 0x80 ? bR - 256 : bR) << 8) : ((bR - 128) << 8);
        stereo[i * 2] = sL; stereo[i * 2 + 1] = sR;
      }
      this._playStereoI16(stereo, this.sampleRate);
      this.mixerRegs[0x82] |= 0x01;
      this.irqCount++;
      this.pc.pic.raiseIRQ(5);
    }
  }
}'''
    assert old_dma_pw_end in html, "DMA8237.portWrite end not found"
    html = html.replace(old_dma_pw_end, new_dma_pw_end, 1)

    # 2. Initialize disk2Image, sb16, and register active host in HummingbirdPC constructor
    old_hb_init = '''    this.floppyImage = null;'''
    new_hb_init = '''    this.floppyImage = null;
    this.disk2Image = null;'''
    assert old_hb_init in html, "floppyImage init not found"
    html = html.replace(old_hb_init, new_hb_init, 1)

    old_snet_init = '''    this.snet = new StudioNetNIC(this, 0x0201);'''
    new_snet_init = '''    this.snet = new StudioNetNIC(this, 0x0201);
    this.sb16 = new SoundBlaster16(this);
    globalThis._activeSpiralHost = this;'''
    assert old_snet_init in html, "snet init not found"
    html = html.replace(old_snet_init, new_snet_init, 1)

    # Add loadDisk2Image / ejectDisk2Image right after loadFloppyImage
    old_load_flp = '''  loadFloppyImage(uint8Data) {
    this.floppyImage = new Uint8Array(uint8Data.length);
    this.floppyImage.set(uint8Data);'''
    new_load_flp = '''  loadDisk2Image(uint8Data) {
    if (!uint8Data) { this.disk2Image = null; return; }
    this.disk2Image = new Uint8Array(uint8Data.length);
    this.disk2Image.set(uint8Data);
  }

  ejectDisk2Image() {
    const out = this.disk2Image;
    this.disk2Image = null;
    return out;
  }

  loadFloppyImage(uint8Data) {
    this.floppyImage = new Uint8Array(uint8Data.length);
    this.floppyImage.set(uint8Data);'''
    assert old_load_flp in html, "loadFloppyImage not found"
    html = html.replace(old_load_flp, new_load_flp, 1)

    # 3. Extend handleBiosInt13 with Drive 0x81 (and 0x80 ext) INT 13h Extensions (AH=41h/42h/43h/48h)
    old_int13_ext = '''      case 0x41: // INT 13h Extensions installation check -> not supported for floppy
      case 0x48:
      default:
        cpu.setReg8(REG_EAX + 4, 0x01); // Invalid / unsupported function
        this.setStackCF(1);
        return;'''

    new_int13_ext = '''      case 0x41: { // INT 13h Extensions installation check (BX=0x55AA)
        const targetImg = (drive === 0x81) ? this.disk2Image : ((drive === 0x80 && this.disk2Image === null) ? null : null);
        if (drive === 0x81 && this.disk2Image && bx === 0x55AA) {
          cpu.setReg8(REG_EAX + 4, 0x30); // EDD 3.0
          cpu.setReg16(REG_EBX, 0xAA55);
          cpu.setReg16(REG_ECX, 0x0001);  // Fixed disk access subset
          this.setStackCF(0);
          return;
        }
        cpu.setReg8(REG_EAX + 4, 0x01);
        this.setStackCF(1);
        return;
      }

      case 0x48: { // INT 13h Extended Get Drive Parameters (DS:SI -> 30-byte buffer)
        if (drive !== 0x81 || !this.disk2Image) {
          cpu.setReg8(REG_EAX + 4, 0x07);
          this.setStackCF(1);
          return;
        }
        const dsBase = cpu.segBase[SEG_DS] >>> 0;
        const bufAddr = (dsBase + (esi & 0xFFFF)) >>> 0;
        const totSec = Math.floor(this.disk2Image.length / 512);
        const dv = this.ramView;
        dv.setUint16(bufAddr + 0, 0x001A, true); // size = 26
        dv.setUint16(bufAddr + 2, 0x0002, true); // flags
        dv.setUint32(bufAddr + 4, 1024, true);   // cyls
        dv.setUint32(bufAddr + 8, 255, true);    // heads
        dv.setUint32(bufAddr + 12, 63, true);    // spt
        dv.setUint32(bufAddr + 16, totSec >>> 0, true);
        dv.setUint32(bufAddr + 20, Math.floor(totSec / 4294967296) >>> 0, true);
        dv.setUint16(bufAddr + 24, 512, true);   // bytes per sector
        this.cpu.markPhysWritten(bufAddr, 26);
        cpu.setReg8(REG_EAX + 4, 0x00);
        this.setStackCF(0);
        return;
      }

      case 0x42:   // INT 13h Extended Read Sectors (DS:SI -> 16-byte DAP)
      case 0x43: { // INT 13h Extended Write Sectors (DS:SI -> 16-byte DAP)
        if (drive !== 0x81 || !this.disk2Image) {
          cpu.setReg8(REG_EAX + 4, 0x80); // Not ready / no disk
          this.setStackCF(1);
          return;
        }
        const dsBase = cpu.segBase[SEG_DS] >>> 0;
        const dapAddr = (dsBase + (esi & 0xFFFF)) >>> 0;
        const dv = this.ramView;
        const count = dv.getUint16(dapAddr + 2, true);
        const bufOff = dv.getUint16(dapAddr + 4, true);
        const bufSeg = dv.getUint16(dapAddr + 6, true);
        const lbaLo = dv.getUint32(dapAddr + 8, true);
        const lbaHi = dv.getUint32(dapAddr + 12, true);
        const lba = lbaLo + lbaHi * 4294967296;
        const totSec = Math.floor(this.disk2Image.length / 512);
        if (count === 0 || lba < 0 || (lba + count) > totSec) {
          cpu.setReg8(REG_EAX + 4, 0x04); // Sector not found
          this.setStackCF(1);
          return;
        }
        const memAddr = ((bufSeg << 4) + bufOff) >>> 0;
        const byteOff = lba * 512;
        const byteLen = count * 512;
        if (ah === 0x42) {
          this.ram.set(this.disk2Image.subarray(byteOff, byteOff + byteLen), memAddr);
          this.cpu.markPhysWritten(memAddr, byteLen);
        } else {
          this.disk2Image.set(this.ram.subarray(memAddr, memAddr + byteLen), byteOff);
        }
        cpu.setReg8(REG_EAX + 4, 0x00);
        this.setStackCF(0);
        return;
      }

      default:
        cpu.setReg8(REG_EAX + 4, 0x01); // Invalid / unsupported function
        this.setStackCF(1);
        return;'''
    assert old_int13_ext in html, "INT 13h 0x41/0x48 block not found"
    html = html.replace(old_int13_ext, new_int13_ext, 1)

    # 4. Wire SB16 ports (0x224..0x22F) & Slave DMA ports (0x89..0x8B, 0xC0..0xDF) in portRead/portWrite
    old_pr_sb = '''      case 0x226: case 0x22A: case 0x22C: case 0x22E:'''
    new_pr_sb = '''      case 0x224: case 0x225: case 0x226: case 0x22A: case 0x22C: case 0x22E: case 0x22F:
        if (this.strictBios) return 0xFF;
        return this.sb16.portRead(port);'''
    assert old_pr_sb in html, "portRead SB16 anchor not found"
    html = html.replace(old_pr_sb, new_pr_sb, 1)

    old_pw_dma2 = '''      case 0x80: case 0x84: case 0x85: case 0x86:
      case 0x88: case 0x89: case 0x8A: case 0x8B:
      case 0x8C: case 0x8D: case 0x8E: case 0x8F:
      case 0xC0: case 0xC2: case 0xC4: case 0xC6: case 0xC8: case 0xCA:
      case 0xCC: case 0xCE: case 0xD0: case 0xD2: case 0xD4: case 0xD6:
      case 0xD8: case 0xDA: case 0xDC: case 0xDE:
        return; // I/O delay & slave DMA ports'''
    new_pw_dma2 = '''      case 0x89: case 0x8A: case 0x8B:
      case 0xC0: case 0xC2: case 0xC4: case 0xC6: case 0xC8: case 0xCA:
      case 0xCC: case 0xCE: case 0xD0: case 0xD2: case 0xD4: case 0xD6:
      case 0xD8: case 0xDA: case 0xDC: case 0xDE:
        this.dma.portWrite(port, val);
        return;
      case 0x80: case 0x84: case 0x85: case 0x86:
      case 0x88: case 0x8C: case 0x8D: case 0x8E: case 0x8F:
        return; // I/O delay ports'''
    assert old_pw_dma2 in html, "portWrite slave DMA anchor not found"
    html = html.replace(old_pw_dma2, new_pw_dma2, 1)

    old_pw_sb = '''      case 0x216: case 0x226: case 0x236: case 0x246: case 0x256: case 0x266: case 0x276: case 0x286:
        return;'''
    new_pw_sb = '''      case 0x224: case 0x225: case 0x226: case 0x22C:
        if (!this.strictBios) this.sb16.portWrite(port, val);
        return;
      case 0x216: case 0x236: case 0x246: case 0x256: case 0x266: case 0x276: case 0x286:
        return;'''
    assert old_pw_sb in html, "portWrite SB16 anchor not found"
    html = html.replace(old_pw_sb, new_pw_sb, 1)

    # 5. Append Disk Tray UI before closing </body>
    idx = html.rfind("</body>")
    assert idx > 0
    html = html[:idx] + DISK_TRAY_SNIPPET + "\n" + html[idx:]

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print("Patched hummingbird.html successfully.")


def patch_tabcomp():
    path = os.path.join(ROOT, "tabcomp.html")
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    if "loadDisk2Image" in html:
        print("tabcomp.html already patched.")
        return

    # 1. Extend TabCompSound with stereo 16-bit PCM capture + playback
    old_tc_sound = '''      this.channels = [];
    }'''
    new_tc_sound = '''      this.channels = [];
      this.pcmCapture = [];
      this.pcmTotalFrames = 0;
      this.nextPlayTime = 0;
    }
    submitStereoI16(stereoI16, rate) {
      this.pcmCapture.push(stereoI16);
      this.pcmTotalFrames += (stereoI16.length >>> 1);
      if (typeof window === "undefined") return;
      this.unlock();
      if (!this.ctx || !stereoI16 || stereoI16.length < 2) return;
      try {
        const frames = stereoI16.length >>> 1;
        const buf = this.ctx.createBuffer(2, frames, rate || 22050);
        const chL = buf.getChannelData(0);
        const chR = buf.getChannelData(1);
        for (let i = 0; i < frames; i++) {
          chL[i] = stereoI16[i * 2] / 32768.0;
          chR[i] = stereoI16[i * 2 + 1] / 32768.0;
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.ctx.destination);
        const now = this.ctx.currentTime;
        const startAt = Math.max(now, this.nextPlayTime);
        src.start(startAt);
        this.nextPlayTime = startAt + (frames / buf.sampleRate);
      } catch (_) {}
    }'''
    assert old_tc_sound in html, "TabCompSound constructor anchor not found"
    html = html.replace(old_tc_sound, new_tc_sound, 1)

    # 2. Add disk2Image + sound + loadDisk2Image/ejectDisk2Image to TabCompCPU
    old_tc_cpu = '''      this.spiralDiskImage = null;'''
    new_tc_cpu = '''      this.spiralDiskImage = null;
      this.disk2Image = null;
      this.pcmSound = new TabCompSound(this);
      globalThis._activeSpiralHost = this;'''
    assert old_tc_cpu in html, "TabCompCPU spiralDiskImage anchor not found"
    html = html.replace(old_tc_cpu, new_tc_cpu, 1)

    old_tc_boot_sync = '''        case 36: { // REBOOT_SPIRAL(img_ram_base) -> reloads SpiralOS image & restarts Core
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
        }'''
    new_tc_boot_sync = '''        case 36: { // REBOOT_SPIRAL(img_ram_base) -> reloads SpiralOS image & restarts Core
          const base = r[0] & 0xFFFFFF;
          if (this.spiralDiskImage && base > 0) {
            const copyLen = Math.min(this.spiralDiskImage.length, 2880 * 512);
            this.spiralDiskImage.set(this.ram.subarray(base, base + copyLen), 0);
          }
          if (this.spiralDiskImage) {
            bootSpiralDiskImage(this, this.spiralDiskImage);
          }
          r[0] = 0;
          break;
        }
        // [INLINE: TabComp Disk Unit 1 (SYS 37..39) & Stereo 16-bit PCM Device (SYS 40..41)]
        case 37: { // DISK2_INFO(cmd) -> sector count (0 if ejected)
          r[0] = this.disk2Image ? Math.floor(this.disk2Image.length / 512) : 0;
          break;
        }
        case 38: { // DISK2_READ(lba, count, dst_phys_addr) -> 0 ok, -1 ejected, -2 err
          const lba = r[0] >>> 0;
          const cnt = r[1] | 0;
          const dst = r[2] >>> 0;
          if (!this.disk2Image) { r[0] = -1; break; }
          const tot = Math.floor(this.disk2Image.length / 512);
          if (cnt <= 0 || lba + cnt > tot || dst + cnt * 512 > this.ram.length) { r[0] = -2; break; }
          this.ram.set(this.disk2Image.subarray(lba * 512, (lba + cnt) * 512), dst);
          r[0] = 0;
          break;
        }
        case 39: { // DISK2_WRITE(lba, count, src_phys_addr) -> 0 ok, -1 ejected, -2 err
          const lba = r[0] >>> 0;
          const cnt = r[1] | 0;
          const src = r[2] >>> 0;
          if (!this.disk2Image) { r[0] = -1; break; }
          const tot = Math.floor(this.disk2Image.length / 512);
          if (cnt <= 0 || lba + cnt > tot || src + cnt * 512 > this.ram.length) { r[0] = -2; break; }
          this.disk2Image.set(this.ram.subarray(src, src + cnt * 512), lba * 512);
          r[0] = 0;
          break;
        }
        case 40: { // AUDIO_INFO(cmd) -> 0:caps(7), 1:22050, 2:queued, 3:4096
          const cmd = r[0] | 0;
          if (cmd === 0) r[0] = 7;
          else if (cmd === 1) r[0] = 22050;
          else if (cmd === 2) r[0] = 0;
          else if (cmd === 3) r[0] = 4096;
          else r[0] = 0;
          break;
        }
        case 41: { // AUDIO_WRITE(src_phys_addr, num_frames) -> frames_written
          const src = r[0] >>> 0;
          const nFrames = r[1] | 0;
          if (nFrames <= 0 || src + nFrames * 4 > this.ram.length) { r[0] = -1; break; }
          const out = new Int16Array(nFrames * 2);
          const dv = new DataView(this.ram.buffer, this.ram.byteOffset + src, nFrames * 4);
          for (let i = 0; i < nFrames * 2; i++) out[i] = dv.getInt16(i * 2, true);
          if (this.pcmSound) this.pcmSound.submitStereoI16(out, 22050);
          r[0] = nFrames;
          break;
        }'''
    assert old_tc_boot_sync in html, "TabComp case 36 anchor not found"
    html = html.replace(old_tc_boot_sync, new_tc_boot_sync, 1)

    # Add loadDisk2Image / ejectDisk2Image methods on TabCompCPU
    old_tc_method = '''    _syncStudioNetMMIO() {'''
    new_tc_method = '''    loadDisk2Image(u8) {
      if (!u8) { this.disk2Image = null; return; }
      this.disk2Image = new Uint8Array(u8.length);
      this.disk2Image.set(u8);
    }
    ejectDisk2Image() {
      const out = this.disk2Image;
      this.disk2Image = null;
      return out;
    }
    _syncStudioNetMMIO() {'''
    assert old_tc_method in html, "TabComp _syncStudioNetMMIO anchor not found"
    html = html.replace(old_tc_method, new_tc_method, 1)

    # Append Disk Tray UI before final </body>
    idx = html.rfind("</body>")
    assert idx > 0
    html = html[:idx] + DISK_TRAY_SNIPPET + "\n" + html[idx:]

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print("Patched tabcomp.html successfully.")


def patch_triton():
    path = os.path.join(ROOT, "triton/spiralos-triton.html")
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    if "loadDisk2Image" in html:
        print("triton/spiralos-triton.html already patched.")
        return

    # 1. TritonCPU (JS interpreter) fields & ports 28..32
    old_tcpu_fields = '''    this.diskStatus = 0;
    this.diskErr = 0;'''
    new_tcpu_fields = '''    this.diskStatus = 0;
    this.diskErr = 0;
    this.diskUnit = 0;
    this.disk2Image = null;
    this.audioDmaAddr = 0;
    this.audioCount = 0;
    this.pcmCapture = [];
    this.pcmTotalFrames = 0;'''
    assert old_tcpu_fields in html, "TritonCPU diskStatus anchor not found"
    html = html.replace(old_tcpu_fields, new_tcpu_fields, 1)

    old_tcpu_in = '''    } else if (port === 27) {
      if (this.netRxFrame && this.netRxPos < this.netRxFrame.length) {
        w0 = this.netRxFrame[this.netRxPos++];
      }
    }'''
    new_tcpu_in = '''    } else if (port === 27) {
      if (this.netRxFrame && this.netRxPos < this.netRxFrame.length) {
        w0 = this.netRxFrame[this.netRxPos++];
      }
    } else if (port === 28) {
      w0 = this.diskUnit;
    } else if (port === 29) {
      const secs = this.disk2Image ? Math.floor(this.disk2Image.length / 512) : 0;
      [w0, w1, w2] = numberToWord(secs);
    } else if (port === 32) {
      w0 = 7; // PCM stereo 16-bit capable
    }'''
    assert old_tcpu_in in html, "TritonCPU port 27 in anchor not found"
    html = html.replace(old_tcpu_in, new_tcpu_in, 1)

    old_tcpu_out20 = '''      } else if (cmd === 1 || cmd === 2) {
        // 1 = DMA_READ, 2 = DMA_WRITE'''
    new_tcpu_out20 = '''      } else if ((cmd === 1 || cmd === 2) && this.diskUnit === 1) {
        // Unit 1: 512-byte sectors on disk2Image (1 byte per tryte in mem)
        if (!this.disk2Image) {
          this.diskStatus = -1; this.diskErr = 4;
        } else {
          const tot = Math.floor(this.disk2Image.length / 512);
          const nBytes = this.diskCount * 512;
          if (this.diskCount <= 0 || this.diskLba < 0 || this.diskLba + this.diskCount > tot || this.diskDmaAddr < 0 || this.diskDmaAddr + nBytes > this.ramSize) {
            this.diskStatus = -1; this.diskErr = 1;
          } else {
            const off = this.diskLba * 512;
            if (cmd === 1) {
              for (let i = 0; i < nBytes; i++) this.mem[this.diskDmaAddr + i] = this.disk2Image[off + i];
            } else {
              for (let i = 0; i < nBytes; i++) this.disk2Image[off + i] = this.mem[this.diskDmaAddr + i] & 0xFF;
            }
            this.diskStatus = 1; this.diskErr = 0;
          }
        }
      } else if (cmd === 1 || cmd === 2) {
        // 1 = DMA_READ, 2 = DMA_WRITE'''
    assert old_tcpu_out20 in html, "TritonCPU port 20 out anchor not found"
    html = html.replace(old_tcpu_out20, new_tcpu_out20, 1)

    old_tcpu_out26 = '''    } else if (port === 26) {
      if (this.netTxLen < 512) {
        this.netTxBuf[this.netTxLen++] = ((w0 % 256) + 256) % 256;
      }
    }'''
    new_tcpu_out26 = '''    } else if (port === 26) {
      if (this.netTxLen < 512) {
        this.netTxBuf[this.netTxLen++] = ((w0 % 256) + 256) % 256;
      }
    } else if (port === 28) {
      this.diskUnit = w0 === 1 ? 1 : 0;
    } else if (port === 30) {
      this.audioDmaAddr = fullVal;
    } else if (port === 31) {
      this.audioCount = fullVal;
    } else if (port === 32) {
      if (w0 === 1 && this.audioCount > 0 && this.audioDmaAddr >= 0 && this.audioDmaAddr + this.audioCount * 4 <= this.ramSize) {
        const out = new Int16Array(this.audioCount * 2);
        for (let i = 0; i < this.audioCount * 2; i++) {
          const lo = this.mem[this.audioDmaAddr + i * 2] & 0xFF;
          const hi = this.mem[this.audioDmaAddr + i * 2 + 1] & 0xFF;
          const v = lo | (hi << 8);
          out[i] = (v & 0x8000) ? (v - 0x10000) : v;
        }
        this.pcmCapture.push(out);
        this.pcmTotalFrames += this.audioCount;
      }
    }'''
    assert old_tcpu_out26 in html, "TritonCPU port 26 out anchor not found"
    html = html.replace(old_tcpu_out26, new_tcpu_out26, 1)

    # 2. TritonWASM WAT extensions (State slots: 82420 DiskUnit, 82424 Disk2Sectors, 82428 Disk2Trig,
    #    82432 AudioDmaAddr, 82436 AudioCount, 82440 AudioTrig)
    old_wat_in = '''    (if (i32.eq (local.get $port) (i32.const 27))
      (then
        (local.set $head (i32.load (i32.const 82392)))
        (local.set $tail (i32.load (i32.const 82388)))
        (if (i32.lt_s (local.get $head) (local.get $tail))
          (then
            (local.set $w0 (i32.load8_u (i32.add (i32.const 565760) (local.get $head))))
            (i32.store (i32.const 82392) (i32.add (local.get $head) (i32.const 1)))
          ))))'''
    new_wat_in = old_wat_in + '''
    (if (i32.eq (local.get $port) (i32.const 28)) (then (local.set $w0 (i32.load (i32.const 82420)))))
    (if (i32.eq (local.get $port) (i32.const 29))
      (then
        (call $set_word_num (local.get $rd) (i64.extend_i32_u (i32.load (i32.const 82424))))
        (local.set $w0 (call $get_w0 (local.get $rd)))
        (local.set $w1 (call $get_w1 (local.get $rd)))
        (local.set $w2 (call $get_w2 (local.get $rd)))))
    (if (i32.eq (local.get $port) (i32.const 32)) (then (local.set $w0 (i32.const 7))))'''
    assert old_wat_in in html, "TritonWASM port_in_t3 port 27 anchor not found"
    html = html.replace(old_wat_in, new_wat_in, 1)

    old_wat_out20 = '''            (if (i32.or (i32.eq (local.get $w0) (i32.const 1)) (i32.eq (local.get $w0) (i32.const 2)))
              (then
                (local.set $lba (call $maybe_narrow (i64.load (i32.const 83568))))'''
    new_wat_out20 = '''            (if (i32.and (i32.eq (i32.load (i32.const 82420)) (i32.const 1)) (i32.or (i32.eq (local.get $w0) (i32.const 1)) (i32.eq (local.get $w0) (i32.const 2))))
              (then
                (i32.store (i32.const 82428) (local.get $w0))
              )
              (else
            (if (i32.or (i32.eq (local.get $w0) (i32.const 1)) (i32.eq (local.get $w0) (i32.const 2)))
              (then
                (local.set $lba (call $maybe_narrow (i64.load (i32.const 83568))))'''
    assert old_wat_out20 in html, "TritonWASM port 20 out anchor not found"
    html = html.replace(old_wat_out20, new_wat_out20, 1)

    old_wat_out20_end = '''              (else
                (i32.store (i32.const 82372) (i32.const -1))
                (i32.store (i32.const 82376) (i32.const 3))
              ))
          ))))'''
    new_wat_out20_end = '''              (else
                (i32.store (i32.const 82372) (i32.const -1))
                (i32.store (i32.const 82376) (i32.const 3))
              ))
            ))
          ))))'''
    assert old_wat_out20_end in html, "TritonWASM port 20 end anchor not found"
    html = html.replace(old_wat_out20_end, new_wat_out20_end, 1)

    old_wat_out26 = '''            (i32.store (i32.const 82384) (i32.add (local.get $addr) (i32.const 1)))
          ))))'''
    new_wat_out26 = old_wat_out26 + '''
    (if (i32.eq (local.get $port) (i32.const 28)) (then (i32.store (i32.const 82420) (local.get $w0))))
    (if (i32.eq (local.get $port) (i32.const 30)) (then (i32.store (i32.const 82432) (i32.wrap_i64 (local.get $full)))))
    (if (i32.eq (local.get $port) (i32.const 31)) (then (i32.store (i32.const 82436) (i32.wrap_i64 (local.get $full)))))
    (if (i32.eq (local.get $port) (i32.const 32))
      (then
        (if (i32.eq (local.get $w0) (i32.const 1))
          (then (i32.store (i32.const 82440) (i32.const 1))))))'''
    assert old_wat_out26 in html, "TritonWASM port 26 end anchor not found"
    html = html.replace(old_wat_out26, new_wat_out26, 1)

    # Break step_batch on Disk2Trig (82428) or AudioTrig (82440)
    old_wat_brk = '''(br_if $brk (i32.or (i32.or (i32.load (i32.const 82400)) (i32.load (i32.const 82404))) (i32.ge_s (i32.load (i32.const 82412)) (i32.const 8192))))'''
    new_wat_brk = '''(br_if $brk (i32.or (i32.or (i32.or (i32.load (i32.const 82400)) (i32.load (i32.const 82404))) (i32.or (i32.load (i32.const 82428)) (i32.load (i32.const 82440)))) (i32.ge_s (i32.load (i32.const 82412)) (i32.const 8192))))'''
    assert old_wat_brk in html, "TritonWASM step_batch break anchor not found"
    html = html.replace(old_wat_brk, new_wat_brk, 1)

    # 3. TritonWASM JS side: disk2Image, pcmCapture, loadDisk2Image/ejectDisk2Image, _syncHostTriggers
    old_wasm_ctor = '''    this.netRxQueue = [];
    this.txHooks = [];
    this.consoleAcc = '';'''
    new_wasm_ctor = '''    this.netRxQueue = [];
    this.txHooks = [];
    this.consoleAcc = '';
    this.disk2Image = null;
    this.pcmCapture = [];
    this.pcmTotalFrames = 0;
    this.audioCtx = null;
    this.nextPlayTime = 0;
    globalThis._activeSpiralHost = this;'''
    assert old_wasm_ctor in html, "TritonWASM constructor anchor not found"
    html = html.replace(old_wasm_ctor, new_wasm_ctor, 1)

    old_wasm_reset = '''    this.i32[20600] = 0; // NetTxTrig
    this.i32[20601] = 0; // NetRxPopTrig'''
    new_wasm_reset = '''    this.i32[20600] = 0; // NetTxTrig
    this.i32[20601] = 0; // NetRxPopTrig
    this.i32[20605] = 0; // DiskUnit (82420)
    this.i32[20606] = this.disk2Image ? Math.floor(this.disk2Image.length / 512) : 0; // Disk2Sectors (82424)
    this.i32[20607] = 0; // Disk2Trig (82428)
    this.i32[20608] = 0; // AudioDmaAddr (82432)
    this.i32[20609] = 0; // AudioCount (82436)
    this.i32[20610] = 0; // AudioTrig (82440)'''
    assert old_wasm_reset in html, "TritonWASM reset anchor not found"
    html = html.replace(old_wasm_reset, new_wasm_reset, 1)

    old_wasm_trig = '''    if (this.i32[20601] > 0) {
      this.i32[20601] = 0;
      if (this.netRxQueue.length > 0) {
        const next = this.netRxQueue.shift();
        this.u8.set(next.subarray(0, 512), 565760);
        this.i32[20597] = Math.min(512, next.length);
        this.i32[20598] = 0;
      } else {
        this.i32[20597] = 0;
        this.i32[20598] = 0;
      }
    }
  }'''
    new_wasm_trig = '''    if (this.i32[20601] > 0) {
      this.i32[20601] = 0;
      if (this.netRxQueue.length > 0) {
        const next = this.netRxQueue.shift();
        this.u8.set(next.subarray(0, 512), 565760);
        this.i32[20597] = Math.min(512, next.length);
        this.i32[20598] = 0;
      } else {
        this.i32[20597] = 0;
        this.i32[20598] = 0;
      }
    }
    if (this.i32[20607] > 0) {
      const cmd = this.i32[20607];
      this.i32[20607] = 0;
      const lba = this._getI64(83568);
      const dma = this._getI64(83576);
      const cnt = this._getI64(83584);
      if (!this.disk2Image) {
        this.i32[20593] = -1; this.i32[20594] = 4;
      } else {
        const tot = Math.floor(this.disk2Image.length / 512);
        const nBytes = cnt * 512;
        if (cnt <= 0 || lba < 0 || lba + cnt > tot || dma < 0 || dma + nBytes > this.ramSize) {
          this.i32[20593] = -1; this.i32[20594] = 1;
        } else {
          const off = lba * 512;
          if (cmd === 1) {
            for (let i = 0; i < nBytes; i++) this.mem[dma + i] = this.disk2Image[off + i];
          } else {
            for (let i = 0; i < nBytes; i++) this.disk2Image[off + i] = this.mem[dma + i] & 0xFF;
          }
          this.i32[20593] = 1; this.i32[20594] = 0;
        }
      }
    }
    if (this.i32[20610] > 0) {
      this.i32[20610] = 0;
      const dma = this.i32[20608];
      const nFrames = this.i32[20609];
      if (nFrames > 0 && dma >= 0 && dma + nFrames * 4 <= this.ramSize) {
        const out = new Int16Array(nFrames * 2);
        for (let i = 0; i < nFrames * 2; i++) {
          const lo = this.mem[dma + i * 2] & 0xFF;
          const hi = this.mem[dma + i * 2 + 1] & 0xFF;
          const v = lo | (hi << 8);
          out[i] = (v & 0x8000) ? (v - 0x10000) : v;
        }
        this.pcmCapture.push(out);
        this.pcmTotalFrames += nFrames;
        if (typeof window !== "undefined") {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) {
            try {
              if (!this.audioCtx) this.audioCtx = new AC();
              if (this.audioCtx.state === "suspended") this.audioCtx.resume();
              const buf = this.audioCtx.createBuffer(2, nFrames, 22050);
              const chL = buf.getChannelData(0), chR = buf.getChannelData(1);
              for (let i = 0; i < nFrames; i++) { chL[i] = out[i * 2] / 32768.0; chR[i] = out[i * 2 + 1] / 32768.0; }
              const src = this.audioCtx.createBufferSource();
              src.buffer = buf; src.connect(this.audioCtx.destination);
              const now = this.audioCtx.currentTime;
              const startAt = Math.max(now, this.nextPlayTime);
              src.start(startAt); this.nextPlayTime = startAt + (nFrames / buf.sampleRate);
            } catch (_) {}
          }
        }
      }
    }
  }
  loadDisk2Image(u8) {
    if (!u8) { this.disk2Image = null; this.i32[20606] = 0; return; }
    this.disk2Image = new Uint8Array(u8.length);
    this.disk2Image.set(u8);
    this.i32[20606] = Math.floor(this.disk2Image.length / 512);
  }
  ejectDisk2Image() {
    const out = this.disk2Image;
    this.disk2Image = null;
    this.i32[20606] = 0;
    return out;
  }'''
    assert old_wasm_trig in html, "TritonWASM _syncHostTriggers anchor not found"
    html = html.replace(old_wasm_trig, new_wasm_trig, 1)

    # Append Disk Tray UI before closing </body>
    idx = html.rfind("</body>")
    assert idx > 0
    html = html[:idx] + DISK_TRAY_SNIPPET + "\n" + html[idx:]

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print("Patched triton/spiralos-triton.html successfully.")


if __name__ == "__main__":
    patch_hummingbird()
    patch_tabcomp()
    patch_triton()
