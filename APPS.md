# SpiralOS 1.6 Loadable Application Format (`APPS.md`)

SpiralOS 1.6 ("Open Shelf") moves 18 desktop applications out of the 128 KB resident SPIR core into self-contained, relocatable `.spir` binary modules stored under `/apps/*.spir` in SpiralFS and loaded on demand into the dynamic VM heap.

## 1. Design Rationale: What Stays in Core vs. Loadable Modules

- **Resident in SPIR Core (`93,616 / 131,072` bytes used, `37,456` bytes free):**
  - Kernel, HAL wrappers, preemptive round-robin task scheduler (`os/kernel.sp`)
  - SpiralFS 127-entry filesystem driver (`os/fs.sp`)
  - GUI widget primitives, clipping, window manager, launcher, shared file dialogs, and clipboard (`os/gui.sp`, `os/wm.sp`, `os/os.sp`)
  - StudioNet 1.0 protocol stack (SNS, SDP, SSP, SRRP, SpiralHttpd) (`os/net.sp`)
  - Heap allocator, ABI jump table, and SAPP v2 module loader (`os/loader.sp`)
  - `SpiralSh` shell (`os/apps1.sp`), the self-hosting SpiralC compiler (`os/cc.sp`), and the in-OS x86/TC-32 native assemblers (`os/asm.sp`)
  - **Why SpiralC & the assemblers stay in core:** Keeping `cc.sp`, `asm.sp`, and `SpiralSh` resident guarantees that `rebuild` and `asm` work even if `/apps/*.spir` is damaged or empty, and avoids bootstrapping circularity when recompiling all 18 `/apps/*.spir` modules in place during self-hosting.
- **Loadable `.spir` Modules (`/apps/*.spir`, 18 apps):**
  `about`, `calc`, `clock`, `sysmon`, `theme`, `viewer`, `build`, `transfer`, `snake`, `paint`, `blocks`, `solitaire`, `notes`, `edit`, `files`, `chat`, `browser`, and `zork` (Z-Machine v3 interpreter).

## 2. SAPP v2 Binary Container Format

Every loadable app file begins with a 64-byte little-endian header (`SAPP`, format version `2`), followed by executable SPIR bytecode, string pool, and a relocation table. Global/static data (`.bss`) is zero-allocated immediately after the loaded image in the heap.

| Offset | Size | Field | Description |
| --- | --- | --- | --- |
| `0x00` | 4 B | `magic` | `0x50504153` (`"SAPP"` little-endian) |
| `0x04` | 4 B | `format_version` | `2` (older versions `< 2` or newer `> 2` are refused with a diagnostic) |
| `0x08` | 4 B | `abi_version` | `1` (matches `ABI_TABLE_ADDR = 0x04DD80`) |
| `0x0C` | 4 B | `code_off` | Byte offset of bytecode section (`64` = `0x40`) |
| `0x10` | 4 B | `code_size` | Byte length of SPIR bytecode |
| `0x14` | 4 B | `str_off` | Byte offset of string pool |
| `0x18` | 4 B | `str_size` | Byte length of string pool |
| `0x1C` | 4 B | `bss_size` | Zero-initialized global/BSS byte count (placed at `base + reloc_off`) |
| `0x20` | 4 B | `reloc_off` | Byte offset of relocation table (also loaded image size before BSS) |
| `0x24` | 4 B | `reloc_count` | Number of 32-bit relocation entries |
| `0x28` | 4 B | `init_off` | Relative PC offset of `app_init(abi, arg0)` (`0` if absent) |
| `0x2C` | 4 B | `draw_off` | Relative PC offset of `app_draw(x, y, w, h)` (`0` if absent) |
| `0x30` | 4 B | `click_off` | Relative PC offset of `app_click(wid, rx, ry)` (`0` if absent) |
| `0x34` | 4 B | `key_off` | Relative PC offset of `app_key(ascii, vk, mods)` (`0` if absent) |
| `0x38` | 4 B | `tick_off` | Relative PC offset of `app_tick()` (`0` if absent) |
| `0x3C` | 4 B | `checksum` | FNV-1a 32-bit hash over entire file with bytes `0x3C..0x3F` zeroed |

### Relocation Table Entries (4 bytes each)
Each 32-bit entry encodes `(type << 24) | (offset & 0x00FFFFFF)` where `offset` is relative to the start of the loaded module (`base`):
- `RELOC_JUMP24 = 1`: Adds `base` to the 24-bit jump/call target of a `JMP`, `JZ`, `JNZ`, or `CALL` instruction (preserving the opcode byte and `CALL` drop-return bit 23).
- `RELOC_PTR32 = 2`: Adds `base` to a `PUSH_U16` + `PUSH_HI` 32-bit string/code address immediate pair.
- `RELOC_BSS32 = 3`: Adds `base + reloc_off` to a `PUSH_U16` + `PUSH_HI` 32-bit global/BSS address immediate pair (module globals are compiled relative to `0` and relocated into the module's heap BSS region).

## 3. Core-to-App ABI Table & Indirect Calls (`OP_CALL_IND`)

- **New VM Opcode `0x28` (`OP_CALL_IND`):** Pops a 32-bit target VM PC from the data stack, pushes `(return_pc, saved_fp)` onto the call stack (preserving bit 23 as the drop-return flag, identical to `OP_CALL`), and transfers control to `target_pc`. Implemented identically in `core/core_x86.js`, `core/core_tc32.js`, and `core/core_triton.js`.
- **ABI Table (`0x04DD80`):** Populated at boot by `abi_init()` in `os/loader.sp` with 59 function pointers (SpiralFS operations, GUI widgets, WM open/close, heap alloc/free/stats, shared file dialogs, clipboard, themes, compiler/assembler rebuild hooks, StudioNet chat/file/HTTP/SNS helpers, and OS metadata). Apps include `/src/app_abi.sp` and invoke OS services via `icall(..., r32(ABI_BASE + slot * 4))`.
- **Lifecycle & Zero-Leak Unloading:** Opening a window calls `app_attach_to_win()`, which validates magic, version (`== 2`), bounds, and FNV-1a checksum before allocating `reloc_off + bss_sz` from the coalescing free-list heap (`VM_HEAP_BASE = 0x370000 .. hal_info(1)`). Closing a window calls `app_init(ABI_TABLE_ADDR, -1)` so the app frees any private heap sub-allocations (e.g., Zork's Z-machine RAM/stack/buffers), then calls `heap_free(base)`.

## 4. Measured Module Sizes & Core Headroom (SpiralOS 1.6)

- **SPIR Core:** `93,616 / 131,072` bytes used, **`37,456` bytes free** (up from `536` bytes free in 1.5).
- **18 Loadable Modules (`/apps/*.spir`, total `129,092` bytes on SpiralFS):**
  `about` (`2,760` B), `calc` (`4,948` B), `clock` (`6,584` B), `sysmon` (`2,900` B), `theme` (`3,332` B), `viewer` (`3,272` B), `build` (`3,228` B), `transfer` (`3,488` B), `snake` (`5,972` B), `paint` (`4,824` B), `blocks` (`11,800` B), `solitaire` (`18,008` B), `notes` (`8,736` B), `edit` (`6,280` B), `files` (`5,936` B), `chat` (`3,496` B), `browser` (`8,864` B), `zork` (`25,024` B).
