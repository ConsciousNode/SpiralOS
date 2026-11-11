#!/usr/bin/env node
/**
 * SpiralOS 1.1 — tests/bootstrap.js: 3-Stage Self-Hosting Compiler Bootstrap Fixed Point (§1 & §6)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Verifies the classic self-hosting compiler fixed-point proof on BOTH TabComp (TC-32)
 * and Hummingbird (i586 Protected Mode):
 *   1. stage1 = the in-OS compiler (/src/*.sp), compiled by the JS stage-0 compiler.
 *   2. stage2 = the in-OS compiler, compiled by stage1 INSIDE SpiralOS.
 *   3. stage3 = the in-OS compiler, compiled by stage2 INSIDE SpiralOS (after rebooting into stage2).
 *   4. Asserts stage2 and stage3 are 100% byte-identical on TabComp, on Hummingbird,
 *      and identical across the two machines (and also identical to stage1).
 */

"use strict";

const path = require("path");
const assert = require("assert");
const { loadEmulators, sha256Hex } = require("./harness.js");
const { buildSpiralOSImage } = require("../tools/build.js");

loadEmulators();

function sendShellCmdTabComp(cpu, cmd) {
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd.charCodeAt(i);
    cpu.pushKeyEvent(1, c, c, 0);
    cpu.pushKeyEvent(0, c, c, 0);
  }
  cpu.pushKeyEvent(1, 13, 13, 0);
  cpu.pushKeyEvent(0, 13, 13, 0);
  const target = cpu.presentCount + cmd.length * 2 + 3;
  while (cpu.presentCount < target && !cpu.halted) {
    cpu.yielded = false;
    cpu.stepBatch(200000);
  }
}

function sendShellCmdHummingbird(pc, cmd) {
  const vmBase = 0x00200000;
  const scMap = {
    c: 0x2E, r: 0x13, e: 0x12, b: 0x30, u: 0x16, i: 0x17, l: 0x26, d: 0x20,
    o: 0x18, t: 0x14, "\r": 0x1C
  };
  for (const ch of cmd + "\r") {
    const sc = scMap[ch];
    pc.ps2.sendKeyScancode(sc);
    let f = pc.ramView.getInt32(vmBase + 0x0FFD04, true);
    while (pc.ramView.getInt32(vmBase + 0x0FFD04, true) <= f) {
      pc.cpu.runSteps(200000);
    }
    pc.ps2.sendKeyScancode(sc | 0x80);
    f = pc.ramView.getInt32(vmBase + 0x0FFD04, true);
    while (pc.ramView.getInt32(vmBase + 0x0FFD04, true) <= f) {
      pc.cpu.runSteps(200000);
    }
  }
}

