# SpiralOS 1.3 — Triton 3.1 Balanced-Ternary Native Core Specification (`TRITON-CORE.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT  

> Audit fix (2026-11-13): rows `0x0A`, `0x0B`, `0x0D` corrected to the globals base the code actually uses (`0x020000`, checked against `core_tc32.js` and `core_triton.js`); the delivered rows said `0x010000` and contained leftover working notes.
**Implementation:** `spiralos/core/core_triton.js` → `spiralos/core/core_triton.asm` (`8,858` trytes / `17,732` disk record bytes in Sectors `960..994`)

This document specifies:
1. The **corrected Spiral VM contract** (instruction encoding, all 40 opcodes `0x00..0x27`, all 22 syscalls `0..21`, and the 4 MB `0x000000..0x3FFFFF` memory map) as actually emitted by `compiler/spiralc.js` and implemented by `core/core_tc32.js`, `core/core_x86.js`, and `core/core_triton.js`, superseding the drifted tables in `VM.md`.
2. The **Triton 3.1 Native Core** architecture: physical memory mapping on a 27-trit balanced-ternary machine, exact 32-bit two's-complement arithmetic and guest-generated bitwise lookup tables, preemptive task scheduling, nearest-neighbor 729-color palette mapping, and 729-tryte block disk layout.
3. The **reference-Core disagreements** discovered between `core/core_tc32.js` and `core/core_x86.js`.

## 1. Corrected Spiral VM Instruction Set Architecture (40 Opcodes `0x00..0x27`)

Contrary to `VM.md` §4 (which describes a variable-length byte-stream VM with opcodes `0x00..0x65`), the actual Spiral VM emitted by `compiler/spiralc.js` (lines 20–62) and executed by all three Native Cores uses **fixed 32-bit little-endian instruction words** aligned on 4-byte boundaries:

- **Standard Instruction Word**: `((op & 0xFF) << 24) | ((a & 0xFF) << 16) | (imm16 & 0xFFFF)`
  - Byte `+0`: `imm16 & 0xFF` (low immediate byte)
  - Byte `+1`: `(imm16 >> 8) & 0xFF` (high immediate byte)
  - Byte `+2`: `a & 0xFF` (8-bit auxiliary parameter: argument count for `ENTER`/`SYSCALL`)
  - Byte `+3`: `op & 0xFF` (opcode `0x00 .. 0x27`)
- **Jump / Call Instruction Word (`0x21..0x24`)**: `((op & 0xFF) << 24) | (addr24 & 0x00FFFFFF)`
  - Bytes `+0..+2`: 24-bit unsigned target byte offset `addr24` (`0x000000 .. 0xFFFFFF`) within `SPIR`
  - Byte `+3`: `op & 0xFF`

