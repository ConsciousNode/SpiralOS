#!/usr/bin/env node
/**
 * SpiralOS 1.1 — tests/multitask.js: Preemptive Multitasking & Real-Time App Tick Suite (§3 & §6)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Verifies on BOTH TabComp (TC-32) and Hummingbird (i586 Protected Mode with 8254 PIT IRQ0):
 *   1. Preemptive Multitasking: two CPU-bound background VM tasks (compute_worker_a and
 *      compute_worker_b, which NEVER call hal_yield) run on independent per-task VM stacks
 *      switched by the timer interrupt / quantum scheduler while the desktop compositor
 *      (Task 0) stays responsive and renders frames.
 *   2. Real-Time App Tick API: SpiralSnake and SpiralBlocks advance automatically in real
 *      time without key/mouse presses, while keeping the [Step] and [Drop] buttons working.
 */

"use strict";

const path = require("path");
const assert = require("assert");
const { loadEmulators } = require("./harness.js");
const { buildSpiralOSImage } = require("../tools/build.js");

loadEmulators();

function stepTabCompFrames(cpu, n = 1) {
  const target = cpu.presentCount + n;
  while (cpu.presentCount < target && !cpu.halted) {
    cpu.yielded = false;
    cpu.stepBatch(100000);
  }
}

function clickTabComp(cpu, x, y) {
  cpu.setMouseState(x, y, 1);
  stepTabCompFrames(cpu, 1);
  cpu.setMouseState(x, y, 0);
  stepTabCompFrames(cpu, 1);
}

function sendShellCmdTabComp(cpu, cmd) {
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd.charCodeAt(i);
    cpu.pushKeyEvent(1, c, c, 0);
    cpu.pushKeyEvent(0, c, c, 0);
  }
  cpu.pushKeyEvent(1, 13, 13, 0);
  cpu.pushKeyEvent(0, 13, 13, 0);
  stepTabCompFrames(cpu, cmd.length * 2 + 3);
}

