// ============================================================================
// SpiralOS 1.7 — Independent Clean-Room FAT12/16/32 + VFAT LFN Oracle
// (tests/fat-oracle.js) · Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Written directly from the Microsoft FAT32 File System Specification
// (fatgen103, Dec 2000) without referencing SpiralOS's os/fat.sp driver.
// ============================================================================

"use strict";

const SECTOR_BYTES = 512;
const ATTR_READ_ONLY = 0x01;
const ATTR_HIDDEN    = 0x02;
const ATTR_SYSTEM    = 0x04;
const ATTR_VOLUME_ID = 0x08;
const ATTR_DIRECTORY = 0x10;
const ATTR_ARCHIVE   = 0x20;
const ATTR_LONG_NAME = 0x0F;

function readLe16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function readLe32(buf, off) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }
function writeLe16(buf, off, val) { buf[off] = val & 0xFF; buf[off + 1] = (val >>> 8) & 0xFF; }
function writeLe32(buf, off, val) {
  buf[off] = val & 0xFF;
  buf[off + 1] = (val >>> 8) & 0xFF;
  buf[off + 2] = (val >>> 16) & 0xFF;
  buf[off + 3] = (val >>> 24) & 0xFF;
}

function computeSfnChecksum(raw11) {
  let acc = 0;
  for (let i = 0; i < 11; i++) {
    acc = (((acc & 1) ? 0x80 : 0) + (acc >>> 1) + raw11[i]) & 0xFF;
  }
  return acc;
}

/**
 * Format a brand-new FAT12, FAT16, or FAT32 disk image (Uint8Array).
 */
