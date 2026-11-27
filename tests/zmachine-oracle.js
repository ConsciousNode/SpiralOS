"use strict";
/**
 * Independent Plain-JS Z-Machine Version 3 Reference Oracle (tests/zmachine-oracle.js)
 *
 * Written strictly from the Z-Machine Standards Document v1.0 for differential
 * verification of SpiralOS 1.6's SpiralC Z-Machine interpreter.
 * Uses class-based architecture, Map-based opcode dispatch tables, and independent
 * data structures and identifiers.
 */

const ALPHABET_ROWS = [
  "abcdefghijklmnopqrstuvwxyz",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  " \n0123456789.,!?_#'\"/\\-:()"
];

class CallFrameRecord {
  constructor(returnAddress, targetVariable, localValues, stackWatermark) {
    this.returnAddress = returnAddress;
    this.targetVariable = targetVariable;
    this.localValues = localValues;
    this.stackWatermark = stackWatermark;
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
    if (this.versionNumber !== 3) {
      throw new Error(`Oracle supports Z-machine v3 only, got v${this.versionNumber}`);
    }
    this.highMemoryMark = this.readUint16(0x04);
    this.initialProgramCounter = this.readUint16(0x06);
    this.dictionaryBase = this.readUint16(0x08);
    this.objectTableAddr = this.readUint16(0x0A);
    this.globalsTableAddr = this.readUint16(0x0C);
    this.staticMemoryBase = this.readUint16(0x0E);
    this.abbreviationsAddr = this.readUint16(0x18);

    this.programCounter = this.initialProgramCounter;
    this.evaluationStack = [];
    this.callFrames = [new CallFrameRecord(0, 0, new Uint16Array(15), 0)];
    this.prngState = initialSeed & 0x7FFFFFFF;
    this.halted = false;
    this.awaitingInput = false;
    this.pendingTextBuffer = 0;
    this.pendingParseBuffer = 0;
    this.outputTranscript = "";
    this.currentStatusLocation = "";
    this.currentStatusScore = 0;
    this.currentStatusMoves = 0;
    this.savedSnapshot = null;

    this._buildDispatchTables();
  }

  readUint8(address) {
    return this.memoryImage[address];
  }

  writeUint8(address, value) {
    this.memoryImage[address & 0xFFFF] = value & 0xFF;
  }

  readUint16(address) {
    return (this.memoryImage[address] << 8) | this.memoryImage[address + 1];
  }

  writeUint16(address, value) {
    const a = address & 0xFFFF;
    this.memoryImage[a] = (value >> 8) & 0xFF;
    this.memoryImage[(a + 1) & 0xFFFF] = value & 0xFF;
  }

  static toSigned16(word) {
    const w = word & 0xFFFF;
    return w >= 0x8000 ? w - 0x10000 : w;
  }

  fetchByte() {
    const b = this.memoryImage[this.programCounter];
    this.programCounter += 1;
    return b;
  }

  fetchWord() {
    const hi = this.memoryImage[this.programCounter];
    const lo = this.memoryImage[this.programCounter + 1];
    this.programCounter += 2;
    return (hi << 8) | lo;
  }

  // FNV-1a 32-bit digest over dynamic memory [0 .. staticMemoryBase - 1]
  computeDynamicChecksum() {
    let digest = 0x811C9DC5 | 0;
    for (let offset = 0; offset < this.staticMemoryBase; offset++) {
      digest = Math.imul(digest ^ this.memoryImage[offset], 0x01000193) | 0;
    }
    return digest;
  }

  readVariable(varNum, indirect = false) {
    const id = varNum & 0xFF;
    if (id === 0) {
      if (indirect) {
        return this.evaluationStack.length > 0 ? this.evaluationStack[this.evaluationStack.length - 1] : 0;
      }
      return this.evaluationStack.length > 0 ? this.evaluationStack.pop() : 0;
    }
    if (id < 16) {
      const frame = this.callFrames[this.callFrames.length - 1];
      return frame.localValues[id - 1];
    }
    return this.readUint16(this.globalsTableAddr + (id - 16) * 2);
  }

