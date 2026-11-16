# SpiralOS 1.5 "Make It Real": Kehai's audit (2026-11-16)

**Verdict: ACCEPTED.** The last gate is a real-hardware run on Kham's Toshiba.

## What I did
1. **Committed the delivery unmodified** to `delivery-1.5/` (zip sha256 `a1b49f6f…6a1fafb7`) before touching anything.
2. **Checked the frozen files.** `tabcomp.html`, `hummingbird.html`, `triton/spiralos-triton.html` and `tests/harness.js` are byte-identical to the repo, so they're untouched as required.
3. **Rebuilt from source** (`node tools/build.js`). `spiralos.img` came out **byte-identical** to the delivered image (sha256 `51aee4b6…94085c585`).
4. **Ran all 15 suites myself**, all rc = 0; logs are in this folder:
   - spiralos-15: all sections plus 6 positive controls, each detected and failing as required
   - spiralos-14
   - selfhost, selfhost-edits
   - bootstrap: three-stage fixed point, including Hummingbird
   - vm, boot, asm, apps, multitask, determinism, strict-bios, mouse-121, net, sonder
5. **Ran my own differential compiler fuzz** (`compiler-diff-fuzz.js`).
   - **Method:** random SpiralC programs exercising &&/|| chains, compares against 0/1/k, if/else returns, break/continue, while loops, and constant arithmetic. Each was compiled by the **1.4 compiler and run on the 1.4 TC-32 core**, and by the **1.5 compiler and run on the 1.5 TC-32 core**.
   - **Result: 360/360 agree**, with 0 errors and 0 timeouts. Every one of the 360 images differs between the two compilers, so the new peephole paths really were exercised.
   - **Limitation:** the x86 and Triton cores weren't fuzzed. They're covered by vm.js, selfhost-edits and bootstrap.
6. **Checked the clock independently.**
   - The code programs PIT divisor 0x2E9B (100 Hz), and SYS_TIME_MS is written only in sys_02 as ticks × 10.
   - The RTC-aligned table is now printed by the script: 999 / 1003 / 1001 ticks per 10 s at 1× / 4× / 16×. That's within ±3 ticks, about the granularity of syncing on sys_02 after a rollover.
   - The 24-tick mystery was RTC alignment, not dropped IRQs, as suspected.
7. **Checked the positive controls are real.** They're build-time defect injections (`buildSpiralOSImage(..., {positiveControl})`). The default build carries none: the default rebuild matched the delivered image byte for byte.

## Notes, not blockers
- **ISA change.** The compiler now folds PUSH + CMP into an immediate-form CMP, and the TC-32, Triton and x86 cores all gained support for it. `TRITON-CORE.md` (the authoritative VM contract) isn't in the delivery and still documents the old CMP. **Docs need updating.**
- **Stale version strings.** The build banner prints "SpiralOS 1.4 Daily Driver", the x86 core banner reads "SpiralOS 1.2", and the PONG reply reads 1.4. Cosmetic only.
- **`tests/spiralos-14.js` changed in one line only:** a require path, now pointing at `delivery-1.4/studionet/studionet-ref.js`.
- **Headroom is 536 B in the 128 KB SPIR.** That makes loadable apps the 1.6 priority (`WISHLIST-1.6.md`).
- **Not done by me:** a hand click-and-type tour of 1.5. The 1.5 suite drives the UI with real input events, but I didn't rerun my own tour.