| Opcode | Mnemonic | Encoding Fields | Stack Effect (32-Bit Words) | Exact Semantics Across Reference Cores |
| :---: | :--- | :--- | :--- | :--- |
| `0x00` | `OP_NOP` | — | `—` | No operation; advance `VM_PC += 4`. |
| `0x01` | `OP_HALT` | — | `code ->` | Pop 32-bit `exitCode`, store to `vmRam[0x0FFD28]`, store `VM_ICNT` to `vmRam[0x0FFD20]`, set `vmRam[0x0FFD2C] = 1`, and halt CPU. |
| `0x02` | `OP_PUSH_I16` | `s16 imm16` | `-> (s16)imm16` | Sign-extend 16-bit `imm16` (`-32768..32767`) to 32-bit two's complement and push. |
| `0x03` | `OP_PUSH_U16` | `u16 imm16` | `-> (u16)imm16` | Zero-extend 16-bit `imm16` (`0..65535`) to 32-bit and push. |
| `0x04` | `OP_PUSH_HI` | `u16 imm16` | `lo -> (lo & 0xFFFF) \| (imm16 << 16)` | Overwrite upper 16 bits of top-of-stack word at `[VM_SP - 2]` with `imm16`. |
| `0x05` | `OP_DUP` | — | `x -> x, x` | Duplicate top 32-bit word on evaluation stack. |
| `0x06` | `OP_DROP` | — | `x ->` | Decrement `VM_SP -= 4`. |
| `0x07` | `OP_SWAP` | — | `a, b -> b, a` | Swap top two 32-bit words at `[VM_SP - 8]` and `[VM_SP - 4]`. |
| `0x08` | `OP_GET_LOCAL` | `u16 idx` | `-> LOCAL[idx]` | Push 32-bit word from `vmRam[VM_FP + idx * 4]`. |
| `0x09` | `OP_SET_LOCAL` | `u16 idx` | `val ->` | Pop 32-bit word and store to `vmRam[VM_FP + idx * 4]`. |
| `0x0A` | `OP_GET_GLOBAL` | `u16 idx` | `-> GLOB[idx]` | Push 32-bit word from `vmRam[0x020000 + idx * 4]` (globals base `0x020000`, host `0x00220000` on all three Cores). |
| `0x0B` | `OP_SET_GLOBAL` | `u16 idx` | `val ->` | Pop 32-bit word and store to `vmRam[0x020000 + idx * 4]`. |
| `0x0C` | `OP_ADDR_LOCAL` | `u16 idx` | `-> (VM_FP + idx * 4)` | Push 32-bit VM byte offset `(VM_FP + idx * 4) & 0xFFFFFFFF`. |
| `0x0D` | `OP_ADDR_GLOBAL` | `u16 idx` | `-> (0x020000 + idx * 4)` | Push 32-bit VM byte offset `0x020000 + idx * 4`. |
| `0x0E` | `OP_LOAD8U` | `s16 off` | `addr -> u8` | Pop `addr`, compute `ea = (addr + s16(off)) & 0x003FFFFF`, push zero-extended `vmRam[ea]` (`0..255`). |
| `0x0F` | `OP_LOAD8S` | `s16 off` | `addr -> s8` | Pop `addr`, compute `ea = (addr + s16(off)) & 0x003FFFFF`, push sign-extended `vmRam[ea]` (`-128..127`). |
| `0x10` | `OP_LOAD16U` | `s16 off` | `addr -> u16` | Pop `addr`, compute `ea = (addr + s16(off)) & 0x003FFFFF`, push little-endian `u16` at `vmRam[ea..ea+1]`. |
| `0x11` | `OP_LOAD32` | `s16 off` | `addr -> i32` | Pop `addr`, compute `ea = (addr + s16(off)) & 0x003FFFFF`, push little-endian `i32` at `vmRam[ea..ea+3]`. |
| `0x12` | `OP_STORE8` | `s16 off` | `addr, val ->` | Pop `val` and `addr`, store `val & 0xFF` at `vmRam[(addr + s16(off)) & 0x003FFFFF]`. |
| `0x13` | `OP_STORE16` | `s16 off` | `addr, val ->` | Pop `val` and `addr`, store little-endian `val & 0xFFFF` at `vmRam[ea..ea+1]`. |
| `0x14` | `OP_STORE32` | `s16 off` | `addr, val ->` | Pop `val` and `addr`, store little-endian 32-bit `val` at `vmRam[ea..ea+3]`. |
| `0x15` | `OP_ADD` | — | `a, b -> (a + b) \| 0` | 32-bit two's-complement addition modulo $2^{32}$. |
| `0x16` | `OP_SUB` | — | `a, b -> (a - b) \| 0` | 32-bit two's-complement subtraction modulo $2^{32}$. |
| `0x17` | `OP_MUL` | — | `a, b -> Math.imul(a, b)` | Low 32 bits of $a \times b$ modulo $2^{32}$. |
| `0x18` | `OP_DIV` | — | `a, b -> (b == 0 ? 0 : (a / b) \| 0)` | Signed 32-bit truncating division toward zero; `b == 0` returns `0`. (See §7 for `-2147483648 / -1` reference-Core disagreement.) |
| `0x19` | `OP_MOD` | — | `a, b -> (b == 0 ? 0 : (a % b) \| 0)` | Signed 32-bit remainder (`sign(a % b) == sign(a)`); `b == 0` returns `0`. |
| `0x1A` | `OP_AND` | — | `a, b -> a & b` | 32-bit bitwise AND. |
| `0x1B` | `OP_OR` | — | `a, b -> a \| b` | 32-bit bitwise OR. |
| `0x1C` | `OP_XOR` | — | `a, b -> a ^ b` | 32-bit bitwise XOR (unary bitwise NOT `~x` is emitted by `spiralc.js` as `PUSH_I16 -1; OP_XOR`). |
| `0x1D` | `OP_SHL` | — | `a, b -> a << (b & 31)` | 32-bit logical left shift by `b & 31`. |
| `0x1E` | `OP_SHR` | — | `a, b -> a >>> (b & 31)` | 32-bit logical (unsigned) right shift by `b & 31`. |
| `0x1F` | `OP_SAR` | — | `a, b -> a >> (b & 31)` | 32-bit arithmetic (sign-preserving) right shift by `b & 31`. |
| `0x20` | `OP_CMP` | `u16 cc` (`0..7`) | `a, b -> 0 \| 1` | Compare `a` and `b` using `cc = imm16 & 7`: `0=EQ (==)`, `1=NE (!=)`, `2=LT (< signed)`, `3=LE (<= signed)`, `4=GT (> signed)`, `5=GE (>= signed)`, `6=ULT (< unsigned)`, `7=UGT (> unsigned)`. |
| `0x21` | `OP_JMP` | `u24 addr24` | `—` | Unconditional jump: `VM_PC = addr24`. |
| `0x22` | `OP_JZ` | `u24 addr24` | `cond ->` | Pop `cond`; if `cond == 0`, `VM_PC = addr24`. |
| `0x23` | `OP_JNZ` | `u24 addr24` | `cond ->` | Pop `cond`; if `cond != 0`, `VM_PC = addr24`. |
| `0x24` | `OP_CALL` | `u24 addr24` | `—` | Push `(VM_PC, VM_FP)` (`8` bytes) at `vmRam[VM_CSP]`, `VM_CSP += 8`, set `VM_PC = addr24`. |
| `0x25` | `OP_ENTER` | `u8 nargs, u16 nlocals` | `(adjusts FP/SP)` | Set `VM_FP = VM_SP - nargs * 4`, `VM_SP = VM_FP + nlocals * 4`. |
| `0x26` | `OP_RET` | — | `retVal -> retVal` | Pop `retVal = [VM_SP - 4]`, decrement `VM_CSP -= 8`, load `VM_PC = [VM_CSP]` and `saved_fp = [VM_CSP + 4]`, write `retVal` at `[VM_FP]`, set `VM_SP = VM_FP + 4`, `VM_FP = saved_fp`. If `VM_PC == -1` (`0xFFFFFFFF` sentinel), exit task or halt VM with `retVal`. |
| `0x27` | `OP_SYSCALL` | `u8 nargs, u16 sysnum` | `arg0..argN -> retVal` | Pop `nargs` arguments (`VM_SP -= nargs * 4`; `arg[k]` is at `[VM_SP + k * 4]`), execute syscall `sysnum` (`0..21`), push 32-bit return value `retVal`. |

