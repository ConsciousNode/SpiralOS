# SpiralOS 1.0 — One OS Image for Two Completely Different Machines

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT  
**Rules:** Xinu-style from-scratch architecture. Zero external dependencies, fully offline, no external assets, fonts, CDNs, or network calls.

---

> **1.2 (2026-11-11):** bare-metal bring-up patch, audited ([`AUDIT-1.2.md`](AUDIT-1.2.md)). Shell and app text stay inside their windows. The PS/2 mouse init does the full 8042 handshake with timeouts. The framebuffer pitch comes from VBE. Every bring-up test fails on 1.1 and passes on 1.2, including against emulated slow controllers, mice that need a reset, and padded scanlines.

## 1. Overview

**SpiralOS** is a complete, graphical, self-hosting desktop operating system designed from the first byte to boot and run unchanged from a **single unified 1.44 MB disk image (`spiralos.img`, `1,474,560` bytes)** on two completely different hardware platforms:

1. **TabComp™ 1.3 (`TC-32`)**: Our 32-bit RISC fantasy workstation (`16 MiB` RAM, `320×200` 8-bit indexed VRAM at `0x0F0000`, 256-color RGB palette at `0x0FFA00`, 4-channel synth at `0x0FFD20`, and StudioNet MMIO at `0x0FFD40`).
2. **Hummingbird™ 1.1 (`i586`)**: Our real-architecture Intel Pentium (i586) PC emulator (`16–64 MiB` RAM, BIOS boot from Sector 0 at `0x7C00`, 32-bit Protected Mode with 4 MB PSE paging, VBE 3.0 Linear Framebuffer at `0xE0000000`, 8042 PS/2 keyboard & mouse, 8254 PIT, dual 8259A PIC, 8237A DMA + 82077AA FDC floppy controller, and StudioNet NIC on I/O ports `0x02A0..0x02AF` + `IRQ 10`).

---

## 2. Repository Structure & Deliverables

| File / Path | Description | Size |
| :--- | :--- | :--- |
| `index.html` | **Spiral Build Station** — Single-file IDE, compiler, dual live emulators (TabComp + Hummingbird connected via StudioNet), one-click 1.44 MB floppy `.img` & TabComp cartridge `.html` exporter, and automated §3 self-hosting demo | `718,846 B` |
| `tabcomp.html` | Patched single-file **TabComp 1.3** adding `StudioNetNIC` (`0x0FFD40`), mouse MMIO (`0x0FFD08`), and SpiralOS disk boot hooks (`19/19` self-tests passing) | `1,428,476 B` |
| `hummingbird.html` | Patched single-file **Hummingbird 1.1** adding `StudioNetNIC` (`0x02A0..0x02AF`, `IRQ 10`) and SpiralOS boot milestone tracking | `438,289 B` |
| `spiralos.img` | Unified **1.44 MB Bootable SpiralOS Floppy / Disk Image** (`2,880` sectors × `512 B`) that boots unchanged in both Hummingbird and TabComp | `1,474,560 B` |
| `core/core_tc32.js` | Native **TabComp TC-32 Core** machine-code generator (`900` words) | `3,600 B` (binary) |
| `core/core_x86.js` | Native **Hummingbird x86 Core** generator (`512 B` 16-bit Real Mode BIOS bootloader + `6,314 B` 32-bit Protected Mode kernel & VM interpreter) | `6,826 B` (binary) |
| `core/x86_asm.js` | Symbolic 16/32-bit x86 machine-code assembler helper | `6,620 B` |
| `compiler/spiralc.js` | Stage 0 **SpiralC** compiler (`.sp` → `SPIR` portable VM bytecode) | `19,140 B` |
| `compiler/spiralfs.js` | **SpiralFS** block filesystem formatter, reader, and writer (`Sectors 192..703`) | `4,812 B` |
| `os/*.sp` | Complete SpiralOS kernel, SpiralFS driver, StudioNet stack, Theme Engine, Window Manager, Self-Hosting Compiler, and 14 Desktop Applications in Spiral Language | `37,420 B` |
| `themes/*.thm` | 4 plain-text editable desktop themes (`spiral.thm`, `amber.thm`, `oberon.thm`, `jade.thm`) | `1,120 B` |
| `tools/build.js` | Command-line build script producing `spiralos.img` from source | `4,650 B` |
| `tests/*.js` | Headless Node.js verification suites (`vm.js`, `boot.js`, `selfhost.js`, `apps.js`, `net.js`, `determinism.js`) | `6 suites` |
| `screenshots/*.png` | Real renderer PNG screenshots captured during headless test runs | `6 PNGs` |

---

## 3. Quick Start (CLI & Browser)

### Build the Unified Image from Source
```bash
node tools/build.js
```

### Run All Headless Node.js Verification Suites
```bash
node tests/vm.js           # Spiral VM Conformance (TC-32 Core vs x86 Core)
node tests/boot.js         # Dual-machine boot, milestone audit & PNG screenshots
node tests/selfhost.js     # Full §3 self-hosting edit -> compile -> rebuild -> reboot loop
node tests/apps.js         # Scripted input verification across all desktop applications
node tests/net.js          # TabComp <-> Hummingbird StudioNet Chat, SSP File Beam & Web
node tests/determinism.js  # Bit-identical determinism & TabComp 19/19 regression suite
```

### Open in Browser
- Open **`index.html`** ("Spiral Build Station") to run both machines side-by-side connected via StudioNet, edit `/src/*.sp` or `/themes/*.thm` live, run the one-click §3 Self-Hosting Demo, or export `spiralos.img` and standalone TabComp cartridges.
- Or open **`hummingbird.html`** and **`tabcomp.html`** in two separate browser tabs, load `spiralos.img` into each, and chat or beam files between tabs over `BroadcastChannel("studionet-v1")`.
