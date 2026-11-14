# SpiralOS 1.4 "Daily Driver" — Engineering & Verification Report

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT  
**Release:** `SpiralOS 1.4 "Daily Driver"`  
**Unified Image:** `spiralos.img` (`1,474,560` bytes / `2,880` sectors × `512` B, SHA-256: `e8efa8afc3f64f51c3707287b871d452ff2f8729a4e98e27b639752194762a59`)

## 1. Build Summary & Artifact Metrics

| Component | Sectors / Offset | Size | Details |
|---|---|---:|---|
| **Hummingbird x86 Core** | Sectors `0..31` (`0x00000..0x03FFF`) | `11246` B | Stage 1 MBR + Stage 2 BIOS Loader + 32-bit Protected-Mode Core (`8,643` B in-OS assembled) |
| **TabComp TC-32 Core** | Sectors `32..63` (`0x04000..0x07FFF`) | `6104` B | `1526` words (`4,360` B in-OS assembled) |
| **SPIR VM Bytecode** | Sectors `64..319` (`0x08000..0x27FFF`) | `131,072` B | `124672` code B (`0x001580..0x01FC7F`) + `5186` string B (`0x000020..0x001461`), `290` functions, `737` globals (SHA-256: `697a08881c237e0c115640d2a1ab33e2c554000c7ff3372ec04041c7071d271d`) |
| **SpiralFS Volume** | Sectors `320..1919` (`0x28000..0xEFFFF`, skipping `960..1023`) | `786,432` B (`768 KB`) | `23` files mounted, `405504` B used, **`380928` B (`372.0 KB`) free** (build gate: `>= 131,072` B / `128 KB`) |
| **Triton T3 Core** | Sectors `960..1023` (`0x78000..0x7FFFF`) | `21688` B | `10836` trytes (`"TRIT"` magic record, SHA-256: `72502c71c41fd9e90ec8b6b26faf86cc8dae05ea7c5e24b2490eb8aa5ce38baf`) |

## 2. 4 MB Unified VM Memory Map (`0x000000..0x3FFFFF`)

| VM Offset Range | Size | Purpose |
|---|---:|---|
| `0x000000..0x00001F` | `32` B | `SPIR` magic header, entry PC (`0x001580`), initial SP (`0x120000`), code/string/global metrics |
| `0x000020..0x00157F` | `5,472` B | String pool (`5186` B used; all string addresses `< 32,768` so `OP_PUSH_I16` encodes every literal in 4 B) |
| `0x001580..0x01FFFF` | `125,568` B | `SPIR` portable bytecode (`124672` B used, `896` B headroom) |
| `0x020000..0x08FFFF` | `448` KB | Global variables, shell history, Paint canvas, SpiralEdit buffers, StudioNet SNS/SRRP tables |
| `0x090000..0x0902FF` | `768` B | Font Bank 0: **ConsciousNode Sans** `8×8` (`fonts/consciousnode-sans-8x8.hex`) |
| `0x091000..0x0915FF` | `1,536` B | Font Bank 1: **CNSW Serif** `8×16` (`fonts/cnsw-serif-8x16.hex`) |
| `0x092000..0x0FEFFF` | `436` KB | Self-hosting compiler (`os/cc.sp`) & assembler (`os/asm.sp`) scratch tables |
| `0x0F0000..0x0FFFFF` | `64` KB | `320×200` 8-bpp framebuffer (`0x0F0000..0x0F9FFF`), palette, RTC/status block (`0x0FFD00`), TCBs (`0x0FFF00`) |
| `0x100000..0x187FFF` | `544` KB | Preemptive task stacks (Tasks `0..3`) |
| `0x190000..0x19FFFF` | `64` KB | `WEB_PAGE_BUF_EXT`: SpiralWeb SRRP page buffer (verified non-overlapping with fonts, stacks, and SpiralFS) |
| `0x1A0000..0x1E3FFF` | `272` KB | SRRP RX/TX buffers (`0x1A0000..0x1BFFFF`), Notes 32 KB buffer (`0x1C1000`), OS clipboard (`0x1C9000`), Solitaire TT & undo ring (`0x1D0000..0x1E3FFF`) |
| `0x200000..0x367FFF` | `1,440` KB | Mounted `spiralos.img` (with SpiralFS at `0x228000..0x2EFFFF`, skipping Triton Core at `0x278000..0x27FFFF`) |

