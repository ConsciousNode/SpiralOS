# SpiralOS 1.5 "make it real": wishlist (Kham + Kehai, 2026-11-15)

This comes from Kham's first real-hardware session (Toshiba). It's the input for the truth-table audit and the 1.5 spec.

## Bugs found on hardware (source-confirmed)
- **Launcher.** Items are drawn 9 px apart, but the click math assumes 10 px (`os.sp`), so clicks open the wrong app.
- **`ls` prints only a count.** It should list names and sizes.
- **TIME_MS is fake.** It's computed as frames×16 + irq0×8 + VM_ICNT/512, so on a fast CPU time races (Snake hyper-speed). Time must come from the PIT/RTC only.
- **Snake.** No wall or self collision.
- **Clock app.** The key handler only takes Enter, so you can't set the time or date from the keyboard.
- **Shell.** It ignores arrow keys, so there's no history.

## Shell
- **Files:** `ls` (names and sizes), `cat`, `rm`, `cp`, `mv`, `touch`.
- **Launching and building:** `open <file>` (picks the app by type), `run <app>`, `make`.
- **System:** `date`, `time`, `uptime`, `shutdown`, and a `help` that lists everything.
- **Comforts:** up/down history, Tab completion.

## Desktop and input (Kham)
- Text selection by highlighting, in every text field and in the editor.
- A right-click context menu.
- Cut, copy and paste through a system clipboard, shared between apps.
- Standard keyboard shortcuts:
  - Ctrl+C/X/V/A/Z/S;
  - Alt+Tab;
  - Alt+F4 or the local equivalent;
  - a Super/Win key to open the launcher.
- **Proper shutdown:** flush all saves, then power off through APM where the BIOS supports it. Otherwise show a "safe to power off" screen. Never just halt mid-write.
- **Launcher redesign:**
  - items as boxes or buttons, not bare text;
  - hit areas taken from the same layout as the drawing (one table, so they can't drift apart);
  - scroll arrows at the top and bottom that scroll on hover when the list is too long.
- Scrolling in every window: scrollbars, the mouse wheel where present, PgUp/PgDn.
- **Full keyboard-only operation** for when there's no mouse:
  - focus cycling (Tab / Shift+Tab);
  - arrow-key navigation in the launcher and menus;
  - Enter and Space to activate;
  - window move and resize from the keyboard.
- A blinking caret in the active text field (from a PIT-based timer, so it blinks at the same rate on every machine).

## How it will be tested
- Every feature is driven the way a person drives it: clicking at screen coordinates, typing, and keyboard-only paths. Never opening an app by its ID.
- **Fast-CPU emulator mode,** so timing bugs show up before hardware does.
- **Kham's Toshiba session** is the final acceptance check.
