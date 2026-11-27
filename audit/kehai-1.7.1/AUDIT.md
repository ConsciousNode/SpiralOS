# SpiralOS 1.7.1: audit

**Auditor:** Kehai Interim · **Date:** 2026-11-27 · **Delivery:** `delivery-1.7.1/` (commit f104e0f, zip sha256 7dba179d…4ba1)

## Verdict

**Accepted. SpiralOS 1.7 "Bring Your Own" is done.** All six findings from `audit/kehai-1.7/AUDIT.md` are fixed. Each one was checked with the probe that originally caught it, and every test change makes the test stricter.

| Finding (1.7) | Check on 1.7.1 | Result |
| :--- | :--- | :--- |
| 1. Test 4: v4+ never reaches input | `spiralos-17.js --only=4` | **PASS**: v4/v5/v8 on TabComp and Triton, v5/v8 on Hummingbird; dynHash and screenHash match the oracle |
| 2. Controls z5/z6 vacuous | `--only=8`, plus a read of the diff | **PASS** 7/7. The unmutated build must now reach a prompt and match the oracle, and each mutant must reach a prompt and then diverge |
| 3. Eject Files gives 0-byte files | the 1.7.1 extractor in each of the 3 host pages, run on the image our real browser wrote under 1.7 | `hello.txt`, `czech.z5` and `back.txt` all come out with full, correct contents on all three pages ✓. Test 2 now round-trips through `extractFatFiles` |
| 4. `@verify` sums live memory | **CZECH** inside SpiralOS (TabComp) | **406 passed, 0 failed**, the same as CZECH's reference output (was 405/1) |
| 5. Tests 5 and 10 unmeasured | `--only=10` | **PASS**, and stage 3 now builds from stage 2's output, so it is a real fixed point (before, it rebuilt from the original image). Test 5 was not rerun here (Neon measured 32m52s PASS). Under 1.7 it ran 32 min with no failure on our machine before we stopped it |
| 6. Eject .IMG download unconfirmed | REPORT §1.5 (CDP `downloadWillBegin`/`completed` on all three pages) | Accepted on their measurement |

**Also rerun:** tests 1, 3, 6, 7 and 9 pass. `spiralos.img` rebuilds byte-for-byte from source (sha256 5b5a4f5b…). All four pages load with 0 page errors and 0 console errors in real Chromium, from both `file://` and `http://`.

**Root cause, confirmed:** one bug behind findings 1 and 4. The feature stories call `@verify`, which wrongly failed, and the failure branch was `jump 0`, an infinite loop before the first read. The stories now write to dynamic memory before `@verify` (the exact case that used to break) and `@quit` on failure.

**Note:** the delivery drops `screenshots/`. Applying it to `main` keeps the existing screenshots, since nothing in 1.7.1 replaces them.
