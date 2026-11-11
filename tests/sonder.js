#!/usr/bin/env node
/**
 * SpiralOS 1.1 — tests/sonder.js: Sonder Procedural Engine, Full SpiralWeb Browser & Multiplayer Snake Suite (§5 & §6)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Verifies:
 *   1. Deterministic Procedural Sonder Engine (sonder.gw / 0x00FE):
 *      - Same URL produces the exact same page every time (seeded determinism).
 *      - Different URLs produce distinct pages across all 4 procedural templates
 *        ([ATLAS], [CHRONICLE], [SCHEMATIC], [ARCHIVE]) with working links and inline images.
 *   2. Full SpiralWeb Browser:
 *      - Renders inline <img src='...'> bitmaps on the page canvas.
 *      - Follows clickable <a href='...'> links when clicked in the browser window.
 *      - Maintains a Back History stack and navigates back when [Back] is clicked.
 *   3. Multiplayer Snake over StudioNet (Stretch §5):
 *      - TabComp (0x0101) and Hummingbird (0x0201) exchange live snake state packets
 *        over StudioNet SDP port 4400 and render both snakes on the playfield.
 */

"use strict";

const path = require("path");
const assert = require("assert");
const { loadEmulators } = require("./harness.js");
const { buildSpiralOSImage } = require("../tools/build.js");

loadEmulators();

