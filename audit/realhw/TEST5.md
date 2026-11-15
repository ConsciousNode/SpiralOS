# Real-hardware test image 5: VERIFIED on the Toshiba, merged

`spiralos-1.4-realhw-test5.img` (sha `db1e6b665dbe936f5203bec3070a1cff0eb19b849557d649c124bb0cbe87cd4d`). This is test 4 plus three fixes:

**Kham's Toshiba results on test 4 (2026-11-15):**
- **The save works on real hardware.** A note saved with Ctrl+S survived a reboot.
- Snake runs at "hard mode" speed now, down from lightcycle.
- Blocks plays at a playable speed.
- Launcher items 1–14 open the right app. From item 15 on, each opens the app one step back: Notes does nothing, Clock opens Notes, Solitaire opens Clock, About opens Solitaire.
- The splash logo is missing.

**Fixes in test 5:**
1. **Launcher.** App ids skip 15 (Notes=16 … About=19), so menu items 15 and up now add 1. `spiralos-14` had clicked y=156 (the *drawn Clock row*) to open Notes, and y=170 to open Solitaire. Those clicks matched the bug, so they now go to the drawn rows (145, 163).
2. **Splash logo.** `tools/build.js` read `../cnsw-mark.svg`, which sits outside the repo, and silently fell back to 6,400 zero bytes. Every in-repo build since 1.4 shipped a black logo. It now falls back to `delivery-1.4/cnsw-mark.svg` and throws if neither file exists (`test5-splash-logo.png`).
3. **The splash now lasts π seconds** (3141 ms, Kham's easter egg). The test splash-waits are scaled to match.

**Emulator results:** boot, apps, multitask, net, sonder, strict-bios (save), spiralos-14, bootstrap (fixed point) and selfhost-edits all pass.

**Still open (1.5):**
- Paint's filename field doesn't take input.
- Holding Down in Blocks barely speeds up the drop.
- Solitaire's stock pile and foundations are missing; 7 tableau piles is the correct count.
- Snake has no collision, and its 80 ms tick may be too fast.
- `ls`, the shell commands, history, and clock entry from the keyboard. See `WISHLIST-1.5.md`.

**Toshiba, test 5 (2026-11-15):** every launcher item opens the right app, the CNSW logo shows on the π-second splash, and saving was already confirmed with test 4. Merged into main.
