#!/usr/bin/env node
/**
 * SpiralOS — tests/determinism.js: Bit-Identical Determinism Suite (§8)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Verifies that identical initial images and scripted input sequences produce
 * 100% bit-identical VM memory, framebuffers, and instruction counts across
 * repeated runs on both TabComp (TC-32) and Hummingbird (i586), and also
 * runs TabComp's built-in 19-part self-test suite.
 */

"use strict";

const assert = require("assert");
const { loadEmulators, sha256Hex } = require("./harness.js");
const { buildSpiralOSImage } = require("../tools/build.js");

loadEmulators();

function runScriptedTabComp(img) {
  const cpu = new globalThis.TabCompCPU(new globalThis.TabCompFS());
  globalThis.initHardwareMemory(cpu);
  globalThis.bootSpiralDiskImage(cpu, img);

  function stepFrames(n) {
    const t = cpu.presentCount + n;
    while (cpu.presentCount < t && !cpu.halted) {
      cpu.yielded = false;
      cpu.stepBatch(50000);
    }
  }

  stepFrames(3);
  // Move mouse, click Launcher, open Calculator, compute 42 * 10
  cpu.setMouseState(24, 6, 1); stepFrames(1);
  cpu.setMouseState(24, 6, 0); stepFrames(1);
  cpu.setMouseState(40, 70, 1); stepFrames(1);
  cpu.setMouseState(40, 70, 0); stepFrames(1);
  for (const ch of "42*10=") {
    const c = ch.charCodeAt(0);
    cpu.pushKeyEvent(1, c, c, 0); stepFrames(1);
    cpu.pushKeyEvent(0, c, c, 0); stepFrames(1);
  }
  stepFrames(2);

  return {
    vramHash: sha256Hex(cpu.ram.subarray(0x002F0000, 0x002F0000 + 64000)),
    vmRamHash: sha256Hex(cpu.ram.subarray(0x00200000, 0x00380000)),
    nativeInst: cpu.jitInstCount + cpu.interpInstCount,
    vmInst: cpu.ramDV.getInt32(0x002FFD20, true)
  };
}

function runScriptedHummingbird(img) {
  const pc = new globalThis.HummingbirdPC({ ramSizeMB: 16, deterministic: true });
  pc.loadFloppyImage(img);
  const vmBase = 0x00200000;

  while (pc.ramView.getInt32(vmBase + 0x0FFD04, true) < 3) {
    pc.cpu.runSteps(200000);
  }
  pc.ps2.sendMousePacket(12, -8, 0);
  pc.cpu.runSteps(500000);
  pc.ps2.sendKeyScancode(0x19); // 'p'
  pc.cpu.runSteps(500000);
  pc.ps2.sendKeyScancode(0x99);
  pc.cpu.runSteps(500000);

  return {
    vramHash: sha256Hex(pc.ram.subarray(0x002F0000, 0x002F0000 + 64000)),
    lfbHash: sha256Hex(pc.vga.vbeLfb.subarray(0, 640 * 480 * 4)),
    vmRamHash: sha256Hex(pc.ram.subarray(0x00200000, 0x00380000)),
    nativeInst: pc.cpu.totalInstructions,
    cycles: pc.cpu.cycles,
    vmInst: pc.ramView.getInt32(0x002FFD20, true)
  };
}

async function runDeterminismSuite() {
  console.log("=== SpiralOS Determinism & Emulator Regression Suite (tests/determinism.js) ===");
  const { img } = buildSpiralOSImage();

  // 1. TabComp Determinism (Run 1 vs Run 2)
  const tc1 = runScriptedTabComp(img);
  const tc2 = runScriptedTabComp(img);
  assert.strictEqual(tc1.vramHash, tc2.vramHash, "TabComp VRAM hash mismatch across runs");
  assert.strictEqual(tc1.vmRamHash, tc2.vmRamHash, "TabComp VM RAM hash mismatch across runs");
  assert.strictEqual(tc1.nativeInst, tc2.nativeInst, "TabComp instruction count mismatch");
  assert.strictEqual(tc1.vmInst, tc2.vmInst, "TabComp VM instruction count mismatch");
  console.log(`  [PASS] 1. TabComp Determinism: Run 1 == Run 2 bit-identical (VM inst=${tc1.vmInst}, VRAM SHA-256=${tc1.vramHash.slice(0, 24)}...)`);

  // 2. Hummingbird Determinism (Run 1 vs Run 2)
  const hb1 = runScriptedHummingbird(img);
  const hb2 = runScriptedHummingbird(img);
  assert.strictEqual(hb1.vramHash, hb2.vramHash, "Hummingbird VRAM hash mismatch across runs");
  assert.strictEqual(hb1.lfbHash, hb2.lfbHash, "Hummingbird VBE LFB hash mismatch across runs");
  assert.strictEqual(hb1.vmRamHash, hb2.vmRamHash, "Hummingbird VM RAM hash mismatch across runs");
  assert.strictEqual(hb1.nativeInst, hb2.nativeInst, "Hummingbird x86 instruction count mismatch");
  assert.strictEqual(hb1.cycles, hb2.cycles, "Hummingbird cycle count mismatch");
  console.log(`  [PASS] 2. Hummingbird Determinism: Run 1 == Run 2 bit-identical (x86 inst=${hb1.nativeInst}, LFB SHA-256=${hb1.lfbHash.slice(0, 24)}...)`);

  // 3. Existing TabComp 19-Part Self-Test Suite
  const tcSelf = await globalThis.TABCOMP_SELFTEST();
  assert.strictEqual(tcSelf.failed, 0, `TabComp self-test failed: ${JSON.stringify(tcSelf.results.filter(r => !r.pass))}`);
  console.log(`  [PASS] 3. Existing TabComp Regression Suite: ${tcSelf.passed}/${tcSelf.passed + tcSelf.failed} passed`);
}

if (require.main === module) {
  runDeterminismSuite();
}

module.exports = { runDeterminismSuite };
