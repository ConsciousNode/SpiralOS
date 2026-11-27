"use strict";
/**
 * Independent Plain-JS Z-Machine v3 / v4 / v5 / v7 / v8 Reference Oracle
 * (tests/zmachine-oracle.js) · Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Written strictly from the Z-Machine Standards Document v1.1 for differential
 * verification of SpiralOS's SpiralC Z-Machine interpreter.
 * Uses class-based architecture, Map-based opcode dispatch tables, and independent
 * data structures and identifiers.
 */

const ALPHABET_ROWS = [
  "abcdefghijklmnopqrstuvwxyz",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  " \n0123456789.,!?_#'\"/\\-:()"
];

const DEFAULT_UNICODE_TABLE = [
  0x00E4, 0x00F6, 0x00FC, 0x00C4, 0x00D6, 0x00DC, 0x00DF, 0x00BB, 0x00AB, 0x00EB,
  0x00EF, 0x00FF, 0x00CB, 0x00CF, 0x00E1, 0x00E9, 0x00ED, 0x00F3, 0x00FA, 0x00FD,
  0x00C1, 0x00C9, 0x00CD, 0x00D3, 0x00DA, 0x00DD, 0x00E0, 0x00E8, 0x00EC, 0x00F2,
  0x00F9, 0x00C0, 0x00C8, 0x00CC, 0x00D2, 0x00D9, 0x00E2, 0x00EA, 0x00EE, 0x00F4,
  0x00FB, 0x00C2, 0x00CA, 0x00CE, 0x00D4, 0x00DB, 0x00E5, 0x00C5, 0x00F8, 0x00D8,
  0x00E3, 0x00F1, 0x00F5, 0x00C3, 0x00D1, 0x00D5, 0x00E6, 0x00C6, 0x00E7, 0x00C7,
  0x00FE, 0x00F0, 0x00DE, 0x00D0, 0x00A3, 0x0153, 0x0152, 0x00A1, 0x00BF
];

const VGA_PALETTE_16 = [
  [0, 0, 0], [0, 0, 170], [0, 170, 0], [0, 170, 170],
  [170, 0, 0], [170, 0, 170], [170, 85, 0], [170, 170, 170],
  [85, 85, 85], [85, 85, 255], [85, 255, 85], [85, 255, 255],
  [255, 85, 85], [255, 85, 255], [255, 255, 85], [255, 255, 255]
];

const ZCOLOR_TO_VGA_FG = { 1: 7, 2: 0, 3: 4, 4: 2, 5: 14, 6: 1, 7: 5, 8: 3, 9: 15 };
const ZCOLOR_TO_VGA_BG = { 1: 0, 2: 0, 3: 4, 4: 2, 5: 14, 6: 1, 7: 5, 8: 3, 9: 15 };

const SCR_COLS = 34;
const SCR_ROWS = 15;

