# SpiralOS 1.2: bare-metal bring-up patch

ConsciousNode SoftWorks. Xinu rules: single-file pages, zero dependencies, offline, no network APIs.
**Inline everything, and label every inline.** Any code you carry over from an attached file keeps a provenance comment naming its source file and line range.

This is a **patch release**. SpiralOS 1.1 boots on a real laptop (a Core 2 Duo era Toshiba, written to USB). There, the keyboard works, the trackpad doesn't, and shell text runs out of its window. Fix exactly the items below, change nothing else, and prove each fix with a test that **fails on 1.1 and passes on 1.2**.

## Attached

- **`spiralos/`**: the full SpiralOS 1.1 repo (commit `48cf9b9`). It has `core/core_x86.js` (the real-hardware loader and HAL), `os/*.sp` (the OS sources), `hummingbird.html` (the x86 PC emulator, with `PS2Controller8042` and the VGA/VBE device), `tabcomp.html`, and `tests/*.js`.
- **`notes/vael-bring-up.md`**: a teammate's bring-up notes, with line references. Treat its hypotheses as hypotheses. Trust the code over the notes where they disagree.
- **`notes/kehai-overflow-confirmed.md`** and its screenshot: the text overflow reproduced on both emulated machines.

## What to fix

### F1. Shell text stays inside the window
- `app_draw_shell` (`os/apps1.sp`) draws each output line with no column limit.
- **Fix:** soft-wrap output lines to the window's current inner width, in whole characters. Recompute on resize. Scroll so the newest lines and the prompt are always visible. The input line must also stay inside the window: scroll it horizontally once it's longer than the width.
- **Audit every other app** that draws text (`apps1.sp`, `apps2.sp`, the window title bars and the taskbar). Clip or wrap anything that can overflow its rectangle. The Edit app's `max_cols` pattern is fine to reuse.

### F2. PS/2 mouse init that real controllers accept
The protected-mode init in `core/core_x86.js` (~lines 506-514) writes `0xA8`, `0xD4` and `0xF4` back to back and reads one byte, with no handshake. Replace it with a proper 8042 sequence:
1. Wait for input-buffer-empty (status bit 1 clear) before **every** write to `0x60` or `0x64`.
2. Wait for output-buffer-full (status bit 0 set) before **every** read of `0x60`.
3. Give every wait a bounded timeout. If one runs out, skip mouse init cleanly: the keyboard keeps working and the OS boots without a pointer.
4. Flush any stale output bytes first.
5. Read the controller command byte (`0x20`), set the aux-enable bits and clear the aux-clock-disable bit, then write it back (`0x60`).
6. Reset the mouse (`0xD4`, `0xFF`). Expect `0xFA` then `0xAA`, then optionally the ID byte `0x00`.
7. Set defaults (`0xF6`), then enable streaming (`0xF4`), checking for an ACK each time.

Keep the polling HAL model: the OS doesn't need IRQ12 unless your design wants it.

### F3. Framebuffer pitch from VBE, not constants
The 24- and 32-bpp blitters hardcode pitches of 1920 and 2560. Read `BytesPerScanLine` from the VBE mode info block, which the loader already queries for `PhysBasePtr`, and use it in both blitters and the y-offset.

### F4. Stale numbers in docs
REPORT.md and ARCHITECTURE.md quote a SPIR hash (`3204b8df…`) and core sizes that no longer match what `tests/bootstrap.js` and the build print. Regenerate every such figure **with a script** (`tools/report-figures.js` or similar), and have the docs quote the script's output. No hand-typed hashes or sizes.

## Emulator realism modes (the controls)

Add these to `hummingbird.html` as switches. They default to off; with all off, behavior is byte-identical to 1.1, and the existing tests must still pass unchanged.

