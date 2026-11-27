# SpiralOS 1.7 "Bring Your Own": audit

**Auditor:** Kehai Interim · **Date:** 2026-11-27 · **Delivery:** `delivery-1.7/` (commit d376b59, zip sha256 eba9d6b8…1e1c)
**Method:** the delivery was committed as delivered, then every test in `tests/spiralos-17.js` was run one at a time on a copy of the delivered tree. Added on top: an independent public Z-machine suite (CZECH), a real-Chromium pass on all four pages from `file://` and `http://`, and a real-browser round trip through the disk tray's own inputs.

## Verdict

**Not accepted yet.** The disks, FAT, sound and tracker hold up well, including against our own probes. However, test 4 (Z-machine v4/v5/v8) fails as delivered, two of the seven positive controls pass vacuously, the tray's "Eject Files" hands back empty files, and `@verify` is wrong.

## Results of the delivered tests (run here)

| Test | Result |
| :--- | :--- |
| Image | `spiralos.img` rebuilds byte-for-byte from source (sha256 d27fca85…) ✓ |
| 1. FAT12/16/32 + LFN vs oracle | **PASS** |
| 2. Disk tray, all 3 machines | **PASS** (REPORT gave no result) |
| 3. Device honesty | **PASS** |
| 4. Z-machine v4/v5/v8 vs oracle | **FAIL**: `tabcomp v4: init dynHash mismatch` (read 0). See finding 1 |
| 5. Zork II/III, 105 moves + /shelf save | **not finished:** still running after 32 min on one core, with no failure so far (the test stops at its first wrong hash). Not counted as a pass |
| 6. Audio mixer, all 3 machines | **PASS**, 1764/1764 exact on each machine (REPORT gave no result) |
| 7. MOD player vs renderer | **PASS** |
| 8. Positive controls | prints 7/7, but z5 and z6 are vacuous. See finding 2 |
| 9. 1.6.2 fixes | **PASS** |
| 10. Self-host | **not run:** queued behind test 5. Still unmeasured, as REPORT says |

## Our probes

| Probe | Result |
| :--- | :--- |
| Real Chromium (Playwright), all 4 pages, `file://` and `http://` | 0 page errors and 0 console errors on all 8 loads. The Build Station parses again ✓. The tray appears on the three machine pages |
| Hummingbird in a browser: boot, insert 2 files through `#tray-pick-files`, `ls /shelf`, `cat` | works ✓ (`browser/` screenshots) |
| …then `write /shelf/back.txt …` and pull the image through the tray's own `ejectImage()` | the image is correct: Neon's own FAT oracle reads `back.txt` = "written in the browser", and FAT1 = FAT2 ✓ |
| The same image through the page's `extractFatFiles()` (what **Eject Files** downloads) | **every file has 0 bytes**, including the two the tray wrote itself. See finding 3 |
| `write` to /shelf, headless, on TabComp, Triton and Hummingbird | correct on all three ✓ |
| **CZECH** (public Z-machine compliance suite, `czech.z5`) inside SpiralOS on TabComp | **405 pass, 1 fail** out of 425 (19 print tests). Neon's oracle: 406/0, the same as CZECH's reference `czech.out5`. The failure is `@verify`. See finding 4 |

## Findings

1. **Test 4 can't pass: on the feature-test stories, the interpreter never reaches input.** For each of `test_v4.z4`, `test_v5.z5` and `test_v8.z8`, the guest prints the story's opening line (e.g. `V5 C=4 A=42 … VER=OK`, the same as the oracle). After that the prompt counter at `VMRAM_STATUS+0x5C` stays 0 for 60 frames, so `+0x58`/`+0x60` are never written and the test reads 0. CZECH (v5) runs to `@quit`, and Zork (v3) reaches prompts, so what fails is the v4+ read path these stories use. REPORT §2 said this test was "re-run after Triton fix (see build output)"; it was never shown passing. (`t4.js` reproduces it.)
2. **Controls z5 and z6 pass without the interpreter doing anything.** They assert that the hash *differs* from the oracle's value (`notStrictEqual`). With finding 1, the hash is always 0, so both are "caught" whether or not the mutant changed anything. A positive control has to first prove the unmutated build matches, and then that the mutant breaks it.
3. **The tray's Eject Files always produces empty files.** In `extractTrayFatFiles` → `walkDir`, the start cluster and size are read as `dv.getUint16(off + 20)`, `dv.getUint16(off + 26)` and `dv.getUint32(off + 28)`. Here `dv` is a view over the whole image, while `off` is an offset within `dirBytes`. Names come from `dirBytes` and are correct; sizes and clusters come from the boot sector, so every file comes out 0 bytes. The same code is in all three host pages (from `patch_17_hosts.py`). No test calls `extractFatFiles`: test 11 only checks that `buildFatImage` exists. (`trayext.js`)
4. **`@verify` checksums live memory instead of the story file.** `z_do_verify` sums `z_mem` from `0x40` up to the header length. By then the game has written to dynamic memory, and the Standard (§15, verify) checksums the original file. CZECH's header checksum is right: 0xBAAF in the header, and 0xBAAF computed from the file. So SpiralOS reports a bad story, and typing `VERIFY` in Zork on SpiralOS will claim the disk is damaged. Neon's oracle gets this right, so CZECH caught what the self-built test stories couldn't.
5. **Test 2 doesn't go through the real tray.** It swaps disks with runner calls (`loadDisk2`/`ejectDisk2`). Our browser pass covers insert and `ejectImage`, but the download step (`<a download>` in `#tray-eject-img`) never produced a download event in headless Chromium. That is unconfirmed rather than known broken; please check it by hand once.
6. Oracle independence by identifier Jaccard is low (FAT 0.10, Z 0.06). Since the interpreter is in SpiralC and the oracles are in JS, a low score is expected and proves little. CZECH is the stronger evidence, and it agreed with the oracle against the interpreter.

## For 1.7.1
1. Fix the v4+ read path so test 4 runs, and show it passing on all three machines.
2. Rewrite controls z5 and z6 so the unmutated build must match first.
3. Fix `walkDir` (read from `dirBytes`) in all three hosts. Add a test that round-trips SpiralOS-written files through `extractFatFiles`.
4. Make `@verify` sum the pristine story bytes. Add CZECH to the test suite, or a `@verify` case to the feature stories.
5. Run tests 5 and 10 to completion and report the measured output.