function formatFatVolume(kind, totalSectors, opts = {}) {
  const fatKind = String(kind).toUpperCase();
  const withMbr = !!opts.mbr;
  const partStart = withMbr ? 63 : 0;
  const volSectors = totalSectors - partStart;
  const image = new Uint8Array(totalSectors * SECTOR_BYTES);

  let spc, reservedSectors, rootEntries, sectorsPerFat;
  if (fatKind === "FAT12") {
    spc = opts.spc || 1;
    reservedSectors = 1;
    rootEntries = 224;
    const rootSecs = Math.ceil((rootEntries * 32) / SECTOR_BYTES);
    const estClusters = Math.floor((volSectors - reservedSectors - rootSecs) / spc);
    sectorsPerFat = Math.max(1, Math.ceil(((estClusters + 2) * 1.5) / SECTOR_BYTES));
  } else if (fatKind === "FAT16") {
    spc = opts.spc || 4;
    reservedSectors = 1;
    rootEntries = 512;
    const rootSecs = Math.ceil((rootEntries * 32) / SECTOR_BYTES);
    const estClusters = Math.floor((volSectors - reservedSectors - rootSecs) / spc);
    sectorsPerFat = Math.max(16, Math.ceil(((estClusters + 2) * 2) / SECTOR_BYTES));
  } else if (fatKind === "FAT32") {
    spc = opts.spc || 1;
    reservedSectors = 32;
    rootEntries = 0;
    const estClusters = Math.floor((volSectors - reservedSectors) / spc);
    sectorsPerFat = Math.max(32, Math.ceil(((estClusters + 2) * 4) / SECTOR_BYTES));
  } else {
    throw new Error("Unsupported FAT type: " + kind);
  }

  if (withMbr) {
    // Write single primary partition in MBR slot 0
    const p = 446;
    image[p + 0] = 0x80;
    image[p + 4] = fatKind === "FAT32" ? 0x0C : (fatKind === "FAT16" ? 0x06 : 0x01);
    writeLe32(image, p + 8, partStart);
    writeLe32(image, p + 12, volSectors);
    image[510] = 0x55;
    image[511] = 0xAA;
  }

  const bpb = partStart * SECTOR_BYTES;
  image[bpb + 0] = 0xEB; image[bpb + 1] = 0x58; image[bpb + 2] = 0x90;
  const oem = "MSWIN4.1";
  for (let i = 0; i < 8; i++) image[bpb + 3 + i] = oem.charCodeAt(i);
  writeLe16(image, bpb + 11, SECTOR_BYTES);
  image[bpb + 13] = spc;
  writeLe16(image, bpb + 14, reservedSectors);
  image[bpb + 16] = 2; // NumFATs
  writeLe16(image, bpb + 17, rootEntries);
  if (volSectors < 65536 && fatKind !== "FAT32") {
    writeLe16(image, bpb + 19, volSectors);
  } else {
    writeLe32(image, bpb + 32, volSectors);
  }
  image[bpb + 21] = 0xF8; // Media
  writeLe16(image, bpb + 24, 63);
  writeLe16(image, bpb + 26, 255);
  writeLe32(image, bpb + 28, partStart);

  if (fatKind === "FAT32") {
    writeLe16(image, bpb + 22, 0);
    writeLe32(image, bpb + 36, sectorsPerFat);
    writeLe16(image, bpb + 40, 0);
    writeLe16(image, bpb + 42, 0);
    writeLe32(image, bpb + 44, 2); // RootClus = 2
    writeLe16(image, bpb + 48, 1); // FSInfo = 1
    writeLe16(image, bpb + 50, 6); // BackupBoot = 6
    image[bpb + 64] = 0x80;
    image[bpb + 66] = 0x29;
    writeLe32(image, bpb + 67, 0x17000032);
    const lbl = "SHELF32    ";
    for (let i = 0; i < 11; i++) image[bpb + 71 + i] = lbl.charCodeAt(i);
    const fst = "FAT32   ";
    for (let i = 0; i < 8; i++) image[bpb + 82 + i] = fst.charCodeAt(i);

    // FSInfo sector
    const fsi = (partStart + 1) * SECTOR_BYTES;
    writeLe32(image, fsi + 0, 0x41615252);
    writeLe32(image, fsi + 484, 0x61417272);
    writeLe32(image, fsi + 488, 0xFFFFFFFF);
    writeLe32(image, fsi + 492, 3);
    image[fsi + 510] = 0x55; image[fsi + 511] = 0xAA;
  } else {
    writeLe16(image, bpb + 22, sectorsPerFat);
    image[bpb + 36] = 0x80;
    image[bpb + 38] = 0x29;
    writeLe32(image, bpb + 39, fatKind === "FAT16" ? 0x17000016 : 0x17000012);
    const lbl = fatKind === "FAT16" ? "SHELF16    " : "SHELF12    ";
    for (let i = 0; i < 11; i++) image[bpb + 43 + i] = lbl.charCodeAt(i);
    const fst = fatKind === "FAT16" ? "FAT16   " : "FAT12   ";
    for (let i = 0; i < 8; i++) image[bpb + 54 + i] = fst.charCodeAt(i);
  }
  image[bpb + 510] = 0x55;
  image[bpb + 511] = 0xAA;

  // Initialize reserved FAT entries 0 and 1 (and cluster 2 EOC for FAT32 root dir) in both FAT copies
  for (let copy = 0; copy < 2; copy++) {
    const fOff = (partStart + reservedSectors + copy * sectorsPerFat) * SECTOR_BYTES;
    if (fatKind === "FAT12") {
      image[fOff + 0] = 0xF8; image[fOff + 1] = 0xFF; image[fOff + 2] = 0xFF;
    } else if (fatKind === "FAT16") {
      writeLe16(image, fOff + 0, 0xFFF8);
      writeLe16(image, fOff + 2, 0xFFFF);
    } else {
      writeLe32(image, fOff + 0, 0x0FFFFFF8);
      writeLe32(image, fOff + 4, 0x0FFFFFFF);
      writeLe32(image, fOff + 8, 0x0FFFFFFF); // Root cluster 2 EOC
    }
  }
  return image;
}

class FatOracleVolume {
  constructor(diskBytes) {
    this.disk = diskBytes;
    this.mount();
  }

  readSector(lba) {
    const off = lba * SECTOR_BYTES;
    if (off < 0 || off + SECTOR_BYTES > this.disk.length) throw new Error("LBA out of range: " + lba);
    return this.disk.subarray(off, off + SECTOR_BYTES);
  }