## 3. Pure-Code Bytecode Compaction (Before / After Function Byte Sizes)

All features, shell commands, apps, and all 18 launcher menu labels (`"1. Files"` .. `"18. About"`) are preserved intact, with zero test-only key hooks in the OS. Placing the string pool at `0x000020..0x00157F` reduced every string literal push from 8 bytes (`OP_PUSH_U16` + `OP_PUSH_HI`) to 4 bytes (`OP_PUSH_I16`), and factoring repeated helpers compacted the following functions:

| Function | Before (B) | After (B) | Saved (B) |
|---|---:|---:|---:|
| `open_app_by_id` | 1216 | 644 | 572 |
| `handle_mouse_down` | 2224 | 1928 | 296 |
| `draw_desktop_scene` | 1976 | 1732 | 244 |
| `cc_next_tok` | 2752 | 2512 | 240 |
| `shell_exec_cmd` | 3184 | 2988 | 196 |
| `app_key_edit` | 588 | 396 | 192 |
| `sol_dfs` | 2336 | 2160 | 176 |
| `app_draw_solitaire` | 1216 | 1068 | 148 |
| `app_draw_blocks` | 1900 | 1764 | 136 |
| `app_draw_files` | 1600 | 1472 | 128 |
| `app_click_files` | 1328 | 1208 | 120 |
| `srrp_handle_complete_msg` | 2868 | 2752 | 116 |
| `net_poll` | 5732 | 5620 | 112 |
| `app_draw_clock` | 1392 | 1284 | 108 |
| `app_draw_notes` | 1972 | 1876 | 96 |
| `app_click_notes` | 688 | 600 | 88 |
| `sol_deal_game` | 1284 | 1200 | 84 |
| `blk_try_rotate` | 312 | 236 | 76 |
| `sns_recompute_display` | 1208 | 1136 | 72 |
| `cc_parse_stmt` | 2808 | 2740 | 68 |
| `cc_parse_expr` | 88 | 24 | 64 |
| `dlg_draw` | 1144 | 1088 | 56 |
| `dlg_click` | 1036 | 984 | 52 |
| **Total (23 compacted functions)** | **40852** | **37412** | **3440** |


## 4. Complete `tests/spiralos-14.js` Output (`13-spiralos-14.log`)

```text
=== SpiralOS 1.4 "Daily Driver" Comprehensive Verification Suite ===
  [PASS] 1. Build & Memory Map: SpiralFS usable = 768 KB, free = 380928 B (372.0 KB), WEB_PAGE_BUF_EXT (0x190000..0x19FFFF) verified non-overlapping
  [PASS] 2.tabcomp: Fresh-boot write-headroom on TabComp TC-32 -> Notes 20 KB + Paint .pic + 16 KB SRRP inbox + SpiralEdit +4 KB /src/hello.sp + SpiralBuild self-host fixed point; free space 380928 B -> 330752 B (-50176 B exact)
  [PASS] 2.hummingbird: Fresh-boot write-headroom on Hummingbird x86 -> Notes 20 KB + Paint .pic + 16 KB SRRP inbox + SpiralEdit +4 KB /src/hello.sp + SpiralBuild self-host fixed point; free space 380928 B -> 330752 B (-50176 B exact)
  [PASS] 2.triton: Fresh-boot write-headroom on Triton T3 -> Notes 20 KB + Paint .pic + 16 KB SRRP inbox + SpiralEdit +4 KB /src/hello.sp + SpiralBuild self-host fixed point; free space 380928 B -> 330752 B (-50176 B exact)
  [PASS] 3. StudioNet 1.0: SNS peer table (via studionet-ref.js snsFrame), NameAgent /etc/hostname persistence, and SpiralHttpd `share on|off` verified
  [PASS] 4. Deals, Solver & Part D Fixes: `deals` matches shared/deals-ref.js verbatim; Solitaire solver (WINNABLE #1 / UNWINNABLE #11982 / UNKNOWN budget), x86 IDIV INT_MIN / -1 guard, and "Triton" machine label verified
=== ALL SPIRALOS 1.4 "DAILY DRIVER" TESTS PASSED ===
```

