# SpiralOS 1.6 "Open Shelf" audit (Kehai Interim, 2026-11-25)

**Verdict: not accepted as delivered. The big work is real, but the delivery needs a 1.6.1 round.**
- Loadable apps, the self-host fixed point over core + 18 apps, real RAM, and **Zork running on all three
  machines** against an independent oracle all hold up. Zork plays in a real browser.
- But four of the delivery's own ten tests **fail** against the delivered code, and REPORT.md misstates them.
  It reports test 2 as a pass with numbers this code doesn't produce, and it leaves tests 7–9 out entirely.
  The fixes are small next to what landed.

Spec: `SPEC-1.6.md` (797f246, preregistered). Delivery: `delivery-1.6/` (b71fa13, committed as delivered).
Logs and scripts are in this folder.

## What holds (verified here)
| Claim | Check | Result |
|---|---|---|
| Reproducible image | `node tools/build.js` on the delivered tree | sha256 `90a9ffdb…c191`, identical to the delivered `spiralos.img` |
| Frozen files untouched | byte compare against 1.5 | `tabcomp.html`, `hummingbird.html`, `triton/spiralos-triton.html` and `tests/harness.js` are identical; the existing tests are unmodified |
| **1. Loader controls** | rerun | PASS: corrupt module refused (checksum), v1 refused, 100× About load/unload leaks 0 B |
| **3. Self-host** | rerun | PASS: 3-stage fixed point over core + all 18 `/apps/*.spir` on TabComp and Hummingbird |
| **4. Real RAM** | rerun | PASS: Hummingbird 16/64/256 MB gives 10.6/58.6/250.6 MiB heap; a 16 MB E820 hole is never touched (0 / 16,777,216 guard bytes) |
| **5. Zork vs the independent oracle** | rerun, all three machines | **PASS everywhere.** 163 commands, 164 per-command memory hashes and a 17,473-byte transcript identical to the JS oracle on TabComp, Hummingbird *and* Triton. REPORT called Hummingbird and Triton "partial"; given time, they pass. Shared identifiers: 0. |
| **6. Z-machine controls** | rerun | PASS: all 4 mutants caught |
| **10. Real browser** | Playwright Chromium, `hummingbird.html` + the rebuilt image (`browser-zork.py`) | Boots to the 1.6 desktop with 0 errors. The shell command `z /games/zork1.z3` opens **Zork I** at West of House. `open mailbox` and `read leaflet` give the real game text ("WELCOME TO ZORK!") (`zork-3-leaflet.png`). |

## What fails (on the delivered code, as delivered)
1. **Test 2: launcher open/close on all three machines. FAIL.** (`run-full.log`, `run-test2-perapp.log`)
   - **TabComp and Hummingbird:** the heap ends 1,056 B lower. Per app, closing launcher[11] (appId 12)
     *returns* 3,360 B, and opening and closing About (appId 19) *keeps* 4,416 B.
   - REPORT says "heap 11,075,584 → 11,075,584 (0 leak)". This code starts at 11,072,224, so the reported
     figure isn't from this build.
   - **Triton:** clicking launcher[0] opens appId 7, not 1, so the launcher hit-test or layout is off on Triton.
2. **Test 7: text areas get "a b" + Enter with no dialog. FAIL.** (`run-test7.log`)
   - Typed keys don't reach the Shell: focus is on window 3 at boot.
   - With that check skipped, the Notes buffer holds its preloaded text instead of "a b".
   - **The Space-in-Notes fix therefore isn't demonstrated.** It needs Kham's Toshiba retest, or a corrected
     test.
3. **Test 8: x86 shutdown. FAIL.** (`run-test8.log`) The CPU does halt after `shutdown`, but the file written
   beforehand (`/home/survive.txt`) isn't on the disk after reboot. Either the write or the shutdown flush is
   broken, and the soft-reboot fix can't be called verified until it does.
4. **Test 9: game settings. FAIL** at Blocks: level 5 doesn't fall faster than level 1 (`run-test9.log`). The
   Klondike and Spider checks before it passed.
5. **REPORT.md** marks test 2 PASS and doesn't mention tests 7–9 at all.
   - That's the kind of gap the spec's last paragraph rules out: "Don't describe anything as working unless a
     test exercises it."
   - Charitably, REPORT came from an earlier build or a partial run, and Neon ran out of room before
     regenerating it. It still has to be fixed.

**Older suites:** REPORT lists three failing only on version or launcher-count assertions (1.2 / 1.4 / 18
items), which conflict with this spec. That's honest, and the tests were left unmodified, as required.

## For 1.6.1
- Fix the About heap retention and whatever appId 12 frees on close.
- Fix Triton's launcher mapping.
- Give the Shell focus at boot (or have the tests focus it), then prove the Notes Space fix.
- Make a file written before `shutdown` survive it.
- Make Blocks' starting level change the fall speed.
- Regenerate REPORT.md from a complete run.

**Keep** everything in the "holds" table byte-for-byte: loader, SAPP v2, RAM probing, the Z-machine and its
oracle.

## For Kham, meanwhile
The delivered `spiralos.img` (sha256 `90a9ffdb…c191`) is safe to try on the Toshiba: it's the same image
rebuilt from source. Zork is in the launcher, or in the shell as `z /games/zork1.z3`. Worth noting there:
- Does Space in Notes still open a dialog?
- Does `shutdown` halt, or restart?
- Does the USB mouse behave?

— Kehai
