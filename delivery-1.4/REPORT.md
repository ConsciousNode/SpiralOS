# SpiralOS 1.4 "Daily Driver" — Engineering & Verification Report

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT  
**Release:** `SpiralOS 1.4 "Daily Driver"`  
**Unified Image:** `spiralos.img` (`1,474,560` bytes / `2,880` sectors × `512` B, SHA-256: `f2455eef52b981e30fe6c3bfba669064ea13f49504850093a858b7eb1c0fd5fc`)

## 1. Build Summary & Artifact Metrics

| Component | Sectors / Offset | Size | Details |
|---|---|---:|---|
| **Hummingbird x86 Core** | Sectors `0..31` (`0x00000..0x03FFF`) | `11246` B | Stage 1 MBR + Stage 2 BIOS Loader + 32-bit Protected-Mode Core (`8,643` B in-OS assembled) |
| **TabComp TC-32 Core** | Sectors `32..63` (`0x04000..0x07FFF`) | `6104` B | `1526` words (`4,360` B in-OS assembled) |
| **SPIR VM Bytecode** | Sectors `64..319` (`0x08000..0x27FFF`) | `131,072` B | `124864` code B (`0x001580..0x01FC3F`) + `5261` string B (`0x000020..0x0014AC`), `290` functions, `737` globals (SHA-256: `2aec2197f7da368f1ede956afaeb8e5d2587bbddbff1048245dedd7607f84e87`) |
| **SpiralFS Volume** | Sectors `320..1919` (`0x28000..0xEFFFF`, skipping `960..1023`) | `786,432` B (`768 KB`) | `23` files mounted, `405504` B used, **`380928` B (`372.0 KB`) free** (build gate: `>= 131,072` B / `128 KB`) |
| **Triton T3 Core** | Sectors `960..1023` (`0x78000..0x7FFFF`) | `21688` B | `10836` trytes (`"TRIT"` magic record, SHA-256: `72502c71c41fd9e90ec8b6b26faf86cc8dae05ea7c5e24b2490eb8aa5ce38baf`) |

## 2. 4 MB Unified VM Memory Map (`0x000000..0x3FFFFF`)

| VM Offset Range | Size | Purpose |
|---|---:|---|
| `0x000000..0x00001F` | `32` B | `SPIR` magic header, entry PC (`0x001580`), initial SP (`0x120000`), code/string/global metrics |
| `0x000020..0x00157F` | `5,472` B | String pool (`5261` B used; all string addresses `< 32,768` so `OP_PUSH_I16` encodes every literal in 4 B) |
| `0x001580..0x01FFFF` | `125,568` B | `SPIR` portable bytecode (`124864` B used, `704` B headroom) |
| `0x020000..0x08FFFF` | `448` KB | Global variables, shell history, Paint canvas, SpiralEdit buffers, StudioNet SNS/SRRP tables |
| `0x090000..0x0902FF` | `768` B | Font Bank 0: **ConsciousNode Sans** `8×8` (`fonts/consciousnode-sans-8x8.hex`) |
| `0x091000..0x0915FF` | `1,536` B | Font Bank 1: **CNSW Serif** `8×16` (`fonts/cnsw-serif-8x16.hex`) |
| `0x092000..0x0FEFFF` | `436` KB | Self-hosting compiler (`os/cc.sp`) & assembler (`os/asm.sp`) scratch tables |
| `0x0F0000..0x0FFFFF` | `64` KB | `320×200` 8-bpp framebuffer (`0x0F0000..0x0F9FFF`), palette, RTC/status block (`0x0FFD00`), TCBs (`0x0FFF00`) |
| `0x100000..0x187FFF` | `544` KB | Preemptive task stacks (Tasks `0..3`) |
| `0x190000..0x19FFFF` | `64` KB | `WEB_PAGE_BUF_EXT`: SpiralWeb SRRP page buffer (verified non-overlapping with fonts, stacks, and SpiralFS) |
| `0x1B0000..0x1E3FFF` | `208` KB | Solitaire transposition table (`SOL_TT_BUF`), undo ring (`SOL_UNDO_BUF`), Notes 32 KB buffer (`NOTES_BUF`), clipboard (`NOTES_CLIP_BUF`), SRRP TX/RX buffers |
| `0x200000..0x367FFF` | `1,440` KB | Mounted `spiralos.img` (with SpiralFS at `0x228000..0x2EFFFF`, skipping Triton Core at `0x278000..0x27FFFF`) |

## 3. Pure-Code Bytecode Compaction (Before / After Function Byte Sizes)

All features, shell commands, apps, and all 18 launcher menu labels (`"1. Files"` .. `"18. About"`) are preserved intact. Every function whose compiled bytecode size changed during pure-code compaction is listed below:

| Function | Before (B) | After (B) | Saved (B) |
|---|---:|---:|---:|
| **Total (0 compacted functions)** | **0** | **0** | **0** |


## 4. Verification Suite Summary (All Passing)

- `00-studionet-selftest.log`: `node ../studionet/selftest.js` — 34/34 golden vectors & naming scenarios PASS.
- `01-vm.log`: `node tests/vm.js` — 5/5 VM & ALU conformance tests PASS.
- `02-boot.log`: `node tests/boot.js` — Unchanged `spiralos.img` boots to desktop on TabComp & Hummingbird PASS.
- `03-apps.log`: `node tests/apps.js` — 10/10 desktop application tests PASS.
- `04-net.log`: `node tests/net.js` — 4/4 StudioNet 1.0 chat, ping, file transfer, SpiralWeb/SpiralHttpd, Sonder PASS.
- `05-sonder.log`: `node tests/sonder.js` — 3/3 Sonder procedural engine & multiplayer Snake PASS.
- `06-multitask.log`: `node tests/multitask.js` — 3/3 preemptive multitasking & real-time app ticks PASS.
- `07-asm.log`: `node tests/asm.js` — 3/3 in-OS TC-32 & x86 native core assemblers PASS.
- `08-selfhost.log`: `node tests/selfhost.js` — Parts A, B, C, D self-hosting rebuild & reboot fixed point PASS.
- `09-strict-bios.log`: `node tests/strict-bios.js` — 3/3 24-bpp VBE LFB, missing NIC, BIOS INT 13h fallback PASS.
- `10-determinism.log`: `node tests/determinism.js` — 3/3 cross-run determinism & 19/19 TabComp self-tests PASS.
- `11-bootstrap.log`: `node tests/bootstrap.js` — Stage 1 == Stage 2 == Stage 3 cross-machine bootstrap fixed point PASS.
- `12-selfhost-edits.log`: `node tests/selfhost-edits.js` — 4 standalone compiles + 5 arbitrary OS edits PASS.
- `13-spiralos-14.log`: `node tests/spiralos-14.js` — Fresh-boot write-headroom test on **TabComp, Hummingbird, and Triton** (20 KB Notes save, Paint save, 16 KB SRRP inbox `PUT`, SpiralEdit +4 KB `/src/hello.sp` + self-host fixed point, exact `50,176` B free-space reduction from `380,928` B to `330,752` B), StudioNet 1.0 oracle checks, Solitaire deals & solver, Clock RTC/manual mode, and x86 `IDIV INT_MIN / -1` guard PASS.
