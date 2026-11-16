# SpiralOS 1.4 truth table (after real-hardware merge 8fcf4c1)

**Method:**
- On Hummingbird, each launcher item was opened by **clicking its drawn row** (`kehai-tour.js`, screenshots in `launcher-tour.png`).
- Every shell command was **typed for real**, and its output read from the shell's text buffer (`shell.json`).
- Each app's key, click and draw handlers were read in `os/*.sp`.
- Kham's Toshiba session (2026-11-15) is the hardware ground truth.

**Legend:**
- **Real:** works the way a person would use it.
- **Partial:** works, but something a person expects is missing.
- **Name only:** it's there on screen, but the thing it names doesn't happen.

## Launcher (all 18 items open the correct app by click, since 8fcf4c1)

| # | App | Verdict | What's there / what's missing |
|---|---|---|---|
| 1 | Files | Partial | Lists files; Edit / +New / Del / Ren buttons. Keyboard: Esc only. No scrolling of long lists, no context menu. |
| 2 | Editor (SpiralEdit) | Partial | Edits and saves; Save / Rebuild buttons. No selection, clipboard, caret blink or scrollbars. |
| 3 | Shell | Partial | 25 commands, mostly dev and net. No file commands, no history (arrows ignored), no completion. See below. |
| 4 | Compiler (SpiralBuild) | Partial | Compile / AsmCore / Reboot buttons. No keyboard input at all. |
| 5 | Paint | Partial | Draws. **The Save-As filename field takes no input: Paint has no key handler at all.** |
| 6 | Calc | Real (basic) | Digits and + − × ÷ by keyboard and click. |
| 7 | SysMon | Real (display) | Read-only. |
| 8 | Themes | Real | Click only. |
| 9 | Viewer | Partial | Shows a picture; "NextPic" / "Canvas" by click only. |
| 10 | Snake | Partial | Moves at a human speed on hardware since the clock fix (still "hard mode" fast). **No wall or self collision: the code wraps around and never ends the game.** |
| 11 | Blocks | Partial | Plays at a human speed. **No soft drop (Down isn't handled), and every key press also advances gravity one row** (`blocks_step()` after any key). |
| 12 | NetChat | Real (StudioNet) | Typing and Send. |
| 13 | FileBeam | Partial | Click only; no keyboard. |
| 14 | SpiralWeb | Partial | Renders the portal and links; **no address entry** (no key handler). |
| 15 | Notes | Real | Typing, Save via the shared dialog, **survives reboot on real hardware**. Ctrl+V pastes from a 24 KB clipboard buffer, but only Notes uses it. |
| 16 | Clock | Partial | Reads the CMOS RTC; calendar. **Setting the time or date by keyboard is impossible** (the key handler only takes Enter). |
| 17 | Solitaire | Partial | **Draws only the tableau columns, and only their first 6 cards.** Stock, waste, foundations and FreeCell cells are never drawn, though the game logic has them. The solver shows the literal string "WINNABLE (52 moves)" whatever the real move count is. |
| 18 | About | Real (display) | |

## Shell (`help` lists 16; the source has 25)

| Command | Verdict |
|---|---|
| `ls` | **Name only:** prints "SpiralFS files mounted:" and a count, never names |
| `ver`, `mem`, `df`, `ps`, `theme`, `clear`, `reboot` | Real |
| `workers` | Real (spawns 2 demo tasks) |
| `net`, `netstat`, `peers`, `peer`, `ping`, `send`, `get`, `share` | Real (StudioNet) |
| `cc`, `asm`, `rebuild`, `edit <file>`, `deals`, `lines`, `name <x>` | Real (`name` alone prints "Unknown cmd") |
| `help` | Partial: lists 16 of 25 commands |
| `cat`, `rm`, `cp`, `mv`, `touch`, `open`, `run`, `make`, `date`, `time`, `uptime`, `cd`, `history`, `shutdown` | **Missing** |
| Arrow-key history, Tab completion | **Missing** (the key handler ignores `vk`) |

## Desktop-wide (counted in source)

| Feature | Verdict |
|---|---|
| Text selection | Missing outside Solitaire card selection |
| System clipboard | Partial: a buffer exists, but only Notes reads it (paste); there's no copy or cut anywhere |
| Right-click / context menu | Missing (no `btn == 2` anywhere) |
| Blinking caret | Missing (no caret or blink code) |
| Scrolling in windows | Partial: some apps scroll their own content; no scrollbars, wheel or PgUp/PgDn in general |
| Keyboard-only operation | Missing: no focus cycling, no launcher key, 7 apps have no key handler |
| Ctrl shortcuts | Missing: no Ctrl handling apart from Notes' paste |
| Shutdown | Missing (no shutdown or APM code) |

## Test-suite notes
- `tests/spiralos-14.js` requires `../../studionet/studionet-ref.js`, which is **outside the repo**. The repo carries a copy at `delivery-1.4/studionet/`. Same class of bug as the splash logo.
- Until 8fcf4c1, every launcher-clicking test clicked where the bug sent it, not where the item was drawn.