## 2. Corrected Spiral VM Syscall Table (22 Syscalls `0..21`)

`VM.md` §5 lists an outdated 18-entry syscall table where `SYS_CLEAR` was `2`, `SYS_BLIT_RECT` was `6`, and string/task syscalls were absent. The real 22-syscall contract implemented by `core_tc32.js`, `core_x86.js`, and `core_triton.js` is:

| `sysnum` | Name | Signature (`arg0, arg1, ...`) | Return Value & Behavior |
| :---: | :--- | :--- | :--- |
| `0` | `SYS_EXIT` | `(exit_code)` | Stores `exit_code` at `vmRam[0x0FFD28]`, `VM_ICNT` at `vmRam[0x0FFD20]`, sets `vmRam[0x0FFD2C] = 1`, halts CPU. |
| `1` | `SYS_YIELD` | `()` | Polls mouse queue, stores `VM_ICNT` at `[0x0FFD20]`, increments `frames_drawn` at `[0x0FFD04]`, blits `320×200` backbuffer (`0x0F0000`) to display using palette at `0x0FFA00`, triggers scheduler preemption check, returns `0`. |
| `2` | `SYS_TIME_MS` | `()` | Deterministic milliseconds stored at `[0x0FFD24]` and returned. On Triton: `floor(Port6_Steps / 8192) + frames_drawn * 16`. |
| `3` | `SYS_KEY_POLL` | `()` | Dequeues next key-down event and returns `0x01010000 \| (vk << 8) \| ascii` (or `0` if queue empty). |
| `4` | `SYS_MOUSE_POLL`| `(out_ptr)` | Polls mouse queue, updates `[0x0FFD08..0x0FFD10]` and optional `out_ptr[0..2]` with `(x, y, btn)`, returns `(x & 0x3FF) \| ((y & 0x3FF) << 10) \| ((btn & 7) << 20)`. |
| `5` | `SYS_FILL_RECT` | `(x, y, w, h, col)` | Clips `(x, y, w, h)` to `320×200` and fills `vmRam[0x0F0000 + row * 320 + col]` with `col & 0xFF`; returns `0`. |
| `6` | `SYS_DRAW_CHAR` | `(x, y, ch, fg, bg)` | Renders 8×8 glyph `ch` (`32..126`) from `vmRam[0x0EF000 + (ch - 32) * 8]` into `0x0F0000` (`bg < 0` is transparent); returns `0`. |
| `7` | `SYS_DRAW_STR` | `(x, y, str_ptr, fg, bg)` | Renders null-terminated ASCII string at `vmRam[str_ptr]`, advancing `x += 8` per character; returns `0`. |
| `8` | `SYS_MEMCPY` | `(dst, src, len)` | Copies `len` bytes from `vmRam[src]` to `vmRam[dst]` (via `BCOPY` on Triton); returns `0`. |
| `9` | `SYS_MEMSET` | `(dst, val, len)` | Fills `len` bytes at `vmRam[dst]` with `val & 0xFF` (via `BFILL` on Triton); returns `0`. |
| `10` | `SYS_DISK_SYNC` | `(start_sec, count_sec)`| Persists 512-byte sectors `[start_sec, start_sec + count_sec)` from `vmRam[0x200000 + start_sec * 512]` to the hardware block disk; returns `0`. |
| `11` | `SYS_REBOOT` | `()` | Flushes mounted `480 KB` image (`Sectors 0..959`) to disk and warm-reboots the VM from disk Sectors `64..319`. |
| `12` | `SYS_NET_SEND` | `(buf_ptr, len)` | Transmits `len` (`<= 512`) raw frame bytes from `vmRam[buf_ptr]` over StudioNet NIC (`Ports 26 & 24` on Triton), increments TX counter, returns `len`. |
| `13` | `SYS_NET_RECV` | `(buf_ptr, max_len)` | Reads next received StudioNet frame (`Ports 25 & 27` on Triton) into `vmRam[buf_ptr]`, pops RX queue, increments RX counter, returns byte length (or `0`). |
| `14` | `SYS_NET_INFO` | `(cmd, val)` | `cmd=0`: get station node ID; `cmd=1`: set node ID to `val`; `cmd=2`: get TX packet count; `cmd=3`: get RX packet count. |
| `15` | `SYS_SOUND_TONE`| `(freq, ms, wave)` | Documented no-op on Triton returning `0`. |
| `16` | `SYS_MACHINE_INFO`|`(query)` | `query=0`: returns Machine ID (`1` = TabComp, `2` = Hummingbird, `3` = Triton); `query=1`: `0x00400000` (4 MB VM RAM size); `query=2`: `VM_ICNT`; `query=4`: `has_studionet` (`0` or `1`). |
| `17` | `SYS_BLIT_RECT` | `(x, y, w, h, src_ptr)` | Copies `w × h` 8-bpp bitmap from `vmRam[src_ptr]` into `vmRam[0x0F0000]` at `(x, y)`; returns `0`. |
| `18` | `SYS_STRCMP` | `(s1_ptr, s2_ptr)` | Compares null-terminated strings at `vmRam[s1_ptr]` and `vmRam[s2_ptr]`; returns `1` if equal, `0` otherwise. |
| `19` | `SYS_STRLEN` | `(s_ptr)` | Returns byte length of null-terminated string at `vmRam[s_ptr]`. |
| `20` | `SYS_ITOA` | `(val, buf_ptr, base)` | Formats `val` in radix `base` (signed if `base == 10`, unsigned otherwise) into `vmRam[buf_ptr]` and returns string length. |
| `21` | `SYS_TASK_SPAWN_VM`|`(fn_pc, arg0)` | Allocates free hardware TCB slot `tid` (`1..7`), initializes stack `sp_base = 0x140000 + tid * 0x6000` with `arg0` and call stack `csp_base = 0x178000 + tid * 0x2000` with sentinel `-1`, increments `num_active_tids` at `[0x0FFF04]`, returns `tid` (or `-1`). |