  mount() {
    let partLba = 0;
    const sec0 = this.readSector(0);
    if (sec0[510] !== 0x55 || sec0[511] !== 0xAA) throw new Error("Missing boot signature 0xAA55");
    const bps0 = readLe16(sec0, 11);
    const spc0 = sec0[13];
    const validSpc = spc0 > 0 && (spc0 & (spc0 - 1)) === 0;
    if (bps0 !== 512 || !validSpc) {
      // Inspect MBR partition table
      let found = -1;
      for (let i = 0; i < 4; i++) {
        const pe = 446 + i * 16;
        const ptype = sec0[pe + 4];
        const lba = readLe32(sec0, pe + 8);
        const cnt = readLe32(sec0, pe + 12);
        if (ptype !== 0 && lba > 0 && cnt > 0) { found = lba; break; }
      }
      if (found < 0) throw new Error("No valid BPB or MBR partition found");
      partLba = found;
    }

    const bpb = this.readSector(partLba);
    if (bpb[510] !== 0x55 || bpb[511] !== 0xAA) throw new Error("Missing VBR signature");
    this.partLba = partLba;
    this.bytesPerSec = readLe16(bpb, 11);
    this.secPerClus = bpb[13];
    this.resSec = readLe16(bpb, 14);
    this.numFats = bpb[16];
    this.rootEntCnt = readLe16(bpb, 17);
    const tot16 = readLe16(bpb, 19);
    const tot32 = readLe32(bpb, 32);
    this.totSec = tot16 !== 0 ? tot16 : tot32;
    const fsz16 = readLe16(bpb, 22);
    const fsz32 = readLe32(bpb, 36);
    this.fatSz = fsz16 !== 0 ? fsz16 : fsz32;
    this.rootDirSecs = Math.ceil((this.rootEntCnt * 32) / this.bytesPerSec);
    this.fatStartLba = partLba + this.resSec;
    this.rootDirLba = this.fatStartLba + this.numFats * this.fatSz;
    this.firstDataLba = this.rootDirLba + this.rootDirSecs;
    const dataSecs = this.totSec - (this.resSec + this.numFats * this.fatSz + this.rootDirSecs);
    this.clusterCount = Math.floor(dataSecs / this.secPerClus);
    if (this.clusterCount < 4085) this.fatType = 12;
    else if (this.clusterCount < 65525) this.fatType = 16;
    else this.fatType = 32;
    this.rootCluster = this.fatType === 32 ? readLe32(bpb, 44) : 0;
  }

  verifyFatCopiesMatch() {
    if (this.numFats < 2) return true;
    const f1 = this.fatStartLba * SECTOR_BYTES;
    const f2 = (this.fatStartLba + this.fatSz) * SECTOR_BYTES;
    const len = this.fatSz * SECTOR_BYTES;
    for (let i = 0; i < len; i++) {
      if (this.disk[f1 + i] !== this.disk[f2 + i]) return false;
    }
    return true;
  }

  clusterToLba(c) {
    return this.firstDataLba + (c - 2) * this.secPerClus;
  }

  isEoc(val) {
    if (this.fatType === 12) return val >= 0x0FF8;
    if (this.fatType === 16) return val >= 0xFFF8;
    return (val & 0x0FFFFFFF) >= 0x0FFFFFF8;
  }

  eocMarker() {
    if (this.fatType === 12) return 0x0FFF;
    if (this.fatType === 16) return 0xFFFF;
    return 0x0FFFFFFF;
  }

  getFat(c) {
    const base = this.fatStartLba * SECTOR_BYTES;
    if (this.fatType === 12) {
      const off = Math.floor((c * 3) / 2);
      const w = readLe16(this.disk, base + off);
      return (c & 1) ? (w >>> 4) : (w & 0x0FFF);
    }
    if (this.fatType === 16) {
      return readLe16(this.disk, base + c * 2);
    }
    return readLe32(this.disk, base + c * 4) & 0x0FFFFFFF;
  }

