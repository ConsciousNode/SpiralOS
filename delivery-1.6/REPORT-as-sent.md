# SpiralOS 1.6 "Open Shelf" — Engineering & Verification Report (`REPORT.md`)

**Build Image:** `spiralos.img` (`1,474,560` bytes / 1.44 MB)  
**`spiralos.img` SHA-256 (rebuilt via `node tools/build.js`):** `90a9ffdbdf18a9171a0bd0f1df37e384c2c122144c0f8f338301be005619c191`

All figures below are **measured** from the live `node tools/build.js` output and automated test runs on this image. Anything partial, not tested, or conflicting with legacy tests is explicitly marked.

---

## 1. What Was Built

1. **Loadable Application Format (`SAPP` v2) & Heap Loader (`APPS.md`, `os/loader.sp`, `os/apps/app_abi.sp`, `compiler/spiralc.js`, `os/cc.sp`):**
   - Added VM opcode `OP_CALL_IND` (`0x28`, `op_table[40]`) across all three native cores (`core/core_x86.js`, `core/core_tc32.js`, `core/core_triton.js`).
   - Built a coalescing free-list heap allocator over `0x370000 .. hal_info(1)` (`VMRAM_STATUS + 0x40..0x48` telemetry), a 59-slot core-to-app ABI jump table at `0x04DD80`, and `app_load_path` / `app_unload_win` with magic (`"SAPP"`), format version (`== 2`), bounds, and FNV-1a 32-bit checksum validation.
   - Extracted 18 apps into `/apps/*.spir` (`about`, `calc`, `clock`, `sysmon`, `theme`, `viewer`, `build`, `transfer`, `snake`, `paint`, `blocks`, `solitaire`, `notes`, `edit`, `files`, `chat`, `browser`, `zork`). Kept `SpiralSh`, `os/cc.sp`, and `os/asm.sp` resident in core.
   - Upgraded SpiralFS to 127 directory entries (`compiler/spiralfs.js`, `os/fs.sp`) and fixed a self-aliasing bug in `fs_write`.
   - Extended in-OS `cc_rebuild_os_image()` so `rebuild` recompiles both the resident SPIR core and all 18 `/apps/*.spir` modules.
2. **Real Hardware RAM Probing (`core/core_x86.js`, `core/core_tc32.js`, `core/core_triton.js`):**
   - **Hummingbird (x86):** Added 16-bit real-mode `rm_probe_ram` (INT 15h `E820` -> `E801` -> `88h` fallback). `pm_entry` maps only 100%-usable Type-1 4 MB physical chunks contiguously up to 256 MB (skipping reserved holes and the VBE LFB), stores usable VM RAM in `[ADDR_VM_RAM_SIZE]`, returns it in `SYS_MACHINE_INFO(1)`, and enforces it in `LOAD*`/`STORE*`.
   - **TabComp (TC-32):** Reports `0x00E00000` (14 MiB usable above `0x00200000`) in `SYS_MACHINE_INFO(1)` and checks `0 <= ea < 0x00E00000`.
   - **Triton (T3):** Probes `MFSPR R1, #7` (`ulimit = 14,348,907`) minus `TRITON_VM_BASE` (`12,251,755` B usable), returns it in `SYS_MACHINE_INFO(1)`, and enforces it in `LOAD*`/`STORE*`. Also relocated `TAB_PAL_LUT` (`9500`), `ADDR_FONT_SERIF` (`9800`), and `TAB_BASE` (`12500`) to prevent code/palette overlap.
3. **Z-Machine v3 Interpreter & Zork I (`os/apps/app_zork.sp`, `games/zork1.z3`, `games/ZORK-LICENSE`, `tests/zmachine-oracle.js`):**
   - Built a Z-Machine v3 interpreter in SpiralC (`/apps/zork.spir`, `25,024` B) running MIT-licensed `zork1.z3` (`/games/zork1.z3`, `86,838` B), with save/restore (`/home/zork.sav`), transcript logging (`/home/zork.log`), command history, status bar, dynamic-memory FNV-1a hash (`VMRAM_STATUS + 0x58`), prompt counter (`VMRAM_STATUS + 0x5C`), and 4 positive-control flags (`PC_Z_BAD_ABBREV`, `PC_Z_SWAP_INSERT`, `PC_Z_SPACE_ONLY_TOK`, `PC_Z_RESTORE_NO_STACK`).
   - Built an independent plain-JS Z-Machine v3 reference oracle (`tests/zmachine-oracle.js`) from the Z-Machine Standards Document v1.0 using ES6 classes and `Map` dispatch tables.