## 3. Corrected 4 MB Spiral VM Memory Map (`0x000000 .. 0x3FFFFF`)

Both reference Cores and the Triton Core map the **4 MB (`0x400000` = `4,194,304` byte)** Spiral VM address space at host address `0x00200000 .. 0x005FFFFF`. Out-of-range effective addresses in `LOAD*` and `STORE*` wrap modulo `0x400000` (`ea & 0x003FFFFF`).

| VM Byte Offset | Host Address (All 3 Cores) | Size | Contents |
| :--- | :--- | :--- | :--- |
| `0x000000 .. 0x01FFFF` | `0x00200000 .. 0x0021FFFF` | `128 KB` | **`SPIR` Code & String Segment** (loaded from disk Sectors `64..319`). |
| `0x020000 .. 0x05FFFF` | `0x00220000 .. 0x0025FFFF` | `256 KB` | **OS Globals, BSS & Application Buffers** (`SHELL_OUT_BUF = 0x04B000`, `PAINT_CANVAS = 0x04C000`, `SHELL_HIST_BUF = 0x04E000`, `EDIT_BUF = 0x050000`). |
| `0x060000 .. 0x0EEFFF` | `0x00260000 .. 0x002EEFFF` | `572 KB` | **Compiler & Assembler Scratch Buffers**. |
| `0x0EF000 .. 0x0EF2FF` | `0x002EF000 .. 0x002EF2FF` | `768 B` | **Embedded 8×8 ASCII Bitmap Font** (96 glyphs for ASCII `32..127`). |
| `0x0F0000 .. 0x0FF9FF` | `0x002F0000 .. 0x002FF9FF` | `64,000 B` | **`320×200` 8-bpp Video Backbuffer**. |
| `0x0FFA00 .. 0x0FFCFF` | `0x002FFA00 .. 0x002FFCFF` | `768 B` | **256-Entry RGB Palette** (`256 × 3` bytes `R, G, B` in `0..255`). |
| `0x0FFD00 .. 0x0FFDFF` | `0x002FFD00 .. 0x002FFDFF` | `256 B` | **VM Status Block**: `+0x00` magic (`0x53504F53`), `+0x04` frames, `+0x08` mouse_x, `+0x0C` mouse_y, `+0x10` mouse_btn, `+0x14` win_count, `+0x18` focused_app, `+0x1C` machine_id (`3`), `+0x20` vm_icnt, `+0x24` time_ms, `+0x28` exit_code, `+0x2C` halted, `+0x30` has_snet, `+0x78` title_col, `+0x80` boot_banner. |
| `0x0FFE00 .. 0x0FFEFF` | `0x002FFE00 .. 0x002FFEFF` | `256 B` | **Hardware Task Control Block Table (`TCB[0..7]`)**: 8 slots × 32 bytes (`+0x00` state, `+0x04` vm_pc, `+0x08` vm_sp, `+0x0C` vm_fp, `+0x10` vm_csp, `+0x14` ticks, `+0x18` entry_pc, `+0x1C` exit_val). |
| `0x0FFF00 .. 0x0FFF1F` | `0x002FFF00 .. 0x002FFF1F` | `32 B` | **Hardware Scheduler Header**: `+0x00` cur_tid, `+0x04` num_active_tids, `+0x08` timer_ticks, `+0x0C` preempt_flag, `+0x10` context_switches, `+0x14` quantum_countdown (`256`). |
| `0x100000 .. 0x18FFFF` | `0x00300000 .. 0x0038FFFF` | `576 KB` | **Task 0 & Background Task 1..7 Evaluation & Call Stacks** (Task 0 SP at `0x100000`, CSP at `0x170000`; Task `tid` SP at `0x140000 + tid * 0x6000`, CSP at `0x178000 + tid * 0x2000`). |
| `0x200000 .. 0x367FFF` | `0x00400000 .. 0x00567FFF` | `1,440 KB`| **Mounted `spiralos.img` Disk Buffer** (`0x200000..0x203FFF`: x86 Core, `0x204000..0x207FFF`: TC-32 Core, `0x208000..0x227FFF`: `SPIR`, `0x228000..0x277FFF`: `SpiralFS` volume, `0x278000..0x27FFFF`: Triton Core). |

