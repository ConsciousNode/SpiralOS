# SpiralOS 1.2 — Engineering, Audit Resolution & Bare-Metal Bring-Up Report (`REPORT.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT · **Rules:** Xinu (Zero dependencies, 100% offline, original procedural code, fonts, icons, and audio)
*Note: Every hash, byte count, and test measurement in this document is generated programmatically by `node tools/report-figures.js`.*

---

## 1. Executive Summary: Addressing Every Finding in `AUDIT.md` (1.1) & Bring-Up Patch (1.2)

SpiralOS 1.1 ("Real Spiral") resolved all 6 findings from `AUDIT.md`, and SpiralOS 1.2 resolves all 4 bare-metal bring-up findings (`F1..F4`), verified by automated tests against both 1.1 and 1.2:

| Finding | What We Built | Verification / Test Receipt |
| :--- | :--- | :--- |
| **1. `cc_compile_standalone` ignored its input and always emitted `return 42`.** | Replaced with a complete two-pass recursive-descent compiler in `/src/cc.sp`. `cc_compile_standalone(src_addr, src_len, out_addr)` lexes, parses, and emits real `SPIR` bytecode for loops, recursion, globals, local arrays, and strings, then executes the compiled program via `cc_exec_standalone()` in an isolated VM interpreter (`0xC0000`) and returns its real exit code. | `node tests/selfhost-edits.js` (Part A): Compiles and runs 4 standalone programs: Collatz (`127`), recursion `fib(12) + ack(2,3)` (`153`), bubble sort (`421`), and string pooling/syscalls (`199`) on both TabComp and Hummingbird. |
| **2. `cc_rebuild_os_image` scanned for `TITLE_COLOR_ACTIVE` and patched one byte in-place.** | `cc_rebuild_os_image()` expands all 10 `/src/*.sp` files (`150,939` bytes of combined source), runs the full two-pass `SpiralC` compiler inside the VM into a `128 KB` `SPIR` image, copies it into Sectors `64..319`, and persists it to disk (`sys_disk_sync`). | `node tests/bootstrap.js` & `node tests/selfhost-edits.js`: `Stage 1 == Stage 2 == Stage 3` fixed point (`131,072 / 131,072` bytes identical, SHA-256 `7fded06d819a3945e036bf2e0131f3c74a9e7d017faa6192b84488ca75ed7496`) + all 5 arbitrary source edits. |
| **3. In-OS assemblers (`asm_assemble_x86`, `asm_assemble_tc32`) returned hard-coded byte counts.** | Implemented two real two-pass symbolic assemblers in `/src/asm.sp` and full symbolic assembly sources in `/src/core_x86.asm` (`35,254` B) and `/src/core_tc32.asm` (`20,780` B). | `node tests/asm.js`: In-OS assembled x86 Core (`9,183` bytes) and TC-32 Core (`4,360` bytes) are **100% byte-identical** to the JS-built cores (x86 SHA-256 `59b52d8905135433eadc634b6db1ecc2...`, TC-32 SHA-256 `5442fe3b7c9a46ad04a788610401c440...`). |
| **4. Sonder gateway was a fixed HTML template in JavaScript.** | Replaced with a deterministic seeded procedural generator behind Station `0x00FE` ("sonder.gw") with 4 distinct procedural templates (`ATLAS`, `CHRONICLE`, `SCHEMATIC`, `ARCHIVE`), inline `<img src='...'>` graphics, clickable `<a href='...'>` links, and a `[Back]` history stack in `SpiralWeb`, plus live **Multiplayer Snake** over StudioNet (`PROTO_SDP` port `4400`). | `node tests/sonder.js`: Verifies deterministic reproducibility, all 4 templates, inline `<img>` rendering, link navigation + `[Back]` button restoration, and 18 live SDP multiplayer Snake state packets. |
| **5. Apps had no timer tick and multitasking was cooperative.** | Added hardware timer preemption (8254 PIT `IRQ0` / `IDT 0x20` + instruction quantum switching between per-task VM stacks via TCB table `0x0FFE00`) and `app_register_tick(app_id, interval_ms)`. | `node tests/multitask.js`: Two CPU-bound compute tasks make simultaneous preemptive progress while the desktop stays responsive, and both Snake and Blocks advance automatically. |
| **6. Strict BIOS walls (cross-track `INT 13h`, 32-bpp only, missing StudioNet/FDC).** | Built a two-stage x86 loader (`Sector 0` at `0x7C00` -> `Sector 1` at `0x7E00`): track-safe `INT 13h` reads, 24-bpp VBE fallback, `PhysBasePtr` mapping, StudioNet presence detection, and 16-bit Real-Mode BIOS `INT 13h AH=03h` Write Thunk (`0x7F40`). | `node tests/strict-bios.js`: Boots `HummingbirdPC` with `strictBios: true` to 640x480x24 desktop at `0xFD000000`, shows `"no network"`, and saves `/home/note.txt` via the BIOS write thunk. |
| **F1 (1.2). Shell text and narrow windows overflowed window rectangles.** | Soft-wrapped `SpiralSh` output lines to the window's inner width in whole characters using a 32-line scrollback buffer (`SHELL_HIST_BUF` at `0x04E000`), recomputing on resize, auto-scrolling so newest lines and prompt stay visible, horizontally scrolling long input lines, and clipping all text/buttons across all 14 apps, title bars, and taskbar. | `node tests/bringup.js` (Test 1): 1.1 fails with `40,572` overflow px on TabComp and `156,704` overflow px on Hummingbird; 1.2 passes with `0` overflow px on TabComp and `0` on Hummingbird across all 14 apps at default, min (`80x50`), and max (`320x172`) sizes. |
| **F2 (1.2). Unhandshaked PS/2 mouse init (`0xA8, 0xD4, 0xF4`).** | Replaced with a full 8042 handshake in `core/core_x86.js`: bounded-timeout wait for IBF empty (bit 1 clear) before every write to `0x60`/`0x64`, bounded-timeout wait for OBF full (bit 0 set) before every read of `0x60`, stale byte flush, command byte (`0x20`/`0x60`) read-modify-write, mouse reset (`0xFF` -> `0xFA 0xAA [0x00]`), defaults (`0xF6` -> `0xFA`), and streaming (`0xF4` -> `0xFA`). | `node tests/bringup.js` (Tests 2, 3, 4): 1.1 passes only `1/16` PS/2 realism combinations; 1.2 passes `16/16`, plus clean boot and working keyboard under `noPs2Controller` and mouse timeout. |
| **F3 (1.2). Hardcoded VBE pitches (`2560` and `1920`).** | Read `BytesPerScanLine` (`u16` at `[0x5010]` from the VBE ModeInfoBlock) in `core/core_x86.js` and used it dynamically for the `y=40` centering offset (`0xE0000000 + 40 * pitch`), odd scanline offset (`+pitch`), and row-pair stride (`+2*pitch`) in both 32-bpp and 24-bpp blitters. | `node tests/bringup.js` (Test 5): 1.1 fails all `vbePitchPad > 0` cases; 1.2 matches the unpadded image byte-for-byte across `P = 0, 64, 512` at both `24` and `32` bpp. |

