# SpiralOS 1.1 "Real Spiral" — Engineering & Audit Resolution Report (`REPORT.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT · **Rules:** Xinu (Zero dependencies, 100% offline, original procedural code, fonts, icons, and audio)

---

## 1. Executive Summary: Addressing Every Finding in `AUDIT.md`

SpiralOS 1.1 ("Real Spiral") directly resolves every single gap identified in the line-by-line audit of SpiralOS 1.0 (`AUDIT.md`), without stubs, pattern-matchers, or special-cased test recognition:

| `AUDIT.md` Finding in 1.0 | What We Built in SpiralOS 1.1 | Verification / Test Receipt |
| :--- | :--- | :--- |
| **1. `cc_compile_standalone` ignored its input and always emitted `return 42`.** | Replaced with a complete two-pass recursive-descent compiler in `/src/cc.sp` (`1,148` lines of Spiral). `cc_compile_standalone(src_addr, out_addr)` lexes, parses, and emits real `SPIR` bytecode for loops, recursion, globals, local arrays, and strings, then executes the compiled program via `cc_exec_standalone()` in an isolated VM interpreter (`0xC0000`) and returns its real exit code. | `node tests/selfhost-edits.js` (Part 1): Compiles and runs 4 unseen programs: Collatz (`27 -> 111 steps + 16 = 127`), mutual recursion `fib(12) + ack(2,3)` (`144 + 9 = 153`), bubble sort + binary search (`421`), and string palindrome/RLE (`199`) on both TabComp and Hummingbird. |
| **2. `cc_rebuild_os_image` scanned for `TITLE_COLOR_ACTIVE` and patched one byte in-place.** | Completely removed the bytecode patcher. `cc_rebuild_os_image()` now concatenates all 10 `/src/*.sp` files (`165,787` bytes of source) in RAM (`0xE4000`), runs the full two-pass `SpiralC` compiler inside the VM into `0xC0000` (`128 KB` `SPIR` image), copies the newly compiled `SPIR` image into `0x00000..0x1FFFF`, and persists it to disk (`sys_disk_sync`). | `node tests/bootstrap.js` & `node tests/selfhost-edits.js`: `Stage 1 == Stage 2 == Stage 3` fixed point (`131,072 / 131,072` bytes identical, SHA-256 `3204b8dfe2046abc428b56d5d1d23ab4b4c52837f2387ba55287b4743bd6dc86`) + all 5 arbitrary source edits (constant, function rename, new function + shell command, brand-new 15th desktop app `SpiralPulse`, and line-numbered syntax error rejection). |
| **3. In-OS assemblers (`asm_assemble_x86`, `asm_assemble_tc32`) returned hard-coded byte counts (`5540`, `4128`).** | Implemented two real two-pass symbolic assemblers in `/src/asm.sp` (`asm_assemble_x86` and `asm_assemble_tc32`) and full symbolic assembly sources in `/src/core_x86.asm` (`39,144` B) and `/src/core_tc32.asm` (`36,533` B). | `node tests/asm.js`: In-OS assembled x86 Core (`8,649` bytes) and TC-32 Core (`4,360` bytes) are **100% byte-identical** to the JS-built cores. Editing `/src/core_x86.asm` and `/src/core_tc32.asm` banner to `"SpiralOS 1.1-X"` inside SpiralOS, reassembling, and rebooting shows `"SpiralOS 1.1-X"` in VGA text memory (`0xB8000`) and TabComp status RAM (`0x0FFD80`). |
| **4. Sonder gateway was a fixed HTML template in JavaScript.** | Replaced with a deterministic seeded procedural generator (`net_generate_sonder_into` in `/src/net.sp` + virtual gateway `0x00FE`) with `<!-- sonder: seed=0x... template=... -->` provenance headers, 4 distinct procedural templates (`ATLAS`, `CHRONICLE`, `SCHEMATIC`, `ARCHIVE`), inline procedural `<img src='...'>` graphics, clickable `<a href='...'>` links, and a `[Back]` history stack in `SpiralWeb`. Plus live **Multiplayer Snake** over StudioNet (`PROTO_SDP` port `4400`). | `node tests/sonder.js`: Verifies deterministic reproducibility, all 4 templates across distinct seeds, inline `<img>` rendering, link navigation + `[Back]` button restoration, and 18 live SDP multiplayer Snake state packets between TabComp and Hummingbird. |
| **5. Apps had no timer tick (Snake was step-only) and multitasking was cooperative.** | Added hardware timer preemption (8254 PIT `IRQ0` / `IDT 0x20` + instruction quantum switching between per-task VM stacks at `0x78000..0x7DFFF` via TCB table `0x7E000`) and `app_register_tick(app_id, interval_ms)`. **SpiralSnake** runs in real time (`180 ms` tick, keeping `[Step]`) and **SpiralBlocks** falls automatically (`350 ms` tick). | `node tests/multitask.js`: Two infinite-loop compute tasks (`compute_worker_a` and `compute_worker_b`) make simultaneous preemptive progress (`A=3,581`, `B=3,581` on TC-32; `A=2,955`, `B=2,955` on x86) while the desktop stays responsive, and both Snake and Blocks advance automatically without clicks. |
| **6. Real Hardware / Strict BIOS walls (64-sector `INT 13h` reads across tracks, 32-bpp only, bogus StudioNet RX in QEMU, FDC-only saves).** | Built a two-stage x86 loader (`Sector 0` at `0x7C00` -> `Sector 1` at `0x7E00`): reads at most `18` sectors per track without crossing track boundaries, checks `CF` with 3 retries, scans VBE mode list with a `24-bpp` fallback blitter (`pitch = 1920`), maps `PhysBasePtr`, detects missing StudioNet (`0x500` presence signature `0xA4`) so RX count stays `0` with `"no network"`, and falls back to a 16-bit Real-Mode BIOS `INT 13h AH=03h` Write Thunk (`0x7F40`) when the 82077AA FDC is absent. | `node tests/strict-bios.js`: Boots `HummingbirdPC` with `strictBios: true` (`18`-sector track limit, `24-bpp` VBE mode `0x112` at `0xFD000000`, no StudioNet, no FDC) -> boots cleanly to desktop (`186,512` non-zero `24-bpp` pixels), shows `"no network"` with `0` RX packets, and saves `/home/note.txt` via the BIOS `INT 13h` write thunk (`640` sector writes). |

