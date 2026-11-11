/**
 * SpiralOS 1.1 — Clean Symbolic x86 Assembler Helper (16-bit & 32-bit) + Listing Emitter
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 */

"use strict";

const R = {
  EAX: 0, ECX: 1, EDX: 2, EBX: 3, ESP: 4, EBP: 5, ESI: 6, EDI: 7,
  AX: 0,  CX: 1,  DX: 2,  BX: 3,  SP: 4,  BP: 5,  SI: 6,  DI: 7,
  AL: 0,  CL: 1,  DL: 2,  BL: 3,  AH: 4,  CH: 5,  DH: 6,  BH: 7
};

const REG32_NAMES = ["eax", "ecx", "edx", "ebx", "esp", "ebp", "esi", "edi"];

class X86Builder {
  constructor(baseAddr = 0) {
    this.baseAddr = baseAddr >>> 0;
    this.buf = [];
    this.labels = {};
    this.fixups = [];
    this.asmLines = [];
    this._rawHexPending = "";
  }

  _flushHex() {
    while (this._rawHexPending.length > 0) {
      const chunk = this._rawHexPending.slice(0, 64);
      this._rawHexPending = this._rawHexPending.slice(64);
      this.asmLines.push("  .hex " + chunk);
    }
  }

  _emitHexBytes(arr) {
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i] & 0xFF;
      this.buf.push(b);
      this._rawHexPending += b.toString(16).padStart(2, "0");
    }
    if (this._rawHexPending.length >= 64) this._flushHex();
  }

  pc() {
    return (this.baseAddr + this.buf.length) >>> 0;
  }

  offset() {
    return this.buf.length;
  }

  label(name) {
    this._flushHex();
    this.labels[name] = this.pc();
    this.asmLines.push(name + ":");
  }

  u8(v) {
    this._emitHexBytes([v & 0xFF]);
  }

  u16(v) {
    this._emitHexBytes([v & 0xFF, (v >>> 8) & 0xFF]);
  }

  u32(v) {
    this._emitHexBytes([
      v & 0xFF,
      (v >>> 8) & 0xFF,
      (v >>> 16) & 0xFF,
      (v >>> 24) & 0xFF
    ]);
  }

  bytes(arr) {
    this._emitHexBytes(arr);
  }

  padTo(offsetBytes, fillVal = 0) {
    while (this.buf.length < offsetBytes) this.u8(fillVal);
  }

  modrm(mod, reg, rm) {
    this.u8(((mod & 3) << 6) | ((reg & 7) << 3) | (rm & 7));
  }

  sib(scale, index, base) {
    this.u8(((scale & 3) << 6) | ((index & 7) << 3) | (base & 7));
  }

  memRegDisp(regField, baseReg, disp = 0) {
    if (disp === 0 && baseReg !== R.EBP) {
      this.modrm(0, regField, baseReg);
      if (baseReg === R.ESP) this.sib(0, 4, R.ESP);
    } else if (disp >= -128 && disp <= 127) {
      this.modrm(1, regField, baseReg);
      if (baseReg === R.ESP) this.sib(0, 4, R.ESP);
      this.u8(disp);
    } else {
      this.modrm(2, regField, baseReg);
      if (baseReg === R.ESP) this.sib(0, 4, R.ESP);
      this.u32(disp);
    }
  }

  memSib(regField, baseReg, indexReg, scale = 0, disp = 0) {
    if (disp === 0 && baseReg !== R.EBP) {
      this.modrm(0, regField, 4);
      this.sib(scale, indexReg, baseReg);
    } else if (disp >= -128 && disp <= 127) {
      this.modrm(1, regField, 4);
      this.sib(scale, indexReg, baseReg);
      this.u8(disp);
    } else {
      this.modrm(2, regField, 4);
      this.sib(scale, indexReg, baseReg);
      this.u32(disp);
    }
  }

  _pushBytesRaw(...b) {
    for (let i = 0; i < b.length; i++) this.buf.push(b[i] & 0xFF);
  }

  movRegImm32(reg, imm32) {
    this._flushHex();
    const r = reg & 7;
    const u = imm32 >>> 0;
    this._pushBytesRaw(0xB8 + r, u & 0xFF, (u >>> 8) & 0xFF, (u >>> 16) & 0xFF, (u >>> 24) & 0xFF);
    this.asmLines.push("  mov_ri " + REG32_NAMES[r] + ", " + (imm32 | 0));
  }

  movRegLabel32(reg, labelName) {
    this._flushHex();
    const r = reg & 7;
    this._pushBytesRaw(0xB8 + r);
    this.fixups.push({ pos: this.buf.length, label: labelName, type: "ABS32" });
    this._pushBytesRaw(0, 0, 0, 0);
    this.asmLines.push("  mov_rl " + REG32_NAMES[r] + ", " + labelName);
  }

  movRegReg32(dst, src) {
    this._flushHex();
    this._pushBytesRaw(0x89, 0xC0 | ((src & 7) << 3) | (dst & 7));
    this.asmLines.push("  mov_rr " + REG32_NAMES[dst & 7] + ", " + REG32_NAMES[src & 7]);
  }

  _emitMemDispRaw(regField, baseReg, disp) {
    const modrm = (m, r, rm) => (((m & 3) << 6) | ((r & 7) << 3) | (rm & 7));
    if (disp === 0 && baseReg !== R.EBP) {
      this._pushBytesRaw(modrm(0, regField, baseReg));
      if (baseReg === R.ESP) this._pushBytesRaw(0x24);
    } else if (disp >= -128 && disp <= 127) {
      this._pushBytesRaw(modrm(1, regField, baseReg));
      if (baseReg === R.ESP) this._pushBytesRaw(0x24);
      this._pushBytesRaw(disp & 0xFF);
    } else {
      this._pushBytesRaw(modrm(2, regField, baseReg));
      if (baseReg === R.ESP) this._pushBytesRaw(0x24);
      const u = disp >>> 0;
      this._pushBytesRaw(u & 0xFF, (u >>> 8) & 0xFF, (u >>> 16) & 0xFF, (u >>> 24) & 0xFF);
    }
  }

  movRegMem32(dst, base, disp = 0) {
    this._flushHex();
    this._pushBytesRaw(0x8B);
    this._emitMemDispRaw(dst, base, disp | 0);
    this.asmLines.push(`  mov_rm ${REG32_NAMES[dst & 7]}, ${REG32_NAMES[base & 7]}, ${disp | 0}`);
  }

  movRegSib32(dst, base, index, scale = 0, disp = 0) {
    this.u8(0x8B);
    this.memSib(dst, base, index, scale, disp);
  }

  movMemReg32(base, disp, src) {
    this._flushHex();
    this._pushBytesRaw(0x89);
    this._emitMemDispRaw(src, base, disp | 0);
    this.asmLines.push(`  mov_mr ${REG32_NAMES[base & 7]}, ${disp | 0}, ${REG32_NAMES[src & 7]}`);
  }

  movSibReg32(base, index, scale, disp, src) {
    this.u8(0x89);
    this.memSib(src, base, index, scale, disp);
  }

  movMemImm32(base, disp, imm32) {
    this._flushHex();
    this._pushBytesRaw(0xC7);
    this._emitMemDispRaw(0, base, disp | 0);
    const u = imm32 >>> 0;
    this._pushBytesRaw(u & 0xFF, (u >>> 8) & 0xFF, (u >>> 16) & 0xFF, (u >>> 24) & 0xFF);
    this.asmLines.push(`  mov_mi ${REG32_NAMES[base & 7]}, ${disp | 0}, ${imm32 | 0}`);
  }

  movzxRegMem8(dst, base, disp = 0) {
    this.u8(0x0F); this.u8(0xB6);
    this.memRegDisp(dst, base, disp);
  }

  movzxRegSib8(dst, base, index, scale = 0, disp = 0) {
    this.u8(0x0F); this.u8(0xB6);
    this.memSib(dst, base, index, scale, disp);
  }

  movsxRegSib8(dst, base, index, scale = 0, disp = 0) {
    this.u8(0x0F); this.u8(0xBE);
    this.memSib(dst, base, index, scale, disp);
  }

  movzxRegSib16(dst, base, index, scale = 0, disp = 0) {
    this.u8(0x0F); this.u8(0xB7);
    this.memSib(dst, base, index, scale, disp);
  }

  movMemReg8(base, disp, src8) {
    this.u8(0x88);
    this.memRegDisp(src8, base, disp);
  }

  movSibReg8(base, index, scale, disp, src8) {
    this.u8(0x88);
    this.memSib(src8, base, index, scale, disp);
  }

  movSibReg16(base, index, scale, disp, src16) {
    this.u8(0x66);
    this.u8(0x89);
    this.memSib(src16, base, index, scale, disp);
  }

  addRegReg32(dst, src) {
    this._flushHex();
    this._pushBytesRaw(0x01, 0xC0 | ((src & 7) << 3) | (dst & 7));
    this.asmLines.push("  add_rr " + REG32_NAMES[dst & 7] + ", " + REG32_NAMES[src & 7]);
  }
  subRegReg32(dst, src) {
    this._flushHex();
    this._pushBytesRaw(0x29, 0xC0 | ((src & 7) << 3) | (dst & 7));
    this.asmLines.push("  sub_rr " + REG32_NAMES[dst & 7] + ", " + REG32_NAMES[src & 7]);
  }
  andRegReg32(dst, src) {
    this._flushHex();
    this._pushBytesRaw(0x21, 0xC0 | ((src & 7) << 3) | (dst & 7));
    this.asmLines.push("  and_rr " + REG32_NAMES[dst & 7] + ", " + REG32_NAMES[src & 7]);
  }
  orRegReg32(dst, src) {
    this._flushHex();
    this._pushBytesRaw(0x09, 0xC0 | ((src & 7) << 3) | (dst & 7));
    this.asmLines.push("  or_rr " + REG32_NAMES[dst & 7] + ", " + REG32_NAMES[src & 7]);
  }
  xorRegReg32(dst, src) {
    this._flushHex();
    this._pushBytesRaw(0x31, 0xC0 | ((src & 7) << 3) | (dst & 7));
    this.asmLines.push("  xor_rr " + REG32_NAMES[dst & 7] + ", " + REG32_NAMES[src & 7]);
  }
  cmpRegReg32(a, b) {
    this._flushHex();
    this._pushBytesRaw(0x39, 0xC0 | ((b & 7) << 3) | (a & 7));
    this.asmLines.push("  cmp_rr " + REG32_NAMES[a & 7] + ", " + REG32_NAMES[b & 7]);
  }

  imulRegReg32(dst, src) {
    this.u8(0x0F); this.u8(0xAF);
    this.modrm(3, dst, src);
  }

  _emitAluRegImm(mnem, subop, reg, imm) {
    this._flushHex();
    const r = reg & 7;
    const v = imm | 0;
    if (v >= -128 && v <= 127) {
      this._pushBytesRaw(0x83, 0xC0 | ((subop & 7) << 3) | r, v & 0xFF);
    } else {
      const u = v >>> 0;
      this._pushBytesRaw(0x81, 0xC0 | ((subop & 7) << 3) | r, u & 0xFF, (u >>> 8) & 0xFF, (u >>> 16) & 0xFF, (u >>> 24) & 0xFF);
    }
    this.asmLines.push(`  ${mnem} ${REG32_NAMES[r]}, ${v}`);
  }

  addRegImm32(reg, imm) { this._emitAluRegImm("add_ri", 0, reg, imm); }
  subRegImm32(reg, imm) { this._emitAluRegImm("sub_ri", 5, reg, imm); }
  andRegImm32(reg, imm) { this._emitAluRegImm("and_ri", 4, reg, imm); }
  cmpRegImm32(reg, imm) { this._emitAluRegImm("cmp_ri", 7, reg, imm); }

  _emitShiftRegImm(mnem, subop, reg, count) {
    this._flushHex();
    const r = reg & 7;
    this._pushBytesRaw(0xC1, 0xC0 | ((subop & 7) << 3) | r, count & 0xFF);
    this.asmLines.push(`  ${mnem} ${REG32_NAMES[r]}, ${count & 0xFF}`);
  }

  shlRegImm(reg, count) { this._emitShiftRegImm("shl_ri", 4, reg, count); }
  shrRegImm(reg, count) { this._emitShiftRegImm("shr_ri", 5, reg, count); }
  sarRegImm(reg, count) { this._emitShiftRegImm("sar_ri", 7, reg, count); }

  shlRegCl(reg) { this.u8(0xD3); this.modrm(3, 4, reg); }
  shrRegCl(reg) { this.u8(0xD3); this.modrm(3, 5, reg); }
  sarRegCl(reg) { this.u8(0xD3); this.modrm(3, 7, reg); }

  negReg32(reg) { this.u8(0xF7); this.modrm(3, 3, reg); }
  divReg32(reg) { this.u8(0xF7); this.modrm(3, 6, reg); }
  idivReg32(reg){ this.u8(0xF7); this.modrm(3, 7, reg); }
  cdq()         { this._flushHex(); this._pushBytesRaw(0x99); this.asmLines.push("  cdq"); }

  pushReg32(reg) {
    this._flushHex();
    this._pushBytesRaw(0x50 + (reg & 7));
    this.asmLines.push("  push " + REG32_NAMES[reg & 7]);
  }
  popReg32(reg) {
    this._flushHex();
    this._pushBytesRaw(0x58 + (reg & 7));
    this.asmLines.push("  pop " + REG32_NAMES[reg & 7]);
  }

  jmpLabel(name) {
    this._flushHex();
    this._pushBytesRaw(0xE9);
    this.fixups.push({ pos: this.buf.length, label: name, type: "REL32" });
    this._pushBytesRaw(0, 0, 0, 0);
    this.asmLines.push("  jmp " + name);
  }

  jmpReg32(reg) {
    this.u8(0xFF);
    this.modrm(3, 4, reg);
  }

  callLabel(name) {
    this._flushHex();
    this._pushBytesRaw(0xE8);
    this.fixups.push({ pos: this.buf.length, label: name, type: "REL32" });
    this._pushBytesRaw(0, 0, 0, 0);
    this.asmLines.push("  call " + name);
  }

  ret() {
    this._flushHex();
    this._pushBytesRaw(0xC3);
    this.asmLines.push("  ret");
  }

  jccLabel(cc, name) {
    this._flushHex();
    this._pushBytesRaw(0x0F, cc & 0xFF);
    this.fixups.push({ pos: this.buf.length, label: name, type: "REL32" });
    this._pushBytesRaw(0, 0, 0, 0);
    const jccNames = {
      0x84: "je", 0x85: "jne", 0x8C: "jl", 0x8D: "jge",
      0x8E: "jle", 0x8F: "jg", 0x82: "jb", 0x87: "ja"
    };
    this.asmLines.push("  " + (jccNames[cc & 0xFF] || "jcc") + " " + name);
  }

  jeLabel(name)  { this.jccLabel(0x84, name); }
  jneLabel(name) { this.jccLabel(0x85, name); }
  jlLabel(name)  { this.jccLabel(0x8C, name); }
  jgeLabel(name) { this.jccLabel(0x8D, name); }
  jleLabel(name) { this.jccLabel(0x8E, name); }
  jgLabel(name)  { this.jccLabel(0x8F, name); }
  jbLabel(name)  { this.jccLabel(0x82, name); }
  jaLabel(name)  { this.jccLabel(0x87, name); }

  setccAl(cc) {
    this.u8(0x0F);
    this.u8(cc & 0xFF);
    this.modrm(3, 0, R.AL);
  }

  inAlDx()   { this.u8(0xEC); }
  inAxDx()   { this.u8(0x66); this.u8(0xED); }
  inEaxDx()  { this.u8(0xED); }
  outDxAl()  { this.u8(0xEE); }
  outDxAx()  { this.u8(0x66); this.u8(0xEF); }
  outDxEax() { this.u8(0xEF); }
  inAlImm8(p)  { this.u8(0xE4); this.u8(p); }
  outImm8Al(p) { this.u8(0xE6); this.u8(p); }

  cld()      { this._flushHex(); this._pushBytesRaw(0xFC); this.asmLines.push("  cld"); }
  cli()      { this._flushHex(); this._pushBytesRaw(0xFA); this.asmLines.push("  cli"); }
  hlt()      { this._flushHex(); this._pushBytesRaw(0xF4); this.asmLines.push("  hlt"); }
  repMovsd() { this._flushHex(); this._pushBytesRaw(0xF3, 0xA5); this.asmLines.push("  rep_movsd"); }
  repMovsb() { this._flushHex(); this._pushBytesRaw(0xF3, 0xA4); this.asmLines.push("  rep_movsb"); }
  repStosd() { this._flushHex(); this._pushBytesRaw(0xF3, 0xAB); this.asmLines.push("  rep_stosd"); }
  repStosb() { this._flushHex(); this._pushBytesRaw(0xF3, 0xAA); this.asmLines.push("  rep_stosb"); }

  labelTable32(names) {
    this._flushHex();
    for (const n of names) {
      this.fixups.push({ pos: this.buf.length, label: n, type: "ABS32" });
      this._pushBytesRaw(0, 0, 0, 0);
      this.asmLines.push("  .dd " + n);
    }
  }

  finalize() {
    this._flushHex();
    const out = new Uint8Array(this.buf);
    const dv = new DataView(out.buffer);
    for (const f of this.fixups) {
      const target = this.labels[f.label];
      if (target === undefined) {
        throw new Error("Undefined x86 label: " + f.label);
      }
      if (f.type === "ABS32") {
        dv.setUint32(f.pos, target >>> 0, true);
      } else if (f.type === "REL32") {
        const nextPc = this.baseAddr + f.pos + 4;
        dv.setInt32(f.pos, (target - nextPc) | 0, true);
      } else if (f.type === "REL8") {
        const nextPc = this.baseAddr + f.pos + 1;
        out[f.pos] = (target - nextPc) & 0xFF;
      }
    }
    return out;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { R, X86Builder };
}
if (typeof globalThis !== "undefined") {
  globalThis.X86Builder = X86Builder;
  globalThis.X86Reg = R;
}
