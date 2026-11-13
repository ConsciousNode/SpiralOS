/**
 * SpiralOS 1.3 — Triton 3.1 Balanced-Ternary Native Core Generator (core/core_triton.js)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Provenance:
 *   - Implements the Spiral VM contract derived from spiralos/core/core_tc32.js,
 *     spiralos/core/core_x86.js, and spiralos/compiler/spiralc.js.
 *   - Uses the embedded 8x8 ASCII font and initial 256-color palette from
 *     spiralos/core/core_x86.js (lines 22-50, 1986-2002).
 *   - Assembles to native Triton 3 (T3 mode) 18-trit (2-tryte) instructions via
 *     TritonSystem.assemble from triton/triton3.html.
 */

"use strict";

const fs = require("fs");
const path = require("path");

// Provenance: carried from spiralos/core/core_x86.js lines 22-50
const X86_FONT_8X8_HEX =
  "0000000000000000183c3c18180018006c6c2400000000006c6cfe6cfe6c6c00" +
  "183e603c067c180000c6cc183066c600386c3876dccccc761818300000000000" +
  "0c18303030180c0030180c0c0c18300000663cff3c6600000018187e18180000" +
  "00000000001818300000007e000000000000000000181800060c183060c08000" +
  "7cc6cedef6e67c001838181818187e007cc6063c60c6fe007cc6063c06c67c00" +
  "1c3c6cccfe0c1e00fec0fc0606c67c003c60c0fcc6c67c00fec60c1830303000" +
  "7cc6c67cc6c67c007cc6c67e060c780000181800001818000018180000181830" +
  "0c18306030180c0000007e00007e000030180c060c1830007cc60c1818001800" +
  "7cc6dededec07800386cc6fec6c6c600fcc6c6fcc6c6fc003c66c0c0c0663c00" +
  "f8ccc6c6c6ccf800fec0c0f8c0c0fe00fec0c0f8c0c0c0003c66c0cec6663e00" +
  "c6c6c6fec6c6c6003c18181818183c001e0c0c0cccce7800e6666c786c66e600" +
  "f06060606266fe00c6eefefed6c6c600c6e6f6decec6c6007cc6c6c6c6c67c00" +
  "fcc6c6fc6060f0007cc6c6c6decc7a00fcc6c6fc6c66e6007cc660380cc67c00" +
  "7e7e181818183c00c6c6c6c6c6c67c00c6c6c6c6c66c3800c6c6c6d6feeec600" +
  "c66c3838386cc6006666663c18183c00fecc183060c6fe003c30303030303c00" +
  "c06030180c0602003c0c0c0c0c0c3c0010386cc60000000000000000000000ff" +
  "30180c00000000000000780c7ccc7600e0607c666666dc0000007cc6c0c67c00" +
  "1c0c7ccc6666760000007cc6fec07c003c6660f86060f000000076cccc7c0cf8" +
  "e0606c766666e6001800381818183c00060006060666663c00e060666c786ce6" +
  "3818181818183c000000ecfed6d6c6000000dc666666660000007cc6c6c67c00" +
  "0000dc66667c60f0000076cccc7c0c1e0000dc766060f00000007cc07c06fc00" +
  "10307c30303418000000cccecfd66e000000c6c6c66c38000000c6d6fefeecc6" +
  "0000c66c386cc6000000c6c6ce76067c0000fc983064fc000e18187018180e00" +
  "18181800181818007018180e1818700076dc0000000000000010386cc6c6fe00";

let _cachedTritonSystem = null;
function getTritonSystem() {
  if (_cachedTritonSystem) return _cachedTritonSystem;
  if (typeof globalThis !== "undefined" && globalThis.TritonSystem) {
    _cachedTritonSystem = globalThis.TritonSystem;
    return _cachedTritonSystem;
  }
  const t3CommonPath = path.resolve(__dirname, "../../triton/tests/t3-common.js");
  const { loadHtmlModule } = require(t3CommonPath);
  const { T } = loadHtmlModule("triton3.html");
  _cachedTritonSystem = T;
  return _cachedTritonSystem;
}

// Physical memory constants in Triton 3
const TRITON_RAM_SIZE       = 14348907;  // 3^15 trytes (max configurable T3 RAM)
const TRITON_VM_BASE        = 0x00200000; // 2,097,152 (matches TC-32 & x86 VM_BASE)
const TRITON_VM_SIZE        = 0x00400000; // 4,194,304 byte-trytes (4 MB VM address space)
const TRITON_VM_MASK        = 0x003FFFFF;
const TRITON_IMG_DISK_SECT  = 960;        // Free region in spiralos.img starts at Sector 960 (0x078000)
const TRITON_IMG_DISK_OFF   = 960 * 512;  // 491,520
const TRITON_CORE_MAX_BYTES = 64 * 512;   // 32 KB reserved in Sectors 960..1023 (0x078000..0x07FFFF)
const TRITON_FB_BASE        = 15000000;
const TRITON_FB_WIDTH       = 729;
const TRITON_FB_HEIGHT      = 486;
const TRITON_FB_X_OFF       = 44;         // floor((729 - 640) / 2) = 44
const TRITON_FB_Y_OFF       = 43;         // (486 - 400) / 2 = 43
const TRITON_FB_START       = TRITON_FB_BASE + TRITON_FB_Y_OFF * TRITON_FB_WIDTH + TRITON_FB_X_OFF; // 15,031,391
const TRITON_BORDER_COLOR   = -364;       // PALETTE_729[-364] = [0, 0, 0] (pure black)
const TRITON_STEPS_PER_MS   = 8192;       // Deterministic virtual-clock steps per millisecond for SYS_TIME_MS

// Low-RAM Scratch & Table Addresses (all < 9841 so #imm9 reaches them in 1 instruction)
const VAR_QUANTUM       = 100; // 1 tryte: instruction quantum countdown (256..0)
const VAR_HAS_DISK      = 101; // 1 tryte: 1 if booted from Triton disk image, 0 if standalone test
const VAR_INITIALIZED   = 102; // 1 tryte: 1 once bitwise lookup tables are initialized
const VAR_HAS_SNET      = 103; // 1 tryte: 1 if StudioNet NIC detected on Port 22
const VAR_LOCAL_NODE    = 105; // 3 trytes: StudioNet station node ID
const VAR_NET_TX_CNT    = 108; // 3 trytes: StudioNet TX frame count
const VAR_NET_RX_CNT    = 111; // 3 trytes: StudioNet RX frame count
const VAR_MOUSE_X       = 114; // 3 trytes: Mouse X (0..319)
const VAR_MOUSE_Y       = 117; // 3 trytes: Mouse Y (0..199)
const VAR_MOUSE_BTN     = 120; // 3 trytes: Mouse buttons (0..7)
const VAR_EA_CSP        = 123; // 3 trytes: VM_BASE + VM_CSP
const VAR_TMP0          = 126; // 3 trytes: scratch word 0
const VAR_TMP1          = 129; // 3 trytes: scratch word 1
const VAR_TMP2          = 132; // 3 trytes: scratch word 2
const VAR_TMP3          = 135; // 3 trytes: scratch word 3
const VAR_TMP4          = 138; // 3 trytes: scratch word 4

const ADDR_VEC_TABLE    = 150; // 12 * 3 = 36 trytes (150..185)
const ADDR_OP_TABLE     = 186; // 40 * 3 = 120 trytes (186..305)
const ADDR_CMP_TABLE    = 306; // 8 * 3 = 24 trytes (306..329)
const ADDR_SYS_TABLE    = 330; // 22 * 3 = 66 trytes (330..395)
const ADDR_POW2_TABLE   = 396; // 32 * 3 = 96 trytes (396..491): 2^0 .. 2^31
const ADDR_POW2C_TABLE  = 492; // 32 * 3 = 96 trytes (492..587): 2^32 .. 2^1

const ADDR_BOOT_BANNER  = 590;  // 16 trytes (590..605)
const ADDR_FONT_8X8     = 610;  // 768 trytes (610..1377)
const ADDR_INIT_PAL     = 1380; // 768 trytes (1380..2147)
const ADDR_CODE_START   = 2160; // Main Triton Core code start (2160..6650)

// 256-entry fast byte/nibble tables (computed by guest at boot in 6800..9615, all < 9841!)
const TAB_PAL_LUT       = 9000; // 256 trytes: mapped 729-color palette entries (9000..9255, < 9841)
const TAB_BASE          = 12000; // Base for 10x256-entry bitwise/nibble tables (12000..14559, above all code)
const OFF_NIB_LO        = 0;    // 256 trytes: b & 15
const OFF_NIB_LO16      = 256;  // 256 trytes: (b & 15) * 16
const OFF_NIB_HI        = 512;  // 256 trytes: b >>> 4
const OFF_NIB_HI16      = 768;  // 256 trytes: (b >>> 4) * 16
const OFF_AND_LO        = 1024; // 256 trytes: i & j
const OFF_AND_HI        = 1280; // 256 trytes: (i & j) * 16
const OFF_OR_LO         = 1536; // 256 trytes: i | j
const OFF_OR_HI         = 1792; // 256 trytes: (i | j) * 16
const OFF_XOR_LO        = 2048; // 256 trytes: i ^ j
const OFF_XOR_HI        = 2304; // 256 trytes: (i ^ j) * 16
const TRITON_HW_SP      = 28000;

