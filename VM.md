# Spiral VM Specification (`VM.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT · **Version:** `SpiralVM 1.0`

---

## 1. Overview & Design Goals

The **Spiral VM** is a deterministic, portable 32-bit virtual machine with a unified 4 MiB byte-addressed virtual memory space and fixed 32-bit instruction words. It is designed so that its native interpreter loop can be implemented cleanly in under 4 KB of **TabComp TC-32** RISC instructions and under 7 KB of **Intel i586** 32-bit protected-mode instructions with **100% bit-identical execution semantics**.

---

## 2. Virtual Memory Model (`vmRam[0x000000 .. 0x3FFFFF]`)

Every SpiralVM instance operates on a flat, little-endian `4 MiB` byte array (`vmRam`), mapped at physical address `0x00200000` on both TabComp and Hummingbird:

| `vmRam` Address Range | Size | Purpose |
| :--- | :--- | :--- |
| `0x000000 .. 0x00001F` | `32 B` | **`SPIR` Image Header**: Magic `0x52495053` (`"SPIR"`), version `1`, `entry_pc`, `code_end`, `global_words`, `str_pool_base` (`0xD000`), `str_pool_len`, `checksum`. |
| `0x000020 .. 0x00CFFF` | `52 KB` | **Executable Bytecode**: 4-byte aligned 32-bit VM instructions. |
| `0x00D000 .. 0x00FFFF` | `12 KB` | **Read-Only String Literal Pool**: Null-terminated string constants. |
| `0x010000 .. 0x047FFF` | `224 KB` | **Global Variables & Arrays**: Indexed by 16-bit slot (`0x010000 + slot * 4`). |
| `0x048000 .. 0x05FFFF` | `96 KB` | **OS Buffers**: StudioNet TX/RX buffers (`0x048000`), Chat log (`0x048800`), Web buffer (`0x049000`), Shell (`0x04B000`), Paint canvas (`0x04C000`), Editor (`0x058000`). |
| `0x0B0000 .. 0x0BFFFF` | `64 KB` | **Self-Hosting Compiler Arena (`CC_WORK_BUF`)**: Used by `/src/cc.sp` to build updated `SPIR` images in-memory. |
| `0x0EF000 .. 0x0EF2FF` | `768 B` | **Bitmap Font (`8×8`)**: 96 ASCII glyphs (`32..127`), 8 bytes per glyph. |
| `0x0F0000 .. 0x0FF9FF` | `64,000 B` | **Linear Framebuffer (`VRAM`)**: `320 × 200` 8-bit indexed pixels. |
| `0x0FFA00 .. 0x0FFCFF` | `768 B` | **Palette RAM**: `256 × 3` RGB bytes (`0..255` per channel). |
| `0x0FFD00 .. 0x0FFDFF` | `256 B` | **VM Status & Telemetry Page**: `'SPOS'` ready flag (`+0x00`), frame counter (`+0x04`), mouse X/Y/btn (`+0x08..0x10`), window count (`+0x14`), active app (`+0x18`), machine ID (`+0x1C`), VM instruction count (`+0x20`), exit code (`+0x28`), active title color (`+0x78`). |
| `0x100000 .. 0x16FFFF` | `448 KB` | **Unified Local Frame & Evaluation Stack (`VM_FP` / `VM_SP`)**. |
| `0x170000 .. 0x17FFFF` | `64 KB` | **Call Return Stack (`VM_CSP`)**: Stores `(saved_PC, saved_FP)` pairs (`8` bytes per frame). |
| `0x200000 .. 0x367FFF` | `1.44 MB` | **Mounted `spiralos.img`**: Sectors `0..2879` (with `SpiralFS` at `0x218000`). |

---

## 3. VM Registers & Zero-Copy Calling Convention

