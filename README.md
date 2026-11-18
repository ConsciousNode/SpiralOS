# SpiralOS 1.5 — One OS Image for Three Completely Different Machines

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT  
**Rules:** Xinu-style from-scratch architecture. Zero external dependencies, fully offline, no external assets, fonts, CDNs, or network calls.

---

> **1.5 "Make It Real" (2026-11-16):** keyboard control throughout (launcher, window manager, every app), right-click menus, a shared clipboard, scrollbars, a much bigger shell (history, Tab completion, `cp`/`mv`/`rm`/`mkdir`), a real-time clock locked to the 100 Hz PIT, and a clean `shutdown` that saves your work. The whole OS still fits the 128 KB SPIR box, with 536 bytes to spare. Audited ([`audit/kehai-1.5/AUDIT.md`](audit/kehai-1.5/AUDIT.md)): the rebuild is byte-identical, all 15 suites pass, and a 360-program differential compiler fuzz found 0 disagreements. The delivery is kept as sent in [`delivery-1.5/`](delivery-1.5/).
>
> **1.5 on Kham's Toshiba (2026-11-16, [`audit/realhw/TEST6.md`](audit/realhw/TEST6.md)):** it boots, and nearly everything tried works: new folders and files, scrolling, the launcher. Two bugs are open. Space in Notes opens the Open dialog (root cause found: Notes registers its toolbar buttons before its text area). `shutdown` restarts the OS instead of halting (root cause not found yet). The build banner and a few version strings inside the image still say 1.4 or 1.2; the image itself is 1.5.
>
> **1.4 "Daily Driver" (2026-11-14):** Notes, Clock, Solitaire and About join the launcher, SpiralFS grows to 768 KB (sectors 320–1919), and StudioNet moves to 1.0 naming. Fresh-boot saves are checked on TabComp, Hummingbird and Triton by typing through the real UI. Audited ([`AUDIT-1.4.md`](AUDIT-1.4.md)): the follow-up delivery passes every suite, and the audit found the Solitaire solver's WINNABLE/UNWINNABLE verdicts are heuristic, not sound.
>
> **1.3 Triton Core (2026-11-13):** SpiralOS now runs on a third machine, the balanced-ternary **Triton 3.1**. Open [`triton/spiralos-triton.html`](triton/spiralos-triton.html) and it boots the image embedded in the page. The 1.3 image was the 1.2.1 image plus one new record, the Triton Core, in sectors 960–994. Sectors 0–959 are byte-identical to 1.2.1, so on x86 (Hummingbird, real hardware) and TabComp, 1.3 behaves exactly like 1.2.1. Audited ([`AUDIT-TRITON-CORE.md`](AUDIT-TRITON-CORE.md)): an ALU oracle of 39,444 vectors run through the disk had 0 mismatches, and it boots in real Chrome. At 1.3 the root `spiralos.img` and the Build Station were still 1.2.1. Since 1.4, `node tools/build.js` puts the Triton Core into the root image itself.
>
> **1.2.1 (2026-11-12):** PS/2 mouse fixes from the first Toshiba test: packet sync, 9-bit deltas, overflow drop, and 8042 timeouts sized for real hardware. Version strings now say 1.2/1.2.1. See [`CHANGES-1.2.1.md`](CHANGES-1.2.1.md).
>
> **On real hardware (2026-11-12):** 1.2.1 boots from a USB stick on Kham's Core 2 Duo–era Toshiba laptop in Legacy BIOS mode. Display, keyboard and the internal trackpad all work, and Paint paints. A USB mouse (through the BIOS's legacy PS/2 emulation) is still erratic. Paint has no save, Files `[+New]` writes a fixed demo file, and there's no general text editor yet: those are next. An idle soak of about two hours ran without a hang, and with USB first in the boot order it goes from POST to the desktop in under a minute (Kham's report).
>
> **1.2 (2026-11-11):** bare-metal bring-up patch, audited ([`AUDIT-1.2.md`](AUDIT-1.2.md)). Shell and app text stay inside their windows. The PS/2 mouse init does the full 8042 handshake with timeouts. The framebuffer pitch comes from VBE. Every bring-up test fails on 1.1 and passes on 1.2, including against emulated slow controllers, mice that need a reset, and padded scanlines.

