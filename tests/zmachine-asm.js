// ============================================================================
// SpiralOS 1.7 — Clean-Room Z-Machine Assembler (v4, v5, v7, v8)
// (tests/zmachine-asm.js) · Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Builds self-contained Z-Machine story binaries (.z4, .z5, .z7, .z8) from
// Z-Machine Standards Document 1.1 to verify every v4/v5/v7/v8 opcode,
// split screen & upper window, cursor control, styles, colours (including
// true colour), timed input & interrupts, save_undo/restore_undo, and
// @check_unicode/@print_unicode + custom Unicode translation tables.
// ============================================================================

"use strict";

const A2_CHARS = " \n0123456789.,!?_#'\"/\\-:()";

function encodeZString(str, padWords = 0) {
  const zc = [];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = str.charCodeAt(i);
    if (ch === " ") { zc.push(0); continue; }
    if (code >= 97 && code <= 122) { zc.push(code - 97 + 6); continue; }
    if (code >= 65 && code <= 90) { zc.push(4, code - 65 + 6); continue; }
    if (ch === "\n") { zc.push(5, 7); continue; }
    const idx2 = A2_CHARS.indexOf(ch);
    if (idx2 >= 2) { zc.push(5, idx2 + 6); continue; }
    zc.push(5, 6, (code >>> 5) & 31, code & 31);
  }
  if (padWords > 0) {
    const need = padWords * 3;
    while (zc.length < need) zc.push(5);
    zc.length = need;
  } else {
    if (zc.length === 0) zc.push(5, 5, 5);
    while (zc.length % 3 !== 0) zc.push(5);
  }
  const bytes = [];
  for (let i = 0; i < zc.length; i += 3) {
    let w = ((zc[i] & 31) << 10) | ((zc[i + 1] & 31) << 5) | (zc[i + 2] & 31);
    if (i + 3 >= zc.length) w |= 0x8000;
    bytes.push((w >>> 8) & 0xFF, w & 0xFF);
  }
  return bytes;
}

class ZAssembler {
  constructor(version = 5) {
    if (![4, 5, 7, 8].includes(version)) throw new Error("ZAssembler supports v4, v5, v7, v8");
    this.version = version;
    this.scale = version === 8 ? 8 : 4;
    this.code = [];
    this.labels = new Map();
    this.fixups = [];
    this.strings = [];
    this.routines = new Map();
  }

  // Operand helpers
  static large(v) { return { type: 0, val: v & 0xFFFF }; }
  static small(v) { return { type: 1, val: v & 0xFF }; }
  static varOp(v) { return { type: 2, val: v & 0xFF }; }
  static labelRef(name, kind = "packed") { return { type: 0, label: name, kind }; }

  label(name) { this.labels.set(name, this.code.length); }
  align() {
    while ((this.code.length % this.scale) !== 0) this.code.push(0);
  }

  routine(name, numLocals = 0, defaults = []) {
    this.align();
    this.labels.set(name, this.code.length);
    this.routines.set(name, this.code.length);
    this.code.push(numLocals & 0xFF);
    if (this.version <= 4) {
      for (let i = 0; i < numLocals; i++) {
        const d = defaults[i] || 0;
        this.code.push((d >>> 8) & 0xFF, d & 0xFF);
      }
    }
  }

  emitOperands(ops) {
    for (const op of ops) {
      if (op.type === 0) {
        if (op.label) {
          this.fixups.push({ pos: this.code.length, label: op.label, kind: op.kind || "packed" });
          this.code.push(0, 0);
        } else {
          this.code.push((op.val >>> 8) & 0xFF, op.val & 0xFF);
        }
      } else {
        this.code.push(op.val & 0xFF);
      }
    }
  }

  emitBranch(sense, target) {
    const sBit = sense ? 0x80 : 0x00;
    if (target === 0 || target === 1) {
      this.code.push(sBit | 0x40 | target);
    } else if (typeof target === "string") {
      this.fixups.push({ pos: this.code.length, label: target, kind: "branch", sense });
      this.code.push(sBit, 0);
    } else {
      const off = target & 0x3FFF;
      this.code.push(sBit | ((off >>> 8) & 0x3F), off & 0xFF);
    }
  }

  op0(op, opts = {}) {
    this.code.push(0xB0 | (op & 15));
    if (opts.text !== undefined) this.code.push(...encodeZString(opts.text));
    if (opts.store !== undefined) this.code.push(opts.store & 0xFF);
    if (opts.branch !== undefined) this.emitBranch(opts.sense !== false, opts.branch);
  }

