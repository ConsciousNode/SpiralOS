# SpiralOS Architecture Specification (`ARCHITECTURE.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT

---

## 1. Design Philosophy & Prior Art

SpiralOS solves a classic systems challenge: **how can a single, bit-identical operating system image boot, render a responsive graphical desktop, communicate over a network, and rebuild itself from source on two radically different CPU architectures (`TC-32` RISC and `i586` CISC)?**

We drew directly on five historical systems and documented exactly what we took from each:

1. **Inferno / Dis VM (Bell Labs, 1995)**:
   - *What we took*: Strict separation between a small per-machine native platform layer (the **Spiral Core**, analogous to Inferno's native `emu`/kernel) and a portable, deterministic virtual machine (`SpiralVM`) above which 100% of OS services, windowing, networking, and user applications run as portable bytecode.
2. **UCSD p-System (1977) & Smalltalk-80 (Xerox PARC, 1980)**:
   - *What we took*: A unified, portable **bootable disk volume layout (`spiralos.img`)** containing native bootstrap tracks followed by a portable bytecode image (`SPIR`) and a contiguous block-allocated filesystem (`SpiralFS`), plus a zero-copy activation-frame calling convention (`CALL`/`ENTER`/`RET`).
3. **Project Oberon (ETH Zürich, Wirth & Gutknecht, 1989)**:
   - *What we took*: Single-address-space modular simplicity (`import "/src/...";`), fast in-memory compilation (`SpiralC`), tiled/overlapping reactive event loop structure, and an alternate-history 1990s workstation aesthetic (honored directly in our `/themes/oberon.thm` "ETH Ceres Paper 1990" theme).
4. **KolibriOS / MenuetOS**:
   - *What we took*: High-density, fast integer system-call ABI for immediate-mode window drawing, rectangle fills, bitmap text rendering, mouse/keyboard polling, and packing a complete graphical desktop + 14 applications + compiler into a single 1.44 MB floppy image.
5. **Xinu (Comer, 1984)**:
   - *What we took*: Transparent, layered design where every subsystem (process table, IPC, filesystem, network stack, window manager, compiler) is small enough to read and audit end-to-end with zero black boxes.

---

## 2. Unified Disk Image Layout (`spiralos.img` — 1.44 MB / 2,880 Sectors)

The exact same `1,474,560`-byte image boots unchanged on both Hummingbird (as a 1.44 MB 3.5" floppy) and TabComp (as a mounted disk/cartridge):

| Sector Range | Byte Offset | Size | Contents |
| :--- | :--- | :--- | :--- |
| **Sector 0** | `0x00000 .. 0x001FF` | `512 B` | **Hummingbird x86 16-Bit Real-Mode BIOS Bootloader** (`0x7C00`, FAT12 BPB, `INT 10h` VBE `0x4112` mode set, `INT 13h` loader, A20 gate, GDT, 4 MB PSE Page Directory setup, `CR0.PE \| CR0.PG` switch) |
| **Sectors 1..31** | `0x00200 .. 0x03FFF` | `15.5 KB` | **Hummingbird x86 32-Bit Protected-Mode Core** (`0x00008000`: PS/2 keyboard & mouse driver, VBE 2× LFB blitter, 8237A DMA + 82077AA FDC sector write-back driver, StudioNet driver, PIT speaker, and native x86 SpiralVM interpreter) |
| **Sectors 32..63** | `0x04000 .. 0x07FFF` | `16 KB` | **TabComp Native Core (`TC-32` machine code)** (`'TC32'` header + `3,600`-byte native `TC-32` binary implementing the hardware HAL and native TC-32 SpiralVM interpreter) |
| **Sectors 64..191** | `0x08000 .. 0x17FFF` | `64 KB` | **`SPIR` Portable Boot Bytecode Image** (`32`-byte `SPIR` header + compiled SpiralVM instructions at `0x0020..0xCFFF` + string pool at `0xD000..0xFFFF`) |
| **Sectors 192..703** | `0x18000 .. 0x57FFF` | `256 KB` | **`SPFS` SpiralFS Filesystem Volume** (`64`-byte superblock + `63 × 64 B` directory table in Sectors `192..199`, file data sectors in `200..703`) |
| **Sectors 704..2879** | `0x58000 .. 0x167FFF` | `1,114 KB` | Free floppy sectors (available for additional user files and expansion) |

---

## 3. Two-Layer System Architecture

```
+-------------------------------------------------------------------------+
|                    SPIRALOS USERLAND & APPLICATIONS                     |
|  SpiralFiles | SpiralEdit | SpiralSh | SpiralBuild | SpiralPaint | Calc |
|  SpiralMon   | SpiralTheme| SpiralView| Snake & Blocks | Chat/Web/Httpd |
+-------------------------------------------------------------------------+
|                 SPIRALOS KERNEL & SERVICES (VM Bytecode)                |
|  Task Table & IPC (/src/kernel.sp) | Window Manager & GUI (/src/wm.sp)  |
|  SpiralFS Driver  (/src/fs.sp)     | StudioNet Stack SNS/SDP/SSP        |
+=========================================================================+
|                    PORTABLE SPIRAL VM ABI (38 Opcodes)                  |
|            4 MiB Unified Virtual Address Space (vmRam[0..4MB])          |
+=========================================================================+
|     TABCOMP NATIVE CORE (TC-32)    |   HUMMINGBIRD NATIVE CORE (i586)   |
|  - 3,600 B native TC-32 binary     |  - 512 B Real-Mode BIOS Bootloader |
|  - 320x200x8 VRAM (0x0F0000)       |  - 6,314 B 32-bit PMode Kernel+VM  |
|  - Mouse MMIO (0x0FFD08)           |  - 4MB PSE Paging + VBE LFB 2x Blit|
|  - StudioNet MMIO (0x0FFD40)       |  - 8042 PS/2 + 8237 DMA + 82077 FDC|
|  - TabCompFS VFS Sector Sync       |  - StudioNet Ports 0x02A0..0x02AF  |
+------------------------------------+------------------------------------+
```

---

## 4. Boot Sequence on Each Machine

### 4.1 Hummingbird (`i586` PC)
1. **BIOS Bootstrap (`INT 19h`)**: Loads Sector 0 of `spiralos.img` to `0000:7C00` in 16-bit Real Mode.
2. **Real-Mode Loader (`0x7C00`)**:
   - Prints boot indicator via `INT 10h AH=0Eh` (Milestone 1: `boot_sector`).
   - Writes the SpiralOS boot banner to VGA text memory `0xB8000` and polls `INT 16h` (Milestone 2: `boot_menu`).
   - Loads Sectors `1..31` (32-bit x86 Core) to physical `0x00008000` and Sectors `0..703` (`352 KB` active disk image) to conventional RAM `0x00010000..0x00067FFF` via `INT 13h AH=02h`.
   - Switches display to VBE 3.0 Mode `0x4112` (`640×480×32` LFB at `0xE0000000`) via `INT 10h AX=4F02h`.
   - Enables the A20 line (`Port 0x92`), builds a 4 MB PSE Page Directory at `0x00006000` (identity-mapping `0x00000000..0x03FFFFFF` and `0xE0000000..0xE07FFFFF`), enables `CR4.PSE` and `CR0.PE | CR0.PG` (Milestone 3: `protected_mode_paging`), and far-jumps to `0x0008:0x00008000`.
3. **32-Bit Protected-Mode Core (`0x00008000`)**:
   - Initializes 32-bit flat segments (`0x10`), enables the 8042 PS/2 auxiliary mouse (`0xA8`, `0xD4 0xF4`), copies the `352 KB` disk image from `0x00010000` to `0x00400000` (`vmRam[0x200000]`), copies the `64 KB` `SPIR` bytecode from `0x00408000` to `0x00200000` (`vmRam[0x000000]`), initializes the 8×8 font and 256-color palette, and starts the native x86 SpiralVM interpreter loop.

### 4.2 TabComp (`TC-32` Workstation)
1. **Image Mount**: `bootSpiralDiskImage` extracts the `3,600`-byte native `TC-32` Core from Sectors `32..63` (`0x04008`) into `0x000000`, mounts `spiralos.img` at `0x00400000` (`vmRam[0x200000]`), and copies the `64 KB` `SPIR` bytecode to `0x00200000` (`vmRam[0x000000]`).
2. **TC-32 Core Init**: Copies the 8×8 font (`0x0EF000`) and 256-color palette (`0x0FFA00`) into `vmRam`, sets `MachineID = 1` at `vmRam[0x0FFD1C]`, and starts the native `TC-32` SpiralVM interpreter loop.
