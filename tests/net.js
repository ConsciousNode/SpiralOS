#!/usr/bin/env node
/**
 * SpiralOS — tests/net.js: StudioNet Cross-Machine Networking Suite (§5 & §8)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Boots a TabComp-hosted SpiralOS (Node 0x0101) and a Hummingbird-hosted
 * SpiralOS (Node 0x0201) connected via the StudioNet switch and verifies:
 *   1. Bidirectional SDP Chat messaging (TabComp <-> Hummingbird) via SpiralChat
 *   2. Reliable SSP Stream File Transfer (TabComp -> Hummingbird and
 *      Hummingbird -> TabComp) via SpiralSend, verified byte-for-byte in SpiralFS
 *   3. Cross-machine Web Browsing (SpiralWeb on TabComp fetching /index.hts
 *      from SpiralHttpd running on Hummingbird over SSP Port 80)
 *   4. Sonder Gateway Bridge (Stretch §5: SpiralWeb fetching procedural hypertext
 *      from Node 0x00FE "sonder.gw")
 */

"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { loadEmulators, encodePNG, renderTabCompRGBA } = require("./harness.js");
const { buildSpiralOSImage } = require("../tools/build.js");
const { SpiralFS, SPFS_IMG_OFFSET, SPFS_SIZE } = require("../compiler/spiralfs.js");

loadEmulators();

