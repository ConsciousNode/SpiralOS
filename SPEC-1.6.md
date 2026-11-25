# SpiralOS 1.6 "Open Shelf": loadable apps, real RAM, and Zork

ConsciousNode SoftWorks. Xinu rules: from-scratch, zero dependencies, offline, MIT from the bottom up. Inline
everything, and label every inline. Spec by Kehai Interim, for Kham; this is the copy sent.

**Builder: Gemini Neon.** You're picking SpiralOS up for the first time: Argon built 1.0–1.5. The attached repo is
the whole story: its README, ARCHITECTURE.md, TRITON-CORE.md (the authoritative VM contract), the 1.5 audit and
the real-hardware notes. Read them before designing anything. Where docs and code disagree, trust the code and
say so.

## Attached
- `spiralos-repo.zip`: the SpiralOS repository at the commit named in `MANIFEST.md` (1.5, audited and merged).
- `zork1.z3`, `ZORK-LICENSE` and `ZORK-PROVENANCE.md`: Zork I's compiled story file from the official
  historicalsource/zork1 repository, which Microsoft placed under the MIT License in November 2025. The licence
  covers the code. Trademarks and packaging stay with their owners, so ship the game file and its MIT notice, and
  use no box art or logos.
- `WISHLIST-1.6.md`: the studio's wishlist (also in the repo). This spec is the binding version of it.

## Why this round exists
The whole OS, every app included, compiles into one fixed 128 KB `SPIR` image, and only **536 bytes** are free.
Nothing new fits. 1.6 breaks the box open: a small core plus apps that load from disk. Zork is the proof. An 87 KB
story file plus a Z-machine interpreter can only exist on SpiralOS if loadable apps really work.

## 1. Loadable apps (top priority)
- **The core image keeps only what boot and self-hosting need:** the kernel, the scheduler, SpiralFS, the window
  manager, the GUI toolkit, the launcher, the shell and the app loader. Decide where SpiralC and the assemblers
  live, and justify it. If they become apps, the self-host fixed point must still hold.
- **Apps become their own files on SpiralFS:** Notes, Edit, Paint, Calc, Clock (calendar included), Solitaire,
  Snake, Blocks, About, Chat and the Sonder browser, plus anything else in the launcher. They're compiled by
  SpiralC, inside the OS and by `compiler/spiralc.js` alike.
- **Design the module format and say it in a new `APPS.md`:**
  - magic, format version, sizes, entry point, a relocation or position-independence scheme, and how an app
    reaches OS services (an ABI table, syscalls, or both);
  - a content checksum or hash that's checked before anything runs.
- **Opening an app loads it into the heap; closing it frees that memory.** Several apps can be open at once,
  limited by RAM, not by a fixed slot count unless you state why.
- **It works unchanged on all three machines:** TabComp (TC-32), Hummingbird (x86) and Triton.
- **The self-host fixed point still holds:** SpiralC rebuilds the core *and every app module* byte-identically,
  three stages deep, on TabComp and on Hummingbird, as `bootstrap.js` does today.
- **Report the headroom:** core image bytes used and free, and each app's size.

## 2. Use the RAM the machine actually has
- **x86:** read the INT 15h E820 map (falling back to E801, then 88h) and size the VM heap to match. Leave room for
  the framebuffer and the page tables, and never touch reserved ranges.
- **TabComp and Triton:** use the RAM the machine reports.
- `SYS_MACHINE_INFO` query 1 returns the real usable size instead of a constant 4 MB.
- Apps can adapt to it (more apps open at once, a bigger Paint canvas). Say which ones do.

## 3. Zork, the first app that couldn't have existed before
- **A Z-machine version 3 interpreter, written in SpiralC as a loadable app** ("Z", or name it), following the
  publicly documented Z-Machine Standards Document. It covers:
  - every v3 opcode, the object tree, properties and attributes, the dictionary and tokeniser, ZSCII and
    abbreviations;
  - the status line (score and moves), the random number generator (predictable mode for tests), save and
    restore to SpiralFS, restart, verify, and transcript to a SpiralFS file.
- **`zork1.z3` ships on SpiralFS** with its MIT notice next to it. Opening it from the launcher, or `z zork1.z3` in
  the shell, starts the game in a window: scrolling text, a command line, and a history recall key.
- **Credits:** the About app names Zork's authors (Marc Blank, Dave Lebling, Bruce Daniels, Tim Anderson) with the
  MIT notice, and adds "Inspired by KolibriOS (kolibrios.org)", as the studio asked on 16 November.

## 4. Bugs found on real hardware (1.5 on Kham's Toshiba, see `audit/realhw/TEST6.md`)
1. **Space in Notes opens the Save/Open dialog.** The root cause is in TEST6: the toolbar buttons register before
   the text area, so focus starts on Open. Fix the order, and audit every app for the same pattern.