function runBootstrapSuite() {
  console.log("=== SpiralOS 1.1 Three-Stage Bootstrap Fixed-Point Suite (tests/bootstrap.js) ===");
  const rootDir = path.resolve(__dirname, "..");
  const { img, compiled } = buildSpiralOSImage(rootDir);
  const vmBase = 0x00200000;

  // Stage 1: SPIR image built by JS stage-0 compiler (compiler/spiralc.js)
  const stage1Bytes = new Uint8Array(img.subarray(0x8000, 0x28000));
  const stage1Hash = sha256Hex(stage1Bytes);
  console.log(`  Stage 1 (JS Stage-0 -> SPIR) : ${stage1Hash} (${compiled.codeBytes} code B, ${compiled.stringBytes} str B, ${compiled.funcCount} funcs)`);

  // --------------------------------------------------------------------------
  // 1. TabComp (TC-32): Stage 1 -> Stage 2 -> Reboot -> Stage 3
  // --------------------------------------------------------------------------
  const tcCpu = new globalThis.TabCompCPU(new globalThis.TabCompFS());
  globalThis.initHardwareMemory(tcCpu);
  globalThis.bootSpiralDiskImage(tcCpu, img);
  while (tcCpu.presentCount < 2) { tcCpu.yielded = false; tcCpu.stepBatch(50000); }

  // Overwrite SPIR sectors on disk with zeros before compiling Stage 2 to prove Stage 1 generates all 128 KB from scratch
  tcCpu.ram.fill(0, 0x00408000, 0x00428000);
  tcCpu.spiralDiskImage.fill(0, 0x8000, 0x28000);

  const tTc2 = Date.now();
  sendShellCmdTabComp(tcCpu, "cc");
  const tcStage2Ms = Date.now() - tTc2;
  const tcStage2Bytes = new Uint8Array(tcCpu.spiralDiskImage.subarray(0x8000, 0x28000));
  const tcStage2Hash = sha256Hex(tcStage2Bytes);
  console.log(`  TabComp Stage 2 (Stage 1->2) : ${tcStage2Hash} (${tcStage2Ms} ms)`);

  // Reboot TabComp into Stage 2 and compile Stage 3 from inside Stage 2!
  const rebootsBefore = tcCpu.rebootCount;
  sendShellCmdTabComp(tcCpu, "reboot");
  while (tcCpu.presentCount < 2) { tcCpu.yielded = false; tcCpu.stepBatch(50000); }
  assert.ok(tcCpu.rebootCount > rebootsBefore, "TabComp must warm-reboot into Stage 2");

  // Again clear SPIR sectors on disk before Stage 2 compiles Stage 3
  tcCpu.ram.fill(0, 0x00408000, 0x00428000);
  tcCpu.spiralDiskImage.fill(0, 0x8000, 0x28000);

  const tTc3 = Date.now();
  sendShellCmdTabComp(tcCpu, "cc");
  const tcStage3Ms = Date.now() - tTc3;
  const tcStage3Bytes = new Uint8Array(tcCpu.spiralDiskImage.subarray(0x8000, 0x28000));
  const tcStage3Hash = sha256Hex(tcStage3Bytes);
  console.log(`  TabComp Stage 3 (Stage 2->3) : ${tcStage3Hash} (${tcStage3Ms} ms)`);

  assert.strictEqual(tcStage2Hash, tcStage3Hash, "TabComp Stage 2 and Stage 3 must be 100% byte-identical");
  assert.strictEqual(stage1Hash, tcStage2Hash, "Stage 1 and TabComp Stage 2 must be 100% byte-identical");

  // --------------------------------------------------------------------------
  // 2. Hummingbird (i586): Stage 1 -> Stage 2 -> Reboot -> Stage 3
  // --------------------------------------------------------------------------
  const hbPc = new globalThis.HummingbirdPC({ ramSizeMB: 16 });
  hbPc.loadFloppyImage(img);
  while (hbPc.ramView.getInt32(vmBase + 0x0FFD04, true) < 2) {
    hbPc.cpu.runSteps(200000);
  }

  // Clear SPIR sectors on floppy and mounted image before compiling Stage 2 on Hummingbird
  hbPc.ram.fill(0, 0x00408000, 0x00428000);
  hbPc.floppyImage.fill(0, 0x8000, 0x28000);

  const tHb2 = Date.now();
  sendShellCmdHummingbird(hbPc, "cc");
  const hbStage2Ms = Date.now() - tHb2;
  const hbStage2Bytes = new Uint8Array(hbPc.floppyImage.subarray(0x8000, 0x28000));
  const hbStage2Hash = sha256Hex(hbStage2Bytes);
  console.log(`  Hummingbird Stage 2 (1 -> 2) : ${hbStage2Hash} (${hbStage2Ms} ms)`);

  // Reboot Hummingbird into Stage 2 and compile Stage 3 from inside Stage 2!
  const hbRebootsBefore = hbPc.rebootCount;
  const scReboot = [0x13, 0x12, 0x30, 0x18, 0x18, 0x14, 0x1C]; // "reboot\r"
  for (const sc of scReboot) {
    hbPc.ps2.sendKeyScancode(sc);
    hbPc.ps2.sendKeyScancode(sc | 0x80);
  }
  let guard = 0;
  while ((hbPc.rebootCount === hbRebootsBefore || hbPc.ramView.getInt32(vmBase + 0x0FFD04, true) < 2) && guard < 400) {
    hbPc.cpu.runSteps(250000);
    guard++;
  }

  // Clear SPIR sectors on floppy and mounted image before Stage 2 compiles Stage 3
  hbPc.ram.fill(0, 0x00408000, 0x00428000);
  hbPc.floppyImage.fill(0, 0x8000, 0x28000);

  const tHb3 = Date.now();
  sendShellCmdHummingbird(hbPc, "cc");
  const hbStage3Ms = Date.now() - tHb3;
  const hbStage3Bytes = new Uint8Array(hbPc.floppyImage.subarray(0x8000, 0x28000));
  const hbStage3Hash = sha256Hex(hbStage3Bytes);
  console.log(`  Hummingbird Stage 3 (2 -> 3) : ${hbStage3Hash} (${hbStage3Ms} ms)`);

  assert.strictEqual(hbStage2Hash, hbStage3Hash, "Hummingbird Stage 2 and Stage 3 must be 100% byte-identical");
  assert.strictEqual(tcStage3Hash, hbStage3Hash, "TabComp Stage 3 and Hummingbird Stage 3 must be 100% byte-identical across machines");

  console.log(`  [PASS] Bootstrap Fixed Point Verified: Stage 1 == Stage 2 == Stage 3 across TabComp & Hummingbird (131,072 / 131,072 bytes identical)!`);
}

if (require.main === module) {
  runBootstrapSuite();
}

module.exports = { runBootstrapSuite };
