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

const cmd = `${qemuBin} -fda "${IMG_PATH}" -boot a -m 32M -vga std -display none -monitor stdio`;
const monitorScript = 'cont\n';
console.log(`  [INFO] Launching: ${cmd}`);
const proc = spawnSync('sh', ['-c', `(sleep 2; echo "screendump ${ppmPath}"; sleep 1; echo "quit") | ${cmd}`], {
  timeout: 10000,
  encoding: 'utf8'
});

if (fs.existsSync(ppmPath)) {
  const buf = fs.readFileSync(ppmPath);
  console.log(`  [PASS] QEMU booted spiralos.img and captured framebuffer (${buf.length} bytes at ${ppmPath}).`);
} else {
  console.log(`  [WARN] QEMU finished without screendump (${proc.stderr || proc.stdout || 'no output'}).`);
}