The VM maintains four 32-bit architectural pointers (offsets within `vmRam`):
- **`VM_PC`**: Program counter (byte offset of next instruction in `0x000000 .. 0x00CFFF`).
- **`VM_SP`**: Evaluation stack pointer (grows upward by `+4` bytes per push; top of stack is at `i32[VM_SP - 4]`).
- **`VM_FP`**: Current local activation frame pointer (`local[i]` is at `i32[VM_FP + i * 4]`).
- **`VM_CSP`**: Call return stack pointer (starts at `0x170000`, grows upward by `+8` bytes per `CALL`).

### Calling Convention (`CALL`, `ENTER`, `RET`)
1. **Caller** evaluates `k` arguments (`arg_0 .. arg_{k-1}`) onto `VM_SP`, then executes `CALL target_addr24` (`0x24`):
   - Pushes `(VM_PC, VM_FP)` onto `VM_CSP` (`i32[VM_CSP] = VM_PC; i32[VM_CSP + 4] = VM_FP; VM_CSP += 8`).
   - Sets `VM_PC = target_addr24`.
2. **Callee prologue** executes `ENTER k, total_locals` (`0x25`):
   - Sets `VM_FP = VM_SP - (k * 4)` — placing `arg_0 .. arg_{k-1}` directly in `local[0 .. k-1]` with **zero memory copies**!
   - Sets `VM_SP = VM_FP + (total_locals * 4)`, allocating all local variables and local arrays above the parameters.
3. **Callee epilogue** pushes the return value onto `VM_SP` and executes `RET` (`0x26`):
   - Pops `ret_val = i32[VM_SP - 4]`.
   - Resets `VM_SP = VM_FP`, then pushes `ret_val` (`i32[VM_SP] = ret_val; VM_SP += 4`).
   - Pops `(VM_PC, VM_FP)` from `VM_CSP` (`VM_CSP -= 8; VM_PC = i32[VM_CSP]; VM_FP = i32[VM_CSP + 4]`).
   - If `VM_PC < 0` (the boot sentinel `-1`), the VM halts with `exitCode = ret_val`.

---

## 4. Instruction Set Encoding (`38 Opcodes: 0x00 .. 0x27`)

Every instruction is a 32-bit little-endian word:
- **I-Format**: `[op : 8][a : 8][imm16 : 16]` (`imm16` signed or `uimm16` unsigned)
- **J-Format**: `[op : 8][addr24 : 24]`