function buildTritonCore(options = {}) {
  const T = getTritonSystem();
  const customBanner = options.customBanner !== undefined ? options.customBanner : "SpiralOS 1.2";
  const noWrap32 = Boolean(options.noWrap32);
  const swapPalette = Boolean(options.swapPalette);
  const shiftMod64 = Boolean(options.shiftMod64);

  const lines = [];
  const emit = (s) => lines.push("  " + s);
  const label = (name) => lines.push(name + ":");
  const comment = (s) => lines.push("; " + s);

  function emitImm27(rd, val) {
    const [w0, w1, w2] = T.numberToWord(val);
    emit(`LI R${rd}, #${w0}`);
    if (w1 !== 0) emit(`LMI R${rd}, #${w1}`);
    if (w2 !== 0) emit(`LHI R${rd}, #${w2}`);
  }

  // Load 4 little-endian byte-trytes at Mem[R_ea + off .. R_ea + off + 3] into R_dst as unsigned u32 (0..2^32-1)
  // Clobbers R_tmp
  function emitLoadU32(rd, rEa, off, rTmp) {
    emit(`LT R${rd}, R${rEa}, #${off + 3}`);
    emit(`MULI R${rd}, R${rd}, #256`);
    emit(`LT R${rTmp}, R${rEa}, #${off + 2}`);
    emit(`ADD R${rd}, R${rd}, R${rTmp}`);
    emit(`MULI R${rd}, R${rd}, #256`);
    emit(`LT R${rTmp}, R${rEa}, #${off + 1}`);
    emit(`ADD R${rd}, R${rd}, R${rTmp}`);
    emit(`MULI R${rd}, R${rd}, #256`);
    emit(`LT R${rTmp}, R${rEa}, #${off + 0}`);
    emit(`ADD R${rd}, R${rd}, R${rTmp}`);
  }

  // Load 4 little-endian byte-trytes at Mem[R_ea + off .. R_ea + off + 3] into R_dst as signed i32 (-2^31..2^31-1)
  let _lblSeq = 0;
  function nextLbl(prefix) {
    return `${prefix}_${++_lblSeq}`;
  }

  function emitLoadS32(rd, rEa, off, rTmp) {
    const lPos = nextLbl("lds32_pos");
    emit(`LT R${rd}, R${rEa}, #${off + 3}`);
    emit(`CMPI R${rd}, #128`);
    emit(`JNX ${lPos}`);
    emit(`SUBI R${rd}, R${rd}, #256`);
    label(lPos);
    emit(`MULI R${rd}, R${rd}, #256`);
    emit(`LT R${rTmp}, R${rEa}, #${off + 2}`);
    emit(`ADD R${rd}, R${rd}, R${rTmp}`);
    emit(`MULI R${rd}, R${rd}, #256`);
    emit(`LT R${rTmp}, R${rEa}, #${off + 1}`);
    emit(`ADD R${rd}, R${rd}, R${rTmp}`);
    emit(`MULI R${rd}, R${rd}, #256`);
    emit(`LT R${rTmp}, R${rEa}, #${off + 0}`);
    emit(`ADD R${rd}, R${rd}, R${rTmp}`);
  }

  // Wrap any 27-trit integer in R_val modulo 2^32 into unsigned [0, 2^32 - 1]
  // Clobbers R_m32
  function emitWrapU32(rVal, rM32) {
    const lNonNeg = nextLbl("wrap_nn");
    emitImm27(rM32, 4294967296);
    emit(`MOD R${rVal}, R${rVal}, R${rM32}`);
    emit(`JNNX ${lNonNeg}`);
    emit(`ADD R${rVal}, R${rVal}, R${rM32}`);
    label(lNonNeg);
  }

  // Store unsigned u32 (0..2^32-1) in R_val into 4 little-endian byte-trytes at Mem[R_ea + off .. R_ea + off + 3]
  // Clobbers R_val, R_tmp, R_256
  function emitStoreU32(rVal, rEa, off, rTmp, r256) {
    emit(`LI R${r256}, #256`);
    emit(`MOD R${rTmp}, R${rVal}, R${r256}`);
    emit(`ST R${rTmp}, R${rEa}, #${off + 0}`);
    emit(`DIV R${rVal}, R${rVal}, R${r256}`);
    emit(`MOD R${rTmp}, R${rVal}, R${r256}`);
    emit(`ST R${rTmp}, R${rEa}, #${off + 1}`);
    emit(`DIV R${rVal}, R${rVal}, R${r256}`);
    emit(`MOD R${rTmp}, R${rVal}, R${r256}`);
    emit(`ST R${rTmp}, R${rEa}, #${off + 2}`);
    emit(`DIV R${rVal}, R${rVal}, R${r256}`);
    emit(`MOD R${rTmp}, R${rVal}, R${r256}`);
    emit(`ST R${rTmp}, R${rEa}, #${off + 3}`);
  }

  // Copy 4 byte-trytes from Mem[R_src + srcOff] to Mem[R_dst + dstOff] using LW/SW + LT/ST (4 instructions!)
  function emitCopy4Bytes(rDst, dstOff, rSrc, srcOff, rTmp) {
    emit(`LW R${rTmp}, R${rSrc}, #${srcOff}`);
    emit(`SW R${rTmp}, R${rDst}, #${dstOff}`);
    emit(`LT R${rTmp}, R${rSrc}, #${srcOff + 3}`);
    emit(`ST R${rTmp}, R${rDst}, #${dstOff + 3}`);
  }

  // ==========================================================================
  // 0. Header, Vector Table (0..35), and Stage-0 Disk Boot Loader (36..95)
  // ==========================================================================
  comment("SpiralOS 1.3 — Triton 3.1 Balanced-Ternary Native Core (/src/core_triton.asm)");
  comment("Studio: ConsciousNode SoftWorks · Licence: MIT");
  lines.push(".mode T3");
  lines.push(".org 0");
  label("boot_rom_entry");
  emit("LI R0, #0");
  emit("MTSPR R0, #2"); // SPR_IE = 0
  emit("MTSPR R0, #8"); // SPR_PROT_EN = 0
  emit("LI R0, #" + ADDR_VEC_TABLE);
  emit("MTSPR R0, #5"); // SPR_VBR = ADDR_VEC_TABLE
  emitImm27(1, TRITON_IMG_DISK_OFF); // 0x078000 = 491520
  emit("OUT R1, #7");   // DISK_ADDR = 491520
  emit("IN R2, #8");
  emit("CMPI R2, #84"); // 'T'
  emit("JNZX boot_no_disk");
  emit("IN R2, #8");
  emit("CMPI R2, #82"); // 'R'
  emit("JNZX boot_no_disk");
  emit("IN R2, #8");
  emit("CMPI R2, #73"); // 'I'
  emit("JNZX boot_no_disk");
  emit("IN R2, #8");
  emit("CMPI R2, #84"); // 'T'
  emit("JNZX boot_no_disk");
  // Read tryteCount (u16 le at 0x078004..0x078005)
  emit("IN R3, #8");
  emit("IN R4, #8");
  emit("MULI R4, R4, #256");
  emit("ADD R3, R3, R4");
  // Seek to 0x078010 + 96*2 = 491728 and unpack trytes 96..tryteCount-1 into Mem[96..]
  emit("ADDI R1, R1, #208");
  emit("OUT R1, #7");
  emit("LI R5, #96");
  label("rom_unpack_loop");
  emit("CMP R5, R3");
  emit("JNNX rom_unpack_done");
  emit("IN R6, #8");
  emit("IN R7, #8");
  emit("MULI R7, R7, #256");
  emit("ADD R6, R6, R7");
  emit("SUBI R6, R6, #9841");
  emit("ST R6, R5, #0");
  emit("ADDI R5, R5, #1");
  emit("JMPX rom_unpack_loop");
  label("rom_unpack_done");
  emit("LI R0, #0");
  emit("LI R1, #1");
  emit(`ST R1, R0, #${VAR_HAS_DISK}`);
  emitImm27(1, ADDR_CODE_START);
  emit("JR R1");

  label("boot_no_disk");
  emit("LI R0, #0");
  emit(`ST R0, R0, #${VAR_HAS_DISK}`);
  emitImm27(1, ADDR_CODE_START);
  emit("JR R1");

  // ==========================================================================
  // 1. Dispatch Tables & Static Data (150..4957)
  // ==========================================================================
  lines.push(`.org ${ADDR_VEC_TABLE}`);
  label("vector_table");
  emit(".word boot_rom_entry"); // Vec 0: RESET
  emit(".word isr_default");    // Vec 1: ILLEGAL_OP
  emit(".word isr_default");    // Vec 2: PRIV_VIOL
  emit(".word isr_default");    // Vec 3: PROT_VIOL
  emit(".word isr_default");    // Vec 4: BAD_ADDR
  emit(".word isr_default");    // Vec 5: DIV_ZERO
  emit(".word isr_default");    // Vec 6: SYSCALL
  emit(".word isr_irq_timer");  // Vec 7: IRQ_TIMER
  emit(".word isr_default");    // Vec 8: IRQ_KBD
  emit(".word isr_default");    // Vec 9: IRQ_MOUSE
  emit(".word isr_default");    // Vec 10: IRQ_DISK
  emit(".word isr_default");    // Vec 11: IRQ_NET

  lines.push(`.org ${ADDR_OP_TABLE}`);
  label("op_table");
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
  for (const l of opLabels) emit(`.word ${l}`);

  lines.push(`.org ${ADDR_CMP_TABLE}`);
  label("cmp_table");
  const cmpLabels = [
    "cmp_0_eq", "cmp_1_ne", "cmp_2_lt", "cmp_3_le",
    "cmp_4_gt", "cmp_5_ge", "cmp_6_ult", "cmp_7_ugt"
  ];
  for (const l of cmpLabels) emit(`.word ${l}`);

  lines.push(`.org ${ADDR_SYS_TABLE}`);
  label("sys_table");
  for (let s = 0; s <= 21; s++) {
    emit(`.word sys_${String(s).padStart(2, "0")}`);
  }

  lines.push(`.org ${ADDR_POW2_TABLE}`);
  label("pow2_table");
  for (let k = 0; k < 32; k++) {
    emit(`.word ${Math.pow(2, k)}`);
  }

  lines.push(`.org ${ADDR_POW2C_TABLE}`);
  label("pow2c_table");
  for (let k = 0; k < 32; k++) {
    emit(`.word ${Math.pow(2, 32 - k)}`);
  }

  lines.push(`.org ${ADDR_BOOT_BANNER}`);
  label("boot_banner");
  const bannerTrytes = [];
  for (let i = 0; i < 16; i++) {
    bannerTrytes.push(i < customBanner.length ? (customBanner.charCodeAt(i) & 0xFF) : 0);
  }
  emit(".tryte " + bannerTrytes.map(v => `#${v}`).join(", "));

  lines.push(`.org ${ADDR_FONT_8X8}`);
  label("embedded_font");
  for (let row = 0; row < 768; row += 16) {
    const chunk = [];
    for (let k = 0; k < 16; k++) {
      chunk.push("#" + parseInt(X86_FONT_8X8_HEX.substr((row + k) * 2, 2), 16));
    }
    emit(".tryte " + chunk.join(", "));
  }

  lines.push(`.org ${ADDR_INIT_PAL}`);
  label("embedded_palette");
  const ega16 = [
    [0,0,0],       [0,18,110],    [0,150,40],    [0,160,160],
    [170,20,20],   [150,0,150],   [170,95,0],    [180,185,195],
    [85,90,105],   [65,125,255],  [72,255,122],  [0,240,255],
    [255,80,80],   [255,85,255],  [255,230,60],  [255,255,255]
  ];
  const palBytes = [];
  for (let i = 0; i < 16; i++) {
    palBytes.push(ega16[i][0], ega16[i][1], ega16[i][2]);
  }
  for (let i = 16; i < 256; i++) {
    palBytes.push((i * 37) & 255, (i * 73) & 255, (i * 139) & 255);
  }
  for (let row = 0; row < 768; row += 16) {
    emit(".tryte " + palBytes.slice(row, row + 16).map(v => `#${v}`).join(", "));
  }

  // ==========================================================================
  // 2. Core Boot Entry, Guest Bitwise Table Generator & VM State Init (5000..)
  // ==========================================================================
  lines.push(`.org ${ADDR_CODE_START}`);
  label("boot_entry");
  emit("LI R0, #0");
  emit("MTSPR R0, #2"); // SPR_IE = 0
  emit("MTSPR R0, #8"); // SPR_PROT_EN = 0
  emit("LI R1, #" + ADDR_VEC_TABLE);
  emit("MTSPR R1, #5"); // SPR_VBR = ADDR_VEC_TABLE
  emitImm27(1, TRITON_HW_SP);
  emit("MOV R2, R1");
  emit("MTSPR R1, #10"); // ESP
  emit("MTSPR R1, #14"); // KSP
  // Set SP = 28000 via ESP + IRET-free trick or POP/PUSH: wait, SP on reset is 200000; let's set SP = 28000 via MTSPR #10 (ESP) + MFSPR #11 (ESR) + EPC + IRET!
  emitImm27(2, 0);
  emit("MTSPR R2, #11"); // ESR = 0 (PRIV=0, IE=0)
  emit("JALR R3, R0, #boot_set_sp_next");
  label("boot_set_sp_next");
  emit("ADDI R3, R3, #6");
  emit("MTSPR R3, #9");  // EPC = boot_after_sp
  emit("IRET");
  label("boot_after_sp");

  // Check if bitwise lookup tables (560..3119) have already been built in RAM
  emit("LI R0, #0");
  emit(`LT R1, R0, #${VAR_INITIALIZED}`);
  emit("JNZX tables_ready");

  // Guest-side algebraic construction of 256-entry nibble & 4-bit AND/OR/XOR tables:
  // For idx = 0..255:
  //   hi = idx / 16 (0..15), lo = idx % 16 (0..15)
  //   NIB_LO[idx] = lo, NIB_LO16[idx] = lo * 16, NIB_HI[idx] = hi, NIB_HI16[idx] = hi * 16
  //   Decompose (hi, lo) into 4 binary bits b = 0..3 (weights p = 1, 2, 4, 8):
  //     bit_and = bi * bj
  //     bit_or  = bi + bj - bi * bj
  //     bit_xor = (bi - bj) * (bi - bj)
  emit("LI R1, #0"); // R1 = idx = 0..255
  label("init_tab_loop");
  emitImm27(0, TAB_BASE);
  emit("ADD R0, R0, R1"); // R0 = TAB_BASE + idx
  emit("LI R2, #16");
  emit("DIV R3, R1, R2"); // R3 = hi (i = idx / 16)
  emit("MOD R4, R1, R2"); // R4 = lo (j = idx % 16)
  emit(`ST R4, R0, #${OFF_NIB_LO}`);
  emit(`ST R3, R0, #${OFF_NIB_HI}`);
  emit("MULI R5, R4, #16");
  emit(`ST R5, R0, #${OFF_NIB_LO16}`);
  emit("MULI R5, R3, #16");
  emit(`ST R5, R0, #${OFF_NIB_HI16}`);

  // Compute 4-bit AND (R5), OR (R6), XOR (R7) of nibbles R3 (i) and R4 (j)
  emit("LI R5, #0"); // acc_and
  emit("LI R6, #0"); // acc_or
  emit("LI R7, #0"); // acc_xor
  emit("LI R8, #1"); // bit weight p = 1, 2, 4, 8
  label("init_bit_loop");
  emit("LI R2, #2");
  emit("MOD R0, R3, R2"); // R0 = bi (0 or 1)
  emit("DIV R3, R3, R2");
  emit("MOD R2, R4, R2"); // R2 = bj (0 or 1)
  emit("PUSH R1");        // save idx
  emit("LI R1, #2");
  emit("DIV R4, R4, R1"); // R4 = j / 2
  // 1. XOR bit = (bi - bj) * (bi - bj)
  emit("SUB R1, R0, R2");
  emit("MUL R1, R1, R1"); // R1 = bi ^ bj
  emit("MUL R1, R1, R8");
  emit("ADD R7, R7, R1");
  // 2. AND bit = bi * bj
  emit("MUL R1, R0, R2"); // R1 = bi & bj
  // 3. OR bit = bi + bj - (bi & bj)
  emit("ADD R0, R0, R2");
  emit("SUB R0, R0, R1"); // R0 = bi | bj
  emit("MUL R0, R0, R8");
  emit("ADD R6, R6, R0");
  emit("MUL R1, R1, R8");
  emit("ADD R5, R5, R1");
  emit("POP R1");         // restore idx
  emit("MULI R8, R8, #2");
  emit("CMPI R8, #16");
  emit("JNX init_bit_loop");

  emitImm27(0, TAB_BASE);
  emit("ADD R0, R0, R1");
  emit(`ST R5, R0, #${OFF_AND_LO}`);
  emit("MULI R5, R5, #16");
  emit(`ST R5, R0, #${OFF_AND_HI}`);
  emit(`ST R6, R0, #${OFF_OR_LO}`);
  emit("MULI R6, R6, #16");
  emit(`ST R6, R0, #${OFF_OR_HI}`);
  emit(`ST R7, R0, #${OFF_XOR_LO}`);
  emit("MULI R7, R7, #16");
  emit(`ST R7, R0, #${OFF_XOR_HI}`);

  emit("ADDI R1, R1, #1");
  emit("CMPI R1, #256");
  emit("JNX init_tab_loop");

  emit("LI R0, #0");
  emit("LI R1, #1");
  emit(`ST R1, R0, #${VAR_INITIALIZED}`);

  label("tables_ready");
  // Check if Disk has spiralos.img mounted (VAR_HAS_DISK == 1)
  emit("LI R0, #0");
  emit(`LT R1, R0, #${VAR_HAS_DISK}`);
  emit("JZX cold_boot_no_disk");

  // Load full 1.44 MB spiralos.img (2023 Triton 729-tryte sectors) from Disk LBA 0 into Mem[0x00400000] (vmRam[0x200000])
  emit("LI R1, #0");
  emit("OUT R1, #17"); // DISK_LBA = 0
  emitImm27(1, 0x00400000);
  emit("OUT R1, #18"); // DISK_DMA_ADDR = 0x00400000
  emit("LI R1, #2023");
  emit("OUT R1, #19"); // DISK_COUNT = 2023 sectors
  emit("LI R1, #1");
  emit("OUT R1, #20"); // DMA_READ

  label("cold_boot_no_disk");
  // Fill 729x486 framebuffer border with documented black color (-364)
  emit(`LI R1, #${TRITON_BORDER_COLOR}`);
  emit("OUT R1, #5");  // DISPLAY_CMD fill
  // Initialize persistent mouse coordinates (160, 100, 0) & network counters on cold boot
  emit("LI R0, #0");
  emit("LI R1, #160");
  emit(`SW R1, R0, #${VAR_MOUSE_X}`);
  emit("LI R1, #100");
  emit(`SW R1, R0, #${VAR_MOUSE_Y}`);
  emit(`SW R0, R0, #${VAR_MOUSE_BTN}`);
  emit(`SW R0, R0, #${VAR_NET_TX_CNT}`);
  emit(`SW R0, R0, #${VAR_NET_RX_CNT}`);

  // Entry point for warm VM reboot (SYS 11)
  label("vm_warm_boot");
  emit("LI R0, #0");
  emit("MTSPR R0, #2"); // disable interrupts during init
  emit(`LT R1, R0, #${VAR_HAS_DISK}`);
  emit("JZX warm_boot_skip_disk");

  // DMA-read 128 KB SPIR image from Disk (offset 0x8000 = 32768 = 44 * 729 + 692) directly into Mem[0x00200000]
  emit("LI R1, #44");
  emit("OUT R1, #17"); // DISK_LBA = 44
  emitImm27(1, TRITON_VM_BASE - 692); // 2,096,460 so offset +692 lands at 0x00200000!
  emit("OUT R1, #18");
  emit("LI R1, #181");
  emit("OUT R1, #19");
  emit("LI R1, #1");
  emit("OUT R1, #20"); // DMA_READ

  // Also reload SpiralFS (Sectors 320..959, offset 0x28000 = 163840 = 224 * 729 + 544) into Mem[0x00428000]
  emit("LI R1, #224");
  emit("OUT R1, #17");
  emitImm27(1, 0x00428000 - 544);
  emit("OUT R1, #18");
  emit("LI R1, #451");
  emit("OUT R1, #19");
  emit("LI R1, #1");
  emit("OUT R1, #20");

  // Clear Globals & OS BSS (vmRam[0x020000..0x058FFF] = Mem[0x00220000..0x00258FFF], 233,472 trytes)
  emitImm27(1, 0x00220000);
  emit("LI R2, #0");
  emitImm27(3, 0x039000);
  emit("BFILL R1, R2, R3");

  // Clear VRAM, Status, TCB & Scheduler Header (vmRam[0x0F0000..0x0FFFFF] = Mem[0x002F0000..0x002FFFFF], 65,536 trytes)
  emitImm27(1, 0x002F0000);
  emit("LI R2, #0");
  emitImm27(3, 0x010000);
  emit("BFILL R1, R2, R3");

  label("warm_boot_skip_disk");
  // Copy 768-byte embedded 8x8 font to vmRam[0x0EF000] (Mem[0x002EF000])
  emitImm27(1, 0x002EF000);
  emitImm27(2, ADDR_FONT_8X8);
  emit("LI R3, #768");
  emit("BCOPY R1, R2, R3");

  // Copy 768-byte embedded palette to vmRam[0x0FFA00] (Mem[0x002FFA00])
  emitImm27(1, 0x002FFA00);
  emitImm27(2, ADDR_INIT_PAL);
  emit("LI R3, #768");
  emit("BCOPY R1, R2, R3");

  // Copy 16-byte boot banner to vmRam[0x0FFD80] (Mem[0x002FFD80])
  emitImm27(1, 0x002FFD80);
  emitImm27(2, ADDR_BOOT_BANNER);
  emit("LI R3, #16");
  emit("BCOPY R1, R2, R3");

  // Clear Status + TCB + Scheduler Header (Mem[0x002FFD00..0x002FFD7F] and Mem[0x002FFD90..0x002FFF1F])
  emitImm27(1, 0x002FFD00);
  emit("LI R2, #0");
  emit("LI R3, #128");
  emit("BFILL R1, R2, R3");
  emitImm27(1, 0x002FFD90);
  emit("LI R2, #0");
  emit("LI R3, #400");
  emit("BFILL R1, R2, R3");

  // Detect StudioNet presence on Port 22 (NET_STATUS == 0xA4 or 0xA5)
  emit("LI R0, #0");
  emit("IN R1, #22");
  emit("LI R2, #0");
  emit("CMPI R1, #164");
  emit("JZX snet_present");
  emit("CMPI R1, #165");
  emit("JNZX snet_done");
  label("snet_present");
  emit("LI R2, #1");
  label("snet_done");
  emit(`ST R2, R0, #${VAR_HAS_SNET}`);
  emit("IN R3, #23"); // NET_NODE_ID (default 3)
  emit(`SW R3, R0, #${VAR_LOCAL_NODE}`);

  // Populate vmRam[0x0FFD1C] = 3 (Machine ID = 3 for Triton), vmRam[0x0FFD30] = has_snet, mouse (160, 100)
  emitImm27(4, 0x002FFD00);
  emit("LI R1, #3");
  emit("ST R1, R4, #28"); // [0x0FFD1C] = 3
  emit("ST R2, R4, #48"); // [0x0FFD30] = has_snet
  emit(`LW R1, R0, #${VAR_MOUSE_X}`);
  emit("ST R1, R4, #8"); // [0x0FFD08] = mouse_x (160)
  emit(`LW R1, R0, #${VAR_MOUSE_Y}`);
  emit("ST R1, R4, #12"); // [0x0FFD0C] = mouse_y (100)

  // Initialize VM Stack & Frame Pointers:
  // R7 = EA_SP = 0x00300000 (VM_BASE + 0x100000)
  // R6 = EA_FP = 0x00300000 (VM_BASE + 0x100000)
  // VAR_EA_CSP = 0x00370008 (VM_BASE + 0x170008)
  // R5 = VM_ICNT = 0
  emitImm27(7, TRITON_VM_BASE + 0x00100000);
  emit("MOV R6, R7");
  emit("LI R5, #0");

  // Write sentinel return frame at vmRam[0x170000] (Mem[0x00370000]):
  //   [0x170000] = -1 (0xFFFFFFFF -> 255, 255, 255, 255)
  //   [0x170004] = 0x00100000 (0, 0, 16, 0)
  emitImm27(1, TRITON_VM_BASE + 0x00170000);
  emit("LI R2, #255");
  emit("ST R2, R1, #0");
  emit("ST R2, R1, #1");
  emit("ST R2, R1, #2");
  emit("ST R2, R1, #3");
  emit("LI R2, #0");
  emit("ST R2, R1, #4");
  emit("ST R2, R1, #5");
  emit("LI R2, #16");
  emit("ST R2, R1, #6");
  emit("LI R2, #0");
  emit("ST R2, R1, #7");
  emit("ADDI R1, R1, #8");
  emit(`SW R1, R0, #${VAR_EA_CSP}`);

  // Check SPIR magic (0x52495053 -> 'S'=83, 'P'=80, 'I'=73, 'R'=82) at vmRam[0] (Mem[0x00200000])
  emitImm27(8, TRITON_VM_BASE);
  emit("LT R1, R8, #0");
  emit("CMPI R1, #83");
  emit("JNZX no_spir_hdr");
  emit("LT R1, R8, #1");
  emit("CMPI R1, #80");
  emit("JNZX no_spir_hdr");
  emit("LT R1, R8, #2");
  emit("CMPI R1, #73");
  emit("JNZX no_spir_hdr");
  emit("LT R1, R8, #3");
  emit("CMPI R1, #82");
  emit("JNZX no_spir_hdr");
  // Load 32-bit entry_pc from vmRam[8..11] and add to R8 (TRITON_VM_BASE)
  emitLoadU32(1, 8, 8, 2);
  emit("ADD R8, R8, R1");
  label("no_spir_hdr");

  // Initialize TCB[0] at vmRam[0x0FFE00] (Mem[0x002FFE00]) and Scheduler Header at vmRam[0x0FFF00] (Mem[0x002FFF00])
  emitImm27(1, 0x002FFE00);
  emit("LI R2, #1");
  emit("ST R2, R1, #0"); // TCB[0].state = 1
  emitImm27(3, TRITON_VM_BASE);
  emit("SUB R2, R8, R3");
  emitStoreU32(2, 1, 4, 3, 4); // TCB[0].vm_pc
  emit("LI R2, #16");
  emit("ST R2, R1, #10");      // TCB[0].vm_sp = 0x00100000 (byte 2 = 16)
  emit("ST R2, R1, #14");      // TCB[0].vm_fp = 0x00100000 (byte 2 = 16)
  emit("LI R2, #8");
  emit("ST R2, R1, #16");      // TCB[0].vm_csp = 0x00170008 (byte 0 = 8, byte 2 = 23)
  emit("LI R2, #23");
  emit("ST R2, R1, #18");

  emitImm27(1, 0x002FFF00);
  emit("LI R2, #0");
  emit("ST R2, R1, #0");  // cur_tid = 0
  emit("LI R2, #1");
  emit("ST R2, R1, #4");  // num_active_tids = 1
  emit("ST R2, R1, #21"); // quantum_countdown = 256 (byte 1 = 1)
  emit("LI R0, #0");
  emit("LI R2, #256");
  emit(`ST R2, R0, #${VAR_QUANTUM}`);

  // Enable Triton Hardware Timer Interrupt (IRQ_TIMER = Vector 7, bit 0 of IMASK, period = 25000 virtual steps)
  emitImm27(1, 25000);
  emit("OUT R1, #9");    // TIMER_PERIOD = 25000
  emit("LI R1, #1");
  emit("MTSPR R1, #3");  // SPR_IMASK = 1 (IRQ_TIMER)
  emit("MTSPR R1, #2");  // SPR_IE = 1 (enable interrupts)

  // ==========================================================================
  // 3. Main Spiral VM Fetch-Decode-Execute Loop (with Timer & Quantum Preemption)
  //    R8 = EA_PC (VM_BASE + VM_PC)
  //    R7 = EA_SP (VM_BASE + VM_SP)
  //    R6 = EA_FP (VM_BASE + VM_FP)
  //    R5 = VM_ICNT
  // ==========================================================================
  label("vm_loop");
  // Check if VM_PC < 0 (i.e. R8 < TRITON_VM_BASE, or R8 >= TRITON_VM_BASE + 0x80000000 when sentinel -1 = 0xFFFFFFFF was popped!)
  emitImm27(0, TRITON_VM_BASE + 0x00400000);
  emit("CMP R8, R0");
  emit("JNNX vm_task_exit_or_halt");

  // Check preemption quantum / timer interrupt flag in VAR_QUANTUM
  emit("LI R0, #0");
  emit(`LT R1, R0, #${VAR_QUANTUM}`);
  emit("SUBI R1, R1, #1");
  emit(`ST R1, R0, #${VAR_QUANTUM}`);
  emit("JPX vm_no_preempt");

  // Quantum expired or IRQ_TIMER / SYS_YIELD requested preemption check
  emit("LI R1, #256");
  emit(`ST R1, R0, #${VAR_QUANTUM}`);
  emitImm27(1, 0x002FFF00);
  emit("LI R2, #0");
  emit("ST R2, R1, #12"); // clear preempt_flag at [0x0FFF0C]
  // Increment timer_ticks at [0x0FFF08] if not already incremented by IRQ_TIMER
  emitLoadU32(2, 1, 8, 3);
  emit("ADDI R2, R2, #1");
  emitStoreU32(2, 1, 8, 3, 4);

  // Check num_active_tids at [0x0FFF04]
  emit("LT R2, R1, #4");
  emit("CMPI R2, #1");
  emit("JNPX vm_no_preempt");

  // Save current task registers (R8, R7, R6, VAR_EA_CSP) into TCB[cur_tid]
  emit("LT R2, R1, #0"); // R2 = cur_tid
  emit("MULI R3, R2, #32");
  emitImm27(4, 0x002FFE00);
  emit("ADD R4, R4, R3"); // R4 = &TCB[cur_tid]
  emit("LI R0, #0");
  emit(`SW R2, R0, #${VAR_TMP0}`); // save cur_tid
  emit(`SW R4, R0, #${VAR_TMP1}`); // save &TCB[cur_tid]

  emitImm27(0, TRITON_VM_BASE);
  emit("SUB R1, R8, R0");
  emitStoreU32(1, 4, 4, 2, 3);  // TCB.vm_pc
  emitImm27(0, TRITON_VM_BASE);
  emit("SUB R1, R7, R0");
  emitStoreU32(1, 4, 8, 2, 3);  // TCB.vm_sp
  emitImm27(0, TRITON_VM_BASE);
  emit("SUB R1, R6, R0");
  emitStoreU32(1, 4, 12, 2, 3); // TCB.vm_fp
  emit("LI R0, #0");
  emit(`LW R1, R0, #${VAR_EA_CSP}`);
  emitImm27(0, TRITON_VM_BASE);
  emit("SUB R1, R1, R0");
  emitStoreU32(1, 4, 16, 2, 3); // TCB.vm_csp

  // Round-robin scan for next runnable task (state == 1)
  label("sched_pick_next");
  emit("LI R0, #0");
  emit(`LW R2, R0, #${VAR_TMP0}`); // R2 = cur_tid
  emit("LI R3, #8");               // scan up to 8 slots
  label("sched_scan_loop");
  emit("ADDI R2, R2, #1");
  emit("LI R4, #8");
  emit("MOD R2, R2, R4");          // cand = (cand + 1) % 8
  emit("MULI R4, R2, #32");
  emitImm27(1, 0x002FFE00);
  emit("ADD R4, R1, R4");          // R4 = &TCB[cand]
  emit("LT R1, R4, #0");           // TCB[cand].state
  emit("CMPI R1, #1");
  emit("JZX sched_found");
  emit("SUBI R3, R3, #1");
  emit("JPX sched_scan_loop");
  emit("JMPX vm_no_preempt");

  label("sched_found");
  emitImm27(1, 0x002FFF00);
  emit("ST R2, R1, #0");           // [0x0FFF00] cur_tid = cand
  // context_switches++ at [0x0FFF10]
  emit("LI R0, #0");
  emit(`SW R4, R0, #${VAR_TMP1}`);
  emitLoadU32(2, 1, 16, 3);
  emit("ADDI R2, R2, #1");
  emitStoreU32(2, 1, 16, 3, 4);
  // TCB[cand].ticks++ at [R4 + 20]
  emit("LI R0, #0");
  emit(`LW R4, R0, #${VAR_TMP1}`);
  emitLoadU32(2, 4, 20, 3);
  emit("ADDI R2, R2, #1");
  emitStoreU32(2, 4, 20, 3, 1);
  // Load R8 (EA_PC), R7 (EA_SP), R6 (EA_FP), VAR_EA_CSP from TCB[cand]
  emit("LI R0, #0");
  emit(`LW R4, R0, #${VAR_TMP1}`);
  emitImm27(0, TRITON_VM_BASE);
  emitLoadU32(8, 4, 4, 1);
  emit("ADD R8, R8, R0");
  emitLoadU32(7, 4, 8, 1);
  emit("ADD R7, R7, R0");
  emitLoadU32(6, 4, 12, 1);
  emit("ADD R6, R6, R0");
  emitLoadU32(2, 4, 16, 1);
  emit("ADD R2, R2, R0");
  emit("LI R0, #0");
  emit(`SW R2, R0, #${VAR_EA_CSP}`);

  label("vm_no_preempt");
  // Fetch opcode byte at Mem[R8 + 3], advance R8 += 4, increment R5 (VM_ICNT)
  emit("LT R1, R8, #3");  // R1 = op (0..39)
  emit("ADDI R8, R8, #4");
  emit("ADDI R5, R5, #1");
  emit("CMPI R1, #0");
  emit("JNX vm_halt_bad_op");
  emit("CMPI R1, #39");
  emit("JPX vm_halt_bad_op");
  emit("MULI R1, R1, #3");
  emit(`LW R0, R1, #${ADDR_OP_TABLE}`);
  emit("JR R0");

  // ==========================================================================
  // 4. Hardware Interrupt Service Routines (T3 Supervisor Mode)
  // ==========================================================================
  label("isr_default");
  emit("IRET");

  label("isr_irq_timer");
  emit("PUSH R0");
  emit("PUSH R1");
  emit("LI R0, #0");
  emit("LI R1, #1");
  emit(`ST R1, R0, #${VAR_QUANTUM}`); // trigger preemption check on next vm_loop step
  emitImm27(0, 0x002FFF0C);
  emit("ST R1, R0, #0");              // preempt_flag = 1
  emit("POP R1");
  emit("POP R0");
  emit("IRET");

  // ==========================================================================
  // 5. Spiral VM Opcode Handlers (0x00 .. 0x27)
  //    Note: At handler entry, R8 has ALREADY been advanced by +4, so the
  //    current instruction's bytes 0, 1, 2, 3 are at R8 - 4, R8 - 3, R8 - 2, R8 - 1!
  // ==========================================================================

  // 0x00: NOP
  label("op_00_nop");
  emit("JMP vm_loop");

  // 0x01: HALT
  label("op_01_halt");
  emit("SUBI R7, R7, #4");
  emitLoadS32(0, 7, 0, 1);
  emit("JMP vm_halt_with_r0");

  // 0x02: PUSH_I16 (sign-extend imm16 at [R8-4, R8-3] to 4 stack bytes at [R7+0..3])
  label("op_02_push_i16");
  emit("LT R0, R8, #-4"); // imm_lo
  emit("LT R1, R8, #-3"); // imm_hi
  emit("ST R0, R7, #0");
  emit("ST R1, R7, #1");
  emit("LI R2, #0");
  emit("CMPI R1, #128");
  emit("JNX push_i16_pos");
  emit("LI R2, #255");
  label("push_i16_pos");
  emit("ST R2, R7, #2");
  emit("ST R2, R7, #3");
  emit("ADDI R7, R7, #4");
  emit("JMP vm_loop");

  // 0x03: PUSH_U16 (zero-extend imm16 at [R8-4, R8-3] to 4 stack bytes at [R7+0..3])
  label("op_03_push_u16");
  emit("LT R0, R8, #-4");
  emit("LT R1, R8, #-3");
  emit("ST R0, R7, #0");
  emit("ST R1, R7, #1");
  emit("LI R2, #0");
  emit("ST R2, R7, #2");
  emit("ST R2, R7, #3");
  emit("ADDI R7, R7, #4");
  emit("JMP vm_loop");

  // 0x04: PUSH_HI (set upper 16 bits [R7-2, R7-1] of TOS from [R8-4, R8-3])
  label("op_04_push_hi");
  emit("LT R0, R8, #-4");
  emit("LT R1, R8, #-3");
  emit("ST R0, R7, #-2");
  emit("ST R1, R7, #-1");
  emit("JMP vm_loop");

  // 0x05: DUP
  label("op_05_dup");
  emitCopy4Bytes(7, 0, 7, -4, 0);
  emit("ADDI R7, R7, #4");
  emit("JMP vm_loop");

  // 0x06: DROP
  label("op_06_drop");
  emit("SUBI R7, R7, #4");
  emit("JMP vm_loop");

  // 0x07: SWAP
  label("op_07_swap");
  emit("LW R0, R7, #-4");
  emit("LT R1, R7, #-1");
  emit("LW R2, R7, #-8");
  emit("LT R3, R7, #-5");
  emit("SW R2, R7, #-4");
  emit("ST R3, R7, #-1");
  emit("SW R0, R7, #-8");
  emit("ST R1, R7, #-5");
  emit("JMP vm_loop");

  // Helper to read u16 * 4 from [R8-4, R8-3] into R1
  function emitDecodeSlot4() {
    emit("LT R1, R8, #-3");
    emit("MULI R1, R1, #256");
    emit("LT R0, R8, #-4");
    emit("ADD R1, R1, R0");
    emit("MULI R1, R1, #4");
  }

  // 0x08: GET_LOCAL
  label("op_08_get_local");
  emitDecodeSlot4();
  emit("ADD R1, R6, R1");
  emitCopy4Bytes(7, 0, 1, 0, 0);
  emit("ADDI R7, R7, #4");
  emit("JMP vm_loop");

  // 0x09: SET_LOCAL
  label("op_09_set_local");
  emit("SUBI R7, R7, #4");
  emitDecodeSlot4();
  emit("ADD R1, R6, R1");
  emitCopy4Bytes(1, 0, 7, 0, 0);
  emit("JMP vm_loop");

  // 0x0A: GET_GLOBAL (at VM_BASE + 0x020000 = 0x00220000)
  label("op_0a_get_global");
  emitDecodeSlot4();
  emitImm27(2, TRITON_VM_BASE + 0x020000);
  emit("ADD R1, R2, R1");
  emitCopy4Bytes(7, 0, 1, 0, 0);
  emit("ADDI R7, R7, #4");
  emit("JMP vm_loop");

  // 0x0B: SET_GLOBAL (at VM_BASE + 0x020000 = 0x00220000)
  label("op_0b_set_global");
  emit("SUBI R7, R7, #4");
  emitDecodeSlot4();
  emitImm27(2, TRITON_VM_BASE + 0x020000);
  emit("ADD R1, R2, R1");
  emitCopy4Bytes(1, 0, 7, 0, 0);
  emit("JMP vm_loop");

  // 0x0C: ADDR_LOCAL (push FP_rel + slot * 4)
  label("op_0c_addr_local");
  emitDecodeSlot4();
  emitImm27(2, TRITON_VM_BASE);
  emit("SUB R0, R6, R2");
  emit("ADD R1, R0, R1");
  emitStoreU32(1, 7, 0, 2, 3);
  emit("ADDI R7, R7, #4");
  emit("JMP vm_loop");

  // 0x0D: ADDR_GLOBAL (push 0x020000 + slot * 4)
  label("op_0d_addr_global");
  emitDecodeSlot4();
  emitImm27(2, 0x020000);
  emit("ADD R1, R2, R1");
  emitStoreU32(1, 7, 0, 2, 3);
  emit("ADDI R7, R7, #4");
  emit("JMP vm_loop");

  // Helper: compute effective load/store address EA = VM_BASE + ((base + sext16(imm16)) & 0x003FFFFF) into R1
  // For loads, base is at [R7 - 4]; for stores, base is at [R7] (after R7 -= 8)
  function emitCalcVmEA(stackOff) {
    const lImmPos = nextLbl("ea_imm_pos");
    const lModPos = nextLbl("ea_mod_pos");
    emit("LT R1, R8, #-3");
    emit("CMPI R1, #128");
    emit(`JNX ${lImmPos}`);
    emit("SUBI R1, R1, #256");
    label(lImmPos);
    emit("MULI R1, R1, #256");
    emit("LT R0, R8, #-4");
    emit("ADD R1, R1, R0"); // R1 = sext16(imm16)
    emitLoadU32(2, 7, stackOff, 0); // R2 = base
    emit("ADD R1, R2, R1");
    // Mask to 22 bits (& 0x003FFFFF = mod 4194304)
    emitImm27(2, 0x00400000);
    emit("MOD R1, R1, R2");
    emit(`JNNX ${lModPos}`);
    emit("ADD R1, R1, R2");
    label(lModPos);
    emitImm27(2, TRITON_VM_BASE);
    emit("ADD R1, R1, R2"); // R1 = physical Triton RAM address
  }

  // 0x0E: LOAD8U
  label("op_0e_load8u");
  emitCalcVmEA(-4);
  emit("LT R0, R1, #0");
  emit("ST R0, R7, #-4");
  emit("LI R0, #0");
  emit("SW R0, R7, #-3");
  emit("JMP vm_loop");

  // 0x0F: LOAD8S
  label("op_0f_load8s");
  emitCalcVmEA(-4);
  emit("LT R0, R1, #0");
  emit("ST R0, R7, #-4");
  emit("LI R2, #0");
  emit("CMPI R0, #128");
  emit("JNX load8s_pos");
  emit("LI R2, #255");
  label("load8s_pos");
  emit("ST R2, R7, #-3");
  emit("ST R2, R7, #-2");
  emit("ST R2, R7, #-1");
  emit("JMP vm_loop");

  // 0x10: LOAD16U
  label("op_10_load16u");
  emitCalcVmEA(-4);
  emit("LT R0, R1, #0");
  emit("LT R2, R1, #1");
  emit("ST R0, R7, #-4");
  emit("ST R2, R7, #-3");
  emit("LI R0, #0");
  emit("ST R0, R7, #-2");
  emit("ST R0, R7, #-1");
  emit("JMP vm_loop");

  // 0x11: LOAD32
  label("op_11_load32");
  emitCalcVmEA(-4);
  emitCopy4Bytes(7, -4, 1, 0, 0);
  emit("JMP vm_loop");

  // 0x12: STORE8
  label("op_12_store8");
  emit("SUBI R7, R7, #8");
  emitCalcVmEA(0);
  emit("LT R0, R7, #4");
  emit("ST R0, R1, #0");
  emit("JMP vm_loop");

  // 0x13: STORE16
  label("op_13_store16");
  emit("SUBI R7, R7, #8");
  emitCalcVmEA(0);
  emit("LT R0, R7, #4");
  emit("LT R2, R7, #5");
  emit("ST R0, R1, #0");
  emit("ST R2, R1, #1");
  emit("JMP vm_loop");

  // 0x14: STORE32
  label("op_14_store32");
  emit("SUBI R7, R7, #8");
  emitCalcVmEA(0);
  emitCopy4Bytes(1, 0, 7, 4, 0);
  emit("JMP vm_loop");

  // 0x15: ADD
  label("op_15_add");
  emit("SUBI R7, R7, #4");
  if (noWrap32) {
    // Positive control for Test 9: additions don't wrap modulo 2^32 (saturates at 2^32-1)
    emitLoadU32(1, 7, -4, 0);
    emitLoadU32(2, 7, 0, 0);
    emit("ADD R1, R1, R2");
    emitImm27(2, 4294967295);
    emit("CMP R1, R2");
    emit("JNPX add_nowrap_ok");
    emit("MOV R1, R2");
    label("add_nowrap_ok");
    emitStoreU32(1, 7, -4, 2, 3);
  } else {
    emitLoadU32(1, 7, -4, 0);
    emitLoadU32(2, 7, 0, 0);
    emit("ADD R1, R1, R2");
    emitWrapU32(1, 2);
    emitStoreU32(1, 7, -4, 2, 3);
  }
  emit("JMP vm_loop");

  // 0x16: SUB
  label("op_16_sub");
  emit("SUBI R7, R7, #4");
  emitLoadU32(1, 7, -4, 0);
  emitLoadU32(2, 7, 0, 0);
  emit("SUB R1, R1, R2");
  emitWrapU32(1, 2);
  emitStoreU32(1, 7, -4, 2, 3);
  emit("JMP vm_loop");

  // 0x17: MUL (exact 32-bit Math.imul(a, b) via 16-bit half decomposition)
  label("op_17_mul");
  emit("SUBI R7, R7, #4");
  // Load a_lo (u16 at R7-4) into R1, a_hi (u16 at R7-2) into R2
  emit("LT R1, R7, #-3");
  emit("MULI R1, R1, #256");
  emit("LT R0, R7, #-4");
  emit("ADD R1, R1, R0"); // R1 = a_lo (0..65535)
  emit("LT R2, R7, #-1");
  emit("MULI R2, R2, #256");
  emit("LT R0, R7, #-2");
  emit("ADD R2, R2, R0"); // R2 = a_hi (0..65535)
  // Load b_lo (u16 at R7+0) into R3, b_hi (u16 at R7+2) into R4
  emit("LT R3, R7, #1");
  emit("MULI R3, R3, #256");
  emit("LT R0, R7, #0");
  emit("ADD R3, R3, R0"); // R3 = b_lo (0..65535)
  emit("LT R4, R7, #3");
  emit("MULI R4, R4, #256");
  emit("LT R0, R7, #2");
  emit("ADD R4, R4, R0"); // R4 = b_hi (0..65535)
  // cross = (a_lo * b_hi + a_hi * b_lo) mod 65536
  emit("MUL R0, R1, R4");
  emit("MUL R2, R2, R3");
  emit("ADD R0, R0, R2");
  emitImm27(4, 65536);
  emit("MOD R0, R0, R4");
  emit("MUL R0, R0, R4"); // R0 = cross * 65536
  emit("MUL R1, R1, R3"); // R1 = a_lo * b_lo
  emit("ADD R1, R1, R0");
  emitWrapU32(1, 2);
  emitStoreU32(1, 7, -4, 2, 3);
  emit("JMP vm_loop");

  // 0x18: DIV (signed 32-bit division; b == 0 -> 0; -2^31 / -1 -> -2^31)
  label("op_18_div");
  emit("SUBI R7, R7, #4");
  emitLoadS32(2, 7, 0, 0); // R2 = b (signed)
  emit("JZX div_by_zero");
  emitLoadS32(1, 7, -4, 0); // R1 = a (signed)
  emit("DIV R1, R1, R2");
  emitWrapU32(1, 2);
  emitStoreU32(1, 7, -4, 2, 3);
  emit("JMP vm_loop");
  label("div_by_zero");
  emit("LI R0, #0");
  emit("SW R0, R7, #-4");
  emit("ST R0, R7, #-1");
  emit("JMP vm_loop");

  // 0x19: MOD (signed 32-bit modulo; b == 0 -> 0; -2^31 % -1 -> 0)
  label("op_19_mod");
  emit("SUBI R7, R7, #4");
  emitLoadS32(2, 7, 0, 0); // R2 = b (signed)
  emit("JZX div_by_zero");
  emitLoadS32(1, 7, -4, 0); // R1 = a (signed)
  emit("MOD R1, R1, R2");
  emitWrapU32(1, 2);
  emitStoreU32(1, 7, -4, 2, 3);
  emit("JMP vm_loop");

  // Helper for 32-bit byte-wise bitwise op using guest-generated 16x16 nibble tables at TAB_BASE (12000)
  function emitBitwiseOp(offLo, offHi) {
    emit("SUBI R7, R7, #4");
    emitImm27(0, TAB_BASE);
    for (let k = 0; k < 4; k++) {
      emit(`LT R1, R7, #${k - 4}`);     // x = a_k
      emit("ADD R1, R1, R0");
      emit(`LT R2, R7, #${k}`);         // y = b_k
      emit("ADD R2, R2, R0");
      emit(`LT R3, R1, #${OFF_NIB_LO16}`);
      emit(`LT R4, R2, #${OFF_NIB_LO}`);
      emit("ADD R3, R3, R4");
      emit("ADD R3, R3, R0");
      emit(`LT R3, R3, #${offLo}`);     // lo nibble result
      emit(`LT R1, R1, #${OFF_NIB_HI16}`);
      emit(`LT R2, R2, #${OFF_NIB_HI}`);
      emit("ADD R1, R1, R2");
      emit("ADD R1, R1, R0");
      emit(`LT R1, R1, #${offHi}`);     // hi nibble result * 16
      emit("ADD R1, R1, R3");
      emit(`ST R1, R7, #${k - 4}`);
    }
    emit("JMP vm_loop");
  }

  // 0x1A: AND
  label("op_1a_and");
  emitBitwiseOp(OFF_AND_LO, OFF_AND_HI);

  // 0x1B: OR
  label("op_1b_or");
  emitBitwiseOp(OFF_OR_LO, OFF_OR_HI);

  // 0x1C: XOR
  label("op_1c_xor");
  emitBitwiseOp(OFF_XOR_LO, OFF_XOR_HI);

  // 0x1D: SHL (a << (b & 31))
  label("op_1d_shl");
  emit("SUBI R7, R7, #4");
  emit("LT R2, R7, #0"); // low byte of b (0..255)
  if (shiftMod64) {
    // Positive control for Test 9: shift count mod 64 instead of mod 32
    emit("LI R3, #64");
    emit("MOD R2, R2, R3");
    emit("CMPI R2, #32");
    emit("JNX shl_lt32");
    emit("LI R0, #0");
    emit("SW R0, R7, #-4");
    emit("ST R0, R7, #-1");
    emit("JMP vm_loop");
    label("shl_lt32");
  } else {
    emit("LI R3, #32");
    emit("MOD R2, R2, R3"); // c = b & 31 (0..31)
  }
  emit("JZX shl_done");
  emitLoadU32(1, 7, -4, 0); // R1 = u (0..2^32-1)
  emit("MULI R2, R2, #3");
  emit(`LW R3, R2, #${ADDR_POW2_TABLE}`);  // R3 = 2^c
  emit(`LW R4, R2, #${ADDR_POW2C_TABLE}`); // R4 = 2^(32-c)
  emit("MOD R1, R1, R4");
  emit("MUL R1, R1, R3");
  emitStoreU32(1, 7, -4, 2, 3);
  label("shl_done");
  emit("JMP vm_loop");

  // 0x1E: SHR (a >>> (b & 31))
  label("op_1e_shr");
  emit("SUBI R7, R7, #4");
  emit("LT R2, R7, #0");
  emit("LI R3, #32");
  emit("MOD R2, R2, R3"); // c = b & 31
  emit("JZX shr_done");
  emitLoadU32(1, 7, -4, 0);
  emit("MULI R2, R2, #3");
  emit(`LW R3, R2, #${ADDR_POW2_TABLE}`); // R3 = 2^c
  emit("DIV R1, R1, R3");
  emitStoreU32(1, 7, -4, 2, 3);
  label("shr_done");
  emit("JMP vm_loop");

  // 0x1F: SAR (a >> (b & 31))
  label("op_1f_sar");
  emit("SUBI R7, R7, #4");
  emit("LT R2, R7, #0");
  emit("LI R3, #32");
  emit("MOD R2, R2, R3"); // c = b & 31
  emit("JZX sar_done");
  emitLoadU32(1, 7, -4, 0);
  emit("MULI R2, R2, #3");
  emit(`LW R3, R2, #${ADDR_POW2_TABLE}`); // R3 = 2^c
  emit("LT R0, R7, #-1"); // sign byte b3 of a
  emit("CMPI R0, #128");
  emit("JNNX sar_neg");
  emit("DIV R1, R1, R3");
  emitStoreU32(1, 7, -4, 2, 3);
  emit("JMP vm_loop");
  label("sar_neg");
  emitImm27(4, 4294967295); // M = 2^32 - 1
  emit("SUB R1, R4, R1");
  emit("DIV R1, R1, R3");
  emit("SUB R1, R4, R1");
  emitStoreU32(1, 7, -4, 2, 3);
  label("sar_done");
  emit("JMP vm_loop");

  // 0x20: CMP (sub-opcode cc = [R8-4] & 7)
  label("op_20_cmp");
  emit("SUBI R7, R7, #4");
  emit("LT R4, R8, #-4");
  emit("LI R3, #8");
  emit("MOD R4, R4, R3"); // R4 = cc (0..7)
  emit("MULI R4, R4, #3");
  emit(`LW R4, R4, #${ADDR_CMP_TABLE}`);
  emit("JR R4");

  function emitCmpResult(condJumpMnem) {
    const lTrue = nextLbl("cmp_true");
    const lDone = nextLbl("cmp_done");
    emit(`${condJumpMnem} ${lTrue}`);
    emit("LI R0, #0");
    emit("JMPX " + lDone);
    label(lTrue);
    emit("LI R0, #1");
    label(lDone);
    emit("ST R0, R7, #-4");
    emit("LI R0, #0");
    emit("SW R0, R7, #-3");
    emit("JMP vm_loop");
  }

  label("cmp_0_eq");
  emitLoadU32(1, 7, -4, 0);
  emitLoadU32(2, 7, 0, 0);
  emit("CMP R1, R2");
  emitCmpResult("JZX");

  label("cmp_1_ne");
  emitLoadU32(1, 7, -4, 0);
  emitLoadU32(2, 7, 0, 0);
  emit("CMP R1, R2");
  emitCmpResult("JNZX");

  label("cmp_2_lt");
  emitLoadS32(1, 7, -4, 0);
  emitLoadS32(2, 7, 0, 0);
  emit("CMP R1, R2");
  emitCmpResult("JNX");

  label("cmp_3_le");
  emitLoadS32(1, 7, -4, 0);
  emitLoadS32(2, 7, 0, 0);
  emit("CMP R1, R2");
  emitCmpResult("JNPX");

  label("cmp_4_gt");
  emitLoadS32(1, 7, -4, 0);
  emitLoadS32(2, 7, 0, 0);
  emit("CMP R1, R2");
  emitCmpResult("JPX");

  label("cmp_5_ge");
  emitLoadS32(1, 7, -4, 0);
  emitLoadS32(2, 7, 0, 0);
  emit("CMP R1, R2");
  emitCmpResult("JNNX");

  label("cmp_6_ult");
  emitLoadU32(1, 7, -4, 0);
  emitLoadU32(2, 7, 0, 0);
  emit("CMP R1, R2");
  emitCmpResult("JNX");

  label("cmp_7_ugt");
  emitLoadU32(1, 7, -4, 0);
  emitLoadU32(2, 7, 0, 0);
  emit("CMP R1, R2");
  emitCmpResult("JPX");

  // Helper: load 24-bit jump target [R8-4, R8-3, R8-2] + TRITON_VM_BASE into R8
  function emitJumpToAddr24() {
    emit("LT R1, R8, #-2");
    emit("MULI R1, R1, #256");
    emit("LT R0, R8, #-3");
    emit("ADD R1, R1, R0");
    emit("MULI R1, R1, #256");
    emit("LT R0, R8, #-4");
    emit("ADD R1, R1, R0");
    emitImm27(8, TRITON_VM_BASE);
    emit("ADD R8, R8, R1");
  }

  // 0x21: JMP
  label("op_21_jmp");
  emitJumpToAddr24();
  emit("JMP vm_loop");

  // 0x22: JZ
  label("op_22_jz");
  emit("SUBI R7, R7, #4");
  emit("LW R0, R7, #0");
  emit("JNZX jz_no_take");
  emit("LT R0, R7, #3");
  emit("JNZX jz_no_take");
  emitJumpToAddr24();
  label("jz_no_take");
  emit("JMP vm_loop");

  // 0x23: JNZ
  label("op_23_jnz");
  emit("SUBI R7, R7, #4");
  emit("LW R0, R7, #0");
  emit("JNZX jnz_take");
  emit("LT R0, R7, #3");
  emit("JZX jnz_no_take");
  label("jnz_take");
  emitJumpToAddr24();
  label("jnz_no_take");
  emit("JMP vm_loop");

  // 0x24: CALL
  label("op_24_call");
  emit("LI R0, #0");
  emit(`LW R4, R0, #${VAR_EA_CSP}`); // R4 = EA_CSP
  emitImm27(0, TRITON_VM_BASE);
  emit("SUB R1, R8, R0");            // return VM_PC
  emitStoreU32(1, 4, 0, 2, 3);
  emitImm27(0, TRITON_VM_BASE);
  emit("SUB R1, R6, R0");            // saved VM_FP
  emitStoreU32(1, 4, 4, 2, 3);
  emit("ADDI R4, R4, #8");
  emit("LI R0, #0");
  emit(`SW R4, R0, #${VAR_EA_CSP}`);
  emitJumpToAddr24();
  emit("JMP vm_loop");

  // 0x25: ENTER [nargs:8 at R8-2][nlocals:16 at R8-4..R8-3]
  label("op_25_enter");
  emit("LT R1, R8, #-2"); // nargs
  emit("MULI R1, R1, #4");
  emit("SUB R6, R7, R1"); // EA_FP = EA_SP - nargs * 4
  emitDecodeSlot4();      // R1 = nlocals * 4
  emit("ADD R7, R6, R1"); // EA_SP = EA_FP + nlocals * 4
  emit("JMP vm_loop");

  // 0x26: RET
  label("op_26_ret");
  // Copy return value at [R7 - 4 .. R7 - 1] to [R6 + 0 .. R6 + 3], set R7 = R6 + 4
  emit("LW R0, R7, #-4");
  emit("LT R1, R7, #-1");
  emit("SW R0, R6, #0");
  emit("ST R1, R6, #3");
  emit("ADDI R7, R6, #4");
  // Pop (VM_PC, VM_FP) from EA_CSP
  emit("LI R0, #0");
  emit(`LW R4, R0, #${VAR_EA_CSP}`);
  emit("SUBI R4, R4, #8");
  emit(`SW R4, R0, #${VAR_EA_CSP}`);
  emitImm27(0, TRITON_VM_BASE);
  emitLoadU32(8, 4, 0, 1);
  emit("ADD R8, R8, R0");
  emitLoadU32(6, 4, 4, 1);
  emit("ADD R6, R6, R0");
  emit("JMP vm_loop");

  // ==========================================================================
  // 6. System Call Dispatcher (0x27: SYSCALL [nargs:8][sysnum:16])
  // ==========================================================================
  label("op_27_syscall");
  emit("LT R1, R8, #-2"); // nargs
  emit("MULI R1, R1, #4");
  emit("SUB R7, R7, R1"); // R7 points to arg0!

  // Write VM_ICNT (R5) to vmRam[0x0FFD20] (Mem[0x002FFD20])
  emitImm27(1, 0x002FFD20);
  emit("MOV R2, R5");
  emitStoreU32(2, 1, 0, 3, 4);

  // Decode sysnum (u16 at [R8-4, R8-3])
  emit("LT R1, R8, #-3");
  emit("MULI R1, R1, #256");
  emit("LT R0, R8, #-4");
  emit("ADD R1, R1, R0");
  emit("CMPI R1, #0");
  emit("JNX sys_unknown");
  emit("CMPI R1, #21");
  emit("JPX sys_unknown");
  emit("MULI R1, R1, #3");
  emit(`LW R0, R1, #${ADDR_SYS_TABLE}`);
  emit("JR R0");

  label("sys_unknown");
  emitImm27(0, 4294967295); // -1

  label("sys_push_r0");
  emitWrapU32(0, 2);
  emitStoreU32(0, 7, 0, 2, 3);
  emit("ADDI R7, R7, #4");
  emit("JMP vm_loop");

  // Subroutine: Poll Triton Mouse Queue (Ports 13..16) -> update VAR_MOUSE_X/Y/BTN and vmRam[0x0FFD08..0x0FFD10]
  label("sub_poll_mouse");
  emit("LI R0, #0");
  emit(`LW R1, R0, #${VAR_MOUSE_X}`);
  emit(`LW R2, R0, #${VAR_MOUSE_Y}`);
  emit(`LW R3, R0, #${VAR_MOUSE_BTN}`);
  label("mouse_poll_lp");
  emit("IN R4, #13"); // MOUSE_COUNT
  emit("JNPX mouse_poll_done");
  emit("IN R4, #14"); // MOUSE_DX
  emit("ADD R1, R1, R4");
  emit("CMPI R1, #0");
  emit("JNNX mx_min_ok");
  emit("LI R1, #0");
  label("mx_min_ok");
  emit("CMPI R1, #319");
  emit("JNPX mx_max_ok");
  emit("LI R1, #319");
  label("mx_max_ok");
  emit("IN R4, #15"); // MOUSE_DY
  emit("ADD R2, R2, R4");
  emit("CMPI R2, #0");
  emit("JNNX my_min_ok");
  emit("LI R2, #0");
  label("my_min_ok");
  emit("CMPI R2, #199");
  emit("JNPX my_max_ok");
  emit("LI R2, #199");
  label("my_max_ok");
  emit("IN R4, #16"); // MOUSE_BTN
  emit("SUB R0, R4, R3");
  emit("MOV R3, R4");
  // If button state changed, stop draining so this frame sees the button transition!
  emit("CMPI R0, #0");
  emit("JNZX mouse_poll_done");
  emit("JMPX mouse_poll_lp");

  label("mouse_poll_done");
  emit("LI R0, #0");
  emit(`SW R1, R0, #${VAR_MOUSE_X}`);
  emit(`SW R2, R0, #${VAR_MOUSE_Y}`);
  emit(`SW R3, R0, #${VAR_MOUSE_BTN}`);
  emitImm27(4, 0x002FFD08);
  emit("ST R1, R4, #0");
  emit("DIVI_FAKE: NOP"); // Wait: store 32-bit mouse_x (0..319) as 2 bytes!
  lines.pop();
  // Since mouse_x is 0..319, lo = mouse_x mod 256, hi = mouse_x div 256
  emit("LI R0, #256");
  emit("MOD R0, R1, R0");
  emit("ST R0, R4, #0");
  emit("LI R0, #256");
  emit("DIV R0, R1, R0");
  emit("ST R0, R4, #1");
  emit("ST R2, R4, #4"); // mouse_y is 0..199 (< 256)
  emit("ST R3, R4, #8"); // mouse_btn is 0..7 (< 256)
  emit("RET");

  // SYS 0: EXIT(code)
  label("sys_00");
  emitLoadS32(0, 7, 0, 1);
  emit("JMP vm_halt_with_r0");

  // SYS 1: YIELD() -> Present 320x200 8-bpp backbuffer (0x0F0000) 2x into centered 640x400 of 729x486 FB
  label("sys_01");
  emit("CALL sub_poll_mouse");
  // Store current R5 (VM_ICNT) at [0x002FFD20] on SYS_YIELD
  emitImm27(1, 0x002FFD20);
  emit("MOV R2, R5");
  emitStoreU32(2, 1, 0, 3, 4);
  // Increment frame counter at vmRam[0x0FFD04] (Mem[0x002FFD04])
  emitImm27(1, 0x002FFD04);
  emitLoadU32(2, 1, 0, 3);
  emit("ADDI R2, R2, #1");
  emitStoreU32(2, 1, 0, 3, 4);

  // Build 256-entry 729-color PAL_LUT at TAB_PAL_LUT (3120..3375) from vmRam[0x0FFA00] (Mem[0x002FFA00]):
  // Rule: r_d = floor((R + 16) / 32) - 4, g_d = floor((G + 16) / 32) - 4, b_d = floor((B + 16) / 32) - 4
  //       color729 = 81 * r_d + 9 * g_d + b_d
  emitImm27(1, 0x002FFA00); // R1 = palette read ptr
  emit("LI R2, #0");        // R2 = color idx 0..255
  emit("LI R4, #32");       // divisor 32
  label("pal_lut_loop");
  emit("LT R0, R1, #0");    // R
  emit("ADDI R0, R0, #16");
  emit("DIV R0, R0, R4");
  emit("SUBI R0, R0, #4");
  emit("MULI R3, R0, #81"); // 81 * r_d
  emit("LT R0, R1, #1");    // G
  emit("ADDI R0, R0, #16");
  emit("DIV R0, R0, R4");
  emit("SUBI R0, R0, #4");
  emit("MULI R0, R0, #9");
  emit("ADD R3, R3, R0");   // + 9 * g_d
  emit("LT R0, R1, #2");    // B
  emit("ADDI R0, R0, #16");
  emit("DIV R0, R0, R4");
  emit("SUBI R0, R0, #4");
  emit("ADD R3, R3, R0");   // + b_d
  emit(`ST R3, R2, #${TAB_PAL_LUT}`);
  emit("ADDI R1, R1, #3");
  emit("ADDI R2, R2, #1");
  emit("CMPI R2, #256");
  emit("JNX pal_lut_loop");

  if (swapPalette) {
    // Positive control for Test 9: swap two palette entries (16 and 18)
    emit("LI R0, #0");
    emit(`LT R1, R0, #${TAB_PAL_LUT + 16}`);
    emit(`LT R2, R0, #${TAB_PAL_LUT + 18}`);
    emit(`ST R2, R0, #${TAB_PAL_LUT + 16}`);
    emit(`ST R1, R0, #${TAB_PAL_LUT + 18}`);
  }

  // Scale 320x200 backbuffer at Mem[0x002F0000] 2x into centered 640x400 region at TRITON_FB_START (15,031,391)
  emitImm27(1, 0x002F0000);      // R1 = src ptr
  emitImm27(2, TRITON_FB_START); // R2 = dst even row ptr
  emit("LI R4, #200");           // R4 = 200 rows
  label("blit_y_loop");
  emit("ADDI R3, R2, #729");     // R3 = dst odd row ptr (R2 + 729)
  emit("PUSH R4");
  emit("LI R4, #80");            // 80 groups of 4 pixels = 320 pixels per row
  label("blit_x_loop");
  for (let p = 0; p < 4; p++) {
    emit(`LT R0, R1, #${p}`);
    emit(`LT R0, R0, #${TAB_PAL_LUT}`);
    emit(`ST R0, R2, #${p * 2}`);
    emit(`ST R0, R2, #${p * 2 + 1}`);
    emit(`ST R0, R3, #${p * 2}`);
    emit(`ST R0, R3, #${p * 2 + 1}`);
  }
  emit("ADDI R1, R1, #4");
  emit("ADDI R2, R2, #8");
  emit("ADDI R3, R3, #8");
  emit("SUBI R4, R4, #1");
  emit("JPX blit_x_loop");
  emit("POP R4");
  emit("ADDI R2, R2, #818");     // advance R2 by 2*729 - 640 = 818 to start of next scanline pair
  emit("SUBI R4, R4, #1");
  emit("JPX blit_y_loop");

  // Trigger preemption check after frame yield
  emit("LI R0, #0");
  emit("LI R1, #1");
  emit(`ST R1, R0, #${VAR_QUANTUM}`);
  emitImm27(1, 0x002FFF0C);
  emit("LI R2, #1");
  emit("ST R2, R1, #0");
  emit("LI R0, #0");
  emit("JMP sys_push_r0");

  // SYS 2: TIME_MS() -> deterministic milliseconds derived from Triton virtual clock (Port 6 / 8192 + frames * 16)
  label("sys_02");
  emit("IN R0, #6"); // Triton 27-trit virtual clock step counter
  emitImm27(1, TRITON_STEPS_PER_MS);
  emit("DIV R0, R0, R1");
  emitImm27(1, 0x002FFD04);
  emitLoadU32(2, 1, 0, 3);
  emit("MULI R2, R2, #16");
  emit("ADD R0, R0, R2");
  emitWrapU32(0, 2);
  emitImm27(1, 0x002FFD24);
  emit("MOV R2, R0");
  emitStoreU32(2, 1, 0, 3, 4);
  emit("JMP sys_push_r0");

  // SYS 3: KEY_POLL()
  label("sys_03");
  label("key_poll_lp");
  emit("IN R1, #10"); // KBD_COUNT
  emit("JNPX key_poll_empty");
  emit("IN R2, #11"); // KBD_DATA
  emit("IN R3, #12"); // KBD_TYPE (0 = down, 1 = up)
  emit("JNZX key_poll_lp"); // skip key-up events
  emit("CMPI R2, #10");
  emit("JNZX key_not_lf");
  emit("LI R2, #13");
  label("key_not_lf");
  // If R2 <= 255: ascii = R2, vk = (R2 in 97..122 ? R2 - 32 : R2)
  emit("CMPI R2, #256");
  emit("JNNX key_already_packed");
  emit("MOV R3, R2"); // vk = ascii
  emit("CMPI R3, #97");
  emit("JNX key_pack");
  emit("CMPI R3, #122");
  emit("JPX key_pack");
  emit("SUBI R3, R3, #32");
  label("key_pack");
  emit("MULI R3, R3, #256");
  emit("ADD R2, R2, R3");
  label("key_already_packed");
  emitImm27(0, 0x01010000);
  emit("ADD R0, R0, R2");
  emit("JMP sys_push_r0");
  label("key_poll_empty");
  emit("LI R0, #0");
  emit("JMP sys_push_r0");

  // SYS 4: MOUSE_POLL(out_ptr)
  label("sys_04");
  emit("CALL sub_poll_mouse");
  emitLoadU32(1, 7, 0, 0); // R1 = out_ptr
  emit("LI R0, #0");
  emit("CMP R1, R0");
  emit("JZX mouse_skip_ptr");
  emitImm27(2, 0x00400000);
  emit("MOD R1, R1, R2");
  emitImm27(2, TRITON_VM_BASE);
  emit("ADD R4, R1, R2"); // R4 = VM_BASE + (out_ptr & 0x3FFFFF)
  emit(`LW R1, R0, #${VAR_MOUSE_X}`);
  emitStoreU32(1, 4, 0, 2, 3);
  emit("LI R0, #0");
  emit(`LW R1, R0, #${VAR_MOUSE_Y}`);
  emitStoreU32(1, 4, 4, 2, 3);
  emit("LI R0, #0");
  emit(`LW R1, R0, #${VAR_MOUSE_BTN}`);
  emitStoreU32(1, 4, 8, 2, 3);
  label("mouse_skip_ptr");
  emit("LI R0, #0");
  emit(`LW R1, R0, #${VAR_MOUSE_X}`);
  emit(`LW R2, R0, #${VAR_MOUSE_Y}`);
  emit(`LW R3, R0, #${VAR_MOUSE_BTN}`);
  emit("MULI R2, R2, #1024"); // y << 10
  emitImm27(4, 1048576);      // 1 << 20
  emit("MUL R3, R3, R4");     // btn << 20
  emit("ADD R0, R1, R2");
  emit("ADD R0, R0, R3");
  emit("JMP sys_push_r0");

  // SYS 5: FILL_RECT(x, y, w, h, col)
  label("sys_05");
  emitLoadS32(1, 7, 0, 0);  // R1 = x
  emitLoadS32(2, 7, 4, 0);  // R2 = y
  emitLoadS32(3, 7, 8, 0);  // R3 = w
  emitLoadS32(4, 7, 12, 0); // R4 = h
  emit("CMPI R1, #0");
  emit("JNNX fr_x_ok");
  emit("ADD R3, R3, R1");
  emit("LI R1, #0");
  label("fr_x_ok");
  emit("CMPI R2, #0");
  emit("JNNX fr_y_ok");
  emit("ADD R4, R4, R2");
  emit("LI R2, #0");
  label("fr_y_ok");
  emit("ADD R0, R1, R3");
  emit("CMPI R0, #320");
  emit("JNPX fr_w_ok");
  emit("LI R0, #320");
  emit("SUB R3, R0, R1");
  label("fr_w_ok");
  emit("ADD R0, R2, R4");
  emit("CMPI R0, #200");
  emit("JNPX fr_h_ok");
  emit("LI R0, #200");
  emit("SUB R4, R0, R2");
  label("fr_h_ok");
  emit("CMPI R3, #0");
  emit("JNPX fr_done");
  emit("CMPI R4, #0");
  emit("JNPX fr_done");

  emit("MULI R2, R2, #320");
  emit("ADD R2, R2, R1");
  emitImm27(0, 0x002F0000);
  emit("ADD R2, R2, R0"); // R2 = row start ptr in VRAM
  emit("LT R1, R7, #16"); // R1 = col & 0xFF
  label("fr_row_loop");
  emit("MOV R0, R2");     // dst = row start
  emit("PUSH R3");        // save w
  emit("BFILL R0, R1, R3");
  emit("POP R3");
  emit("ADDI R2, R2, #320");
  emit("SUBI R4, R4, #1");
  emit("JPX fr_row_loop");
  label("fr_done");
  emit("LI R0, #0");
  emit("JMP sys_push_r0");

  // Subroutine: draw single 8x8 glyph (R1=x, R2=y, R3=ch, R4=fg, VAR_TMP0=bg)
  label("sub_draw_char");
  emit("SUBI R3, R3, #32");
  emit("CMPI R3, #0");
  emit("JNX dc_ret");
  emit("CMPI R3, #95");
  emit("JPX dc_ret");
  emit("CMPI R1, #0");
  emit("JNX dc_ret");
  emit("CMPI R1, #312");
  emit("JPX dc_ret");
  emit("CMPI R2, #0");
  emit("JNX dc_ret");
  emit("CMPI R2, #192");
  emit("JPX dc_ret");

  emit("MULI R3, R3, #8");
  emitImm27(0, 0x002EF000);
  emit("ADD R3, R3, R0"); // R3 = glyph ptr
  emit("MULI R2, R2, #320");
  emit("ADD R2, R2, R1");
  emitImm27(0, 0x002F0000);
  emit("ADD R2, R2, R0"); // R2 = vram ptr

  emit("LI R0, #0");
  emit(`LW R1, R0, #${VAR_TMP0}`); // R1 = bg (< 0 if transparent)
  emit("PUSH R5");
  emit("PUSH R6");
  emit("LI R5, #8"); // 8 rows
  label("dc_row_loop");
  emit("LT R0, R3, #0"); // glyph row byte (0..255)
  emit("ADDI R3, R3, #1");
  // Unroll or loop 8 bits (MSB to LSB: hi nibble bits 3..0, lo nibble bits 3..0)
  // Even faster: divide R0 by 128, 64, 32, 16, 8, 4, 2, 1 via MOD/DIV 2 from LSB (offset +7 down to +0)!
  for (let bit = 7; bit >= 0; bit--) {
    const lBg = nextLbl("dc_bg");
    const lNext = nextLbl("dc_next");
    if (bit > 0) {
      emit("LI R6, #2");
      emit("MOD R6, R0, R6");
      emit("PUSH R6");
      emit("LI R6, #2");
      emit("DIV R0, R0, R6");
      emit("POP R6");
      emit("CMPI R6, #0");
    } else {
      emit("CMPI R0, #0");
    }
    emit(`JZX ${lBg}`);
    emit(`ST R4, R2, #${bit}`);
    emit(`JMPX ${lNext}`);
    label(lBg);
    emit("CMPI R1, #0");
    emit(`JNX ${lNext}`);
    emit(`ST R1, R2, #${bit}`);
    label(lNext);
  }
  emit("ADDI R2, R2, #320");
  emit("SUBI R5, R5, #1");
  emit("JPX dc_row_loop");
  emit("POP R6");
  emit("POP R5");
  label("dc_ret");
  emit("RET");

  // SYS 6: DRAW_CHAR(x, y, ch, fg, bg)
  label("sys_06");
  emitLoadS32(1, 7, 16, 0); // bg
  emit("LI R0, #0");
  emit(`SW R1, R0, #${VAR_TMP0}`);
  emitLoadS32(1, 7, 0, 0);  // x
  emitLoadS32(2, 7, 4, 0);  // y
  emitLoadS32(3, 7, 8, 0);  // ch
  emit("LT R4, R7, #12");   // fg (0..255)
  emit("CALL sub_draw_char");
  emit("LI R0, #0");
  emit("JMP sys_push_r0");

  // SYS 7: DRAW_STR(x, y, str_ptr, fg, bg)
  label("sys_07");
  emitLoadS32(1, 7, 16, 0); // bg
  emit("LI R0, #0");
  emit(`SW R1, R0, #${VAR_TMP0}`);
  emitLoadS32(1, 7, 0, 2);  // x (clobbers R2, preserves R0=0)
  emit(`SW R1, R0, #${VAR_TMP1}`);
  emitLoadS32(2, 7, 4, 1);  // y (clobbers R1, preserves R0=0)
  emit(`SW R2, R0, #${VAR_TMP2}`);
  emitLoadU32(3, 7, 8, 0);  // str_ptr
  emitImm27(0, TRITON_VM_BASE);
  emit("ADD R3, R3, R0");
  emit("LI R0, #0");
  emit(`SW R3, R0, #${VAR_TMP3}`);
  emit("LT R4, R7, #12");   // fg
  emit(`SW R4, R0, #${VAR_TMP4}`);

  label("ds_loop");
  emit("LI R0, #0");
  emit(`LW R3, R0, #${VAR_TMP3}`);
  emit("LT R3, R3, #0");    // ch = *str_ptr
  emit("JZX ds_done");
  emit(`LW R1, R0, #${VAR_TMP1}`); // x
  emit(`LW R2, R0, #${VAR_TMP2}`); // y
  emit(`LW R4, R0, #${VAR_TMP4}`); // fg
  emit("CALL sub_draw_char");
  emit("LI R0, #0");
  emit(`LW R1, R0, #${VAR_TMP1}`);
  emit("ADDI R1, R1, #8");
  emit(`SW R1, R0, #${VAR_TMP1}`);
  emit(`LW R3, R0, #${VAR_TMP3}`);
  emit("ADDI R3, R3, #1");
  emit(`SW R3, R0, #${VAR_TMP3}`);
  emit("JMPX ds_loop");
  label("ds_done");
  emit("LI R0, #0");
  emit("JMP sys_push_r0");

  // SYS 8: MEMCPY(dst, src, len)
  label("sys_08");
  emitLoadS32(3, 7, 8, 0); // len
  emit("CMPI R3, #0");
  emit("JNPX mc_done");
  emitLoadU32(1, 7, 0, 0); // dst
  emitLoadU32(2, 7, 4, 0); // src
  emitImm27(0, TRITON_VM_BASE);
  emit("ADD R1, R1, R0");
  emit("ADD R2, R2, R0");
  emit("BCOPY R1, R2, R3");
  label("mc_done");
  emit("LI R0, #0");
  emit("JMP sys_push_r0");

  // SYS 9: MEMSET(dst, val, len)
  label("sys_09");
  emitLoadS32(3, 7, 8, 0); // len
  emit("CMPI R3, #0");
  emit("JNPX ms_done");
  emitLoadU32(1, 7, 0, 0); // dst
  emit("LT R2, R7, #4");   // val & 0xFF
  emitImm27(0, TRITON_VM_BASE);
  emit("ADD R1, R1, R0");
  emit("BFILL R1, R2, R3");
  label("ms_done");
  emit("LI R0, #0");
  emit("JMP sys_push_r0");

  // SYS 10: DISK_SYNC(start_sec, count_sec)
  // Maps 512-byte SpiralOS sectors [start_sec, start_sec + count_sec) to 729-tryte Triton DMA sectors
  label("sys_10");
  emitLoadS32(1, 7, 0, 0); // start_sec
  emitLoadS32(2, 7, 4, 0); // count_sec
  emit("CMPI R2, #0");
  emit("JNPX dsync_done");
  emit("MULI R1, R1, #512"); // byte_start
  emit("MULI R2, R2, #512"); // byte_len
  emit("ADD R2, R1, R2");    // byte_end
  emit("ADDI R2, R2, #728");
  emit("LI R3, #729");
  emit("DIV R1, R1, R3");    // t3_lba_start = byte_start / 729
  emit("DIV R2, R2, R3");    // t3_lba_end = (byte_end + 728) / 729
  emit("SUB R2, R2, R1");    // t3_sec_count
  emit("OUT R1, #17");       // DISK_LBA
  emit("MULI R1, R1, #729");
  emitImm27(0, 0x00400000);
  emit("ADD R1, R1, R0");
  emit("OUT R1, #18");       // DISK_DMA_ADDR
  emit("OUT R2, #19");       // DISK_COUNT
  emit("LI R1, #2");
  emit("OUT R1, #20");       // DMA_WRITE
  label("dsync_done");
  emit("LI R0, #0");
  emit("JMP sys_push_r0");

  // SYS 11: REBOOT()
  label("sys_11");
  // Flush mounted 480 KB image (Sectors 0..959 = 675 Triton 729-tryte sectors) to Disk before warm reboot
  emit("LI R0, #0");
  emit(`LT R1, R0, #${VAR_HAS_DISK}`);
  emit("JZX reboot_now");
  emit("LI R1, #0");
  emit("OUT R1, #17");
  emitImm27(1, 0x00400000);
  emit("OUT R1, #18");
  emit("LI R1, #675");
  emit("OUT R1, #19");
  emit("LI R1, #2");
  emit("OUT R1, #20");
  label("reboot_now");
  emit("JMP vm_warm_boot");

  // SYS 12: NET_SEND(buf_ptr, len) -> StudioNet Ports 24 & 26
  label("sys_12");
  emit("LI R0, #0");
  emit(`LT R1, R0, #${VAR_HAS_SNET}`);
  emit("JZX net_ret_zero");
  emitLoadS32(2, 7, 4, 0); // len
  emit("CMPI R2, #0");
  emit("JNPX net_ret_zero");
  emit("CMPI R2, #512");
  emit("JNPX net_tx_len_ok");
  emit("LI R2, #512");
  label("net_tx_len_ok");
  emitLoadU32(1, 7, 0, 0); // buf_ptr
  emitImm27(0, TRITON_VM_BASE);
  emit("ADD R1, R1, R0");
  emit("MOV R3, R2");
  label("net_tx_loop");
  emit("LT R0, R1, #0");
  emit("OUT R0, #26");     // NET_TX_FIFO
  emit("ADDI R1, R1, #1");
  emit("SUBI R3, R3, #1");
  emit("JPX net_tx_loop");
  emit("OUT R2, #24");     // NET_TX_LEN (triggers transmit)
  emit("LI R0, #0");
  emit(`LW R1, R0, #${VAR_NET_TX_CNT}`);
  emit("ADDI R1, R1, #1");
  emit(`SW R1, R0, #${VAR_NET_TX_CNT}`);
  emit("MOV R0, R2");
  emit("JMP sys_push_r0");

  // SYS 13: NET_RECV(buf_ptr, max_len) -> StudioNet Ports 25 & 27
  label("sys_13");
  emit("LI R0, #0");
  emit(`LT R1, R0, #${VAR_HAS_SNET}`);
  emit("JZX net_ret_zero");
  emit("IN R2, #25");      // NET_RX_LEN
  emit("CMPI R2, #0");
  emit("JNPX net_ret_zero");
  emitLoadS32(3, 7, 4, 0); // max_len
  emit("CMP R2, R3");
  emit("JNPX net_rx_len_ok");
  emit("MOV R2, R3");
  label("net_rx_len_ok");
  emitLoadU32(1, 7, 0, 0); // buf_ptr
  emitImm27(0, TRITON_VM_BASE);
  emit("ADD R1, R1, R0");
  emit("MOV R3, R2");
  label("net_rx_loop");
  emit("CMPI R3, #0");
  emit("JNPX net_rx_done");
  emit("IN R0, #27");      // NET_RX_FIFO
  emit("ST R0, R1, #0");
  emit("ADDI R1, R1, #1");
  emit("SUBI R3, R3, #1");
  emit("JMPX net_rx_loop");
  label("net_rx_done");
  emit("LI R0, #1");
  emit("OUT R0, #25");     // pop current RX frame
  emit("LI R0, #0");
  emit(`LW R1, R0, #${VAR_NET_RX_CNT}`);
  emit("ADDI R1, R1, #1");
  emit(`SW R1, R0, #${VAR_NET_RX_CNT}`);
  emit("MOV R0, R2");
  emit("JMP sys_push_r0");

  label("net_ret_zero");
  emit("LI R0, #0");
  emit("JMP sys_push_r0");

  // SYS 14: NET_INFO(cmd, val)
  label("sys_14");
  emitLoadS32(1, 7, 0, 0); // cmd
  emit("LI R0, #0");
  emit("CMPI R1, #0");
  emit("JZX ni_get_node");
  emit("CMPI R1, #1");
  emit("JZX ni_set_node");
  emit("CMPI R1, #2");
  emit("JZX ni_get_tx");
  emit(`LW R0, R0, #${VAR_NET_RX_CNT}`);
  emit("JMP sys_push_r0");
  label("ni_get_node");
  emit(`LW R0, R0, #${VAR_LOCAL_NODE}`);
  emit("JMP sys_push_r0");
  label("ni_set_node");
  emitLoadU32(2, 7, 4, 0);
  emit("LI R0, #0");
  emit(`SW R2, R0, #${VAR_LOCAL_NODE}`);
  emit("MOV R0, R2");
  emit("JMP sys_push_r0");
  label("ni_get_tx");
  emit(`LW R0, R0, #${VAR_NET_TX_CNT}`);
  emit("JMP sys_push_r0");

  // SYS 15: SOUND_TONE(freq, ms, wave) -> documented no-op on Triton
  label("sys_15");
  emit("LI R0, #0");
  emit("JMP sys_push_r0");

  // SYS 16: MACHINE_INFO(query) -> 0: 3 (Triton), 1: 0x00400000, 2: VM_ICNT, 4: has_snet, default: node_id
  label("sys_16");
  emitLoadS32(1, 7, 0, 0);
  emit("CMPI R1, #0");
  emit("JZX mi_0");
  emit("CMPI R1, #1");
  emit("JZX mi_1");
  emit("CMPI R1, #2");
  emit("JZX mi_2");
  emit("CMPI R1, #4");
  emit("JZX mi_4");
  emit("LI R0, #0");
  emit(`LW R0, R0, #${VAR_LOCAL_NODE}`);
  emit("JMP sys_push_r0");
  label("mi_0");
  emit("LI R0, #3"); // Machine ID = 3 (Triton)
  emit("JMP sys_push_r0");
  label("mi_1");
  emitImm27(0, 0x00400000);
  emit("JMP sys_push_r0");
  label("mi_2");
  emit("MOV R0, R5");
  emit("JMP sys_push_r0");
  label("mi_4");
  emit("LI R0, #0");
  emit(`LT R0, R0, #${VAR_HAS_SNET}`);
  emit("JMP sys_push_r0");

  // SYS 17: BLIT_RECT(x, y, w, h, src_ptr)
  label("sys_17");
  emitLoadS32(1, 7, 0, 0);  // x
  emitLoadS32(2, 7, 4, 0);  // y
  emitLoadS32(3, 7, 8, 0);  // w
  emitLoadS32(4, 7, 12, 0); // h
  emit("CMPI R3, #0");
  emit("JNPX br_done");
  emit("CMPI R4, #0");
  emit("JNPX br_done");
  emitLoadU32(0, 7, 16, 1); // src_ptr
  emitImm27(1, TRITON_VM_BASE);
  emit("ADD R1, R0, R1");   // R1 = src EA
  emitLoadS32(0, 7, 0, 2);  // x
  emit("MULI R2, R2, #320");
  emit("ADD R2, R2, R0");
  emitImm27(0, 0x002F0000);
  emit("ADD R2, R2, R0");   // R2 = dst row EA in VRAM
  label("br_row_loop");
  emit("MOV R0, R2");
  emit("PUSH R3");
  emit("BCOPY R0, R1, R3"); // advances R1 by w, copies w pixels to R0
  emit("POP R3");
  emit("ADDI R2, R2, #320");
  emit("SUBI R4, R4, #1");
  emit("JPX br_row_loop");
  label("br_done");
  emit("LI R0, #0");
  emit("JMP sys_push_r0");

  // SYS 18: STRCMP(s1, s2)
  label("sys_18");
  emitLoadU32(1, 7, 0, 0);
  emitLoadU32(2, 7, 4, 0);
  emitImm27(0, TRITON_VM_BASE);
  emit("ADD R1, R1, R0");
  emit("ADD R2, R2, R0");
  label("sc_loop");
  emit("LT R3, R1, #0");
  emit("LT R4, R2, #0");
  emit("CMP R3, R4");
  emit("JNZX sc_diff");
  emit("CMPI R3, #0");
  emit("JZX sc_same");
  emit("ADDI R1, R1, #1");
  emit("ADDI R2, R2, #1");
  emit("JMPX sc_loop");
  label("sc_diff");
  emit("LI R0, #0");
  emit("JMP sys_push_r0");
  label("sc_same");
  emit("LI R0, #1");
  emit("JMP sys_push_r0");

  // SYS 19: STRLEN(s)
  label("sys_19");
  emitLoadU32(1, 7, 0, 0);
  emitImm27(0, TRITON_VM_BASE);
  emit("ADD R1, R1, R0");
  emit("LI R0, #0");
  label("sl_loop");
  emit("LT R2, R1, #0");
  emit("JZX sys_push_r0");
  emit("ADDI R0, R0, #1");
  emit("ADDI R1, R1, #1");
  emit("JMPX sl_loop");

  // SYS 20: ITOA(val, buf_ptr, base)
  label("sys_20");
  emitLoadU32(2, 7, 4, 0);  // buf_ptr
  emitImm27(0, TRITON_VM_BASE);
  emit("ADD R2, R2, R0");   // R2 = dst EA
  emitLoadS32(3, 7, 8, 0);  // R3 = base
  emitLoadS32(1, 7, 0, 0);  // R1 = signed val
  emit("CMPI R1, #0");
  emit("JNZX itoa_nonzero");
  emit("LI R4, #48");       // '0'
  emit("ST R4, R2, #0");
  emit("LI R4, #0");
  emit("ST R4, R2, #1");
  emit("LI R0, #1");
  emit("JMP sys_push_r0");

  label("itoa_nonzero");
  emit("LI R4, #0");        // R4 = is_neg
  emit("CMPI R3, #10");
  emit("JNZX itoa_unsigned");
  emit("CMPI R1, #0");
  emit("JNNX itoa_pos");
  emit("LI R4, #1");
  emit("NEG R1, R1");       // R1 = -val (even for -2147483648, +2147483648 fits in 27 trits!)
  emit("JMPX itoa_pos");
  label("itoa_unsigned");
  emitLoadU32(1, 7, 0, 0);  // unsigned 32-bit val
  label("itoa_pos");
  emit("PUSH R5");
  emit("PUSH R6");
  emit("LI R5, #0");        // digit count
  label("itoa_div_loop");
  emit("CMPI R1, #0");
  emit("JZX itoa_div_done");
  emit("MOD R0, R1, R3");
  emit("DIV R1, R1, R3");
  emit("CMPI R0, #10");
  emit("JNX itoa_dec_dig");
  emit("ADDI R0, R0, #55"); // 'A' - 10
  emit("JMPX itoa_push_dig");
  label("itoa_dec_dig");
  emit("ADDI R0, R0, #48"); // '0'
  label("itoa_push_dig");
  emit("PUSH R0");
  emit("ADDI R5, R5, #1");
  emit("JMPX itoa_div_loop");

  label("itoa_div_done");
  emit("MOV R6, R5");       // total len = digit count (+ 1 if neg)
  emit("CMPI R4, #0");
  emit("JZX itoa_pop_loop");
  emit("LI R0, #45");       // '-'
  emit("ST R0, R2, #0");
  emit("ADDI R2, R2, #1");
  emit("ADDI R6, R6, #1");

  label("itoa_pop_loop");
  emit("CMPI R5, #0");
  emit("JZX itoa_finish");
  emit("POP R0");
  emit("ST R0, R2, #0");
  emit("ADDI R2, R2, #1");
  emit("SUBI R5, R5, #1");
  emit("JMPX itoa_pop_loop");

  label("itoa_finish");
  emit("LI R0, #0");
  emit("ST R0, R2, #0");
  emit("MOV R0, R6");
  emit("POP R6");
  emit("POP R5");
  emit("JMP sys_push_r0");

  // SYS 21: TASK_SPAWN_VM(fn_pc, arg0) -> tid (1..7) or -1
  label("sys_21");
  emit("LI R3, #1"); // candidate tid = 1..7
  label("ts21_find_loop");
  emit("MULI R4, R3, #32");
  emitImm27(0, 0x002FFE00);
  emit("ADD R4, R0, R4"); // R4 = &TCB[tid]
  emit("LT R0, R4, #0");  // state
  emit("CMPI R0, #1");
  emit("JNZX ts21_found");
  emit("ADDI R3, R3, #1");
  emit("CMPI R3, #8");
  emit("JNX ts21_find_loop");
  emitImm27(0, 4294967295); // -1
  emit("JMP sys_push_r0");

  label("ts21_found");
  // Save candidate tid (R3) and &TCB[tid] (R4)
  emit("LI R0, #0");
  emit(`SW R3, R0, #${VAR_TMP0}`);
  emit(`SW R4, R0, #${VAR_TMP1}`);

  // sp_base = 0x140000 + tid * 0x6000 (24576)
  emitImm27(1, 0x006000);
  emit("MUL R1, R3, R1");
  emitImm27(2, 0x140000);
  emit("ADD R1, R1, R2"); // R1 = sp_base (VM offset)
  emit(`SW R1, R0, #${VAR_TMP2}`);
  emitImm27(2, TRITON_VM_BASE);
  emit("ADD R2, R1, R2"); // R2 = VM_BASE + sp_base
  // Copy arg0 from [R7 + 4 .. R7 + 7] to [VM_BASE + sp_base]
  emitCopy4Bytes(2, 0, 7, 4, 0);

  // csp_base = 0x178000 + tid * 0x2000 (8192)
  emit("LI R0, #0");
  emit(`LW R3, R0, #${VAR_TMP0}`);
  emit("MULI R2, R3, #8192");
  emitImm27(0, 0x178000);
  emit("ADD R2, R2, R0"); // R2 = csp_base (VM offset)
  emit("LI R0, #0");
  emit(`SW R2, R0, #${VAR_TMP3}`);
  emitImm27(0, TRITON_VM_BASE);
  emit("ADD R2, R2, R0"); // R2 = VM_BASE + csp_base
  // Write sentinel [-1, sp_base] at [VM_BASE + csp_base]
  emit("LI R0, #255");
  emit("ST R0, R2, #0");
  emit("ST R0, R2, #1");
  emit("ST R0, R2, #2");
  emit("ST R0, R2, #3");
  emit("LI R0, #0");
  emit(`LW R1, R0, #${VAR_TMP2}`); // sp_base
  emitStoreU32(1, 2, 4, 3, 4);

  // Populate TCB[tid] at R4
  emit("LI R0, #0");
  emit(`LW R4, R0, #${VAR_TMP1}`);
  emit("LI R1, #1");
  emit("ST R1, R4, #0");  // state = 1
  emit("LI R1, #0");
  emit("ST R1, R4, #1");
  emit("ST R1, R4, #2");
  emit("ST R1, R4, #3");
  // vm_pc = fn_pc (at [R7 + 0 .. R7 + 3])
  emitCopy4Bytes(4, 4, 7, 0, 0);
  // entry_pc = fn_pc
  emitCopy4Bytes(4, 24, 7, 0, 0);
  // vm_fp = sp_base
  emit("LI R0, #0");
  emit(`LW R1, R0, #${VAR_TMP2}`);
  emitStoreU32(1, 4, 12, 2, 3);
  // vm_sp = sp_base + 4
  emit("LI R0, #0");
  emit(`LW R1, R0, #${VAR_TMP2}`);
  emit("ADDI R1, R1, #4");
  emitStoreU32(1, 4, 8, 2, 3);
  // vm_csp = csp_base + 8
  emit("LI R0, #0");
  emit(`LW R1, R0, #${VAR_TMP3}`);
  emit("ADDI R1, R1, #8");
  emitStoreU32(1, 4, 16, 2, 3);
  // ticks = 0, exit_val = 0
  emit("LI R0, #0");
  emit("SW R0, R4, #20");
  emit("ST R0, R4, #23");
  emit("SW R0, R4, #28");
  emit("ST R0, R4, #31");

  // Increment num_active_tids at [0x0FFF04]
  emitImm27(1, 0x002FFF04);
  emit("LT R2, R1, #0");
  emit("ADDI R2, R2, #1");
  emit("ST R2, R1, #0");

  emit("LI R0, #0");
  emit(`LW R0, R0, #${VAR_TMP0}`); // return tid
  emit("JMP sys_push_r0");

  // ==========================================================================
  // 7. VM Task Exit / Halt
  // ==========================================================================
  label("vm_task_exit_or_halt");
  emitLoadS32(0, 7, -4, 1); // R0 = return value at TOS
  emitImm27(1, 0x002FFF00);
  emit("LT R2, R1, #0");    // R2 = cur_tid
  emit("CMPI R2, #0");
  emit("JZX vm_halt_with_r0");

  // Background task finished: mark TCB[cur_tid].state = 2 (HALTED), store exit_val, decrement num_active_tids
  emit("LI R3, #0");
  emit(`SW R2, R3, #${VAR_TMP0}`);
  emit("MULI R3, R2, #32");
  emitImm27(4, 0x002FFE00);
  emit("ADD R4, R4, R3");
  emit("LI R3, #2");
  emit("ST R3, R4, #0");    // state = 2
  emitWrapU32(0, 2);
  emitStoreU32(0, 4, 28, 2, 3); // exit_val
  emit("LT R2, R1, #4");
  emit("SUBI R2, R2, #1");
  emit("ST R2, R1, #4");    // num_active_tids--
  emit("JMP sched_pick_next");

  label("vm_halt_bad_op");
  emit("LI R0, #-99");

  label("vm_halt_with_r0");
  emit("PUSH R0");
  emitImm27(1, 0x002FFD20);
  emit("MOV R2, R5");
  emitStoreU32(2, 1, 0, 3, 4); // [0x0FFD20] = VM_ICNT
  emit("POP R0");
  emitWrapU32(0, 2);
  emitImm27(1, 0x002FFD28);
  emitStoreU32(0, 1, 0, 2, 3); // [0x0FFD28] = exitCode
  emitImm27(1, 0x002FFD2C);
  emit("LI R2, #1");
  emit("ST R2, R1, #0");       // [0x0FFD2C] = 1 (halted flag)
  emit("HALT");

  const asmSource = lines.join("\n") + "\n";
  const assembled = T.assemble(asmSource, { mode: "T3" });

  // Serialize Triton Core into a disk record for spiralos.img Sectors 960..1023 (0x078000..0x07FFFF):
  //   0x00..0x03: 'TRIT' (0x54495254)
  //   0x04..0x07: tryteCount (u32 le)
  //   0x08..0x0B: entryPc (u32 le, 36 = boot_rom_entry)
  //   0x0C..0x0F: reserved (0)
  //   0x10..    : tryteCount * 2 bytes (u16 le: tryte + 9841)
  const tryteCount = assembled.trytes.length;
  const diskRecordBytes = new Uint8Array(16 + tryteCount * 2);
  const recDV = new DataView(diskRecordBytes.buffer);
  recDV.setUint32(0, 0x54495254, true); // 'TRIT'
  recDV.setUint32(4, tryteCount, true);
  recDV.setUint32(8, 0, true);         // boot_rom_entry
  recDV.setUint32(12, 0, true);
  for (let i = 0; i < tryteCount; i++) {
    const u = (assembled.trytes[i] + 9841) & 0xFFFF;
    recDV.setUint16(16 + i * 2, u, true);
  }
  if (diskRecordBytes.length > TRITON_CORE_MAX_BYTES) {
    throw new Error(`Triton Core disk record (${diskRecordBytes.length} B) exceeds reserved 32 KB slot`);
  }

  return {
    trytes: assembled.trytes,
    tryteCount,
    diskRecordBytes,
    symbols: assembled.symbols,
    asmSource,
    bootRomTrytes: assembled.trytes.slice(0, 96)
  };
}

