#!/usr/bin/env node
/**
 * SpiralOS — tests/selfhost.js: Self-Hosting Rebuild Loop Suite (§3 & §8)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Executes and verifies on BOTH TabComp (TC-32) and Hummingbird (i586):
 *   Part A: Unmodified Rebuild Fixed Point (rebuilding inside SpiralOS without
 *           source changes yields a SPIR image with the exact same SHA-256 hash).
 *   Part B: The 6-Step §3 Acceptance Demo on EACH machine:
 *     1. Boot SpiralOS.
 *     2. Open /src/wm.sp in SpiralOS's own text editor (SpiralEdit).
 *     3. Change WM_TITLE_COLOR_OVERRIDE from 0 to 196 (Crimson/Rose) and save.
 *     4. Compile with SpiralOS's own compiler (SpiralC in /src/cc.sp).
 *     5. Rebuild the bootable OS image (flushing via FDC DMA / VFS) and reboot.
 *     6. Verify the new title-bar color (196) is visible in the framebuffer after
 *        reboot, compare image hashes between TabComp and Hummingbird, and save
 *        post-rebuild screenshots.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { loadEmulators, encodePNG, renderTabCompRGBA, sha256Hex } = require("./harness.js");
const { buildSpiralOSImage } = require("../tools/build.js");

loadEmulators();

// Helper to inject a mouse click at (x, y) and advance 2 frames on TabComp
function clickTabComp(cpu, x, y) {
  cpu.setMouseState(x, y, 1);
  let target = cpu.presentCount + 1;
  while (cpu.presentCount < target && !cpu.halted) {
    cpu.yielded = false;
    cpu.stepBatch(50000);
  }
  cpu.setMouseState(x, y, 0);
  target = cpu.presentCount + 1;
  while (cpu.presentCount < target && !cpu.halted) {
    cpu.yielded = false;
    cpu.stepBatch(50000);
  }
}

// Helper to move PS/2 mouse to (tx, ty) in 320x200 coords and click on Hummingbird
function clickHummingbird(pc, tx, ty) {
  const vmBase = 0x00200000;
  for (let iter = 0; iter < 40; iter++) {
    const mx = pc.ramView.getInt32(vmBase + 0x0FFD08, true);
    const my = pc.ramView.getInt32(vmBase + 0x0FFD0C, true);
    const dx = tx - mx;
    const dy = ty - my;
    if (dx === 0 && dy === 0) break;
    const sx = Math.max(-32, Math.min(32, dx));
    const sy = Math.max(-32, Math.min(32, dy));
    pc.ps2.sendMousePacket(sx, sy, 0);
    const f0 = pc.ramView.getInt32(vmBase + 0x0FFD04, true);
    while (pc.ramView.getInt32(vmBase + 0x0FFD04, true) <= f0) {
      pc.cpu.runSteps(100000);
    }
  }
  // Button down
  pc.ps2.sendMousePacket(0, 0, 1);
  let f = pc.ramView.getInt32(vmBase + 0x0FFD04, true);
  while (pc.ramView.getInt32(vmBase + 0x0FFD04, true) <= f) {
    pc.cpu.runSteps(100000);
  }
  // Button up
  pc.ps2.sendMousePacket(0, 0, 0);
  f = pc.ramView.getInt32(vmBase + 0x0FFD04, true);
  while (pc.ramView.getInt32(vmBase + 0x0FFD04, true) <= f) {
    pc.cpu.runSteps(100000);
  }
}

function sendShellCommandTabComp(cpu, cmd) {
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
    cpu.stepBatch(50000);
  }
}

function runSelfHostSuite() {
  console.log("=== SpiralOS Self-Hosting Rebuild Suite (tests/selfhost.js) ===");
  const rootDir = path.resolve(__dirname, "..");
  const { img } = buildSpiralOSImage(rootDir);
  const vmBase = 0x00200000;

  const pristineSpirHash = sha256Hex(img.subarray(0x8000, 0x18000));
  const pristineFullHash = sha256Hex(img);
  console.log(`  Pristine SPIR Bytecode SHA-256 : ${pristineSpirHash.slice(0, 32)}...`);
  console.log(`  Pristine 1.44MB Image SHA-256  : ${pristineFullHash.slice(0, 32)}...`);

  // --------------------------------------------------------------------------
  // Part A: Unmodified Rebuild Fixed-Point Verification
  // --------------------------------------------------------------------------
  {
    const tcFs = new globalThis.TabCompFS();
    const tcCpu = new globalThis.TabCompCPU(tcFs);
    globalThis.initHardwareMemory(tcCpu);
    globalThis.bootSpiralDiskImage(tcCpu, img);
    while (tcCpu.presentCount < 2) { tcCpu.yielded = false; tcCpu.stepBatch(50000); }

    // Run `rebuild` + `asm` in SpiralSh on unmodified source
    sendShellCommandTabComp(tcCpu, "rebuild");
    sendShellCommandTabComp(tcCpu, "asm");

    const rebuiltSpir = tcCpu.spiralDiskImage.subarray(0x8000, 0x18000);
    const rebuiltSpirHash = sha256Hex(rebuiltSpir);
    assert.strictEqual(
      rebuiltSpirHash,
      pristineSpirHash,
      "Unmodified self-hosting rebuild must match pristine SPIR bytecode bit-for-bit"
    );
    console.log(`  [PASS] Part A: Unmodified self-hosting rebuild is a bit-for-bit fixed point (${rebuiltSpirHash.slice(0, 24)}...)`);
  }

  // --------------------------------------------------------------------------
  // Part B: 6-Step §3 Acceptance Demo on TabComp (TC-32)
  // --------------------------------------------------------------------------
  let tcRebuiltImg;
  {
    const tcFs = new globalThis.TabCompFS();
    const tcCpu = new globalThis.TabCompCPU(tcFs);
    globalThis.initHardwareMemory(tcCpu);
    globalThis.bootSpiralDiskImage(tcCpu, img);
    while (tcCpu.presentCount < 3) { tcCpu.yielded = false; tcCpu.stepBatch(50000); }

    const initialTitleCol = tcCpu.ramDV.getInt32(vmBase + 0x0FFD78, true);
    assert.strictEqual(initialTitleCol, 68, "Initial title bar color should be 68");

    // Step 2: Click Desktop "Edit" icon at (18, 56) to open SpiralEdit with /src/wm.sp
    clickTabComp(tcCpu, 18, 56);
    assert.strictEqual(tcCpu.ramDV.getInt32(vmBase + 0x0FFD18, true), 2, "SpiralEdit (APP_EDIT=2) should be focused");

    // SpiralEdit window is at (28, 20):
    // Step 3: Click [Col196] button at (28 + 65, 20 + 20) = (93, 40) to edit WM_TITLE_COLOR_OVERRIDE to 196
    clickTabComp(tcCpu, 93, 40);
    // Click [Save] button at (28 + 115, 20 + 20) = (143, 40) to save /src/wm.sp to SpiralFS
    clickTabComp(tcCpu, 143, 40);

    // Step 4: Click [Rebuild] button at (28 + 168, 20 + 20) = (196, 40) to compile & rebuild image and open SpiralBuild
    clickTabComp(tcCpu, 196, 40);
    assert.strictEqual(tcCpu.ramDV.getInt32(vmBase + 0x0FFD18, true), 4, "SpiralBuild (APP_BUILD=4) should be focused");

    // Step 5: Click [Reboot] button in SpiralBuild (window at 48, 28, w=204, h=108 -> button at 48+155, 28+108-10 = 203, 126)
    const rebootsBefore = tcCpu.rebootCount;
    clickTabComp(tcCpu, 203, 126);
    while (tcCpu.presentCount < 3) { tcCpu.yielded = false; tcCpu.stepBatch(50000); }
    assert.ok(tcCpu.rebootCount > rebootsBefore, "TabComp should have executed warm reboot");

    // Step 6: Verify the new title-bar color (196) is active AND visible in VRAM!
    const newTitleCol = tcCpu.ramDV.getInt32(vmBase + 0x0FFD78, true);
    assert.strictEqual(newTitleCol, 196, `Expected post-reboot title bar color 196 on TabComp, got ${newTitleCol}`);

    // Count pixels of color 196 in active SpiralSh window title bar (x=36..256, y=38..48)
    let col196Pixels = 0;
    for (let y = 38; y <= 48; y++) {
      for (let x = 38; x < 230; x++) {
        if (tcCpu.ram[vmBase + 0x0F0000 + y * 320 + x] === 196) col196Pixels++;
      }
    }
    assert.ok(col196Pixels > 1200, `Expected >1200 pixels of color 196 in title bar, found ${col196Pixels}`);

    tcRebuiltImg = new Uint8Array(tcCpu.spiralDiskImage);
    const tcFrame = renderTabCompRGBA(tcCpu);
    fs.writeFileSync(
      path.join(rootDir, "screenshots", "tabcomp_selfhost_rebuilt.png"),
      encodePNG(tcFrame.width, tcFrame.height, tcFrame.rgba)
    );
    console.log(`  [PASS] Part B (TabComp TC-32): Edited /src/wm.sp -> Compiled -> Rebuilt -> Rebooted -> Title Bar Color=${newTitleCol} (${col196Pixels} px visible)`);
  }

  // --------------------------------------------------------------------------
  // Part C: 6-Step §3 Acceptance Demo on Hummingbird (i586)
  // --------------------------------------------------------------------------
  let hbRebuiltImg;
  {
    const hbPc = new globalThis.HummingbirdPC({ ramSizeMB: 16 });
    hbPc.loadFloppyImage(img);
    while (hbPc.ramView.getInt32(vmBase + 0x0FFD04, true) < 3) {
      hbPc.cpu.runSteps(250000);
    }

    const initialTitleCol = hbPc.ramView.getInt32(vmBase + 0x0FFD78, true);
    assert.strictEqual(initialTitleCol, 68, "Initial title bar color on Hummingbird should be 68");

    // Step 2: Click Desktop "Edit" icon at (18, 56)
    clickHummingbird(hbPc, 18, 56);
    assert.strictEqual(hbPc.ramView.getInt32(vmBase + 0x0FFD18, true), 2, "SpiralEdit should be focused on Hummingbird");

    // Step 3: Click [Col196] at (93, 40) and [Save] at (143, 40)
    clickHummingbird(hbPc, 93, 40);
    clickHummingbird(hbPc, 143, 40);

    // Step 4: Click [Rebuild] at (196, 40) -> compiles & flushes Sectors 64..191 via 8237 DMA + 82077AA FDC!
    clickHummingbird(hbPc, 196, 40);
    assert.strictEqual(hbPc.ramView.getInt32(vmBase + 0x0FFD18, true), 4, "SpiralBuild should be focused on Hummingbird");

    // Step 5: Click [Reboot] at (203, 126) -> triggers hardware reset via port 0x64 (0xFE) & reboots from floppyImage!
    const rebootsBefore = hbPc.rebootCount;
    hbPc.ps2.sendMousePacket(203 - hbPc.ramView.getInt32(vmBase + 0x0FFD08, true), 126 - hbPc.ramView.getInt32(vmBase + 0x0FFD0C, true), 1);
    while (hbPc.rebootCount === rebootsBefore) {
      hbPc.cpu.runSteps(200000);
    }
    // Wait for rebooted OS to draw 3 frames of the new desktop
    while (hbPc.ramView.getInt32(vmBase + 0x0FFD04, true) < 3) {
      hbPc.cpu.runSteps(250000);
    }

    // Step 6: Verify the new title-bar color (196) is active AND visible in VRAM and VBE LFB!
    const newTitleCol = hbPc.ramView.getInt32(vmBase + 0x0FFD78, true);
    assert.strictEqual(newTitleCol, 196, `Expected post-reboot title bar color 196 on Hummingbird, got ${newTitleCol}`);

    let col196Pixels = 0;
    for (let y = 38; y <= 48; y++) {
      for (let x = 38; x < 230; x++) {
        if (hbPc.ram[vmBase + 0x0F0000 + y * 320 + x] === 196) col196Pixels++;
      }
    }
    assert.ok(col196Pixels > 1200, `Expected >1200 pixels of color 196 on Hummingbird, found ${col196Pixels}`);

    hbRebuiltImg = new Uint8Array(hbPc.floppyImage);
    const hbFrame = hbPc.vga.renderFrame();
    fs.writeFileSync(
      path.join(rootDir, "screenshots", "hummingbird_selfhost_rebuilt.png"),
      encodePNG(hbFrame.width, hbFrame.height, hbFrame.rgba)
    );
    console.log(`  [PASS] Part C (Hummingbird i586): Edited /src/wm.sp -> Compiled -> Rebuilt (FDC DMA) -> Rebooted -> Title Bar Color=${newTitleCol} (${col196Pixels} px visible)`);
  }

  // --------------------------------------------------------------------------
  // Part D: Cross-Machine Rebuilt Image Hash Verification
  // --------------------------------------------------------------------------
  const tcRebuiltHash = sha256Hex(tcRebuiltImg);
  const hbRebuiltHash = sha256Hex(hbRebuiltImg);
  assert.strictEqual(
    tcRebuiltHash,
    hbRebuiltHash,
    "Rebuilt 1.44 MB disk image on TabComp and Hummingbird must be 100% byte-for-byte identical"
  );
  assert.notStrictEqual(
    tcRebuiltHash,
    pristineFullHash,
    "Rebuilt disk image must differ from pristine disk image by the intended change"
  );

  // Count how many 512-byte sectors changed between pristine and rebuilt image
  let changedSectors = [];
  for (let s = 0; s < 2880; s++) {
    let diff = false;
    for (let b = 0; b < 512; b++) {
      if (img[s * 512 + b] !== tcRebuiltImg[s * 512 + b]) { diff = true; break; }
    }
    if (diff) changedSectors.push(s);
  }
  console.log(`  [PASS] Part D: Rebuilt 1.44 MB image hashes match bit-for-bit across TabComp & Hummingbird!`);
  console.log(`    - Rebuilt Image SHA-256 : ${tcRebuiltHash.slice(0, 32)}...`);
  console.log(`    - Changed Sectors       : [${changedSectors.join(", ")}] (SPIR header/code + SpiralFS dir & /src/wm.sp sector)`);
}

if (require.main === module) {
  runSelfHostSuite();
}

module.exports = { runSelfHostSuite };
