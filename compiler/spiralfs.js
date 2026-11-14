/**
 * SpiralOS 1.4 "Daily Driver" — SpiralFS Filesystem Builder & Inspector (compiler/spiralfs.js)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Manages the enlarged SpiralFS volume stored in Sectors 320..1919 (offset 0x28000..0xEFFFF,
 * 800 KB span = 768 KB usable + 32 KB reserved Triton Core window at Sectors 960..1023)
 * of spiralos.img (mounted at vmRam[0x228000..0x2EFFFF] on TabComp, Hummingbird, and Triton).
 *
 * Volume Layout (relative to volume base 0x228000 in vmRam / 0x28000 in spiralos.img):
 *   0x00000 .. 0x0003F (64 B): Superblock
 *     0x00: Magic 0x53465053 ("SPFS")
 *     0x04: Version 1
 *     0x08: Max entries (63)
 *     0x0C: Next free data offset (relative to volume base, 512B aligned, starts at 0x1000)
 *   0x00040 .. 0x00FFF (63 * 64 = 4032 B): Directory Entries (each 64 bytes)
 *   0x01000 .. 0x4FFFF (316 KB): Lower file data sectors (Sectors 328..959)
 *   0x50000 .. 0x57FFF (32 KB) : Reserved Triton Core record (Sectors 960..1023, skipped by allocator)
 *   0x58000 .. 0xC7FFF (448 KB): Upper file data sectors (Sectors 1024..1919)
 */

"use strict";

const SPFS_MAGIC = 0x53465053; // "SPFS"
const SPFS_START_SECTOR = 320;
const SPFS_IMG_OFFSET = SPFS_START_SECTOR * 512; // 0x28000 in spiralos.img
const SPFS_VMRAM_BASE = 0x200000 + SPFS_IMG_OFFSET; // 0x228000 in vmRam
const SPFS_SECTORS = 1600; // Sectors 320..1919 (800 KB span)
const SPFS_SIZE = SPFS_SECTORS * 512; // 0xC8000 (819,200 bytes)
const SPFS_HOLE_START = 0x50000; // Relative offset of Sector 960 (0x78000 in spiralos.img)
const SPFS_HOLE_END   = 0x58000; // Relative offset of Sector 1024 (0x80000 in spiralos.img)
const SPFS_USABLE_SECTORS = SPFS_SECTORS - 64; // 1536 sectors (768 KB usable)
const SPFS_USABLE_SIZE = SPFS_USABLE_SECTORS * 512; // 0xC0000 (786,432 bytes usable)
const SPFS_MAX_FILES = 63;

class SpiralFS {
  constructor(backingBuffer = null) {
    this.buf = backingBuffer ? new Uint8Array(backingBuffer) : new Uint8Array(SPFS_SIZE);
    this.dv = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
    if (this.dv.getUint32(0, true) !== SPFS_MAGIC) {
      this.format();
    }
  }

  format() {
    const holeLo = Math.min(this.buf.length, SPFS_HOLE_START);
    this.buf.fill(0, 0, holeLo);
    if (this.buf.length > SPFS_HOLE_END) {
      this.buf.fill(0, SPFS_HOLE_END);
    }
    this.dv.setUint32(0x00, SPFS_MAGIC, true);
    this.dv.setUint32(0x04, 1, true);
    this.dv.setUint32(0x08, SPFS_MAX_FILES, true);
    this.dv.setUint32(0x0C, 0x1000, true); // Data starts at offset 4096 (Sector 328)
  }

  _readEntryName(entryOff) {
    let s = "";
    for (let i = 0; i < 39; i++) {
      const b = this.buf[entryOff + i];
      if (b === 0) break;
      s += String.fromCharCode(b);
    }
    return s;
  }

  _writeEntryName(entryOff, name) {
    for (let i = 0; i < 40; i++) this.buf[entryOff + i] = 0;
    const n = Math.min(39, name.length);
    for (let i = 0; i < n; i++) {
      this.buf[entryOff + i] = name.charCodeAt(i) & 0xFF;
    }
  }

  _checksum(u8) {
    let sum = 0;
    for (let i = 0; i < u8.length; i++) {
      sum = ((Math.imul(sum, 31)) + u8[i]) | 0;
    }
    return sum;
  }

  findEntryIndex(pathStr) {
    for (let i = 0; i < SPFS_MAX_FILES; i++) {
      const off = 0x40 + i * 64;
      const flags = this.dv.getInt32(off + 0x28, true);
      if (flags !== 0 && this._readEntryName(off) === pathStr) {
        return i;
      }
    }
    return -1;
  }

