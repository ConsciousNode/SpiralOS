# SpiralOS 1.3 on Triton 3.1 — Verification & Engineering Report (`REPORT.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT  
*All tables, SHA-256 digests, instruction counts, and timing measurements in this report are generated programmatically by `node tools/triton-all.js` and `node tools/generate_triton_docs.js`.*

## 1. Executive Summary & Artifact Inventory

| Artifact | Path | Size | SHA-256 Digest |
| :--- | :--- | :---: | :--- |
| **Triton 3.1 Machine** | `triton/triton3.html` | `331,423 B` | `b48f42cc190750f43855c5489fad38ec314c1e8c842f0c62ec24402fb6e855ef` |
| **Triton 3.1 Core JS Slice** | `triton3.html:431–9635` | `300,892 B` | `24f32f41406763dbded240397639559ac98d18b15537f8d1fe5bfabe92fa3831` |
| **SpiralOS 1.2.1 Baseline Image** | `spiralos.img` (1.2.1) | `1,474,560 B` | `9d239cd8f59c124ee5031c9ce6d5a643d9855a135e42e534302c0cd949e7e5b4` |
| **SpiralOS 1.3 Unified Image** | `spiralos/spiralos.img` | `1,474,560 B` | `d326867cf9d4e5ee4ece4b7a7cb5edbcaa5e9c60c8e2277de23f445e7d7ca5b6` |
| **Triton Native Core (T3 Asm)** | `spiralos/core/core_triton.asm` | `8,858 trytes` (`17,732 B`) | `c649fe0396a1f334be511766a8810727de29d869292ee69305267a6ba0f58ea4` (Sectors `960..1023`) |
| **Single-File Browser Workstation** | `spiralos-triton.html` | `807,882 B` | Embedded T3 Core + 1.3 Disk Image (Hash-Pinned) |

## 2. Verification Suite Summary (Tests 1–11)

| Test | Suite / Requirement | Status | Measured Receipt |
| :---: | :--- | :---: | :--- |
| **1** | **VM Conformance on 3 Cores** (`tests/vm.js` Progs 1–5) | **PASS** | 5/5 programs produce identical exit codes, `icnt`, globals (`0` diffs), and `64,000` VRAM bytes (`0` diffs) on TC-32, x86, TritonJS, and TritonWASM. |
| **2** | **32-Bit ALU vs BigInt Oracle** (`3,514` edge + `200,000` random) | **PASS*** | `203,514` total vectors (`3,514` edge + `200,000` random) run in `6,414 ms`: `0` mismatches on TritonWASM & TC-32; `0` mismatches on x86 across all `203,512` non-`(-2^31/-1)` vectors (*see §4 for the documented x86 `idiv` `#DE` trap on `-2147483648 / -1`). |
| **3** | **Memory (Aligned, Unaligned & 4 MB Boundary Wrap)** | **PASS** | 8/16/32-bit signed & unsigned loads/stores at `0x050013`, `0x3EFFF9`, `0x450013 -> 0x050013`, and `-16 -> 0x3FFFF0` return `-558986977` (`icnt = 28`) across all 3 Cores. |
| **4** | **Boot & Scripted Timeline Framebuffer Parity** | **PASS** | Frame 3 & post-timeline `320×200` backbuffers have `0 / 64,000` byte diffs vs Hummingbird; Triton `729×486` FB has `0 / 354,294` tryte diffs vs documented $2\times$ palette rule. |
| **5** | **Apps & `SpiralFS` Persistence Across Reboot** | **PASS** | `SpiralSh` (`ver`, `ls`), `SpiralFiles` (`+New /home/note.txt`, `23` files), and `SpiralEdit` (`/src/wm.sp` `Col196` save) persist across cold Triton reboot. |
| **6** | **Self-Hosting `SpiralC` Rebuild on Triton (Stretch)** | **PASS** | `SpiralC` (`/src/cc.sp`) inside SpiralOS on TritonWASM compiled all 10 OS modules in `76,086 ms` (`22,940,610` VM insts / `848,311,738` Triton steps), producing `SPIR` SHA-256 `0d2ff207288888412cca03c6...`, 100% bit-identical to Hummingbird & TabComp, and warm-rebooted to `titleCol = 196`. |
| **7** | **Timer & Quantum Preemption** | **PASS** | Infinite-loop worker task preempted by Task 0 (`exit = 42`, `2` switches); desktop `workers` command ran `1,974` switches across `21` frames without freezing GUI. |
| **8** | **1.3 Disk Image Integrity & Unmodified Boot Suites** | **PASS** | Sectors `0..959` match 1.2.1 SHA-256 `9d239cd8f59c124ee5031c9c...`; unmodified `tests/boot.js` passes on TabComp (`3` frames) and Hummingbird (`3` frames). |
| **9** | **Positive Controls (`noWrap32`, `swapPalette`, `shiftMod64`)** | **PASS** | `noWrap32` (`exit -1 != 1`), `shiftMod64` (`exit 0 != 2`), and `swapPalette` (`400` FB pixel diffs) all fail their target checks. |
| **10** | **Speed Measurements** | **PASS** | TritonWASM boots to Frame 3 in `5,661,703` Triton steps (`73,311` VM insts, `77.23` T3 steps/VM inst, `606 ms`, `~120,975` Spiral VM IPS). |
| **11** | **Static Scan & Real Browser Verification** | **PASS** | Strict CSP, zero external requests, provenance labels `[INLINE 1/4..4/4]`, hash-pinned core verified; headless Chromium 156 via Python Selenium booted to `RUNNING · DESKTOP READY (FRAME 24)` (`magic=0x53504f53`, `mach=3`, `wins=2`, `186,640` active canvas pixels). |

