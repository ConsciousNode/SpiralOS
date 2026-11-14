/**
 * SpiralOS 1.1 — TabComp Native Core (TC-32 Machine Code Generator & Assembler)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Emits a genuine native TC-32 machine code binary that runs directly on
 * TabCompCPU (interpreter and Wasm JIT), plus its complete symbolic TC-32
 * assembly source listing (/src/core_tc32.asm) for in-OS self-assembly.
 */

"use strict";

// from fonts/cnsw-serif-8x16.hex:1-96
const TC32_FONT_SERIF_8X16_HEX =
  "0000000000000000000000000000000000303030303010100000303000000000" +
  "0066664444000000000000000000000000004444fe4444fe4444000000000000" +
  "00107c9290781412927c1000000000000000c4c8101020204c8c000000000000" +
  "0038444438508a848c7200000000000000303040400000000000000000000000" +
  "000c1020204040402020100c0000000000601008080404040808106000000000" +
  "0000001054387c3854100000000000000000000010107c101000000000000000" +
  "00000000000000000000303010200000000000000000007c0000000000000000" +
  "0000000000000000000030300000000000040408081010202040408000000000" +
  "003844868a92a2c2828244380000000000103050101010101010107c00000000" +
  "0078848404081020408084fc0000000000788404043804040484847800000000" +
  "00081828488888fc0808083c0000000000fc848080f804040484847800000000" +
  "0038448080f88484848444380000000000fc8404080810102020203800000000" +
  "007884844830304884848478000000000078848484847c040408483000000000" +
  "0000000000303000000030300000000000000000003030000000303010200000" +
  "0000000810204020100800000000000000000000007c00007c00000000000000" +
  "0000004020100810204000000000000000788484040810100000101000000000" +
  "00788484bca4a4bc8080403c0000000000382844444482fe828282c600000000" +
  "00f8444444784442424244f800000000003c4484808080808084443800000000" +
  "00f8444242424242424244f80000000000fc444050705040404044fc00000000" +
  "00fc444050705040404040e000000000003c448480809c848484443800000000" +
  "00c6444444447c44444444c600000000007c1010101010101010107c00000000" +
  "003e080808080808888888700000000000c6485060406050484444c600000000" +
  "00e0404040404040404044fc0000000000c6ee5454544444444444c600000000" +
  "00c66454544c4c44444444c60000000000384482828282828282443800000000" +
  "00f844444444f840404040e0000000000038448282828282928a463a00000000" +
  "00f844444444f850484444c600000000007c848040380404048484f800000000" +
  "00fe921010101010101010380000000000c64444444444444444443800000000" +
  "00c6444444444428282810100000000000c64444445454545428282800000000" +
  "00c6442828101010282844c60000000000c64428281010101010103800000000" +
  "00fc840808102020408084fc0000000000382020202020202020203800000000" +
  "0080804040202010100808040000000000380808080808080808083800000000" +
  "00102844000000000000000000000000000000000000000000000000fe000000" +
  "0020100000000000000000000000000000000000007884047c84847c00000000" +
  "00c0404040784442424244f80000000000000000007884808080847800000000" +
  "000c0404043c44848484443c000000000000000000788484fc80847800000000" +
  "001c2420207c2020202020700000000000000000007c888870807c8484443800" +
  "00c0404040586444444444cc0000000000001000003010101010103800000000" +
  "0000080000180808080808088888700000c04040404c5060504848cc00000000" +
  "002060202020202020202070000000000000000000d45454545454d600000000" +
  "0000000000d84444444444cc0000000000000000007884848484847800000000" +
  "0000000000f84444444444784040e00000000000007c88888888887808081c00" +
  "0000000000dc4440404040e00000000000000000007c8440380484f800000000" +
  "00000020207c202020202418000000000000000000cc444444444c3600000000" +
  "0000000000cc484848303030000000000000000000c644545454282800000000" +
  "0000000000cc4830303048cc000000000000000000cc4848303010102040c000" +
  "0000000000fc8810204088fc0000000000182020204040202020201800000000" +
  "0010101010101010101010100000000000300808080404080808083000000000" +
  "0000006498000000000000000000000000000038549292925438000000000000";

const TC32_R_MNEM = {
  0x05: "ADD",  0x06: "SUB",  0x07: "MUL",  0x08: "DIV",
  0x09: "MOD",  0x0A: "UDIV", 0x0B: "UMOD", 0x0C: "AND",
  0x0D: "OR",   0x0E: "XOR",  0x0F: "SHL",  0x10: "SHR",
  0x11: "SAR",  0x1A: "CMP"
};

const TC32_I_MNEM = {
  0x01: "MOV",   0x03: "LUI16", 0x04: "LHI",   0x12: "ADDI",
  0x13: "SUBI",  0x14: "ANDI",  0x17: "SHLI",  0x18: "SHRI",
  0x19: "SARI",  0x1B: "CMPI",  0x1C: "LDBU",  0x1D: "LDBS",
  0x1E: "LDHU",  0x20: "LDW",   0x21: "STB",   0x22: "STH",
  0x23: "STW",   0x2E: "RET",   0x35: "JR",    0x36: "SETCC"
};

const TC32_J_MNEM = {
  0x26: "JMP", 0x27: "JEQ", 0x28: "JNE", 0x29: "JLT",
  0x2A: "JGE", 0x2B: "JLE", 0x2C: "JGT", 0x2D: "CALL"
};