  writeVariable(varNum, value, indirect = false) {
    const id = varNum & 0xFF;
    const masked = value & 0xFFFF;
    if (id === 0) {
      if (indirect && this.evaluationStack.length > 0) {
        this.evaluationStack[this.evaluationStack.length - 1] = masked;
      } else {
        this.evaluationStack.push(masked);
      }
      return;
    }
    if (id < 16) {
      const frame = this.callFrames[this.callFrames.length - 1];
      frame.localValues[id - 1] = masked;
      return;
    }
    this.writeUint16(this.globalsTableAddr + (id - 16) * 2, masked);
  }

  storeOperandResult(value) {
    const destVar = this.fetchByte();
    this.writeVariable(destVar, value & 0xFFFF, false);
  }

  applyConditionalBranch(conditionMet) {
    const firstByte = this.fetchByte();
    const branchOnTrue = (firstByte & 0x80) !== 0;
    let offset;
    if ((firstByte & 0x40) !== 0) {
      offset = firstByte & 0x3F;
    } else {
      const secondByte = this.fetchByte();
      offset = ((firstByte & 0x3F) << 8) | secondByte;
      if (offset >= 0x2000) offset -= 0x4000;
    }
    if (Boolean(conditionMet) === branchOnTrue) {
      if (offset === 0) {
        this.returnFromRoutine(0);
      } else if (offset === 1) {
        this.returnFromRoutine(1);
      } else {
        this.programCounter = this.programCounter + offset - 2;
      }
    }
  }

  returnFromRoutine(returnValue) {
    if (this.callFrames.length <= 1) {
      this.halted = true;
      return;
    }
    const popped = this.callFrames.pop();
    this.evaluationStack.length = popped.stackWatermark;
    this.programCounter = popped.returnAddress;
    this.writeVariable(popped.targetVariable, returnValue & 0xFFFF, false);
  }

  // ---- Object Table Helpers (v3: 31 default props = 62B, 9B per object) ----
  entityAddress(entityId) {
    return this.objectTableAddr + 62 + (entityId - 1) * 9;
  }

  entityParent(entityId) {
    return entityId === 0 ? 0 : this.readUint8(this.entityAddress(entityId) + 4);
  }

  entitySibling(entityId) {
    return entityId === 0 ? 0 : this.readUint8(this.entityAddress(entityId) + 5);
  }

  entityChild(entityId) {
    return entityId === 0 ? 0 : this.readUint8(this.entityAddress(entityId) + 6);
  }

  setEntityParent(entityId, parentId) {
    if (entityId !== 0) this.writeUint8(this.entityAddress(entityId) + 4, parentId);
  }

  setEntitySibling(entityId, siblingId) {
    if (entityId !== 0) this.writeUint8(this.entityAddress(entityId) + 5, siblingId);
  }

  setEntityChild(entityId, childId) {
    if (entityId !== 0) this.writeUint8(this.entityAddress(entityId) + 6, childId);
  }

  detachEntity(entityId) {
    if (entityId === 0) return;
    const oldParent = this.entityParent(entityId);
    if (oldParent === 0) return;
    const firstChild = this.entityChild(oldParent);
    if (firstChild === entityId) {
      this.setEntityChild(oldParent, this.entitySibling(entityId));
    } else {
      let cursor = firstChild;
      let guard = 0;
      while (cursor !== 0 && guard++ < 256) {
        const nextSib = this.entitySibling(cursor);
        if (nextSib === entityId) {
          this.setEntitySibling(cursor, this.entitySibling(entityId));
          break;
        }
        cursor = nextSib;
      }
    }
    this.setEntityParent(entityId, 0);
    this.setEntitySibling(entityId, 0);
  }