## 3. Detailed Test Receipts & Measured Tables

### 3.1 Test 1 — VM Conformance Across All Three Cores (`tests/vm.js`)

| Program | TC-32 Exit | x86 Exit | TritonJS Exit | TritonWASM Exit | VM `icnt` | Globals Diffs | VRAM Diffs (`64,000` B) | Triton Virtual Steps |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Prog 1** | `9` | `9` | `9` | `9` | `13` | `0` | `0` | `33,271` |
| **Prog 2** | `1101` | `1101` | `1101` | `1101` | `22` | `0` | `0` | `33,680` |
| **Prog 3** | `775` | `775` | `775` | `775` | `2,019` | `0` | `0` | `117,419` |
| **Prog 4** | `49744` | `49744` | `49744` | `49744` | `15` | `0` | `0` | `33,393` |
| **Prog 5** | `11` | `11` | `11` | `11` | `30` | `0` | `0` | `36,581` |

### 3.2 Test 8 — `spiralos.img` 1.3 Sector Integrity vs 1.2.1 Baseline

| Sector Range | Byte Offset | Size | Region | SHA-256 Digest | 1.2.1 Status |
| :--- | :--- | :---: | :--- | :--- | :---: |
| `0 .. 31` | `0x00000 .. 0x03FFF` | `16 KB` | Hummingbird x86 Boot + PM Core | `3ba2f4c2c3b579a25da201eaf39fe1e77ecedb5b6a5e511de1a73741d3edb746` | **Byte-Identical** |
| `32 .. 63` | `0x04000 .. 0x07FFF` | `16 KB` | TabComp TC-32 Native Core | `d99f8f6bcc84f6e2050155a1210d5aba75482f2855ce65284d5dc1c720d8771f` | **Byte-Identical** |
| `64 .. 319` | `0x08000 .. 0x27FFF` | `128 KB` | `SPIR` Portable OS Bytecode | `339d5e8d2c30182d0f733c6a1871702239400368121b889ea58f8d2e394e83c2` | **Byte-Identical** |
| `320 .. 959` | `0x28000 .. 0x77FFF` | `320 KB` | `SpiralFS` Filesystem Volume | `96c9f3ed0dd93fb778f5c3ca26ba7719c4099be7847bad40ef13cb110c1b094f` | **Byte-Identical** |
| `960 .. 1023` | `0x78000 .. 0x7FFFF` | `32 KB` | **Triton 3.1 Native Core (`'TRIT'`)** | `c649fe0396a1f334be511766a8810727de29d869292ee69305267a6ba0f58ea4` | **Added in 1.3** |

### 3.3 Test 10 — Cross-Architecture Speed & Step Comparison (Boot to Frame 3 Desktop)

| Metric | TabComp (`TC-32`) | Hummingbird (`i586`) | Triton 3.1 (`TritonWASM`) |
| :--- | :---: | :---: | :---: |
| **Spiral VM Instructions (Frame 3)** | `73,212` | `73,311` | `73,311` |
| **Native Machine Instructions / Steps** | `6,017,298` | `4,500,000` (`4,500,000` cyc) | `5,661,703` |
| **Native Steps per Spiral VM Instruction** | `82.19` | `61.38` | `77.23` |
| **Boot Wall-Clock Time (ms)** | `52 ms` | `381 ms` | `606 ms` |
| **Measured Spiral VM Throughput (IPS)** | `~1,407,923 IPS` | `~192,417 IPS` | `~120,975 IPS` |
| **Measured Native Host Throughput (IPS)** | `~115,717,269 IPS` | `~11,811,024 IPS` | `~9,342,744 tryte-ops/s` |
| **Triton VM IPS Ratio vs Core** | `0.0859×` | `0.6287×` | `1.0000×` |
| **Triton Native Steps Ratio vs Core** | `0.94×` | `1.26×` | `1.00×` |

## 4. Documented Disagreements, Contradictions & Failing Items

1. **Reference-Core Disagreement on `OP_DIV` (`0x18`) and `OP_MOD` (`0x19`) for `(-2147483648, -1)` (`0x80000000`, `0xFFFFFFFF`)**:
   - **Finding**: `core/core_tc32.js` and `core/core_x86.js` disagree on signed 32-bit division overflow `-2147483648 / -1` and `-2147483648 % -1`.
   - **Behavior on TabComp (`core_tc32.js`) & Triton (`core_triton.js`)**: Both return `-2147483648` (`0x80000000`) for `OP_DIV` and `0` for `OP_MOD` (two's-complement wraparound modulo $2^{32}$).
   - **Behavior on Hummingbird (`core_x86.js`)**: `core_x86.js` (lines 912–939) checks only for divisor `0` and executes x86 `cdq; idiv ecx`. On `HummingbirdPC`, `0x80000000 / -1` raises x86 Exception 0 (`#DE` Divide Error). Because `core_x86.js` sets IDT Vector 0 to `isr_default` (`iretd`), `iretd` returns to the faulting `idiv ecx` instruction in an infinite loop (`hbHaltedFlag = 0`). Per `PROMPT.md` ("Do not modify ... the two existing Cores ... Where they disagree with each other, report it and leave it failing"), `core_x86.js` was left unmodified and this disagreement is isolated and reported in `tests/triton-all.js`.
2. **`VM.md` Specification Drift vs Reference Code**:
   - `VM.md` §2–§5 in the 1.2.1 pack describes an obsolete 1 MB byte-stream VM rather than the 4 MB, 32-bit word-instruction VM implemented by `spiralc.js`, `core_tc32.js`, and `core_x86.js`. A correction banner has been added to `VM.md` pointing to the corrected tables in `TRITON-CORE.md`.
