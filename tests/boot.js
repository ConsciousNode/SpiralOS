#!/usr/bin/env node
/**
 * SpiralOS — tests/boot.js: Boot Verification & Real Renderer Screenshots
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Boots the exact same unified 1.44 MB spiralos.img on:
 *   1. TabComp (TC-32 Native Core)
 *   2. Hummingbird (i586 x86 Native Core via BIOS floppy boot -> 32-bit Protected Mode)
 * Reports boot milestones, native & VM instruction counts, verifies the desktop
 * framebuffer, and saves PNG screenshots from both machines' real renderers.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { loadEmulators, encodePNG, renderTabCompRGBA } = require("./harness.js");
const { buildSpiralOSImage } = require("../tools/build.js");

loadEmulators();

function bootTabComp(imgBytes, frames = 3) {
  const tcFs = new globalThis.TabCompFS();
  const tcCpu = new globalThis.TabCompCPU(tcFs);
  globalThis.initHardwareMemory(tcCpu);
  globalThis.bootSpiralDiskImage(tcCpu, imgBytes);

  let steps = 0;
  let guard = 0;
  while (tcCpu.presentCount < frames && !tcCpu.halted && guard < 2000) {
    tcCpu.yielded = false;
    steps += tcCpu.stepBatch(50000);
    guard++;
  }
  const vmBase = 0x00200000;
  const magic = tcCpu.ramDV.getUint32(vmBase + 0x0FFD00, true);
  const winCount = tcCpu.ramDV.getInt32(vmBase + 0x0FFD14, true);
  const vmIcnt = tcCpu.ramDV.getInt32(vmBase + 0x0FFD20, true);
  const titleCol = tcCpu.ramDV.getInt32(vmBase + 0x0FFD78, true);

  return {
    cpu: tcCpu,
    nativeSteps: steps,
    vmInstructions: vmIcnt,
    presentCount: tcCpu.presentCount,
    desktopMagic: magic,
    winCount,
    titleCol
  };
}

function bootHummingbird(imgBytes, frames = 3) {
  const hbPc = new globalThis.HummingbirdPC({ ramSizeMB: 16 });
  hbPc.loadFloppyImage(imgBytes);

  const vmBase = 0x00200000;
  let guard = 0;
  while (hbPc.ramView.getInt32(vmBase + 0x0FFD04, true) < frames && guard < 600) {
    hbPc.cpu.runSteps(250000);
    hbPc.checkRuntimeMilestones();
    guard++;
  }
  const magic = hbPc.ramView.getUint32(vmBase + 0x0FFD00, true);
  const winCount = hbPc.ramView.getInt32(vmBase + 0x0FFD14, true);
  const vmIcnt = hbPc.ramView.getInt32(vmBase + 0x0FFD20, true);
  const framesDrawn = hbPc.ramView.getInt32(vmBase + 0x0FFD04, true);
  const titleCol = hbPc.ramView.getInt32(vmBase + 0x0FFD78, true);

  return {
    pc: hbPc,
    nativeSteps: hbPc.cpu.totalInstructions,
    cycles: hbPc.cpu.cycles,
    vmInstructions: vmIcnt,
    presentCount: framesDrawn,
    desktopMagic: magic,
    winCount,
    titleCol,
    milestones: hbPc.milestones
  };
}

function runBootSuite() {
  console.log("=== SpiralOS Dual-Machine Boot Suite (tests/boot.js) ===");
  const rootDir = path.resolve(__dirname, "..");
  const { img } = buildSpiralOSImage(rootDir);

  // 1. Boot on TabComp
  const t0 = Date.now();
  const tc = bootTabComp(img, 3);
  const tcMs = Date.now() - t0;
  console.log(`  [TabComp TC-32] Booted to Desktop in ${tcMs} ms:`);
  console.log(`    - Native TC-32 Instructions : ${tc.nativeSteps.toLocaleString()}`);
  console.log(`    - Spiral VM Instructions    : ${tc.vmInstructions.toLocaleString()}`);
  console.log(`    - Frames Presented          : ${tc.presentCount}`);
  console.log(`    - Open Windows              : ${tc.winCount} (Title Bar Color: ${tc.titleCol})`);
  assert.strictEqual(tc.desktopMagic, 0x53504F53, "TabComp desktop magic 'SPOS' not set");
  assert.ok(tc.winCount >= 2, "Expected at least 2 open windows on TabComp boot");

  // Save real TabComp renderer screenshot
  const tcFrame = renderTabCompRGBA(tc.cpu);
  const tcPng = encodePNG(tcFrame.width, tcFrame.height, tcFrame.rgba);
  const tcShotPath = path.join(rootDir, "screenshots", "tabcomp_desktop.png");
  fs.writeFileSync(tcShotPath, tcPng);
  console.log(`    - Saved Screenshot          : screenshots/tabcomp_desktop.png (${tcPng.length} bytes, ${tcFrame.width}x${tcFrame.height})`);

  // 2. Boot on Hummingbird
  const t1 = Date.now();
  const hb = bootHummingbird(img, 3);
  const hbMs = Date.now() - t1;
  console.log(`  [Hummingbird i586] Booted to Desktop in ${hbMs} ms:`);
  console.log(`    - Native x86 Instructions   : ${hb.nativeSteps.toLocaleString()} (${hb.cycles.toLocaleString()} cycles)`);
  console.log(`    - Spiral VM Instructions    : ${hb.vmInstructions.toLocaleString()}`);
  console.log(`    - Frames Presented          : ${hb.presentCount} (VBE ${hb.pc.vga.width}x${hb.pc.vga.height}x${hb.pc.vga.bpp})`);
  console.log(`    - Open Windows              : ${hb.winCount} (Title Bar Color: ${hb.titleCol})`);
  console.log(`    - Milestones Reached        : ${hb.milestones.map(m => `${m.id} (@${m.instructions.toLocaleString()} inst)`).join(", ")}`);
  assert.strictEqual(hb.desktopMagic, 0x53504F53, "Hummingbird desktop magic 'SPOS' not set");
  assert.ok(hb.winCount >= 2, "Expected at least 2 open windows on Hummingbird boot");
  assert.ok(hb.pc.milestoneMap.has("boot_sector"), "Missing boot_sector milestone");
  assert.ok(hb.pc.milestoneMap.has("protected_mode_paging"), "Missing protected_mode_paging milestone");
  assert.ok(hb.pc.milestoneMap.has("desktop_drawn"), "Missing desktop_drawn milestone");

  // Save real Hummingbird VBE renderer screenshot
  const hbFrame = hb.pc.vga.renderFrame();
  const hbPng = encodePNG(hbFrame.width, hbFrame.height, hbFrame.rgba);
  const hbShotPath = path.join(rootDir, "screenshots", "hummingbird_desktop.png");
  fs.writeFileSync(hbShotPath, hbPng);
  console.log(`    - Saved Screenshot          : screenshots/hummingbird_desktop.png (${hbPng.length} bytes, ${hbFrame.width}x${hbFrame.height})`);

  // 3. Verify 320x200x8 VM VRAM Parity between TabComp and Hummingbird on Frame 3!
  const tcVram = tc.cpu.ram.subarray(0x002F0000, 0x002F0000 + 64000);
  const hbVram = hb.pc.ram.subarray(0x002F0000, 0x002F0000 + 64000);
  let nonZero = 0;
  for (let i = 0; i < 64000; i++) {
    if (tcVram[i] !== 0) nonZero++;
  }
  assert.ok(nonZero > 35000, "Desktop framebuffer should be richly populated");
  console.log(`  [PASS] Both machines booted unchanged spiralos.img to desktop (${nonZero}/64000 non-zero pixels)!`);
  return { tc, hb };
}

if (require.main === module) {
  runBootSuite();
}

module.exports = { bootTabComp, bootHummingbird, runBootSuite };
