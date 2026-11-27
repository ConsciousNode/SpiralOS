# SpiralOS 1.7.1 "Bring Your Own" — Provenance & Lifts (LIFTS.md)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT (from the bottom up, zero third-party runtime dependencies, offline).

## 1. Third-Party Story Files (MIT License)
- **`games/zork1.z3`** & **`games/ZORK-LICENSE`**: Zork I (Infocom / `historicalsource/zork1`, MIT License, Nov 2025). Retained from SpiralOS 1.6.
- **`games/zork2.z3`** (`92,524 B`, sha256 `3ae7d5558943e9721f3e4b273c8a7faec1a03a604e1ae4ee1cde472c21cb24ac`) & **`games/ZORK2-LICENSE`**: Zork II (`historicalsource/zork2`, commit `3da9661098809788a99cef00f00c865c6c204f96`, MIT License, Nov 2025). Shipped on SpiralFS at `/games/zork2.z3` and `/games/ZORK2-LICENSE`; no box art, logos, or trademarks used.
- **`games/zork3.z3`** (`87,984 B`, sha256 `b637a242865d059890184164ce8dec28554cc80901dcbf26c740b2d1ed0d4eb8`) & **`games/ZORK3-LICENSE`**: Zork III (`historicalsource/zork3`, commit `3ec9ed412b5f3cafe65d83c727d07db1fe4a86a8`, MIT License, Nov 2025). Shipped on SpiralFS at `/games/zork3.z3` and `/games/ZORK3-LICENSE`; no box art, logos, or trademarks used.
- **No third-party music shipped:** All `.mod` files used in verification are generated procedurally in `tests/mod-oracle.js`.

## 2. Clean-Room Implementations & Inline Labels (SpiralOS 1.7 / 1.7.1)
All new 1.7/1.7.1 code was written from scratch against public hardware/format specifications (Microsoft FAT32 `fatgen103`, Z-Machine Standards Document 1.1, Creative Sound Blaster 16 Hardware Programming Guide, Intel 8237A DMA Datasheet, ProTracker 2.3D MOD Format Specification):
- **`os/fat.sp`**: Clean-room FAT12/16/32 + VFAT LFN driver.
- **`os/audio.sp`**: Clean-room 8-channel 8/16-bit 22,050 Hz stereo PCM mixer & tone synthesizer.
- **`os/apps/app_tracker.sp`**: Clean-room 4-channel ProTracker MOD player.
- **`os/apps/app_zork.sp`**: Extended from SpiralOS 1.6's clean-room v3 interpreter to full v3/v4/v5/v7/v8 (1.7.1: pristine-story `@verify` checksum computed before header init / dynamic writes).
- **`tools/patch_17_hosts.py` -> Inline additions in `hummingbird.html`, `tabcomp.html`, `triton/spiralos-triton.html`**:
  - Labeled `[INLINE: SpiralOS 1.7 Disk Tray UI & Host FAT Image Builder (tools/patch_17_hosts.py)]` (1.7.1: `walkDir` `DataView` fix for `extractTrayFatFiles`)
  - Labeled `[INLINE: SpiralOS 1.7 Sound Blaster 16 + 8237 Slave DMA]` in `hummingbird.html`
  - Labeled `[INLINE: SpiralOS 1.7 TabComp PCM Audio & Disk 2]` in `tabcomp.html`
  - Labeled `[INLINE: SpiralOS 1.7 Triton Disk 2 (Ports 28-29) & PCM Audio (Ports 30-32)]` in `triton/spiralos-triton.html`
- **Independent Test Oracles (written from specifications without reading OS code):**
  - `tests/fat-oracle.js` (Jaccard vs `os/fat.sp`: `0.100`)
  - `tests/audio-oracle.js` (Jaccard vs `os/audio.sp`: `0.142`)
  - `tests/mod-oracle.js` (Jaccard vs `os/apps/app_tracker.sp`: `0.096`)
  - `tests/zmachine-oracle.js` (Jaccard vs `os/apps/app_zork.sp`: `0.059`)
  - `tests/zmachine-asm.js` (clean-room Z-Machine v4/v5/v7/v8 assembler; 1.7.1: added post-mutation `@verify` test case)

## 3. Host Page Diffs Summary (1.6.1 -> 1.7.1)
- **`index.html`**: Fixed unescaped quotes in `/docs/README.txt`, updated embedded 1.7.1 sources and version strings via `tools/build_station.py`.
- **`hummingbird.html`**: Added 8237 slave 16-bit DMA (`0xC0..0xDF`, page `0x89..0x8B`), Sound Blaster 16 (`0x224..0x22F`, IRQ 5, `pcmCapture`), Disk 2 (`disk2Image`, `INT 13h` `AH=41h/42h/43h/48h` on drive `0x81`), and Disk Tray UI (`window.spiralDiskTray`, 1.7.1 `walkDir` fix).
- **`tabcomp.html`**: Added Disk 2 (`loadDisk2Image`/`ejectDisk2Image`, syscalls `37..39`), PCM audio (`TabCompSound`, syscalls `40..41`, `pcmCapture`), fixed `case 36` reboot copy to `2880*512`, and added Disk Tray UI (`window.spiralDiskTray`, 1.7.1 `walkDir` fix).
- **`triton/spiralos-triton.html`**: Added Disk 2 Unit 1 (`Ports 28..29` + `17..20`) and PCM audio (`Ports 30..32`, `pcmCapture`) in both `TritonCPU` and `TritonWASM` (WAT + JS host triggers), plus Disk Tray UI (`window.spiralDiskTray`, 1.7.1 `walkDir` fix).