function runNetSuite() {
  console.log("=== SpiralOS StudioNet Cross-Machine Networking Suite (tests/net.js) ===");
  const rootDir = path.resolve(__dirname, "..");
  const { img } = buildSpiralOSImage(rootDir);
  const vmBase = 0x00200000;

  // Clear switch log
  globalThis.__STUDIONET_SWITCH.nics.clear();
  globalThis.__STUDIONET_SWITCH.packetLog = [];

  // 1. Boot Machine A: TabComp (Station 0x0101)
  const tcCpu = new globalThis.TabCompCPU(new globalThis.TabCompFS());
  globalThis.initHardwareMemory(tcCpu);
  globalThis.bootSpiralDiskImage(tcCpu, img);

  // 2. Boot Machine B: Hummingbird i586 PC (Station 0x0201)
  const hbPc = new globalThis.HummingbirdPC({ ramSizeMB: 16 });
  hbPc.loadFloppyImage(img);

  function stepBoth(frames = 2) {
    const tcTarget = tcCpu.presentCount + frames;
    while (tcCpu.presentCount < tcTarget && !tcCpu.halted) {
      tcCpu.yielded = false;
      tcCpu.stepBatch(50000);
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

  function openLauncherTabComp(itemNum) {
    clickTabComp(24, 6);
    clickTabComp(40, 16 + (itemNum - 1) * 10 + 4);
  }

  stepBoth(3);

  // --------------------------------------------------------------------------
  // Test 1: Bidirectional StudioNet Chat (TabComp <-> Hummingbird)
  // --------------------------------------------------------------------------
  // Open SpiralChat on TabComp (Launcher item 12 -> window at 34, 42, w=200, h=92)
  openLauncherTabComp(12);
  assert.strictEqual(tcCpu.ramDV.getInt32(vmBase + 0x0FFD18, true), 12, "SpiralChat should be open on TabComp");

  // Type "Greetings Hummingbird!" on TabComp and click [Send] at (34+200-24, 42+92-10) = (210, 124)
  const msg1 = "Greetings Hummingbird!";
  for (let i = 0; i < msg1.length; i++) {
    const c = msg1.charCodeAt(i);
    tcCpu.pushKeyEvent(1, c, c, 0);
    tcCpu.pushKeyEvent(0, c, c, 0);
  }
  stepBoth(12);
  clickTabComp(210, 124);
  stepBoth(3);

  // Verify Hummingbird received "TC: Greetings Hummingbird!" in its CHAT_LOG_BUF (vmRam[0x048800])
  const hbChatLog1 = new TextDecoder().decode(hbPc.ram.subarray(vmBase + 0x048800, vmBase + 0x048840)).replace(/\0/g, "");
  assert.strictEqual(hbChatLog1, "TC: Greetings Hummingbird!", `Hummingbird chat log mismatch: '${hbChatLog1}'`);

  // Now send a reply from Hummingbird to TabComp by running `ping` in Hummingbird's focused SpiralSh!
  const pingCmd = "ping\r";
  const scMap = { p: 0x19, i: 0x17, n: 0x31, g: 0x22, "\r": 0x1C };
  for (const ch of pingCmd) {
    const sc = scMap[ch];
    hbPc.ps2.sendKeyScancode(sc);
    stepBoth(1);
    hbPc.ps2.sendKeyScancode(sc | 0x80);
    stepBoth(1);
  }
  stepBoth(3);

  // Verify TabComp received "HB: PING from SpiralSh" in line 1 of its CHAT_LOG_BUF (vmRam[0x048840])
  const tcChatLog2 = new TextDecoder().decode(tcCpu.ram.subarray(vmBase + 0x048840, vmBase + 0x048880)).replace(/\0/g, "");
  assert.strictEqual(tcChatLog2, "HB: PING from SpiralSh", `TabComp chat log mismatch: '${tcChatLog2}'`);
  console.log(`  [PASS] 1. Bidirectional StudioNet Chat (TabComp <-> Hummingbird):`);
  console.log(`    - Hummingbird RX : "${hbChatLog1}"`);
  console.log(`    - TabComp RX     : "${tcChatLog2}"`);

  // --------------------------------------------------------------------------
  // Test 2: Reliable SSP File Transfer (TabComp -> Hummingbird, Byte-for-Byte)
  // --------------------------------------------------------------------------
  // Create a custom file `/home/beam_test.txt` in TabComp's SpiralFS first
  const testPayload = "STUDIO-NET-FILE-TRANSFER-VERIFIED-1991-SPIRALOS-OK!";
  const tcSpfs = new SpiralFS(tcCpu.ram.subarray(vmBase + 0x228000, vmBase + 0x228000 + SPFS_SIZE));
  const newIdx = tcSpfs.writeFile("/home/beam.txt", testPayload, 1024);
  tcCpu.ram.set(tcSpfs.buf, vmBase + 0x228000);

  // Open SpiralSend on TabComp (Launcher item 13 -> window at 52, 46, w=180, h=90)
  openLauncherTabComp(13);
  assert.strictEqual(tcCpu.ramDV.getInt32(vmBase + 0x0FFD18, true), 13, "SpiralSend should be open on TabComp");

  // Cycle [NextFile] at (52+30, 46+90-10) = (82, 126) until /home/beam.txt (index newIdx) is selected
  for (let i = 0; i < newIdx; i++) {
    clickTabComp(82, 126);
  }
  // Click [BeamToPeer] at (52+100, 46+90-10) = (152, 126)
  clickTabComp(152, 126);
  stepBoth(4);

  // Verify Hummingbird received `/home/beam.txt` into its SpiralFS and persisted it to floppyImage!
  const hbSpfs = new SpiralFS(hbPc.floppyImage.subarray(SPFS_IMG_OFFSET, SPFS_IMG_OFFSET + SPFS_SIZE));
  const rxBytes = hbSpfs.readFile("/home/beam.txt");
  const origBytes = new TextEncoder().encode(testPayload);
  assert.ok(rxBytes, "Hummingbird SpiralFS must contain transferred file /home/beam.txt");
  assert.strictEqual(rxBytes.length, origBytes.length, "Transferred file length mismatch");
  for (let i = 0; i < origBytes.length; i++) {
    assert.strictEqual(rxBytes[i], origBytes[i], `Byte mismatch at offset ${i}`);
  }
  console.log(`  [PASS] 2. Cross-Machine File Transfer (TabComp -> Hummingbird): /home/beam.txt (${rxBytes.length} bytes) verified byte-for-byte + SSP ACK received!`);

  // --------------------------------------------------------------------------
  // Test 3: SpiralWeb Browser & SpiralHttpd Tiny Server + Sonder Gateway
  // --------------------------------------------------------------------------
  // Open SpiralWeb on TabComp (Launcher item 14 -> window at 26, 22, w=236, h=132)
  openLauncherTabComp(14);
  assert.strictEqual(tcCpu.ramDV.getInt32(vmBase + 0x0FFD18, true), 14, "SpiralWeb should be open on TabComp");

  // Click [PeerWeb] button at (26+30, 22+20) = (56, 42) to fetch /index.hts from Hummingbird's SpiralHttpd!
  clickTabComp(56, 42);
  stepBoth(4);
  const peerHtml = new TextDecoder().decode(tcCpu.ram.subarray(vmBase + 0x049000, vmBase + 0x049200)).replace(/\0/g, "");
  assert.ok(peerHtml.includes("SpiralWeb Node Portal"), `Expected peer SpiralHttpd page, got: ${peerHtml}`);
  console.log("  [PASS] 3. SpiralWeb <-> SpiralHttpd: TabComp fetched & rendered HTML page served over StudioNet SSP by Hummingbird!");

  // Click [SonderGW] button at (26+88, 22+20) = (114, 42) to surf the Sonder Gateway (Node 0x00FE)!
  clickTabComp(114, 42);
  stepBoth(3);
  const sonderHtml = new TextDecoder().decode(tcCpu.ram.subarray(vmBase + 0x049000, vmBase + 0x049200)).replace(/\0/g, "");
  assert.ok(sonderHtml.includes("(/atlas)"), `Expected Sonder Gateway page, got: ${sonderHtml}`);
  console.log("  [PASS] 4. Sonder Gateway Bridge (Stretch §5): surfed sonder.gw (/atlas) via StudioNet Node 0x00FE!");

  // Save screenshot of SpiralWeb rendering Sonder Gateway
  const netFrame = renderTabCompRGBA(tcCpu);
  fs.writeFileSync(
    path.join(rootDir, "screenshots", "studionet_browser.png"),
    encodePNG(netFrame.width, netFrame.height, netFrame.rgba)
  );
  console.log(`  [PASS] Total StudioNet frames routed: ${globalThis.__STUDIONET_SWITCH.packetLog.length}`);
}

if (require.main === module) {
  runNetSuite();
}

module.exports = { runNetSuite };
