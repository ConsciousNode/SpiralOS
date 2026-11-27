"use strict";
/**
 * SpiralOS 1.6.1 Real-Hardware & Audit Fix Verification Suite (tests/spiralos-161.js)
 *
 * Tests:
 *  1. ACPI S5 shutdown on Hummingbird with emulated RSDP/RSDT/FADT/DSDT (\_S5_),
 *     file persistence across shutdown+reboot, plus missing-_S5_ positive control (halts, never reboots).
 *  2. Notes "New" button + 60-line cursor-follow scrolling in both Notes and Edit.
 *  3. PS/2 mouse packet sync (bit 3 of byte 0 resync after bad byte) + SysMon MouseLog -> /home/mouse.log.
 *  4. Game settings (Klondike Draw 3 & Deal #42, Spider 2 & 4 suits = 104 cards, Blocks Lv5 > Lv1 speed).
 */

const assert = require("assert");
const { loadEmulators, sha256Hex } = require("./harness.js");
const { buildSpiralOSImage } = require("../tools/build.js");
const { SpiralFS, SPFS_IMG_OFFSET, SPFS_SIZE } = require("../compiler/spiralfs.js");

loadEmulators();

const PLAIN_CHARS = "1234567890-=\b\tqwertyuiop[]\r\0asdfghjkl;'`\0\\zxcvbnm,./";
function asciiToScancode(ascii) {
  if (ascii === 13 || ascii === 10) return 0x1C;
  if (ascii === 32) return 0x39;
  if (ascii === 8) return 0x0E;
  const idx = PLAIN_CHARS.indexOf(String.fromCharCode(ascii).toLowerCase());
  if (idx >= 0) return idx + 2;
  throw new Error("Unsupported ASCII: " + ascii);
}

function createTC(img) {
  const tcFs = new globalThis.TabCompFS();
  const cpu = new globalThis.TabCompCPU(tcFs);
  globalThis.initHardwareMemory(cpu);
  globalThis.bootSpiralDiskImage(cpu, img);
  const vmBase = 0x200000;
  return {
    cpu,
    step(n = 1) {
      const target = cpu.presentCount + n;
      let g = 0;
      while (cpu.presentCount < target && !cpu.halted && g++ < n * 250) {
        cpu.yielded = false;
        cpu.stepBatch(200000);
      }
    },
    r32(o) { return cpu.ramDV.getInt32(vmBase + o, true); },
    rU8(o, len) { return cpu.ram.subarray(vmBase + o, vmBase + o + len); },
    click(x, y) {
      cpu.setMouseState(x, y, 1); this.step(1);
      cpu.setMouseState(x, y, 0); this.step(1);
    },
    type(str) {
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        cpu.pushKeyEvent(1, c, c, 0);
        cpu.pushKeyEvent(0, c, c, 0);
        if ((i & 31) === 31 || i + 1 === str.length) this.step(1);
      }
    }
  };
}

function createHB(img, ramSizeMB = 16) {
  const hb = new globalThis.HummingbirdPC({ ramSizeMB });
  hb.loadFloppyImage(img);
  const vmBase = 0x200000;
  return {
    hb,
    step(n = 1) {
      const target = hb.ramView.getInt32(vmBase + 0x0FFD04, true) + n;
      let g = 0;
      while (hb.ramView.getInt32(vmBase + 0x0FFD04, true) < target && !hb.cpu.halted && g++ < n * 600) {
        hb.cpu.runSteps(500000);
      }
    },
    r32(o) { return hb.ramView.getInt32(vmBase + o, true); },
    type(str) {
      for (let i = 0; i < str.length; i++) {
        const sc = asciiToScancode(str.charCodeAt(i));
        hb.ps2.sendKeyScancode(sc);
        hb.ps2.sendKeyScancode(sc | 0x80);
      }
      this.step(2);
    }
  };
}