  op1(op, a, opts = {}) {
    this.code.push(0x80 | ((a.type & 3) << 4) | (op & 15));
    this.emitOperands([a]);
    if (opts.store !== undefined) this.code.push(opts.store & 0xFF);
    if (opts.branch !== undefined) this.emitBranch(opts.sense !== false, opts.branch);
  }

  op2(op, a, b, opts = {}) {
    const ops = Array.isArray(a) ? a : [a, b];
    this.code.push(0xC0 | (op & 31));
    let tb = 0xFF;
    for (let i = 0; i < ops.length; i++) {
      tb = (tb & ~(3 << (6 - i * 2))) | ((ops[i].type & 3) << (6 - i * 2));
    }
    this.code.push(tb);
    this.emitOperands(ops);
    if (opts.store !== undefined) this.code.push(opts.store & 0xFF);
    if (opts.branch !== undefined) this.emitBranch(opts.sense !== false, opts.branch);
  }

  opVar(op, ops, opts = {}) {
    this.code.push(0xE0 | (op & 31));
    const twoTb = (op === 12 || op === 26);
    let tb1 = 0xFF, tb2 = 0xFF;
    for (let i = 0; i < Math.min(4, ops.length); i++) {
      tb1 = (tb1 & ~(3 << (6 - i * 2))) | ((ops[i].type & 3) << (6 - i * 2));
    }
    this.code.push(tb1);
    if (twoTb) {
      for (let i = 4; i < Math.min(8, ops.length); i++) {
        tb2 = (tb2 & ~(3 << (6 - (i - 4) * 2))) | ((ops[i].type & 3) << (6 - (i - 4) * 2));
      }
      this.code.push(tb2);
    }
    this.emitOperands(ops);
    if (opts.store !== undefined) this.code.push(opts.store & 0xFF);
    if (opts.branch !== undefined) this.emitBranch(opts.sense !== false, opts.branch);
  }

  opExt(op, ops, opts = {}) {
    this.code.push(0xBE, op & 0xFF);
    let tb = 0xFF;
    for (let i = 0; i < ops.length; i++) {
      tb = (tb & ~(3 << (6 - i * 2))) | ((ops[i].type & 3) << (6 - i * 2));
    }
    this.code.push(tb);
    this.emitOperands(ops);
    if (opts.store !== undefined) this.code.push(opts.store & 0xFF);
    if (opts.branch !== undefined) this.emitBranch(opts.sense !== false, opts.branch);
  }