2. **`shutdown` acts as a soft reboot on x86 from USB.** The root cause isn't known. The suspect is the
   INT 13h thunk's return during the shutdown flush. The current shutdown test runs only on TabComp, so add an x86
   one. Report what you found and changed. Kham will re-test on the Toshiba.
3. **His USB optical mouse** (presumably through the BIOS's PS/2 legacy emulation) was still erratic as of 1.2.1, while the
   trackpad works. If you can find a cause in the 8042 or mouse packet handling, fix it, and say what you changed
   and why. If you can't, say so.

## 5. Game settings (the code exists and has no controls)
- **Solitaire:** Klondike draw 1/3 and Spider 1/2/4 suits. `os/apps2.sp` already honours both
  (`g_sol_klon_draw`, `g_sol_spider_suits`), but nothing sets them. Add an in-game control, plus a way to pick or
  re-deal the deal number. A change starts a new game.
- **Blocks:** at least a starting level.

## 6. Housekeeping
- **Update `TRITON-CORE.md`** for 1.5's immediate-form CMP and anything 1.6 adds: new opcodes, syscalls and the
  memory map. Mark the old `VM.md` tables as superseded.
- **Every version string says 1.6:** the build banner, the x86 core banner and the PONG reply all lag today.

## 7. Tests (each writes its result; keep every existing suite passing)
1. **Loader controls:**
   - a deliberately corrupt app file is refused cleanly and the OS stays up;
   - an app built for an older format version is refused with a message, not run;
   - loading and unloading the same app 100 times leaks no memory (report the free heap before and after).
2. **Apps open from disk on all three machines.** Every app in the launcher opens by real clicks and closes. The
   free heap is reported before and after.
3. **Self-host:** a three-stage fixed point over the core and every app module, on TabComp and on Hummingbird.
4. **RAM:**
   - boot Hummingbird at 16, 64 and 256 MB, and the reported size changes accordingly, with the 16 MB machine
     still booting;
   - a fake E820 map with a hole in the middle is never written into (prove it with a guard pattern in the hole);
   - TabComp and Triton report their own sizes.
5. **Z-machine, against an independent oracle:**
   - Write a second Z-machine in plain JS under `tests/`, from the Standard alone. Its independence is checked
     mechanically (shared identifiers and syntax-tree shape, as in the studio's WINSTON audit).
   - Run Zork I in both with predictable random numbers and a scripted command list of at least 150 moves that
     visits the house, the cellar, the troll, the maze and a save/restore.
   - The two transcripts must be identical, and the dynamic-memory hashes must match after every command.
   - Run it on all three machines.
6. **Z-machine positive controls (must be caught):**
   - a wrong abbreviation table offset;
   - the object tree's sibling/child links swapped on `insert_obj`;
   - the tokeniser splitting on spaces only, ignoring the dictionary's separators;
   - `restore` that doesn't restore the stack.
7. **Notes:** open Notes fresh, type `a b`, press Enter, and the buffer holds it with no dialog open. Apply the same
   check to every app with a text area.
8. **Shutdown on x86 (Hummingbird):** after `shutdown`, the CPU is halted with the shutdown message on screen, a
   file written beforehand survives the reboot, and the VM never re-enters the boot path. Add a positive control
   where the flush returns into the boot code.
9. **Game settings:**
   - Klondike draw 3 deals three cards (fewer when fewer remain), and the same deal number gives the same game;
   - Spider at 2 and 4 suits deals 104 cards with the right suit mix;
   - Blocks started at level 5 falls at level-5 speed from the first piece.
10. **Real browser:** `index.html`, `hummingbird.html` and the Triton page load with 0 console errors, boot to the
    desktop, and open Zork. Say how you tested this.

## Frozen (don't change)
`tabcomp.html`, `hummingbird.html`, `triton/spiralos-triton.html` and `tests/harness.js`, unless a requirement
truly can't be met otherwise. In that case, say so first in REPORT.md and keep the change minimal and listed.

## Forbidden
- Third-party code of unknown or non-MIT-compatible licence. ScummVM, Frotz and any GPL interpreter are off
  limits as sources. Write from the public Standard.
- Bundling any copyrighted game data other than the attached MIT `zork1.z3`.
- Precomputed transcripts or test-shaped special cases. Never branch on test names, story-file hashes or inputs.
- Changing existing tests, harnesses, accessors or console paths to make a check pass.
- An emulator reading or writing a guest's private memory, except through documented ports and DMA.

## Report
State what was built and how each claim was verified. Don't describe anything as working unless a test exercises
it. Mark every number as measured. Rebuild the image from source with `node tools/build.js`, and give its sha256.

If a requirement can't be met, or conflicts with another, say so in REPORT.md and leave it failing. Never change
emulator or VM accessors, I/O, consoles, test harnesses, or the auditor's scripts to make a check pass. An emulator
must never read or write a guest's private memory.