| Opcode | Mnemonic | Format | Operation |
| :--- | :--- | :--- | :--- |
| `0x00` | `NOP` | `00 00 0000` | No operation |
| `0x01` | `HALT` | `01 00 0000` | `exitCode = pop(); halt()` |
| `0x02` | `PUSH_I16` | `02 00 imm16` | `push(sign_extend_16(imm16))` |
| `0x03` | `PUSH_U16` | `03 00 uimm16` | `push(zero_extend_16(uimm16))` |
| `0x04` | `PUSH_HI` | `04 00 uimm16` | `tos = (tos & 0xFFFF) \| (uimm16 << 16)` |
| `0x05` | `DUP` | `05 00 0000` | `push(tos)` |
| `0x06` | `DROP` | `06 00 0000` | `pop()` |
| `0x07` | `SWAP` | `07 00 0000` | Swap top two stack words |
| `0x08` | `GET_LOCAL` | `08 00 slot16` | `push(i32[VM_FP + slot16 * 4])` |
| `0x09` | `SET_LOCAL` | `09 00 slot16` | `i32[VM_FP + slot16 * 4] = pop()` |
| `0x0A` | `GET_GLOBAL` | `0A 00 slot16` | `push(i32[0x010000 + slot16 * 4])` |
| `0x0B` | `SET_GLOBAL` | `0B 00 slot16` | `i32[0x010000 + slot16 * 4] = pop()` |
| `0x0C` | `ADDR_LOCAL` | `0C 00 slot16` | `push(VM_FP + slot16 * 4)` |
| `0x0D` | `ADDR_GLOBAL`| `0D 00 slot16` | `push(0x010000 + slot16 * 4)` |
| `0x0E` | `LOAD8U` | `0E 00 imm16` | `addr = (pop() + imm16) & 0x3FFFFF; push(u8[addr])` |
| `0x0F` | `LOAD8S` | `0F 00 imm16` | `addr = (pop() + imm16) & 0x3FFFFF; push(i8[addr])` |
| `0x10` | `LOAD16U` | `10 00 imm16` | `addr = (pop() + imm16) & 0x3FFFFF; push(u16[addr])` |
| `0x11` | `LOAD32` | `11 00 imm16` | `addr = (pop() + imm16) & 0x3FFFFF; push(i32[addr])` |
| `0x12` | `STORE8` | `12 00 imm16` | `v = pop(); addr = (pop() + imm16) & 0x3FFFFF; u8[addr] = v & 0xFF` |
| `0x13` | `STORE16` | `13 00 imm16` | `v = pop(); addr = (pop() + imm16) & 0x3FFFFF; u16[addr] = v & 0xFFFF` |
| `0x14` | `STORE32` | `14 00 imm16` | `v = pop(); addr = (pop() + imm16) & 0x3FFFFF; i32[addr] = v` |
| `0x15` | `ADD` | `15 00 0000` | `b = pop(); a = pop(); push((a + b) \| 0)` |
| `0x16` | `SUB` | `16 00 0000` | `b = pop(); a = pop(); push((a - b) \| 0)` |
| `0x17` | `MUL` | `17 00 0000` | `b = pop(); a = pop(); push(imul(a, b))` |
| `0x18` | `DIV` | `18 00 0000` | `b = pop(); a = pop(); push(b == 0 ? 0 : (a / b) \| 0)` |
| `0x19` | `MOD` | `19 00 0000` | `b = pop(); a = pop(); push(b == 0 ? 0 : (a % b) \| 0)` |
| `0x1A` | `AND` | `1A 00 0000` | `b = pop(); a = pop(); push(a & b)` |
| `0x1B` | `OR` | `1B 00 0000` | `b = pop(); a = pop(); push(a \| b)` |
| `0x1C` | `XOR` | `1C 00 0000` | `b = pop(); a = pop(); push(a ^ b)` |
| `0x1D` | `SHL` | `1D 00 0000` | `b = pop(); a = pop(); push(a << (b & 31))` |
| `0x1E` | `SHR` | `1E 00 0000` | `b = pop(); a = pop(); push(a >>> (b & 31))` |
| `0x1F` | `SAR` | `1F 00 0000` | `b = pop(); a = pop(); push(a >> (b & 31))` |
| `0x20` | `CMP` | `20 00 subop` | `b = pop(); a = pop(); push(cmp(a, b, subop))` (`0:==`, `1:!=`, `2:<`, `3:<=`, `4:>`, `5:>=`, `6:u<`, `7:u>`) |
| `0x21` | `JMP` | `21 addr24` | `VM_PC = addr24` |
| `0x22` | `JZ` | `22 addr24` | `if (pop() == 0) VM_PC = addr24` |
| `0x23` | `JNZ` | `23 addr24` | `if (pop() != 0) VM_PC = addr24` |
| `0x24` | `CALL` | `24 addr24` | Save `(VM_PC, VM_FP)` to `VM_CSP`, `VM_PC = addr24` |
| `0x25` | `ENTER` | `25 nargs locals16`| `VM_FP = VM_SP - nargs*4; VM_SP = VM_FP + locals16*4` |
| `0x26` | `RET` | `26 00 0000` | Restore frame from `VM_CSP` and push return value |
| `0x27` | `SYSCALL` | `27 nargs sys16` | Pop `nargs` args, invoke native Core syscall `sys16`, push result |

---

## 5. System-Call Interface (`SYSCALL 0 .. 20`)