## 4. Triton 3.1 Physical Memory Layout & 32-Bit Arithmetic / Bitwise Methods

### 4.1 Triton Physical RAM Configuration
Triton's default RAM (`3^14 = 4,782,969` trytes) is configured to its architected maximum **`ramSize = 3^15 = 14,348,907` trytes** so the 4 MB (`4,194,304` tryte) VM window sits at `TRITON_VM_BASE = 0x00200000 = 2,097,152 .. 6,291,455`, matching the reference Cores' host base address `0x00200000`. Each Spiral VM byte is stored **one byte per tryte** with value `0..255`.

| Triton Tryte Address | Size (Trytes) | Contents |
| :--- | :--- | :--- |
| `0 .. 95` | `96` | **Stage-0 Disk Boot ROM** (`boot_rom_entry`): verifies `'TRIT'` magic at Disk offset `0x078000` (`491,520`), unpacks the Triton Core trytes into RAM, and jumps to `boot_entry` (`2160`). |
| `100 .. 145` | `46` | **Core Scratch Registers & Device State** (`VAR_QUANTUM`, `VAR_HAS_DISK`, `VAR_INITIALIZED`, `VAR_HAS_SNET`, `VAR_MOUSE_*`, `VAR_EA_CSP`, `VAR_TMP0..4`). |
| `150 .. 587` | `438` | **Interrupt Vector Table (`150..185`), Opcode Jump Table (`186..305`), Compare Jump Table (`306..329`), Syscall Jump Table (`330..395`), and Power-of-2 Tables (`396..587`)**. |
| `590 .. 2147` | `1,558` | **Boot Banner (`590..605`), Embedded 8×8 Font (`610..1377`), and Initial 256-Color Palette (`1380..2147`)**. |
| `2160 .. 8857` | `6698` | **Triton Core Native T3 Instructions** (all code labels `< 9841`). |
| `9000 .. 9255` | `256` | **`TAB_PAL_LUT`**: Guest-computed 256-entry 729-color palette lookup table (`< 9841` for single-instruction `LT R0, R0, #9000` lookup during `SYS_YIELD`). |
| `12000 .. 14559` | `2,560` | **Guest-Generated Bitwise & Nibble Lookup Tables (`TAB_BASE = 12000`)**: 10 × 256-entry tables (`OFF_NIB_LO`, `OFF_NIB_LO16`, `OFF_NIB_HI`, `OFF_NIB_HI16`, `OFF_AND_LO/HI`, `OFF_OR_LO/HI`, `OFF_XOR_LO/HI`). |
| `28000` (downward) | `—` | **Triton Hardware Stack (`SP`, `ESP`, `KSP`)**. |
| `2,097,152 .. 6,291,455` | `4,194,304` | **4 MB Spiral VM Byte Address Space (`vmRam[0x000000..0x3FFFFF]`)**. |
| `15,000,000 .. 15,354,293`| `354,294` | **Triton `729×486` Memory-Mapped Framebuffer**. |

