# SpiralOS on Triton: a third native Core, in balanced ternary

Studio rules: Xinu (single-file pages, zero dependencies, offline, strict CSP). Inline everything and label every inline: code copied from attached files carries a provenance comment naming its source.

## What this is

SpiralOS runs one portable bytecode image (`SPIR`) on two machines through two native Cores: TC-32 for TabComp and i586 for Hummingbird. Build a **third Core, for the Triton 3 balanced-ternary machine**, written in Triton 3 assembly and running as Triton guest code. The **same, unmodified `SPIR` image** must then boot and run SpiralOS on Triton.

The hard part, and the point: the Spiral VM is a **32-bit, byte-addressed, two's-complement** machine. Triton is a **27-trit, tryte-addressed, balanced-ternary** machine. The Triton Core has to reproduce every 32-bit Spiral VM result bit for bit on ternary hardware.

Build the instrument. Do not predict or rank results anywhere in code, docs or UI.

## Attached

- **SpiralOS 1.2** (`spiralos/`): `VM.md` (the contract), `ARCHITECTURE.md`, `HARDWARE.md`, `STUDIONET.md`, `LANGUAGE.md`, `spiralos.img`, `core/` (the TC-32 and x86 Cores; read them as the reference for Core behavior), `compiler/`, `os/`, `tools/`, `tests/`, and `tabcomp.html` / `hummingbird.html` (the two existing machines, used by `tests/harness.js`).
- **Triton 3.1** (`triton/`): `triton3.html` (the machine), `ISA-3.md`, `AUDIT-3.1.md`, `tests/t3-common.js`.
- **Do not modify** `triton3.html`'s machine code, the `SPIR` bytecode, the two existing Cores, or the existing SpiralOS tests.

**The contract is the code, not `VM.md`.** `AUDIT-1.1.md` found that `VM.md`'s ISA table describes a VM that doesn't exist. The real Spiral VM uses **32-bit word instructions** (opcode in bits 24–31, an 8-bit `a` field and a 16-bit immediate; see `OP_*` in `compiler/spiralc.js`). The real syscall numbering, VM memory base, size and status block are whatever `core/core_tc32.js` and `core/core_x86.js` implement. The test harness, for example, reads exit codes and instruction counts at VM offsets `0x0FFD28` and `0x0FFD20`, and the VM RAM window is `0x400000` bytes. Derive the actual contract from the two reference Cores and the compiler. Where they disagree with each other, report it and leave it failing. **Write the corrected ISA, syscall and memory tables into `TRITON-CORE.md`**, and add a correction note to `VM.md` pointing there (doc changes are allowed; code changes are not).

## What to build

### C1. The Triton Core (Triton 3 assembly)

1. **Memory.** The Spiral VM byte address space, with its size and layout as the reference Cores implement them, stored **one byte per tryte** (values 0..255) in Triton RAM at a documented base. Out-of-range accesses behave exactly as the reference Cores do. Triton's default RAM (3¹⁴ = 4,782,969 trytes) may be too tight for a 4 MB window plus the Core, so configure the machine with more RAM (it supports up to 3¹⁵) and document the choice.
2. **The interpreter.** Every Spiral VM opcode the compiler emits and the reference Cores implement, with **exact 32-bit semantics**:
   - wraparound arithmetic modulo 2³²;
   - signed and unsigned compares;
   - DIV and MOD exactly as the reference Cores define them, divide by zero included;
   - AND, OR, XOR and NOT, plus shifts and arithmetic shifts, with the reference Cores' shift-count behavior;
   - little-endian 8, 16 and 32-bit loads and stores.

   Bitwise operations on a ternary machine are the real work: decompose, use tables, or both. Document the method in `TRITON-CORE.md`.
3. **The task model.** The preemptive task slots and the hardware task table exactly as the reference Cores implement them, and yield, driven by the Triton timer interrupt.
4. **Syscalls:** every syscall the reference Cores implement, with their numbering (check it against `VM.md` §5 and note any drift). In particular:
   - **Present:** scale the 320×200 8-bpp backbuffer **2×** into a centered 640×400 region of Triton's 729×486 framebuffer. Map each palette entry's RGB to the nearest of Triton's 729 colors with a documented rule, computed by the guest. Draw the border in one documented color.
   - **Time:** milliseconds derived from Triton's virtual clock, deterministic, with the conversion documented.
   - **Keyboard and mouse:** taken from Triton's keyboard and mouse queues, mouse coordinates mapped into 320×200 space.
   - **Disk sync:** `SpiralFS` sectors persist to the Triton block disk.
   - **Network:** frames go through Triton's StudioNet NIC, unchanged on the wire.
   - **Beep:** a documented no-op, or a trace event.
   - **Machine id:** returns `3` (TabComp is 1, Hummingbird is 2).
   - **Reboot.**