  setFat(c, val) {
    for (let copy = 0; copy < this.numFats; copy++) {
      const base = (this.fatStartLba + copy * this.fatSz) * SECTOR_BYTES;
      if (this.fatType === 12) {
        const off = Math.floor((c * 3) / 2);
        let w = readLe16(this.disk, base + off);
        if (c & 1) w = (w & 0x000F) | ((val & 0x0FFF) << 4);
        else w = (w & 0xF000) | (val & 0x0FFF);
        writeLe16(this.disk, base + off, w);
      } else if (this.fatType === 16) {
        writeLe16(this.disk, base + c * 2, val & 0xFFFF);
      } else {
        const cur = readLe32(this.disk, base + c * 4);
        writeLe32(this.disk, base + c * 4, (cur & 0xF0000000) | (val & 0x0FFFFFFF));
      }
    }
  }

  allocCluster(prev = 0) {
    for (let c = 2; c < this.clusterCount + 2; c++) {
      if (this.getFat(c) === 0) {
        this.setFat(c, this.eocMarker());
        if (prev >= 2) this.setFat(prev, c);
        const off = this.clusterToLba(c) * SECTOR_BYTES;
        this.disk.fill(0, off, off + this.secPerClus * SECTOR_BYTES);
        return c;
      }
    }
    throw new Error("FAT volume full");
  }

  freeChain(startCluster) {
    let c = startCluster;
    let guard = 0;
    while (c >= 2 && !this.isEoc(c) && guard < this.clusterCount + 4) {
      const nxt = this.getFat(c);
      this.setFat(c, 0);
      c = nxt;
      guard++;
    }
  }

  collectDirSectors(dirCluster) {
    const lbas = [];
    if (dirCluster === 0 && this.fatType !== 32) {
      for (let i = 0; i < this.rootDirSecs; i++) lbas.push(this.rootDirLba + i);
      return lbas;
    }
    let c = dirCluster === 0 ? this.rootCluster : dirCluster;
    let guard = 0;
    while (c >= 2 && !this.isEoc(c) && guard < this.clusterCount + 4) {
      const base = this.clusterToLba(c);
      for (let s = 0; s < this.secPerClus; s++) lbas.push(base + s);
      c = this.getFat(c);
      guard++;
    }
    return lbas;
  }

  decodeShortName(entry) {
    let base = "";
    for (let i = 0; i < 8; i++) base += String.fromCharCode(entry[i]);
    base = base.trimEnd();
    let ext = "";
    for (let i = 8; i < 11; i++) ext += String.fromCharCode(entry[i]);
    ext = ext.trimEnd();
    return ext.length ? `${base}.${ext}` : base;
  }

  readDirEntries(dirCluster) {
    const lbas = this.collectDirSectors(dirCluster);
    const items = [];
    let lfnParts = [];
    let lfnChecksum = -1;
    let lfnSlotCount = 0;
    let slotIndex = 0;

    for (const lba of lbas) {
      const sec = this.readSector(lba);
      for (let off = 0; off < SECTOR_BYTES; off += 32, slotIndex++) {
        const b0 = sec[off];
        if (b0 === 0x00) return items;
        if (b0 === 0xE5) { lfnParts = []; lfnChecksum = -1; lfnSlotCount = 0; continue; }
        const attr = sec[off + 11];
        if (attr === ATTR_LONG_NAME) {
          const seq = b0 & 0x3F;
          const isLast = (b0 & 0x40) !== 0;
          if (isLast) { lfnParts = []; lfnChecksum = sec[off + 13]; lfnSlotCount = 0; }
          if (sec[off + 13] === lfnChecksum && seq >= 1 && seq <= 20) {
            const offsets = [1, 3, 5, 7, 9, 14, 16, 18, 20, 22, 24, 28, 30];
            let chunk = "";
            for (const o of offsets) {
              const ch = readLe16(sec, off + o);
              if (ch === 0x0000 || ch === 0xFFFF) break;
              chunk += String.fromCharCode(ch);
            }
            lfnParts[seq - 1] = chunk;
            lfnSlotCount++;
          }
          continue;
        }
        if ((attr & ATTR_VOLUME_ID) !== 0) { lfnParts = []; lfnChecksum = -1; lfnSlotCount = 0; continue; }

        const raw11 = sec.subarray(off, off + 11);
        const sfn = this.decodeShortName(raw11);
        let name = sfn;
        if (lfnSlotCount > 0 && computeSfnChecksum(raw11) === lfnChecksum) {
          name = lfnParts.join("");
        }
        const clusHi = this.fatType === 32 ? readLe16(sec, off + 20) : 0;
        const clusLo = readLe16(sec, off + 26);
        const startCluster = ((clusHi << 16) | clusLo) >>> 0;
        const size = readLe32(sec, off + 28);
        items.push({
          name,
          sfn,
          attr,
          isDir: (attr & ATTR_DIRECTORY) !== 0,
          startCluster,
          size,
          lba,
          off,
          slotIndex,
          lfnSlotCount
        });
        lfnParts = []; lfnChecksum = -1; lfnSlotCount = 0;
      }
    }
    return items;
  }

