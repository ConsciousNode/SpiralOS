/**
 * SpiralOS — Clean Symbolic x86 Assembler Helper (16-bit & 32-bit)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 */

"use strict";

const R = {
  EAX: 0, ECX: 1, EDX: 2, EBX: 3, ESP: 4, EBP: 5, ESI: 6, EDI: 7,
  AX: 0,  CX: 1,  DX: 2,  BX: 3,  SP: 4,  BP: 5,  SI: 6,  DI: 7,
  AL: 0,  CL: 1,  DL: 2,  BL: 3,  AH: 4,  CH: 5,  DH: 6,  BH: 7
};

class X86Builder {
  constructor(baseAddr = 0) {
    this.baseAddr = baseAddr >>> 0;
    this.buf = [];
    this.labels = {};
    this.fixups = [];
  }

  pc() {
    return (this.baseAddr + this.buf.length) >>> 0;
  }

  offset() {
    return this.buf.length;
  }

  label(name) {
    this.labels[name] = this.pc();
  }

  u8(v) {
    this.buf.push(v & 0xFF);
  }

  u16(v) {
    this.buf.push(v & 0xFF, (v >>> 8) & 0xFF);
  }

  u32(v) {
    this.buf.push(
      v & 0xFF,
      (v >>> 8) & 0xFF,
      (v >>> 16) & 0xFF,
      (v >>> 24) & 0xFF
    );
  }

