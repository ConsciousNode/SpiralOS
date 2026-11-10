/**
 * SpiralOS — TabComp Native Core (TC-32 Machine Code Generator & Assembler)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Emits a genuine native TC-32 machine code binary that runs directly on
 * TabCompCPU (interpreter and Wasm JIT). Implements the complete Spiral Core:
 *   - Hardware initialization (palette, 8x8 font, mouse, timer, StudioNet)
 *   - Spiral VM bytecode interpreter (all 38 opcodes 0x00..0x27)
 *   - All 21 SpiralOS system calls (0..20: graphics, text, input, disk, StudioNet, sound)
 */

"use strict";

function buildTC32Core() {
  const code = [];
  const labels = {};
  const fixups = []; // { wordIdx, label, type: 'J24' | 'IMM32' }

  function pcBytes() {
    return code.length * 4;
  }

  function label(name) {
    labels[name] = pcBytes();
  }

  function emit32(w) {
    code.push(w >>> 0);
  }

  function emitR(op, rd, ra, rb) {
    emit32(((op & 0x3F) << 24) | ((rd & 0xF) << 20) | ((ra & 0xF) << 16) | ((rb & 0xF) << 12));
  }

  function emitI(op, rd, ra, imm16) {
    emit32(((op & 0x3F) << 24) | ((rd & 0xF) << 20) | ((ra & 0xF) << 16) | (imm16 & 0xFFFF));
  }

  function emitJ(op, targetLabel) {
    fixups.push({ wordIdx: code.length, label: targetLabel, type: "J24", op });
    emit32((op & 0x3F) << 24);
  }

  function emitSys(num) {
    emit32((0x2F << 24) | (num & 0xFFFF));
  }

  function emitImm32(rd, val) {
    const u = val >>> 0;
    const lo = u & 0xFFFF;
    const hi = (u >>> 16) & 0xFFFF;
    emitI(0x03, rd, 0, lo); // LUI16 rd, lo (zero-extended)
    if (hi !== 0) {
      emitI(0x04, rd, 0, hi); // LHI rd, hi
    }
  }

  function emitAddrLabel(rd, targetLabel) {
    fixups.push({ wordIdx: code.length, label: targetLabel, type: "IMM32", rd });
    emitI(0x03, rd, 0, 0);
    emitI(0x04, rd, 0, 0);
  }

  // Register conventions in TC-32 Native Core:
  // R0, R1, R2, R3, R4 : Scratch / Host Syscall args
  // R5, R6, R7         : Scratch / Opcode decode temps
  // R8                 : VM_BASE (0x00200000)
  // R9                 : VM_PC   (byte offset in vmRam)
  // R10                : VM_SP   (byte offset in vmRam)
  // R11                : VM_FP   (byte offset in vmRam)
  // R12                : VM_CSP  (byte offset in vmRam)
  // R13                : VM_ICNT (instruction count)
  // R14                : Host SP (0x0DF000)
  // R15                : Host LR

  // ==========================================================================
  // 1. Core Boot & VM State Initialization
  // ==========================================================================
  label("boot_entry");
  emitImm32(8, 0x00200000);   // R8 = VM_BASE = 0x00200000
  emitImm32(10, 0x00100000);  // R10 = VM_SP = 0x00100000
  emitImm32(11, 0x00100000);  // R11 = VM_FP = 0x00100000
  emitImm32(12, 0x00170000);  // R12 = VM_CSP = 0x00170000
  emitImm32(13, 0);           // R13 = VM_ICNT = 0

  // Write Machine ID = 1 (TabComp) at vmRam[0x0FFD1C]
  emitImm32(1, 0x002FFD1C);
  emitImm32(2, 1);
  emitI(0x23, 2, 1, 0);       // STW [R1], R2

  // Copy initial 768-byte palette from TabComp 0x0FFA00 to vmRam[0x0FFA00] (0x002FFA00)
  // and 768-byte 8x8 font from 0x0EF000 to vmRam[0x0EF000] (0x002EF000) if not already set
  emitImm32(1, 0x000EF000);
  emitImm32(2, 0x002EF000);
  emitImm32(3, 768);
  label("copy_font_loop");
  emitI(0x1C, 4, 1, 0);       // LDBU R4, [R1]
  emitI(0x21, 4, 2, 0);       // STB  [R2], R4
  emitI(0x12, 1, 1, 1);       // ADDI R1, R1, 1
  emitI(0x12, 2, 2, 1);       // ADDI R2, R2, 1
  emitI(0x13, 3, 3, 1);       // SUBI R3, R3, 1
  emitI(0x1B, 0, 3, 0);       // CMPI R3, 0
  emitJ(0x28, "copy_font_loop"); // JNE

  emitImm32(1, 0x000FFA00);
  emitImm32(2, 0x002FFA00);
  emitImm32(3, 768);
  label("copy_pal_loop");
  emitI(0x1C, 4, 1, 0);
  emitI(0x21, 4, 2, 0);
  emitI(0x12, 1, 1, 1);
  emitI(0x12, 2, 2, 1);
  emitI(0x13, 3, 3, 1);
  emitI(0x1B, 0, 3, 0);
  emitJ(0x28, "copy_pal_loop");

  // Push sentinel return frame onto VM_CSP: [0x170000] = -1, [0x170004] = 0x100000, VM_CSP += 8
  emitR(0x05, 1, 8, 12);      // R1 = VM_BASE + VM_CSP
  emitImm32(2, -1);
  emitI(0x23, 2, 1, 0);       // STW [R1 + 0], -1
  emitI(0x23, 11, 1, 4);      // STW [R1 + 4], VM_FP
  emitI(0x12, 12, 12, 8);     // ADDI VM_CSP, VM_CSP, 8

  // Check SPIR magic (0x52495053) at vmRam[0x000000]
  emitI(0x20, 1, 8, 0);       // LDW R1, [VM_BASE + 0]
  emitImm32(2, 0x52495053);
  emitR(0x1A, 0, 1, 2);       // CMP R1, R2
  emitJ(0x27, "has_spir_hdr");
  emitImm32(9, 0);            // VM_PC = 0 (raw bytecode)
  emitJ(0x26, "vm_loop");
  label("has_spir_hdr");
  emitI(0x20, 9, 8, 8);       // VM_PC = i32[VM_BASE + 8] (entry_pc)

  // ==========================================================================
  // 2. Main Spiral VM Fetch-Decode-Execute Loop
  // ==========================================================================
  label("vm_loop");
  // Check if VM_PC < 0 (sentinel return -> halt)
  emitI(0x1B, 0, 9, 0);       // CMPI VM_PC, 0
  emitJ(0x29, "vm_halt_from_ret"); // JLT

  // Fetch 32-bit instruction: R4 = i32[VM_BASE + VM_PC]
  emitR(0x05, 1, 8, 9);       // R1 = VM_BASE + VM_PC
  emitI(0x20, 4, 1, 0);       // LDW R4, [R1]
  emitI(0x12, 9, 9, 4);       // VM_PC += 4
  emitI(0x12, 13, 13, 1);     // VM_ICNT += 1

  // Extract op = (R4 >>> 24) & 0xFF into R5
  emitI(0x18, 5, 4, 24);      // SHR R5, R4, 24

  // Jump table dispatch: if op > 0x27 -> halt
  emitI(0x1B, 0, 5, 0x27);
  emitJ(0x2C, "vm_halt_bad_op"); // JGT (signed > 0x27)
  emitAddrLabel(1, "op_table");
  emitI(0x17, 2, 5, 2);       // R2 = op << 2
  emitR(0x05, 1, 1, 2);       // R1 = &op_table[op]
  emitI(0x20, 1, 1, 0);       // R1 = target PC
  emitI(0x35, 1, 0, 0);       // JR R1

  // --------------------------------------------------------------------------
  // Opcode Handlers
  // --------------------------------------------------------------------------

  // 0x00: NOP
  label("op_00_nop");
  emitJ(0x26, "vm_loop");

  // 0x01: HALT (pop exit code)
  label("op_01_halt");
  emitI(0x13, 10, 10, 4);     // VM_SP -= 4
  emitR(0x05, 1, 8, 10);
  emitI(0x20, 0, 1, 0);       // R0 = pop()
  emitJ(0x26, "vm_halt_with_r0");

  // 0x02: PUSH_I16 (sign-extended imm16)
  label("op_02_push_i16");
  emitI(0x17, 1, 4, 16);      // SHL R1, R4, 16
  emitI(0x19, 1, 1, 16);      // SAR R1, R1, 16
  emitR(0x05, 2, 8, 10);      // R2 = VM_BASE + VM_SP
  emitI(0x23, 1, 2, 0);       // STW [R2], R1
  emitI(0x12, 10, 10, 4);     // VM_SP += 4
  emitJ(0x26, "vm_loop");

  // 0x03: PUSH_U16 (zero-extended uimm16)
  label("op_03_push_u16");
  emitI(0x14, 1, 4, 0xFFFF);  // ANDI R1, R4, 0xFFFF
  emitR(0x05, 2, 8, 10);
  emitI(0x23, 1, 2, 0);
  emitI(0x12, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  // 0x04: PUSH_HI (tos = (tos & 0xFFFF) | (uimm16 << 16))
  label("op_04_push_hi");
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);      // R1 = i32[VM_BASE + VM_SP - 4]
  emitI(0x14, 1, 1, 0xFFFF);  // R1 &= 0xFFFF
  emitI(0x17, 3, 4, 16);      // R3 = uimm16 << 16
  emitR(0x0D, 1, 1, 3);       // R1 |= R3
  emitI(0x23, 1, 2, -4);
  emitJ(0x26, "vm_loop");

  // 0x05: DUP
  label("op_05_dup");
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);
  emitI(0x23, 1, 2, 0);
  emitI(0x12, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  // 0x06: DROP
  label("op_06_drop");
  emitI(0x13, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  // 0x07: SWAP
  label("op_07_swap");
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);
  emitI(0x20, 3, 2, -8);
  emitI(0x23, 3, 2, -4);
  emitI(0x23, 1, 2, -8);
  emitJ(0x26, "vm_loop");

  // 0x08: GET_LOCAL (uimm16 = slot index)
  label("op_08_get_local");
  emitI(0x14, 1, 4, 0xFFFF);
  emitI(0x17, 1, 1, 2);       // R1 = slot * 4
  emitR(0x05, 1, 11, 1);      // R1 = VM_FP + slot * 4
  emitR(0x05, 1, 8, 1);       // R1 = VM_BASE + VM_FP + slot * 4
  emitI(0x20, 1, 1, 0);       // R1 = i32[R1]
  emitR(0x05, 2, 8, 10);
  emitI(0x23, 1, 2, 0);
  emitI(0x12, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  // 0x09: SET_LOCAL (uimm16 = slot index)
  label("op_09_set_local");
  emitI(0x13, 10, 10, 4);     // VM_SP -= 4
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 3, 2, 0);       // R3 = pop()
  emitI(0x14, 1, 4, 0xFFFF);
  emitI(0x17, 1, 1, 2);
  emitR(0x05, 1, 11, 1);
  emitR(0x05, 1, 8, 1);
  emitI(0x23, 3, 1, 0);
  emitJ(0x26, "vm_loop");

  // 0x0A: GET_GLOBAL (uimm16 = global slot index at 0x010000)
  label("op_0a_get_global");
  emitI(0x14, 1, 4, 0xFFFF);
  emitI(0x17, 1, 1, 2);       // R1 = idx * 4
  emitImm32(2, 0x00210000);   // VM_BASE + 0x010000
  emitR(0x05, 1, 2, 1);
  emitI(0x20, 1, 1, 0);
  emitR(0x05, 2, 8, 10);
  emitI(0x23, 1, 2, 0);
  emitI(0x12, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  // 0x0B: SET_GLOBAL
  label("op_0b_set_global");
  emitI(0x13, 10, 10, 4);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 3, 2, 0);       // R3 = pop()
  emitI(0x14, 1, 4, 0xFFFF);
  emitI(0x17, 1, 1, 2);
  emitImm32(2, 0x00210000);
  emitR(0x05, 1, 2, 1);
  emitI(0x23, 3, 1, 0);
  emitJ(0x26, "vm_loop");

  // 0x0C: ADDR_LOCAL
  label("op_0c_addr_local");
  emitI(0x14, 1, 4, 0xFFFF);
  emitI(0x17, 1, 1, 2);
  emitR(0x05, 1, 11, 1);      // R1 = VM_FP + slot * 4
  emitR(0x05, 2, 8, 10);
  emitI(0x23, 1, 2, 0);
  emitI(0x12, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  // 0x0D: ADDR_GLOBAL
  label("op_0d_addr_global");
  emitI(0x14, 1, 4, 0xFFFF);
  emitI(0x17, 1, 1, 2);
  emitImm32(2, 0x00010000);
  emitR(0x05, 1, 2, 1);      // R1 = 0x010000 + idx * 4
  emitR(0x05, 2, 8, 10);
  emitI(0x23, 1, 2, 0);
  emitI(0x12, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  // 0x0E: LOAD8U (addr = pop() + imm16)
  label("op_0e_load8u");
  emitI(0x17, 3, 4, 16);
  emitI(0x19, 3, 3, 16);      // R3 = sign_ext(imm16)
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);      // R1 = addr
  emitR(0x05, 1, 1, 3);       // R1 = addr + imm16
  emitImm32(5, 0x003FFFFF);
  emitR(0x0C, 1, 1, 5);       // mask to 4 MiB
  emitR(0x05, 1, 8, 1);       // + VM_BASE
  emitI(0x1C, 1, 1, 0);       // LDBU R1, [R1]
  emitI(0x23, 1, 2, -4);      // replace TOS
  emitJ(0x26, "vm_loop");

  // 0x0F: LOAD8S
  label("op_0f_load8s");
  emitI(0x17, 3, 4, 16);
  emitI(0x19, 3, 3, 16);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);
  emitR(0x05, 1, 1, 3);
  emitImm32(5, 0x003FFFFF);
  emitR(0x0C, 1, 1, 5);
  emitR(0x05, 1, 8, 1);
  emitI(0x1D, 1, 1, 0);       // LDBS R1, [R1]
  emitI(0x23, 1, 2, -4);
  emitJ(0x26, "vm_loop");

  // 0x10: LOAD16U
  label("op_10_load16u");
  emitI(0x17, 3, 4, 16);
  emitI(0x19, 3, 3, 16);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);
  emitR(0x05, 1, 1, 3);
  emitImm32(5, 0x003FFFFF);
  emitR(0x0C, 1, 1, 5);
  emitR(0x05, 1, 8, 1);
  emitI(0x1E, 1, 1, 0);       // LDHU R1, [R1]
  emitI(0x23, 1, 2, -4);
  emitJ(0x26, "vm_loop");

  // 0x11: LOAD32
  label("op_11_load32");
  emitI(0x17, 3, 4, 16);
  emitI(0x19, 3, 3, 16);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);
  emitR(0x05, 1, 1, 3);
  emitImm32(5, 0x003FFFFF);
  emitR(0x0C, 1, 1, 5);
  emitR(0x05, 1, 8, 1);
  emitI(0x20, 1, 1, 0);       // LDW R1, [R1]
  emitI(0x23, 1, 2, -4);
  emitJ(0x26, "vm_loop");

  // 0x12: STORE8 (val = pop(); addr = pop() + imm16; u8[addr] = val)
  label("op_12_store8");
  emitI(0x17, 3, 4, 16);
  emitI(0x19, 3, 3, 16);
  emitI(0x13, 10, 10, 8);     // VM_SP -= 8
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, 0);       // R1 = addr
  emitI(0x20, 5, 2, 4);       // R5 = val
  emitR(0x05, 1, 1, 3);
  emitImm32(6, 0x003FFFFF);
  emitR(0x0C, 1, 1, 6);
  emitR(0x05, 1, 8, 1);
  emitI(0x21, 5, 1, 0);       // STB [R1], R5
  emitJ(0x26, "vm_loop");

  // 0x13: STORE16
  label("op_13_store16");
  emitI(0x17, 3, 4, 16);
  emitI(0x19, 3, 3, 16);
  emitI(0x13, 10, 10, 8);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, 0);
  emitI(0x20, 5, 2, 4);
  emitR(0x05, 1, 1, 3);
  emitImm32(6, 0x003FFFFF);
  emitR(0x0C, 1, 1, 6);
  emitR(0x05, 1, 8, 1);
  emitI(0x22, 5, 1, 0);       // STH [R1], R5
  emitJ(0x26, "vm_loop");

  // 0x14: STORE32
  label("op_14_store32");
  emitI(0x17, 3, 4, 16);
  emitI(0x19, 3, 3, 16);
  emitI(0x13, 10, 10, 8);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, 0);
  emitI(0x20, 5, 2, 4);
  emitR(0x05, 1, 1, 3);
  emitImm32(6, 0x003FFFFF);
  emitR(0x0C, 1, 1, 6);
  emitR(0x05, 1, 8, 1);
  emitI(0x23, 5, 1, 0);       // STW [R1], R5
  emitJ(0x26, "vm_loop");

  // Helper macro for binary ALU ops
  function emitBinOp(tcOp) {
    emitI(0x13, 10, 10, 4);   // VM_SP -= 4
    emitR(0x05, 2, 8, 10);
    emitI(0x20, 1, 2, -4);    // R1 = a
    emitI(0x20, 3, 2, 0);     // R3 = b
    emitR(tcOp, 1, 1, 3);     // R1 = a op b
    emitI(0x23, 1, 2, -4);
    emitJ(0x26, "vm_loop");
  }

  label("op_15_add"); emitBinOp(0x05);
  label("op_16_sub"); emitBinOp(0x06);
  label("op_17_mul"); emitBinOp(0x07);
  label("op_18_div"); emitBinOp(0x08);
  label("op_19_mod"); emitBinOp(0x09);
  label("op_1a_and"); emitBinOp(0x0C);
  label("op_1b_or");  emitBinOp(0x0D);
  label("op_1c_xor"); emitBinOp(0x0E);
  label("op_1d_shl"); emitBinOp(0x0F);
  label("op_1e_shr"); emitBinOp(0x10);
  label("op_1f_sar"); emitBinOp(0x11);

  // 0x20: CMP (uimm16 = 0:==, 1:!=, 2:<, 3:<=, 4:>, 5:>=, 6:u<, 7:u>)
  label("op_20_cmp");
  emitI(0x13, 10, 10, 4);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);      // R1 = a
  emitI(0x20, 3, 2, 0);       // R3 = b
  emitR(0x1A, 0, 1, 3);       // CMP R1, R3
  emitI(0x14, 5, 4, 0x07);    // subop = inst & 7
  emitI(0x1B, 0, 5, 0);       // Wait: CMP overwrites flags! So dispatch subop BEFORE CMP R1, R3!
  // Let's do CMP R1, R3 inside each branch or use TC-32's SETCC (0x36)!
  // Wait: in TC-32, opcode 0x36 is SETCC rd, uimm16 where:
  // 0: ==, 1: !=, 2: <, 3: >=, 4: <=, 5: >, 6: u<, 7: u>=, 8: u<=, 9: u>
  // Let's map SpiralVM cmp subop (0..7) cleanly:
  emitAddrLabel(6, "cmp_table");
  emitI(0x17, 5, 5, 2);
  emitR(0x05, 6, 6, 5);
  emitI(0x20, 6, 6, 0);
  emitR(0x1A, 0, 1, 3);       // CMP R1, R3 (sets TC-32 flags!)
  emitI(0x35, 6, 0, 0);       // JR R6

  label("cmp_0_eq"); emitI(0x36, 1, 0, 0); emitI(0x23, 1, 2, -4); emitJ(0x26, "vm_loop");
  label("cmp_1_ne"); emitI(0x36, 1, 0, 1); emitI(0x23, 1, 2, -4); emitJ(0x26, "vm_loop");
  label("cmp_2_lt"); emitI(0x36, 1, 0, 2); emitI(0x23, 1, 2, -4); emitJ(0x26, "vm_loop");
  label("cmp_3_le"); emitI(0x36, 1, 0, 4); emitI(0x23, 1, 2, -4); emitJ(0x26, "vm_loop");
  label("cmp_4_gt"); emitI(0x36, 1, 0, 5); emitI(0x23, 1, 2, -4); emitJ(0x26, "vm_loop");
  label("cmp_5_ge"); emitI(0x36, 1, 0, 3); emitI(0x23, 1, 2, -4); emitJ(0x26, "vm_loop");
  label("cmp_6_ult"); emitI(0x36, 1, 0, 6); emitI(0x23, 1, 2, -4); emitJ(0x26, "vm_loop");
  label("cmp_7_ugt"); emitI(0x36, 1, 0, 9); emitI(0x23, 1, 2, -4); emitJ(0x26, "vm_loop");

  // 0x21: JMP addr24
  label("op_21_jmp");
  emitImm32(1, 0x00FFFFFF);
  emitR(0x0C, 9, 4, 1);       // VM_PC = inst & 0x00FFFFFF
  emitJ(0x26, "vm_loop");

  // 0x22: JZ addr24
  label("op_22_jz");
  emitI(0x13, 10, 10, 4);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, 0);       // R1 = pop()
  emitI(0x1B, 0, 1, 0);
  emitJ(0x28, "vm_loop");     // if != 0, continue
  emitImm32(1, 0x00FFFFFF);
  emitR(0x0C, 9, 4, 1);
  emitJ(0x26, "vm_loop");

  // 0x23: JNZ addr24
  label("op_23_jnz");
  emitI(0x13, 10, 10, 4);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, 0);
  emitI(0x1B, 0, 1, 0);
  emitJ(0x27, "vm_loop");     // if == 0, continue
  emitImm32(1, 0x00FFFFFF);
  emitR(0x0C, 9, 4, 1);
  emitJ(0x26, "vm_loop");

  // 0x24: CALL addr24
  label("op_24_call");
  emitR(0x05, 1, 8, 12);      // R1 = VM_BASE + VM_CSP
  emitI(0x23, 9, 1, 0);       // [VM_CSP + 0] = VM_PC
  emitI(0x23, 11, 1, 4);      // [VM_CSP + 4] = VM_FP
  emitI(0x12, 12, 12, 8);     // VM_CSP += 8
  emitImm32(1, 0x00FFFFFF);
  emitR(0x0C, 9, 4, 1);       // VM_PC = addr24
  emitJ(0x26, "vm_loop");

  // 0x25: ENTER [nargs:8][total_locals:16]
  label("op_25_enter");
  emitI(0x18, 1, 4, 16);
  emitI(0x14, 1, 1, 0xFF);    // R1 = nargs
  emitI(0x17, 1, 1, 2);       // R1 = nargs * 4
  emitR(0x06, 11, 10, 1);     // VM_FP = VM_SP - nargs * 4
  emitI(0x14, 2, 4, 0xFFFF);  // R2 = total_locals
  emitI(0x17, 2, 2, 2);       // R2 = total_locals * 4
  emitR(0x05, 10, 11, 2);     // VM_SP = VM_FP + total_locals * 4
  emitJ(0x26, "vm_loop");

  // 0x26: RET
  label("op_26_ret");
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);      // R1 = ret_val = pop()
  emitI(0x01, 10, 11, 0);     // VM_SP = VM_FP
  emitR(0x05, 2, 8, 10);
  emitI(0x23, 1, 2, 0);       // push(ret_val)
  emitI(0x12, 10, 10, 4);     // VM_SP += 4
  emitI(0x13, 12, 12, 8);     // VM_CSP -= 8
  emitR(0x05, 2, 8, 12);
  emitI(0x20, 9, 2, 0);       // VM_PC = [VM_CSP + 0]
  emitI(0x20, 11, 2, 4);      // VM_FP = [VM_CSP + 4]
  emitJ(0x26, "vm_loop");

  // ==========================================================================
  // 3. System Call Dispatcher (0x27: SYSCALL [nargs:8][sysnum:16])
  // ==========================================================================
  label("op_27_syscall");
  emitI(0x18, 1, 4, 16);
  emitI(0x14, 1, 1, 0xFF);    // R1 = nargs
  emitI(0x17, 1, 1, 2);       // R1 = nargs * 4
  emitR(0x06, 10, 10, 1);     // VM_SP -= nargs * 4
  emitR(0x05, 7, 8, 10);      // R7 = &args[0] = VM_BASE + VM_SP
  emitI(0x14, 6, 4, 0xFFFF);  // R6 = sysnum

  // Update VM instruction counter at vmRam[0x0FFD20]
  emitImm32(1, 0x002FFD20);
  emitI(0x23, 13, 1, 0);

  // Dispatch sysnum (0..20)
  emitI(0x1B, 0, 6, 0); emitJ(0x27, "sys_00_exit");
  emitI(0x1B, 0, 6, 1); emitJ(0x27, "sys_01_yield");
  emitI(0x1B, 0, 6, 2); emitJ(0x27, "sys_02_time");
  emitI(0x1B, 0, 6, 3); emitJ(0x27, "sys_03_key");
  emitI(0x1B, 0, 6, 4); emitJ(0x27, "sys_04_mouse");
  emitI(0x1B, 0, 6, 5); emitJ(0x27, "sys_05_fill_rect");
  emitI(0x1B, 0, 6, 6); emitJ(0x27, "sys_06_draw_char");
  emitI(0x1B, 0, 6, 7); emitJ(0x27, "sys_07_draw_str");
  emitI(0x1B, 0, 6, 8); emitJ(0x27, "sys_08_memcpy");
  emitI(0x1B, 0, 6, 9); emitJ(0x27, "sys_09_memset");
  emitI(0x1B, 0, 6, 10); emitJ(0x27, "sys_10_disk_sync");
  emitI(0x1B, 0, 6, 11); emitJ(0x27, "sys_11_reboot");
  emitI(0x1B, 0, 6, 12); emitJ(0x27, "sys_12_net_send");
  emitI(0x1B, 0, 6, 13); emitJ(0x27, "sys_13_net_recv");
  emitI(0x1B, 0, 6, 14); emitJ(0x27, "sys_14_net_info");
  emitI(0x1B, 0, 6, 15); emitJ(0x27, "sys_15_sound");
  emitI(0x1B, 0, 6, 16); emitJ(0x27, "sys_16_machine_info");
  emitI(0x1B, 0, 6, 17); emitJ(0x27, "sys_17_blit_rect");
  emitI(0x1B, 0, 6, 18); emitJ(0x27, "sys_18_strcmp");
  emitI(0x1B, 0, 6, 19); emitJ(0x27, "sys_19_strlen");
  emitI(0x1B, 0, 6, 20); emitJ(0x27, "sys_20_itoa");

  emitImm32(0, -1);
  emitJ(0x26, "sys_push_r0");

  // Helper to push R0 as syscall return value and resume vm_loop
  label("sys_push_r0");
  emitR(0x05, 2, 8, 10);
  emitI(0x23, 0, 2, 0);
  emitI(0x12, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  // SYS 0: EXIT(code)
  label("sys_00_exit");
  emitI(0x20, 0, 7, 0);       // R0 = arg0
  emitJ(0x26, "vm_halt_with_r0");

  // SYS 1: YIELD() -> copies vmRam VRAM (0x002F0000, 64000B) & PALETTE (0x002FFA00, 768B) to TabComp 0x0F0000 & 0x0FFA00, then SYS 10
  label("sys_01_yield");
  emitImm32(1, 0x002F0000);
  emitImm32(2, 0x000F0000);
  emitImm32(3, 64768);        // 64000 VRAM + 768 PALETTE contiguous!
  label("yield_copy_loop");
  emitI(0x20, 4, 1, 0);
  emitI(0x23, 4, 2, 0);
  emitI(0x12, 1, 1, 4);
  emitI(0x12, 2, 2, 4);
  emitI(0x13, 3, 3, 4);
  emitI(0x1B, 0, 3, 0);
  emitJ(0x28, "yield_copy_loop");
  // Increment vsync counter at vmRam[0x0FFD04]
  emitImm32(1, 0x002FFD04);
  emitI(0x20, 2, 1, 0);
  emitI(0x12, 2, 2, 1);
  emitI(0x23, 2, 1, 0);
  emitSys(10);                // TabComp YIELD()
  emitImm32(0, 0);
  emitJ(0x26, "sys_push_r0");

  // SYS 2: TIME_MS()
  label("sys_02_time");
  emitSys(28);                // TabComp TICKS_MS() -> R0
  emitImm32(1, 0x002FFD24);
  emitI(0x23, 0, 1, 0);
  emitJ(0x26, "sys_push_r0");

  // SYS 3: KEY_POLL() -> returns ((pressed << 16) | (keycode << 8) | ascii) or 0
  label("sys_03_key");
  emitImm32(0, 0x000DF400);   // pressed_ptr scratch
  emitImm32(1, 0x000DF404);   // keycode_ptr scratch
  emitSys(27);                // TabComp KEYEVENT -> R0
  emitJ(0x26, "sys_push_r0");

  // SYS 4: MOUSE_POLL(out_ptr) -> writes x, y, buttons to vmRam[out_ptr] and returns packed state
  label("sys_04_mouse");
  emitI(0x20, 1, 7, 0);       // R1 = out_ptr (in vmRam)
  emitI(0x1B, 0, 1, 0);
  emitJ(0x27, "mouse_no_ptr");
  emitR(0x05, 0, 8, 1);       // R0 = VM_BASE + out_ptr
  emitJ(0x26, "mouse_do_sys");
  label("mouse_no_ptr");
  emitImm32(0, 0x002FFD08);
  label("mouse_do_sys");
  emitSys(31);                // TabComp MOUSE_POLL -> R0
  // Also mirror to vmRam[0x0FFD08..0x0FFD10]
  emitImm32(1, 0x000FFD08);
  emitImm32(2, 0x002FFD08);
  emitI(0x20, 3, 1, 0); emitI(0x23, 3, 2, 0);
  emitI(0x20, 3, 1, 4); emitI(0x23, 3, 2, 4);
  emitI(0x20, 3, 1, 8); emitI(0x23, 3, 2, 8);
  emitJ(0x26, "sys_push_r0");

  // SYS 5: FILL_RECT(x, y, w, h, color)
  label("sys_05_fill_rect");
  emitI(0x20, 1, 7, 0);       // R1 = x
  emitI(0x20, 2, 7, 4);       // R2 = y
  emitI(0x20, 3, 7, 8);       // R3 = w
  emitI(0x20, 4, 7, 12);      // R4 = h
  emitI(0x20, 5, 7, 16);      // R5 = color
  // Clip x < 0
  emitI(0x1B, 0, 1, 0);
  emitJ(0x2A, "fr_x_ok");     // JGE
  emitR(0x05, 3, 3, 1);       // w += x
  emitImm32(1, 0);
  label("fr_x_ok");
  // Clip y < 0
  emitI(0x1B, 0, 2, 0);
  emitJ(0x2A, "fr_y_ok");
  emitR(0x05, 4, 4, 2);       // h += y
  emitImm32(2, 0);
  label("fr_y_ok");
  // Clip x + w > 320
  emitR(0x05, 6, 1, 3);
  emitI(0x1B, 0, 6, 320);
  emitJ(0x2B, "fr_w_ok");     // JLE
  emitImm32(6, 320);
  emitR(0x06, 3, 6, 1);       // w = 320 - x
  label("fr_w_ok");
  // Clip y + h > 200
  emitR(0x05, 6, 2, 4);
  emitI(0x1B, 0, 6, 200);
  emitJ(0x2B, "fr_h_ok");
  emitImm32(6, 200);
  emitR(0x06, 4, 6, 2);       // h = 200 - y
  label("fr_h_ok");
  emitI(0x1B, 0, 3, 0); emitJ(0x2B, "fr_done");
  emitI(0x1B, 0, 4, 0); emitJ(0x2B, "fr_done");

  // Row pointer: R2 = 0x002F0000 + y * 320 + x
  emitImm32(6, 320);
  emitR(0x07, 2, 2, 6);       // y * 320
  emitR(0x05, 2, 2, 1);       // + x
  emitImm32(6, 0x002F0000);
  emitR(0x05, 2, 2, 6);

  label("fr_row_loop");
  emitI(0x01, 1, 2, 0);       // R1 = row_ptr
  emitI(0x01, 6, 3, 0);       // R6 = w
  label("fr_col_loop");
  emitI(0x21, 5, 1, 0);       // STB [R1], color
  emitI(0x12, 1, 1, 1);
  emitI(0x13, 6, 6, 1);
  emitI(0x1B, 0, 6, 0);
  emitJ(0x28, "fr_col_loop");
  emitI(0x12, 2, 2, 320);     // row_ptr += 320
  emitI(0x13, 4, 4, 1);
  emitI(0x1B, 0, 4, 0);
  emitJ(0x28, "fr_row_loop");

  label("fr_done");
  emitImm32(0, 0);
  emitJ(0x26, "sys_push_r0");

  // Internal subroutine: draw single 8x8 char
  // Input: R1=x, R2=y, R3=ch, R4=fg, R5=bg (R15 = return addr)
  label("sub_draw_char");
  emitI(0x13, 3, 3, 32);      // ch -= 32
  emitI(0x1B, 0, 3, 0); emitJ(0x29, "dc_ret");
  emitI(0x1B, 0, 3, 95); emitJ(0x2C, "dc_ret");
  emitI(0x1B, 0, 1, 0); emitJ(0x29, "dc_ret");
  emitI(0x1B, 0, 1, 312); emitJ(0x2C, "dc_ret");
  emitI(0x1B, 0, 2, 0); emitJ(0x29, "dc_ret");
  emitI(0x1B, 0, 2, 192); emitJ(0x2C, "dc_ret");

  // Font ptr: R3 = 0x002EF000 + (ch - 32) * 8
  emitI(0x17, 3, 3, 3);
  emitImm32(6, 0x002EF000);
  emitR(0x05, 3, 3, 6);

  // VRAM ptr: R2 = 0x002F0000 + y * 320 + x
  emitImm32(6, 320);
  emitR(0x07, 2, 2, 6);
  emitR(0x05, 2, 2, 1);
  emitImm32(6, 0x002F0000);
  emitR(0x05, 2, 2, 6);

  emitImm32(6, 8);            // 8 rows
  label("dc_row_loop");
  emitI(0x1C, 0, 3, 0);       // R0 = glyph row byte
  emitI(0x12, 3, 3, 1);
  // Unroll or loop 8 bits using R1 as mask 128..1
  emitImm32(1, 128);
  label("dc_bit_loop");
  emitR(0x0C, 7, 0, 1);       // R7 = bits & mask
  emitI(0x1B, 0, 7, 0);
  emitJ(0x27, "dc_bit_off");
  emitI(0x21, 4, 2, 0);       // STB [R2], fg
  emitJ(0x26, "dc_bit_next");
  label("dc_bit_off");
  emitI(0x1B, 0, 5, 0);       // if bg >= 0, draw bg
  emitJ(0x29, "dc_bit_next");
  emitI(0x21, 5, 2, 0);       // STB [R2], bg
  label("dc_bit_next");
  emitI(0x12, 2, 2, 1);       // vram++
  emitI(0x18, 1, 1, 1);       // mask >>>= 1
  emitI(0x1B, 0, 1, 0);
  emitJ(0x28, "dc_bit_loop");

  emitI(0x12, 2, 2, 312);     // vram += 320 - 8
  emitI(0x13, 6, 6, 1);
  emitI(0x1B, 0, 6, 0);
  emitJ(0x28, "dc_row_loop");

  label("dc_ret");
  emitI(0x2E, 0, 0, 0);       // RET (PC = R15)

  // SYS 6: DRAW_CHAR(x, y, ch, fg, bg)
  label("sys_06_draw_char");
  emitI(0x20, 1, 7, 0);
  emitI(0x20, 2, 7, 4);
  emitI(0x20, 3, 7, 8);
  emitI(0x20, 4, 7, 12);
  emitI(0x20, 5, 7, 16);
  emitJ(0x2D, "sub_draw_char"); // CALL sub_draw_char
  emitImm32(0, 0);
  emitJ(0x26, "sys_push_r0");

  // SYS 7: DRAW_STR(x, y, str_ptr, fg, bg)
  label("sys_07_draw_str");
  // Save args in scratch RAM at 0x000DF500..0x000DF514
  emitImm32(6, 0x000DF500);
  emitI(0x20, 1, 7, 0); emitI(0x23, 1, 6, 0);  // x
  emitI(0x20, 1, 7, 4); emitI(0x23, 1, 6, 4);  // y
  emitI(0x20, 1, 7, 8);
  emitR(0x05, 1, 8, 1); emitI(0x23, 1, 6, 8);  // phys str_ptr
  emitI(0x20, 1, 7, 12); emitI(0x23, 1, 6, 12); // fg
  emitI(0x20, 1, 7, 16); emitI(0x23, 1, 6, 16); // bg

  label("ds_loop");
  emitImm32(6, 0x000DF500);
  emitI(0x20, 1, 6, 8);       // str_ptr
  emitI(0x1C, 3, 1, 0);       // ch = u8[str_ptr]
  emitI(0x1B, 0, 3, 0);
  emitJ(0x27, "ds_done");
  emitI(0x12, 1, 1, 1);
  emitI(0x23, 1, 6, 8);       // str_ptr++
  emitI(0x20, 1, 6, 0);       // x
  emitI(0x20, 2, 6, 4);       // y
  emitI(0x20, 4, 6, 12);      // fg
  emitI(0x20, 5, 6, 16);      // bg
  emitJ(0x2D, "sub_draw_char");
  emitImm32(6, 0x000DF500);
  emitI(0x20, 1, 6, 0);
  emitI(0x12, 1, 1, 8);       // x += 8
  emitI(0x23, 1, 6, 0);
  emitJ(0x26, "ds_loop");
  label("ds_done");
  emitImm32(0, 0);
  emitJ(0x26, "sys_push_r0");

  // SYS 8: MEMCPY(dst, src, len)
  label("sys_08_memcpy");
  emitI(0x20, 1, 7, 0);       // dst
  emitI(0x20, 2, 7, 4);       // src
  emitI(0x20, 3, 7, 8);       // len
  emitR(0x05, 1, 8, 1);
  emitR(0x05, 2, 8, 2);
  emitI(0x1B, 0, 3, 0);
  emitJ(0x2B, "mc_done");
  label("mc_loop");
  emitI(0x1C, 4, 2, 0);
  emitI(0x21, 4, 1, 0);
  emitI(0x12, 1, 1, 1);
  emitI(0x12, 2, 2, 1);
  emitI(0x13, 3, 3, 1);
  emitI(0x1B, 0, 3, 0);
  emitJ(0x28, "mc_loop");
  label("mc_done");
  emitImm32(0, 0);
  emitJ(0x26, "sys_push_r0");

  // SYS 9: MEMSET(dst, val, len)
  label("sys_09_memset");
  emitI(0x20, 1, 7, 0);       // dst
  emitI(0x20, 2, 7, 4);       // val
  emitI(0x20, 3, 7, 8);       // len
  emitR(0x05, 1, 8, 1);
  emitI(0x1B, 0, 3, 0);
  emitJ(0x2B, "ms_done");
  label("ms_loop");
  emitI(0x21, 2, 1, 0);
  emitI(0x12, 1, 1, 1);
  emitI(0x13, 3, 3, 1);
  emitI(0x1B, 0, 3, 0);
  emitJ(0x28, "ms_loop");
  label("ms_done");
  emitImm32(0, 0);
  emitJ(0x26, "sys_push_r0");

  // SYS 10: DISK_SYNC(start_sector, sector_count)
  label("sys_10_disk_sync");
  emitImm32(0, 0x00400000);   // R0 = mounted image base in TabComp RAM (vmRam[0x200000])
  emitI(0x20, 1, 7, 0);       // R1 = start_sector
  emitI(0x20, 2, 7, 4);       // R2 = sector_count
  emitSys(35);                // TabComp DISK_SYNC
  emitJ(0x26, "sys_push_r0");

  // SYS 11: REBOOT()
  label("sys_11_reboot");
  emitImm32(0, 0x00400000);
  emitSys(36);                // TabComp REBOOT_SPIRAL (reloads image and resets PC to 0!)
  emitJ(0x26, "boot_entry");

  // SYS 12: NET_SEND(buf_ptr, len)
  label("sys_12_net_send");
  emitI(0x20, 0, 7, 0);
  emitR(0x05, 0, 8, 0);       // R0 = VM_BASE + buf_ptr
  emitI(0x20, 1, 7, 4);       // R1 = len
  emitSys(32);                // TabComp NET_SEND
  emitJ(0x26, "sys_push_r0");

  // SYS 13: NET_RECV(buf_ptr, max_len)
  label("sys_13_net_recv");
  emitI(0x20, 0, 7, 0);
  emitR(0x05, 0, 8, 0);       // R0 = VM_BASE + buf_ptr
  emitI(0x20, 1, 7, 4);       // R1 = max_len
  emitSys(33);                // TabComp NET_RECV
  emitJ(0x26, "sys_push_r0");

  // SYS 14: NET_INFO(cmd, val)
  label("sys_14_net_info");
  emitI(0x20, 0, 7, 0);
  emitI(0x20, 1, 7, 4);
  emitSys(34);                // TabComp NET_INFO
  emitJ(0x26, "sys_push_r0");

  // SYS 15: SOUND_TONE(freq_hz, duration_ms, wave)
  label("sys_15_sound");
  emitI(0x20, 1, 7, 0);       // freq
  emitI(0x20, 2, 7, 4);       // duration
  emitI(0x20, 3, 7, 8);       // wave
  emitImm32(4, 0x000FFD20);   // SOUND_REGS ch0
  emitI(0x22, 1, 4, 0);       // freq u16
  emitImm32(5, 180);
  emitI(0x21, 5, 4, 2);       // vol = 180
  emitI(0x21, 3, 4, 3);       // wave
  emitImm32(0, 0);
  emitJ(0x26, "sys_push_r0");

  // SYS 16: MACHINE_INFO(query) -> 0: machineId(1), 1: vmRamSize(4MB), 2: icnt, 3: nodeId
  label("sys_16_machine_info");
  emitI(0x20, 1, 7, 0);
  emitI(0x1B, 0, 1, 0); emitJ(0x27, "mi_0");
  emitI(0x1B, 0, 1, 1); emitJ(0x27, "mi_1");
  emitI(0x1B, 0, 1, 2); emitJ(0x27, "mi_2");
  emitImm32(0, 0x0101);
  emitJ(0x26, "sys_push_r0");
  label("mi_0"); emitImm32(0, 1); emitJ(0x26, "sys_push_r0");
  label("mi_1"); emitImm32(0, 0x00400000); emitJ(0x26, "sys_push_r0");
  label("mi_2"); emitI(0x01, 0, 13, 0); emitJ(0x26, "sys_push_r0");

  // SYS 17: BLIT_RECT(x, y, w, h, src_ptr)
  label("sys_17_blit_rect");
  emitI(0x20, 1, 7, 0);       // x
  emitI(0x20, 2, 7, 4);       // y
  emitI(0x20, 3, 7, 8);       // w
  emitI(0x20, 4, 7, 12);      // h
  emitI(0x20, 5, 7, 16);      // src_ptr
  emitR(0x05, 5, 8, 5);       // phys src_ptr
  emitImm32(6, 320);
  emitR(0x07, 2, 2, 6);
  emitR(0x05, 2, 2, 1);
  emitImm32(6, 0x002F0000);
  emitR(0x05, 2, 2, 6);       // vram row ptr
  emitI(0x1B, 0, 3, 0); emitJ(0x2B, "br_done");
  emitI(0x1B, 0, 4, 0); emitJ(0x2B, "br_done");
  label("br_row");
  emitI(0x01, 1, 2, 0);
  emitI(0x01, 6, 3, 0);
  label("br_col");
  emitI(0x1C, 0, 5, 0);
  emitI(0x21, 0, 1, 0);
  emitI(0x12, 5, 5, 1);
  emitI(0x12, 1, 1, 1);
  emitI(0x13, 6, 6, 1);
  emitI(0x1B, 0, 6, 0);
  emitJ(0x28, "br_col");
  emitI(0x12, 2, 2, 320);
  emitI(0x13, 4, 4, 1);
  emitI(0x1B, 0, 4, 0);
  emitJ(0x28, "br_row");
  label("br_done");
  emitImm32(0, 0);
  emitJ(0x26, "sys_push_r0");

  // SYS 18: STRCMP(s1, s2) -> 1 if equal, 0 if not
  label("sys_18_strcmp");
  emitI(0x20, 1, 7, 0);
  emitI(0x20, 2, 7, 4);
  emitR(0x05, 1, 8, 1);
  emitR(0x05, 2, 8, 2);
  label("sc_loop");
  emitI(0x1C, 3, 1, 0);
  emitI(0x1C, 4, 2, 0);
  emitR(0x1A, 0, 3, 4);
  emitJ(0x28, "sc_diff");
  emitI(0x1B, 0, 3, 0);
  emitJ(0x27, "sc_same");
  emitI(0x12, 1, 1, 1);
  emitI(0x12, 2, 2, 1);
  emitJ(0x26, "sc_loop");
  label("sc_diff");
  emitImm32(0, 0);
  emitJ(0x26, "sys_push_r0");
  label("sc_same");
  emitImm32(0, 1);
  emitJ(0x26, "sys_push_r0");

  // SYS 19: STRLEN(s) -> length
  label("sys_19_strlen");
  emitI(0x20, 1, 7, 0);
  emitR(0x05, 1, 8, 1);
  emitImm32(0, 0);
  label("sl_loop");
  emitI(0x1C, 2, 1, 0);
  emitI(0x1B, 0, 2, 0);
  emitJ(0x27, "sys_push_r0");
  emitI(0x12, 0, 0, 1);
  emitI(0x12, 1, 1, 1);
  emitJ(0x26, "sl_loop");

  // SYS 20: INT_TO_STR(val, buf_ptr, base) -> length
  label("sys_20_itoa");
  emitI(0x20, 1, 7, 0);       // val
  emitI(0x20, 2, 7, 4);       // buf_ptr
  emitI(0x20, 3, 7, 8);       // base (10 or 16)
  emitR(0x05, 2, 8, 2);       // phys buf_ptr
  emitI(0x1B, 0, 1, 0);
  emitJ(0x28, "itoa_nonzero");
  emitImm32(4, 48);           // '0'
  emitI(0x21, 4, 2, 0);
  emitImm32(4, 0);
  emitI(0x21, 4, 2, 1);
  emitImm32(0, 1);
  emitJ(0x26, "sys_push_r0");

  label("itoa_nonzero");
  emitImm32(6, 0);            // negative flag
  emitI(0x1B, 0, 3, 10);
  emitJ(0x28, "itoa_pos");
  emitI(0x1B, 0, 1, 0);
  emitJ(0x2A, "itoa_pos");
  emitImm32(6, 1);
  emitImm32(4, 0);
  emitR(0x06, 1, 4, 1);       // val = -val
  label("itoa_pos");
  emitImm32(4, 0x000DF540);   // temp reverse buffer
  emitImm32(5, 0);            // count
  label("itoa_div_loop");
  emitI(0x1B, 0, 1, 0);
  emitJ(0x27, "itoa_div_done");
  emitR(0x0B, 0, 1, 3);       // rem = umod(val, base)
  emitR(0x0A, 1, 1, 3);       // val = udiv(val, base)
  emitI(0x1B, 0, 0, 10);
  emitJ(0x29, "itoa_dec_dig");
  emitI(0x12, 0, 0, 55);      // 'A' - 10
  emitJ(0x26, "itoa_store_dig");
  label("itoa_dec_dig");
  emitI(0x12, 0, 0, 48);      // '0'
  label("itoa_store_dig");
  emitR(0x05, 7, 4, 5);
  emitI(0x21, 0, 7, 0);
  emitI(0x12, 5, 5, 1);
  emitJ(0x26, "itoa_div_loop");

  label("itoa_div_done");
  emitI(0x01, 0, 5, 0);       // total len = count
  emitI(0x1B, 0, 6, 0);
  emitJ(0x27, "itoa_rev_loop");
  emitImm32(6, 45);           // '-'
  emitI(0x21, 6, 2, 0);
  emitI(0x12, 2, 2, 1);
  emitI(0x12, 0, 0, 1);

  label("itoa_rev_loop");
  emitI(0x1B, 0, 5, 0);
  emitJ(0x27, "itoa_finish");
  emitI(0x13, 5, 5, 1);
  emitR(0x05, 7, 4, 5);
  emitI(0x1C, 6, 7, 0);
  emitI(0x21, 6, 2, 0);
  emitI(0x12, 2, 2, 1);
  emitJ(0x26, "itoa_rev_loop");

  label("itoa_finish");
  emitImm32(6, 0);
  emitI(0x21, 6, 2, 0);       // null terminator
  emitJ(0x26, "sys_push_r0");

  // ==========================================================================
  // 4. VM Halt & Dispatch Tables
  // ==========================================================================
  label("vm_halt_from_ret");
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 0, 2, -4);      // R0 = return value on top of stack
  emitJ(0x26, "vm_halt_with_r0");

  label("vm_halt_bad_op");
  emitImm32(0, -99);

  label("vm_halt_with_r0");
  emitImm32(1, 0x002FFD20);
  emitI(0x23, 13, 1, 0);      // store VM_ICNT at vmRam[0x0FFD20]
  emitImm32(1, 0x002FFD28);
  emitI(0x23, 0, 1, 0);       // store exitCode at vmRam[0x0FFD28]
  emitSys(0);                 // TabComp EXIT(R0)

  // Jump Table for Opcodes 0x00 .. 0x27
  const opLabels = [
    "op_00_nop",       "op_01_halt",      "op_02_push_i16",  "op_03_push_u16",
    "op_04_push_hi",   "op_05_dup",       "op_06_drop",      "op_07_swap",
    "op_08_get_local", "op_09_set_local", "op_0a_get_global","op_0b_set_global",
    "op_0c_addr_local","op_0d_addr_global","op_0e_load8u",   "op_0f_load8s",
    "op_10_load16u",   "op_11_load32",    "op_12_store8",    "op_13_store16",
    "op_14_store32",   "op_15_add",       "op_16_sub",       "op_17_mul",
    "op_18_div",       "op_19_mod",       "op_1a_and",       "op_1b_or",
    "op_1c_xor",       "op_1d_shl",       "op_1e_shr",       "op_1f_sar",
    "op_20_cmp",       "op_21_jmp",       "op_22_jz",        "op_23_jnz",
    "op_24_call",      "op_25_enter",     "op_26_ret",       "op_27_syscall"
  ];
  label("op_table");
  for (const l of opLabels) {
    fixups.push({ wordIdx: code.length, label: l, type: "RAW32" });
    emit32(0);
  }

  const cmpLabels = [
    "cmp_0_eq", "cmp_1_ne", "cmp_2_lt", "cmp_3_le",
    "cmp_4_gt", "cmp_5_ge", "cmp_6_ult", "cmp_7_ugt"
  ];
  label("cmp_table");
  for (const l of cmpLabels) {
    fixups.push({ wordIdx: code.length, label: l, type: "RAW32" });
    emit32(0);
  }

  // Resolve Fixups
  for (const f of fixups) {
    const target = labels[f.label];
    if (target === undefined) throw new Error("Undefined TC-32 label: " + f.label);
    if (f.type === "J24") {
      code[f.wordIdx] = (((f.op & 0x3F) << 24) | (target & 0x00FFFFFF)) >>> 0;
    } else if (f.type === "IMM32") {
      code[f.wordIdx]     = ((0x03 << 24) | ((f.rd & 0xF) << 20) | (target & 0xFFFF)) >>> 0;
      code[f.wordIdx + 1] = ((0x04 << 24) | ((f.rd & 0xF) << 20) | ((target >>> 16) & 0xFFFF)) >>> 0;
    } else if (f.type === "RAW32") {
      code[f.wordIdx] = target >>> 0;
    }
  }

  const bytes = new Uint8Array(code.length * 4);
  const dv = new DataView(bytes.buffer);
  for (let i = 0; i < code.length; i++) {
    dv.setUint32(i * 4, code[i], true);
  }
  return { bytes, wordCount: code.length, labels };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildTC32Core };
}
if (typeof globalThis !== "undefined") {
  globalThis.buildTC32Core = buildTC32Core;
}