| Mode | What it models |
|---|---|
| `ps2Latency: N` | The 8042 keeps the input buffer full for N CPU instructions after each write, **drops** writes that arrive while it's busy, and delivers response bytes only after N instructions. |
| `ps2MouseNeedsReset` | The aux device ignores `0xF4` until it has seen `0xFF` and answered `0xFA 0xAA 0x00`. |
| `ps2AuxClockDisabledAtBoot` | The controller command byte starts with the aux clock disabled and aux IRQ off, as many BIOSes leave it. |
| `vbePitchPad: P` | The VBE mode reports `BytesPerScanLine = width × bytesPerPixel + P`, and the framebuffer really is laid out with that pitch. |
| `noPs2Controller` | Port `0x64` reads `0xFF`. |

## Forbidden

- Detecting a realism mode, or the emulator itself, from inside the OS or the loader. The loader must behave the same on every machine.
- Making a test pass by turning a realism mode off, or by special-casing the test harness.
- Wider changes that aren't needed for F1–F4: new features, theme changes, network changes, refactors.
- Hand-typed result numbers in any doc.
- Describing anything as working on real hardware. We test real hardware ourselves. Report only what the emulator tests exercise.

## Tests

Add these as `tests/bringup.js`. Each one must be run **against 1.1 and against 1.2**, with the output recorded. "Must fail on 1.1" is part of the deliverable: it proves each test can detect the bug. Run all tests on both machines (TabComp and Hummingbird) wherever the item applies.

1. **Window containment.** For each app, open it, then fill it past its edges: 30 lines of 80-character output in the shell, `help`, a long filename in Files, and long input in every text field. Resize to the minimum and maximum size, then **diff the framebuffer against the same desktop with that window closed**. Every changed pixel must lie inside the window's rectangle, including its border and shadow, or in the taskbar button. *Must fail on 1.1 (shell). Must pass on 1.2.*
2. **Mouse under a slow controller.** Use `ps2Latency` at 0, 50, 500 and 5000 instructions, each crossed with `ps2MouseNeedsReset` and `ps2AuxClockDisabledAtBoot` on and off. Boot, inject mouse motion and a click, and assert the cursor moves and the click opens the Spiral menu. *1.1 must fail at least the high-latency and needs-reset cases. 1.2 must pass all of them.*
3. **No controller.** With `noPs2Controller`, boot completes, the keyboard works and nothing hangs. Report the boot time against the default case.
4. **Timeout path.** The controller exists but the mouse never answers. Boot completes within a stated bound, and the keyboard works.
5. **Pitch.** With `vbePitchPad` at 0, 64 and 512, at both 24 and 32 bpp, the visible image (read using the reported pitch) is byte-identical to the unpadded image. *Must fail on 1.1 for P > 0.*
6. **No regressions.** All existing suites pass, unmodified: `vm`, `boot`, `selfhost`, `selfhost-edits`, `apps`, `net`, `determinism`, `bootstrap`, `multitask`, `strict-bios`, `qemu` (where runnable), `sonder` and `harness`. Record which suites you couldn't run and why.
7. **Determinism.** With all modes off, two boots are bit-identical, as in 1.1.
8. **Static scan.** No network or storage APIs. Every inline is labeled.

## Deliverables

- The patched repo (`core/`, `os/`, `hummingbird.html`, `tabcomp.html`), a rebuilt `spiralos.img`, and the `tests/bringup.js` and `tools/report-figures.js` scripts.
- **`CHANGES-1.2.md`:** each fix and the exact lines it touched (file and line ranges, before and after), and why.
- **`HARDWARE-CHECKLIST.md`:** a short checklist we can run on the real laptop:
  1. boot;
  2. `help`, and confirm the text stays inside the window;
  3. move the trackpad;
  4. plug in a USB mouse (if BIOS legacy emulation offers PS/2);
  5. open, edit and save a file;
  6. reboot and confirm the file is still there;
  7. multitask with two apps;
  8. what to photograph or report at each step.
- **`REPORT.md` (1.2 section):** for each test, the result on 1.1 and on 1.2, generated by script. State what the emulator modes model and what they don't.