---

## 2. Measured Numbers & Receipt Table (Generated by `tools/report-figures.js`)

| Metric | Measured Value | Source / Verification |
| :--- | :--- | :--- |
| **Floppy Disk Image Size (`spiralos.img`)** | `1,474,560` bytes (`2,880` sectors, 1.44 MB) | `tools/build.js` |
| **Full `1.44 MB` Image SHA-256** | `ce5bb24e5b7f7d87ec141f41a5cdcbc1ad708995298dc8b6942d08144bbb50b0` | `tools/report-figures.js` |
| **x86 Native Core Size** | `9,183` bytes (`512` B Stage 1 + `512` B Stage 2/Thunk + `8,159` B 32-bit PM Core) | `tests/asm.js` (100% byte-identical between JS and in-OS `/src/asm.sp`) |
| **TabComp `TC-32` Native Core Size** | `4,360` bytes (`1,090` 32-bit words) | `tests/asm.js` (100% byte-identical between JS and in-OS `/src/asm.sp`) |
| **`SPIR` Container Size** | `131,072` bytes (`128 KB`: `112 KB` code + `16 KB` string pool) | `VM.md` / `compiler/spiralc.js` |
| **Compiled `SPIR` Active Code + Strings** | `95,796` code bytes + `3,351` string pool bytes (`187` functions, `539` global words) | `tools/build.js` / `tests/bootstrap.js` |
| **Stage 1 / Stage 2 / Stage 3 `SPIR` SHA-256** | `7fded06d819a3945e036bf2e0131f3c74a9e7d017faa6192b84488ca75ed7496` | `tests/bootstrap.js` (`131,072 / 131,072` bytes identical across stages & machines) |
| **`SpiralFS` Volume Capacity & Populated Files** | `320 KB` (`Sectors 320..959`), `22` files (`274,432` bytes allocated, `53,248` bytes free) | `compiler/spiralfs.js` |
| **Cold Boot to Interactive Desktop (TabComp)** | `64 ms` (`6,005,522` TC-32 instructions, `72,960` VM instructions) | `tests/boot.js` / `tools/report-figures.js` |
| **Cold Boot to Interactive Desktop (Hummingbird)** | `582 ms` (`4,500,000` x86 instructions, `73,059` VM instructions) | `tests/boot.js` / `tools/report-figures.js` |

