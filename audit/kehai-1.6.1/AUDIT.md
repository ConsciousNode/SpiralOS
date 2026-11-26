# SpiralOS 1.6.1 audit (Kehai Interim, 2026-11-26)

**Verdict: accepted, with two frozen-test bugs that we own and one small 1.6.2 item.**
- Every item on the 1.6 audit's "For 1.6.1" list is fixed and holds up here.
- The Toshiba's shutdown restart has a real, verified root cause, and that's the best find of the round.

Delivery: `delivery-1.6.1/` (18a0a14, committed as delivered). Baseline: the 1.6 delivery.
Logs and scripts are in this folder.

## Integrity
- **Reproducible:** `node tools/build.js` on the delivered tree gives sha256 `1a7deae3…42f1`, identical to the delivered `spiralos.img`.
- **Frozen files** (`tabcomp.html`, `hummingbird.html`, `triton/spiralos-triton.html`, `tests/harness.js`): identical.
- **Tests:**
  - Every 1.6 test file, `spiralos-16.js` included, is byte-identical to 1.6. The only new test is `spiralos-161.js`.
  - Neon didn't "fix" its own test bugs (below) and reported them instead, as the rules ask.
- **Zork kept:** `games/zork1.z3`, `os/apps/app_zork.sp` and `tests/zmachine-oracle.js` are unchanged.
- **Loader kept:** `os/loader.sp` changed only in comments and indentation. With those stripped, it's identical to 1.6.
- **No test-input special cases:** a grep of `os/` and `core/` for the test strings (`persist`, `survive`, `s5test`, `acpi-ok`) finds nothing.
- **ACPI tables:** the new suite writes them into the emulated BIOS area before boot. That's acting as the firmware, which Hummingbird doesn't provide; it isn't reaching into the guest.

## The suites, rerun here
| Test | Result |
|---|---|
| `spiralos-16.js` 1. Loader controls | PASS |
| 2. All 19 apps open and close, all 3 machines | **PASS**: 0 B heap change on TabComp, Hummingbird and Triton (1.6 failed this) |
| 3. Self-host fixed point, core + 18 apps | PASS |
| 4. Real RAM | PASS |
| 5. Zork vs the oracle | TabComp and Hummingbird OK (17,473 B, 164 prompts, matching the oracle). Triton: rerun in progress at commit time; result follows in its own commit |
| 6. Z-machine mutants | PASS (4/4) |
| 7. Text areas, "a b" + Enter, no dialog | **PASS** (1.6 failed this) |
| 8. Shutdown on Hummingbird | **The file survives**, as `persist-1.6`. The frozen test asserts `PERSIST-1.6`, but its own typing helper only sends unshifted (lowercase) scancodes. That's a test bug, and Neon called it correctly. My audit copy (`kehai-audit-s16.js`; its only change is the expected case, `kehai-audit-s16.diff`) gives **PASS**: halted, message shown, file survives, no boot re-entry, positive control 'g' caught |
| 9. Game settings | **PASS** (1.6 failed this): Blocks Lv 5 gives 77 drops against Lv 1's 38 |
| 10. HTML/JS syntax | Fails in Node on `index.html`, which hasn't changed since 1.6: the test compiles the page's embedded JSON `<script>` as JavaScript. That's a second test bug. REPORT says this check is "verified", which it isn't, but the real browser below covers it |
| `spiralos-161.js` 1–4 | **PASS**: ACPI S5 plus the missing-`_S5_` control, Notes New + 60-line scroll in Notes and Edit, mouse resync + `/home/mouse.log`, game settings |

## The Toshiba restart: root cause confirmed
The REPORT says 1.6's APM helper had an 8-bit `jc` that couldn't reach its target. I checked the bytes 1.6 actually built:
- Stage 2 at `0x137` is `72 93`: a `jc` of **−109**, landing at `0xCC`. Its intended target was `+147` (`0x1CC`).
- So on any machine where APM is missing (CF=1), the CPU jumped into the middle of other code and triple-faulted, which **restarts the machine**.
- That's exactly what the Toshiba did. (REPORT's figures, "+133 wrapping to −123", are slightly off. The bug is real.)

1.6.1 builds `0F 82 94 00`, a near `jc` that lands correctly.

**Positive control (`mutant-apm-shortjump.py`, `run-mutant-apm-shortjump.log`):** putting 1.6's short `jc` back makes the no-`_S5_`, no-APM shutdown fail to halt. Test 1 catches it.

ACPI comes first now:
- RSDP → RSDT → FADT → DSDT `_S5_` → `SLP_TYP|SLP_EN` to PM1a/PM1b.
- APM is the fallback, then `cli; hlt`. Shutdown can no longer reboot.

## Real browser (Playwright Chromium, `browser-161.py`, `browser/`)
- **Boots with 0 errors.**
- **Zork plays:** "WELCOME TO ZORK!" in `zork-3-leaflet.png`.
- **Shell `write` then `cat` works.**
- **Notes** opens the file and shows the **New** button. After typing 24 lines, the view follows the cursor (lines 19–24 visible).
- **`shutdown`** shows "It is now safe to turn off your computer" (`grid-161.png`).

## Found here (small)
- **`write <path> <text>` keeps only the first word.** `write /home/hi.txt hello from kehai` saves `hello`, because `shell_split_two_args` stops the second argument at a space (and at 56 bytes). Tests only ever used one word. For 1.6.2: take the rest of the line.
- **The ACPI walk is untested on real firmware.** A few things could matter on the Toshiba:
  - after `ACPI_ENABLE` it waits a fixed 4,096 loop iterations rather than polling `SCI_EN`;
  - it reads only the RSDT, not the XSDT;
  - it maps only the DSDT's first 4 MB page.

  If S5 fails there, the fallback is a clean halt with the message. It won't restart.

## For Kham
`delivery-1.6.1/spiralos-1.6.1.img` is the same image rebuilt from source. On the Toshiba, check four things:
1. **Shutdown:** does it power off, or halt on "It is now safe to turn off your computer"? Either beats a restart.
2. **Notes:** New is there, and the view follows typing.
3. **Mouse:** SysMon has a `MouseLog` button. Turn it on, move the USB mouse around for a bit, then turn it off. That writes `/home/mouse.log`, and SysMon's `D:` counter shows dropped sync bytes. Windows can't read SpiralFS, so run `cat /home/mouse.log` in the shell and take a phone photo of the screen, plus one of the `D:` number. I'll read the packets from the photos.
4. **Zork:** still plays.

## For us (Ed, me)
Both test bugs are in tests we froze:
- test 8's case;
- test 10 compiling JSON as JavaScript.

We should fix them in our own copy of the suite, not ask the builder to.

— Kehai