  moveEntity(entityId, destinationId) {
    if (entityId === 0) return;
    this.detachEntity(entityId);
    if (destinationId === 0) return;
    this.setEntityParent(entityId, destinationId);
    this.setEntitySibling(entityId, this.entityChild(destinationId));
    this.setEntityChild(destinationId, entityId);
  }

  testEntityAttribute(entityId, attrNum) {
    if (entityId === 0 || attrNum < 0 || attrNum > 31) return false;
    const byteAddr = this.entityAddress(entityId) + (attrNum >> 3);
    const bitMask = 0x80 >> (attrNum & 7);
    return (this.readUint8(byteAddr) & bitMask) !== 0;
  }

  modifyEntityAttribute(entityId, attrNum, enable) {
    if (entityId === 0 || attrNum < 0 || attrNum > 31) return;
    const byteAddr = this.entityAddress(entityId) + (attrNum >> 3);
    const bitMask = 0x80 >> (attrNum & 7);
    const cur = this.readUint8(byteAddr);
    this.writeUint8(byteAddr, enable ? (cur | bitMask) : (cur & ~bitMask));
  }

  entityPropertyTable(entityId) {
    return this.readUint16(this.entityAddress(entityId) + 7);
  }

  locatePropertyEntry(entityId, propId) {
    if (entityId === 0) return { dataAddr: 0, length: 0 };
    const propTable = this.entityPropertyTable(entityId);
    const nameWordCount = this.readUint8(propTable);
    let ptr = propTable + 1 + nameWordCount * 2;
    while (true) {
      const sizeByte = this.readUint8(ptr);
      if (sizeByte === 0) return { dataAddr: 0, length: 0 };
      const num = sizeByte & 0x1F;
      const len = (sizeByte >> 5) + 1;
      if (num === propId) return { dataAddr: ptr + 1, length: len };
      if (num < propId) return { dataAddr: 0, length: 0 };
      ptr += 1 + len;
    }
  }

  // ---- ZSCII Text Decoding ----
  decodeZsciiString(byteAddress, insideAbbreviation = false) {
    let cursor = byteAddress;
    const zchars = [];
    while (true) {
      const word = (this.memoryImage[cursor] << 8) | this.memoryImage[cursor + 1];
      cursor += 2;
      zchars.push((word >> 10) & 0x1F, (word >> 5) & 0x1F, word & 0x1F);
      if ((word & 0x8000) !== 0) break;
    }
    let output = "";
    let activeAlphabet = 0;
    let index = 0;
    while (index < zchars.length) {
      const code = zchars[index++];
      if (code === 0) {
        output += " ";
        activeAlphabet = 0;
      } else if (code >= 1 && code <= 3) {
        if (index < zchars.length && !insideAbbreviation) {
          const entryIdx = 32 * (code - 1) + zchars[index++];
          const wordAddr = this.readUint16(this.abbreviationsAddr + entryIdx * 2);
          output += this.decodeZsciiString(wordAddr * 2, true).text;
        }
        activeAlphabet = 0;
      } else if (code === 4) {
        activeAlphabet = 1;
      } else if (code === 5) {
        activeAlphabet = 2;
      } else if (activeAlphabet === 2 && code === 6) {
        if (index + 1 < zchars.length) {
          const tenBit = (zchars[index] << 5) | zchars[index + 1];
          index += 2;
          if (tenBit === 13) output += "\n";
          else if (tenBit >= 32 && tenBit <= 126) output += String.fromCharCode(tenBit);
        }
        activeAlphabet = 0;
      } else {
        const ch = ALPHABET_ROWS[activeAlphabet][code - 6];
        if (ch !== undefined) output += ch;
        activeAlphabet = 0;
      }
    }
    return { text: output, nextAddress: cursor };
  }