function writeAcpiTables(pc, { includeS5 = true, pm1a = 0x0604, pm1b = 0x0608, slpTypA = 5, slpTypB = 5 } = {}) {
  const ram = pc.ram;
  const dv = pc.ramView;
  const RSDP_ADDR = 0x000E0000;
  const RSDT_ADDR = 0x000E1000;
  const FADT_ADDR = 0x000E2000;
  const DSDT_ADDR = 0x000E3000;

  const setStr = (addr, str) => { for (let i = 0; i < str.length; i++) ram[addr + i] = str.charCodeAt(i); };
  const fixChecksum = (addr, len, ckOff) => {
    ram[addr + ckOff] = 0;
    let sum = 0;
    for (let i = 0; i < len; i++) sum = (sum + ram[addr + i]) & 0xFF;
    ram[addr + ckOff] = (256 - sum) & 0xFF;
  };

  // 1. RSDP (20 bytes) at 0x000E0000
  ram.fill(0, RSDP_ADDR, RSDP_ADDR + 36);
  setStr(RSDP_ADDR, "RSD PTR ");
  setStr(RSDP_ADDR + 9, "SPIRAL");
  ram[RSDP_ADDR + 15] = 0; // ACPI 1.0
  dv.setUint32(RSDP_ADDR + 16, RSDT_ADDR, true);
  fixChecksum(RSDP_ADDR, 20, 8);

  // 2. RSDT (40 bytes: 36B header + 1 entry -> FADT)
  ram.fill(0, RSDT_ADDR, RSDT_ADDR + 64);
  setStr(RSDT_ADDR, "RSDT");
  dv.setUint32(RSDT_ADDR + 4, 40, true);
  ram[RSDT_ADDR + 8] = 1;
  dv.setUint32(RSDT_ADDR + 36, FADT_ADDR, true);
  fixChecksum(RSDT_ADDR, 40, 9);

  // 3. FADT ("FACP", 116 bytes)
  ram.fill(0, FADT_ADDR, FADT_ADDR + 128);
  setStr(FADT_ADDR, "FACP");
  dv.setUint32(FADT_ADDR + 4, 116, true);
  dv.setUint32(FADT_ADDR + 40, DSDT_ADDR, true); // DSDT
  dv.setUint32(FADT_ADDR + 48, 0x00B2, true);    // SMI_CMD
  ram[FADT_ADDR + 52] = 0xA0;                    // ACPI_ENABLE
  dv.setUint32(FADT_ADDR + 64, pm1a, true);      // PM1a_CNT_BLK
  dv.setUint32(FADT_ADDR + 68, pm1b, true);      // PM1b_CNT_BLK
  fixChecksum(FADT_ADDR, 116, 9);

  // 4. DSDT (36B header + AML)
  ram.fill(0, DSDT_ADDR, DSDT_ADDR + 128);
  setStr(DSDT_ADDR, "DSDT");
  let aml;
  if (includeS5) {
    // NameOp (0x08) RootChar (0x5C) "_S5_" PackageOp (0x12) PkgLen (0x06) NumElem (0x04) BytePrefix slpTypA BytePrefix slpTypB 0 0
    aml = [0x08, 0x5C, 0x5F, 0x53, 0x35, 0x5F, 0x12, 0x08, 0x04, 0x0A, slpTypA, 0x0A, slpTypB, 0x00, 0x00];
  } else {
    // Dummy DSDT with _S0_ only (no _S5_)
    aml = [0x08, 0x5C, 0x5F, 0x53, 0x30, 0x5F, 0x12, 0x06, 0x04, 0x00, 0x00, 0x00, 0x00];
  }
  const dsdtLen = 36 + aml.length;
  dv.setUint32(DSDT_ADDR + 4, dsdtLen, true);
  for (let i = 0; i < aml.length; i++) ram[DSDT_ADDR + 36 + i] = aml[i];
  fixChecksum(DSDT_ADDR, dsdtLen, 9);
}