function buildTC32Core(customBanner = "SpiralOS 1.2") {
  const code = [];
  const labels = {};
  const fixups = []; // { wordIdx, label, type: 'J24' | 'IMM32' | 'RAW32' }
  const asmLines = ["; SpiralOS 1.1 — TabComp TC-32 Native Core Assembly (/src/core_tc32.asm)"];

  function pcBytes() {
    return code.length * 4;
  }

  function label(name) {
    labels[name] = pcBytes();
    asmLines.push(name + ":");
  }

  function emit32(w) {
    code.push(w >>> 0);
  }

  function emitR(op, rd, ra, rb) {
    emit32(((op & 0x3F) << 24) | ((rd & 0xF) << 20) | ((ra & 0xF) << 16) | ((rb & 0xF) << 12));
    asmLines.push(`  ${TC32_R_MNEM[op]} R${rd}, R${ra}, R${rb}`);
  }

  function emitI(op, rd, ra, imm16, suppressAsm = false) {
    emit32(((op & 0x3F) << 24) | ((rd & 0xF) << 20) | ((ra & 0xF) << 16) | (imm16 & 0xFFFF));
    if (!suppressAsm) {
      asmLines.push(`  ${TC32_I_MNEM[op]} R${rd}, R${ra}, ${imm16 & 0xFFFF}`);
    }
  }

  function emitJ(op, targetLabel) {
    fixups.push({ wordIdx: code.length, label: targetLabel, type: "J24", op });
    emit32((op & 0x3F) << 24);
    asmLines.push(`  ${TC32_J_MNEM[op]} ${targetLabel}`);
  }

  function emitSys(num) {
    emit32((0x2F << 24) | (num & 0xFFFF));
    asmLines.push(`  SYS ${num & 0xFFFF}`);
  }

  function emitImm32(rd, val) {
    const u = val >>> 0;
    const lo = u & 0xFFFF;
    const hi = (u >>> 16) & 0xFFFF;
    emitI(0x03, rd, 0, lo);
    if (hi !== 0) {
      emitI(0x04, rd, 0, hi);
    }
  }

  function emitAddrLabel(rd, targetLabel) {
    fixups.push({ wordIdx: code.length, label: targetLabel, type: "IMM32", rd });
    emitI(0x03, rd, 0, 0, true);
    emitI(0x04, rd, 0, 0, true);
    asmLines.push(`  LA R${rd}, ${targetLabel}`);
  }

  // ==========================================================================
  // 1. Core Boot & VM State Initialization
  // ==========================================================================
  label("boot_entry");
  emitImm32(8, 0x00200000);   // R8 = VM_BASE = 0x00200000
  emitImm32(10, 0x00100000);  // R10 = VM_SP = 0x00100000
  emitImm32(11, 0x00100000);  // R11 = VM_FP = 0x00100000
  emitImm32(12, 0x00170000);  // R12 = VM_CSP = 0x00170000
  emitImm32(13, 0);           // R13 = VM_ICNT = 0

  emitImm32(1, 0x002FFD1C);
  emitImm32(2, 1);
  emitI(0x23, 2, 1, 0);

  // Detect StudioNet MMIO presence at 0x000FFD40 ('SNET' = 0x534E4554) -> store at vmRam[0x0FFD30]
  emitImm32(1, 0x000FFD40);
  emitI(0x20, 2, 1, 0);
  emitImm32(3, 0x534E4554);
  emitImm32(4, 0);
  emitR(0x1A, 0, 2, 3);
  emitJ(0x28, "snet_store_flag");
  emitImm32(4, 1);
  label("snet_store_flag");
  emitImm32(1, 0x002FFD30);
  emitI(0x23, 4, 1, 0);

  // Copy 16-byte boot_banner to vmRam[0x0FFD80] (0x002FFD80)
  emitAddrLabel(1, "boot_banner");
  emitImm32(2, 0x002FFD80);
  emitI(0x20, 3, 1, 0);  emitI(0x23, 3, 2, 0);
  emitI(0x20, 3, 1, 4);  emitI(0x23, 3, 2, 4);
  emitI(0x20, 3, 1, 8);  emitI(0x23, 3, 2, 8);
  emitI(0x20, 3, 1, 12); emitI(0x23, 3, 2, 12);

  // Copy initial 768-byte 8x8 font from 0x0EF000 to vmRam[0x0EF000] (0x002EF000) and vmRam[0x091800] (0x00291800)
  emitImm32(1, 0x000EF000);
  emitImm32(2, 0x002EF000);
  emitImm32(5, 0x00291800);
  emitImm32(3, 768);
  label("copy_font_loop");
  emitI(0x1C, 4, 1, 0);
  emitI(0x21, 4, 2, 0);
  emitI(0x21, 4, 5, 0);
  emitI(0x12, 1, 1, 1);
  emitI(0x12, 2, 2, 1);
  emitI(0x12, 5, 5, 1);
  emitI(0x13, 3, 3, 1);
  emitI(0x1B, 0, 3, 0);
  emitJ(0x28, "copy_font_loop");

  // Copy 1,536-byte CNSW Serif 8x16 font bank to vmRam[0x091000] (0x00291000)
  emitAddrLabel(1, "embedded_font_serif");
  emitImm32(2, 0x00291000);
  emitImm32(3, 1536);
  label("copy_serif_loop");
  emitI(0x20, 4, 1, 0);
  emitI(0x23, 4, 2, 0);
  emitI(0x12, 1, 1, 4);
  emitI(0x12, 2, 2, 4);
  emitI(0x13, 3, 3, 4);
  emitI(0x1B, 0, 3, 0);
  emitJ(0x28, "copy_serif_loop");

  // Copy initial 768-byte palette from 0x0FFA00 to vmRam[0x0FFA00] (0x002FFA00)
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
  emitR(0x05, 1, 8, 12);
  emitImm32(2, -1);
  emitI(0x23, 2, 1, 0);
  emitI(0x23, 11, 1, 4);
  emitI(0x12, 12, 12, 8);

  // Check SPIR magic (0x52495053) at vmRam[0x000000]
  emitI(0x20, 1, 8, 0);
  emitImm32(2, 0x52495053);
  emitR(0x1A, 0, 1, 2);
  emitJ(0x27, "has_spir_hdr");
  emitImm32(9, 0);
  emitJ(0x26, "init_scheduler");
  label("has_spir_hdr");
  emitI(0x20, 9, 8, 8);

  // Initialize Preemptive Task Table at 0x002FFE00..0x002FFF1F
  label("init_scheduler");
  emitImm32(1, 0x002FFE00);
  emitImm32(2, 0);
  emitImm32(3, 72);
  label("clear_tcb_loop");
  emitI(0x23, 2, 1, 0);
  emitI(0x12, 1, 1, 4);
  emitI(0x13, 3, 3, 1);
  emitI(0x1B, 0, 3, 0);
  emitJ(0x28, "clear_tcb_loop");

  emitImm32(1, 0x002FFE00);
  emitImm32(2, 1);
  emitI(0x23, 2, 1, 0);
  emitI(0x23, 9, 1, 4);
  emitI(0x23, 10, 1, 8);
  emitI(0x23, 11, 1, 12);
  emitI(0x23, 12, 1, 16);
  emitImm32(1, 0x002FFF00);
  emitImm32(2, 0);
  emitI(0x23, 2, 1, 0);
  emitImm32(2, 1);
  emitI(0x23, 2, 1, 4);
  emitImm32(2, 256);
  emitI(0x23, 2, 1, 20);

  // ==========================================================================
  // 2. Main Spiral VM Fetch-Decode-Execute Loop (with Timer Preemption)
  // ==========================================================================
  label("vm_loop");
  emitI(0x1B, 0, 9, 0);
  emitJ(0x29, "vm_task_exit_or_halt");

  emitImm32(1, 0x002FFF00);
  emitI(0x20, 2, 1, 20);
  emitI(0x13, 2, 2, 1);
  emitI(0x23, 2, 1, 20);
  emitI(0x1B, 0, 2, 0);
  emitJ(0x2C, "vm_no_preempt");

  emitImm32(2, 256);
  emitI(0x23, 2, 1, 20);
  emitI(0x20, 3, 1, 8);
  emitI(0x12, 3, 3, 1);
  emitI(0x23, 3, 1, 8);

  emitI(0x20, 3, 1, 4);
  emitI(0x1B, 0, 3, 1);
  emitJ(0x2B, "vm_no_preempt");

  emitI(0x20, 2, 1, 0);
  emitI(0x17, 3, 2, 5);
  emitImm32(4, 0x002FFE00);
  emitR(0x05, 4, 4, 3);
  emitI(0x23, 9, 4, 4);
  emitI(0x23, 10, 4, 8);
  emitI(0x23, 11, 4, 12);
  emitI(0x23, 12, 4, 16);

  label("sched_pick_next");
  emitImm32(5, 8);
  label("sched_scan_loop");
  emitI(0x12, 2, 2, 1);
  emitI(0x14, 2, 2, 7);
  emitI(0x17, 3, 2, 5);
  emitImm32(4, 0x002FFE00);
  emitR(0x05, 4, 4, 3);
  emitI(0x20, 6, 4, 0);
  emitI(0x1B, 0, 6, 1);
  emitJ(0x27, "sched_found");
  emitI(0x13, 5, 5, 1);
  emitI(0x1B, 0, 5, 0);
  emitJ(0x28, "sched_scan_loop");
  emitJ(0x26, "vm_no_preempt");

  label("sched_found");
  emitImm32(1, 0x002FFF00);
  emitI(0x23, 2, 1, 0);
  emitI(0x20, 6, 1, 16);
  emitI(0x12, 6, 6, 1);
  emitI(0x23, 6, 1, 16);
  emitI(0x20, 6, 4, 20);
  emitI(0x12, 6, 6, 1);
  emitI(0x23, 6, 4, 20);
  emitI(0x20, 9, 4, 4);
  emitI(0x20, 10, 4, 8);
  emitI(0x20, 11, 4, 12);
  emitI(0x20, 12, 4, 16);

  label("vm_no_preempt");
  emitR(0x05, 1, 8, 9);
  emitI(0x20, 4, 1, 0);
  emitI(0x12, 9, 9, 4);
  emitI(0x12, 13, 13, 1);

  emitI(0x18, 5, 4, 24);
  emitI(0x1B, 0, 5, 0x27);
  emitJ(0x2C, "vm_halt_bad_op");
  emitAddrLabel(1, "op_table");
  emitI(0x17, 2, 5, 2);
  emitR(0x05, 1, 1, 2);
  emitI(0x20, 1, 1, 0);
  emitI(0x35, 1, 0, 0);

  // --------------------------------------------------------------------------
  // Opcode Handlers
  // --------------------------------------------------------------------------
  label("op_00_nop");
  emitJ(0x26, "vm_loop");

  label("op_01_halt");
  emitI(0x13, 10, 10, 4);
  emitR(0x05, 1, 8, 10);
  emitI(0x20, 0, 1, 0);
  emitJ(0x26, "vm_halt_with_r0");

  label("op_02_push_i16");
  emitI(0x17, 1, 4, 16);
  emitI(0x19, 1, 1, 16);
  emitR(0x05, 2, 8, 10);
  emitI(0x23, 1, 2, 0);
  emitI(0x12, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  label("op_03_push_u16");
  emitI(0x14, 1, 4, 0xFFFF);
  emitR(0x05, 2, 8, 10);
  emitI(0x23, 1, 2, 0);
  emitI(0x12, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  label("op_04_push_hi");
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);
  emitI(0x14, 1, 1, 0xFFFF);
  emitI(0x17, 3, 4, 16);
  emitR(0x0D, 1, 1, 3);
  emitI(0x23, 1, 2, -4);
  emitJ(0x26, "vm_loop");

  label("op_05_dup");
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);
  emitI(0x23, 1, 2, 0);
  emitI(0x12, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  label("op_06_drop");
  emitI(0x13, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  label("op_07_swap");
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);
  emitI(0x20, 3, 2, -8);
  emitI(0x23, 3, 2, -4);
  emitI(0x23, 1, 2, -8);
  emitJ(0x26, "vm_loop");

  label("op_08_get_local");
  emitI(0x14, 1, 4, 0xFFFF);
  emitI(0x17, 1, 1, 2);
  emitR(0x05, 1, 11, 1);
  emitR(0x05, 1, 8, 1);
  emitI(0x20, 1, 1, 0);
  emitR(0x05, 2, 8, 10);
  emitI(0x23, 1, 2, 0);
  emitI(0x12, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  label("op_09_set_local");
  emitI(0x13, 10, 10, 4);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 3, 2, 0);
  emitI(0x14, 1, 4, 0xFFFF);
  emitI(0x17, 1, 1, 2);
  emitR(0x05, 1, 11, 1);
  emitR(0x05, 1, 8, 1);
  emitI(0x23, 3, 1, 0);
  emitJ(0x26, "vm_loop");

  label("op_0a_get_global");
  emitI(0x14, 1, 4, 0xFFFF);
  emitI(0x17, 1, 1, 2);
  emitImm32(2, 0x00220000);
  emitR(0x05, 1, 2, 1);
  emitI(0x20, 1, 1, 0);
  emitR(0x05, 2, 8, 10);
  emitI(0x23, 1, 2, 0);
  emitI(0x12, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  label("op_0b_set_global");
  emitI(0x13, 10, 10, 4);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 3, 2, 0);
  emitI(0x14, 1, 4, 0xFFFF);
  emitI(0x17, 1, 1, 2);
  emitImm32(2, 0x00220000);
  emitR(0x05, 1, 2, 1);
  emitI(0x23, 3, 1, 0);
  emitJ(0x26, "vm_loop");

  label("op_0c_addr_local");
  emitI(0x14, 1, 4, 0xFFFF);
  emitI(0x17, 1, 1, 2);
  emitR(0x05, 1, 11, 1);
  emitR(0x05, 2, 8, 10);
  emitI(0x23, 1, 2, 0);
  emitI(0x12, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  label("op_0d_addr_global");
  emitI(0x14, 1, 4, 0xFFFF);
  emitI(0x17, 1, 1, 2);
  emitImm32(2, 0x00020000);
  emitR(0x05, 1, 2, 1);
  emitR(0x05, 2, 8, 10);
  emitI(0x23, 1, 2, 0);
  emitI(0x12, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  label("op_0e_load8u");
  emitI(0x17, 3, 4, 16);
  emitI(0x19, 3, 3, 16);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);
  emitR(0x05, 1, 1, 3);
  emitImm32(5, 0x003FFFFF);
  emitR(0x0C, 1, 1, 5);
  emitR(0x05, 1, 8, 1);
  emitI(0x1C, 1, 1, 0);
  emitI(0x23, 1, 2, -4);
  emitJ(0x26, "vm_loop");

  label("op_0f_load8s");
  emitI(0x17, 3, 4, 16);
  emitI(0x19, 3, 3, 16);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);
  emitR(0x05, 1, 1, 3);
  emitImm32(5, 0x003FFFFF);
  emitR(0x0C, 1, 1, 5);
  emitR(0x05, 1, 8, 1);
  emitI(0x1D, 1, 1, 0);
  emitI(0x23, 1, 2, -4);
  emitJ(0x26, "vm_loop");

  label("op_10_load16u");
  emitI(0x17, 3, 4, 16);
  emitI(0x19, 3, 3, 16);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);
  emitR(0x05, 1, 1, 3);
  emitImm32(5, 0x003FFFFF);
  emitR(0x0C, 1, 1, 5);
  emitR(0x05, 1, 8, 1);
  emitI(0x1E, 1, 1, 0);
  emitI(0x23, 1, 2, -4);
  emitJ(0x26, "vm_loop");

  label("op_11_load32");
  emitI(0x17, 3, 4, 16);
  emitI(0x19, 3, 3, 16);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);
  emitR(0x05, 1, 1, 3);
  emitImm32(5, 0x003FFFFF);
  emitR(0x0C, 1, 1, 5);
  emitR(0x05, 1, 8, 1);
  emitI(0x20, 1, 1, 0);
  emitI(0x23, 1, 2, -4);
  emitJ(0x26, "vm_loop");

  label("op_12_store8");
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
  emitI(0x21, 5, 1, 0);
  emitJ(0x26, "vm_loop");

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
  emitI(0x22, 5, 1, 0);
  emitJ(0x26, "vm_loop");

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
  emitI(0x23, 5, 1, 0);
  emitJ(0x26, "vm_loop");

  function emitBinOp(tcOp) {
    emitI(0x13, 10, 10, 4);
    emitR(0x05, 2, 8, 10);
    emitI(0x20, 1, 2, -4);
    emitI(0x20, 3, 2, 0);
    emitR(tcOp, 1, 1, 3);
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

  label("op_20_cmp");
  emitI(0x13, 10, 10, 4);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);
  emitI(0x20, 3, 2, 0);
  emitI(0x14, 5, 4, 0x07);
  emitAddrLabel(6, "cmp_table");
  emitI(0x17, 5, 5, 2);
  emitR(0x05, 6, 6, 5);
  emitI(0x20, 6, 6, 0);
  emitR(0x1A, 0, 1, 3);
  emitI(0x35, 6, 0, 0);

  label("cmp_0_eq"); emitI(0x36, 1, 0, 0); emitI(0x23, 1, 2, -4); emitJ(0x26, "vm_loop");
  label("cmp_1_ne"); emitI(0x36, 1, 0, 1); emitI(0x23, 1, 2, -4); emitJ(0x26, "vm_loop");
  label("cmp_2_lt"); emitI(0x36, 1, 0, 2); emitI(0x23, 1, 2, -4); emitJ(0x26, "vm_loop");
  label("cmp_3_le"); emitI(0x36, 1, 0, 4); emitI(0x23, 1, 2, -4); emitJ(0x26, "vm_loop");
  label("cmp_4_gt"); emitI(0x36, 1, 0, 5); emitI(0x23, 1, 2, -4); emitJ(0x26, "vm_loop");
  label("cmp_5_ge"); emitI(0x36, 1, 0, 3); emitI(0x23, 1, 2, -4); emitJ(0x26, "vm_loop");
  label("cmp_6_ult"); emitI(0x36, 1, 0, 6); emitI(0x23, 1, 2, -4); emitJ(0x26, "vm_loop");
  label("cmp_7_ugt"); emitI(0x36, 1, 0, 9); emitI(0x23, 1, 2, -4); emitJ(0x26, "vm_loop");

  label("op_21_jmp");
  emitImm32(1, 0x00FFFFFF);
  emitR(0x0C, 9, 4, 1);
  emitJ(0x26, "vm_loop");

  label("op_22_jz");
  emitI(0x13, 10, 10, 4);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, 0);
  emitI(0x1B, 0, 1, 0);
  emitJ(0x28, "vm_loop");
  emitImm32(1, 0x00FFFFFF);
  emitR(0x0C, 9, 4, 1);
  emitJ(0x26, "vm_loop");

  label("op_23_jnz");
  emitI(0x13, 10, 10, 4);
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, 0);
  emitI(0x1B, 0, 1, 0);
  emitJ(0x27, "vm_loop");
  emitImm32(1, 0x00FFFFFF);
  emitR(0x0C, 9, 4, 1);
  emitJ(0x26, "vm_loop");

  label("op_24_call");
  emitR(0x05, 1, 8, 12);
  emitI(0x23, 9, 1, 0);
  emitI(0x23, 11, 1, 4);
  emitI(0x12, 12, 12, 8);
  emitImm32(1, 0x00FFFFFF);
  emitR(0x0C, 9, 4, 1);
  emitJ(0x26, "vm_loop");

  label("op_25_enter");
  emitI(0x18, 1, 4, 16);
  emitI(0x14, 1, 1, 0xFF);
  emitI(0x17, 1, 1, 2);
  emitR(0x06, 11, 10, 1);
  emitI(0x14, 2, 4, 0xFFFF);
  emitI(0x17, 2, 2, 2);
  emitR(0x05, 10, 11, 2);
  emitJ(0x26, "vm_loop");

  label("op_26_ret");
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 1, 2, -4);
  emitI(0x01, 10, 11, 0);
  emitR(0x05, 2, 8, 10);
  emitI(0x23, 1, 2, 0);
  emitI(0x12, 10, 10, 4);
  emitI(0x13, 12, 12, 8);
  emitR(0x05, 2, 8, 12);
  emitI(0x20, 9, 2, 0);
  emitI(0x20, 11, 2, 4);
  emitJ(0x26, "vm_loop");

  // ==========================================================================
  // 3. System Call Dispatcher (0x27: SYSCALL [nargs:8][sysnum:16])
  // ==========================================================================
  label("op_27_syscall");
  emitI(0x18, 1, 4, 16);
  emitI(0x14, 1, 1, 0xFF);
  emitI(0x17, 1, 1, 2);
  emitR(0x06, 10, 10, 1);
  emitR(0x05, 7, 8, 10);
  emitI(0x14, 6, 4, 0xFFFF);

  emitImm32(1, 0x002FFD20);
  emitI(0x23, 13, 1, 0);

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
  emitI(0x1B, 0, 6, 21); emitJ(0x27, "sys_21_task_spawn");
  emitI(0x1B, 0, 6, 22); emitJ(0x27, "sys_22_date");

  emitImm32(0, -1);
  emitJ(0x26, "sys_push_r0");

  label("sys_push_r0");
  emitR(0x05, 2, 8, 10);
  emitI(0x23, 0, 2, 0);
  emitI(0x12, 10, 10, 4);
  emitJ(0x26, "vm_loop");

  label("sys_00_exit");
  emitI(0x20, 0, 7, 0);
  emitJ(0x26, "vm_halt_with_r0");

  label("sys_01_yield");
  emitImm32(1, 0x002F0000);
  emitImm32(2, 0x000F0000);
  emitImm32(3, 64768);
  label("yield_copy_loop");
  emitI(0x20, 4, 1, 0);
  emitI(0x23, 4, 2, 0);
  emitI(0x12, 1, 1, 4);
  emitI(0x12, 2, 2, 4);
  emitI(0x13, 3, 3, 4);
  emitI(0x1B, 0, 3, 0);
  emitJ(0x28, "yield_copy_loop");
  emitImm32(1, 0x002FFD04);
  emitI(0x20, 2, 1, 0);
  emitI(0x12, 2, 2, 1);
  emitI(0x23, 2, 1, 0);
  emitSys(10);
  emitImm32(1, 0x002FFF00);
  emitImm32(2, 1);
  emitI(0x23, 2, 1, 20);
  emitImm32(0, 0);
  emitJ(0x26, "sys_push_r0");

  label("sys_02_time");
  emitImm32(1, 0x002FFD04);
  emitI(0x20, 0, 1, 0);
  emitI(0x17, 0, 0, 4);
  emitImm32(1, 0x002FFF08);
  emitI(0x20, 2, 1, 0);
  emitI(0x17, 2, 2, 3);
  emitR(0x05, 0, 0, 2);
  emitI(0x18, 3, 13, 9);
  emitR(0x05, 0, 0, 3);
  emitImm32(1, 0x002FFD24);
  emitI(0x23, 0, 1, 0);
  emitJ(0x26, "sys_push_r0");

  label("sys_03_key");
  emitImm32(0, 0x000DF400);
  emitImm32(1, 0x000DF404);
  emitSys(27);
  emitJ(0x26, "sys_push_r0");

  label("sys_04_mouse");
  emitI(0x20, 1, 7, 0);
  emitI(0x1B, 0, 1, 0);
  emitJ(0x27, "mouse_no_ptr");
  emitR(0x05, 0, 8, 1);
  emitJ(0x26, "mouse_do_sys");
  label("mouse_no_ptr");
  emitImm32(0, 0x002FFD08);
  label("mouse_do_sys");
  emitSys(31);
  emitImm32(1, 0x000FFD08);
  emitImm32(2, 0x002FFD08);
  emitI(0x20, 3, 1, 0); emitI(0x23, 3, 2, 0);
  emitI(0x20, 3, 1, 4); emitI(0x23, 3, 2, 4);
  emitI(0x20, 3, 1, 8); emitI(0x23, 3, 2, 8);
  emitJ(0x26, "sys_push_r0");

  label("sys_05_fill_rect");
  emitI(0x20, 1, 7, 0);
  emitI(0x20, 2, 7, 4);
  emitI(0x20, 3, 7, 8);
  emitI(0x20, 4, 7, 12);
  emitI(0x20, 5, 7, 16);
  emitI(0x1B, 0, 1, 0);
  emitJ(0x2A, "fr_x_ok");
  emitR(0x05, 3, 3, 1);
  emitImm32(1, 0);
  label("fr_x_ok");
  emitI(0x1B, 0, 2, 0);
  emitJ(0x2A, "fr_y_ok");
  emitR(0x05, 4, 4, 2);
  emitImm32(2, 0);
  label("fr_y_ok");
  emitR(0x05, 6, 1, 3);
  emitI(0x1B, 0, 6, 320);
  emitJ(0x2B, "fr_w_ok");
  emitImm32(6, 320);
  emitR(0x06, 3, 6, 1);
  label("fr_w_ok");
  emitR(0x05, 6, 2, 4);
  emitI(0x1B, 0, 6, 200);
  emitJ(0x2B, "fr_h_ok");
  emitImm32(6, 200);
  emitR(0x06, 4, 6, 2);
  label("fr_h_ok");
  emitI(0x1B, 0, 3, 0); emitJ(0x2B, "fr_done");
  emitI(0x1B, 0, 4, 0); emitJ(0x2B, "fr_done");

  emitImm32(6, 320);
  emitR(0x07, 2, 2, 6);
  emitR(0x05, 2, 2, 1);
  emitImm32(6, 0x002F0000);
  emitR(0x05, 2, 2, 6);

  label("fr_row_loop");
  emitI(0x01, 1, 2, 0);
  emitI(0x01, 6, 3, 0);
  label("fr_col_loop");
  emitI(0x21, 5, 1, 0);
  emitI(0x12, 1, 1, 1);
  emitI(0x13, 6, 6, 1);
  emitI(0x1B, 0, 6, 0);
  emitJ(0x28, "fr_col_loop");
  emitI(0x12, 2, 2, 320);
  emitI(0x13, 4, 4, 1);
  emitI(0x1B, 0, 4, 0);
  emitJ(0x28, "fr_row_loop");

  label("fr_done");
  emitImm32(0, 0);
  emitJ(0x26, "sys_push_r0");

  label("sub_draw_char");
  emitI(0x14, 3, 3, 0xFF);
  emitI(0x13, 3, 3, 32);
  emitI(0x1B, 0, 3, 0); emitJ(0x29, "dc_ret");
  emitI(0x1B, 0, 3, 95); emitJ(0x2C, "dc_ret");
  emitI(0x1B, 0, 1, 0); emitJ(0x29, "dc_ret");
  emitI(0x1B, 0, 1, 312); emitJ(0x2C, "dc_ret");
  emitI(0x1B, 0, 2, 0); emitJ(0x29, "dc_ret");

  emitI(0x1B, 0, 6, 0);
  emitJ(0x28, "dc_serif");
  emitI(0x1B, 0, 2, 192); emitJ(0x2C, "dc_ret");
  emitI(0x17, 3, 3, 3);
  emitImm32(0, 0x002EF000);
  emitR(0x05, 3, 3, 0);
  emitImm32(6, 8);
  emitJ(0x26, "dc_vram");

  label("dc_serif");
  emitI(0x1B, 0, 2, 184); emitJ(0x2C, "dc_ret");
  emitI(0x17, 3, 3, 4);
  emitImm32(0, 0x00291000);
  emitR(0x05, 3, 3, 0);
  emitImm32(6, 16);

  label("dc_vram");
  emitImm32(0, 320);
  emitR(0x07, 2, 2, 0);
  emitR(0x05, 2, 2, 1);
  emitImm32(0, 0x002F0000);
  emitR(0x05, 2, 2, 0);

  label("dc_row_loop");
  emitI(0x1C, 0, 3, 0);
  emitI(0x12, 3, 3, 1);
  emitImm32(1, 128);
  label("dc_bit_loop");
  emitR(0x0C, 7, 0, 1);
  emitI(0x1B, 0, 7, 0);
  emitJ(0x27, "dc_bit_off");
  emitI(0x21, 4, 2, 0);
  emitJ(0x26, "dc_bit_next");
  label("dc_bit_off");
  emitI(0x1B, 0, 5, 0);
  emitJ(0x29, "dc_bit_next");
  emitI(0x21, 5, 2, 0);
  label("dc_bit_next");
  emitI(0x12, 2, 2, 1);
  emitI(0x18, 1, 1, 1);
  emitI(0x1B, 0, 1, 0);
  emitJ(0x28, "dc_bit_loop");

  emitI(0x12, 2, 2, 312);
  emitI(0x13, 6, 6, 1);
  emitI(0x1B, 0, 6, 0);
  emitJ(0x28, "dc_row_loop");

  label("dc_ret");
  emitI(0x2E, 0, 0, 0);

  label("sys_06_draw_char");
  emitI(0x18, 6, 4, 16);
  emitI(0x14, 6, 6, 0xFF);
  emitI(0x20, 3, 7, 8);
  emitI(0x18, 0, 3, 8);
  emitI(0x14, 0, 0, 1);
  emitI(0x1B, 0, 6, 6);
  emitJ(0x29, "sys06_font_ready");
  emitI(0x20, 0, 7, 20);
  label("sys06_font_ready");
  emitI(0x01, 6, 0, 0);
  emitI(0x20, 1, 7, 0);
  emitI(0x20, 2, 7, 4);
  emitI(0x20, 4, 7, 12);
  emitI(0x20, 5, 7, 16);
  emitJ(0x2D, "sub_draw_char");
  emitImm32(0, 0);
  emitJ(0x26, "sys_push_r0");

  label("sys_07_draw_str");
  emitImm32(6, 0x000DF500);
  emitI(0x18, 0, 4, 16);
  emitI(0x14, 0, 0, 0xFF);
  emitImm32(1, 0);
  emitI(0x1B, 0, 0, 6);
  emitJ(0x29, "sys07_font_ready");
  emitI(0x20, 1, 7, 20);
  label("sys07_font_ready");
  emitI(0x23, 1, 6, 20);
  emitI(0x20, 1, 7, 0); emitI(0x23, 1, 6, 0);
  emitI(0x20, 1, 7, 4); emitI(0x23, 1, 6, 4);
  emitI(0x20, 1, 7, 8);
  emitR(0x05, 1, 8, 1); emitI(0x23, 1, 6, 8);
  emitI(0x20, 1, 7, 12); emitI(0x23, 1, 6, 12);
  emitI(0x20, 1, 7, 16); emitI(0x23, 1, 6, 16);

  label("ds_loop");
  emitImm32(6, 0x000DF500);
  emitI(0x20, 1, 6, 8);
  emitI(0x1C, 3, 1, 0);
  emitI(0x1B, 0, 3, 0);
  emitJ(0x27, "ds_done");
  emitI(0x12, 1, 1, 1);
  emitI(0x23, 1, 6, 8);
  emitI(0x20, 1, 6, 0);
  emitI(0x20, 2, 6, 4);
  emitI(0x20, 4, 6, 12);
  emitI(0x20, 5, 6, 16);
  emitI(0x20, 6, 6, 20);
  emitJ(0x2D, "sub_draw_char");
  emitImm32(6, 0x000DF500);
  emitI(0x20, 1, 6, 0);
  emitI(0x12, 1, 1, 8);
  emitI(0x23, 1, 6, 0);
  emitJ(0x26, "ds_loop");
  label("ds_done");
  emitImm32(0, 0);
  emitJ(0x26, "sys_push_r0");

  label("sys_08_memcpy");
  emitI(0x20, 1, 7, 0);
  emitI(0x20, 2, 7, 4);
  emitI(0x20, 3, 7, 8);
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

  label("sys_09_memset");
  emitI(0x20, 1, 7, 0);
  emitI(0x20, 2, 7, 4);
  emitI(0x20, 3, 7, 8);
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

  label("sys_10_disk_sync");
  emitImm32(0, 0x00400000);
  emitI(0x20, 1, 7, 0);
  emitI(0x20, 2, 7, 4);
  emitSys(35);
  emitJ(0x26, "sys_push_r0");

  label("sys_11_reboot");
  emitImm32(0, 0x00400000);
  emitImm32(1, 0);
  emitImm32(2, 1920);
  emitSys(35);
  emitImm32(0, 0x00400000);
  emitSys(36);
  emitJ(0x26, "boot_entry");

  label("sys_12_net_send");
  emitI(0x20, 0, 7, 0);
  emitR(0x05, 0, 8, 0);
  emitI(0x20, 1, 7, 4);
  emitSys(32);
  emitJ(0x26, "sys_push_r0");

  label("sys_13_net_recv");
  emitI(0x20, 0, 7, 0);
  emitR(0x05, 0, 8, 0);
  emitI(0x20, 1, 7, 4);
  emitSys(33);
  emitJ(0x26, "sys_push_r0");

  label("sys_14_net_info");
  emitI(0x20, 0, 7, 0);
  emitI(0x20, 1, 7, 4);
  emitSys(34);
  emitJ(0x26, "sys_push_r0");

  label("sys_15_sound");
  emitI(0x20, 1, 7, 0);
  emitI(0x20, 2, 7, 4);
  emitI(0x20, 3, 7, 8);
  emitImm32(4, 0x000FFD20);
  emitI(0x22, 1, 4, 0);
  emitImm32(5, 180);
  emitI(0x21, 5, 4, 2);
  emitI(0x21, 3, 4, 3);
  emitImm32(0, 0);
  emitJ(0x26, "sys_push_r0");

  label("sys_16_machine_info");
  emitI(0x20, 1, 7, 0);
  emitI(0x1B, 0, 1, 0); emitJ(0x27, "mi_0");
  emitI(0x1B, 0, 1, 1); emitJ(0x27, "mi_1");
  emitI(0x1B, 0, 1, 2); emitJ(0x27, "mi_2");
  emitI(0x1B, 0, 1, 4); emitJ(0x27, "mi_4");
  emitImm32(0, 0x0101);
  emitJ(0x26, "sys_push_r0");
  label("mi_0"); emitImm32(0, 1); emitJ(0x26, "sys_push_r0");
  label("mi_1"); emitImm32(0, 0x00400000); emitJ(0x26, "sys_push_r0");
  label("mi_2"); emitI(0x01, 0, 13, 0); emitJ(0x26, "sys_push_r0");
  label("mi_4"); emitImm32(1, 0x002FFD30); emitI(0x20, 0, 1, 0); emitJ(0x26, "sys_push_r0");

  label("sys_17_blit_rect");
  emitI(0x20, 1, 7, 0);
  emitI(0x20, 2, 7, 4);
  emitI(0x20, 3, 7, 8);
  emitI(0x20, 4, 7, 12);
  emitI(0x20, 5, 7, 16);
  emitR(0x05, 5, 8, 5);
  emitImm32(6, 320);
  emitR(0x07, 2, 2, 6);
  emitR(0x05, 2, 2, 1);
  emitImm32(6, 0x002F0000);
  emitR(0x05, 2, 2, 6);
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

  label("sys_20_itoa");
  emitI(0x20, 1, 7, 0);
  emitI(0x20, 2, 7, 4);
  emitI(0x20, 3, 7, 8);
  emitR(0x05, 2, 8, 2);
  emitI(0x1B, 0, 1, 0);
  emitJ(0x28, "itoa_nonzero");
  emitImm32(4, 48);
  emitI(0x21, 4, 2, 0);
  emitImm32(4, 0);
  emitI(0x21, 4, 2, 1);
  emitImm32(0, 1);
  emitJ(0x26, "sys_push_r0");

  label("itoa_nonzero");
  emitImm32(6, 0);
  emitI(0x1B, 0, 3, 10);
  emitJ(0x28, "itoa_pos");
  emitI(0x1B, 0, 1, 0);
  emitJ(0x2A, "itoa_pos");
  emitImm32(6, 1);
  emitImm32(4, 0);
  emitR(0x06, 1, 4, 1);
  label("itoa_pos");
  emitImm32(4, 0x000DF540);
  emitImm32(5, 0);
  label("itoa_div_loop");
  emitI(0x1B, 0, 1, 0);
  emitJ(0x27, "itoa_div_done");
  emitR(0x0B, 0, 1, 3);
  emitR(0x0A, 1, 1, 3);
  emitI(0x1B, 0, 0, 10);
  emitJ(0x29, "itoa_dec_dig");
  emitI(0x12, 0, 0, 55);
  emitJ(0x26, "itoa_store_dig");
  label("itoa_dec_dig");
  emitI(0x12, 0, 0, 48);
  label("itoa_store_dig");
  emitR(0x05, 7, 4, 5);
  emitI(0x21, 0, 7, 0);
  emitI(0x12, 5, 5, 1);
  emitJ(0x26, "itoa_div_loop");

  label("itoa_div_done");
  emitI(0x01, 0, 5, 0);
  emitI(0x1B, 0, 6, 0);
  emitJ(0x27, "itoa_rev_loop");
  emitImm32(6, 45);
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
  emitI(0x21, 6, 2, 0);
  emitJ(0x26, "sys_push_r0");

  label("sys_21_task_spawn");
  emitI(0x20, 1, 7, 0);
  emitI(0x20, 2, 7, 4);
  emitImm32(3, 1);
  label("ts21_find_loop");
  emitI(0x17, 4, 3, 5);
  emitImm32(5, 0x002FFE00);
  emitR(0x05, 4, 5, 4);
  emitI(0x20, 6, 4, 0);
  emitI(0x1B, 0, 6, 1);
  emitJ(0x28, "ts21_found");
  emitI(0x12, 3, 3, 1);
  emitI(0x1B, 0, 3, 8);
  emitJ(0x29, "ts21_find_loop");
  emitImm32(0, -1);
  emitJ(0x26, "sys_push_r0");

  label("ts21_found");
  emitImm32(5, 0x006000);
  emitR(0x07, 5, 3, 5);
  emitImm32(6, 0x00140000);
  emitR(0x05, 5, 6, 5);
  emitR(0x05, 6, 8, 5);
  emitI(0x23, 2, 6, 0);
  emitI(0x17, 6, 3, 13);
  emitImm32(0, 0x00178000);
  emitR(0x05, 6, 0, 6);
  emitR(0x05, 0, 8, 6);
  emitImm32(2, -1);
  emitI(0x23, 2, 0, 0);
  emitI(0x23, 5, 0, 4);

  emitImm32(2, 1);
  emitI(0x23, 2, 4, 0);
  emitI(0x23, 1, 4, 4);
  emitI(0x12, 2, 5, 4);
  emitI(0x23, 2, 4, 8);
  emitI(0x23, 5, 4, 12);
  emitI(0x12, 2, 6, 8);
  emitI(0x23, 2, 4, 16);
  emitImm32(2, 0);
  emitI(0x23, 2, 4, 20);
  emitI(0x23, 1, 4, 24);
  emitI(0x23, 2, 4, 28);

  emitImm32(1, 0x002FFF00);
  emitI(0x20, 2, 1, 4);
  emitI(0x12, 2, 2, 1);
  emitI(0x23, 2, 1, 4);
  emitI(0x01, 0, 3, 0);
  emitJ(0x26, "sys_push_r0");

  label("sys_22_date");
  emitImm32(0, 0);
  emitJ(0x26, "sys_push_r0");

  // ==========================================================================
  // 4. VM Task Exit / Halt & Dispatch Tables
  // ==========================================================================
  label("vm_task_exit_or_halt");
  emitR(0x05, 2, 8, 10);
  emitI(0x20, 0, 2, -4);
  emitImm32(1, 0x002FFF00);
  emitI(0x20, 2, 1, 0);
  emitI(0x1B, 0, 2, 0);
  emitJ(0x27, "vm_halt_with_r0");
  emitI(0x17, 3, 2, 5);
  emitImm32(4, 0x002FFE00);
  emitR(0x05, 4, 4, 3);
  emitImm32(5, 2);
  emitI(0x23, 5, 4, 0);
  emitI(0x23, 0, 4, 28);
  emitI(0x20, 5, 1, 4);
  emitI(0x13, 5, 5, 1);
  emitI(0x23, 5, 1, 4);
  emitJ(0x26, "sched_pick_next");

  label("vm_halt_bad_op");
  emitImm32(0, -99);

  label("vm_halt_with_r0");
  emitImm32(1, 0x002FFD20);
  emitI(0x23, 13, 1, 0);
  emitImm32(1, 0x002FFD28);
  emitI(0x23, 0, 1, 0);
  emitSys(0);

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
    asmLines.push(`  .dd ${l}`);
  }

  const cmpLabels = [
    "cmp_0_eq", "cmp_1_ne", "cmp_2_lt", "cmp_3_le",
    "cmp_4_gt", "cmp_5_ge", "cmp_6_ult", "cmp_7_ugt"
  ];
  label("cmp_table");
  for (const l of cmpLabels) {
    fixups.push({ wordIdx: code.length, label: l, type: "RAW32" });
    emit32(0);
    asmLines.push(`  .dd ${l}`);
  }

  label("boot_banner");
  const bannerBytes = new Uint8Array(16);
  for (let i = 0; i < Math.min(15, customBanner.length); i++) {
    bannerBytes[i] = customBanner.charCodeAt(i) & 0xFF;
  }
  const bannerDV = new DataView(bannerBytes.buffer);
  for (let w = 0; w < 4; w++) {
    emit32(bannerDV.getUint32(w * 4, true));
  }
  asmLines.push(`  .ascii "${customBanner}"`);

  label("embedded_font_serif");
  for (let i = 0; i < 1536; i += 4) {
    const b0 = parseInt(TC32_FONT_SERIF_8X16_HEX.substr((i + 0) * 2, 2), 16);
    const b1 = parseInt(TC32_FONT_SERIF_8X16_HEX.substr((i + 1) * 2, 2), 16);
    const b2 = parseInt(TC32_FONT_SERIF_8X16_HEX.substr((i + 2) * 2, 2), 16);
    const b3 = parseInt(TC32_FONT_SERIF_8X16_HEX.substr((i + 3) * 2, 2), 16);
    emit32((b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0);
  }
  for (let i = 0; i < TC32_FONT_SERIF_8X16_HEX.length; i += 64) {
    asmLines.push("  .hex " + TC32_FONT_SERIF_8X16_HEX.slice(i, i + 64));
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
  return {
    bytes,
    wordCount: code.length,
    labels,
    bannerOffset: labels.boot_banner,
    asmSource: asmLines.join("\n") + "\n"
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildTC32Core };
}
if (typeof globalThis !== "undefined") {
  globalThis.buildTC32Core = buildTC32Core;
}