  writeFile(pathStr, content, minCapacity = 0) {
    const data = typeof content === "string"
      ? new TextEncoder().encode(content)
      : new Uint8Array(content);

    let idx = this.findEntryIndex(pathStr);
    if (idx < 0) {
      for (let i = 0; i < SPFS_MAX_FILES; i++) {
        const off = 0x40 + i * 64;
        if (this.dv.getInt32(off + 0x28, true) === 0) {
          idx = i;
          break;
        }
      }
      if (idx < 0) throw new Error("SpiralFS directory table full");
    }

    const entryOff = 0x40 + idx * 64;
    const oldFlags = this.dv.getInt32(entryOff + 0x28, true);
    let dataOff = this.dv.getInt32(entryOff + 0x2C, true);
    let cap = this.dv.getInt32(entryOff + 0x34, true);
    const needed = Math.max(data.length + 64, minCapacity, 1024);
    const alignedCap = (needed + 511) & ~511;

    if (oldFlags === 0 || data.length + 1 > cap) {
      let nextFree = this.dv.getUint32(0x0C, true);
      if (nextFree < SPFS_HOLE_END && nextFree + alignedCap > SPFS_HOLE_START) {
        nextFree = SPFS_HOLE_END;
      }
      if (nextFree + alignedCap > this.buf.length) {
        throw new Error(`SpiralFS out of space writing ${pathStr} (${nextFree + alignedCap} > ${this.buf.length})`);
      }
      dataOff = nextFree;
      cap = alignedCap;
      this.dv.setUint32(0x0C, nextFree + alignedCap, true);
    }

    this._writeEntryName(entryOff, pathStr);
    this.dv.setInt32(entryOff + 0x28, 1, true); // flags = 1 (file)
    this.dv.setInt32(entryOff + 0x2C, dataOff, true);
    this.dv.setInt32(entryOff + 0x30, data.length, true);
    this.dv.setInt32(entryOff + 0x34, cap, true);
    const rev = this.dv.getInt32(entryOff + 0x38, true) + 1;
    this.dv.setInt32(entryOff + 0x38, rev, true);
    this.dv.setInt32(entryOff + 0x3C, this._checksum(data), true);

    this.buf.fill(0, dataOff, dataOff + cap);
    this.buf.set(data, dataOff);
    return idx;
  }

  readFile(pathStr) {
    const idx = this.findEntryIndex(pathStr);
    if (idx < 0) return null;
    const entryOff = 0x40 + idx * 64;
    const dataOff = this.dv.getInt32(entryOff + 0x2C, true);
    const size = this.dv.getInt32(entryOff + 0x30, true);
    return this.buf.slice(dataOff, dataOff + size);
  }

  readText(pathStr) {
    const bytes = this.readFile(pathStr);
    if (!bytes) return null;
    return new TextDecoder().decode(bytes);
  }

  freeBytes() {
    const nextFree = this.dv.getUint32(0x0C, true);
    if (nextFree <= SPFS_HOLE_START) {
      const upperFree = Math.max(0, this.buf.length - SPFS_HOLE_END);
      return (SPFS_HOLE_START - nextFree) + upperFree;
    }
    return Math.max(0, this.buf.length - nextFree);
  }

  usedBytes() {
    const totalUsable = (this.buf.length >= SPFS_HOLE_END)
      ? (this.buf.length - (SPFS_HOLE_END - SPFS_HOLE_START))
      : this.buf.length;
    return totalUsable - this.freeBytes();
  }

  listFiles() {
    const list = [];
    for (let i = 0; i < SPFS_MAX_FILES; i++) {
      const off = 0x40 + i * 64;
      const flags = this.dv.getInt32(off + 0x28, true);
      if (flags !== 0) {
        list.push({
          index: i,
          path: this._readEntryName(off),
          flags,
          offset: this.dv.getInt32(off + 0x2C, true),
          size: this.dv.getInt32(off + 0x30, true),
          capacity: this.dv.getInt32(off + 0x34, true),
          rev: this.dv.getInt32(off + 0x38, true)
        });
      }
    }
    return list;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SpiralFS,
    SPFS_MAGIC,
    SPFS_START_SECTOR,
    SPFS_IMG_OFFSET,
    SPFS_VMRAM_BASE,
    SPFS_SECTORS,
    SPFS_SIZE,
    SPFS_HOLE_START,
    SPFS_HOLE_END,
    SPFS_USABLE_SECTORS,
    SPFS_USABLE_SIZE,
    SPFS_MAX_FILES
  };
}
if (typeof globalThis !== "undefined") {
  globalThis.SpiralFS = SpiralFS;
}