### 4.2 Exact 32-Bit Two's-Complement Arithmetic on 27-Trit Hardware
A 27-trit balanced-ternary word holds signed integers in $[-3{,}812{,}798{,}742{,}493, +3{,}812{,}798{,}742{,}493]$ ($\approx \pm 3.81 \times 10^{12}$), which strictly contains both the unsigned 32-bit range $[0, 4{,}294{,}967{,}295]$ and the signed 32-bit range $[-2{,}147{,}483{,}648, +2{,}147{,}483{,}647]$:
- **Loads (`emitLoadU32` / `emitLoadS32`)**: Reconstruct 32-bit integers from 4 little-endian byte-trytes $b_0, b_1, b_2, b_3 \in [0, 255]$ via Horner's rule $(((b_3 \cdot 256 + b_2) \cdot 256 + b_1) \cdot 256 + b_0)$. For signed loads, if $b_3 \ge 128$, $b_3$ is replaced by $b_3 - 256$ before Horner evaluation.
- **Modulo $2^{32}$ Wraparound (`emitWrapU32`)**: After `ADD` or `SUB`, `MOD R_val, R_val, 4294967296` followed by `if (R_val < 0) R_val += 4294967296` maps any 27-trit integer into its canonical unsigned 32-bit representative $[0, 2^{32}-1]$, which is then decomposed into 4 byte-trytes by repeated `MOD 256` and `DIV 256`.
- **32-Bit Multiplication (`OP_MUL`)**: Because $2^{32} \times 2^{32} = 2^{64} > 3.81 \times 10^{12}$, full 32×32 multiplication could overflow 27 trits. The Core decomposes $a = a_{\text{hi}} \cdot 65536 + a_{\text{lo}}$ and $b = b_{\text{hi}} \cdot 65536 + b_{\text{lo}}$ ($a_{\text{lo}}, a_{\text{hi}}, b_{\text{lo}}, b_{\text{hi}} \in [0, 65535]$), computes $\text{cross} = (a_{\text{lo}} b_{\text{hi}} + a_{\text{hi}} b_{\text{lo}}) \bmod 65536$ (max intermediate $2 \times 2^{32} = 8.59 \times 10^9 \ll 3.81 \times 10^{12}$), and wraps $(a_{\text{lo}} b_{\text{lo}} + \text{cross} \cdot 65536) \bmod 2^{32}$.
- **Signed Division & Modulo (`OP_DIV`, `OP_MOD`)**: Triton's native `DIV` and `MOD` instructions implement truncating division toward zero and remainder with the dividend's sign, matching C99/JS semantics. Division by zero is guarded (`JZX div_by_zero -> 0`), and $(-2^{31}) / (-1) = +2^{31}$ wraps via `emitWrapU32` to $2^{31} \equiv -2147483648 \pmod{2^{32}}$.