  // ---- Dictionary Encoding & Tokenization (v3: 6 Z-chars = 4 bytes) ----
  encodeDictionaryWord(wordStr) {
    const zstream = [];
    for (let i = 0; i < wordStr.length && zstream.length < 6; i++) {
      const ch = wordStr[i];
      const idx0 = ALPHABET_ROWS[0].indexOf(ch);
      if (idx0 >= 0) {
        zstream.push(idx0 + 6);
        continue;
      }
      const idx2 = ALPHABET_ROWS[2].indexOf(ch);
      if (idx2 >= 1) {
        zstream.push(5);
        if (zstream.length < 6) zstream.push(idx2 + 6);
        continue;
      }
      const code = ch.charCodeAt(0);
      zstream.push(5);
      if (zstream.length < 6) zstream.push(6);
      if (zstream.length < 6) zstream.push((code >> 5) & 0x1F);
      if (zstream.length < 6) zstream.push(code & 0x1F);
    }
    while (zstream.length < 6) zstream.push(5);
    const w0 = ((zstream[0] & 0x1F) << 10) | ((zstream[1] & 0x1F) << 5) | (zstream[2] & 0x1F);
    const w1 = 0x8000 | ((zstream[3] & 0x1F) << 10) | ((zstream[4] & 0x1F) << 5) | (zstream[5] & 0x1F);
    return [w0, w1];
  }

  lookupDictionaryWord(wordStr) {
    const [targetW0, targetW1] = this.encodeDictionaryWord(wordStr);
    const sepCount = this.readUint8(this.dictionaryBase);
    const entryLen = this.readUint8(this.dictionaryBase + 1 + sepCount);
    const entryCount = StoryMachine.toSigned16(this.readUint16(this.dictionaryBase + 2 + sepCount));
    const tableStart = this.dictionaryBase + 4 + sepCount;
    const count = Math.abs(entryCount);
    for (let i = 0; i < count; i++) {
      const addr = tableStart + i * entryLen;
      if (this.readUint16(addr) === targetW0 && this.readUint16(addr + 2) === targetW1) {
        return addr;
      }
    }
    return 0;
  }

  tokenizeInputLine(rawLine, textBufAddr, parseBufAddr) {
    const maxLen = this.readUint8(textBufAddr);
    const lower = rawLine.toLowerCase().slice(0, maxLen);
    for (let i = 0; i < lower.length; i++) {
      this.writeUint8(textBufAddr + 1 + i, lower.charCodeAt(i));
    }
    this.writeUint8(textBufAddr + 1 + lower.length, 0);

    const sepCount = this.readUint8(this.dictionaryBase);
    const separators = new Set();
    for (let i = 0; i < sepCount; i++) {
      separators.add(String.fromCharCode(this.readUint8(this.dictionaryBase + 1 + i)));
    }

    const tokens = [];
    let pos = 0;
    while (pos < lower.length) {
      const ch = lower[pos];
      if (ch === " ") {
        pos += 1;
        continue;
      }
      if (separators.has(ch)) {
        tokens.push({ word: ch, start: pos, length: 1 });
        pos += 1;
        continue;
      }
      const start = pos;
      while (pos < lower.length && lower[pos] !== " " && !separators.has(lower[pos])) {
        pos += 1;
      }
      tokens.push({ word: lower.slice(start, pos), start, length: pos - start });
    }

    const maxTokens = this.readUint8(parseBufAddr);
    const count = Math.min(tokens.length, maxTokens);
    this.writeUint8(parseBufAddr + 1, count);
    for (let i = 0; i < count; i++) {
      const tok = tokens[i];
      const dictAddr = this.lookupDictionaryWord(tok.word);
      const slot = parseBufAddr + 2 + i * 4;
      this.writeUint16(slot, dictAddr);
      this.writeUint8(slot + 2, tok.length);
      this.writeUint8(slot + 3, tok.start + 1);
    }
  }

