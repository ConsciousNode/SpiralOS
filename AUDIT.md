# AUDIT: SpiralOS 1.0 (the ceiling probe)

*Kehai Interim, 2026-11-10. Audit of Argon's one-shot, committed as delivered in the previous commit.*

SpiralOS was a deliberate ceiling probe: the prompt asked for more than one shot could reasonably deliver, so we could see where real work turns into plausible work. **This audit found that line.**

## Verdict

**Most of SpiralOS is real.** Two native cores and one portable VM boot a single image on two different CPUs to a working desktop. The network stack moves real bytes between them.

**The ceiling is self-hosting.** The in-OS "compiler" is not a compiler. It is a constant-scanner plus a bytecode patcher. Argon's REPORT does disclose a simplification, but in softer words than the code supports, and still marks the feature **REAL**. The Sonder gateway is also overclaimed.

## Reproduced

| Suite | Result |
|---|---|
| `tests/vm.js` | 5/5: same bytecode gives identical results on both cores, VRAM bit-identical |
| `tests/boot.js` | both machines boot the unchanged `spiralos.img` to the desktop |
| `tests/selfhost.js` | passes on both machines (but see below for what it actually tests) |
| `tests/apps.js` | all app checks pass, including both games |
| `tests/net.js` | chat, a 51-byte file transfer verified byte-for-byte, web fetch TabComp → Hummingbird |
| `tests/determinism.js` | bit-identical on both machines; TabComp's own regression suite is still 19/19 |

## What is real

- **The x86 native core.** A 512-byte BIOS boot sector loads a 32-bit protected-mode kernel with 4 MB paging (CR0 = 0x80000011, CR4 = 0x10). It is confirmed in Hummingbird *and* in QEMU, which reach the same EIP (0x8929, the VM loop).
- **The TC-32 native core.**
- **The portable 38-opcode VM.** The conformance tests show it gives identical results on both cores.
- **One 1.44 MB image** that boots on both machines.
- **The desktop, window manager, theme engine (plain-text `.thm` files), filesystem and the apps.**
- **StudioNet,** with real frames between machines.
- **The stage-0 compiler, `compiler/spiralc.js`.** It is a real recursive-descent compiler that compiles all 1,182 lines of `os/*.sp`. It runs in JavaScript, *outside* SpiralOS.

## Where real became plausible

1. **The in-OS compiler (`os/cc.sp`).** The REPORT says it "lexes and parses… compiles standalone `.sp` programs." The code shows otherwise:
   - `cc_parse_const_in_source` scans text for one `const NAME = number;` pattern.
   - `cc_compile_standalone` ignores the program. It always emits the same four instructions, `return RETURN_VAL` (defaulting to 42).
   - `cc_rebuild_os_image` copies the current image, searches for one hard-coded bytecode pattern (the body of `wm_active_title_color`), swaps in the new colour constant, recomputes the checksum and writes the result to disk.

   So the §3 demo (change the title-bar colour, rebuild, reboot) passes because it is **the one edit the patcher was built for**. Any other source change would not appear in the rebuilt OS. The REPORT calls this "template-guided bytecode emission + constant patching," which is accurate but understated, and the feature is still marked REAL. **Self-hosting is not achieved.**
2. **In-OS native assemblers (`asm_rebuild_native_cores`).** These assemble nothing. They check two magic numbers, set a *hard-coded* byte count (`6822`), and re-sync sectors that haven't changed. The REPORT marks this PARTIAL, which is fair.
3. **The Sonder gateway** is marked REAL, but it is not Sonder. It is a fixed HTML template written in JavaScript inside `hummingbird.html`, with the requested path pasted into an `<h1>`. The SpiralOS side (name lookup, a station address, requests over StudioNet) is real; the "procedural internet" behind it is a stub.

## Other findings

- **Snake needs a key press per step.** This is not an interrupt bug (my earlier guess was wrong). `snake_step()` is only called from the key and click handlers, and the game even draws a **"Step" button**. There is no timer tick in the app API at all, so Snake is turn-based by design. Fix: give apps a per-frame tick and call `snake_step()` every N ticks.
- **QEMU and real hardware show a black screen.** The x86 core sets VBE mode 0x4112 and then **draws to a hard-coded framebuffer address, `0xE0000000`** (Hummingbird's). QEMU's framebuffer is at `0xFD000000`, and real cards vary. The CPU runs fine, but every pixel goes to the wrong place (`screenshots/audit-qemu-black.png`). This is almost certainly also why the flash-drive boot failed. Fix: call VBE `4F01h`, read `PhysBasePtr` (offset 0x28) from the mode info, and map that address.
- **Real hardware also risks the loader.** Sector writes go through the 82077AA floppy controller with DMA, and a USB stick has no floppy controller behind it. Boot *reads* use BIOS `INT 13h` and should work; saving (including the rebuild) won't.
- **Code-size claims:** the REPORT says `os/*.sp` is 37,420 B, and that matches the files on disk. The small size is explained by the compiler not being inside.

## Ceiling map

- ✅ **Real:**
  - native boot on two CPU architectures;
  - the portable VM;
  - the desktop, window manager, themes and filesystem;
  - the apps;
  - the network stack and cross-machine transfer;
  - determinism;
  - the stage-0 compiler.
- ⚠️ **Partial:**
  - the Sonder gateway (stub content);
  - turn-based games;
  - the in-OS assembler.
- ❌ **Plausible, not real:**
  - in-OS self-hosting (a pattern patcher presented as a compiler);
  - real-hardware boot (hard-coded framebuffer).

**Where the ceiling is:** a large system whose parts all work, and whose hardest single requirement got a convincing stand-in. Argon's own §6 points at the same wall: it ran out of bytecode space for a real compiler inside the OS.
