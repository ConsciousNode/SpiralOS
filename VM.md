# Spiral VM 1.1 Specification (`SPIR` Format)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT

The **Spiral VM** is a portable, deterministic, stack-and-frame bytecode virtual machine designed so that a single compiled operating system image (`spiralos.img`) boots and runs identically on two completely different hardware architectures:

1. **TabComp (`TC-32`)**: A 32-bit RISC fantasy workstation (`16` general-purpose registers, word-addressed memory, `320×200` 8-bpp framebuffer, custom MMIO).
2. **Hummingbird (`i586`)**: A real-architecture x86 PC booting via 16-bit BIOS `INT 13h`, switching to 32-bit Protected Mode with paging, VBE `640×480` (`32-bpp` or `24-bpp` fallback) linear framebuffer, 8254 PIT, 8259A PIC, PS/2 keyboard & mouse, and 82077AA FDC (with a 16-bit Real-Mode BIOS `INT 13h` write thunk fallback).

Every layer of SpiralOS above the hardware abstraction Core—including the preemptive task scheduler, `SpiralFS` filesystem, window manager, GUI toolkit, StudioNet protocol stack, Sonder procedural web engine, self-hosting `SpiralC` compiler (`/src/cc.sp`), and both native assemblers (`/src/asm.sp`)—is compiled to `SPIR` bytecode.

---

## 1. Binary Image Layout (`SPIR`, 128 KB)

In SpiralOS 1.1, the `SPIR` container was expanded from `64 KB` to **`128 KB` (`131,072` bytes, `256` floppy sectors)** with **32-bit offsets** so the full recursive-descent `SpiralC` compiler and dual-architecture native assemblers fit comfortably in memory alongside the desktop OS and applications.

| Offset Range | Size | Description |
| :--- | :--- | :--- |
| `0x00000 .. 0x0001F` | `32 B` | **`SPIR` Header** (8 little-endian 32-bit words) |
| `0x00020 .. 0x1BFFF` | `112 KB - 32 B` | **Bytecode Instruction Stream** (`codeSize` bytes; currently `89,800` bytes) |
| `0x1C000 .. 0x1FFFF` | `16 KB` | **String Literal Pool** (null-terminated ASCII strings; currently `3,264` bytes) |

### Header Format (`0x00000 .. 0x0001F`)

| Offset | Type | Field | Value / Meaning |
| :--- | :--- | :--- | :--- |
| `0x00` | `u32` | `magic` | `0x52495053` (`"SPIR"` in little-endian ASCII) |
| `0x04` | `u32` | `version` | `0x00010001` (Spiral VM v1.1 — 32-bit offsets, 128 KB segment) |
| `0x08` | `u32` | `entryPc` | Byte offset of `main()` entry point inside the `SPIR` image |
| `0x0C` | `u32` | `codeSize` | Total byte length of executable bytecode starting at `0x00020` |
| `0x10` | `u32` | `dataOffset` | `0x0001C000` (`114,688` — start of string literal pool) |
| `0x14` | `u32` | `dataSize` | Byte length of string literal pool |
| `0x18` | `u32` | `globalWords` | Number of 32-bit global variables allocated in `0x20000..0x27FFF` |
| `0x1C` | `u32` | `flags` | `0x00000001` (Preemptive multitasking + 128 KB `SPIR` enabled) |

---

## 2. Unified 1 MB VM Address Space (`0x00000 .. 0xFFFFF`)

Both native Cores expose an identical **1 MB (`1,048,576` byte)** byte-addressable virtual memory layout to `SPIR` bytecode:

