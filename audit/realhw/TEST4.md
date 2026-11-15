# Real-hardware test image 4 (unverified on hardware)

`spiralos-1.4-realhw-test4.img`. Its SHA-256 is in the commit message. It's built from repo HEAD plus `kehai-test4-UNVERIFIED.diff`:

1. **The save fix.** This is the parked `kehai-save-fix-UNVERIFIED.diff`: PIC/PIT go back to their BIOS state around INT 13h AH=03h.
2. **Launcher hit math.** It now uses the 9 px rows that `litem()` actually draws. The old math assumed 10 px, so clicks opened the wrong app.
3. **TIME_MS comes from the PIT only** (`irq0_ticks * 10`). The old frames/ICNT sum raced on fast CPUs.
4. **Tests updated to match:**
   - `apps`, `multitask`, `bringup`, `net` and `sonder` used to click at the old 10 px positions, which matched the bug. They now click on the drawn rows.
   - `strict-bios` and `bootstrap` now wait out the 1.5 s splash, which really lasts 1.5 s of emulated time now and eats the first key.

**Emulator results, on this build:**
- Pass: boot, vm, asm, apps, multitask, determinism, strict-bios (save via the INT 13h thunk), mouse-121, net, selfhost, selfhost-edits, sonder, bootstrap (fixed point), spiralos-14.
- Not run: `bringup` needs a 1.1 baseline checkout at `/baseline11`.

**Not fixed here:** `ls` listing, Snake collision, clock entry from the keyboard, shell history and commands. Those go to 1.5 (see `WISHLIST-1.5.md`).
