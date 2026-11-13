# SpiralOS 1.2 Architecture & Prior Art (`ARCHITECTURE.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT
*Note: All sizes and SHA-256 hashes in this document are generated programmatically by `node tools/report-figures.js`.*

SpiralOS 1.2 is a self-hosting graphical operating system engineered to boot and run identically from a single **1.44 MB floppy image (`spiralos.img`)** across two hardware architectures:

- **TabComp (`TC-32`)**: A 32-bit RISC fantasy workstation (`320×200` 8-bpp indexed framebuffer, word-addressed RAM, custom system call & timer traps).
- **Hummingbird (`i586`)**: A real-architecture x86 PC booting via 16-bit BIOS `INT 13h`, switching to 32-bit Protected Mode with paging, VBE `640×480` linear framebuffer (`32-bpp` and `24-bpp` fallback using dynamic VBE `BytesPerScanLine`), 8254 PIT + 8259A PIC hardware interrupts, full-handshake 8042 PS/2 keyboard & mouse controller, 82077AA FDC + 16-bit Real-Mode BIOS `INT 13h` disk write thunk, and StudioNet I/O ports (`0x02A0..0x02AF`).

---

## 1. Unified 1.44 MB Floppy Disk Map (`spiralos.img`)

A single `1,474,560`-byte (`2,880` × 512-byte sectors) disk image serves as both a standard x86 BIOS boot image and a TabComp bootable cartridge/disk:

| Sector Range | Byte Offset | Size | Contents |
| :--- | :--- | :--- | :--- |
| **Sector `0`** | `0x000000 .. 0x0001FF` | `512 B` | **x86 Stage 1 MBR Bootloader** (`0x7C00`, `0x55AA` signature). Loads Stage 2 (`Sector 1`) to `0x7E00`. |
| **Sector `1`** | `0x000200 .. 0x0003FF` | `512 B` | **x86 Stage 2 Loader (`0x7E00`) & 16-Bit Real-Mode BIOS Write Thunk (`0x7F40`)**. Scans VBE mode list (`32-bpp` / `24-bpp` fallback), queries `BytesPerScanLine` (`[0x5010]`) and `PhysBasePtr` (`[0x5028]`), reads Sectors `2..31` and `64..959` via track-safe `INT 13h`, sets up GDT & Page Tables, and enters 32-bit Protected Mode at `0x8000`. |
| **Sectors `2 .. 31`** | `0x000400 .. 0x003FFF` | `15 KB` | **x86 32-Bit Protected-Mode Native Core** (`8,159` bytes, total x86 core `9,183` bytes assembled from `/src/core_x86.asm`, SHA-256 `59b52d8905135433eadc634b6db1ecc2...`). Includes 8042 PS/2 handshake & polling, dynamic-pitch VBE `32-bpp`/`24-bpp` blitters, 8259A PIC + 8254 PIT `IRQ0` (`IDT 0x20`) preemptive scheduler, StudioNet driver, FDC + BIOS thunk persistence, and the x86 `SPIR` bytecode interpreter. |
| **Sectors `32 .. 63`** | `0x004000 .. 0x007FFF` | `16 KB` | **TabComp `TC-32` Native Core** (`4,360` bytes / `1,090` 32-bit words assembled from `/src/core_tc32.asm`, SHA-256 `5442fe3b7c9a46ad04a788610401c440...`). |
| **Sectors `64 .. 319`** | `0x008000 .. 0x027FFF` | `128 KB` | **`SPIR` Portable OS Bytecode Image** (`95,796` code bytes + `3,351` string bytes, `187` functions, `539` global words, SHA-256 `7fded06d819a3945e036bf2e0131f3c74a9e7d017faa6192b84488ca75ed7496`). Loaded into VM memory `0x00000..0x1FFFF` on both machines. |
| **Sectors `320 .. 959`**| `0x028000 .. 0x077FFF` | `320 KB` | **`SpiralFS` Volume** (`22` files, `274,432` bytes allocated, `53,248` bytes free). Loaded into VM memory `0x228000..0x277FFF`. |
| **Sectors `960 .. 1023`**| `0x078000 .. 0x07FFFF`| `32 KB` | **Triton 3.1 Balanced-Ternary Native Core (1.3)** (`17,732` bytes active in Sectors `960..994`, `'TRIT'` magic `0x54495254` + `8,858` 16-bit biased trytes assembled from `core/core_triton.js`, SHA-256 `c649fe0396a1f334be511766a8810727...`). Loaded by the 96-tryte Triton Stage-0 Boot ROM. |
| **Sectors `1024 .. 2879`**| `0x080000 .. 0x167FFF`| `928 KB` | Free disk sectors / scratch space. |

---

## 2. In-OS Self-Hosting Compiler (`SpiralC`, `/src/cc.sp`)

1. **Multi-File Preprocessor**: Expands all 10 `/src/*.sp` modules (`150,939` bytes of combined source) in RAM while tracking file-span line numbers for diagnostics.
2. **Two-Pass Code Generator**: Parses constants, global scalars/arrays (`539` words), and functions (`187`), and emits `95,796` bytes of `SPIR` bytecode plus `3,351` bytes of pooled string literals.
3. **3-Stage Bootstrap Fixed Point**:
   - `Stage 1` (`compiler/spiralc.js` -> `SPIR`) compiles `/src/*.sp` inside the VM to produce `Stage 2`, and `Stage 2` compiles `/src/*.sp` inside the VM to produce `Stage 3`.
   - `Stage 1`, `Stage 2`, and `Stage 3` are **100% byte-identical (`131,072 / 131,072` bytes, SHA-256 `7fded06d819a3945e036bf2e0131f3c74a9e7d017faa6192b84488ca75ed7496`)** on both TabComp and Hummingbird.

---

## 3. In-OS Native Assemblers (`/src/asm.sp`)

- **`asm_assemble_x86()`**: Two-pass symbolic x86 assembler producing the `9,183`-byte x86 Native Core from `/src/core_x86.asm` (`35,254` B), 100% byte-identical to `core/core_x86.js`.
- **`asm_assemble_tc32()`**: Two-pass symbolic `TC-32` RISC assembler producing the `4,360`-byte (`1,090`-word) TC-32 Native Core from `/src/core_tc32.asm` (`20,780` B), 100% byte-identical to `core/core_tc32.js`.