function runSuite() {
  console.log("=== SpiralOS 1.6.1 Audit & Real-Hardware Verification Suite (tests/spiralos-161.js) ===");
  const built = buildSpiralOSImage();
  const img = built.img;

  // --------------------------------------------------------------------------
  // Test 1: ACPI S5 Shutdown (Emulated FADT/DSDT) + Missing-S5 Positive Control
  // --------------------------------------------------------------------------
  {
    // 1a. Full ACPI S5 shutdown + file persistence across reboot
    const m = createHB(img, 16);
    writeAcpiTables(m.hb, { includeS5: true, pm1a: 0x0604, pm1b: 0x0608, slpTypA: 5, slpTypB: 5 });
    const acpiWrites = [];
    const origOut16 = m.hb.portWrite.bind(m.hb);
    m.hb.portWrite = function(port, val, size) {
      if ((port === 0x0604 || port === 0x0608) && size === 2) acpiWrites.push({ port, val: val & 0xFFFF });
      return origOut16(port, val, size);
    };

    m.step(2);
    m.type("write /home/s5test.txt acpi-ok\r");
    m.step(2);
    m.type("shutdown\r");
    let steps = 0;
    while (!m.hb.cpu.halted && steps++ < 400) m.hb.cpu.runSteps(500000);

    assert.strictEqual(m.hb.cpu.halted, true, "ACPI S5 shutdown must halt CPU cleanly");
    assert.ok((m.hb.cpu.eip >>> 0) >= 0x8000 && (m.hb.cpu.cr0 & 1) === 1, `ACPI S5 must not reboot into real-mode (eip=0x${(m.hb.cpu.eip>>>0).toString(16)})`);
    assert.strictEqual(m.r32(0x0FFDB0), 1, "ACPI status must be 1 (S5 written)");
    const wA = acpiWrites.find(w => w.port === 0x0604);
    const wB = acpiWrites.find(w => w.port === 0x0608);
    assert.ok(wA && wA.val === ((5 << 10) | 0x2000), `Expected PM1a_CNT (0x0604) = 0x3400, got ${JSON.stringify(acpiWrites)}`);
    assert.ok(wB && wB.val === ((5 << 10) | 0x2000), `Expected PM1b_CNT (0x0608) = 0x3400, got ${JSON.stringify(acpiWrites)}`);

    // Verify file persisted across fresh reboot
    const flushed = new Uint8Array(m.hb.floppyImage);
    const mReboot = createHB(flushed, 16);
    mReboot.step(2);
    const spfs = new SpiralFS(mReboot.hb.floppyImage.subarray(SPFS_IMG_OFFSET, SPFS_IMG_OFFSET + SPFS_SIZE));
    const savedText = new TextDecoder().decode(spfs.readFile("/home/s5test.txt"));
    assert.strictEqual(savedText, "acpi-ok", `File did not survive ACPI shutdown+reboot: '${savedText}'`);

    // 1b. Positive control: DSDT missing _S5_ AND APM unavailable -> must halt cleanly, NEVER reboot!
    const mNoS5 = createHB(img, 16);
    writeAcpiTables(mNoS5.hb, { includeS5: false, pm1a: 0x0604, pm1b: 0x0608 });
    const noS5Writes = [];
    const origOut16b = mNoS5.hb.portWrite.bind(mNoS5.hb);
    mNoS5.hb.portWrite = function(port, val, size) {
      if ((port === 0x0604 || port === 0x0608) && size === 2) noS5Writes.push({ port, val: val & 0xFFFF });
      return origOut16b(port, val, size);
    };
    const origInt15 = mNoS5.hb.handleBiosInt15.bind(mNoS5.hb);
    mNoS5.hb.handleBiosInt15 = function(eax, ebx, ecx, edx, esi, edi) {
      if (((eax >>> 8) & 0xFF) === 0x53) {
        mNoS5.hb.setStackCF(1); // Simulate machine with no legacy APM BIOS
        return;
      }
      return origInt15(eax, ebx, ecx, edx, esi, edi);
    };

    mNoS5.step(2);
    const framesBefore = mNoS5.r32(0x0FFD04);
    mNoS5.type("shutdown\r");
    steps = 0;
    while (!mNoS5.hb.cpu.halted && steps++ < 400) mNoS5.hb.cpu.runSteps(500000);
    assert.strictEqual(mNoS5.hb.cpu.halted, true, "Missing-S5 + no-APM shutdown must halt cleanly");
    assert.ok((mNoS5.hb.cpu.eip >>> 0) >= 0x8000 && (mNoS5.hb.cpu.cr0 & 1) === 1, "Missing-S5 shutdown must NEVER reboot");
    assert.strictEqual(mNoS5.r32(0x0FFDB0), 4, "Expected ACPI status 4 (_S5_ not found)");
    assert.strictEqual(noS5Writes.length, 0, "Missing _S5_ must not write to PM1a/PM1b_CNT");
    assert.ok(mNoS5.r32(0x0FFD04) <= framesBefore + 8, "Missing-S5 must not loop/reboot");

    console.log(`  [PASS] 1. ACPI S5 Shutdown: RSDP->RSDT->FADT->DSDT(\\_S5_) wrote 0x3400 to PM1a(0x0604) & PM1b(0x0608), /home/s5test.txt ("${savedText}") survived reboot; missing-_S5_ positive control halted cleanly (status=4, 0 reboots)`);
  }

  // --------------------------------------------------------------------------
  // Test 2: Notes "New" Button + 60-Line Cursor-Follow Scrolling (Notes & Edit)
  // --------------------------------------------------------------------------
  {
    const tc = createTC(img);
    tc.step(2);
    // Open Notes (launcher item 14 -> appId 16, rect x=24, y=18, w=228)
    tc.click(24, 6);
    tc.click(40, 15 + 14 * 9 + 4);
    assert.strictEqual(tc.r32(0x0FFD18), 16, "Notes must be focused");

    tc.type("initial text");
    assert.ok(tc.r32(0x04DFC0) > 0, "Notes len should be > 0 after typing");
    // Click [New] button at (24 + 12, 18 + 20) = (36, 38)
    tc.click(36, 38);
    assert.strictEqual(tc.r32(0x04DFC0), 0, "Notes [New] button must clear buffer length to 0");
    assert.strictEqual(tc.rU8(0x1C1000, 1)[0], 0, "Notes [New] button must null-terminate buffer");

    // Type 60 lines in Notes
    let lines60 = "";
    for (let i = 1; i <= 60; i++) lines60 += `L${i}\r`;
    tc.type(lines60);
    tc.step(2);
    const nScroll = tc.r32(0x0FFDBC);
    const nCurRow = tc.r32(0x0FFDC0);
    assert.ok(nCurRow >= 60, `Notes cur_row expected >= 60, got ${nCurRow}`);
    assert.ok(nScroll > 0 && nCurRow >= nScroll && nCurRow < nScroll + 12,
      `Notes cursor row ${nCurRow} must be visible within scroll=${nScroll}`);

    // Open Edit (launcher item 1 -> appId 2, rect x=28, y=20, w=214)
    tc.click(24, 6);
    tc.click(40, 15 + 1 * 9 + 4);
    assert.strictEqual(tc.r32(0x0FFD18), 2, "Edit must be focused");
    let edit60 = "";
    for (let i = 1; i <= 60; i++) edit60 += `E${i}\r`;
    tc.type(edit60);
    tc.step(2);
    const eScroll = tc.r32(0x0FFDC4);
    const eCurRow = tc.r32(0x0FFDC8);
    assert.ok(eCurRow >= 60, `Edit cur_row expected >= 60, got ${eCurRow}`);
    assert.ok(eScroll > 0 && eCurRow >= eScroll && eCurRow < eScroll + 20,
      `Edit cursor row ${eCurRow} must be visible within scroll=${eScroll}`);

    console.log(`  [PASS] 2. Notes & Edit Cursor-Follow Scroll: Notes [New] cleared buffer, 60 lines -> Notes(curRow=${nCurRow}, scroll=${nScroll}), Edit(curRow=${eCurRow}, scroll=${eScroll})`);
  }

  // --------------------------------------------------------------------------
  // Test 3: PS/2 Mouse Packet Sync (Bit 3 Resync) + SysMon MouseLog -> /home/mouse.log
  // --------------------------------------------------------------------------
  {
    const m = createHB(img, 16);
    m.step(2);
    // Focus SysMon (appId 7) via launcher item 6 and enable MouseLog ('m')
    // Move mouse to launcher [Spiral] -> item 6 (SysMon) or click SysMon directly
    const moveAndClick = (tx, ty) => {
      for (let i = 0; i < 40; i++) {
        const dx = tx - m.r32(0x0FFD08), dy = ty - m.r32(0x0FFD0C);
        if (dx === 0 && dy === 0) break;
        m.hb.ps2.sendMousePacket(Math.max(-32, Math.min(32, dx)), Math.max(-32, Math.min(32, dy)), 0);
        m.step(1);
      }
      m.hb.ps2.sendMousePacket(0, 0, 1); m.step(1);
      m.hb.ps2.sendMousePacket(0, 0, 0); m.step(1);
    };
    moveAndClick(24, 6);
    moveAndClick(40, 15 + 6 * 9 + 4);
    assert.strictEqual(m.r32(0x0FFD18), 7, "SysMon should be focused");
    // Toggle MouseLog ON via [MouseLog] button at SysMon (136 + 20, 78 + 90) = (156, 168)
    moveAndClick(156, 154);
    assert.strictEqual(m.r32(0x04DFF8), 1, "MouseLog toggle must be ON (SHARED_ST + 0x38 = 1)");

    const dropsBefore = m.r32(0x0FFDA8);
    const mxBefore = m.r32(0x0FFD08);
    const myBefore = m.r32(0x0FFD0C);

    // Inject a bad sync byte (bit 3 == 0: 0x00) directly into PS/2 aux queue, then valid 3-byte packet (+10, -6)
    m.hb.ps2.enqueue(0x00, true, false);
    m.hb.ps2.sendMousePacket(10, -6, 0);
    m.step(2);

    const dropsAfter = m.r32(0x0FFDA8);
    assert.ok(dropsAfter >= dropsBefore + 1, `Expected sync drop count to increment (${dropsBefore} -> ${dropsAfter})`);
    assert.strictEqual(m.r32(0x0FFD08), mxBefore + 10, "Mouse X must resync cleanly after bad byte");
    assert.strictEqual(m.r32(0x0FFD0C), myBefore - 6, "Mouse Y must resync cleanly after bad byte");

    // Check /home/mouse.log persisted in SpiralFS
    const spfs = new SpiralFS(m.hb.floppyImage.subarray(SPFS_IMG_OFFSET, SPFS_IMG_OFFSET + SPFS_SIZE));
    const logBytes = spfs.readFile("/home/mouse.log");
    assert.ok(logBytes && logBytes.length > 0, "/home/mouse.log must be created when MouseLog is enabled");
    const logText = new TextDecoder().decode(logBytes);
    assert.ok(logText.includes("PKT "), `Expected raw PKT lines in /home/mouse.log, got: '${logText}'`);
    console.log(`  [PASS] 3. Mouse Packet Sync & Diagnostic: bad byte resynced (drops ${dropsBefore}->${dropsAfter}, cursor +10/-6 intact), /home/mouse.log (${logBytes.length} B) logged raw packets`);
  }

  // --------------------------------------------------------------------------
  // Test 4: Game Settings (Klondike Draw 3 & Deal #42, Spider 2 & 4 suits, Blocks Lv5)
  // --------------------------------------------------------------------------
  {
    const tc = createTC(img);
    tc.step(2);
    // Solitaire (launcher item 16 -> appId 18, rect x=16, y=14)
    tc.click(24, 6); tc.click(40, 15 + 16 * 9 + 4);
    tc.type("t"); // Draw 1 -> Draw 3
    tc.click(16 + 12, 14 + 32); // click stock
    assert.strictEqual(tc.r32(0x038400 + 11 * 4), 21, "Klondike Draw 3 stock must be 21");
    assert.strictEqual(tc.r32(0x038400 + 12 * 4), 3, "Klondike Draw 3 waste must be 3");
    tc.type("c42");
    const d1 = sha256Hex(new Uint8Array(tc.rU8(0x038000, 512)));
    tc.type("c99c42");
    const d2 = sha256Hex(new Uint8Array(tc.rU8(0x038000, 512)));
    assert.strictEqual(d1, d2, "Klondike Deal #42 must be deterministic");

    const checkSpider = () => {
      let tot = 0; const sc = [0, 0, 0, 0];
      for (let p = 0; p < 11; p++) {
        const len = tc.r32(0x038400 + p * 4);
        tot += len;
        for (let k = 0; k < len; k++) sc[Math.floor(tc.rU8(0x038000 + p * 64 + k, 1)[0] / 13) & 3]++;
      }
      return { tot, sc };
    };
    tc.type("pt"); // Spider -> 2 suits
    const sp2 = checkSpider();
    assert.strictEqual(sp2.tot, 104);
    assert.strictEqual(sp2.sc.filter(c => c === 52).length, 2);
    tc.type("t"); // Spider -> 4 suits
    const sp4 = checkSpider();
    assert.strictEqual(sp4.tot, 104);
    assert.strictEqual(sp4.sc.filter(c => c === 26).length, 4);

    // Blocks Lv5 vs Lv1
    const runBlk = (lv5) => {
      const b = createTC(img);
      b.step(2);
      b.click(24, 6); b.click(40, 15 + 10 * 9 + 4);
      if (lv5) { for (let i = 0; i < 4; i++) b.click(92 + 116, 26 + 28); }
      const s0 = b.r32(0x0FFD64);
      b.step(20);
      return b.r32(0x0FFD64) - s0;
    };
    const lv1 = runBlk(false), lv5 = runBlk(true);
    assert.ok(lv5 > lv1, `Blocks Lv5 (${lv5}) must fall faster than Lv1 (${lv1})`);
    console.log(`  [PASS] 4. Game Settings: Klondike Draw 3 (24->21/3) & Deal #42 deterministic | Spider 2-suit (${sp2.sc.join("/")}) & 4-suit (${sp4.sc.join("/")}) | Blocks Lv5 (${lv5} drops) > Lv1 (${lv1} drops)`);
  }

  console.log("=== SpiralOS 1.6.1 Verification Suite Complete ===");
}

runSuite();