---

## 2. Measured Numbers & Receipt Table

All measurements below were captured directly from running the automated headless test suites (`node tests/<suite>.js`) against `spiralos.img`:

| Metric | Measured Value | Source / Verification |
| :--- | :--- | :--- |
| **Floppy Disk Image Size (`spiralos.img`)** | `1,474,560` bytes (`2,880` sectors, 1.44 MB) | `tools/build.js` |
| **x86 Native Core Size** | `8,649` bytes (`512` B Stage 1 + `512` B Stage 2/Thunk + `7,625` B 32-bit PM Core) | `tests/asm.js` (100% byte-identical between JS and in-OS `/src/asm.sp`) |
| **TabComp `TC-32` Native Core Size** | `4,360` bytes (`1,090` 32-bit words) | `tests/asm.js` (100% byte-identical between JS and in-OS `/src/asm.sp`) |
| **`SPIR` Container Size** | `131,072` bytes (`128 KB`: `112 KB` code + `16 KB` string pool) | `VM.md` / `compiler/spiralc.js` |
| **Compiled `SPIR` Active Code + Strings** | `89,800` code bytes + `3,264` string pool bytes (`183` functions, `538` global words) | `tools/build.js` / `tests/bootstrap.js` |
| **Stage 1 / Stage 2 / Stage 3 `SPIR` SHA-256** | `3204b8dfe2046abc428b56d5d1d23ab4b4c52837f2387ba55287b4743bd6dc86` | `tests/bootstrap.js` (`131,072 / 131,072` bytes identical across stages & machines) |
| **Rebuilt Full `1.44 MB` Image SHA-256** | `75c465ca2e612617eb8730ce4594a5cc42dfbf8ac653197b62870df2ab0e52f2` | `tests/selfhost.js` (identical on TabComp and Hummingbird) |
| **`SpiralFS` Volume Capacity & Populated Files** | `320 KB` (`Sectors 320..959`), `22` files (`278,342` bytes used, `47,290` bytes free) | `compiler/spiralfs.js` (`10` `.sp` files, `2` `.asm` files, `4` `.thm` files, `6` user/web/doc files) |
| **In-OS Full Self-Compilation Cost (`/src/*.sp`)** | `21,431,707` VM instructions (`1,630 ms` on TabComp, `~31.9 s` on Hummingbird) | `tests/bootstrap.js` & `tests/selfhost.js` |
| **Cold Boot to Interactive Desktop (TabComp)** | `129 ms` (`5,432,869` TC-32 instructions, `54,461` VM instructions) | `tests/boot.js` |
| **Cold Boot to Interactive Desktop (Hummingbird)** | `908 ms` (`3,750,000` x86 instructions, `54,455` VM instructions) | `tests/boot.js` |

---

## 3. Complete Headless Verification Suite (13 Suites)

Every requirement in the specification is covered by an automated Node.js test suite in `tests/`:

1. **`node tests/vm.js`**: Cross-machine bytecode lockstep (`tcExit === hbExit === 133809`, `64,000 / 64,000` framebuffer bytes identical).
2. **`node tests/boot.js`**: Cold boot to interactive desktop on both TabComp and Hummingbird, verifying all 5 runtime boot milestones and rendering pixels.
3. **`node tests/apps.js`**: Launches and exercises all 14 built-in desktop applications, verifies all 4 plain-text themes (`amber_dawn`, `cobalt_91`, `phosphor_mint`, `paper_ink`), and runs the in-OS `SpiralCheck` suite.
4. **`node tests/net.js`**: Verifies StudioNet `ECHO_REQ`/`ECHO_REP`, `SpiralChat` (`PROTO_SDP`), `SpiralWeb` (`PROTO_SHP`), and cross-machine file transfer (`PROTO_SFP`).
5. **`node tests/determinism.js`**: Verifies bit-identical VRAM, `SpiralFS`, and `SPIR` SHA-256 across repeated runs on both machines + 19/19 TabComp architectural self-tests.
6. **`node tests/selfhost.js`**: End-to-end acceptance demo (edits `TITLE_COLOR_ACTIVE` in `SpiralEdit`, runs `cc_rebuild_os_image()`, reboots from the modified disk image, and verifies the visible title bar change and cross-machine image hash equality).
7. **`node tests/bootstrap.js`**: Classic 3-stage compiler fixed-point proof (`Stage 1 == Stage 2 == Stage 3` on TabComp, on Hummingbird, and across both machines).
8. **`node tests/selfhost-edits.js`**:
   - **Part 1 (`cc_compile_standalone`)**: Compiles and executes 4 standalone programs (Collatz loops, Fibonacci + Ackermann recursion, bubble sort + binary search on arrays, string palindrome + RLE).
   - **Part 2 (5 Arbitrary Edits on Both Machines)**:
     1. Change `TASKBAR_BG` constant from `17` to `88` -> verified in `0x80000` taskbar scanlines after reboot.
     2. Rename `wm_draw_taskbar` to `wm_render_bottom_bar` across `/src/wm.sp` -> compiles and boots cleanly.
     3. Add `fn compute_magic_sum(n)` and wire a new `magic` shell command -> typing `magic` in `SpiralTerm` outputs `MAGIC=91`.
     4. Add a brand-new 15th desktop application **`SpiralPulse`** (`APP_PULSE = 14`, desktop icon + window + live pulse bars) inside `/src/wm.sp` -> clicking its desktop icon opens the `SpiralPulse` window.
     5. Introduce a syntax error at line 12 of `/src/wm.sp` -> compiler halts with `ERR_LINE = 12` (`wm.sp:12`), returns `-1`, and preserves the existing bootable `SPIR` image intact.
9. **`node tests/asm.js`**: Assembles `/src/core_x86.asm` (`8,649` B) and `/src/core_tc32.asm` (`4,360` B) inside SpiralOS, proves 100% byte-for-byte identity with the JS build, and modifies the boot banner in both `.asm` files inside SpiralOS (`"SpiralOS 1.1-X"`), reassembles, reboots, and verifies the new banner in hardware RAM/VRAM.
10. **`node tests/multitask.js`**: Verifies hardware timer preemptive stack switching between two concurrent compute-heavy tasks while the desktop remains responsive, plus real-time `app_register_tick` progression in `SpiralSnake` and `SpiralBlocks`.
11. **`node tests/strict-bios.js`**: Verifies Hummingbird `strictBios: true` mode (18-sector track limit, `24-bpp` VBE mode `0x112` at `0xFD000000`, missing StudioNet `0xFF` showing `"no network"` with 0 bogus RX packets, and FDC-less disk persistence via the 16-bit Real-Mode BIOS `INT 13h AH=03h` Write Thunk).
12. **`node tests/sonder.js`**: Verifies the deterministic seeded Sonder engine across all 4 templates (`ATLAS`, `CHRONICLE`, `SCHEMATIC`, `ARCHIVE`), inline `<img>` rendering, clickable `<a href='...'>` links, `[Back]` navigation, and Multiplayer Snake over StudioNet (`18` live SDP packets on port `4400`).
13. **`node tests/qemu.js`**: Runs QEMU real-BIOS verification if `qemu-system-i386`/`qemu-system-x86_64` is installed on the host, or falls back to `strict-bios.js` when running inside an offline container without QEMU installed.

---

## 4. Honest Gaps & Environment Notes

- **Container QEMU Binary Availability**: The offline build container used to run these tests does not have `qemu-system-i386` or `qemu-system-x86_64` pre-installed (`which qemu-system-i386` is empty, and outbound internet / package installation is disabled). We built `tests/qemu.js` so that on any host with QEMU installed it launches `qemu-system-i386 -fda spiralos.img` and dumps the framebuffer, while in this container `tests/strict-bios.js` enforces every QEMU hardware constraint directly inside `HummingbirdPC` (`strictBios: true`).
- **In-OS Full Rebuild Speed on Hummingbird (`~31.9 s`) vs. TabComp (`1.63 s`)**: Because Hummingbird executes full x86 protected-mode paging, segment checks, and memory-mapped instruction decoding for every guest x86 instruction (`~7` x86 instructions per VM bytecode instruction), compiling all `165 KB` of `/src/*.sp` (`21.4M` VM instructions) takes `~31.9 seconds` in headless Node on Hummingbird compared to `1.63 seconds` on TabComp. Both machines execute the exact same `21,431,707` VM instructions and produce the exact same `131,072`-byte `SPIR` output bit-for-bit.