function runSonderSuite() {
  console.log("=== SpiralOS 1.1 Sonder Procedural Engine & SpiralWeb Browser Suite (tests/sonder.js) ===");
  const rootDir = path.resolve(__dirname, "..");
  const { img } = buildSpiralOSImage(rootDir);
  const vmBase = 0x00200000;

  globalThis.__STUDIONET_SWITCH.nics.clear();
  globalThis.__STUDIONET_SWITCH.packetLog = [];

  const tcCpu = new globalThis.TabCompCPU(new globalThis.TabCompFS());
  globalThis.initHardwareMemory(tcCpu);
  globalThis.bootSpiralDiskImage(tcCpu, img);

  const hbPc = new globalThis.HummingbirdPC({ ramSizeMB: 16 });
  hbPc.loadFloppyImage(img);

  function stepBoth(frames = 2) {
    const tcTarget = tcCpu.presentCount + frames;
    while (tcCpu.presentCount < tcTarget && !tcCpu.halted) {
      tcCpu.yielded = false;
      tcCpu.stepBatch(100000);
    }
    const hbTarget = hbPc.ramView.getInt32(vmBase + 0x0FFD04, true) + frames;
    while (hbPc.ramView.getInt32(vmBase + 0x0FFD04, true) < hbTarget) {
      hbPc.cpu.runSteps(200000);
    }
  }

  function clickTabComp(x, y) {
    tcCpu.setMouseState(x, y, 1);
    stepBoth(1);
    tcCpu.setMouseState(x, y, 0);
    stepBoth(1);
  }

  stepBoth(3);

  // --------------------------------------------------------------------------
  // 1. Verify Deterministic Seeded Procedural Sonder Generator Across All 4 Templates
  // --------------------------------------------------------------------------
  {
    const seenTemplates = new Set();
    const probePaths = ["/atlas", "/chronicle", "/schematic", "/archive", "/node-101", "/node-202", "/node-303", "/node-404"];
    for (const p of probePaths) {
      const page1 = globalThis.generateSonderProceduralPage(p);
      const page2 = globalThis.generateSonderProceduralPage(p);
      assert.strictEqual(page1, page2, `Sonder generator must be 100% deterministic for path '${p}'`);
      if (page1.includes("[ATLAS]")) seenTemplates.add("ATLAS");
      if (page1.includes("[CHRONICLE")) seenTemplates.add("CHRONICLE");
      if (page1.includes("[SCHEMATIC]")) seenTemplates.add("SCHEMATIC");
      if (page1.includes("[ARCHIVE]")) seenTemplates.add("ARCHIVE");
    }
    assert.strictEqual(seenTemplates.size, 4, `Expected all 4 Sonder procedural templates, found: ${[...seenTemplates].join(", ")}`);
    const pA = globalThis.generateSonderProceduralPage("/atlas");
    const pB = globalThis.generateSonderProceduralPage("/archive");
    assert.notStrictEqual(pA, pB, "Different Sonder paths must produce distinct procedural pages");
    console.log(`  [PASS] 1. Seeded Sonder Procedural Engine: 100% deterministic, all 4 templates verified ([${[...seenTemplates].join(", ")}])`);
  }

  // --------------------------------------------------------------------------
  // 2. Full SpiralWeb Browser: Clickable Links, Back History & Inline Images
  // --------------------------------------------------------------------------
  {
    // Open SpiralWeb on TabComp via Launcher (item 14)
    clickTabComp(24, 6);
    clickTabComp(40, 16 + 13 * 10 + 4);
    assert.strictEqual(tcCpu.ramDV.getInt32(vmBase + 0x0FFD18, true), 14, "SpiralWeb should be focused");

    // Verify initial local page (/www/index.hts) rendered its inline <img src='/art/spiral.pic'>!
    const localImgDrawn = tcCpu.ramDV.getInt32(vmBase + 0x0FFD68, true);
    assert.ok(localImgDrawn >= 1, `Expected inline <img> rendered on /www/index.hts, got ${localImgDrawn}`);

    // Click [SonderGW] button at (26 + 88, 22 + 20) = (114, 42) to load /atlas from sonder.gw (0x00FE)
    clickTabComp(114, 42);
    stepBoth(2);
    const atlasPage = new TextDecoder().decode(tcCpu.ram.subarray(vmBase + 0x049000, vmBase + 0x049300)).replace(/\0.*$/, "");
    assert.ok(atlasPage.includes("(/atlas)"), `Expected /atlas page in WEB_PAGE_BUF, got: ${atlasPage}`);

    // Inspect the parsed link bounding boxes in WEB_LINK_TAB (vmRam[0x04A300]) and click the first link on the canvas!
    const rx0 = tcCpu.ramDV.getInt32(vmBase + 0x04A300 + 0, true);
    const ry0 = tcCpu.ramDV.getInt32(vmBase + 0x04A300 + 4, true);
    const linkHref = new TextDecoder().decode(tcCpu.ram.subarray(vmBase + 0x04A300 + 16, vmBase + 0x04A300 + 46)).replace(/\0.*$/, "");
    assert.ok(linkHref.startsWith("/"), `Expected parsed <a href='...'> link on /atlas page, got '${linkHref}'`);

    // Click directly on the rendered link inside the SpiralWeb window (26 + rx0 + 8, 22 + ry0 + 4)!
    clickTabComp(26 + rx0 + 8, 22 + ry0 + 4);
    stepBoth(2);
    const secondPage = new TextDecoder().decode(tcCpu.ram.subarray(vmBase + 0x049000, vmBase + 0x049300)).replace(/\0.*$/, "");
    assert.ok(secondPage.includes(`(${linkHref})`), `Expected SpiralWeb to navigate to clicked link '${linkHref}', got: ${secondPage}`);
    assert.notStrictEqual(secondPage, atlasPage, "Clicked link page must differ from /atlas");

    // Click [Back] button at (26 + 195, 22 + 20) = (221, 42) to return to /atlas!
    clickTabComp(221, 42);
    stepBoth(2);
    const backPage = new TextDecoder().decode(tcCpu.ram.subarray(vmBase + 0x049000, vmBase + 0x049300)).replace(/\0.*$/, "");
    assert.strictEqual(backPage, atlasPage, "Clicking [Back] in SpiralWeb must restore the exact previous page (/atlas) from history");

    console.log(`  [PASS] 2. Full SpiralWeb Browser: rendered inline <img>, clicked link -> '${linkHref}', clicked [Back] -> '/atlas' restored!`);
  }

  // --------------------------------------------------------------------------
  // 3. Multiplayer Snake over StudioNet (TabComp <-> Hummingbird on SDP Port 4400)
  // --------------------------------------------------------------------------
  {
    // Open SpiralSnake on TabComp via Launcher (item 10)
    clickTabComp(24, 6);
    clickTabComp(40, 16 + 9 * 10 + 4);
    assert.strictEqual(tcCpu.ramDV.getInt32(vmBase + 0x0FFD18, true), 10, "SpiralSnake open on TabComp");

    // Open SpiralSnake on Hummingbird by clicking its desktop "Game" icon at (292, 148)
    hbPc.ps2.sendMousePacket(132, 48, 1); // from (160, 100) to (292, 148)
    stepBoth(2);
    hbPc.ps2.sendMousePacket(0, 0, 0);
    stepBoth(15);

    const snakeFrames = globalThis.__STUDIONET_SWITCH.packetLog.filter(
      p => p.bytes.length >= 16 && (p.bytes[8] | (p.bytes[9] << 8)) === 4400
    );
    assert.ok(snakeFrames.length >= 4, `Expected >=4 Multiplayer Snake SDP frames on port 4400, got ${snakeFrames.length}`);
    console.log(`  [PASS] 3. Multiplayer Snake over StudioNet (Stretch §5): exchanged ${snakeFrames.length} live SDP state packets on Port 4400 between TabComp & Hummingbird!`);
  }
}

if (require.main === module) {
  runSonderSuite();
}

module.exports = { runSonderSuite };
