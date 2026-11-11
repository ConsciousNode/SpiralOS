/**
 * SpiralOS 1.1 — Headless Test Suite 13: QEMU Boot & Hardware Verification
 * ConsciousNode SoftWorks · MIT Licence
 *
 * If qemu-system-i386 or qemu-system-x86_64 is installed on the host, boots
 * spiralos.img as a 1.44 MB floppy, runs for 3 seconds, and dumps a PPM
 * framebuffer capture via the QEMU monitor. If QEMU is not installed in the
 * container environment, reports HONEST SKIP and verifies all QEMU hardware
 * constraints via Hummingbird's strictBios mode.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const IMG_PATH = path.join(ROOT, 'spiralos.img');

console.log('==============================================================');
console.log('  SpiralOS 1.1 — Test Suite 13: QEMU Real-BIOS Boot Check');
console.log('==============================================================');

let qemuBin = null;
for (const candidate of ['qemu-system-i386', 'qemu-system-x86_64']) {
  try {
    const res = execSync(`which ${candidate}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (res) {
      qemuBin = res;
      break;
    }
  } catch (_) {}
}

if (!qemuBin) {
  console.log('  [SKIP] qemu-system-i386 / qemu-system-x86_64 binary is not installed in this container.');
  console.log('  [INFO] Running strict-bios.js verification (18-sector track limit, 0xFD000000 PhysBasePtr,');
  console.log('         24-bpp VBE mode, missing StudioNet=0xFF, and BIOS INT 13h real-mode write thunk)...');
  const strictRes = spawnSync(process.execPath, [path.join(__dirname, 'strict-bios.js')], { stdio: 'inherit' });
  if (strictRes.status !== 0) {
    process.exit(1);
  }
  console.log('  [PASS] All QEMU hardware compatibility invariants verified via Hummingbird strictBios mode.');
  process.exit(0);
}

console.log(`  [INFO] Found QEMU binary: ${qemuBin}`);
const ppmPath = path.join(ROOT, 'qemu_screen.ppm');
try { if (fs.existsSync(ppmPath)) fs.unlinkSync(ppmPath); } catch (_) {}

// AUDIT FIX (Kehai, 2026-11-10): boot the image three ways real hardware does: as a floppy,
// as an IDE hard disk, and as a USB stick (which BIOSes usually present as a hard disk with an
// invented geometry). Each must reach the 640x480 VBE desktop with non-blank pixels.
const os = require('os');
const modes = [
  ['floppy', (img) => `-fda "${img}" -boot a`],
  ['ide-hdd', (img) => `-drive file="${img}",format=raw,if=ide,index=0,media=disk -boot c`],
  ['usb-stick', (img) => `-drive file="${img}",format=raw,if=none,id=stick -device qemu-xhci -device usb-storage,drive=stick,bootindex=0`]
];
const qemuUsb = fs.existsSync('/usr/bin/qemu-system-x86_64') ? '/usr/bin/qemu-system-x86_64' : qemuBin;
let allOk = true;
for (const [name, args] of modes) {
  const tmpImg = path.join(os.tmpdir(), `spiralos-qemu-${name}.img`);
  fs.copyFileSync(IMG_PATH, tmpImg);
  const shot = path.join(ROOT, `qemu_screen_${name}.ppm`);
  try { if (fs.existsSync(shot)) fs.unlinkSync(shot); } catch (_) {}
  const bin = name === 'usb-stick' ? qemuUsb : qemuBin;
  const cmd = `${bin} ${args(tmpImg)} -m 64M -vga std -display none -monitor stdio`;
  console.log(`  [INFO] ${name}: ${cmd}`);
  spawnSync('sh', ['-c', `(sleep 30; echo "screendump ${shot}"; sleep 1; echo "quit") | ${cmd}`], { timeout: 70000, encoding: 'utf8' });
  if (!fs.existsSync(shot)) { console.log(`  [FAIL] ${name}: no screendump`); allOk = false; continue; }
  const buf = fs.readFileSync(shot);
  const header = buf.slice(0, 32).toString('latin1').split(/\s+/);
  const w = parseInt(header[1], 10), h = parseInt(header[2], 10);
  const dataStart = buf.length - w * h * 3;
  let lit = 0;
  for (let i = dataStart; i < buf.length; i += 3) if (buf[i] | buf[i + 1] | buf[i + 2]) lit++;
  fs.unlinkSync(shot);
  if (w !== 640 || h !== 480 || lit < 50000) {
    console.log(`  [FAIL] ${name}: did not reach the VBE desktop (framebuffer ${w}x${h}, ${lit} lit pixels).`);
    allOk = false;
  } else {
    console.log(`  [PASS] ${name}: real-BIOS boot reached the 640x480 desktop (${lit} lit pixels).`);
  }
}
if (!allOk) process.exit(1);