  bytes(arr) {
    for (let i = 0; i < arr.length; i++) this.u8(arr[i]);
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

  // [base + disp] in 32-bit mode
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

  // [base + index * (1<<scale) + disp] in 32-bit mode
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

  movRegImm32(reg, imm32) {
    this.u8(0xB8 + (reg & 7));
    this.u32(imm32);
  }

  movRegLabel32(reg, labelName) {
    this.u8(0xB8 + (reg & 7));
    this.fixups.push({ pos: this.buf.length, label: labelName, type: "ABS32" });
    this.u32(0);
  }

  movRegReg32(dst, src) {
    this.u8(0x89);
    this.modrm(3, src, dst);
  }

  movRegMem32(dst, base, disp = 0) {
    this.u8(0x8B);
    this.memRegDisp(dst, base, disp);
  }

  movRegSib32(dst, base, index, scale = 0, disp = 0) {
    this.u8(0x8B);
    this.memSib(dst, base, index, scale, disp);
  }

  movMemReg32(base, disp, src) {
    this.u8(0x89);
    this.memRegDisp(src, base, disp);
  }

  movSibReg32(base, index, scale, disp, src) {
    this.u8(0x89);
    this.memSib(src, base, index, scale, disp);
  }

  movMemImm32(base, disp, imm32) {
    this.u8(0xC7);
    this.memRegDisp(0, base, disp);
    this.u32(imm32);
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

  addRegReg32(dst, src) { this.u8(0x01); this.modrm(3, src, dst); }
  subRegReg32(dst, src) { this.u8(0x29); this.modrm(3, src, dst); }
  andRegReg32(dst, src) { this.u8(0x21); this.modrm(3, src, dst); }
  orRegReg32(dst, src)  { this.u8(0x09); this.modrm(3, src, dst); }
  xorRegReg32(dst, src) { this.u8(0x31); this.modrm(3, src, dst); }
  cmpRegReg32(a, b)     { this.u8(0x39); this.modrm(3, b, a); }

  imulRegReg32(dst, src) {
    this.u8(0x0F); this.u8(0xAF);
    this.modrm(3, dst, src);
  }

  addRegImm32(reg, imm) {
    if (imm >= -128 && imm <= 127) {
      this.u8(0x83); this.modrm(3, 0, reg); this.u8(imm);
    } else {
      this.u8(0x81); this.modrm(3, 0, reg); this.u32(imm);
    }
  }

  subRegImm32(reg, imm) {
    if (imm >= -128 && imm <= 127) {
      this.u8(0x83); this.modrm(3, 5, reg); this.u8(imm);
    } else {
      this.u8(0x81); this.modrm(3, 5, reg); this.u32(imm);
    }
  }

  andRegImm32(reg, imm) {
    if (imm >= -128 && imm <= 127) {
      this.u8(0x83); this.modrm(3, 4, reg); this.u8(imm);
    } else {
      this.u8(0x81); this.modrm(3, 4, reg); this.u32(imm);
    }
  }

  cmpRegImm32(reg, imm) {
    if (imm >= -128 && imm <= 127) {
      this.u8(0x83); this.modrm(3, 7, reg); this.u8(imm);
    } else {
      this.u8(0x81); this.modrm(3, 7, reg); this.u32(imm);
    }
  }

  shlRegImm(reg, count) { this.u8(0xC1); this.modrm(3, 4, reg); this.u8(count); }
  shrRegImm(reg, count) { this.u8(0xC1); this.modrm(3, 5, reg); this.u8(count); }
  sarRegImm(reg, count) { this.u8(0xC1); this.modrm(3, 7, reg); this.u8(count); }

  shlRegCl(reg) { this.u8(0xD3); this.modrm(3, 4, reg); }
  shrRegCl(reg) { this.u8(0xD3); this.modrm(3, 5, reg); }
  sarRegCl(reg) { this.u8(0xD3); this.modrm(3, 7, reg); }

  negReg32(reg) { this.u8(0xF7); this.modrm(3, 3, reg); }
  divReg32(reg) { this.u8(0xF7); this.modrm(3, 6, reg); }
  idivReg32(reg){ this.u8(0xF7); this.modrm(3, 7, reg); }
  cdq()         { this.u8(0x99); }

  pushReg32(reg) { this.u8(0x50 + (reg & 7)); }
  popReg32(reg)  { this.u8(0x58 + (reg & 7)); }

  jmpLabel(name) {
    this.u8(0xE9);
    this.fixups.push({ pos: this.buf.length, label: name, type: "REL32" });
    this.u32(0);
  }

  jmpReg32(reg) {
    this.u8(0xFF);
    this.modrm(3, 4, reg);
  }

  callLabel(name) {
    this.u8(0xE8);
    this.fixups.push({ pos: this.buf.length, label: name, type: "REL32" });
    this.u32(0);
  }

  ret() { this.u8(0xC3); }

  // Conditional jumps (32-bit near Jcc: 0F 8x rel32)
  // cc: 0x84=JE/JZ, 0x85=JNE/JNZ, 0x8C=JL, 0x8D=JGE, 0x8E=JLE, 0x8F=JG, 0x82=JB, 0x87=JA
  jccLabel(cc, name) {
    this.u8(0x0F);
    this.u8(cc & 0xFF);
    this.fixups.push({ pos: this.buf.length, label: name, type: "REL32" });
    this.u32(0);
  }

  jeLabel(name)  { this.jccLabel(0x84, name); }
  jneLabel(name) { this.jccLabel(0x85, name); }
  jlLabel(name)  { this.jccLabel(0x8C, name); }
  jgeLabel(name) { this.jccLabel(0x8D, name); }
  jleLabel(name) { this.jccLabel(0x8E, name); }
  jgLabel(name)  { this.jccLabel(0x8F, name); }
  jbLabel(name)  { this.jccLabel(0x82, name); }
  jaLabel(name)  { this.jccLabel(0x87, name); }

  // SETcc AL: 0F 9x C0
  // cc: 0x94=SETE, 0x95=SETNE, 0x9C=SETL, 0x9E=SETLE, 0x9F=SETG, 0x9D=SETGE, 0x92=SETB, 0x97=SETA
  setccAl(cc) {
    this.u8(0x0F);
    this.u8(cc & 0xFF);
    this.modrm(3, 0, R.AL);
  }

  // Port I/O
  inAlDx()   { this.u8(0xEC); }
  inAxDx()   { this.u8(0x66); this.u8(0xED); }
  inEaxDx()  { this.u8(0xED); }
  outDxAl()  { this.u8(0xEE); }
  outDxAx()  { this.u8(0x66); this.u8(0xEF); }
  outDxEax() { this.u8(0xEF); }
  inAlImm8(p)  { this.u8(0xE4); this.u8(p); }
  outImm8Al(p) { this.u8(0xE6); this.u8(p); }

  cld()      { this.u8(0xFC); }
  cli()      { this.u8(0xFA); }
  hlt()      { this.u8(0xF4); }
  repMovsd() { this.u8(0xF3); this.u8(0xA5); }
  repMovsb() { this.u8(0xF3); this.u8(0xA4); }
  repStosd() { this.u8(0xF3); this.u8(0xAB); }
  repStosb() { this.u8(0xF3); this.u8(0xAA); }

  labelTable32(names) {
    for (const n of names) {
      this.fixups.push({ pos: this.buf.length, label: n, type: "ABS32" });
      this.u32(0);
    }
  }

  finalize() {
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