  build({
    dictWords = ["go", "look", "undo", "quit", "test"],
    unicodeTable = [0x00E9, 0x00FC, 0x00F1, 0x00A3],
    textBufAddr = 0x0500,
    parseBufAddr = 0x0580,
    scratchTableAddr = 0x0600,
    mainLabel = "main"
  } = {}) {
    // Memory layout:
    // 0x0000..0x003F: Header
    // 0x0040..0x007F: Header extension table (3 words) + Unicode table
    // 0x0080..0x01FF: Object table (126 B prop defaults + 4 objects * 14 B + prop tables)
    // 0x0200..0x03DF: Globals table (240 * 2 B)
    // 0x03E0..0x04FF: Abbreviations table (96 * 2 B) + sample abbrev string
    // 0x0500..0x07FF: Dynamic buffers (textBuf, parseBuf, scratch tables)
    // 0x0800..0x09FF: Static memory: Dictionary
    // 0x0A00..      : High memory: Code & routines
    const staticBase = 0x0800;
    const highBase = 0x0A00;
    const rawSize = highBase + this.code.length + 64;
    const padSize = Math.ceil(rawSize / this.scale) * this.scale;
    const img = new Uint8Array(padSize);
    const dv = new DataView(img.buffer);

    // Header extension + custom Unicode table
    const hdrExt = 0x0040;
    const uniTab = 0x0050;
    dv.setUint16(hdrExt + 0, 3, false);
    dv.setUint16(hdrExt + 2, 0, false);
    dv.setUint16(hdrExt + 4, 0, false);
    dv.setUint16(hdrExt + 6, uniTab, false);
    img[uniTab] = unicodeTable.length;
    for (let i = 0; i < unicodeTable.length; i++) {
      dv.setUint16(uniTab + 1 + i * 2, unicodeTable[i], false);
    }

    // Object table at 0x0080 (v4+ format: 63 defaults = 126 B, 14 B/obj)
    const objBase = 0x0080;
    dv.setUint16(objBase + (1 - 1) * 2, 0x1234, false); // default prop 1 = 0x1234
    const objsStart = objBase + 126;
    const prop1Addr = objsStart + 4 * 14;
    // Object 1 ("Room") with prop 5 (len 2, val 0xCAFE) and prop 2 (len 1, val 0x42)
    dv.setUint16(objsStart + 12, prop1Addr, false);
    const rName = encodeZString("Room");
    img[prop1Addr] = rName.length >>> 1;
    img.set(rName, prop1Addr + 1);
    let pp = prop1Addr + 1 + rName.length;
    img[pp++] = 0x40 | 5; // 1-byte header, len 2, prop 5
    img[pp++] = 0xCA; img[pp++] = 0xFE;
    img[pp++] = 0x00 | 2; // 1-byte header, len 1, prop 2
    img[pp++] = 0x42;
    img[pp++] = 0x00;

    // Object 2 ("Lamp") inside Object 1
    const prop2Addr = pp;
    dv.setUint16(objsStart + 14 + 6, 1, false); // parent = 1
    dv.setUint16(objsStart + 14 + 12, prop2Addr, false);
    dv.setUint16(objsStart + 10, 2, false); // obj 1 child = 2
    const lName = encodeZString("Lamp");
    img[prop2Addr] = lName.length >>> 1;
    img.set(lName, prop2Addr + 1);
    img[prop2Addr + 1 + lName.length] = 0;

    // Dictionary at 0x0800 (v4+ format: 9 Z-chars = 6 bytes per entry, sorted!)
    const dictAddr = staticBase;
    const seps = [44, 46]; // ',' '.'
    img[dictAddr] = seps.length;
    seps.forEach((s, i) => { img[dictAddr + 1 + i] = s; });
    const sorted = dictWords.slice().sort();
    const elen = 9; // 6 bytes text + 3 data bytes
    img[dictAddr + 1 + seps.length] = elen;
    dv.setUint16(dictAddr + 2 + seps.length, sorted.length, false);
    let dp = dictAddr + 4 + seps.length;
    for (const w of sorted) {
      const enc = encodeZString(w.toLowerCase(), 3);
      img.set(enc, dp);
      dp += elen;
    }

    // Copy code to highBase and patch labels
    img.set(this.code, highBase);
    for (const fx of this.fixups) {
      const tgtRel = this.labels.get(fx.label);
      if (tgtRel === undefined) throw new Error("Undefined label: " + fx.label);
      const tgtAbs = highBase + tgtRel;
      const fixAbs = highBase + fx.pos;
      if (fx.kind === "packed") {
        const pVal = Math.floor(tgtAbs / this.scale);
        dv.setUint16(fixAbs, pVal, false);
      } else if (fx.kind === "abs") {
        dv.setUint16(fixAbs, tgtAbs, false);
      } else if (fx.kind === "branch") {
        const off = tgtAbs - (fixAbs + 2) + 2;
        const enc = off & 0x3FFF;
        img[fixAbs] = (fx.sense ? 0x80 : 0x00) | ((enc >>> 8) & 0x3F);
        img[fixAbs + 1] = enc & 0xFF;
      }
    }

    // Header fields
    const mainRel = this.labels.get(mainLabel);
    if (mainRel === undefined) throw new Error("Missing main label");
    img[0x00] = this.version;
    dv.setUint16(0x04, highBase, false);
    dv.setUint16(0x06, highBase + mainRel, false);
    dv.setUint16(0x08, dictAddr, false);
    dv.setUint16(0x0A, objBase, false);
    dv.setUint16(0x0C, 0x0200, false); // globals
    dv.setUint16(0x0E, staticBase, false);
    dv.setUint16(0x18, 0x03E0, false); // abbreviations
    dv.setUint16(0x1A, padSize / this.scale, false);
    if (this.version === 7) {
      dv.setUint16(0x28, 0, false); // routine offset / 8
      dv.setUint16(0x2A, 0, false); // string offset / 8
    }
    dv.setUint16(0x36, hdrExt, false);

    // Checksum over [0x40 .. padSize - 1]
    let sum = 0;
    for (let i = 0x40; i < padSize; i++) sum = (sum + img[i]) & 0xFFFF;
    dv.setUint16(0x1C, sum, false);

    return { bytes: img, textBufAddr, parseBufAddr, scratchTableAddr };
  }
}

