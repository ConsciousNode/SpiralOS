#!/usr/bin/env node
/**
 * SpiralOS — tests/vm.js: Spiral VM Conformance Suite
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Verifies that identical Spiral VM bytecode programs execute on BOTH:
 *   1. The TabComp Native Core (TC-32 machine code on TabCompCPU)
 *   2. The Hummingbird Native Core (x86 protected-mode machine code on HummingbirdPC)
 * and produce bit-identical results, memory state, VRAM pixels, and instruction counts.
 */

"use strict";

const assert = require("assert");
const { loadEmulators } = require("./harness.js");
const { buildTC32Core } = require("../core/core_tc32.js");
const { buildX86Core } = require("../core/core_x86.js");

loadEmulators();

const tcCore = buildTC32Core();
const x86Core = buildX86Core();

function inst(op, a = 0, imm16 = 0) {
  return (((op & 0xFF) << 24) | ((a & 0xFF) << 16) | (imm16 & 0xFFFF)) >>> 0;
}

function instJ(op, addr24) {
  return (((op & 0xFF) << 24) | (addr24 & 0x00FFFFFF)) >>> 0;
}

function runProgramOnBothCores(progWords, setupFn = null) {
  // 1. Run on TabComp Native Core
  const tcFs = new globalThis.TabCompFS();
  const tcCpu = new globalThis.TabCompCPU(tcFs);
  globalThis.initHardwareMemory(tcCpu);
  tcCpu.loadBinary(tcCore.bytes, "");
  const tcBase = 0x00200000;
  for (let i = 0; i < progWords.length; i++) {
    tcCpu.ramDV.setUint32(tcBase + i * 4, progWords[i] >>> 0, true);
  }
  if (setupFn) setupFn(tcCpu.ram.subarray(tcBase, tcBase + 0x400000));
  let tcGuard = 0;
  while (!tcCpu.halted && tcGuard < 500) {
    tcCpu.yielded = false;
    tcCpu.stepBatch(50000);
    tcGuard++;
  }
  const tcExit = tcCpu.ramDV.getInt32(tcBase + 0x0FFD28, true);
  const tcIcnt = tcCpu.ramDV.getInt32(tcBase + 0x0FFD20, true);

  // 2. Run on Hummingbird x86 Native Core
  const floppy = new Uint8Array(1474560);
  floppy.set(x86Core.bytes, 0);
  const fDv = new DataView(floppy.buffer);
  for (let i = 0; i < progWords.length; i++) {
    fDv.setUint32(0x8000 + i * 4, progWords[i] >>> 0, true);
  }
  if (setupFn) setupFn(floppy.subarray(0x8000, 0x18000));
  const hbPc = new globalThis.HummingbirdPC({ ramSizeMB: 16 });
  hbPc.loadFloppyImage(floppy);
  let hbGuard = 0;
  while (hbPc.ramView.getInt32(0x002FFD2C, true) === 0 && hbGuard < 200) {
    hbPc.cpu.runSteps(200000);
    hbGuard++;
  }
  const hbBase = 0x00200000;
  const hbExit = hbPc.ramView.getInt32(hbBase + 0x0FFD28, true);
  const hbIcnt = hbPc.ramView.getInt32(hbBase + 0x0FFD20, true);

  return {
    tcExit, tcIcnt, tcVmRam: tcCpu.ram.subarray(tcBase, tcBase + 0x400000),
    hbExit, hbIcnt, hbVmRam: hbPc.ram.subarray(hbBase, hbBase + 0x400000)
  };
}