### 4.3 Bitwise Operations & Shifts on Balanced-Ternary Hardware
Triton's native tritwise instructions (`TAND`, `TOR`, `TXOR`, `TSHL`) operate on balanced-ternary trits $\{-1, 0, +1\}$, not binary bits. To achieve fast, exact 32-bit binary bitwise semantics:
1. **Guest-Generated Nibble & $16\times 16$ Bitwise Tables (`init_tab_loop`)**: At cold boot, guest assembly loops over `idx = 0..255`, splits `idx` into nibbles $i = \lfloor \text{idx} / 16 \rfloor \in [0, 15]$ and $j = \text{idx} \bmod 16 \in [0, 15]$, and decomposes $i, j$ into 4 binary bits $b_i, b_j \in \{0, 1\}$ via `MOD 2` and `DIV 2`. Using pure integer identities on $\{0, 1\}$:
   $$b_i \land b_j = b_i \cdot b_j, \qquad b_i \lor b_j = b_i + b_j - b_i \cdot b_j, \qquad b_i \oplus b_j = (b_i - b_j)^2$$
   the guest populates `OFF_NIB_LO`, `OFF_NIB_LO16`, `OFF_NIB_HI`, `OFF_NIB_HI16`, and the six 256-entry tables `OFF_AND_LO/HI`, `OFF_OR_LO/HI`, and `OFF_XOR_LO/HI` at `TAB_BASE = 12000..14559`.
2. **Byte-Wise Table Lookup (`OP_AND`, `OP_OR`, `OP_XOR`)**: Each of the 4 bytes $k \in \{0, 1, 2, 3\}$ of operands $a$ and $b$ is split into low and high nibbles via `OFF_NIB_LO16`/`OFF_NIB_LO` and `OFF_NIB_HI16`/`OFF_NIB_HI`, indexed into `OFF_OP_LO` and `OFF_OP_HI`, and summed in 16 instructions per byte without loops or branches.
3. **Power-of-2 Table Shifts (`OP_SHL`, `OP_SHR`, `OP_SAR`)**: The shift count is masked to $c = b_{\text{byte0}} \bmod 32 \in [0, 31]$. Using the 32-entry word tables `pow2_table[c] = 2^c` and `pow2c_table[c] = 2^{32-c}`:
   - `SHL`: $u' = (u \bmod 2^{32-c}) \cdot 2^c$
   - `SHR`: $u' = \lfloor u / 2^c \rfloor$
   - `SAR`: for $s \ge 0$, $\lfloor s / 2^c \rfloor$; for $s < 0$ (where truncating `DIV` rounds toward zero instead of $-\infty$), $\lfloor s / 2^c \rfloor = \text{trunc}((s - (2^c - 1)) / 2^c)$, wrapped modulo $2^{32}$.

## 5. Display Scaling, Nearest-Neighbor 729-Color Palette Rule & I/O Mapping

- **Centered $2\times$ Viewport**: In `SYS_YIELD` (`SYS 1`), the $320 \times 200$ 8-bpp backbuffer at `vmRam[0x0F0000]` is scaled $2\times$ into a centered **$640 \times 400$** region of Triton's $729 \times 486$ framebuffer (`Mem[15,000,000 .. 15,354,293]`):
  - Horizontal offset: $x_0 = \lfloor (729 - 640) / 2 \rfloor = 44$ ($x \in [44, 683]$, left border $44$ px, right border $45$ px)
  - Vertical offset: $y_0 = (486 - 400) / 2 = 43$ ($y \in [43, 442]$, top border $43$ px, bottom border $43$ px)
  - Start address: $15{,}000{,}000 + 43 \times 729 + 44 = 15{,}031{,}391$