5. **Boot.** A Triton boot path loads the Core and the `SPIR` image from the Triton disk.

### C2. The disk image

- Produce **`spiralos.img` 1.3**: the 1.2 image with the Triton Core added in a free region (sectors `960..` are free; document the exact range in `ARCHITECTURE.md`'s disk map).
  - The x86 boot sectors, the TC-32 Core, the `SPIR` image and the `SpiralFS` volume stay **byte-identical**. A test checks their hashes against 1.2.
  - The 1.3 image still boots on TabComp and Hummingbird: the existing boot tests pass unmodified.
- Triton reads the image one byte per tryte, packed into 729-tryte sectors. Document the mapping.

### C3. The page

- `spiralos-triton.html`: the Triton 3.1 machine, embedded byte for byte and hash-pinned, plus the image. It boots SpiralOS in a browser.
- The page does only what hardware does: show the framebuffer, feed keyboard, mouse and disk, and offer disk image import/export. Plus a read-only debug panel.

## Tests

1. **VM conformance on three Cores.** Every program in the existing `tests/vm.js` runs on TC-32, x86 **and Triton**. Results, VM memory regions, the backbuffer and instruction counts must be bit-identical across all three.
2. **32-bit ALU against a BigInt oracle.** 200,000 random operand pairs, plus edge values (0, ±1, 2³¹−1, −2³¹, 0xFFFFFFFF, 0x80000000, shift counts 0..40), for every arithmetic, bitwise, shift, compare, DIV and MOD opcode. Triton Core = the reference Cores = the oracle.
3. **Memory.** Unaligned and aligned 8, 16 and 32-bit loads and stores across the whole address space, little-endian, matching the reference Cores.
4. **Boot.** The 1.3 image boots SpiralOS to the desktop on Triton. After the same scripted input timeline on Triton and Hummingbird, the **Spiral backbuffer bytes** (the 320×200 region the reference Cores use, read through the Core's documented memory mapping in the test) are identical. Triton's framebuffer equals the documented 2× palette mapping of that backbuffer, pixel for pixel.
5. **Apps and the file system.** A subset of the SpiralOS app tests (shell, editor save, file list) passes on Triton. A file written on Triton persists across a Triton reboot from the same disk.
6. **Self-hosting (stretch).** SpiralC inside SpiralOS on Triton recompiles an OS source file. The output matches the same compile on Hummingbird. If it's too slow or doesn't fit, report the measured speed and stop; don't fake it.
7. **Preemption.** Two Spiral tasks both make progress under Triton timer preemption. A task looping forever doesn't freeze the desktop.
8. **Image integrity.** The 1.2 regions of the 1.3 image are byte-identical, and the existing boot tests pass on TabComp and Hummingbird.
9. **Positive controls.** A Core build option `noWrap32` (additions don't wrap) must fail test 2. A build option that swaps two palette mapping entries must fail test 4's framebuffer check. A build option that makes one shift use count mod 64 instead of the reference behavior must fail test 2.
10. **Speed** (measured, not required): Spiral bytecode instructions per second on Triton's WASM core, boot time to desktop in virtual steps, and the ratio to the other Cores. Report the numbers; don't tune them up.
11. **Static scan** and **real browser** (Playwright or Selenium; `SKIPPED: <reason>` if neither is available, and a skip is never a pass).

## Forbidden

- **No host-side Spiral VM.** The JS host runs the Triton machine and nothing else. Every bytecode is interpreted by Triton guest code.
- **The host never reads or writes guest-private memory**, except to load the boot image, through architected DMA and devices, and in the read-only debug panel. Tests may read VM memory **only** through a documented, read-only mapping helper, used for conformance comparison, and never to steer execution.
- No branching on test programs, image hashes or scripted inputs, anywhere.
- No modification of the `SPIR` bytecode, the other Cores, the Triton machine or the attached tests.
- **If a requirement can't be met, or conflicts with another, say so in `REPORT.md` and leave it failing.** Never change accessors, harnesses or tests to make a check pass.

## Report

- `TRITON-CORE.md`: the memory mapping, the 32-bit arithmetic method, the bitwise method, the syscall mapping, the palette rule, and the disk layout.
- `REPORT.md`: tables generated by script, measured speeds, and everything not built, failing or contradictory, with the reason.
- Describe nothing as working unless a test exercises it.