| VM Byte Address | Size | Region | Description |
| :--- | :--- | :--- | :--- |
| `0x00000 .. 0x1FFFF` | `128 KB` | **`SPIR` Code & Strings** | Loaded from disk Sectors `64..319`. Strings reside at `0x1C000..0x1FFFF`. |
| `0x20000 .. 0x27FFF` | `32 KB` | **Globals & BSS** | Up to `8,192` 32-bit global variables (`GLOB[i]` at `0x20000 + i*4`). |
| `0x28000 .. 0x77FFF` | `320 KB` | **`SpiralFS` Volume** | In-memory disk image synced with Sectors `320..959` (`640` sectors, up to `64` files). |
| `0x78000 .. 0x7FFFF` | `32 KB` | **VM Stacks & TCBs** | Task 0 evaluation/call stacks (`0x78000..0x79FFF`) + Preemptive Task 1..3 stacks (`0x7A000..0x7DFFF`) + Hardware Task Table (`0x7E000..0x7E0FF`). |
| `0x80000 .. 0x97FFF` | `96 KB` | **Display & Font Buffers** | `0x80000..0x8F9FF`: `320×200` 8-bpp backbuffer (`64,000` B); `0x90000..0x903FF`: 256-color RGB palette; `0x91000..0x91FFF`: bitmap font glyph tables. |
| `0x98000 .. 0x9FFFF` | `32 KB` | **Network & Audio Buffers** | StudioNet RX/TX ring buffers, SDP socket buffers, and PCM synth queues. |
| `0xA0000 .. 0xFFFFF` | `384 KB` | **Dynamic Heap & Scratch** | Used by `SpiralC` compiler AST/symbol tables (`0xA0000..0xBFFFF`), `128 KB` self-hosted `SPIR` output buffer (`0xC0000..0xDFFFF`), native assembler buffers (`0xE0000..0xEFFFF`), and hardware status block (`0xFFD00..0xFFFFF`). |

---

## 3. Registers & Per-Task Preemptive State

Each preemptive hardware task slot (`Task 0 .. Task 3`) maintains four 32-bit VM registers saved/restored in the Hardware Task Control Table at `0x7E000 + slot * 32`:

