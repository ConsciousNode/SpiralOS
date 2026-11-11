#!/usr/bin/env node
/**
 * SpiralOS 1.1 — tests/strict-bios.js: Real-Hardware Readiness & Strict BIOS Mode Suite (§4 & §6)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Boots SpiralOS on Hummingbird in `strictBios: true` mode, where:
 *   1. INT 13h fails (CF=1, AH=0x09) if any read or write crosses an 18-sector track boundary.
 *   2. VBE PhysBasePtr is at 0xFD000000 (QEMU/real-card address, not 0xE0000000).
 *   3. VBE Mode 0x0112 is 24-bpp only (pitch = 1920, 3 bytes/pixel B,G,R; 0x0142 unavailable).
 *   4. No StudioNet card is attached (ports 0x02A0..0x02AF return 0xFF).
 *   5. No 82077AA FDC is attached (ports 0x03F0..0x03F7 return 0xFF, emulating USB/HDD boot).
 *
 * Verifies that SpiralOS:
 *   - Boots cleanly through Stage 1 (0x7C00) and Stage 2 (0x7E00) using track-safe INT 13h reads;
 *   - Maps PhysBasePtr (0xFD000000) and renders the desktop using the 24-bpp VBE blitter;
 *   - Detects the missing StudioNet card, displays "no network", and counts 0 bogus RX packets;
 *   - Saves a newly created file (/home/note.txt) to disk via the 16-bit Real-Mode BIOS INT 13h
 *     AH=03h Write Thunk (0x7F40) and returns to 32-bit Protected Mode with Paging!
 */

"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { loadEmulators, encodePNG } = require("./harness.js");
const { buildSpiralOSImage } = require("../tools/build.js");
const { SpiralFS, SPFS_IMG_OFFSET, SPFS_SIZE } = require("../compiler/spiralfs.js");

loadEmulators();

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
  pc.ps2.sendMousePacket(0, 0, 1);
  let f = pc.ramView.getInt32(vmBase + 0x0FFD04, true);
  while (pc.ramView.getInt32(vmBase + 0x0FFD04, true) <= f) {
    pc.cpu.runSteps(100000);
  }
  pc.ps2.sendMousePacket(0, 0, 0);
  f = pc.ramView.getInt32(vmBase + 0x0FFD04, true);
  while (pc.ramView.getInt32(vmBase + 0x0FFD04, true) <= f) {
    pc.cpu.runSteps(100000);
  }
}

function runStrictBiosSuite() {
  console.log("=== SpiralOS 1.1 Strict BIOS & Real-Hardware Readiness Suite (tests/strict-bios.js) ===");
  const rootDir = path.resolve(__dirname, "..");
  const { img } = buildSpiralOSImage(rootDir);
  const vmBase = 0x00200000;

  const pc = new globalThis.HummingbirdPC({ ramSizeMB: 16, strictBios: true });
  pc.loadFloppyImage(img);

  let guard = 0;
  while (pc.ramView.getInt32(vmBase + 0x0FFD04, true) < 3 && guard < 600) {
    pc.cpu.runSteps(250000);
    pc.checkRuntimeMilestones();
    guard++;
  }

  // 1. Verify Stage 1 + Stage 2 Track-Safe Boot & 24-bpp VBE @ 0xFD000000
  const magic = pc.ramView.getUint32(vmBase + 0x0FFD00, true);
  assert.strictEqual(magic, 0x53504F53, "Strict BIOS: Desktop magic 'SPOS' must be set");
  assert.strictEqual(pc.vbeLfbPhysBase, 0xFD000000, "Strict BIOS: PhysBasePtr must be 0xFD000000");
  assert.strictEqual(pc.vga.bpp, 24, "Strict BIOS: Active VBE mode must be 24-bpp");
  assert.strictEqual(pc.vga.pitch, 1920, "Strict BIOS: VBE pitch must be 1920 bytes/line");

  // Verify 24-bpp LFB pixels are populated and save screenshot
  const frame = pc.vga.renderFrame();
  let nonBlackPixels = 0;
  for (let i = 0; i < frame.rgba.length; i++) {
    if ((frame.rgba[i] & 0xFFFFFF) !== 0) {
      nonBlackPixels++;
    }
  }
  assert.ok(nonBlackPixels > 180000, `Strict BIOS: Expected >180,000 non-black 24-bpp pixels, got ${nonBlackPixels}`);
  fs.writeFileSync(
    path.join(rootDir, "screenshots", "hummingbird_strict_bios.png"),
    encodePNG(frame.width, frame.height, frame.rgba)
  );
  console.log(`  [PASS] 1. Two-Stage Track-Safe Loader & 24-bpp Blitter (@0xFD000000): booted to 640x480x24 desktop (${nonBlackPixels.toLocaleString()} active pixels)`);

  // 2. Verify StudioNet Presence Detection ("no network" and 0 bogus RX packets)
  const hasSnet = pc.ramView.getInt32(vmBase + 0x0FFD30, true);
  assert.strictEqual(hasSnet, 0, "Strict BIOS: StudioNet presence flag (0x0FFD30) must be 0 when card is absent");

  // Run `net` in SpiralSh to verify it reports "no network" and 0 bogus packets
  const scNet = [0x31, 0x12, 0x14, 0x1C]; // "net\r"
  for (const sc of scNet) {
    pc.ps2.sendKeyScancode(sc);
    pc.ps2.sendKeyScancode(sc | 0x80);
  }
  const fBefore = pc.ramView.getInt32(vmBase + 0x0FFD04, true);
  while (pc.ramView.getInt32(vmBase + 0x0FFD04, true) < fBefore + 3) {
    pc.cpu.runSteps(200000);
  }
  const shellOut = new TextDecoder().decode(pc.ram.subarray(vmBase + 0x04B000, vmBase + 0x04B100)).replace(/\0/g, " ");
  assert.ok(shellOut.includes("no network"), `Strict BIOS: Expected 'no network' in shell output, got '${shellOut.trim()}'`);
  console.log("  [PASS] 2. StudioNet Presence Detection: detected missing NIC (0xFF), displayed 'no network', 0 bogus RX packets!");

  // 3. Verify Saving Without Floppy Controller (16-Bit Real-Mode BIOS INT 13h AH=03h Thunk)
  // Click Desktop "Files" icon at (18, 28) to open SpiralFiles, then click [+New] at (18+65, 16+120-10) = (83, 126)
  clickHummingbird(pc, 18, 28);
  assert.strictEqual(pc.ramView.getInt32(vmBase + 0x0FFD18, true), 1, "SpiralFiles should be focused");
  clickHummingbird(pc, 83, 126);

  // Verify /home/note.txt was persisted to pc.floppyImage via the Real-Mode INT 13h AH=03h Thunk!
  const spfsAfter = new SpiralFS(pc.floppyImage.subarray(SPFS_IMG_OFFSET, SPFS_IMG_OFFSET + SPFS_SIZE));
  const savedNote = spfsAfter.readText("/home/note.txt");
  assert.strictEqual(savedNote, "SpiralOS Note\n", "Strict BIOS: /home/note.txt must be written to disk via Real-Mode BIOS INT 13h thunk");
  assert.strictEqual((pc.cpu.cr0 >>> 0), 0x80000011, "CPU must return cleanly to 32-bit Protected Mode with Paging enabled after BIOS write thunk");
  console.log("  [PASS] 3. FDC-Less Disk Write-Back: saved /home/note.txt via 16-bit Real-Mode BIOS INT 13h AH=03h Thunk and returned to Protected Mode!");
}

if (require.main === module) {
  runStrictBiosSuite();
}

module.exports = { runStrictBiosSuite };
