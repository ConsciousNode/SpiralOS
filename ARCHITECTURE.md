# SpiralOS 1.1 Architecture & Prior Art (`ARCHITECTURE.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT

SpiralOS 1.1 ("Real Spiral") is a complete, self-hosting graphical operating system engineered from the first byte to boot and run identically from a single **1.44 MB floppy image (`spiralos.img`)** across two radically different hardware architectures:

- **TabComp (`TC-32`)**: A 32-bit RISC fantasy workstation (`320×200` 8-bpp indexed framebuffer, word-addressed RAM, custom system call & timer traps).
- **Hummingbird (`i586`)**: A real-architecture x86 PC booting via 16-bit BIOS `INT 13h`, switching to 32-bit Protected Mode with paging, VBE `640×480` linear framebuffer (`32-bpp` and `24-bpp` fallback), 8254 PIT + 8259A PIC hardware interrupts, PS/2 controller, 82077AA FDC + 16-bit Real-Mode BIOS `INT 13h` disk write thunk, and StudioNet I/O ports (`0x500..0x518`).

---

## 1. Unified 1.44 MB Floppy Disk Map (`spiralos.img`)

A single `1,474,560`-byte (`2,880` × 512-byte sectors) disk image serves as both a standard x86 BIOS boot floppy and a TabComp bootable cartridge/disk:

| Sector Range | Byte Offset | Size | Contents |
| :--- | :--- | :--- | :--- |
| **Sector `0`** | `0x000000 .. 0x0001FF` | `512 B` | **x86 Stage 1 MBR Bootloader** (`0x7C00`, `0x55AA` signature) + TabComp boot header metadata (`0x01E0..0x01EF`). Loads Stage 2 (`Sector 1`) to `0x7E00`. |
| **Sector `1`** | `0x000200 .. 0x0003FF` | `512 B` | **x86 Stage 2 Loader (`0x7E00`) & 16-Bit Real-Mode BIOS Write Thunk (`0x7F40`)**. Scans VBE mode list (`32-bpp` / `24-bpp` fallback), reads Sectors `2..31` and `64..959` via track-safe `INT 13h` (never crossing 18-sector track boundaries, 3 retries on `CF=1`), sets up GDT & Page Tables (mapping `PhysBasePtr`), and enters 32-bit Protected Mode at `0x8000`. |
| **Sectors `2 .. 31`** | `0x000400 .. 0x007FFF` | `15 KB` | **x86 32-Bit Protected-Mode Native Core** (`7,625` bytes assembled from `/src/core_x86.asm`). Includes 8259A PIC + 8254 PIT `IRQ0` (`IDT 0x20`) preemptive scheduler, VBE `32-bpp`/`24-bpp` upscaling blitter, PS/2 keyboard & mouse driver, StudioNet driver (`0x500`), FDC + BIOS thunk persistence, and the x86 `SPIR` bytecode interpreter. |
| **Sectors `32 .. 63`** | `0x008000 .. 0x00FFFF` | `16 KB` | **TabComp `TC-32` Native Core** (`4,360` bytes / `1,090` 32-bit words assembled from `/src/core_tc32.asm`). Includes the `TC-32` `SPIR` bytecode interpreter, timer-quantum preemptive task switcher, blitter, StudioNet MMIO bridge, and disk sync. |
| **Sectors `64 .. 319`** | `0x010000 .. 0x02FFFF` | `128 KB` | **`SPIR` Portable OS Bytecode Image** (`89,800` code bytes + `3,264` string bytes). Loaded into VM memory `0x00000..0x1FFFF` on both machines. |
| **Sectors `320 .. 959`**| `0x030000 .. 0x07FFFF` | `320 KB` | **`SpiralFS` Volume** (`22` files, including all `/src/*.sp` OS & compiler sources, `/src/core_x86.asm`, `/src/core_tc32.asm`, 4 `/etc/*.thm` themes, and user files). Loaded into VM memory `0x28000..0x77FFF`. |
| **Sectors `960 .. 2879`**| `0x080000 .. 0x167FFF`| `960 KB` | Free disk sectors / scratch space. |

---

## 2. In-OS Self-Hosting Compiler (`SpiralC`, `/src/cc.sp`)

In SpiralOS 1.1, the in-OS compiler is a **complete, genuine recursive-descent compiler (`1,148` lines of Spiral in `/src/cc.sp`)** with zero pattern-patching or special-cased edits:

1. **Multi-File Preprocessor (`cc_build_combined_source`)**: Concatenates all 10 `/src/*.sp` modules (`kernel.sp`, `fs.sp`, `gui.sp`, `wm.sp`, `net.sp`, `cc.sp`, `asm.sp`, `apps1.sp`, `apps2.sp`, `os.sp` — over `165 KB` of source code) in RAM while recording a file-span table (`CC_FILE_START_LINE`, `CC_FILE_NAME_PTR`) so syntax errors report exact file names and local line numbers.
2. **Lexer & 256-Bucket Hash-Indexed Symbol Tables**: Tokenizes keywords, identifiers, string literals, character constants, hex/decimal integers, and multi-character operators (`==`, `!=`, `<=`, `>=`, `&&`, `||`, `<<`, `>>`, `+=`, `-=`). Uses a 32-bit O(1) signature (`cc_name_sig`) and 256-bucket open-addressed hash chains for constants (`340+`), globals (`480+`), functions (`183`), and deduplicated string literals (`3,264` B), compiling the entire OS inside the VM in `21.4M` VM instructions (`~1.6 s` on TabComp).
3. **Two-Pass Code Generator**:
   - **Pass 1 (`cc_pass1`)**: Parses top-level `const`, `var` (scalars and fixed-size arrays), and `fn` declarations, assigning global slots and function indices while validating syntax.
   - **Pass 2 (`cc_pass2`)**: Emits `SPIR` bytecode (`0x00..0x5F`) with precedence-climbing binary expressions (`cc_parse_bin`), short-circuit `&&`/`||`, `if`/`else`, `while` with nested `break`/`continue` backpatch stacks, `return`, `syscall(...)`, and `fn_addr(...)`, followed by call-target backpatching (`cc_patch_calls`).
4. **3-Stage Bootstrap Fixed Point**:
   - `Stage 1` (`compiler/spiralc.js` -> `SPIR`) compiles `/src/*.sp` inside the VM to produce `Stage 2`, and `Stage 2` compiles `/src/*.sp` inside the VM to produce `Stage 3`.
   - `Stage 1`, `Stage 2`, and `Stage 3` are **100% byte-identical (`131,072 / 131,072` bytes, SHA-256 `3204b8df...`)** on both TabComp and Hummingbird.

---

## 3. In-OS Native Assemblers (`/src/asm.sp`)

SpiralOS 1.1 includes two real symbolic assemblers written in Spiral (`/src/asm.sp`) that assemble `/src/core_x86.asm` and `/src/core_tc32.asm` directly inside the VM into `0xE0000`:

- **`asm_assemble_x86()`**: Two-pass symbolic x86 assembler supporting `.org`, `use16` / `use32` modes, symbolic labels, `db`/`dw`/`dd`, string literals (`"..."`), segment-override prefixes, ModR/M + SIB + displacement encoding, short/near relative jumps (`jcc`, `jmp`, `call`), and all real-mode/protected-mode instructions used by Stage 1, Stage 2, the BIOS Write Thunk, and the 32-bit PM Core (`8,649` bytes total, byte-identical to `core/core_x86.js`).
- **`asm_assemble_tc32()`**: Two-pass symbolic `TC-32` RISC assembler supporting `.org`, `.equ`, symbolic labels, 32-bit instruction packing (`op[31:24] | rd[23:20] | rs1[19:16] | rs2[15:12] | imm`), `.word`, and `.ascii` string packing (`4,360` bytes / `1,090` words total, byte-identical to `core/core_tc32.js`).

---

## 4. Preemptive Multitasking & App Tick Architecture

- **Hardware Timer Preemption**:
  - On **Hummingbird (`i586`)**, the 8254 PIT generates `IRQ0` (`INT 0x20` via remapped 8259A PIC) and the interpreter loop also enforces a deterministic instruction quantum (`4,096` VM instructions). When the quantum expires, `core_x86` saves `(VM_PC, VM_SP, VM_FP, VM_CSP)` into the active TCB slot at `0x7E000 + slot * 32`, selects the next runnable task in round-robin order (`Task 0..3`), and restores its VM registers and private stack (`0x78000`, `0x7A000`, `0x7B000`, `0x7C000`).
  - On **TabComp (`TC-32`)**, the native `TC-32` interpreter performs the exact same TCB context switch at `0x7E000` every quantum (`4,096` VM instructions), ensuring background worker threads (`Task 1`, `Task 2`) make concurrent progress while `Task 0` runs the desktop event loop.
- **Real-Time App Tick API (`app_register_tick`)**:
  - Applications register periodic callbacks via `app_register_tick(app_id, interval_ms)` (`kernel.sp`). During the desktop loop, `app_run_ticks(now)` invokes each open window's tick handler (`snake_tick()` every `180 ms`, `blocks_tick()` every `350 ms`) so **SpiralSnake** moves continuously and **SpiralBlocks** drops tetrominoes automatically while preserving manual `[Step]` controls.

---

## 5. Prior Art & Influences

1. **Inferno / Dis VM (Bell Labs)**: Inspired the split between a tiny native Core containing a bytecode interpreter + device drivers and a 100% portable OS layer above it (`SPIR`).
2. **Project Oberon (Wirth & Gutknecht)**: Inspired the compact single-language self-hosting compiler (`SpiralC`) where the entire OS, compiler, and desktop apps compile inside a few hundred kilobytes of RAM in under two seconds.
3. **UCSD p-System**: Inspired the stack-and-frame bytecode encoding (`LOAD_LOCAL`, `STORE_LOCAL`, `CALL argc, locals`) and portable disk image layout shared across incompatible CPU families.
4. **KolibriOS**: Inspired the speed, density, and immediate-response aesthetic of packing a full GUI desktop, 14+ built-in applications, theme engine, network stack, and assemblers onto a single 1.44 MB floppy disk.
5. **Smalltalk-80**: Inspired the live inspectability of the system—editing window manager or compiler source inside SpiralEdit, recompiling in-place, and rebooting into the modified image.