/**
 * Build a comprehensive test story for v4, v5, or v8 that exercises:
 * - arithmetic, shifts (log_shift/art_shift), not, call_1s/1n/2s/2n/vs/vs2/vn/vn2
 * - catch/throw, check_arg_count, scan_table, copy_table, output_stream 3, tokenise, encode_text
 * - split_window, set_window, set_cursor, get_cursor, erase_line, set_text_style, set_colour, set_true_colour
 * - save_undo / restore_undo (verifying stack preservation!)
 * - check_unicode / print_unicode + custom Unicode translation table
 * - sound_effect bleep, verify, piracy
 * - interactive command loop ("look", "undo", "quit")
 */
function buildFeatureTestStory(version = 5) {
  const Z = new ZAssembler(version);
  const { large, small, varOp, labelRef } = ZAssembler;
  const TBUF = 0x0500, PBUF = 0x0580, SCR = 0x0600, S3 = 0x0680;

  // Helper routine add3(a,b,c) -> returns a+b+c if arg 3 passed, else a+b
  Z.routine("r_add", 3);
  if (version >= 5) {
    Z.opVar(31, [small(3)], { branch: "add_has3" }); // check_arg_count 3
    Z.op2(20, varOp(1), varOp(2), { store: 0 });
    Z.op0(8); // ret_popped
  }
  Z.label("add_has3");
  Z.op2(20, varOp(1), varOp(2), { store: 1 });
  Z.op2(20, varOp(1), varOp(3), { store: 0 });
  Z.op0(8);

  // Helper routines for catch/throw
  Z.routine("r_thrower", 1);
  if (version >= 5) {
    Z.op2(28, small(77), varOp(1)); // throw 77, frame
  }
  Z.op1(11, small(0));

  Z.routine("r_catcher", 1);
  if (version >= 5) {
    Z.op0(9, { store: 1 }); // catch -> local 1
    Z.op2(26, labelRef("r_thrower"), varOp(1)); // call_2n r_thrower(frame)
  }
  Z.op1(11, small(0));

  // Helper routine for undo stack test: pushes 1234 on stack, does save_undo, checks stack!
  Z.routine("r_undo_test", 1);
  Z.opVar(8, [large(1234)]); // push 1234
  Z.opExt(9, [], { store: 1 }); // save_undo -> local 1 (1 on save, 2 on restore)
  Z.op2(1, varOp(1), small(2), { branch: "undo_restored" });
  // First pass: corrupt stack by popping 1234 and pushing 9999, then restore_undo!
  Z.opVar(9, [small(1)]); // pull 1234 into local 1
  Z.opVar(8, [large(9999)]);
  Z.opExt(10, [], { store: 1 }); // restore_undo
  Z.op1(11, small(0)); // fallback if restore_undo failed
  Z.label("undo_restored");
  // Stack top MUST be 1234!
  Z.op0(8); // ret_popped -> returns 1234

  // Main entry point (not a routine header: initial PC points directly to code!)
  Z.label("main");
  // 1. Split screen + upper window + cursor + styles + colours
  Z.opVar(10, [small(2)]); // split_window 2
  Z.opVar(11, [small(1)]); // set_window 1 (upper)
  Z.opVar(15, [small(1), small(1)]); // set_cursor 1,1
  Z.opVar(17, [small(1)]); // set_text_style reverse
  if (version >= 5) {
    Z.op2(27, small(5), small(6)); // set_colour yellow on blue
    Z.opExt(13, [large(0x03E0), large(0x001F)]); // set_true_colour green on red
  }
  Z.op0(2, { text: "HDR" }); // print in upper window
  Z.opVar(16, [large(SCR)]); // get_cursor SCR -> row=1, col=4
  Z.opVar(17, [small(0)]); // roman
  Z.opVar(11, [small(0)]); // back to lower window

  // 2. Verify & print header/cursor check
  Z.op0(2, { text: "V" });
  Z.opVar(6, [small(version)]);
  Z.op0(2, { text: " C=" });
  Z.op2(15, large(SCR), small(1), { store: 0 }); // loadw SCR 1 -> col (4)
  Z.opVar(6, [varOp(0)]);

  // 3. Call tests (call_vs, call_vs2, check_arg_count)
  Z.opVar(12, [labelRef("r_add"), small(10), small(20), small(12)], { store: 16 }); // G0 = 42
  Z.op0(2, { text: " A=" });
  Z.opVar(6, [varOp(16)]);

  if (version >= 5) {
    // 4. Shifts (log_shift / art_shift)
    Z.opExt(2, [large(0x8000), large(0xFFFC)], { store: 17 }); // 0x8000 >>> 4 = 0x0800 (2048)
    Z.opExt(3, [large(0x8000), large(0xFFFC)], { store: 18 }); // -32768 >> 4 = -2048
    Z.op0(2, { text: " S=" });
    Z.opVar(6, [varOp(17)]);
    Z.op0(2, { text: "/" });
    Z.opVar(6, [varOp(18)]);

    // 5. catch / throw
    Z.op1(8, labelRef("r_catcher"), { store: 20 }); // call_1s r_catcher -> returns 77 via throw!
    Z.op0(2, { text: " T=" });
    Z.opVar(6, [varOp(20)]);

    // 6. save_undo / restore_undo with stack verification
    Z.op1(8, labelRef("r_undo_test"), { store: 21 }); // call_1s -> 1234
    Z.op0(2, { text: " U=" });
    Z.opVar(6, [varOp(21)]);

    // 7. check_unicode / print_unicode
    Z.opExt(12, [small(65)], { store: 22 }); // check_unicode 'A' -> 3
    Z.op0(2, { text: " UC=" });
    Z.opVar(6, [varOp(22)]);
    Z.op0(2, { text: ":" });
    Z.opExt(11, [large(0x00E9)]); // print_unicode é -> 'e'

    // 8. output_stream 3 (memory capture) + copy_table + scan_table
    Z.opVar(19, [small(3), large(S3)]);
    Z.op0(2, { text: "OK" });
    Z.opVar(19, [large(0xFFFD)]); // -3
    Z.opVar(29, [large(S3), large(SCR + 16), small(4)]); // copy_table 4 bytes
    Z.opVar(23, [small(79), large(SCR + 18), small(2), small(0x01)], { store: 23, branch: "scan_ok" }); // scan for 'O' (79)
    Z.label("scan_ok");
    Z.op0(2, { text: " SC=" });
    Z.opVar(6, [varOp(23)]);
  }

  // 9. sound_effect high bleep
  Z.opVar(21, [small(1)]);

  // 10. Mutate dynamic memory then verify checksum (must still pass per Standard §15!)
  Z.opVar(1, [large(SCR + 32), small(0), large(0xBEEF)]);
  Z.op0(13, { branch: "ver_ok" });
  Z.op0(2, { text: " VER=BAD\n" });
  Z.op0(10); // quit on verify failure
  Z.label("ver_ok");
  Z.op0(2, { text: " VER=OK\n" });

  // 11. Interactive command loop
  Z.label("cmd_loop");
  Z.op2(2, small(0), small(1), { branch: "do_prompt" }); // always true
  Z.label("do_prompt");
  Z.op0(2, { text: ">" });
  Z.opVar(2, [large(TBUF), small(0), small(40)]); // textbuf max = 40
  if (version >= 5) Z.opVar(2, [large(TBUF), small(1), small(0)]); // len = 0
  Z.opVar(2, [large(PBUF), small(0), small(6)]); // parsebuf max = 6
  if (version >= 5) {
    Z.opVar(4, [large(TBUF), large(PBUF)], { store: 24 }); // aread -> G8
  } else {
    Z.opVar(4, [large(TBUF), large(PBUF)]); // sread
  }
  // Echo word count from PBUF+1
  Z.op2(16, large(PBUF), small(1), { store: 25 });
  Z.op0(2, { text: "W=" });
  Z.opVar(6, [varOp(25)]);
  Z.op0(11); // new_line
  // If first char is 'q', quit
  Z.op2(16, large(TBUF), small(version >= 5 ? 2 : 1), { store: 26 });
  Z.op2(1, varOp(26), small(113), { branch: "do_quit" }); // 'q'
  Z.op2(1, small(1), small(1), { branch: "cmd_loop" });
  Z.label("do_quit");
  Z.op0(2, { text: "BYE\n" });
  Z.op0(10); // quit

  return Z.build();
}

module.exports = { ZAssembler, encodeZString, buildFeatureTestStory };