  refreshStatusLine() {
    const locObj = this.readVariable(16);
    if (locObj !== 0) {
      const pt = this.entityPropertyTable(locObj);
      this.currentStatusLocation = this.readUint8(pt) > 0 ? this.decodeZsciiString(pt + 1).text : "";
    }
    this.currentStatusScore = StoryMachine.toSigned16(this.readVariable(17));
    this.currentStatusMoves = this.readVariable(18);
  }

  // ---- Save & Restore (in-memory snapshot matching standard state) ----
  snapshotSaveState() {
    this.savedSnapshot = {
      dynamicRam: new Uint8Array(this.memoryImage.subarray(0, this.staticMemoryBase)),
      programCounter: this.programCounter,
      evaluationStack: this.evaluationStack.slice(),
      callFrames: this.callFrames.map(
        f => new CallFrameRecord(f.returnAddress, f.targetVariable, new Uint16Array(f.localValues), f.stackWatermark)
      )
    };
    return true;
  }

  restoreSaveState() {
    if (!this.savedSnapshot) return false;
    this.memoryImage.set(this.savedSnapshot.dynamicRam, 0);
    this.programCounter = this.savedSnapshot.programCounter;
    this.evaluationStack = this.savedSnapshot.evaluationStack.slice();
    this.callFrames = this.savedSnapshot.callFrames.map(
      f => new CallFrameRecord(f.returnAddress, f.targetVariable, new Uint16Array(f.localValues), f.stackWatermark)
    );
    return true;
  }

