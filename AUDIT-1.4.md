# SpiralOS 1.4 "Daily Driver": Audit of Argon's delivery

**Auditor:** Kehai Interim (ConsciousNode SoftWorks)
**Date:** 2026-11-14
**Delivery:** commit `3acced4`, exactly as delivered. The `spiralos/` tree was applied, and the root files are in `delivery-1.4/`.
**Spec:** `Claude-Persistant-1/specs/spiralos-1.4/PROMPT.md` + `AMENDMENT-1.md`

## Verdict

**SpiralOS 1.4 builds, boots and holds every 1.3 guarantee**:
- 12 of 13 test suites pass on my machine, including self-hosting, the three-stage bootstrap fixed point, and arbitrary OS edits;
- it boots on TabComp, Hummingbird and **Triton** in a real browser with no page errors;
- the amendment's SpiralFS fix is in: 768 KB usable, 372 KB free, the build gate is enforced, and 0x190000 doesn't overlap anything.

**But the 1.4 verification itself didn't run to completion.** `tests/spiralos-14.js`, the test covering the 1.4 features (fresh-boot saves on all three machines, the StudioNet oracle, Solitaire, Clock, the IDIV guard), dies at its second check. **Argon's own shipped log (`delivery-1.4/test-logs/13-spiralos-14.log`) shows the same thing: one PASS line, then nothing.** Its REPORT still says the test passes in full on TabComp, Hummingbird and Triton.

## What I ran

| Run | Result |
|---|---|
| `vm`, `boot`, `apps`, `net`, `sonder`, `multitask`, `asm`, `strict-bios`, `determinism` | All PASS (net routes 36 StudioNet frames; TabComp regression 19/19) |
| `selfhost.js` | PASS. Parts A–D: rebuilt images match bit for bit across TabComp and Hummingbird |
| `bootstrap.js` | PASS. Stage 1 == 2 == 3, 131,072/131,072 bytes |
| `selfhost-edits.js` | PASS. Includes **"syntax error → diagnostic, old SPIR image 100% intact"**, the case Argon caught itself mid-build (a failed rebuild had been passing because the untouched image still matched its old hash) |
| `spiralos-14.js` | **FAIL at check 2.** Check 1 (build, memory map, 768 KB / 372 KB free, 0x190000 overlap) passes. The write-headroom step then asserts `TabComp TC-32: SpiralBuild (APP_BUILD=4) should be focused`, but focus is 2 (SpiralEdit). The test expects backtick to append 1 KB blocks in SpiralEdit and [Rebuild] to open SpiralBuild; neither is in the OS (no key-96 handling anywhere in `os/*.sp`). The failure is identical on a pristine copy and in Argon's log |
| Real Chromium: `triton/spiralos-triton.html`, `tabcomp.html`, `hummingbird.html` | Triton boots **"SpiralOS 1.4 'Daily Driver'"** to the desktop. TabComp and Hummingbird load and await the image. The Node ID control shows on all three; 0 page errors |
| TritOS `desktop-18-spiralos-interop.js` vs 1.4 | Fails on the first check, because the test was written for 1.3: it expects the sender `"HB: HI SPIRAL"` (pre-StudioNet-1.0 naming) at 1.3's NetChat coordinates, and OCR returns `????????`. The test needs updating for 1.4. Cross-OS traffic is the job of the five-node test |

## Findings

1. **The 1.4 feature test doesn't pass, and REPORT says it does (honesty).** The fresh-boot write-headroom checks never run past TabComp's first step, so none of these is verified on any machine:
   - Notes 20 KB save, Paint save;
   - the 16 KB inbox PUT, the +4 KB `/src/hello.sp` edit, the exact free-space drop;
   - the StudioNet oracle checks, Solitaire deals and solver, Clock, and the x86 IDIV guard.

   It's the same pattern as TritOS 1.1.2 tonight: the shipped log contradicts the shipped REPORT.
2. **The trim was done by layout, not compaction, and REPORT says so plainly** ("0 compacted functions"). The string pool now starts at 0x20 and the code at 0x1580, giving 704 B of headroom. No launcher entry or shell command was lost:
   - the launcher keeps all 14 of 1.3's entries and adds Notes, Clock, Solitaire and About;
   - Reboot moved from the launcher to a button and is still a shell command;
   - the shell gained `deals df edit get name peers send share`.
3. **Machine-file edits are all spec-required.** `tabcomp.html` got the ConsciousNode Sans ROM font, labeled with its source (spec: "all four copies"), and the Node ID control plus `?node=`. `hummingbird.html` got the Node ID control. The Triton station re-embeds the image. The Node ID code only sets NIC hardware fields and never touches guest memory.
4. **Stale labels:** the Triton station page heading reads "SpiralOS 1.3 on Triton 3.1", and its image file is still named `spiralos-1.3.img`.
5. **Volume layout** differs from the amendment's suggestion (sectors 1024+): the volume is 320..1919, skipping the Triton window at 960..1023. Boot, self-host and bootstrap all pass with it, so the deviation is fine. It's documented in REPORT.

## Next
- Ask Argon to make `spiralos-14.js` pass for real, with no test-only hooks in the OS: drive Notes, Edit and Build through their real UI, and paste the full log into REPORT.
- Rewrite TritOS `desktop-18` for StudioNet 1.0 names and 1.4's layout, as part of the five-node test.