- **`VM_PC`**: Program Counter (byte offset into `0x00000..0x1BFFF`).
- **`VM_SP`**: Data/Evaluation Stack Pointer (word index into `0x78000..0x7DFFF`).
- **`VM_FP`**: Frame Pointer (word index of current function's local variable base).
- **`VM_CSP`**: Call Stack Pointer (word index storing saved `(VM_PC, VM_FP)` pairs on `CALL`).

Hardware task table entry layout (`32` bytes per slot at `0x7E000 + slot * 32`):
- `+0x00`: `active` (`1` = runnable, `0` = inactive)
- `+0x04`: `VM_PC` (saved byte PC)
- `+0x08`: `VM_SP` (saved word SP)
- `+0x0C`: `VM_FP` (saved word FP)
- `+0x10`: `VM_CSP` (saved word CSP)
- `+0x14`: `ticks` (number of hardware timer preemptions scheduled into this slot)
- `+0x18`: `entry_pc` (initial entry point)

---

## 4. Instruction Set Architecture (ISA)

All instructions begin with a 1-byte opcode. Immediate operands are little-endian (`s8` = signed 8-bit, `u8` = unsigned 8-bit, `s16` = signed 16-bit, `u16` = unsigned 16-bit, `i32` = signed/unsigned 32-bit).

### 4.1 Stack & Constants
| Opcode | Mnemonic | Operands | Stack Effect | Description |
| :--- | :--- | :--- | :--- | :--- |
| `0x00` | `NOP` | — | `—` | No operation |
| `0x01` | `PUSH_I32` | `imm32` | `-> imm32` | Push 32-bit signed/unsigned constant |
| `0x02` | `PUSH_I8` | `s8` | `-> s8` | Push sign-extended 8-bit constant |
| `0x03` | `PUSH_0` | — | `-> 0` | Push constant `0` |
| `0x04` | `PUSH_1` | — | `-> 1` | Push constant `1` |
| `0x05` | `DUP` | — | `a -> a, a` | Duplicate top of stack |
| `0x06` | `DROP` | — | `a ->` | Discard top of stack |
| `0x07` | `SWAP` | — | `a, b -> b, a` | Swap top two stack words |

### 4.2 Locals & Globals
| Opcode | Mnemonic | Operands | Stack Effect | Description |
| :--- | :--- | :--- | :--- | :--- |
| `0x10` | `LOAD_LOCAL` | `u8 idx` | `-> val` | Push `STACK[FP + idx]` |
| `0x11` | `STORE_LOCAL`| `u8 idx` | `val ->` | Pop into `STACK[FP + idx]` |
| `0x12` | `LOAD_GLOB` | `u16 idx` | `-> val` | Push 32-bit word at `0x20000 + idx * 4` |
| `0x13` | `STORE_GLOB` | `u16 idx` | `val ->` | Pop 32-bit word into `0x20000 + idx * 4` |
| `0x14` | `INC_LOCAL` | `u8 idx, s8 delta` | `—` | `STACK[FP + idx] += delta` in place |

### 4.3 Memory Access
| Opcode | Mnemonic | Operands | Stack Effect | Description |
| :--- | :--- | :--- | :--- | :--- |
| `0x20` | `LOAD8` | — | `addr -> u8` | Read unsigned byte at `VM_MEM[addr & 0xFFFFF]` |
| `0x21` | `LOAD32` | — | `addr -> i32` | Read little-endian 32-bit word at `VM_MEM[addr & 0xFFFFC]` |
| `0x22` | `STORE8` | — | `addr, val ->` | Write `val & 0xFF` to `VM_MEM[addr & 0xFFFFF]` |
| `0x23` | `STORE32` | — | `addr, val ->` | Write 32-bit `val` to `VM_MEM[addr & 0xFFFFC]` |
| `0x24` | `MEMCPY` | — | `dst, src, len ->` | Copy `len` bytes from `src` to `dst` |
| `0x25` | `MEMSET` | — | `dst, val, len ->` | Fill `len` bytes at `dst` with `val & 0xFF` |

### 4.4 Arithmetic, Bitwise & Comparisons
| Opcode | Mnemonic | Stack Effect | Description |
| :--- | :--- | :--- | :--- |
| `0x30` | `ADD` | `a, b -> (a + b) \| 0` | 32-bit signed addition |
| `0x31` | `SUB` | `a, b -> (a - b) \| 0` | 32-bit signed subtraction |
| `0x32` | `MUL` | `a, b -> imul(a, b)` | 32-bit signed multiplication |
| `0x33` | `DIV` | `a, b -> (b == 0 ? 0 : (a / b) \| 0)` | Safe 32-bit signed division |
| `0x34` | `MOD` | `a, b -> (b == 0 ? 0 : (a % b) \| 0)` | Safe 32-bit signed modulo |
| `0x35` | `NEG` | `a -> (-a) \| 0` | Two's complement negation |
| `0x36` | `AND` | `a, b -> a & b` | Bitwise AND |
| `0x37` | `OR` | `a, b -> a \| b` | Bitwise OR |
| `0x38` | `XOR` | `a, b -> a ^ b` | Bitwise XOR |
| `0x39` | `SHL` | `a, b -> a << (b & 31)` | Logical shift left |
| `0x3A` | `SHR` | `a, b -> a >>> (b & 31)` | Logical shift right (unsigned) |
| `0x3B` | `SAR` | `a, b -> a >> (b & 31)` | Arithmetic shift right (signed) |
| `0x3C` | `NOT` | `a -> ~a` | Bitwise NOT |
| `0x40` | `EQ` | `a, b -> (a == b ? 1 : 0)` | Equal |
| `0x41` | `NE` | `a, b -> (a != b ? 1 : 0)` | Not equal |
| `0x42` | `LT` | `a, b -> (a < b ? 1 : 0)` | Signed less than |
| `0x43` | `GT` | `a, b -> (a > b ? 1 : 0)` | Signed greater than |
| `0x44` | `LE` | `a, b -> (a <= b ? 1 : 0)` | Signed less than or equal |
| `0x45` | `GE` | `a, b -> (a >= b ? 1 : 0)` | Signed greater than or equal |
| `0x46` | `LNOT` | `a -> (a == 0 ? 1 : 0)` | Logical NOT |

### 4.5 Control Flow, Calls & System Interface (32-Bit Offsets in v1.1)
| Opcode | Mnemonic | Operands | Stack Effect | Description |
| :--- | :--- | :--- | :--- | :--- |
| `0x50` | `JMP` | `u32 target` | `—` | Unconditional jump to `VM_PC = target` |
| `0x51` | `JZ` | `u32 target` | `cond ->` | Pop `cond`; if `cond == 0`, jump to `target` |
| `0x52` | `JNZ` | `u32 target` | `cond ->` | Pop `cond`; if `cond != 0`, jump to `target` |
| `0x53` | `CALL` | `u32 target, u8 argc, u8 locals` | `arg0..argN -> ret` | Save `(VM_PC, VM_FP)` on call stack, set `FP = SP - argc`, set `SP = FP + locals`, jump to `target` |
| `0x54` | `RET` | — | `retVal -> retVal` | Pop return value, restore `(VM_PC, VM_FP)` from call stack, push `retVal` |
| `0x55` | `SYSCALL` | `u8 id, u8 argc` | `arg0..argN -> ret` | Invoke native Core syscall `id` with `argc` arguments |
| `0x56` | `YIELD` | — | `—` | Yield execution slice (triggers display present, input poll, and preemptive task switch) |
| `0x57` | `CALL_IND`| `u8 argc, u8 locals` | `arg0..argN, target -> ret` | Indirect call to function address popped from top of stack |
| `0x5F` | `HALT` | — | `exitCode ->` | Terminate VM execution and store `exitCode` |

---

## 5. System Call Interface (`SYSCALL id, argc`)

| ID | Name | Signature | Description |
| :--- | :--- | :--- | :--- |
| `0` | `sys_debug` | `sys_debug(val)` | Write diagnostic integer to serial/host debug port |
| `1` | `sys_present` | `sys_present()` | Blit `320×200` 8-bpp backbuffer (`0x80000`) through palette (`0x90000`) to native hardware display |
| `2` | `sys_time_ms` | `sys_time_ms() -> ms` | Deterministic monotonic clock in milliseconds |
| `3` | `sys_poll_key` | `sys_poll_key() -> ev` | Dequeue keyboard event (`bit 8`: down, `bits 0..7`: ASCII/keycode, `0` if none) |
| `4` | `sys_poll_mouse` | `sys_poll_mouse(out_addr) -> packed` | Poll mouse into `(x, y, buttons)` and return `(x & 0xFFF) \| ((y & 0xFFF) << 12) \| (btn << 24)` |
| `5` | `sys_rect_fill` | `sys_rect_fill(x, y, w, h, col)` | Hardware-accelerated clipped rectangle fill in `0x80000` |
| `6` | `sys_draw_char` | `sys_draw_char(x, y, ch, fg, bg, font)` | Hardware-accelerated 8×8 glyph renderer using `0x91000` font bank |
| `7` | `sys_disk_sync` | `sys_disk_sync(lba_start, count)` | Persist `SpiralFS` sectors (`0x28000`) to floppy/disk (via 82077AA FDC or BIOS `INT 13h` Real-Mode Write Thunk, plus full image sync) |
| `8` | `sys_net_tx` | `sys_net_tx(buf_addr, len) -> ok` | Transmit frame via StudioNet virtual NIC (`0` if StudioNet card is absent) |
| `9` | `sys_net_rx` | `sys_net_rx(buf_addr, max_len) -> len` | Receive frame from StudioNet RX ring (`0` if empty or card absent) |
| `10` | `sys_beep` | `sys_beep(freq_hz, dur_ms)` | Trigger procedural UI synthesizer tone |
| `11` | `sys_machine_id`| `sys_machine_id() -> id` | Return `1` on TabComp (`TC-32`), `2` on Hummingbird (`i586`) |
| `12` | `sys_net_node` | `sys_net_node() -> addr` | Return hardware StudioNet node ID (`0x0001` on TabComp, `0x0002` on Hummingbird, `0` if no NIC) |
| `13` | `sys_reboot` | `sys_reboot()` | Reload `SPIR` from `0x00000` and cold-restart the VM |