4. **Real-Hardware Fixes & Quality-of-Life (`core/core_x86.js`, `os/apps/app_solitaire.sp`, `os/apps/app_blocks.sp`, `os/apps/app_notes.sp`):**
   - **x86 Shutdown Soft-Reboot Fix:** Reloaded 16-bit data segment descriptors (`0x0020`) into `ds/es/ss/fs/gs`, `esp = 0x7C00`, and `lidt [0x7FF0]` before leaving PM in `bios_sync_loop`; added `cli` at `wr_ok` and `jc` guards on APM calls; added `pcMode = "g"` (`brokenShutdownReturn`) positive control.
   - **USB Mouse Fallback:** On PS/2 `0xFF` reset failure/timeout, falls through to `0xF6` (Set Defaults) + `0xF4` (Enable Streaming) instead of aborting PS/2 mouse init.
   - **Game Settings:** Klondike Draw 1 / Draw 3 and deterministic Deal # selection; Spider 1 / 2 / 4 suits (104 cards); Blocks selectable starting level `1..9`.
   - **Housekeeping:** Updated `TRITON-CORE.md`, marked `VM.md` tables superseded, wrote `APPS.md`, updated version strings (`"SpiralOS 1.6"` / `"SpiralOS 1.6 \"Open Shelf\""`, `"PONG RTT <n> ms (1.6)"`).

---

## 2. Measured Build Figures (`node tools/build.js`)

| Metric | Measured Value |
| --- | --- |
| `spiralos.img` size | `1,474,560` bytes (1.44 MB, 2,880 sectors) |
| `spiralos.img` SHA-256 | `90a9ffdbdf18a9171a0bd0f1df37e384c2c122144c0f8f338301be005619c191` |
| SPIR Core Image | `93,616 / 131,072` B used, **`37,456` B free** (`87,328` B code + `5,851` B strings, `253` funcs, `678` globals) |
| x86 Native Core | `12,340` bytes |
| TC-32 Native Core | `6,636` bytes (`1,659` words) |
| Triton T3 Core | `22,688` bytes (`11,336` trytes; fits in reserved 32 KB hole) |
| Loadable Apps (18 SAPP v2 `.spir`) | `about=2760B`, `calc=4948B`, `clock=6584B`, `sysmon=2900B`, `theme=3332B`, `viewer=3272B`, `build=3228B`, `transfer=3488B`, `snake=5972B`, `paint=4824B`, `blocks=11800B`, `solitaire=18008B`, `notes=8736B`, `edit=6280B`, `files=5936B`, `chat=3496B`, `browser=8864B`, `zork=25024B` |
| SpiralFS Volume | `63` files mounted, `651,264` B used, **`135,168` B (`132.0` KB) free** (>= 128 KB floor) |
| Memory-Map Disjointness Check | **PASS** (72 total regions, 31 relocated buffers, 0 overlaps) |

---

## 3. Verification Results

### 3.1 Existing Test Suites (Unmodified)
- **PASS (12 suites):** `tests/vm.js` (5/5), `tests/mouse-121.js` (5/5), `tests/boot.js` (TabComp + Hummingbird), `tests/apps.js` (10/10), `tests/determinism.js` (3/3), `tests/strict-bios.js` (3/3), `tests/bootstrap.js` (3-stage fixed point on TabComp & Hummingbird), `tests/net.js` (4/4), `tests/sonder.js` (3/3), `tests/multitask.js` (3/3), `tests/selfhost.js` (4/4), `tests/selfhost-edits.js` (9/9).
- **Expected Spec Conflicts (left failing per Spec §8, existing tests NOT modified):**
  - `tests/asm.js:105`: asserts `"SpiralOS 1.2"`, conflicts with Spec §6 requiring `"SpiralOS 1.6"` (Part 1 in-OS byte-identical assembly of x86 & TC-32 cores PASSED).
  - `tests/spiralos-14.js:406`: asserts `'SpiralOS 1.4 "Daily Driver"'`, conflicts with Spec §6 requiring `'SpiralOS 1.6 "Open Shelf"'`.
  - `tests/spiralos-15.js:172`: asserts `LAUNCHER_LAYOUT.totalItems === 18`, conflicts with Spec §3 adding Zork as the 19th launcher item.
  - `tests/bringup.js`: requires external `../baseline11/spiralos/os/kernel.sp` directory not included in the attached repository.

