# SpiralOS 1.2.1: PS/2 mouse fixes from the first Toshiba test
**Date:** 2026-11-12 · **Author:** Kehai Interim (hand-patched, not an Argon build) · **Image sha256:** `9d239cd8f59c124ee5031c9ce6d5a643d9855a135e42e534302c0cd949e7e5b4`

## What Kham saw (Toshiba, Legacy BIOS, USB stick, 2026-11-12 06:23 ET)
- Text and centering good.
- A **USB optical mouse** (reaching SpiralOS through the BIOS's USB-legacy PS/2 emulation) worked for a second or two, then the cursor pinned to a screen edge and slid along it as the mouse moved, over and over.
- The **internal trackpad** never moved the cursor.
- Everything said "1.1": the version strings were never bumped for 1.2.

## Causes found in `core/core_x86.js` (1.2)
1. **No packet sync.** The poll loop counted mouse bytes 0-1-2 and took *any* byte as a packet start. Byte 0 of a PS/2 packet always has bit 3 set; it was never checked. One stray or dropped byte (a late ID byte, an ACK tail, a byte lost by the legacy-USB emulation) shifts every later packet by one byte for good: the header byte gets read as a delta (constant drift into an edge), and real X motion gets read as Y. That is exactly the "pinned to the side, sliding along it" symptom. Probe: one stray `0x00` sends 1.2's cursor from (160,100) to (200,50) on five rightward packets.
2. **8-bit deltas.** PS/2 deltas are 9-bit: the sign bits live in byte 0 (bit 4 = X, bit 5 = Y). 1.2 sign-extended bytes 1 and 2 as 8-bit values, so any move past ±127 went the wrong way, and overflow packets (bits 6, 7) were applied as motion.
3. **Timeouts sized for emulators.** Every 8042 wait was 16,384 status reads, roughly 16 ms of real port I/O. A mouse/trackpad reset (`0xFF`) can take hundreds of ms to report its self-test (`0xAA`), so on real hardware init most likely gave up and streaming was never enabled. Emulator port reads are instant, so no test could see it. *This is my best explanation for the dead trackpad, not yet confirmed on the Toshiba.*

## Changes
- **H1 (timeouts):** the self-test (`0xAA`) wait after a mouse reset is ~2,097,152 status reads (~2 s real; `ps2_in_60_long`). The other 8042 waits went from 16,384 to 65,536 reads (~65 ms real). The "mouse never answers" boot stays inside its bound (5.0M of 6.0M instructions).
- **H2 (packets):** stage 0 drops any byte without bit 3 (self-resyncing); deltas are decoded as 9-bit using byte 0's sign bits; packets with an overflow bit set keep their buttons but drop their motion.
- **Version strings:** boot banner `SpiralOS 1.2` (16-byte banner slot; the asm test appends "-X"), shell `ver`/greeting and the SpiralC window say `1.2.1`.
- `index.html` (Build Station) rebuilt with `tools/build_station.py` (verified reproducible at the 1.2 commit first; loads in Chromium with 0 errors).

## Verification
- New `tests/mouse-121.js` (raw bytes through the emulator's own 8042 queue; guest only read). Against 1.2 (`SPIRALOS_12_IMG=<1.2 image>`) and 1.2.1:

| probe | 1.2 | 1.2.1 |
|---|---|---|
| clean packets, 5 × (+10, 0) | PASS | PASS |
| one stray 0x00 first | FAIL (160,100)→(200,50) | PASS →(210,100) |
| 9-bit delta, −200 | FAIL →(216,100) | PASS →(0,100) |
| overflow packet | FAIL →(159,100) | PASS (no move) |
| slow device (every response +200k instr) | FAIL (no init) | PASS |

  The slow-device probe delays *every* 8042 response (the emulator's latency knob), which is stricter than real hardware, where mainly the reset is slow.
- `tests/bringup.js` (1.1 baseline at commit 48cf9b9): all 8 tests pass, including all 13 existing suites.
- **One test edit, disclosed:** `tests/asm.js` hardcoded the banner string `"SpiralOS 1.1"`; it now expects `"SpiralOS 1.2"`. No other test changed.

## Not fixed / unknown
- If the USB-legacy emulation ever delivers a mouse byte **without** the status AUX bit (bit 5) set, the poll loop routes it to the keyboard path. Packet sync now limits the damage to one packet, but a stray keystroke is possible. Watch for phantom keys while moving the mouse.
- Synaptics/ALPS trackpads normally work in plain PS/2 mode after reset; if the pad is still dead on 1.2.1, the next suspects are an active-multiplexing 8042 or the BIOS handing the aux port to the USB mouse.
- The SpiralOS-on-Triton pack (`SPEC-TRITON-CORE.md`) was written against the 1.2 image hash; rebase it onto 1.2.1 before resending.