  // ---- Dispatch Tables ----
  _buildDispatchTables() {
    this.twoOpTable = new Map([
      [1, (ops) => {
        const target = ops[0];
        let matched = false;
        for (let i = 1; i < ops.length; i++) if (ops[i] === target) { matched = true; break; }
        this.applyConditionalBranch(matched);
      }],
      [2, (ops) => this.applyConditionalBranch(StoryMachine.toSigned16(ops[0]) < StoryMachine.toSigned16(ops[1]))],
      [3, (ops) => this.applyConditionalBranch(StoryMachine.toSigned16(ops[0]) > StoryMachine.toSigned16(ops[1]))],
      [4, (ops) => {
        const val = (StoryMachine.toSigned16(this.readVariable(ops[0], true)) - 1) & 0xFFFF;
        this.writeVariable(ops[0], val, true);
        this.applyConditionalBranch(StoryMachine.toSigned16(val) < StoryMachine.toSigned16(ops[1]));
      }],
      [5, (ops) => {
        const val = (StoryMachine.toSigned16(this.readVariable(ops[0], true)) + 1) & 0xFFFF;
        this.writeVariable(ops[0], val, true);
        this.applyConditionalBranch(StoryMachine.toSigned16(val) > StoryMachine.toSigned16(ops[1]));
      }],
      [6, (ops) => this.applyConditionalBranch(this.entityParent(ops[0]) === ops[1])],
      [7, (ops) => this.applyConditionalBranch((ops[0] & ops[1]) === ops[1])],
      [8, (ops) => this.storeOperandResult(ops[0] | ops[1])],
      [9, (ops) => this.storeOperandResult(ops[0] & ops[1])],
      [10, (ops) => this.applyConditionalBranch(this.testEntityAttribute(ops[0], ops[1]))],
      [11, (ops) => this.modifyEntityAttribute(ops[0], ops[1], true)],
      [12, (ops) => this.modifyEntityAttribute(ops[0], ops[1], false)],
      [13, (ops) => this.writeVariable(ops[0], ops[1], true)],
      [14, (ops) => this.moveEntity(ops[0], ops[1])],
      [15, (ops) => this.storeOperandResult(this.readUint16((ops[0] + ops[1] * 2) & 0xFFFF))],
      [16, (ops) => this.storeOperandResult(this.readUint8((ops[0] + ops[1]) & 0xFFFF))],
      [17, (ops) => {
        const { dataAddr, length } = this.locatePropertyEntry(ops[0], ops[1]);
        if (dataAddr === 0) {
          this.storeOperandResult(this.readUint16(this.objectTableAddr + (ops[1] - 1) * 2));
        } else {
          this.storeOperandResult(length === 1 ? this.readUint8(dataAddr) : this.readUint16(dataAddr));
        }
      }],
      [18, (ops) => {
        const { dataAddr } = this.locatePropertyEntry(ops[0], ops[1]);
        this.storeOperandResult(dataAddr);
      }],
      [19, (ops) => {
        if (ops[0] === 0) { this.storeOperandResult(0); return; }
        const propTable = this.entityPropertyTable(ops[0]);
        let ptr = propTable + 1 + this.readUint8(propTable) * 2;
        if (ops[1] === 0) {
          const sb = this.readUint8(ptr);
          this.storeOperandResult(sb === 0 ? 0 : (sb & 0x1F));
          return;
        }
        while (true) {
          const sb = this.readUint8(ptr);
          if (sb === 0) { this.storeOperandResult(0); return; }
          const num = sb & 0x1F;
          const len = (sb >> 5) + 1;
          ptr += 1 + len;
          if (num === ops[1]) {
            const nextSb = this.readUint8(ptr);
            this.storeOperandResult(nextSb === 0 ? 0 : (nextSb & 0x1F));
            return;
          }
        }
      }],
      [20, (ops) => this.storeOperandResult((StoryMachine.toSigned16(ops[0]) + StoryMachine.toSigned16(ops[1])) & 0xFFFF)],
      [21, (ops) => this.storeOperandResult((StoryMachine.toSigned16(ops[0]) - StoryMachine.toSigned16(ops[1])) & 0xFFFF)],
      [22, (ops) => this.storeOperandResult((StoryMachine.toSigned16(ops[0]) * StoryMachine.toSigned16(ops[1])) & 0xFFFF)],
      [23, (ops) => {
        const b = StoryMachine.toSigned16(ops[1]);
        this.storeOperandResult(b === 0 ? 0 : (Math.trunc(StoryMachine.toSigned16(ops[0]) / b) & 0xFFFF));
      }],
      [24, (ops) => {
        const b = StoryMachine.toSigned16(ops[1]);
        this.storeOperandResult(b === 0 ? 0 : ((StoryMachine.toSigned16(ops[0]) % b) & 0xFFFF));
      }]
    ]);

    this.oneOpTable = new Map([
      [0, (val) => this.applyConditionalBranch(val === 0)],
      [1, (val) => {
        const sib = this.entitySibling(val);
        this.storeOperandResult(sib);
        this.applyConditionalBranch(sib !== 0);
      }],
      [2, (val) => {
        const ch = this.entityChild(val);
        this.storeOperandResult(ch);
        this.applyConditionalBranch(ch !== 0);
      }],
      [3, (val) => this.storeOperandResult(this.entityParent(val))],
      [4, (val) => {
        if (val === 0) { this.storeOperandResult(0); return; }
        const sb = this.readUint8((val - 1) & 0xFFFF);
        this.storeOperandResult((sb >> 5) + 1);
      }],
      [5, (val) => this.writeVariable(val, (StoryMachine.toSigned16(this.readVariable(val, true)) + 1) & 0xFFFF, true)],
      [6, (val) => this.writeVariable(val, (StoryMachine.toSigned16(this.readVariable(val, true)) - 1) & 0xFFFF, true)],
      [7, (val) => { this.outputTranscript += this.decodeZsciiString(val & 0xFFFF).text; }],
      [9, (val) => this.detachEntity(val)],
      [10, (val) => {
        if (val !== 0) {
          const pt = this.entityPropertyTable(val);
          if (this.readUint8(pt) > 0) this.outputTranscript += this.decodeZsciiString(pt + 1).text;
        }
      }],
      [11, (val) => this.returnFromRoutine(val)],
      [12, (val) => { this.programCounter = this.programCounter + StoryMachine.toSigned16(val) - 2; }],
      [13, (val) => { this.outputTranscript += this.decodeZsciiString((val & 0xFFFF) * 2).text; }],
      [14, (val) => this.storeOperandResult(this.readVariable(val, true))],
      [15, (val) => this.storeOperandResult((~val) & 0xFFFF)]
    ]);

    this.zeroOpTable = new Map([
      [0, () => this.returnFromRoutine(1)],
      [1, () => this.returnFromRoutine(0)],
      [2, () => {
        const dec = this.decodeZsciiString(this.programCounter);
        this.programCounter = dec.nextAddress;
        this.outputTranscript += dec.text;
      }],
      [3, () => {
        const dec = this.decodeZsciiString(this.programCounter);
        this.programCounter = dec.nextAddress;
        this.outputTranscript += dec.text + "\n";
        this.returnFromRoutine(1);
      }],
      [4, () => {}],
      [5, () => this.applyConditionalBranch(this.snapshotSaveState())],
      [6, () => this.applyConditionalBranch(this.restoreSaveState())],
      [7, () => {
        this.memoryImage.set(this.storyRom);
        this.programCounter = this.initialProgramCounter;
        this.evaluationStack = [];
        this.callFrames = [new CallFrameRecord(0, 0, new Uint16Array(15), 0)];
      }],
      [8, () => this.returnFromRoutine(this.evaluationStack.length > 0 ? this.evaluationStack.pop() : 0)],
      [9, () => { if (this.evaluationStack.length > 0) this.evaluationStack.pop(); }],
      [10, () => { this.halted = true; }],
      [11, () => { this.outputTranscript += "\n"; }],
      [12, () => this.refreshStatusLine()],
      [13, () => this.applyConditionalBranch(true)]
    ]);

    this.varOpTable = new Map([
      [0, (ops) => {
        const targetVar = this.fetchByte();
        const routinePacked = ops[0] || 0;
        if (routinePacked === 0) {
          this.writeVariable(targetVar, 0, false);
          return;
        }
        const routineAddr = routinePacked * 2;
        const localCount = this.readUint8(routineAddr);
        const locals = new Uint16Array(15);
        for (let i = 0; i < localCount; i++) {
          locals[i] = this.readUint16(routineAddr + 1 + i * 2);
        }
        for (let i = 1; i < ops.length && i - 1 < localCount; i++) {
          locals[i - 1] = ops[i] & 0xFFFF;
        }
        this.callFrames.push(new CallFrameRecord(this.programCounter, targetVar, locals, this.evaluationStack.length));
        this.programCounter = routineAddr + 1 + localCount * 2;
      }],
      [1, (ops) => this.writeUint16((ops[0] + ops[1] * 2) & 0xFFFF, ops[2])],
      [2, (ops) => this.writeUint8((ops[0] + ops[1]) & 0xFFFF, ops[2])],
      [3, (ops) => {
        const { dataAddr, length } = this.locatePropertyEntry(ops[0], ops[1]);
        if (dataAddr !== 0) {
          if (length === 1) this.writeUint8(dataAddr, ops[2]);
          else this.writeUint16(dataAddr, ops[2]);
        }
      }],
      [4, (ops) => {
        this.refreshStatusLine();
        this.pendingTextBuffer = ops[0];
        this.pendingParseBuffer = ops[1];
        this.awaitingInput = true;
      }],
      [5, (ops) => {
        const ch = ops[0] & 0xFF;
        if (ch === 13) this.outputTranscript += "\n";
        else if (ch >= 32 && ch <= 126) this.outputTranscript += String.fromCharCode(ch);
      }],
      [6, (ops) => { this.outputTranscript += String(StoryMachine.toSigned16(ops[0])); }],
      [7, (ops) => {
        const range = StoryMachine.toSigned16(ops[0]);
        if (range < 0) {
          this.prngState = (-range) & 0x7FFFFFFF;
          if (this.prngState === 0) this.prngState = 1;
          this.storeOperandResult(0);
        } else if (range === 0) {
          this.prngState = 1;
          this.storeOperandResult(0);
        } else {
          this.prngState = (Math.imul(this.prngState, 1103515245) + 12345) & 0x7FFFFFFF;
          this.storeOperandResult(1 + ((this.prngState >>> 16) % range));
        }
      }],
      [8, (ops) => this.evaluationStack.push(ops[0] & 0xFFFF)],
      [9, (ops) => this.writeVariable(ops[0], this.evaluationStack.length > 0 ? this.evaluationStack.pop() : 0, true)],
      [10, () => {}],
      [11, () => {}],
      [19, () => {}],
      [20, () => {}],
      [21, () => {}]
    ]);
  }