---

## 3. SpiralOS 1.2 Bare-Metal Bring-Up Verification Results (`node tests/bringup.js`)

### 3.1 Test 1: Window Containment (1.1 vs. 1.2 on TabComp & Hummingbird)
- **SpiralOS 1.1 (TabComp)**: `40,572` out-of-window pixels (`SpiralSh`: `3,802` px, `SpiralFiles`: `563` px) -> **FAIL (Bug Detected)**
- **SpiralOS 1.1 (Hummingbird)**: `156,704` out-of-window pixels (`SpiralSh`: `9,768` px, `SpiralFiles`: `2,252` px) -> **FAIL (Bug Detected)**
- **SpiralOS 1.2 (TabComp)**: `0` out-of-window pixels across all 14 apps at default, min (`80x50`), and max (`320x172`) window sizes -> **PASS**
- **SpiralOS 1.2 (Hummingbird)**: `0` out-of-window pixels across all 14 apps at default, min (`80x50`), and max (`320x172`) window sizes -> **PASS**

### 3.2 Test 2: Mouse Under a Slow Controller (16 Realism Combinations, 1.1 vs. 1.2)

| `ps2Latency` | `ps2MouseNeedsReset` | `ps2AuxClockDisabledAtBoot` | SpiralOS 1.1 Result | SpiralOS 1.2 Result |
| :--- | :--- | :--- | :--- | :--- |
| `0` | `false` | `false` | `PASS` (pos `24,6`, dropped `0`) | `PASS` (pos `24,6`, dropped `0`) |
| `0` | `false` | `true` | `FAIL` (pos `160,100`, dropped `0`) | `PASS` (pos `24,6`, dropped `0`) |
| `0` | `true` | `false` | `FAIL` (pos `160,100`, dropped `0`) | `PASS` (pos `24,6`, dropped `0`) |
| `0` | `true` | `true` | `FAIL` (pos `160,100`, dropped `0`) | `PASS` (pos `24,6`, dropped `0`) |
| `50` | `false` | `false` | `FAIL` (pos `160,100`, dropped `2`) | `PASS` (pos `24,6`, dropped `0`) |
| `50` | `false` | `true` | `FAIL` (pos `160,100`, dropped `2`) | `PASS` (pos `24,6`, dropped `0`) |
| `50` | `true` | `false` | `FAIL` (pos `160,100`, dropped `2`) | `PASS` (pos `24,6`, dropped `0`) |
| `50` | `true` | `true` | `FAIL` (pos `160,100`, dropped `2`) | `PASS` (pos `24,6`, dropped `0`) |
| `500` | `false` | `false` | `FAIL` (pos `160,100`, dropped `2`) | `PASS` (pos `24,6`, dropped `0`) |
| `500` | `false` | `true` | `FAIL` (pos `160,100`, dropped `2`) | `PASS` (pos `24,6`, dropped `0`) |
| `500` | `true` | `false` | `FAIL` (pos `160,100`, dropped `2`) | `PASS` (pos `24,6`, dropped `0`) |
| `500` | `true` | `true` | `FAIL` (pos `160,100`, dropped `2`) | `PASS` (pos `24,6`, dropped `0`) |
| `5000` | `false` | `false` | `FAIL` (pos `160,100`, dropped `2`) | `PASS` (pos `24,6`, dropped `0`) |
| `5000` | `false` | `true` | `FAIL` (pos `160,100`, dropped `2`) | `PASS` (pos `24,6`, dropped `0`) |
| `5000` | `true` | `false` | `FAIL` (pos `160,100`, dropped `2`) | `PASS` (pos `24,6`, dropped `0`) |
| `5000` | `true` | `true` | `FAIL` (pos `160,100`, dropped `2`) | `PASS` (pos `24,6`, dropped `0`) |