function runMultitaskSuite() {
  console.log("=== SpiralOS 1.1 Preemptive Multitasking & App Tick Suite (tests/multitask.js) ===");
  const rootDir = path.resolve(__dirname, "..");
  const { img } = buildSpiralOSImage(rootDir);
  const vmBase = 0x00200000;

  // --------------------------------------------------------------------------
  // 1. Preemptive Multitasking on TabComp (TC-32)
  // --------------------------------------------------------------------------
  {
    const tcCpu = new globalThis.TabCompCPU(new globalThis.TabCompFS());
    globalThis.initHardwareMemory(tcCpu);
    globalThis.bootSpiralDiskImage(tcCpu, img);
    stepTabCompFrames(tcCpu, 2);

    // Spawn 2 CPU-bound background VM tasks via `workers` shell command
    sendShellCmdTabComp(tcCpu, "workers");

    const framesBefore = tcCpu.presentCount;
    // Step 6 desktop frames while compute_worker_a and compute_worker_b crunch in the background
    stepTabCompFrames(tcCpu, 6);
    // Also click the Desktop "Calc" icon at (292, 28) to prove the desktop UI responds to input while workers run!
    clickTabComp(tcCpu, 292, 28);

    const progA = tcCpu.ramDV.getInt32(vmBase + 0x0FFD70, true);
    const progB = tcCpu.ramDV.getInt32(vmBase + 0x0FFD74, true);
    const ctxSwitches = tcCpu.ramDV.getInt32(vmBase + 0x0FFF10, true);
    const timerTicks = tcCpu.ramDV.getInt32(vmBase + 0x0FFF08, true);
    const focusedApp = tcCpu.ramDV.getInt32(vmBase + 0x0FFD18, true);

    assert.ok(progA > 500, `TabComp worker A must make preemptive progress, got ${progA}`);
    assert.ok(progB > 500, `TabComp worker B must make preemptive progress, got ${progB}`);
    assert.ok(ctxSwitches > 20, `Expected >20 preemptive stack context switches on TabComp, got ${ctxSwitches}`);
    assert.strictEqual(focusedApp, 6, "Desktop must stay responsive (opened SpiralCalc while workers ran)");
    console.log(`  [PASS] 1. TabComp Preemptive Multitasking: workerA=${progA} iters, workerB=${progB} iters, switches=${ctxSwitches}, timerTicks=${timerTicks}, desktop responsive (frames=${tcCpu.presentCount - framesBefore})`);
  }

  // --------------------------------------------------------------------------
  // 2. Preemptive Multitasking on Hummingbird (i586 PIT IRQ0 / INT 0x20 + Stack Switching)
  // --------------------------------------------------------------------------
  {
    const hbPc = new globalThis.HummingbirdPC({ ramSizeMB: 16 });
    hbPc.loadFloppyImage(img);
    while (hbPc.ramView.getInt32(vmBase + 0x0FFD04, true) < 2) {
      hbPc.cpu.runSteps(200000);
    }

    // Type "workers\r" in Hummingbird's focused SpiralSh
    const scWorkers = [0x11, 0x18, 0x13, 0x25, 0x12, 0x13, 0x1F, 0x1C]; // "workers\r"
    for (const sc of scWorkers) {
      hbPc.ps2.sendKeyScancode(sc);
      hbPc.ps2.sendKeyScancode(sc | 0x80);
    }
    const f0 = hbPc.ramView.getInt32(vmBase + 0x0FFD04, true);
    while (hbPc.ramView.getInt32(vmBase + 0x0FFD04, true) < f0 + 6) {
      hbPc.cpu.runSteps(250000);
    }

    const progA = hbPc.ramView.getInt32(vmBase + 0x0FFD70, true);
    const progB = hbPc.ramView.getInt32(vmBase + 0x0FFD74, true);
    const ctxSwitches = hbPc.ramView.getInt32(vmBase + 0x0FFF10, true);
    const irq0Ticks = hbPc.ramView.getInt32(vmBase + 0x0FFF08, true);

    assert.ok(progA > 500, `Hummingbird worker A must make preemptive progress, got ${progA}`);
    assert.ok(progB > 500, `Hummingbird worker B must make preemptive progress, got ${progB}`);
    assert.ok(ctxSwitches > 20, `Expected >20 preemptive stack context switches on Hummingbird, got ${ctxSwitches}`);
    assert.ok(irq0Ticks > 0, `Expected hardware PIT IRQ0 timer interrupts (INT 0x20) on Hummingbird, got ${irq0Ticks}`);
    console.log(`  [PASS] 2. Hummingbird i586 Preemptive Multitasking (PIT IRQ0 + IDT 0x20): workerA=${progA} iters, workerB=${progB} iters, switches=${ctxSwitches}, irq0Ticks=${irq0Ticks}`);
  }

  // --------------------------------------------------------------------------
  // 3. Real-Time App Tick API: SpiralSnake & SpiralBlocks Run Automatically
  // --------------------------------------------------------------------------
  {
    const tcCpu = new globalThis.TabCompCPU(new globalThis.TabCompFS());
    globalThis.initHardwareMemory(tcCpu);
    globalThis.bootSpiralDiskImage(tcCpu, img);
    stepTabCompFrames(tcCpu, 2);

    // Open SpiralSnake via Launcher (item 10)
    clickTabComp(tcCpu, 24, 6);
    clickTabComp(tcCpu, 40, 16 + 9 * 10 + 4);
    assert.strictEqual(tcCpu.ramDV.getInt32(vmBase + 0x0FFD18, true), 10, "SpiralSnake should be open");

    const snakeSteps0 = tcCpu.ramDV.getInt32(vmBase + 0x0FFD60, true);
    const snakeSnap0 = new Uint8Array(tcCpu.ram.subarray(vmBase + 0x0F0000 + 42 * 320 + 60, vmBase + 0x0F0000 + 100 * 320 + 200));

    // Advance 18 frames WITHOUT pressing any keys or clicking [Step]!
    stepTabCompFrames(tcCpu, 5);

    const snakeSteps1 = tcCpu.ramDV.getInt32(vmBase + 0x0FFD60, true);
    const snakeSnap1 = tcCpu.ram.subarray(vmBase + 0x0F0000 + 42 * 320 + 60, vmBase + 0x0F0000 + 100 * 320 + 200);
    let snakePixelDiff = 0;
    for (let i = 0; i < snakeSnap0.length; i++) {
      if (snakeSnap0[i] !== snakeSnap1[i]) snakePixelDiff++;
    }
    assert.ok(snakeSteps1 > snakeSteps0 + 2, `SpiralSnake must step automatically on timer tick (${snakeSteps0} -> ${snakeSteps1})`);
    assert.ok(snakePixelDiff > 0, "SpiralSnake playfield pixels must move automatically in real time");

    // Also verify the manual [Step] button at (56 + 110, 26 + 101) = (166, 127) still works!
    clickTabComp(tcCpu, 166, 127);
    const snakeSteps2 = tcCpu.ramDV.getInt32(vmBase + 0x0FFD60, true);
    assert.ok(snakeSteps2 > snakeSteps1, "SpiralSnake manual [Step] button must also advance the snake");

    // Open SpiralBlocks via Launcher (item 11) and verify blocks fall automatically!
    clickTabComp(tcCpu, 24, 6);
    clickTabComp(tcCpu, 40, 16 + 10 * 10 + 4);
    assert.strictEqual(tcCpu.ramDV.getInt32(vmBase + 0x0FFD18, true), 11, "SpiralBlocks should be open");

    const blkSteps0 = tcCpu.ramDV.getInt32(vmBase + 0x0FFD64, true);
    stepTabCompFrames(tcCpu, 20);
    const blkSteps1 = tcCpu.ramDV.getInt32(vmBase + 0x0FFD64, true);
    assert.ok(blkSteps1 > blkSteps0 + 1, `SpiralBlocks must fall automatically on timer tick (${blkSteps0} -> ${blkSteps1})`);

    console.log(`  [PASS] 3. Real-Time App Tick API: SpiralSnake auto-stepped (${snakeSteps0}->${snakeSteps1}) + [Step] button works; SpiralBlocks auto-fell (${blkSteps0}->${blkSteps1})!`);
  }
}

if (require.main === module) {
  runMultitaskSuite();
}

module.exports = { runMultitaskSuite };
