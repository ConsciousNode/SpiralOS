# SpiralOS 1.2 — Bare-Metal Bring-Up Patch Changes (`CHANGES-1.2.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT

This document lists every fix in the SpiralOS 1.2 bare-metal bring-up patch (`F1`–`F4`), the emulator realism modes added to `hummingbird.html`, the exact file and line ranges touched (1.1 baseline vs. 1.2 patched), and the rationale for each change.

---

## 1. F1: Shell Text Soft-Wrapping, Scrolling & All-App Window Containment

### 1.1 `os/gui.sp` (1.1 lines `126–140` -> 1.2 lines `126–176`)
- **Before (1.1 `os/gui.sp:126-140`)**:
  `gui_button(x, y, w, h, label_str, active)` drew `label_str` with `hal_str(tx, ty, label_str, thm_title_text, -1)` without clipping `label_str` to the button width `w`. When taskbar buttons (`w = 72`) or narrow-resized window buttons held titles longer than 8 characters (such as `"SpiralBlocks"`), glyph pixels spilled outside the button and window bounds.
- **After (1.2 `os/gui.sp:126-176`)**:
  Added `gui_str_clip(x, y, s, max_c, fg, bg)` (draws at most `max_c` whole characters), `gui_win_str(wx, wy, ww, wh, sx, sy, s, fg, bg)` (clips any string horizontally and vertically to the window's inner client area `[wx+4 .. wx+ww-4, wy+14 .. wy+wh-3]`), updated `gui_button` to clip `label_str` to `(w - 2) / 8` characters, and added `gui_win_btn` to clamp or hide buttons when a window is resized down to minimum size (`80×50`).
- **Why**: Guarantees that button labels, status strings, and controls never draw pixels outside their owning button or window rectangle at any window size.

### 1.2 `os/wm.sp` (1.1 lines `167–169` -> 1.2 lines `167–172`)
- **Before (1.1 `os/wm.sp:167-169`)**:
  `wm_draw_window_frame` called `hal_str(x + 8, y + 4, win_title[wid], thm_title_text, -1)` with no column limit.
- **After (1.2 `os/wm.sp:167-172`)**:
  Computes `int t_cols = (w - 30) / 8;` and calls `gui_str_clip(x + 8, y + 4, win_title[wid], t_cols, thm_title_text, -1)` so the title text never overlaps the `[_]` / `[x]` buttons or overflows a narrow (`w = 80`) title bar. Lines `1..12` of `os/wm.sp` are untouched so `tests/selfhost-edits.js` Edit 5 (`line 12` syntax error check) remains intact.

### 1.3 `os/apps1.sp` (1.1 lines `15–538` -> 1.2 lines `15–659`)
- **Before**:
  - `SHELL_OUT_BUF` (`0x04B000`) held only 5 lines truncated to 46 characters (`os/apps1.sp:17, 84-96`).
  - `app_draw_shell` (`os/apps1.sp:311-322`) drew each line with `hal_str(x + 6, y + 18 + i * 10, ...)` and drew `SHELL_IN_BUF` with `hal_str(x + 22, py, SHELL_IN_BUF, ...)` with no column limit and no horizontal input scrolling.
  - `app_key_shell` (`os/apps1.sp:339`) capped input at 36 characters.
  - `app_draw_files` (`os/apps1.sp:196-213`) drew filenames (`fs_entry_ptr(fidx)`) with `hal_str` without clipping, causing 38-character filenames to overflow the 156-px window.
  - `app_draw_build`, `app_draw_paint`, `app_draw_calc`, and `app_draw_sysmon` (`os/apps1.sp:346-537`) drew fixed-width text, buttons, and `96×56` canvas blits without clipping when resized to `80×50`.
- **After**:
  - Added a 32-line × 96-byte scrollback buffer `SHELL_HIST_BUF = 0x04E000` (`os/apps1.sp:22, 87-112`) while preserving the 5-line `SHELL_OUT_BUF` mirror at `0x04B000` for backward compatibility with existing tests.
  - Rewrote `app_draw_shell` (`os/apps1.sp:351-416`) to compute `max_cols = (w - 10) / 8` and `max_rows = (h - 20) / 10` dynamically on every frame/resize, soft-wrap every line in `SHELL_HIST_BUF` into whole-character chunks of `max_cols`, scroll so the newest `max_rows - 1` wrapped rows and the bottom prompt row are always visible, and horizontally scroll `SHELL_IN_BUF` (`up to 120 chars`) so the tail of the input line and the cursor stay strictly inside `x + w - 4`.
  - Added `gui_blit_clipped` and updated `app_draw_files`, `app_draw_edit`, `app_draw_build`, `app_draw_paint`, `app_draw_calc`, and `app_draw_sysmon` to clip all filenames, text labels, buttons, and canvas blits to the window bounds.

### 1.4 `os/apps2.sp` (1.1 lines `123–530` -> 1.2 lines `123–595`)
- **Before**:
  - `app_draw_theme`, `app_draw_viewer`, `app_draw_snake`, `app_draw_blocks`, `app_draw_chat`, `app_draw_transfer`, and `app_draw_browser` drew unclipped strings, fixed playfields (`144×80`, `64×80`), and `96×56` / `96×16` blits that overflowed when given 38-char filenames, 60-char chat inputs, or `80×50` window resizes.
- **After**:
  - Clipped all text and buttons via `gui_win_str` / `gui_win_btn`, clamped `SpiralSnake` and `SpiralBlocks` playfields to `w - 8` by `h - 20`, expanded `SpiralChat` input to 96 characters with horizontal scrolling inside the input box, clipped `SpiralSend` file names, and bounded `SpiralWeb` inline images and character wrapping both horizontally (`cx + 8 <= x + w - 4`) and vertically (`ry + 8 <= y + h - 4`).

---

## 2. F2: Proper 8042 PS/2 Mouse Initialization Handshake

### 2.1 `core/core_x86.js` (1.1 lines `506–515` -> 1.2 lines `506–653`)
- **Before (1.1 `core/core_x86.js:506-515`)**:
  Wrote `0xA8` to `0x64`, `0xD4` to `0x64`, and `0xF4` to `0x60` back-to-back and executed a single `in al, 0x60` without checking status bit 1 (IBF) or status bit 0 (OBF), without touching the controller command byte (`0x20`/`0x60`), and without resetting the mouse (`0xFF`).
- **After (1.2 `core/core_x86.js:506-653`)**:
  Replaced with the full 7-step 8042 handshake:
  1. `ps2_out_64` / `ps2_out_60`: Wait up to `16,384` iterations for status bit 1 clear (`(inb(0x64) & 2) == 0`) before every write to `0x64` or `0x60`.
  2. `ps2_in_60`: Wait up to `16,384` iterations for status bit 0 set (`(inb(0x64) & 1) != 0`) before every read of `0x60`.
  3. Bounded timeout on every wait: if any wait expires or `0x64` reads `0xFF`, jump cleanly to `skip_ps2_init` so the keyboard keeps working and the OS boots without hanging.
  4. Flush up to 64 stale output bytes from `0x60` while `(inb(0x64) & 1) != 0`.
  5. Send `0xA8` (enable aux port), read controller command byte via `0x20`, set aux-enable bits (`| 0x03`) and clear aux/kbd clock-disable bits (`& 0xCF`), and write the modified command byte back via `0x60`.
  6. Reset the mouse (`0xD4, 0xFF`), verify `0xFA` (ACK) and `0xAA` (BAT self-test pass), and consume the optional mouse ID byte (`0x00`).
  7. Set defaults (`0xD4, 0xF6`), verify `0xFA` ACK, then enable data reporting (`0xD4, 0xF4`), verify `0xFA` ACK.

---

## 3. F3: Framebuffer Pitch Read Dynamically from VBE `BytesPerScanLine`

### 3.1 `core/core_x86.js` (1.1 lines `1300–1361` -> 1.2 lines `1439–1533`)
- **Before (1.1 `core/core_x86.js:1300-1361`)**:
  Hardcoded `EDI = 0xE0019000` (`40 * 2560`) and row offsets `2560`/`2564` in the 32-bpp blitter, and hardcoded `EDI = 0xE0012C00` (`40 * 1920`) and row offsets `1920..1925` in the 24-bpp blitter.
- **After (1.2 `core/core_x86.js:1439-1533`)**:
  Reads `BytesPerScanLine` (`uint16` at physical `[0x5010]` in the VBE `ModeInfoBlock` populated by Stage 2 `INT 10h AX=4F01h`), stores it at `[0x7800]`, computes the `y = 40` centering offset as `0xE0000000 + 40 * pitch` (`(pitch << 5) + (pitch << 3)`), sets `EBP = EDI + pitch` for the second scanline of each doubled row, and advances `EDI` by `2 * pitch` at the end of each source row in both the 32-bpp and 24-bpp blitters.

---

## 4. Emulator Realism Modes (`hummingbird.html`)

- **`hummingbird.html` lines `509–537`, `2298–2660`, `2834–2860`, `4071–4084`, `11615–11637`**:
  Added the 5 realism mode options and toolbar controls (all defaulting to off/0 so default behavior is byte-identical to 1.1):
  - `ps2Latency: N` (keeps status bit 1 IBF set for `N` CPU instructions after each write, drops writes that arrive while IBF is set, and delays response bytes by `N` instructions);
  - `ps2MouseNeedsReset` (aux device ignores `0xF4` until it has received `0xFF` and replied `0xFA 0xAA 0x00`);
  - `ps2AuxClockDisabledAtBoot` (controller command byte starts at `0x64` with aux clock disabled bit 5 set and aux IRQ bit 1 clear, requiring explicit `0x20`/`0x60` command byte programming);
  - `vbePitchPad: P` (`VGADisplay.getVbeModes()` reports `BytesPerScanLine = width * bytesPerPixel + P` and lays out the LFB with that pitch);
  - `noPs2Controller` (port `0x64` reads `0xFF`).

---

## 5. F4: Automated Documentation Figures (`tools/report-figures.js`, `REPORT.md`, `ARCHITECTURE.md`)

- Created `tools/report-figures.js` to programmatically build the image, run the boot and bring-up benchmarks, and write `REPORT.md` and `ARCHITECTURE.md` with zero hand-typed hashes or byte counts.