## Acknowledgements: standing on the shoulders of KolibriOS

SpiralOS would not exist without **[KolibriOS](https://kolibrios.org)**. It's a complete graphical operating system written in x86 assembly that fits on a single 1.44 MB floppy, and it's one of Kham's biggest inspirations as a developer. KolibriOS proved, beautifully and for years, that a whole desktop OS doesn't need gigabytes. It's a masterclass at every level.

The lineage is direct. The studio built **Hummingbird** so KolibriOS could run in a browser tab, and SpiralOS learned to boot on that same machine. Thank you to the KolibriOS team and contributors, and to MenuetOS, which KolibriOS grew out of. Go try it: it's an art piece.

## 1. Overview

**SpiralOS** is a complete, graphical, self-hosting desktop operating system designed from the first byte to boot and run unchanged from a **single unified 1.44 MB disk image (`spiralos.img`, `1,474,560` bytes)** on three completely different machines:

1. **TabComp™ 1.3 (`TC-32`)**: Our 32-bit RISC fantasy workstation (`16 MiB` RAM, `320×200` 8-bit indexed VRAM at `0x0F0000`, 256-color RGB palette at `0x0FFA00`, 4-channel synth at `0x0FFD20`, and StudioNet MMIO at `0x0FFD40`).
2. **Hummingbird™ 1.1 (`i586`)**: Our real-architecture Intel Pentium (i586) PC emulator (`16–64 MiB` RAM, BIOS boot from Sector 0 at `0x7C00`, 32-bit Protected Mode with 4 MB PSE paging, VBE 3.0 Linear Framebuffer at `0xE0000000`, 8042 PS/2 keyboard & mouse, 8254 PIT, dual 8259A PIC, 8237A DMA + 82077AA FDC floppy controller, and StudioNet NIC on I/O ports `0x02A0..0x02AF` + `IRQ 10`). The same image boots from a USB stick on real x86 PCs in Legacy BIOS mode (see *On real hardware* above).
3. **Triton 3.1 (balanced ternary)**: the studio's ternary computer ([ConsciousNode/Triton](https://github.com/ConsciousNode/Triton)). A small Stage-0 boot ROM finds the Triton Core record (`'TRIT'`) at sector 960 and runs the same SPIR bytecode. The contract is in [`TRITON-CORE.md`](TRITON-CORE.md).

---

## 2. Repository Structure & Deliverables

| File / Path | Description | Size |
| :--- | :--- | :--- |
| `index.html` | **Spiral Build Station** — Single-file IDE, compiler, dual live emulators (TabComp + Hummingbird connected via StudioNet), one-click 1.44 MB floppy `.img` & TabComp cartridge `.html` exporter, and automated §3 self-hosting demo. Its labels still say 1.4; `node tools/build.js` is the reference build | `1,003,152 B` |
| `tabcomp.html` | Patched single-file **TabComp 1.3** adding `StudioNetNIC` (`0x0FFD40`), mouse MMIO (`0x0FFD08`), and SpiralOS disk boot hooks (`19/19` self-tests passing) | `1,435,167 B` |
| `hummingbird.html` | Patched single-file **Hummingbird 1.1** adding `StudioNetNIC` (`0x02A0..0x02AF`, `IRQ 10`) and SpiralOS boot milestone tracking. Upstream [Hummingbird](https://github.com/ConsciousNode/Hummingbird) 1.3 now carries the StudioNet card too, but `tests/boot.js` needs this copy's milestone tracking | `453,812 B` |
| `spiralos.img` | Unified **1.44 MB Bootable SpiralOS Floppy / Disk Image** (`2,880` sectors × `512 B`) that boots unchanged on TabComp, Hummingbird / real x86, and Triton (1.5; sha256 `51aee4b6…`) | `1,474,560 B` |
| `triton/spiralos-triton.html` | **SpiralOS on Triton 3.1**: the balanced-ternary machine page. It embeds the 1.4 image (the page was frozen for 1.5) and has Import/Export buttons for `spiralos.img` | `1,004,542 B` |
| `triton/spiralos-1.4.img` | Despite its name, a byte-identical copy of the current root `spiralos.img` (1.5): `tools/build.js` writes both | `1,474,560 B` |
| `core/core_triton.js` | Native **Triton 3.1 Core** generator (balanced-ternary guest assembly, `core_triton.asm`) | `10,836` trytes (1.5 build) |
| `core/core_tc32.js` | Native **TabComp TC-32 Core** machine-code generator (`1,601` words) | `6,404 B` (binary) |
| `core/core_x86.js` | Native **Hummingbird x86 Core** generator (`512 B` 16-bit Real Mode BIOS bootloader + 32-bit Protected Mode kernel & VM interpreter) | `11,582 B` (binary) |
| `core/x86_asm.js` | Symbolic 16/32-bit x86 machine-code assembler helper | `13,422 B` |
| `compiler/spiralc.js` | Stage 0 **SpiralC** compiler (`.sp` → `SPIR` portable VM bytecode) | `39,230 B` |
| `compiler/spiralfs.js` | **SpiralFS** block filesystem formatter, reader, and writer (`Sectors 320..1919`, 768 KB) | `7,275 B` |
| `os/*.sp` | Complete SpiralOS kernel, SpiralFS driver, StudioNet stack, Theme Engine, Window Manager, Self-Hosting Compiler, and Desktop Applications in Spiral Language (10 files). They compile into one 128 KB `SPIR` image | `272,567 B` |
| `themes/*.thm` | 4 plain-text editable desktop themes (`spiral.thm`, `amber.thm`, `oberon.thm`, `jade.thm`) | `1,075 B` |
| `tools/build.js` | Command-line build script producing `spiralos.img` (and its `triton/` copy) from source | `22,478 B` |
| `tests/*.js` | Headless Node.js verification suites plus the shared `harness.js` | `17 suites` |
| `screenshots/*.png` | Real renderer PNG screenshots captured during headless test runs and audits | `13 PNGs` |

---

## 3. Quick Start (CLI & Browser)

### Build the Unified Image from Source
```bash
node tools/build.js
```

### Run the Core Headless Node.js Verification Suites
```bash
node tests/vm.js           # Spiral VM Conformance (TC-32 Core vs x86 Core)
node tests/boot.js         # Dual-machine boot, milestone audit & PNG screenshots
node tests/selfhost.js     # Full §3 self-hosting edit -> compile -> rebuild -> reboot loop
node tests/apps.js         # Scripted input verification across all desktop applications
node tests/net.js          # TabComp <-> Hummingbird StudioNet Chat, SSP File Beam & Web
node tests/determinism.js  # Bit-identical determinism & TabComp 19/19 regression suite
node tests/spiralos-15.js  # The 1.5 feature suite, with positive controls
```

The full set run in the 1.5 audit (15 suites, logs included) is listed in [`audit/kehai-1.5/AUDIT.md`](audit/kehai-1.5/AUDIT.md).

### Open in Browser
- Open **`index.html`** ("Spiral Build Station") to run both machines side-by-side connected via StudioNet, edit `/src/*.sp` or `/themes/*.thm` live, run the one-click §3 Self-Hosting Demo, or export `spiralos.img` and standalone TabComp cartridges.
- Or open **`hummingbird.html`** and **`tabcomp.html`** in two separate browser tabs, load `spiralos.img` into each, and chat or beam files between tabs over `BroadcastChannel("studionet-v1")`.
- Or open **`triton/spiralos-triton.html`** to boot SpiralOS on the balanced-ternary Triton 3.1.
