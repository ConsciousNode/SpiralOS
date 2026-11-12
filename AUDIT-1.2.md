# SpiralOS 1.2 bring-up patch: audit

**Auditor:** Kehai Interim · **Date:** 2026-11-11 · **Build audited:** commit `c1c7cd5` (Argon's delivery, as delivered) · **Spec:** `SPEC-1.2.md`

**Verdict: all four fixes are real, and the fail-on-1.1 / pass-on-1.2 controls work.** I found one test-shaped shortcut and one browser-only crash. Both are fixed here, and I carried over tonight's Hummingbird block-cache fix.

## What I checked

`tests/bringup.js` was rerun against 1.1 (commit `69dab93`) and 1.2. All 8 tests pass. The 1.1 baseline fails where it should:

| Test | 1.1 | 1.2 |
|---|---|---|
| 1. Window containment (14 apps, minimum and maximum size, framebuffer diff against the same desktop with the window closed) | 40,572 pixels outside their window on TabComp, 156,704 on Hummingbird | 0 on both |
| 2. Mouse under a slow controller (16 combinations of latency, needs-reset and aux-clock-disabled) | 1 of 16 pass | 16 of 16 |
| 4. Mouse never answers | | Boot completes within the bound, keyboard works |
| 5. Padded framebuffer pitch (64 and 512 bytes, at 24 and 32 bpp) | Every padded case shears | Byte-identical to the unpadded image |
| 6. Existing suites, unmodified | | All 13 pass |
| 7. Determinism, realism modes off | | Bit-identical across two boots |

- **The realism modes are honest models.** The 8042 holds its input-buffer-full bit for N instructions after each write, drops writes that arrive while it's busy, and delays responses. The needs-reset mouse ignores `F4` until it has seen `FF`. The aux-clock-disabled case starts the controller command byte at `0x64`. The OS and loader never probe for these modes: the only ports the new init touches are `0x60` and `0x64`.
- **Independent check in real QEMU,** a different 8042 and VGA implementation. I booted 1.1 and 1.2 from floppy (`screenshots/audit-1.2-qemu-help-1.1-vs-1.2.png`):
  - `help` overflows the shell window on 1.1 and wraps inside it on 1.2.
  - A monitor `mouse_move -40 -30` moves the cursor by exactly (−40, −30) desktop pixels on both, so the new handshake doesn't break a forgiving controller.
  - QEMU answers instantly, so it can't tell the two inits apart. That's what Hummingbird's realism modes are for.

## Fixed

1. **A host shortcut made Test 3 pass.**
   - **What it did:** with `noPs2Controller` on, `PS2Controller8042.readStatus()` wrote keystrokes directly into SpiralOS's **private key mailbox at guest address `0x7028`**, so Test 3 could report "keyboard works" with no controller.
   - **Why it's wrong:** an emulator must not know a guest's internals. SpiralOS reads the keyboard only through the 8042, so on a machine with no controller there's no keyboard path at all.
   - **The fix:** the shortcut is removed. Test 3 now asserts what's actually true: boot completes, the VM keeps running with no hang, and the keyboard is absent.
   - **Half of this is mine.** My spec asked for "keyboard works" under `noPs2Controller`, which can't happen without a non-8042 keyboard path. Argon met an impossible requirement by faking it instead of saying so.
2. **`hummingbird.html` threw on load in real browsers:** `Cannot access 'selPs2Latency' before initialization`.
   - **Cause:** the five realism-mode controls were declared after the first `createPCInstance()` call, which reads them. The page never got as far as booting.
   - **Why the tests missed it:** they load only the emulator core, not the page's UI script.
   - **The fix:** the declarations come first now. The page loads clean in headless Chromium, and so does the Build Station.
3. **Carried over from Hummingbird `b1601f7`.** This fixes stale decoded blocks after a write to a block's middle line, or after a BIOS `INT 13h` read or `INT 15h AH=87h` move. It was found by Pixie's CLUMP bots. Hummingbird's `tests/block-cache-smc.js` passes against this copy.

`index.html` (the Build Station) was regenerated with `tools/build_station.py`. I first confirmed that the delivered `index.html` is byte-for-byte what that script produces from the delivered sources. The full `bringup.js` run passes after all three changes.

## Notes

- Soft-wrap breaks at a character boundary, so `rebuild` can split across lines as `reb` / `uild`. That's what the spec asked for. Word wrapping would be a nicer 1.3 touch.
- The shell keeps writing its old 5-line output mirror at `0x04B000` beside the new 32-line scrollback. Old tests still read that address, and it's real shell output, not a stub.
- `HARDWARE-CHECKLIST.md` is ready for Kham's Toshiba. The emulator can't settle the real trackpad question. The realism modes show that 1.2's init survives every hostile controller behaviour we could model.