| `sys16` | Name | Signature | Native Core Behavior (TC-32 & x86) |
| :--- | :--- | :--- | :--- |
| `0` | `SYS_EXIT` | `sys(0, code)` | Halts VM and stores `code` at `vmRam[0x0FFD28]`. |
| `1` | `SYS_YIELD` | `sys(1)` | Presents `vmRam[0x0F0000]` + palette `vmRam[0x0FFA00]` to display (2× VBE `640×480×32` blit on Hummingbird; tear-free `YIELD` on TabComp). |
| `2` | `SYS_TIME_MS` | `sys(2)` | Returns elapsed virtual milliseconds. |
| `3` | `SYS_KEY_POLL` | `sys(3)` | Pops next key event `((pressed << 16) \| (vk << 8) \| ascii)`, or `0`. |
| `4` | `SYS_MOUSE_POLL` | `sys(4, out_ptr)` | Polls mouse X (`0..319`), Y (`0..199`), buttons (`0..7`), writes to `out_ptr`, returns `(btn << 20) \| (y << 10) \| x`. |
| `5` | `SYS_FILL_RECT` | `sys(5, x, y, w, h, col)` | Clipped rectangle fill in `vmRam[0x0F0000]`. |
| `6` | `SYS_DRAW_CHAR` | `sys(6, x, y, ch, fg, bg)` | Draws 8×8 glyph from `vmRam[0x0EF000]` (`bg < 0` = transparent). |
| `7` | `SYS_DRAW_STR` | `sys(7, x, y, str_ptr, fg, bg)` | Draws null-terminated string using `SYS_DRAW_CHAR`. |
| `8` | `SYS_MEMCPY` | `sys(8, dst, src, len)` | Fast byte copy inside `vmRam`. |
| `9` | `SYS_MEMSET` | `sys(9, dst, val, len)` | Fast byte fill inside `vmRam`. |
| `10` | `SYS_DISK_SYNC` | `sys(10, start_sec, count)` | Flushes 512-byte sectors from `vmRam[0x200000 + start_sec*512]` to hardware disk (8237A DMA + 82077AA FDC `WRITE DATA` on Hummingbird; VFS image sync on TabComp). |
| `11` | `SYS_REBOOT` | `sys(11)` | Triggers hardware warm reboot from the updated disk image. |
| `12` | `SYS_NET_SEND` | `sys(12, buf_ptr, len)` | Transmits raw StudioNet frame (`1..512 B`) via NIC hardware. |
| `13` | `SYS_NET_RECV` | `sys(13, buf_ptr, max_len)` | Pops next received StudioNet frame into `buf_ptr`, returns byte length or `0`. |
| `14` | `SYS_NET_INFO` | `sys(14, cmd, val)` | Queries/sets StudioNet station ID (`cmd=0/1`), TX count (`2`), RX count (`3`). |
| `15` | `SYS_SOUND_TONE` | `sys(15, freq, ms, wave)` | Plays synth tone via `SOUND_REGS` (TabComp) or PIT Ch2 Speaker `0x42/0x61` (Hummingbird). |
| `16` | `SYS_MACHINE_INFO` | `sys(16, query)` | Returns Machine ID (`1`=TabComp, `2`=Hummingbird), RAM size, or instruction counter. |
| `17` | `SYS_BLIT_RECT` | `sys(17, x, y, w, h, src)` | Blits `w × h` 8-bit pixel buffer from `vmRam[src]` to `(x, y)` in VRAM. |
| `18` | `SYS_STRCMP` | `sys(18, s1, s2)` | Returns `1` if strings at `s1` and `s2` are equal, `0` otherwise. |
| `19` | `SYS_STRLEN` | `sys(19, s)` | Returns byte length of null-terminated string at `s`. |
| `20` | `SYS_ITOA` | `sys(20, val, buf, base)` | Formats signed 32-bit `val` in base `10` or `16` into `buf`, returns length. |