- **Border Color**: Drawn at boot via `OUT #-364, #5` (`DISPLAY_CMD` fill) in color tryte **`-364`** (`PALETTE_729[-364] = [0, 0, 0]`, pure black).
- **Nearest-Neighbor 729-Color Palette Rule (Computed by Guest)**: Triton's `PALETTE_729` maps each color tryte $c = 81 r_d + 9 g_d + b_d \in [-364, +364]$ ($r_d, g_d, b_d \in [-4, +4]$) to channel levels `[0, 32, 64, 96, 128, 160, 192, 224, 255]` ($32(d + 4)$ clamped at $255$). For each 24-bit palette entry $(R, G, B) \in [0, 255]^3$ at `vmRam[0x0FFA00 + 3i]`, the guest computes:
  $$r_d = \left\lfloor \frac{R + 16}{32} \right\rfloor - 4, \qquad g_d = \left\lfloor \frac{G + 16}{32} \right\rfloor - 4, \qquad b_d = \left\lfloor \frac{B + 16}{32} \right\rfloor - 4$$
  $$\text{TAB\_PAL\_LUT}[i] = 81 r_d + 9 g_d + b_d \in [-364, +364]$$

## 6. Unified Disk Image (`spiralos.img` 1.3) & 729-Tryte Sector Mapping

In `spiralos.img` 1.3 (`1,474,560` bytes = `2,880` × 512-byte sectors), the Triton Core is stored in previously unused **Sectors `960..1023`** (`0x078000 .. 0x07FFFF`, `32 KB` reserved; active record occupies Sectors `960..994`, `17,732` bytes):
- `0x078000 .. 0x078003`: Magic `0x54495254` (`'TRIT'`)
- `0x078004 .. 0x078007`: `tryteCount` (`8858`, `u32` little-endian)
- `0x078008 .. 0x07800B`: `entryPc` (`0`, `u32` little-endian)
- `0x07800C .. 0x07800F`: Reserved (`0`)
- `0x078010 .. 0x07C533`: `tryteCount × 2` bytes (`u16` little-endian biased by `+9841`: `u16 = tryte + 9841`)

When mounted on Triton's block disk (`2,187` sectors × `729` trytes = `1,594,323` trytes), the `1,474,560` bytes of `spiralos.img` are stored **one byte per tryte** (`0..255`) across `\lceil 1{,}474{,}560 / 729 \rceil = 2{,}023` Triton sectors (`LBA 0..2022`). A 512-byte SpiralOS sector range `[start_sec, start_sec + count_sec)` maps to Triton 729-tryte LBA range:
$$\text{lba\_start} = \left\lfloor \frac{512 \cdot \text{start\_sec}}{729} \right\rfloor, \qquad \text{lba\_end} = \left\lfloor \frac{512(\text{start\_sec} + \text{count\_sec}) + 728}{729} \right\rfloor$$

## 7. Documented Reference-Core Disagreements (`core_tc32.js` vs `core_x86.js`)

1. **`OP_DIV` (`0x18`) and `OP_MOD` (`0x19`) on `(-2147483648, -1)` (`0x80000000`, `0xFFFFFFFF`)**:
   - `core/core_tc32.js` (TabComp) computes signed division and wraps modulo $2^{32}$, returning `-2147483648` (`0x80000000`) for `DIV` and `0` for `MOD`.
   - `core/core_x86.js` (Hummingbird, lines 912–939) checks only for divisor `ecx == 0` (`test ecx, ecx; jz ...`) and then executes `cdq; idiv ecx`. When `eax = 0x80000000` and `ecx = 0xFFFFFFFF`, the mathematical quotient $+2{,}147{,}483{,}648$ exceeds the signed 32-bit maximum $+2{,}147{,}483{,}647$, causing `HummingbirdPC` to raise x86 Exception 0 (`#DE` Divide Error). Because `core_x86.js` points IDT Vector 0 to `isr_default` (`iretd`), `iretd` returns directly to the faulting `idiv ecx` instruction in an infinite trap loop.
   - `core/core_triton.js` matches `core/core_tc32.js` and the two's-complement BigInt oracle (`-2147483648` for `DIV`, `0` for `MOD`).
2. **OS Machine-ID Branch in `os/os.sp:110` and `os/apps1.sp:627`**:
   - The unmodified `SPIR` OS checks `if (g_machine_id == 1)` (rendering `"TC-32"` / `"CPU: TabComp TC-32"`) `else` (rendering `"i586"` / `"CPU: i586 Protected"`). Because `g_machine_id` is `2` on Hummingbird and `3` on Triton, Hummingbird and Triton execute the exact same `else` branch (`73,311` VM instructions through Frame 3 vs TabComp's `73,212`) and produce 100% byte-identical `320×200` backbuffers.