  _decodeTypedOperands(typeByte) {
    const operands = [];
    for (let shift = 6; shift >= 0; shift -= 2) {
      const kind = (typeByte >> shift) & 0x03;
      if (kind === 3) break;
      if (kind === 0) operands.push(this.fetchWord());
      else if (kind === 1) operands.push(this.fetchByte());
      else operands.push(this.readVariable(this.fetchByte(), false));
    }
    return operands;
  }

  executeSingleInstruction() {
    if (this.halted || this.awaitingInput) return;
    const opcodeByte = this.fetchByte();
    if (opcodeByte >= 0xC0) {
      const typeByte = this.fetchByte();
      const operands = this._decodeTypedOperands(typeByte);
      const opNum = opcodeByte & 0x1F;
      const handler = (opcodeByte & 0x20) === 0 ? this.twoOpTable.get(opNum) : this.varOpTable.get(opNum);
      if (!handler) throw new Error(`Oracle: unhandled VAR/2OP opcode 0x${opcodeByte.toString(16)} at pc=0x${this.programCounter.toString(16)}`);
      handler(operands);
    } else if (opcodeByte >= 0x80) {
      const kind = (opcodeByte >> 4) & 0x03;
      const opNum = opcodeByte & 0x0F;
      if (kind === 3) {
        const handler = this.zeroOpTable.get(opNum);
        if (!handler) throw new Error(`Oracle: unhandled 0OP opcode ${opNum}`);
        handler();
      } else {
        let operand;
        if (kind === 0) operand = this.fetchWord();
        else if (kind === 1) operand = this.fetchByte();
        else operand = this.readVariable(this.fetchByte(), false);
        const handler = this.oneOpTable.get(opNum);
        if (!handler) throw new Error(`Oracle: unhandled 1OP opcode ${opNum}`);
        handler(operand);
      }
    } else {
      const op1 = (opcodeByte & 0x40) === 0 ? this.fetchByte() : this.readVariable(this.fetchByte(), false);
      const op2 = (opcodeByte & 0x20) === 0 ? this.fetchByte() : this.readVariable(this.fetchByte(), false);
      const opNum = opcodeByte & 0x1F;
      const handler = this.twoOpTable.get(opNum);
      if (!handler) throw new Error(`Oracle: unhandled 2OP opcode ${opNum}`);
      handler([op1, op2]);
    }
  }

  runUntilPrompt(stepLimit = 500000) {
    let steps = 0;
    while (!this.halted && !this.awaitingInput && steps < stepLimit) {
      this.executeSingleInstruction();
      steps += 1;
    }
    return this.outputTranscript;
  }

  submitCommand(line) {
    if (!this.awaitingInput) throw new Error("Oracle is not waiting for input");
    this.outputTranscript += line + "\n";
    this.tokenizeInputLine(line, this.pendingTextBuffer, this.pendingParseBuffer);
    this.awaitingInput = false;
    return this.runUntilPrompt();
  }
}

module.exports = { StoryMachine };
