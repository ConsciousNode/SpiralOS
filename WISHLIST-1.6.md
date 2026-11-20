# SpiralOS 1.6 wishlist

Started 2026-11-16 by Kham and Kehai, while the 1.5 delivery was in progress.
Facts below were checked against the 1.4 source (`TRITON-CORE.md` §3, `core/core_x86.js`, `compiler/spiralc.js`).

## 1. Loadable apps (top priority)

**Problem.** The whole OS, every app included, compiles into one fixed 128 KB `SPIR` image (floppy sectors 64–319, strings at the top). Every new feature competes for space in that one image, which is why 1.5 needed compaction.

**Want.**
- A small core OS stays in the boot `SPIR` image.
- Apps (Notes, Paint, Solitaire, Snake, Blocks, Calc, etc.) become their own `.spir` files on SpiralFS, compiled by SpiralC.
- Opening an app loads it into the heap. Closing it frees the memory.
- All of this works unchanged on TabComp, Hummingbird/x86 and Triton.
- The self-host fixed point still holds: SpiralC rebuilds the core and every app module byte-identically.

**Controls.**
- A deliberately corrupt app file must be refused cleanly; the OS stays up.
- An app built for an older format version must be refused with a message, not run.
- Loading and unloading the same app 100 times must not leak memory: report the free heap before and after.

## 2. Use the RAM the machine actually has

**Problem.** SpiralOS maps a fixed 4 MB VM window (physical 2–6 MB on x86) and never asks the BIOS how much memory exists. On the Toshiba, the rest of RAM sits idle.

**Want.**
- **x86:** read the INT 15h E820 memory map (fall back to E801/88h), and size the VM heap to match, leaving room for the framebuffer and paging.
- **TabComp and Triton:** use the RAM the machine reports.
- `SYS_MACHINE_INFO` query 1 returns the real usable size instead of a constant 4 MB.
- Apps can adapt to the size, e.g. more apps open at once, bigger Paint canvases.

**Controls.**
- Boot Hummingbird at 16, 64 and 256 MB: the reported size must change accordingly, and the 16 MB machine must still boot.
- A fake E820 map with a hole in the middle must not be written into.

## 3. Carried over from the 1.5 progress audit

- **Timer test reads the clock properly.** The fast-CPU vs CMOS RTC test aligns its start and stop to a seconds rollover, and the test script prints the table itself.
- **Dropped timer interrupts.** Investigate the 24 ticks missing in the 4× run, unless the final 1.5 delivery explains them.

## Later: the App Shelf (after loadable apps exist)

Kham's take (2026-11-16): the shelf answers system bloat. Every app can live on the shelf without anyone having it preinstalled. Install what you want, delete what you don't.

**The idea.**
- A StudioNet service lists the available `.spir` apps.
- Any SpiralOS machine can browse the list and download an app, then run it on any of the three architectures.

**Needs.**
- Each listing carries a SHA-256 hash, checked before the app is installed. A tampered or half-sent app is refused.
- An uninstall that really frees the disk space.
- Works offline-first: installed apps never need the shelf to run.

## Credit KolibriOS in the About app
Kham asked for this on 2026-11-16, and it's already in the README. Add a line to SpiralOS's About app: "Inspired by KolibriOS (kolibrios.org)". It waits for loadable apps, or for room in the 128 KB box, since only 536 B are free.

## 4. Game settings (Kham, 2026-11-20, passed on by Ren)

Kham's words: "there is no way to change the deal or draw pile from 1 to 3 in game and no way to change the settings in SpiralBlocks also".

**Checked against the 1.5 source (`0263ede`, `os/apps2.sp`).**
- **Solitaire:** `g_sol_klon_draw` (line 77) and `g_sol_spider_suits` (line 78) exist, and the code honours them: the stock draw at line 549 and the suit fold at lines 480–481. But the only assignments are the inits at lines 1002–1003, both 1. No key, button or command changes them, so every Klondike game is draw 1 and every Spider game is one suit. The header (lines 15–16) advertises "draw 1/3" and "1/2/4 suits", so this is also a claims-vs-code item.
- **Blocks:** no settings at all. Level comes from lines (`1 + lines/10`, line 278) and gravity from level (line 299).

**Want.**
- Solitaire: an in-game control for Klondike draw 1/3 and Spider 1/2/4 suits, plus a way to pick or re-deal the deal number. A change starts a new game.
- Blocks: at least a starting level. Anything else (ghost piece on/off, etc.) is optional.

**Controls.**
- Klondike draw 3 deals three cards from the stock (or fewer when fewer remain), and the same seed gives the same game.
- Spider at 2 and 4 suits deals the right suit mix (2 × 52 cards in total, every suit present).
- Blocks started at level 5 falls at level 5 speed from the first piece.

**Space.** Only 536 B are free in the 1.5 image, so this most likely rides along with loadable apps (§1).