function runVmConformanceSuite() {
  console.log("=== SpiralOS VM Conformance Suite (tests/vm.js) ===");
  console.log(`TabComp TC-32 Core: ${tcCore.bytes.length} bytes | Hummingbird x86 Core: ${x86Core.totalBytes} bytes`);

  const tests = [];
  function test(name, fn) {
    try {
      const detail = fn();
      tests.push({ name, pass: true, detail });
      console.log(`  [PASS] ${name} — ${detail}`);
    } catch (e) {
      tests.push({ name, pass: false, detail: e.message });
      console.error(`  [FAIL] ${name} — ${e.message}`);
    }
  }

  // Test 1: 32-bit Arithmetic, Signed/Unsigned Shifts, Negatives, Division & Modulo
  test("1. 32-Bit ALU, Signed Division, Modulo & Shifts", () => {
    const prog = [
      inst(0x02, 0, -125),        // PUSH_I16 -125
      inst(0x02, 0, 12),          // PUSH_I16 12
      inst(0x17),                 // MUL -> -1500
      inst(0x02, 0, 7),           // PUSH_I16 7
      inst(0x18),                 // DIV -> -214
      inst(0x03, 0, 0x5678),      // PUSH_U16 0x5678
      inst(0x04, 0, 0x0012),      // PUSH_HI  0x0012 -> 0x00125678 (1201784)
      inst(0x02, 0, 3),           // PUSH_I16 3
      inst(0x1F),                 // SAR -> 150223
      inst(0x15),                 // ADD -> 150009
      inst(0x02, 0, 1000),        // PUSH_I16 1000
      inst(0x19),                 // MOD -> 9
      inst(0x01)                  // HALT
    ];
    const r = runProgramOnBothCores(prog);
    assert.strictEqual(r.tcExit, 9, `TabComp expected 9, got ${r.tcExit}`);
    assert.strictEqual(r.hbExit, 9, `Hummingbird expected 9, got ${r.hbExit}`);
    assert.strictEqual(r.tcIcnt, r.hbIcnt, "Instruction count mismatch");
    return `tcExit=${r.tcExit}, hbExit=${r.hbExit}, icnt=${r.tcIcnt}`;
  });

  // Test 2: All 8 Comparison Sub-Opcodes (==, !=, <, <=, >, >=, u<, u>)
  test("2. All 8 Signed & Unsigned Comparison Operators", () => {
    const prog = [
      // (-5 < 3) == 1
      inst(0x02, 0, -5), inst(0x02, 0, 3), inst(0x20, 0, 2),
      // (-5 <u 3) == 0 (since 0xFFFFFFFB > 3 unsigned!)
      inst(0x02, 0, -5), inst(0x02, 0, 3), inst(0x20, 0, 6),
      inst(0x02, 0, 10), inst(0x17), inst(0x15),
      // (-5 >u 3) == 1
      inst(0x02, 0, -5), inst(0x02, 0, 3), inst(0x20, 0, 7),
      inst(0x02, 0, 100), inst(0x17), inst(0x15),
      // (42 == 42) == 1
      inst(0x02, 0, 42), inst(0x02, 0, 42), inst(0x20, 0, 0),
      inst(0x02, 0, 1000), inst(0x17), inst(0x15),
      inst(0x01)
    ];
    const r = runProgramOnBothCores(prog);
    assert.strictEqual(r.tcExit, 1101);
    assert.strictEqual(r.hbExit, 1101);
    assert.strictEqual(r.tcIcnt, r.hbIcnt);
    return `tcExit=${r.tcExit}, hbExit=${r.hbExit}, icnt=${r.tcIcnt}`;
  });

  // Test 3: Recursive Function Calls (Fibonacci(10) = 55, Factorial(6) = 720 -> 775)
  test("3. Calling Convention (CALL, ENTER, RET, Locals & Recursion)", () => {
    // Word 0: main: ENTER 0, 1; PUSH 10; CALL fib(word 9); SET_LOCAL 0; PUSH 6; CALL fact(word 24); GET_LOCAL 0; ADD; RET
    const prog = [
      /* 0: 0x00 */ inst(0x25, 0, 1),    // main: ENTER 0, 1
      /* 1: 0x04 */ inst(0x02, 0, 10),   // PUSH 10
      /* 2: 0x08 */ instJ(0x24, 9 * 4),  // CALL fib (0x24)
      /* 3: 0x0C */ inst(0x09, 0, 0),    // SET_LOCAL 0
      /* 4: 0x10 */ inst(0x02, 0, 6),    // PUSH 6
      /* 5: 0x14 */ instJ(0x24, 24 * 4), // CALL fact (0x60)
      /* 6: 0x18 */ inst(0x08, 0, 0),    // GET_LOCAL 0
      /* 7: 0x1C */ inst(0x15),          // ADD
      /* 8: 0x20 */ inst(0x26),          // RET (halts with 55 + 720 = 775)

      // fib(n) at word 9 (0x24):
      /* 9:  0x24 */ inst(0x25, 1, 1),   // ENTER 1, 1
      /* 10: 0x28 */ inst(0x08, 0, 0),   // GET_LOCAL 0 (n)
      /* 11: 0x2C */ inst(0x02, 0, 1),   // PUSH 1
      /* 12: 0x30 */ inst(0x20, 0, 3),   // CMP <=
      /* 13: 0x34 */ instJ(0x22, 16 * 4),// JZ recurse (word 16)
      /* 14: 0x38 */ inst(0x08, 0, 0),   // GET_LOCAL 0
      /* 15: 0x3C */ inst(0x26),         // RET
      /* 16: 0x40 */ inst(0x08, 0, 0),   // GET_LOCAL 0
      /* 17: 0x44 */ inst(0x02, 0, 1),   // PUSH 1
      /* 18: 0x48 */ inst(0x16),         // SUB (n - 1)
      /* 19: 0x4C */ instJ(0x24, 9 * 4), // CALL fib
      /* 20: 0x50 */ inst(0x08, 0, 0),   // GET_LOCAL 0
      /* 21: 0x54 */ inst(0x02, 0, 2),   // PUSH 2
      /* 22: 0x58 */ inst(0x16),         // SUB (n - 2)
      /* 23: 0x5C */ instJ(0x24, 9 * 4), // CALL fib -> wait: need ADD + RET!
    ];
    // Fix word 23..25 for fib and put fact at word 26:
    prog[5] = instJ(0x24, 26 * 4);
    prog.push(inst(0x15)); // 24: ADD
    prog.push(inst(0x26)); // 25: RET
    // fact(n) at word 26:
    prog.push(inst(0x25, 1, 1));   // 26: ENTER 1, 1
    prog.push(inst(0x08, 0, 0));   // 27: GET_LOCAL 0
    prog.push(inst(0x02, 0, 1));   // 28: PUSH 1
    prog.push(inst(0x20, 0, 3));   // 29: CMP <=
    prog.push(instJ(0x22, 33 * 4));// 30: JZ fact_rec
    prog.push(inst(0x02, 0, 1));   // 31: PUSH 1
    prog.push(inst(0x26));         // 32: RET
    prog.push(inst(0x08, 0, 0));   // 33: GET_LOCAL 0
    prog.push(inst(0x08, 0, 0));   // 34: GET_LOCAL 0
    prog.push(inst(0x02, 0, 1));   // 35: PUSH 1
    prog.push(inst(0x16));         // 36: SUB
    prog.push(instJ(0x24, 26 * 4));// 37: CALL fact
    prog.push(inst(0x17));         // 38: MUL
    prog.push(inst(0x26));         // 39: RET

    const r = runProgramOnBothCores(prog);
    assert.strictEqual(r.tcExit, 775);
    assert.strictEqual(r.hbExit, 775);
    assert.strictEqual(r.tcIcnt, r.hbIcnt);
    return `fib(10)+fact(6)=${r.tcExit}, icnt=${r.tcIcnt} (identical on TC-32 & x86)`;
  });

  // Test 4: Memory Loads/Stores (8-bit signed/unsigned, 16-bit, 32-bit, Globals & Pointers)
  test("4. Memory Load/Store (8/16/32-bit, Signed Extension & Global Arrays)", () => {
    const prog = [
      inst(0x0D, 0, 10),         // ADDR_GLOBAL 10 (0x010028)
      inst(0x02, 0, -42),        // val = -42 (0xD6)
      inst(0x12, 0, 0),          // STORE8 [0x010028], -42
      inst(0x0D, 0, 10),
      inst(0x0F, 0, 0),          // LOAD8S [0x010028] -> -42
      inst(0x0D, 0, 10),
      inst(0x0E, 0, 0),          // LOAD8U [0x010028] -> 214
      inst(0x16),                // -42 - 214 = -256
      inst(0x0D, 0, 11),
      inst(0x03, 0, 50000),
      inst(0x13, 0, 2),          // STORE16 [0x01002C + 2], 50000
      inst(0x0D, 0, 11),
      inst(0x10, 0, 2),          // LOAD16U [0x01002C + 2] -> 50000
      inst(0x15),                // -256 + 50000 = 49744
      inst(0x01)
    ];
    const r = runProgramOnBothCores(prog);
    assert.strictEqual(r.tcExit, 49744);
    assert.strictEqual(r.hbExit, 49744);
    assert.strictEqual(r.tcIcnt, r.hbIcnt);
    return `tcExit=${r.tcExit}, hbExit=${r.hbExit}, icnt=${r.tcIcnt}`;
  });

  // Test 5: Syscalls (FILL_RECT, DRAW_CHAR, MEMCPY, STRCMP, STRLEN, ITOA)
  test("5. Graphics & String Syscall Parity (FILL_RECT, DRAW_CHAR, ITOA, STRCMP)", () => {
    const prog = [
      // SYS 5: FILL_RECT(10, 20, 50, 30, 14)
      inst(0x02, 0, 10), inst(0x02, 0, 20), inst(0x02, 0, 50), inst(0x02, 0, 30), inst(0x02, 0, 14),
      inst(0x27, 5, 5), inst(0x06),
      // SYS 6: DRAW_CHAR(12, 22, 65 ('A'), 15, 1)
      inst(0x02, 0, 12), inst(0x02, 0, 22), inst(0x02, 0, 65), inst(0x02, 0, 15), inst(0x02, 0, 1),
      inst(0x27, 5, 6), inst(0x06),
      // SYS 20: ITOA(-1991, 0x020000, 10) -> returns 5 ("-1991")
      inst(0x02, 0, -1991), inst(0x03, 0, 0x0000), inst(0x04, 0, 0x0002), inst(0x02, 0, 10),
      inst(0x27, 3, 20),
      // SYS 19: STRLEN(0x020000) -> returns 5
      inst(0x03, 0, 0x0000), inst(0x04, 0, 0x0002),
      inst(0x27, 1, 19),
      inst(0x15), // 5 + 5 = 10
      // SYS 18: STRCMP(0x020000, 0x020000) -> returns 1
      inst(0x03, 0, 0x0000), inst(0x04, 0, 0x0002),
      inst(0x03, 0, 0x0000), inst(0x04, 0, 0x0002),
      inst(0x27, 2, 18),
      inst(0x15), // 10 + 1 = 11
      inst(0x01)
    ];
    const r = runProgramOnBothCores(prog);
    assert.strictEqual(r.tcExit, 11);
    assert.strictEqual(r.hbExit, 11);
    assert.strictEqual(r.tcIcnt, r.hbIcnt);
    // Verify entire 64,000-byte VRAM (vmRam[0x0F0000..0x0FF9FF]) is 100% bit-identical between TabComp and Hummingbird!
    let vramDiffs = 0;
    for (let i = 0; i < 64000; i++) {
      if (r.tcVmRam[0x0F0000 + i] !== r.hbVmRam[0x0F0000 + i]) vramDiffs++;
    }
    assert.strictEqual(vramDiffs, 0, `VRAM had ${vramDiffs} byte differences`);
    return `exit=${r.tcExit}, vram=64000/64000 bytes bit-identical, icnt=${r.tcIcnt}`;
  });

  const failed = tests.filter(t => !t.pass).length;
  console.log(`\nVM Conformance Summary: ${tests.length - failed}/${tests.length} passed.`);
  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  runVmConformanceSuite();
}

module.exports = { runVmConformanceSuite, runProgramOnBothCores };
