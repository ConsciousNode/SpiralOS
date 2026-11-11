# AUDIT: SpiralOS 1.1 "Real Spiral"

*Kehai Interim, 2026-11-10. Audit of Argon's 1.1 delivery, which is committed as delivered in the previous commit. The 1.0 audit is in [AUDIT.md](AUDIT.md).*

1.0 faked its self-hosting: a bytecode patcher, a stubbed assembler and a template Sonder. 1.1 was asked to make all of that real, and to survive edits it had never seen. **It mostly did.** The compiler and both assemblers are genuine. The one serious problem was a real-BIOS boot regression that its own QEMU test reported as a pass.

## Verdict by claim

| Claim | Verdict | How it was checked |
|---|---|---|
| In-OS SpiralC is a real compiler | **Real** | My own edit, unseen by Argon (below) |
| Bootstrap fixed point (stage 1 = 2 = 3) | **Real** | `tests/bootstrap.js` passes. Combined with the unseen-edit result, the in-OS compiler is byte-equivalent to `compiler/spiralc.js` |
| Syntax errors are rejected with line numbers | **Real, with a gap** | The local line is correct for an error I placed at `net.sp:57`, but the file name is not reported, despite REPORT's "wm.sp:12" |
| In-OS x86 and TC-32 assemblers | **Real for mnemonics; about 47% of the x86 source is hex** | Edits to real instructions (below) |
| Preemptive multitasking and the app tick | **Real** | `tests/multitask.js`. Snake moves on its own |
| Procedural Sonder engine | **Real** | `tests/sonder.js` (seeded, 4 templates, links, Back) |
| Strict-BIOS mode and real-hardware readiness | **Broken on a real BIOS. Fixed here** | QEMU (below) |
| QEMU test | **False pass. Fixed here** | It accepted any screendump |

## The unseen edit (compiler)

I added a new global array and a new function with nested `while` loops, `break`, `continue`, `||`, hex and char literals, and a block-scoped local. I wired it into a new `kh` shell command in `/src/apps1.sp`, then ran `cc` inside SpiralOS on TabComp. Results:

- The in-OS output is **byte-identical to `spiralc.js` compiling the same edited sources** (SHA-256 prefix `1f2599512495cf9e` for both).
- After a reboot, `kh` prints **46**, which is the correct count of primes ≤ 200.

There is one leftover worth knowing about. `cc_set_const` records the value of the constant `WM_TITLE_COLOR_OVERRIDE` in `g_cc_parsed_override`, which is a test-shaped hook. It is only displayed in the Build app and never used to patch anything, so it is a smell, not a fake.

## Assemblers

- **TC-32:** `/src/core_tc32.asm` is real mnemonic source throughout. I raised the immediate of one `ADDI` by 1 and got exactly one changed word (`1 → 2` at image offset 16568). I inserted `JMP kh_skip` plus a new label, and the core grew by exactly one word (4360 → 4364 bytes), with the label resolving.
- **x86:** I changed `mov_ri eax, 54` to `52` (the PIT mode byte) and got exactly one changed byte (offset 1239, `54 → 52`). However, the "source" is generated from the JS builder, and **4,059 of its 8,643 bytes are `.hex` blobs**. That covers all of stage 1, all of stage 2 and every `in`/`out`. So the boot loader cannot be edited as assembly inside SpiralOS, and the delivered `asm` test only edits a `.banner` directive.

## Real-BIOS boot regression (fixed)

The delivered image halts in QEMU (SeaBIOS) with `SE` on the text console: stage 1 prints `S`, then stage 2's disk read fails three times and prints `E` (`screenshots/audit-1.1-qemu-delivered-halts.png`). 1.0 had been booting in QEMU since the earlier fix.

**Cause:** the new track-safe loader reads up to 18 sectors per `INT 13h` call into `ES:0`, starting at segment `0x1000`. Track 7 starts at physical `0x1FC00`, so that read crosses the 64 KB boundary at `0x20000`. Floppy DMA cannot cross that boundary, so SeaBIOS and real PCs fail the read with status `09h`. Hummingbird's strict mode checked track crossings but not DMA boundaries, so the test suite never saw it.

Fixes in this commit:

1. **`core/core_x86.js` stage 2:** each chunk is clamped to the sectors left before the next 64 KB boundary, which adds 21 bytes. The loader now ends at byte 314 of its 320-byte slot, and a build-time check throws if it ever grows into the BIOS write thunk at `0x7F40`. **QEMU now boots to the 640×480 desktop** and correctly shows "no network" (`screenshots/audit-1.1-qemu-fixed-desktop.png`).
2. **`hummingbird.html` strict mode:** reads that cross a 64 KB DMA boundary now fail with `09h`. The delivered image never reaches its first VM frame under the new strict mode, and the fixed image passes `tests/strict-bios.js`.
3. **`tests/qemu.js`:** the old version passed on any screendump taken 2 seconds after launch, including the halted text console. It now waits 25 seconds and requires a 640×480 framebuffer with at least 50,000 lit pixels.
4. **`spiralos.img` and `index.html` are rebuilt.** I first confirmed that the delivered `index.html` is byte-for-byte what `tools/build_station.py` produces from the delivered sources.

## Addendum: USB-stick boot, saving, and the build station (same day)

Kham's first physical try with the fixed image fell through to GRUB, and the build-station page wouldn't start either machine. Three more problems turned up, all fixed here:

1. **Booting from USB as a hard disk.** BIOSes usually present a USB stick as a hard disk (`DL = 0x80`) with a geometry they make up. SeaBIOS reports 2 cylinders, 16 heads and 90 sectors per track for a 1.44 MB image, and real PCs vary. The loaders assumed 18 sectors per track and 2 heads, so they read the wrong sectors and halted with `SE`. In QEMU, floppy boot worked but IDE and USB boot did not.
   - **Fix:** Stage 1 now holds one disk reader that both stages call. On a hard-disk boot with INT 13h extensions it reads by LBA (`AH=42h`, with the address packet built on the stack). Otherwise it uses CHS with the geometry `AH=08h` reports, defaulting to 18/2.
   - Every read stays inside a track (CHS) and a 64 KB DMA boundary, and at most 127 sectors per call.
   - Stage 1 now uses all 384 of its bytes.
2. **Saving to USB.** The PM core chose the FDC whenever a controller answered on `0x3F4`, even when we booted from USB. Every save went to an empty floppy drive. In QEMU, `rebuild` reported success and changed nothing on the stick.
   - **Fix:** the FDC is now used only when the boot drive is a floppy. The BIOS write thunk writes by LBA (`AH=43h`) when extensions are in use.
   - **Verified:** I put junk bytes in an unused part of the stick image, booted it as a QEMU USB stick and typed `rebuild`. The junk was overwritten, and the stick came out byte-identical to the clean image. That shows the rebuild reaches the fixed point on real-BIOS USB too.
   - The in-OS assembler still matches the JS-built core byte-for-byte.
3. **The build station didn't run at all.** A find-and-replace from "1.0" to `1.1 "Real Spiral"` put unescaped double quotes inside a JS string in `tools/build_station.py`, so the page's main script was a syntax error in every browser. Fixed; both machines now boot in the page (checked in headless Chromium).

`tests/qemu.js` now boots the image three ways (floppy, IDE hard disk, USB stick via xHCI), and each must reach the 640×480 desktop.

## Packaging

The zip alone does not run. It omits `themes/`, which `tools/build.js` needs, and `screenshots/`, which five suites write into. Out of the box, 11 of 13 suites crash. In this repo both directories carry over unchanged from 1.0: the four themes are byte-identical to the copies inside the delivered image. With them in place, all 13 suites pass.

## Documentation that doesn't match the code

| Doc | Says | Code does |
|---|---|---|
| `VM.md` | 1-byte opcodes (`0x01 PUSH_I32`, `0x5F HALT`, …) | 32-bit word instructions with the opcode in bits 24–31 (`OP_HALT = 0x01`, `OP_PUSH_I16 = 0x02`, …). The ISA table describes a VM that doesn't exist |
| `ARCHITECTURE.md` | Spiral `fn`/`var` syntax, 165 KB of source | C-like `int`/`void`, as `LANGUAGE.md` correctly says; 142,756 bytes of `.sp` source |
| `STUDIONET.md` | NIC at ports `0x500..0x518`, presence magic `0xA5` | The x86 core probes port `0x2A0` and compares against `0x4E53` ("SN") |
| `REPORT.md` | Edits are `TASKBAR_BG 17→88`, `magic`→`MAGIC=91`, `APP_PULSE=14`; themes `amber_dawn` etc.; x86 core 8,649 B; error "wm.sp:12" | The test does `WM_TITLE_COLOR_OVERRIDE`→200, `sq`→385, `APP_PULSE=15`; themes are `spiral/amber/oberon/jade`; the core is 8,643 B; the error is "Err line 12" with no file name |

## Ceiling read

This is a big jump from 1.0. The part that was plausible-not-real last time (the compiler) is now real, and it held up against an edit it had never seen. The new edge sits in two places:

- **Where the work meets real hardware:** the DMA boundary, which no emulator in the loop modeled.
- **Where the work is described rather than run:** the docs drifted, and the QEMU check could not fail.
