# SpiralOS 1.3 Triton Core: Audit

**Auditor:** Kehai Interim · **Date:** 2026-11-13 · **Delivery audited:** commit `2d94aac` (as delivered)

**Verdict: accepted.** SpiralOS now runs on a balanced-ternary machine with its bytecode unmodified. I checked this independently of Argon's tests. Those tests weren't in the delivery, so I couldn't rerun them.

## What I checked

| Check | How | Result |
|---|---|---|
| **The existing SpiralOS image is untouched** | Extracted the 1.3 image from the page's embedded bundle and compared it with our own 1.2.1 build (`9d239cd8…`) | Sectors 0–959 (both Cores, `SPIR`, SpiralFS) are **byte-identical**. The only additions are in sectors 960–994. Nothing is written past the 32 KB slot. |
| **The image holds the core the generator really builds** | Ran `core/core_triton.js` against the Triton repo's `triton3.html` and compared its output with sectors 960+ | The disk record, the 96-tryte boot ROM, and `core_triton.asm` are **identical**. The slot hash is `c649fe03…`, as claimed. |
| **The 32-bit ALU is exact on ternary hardware** | My own oracle (`audit/triton-core/alu-oracle-through-disk.js`): `SPIR` test programs go in on the disk image, and results come back through the core's own `DISK_SYNC` syscall. No guest memory is read. The reference is JavaScript int32 semantics. | **39,444 vectors** (19 operations: `ADD SUB MUL DIV MOD AND OR XOR SHL SHR SAR` + 8 compares; 576 edge pairs each, including `INT_MIN / -1`, plus 1,500 random each): **0 mismatches** |
| **…and the oracle can actually fail** | Rebuilt the core with Argon's own planted bugs and reran the oracle | `shiftMod64`: **862** mismatches, all in `SHL`. `noWrap32`: **697**, all in `ADD`. |
| **It boots in a real browser** | Loaded `triton/spiralos-triton.html` in Chrome (Playwright) for 25 s | Desktop up (frame 238+), SpiralSh shows `SpiralOS 1.2.1`, magic `0x53504f53`, machine ID 3. **No page errors and no network requests.** Screenshot: `audit/triton-core/browser-boot-25s.png`. |
| **Host stays out of guest memory** | Read the generator and the page | Guest memory is read only by the read-only debug panel and the read-only test helpers. The spec allows both. Execution is never steered. The disk is loaded the way a disk is inserted. |
| **Hot paths, read by hand** | Effective addresses, the wrap constant `2^32`, `MUL` 16-bit split, `SAR` on negatives via `~((~u) >> c)`, bitwise tables, `CALL`/`RET`/`ENTER`, syscall frame | Correct. |

## Findings

1. **Real bug in the x86 Core, found by Argon.** `core_x86.js` (DIV and MOD) checks only for a zero divisor before `cdq; idiv`. On `-2147483648 / -1`, `idiv` raises `#DE`. Vector 0 goes to `isr_default`, a bare `iretd`, which returns to the same `idiv`, so it **loops forever**. This happens on Hummingbird **and on real hardware like the Toshiba**. Any program that hits `INT_MIN / -1` hangs the machine. TabComp and the Triton Core both return `INT_MIN` (DIV) and `0` (MOD). **Fix:** guard `ECX == -1` (DIV: `neg eax`; MOD: `0`). It belongs in the next SpiralOS patch.
2. **Doc error, now fixed.** In the `TRITON-CORE.md` ISA table, rows `0x0A`, `0x0B` and `0x0D` gave a globals base of `0x010000` and contained leftover working notes ("Wait: …"). The code on all three Cores uses `0x020000`. The rows are corrected.
3. **Broken link, now fixed.** `VM.md`'s correction note pointed at a Google search URL instead of `./TRITON-CORE.md`.
4. **Missing from the delivery:** the 1.3 `tools/build.js`, `tests/triton-all.js` and the doc generators. So Argon's numbers in `REPORT-TRITON-CORE.md` (for example the self-host rebuild on Triton and the speed table) are **unverified by me**, except where my own checks above overlap them. `spiralos.img` at the repo root is still 1.2.1. The 1.3 image is in `triton/` until `build.js` lands.
5. **Cosmetic:** the top bar says `i586` on Triton. The unmodified OS only checks `machine_id == 1` and otherwise draws `i586`, as Argon documented. Fixing it means changing `SPIR`, so it's for a later OS patch (show "Triton" for ID 3).
6. **Cosmetic:** `ARCHITECTURE.md` is still titled "1.2". The generator contains a dead `DIVI_FAKE` line that it emits and then pops.

## Addendum 2026-11-13: StudioNet on the Triton page (missed by this audit)
`triton/spiralos-triton.html` joined BroadcastChannel `"studionet_v1"` (underscore; everything else uses `studionet-v1`) and only received: no TX hook, so SYS_NET_SEND frames (ports 26/24) never left the tab. This audit never exercised networking on the Triton page. Fixed: channel renamed and `wasmVm.txHooks` now posts frames. Verified in real Chrome that the page joins `studionet-v1` and accepts an incoming frame without error; an end-to-end chat between tabs is still to be tested (needs addressable peers, SpiralOS 1.4).
