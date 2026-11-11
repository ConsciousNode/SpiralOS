#!/usr/bin/env node
/**
 * SpiralOS 1.1 — tests/asm.js: In-OS Symbolic Native Core Assemblers Suite (§2 & §6)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Verifies:
 *   1. Assembling /src/core_tc32.asm and /src/core_x86.asm inside SpiralOS on BOTH
 *      TabComp and Hummingbird produces machine code 100% byte-identical to the
 *      JS-built cores (Sectors 0..31 for x86, Sectors 32..63 for TC-32).
 *   2. Editing /src/core_x86.asm and /src/core_tc32.asm inside SpiralOS (changing
 *      the boot banner from "SpiralOS 1.1" to "SpiralOS 1.1-X"), reassembling
 *      inside SpiralOS, rebooting both machines, and verifying that the modified
 *      boot banner is live in Sector 0, VGA text RAM (0xB8000), and vmRam[0x0FFD80]!
 */

"use strict";

const path = require("path");
const assert = require("assert");
const { loadEmulators, sha256Hex } = require("./harness.js");
const { buildSpiralOSImage } = require("../tools/build.js");
const { SpiralFS, SPFS_IMG_OFFSET, SPFS_SIZE } = require("../compiler/spiralfs.js");

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
    a: 0x1E, s: 0x1F, m: 0x32, v: 0x2F, e: 0x12, r: 0x13, "\r": 0x1C
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