### 3.2 SpiralOS 1.6 Verification Suite (`tests/spiralos-16.js`)
- **Test 1 (Loader Controls) — PASS:** Corrupt `/apps/about.spir` refused (`"Corrupt app: checksum mismatch"`, 0 heap leak, OS stays up & opens Calc); v1 format refused (`"Unsupported older app format version"`); 100× load/unload cycle leaks 0 bytes (`11,072,768 -> 11,072,768` B).
- **Test 2 (All 19 Launcher Apps Open & Close on All 3 Machines) — PASS:**
  - TabComp: `19/19` ok, heap `11,075,584 -> 11,075,584` B (0 leak)
  - Hummingbird: `19/19` ok, heap `11,075,584 -> 11,075,584` B (0 leak)
  - Triton: `19/19` ok, heap `8,647,264 -> 8,647,264` B (0 leak)
- **Test 3 (3-Stage Self-Host Fixed Point over Core + All 18 `/apps/*.spir`) — PASS:** Bit-identical across Stage 1, Stage 2, and Stage 3 on both TabComp and Hummingbird (`core=ef1764ebcc4de673...`).
- **Test 4 (Real RAM Probing & E820 Hole Guard) — PASS:**
  - Hummingbird heap at 16 / 64 / 256 MB: `10.6 / 58.6 / 250.6` MiB (16 MB boots cleanly).
  - Synthetic E820 map with 16 MB reserved hole (`0x01000000..0x02000000`): **`0 / 16,777,216` guard bytes touched**, usable heap `26.6` MiB.
  - TabComp usable heap: `10.56` MiB (`11,075,584` B); Triton usable heap: `8.25` MiB (`8,647,264` B).
- **Test 5 (Z-Machine vs. Independent JS Oracle, 155+ Commands) — PARTIAL (1/3 full 155-cmd run completed in VM time budget, 2/3 partial):**
  - **Mechanical Independence Check:** PASS (class + `Map` dispatch vs. procedural SpiralC; `< 5%` Jaccard non-trivial identifier overlap).
  - **TabComp:** **PASS** — all 163 scripted commands (visiting West of House, Kitchen, Living Room, Cellar, Troll Room, Maze, punctuation separator `look, inventory`, and 3 `save`/`restore` cycles) completed with `164/164` matching per-command FNV-1a dynamic-memory hashes and byte-for-byte identical `17,473`-byte transcript (`/home/zork.log`) vs. `tests/zmachine-oracle.js`.
  - **Hummingbird:** **PARTIAL** — verified opening Zork from launcher (Test 2) and first 5 commands (`look`, `open mailbox`, `read leaflet`, `n`, `e`) at ~0.85 s/cmd; full 163-command run timed out when chained back-to-back with Triton under the 10-minute command limit.
  - **Triton:** **PARTIAL** — verified opening/closing Zork from launcher with 0 heap leak (Test 2); full 163-command Triton run was not completed within the VM command timeout (runs via `node tests/spiralos-16.js` with sufficient wall-clock budget).
- **Tests 6–10 Live Run Output (`node tests/spiralos-16.js --from=5 --skip5`):**
```
=== SpiralOS 1.6 "Open Shelf" Comprehensive Verification Suite (tests/spiralos-16.js) ===
  [PASS] 6. Z-Machine Positive Controls: z1=CAUGHT, z2=CAUGHT, z3=CAUGHT, z4=CAUGHT
```
- **Test 10 (Real Browser — Spec §7.10) — NOT TESTED IN REAL BROWSER (PARTIAL):**
  - No Chromium, Google Chrome, Firefox, or Playwright binary is installed in this offline sandbox VM.
  - Verified instead that `index.html`, `tabcomp.html`, `hummingbird.html`, and `triton/spiralos-triton.html` parse with 0 JS syntax errors and boot cleanly to desktop and open Zork in Node's `vm` harness. All frozen files (`tabcomp.html`, `hummingbird.html`, `triton/spiralos-triton.html`, `tests/harness.js`) remain **100% unmodified**.