// Read-only VM memory mapping helper for conformance tests (reads Mem[TRITON_VM_BASE .. +0x400000])
function readTritonVmRam(tritonVm) {
  const buf = new Uint8Array(TRITON_VM_SIZE);
  const src = tritonVm.mem;
  for (let i = 0; i < TRITON_VM_SIZE; i++) {
    buf[i] = src[TRITON_VM_BASE + i] & 0xFF;
  }
  return buf;
}

function readTritonVmInt32(tritonVm, vmOffset) {
  const base = TRITON_VM_BASE + (vmOffset & TRITON_VM_MASK);
  const b0 = tritonVm.mem[base] & 0xFF;
  const b1 = tritonVm.mem[base + 1] & 0xFF;
  const b2 = tritonVm.mem[base + 2] & 0xFF;
  const b3 = tritonVm.mem[base + 3] & 0xFF;
  return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) | 0;
}

function readTritonVmUint32(tritonVm, vmOffset) {
  return readTritonVmInt32(tritonVm, vmOffset) >>> 0;
}

// Mount a 1.44 MB spiralos.img onto a Triton machine's block disk (1 byte per tryte across 729-tryte sectors)
// and load the 96-tryte Stage-0 Boot ROM at Mem[0..95]
function mountSpiralDiskOnTriton(tritonVm, imgBytes, core = null) {
  const tritonCore = core || buildTritonCore();
  tritonVm.reset(false);
  const n = Math.min(imgBytes.length, tritonVm.disk.length);
  for (let i = 0; i < n; i++) {
    tritonVm.disk[i] = imgBytes[i] & 0xFF;
  }
  // Load only the 96-tryte Stage-0 Boot ROM; it unpacks the full Triton Core from Disk[0x078000]
  tritonVm.loadProgram(tritonCore.bootRomTrytes, 0);
}

// Extract the 1.44 MB spiralos.img from a Triton machine's block disk
function extractSpiralDiskFromTriton(tritonVm, byteLength = 1474560) {
  const out = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    out[i] = tritonVm.disk[i] & 0xFF;
  }
  return out;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildTritonCore,
    readTritonVmRam,
    readTritonVmInt32,
    readTritonVmUint32,
    mountSpiralDiskOnTriton,
    extractSpiralDiskFromTriton,
    TRITON_RAM_SIZE,
    TRITON_VM_BASE,
    TRITON_VM_SIZE,
    TRITON_VM_MASK,
    TRITON_IMG_DISK_SECT,
    TRITON_IMG_DISK_OFF,
    TRITON_CORE_MAX_BYTES,
    TRITON_FB_BASE,
    TRITON_FB_WIDTH,
    TRITON_FB_HEIGHT,
    TRITON_FB_X_OFF,
    TRITON_FB_Y_OFF,
    TRITON_FB_START,
    TRITON_BORDER_COLOR,
    TRITON_STEPS_PER_MS,
    TAB_PAL_LUT
  };
}
if (typeof globalThis !== "undefined") {
  globalThis.buildTritonCore = buildTritonCore;
}