function mapTrueColorToVga(tc) {
  const r = (tc & 31) * 8;
  const g = ((tc >>> 5) & 31) * 8;
  const b = ((tc >>> 10) & 31) * 8;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < 16; i++) {
    const [pr, pg, pb] = VGA_PALETTE_16[i];
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function unicodeToAsciiGlyph(uc) {
  if (uc >= 32 && uc <= 126) return String.fromCharCode(uc);
  if (uc === 10 || uc === 13) return "\n";
  const fold = new Map([
    [0xE4, "a"], [0xE1, "a"], [0xE0, "a"], [0xE2, "a"], [0xE5, "a"], [0xE3, "a"],
    [0xC4, "A"], [0xC1, "A"], [0xC0, "A"], [0xC2, "A"], [0xC5, "A"], [0xC3, "A"],
    [0xE9, "e"], [0xE8, "e"], [0xEA, "e"], [0xEB, "e"],
    [0xC9, "E"], [0xC8, "E"], [0xCA, "E"], [0xCB, "E"],
    [0xED, "i"], [0xEC, "i"], [0xEE, "i"], [0xEF, "i"],
    [0xCD, "I"], [0xCC, "I"], [0xCE, "I"], [0xCF, "I"],
    [0xF6, "o"], [0xF3, "o"], [0xF2, "o"], [0xF4, "o"], [0xF8, "o"], [0xF5, "o"],
    [0xD6, "O"], [0xD3, "O"], [0xD2, "O"], [0xD4, "O"], [0xD8, "O"], [0xD5, "O"],
    [0xFC, "u"], [0xFA, "u"], [0xF9, "u"], [0xFB, "u"],
    [0xDC, "U"], [0xDA, "U"], [0xD9, "U"], [0xDB, "U"],
    [0xF1, "n"], [0xD1, "N"], [0xE7, "c"], [0xC7, "C"], [0xDF, "s"],
    [0xA3, "#"], [0xA1, "!"], [0xBF, "?"]
  ]);
  return fold.get(uc) || "?";
}

class CallFrameRecord {
  constructor(returnAddress, targetVariable, localValues, stackWatermark, argCount = 0) {
    this.returnAddress = returnAddress;
    this.targetVariable = targetVariable;
    this.localValues = localValues;
    this.stackWatermark = stackWatermark;
    this.argCount = argCount;
  }
}

class StoryMachine {
  constructor(storyBytes, initialSeed = 42) {
    if (!(storyBytes instanceof Uint8Array) || storyBytes.length < 64) {
      throw new Error("Invalid Z-machine story image");
    }
    this.storyRom = new Uint8Array(storyBytes);
    this.memoryImage = new Uint8Array(storyBytes);
    this.versionNumber = this.memoryImage[0];
    if (![3, 4, 5, 7, 8].includes(this.versionNumber)) {
      throw new Error(`Oracle supports Z-machine v3/v4/v5/v7/v8, got v${this.versionNumber}`);
    }
    this._initHeader();
    this.programCounter = this.initialProgramCounter;
    this.evaluationStack = [];
    this.callFrames = [new CallFrameRecord(0, 0, new Uint16Array(15), 0, 0)];
    this.prngState = initialSeed & 0x7FFFFFFF;
    this.halted = false;
    this.awaitingInput = false; // false | "line" | "char"
    this.pendingTextBuffer = 0;
    this.pendingParseBuffer = 0;
    this.pendingTime = 0;
    this.pendingRoutine = 0;
    this.outputTranscript = "";
    this.currentStatusLocation = "";
    this.currentStatusScore = 0;
    this.currentStatusMoves = 0;
    this.savedSnapshot = null;
    this.undoSnapshot = null;
    this.screenEnabled = true;
    this.stream3Stack = [];
    this.soundLog = [];

    // Screen model (matches SpiralOS 34x15 grid)
    this.upperLines = 0;
    this.activeWindow = 0;
    this.cursorRow = 1;
    this.cursorCol = 1;
    this.textStyle = 0;
    this.fgColor = 7;
    this.bgColor = 0;
    this.currentFont = 1;
    this.upperChars = new Uint8Array(16 * 40).fill(32);
    this.upperFg = new Uint8Array(16 * 40).fill(7);
    this.upperBg = new Uint8Array(16 * 40).fill(0);
    this.upperStyle = new Uint8Array(16 * 40).fill(0);

    this._buildDispatchTables();
  }

  _initHeader() {
    this.highMemoryMark = this.readUint16(0x04);
    this.initialProgramCounter = this.readUint16(0x06);
    this.dictionaryBase = this.readUint16(0x08);
    this.objectTableAddr = this.readUint16(0x0A);
    this.globalsTableAddr = this.readUint16(0x0C);
    this.staticMemoryBase = this.readUint16(0x0E);
    this.abbreviationsAddr = this.readUint16(0x18);
    this.routineOffset = this.versionNumber === 7 ? this.readUint16(0x28) * 8 : 0;
    this.stringOffset = this.versionNumber === 7 ? this.readUint16(0x2A) * 8 : 0;
    if (this.versionNumber <= 3) {
      this.writeUint8(0x01, this.readUint8(0x01) & ~0x70);
    } else {
      let f1 = 0xBC;
      if (this.versionNumber >= 5) f1 |= 0x01;
      this.writeUint8(0x01, f1);
      this.writeUint16(0x10, this.readUint16(0x10) & ~0x0148);
      this.writeUint8(0x1E, 6);
      this.writeUint8(0x1F, 83);
      this.writeUint8(0x20, SCR_ROWS);
      this.writeUint8(0x21, SCR_COLS);
      if (this.versionNumber >= 5) {
        this.writeUint16(0x22, SCR_COLS);
        this.writeUint16(0x24, SCR_ROWS);
        this.writeUint8(0x26, 1);
        this.writeUint8(0x27, 1);
        this.writeUint8(0x2C, 2);
        this.writeUint8(0x2D, 9);
      }
      this.writeUint16(0x32, 0x0101);
    }
  }

  readUint8(address) { return this.memoryImage[address]; }
  writeUint8(address, value) { this.memoryImage[address & 0xFFFF] = value & 0xFF; }
  readUint16(address) { return (this.memoryImage[address] << 8) | this.memoryImage[address + 1]; }
  writeUint16(address, value) {
    const a = address & 0xFFFF;
    this.memoryImage[a] = (value >> 8) & 0xFF;
    this.memoryImage[(a + 1) & 0xFFFF] = value & 0xFF;
  }
  static toSigned16(word) {
    const w = word & 0xFFFF;
    return w >= 0x8000 ? w - 0x10000 : w;
  }

  unpackRoutine(pa) {
    if (this.versionNumber <= 3) return pa * 2;
    if (this.versionNumber <= 5) return pa * 4;
    if (this.versionNumber === 7) return pa * 4 + this.routineOffset;
    return pa * 8;
  }
  unpackString(pa) {
    if (this.versionNumber <= 3) return pa * 2;
    if (this.versionNumber <= 5) return pa * 4;
    if (this.versionNumber === 7) return pa * 4 + this.stringOffset;
    return pa * 8;
  }

  fetchByte() { return this.memoryImage[this.programCounter++]; }
  fetchWord() {
    const hi = this.memoryImage[this.programCounter];
    const lo = this.memoryImage[this.programCounter + 1];
    this.programCounter += 2;
    return (hi << 8) | lo;
  }

  computeDynamicChecksum() {
    let digest = 0x811C9DC5 | 0;
    for (let offset = 0; offset < this.staticMemoryBase; offset++) {
      digest = Math.imul(digest ^ this.memoryImage[offset], 0x01000193) | 0;
    }
    return digest;
  }

  computeScreenChecksum() {
    let h = 0x811C9DC5 | 0;
    for (const v of [this.upperLines, this.activeWindow, this.cursorRow, this.cursorCol, this.textStyle, this.fgColor, this.bgColor]) {
      h = Math.imul(h ^ v, 0x01000193) | 0;
    }
    for (let r = 0; r < this.upperLines && r < 16; r++) {
      for (let c = 0; c < SCR_COLS; c++) {
        const idx = r * 40 + c;
        h = Math.imul(h ^ this.upperChars[idx], 0x01000193) | 0;
        h = Math.imul(h ^ this.upperFg[idx], 0x01000193) | 0;
        h = Math.imul(h ^ this.upperBg[idx], 0x01000193) | 0;
        h = Math.imul(h ^ this.upperStyle[idx], 0x01000193) | 0;
      }
    }
    return h;
  }

  readVariable(varNum, indirect = false) {
    const id = varNum & 0xFF;
    if (id === 0) {
      if (indirect) return this.evaluationStack.length > 0 ? this.evaluationStack[this.evaluationStack.length - 1] : 0;
      return this.evaluationStack.length > 0 ? this.evaluationStack.pop() : 0;
    }
    if (id < 16) return this.callFrames[this.callFrames.length - 1].localValues[id - 1];
    return this.readUint16(this.globalsTableAddr + (id - 16) * 2);
  }

  writeVariable(varNum, value, indirect = false) {
    const id = varNum & 0xFF;
    const w = value & 0xFFFF;
    if (id === 0) {
      if (indirect && this.evaluationStack.length > 0) this.evaluationStack[this.evaluationStack.length - 1] = w;
      else this.evaluationStack.push(w);
      return;
    }
    if (id < 16) { this.callFrames[this.callFrames.length - 1].localValues[id - 1] = w; return; }
    this.writeUint16(this.globalsTableAddr + (id - 16) * 2, w);
  }

  storeResult(val) { this.writeVariable(this.fetchByte(), val); }

  returnFromRoutine(returnValue) {
    const frame = this.callFrames.pop();
    this.evaluationStack.length = frame.stackWatermark;
    if (frame.returnAddress === -1) {
      this._intrDone = true;
      this._intrRet = returnValue & 0xFFFF;
      return;
    }
    if (this.callFrames.length === 0) { this.halted = true; return; }
    this.programCounter = frame.returnAddress;
    if (frame.targetVariable >= 0) this.writeVariable(frame.targetVariable, returnValue);
  }

  invokeRoutine(packedAddr, args, hasStore) {
    const stVar = hasStore ? this.fetchByte() : -1;
    if (packedAddr === 0) { if (stVar >= 0) this.writeVariable(stVar, 0); return; }
    const targetAddr = this.unpackRoutine(packedAddr);
    const frame = new CallFrameRecord(this.programCounter, stVar, new Uint16Array(15), this.evaluationStack.length, args.length);
    this.programCounter = targetAddr;
    const localCount = Math.min(15, this.fetchByte());
    for (let i = 0; i < localCount; i++) {
      let val = this.versionNumber <= 4 ? this.fetchWord() : 0;
      if (i < args.length) val = args[i] & 0xFFFF;
      frame.localValues[i] = val;
    }
    this.callFrames.push(frame);
  }

  evaluateBranch(condition) {
    const b1 = this.fetchByte();
    const polarity = (b1 & 0x80) !== 0;
    let offset = b1 & 0x3F;
    if ((b1 & 0x40) === 0) {
      const b2 = this.fetchByte();
      offset = (offset << 8) | b2;
      if (offset >= 8192) offset -= 16384;
    }
    if (Boolean(condition) === polarity) {
      if (offset === 0) this.returnFromRoutine(0);
      else if (offset === 1) this.returnFromRoutine(1);
      else this.programCounter += offset - 2;
    }
  }

  unicodeFromZscii(zc) {
    const idx = zc - 155;
    const hext = this.readUint16(0x36);
    if (hext !== 0 && this.readUint16(hext) >= 3) {
      const utab = this.readUint16(hext + 6);
      if (utab !== 0) {
        const ulen = this.readUint8(utab);
        return idx < ulen ? this.readUint16(utab + 1 + idx * 2) : 63;
      }
    }
    return idx < DEFAULT_UNICODE_TABLE.length ? DEFAULT_UNICODE_TABLE[idx] : 63;
  }

  emitCharCode(code) {
    if (this.stream3Stack.length > 0) {
      const top = this.stream3Stack[this.stream3Stack.length - 1];
      this.writeUint8(top.addr + 2 + top.count, (code === 10 ? 13 : code) & 0xFF);
      top.count++;
      return;
    }
    if (!this.screenEnabled) return;
    let ch = code === 13 ? 10 : code;
    if (ch >= 155 && ch <= 251) {
      const g = unicodeToAsciiGlyph(this.unicodeFromZscii(ch));
      ch = g.charCodeAt(0);
    }
    if (this.activeWindow === 1) {
      if (ch === 10) { this.cursorRow++; this.cursorCol = 1; return; }
      if (ch >= 32 && ch <= 126) {
        if (this.cursorRow >= 1 && this.cursorRow <= this.upperLines && this.cursorCol >= 1 && this.cursorCol <= SCR_COLS) {
          const idx = (this.cursorRow - 1) * 40 + (this.cursorCol - 1);
          this.upperChars[idx] = ch;
          this.upperFg[idx] = this.fgColor;
          this.upperBg[idx] = this.bgColor;
          this.upperStyle[idx] = this.textStyle;
        }
        this.cursorCol++;
      }
      return;
    }
    if (ch === 10 || (ch >= 32 && ch <= 126)) {
      this.outputTranscript += String.fromCharCode(ch);
    }
  }

  emitText(str) {
    for (let i = 0; i < str.length; i++) this.emitCharCode(str.charCodeAt(i));
  }

  decodeZsciiString(startAddr, inAbbrev = false) {
    let addr = startAddr;
    let shift = 0, abbrevBank = 0, zsciiStage = 0, zsciiTop = 0;
    let text = "";
    const customAlpha = this.versionNumber >= 5 ? this.readUint16(0x34) : 0;
    while (true) {
      const word = this.readUint16(addr);
      addr += 2;
      const chars = [(word >>> 10) & 31, (word >>> 5) & 31, word & 31];
      for (const c of chars) {
        if (zsciiStage === 1) { zsciiTop = c; zsciiStage = 2; }
        else if (zsciiStage === 2) {
          const code = (zsciiTop << 5) | c;
          if (code === 13) text += "\n";
          else if (code >= 155 && code <= 251) text += unicodeToAsciiGlyph(this.unicodeFromZscii(code));
          else if (code >= 32 && code <= 126) text += String.fromCharCode(code);
          zsciiStage = 0; shift = 0;
        } else if (abbrevBank !== 0) {
          const idx = (abbrevBank - 1) * 32 + c;
          const wordAddr = this.readUint16(this.abbreviationsAddr + idx * 2);
          abbrevBank = 0; shift = 0;
          if (!inAbbrev) text += this.decodeZsciiString(wordAddr * 2, true).text;
        } else if (c === 0) { text += " "; shift = 0; }
        else if (c >= 1 && c <= 3) { abbrevBank = c; }
        else if (c === 4) { shift = 1; }
        else if (c === 5) { shift = 2; }
        else {
          if (customAlpha !== 0) {
            if (shift === 2 && c === 6) zsciiStage = 1;
            else if (shift === 2 && c === 7) text += "\n";
            else text += String.fromCharCode(this.readUint8(customAlpha + shift * 26 + (c - 6)));
          } else if (shift === 2 && c === 6) zsciiStage = 1;
          else if (shift === 2 && c === 7) text += "\n";
          else text += ALPHABET_ROWS[shift][c - 6];
          shift = 0;
        }
      }
      if ((word & 0x8000) !== 0) break;
    }
    return { text, nextAddr: addr };
  }

  // Object tree (v3 vs v4+)
  entityEntryAddr(obj) {
    return this.versionNumber <= 3
      ? this.objectTableAddr + 62 + (obj - 1) * 9
      : this.objectTableAddr + 126 + (obj - 1) * 14;
  }
  entityParent(obj) {
    if (!obj) return 0;
    const p = this.entityEntryAddr(obj);
    return this.versionNumber <= 3 ? this.readUint8(p + 4) : this.readUint16(p + 6);
  }
  entitySibling(obj) {
    if (!obj) return 0;
    const p = this.entityEntryAddr(obj);
    return this.versionNumber <= 3 ? this.readUint8(p + 5) : this.readUint16(p + 8);
  }
  entityChild(obj) {
    if (!obj) return 0;
    const p = this.entityEntryAddr(obj);
    return this.versionNumber <= 3 ? this.readUint8(p + 6) : this.readUint16(p + 10);
  }
  setEntityParent(obj, v) {
    const p = this.entityEntryAddr(obj);
    if (this.versionNumber <= 3) this.writeUint8(p + 4, v); else this.writeUint16(p + 6, v);
  }
  setEntitySibling(obj, v) {
    const p = this.entityEntryAddr(obj);
    if (this.versionNumber <= 3) this.writeUint8(p + 5, v); else this.writeUint16(p + 8, v);
  }
  setEntityChild(obj, v) {
    const p = this.entityEntryAddr(obj);
    if (this.versionNumber <= 3) this.writeUint8(p + 6, v); else this.writeUint16(p + 10, v);
  }
  entityPropertyTable(obj) {
    const p = this.entityEntryAddr(obj);
    return this.versionNumber <= 3 ? this.readUint16(p + 7) : this.readUint16(p + 12);
  }

  detachEntity(obj) {
    if (!obj) return;
    const parent = this.entityParent(obj);
    if (!parent) return;
    const first = this.entityChild(parent);
    if (first === obj) this.setEntityChild(parent, this.entitySibling(obj));
    else {
      let cur = first;
      while (cur) {
        const nxt = this.entitySibling(cur);
        if (nxt === obj) { this.setEntitySibling(cur, this.entitySibling(obj)); break; }
        cur = nxt;
      }
    }
    this.setEntityParent(obj, 0);
    this.setEntitySibling(obj, 0);
  }

  attachEntity(obj, dest) {
    if (!obj) return;
    this.detachEntity(obj);
    if (!dest) return;
    const prev = this.entityChild(dest);
    this.setEntityParent(obj, dest);
    this.setEntitySibling(obj, prev);
    this.setEntityChild(dest, obj);
  }

  firstPropertyPtr(obj) {
    const pt = this.entityPropertyTable(obj);
    return pt + 1 + this.readUint8(pt) * 2;
  }

  propertyLengthFromData(dataAddr) {
    if (!dataAddr) return 0;
    const sb = this.readUint8(dataAddr - 1);
    if (this.versionNumber <= 3) return (sb >>> 5) + 1;
    if (sb & 0x80) return (sb & 63) || 64;
    return (sb & 0x40) ? 2 : 1;
  }

  findPropertyData(obj, propNum) {
    if (!obj) return 0;
    let p = this.firstPropertyPtr(obj);
    while (true) {
      const sb = this.readUint8(p);
      if (sb === 0) return 0;
      let pn, plen, hlen = 1;
      if (this.versionNumber <= 3) { pn = sb & 31; plen = (sb >>> 5) + 1; }
      else {
        pn = sb & 63;
        if (sb & 0x80) { plen = (this.readUint8(p + 1) & 63) || 64; hlen = 2; }
        else plen = ((sb >>> 6) & 1) + 1;
      }
      if (pn === propNum) return p + hlen;
      if (pn < propNum) return 0;
      p += hlen + plen;
    }
  }

  nextPropertyNumber(obj, propNum) {
    if (!obj) return 0;
    let p = this.firstPropertyPtr(obj);
    const mask = this.versionNumber <= 3 ? 31 : 63;
    if (propNum === 0) return this.readUint8(p) & mask;
    while (true) {
      const sb = this.readUint8(p);
      if (sb === 0) return 0;
      let pn, plen, hlen = 1;
      if (this.versionNumber <= 3) { pn = sb & 31; plen = (sb >>> 5) + 1; }
      else {
        pn = sb & 63;
        if (sb & 0x80) { plen = (this.readUint8(p + 1) & 63) || 64; hlen = 2; }
        else plen = ((sb >>> 6) & 1) + 1;
      }
      p += hlen + plen;
      if (pn === propNum) return this.readUint8(p) & mask;
    }
  }

  encodeDictionaryWord(wordStr) {
    const maxZ = this.versionNumber <= 3 ? 6 : 9;
    const zstream = [];
    for (let i = 0; i < wordStr.length && zstream.length < maxZ; i++) {
      const ch = wordStr[i].toLowerCase();
      const code = ch.charCodeAt(0);
      if (code >= 97 && code <= 122) { zstream.push(code - 97 + 6); continue; }
      const idx2 = ALPHABET_ROWS[2].indexOf(ch);
      if (idx2 >= 2) {
        if (zstream.length < maxZ) zstream.push(5);
        if (zstream.length < maxZ) zstream.push(idx2 + 6);
        continue;
      }
      if (zstream.length < maxZ) zstream.push(5);
      if (zstream.length < maxZ) zstream.push(6);
      if (zstream.length < maxZ) zstream.push((code >> 5) & 31);
      if (zstream.length < maxZ) zstream.push(code & 31);
    }
    while (zstream.length < maxZ) zstream.push(5);
    const w0 = ((zstream[0] & 31) << 10) | ((zstream[1] & 31) << 5) | (zstream[2] & 31);
    if (this.versionNumber <= 3) {
      const w1 = 0x8000 | ((zstream[3] & 31) << 10) | ((zstream[4] & 31) << 5) | (zstream[5] & 31);
      return [w0, w1, 0];
    }
    const w1 = ((zstream[3] & 31) << 10) | ((zstream[4] & 31) << 5) | (zstream[5] & 31);
    const w2 = 0x8000 | ((zstream[6] & 31) << 10) | ((zstream[7] & 31) << 5) | (zstream[8] & 31);
    return [w0, w1, w2];
  }

  lookupDictionaryWord(wordStr, dictAddr = 0) {
    const da = dictAddr || this.dictionaryBase;
    const [w0, w1, w2] = this.encodeDictionaryWord(wordStr);
    const sepCount = this.readUint8(da);
    const entryLen = this.readUint8(da + 1 + sepCount);
    const entryCount = StoryMachine.toSigned16(this.readUint16(da + 2 + sepCount));
    const tableStart = da + 4 + sepCount;
    const count = Math.abs(entryCount);
    for (let i = 0; i < count; i++) {
      const addr = tableStart + i * entryLen;
      if (this.readUint16(addr) === w0 && this.readUint16(addr + 2) === w1 && (this.versionNumber <= 3 || this.readUint16(addr + 4) === w2)) {
        return addr;
      }
    }
    return 0;
  }

  tokenizeBuffer(textBufAddr, parseBufAddr, dictAddr = 0, flag = 0) {
    const da = dictAddr || this.dictionaryBase;
    const sepCount = this.readUint8(da);
    const seps = new Set();
    for (let i = 0; i < sepCount; i++) seps.add(String.fromCharCode(this.readUint8(da + 1 + i)));

    const startOff = this.versionNumber >= 5 ? 2 : 1;
    let raw = "";
    if (this.versionNumber >= 5) {
      const len = this.readUint8(textBufAddr + 1);
      for (let i = 0; i < len; i++) raw += String.fromCharCode(this.readUint8(textBufAddr + 2 + i));
    } else {
      for (let i = 0; ; i++) {
        const c = this.readUint8(textBufAddr + 1 + i);
        if (c === 0) break;
        raw += String.fromCharCode(c);
      }
    }

    const tokens = [];
    let pos = 0;
    while (pos < raw.length) {
      const ch = raw[pos];
      if (ch === " ") { pos++; continue; }
      if (seps.has(ch)) { tokens.push({ word: ch, start: pos, length: 1 }); pos++; continue; }
      const s = pos;
      while (pos < raw.length && raw[pos] !== " " && !seps.has(raw[pos])) pos++;
      tokens.push({ word: raw.slice(s, pos), start: s, length: pos - s });
    }

    const maxTokens = this.readUint8(parseBufAddr);
    const count = Math.min(tokens.length, maxTokens);
    this.writeUint8(parseBufAddr + 1, count);
    for (let i = 0; i < count; i++) {
      const tok = tokens[i];
      const d = this.lookupDictionaryWord(tok.word, da);
      const slot = parseBufAddr + 2 + i * 4;
      if (!flag || d !== 0) {
        this.writeUint16(slot, d);
        this.writeUint8(slot + 2, tok.length);
        this.writeUint8(slot + 3, tok.start + startOff);
      }
    }
  }

  refreshStatusLine() {
    if (this.versionNumber > 3) return;
    const locObj = this.readVariable(16);
    if (locObj !== 0) {
      const pt = this.entityPropertyTable(locObj);
      this.currentStatusLocation = this.readUint8(pt) > 0 ? this.decodeZsciiString(pt + 1).text : "";
    }
    this.currentStatusScore = StoryMachine.toSigned16(this.readVariable(17));
    this.currentStatusMoves = this.readVariable(18);
  }

  captureSnapshot() {
    return {
      dynamicRam: new Uint8Array(this.memoryImage.subarray(0, this.staticMemoryBase)),
      programCounter: this.programCounter,
      evaluationStack: this.evaluationStack.slice(),
      callFrames: this.callFrames.map(
        f => new CallFrameRecord(f.returnAddress, f.targetVariable, new Uint16Array(f.localValues), f.stackWatermark, f.argCount)
      )
    };
  }

  applySnapshot(snap) {
    if (!snap) return false;
    const oldF2 = this.readUint16(0x10) & 3;
    this.memoryImage.set(snap.dynamicRam, 0);
    this.writeUint16(0x10, (this.readUint16(0x10) & ~3) | oldF2);
    this.programCounter = snap.programCounter;
    this.evaluationStack = snap.evaluationStack.slice();
    this.callFrames = snap.callFrames.map(
      f => new CallFrameRecord(f.returnAddress, f.targetVariable, new Uint16Array(f.localValues), f.stackWatermark, f.argCount)
    );
    return true;
  }

  clearUpper() {
    this.upperChars.fill(32);
    this.upperFg.fill(this.fgColor);
    this.upperBg.fill(this.bgColor);
    this.upperStyle.fill(0);
  }

  _buildDispatchTables() {
    this.twoOpTable = new Map([
      [1, (ops) => this.evaluateBranch(ops.slice(1).includes(ops[0]))],
      [2, (ops) => this.evaluateBranch(StoryMachine.toSigned16(ops[0]) < StoryMachine.toSigned16(ops[1]))],
      [3, (ops) => this.evaluateBranch(StoryMachine.toSigned16(ops[0]) > StoryMachine.toSigned16(ops[1]))],
      [4, (ops) => { const v = StoryMachine.toSigned16(this.readVariable(ops[0], true)) - 1; this.writeVariable(ops[0], v, true); this.evaluateBranch(v < StoryMachine.toSigned16(ops[1])); }],
      [5, (ops) => { const v = StoryMachine.toSigned16(this.readVariable(ops[0], true)) + 1; this.writeVariable(ops[0], v, true); this.evaluateBranch(v > StoryMachine.toSigned16(ops[1])); }],
      [6, (ops) => this.evaluateBranch(this.entityParent(ops[0]) === ops[1])],
      [7, (ops) => this.evaluateBranch((ops[0] & ops[1]) === ops[1])],
      [8, (ops) => this.storeResult(ops[0] | ops[1])],
      [9, (ops) => this.storeResult(ops[0] & ops[1])],
      [10, (ops) => {
        if (!ops[0]) { this.evaluateBranch(false); return; }
        const bo = this.entityEntryAddr(ops[0]) + (ops[1] >>> 3);
        this.evaluateBranch((this.readUint8(bo) & (128 >>> (ops[1] & 7))) !== 0);
      }],
      [11, (ops) => { if (ops[0]) { const bo = this.entityEntryAddr(ops[0]) + (ops[1] >>> 3); this.writeUint8(bo, this.readUint8(bo) | (128 >>> (ops[1] & 7))); } }],
      [12, (ops) => { if (ops[0]) { const bo = this.entityEntryAddr(ops[0]) + (ops[1] >>> 3); this.writeUint8(bo, this.readUint8(bo) & ~(128 >>> (ops[1] & 7))); } }],
      [13, (ops) => this.writeVariable(ops[0], ops[1], true)],
      [14, (ops) => this.attachEntity(ops[0], ops[1])],
      [15, (ops) => this.storeResult(this.readUint16((ops[0] + ops[1] * 2) & 0xFFFF))],
      [16, (ops) => this.storeResult(this.readUint8((ops[0] + ops[1]) & 0xFFFF))],
      [17, (ops) => {
        const pa = this.findPropertyData(ops[0], ops[1]);
        if (!pa) this.storeResult(this.readUint16(this.objectTableAddr + (ops[1] - 1) * 2));
        else this.storeResult(this.propertyLengthFromData(pa) === 1 ? this.readUint8(pa) : this.readUint16(pa));
      }],
      [18, (ops) => this.storeResult(this.findPropertyData(ops[0], ops[1]))],
      [19, (ops) => this.storeResult(this.nextPropertyNumber(ops[0], ops[1]))],
      [20, (ops) => this.storeResult((ops[0] + ops[1]) & 0xFFFF)],
      [21, (ops) => this.storeResult((ops[0] - ops[1]) & 0xFFFF)],
      [22, (ops) => this.storeResult((StoryMachine.toSigned16(ops[0]) * StoryMachine.toSigned16(ops[1])) & 0xFFFF)],
      [23, (ops) => { const d = StoryMachine.toSigned16(ops[1]); this.storeResult(d ? Math.trunc(StoryMachine.toSigned16(ops[0]) / d) & 0xFFFF : 0); }],
      [24, (ops) => { const d = StoryMachine.toSigned16(ops[1]); this.storeResult(d ? (StoryMachine.toSigned16(ops[0]) % d) & 0xFFFF : 0); }],
      [25, (ops) => this.invokeRoutine(ops[0], [ops[1]], true)],
      [26, (ops) => this.invokeRoutine(ops[0], [ops[1]], false)],
      [27, (ops) => {
        if (ops[0] !== 0) this.fgColor = ZCOLOR_TO_VGA_FG[ops[0]] ?? 7;
        if (ops[1] !== 0) this.bgColor = ZCOLOR_TO_VGA_BG[ops[1]] ?? 0;
      }],
      [28, (ops) => { this.callFrames.length = ops[1] + 1; this.returnFromRoutine(ops[0]); }]
    ]);

    this.oneOpTable = new Map([
      [0, (a) => this.evaluateBranch(a === 0)],
      [1, (a) => { const s = this.entitySibling(a); this.storeResult(s); this.evaluateBranch(s !== 0); }],
      [2, (a) => { const c = this.entityChild(a); this.storeResult(c); this.evaluateBranch(c !== 0); }],
      [3, (a) => this.storeResult(this.entityParent(a))],
      [4, (a) => this.storeResult(this.propertyLengthFromData(a))],
      [5, (a) => this.writeVariable(a, (StoryMachine.toSigned16(this.readVariable(a, true)) + 1) & 0xFFFF, true)],
      [6, (a) => this.writeVariable(a, (StoryMachine.toSigned16(this.readVariable(a, true)) - 1) & 0xFFFF, true)],
      [7, (a) => this.emitText(this.decodeZsciiString(a).text)],
      [8, (a) => this.invokeRoutine(a, [], true)],
      [9, (a) => this.detachEntity(a)],
      [10, (a) => { if (a) { const pt = this.entityPropertyTable(a); if (this.readUint8(pt) > 0) this.emitText(this.decodeZsciiString(pt + 1).text); } }],
      [11, (a) => this.returnFromRoutine(a)],
      [12, (a) => { this.programCounter += StoryMachine.toSigned16(a) - 2; }],
      [13, (a) => this.emitText(this.decodeZsciiString(this.unpackString(a)).text)],
      [14, (a) => this.storeResult(this.readVariable(a, true))],
      [15, (a) => { if (this.versionNumber <= 4) this.storeResult((~a) & 0xFFFF); else this.invokeRoutine(a, [], false); }]
    ]);

    this.zeroOpTable = new Map([
      [0, () => this.returnFromRoutine(1)],
      [1, () => this.returnFromRoutine(0)],
      [2, () => { const r = this.decodeZsciiString(this.programCounter); this.programCounter = r.nextAddr; this.emitText(r.text); }],
      [3, () => { const r = this.decodeZsciiString(this.programCounter); this.programCounter = r.nextAddr; this.emitText(r.text + "\n"); this.returnFromRoutine(1); }],
      [4, () => {}],
      [5, () => { this.savedSnapshot = this.captureSnapshot(); if (this.versionNumber <= 3) this.evaluateBranch(true); else this.storeResult(1); }],
      [6, () => { const ok = this.applySnapshot(this.savedSnapshot); if (this.versionNumber <= 3) this.evaluateBranch(ok); else this.storeResult(ok ? 2 : 0); }],
      [7, () => {
        const oldF2 = this.readUint16(0x10) & 3;
        this.memoryImage.set(this.storyRom);
        this._initHeader();
        this.writeUint16(0x10, (this.readUint16(0x10) & ~3) | oldF2);
        this.programCounter = this.initialProgramCounter;
        this.evaluationStack = [];
        this.callFrames = [new CallFrameRecord(0, 0, new Uint16Array(15), 0, 0)];
      }],
      [8, () => this.returnFromRoutine(this.evaluationStack.length ? this.evaluationStack.pop() : 0)],
      [9, () => { if (this.versionNumber <= 4) this.evaluationStack.pop(); else this.storeResult(this.callFrames.length - 1); }],
      [10, () => { this.halted = true; }],
      [11, () => this.emitCharCode(10)],
      [12, () => this.refreshStatusLine()],
      [13, () => {
        const mult = this.versionNumber <= 3 ? 2 : (this.versionNumber <= 5 ? 4 : 8);
        let flen = this.readUint16(0x1A) * mult;
        if (!flen || flen > this.storyRom.length) flen = this.storyRom.length;
        let sum = 0;
        for (let i = 0x40; i < flen; i++) sum = (sum + this.storyRom[i]) & 0xFFFF;
        this.evaluateBranch(sum === this.readUint16(0x1C));
      }],
      [15, () => this.evaluateBranch(true)]
    ]);

    this.varOpTable = new Map([
      [0, (ops) => this.invokeRoutine(ops[0], ops.slice(1), true)],
      [1, (ops) => this.writeUint16((ops[0] + ops[1] * 2) & 0xFFFF, ops[2])],
      [2, (ops) => this.writeUint8((ops[0] + ops[1]) & 0xFFFF, ops[2])],
      [3, (ops) => {
        const pa = this.findPropertyData(ops[0], ops[1]);
        if (pa) {
          if (this.propertyLengthFromData(pa) === 1) this.writeUint8(pa, ops[2]);
          else this.writeUint16(pa, ops[2]);
        }
      }],
      [4, (ops) => {
        this.refreshStatusLine();
        this.pendingTextBuffer = ops[0];
        this.pendingParseBuffer = ops[1] || 0;
        this.pendingTime = ops[2] || 0;
        this.pendingRoutine = ops[3] || 0;
        this.awaitingInput = "line";
      }],
      [5, (ops) => this.emitCharCode(ops[0])],
      [6, (ops) => this.emitText(String(StoryMachine.toSigned16(ops[0])))],
      [7, (ops) => {
        const r = StoryMachine.toSigned16(ops[0]);
        if (r < 0) { this.prngState = (-r) || 1; this.storeResult(0); }
        else if (r === 0) { this.prngState = 1; this.storeResult(0); }
        else {
          this.prngState = (Math.imul(this.prngState, 1103515245) + 12345) & 0x7FFFFFFF;
          this.storeResult(1 + ((this.prngState >>> 16) % r));
        }
      }],
      [8, (ops) => this.evaluationStack.push(ops[0] & 0xFFFF)],
      [9, (ops) => this.writeVariable(ops[0], this.evaluationStack.length ? this.evaluationStack.pop() : 0, true)],
      [10, (ops) => {
        this.upperLines = Math.max(0, Math.min(SCR_ROWS - 1, ops[0]));
        if (this.versionNumber === 3) this.clearUpper();
      }],
      [11, (ops) => {
        this.activeWindow = ops[0] & 1;
        if (this.activeWindow === 1) { this.cursorRow = 1; this.cursorCol = 1; }
      }],
      [12, (ops) => this.invokeRoutine(ops[0], ops.slice(1), true)],
      [13, (ops) => {
        const w = StoryMachine.toSigned16(ops[0]);
        if (w === -1) { this.upperLines = 0; this.activeWindow = 0; this.cursorRow = 1; this.cursorCol = 1; this.clearUpper(); }
        else if (w === -2 || w === 1) { this.clearUpper(); if (w === 1) { this.cursorRow = 1; this.cursorCol = 1; } }
      }],
      [14, (ops) => {
        if (ops[0] === 1 && this.activeWindow === 1 && this.cursorRow >= 1 && this.cursorRow <= 16) {
          for (let c = this.cursorCol - 1; c < SCR_COLS; c++) {
            if (c >= 0) {
              const idx = (this.cursorRow - 1) * 40 + c;
              this.upperChars[idx] = 32; this.upperFg[idx] = this.fgColor; this.upperBg[idx] = this.bgColor; this.upperStyle[idx] = 0;
            }
          }
        }
      }],
      [15, (ops) => { if (this.activeWindow === 1) { this.cursorRow = Math.max(1, ops[0]); this.cursorCol = Math.max(1, ops[1]); } }],
      [16, (ops) => { this.writeUint16(ops[0], this.cursorRow); this.writeUint16(ops[0] + 2, this.cursorCol); }],
      [17, (ops) => { this.textStyle = ops[0] === 0 ? 0 : (this.textStyle | ops[0]); }],
      [18, () => {}],
      [19, (ops) => {
        const s = StoryMachine.toSigned16(ops[0]);
        if (s === 1) this.screenEnabled = true;
        else if (s === -1) this.screenEnabled = false;
        else if (s === 2) this.writeUint16(0x10, this.readUint16(0x10) | 1);
        else if (s === -2) this.writeUint16(0x10, this.readUint16(0x10) & ~1);
        else if (s === 3 && ops.length >= 2) this.stream3Stack.push({ addr: ops[1], count: 0 });
        else if (s === -3 && this.stream3Stack.length > 0) {
          const top = this.stream3Stack.pop();
          this.writeUint16(top.addr, top.count);
        }
      }],
      [20, () => {}],
      [21, (ops) => { this.soundLog.push(ops[0] || 1); }],
      [22, (ops) => {
        this.pendingTime = ops[1] || 0;
        this.pendingRoutine = ops[2] || 0;
        this.awaitingInput = "char";
      }],
      [23, (ops) => {
        const x = ops[0], tab = ops[1], len = ops[2], form = ops.length >= 4 ? ops[3] : 0x82;
        const isWord = (form & 0x80) !== 0;
        const step = (form & 0x7F) || 2;
        let found = 0;
        for (let i = 0; i < len; i++) {
          const ea = tab + i * step;
          if ((isWord ? this.readUint16(ea) : this.readUint8(ea)) === x) { found = ea; break; }
        }
        this.storeResult(found);
        this.evaluateBranch(found !== 0);
      }],
      [24, (ops) => this.storeResult((~ops[0]) & 0xFFFF)],
      [25, (ops) => this.invokeRoutine(ops[0], ops.slice(1), false)],
      [26, (ops) => this.invokeRoutine(ops[0], ops.slice(1), false)],
      [27, (ops) => this.tokenizeBuffer(ops[0], ops[1], ops[2] || 0, ops[3] || 0)],
      [28, (ops) => {
        let s = "";
        for (let i = 0; i < ops[1]; i++) s += String.fromCharCode(this.readUint8(ops[0] + ops[2] + i));
        const [w0, w1, w2] = this.encodeDictionaryWord(s);
        this.writeUint16(ops[3], w0); this.writeUint16(ops[3] + 2, w1); this.writeUint16(ops[3] + 4, w2);
      }],
      [29, (ops) => {
        const src = ops[0], dst = ops[1], sz = StoryMachine.toSigned16(ops[2]);
        if (dst === 0) { for (let i = 0; i < Math.abs(sz); i++) this.writeUint8(src + i, 0); }
        else if (sz < 0) { for (let i = 0; i < -sz; i++) this.writeUint8(dst + i, this.readUint8(src + i)); }
        else if (dst > src && dst < src + sz) { for (let i = sz - 1; i >= 0; i--) this.writeUint8(dst + i, this.readUint8(src + i)); }
        else { for (let i = 0; i < sz; i++) this.writeUint8(dst + i, this.readUint8(src + i)); }
      }],
      [30, (ops) => {
        let addr = ops[0];
        const w = ops[1], h = ops[2] || 1, skip = ops[3] || 0;
        const startCol = this.cursorCol;
        for (let r = 0; r < h; r++) {
          if (r > 0) { if (this.activeWindow === 1) { this.cursorRow++; this.cursorCol = startCol; } else this.emitCharCode(10); }
          for (let c = 0; c < w; c++) this.emitCharCode(this.readUint8(addr++));
          addr += skip;
        }
      }],
      [31, (ops) => this.evaluateBranch(ops[0] <= this.callFrames[this.callFrames.length - 1].argCount)]
    ]);

    this.extOpTable = new Map([
      [0, () => { this.savedSnapshot = this.captureSnapshot(); this.storeResult(1); }],
      [1, () => { const ok = this.applySnapshot(this.savedSnapshot); this.storeResult(ok ? 2 : 0); }],
      [2, (ops) => { const pl = StoryMachine.toSigned16(ops[1]); this.storeResult(pl >= 0 ? ((ops[0] << pl) & 0xFFFF) : ((ops[0] >>> (-pl)) & 0xFFFF)); }],
      [3, (ops) => { const pl = StoryMachine.toSigned16(ops[1]); const n = StoryMachine.toSigned16(ops[0]); this.storeResult(pl >= 0 ? ((n << pl) & 0xFFFF) : ((n >> (-pl)) & 0xFFFF)); }],
      [4, (ops) => { const f = ops[0]; const prev = this.currentFont; if (f === 0) this.storeResult(prev); else if (f === 1 || f === 4) { this.currentFont = f; this.storeResult(prev); } else this.storeResult(0); }],
      [9, () => { this.undoSnapshot = this.captureSnapshot(); this.storeResult(1); }],
      [10, () => { const ok = this.applySnapshot(this.undoSnapshot); this.storeResult(ok ? 2 : 0); }],
      [11, (ops) => this.emitText(unicodeToAsciiGlyph(ops[0]))],
      [12, (ops) => { const u = ops[0]; this.storeResult((u >= 32 && u <= 126) ? 3 : ((u >= 160 && u <= 0x17F) ? 1 : 0)); }],
      [13, (ops) => {
        const fg = StoryMachine.toSigned16(ops[0]), bg = StoryMachine.toSigned16(ops[1]);
        if (fg === -2) this.fgColor = 7; else if (fg >= 0) this.fgColor = mapTrueColorToVga(fg);
        if (bg === -2) this.bgColor = 0; else if (bg >= 0) this.bgColor = mapTrueColorToVga(bg);
      }]
    ]);
  }

  decodeOperands(typeByte) {
    const ops = [];
    for (let i = 0; i < 4; i++) {
      const t = (typeByte >>> (6 - i * 2)) & 3;
      if (t === 3) break;
      if (t === 0) ops.push(this.fetchWord());
      else if (t === 1) ops.push(this.fetchByte());
      else ops.push(this.readVariable(this.fetchByte()));
    }
    return ops;
  }

  stepInstruction() {
    const b = this.fetchByte();
    if (b === 0xBE && this.versionNumber >= 5) {
      const eop = this.fetchByte();
      const ops = this.decodeOperands(this.fetchByte());
      const fn = this.extOpTable.get(eop);
      if (fn) fn(ops);
      return;
    }
    if (b >= 0xC0) {
      const op = b & 31;
      const isVar = (b & 0x20) !== 0;
      const tb1 = this.fetchByte();
      const tb2 = (isVar && (op === 12 || op === 26)) ? this.fetchByte() : 0xFF;
      const ops = this.decodeOperands(tb1);
      if (isVar && (op === 12 || op === 26)) ops.push(...this.decodeOperands(tb2));
      const fn = (isVar ? this.varOpTable : this.twoOpTable).get(op);
      if (fn) fn(ops);
    } else if (b >= 0x80) {
      const ot = (b >>> 4) & 3;
      if (ot === 3) {
        const fn = this.zeroOpTable.get(b & 15);
        if (fn) fn();
      } else {
        const v = ot === 0 ? this.fetchWord() : (ot === 1 ? this.fetchByte() : this.readVariable(this.fetchByte()));
        const fn = this.oneOpTable.get(b & 15);
        if (fn) fn(v);
      }
    } else {
      const a = (b & 0x40) ? this.readVariable(this.fetchByte()) : this.fetchByte();
      const c = (b & 0x20) ? this.readVariable(this.fetchByte()) : this.fetchByte();
      const fn = this.twoOpTable.get(b & 31);
      if (fn) fn([a, c]);
    }
  }

  runUntilPrompt(maxSteps = 200000) {
    let steps = 0;
    while (!this.halted && !this.awaitingInput && steps < maxSteps) {
      this.stepInstruction();
      steps++;
    }
    return this.outputTranscript;
  }

  submitCommand(cmdLine) {
    if (!this.awaitingInput) return;
    if (this.awaitingInput === "char") {
      const code = cmdLine.length > 0 ? cmdLine.charCodeAt(0) : 13;
      this.awaitingInput = false;
      this.storeResult(code);
      this.runUntilPrompt();
      return;
    }
    this.outputTranscript += cmdLine + "\n";
    const maxLen = this.readUint8(this.pendingTextBuffer);
    const lower = cmdLine.toLowerCase().slice(0, maxLen);
    if (this.versionNumber >= 5) {
      this.writeUint8(this.pendingTextBuffer + 1, lower.length);
      for (let i = 0; i < lower.length; i++) this.writeUint8(this.pendingTextBuffer + 2 + i, lower.charCodeAt(i));
      if (this.pendingParseBuffer) this.tokenizeBuffer(this.pendingTextBuffer, this.pendingParseBuffer);
      this.storeResult(13);
    } else {
      for (let i = 0; i < lower.length; i++) this.writeUint8(this.pendingTextBuffer + 1 + i, lower.charCodeAt(i));
      this.writeUint8(this.pendingTextBuffer + 1 + lower.length, 0);
      if (this.pendingParseBuffer) this.tokenizeBuffer(this.pendingTextBuffer, this.pendingParseBuffer);
    }
    this.awaitingInput = false;
    this.runUntilPrompt();
  }
}

module.exports = { StoryMachine };