  splitPath(p) {
    let s = p.replace(/^\/shelf\/?/i, "/");
    return s.split("/").filter(Boolean);
  }

  resolve(p) {
    const parts = this.splitPath(p);
    if (parts.length === 0) return { isDir: true, startCluster: this.fatType === 32 ? this.rootCluster : 0, size: 0, name: "/" };
    let cur = this.fatType === 32 ? this.rootCluster : 0;
    for (let i = 0; i < parts.length; i++) {
      const target = parts[i].toLowerCase();
      const entries = this.readDirEntries(cur);
      const hit = entries.find(e => e.name.toLowerCase() === target || e.sfn.toLowerCase() === target);
      if (!hit) return null;
      if (i === parts.length - 1) return { ...hit, parentCluster: cur };
      if (!hit.isDir) return null;
      cur = hit.startCluster;
    }
    return null;
  }

  resolveParent(p) {
    const parts = this.splitPath(p);
    if (parts.length === 0) throw new Error("Empty path");
    const leaf = parts.pop();
    let cur = this.fatType === 32 ? this.rootCluster : 0;
    for (const seg of parts) {
      const entries = this.readDirEntries(cur);
      const hit = entries.find(e => e.isDir && (e.name.toLowerCase() === seg.toLowerCase() || e.sfn.toLowerCase() === seg.toLowerCase()));
      if (!hit) throw new Error("Parent folder missing: " + seg);
      cur = hit.startCluster;
    }
    return { parentCluster: cur, leaf };
  }

