#!/usr/bin/env node
/**
 * SpiralOS 1.2.1 — tests/mouse-121.js: PS/2 mouse packet decoding and slow-device init
 * Studio: ConsciousNode SoftWorks · Licence: MIT · Written by Kehai Interim, 2026-11-12
 *
 * Why: on Kham's Toshiba (USB mouse via BIOS legacy PS/2 emulation) 1.2's cursor
 * worked for a second or two, then pinned to a screen edge and slid along it, and
 * the internal trackpad never moved. These probes model the suspected causes on
 * Hummingbird and run them against 1.2 (baseline, expected to fail) and 1.2.1:
 *
 *   1. Clean packets: 5 x (+10, 0) moves the cursor +50 in X (both must pass).
 *   2. One stray byte (0x00, e.g. a late mouse-ID byte) before 5 clean packets:
 *      the cursor must still end +50 in X with Y unchanged (packet sync, bit 3).
 *   3. A 9-bit delta: byte 0 has the X sign bit, byte 1 = 0x38 (-200):
 *      X must go DOWN (clamped at 0), not up by 56.
 *   4. An overflow packet (byte 0 bit 6 set): no movement.
 *   5. Slow device: every 8042 response delayed 200,000 instructions (beyond 1.2's
 *      16,384-read wait, inside 1.2.1's): the mouse must still initialize and move.
 *
 * Raw bytes go in through the emulator's own 8042 queue (pc.ps2.enqueue), the same
 * path a real device's bytes take. The guest is only read, never written.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { loadEmulators } = require("./harness.js");
const { buildSpiralOSImage } = require("../tools/build.js");
loadEmulators();

const VM_BASE = 0x00200000;
const ROOT = path.resolve(__dirname, "..");
const BASE_IMG = process.env.SPIRALOS_12_IMG; // optional path to the 1.2 image (baseline)

function boot(img, options = {}) {
  const pc = new globalThis.HummingbirdPC(Object.assign({ ramSizeMB: 16 }, options));
  pc.loadFloppyImage(img);
  let guard = 0;
  while (pc.ramView.getInt32(VM_BASE + 0x0FFD04, true) < 3 && guard < 800) {
    pc.cpu.runSteps(200000); pc.checkRuntimeMilestones(); guard++;
  }
  return pc;
}
function frames(pc, n = 2) {
  const target = pc.ramView.getInt32(VM_BASE + 0x0FFD04, true) + n;
  let g = 0;
  while (pc.ramView.getInt32(VM_BASE + 0x0FFD04, true) < target && g < 400 * n) { pc.cpu.runSteps(100000); g++; }
}
const pos = pc => [pc.ramView.getInt32(VM_BASE + 0x0FFD08, true), pc.ramView.getInt32(VM_BASE + 0x0FFD0C, true)];
function raw(pc, bytes) { for (const b of bytes) { pc.ps2.enqueue(b, true, false); frames(pc, 1); } }
function packet(pc, dx, dy) { pc.ps2.sendMousePacket(dx, dy, 0); frames(pc, 1); }

function runAll(img) {
  const r = {};
  { const pc = boot(img); const [x0, y0] = pos(pc); for (let i = 0; i < 5; i++) packet(pc, 10, 0);
    const [x, y] = pos(pc); r.clean = { x0, y0, x, y, pass: x === x0 + 50 && y === y0 }; }
  { const pc = boot(img); const [x0, y0] = pos(pc); raw(pc, [0x00]); for (let i = 0; i < 5; i++) packet(pc, 10, 0);
    const [x, y] = pos(pc); r.strayByte = { x0, y0, x, y, pass: x === x0 + 50 && y === y0 }; }
  { const pc = boot(img); const [x0, y0] = pos(pc); raw(pc, [0x08 | 0x10, 0x38, 0x00]);
    const [x, y] = pos(pc); r.nineBit = { x0, y0, x, y, pass: x === Math.max(0, x0 - 200) && y === y0 }; }
  { const pc = boot(img); const [x0, y0] = pos(pc); raw(pc, [0x08 | 0x40, 0xFF, 0x00]);
    const [x, y] = pos(pc); r.overflow = { x0, y0, x, y, pass: x === x0 && y === y0 }; }
  { const pc = boot(img, { ps2Latency: 200000 }); const [x0, y0] = pos(pc); for (let i = 0; i < 5; i++) packet(pc, 10, 0);
    frames(pc, 4); const [x, y] = pos(pc); r.slowDevice = { x0, y0, x, y, pass: x === x0 + 50 && y === y0 }; }
  return r;
}

function show(label, r) {
  console.log(`  ${label}`);
  for (const [k, v] of Object.entries(r)) console.log(`    ${v.pass ? "PASS" : "FAIL"}  ${k.padEnd(11)} (${v.x0},${v.y0}) -> (${v.x},${v.y})`);
  return Object.values(r).every(v => v.pass);
}

console.log("=== SpiralOS 1.2.1 PS/2 Mouse Probes (tests/mouse-121.js) ===");
if (BASE_IMG && fs.existsSync(BASE_IMG)) {
  const base = runAll(new Uint8Array(fs.readFileSync(BASE_IMG)));
  show(`baseline ${path.basename(BASE_IMG)} (expected to fail some):`, base);
}
const ok = show("current build:", runAll(buildSpiralOSImage(ROOT).img));
console.log(ok ? "  [PASS] All mouse probes pass on the current build." : "  [FAIL] Mouse probes failed on the current build.");
process.exit(ok ? 0 : 1);
