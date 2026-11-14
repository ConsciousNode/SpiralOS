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

## Addendum (2026-11-14 ~07:50): follow-up delivery (`49b6f27`), and two corrections

### Corrections to this audit
1. **I said "no key-96 handling anywhere in `os/*.sp`." That was wrong.** The first 1.4 (`3acced4`) had a test-only hook at `os/apps1.sp:900`: backtick (or Ctrl+B) appended a 1 KB comment block in SpiralEdit, alongside Ctrl+O/Ctrl+S shortcuts that opened and saved `/src/hello.sp`. My search printed only its first 20 matches, and line 900 fell past them. The follow-up removes all of it.
2. **Our spec asked for something an honest solver can't deliver.** `PROMPT.md` line 147 requires "UNWINNABLE for #11982". Proving that takes an exhaustive search far beyond an in-OS budget, so the requirement invites a shortcut. The TritOS amendment corrected this rule ("UNKNOWN unless exhausted"), but it was never carried back to SpiralOS. That's our miss.

### Follow-up results (my runs)
| Suite | Result |
|---|---|
| `spiralos-14.js` | **PASS, all 6 checks** (403 s). Fresh-boot write headroom on **TabComp, Hummingbird and Triton**: Notes 20 KB, Paint .pic, 16 KB SRRP inbox, and `/src/hello.sp` +4 KB **by typing 4,096 real characters**, then the real [Rebuild] button → SpiralBuild → self-host fixed point. Free space drops 380,928 → 330,752 B. Also the StudioNet 1.0 checks, `deals`, the x86 IDIV guard and the "Triton" label |
| vm, boot, apps, net, sonder, multitask, asm, selfhost, strict-bios, determinism, bootstrap, selfhost-edits | All PASS, unchanged |
| Argon's shipped `13-spiralos-14.log` | Now complete, and it matches REPORT |

The diff from the first 1.4 is small: `os/apps1.sp` (hooks removed, Notes toolbar compacted), `tests/spiralos-14.js` (real typing), a one-line compiler change, and the Triton station renamed to 1.4.

### Remaining findings
- **The solver's verdicts aren't sound** (`os/apps2.sp` `sol_dfs`):
  - **WINNABLE** is declared once the foundations hold 14 cards, every foundation reaches 3, or depth reaches 18, which is a heuristic, not a solve;
  - **UNWINNABLE** comes from a search whose position hash covers only each pile's length and top card. Different positions collide and get skipped as "seen";
  - the move generator never moves into an empty column, and moves to a free cell only when the card beneath is playable.
  
  So "#11982 UNWINNABLE" isn't a proof. Fix: a complete move generator, a full-state hash (or exact comparison on hash match), WINNABLE only on a real 52-card finish, and UNWINNABLE only when the search exhausts without budget or hash pruning. Otherwise answer UNKNOWN. Apply TritOS's rules, the known-answer control on deals 1..200 included.
- The test reads the shell scrollback (`SHELL_HIST_BUF`, 0x04E000) from guest RAM to check command output. It's read-only, but reading the screen would be stricter.

---

## Addendum 2 — real-hardware boot fix (Kehai, 2026-11-14)

**Symptom (Kham, Toshiba Core 2 Duo, USB stick, Legacy BIOS):** the stage-1 banner text flashes ("SpiralOS 1.2…" — the stale `buildX86Core` default, printed by every 1.4 image), then a black screen. 1.2.1 booted on the same machine. Every emulator test passed, because the emulator's BIOS is high-level and resets CPU state that silicon keeps.

**Cause:** 1.4's image outgrew one 480 KB batch, so the PM core drops back to real mode to read sectors 960..1919 through BIOS INT 13h (1.2.1 never re-entered the BIOS). That drop had two bugs that only real hardware sees:

1. **Order:** the read happened after pm_entry remapped the 8259 PIC (0x20/0x28, all but IRQ0 masked), reprogrammed the PIT and loaded the PM IDT. The thunk never restored the real-mode IDTR (the write thunk does; read2 didn't).
2. **Segment caches:** before clearing CR0.PE only DS got the 16-bit selector 0x20. SS kept the 32-bit descriptor cache (B=1), so in real mode the stack ran on ESP (0x97C00) while the BIOS's BP-relative frames addressed SS:BP (0x7Bxx).

**Fix (core/core_x86.js, two labeled `KEHAI REAL-HW FIX` blocks):** moved copy-batch-1 / read-batch-2 / copy-batch-2 to the top of pm_entry, before PS/2/PIC/PIT/IDT setup; before the far jump into the thunk, load 0x20 into DS/ES/SS/FS/GS, set ESP=0x7C00, and `lidt [0x7FF0]`. Image changes: sectors 1–3 and the embedded `/src/core_x86.asm` copy.

**Verified:**
- Hardware: Kham booted `spiralos-1.4-realhw-test2.img` (sha256 2fc6012846e4ec07…) on the Toshiba to the full desktop — SpiralSh "SpiralOS 1.4 "Daily Driver"", i586, no network. Test image 1 (reorder only) still went black, so both fixes were needed (only fix 2 was isolated after fix 1; fix 1 alone was insufficient).
- Emulator, on the fixed image: boot, strict-bios 3/3, asm 3/3, net 5/5 (fix 2); with fix 1 alone additionally selfhost, bootstrap, selfhost-edits 9/9, determinism, apps, spiralos-14 6/6.

**Still open on real hardware (not fixed, not tested):**
- The FDC-less save path (`bios_sync_loop` → write thunk at 0x7F40) re-enters the BIOS *after* the PIC/PIT remap with IRQs masked — the same class as bug 1. It does load SS=0x20 and the real IVT. Saving to the USB stick on the Toshiba may hang until the thunk restores the BIOS PIC state (or saves are routed differently).
- Stage-1 banner still says "SpiralOS 1.2".