  makeUniqueSfn(dirCluster, name) {
    const existing = new Set(this.readDirEntries(dirCluster).map(e => e.sfn.toUpperCase()));
    const clean = (s) => s.toUpperCase().replace(/[^A-Z0-9_$!#%&'()\-@^`{}~]/g, "");
    const dot = name.lastIndexOf(".");
    const rawBase = dot > 0 ? name.slice(0, dot) : name;
    const rawExt = dot > 0 ? name.slice(dot + 1) : "";
    const cBase = clean(rawBase) || "FILE";
    const cExt = clean(rawExt).slice(0, 3);
    const fits83 = rawBase.length <= 8 && rawExt.length <= 3 &&
      rawBase === cBase && rawExt === cExt && !name.includes(" ") && (dot <= 0 || name.indexOf(".") === dot);

    let candidateBase = cBase.slice(0, 8);
    let cand = cExt ? `${candidateBase}.${cExt}` : candidateBase;
    if (fits83 && !existing.has(cand)) {
      const raw11 = new Uint8Array(11).fill(0x20);
      for (let i = 0; i < candidateBase.length; i++) raw11[i] = candidateBase.charCodeAt(i);
      for (let i = 0; i < cExt.length; i++) raw11[8 + i] = cExt.charCodeAt(i);
      return { raw11, needsLfn: false };
    }
    for (let n = 1; n < 9999; n++) {
      const suf = `~${n}`;
      const b = cBase.slice(0, 8 - suf.length) + suf;
      cand = cExt ? `${b}.${cExt}` : b;
      if (!existing.has(cand)) {
        const raw11 = new Uint8Array(11).fill(0x20);
        for (let i = 0; i < b.length; i++) raw11[i] = b.charCodeAt(i);
        for (let i = 0; i < cExt.length; i++) raw11[8 + i] = cExt.charCodeAt(i);
        return { raw11, needsLfn: true };
      }
    }
    throw new Error("Could not allocate unique SFN for " + name);
  }

  addDirEntry(dirCluster, name, attr, startCluster, size) {
    const { raw11, needsLfn } = this.makeUniqueSfn(dirCluster, name);
    const lfnNeeded = needsLfn ? Math.ceil(name.length / 13) : 0;
    const totalSlots = lfnNeeded + 1;

    let lbas = this.collectDirSectors(dirCluster);
    const findContiguousFree = () => {
      let runStart = -1, runLen = 0;
      const total = lbas.length * 16;
      for (let s = 0; s < total; s++) {
        const sec = this.readSector(lbas[s >>> 4]);
        const b0 = sec[(s & 15) * 32];
        if (b0 === 0x00 || b0 === 0xE5) {
          if (runStart < 0) runStart = s;
          runLen++;
          if (runLen >= totalSlots) return runStart;
        } else {
          runStart = -1; runLen = 0;
        }
      }
      return -1;
    };

    let slot = findContiguousFree();
    if (slot < 0) {
      if (dirCluster === 0 && this.fatType !== 32) throw new Error("FAT12/16 root directory full");
      let last = dirCluster === 0 ? this.rootCluster : dirCluster;
      while (!this.isEoc(this.getFat(last))) last = this.getFat(last);
      this.allocCluster(last);
      lbas = this.collectDirSectors(dirCluster);
      slot = findContiguousFree();
      if (slot < 0) throw new Error("Failed to expand directory");
    }

    const cksum = computeSfnChecksum(raw11);
    const offsets = [1, 3, 5, 7, 9, 14, 16, 18, 20, 22, 24, 28, 30];
    for (let k = lfnNeeded; k >= 1; k--) {
      const idx = slot + (lfnNeeded - k);
      const sec = this.readSector(lbas[idx >>> 4]);
      const off = (idx & 15) * 32;
      sec.fill(0, off, off + 32);
      sec[off + 0] = k | (k === lfnNeeded ? 0x40 : 0);
      sec[off + 11] = ATTR_LONG_NAME;
      sec[off + 13] = cksum;
      const base = (k - 1) * 13;
      for (let j = 0; j < 13; j++) {
        let code;
        if (base + j < name.length) code = name.charCodeAt(base + j);
        else if (base + j === name.length) code = 0x0000;
        else code = 0xFFFF;
        writeLe16(sec, off + offsets[j], code);
      }
    }

    const sIdx = slot + lfnNeeded;
    const sec = this.readSector(lbas[sIdx >>> 4]);
    const off = (sIdx & 15) * 32;
    sec.fill(0, off, off + 32);
    sec.set(raw11, off);
    sec[off + 11] = attr;
    writeLe16(sec, off + 20, this.fatType === 32 ? ((startCluster >>> 16) & 0xFFFF) : 0);
    writeLe16(sec, off + 26, startCluster & 0xFFFF);
    writeLe32(sec, off + 28, size >>> 0);
  }

  eraseDirEntry(dirCluster, entry) {
    const lbas = this.collectDirSectors(dirCluster);
    const firstSlot = entry.slotIndex - entry.lfnSlotCount;
    for (let s = firstSlot; s <= entry.slotIndex; s++) {
      const sec = this.readSector(lbas[s >>> 4]);
      sec[(s & 15) * 32] = 0xE5;
    }
  }

  readFile(p) {
    const ent = this.resolve(p);
    if (!ent || ent.isDir) return null;
    const out = new Uint8Array(ent.size);
    let rem = ent.size;
    let pos = 0;
    let c = ent.startCluster;
    const clusBytes = this.secPerClus * SECTOR_BYTES;
    while (rem > 0 && c >= 2 && !this.isEoc(c)) {
      const n = Math.min(rem, clusBytes);
      const off = this.clusterToLba(c) * SECTOR_BYTES;
      out.set(this.disk.subarray(off, off + n), pos);
      pos += n; rem -= n;
      c = this.getFat(c);
    }
    return out;
  }

  writeFile(p, data) {
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
    const existing = this.resolve(p);
    if (existing) {
      if (existing.isDir) throw new Error("Cannot overwrite directory with file: " + p);
      this.freeChain(existing.startCluster);
      this.eraseDirEntry(existing.parentCluster, existing);
    }
    const { parentCluster, leaf } = this.resolveParent(p);
    let firstClus = 0, prevClus = 0;
    const clusBytes = this.secPerClus * SECTOR_BYTES;
    for (let pos = 0; pos < bytes.length; pos += clusBytes) {
      const c = this.allocCluster(prevClus);
      if (firstClus === 0) firstClus = c;
      const n = Math.min(clusBytes, bytes.length - pos);
      this.disk.set(bytes.subarray(pos, pos + n), this.clusterToLba(c) * SECTOR_BYTES);
      prevClus = c;
    }
    this.addDirEntry(parentCluster, leaf, ATTR_ARCHIVE, firstClus, bytes.length);
  }

  appendFile(p, data) {
    const add = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
    const cur = this.readFile(p);
    if (!cur) { this.writeFile(p, add); return; }
    const merged = new Uint8Array(cur.length + add.length);
    merged.set(cur, 0);
    merged.set(add, cur.length);
    this.writeFile(p, merged);
  }

  mkdir(p) {
    if (this.resolve(p)) return;
    const { parentCluster, leaf } = this.resolveParent(p);
    const clus = this.allocCluster(0);
    const baseOff = this.clusterToLba(clus) * SECTOR_BYTES;
    // "." entry
    this.disk.fill(0x20, baseOff, baseOff + 11);
    this.disk[baseOff + 0] = 0x2E;
    this.disk[baseOff + 11] = ATTR_DIRECTORY;
    writeLe16(this.disk, baseOff + 20, this.fatType === 32 ? ((clus >>> 16) & 0xFFFF) : 0);
    writeLe16(this.disk, baseOff + 26, clus & 0xFFFF);
    // ".." entry
    const parClus = (this.fatType === 32 && parentCluster === this.rootCluster) ? 0 : parentCluster;
    this.disk.fill(0x20, baseOff + 32, baseOff + 43);
    this.disk[baseOff + 32] = 0x2E; this.disk[baseOff + 33] = 0x2E;
    this.disk[baseOff + 43] = ATTR_DIRECTORY;
    writeLe16(this.disk, baseOff + 52, this.fatType === 32 ? ((parClus >>> 16) & 0xFFFF) : 0);
    writeLe16(this.disk, baseOff + 58, parClus & 0xFFFF);

    this.addDirEntry(parentCluster, leaf, ATTR_DIRECTORY, clus, 0);
  }

  deleteFile(p) {
    const ent = this.resolve(p);
    if (!ent) return false;
    this.freeChain(ent.startCluster);
    this.eraseDirEntry(ent.parentCluster, ent);
    return true;
  }

  rename(oldPath, newPath) {
    const ent = this.resolve(oldPath);
    if (!ent) throw new Error("Rename source missing: " + oldPath);
    const dst = this.resolve(newPath);
    if (dst) this.deleteFile(newPath);
    const { parentCluster, leaf } = this.resolveParent(newPath);
    this.eraseDirEntry(ent.parentCluster, ent);
    this.addDirEntry(parentCluster, leaf, ent.attr, ent.startCluster, ent.size);
  }

  dumpAllFiles(prefix = "") {
    const out = {};
    const walk = (clus, curPath) => {
      for (const e of this.readDirEntries(clus)) {
        if (e.name === "." || e.name === "..") continue;
        const full = curPath + "/" + e.name;
        if (e.isDir) {
          walk(e.startCluster, full);
        } else {
          out[full] = this.readFile(full);
        }
      }
    };
    walk(this.fatType === 32 ? this.rootCluster : 0, prefix);
    return out;
  }
}

module.exports = { formatFatVolume, FatOracleVolume };