## 5. Full Suite Summary Lines (14 / 14 Passing on Exact Packaged Files)

- **`00-studionet-selftest.log`** (`node ../studionet/selftest.js`): `ALL PASS` (34/34 vectors & naming scenarios)
- **`01-vm.log`** (`node tests/vm.js`): `VM Conformance Summary: 5/5 passed.` (TC-32 `6104` B, x86 `11246` B)
- **`02-boot.log`** (`node tests/boot.js`): `[PASS] Both machines booted unchanged spiralos.img to desktop (46574/64000 non-zero pixels)!`
- **`03-apps.log`** (`node tests/apps.js`): `[PASS] 1..10 + Saved multi-application showcase screenshot to screenshots/apps_showcase.png`
- **`04-net.log`** (`node tests/net.js`): `[PASS] Total StudioNet frames routed: 36` (chat `"tabcomp: Greetings Hummingbird!"`, `PONG RTT`, `/home/beam.txt`, SpiralWeb/SpiralHttpd, Sonder)
- **`05-sonder.log`** (`node tests/sonder.js`): `[PASS] 1..3 Seeded Sonder Procedural Engine, SpiralWeb Browser & Multiplayer Snake over StudioNet`
- **`06-multitask.log`** (`node tests/multitask.js`): `[PASS] 1..3 TabComp & Hummingbird Preemptive Multitasking + Real-Time App Tick API`
- **`07-asm.log`** (`node tests/asm.js`): `[PASS] 1..3 In-OS Assemblers on TabComp: x86 Core (8,643 B) and TC-32 Core (4,360 B) are 100% byte-identical to JS-built cores!`
- **`08-selfhost.log`** (`node tests/selfhost.js`): `[PASS] Part D: Rebuilt 1.44 MB image hashes match bit-for-bit across TabComp & Hummingbird! (5a49b144fefe91f65b88c9766fa58d77...)`
- **`09-strict-bios.log`** (`node tests/strict-bios.js`): `[PASS] 1..3 Two-Stage Track-Safe Loader & 24-bpp Blitter, StudioNet Presence Detection, FDC-Less Disk Write-Back`
- **`10-determinism.log`** (`node tests/determinism.js`): `[PASS] 1..3 TabComp Determinism, Hummingbird Determinism, Existing TabComp Regression Suite: 19/19 passed`
- **`11-bootstrap.log`** (`node tests/bootstrap.js`): `[PASS] Bootstrap Fixed Point Verified: Stage 1 == Stage 2 == Stage 3 across TabComp & Hummingbird (131,072 / 131,072 bytes identical, 697a08881c237e0c115640d2a1ab33e2c554000c7ff3372ec04041c7071d271d)!`
- **`12-selfhost-edits.log`** (`node tests/selfhost-edits.js`): `[PASS] Standalone 1..4 + Edit 1..5 (including SpiralPulse APP_PULSE=15 and line-12 syntax error recovery)`
- **`13-spiralos-14.log`** (`node tests/spiralos-14.js`): `=== ALL SPIRALOS 1.4 "DAILY DRIVER" TESTS PASSED ===` (including fresh-boot write-headroom on TabComp, Hummingbird, and Triton: `380928 B -> 330752 B (-50176 B exact)`)