### 3.3 Tests 3 & 4: Missing PS/2 Controller & Mouse Timeout Path (1.2)
- **Test 3 (`noPs2Controller: true`)**: Port `0x64` reads `0xFF`, boot completes in `4,400,000` instructions vs. default `4,400,000` instructions, keyboard `ver` command succeeds: `true` -> **PASS**
- **Test 4 (Mouse Timeout Path, `0x64 = 0x14 != 0xFF`, mouse never answers)**: Boot completes cleanly in `4,600,000` instructions (bounded wait <= `6,000,000` instructions), keyboard `ver` command succeeds: `true` -> **PASS**

### 3.4 Test 5: VBE Framebuffer Pitch Padding (`vbePitchPad = 0, 64, 512` at 24 & 32 bpp)

| BPP | `vbePitchPad` | Reported `BytesPerScanLine` | SpiralOS 1.1 (Matches `P=0`) | SpiralOS 1.2 (Matches `P=0`) |
| :--- | :--- | :--- | :--- | :--- |
| `32-bpp` | `0` | `2560` | `PASS` (`9c1e4c34379d...`) | `PASS` (`c594cde53d3a...`) |
| `32-bpp` | `64` | `2624` | `FAIL` (`cb72e3903c3c...`) | `PASS` (`c594cde53d3a...`) |
| `32-bpp` | `512` | `3072` | `FAIL` (`86b45e5fc102...`) | `PASS` (`c594cde53d3a...`) |
| `24-bpp` | `0` | `1920` | `PASS` (`0f6fe7270dd9...`) | `PASS` (`f668bd83d6e8...`) |
| `24-bpp` | `64` | `1984` | `FAIL` (`70678aa2af31...`) | `PASS` (`f668bd83d6e8...`) |
| `24-bpp` | `512` | `2432` | `FAIL` (`0f8d93b6d8a7...`) | `PASS` (`f668bd83d6e8...`) |

### 3.5 Tests 6, 7 & 8: Regressions, Determinism & Static Scan
- **Test 6 (No Regressions)**: `13/13` existing test suites passed unmodified (`vm.js, boot.js, selfhost.js, selfhost-edits.js, apps.js, net.js, determinism.js, bootstrap.js, multitask.js, strict-bios.js, qemu.js, sonder.js, asm.js`).
- **Test 7 (Determinism)**:
  - TabComp Run 1 == Run 2 VRAM SHA-256: `704a6f0f873fd4bab8e998d537b006e87aa497299a9cd510d72a1773c5494a8d` (`identical = true`)
  - Hummingbird Run 1 == Run 2 LFB SHA-256: `c594cde53d3a2133d5936f660a8468cf28a0759b8c3394e9aeeed8a172f17365` (`identical = true`)
- **Test 8 (Static Scan)**: Scanned `18` source/HTML files, `0` violations -> **PASS**