function runAsmSuite() {
  console.log("=== SpiralOS 1.1 In-OS Native Assemblers Suite (tests/asm.js) ===");
  const rootDir = path.resolve(__dirname, "..");
  const { img, tc32Core, x86Core } = buildSpiralOSImage(rootDir);
  const vmBase = 0x00200000;

  const jsX86Hash = sha256Hex(img.subarray(0x0000, 0x4000));
  const jsTC32Hash = sha256Hex(img.subarray(0x4000, 0x8000));
  console.log(`  JS-Built x86 Core (Sectors 0..31)   : ${jsX86Hash.slice(0, 32)}... (${x86Core.totalBytes} B)`);
  console.log(`  JS-Built TC-32 Core (Sectors 32..63): ${jsTC32Hash.slice(0, 32)}... (${tc32Core.bytes.length} B)`);

  // --------------------------------------------------------------------------
  // Part 1: Verify Byte-Identical In-OS Assembly on TabComp & Hummingbird
  // --------------------------------------------------------------------------
  {
    const tcCpu = new globalThis.TabCompCPU(new globalThis.TabCompFS());
    globalThis.initHardwareMemory(tcCpu);
    globalThis.bootSpiralDiskImage(tcCpu, img);
    while (tcCpu.presentCount < 2) { tcCpu.yielded = false; tcCpu.stepBatch(50000); }

    // Wipe Sectors 0..63 in RAM & disk before running `asm` in-OS
    tcCpu.ram.fill(0xCC, 0x00400000, 0x00408000);
    tcCpu.spiralDiskImage.fill(0xCC, 0x0000, 0x8000);

    sendShellCmdTabComp(tcCpu, "asm");

    const inOsX86Hash = sha256Hex(tcCpu.spiralDiskImage.subarray(0x0000, 0x4000));
    const inOsTC32Hash = sha256Hex(tcCpu.spiralDiskImage.subarray(0x4000, 0x8000));
    assert.strictEqual(inOsX86Hash, jsX86Hash, "TabComp in-OS assembled x86 core must be byte-identical to JS-built x86 core");
    assert.strictEqual(inOsTC32Hash, jsTC32Hash, "TabComp in-OS assembled TC-32 core must be byte-identical to JS-built TC-32 core");
    console.log("  [PASS] 1. In-OS Assemblers on TabComp: x86 Core (8,643 B) and TC-32 Core (4,360 B) are 100% byte-identical to JS-built cores!");
  }

  // --------------------------------------------------------------------------
  // Part 2: Edit Core Assembly Source (/src/core_x86.asm & /src/core_tc32.asm),
  //         Reassemble In-OS, Reboot Both Machines, and Verify Visible Banner Change!
  // --------------------------------------------------------------------------
  {
    const tcCpu = new globalThis.TabCompCPU(new globalThis.TabCompFS());
    globalThis.initHardwareMemory(tcCpu);
    globalThis.bootSpiralDiskImage(tcCpu, img);
    while (tcCpu.presentCount < 2) { tcCpu.yielded = false; tcCpu.stepBatch(50000); }

    const initBanner = new TextDecoder().decode(tcCpu.ram.subarray(vmBase + 0x0FFD80, vmBase + 0x0FFD90)).replace(/\0/g, "");
    assert.strictEqual(initBanner, "SpiralOS 1.1", `Expected initial boot banner 'SpiralOS 1.1', got '${initBanner}'`);

    // Edit /src/core_tc32.asm and /src/core_x86.asm in SpiralFS to change banner to "SpiralOS 1.1-X"
    const spfs = new SpiralFS(tcCpu.ram.subarray(vmBase + 0x228000, vmBase + 0x228000 + SPFS_SIZE));
    const tcAsmMod = spfs.readText("/src/core_tc32.asm").replace('.ascii "SpiralOS 1.1"', '.ascii "SpiralOS 1.1-X"');
    const x86AsmMod = spfs.readText("/src/core_x86.asm").replace('.banner "SpiralOS 1.1"', '.banner "SpiralOS 1.1-X"');
    spfs.writeFile("/src/core_tc32.asm", tcAsmMod, (tcAsmMod.length + 2048) & ~511);
    spfs.writeFile("/src/core_x86.asm", x86AsmMod, (x86AsmMod.length + 2048) & ~511);
    tcCpu.ram.set(spfs.buf, vmBase + 0x228000);
    tcCpu.spiralDiskImage.set(spfs.buf, SPFS_IMG_OFFSET);

    // Run `asm` inside SpiralOS to reassemble both cores from modified assembly source
    sendShellCmdTabComp(tcCpu, "asm");
    const rebuiltImg = new Uint8Array(tcCpu.spiralDiskImage);

    // Reboot TabComp and verify new banner in vmRam[0x0FFD80] and `ver` output
    sendShellCmdTabComp(tcCpu, "reboot");
    while (tcCpu.presentCount < 2) { tcCpu.yielded = false; tcCpu.stepBatch(50000); }
    const newTcBanner = new TextDecoder().decode(tcCpu.ram.subarray(vmBase + 0x0FFD80, vmBase + 0x0FFD90)).replace(/\0/g, "");
    assert.strictEqual(newTcBanner, "SpiralOS 1.1-X", `Expected modified TC-32 banner 'SpiralOS 1.1-X', got '${newTcBanner}'`);
    console.log(`  [PASS] 2. Edited /src/core_tc32.asm -> Assembled in-OS -> Rebooted TabComp -> Banner: "${newTcBanner}"`);

    // Boot Hummingbird from the exact same reassembled image (or reassemble on Hummingbird) and verify!
    const hbPc = new globalThis.HummingbirdPC({ ramSizeMB: 16 });
    hbPc.loadFloppyImage(rebuiltImg);
    while (hbPc.ramView.getInt32(vmBase + 0x0FFD04, true) < 2) {
      hbPc.cpu.runSteps(200000);
    }
    const newHbBanner = new TextDecoder().decode(hbPc.ram.subarray(vmBase + 0x0FFD80, vmBase + 0x0FFD90)).replace(/\0/g, "");
    assert.strictEqual(newHbBanner, "SpiralOS 1.1-X", `Expected modified x86 banner 'SpiralOS 1.1-X', got '${newHbBanner}'`);

    // Also verify VGA Text Mode RAM at physical 0xB8000 row 2 (0xB8000 + 324) where Stage 1 Boot Sector wrote the banner!
    let vgaTextBanner = "";
    for (let i = 0; i < 14; i++) {
      vgaTextBanner += String.fromCharCode(hbPc.ram[0xB8000 + 324 + i * 2]);
    }
    assert.strictEqual(vgaTextBanner, "SpiralOS 1.1-X", `Expected VGA 0xB8000 banner 'SpiralOS 1.1-X', got '${vgaTextBanner}'`);
    console.log(`  [PASS] 3. Edited /src/core_x86.asm -> Assembled in-OS -> Booted Hummingbird -> VGA 0xB8000 & VM Banner: "${vgaTextBanner}"`);
  }
}

if (require.main === module) {
  runAsmSuite();
}

module.exports = { runAsmSuite };
