// ============================================================================
// SpiralOS 1.4 "Daily Driver" — Core Desktop Applications Part 1 (/src/apps1.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Implements:
//   - Shared Save / Open Dialog with Folder List, File List, Name Field, Save/Open,
//     Cancel, and Overwrite Confirmation Modal
//   1. File Manager (APP_FILES): New Folder, New File, Rename, Delete (with confirm),
//      Send to... (peer picker), and Inbox view
//   2. Self-Host Source Editor SpiralEdit (APP_EDIT)
//   3. Terminal & Shell SpiralSh (APP_SHELL): peers, peer, name, ping, send, get,
//      share, netstat, plus all existing commands
//   4. Self-Hosting Compiler & Build Tool SpiralBuild (APP_BUILD)
//   5. Paint Program SpiralPaint (APP_PAINT): Save & Open via Shared Dialog (.pic)
//   6. Calculator SpiralCalc (APP_CALC)
//   7. System Monitor SpiralMon (APP_SYSMON): Triton label for g_machine_id == 3
//   16. Notes Text Editor (APP_NOTES): CNSW Serif 8x16 document display, multi-line,
//       scrolling, cursor/Home/End/PgUp/PgDn, Shift selection, cut/copy/paste,
//       find, word wrap on/off, modified mark, Save/Save As/Open via Shared Dialog
//   17. Clock & Calendar (APP_CLOCK): hal_date() CMOS RTC vs MANUAL CLOCK + Set time
//       dialog, month calendar view with today highlighted
// ============================================================================

// from spiralos/os/apps1.sp:15-82
const EDIT_BUF       = 0x050000; // 36 KB editor text buffer (0x050000..0x058FFF)
const EDIT_SCRATCH   = 0x059000; // 28 KB editor splice scratch (0x059000..0x05FFFF)
const SHELL_OUT_BUF  = 0x04B000; // 5 lines of 48B shell output (legacy status mirror)
const SHELL_IN_BUF   = 0x04B200; // 128B shell input line
const PAINT_CANVAS   = 0x04C000; // 96 x 56 = 5376B paint canvas
const SHELL_HIST_BUF = 0x04E000; // 32 lines of 96B full-width shell scrollback buffer

const NOTES_BUF      = 0x1C1000; // 32 KB Notes text buffer (0x1C1000..0x1C8FFF)
const NOTES_CLIP_BUF = 0x030000; // 24 KB OS clipboard buffer (0x1C9000..0x1CEFFF)
const NOTES_FIND_BUF = 0x036000; // 64B Find query buffer
const NOTES_PATH_BUF = 0x036040; // 64B Current Notes file path
const DLG_FOLDER_BUF = 0x036080; // 32B Shared dialog current folder ("/home", "/art", "/src", "/inbox")
const DLG_NAME_BUF   = 0x0360A0; // 48B Shared dialog filename field
const DLG_FULL_BUF   = 0x0360E0; // 64B Shared dialog full path
const FM_INPUT_BUF   = 0x036120; // 48B Files new/rename input buffer
const SHELL_CWD_BUF  = 0x036160; // 48B Shell current working directory
const NOTES_UNDO_BUF = 0x02D900; // 4 KB Notes undo buffer
const EDIT_UNDO_BUF  = 0x02E900; // 4 KB Editor undo buffer
const SHELL_CMD_RING = 0x046000; // 32 entries * 96B shell command history ring
const LAUNCHER_TAB   = 0x04DC00; // Shared Launcher Layout Table (header + 18 * 16B entries)
const PC_ISOLATED_CLIP = 0;
const PC_LS_COUNT_ONLY = 0;

const APP_NOTES      = 16;
const APP_CLOCK      = 17;
const APP_SOLITAIRE  = 18;
const APP_ABOUT      = 19;

int g_fm_selected;
int g_fm_inbox_mode;
int g_fm_modal_mode; // 0: none, 1: new file, 2: new folder, 3: rename, 4: delete confirm, 5: send peer picker
int g_fm_input_len;

// Shared Save/Open Dialog state
int g_dlg_active;     // 0: closed, 1: Save, 2: Open
int g_dlg_owner_app;  // APP_PAINT or APP_NOTES
int g_dlg_folder_idx; // 0: /home, 1: /art, 2: /src, 3: /inbox
int g_dlg_file_sel;
int g_dlg_name_len;
int g_dlg_confirm_ovw; // 1 when asking overwrite confirmation

// Notes editor state
int g_notes_len;
int g_notes_cursor;
int g_notes_sel_start;
int g_notes_sel_end;
int g_notes_scroll;
int g_notes_dirty;
int g_notes_wrap;
int g_notes_find_mode;
int g_notes_find_len;
int g_notes_clip_len;

// Clock & Calendar state
int g_clk_is_manual;
int g_clk_set_mode; // 0: normal, 1: editing year/month/day/hour/min
int g_clk_field;    // 0: year, 1: month, 2: day, 3: hour, 4: min
int g_clk_base_ms;
int g_clk_year;
int g_clk_month;
int g_clk_day;
int g_clk_hour;
int g_clk_min;
int g_clk_sec;

int g_edit_file_idx;
int g_edit_len;
int g_edit_cursor;
int g_edit_scroll;
int g_edit_dirty;
int g_shell_in_len;
int g_shell_lines;
int g_shell_hist_cnt;
int g_paint_color;
int g_paint_tool;
int g_Paint_strokes;
int g_calc_acc;
int g_calc_cur;
int g_calc_op;
int g_calc_entering;
int g_fm_scroll;
int g_edit_sel_a;
int g_edit_sel_b;
int g_edit_undo_len;
int g_notes_undo_len;
int g_shell_cursor;
int g_shell_sel_a;
int g_shell_sel_b;
int g_shell_scroll;
int g_sh_cmd_cnt;
int g_sh_cmd_nav;
int g_paint_dirty;
int g_dlg_scroll;

void clip_copy_bytes(int src_ptr, int len, int from_shell) {
  if (len < 0) len = 0;
  if (len > 24000) len = 24000;
  if (PC_ISOLATED_CLIP == 1 && from_shell == 0) {
    if (len > 0) hal_memcpy(0x1CF000, src_ptr, len);
    return;
  }
  if (len > 0) hal_memcpy(NOTES_CLIP_BUF, src_ptr, len);
  w8(NOTES_CLIP_BUF + len, 0);
  g_notes_clip_len = len;
}

int clip_paste_buf(int dst_buf, int cur_len, int max_len, int cur_pos) {
  int clen = g_notes_clip_len;
  if (clen <= 0) return cur_len;
  if (cur_len + clen > max_len) clen = max_len - cur_len;
  if (clen <= 0) return cur_len;
  if (cur_pos < 0) cur_pos = 0;
  if (cur_pos > cur_len) cur_pos = cur_len;
  int tail = cur_len - cur_pos;
  if (tail > 0) {
    hal_memcpy(EDIT_SCRATCH, dst_buf + cur_pos, tail);
    hal_memcpy(dst_buf + cur_pos + clen, EDIT_SCRATCH, tail);
  }
  hal_memcpy(dst_buf + cur_pos, NOTES_CLIP_BUF, clen);
  int nlen = cur_len + clen;
  w8(dst_buf + nlen, 0);
  return nlen;
}

int sh_buf() {
  int b = SRRP_SCRATCH_BUF + 0xD00;
  hal_memset(b, 0, 384);
  return b;
}

int field_key_common(int buf, int len, int max_len, int ascii) {
  if ((ascii == 8 || ascii == 127) && len > 0) {
    len = len - 1;
    w8(buf + len, 0);
    return len;
  }
  if (ascii == 22) return clip_paste_buf(buf, len, max_len, len);
  if (ascii == 3) { clip_copy_bytes(buf, len, 0); return len; }
  if (ascii >= 32 && ascii <= 126 && len < max_len) {
    w8(buf + len, ascii);
    len = len + 1;
    w8(buf + len, 0);
  }
  return len;
}

// Shared Save / Open Dialog implementation
int dlg_folder_path(int idx) {
  if (idx == 1) return "/art";
  if (idx == 2) return "/src";
  if (idx == 3) return "/inbox";
  return "/home";
}

void dlg_open(int mode, int owner_app, int folder_idx, int default_name) {
  g_dlg_active = mode;
  g_dlg_owner_app = owner_app;
  g_dlg_folder_idx = folder_idx;
  g_dlg_file_sel = 0;
  g_dlg_confirm_ovw = 0;
  hal_memset(DLG_NAME_BUF, 0, 48);
  int nlen = hal_strlen(default_name);
  if (nlen > 30) nlen = 30;
  if (nlen > 0) hal_memcpy(DLG_NAME_BUF, default_name, nlen);
  g_dlg_name_len = nlen;
}

void dlg_build_full_path() {
  hal_memset(DLG_FULL_BUF, 0, 64);
  if (r8(DLG_NAME_BUF) == 47) {
    hal_memcpy(DLG_FULL_BUF, DLG_NAME_BUF, g_dlg_name_len);
    return;
  }
  int fp = dlg_folder_path(g_dlg_folder_idx);
  int flen = hal_strlen(fp);
  hal_memcpy(DLG_FULL_BUF, fp, flen);
  w8(DLG_FULL_BUF + flen, 47); // '/'
  hal_memcpy(DLG_FULL_BUF + flen + 1, DLG_NAME_BUF, g_dlg_name_len);
}

void dlg_commit_action() {
  dlg_build_full_path();
  if (g_dlg_active == 1) {
    // Save
    if (g_dlg_owner_app == 5) { // APP_PAINT
      fs_write(DLG_FULL_BUF, PAINT_CANVAS, 96 * 56);
    } else if (g_dlg_owner_app == APP_NOTES) {
      fs_write(DLG_FULL_BUF, NOTES_BUF, g_notes_len);
      hal_memset(NOTES_PATH_BUF, 0, 64);
      hal_memcpy(NOTES_PATH_BUF, DLG_FULL_BUF, hal_strlen(DLG_FULL_BUF));
      g_notes_dirty = 0;
    }
  } else if (g_dlg_active == 2) {
    // Open
    int fidx = fs_find(DLG_FULL_BUF);
    if (fidx >= 0) {
      int sz = fs_entry_size(fidx);
      if (g_dlg_owner_app == 5) {
        if (sz > 96 * 56) sz = 96 * 56;
        hal_memcpy(PAINT_CANVAS, fs_entry_data_ptr(fidx), sz);
      } else if (g_dlg_owner_app == APP_NOTES) {
        notes_load_file(DLG_FULL_BUF);
      }
    }
  }
  g_dlg_active = 0;
  g_dlg_confirm_ovw = 0;
}

void dlg_draw(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  if (g_dlg_active == 0) return;
  gui_bevel_rect(x + 6, y + 16, w - 12, h - 22, 18, thm_btn_hi, thm_btn_sh);
  if (g_dlg_confirm_ovw == 1) {
    wstr(12, 24, "Overwrite existing file?", 14);
    wstr(12, 36, DLG_FULL_BUF, 15);
    wbtn(16, 54, 48, 12, "Yes", 1);
    wbtn(72, 54, 48, 12, "Cancel", 0);
    return;
  }
  for (int fi = 0; fi < 4; fi++) {
    wbtn(10 + fi * 34, 19, 32, 10, dlg_folder_path(fi), g_dlg_folder_idx == fi);
  }

  // File list in selected folder
  hal_rect(x + 10, y + 31, w - 20, h - 62, 16);
  int fp = dlg_folder_path(g_dlg_folder_idx);
  int flen = hal_strlen(fp);
  int row = 0;
  for (int i = 0; i < FS_MAX_ENTRIES && row < 4; i++) {
    if (fs_entry_flags(i) != 0) {
      int ep = fs_entry_ptr(i);
      if (match_prefix(ep, fp) && r8(ep + flen) == 47) {
        if (row == g_dlg_file_sel) {
          hal_rect(x + 11, y + 32 + row * 9, w - 22, 9, thm_title_active);
        }
        gui_str_clip(x + 13, y + 33 + row * 9, ep + flen + 1, (w - 30) / 8, 15, -1);
        row = row + 1;
      }
    }
  }

  gui_draw_vscroll(w - 14, 31, h - 62, g_dlg_scroll, 4, 8);
  // Filename box + Save/Open + Cancel buttons
  hal_rect(x + 10, y + h - 29, w - 20, 10, 0);
  gui_reg_ctl(10, h - 29, w - 20, 10, 0);
  gui_str_clip(x + 12, y + h - 28, DLG_NAME_BUF, (w - 26) / 8, 14, -1);
  if (gui_caret_on()) {
    int dcx = x + 12 + g_dlg_name_len * 8;
    if (dcx + 6 < x + w - 12) hal_rect(dcx, y + h - 21, 6, 2, 14);
  }
  if (g_dlg_active == 1) {
    wbtn(10, h - 17, 44, 11, "Save", 1);
  } else {
    wbtn(10, h - 17, 44, 11, "Open", 1);
  }
  wbtn(60, h - 17, 48, 11, "Cancel", 0);
}

int dlg_click(int wid, int rx, int ry) {
  if (g_dlg_active == 0) return 0;
  int w = win_w[wid];
  int h = win_h[wid];
  if (g_dlg_confirm_ovw == 1) {
    if (ry >= 54 && ry <= 66) {
      if (rx >= 16 && rx < 64) dlg_commit_action();
      else if (rx >= 72 && rx < 120) g_dlg_confirm_ovw = 0;
    }
    return 1;
  }
  if (ry >= 19 && ry <= 29 && rx >= 10 && rx < 146) {
    g_dlg_folder_idx = (rx - 10) / 34;
    return 1;
  }
  if (ry >= 31 && ry < h - 30) {
    int clicked_row = (ry - 32) / 9;
    int fp = dlg_folder_path(g_dlg_folder_idx);
    int flen = hal_strlen(fp);
    int row = 0;
    for (int i = 0; i < FS_MAX_ENTRIES; i++) {
      if (fs_entry_flags(i) != 0) {
        int ep = fs_entry_ptr(i);
        if (match_prefix(ep, fp) && r8(ep + flen) == 47) {
          if (row == clicked_row) {
            g_dlg_file_sel = row;
            hal_memset(DLG_NAME_BUF, 0, 48);
            int nlen = hal_strlen(ep + flen + 1);
            hal_memcpy(DLG_NAME_BUF, ep + flen + 1, nlen);
            g_dlg_name_len = nlen;
            break;
          }
          row = row + 1;
        }
      }
    }
    return 1;
  }
  if (ry >= h - 17 && ry <= h - 6) {
    if (rx >= 10 && rx < 54) {
      dlg_build_full_path();
      if (g_dlg_active == 1 && fs_find(DLG_FULL_BUF) >= 0) {
        g_dlg_confirm_ovw = 1;
      } else {
        dlg_commit_action();
      }
    } else if (rx >= 60 && rx < 108) {
      g_dlg_active = 0;
      g_dlg_confirm_ovw = 0;
    }
  }
  return 1;
}

int dlg_key(int ascii, int vk) {
  if (g_dlg_active == 0) return 0;
  if (vk == 27) {
    if (g_dlg_confirm_ovw == 1) g_dlg_confirm_ovw = 0;
    else g_dlg_active = 0;
    return 1;
  }
  if (vk == 38 && g_dlg_file_sel > 0) { g_dlg_file_sel = g_dlg_file_sel - 1; return 1; }
  if (vk == 40) { g_dlg_file_sel = g_dlg_file_sel + 1; return 1; }
  if (ascii == 13) {
    if (g_dlg_confirm_ovw == 1) {
      dlg_commit_action();
      return 1;
    }
    dlg_build_full_path();
    if (g_dlg_active == 1 && fs_find(DLG_FULL_BUF) >= 0) {
      g_dlg_confirm_ovw = 1;
    } else {
      dlg_commit_action();
    }
    return 1;
  }
  g_dlg_name_len = field_key_common(DLG_NAME_BUF, g_dlg_name_len, 30, ascii);
  return 1;
}

void edit_load_file(int path_str) {
  int idx = fs_find(path_str);
  if (idx < 0) return;
  g_edit_file_idx = idx;
  int sz = fs_entry_size(idx);
  if (sz > 35000) sz = 35000;
  hal_memset(EDIT_BUF, 0, 36000);
  hal_memcpy(EDIT_BUF, fs_entry_data_ptr(idx), sz);
  g_edit_len = sz;
  g_edit_cursor = sz;
  g_edit_sel_a = sz;
  g_edit_sel_b = sz;
  g_edit_scroll = 0;
  g_edit_dirty = 0;
  g_edit_undo_len = sz;
  if (sz <= 4000) hal_memcpy(EDIT_UNDO_BUF, EDIT_BUF, sz);
}

void edit_save_current() {
  if (g_edit_file_idx < 0) return;
  int name_Buf = 0x04DE00;
  hal_memset(name_Buf, 0, 48);
  hal_memcpy(name_Buf, fs_entry_ptr(g_edit_file_idx), 39);
  fs_write(name_Buf, EDIT_BUF, g_edit_len);
  g_edit_dirty = 0;
}

void edit_set_wm_title_color(int new_col) {
  int p = 0;
  while (p + 30 < g_edit_len) {
    if (match_prefix(EDIT_BUF + p, "const WM_TITLE_COLOR_OVERRIDE = ")) {
      int val_pos = p + 32;
      int end_pos = val_pos;
      while (end_pos < g_edit_len && r8(EDIT_BUF + end_pos) != 59) {
        end_pos = end_pos + 1;
      }
      int tail_len = g_edit_len - end_pos;
      hal_memcpy(EDIT_SCRATCH, EDIT_BUF + end_pos, tail_len);
      int nlen = hal_itoa(new_col, NUM_STR_BUF, 10);
      hal_memcpy(EDIT_BUF + val_pos, NUM_STR_BUF, nlen);
      hal_memcpy(EDIT_BUF + val_pos + nlen, EDIT_SCRATCH, tail_len);
      g_edit_len = val_pos + nlen + tail_len;
      w8(EDIT_BUF + g_edit_len, 0);
      g_edit_dirty = 1;
      return;
    }
    p = p + 1;
  }
}

// from spiralos/os/apps1.sp:84-96 (modified for 1.2 F1: store full lines in SHELL_HIST_BUF)
void shell_print(int msg_str) {
  int slot = g_shell_lines;
  if (slot >= 5) {
    hal_memcpy(SHELL_OUT_BUF, SHELL_OUT_BUF + 48, 4 * 48);
    slot = 4;
  }
  int dst = SHELL_OUT_BUF + slot * 48;
  hal_memset(dst, 0, 48);
  int mlen = hal_strlen(msg_str);
  if (mlen > 46) mlen = 46;
  hal_memcpy(dst, msg_str, mlen);
  g_shell_lines = g_shell_lines + 1;

  int hslot = g_shell_hist_cnt;
  if (hslot >= 32) {
    hal_memcpy(SHELL_HIST_BUF, SHELL_HIST_BUF + 96, 31 * 96);
    hslot = 31;
  } else {
    g_shell_hist_cnt = g_shell_hist_cnt + 1;
  }
  int hdst = SHELL_HIST_BUF + hslot * 96;
  hal_memset(hdst, 0, 96);
  int hlen = hal_strlen(msg_str);
  if (hlen > 92) hlen = 92;
  hal_memcpy(hdst, msg_str, hlen);
}

// from spiralos/os/apps1.sp:98-194 (extended for StudioNet 1.0 shell commands)
void shell_resolve_path(int in_str, int out_buf) {
  while (r8(in_str) == 32) in_str = in_str + 1;
  int t_in = SRRP_SCRATCH_BUF + 0xF80;
  hal_memset(t_in, 0, 64);
  hal_memcpy(t_in, in_str, 60);
  in_str = t_in;
  hal_memset(out_buf, 0, 64);
  int ilen = hal_strlen(in_str);
  if (ilen <= 0) {
    hal_memcpy(out_buf, SHELL_CWD_BUF, hal_strlen(SHELL_CWD_BUF));
    return;
  }
  if (r8(in_str) == 47) {
    if (ilen > 60) ilen = 60;
    hal_memcpy(out_buf, in_str, ilen);
    return;
  }
  int clen = hal_strlen(SHELL_CWD_BUF);
  hal_memcpy(out_buf, SHELL_CWD_BUF, clen);
  if (clen == 0 || r8(out_buf + clen - 1) != 47) {
    w8(out_buf + clen, 47);
    clen = clen + 1;
  }
  if (clen + ilen > 60) ilen = 60 - clen;
  hal_memcpy(out_buf + clen, in_str, ilen);
  if (fs_find(out_buf) < 0) {
    int alt_buf = SRRP_SCRATCH_BUF + 0xF00;
    hal_memset(alt_buf, 0, 64);
    hal_memcpy(alt_buf, "/home/", 6);
    hal_memcpy(alt_buf + 6, in_str, ilen);
    if (fs_find(alt_buf) >= 0) hal_memcpy(out_buf, alt_buf, 64);
  }
}

void notes_load_file(int path_str) {
  int fidx = fs_find(path_str);
  if (fidx < 0) return;
  int sz = fs_entry_size(fidx);
  if (sz > 32000) sz = 32000;
  hal_memset(NOTES_BUF, 0, 32768);
  hal_memcpy(NOTES_BUF, fs_entry_data_ptr(fidx), sz);
  g_notes_len = sz;
  g_notes_cursor = sz;
  g_notes_sel_start = sz;
  g_notes_sel_end = sz;
  g_notes_scroll = 0;
  g_notes_dirty = 0;
  hal_memset(NOTES_PATH_BUF, 0, 64);
  hal_memcpy(NOTES_PATH_BUF, path_str, hal_strlen(path_str));
}

void shell_open_file(int raw_arg) {
  int fpath = SRRP_SCRATCH_BUF + 0xE80;
  shell_resolve_path(raw_arg, fpath);
  int fidx = fs_find(fpath);
  if (fidx < 0) {
    shell_print("File not found");
    return;
  }
  int plen = hal_strlen(fpath);
  if (plen >= 4 && hal_strcmp(fpath + plen - 4, ".pic")) {
    int sz = fs_entry_size(fidx);
    if (sz > 96 * 56) sz = 96 * 56;
    hal_memcpy(PAINT_CANVAS, fs_entry_data_ptr(fidx), sz);
    g_viewer_idx = 1;
    wm_open(APP_VIEWER, 64, 28, 132, 92, "SpiralView");
    shell_print("Opened in SpiralView");
    return;
  }
  if ((plen >= 3 && hal_strcmp(fpath + plen - 3, ".sp")) || (plen >= 4 && hal_strcmp(fpath + plen - 4, ".asm"))) {
    edit_load_file(fpath);
    wm_open(APP_EDIT, 28, 20, 214, 134, "SpiralEdit");
    shell_print("Opened in SpiralEdit");
    return;
  }
  if (plen >= 4 && hal_strcmp(fpath + plen - 4, ".hts")) {
    web_navigate(0, fpath, 1);
    wm_open(APP_BROWSER, 26, 22, 236, 132, "SpiralWeb");
    shell_print("Opened in SpiralWeb");
    return;
  }
  if (plen >= 4 && hal_strcmp(fpath + plen - 4, ".thm")) {
    theme_load_file(fpath);
    wm_open(APP_THEME, 56, 28, 160, 88, "SpiralTheme");
    shell_print("Opened in SpiralTheme");
    return;
  }
  notes_load_file(fpath);
  wm_open(APP_NOTES, 24, 18, 228, 140, "Notes");
  shell_print("Opened in Notes");
}

int shell_match_app_name(int s) {
  while (r8(s) == 32) s = s + 1;
  int low = sh_buf();
  for (int i = 0; r8(s + i) > 32 && i < 28; i++) {
    int c = r8(s + i);
    if (c >= 65 && c <= 90) c = c + 32;
    w8(low + i, c);
  }
  int idx = tok_find_idx(low, "files|edit|editor|shell|build|compiler|paint|calc|sysmon|mon|theme|themes|viewer|view|snake|blocks|chat|netchat|transfer|filebeam|send|browser|web|spiralweb|notes|clock|solitaire|sol|about");
  if (idx < 0) return -1;
  return r8("12234456778899:;<<===>>>@ABBC" + idx) - 48;
}

void shell_split_two_args(int s, int a1, int a2) {
  hal_memset(a1, 0, 64);
  hal_memset(a2, 0, 64);
  int p = 0;
  while (r8(s + p) == 32) p = p + 1;
  int i1 = 0;
  while (r8(s + p) != 0 && r8(s + p) != 32 && i1 < 56) {
    w8(a1 + i1, r8(s + p)); p = p + 1; i1 = i1 + 1;
  }
  while (r8(s + p) == 32) p = p + 1;
  int i2 = 0;
  while (r8(s + p) != 0 && r8(s + p) != 32 && i2 < 56) {
    w8(a2 + i2, r8(s + p)); p = p + 1; i2 = i2 + 1;
  }
}


void shell_exec_cmd(int cmd_str) {
  while (r8(cmd_str) == 32) cmd_str = cmd_str + 1;
  if (r8(cmd_str) == 0) return;

  // Record in 32-entry command history ring
  int hidx = g_sh_cmd_cnt;
  if (hidx >= 32) {
    hal_memcpy(SHELL_CMD_RING, SHELL_CMD_RING + 96, 31 * 96);
    hidx = 31;
  } else {
    g_sh_cmd_cnt = g_sh_cmd_cnt + 1;
  }
  hal_memset(SHELL_CMD_RING + hidx * 96, 0, 96);
  int clen = hal_strlen(cmd_str);
  if (clen > 92) clen = 92;
  hal_memcpy(SHELL_CMD_RING + hidx * 96, cmd_str, clen);
  g_sh_cmd_nav = g_sh_cmd_cnt;
  g_shell_scroll = 0;

  if (hal_strcmp(cmd_str, "help")) {
    shell_print("cmds: ls cat rm cp mv touch cd open run edit");
    shell_print("      make cc rebuild asm ver date time uptime");
    shell_print("      history df ps mem net peers peer name");
    shell_print("      ping send get share deals theme workers");
    shell_print("      clear reboot shutdown help");
    return;
  }
  int sb = sh_buf();
  if (hal_strcmp(cmd_str, "ver")) {
    int vp = srrp_append_str(sb, 0, os_version_str());
    vp = srrp_append_str(sb, vp, " on ");
    srrp_append_str(sb, vp, os_machine_name());
    shell_print(sb);
    return;
  }
  if (hal_strcmp(cmd_str, "peers") || hal_strcmp(cmd_str, "netstat")) {
    int sp = srrp_append_str(sb, 0, "self:");
    sp = srrp_append_str(sb, sp, SNS_DISP_BUF);
    sp = srrp_kv(sb, sp, " ok:", g_net_rx_accepted);
    srrp_kv(sb, sp, " drop:", g_net_rx_dropped);
    shell_print(sb);
    for (int pi = 0; pi < 8; pi++) {
      int pe = SNS_PEER_TAB + pi * 64;
      int pnode = r32(pe);
      if (pnode != 0) {
        sb = sh_buf();
        int pp = srrp_append_str(sb, 0, pe + 50);
        pp = srrp_kv(sb, pp, " n:", pnode);
        pp = srrp_kv(sb, pp, " k:", r32(pe + 4));
        pp = srrp_kv(sb, pp, " sv:", r32(pe + 12));
        pp = srrp_kv(sb, pp, " a:", sns_peer_extrap_age(pe));
        if (sns_peer_is_stale(pe) == 1) srrp_append_str(sb, pp, " STALE");
        shell_print(sb);
      }
    }
    return;
  }
  if (match_prefix(cmd_str, "peer ")) {
    int target = sns_resolve(cmd_str + 5);
    if (target != 0xFFFF) {
      g_sns_chosen_peer = target;
      shell_print("Selected default peer");
    } else {
      shell_print("WHO broadcast sent");
    }
    return;
  }
  if (hal_strcmp(cmd_str, "name") || match_prefix(cmd_str, "name ")) {
    if (hal_strcmp(cmd_str, "name --default")) sns_set_name("", 1);
    else if (r8(cmd_str + 4) == 32) sns_set_name(cmd_str + 5, 0);
    shell_print(SNS_DISP_BUF);
    return;
  }
  if (hal_strcmp(cmd_str, "ping") || match_prefix(cmd_str, "ping ")) {
    int ptarget = sns_resolve("peer");
    if (match_prefix(cmd_str, "ping ")) {
      ptarget = sns_resolve(cmd_str + 5);
    }
    net_send_ping(ptarget);
    int wait_t0 = hal_time();
    while (g_ping_pending == 1 && (hal_time() - wait_t0) < 600) {
      net_poll();
      if (g_ping_pending == 0) break;
      hal_yield();
    }
    if (g_ping_pending == 0 && g_ping_rtt_ms >= 0) {
      int rp = srrp_kv(sb, 0, "PONG RTT ", g_ping_rtt_ms);
      srrp_append_str(sb, rp, " ms");
      shell_print(sb);
    } else {
      g_ping_pending = 0;
      shell_print("NO REPLY");
    }
    return;
  }
  if (match_prefix(cmd_str, "send ") || match_prefix(cmd_str, "get ")) {
    int is_send = (r8(cmd_str) == 115);
    int arg1 = sb + 96;
    int arg2 = sb + 160;
    shell_split_two_args(cmd_str + 4 + is_send, arg1, arg2);
    if (is_send == 1) {
      int dst_n = sns_resolve("peer");
      if (r8(arg2) != 0) dst_n = sns_resolve(arg2);
      if (srrp_put_inbox(dst_n, arg1) == 0) shell_print("SRRP PUT /inbox sent");
      else shell_print("File not found");
    } else {
      net_http_get(sns_resolve(arg1), arg2);
      shell_print("SRRP GET requested");
    }
    return;
  }
  if (match_prefix(cmd_str, "share o")) {
    g_sns_share_on = (r8(cmd_str + 7) == 110);
    sns_send_hello(0xFFFF);
    if (g_sns_share_on == 1) shell_print("Share files (read-only): ON");
    else shell_print("Share files: OFF");
    return;
  }
  if (hal_strcmp(cmd_str, "ls") || match_prefix(cmd_str, "ls ")) {
    int cnt = fs_count();
    if (PC_LS_COUNT_ONLY == 1) {
      hal_itoa(cnt, NUM_STR_BUF, 10);
      shell_print("SpiralFS files mounted:");
      shell_print(NUM_STR_BUF);
      return;
    }
    int filter = 0;
    if (match_prefix(cmd_str, "ls ")) {
      filter = cmd_str + 3;
      while (r8(filter) == 32) filter = filter + 1;
    }
    for (int i = 0; i < cnt; i++) {
      int fidx = fs_nth_index(i);
      int ep = fs_entry_ptr(fidx);
      if (filter != 0 && r8(filter) != 0 && match_prefix(ep, filter) == 0) continue;
      sb = sh_buf();
      int lp = srrp_kv(sb, srrp_append_str(sb, 0, ep), "  ", fs_entry_size(fidx));
      srrp_append_str(sb, lp, " B");
      shell_print(sb);
    }
    return;
  }
  if (match_prefix(cmd_str, "cat ")) {
    shell_resolve_path(cmd_str + 4, sb);
    int fidx = fs_find(sb);
    if (fidx < 0) { shell_print("File not found"); return; }
    int dptr = fs_entry_data_ptr(fidx);
    int dsz = fs_entry_size(fidx);
    int p = 0;
    while (p < dsz) {
      sb = sh_buf();
      int ci = 0;
      while (p < dsz && r8(dptr + p) != 10 && ci < 80) {
        if (r8(dptr + p) >= 32) { w8(sb + ci, r8(dptr + p)); ci = ci + 1; }
        p = p + 1;
      }
      if (p < dsz && r8(dptr + p) == 10) p = p + 1;
      shell_print(sb);
    }
    return;
  }
  if (match_prefix(cmd_str, "rm ")) {
    shell_resolve_path(cmd_str + 3, sb);
    if (fs_delete(sb) == 0) shell_print("Removed file");
    else shell_print("File not found");
    return;
  }
  if (match_prefix(cmd_str, "touch ")) {
    shell_resolve_path(cmd_str + 6, sb);
    if (fs_find(sb) < 0) fs_write(sb, "", 0);
    shell_print(sb);
    return;
  }
  if (match_prefix(cmd_str, "cp ") || match_prefix(cmd_str, "mv ")) {
    int is_mv = (r8(cmd_str) == 109);
    int a1 = sb; int a2 = sb + 64; int sp1 = sb + 128; int sp2 = sb + 192;
    shell_split_two_args(cmd_str + 3, a1, a2);
    shell_resolve_path(a1, sp1);
    shell_resolve_path(a2, sp2);
    int sidx = fs_find(sp1);
    if (sidx < 0 || r8(sp2) == 0) {
      shell_print("File not found");
      return;
    }
    if (is_mv == 1) {
      int dst_existing = fs_find(sp2);
      if (dst_existing >= 0 && dst_existing != sidx) fs_delete(sp2);
      int ep = fs_entry_ptr(sidx);
      hal_memset(ep, 0, 40);
      int nlen = hal_strlen(sp2);
      if (nlen > 39) nlen = 39;
      hal_memcpy(ep, sp2, nlen);
      hal_disk_sync(320, 8);
      shell_print("Moved file");
    } else {
      fs_write(sp2, fs_entry_data_ptr(sidx), fs_entry_size(sidx));
      shell_print("Copied file");
    }
    return;
  }
  if (hal_strcmp(cmd_str, "cd") || match_prefix(cmd_str, "cd ")) {
    if (hal_strcmp(cmd_str, "cd")) {
      hal_memset(SHELL_CWD_BUF, 0, 48);
      hal_memcpy(SHELL_CWD_BUF, "/home", 5);
    } else {
      shell_resolve_path(cmd_str + 3, sb);
      hal_memset(SHELL_CWD_BUF, 0, 48);
      hal_memcpy(SHELL_CWD_BUF, sb, hal_strlen(sb));
    }
    shell_print(SHELL_CWD_BUF);
    return;
  }
  if (hal_strcmp(cmd_str, "pwd")) {
    shell_print(SHELL_CWD_BUF);
    return;
  }
  if (match_prefix(cmd_str, "open ")) {
    shell_open_file(cmd_str + 5);
    return;
  }
  if (match_prefix(cmd_str, "run ")) {
    int aid = shell_match_app_name(cmd_str + 4);
    if (aid > 0) {
      open_app_by_id(aid);
      shell_print("Launched app");
    } else {
      shell_print("Unknown app");
    }
    return;
  }
  if (hal_strcmp(cmd_str, "date") || hal_strcmp(cmd_str, "time")) {
    clock_sync_from_hal();
    if (g_clk_year == 0) {
      shell_print("CLOCK UNSET (use Clock app)");
      return;
    }
    int d_hr = g_clk_hour;
    int d_min = g_clk_min;
    int d_sec = g_clk_sec;
    if (g_clk_is_manual == 1) {
      int el_s = (hal_time() - g_clk_base_ms) / 1000;
      if (el_s < 0) el_s = 0;
      int tot = g_clk_hour * 3600 + g_clk_min * 60 + g_clk_sec + el_s;
      d_sec = tot % 60;
      d_min = (tot / 60) % 60;
      d_hr  = (tot / 3600) % 24;
    }
    int dp = 0;
    if (r8(cmd_str) == 100) {
      dp = srrp_append_int(sb, 0, g_clk_year);
      w8(sb + dp, 45);
      dp = clk_append_2d(sb, dp + 1, g_clk_month, 45);
      clk_append_2d(sb, dp, g_clk_day, 0);
    } else {
      dp = clk_append_2d(sb, 0, d_hr, 58);
      dp = clk_append_2d(sb, dp, d_min, 58);
      clk_append_2d(sb, dp, d_sec, 0);
    }
    shell_print(sb);
    return;
  }
  if (hal_strcmp(cmd_str, "uptime")) {
    int ms = hal_time();
    int up = srrp_kv(sb, 0, "Uptime: ", ms / 1000);
    up = srrp_kv(sb, up, "s (", ms);
    srrp_append_str(sb, up, " ms)");
    shell_print(sb);
    return;
  }
  if (hal_strcmp(cmd_str, "history")) {
    for (int hi = 0; hi < g_sh_cmd_cnt; hi++) {
      sb = sh_buf();
      int hp = srrp_append_str(sb, srrp_append_int(sb, 0, hi + 1), ": ");
      srrp_append_str(sb, hp, SHELL_CMD_RING + hi * 96);
      shell_print(sb);
    }
    return;
  }
  if (hal_strcmp(cmd_str, "deals")) { sol_print_deal_checks(); return; }
  if (hal_strcmp(cmd_str, "df")) {
    srrp_append_str(sb, srrp_kv(sb, 0, "SpiralFS free: ", fs_free_bytes()), " B");
    shell_print(sb);
    return;
  }
  if (match_prefix(cmd_str, "edit ")) {
    shell_resolve_path(cmd_str + 5, sb);
    edit_load_file(sb);
    wm_open(2, 28, 20, 214, 134, "SpiralEdit");
    shell_print("Opened in SpiralEdit");
    return;
  }
  if (hal_strcmp(cmd_str, "ps")) {
    hal_itoa(g_num_tasks, NUM_STR_BUF, 10);
    shell_print("Active SpiralVM tasks:");
    shell_print(NUM_STR_BUF);
    return;
  }
  if (hal_strcmp(cmd_str, "mem")) {
    shell_print("VM RAM: 4096 KB, SPIR: 128 KB");
    return;
  }
  if (hal_strcmp(cmd_str, "net")) {
    if (g_has_snet == 1) shell_print("StudioNet 1.0: SNS/SDP/SRRP online");
    else shell_print("no network (StudioNet card absent)");
    return;
  }
  if (hal_strcmp(cmd_str, "cc") || hal_strcmp(cmd_str, "rebuild") || hal_strcmp(cmd_str, "make")) {
    int rc = cc_rebuild_os_image();
    if (rc > 0) shell_print("Rebuilt SPIR OS (Sectors 64..319)");
    else shell_print(CC_ERR_MSG);
    return;
  }
  if (hal_strcmp(cmd_str, "asm")) {
    asm_rebuild_native_cores();
    shell_print("Assembled TC-32 & x86 Native Cores OK");
    return;
  }
  if (hal_strcmp(cmd_str, "workers")) {
    spawn_compute_workers(50000);
    shell_print("Spawned 2 preemptive VM compute tasks");
    return;
  }
  if (hal_strcmp(cmd_str, "theme")) {
    theme_select(g_current_theme_idx + 1);
    shell_print("Switched desktop theme");
    return;
  }
  if (hal_strcmp(cmd_str, "clear")) {
    hal_memset(SHELL_OUT_BUF, 0, 5 * 48);
    hal_memset(SHELL_HIST_BUF, 0, 32 * 96);
    g_shell_lines = 0;
    g_shell_hist_cnt = 0;
    g_shell_scroll = 0;
    return;
  }
  if (hal_strcmp(cmd_str, "lines")) {
    for (int li = 0; li < 30; li++) {
      shell_print("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH");
    }
    return;
  }
  if (hal_strcmp(cmd_str, "reboot")) {
    sns_send_bye();
    hal_reboot();
    return;
  }
  if (hal_strcmp(cmd_str, "shutdown") || hal_strcmp(cmd_str, "poweroff")) {
    os_shutdown();
    return;
  }
  shell_print("Unknown cmd (type 'help')");
}

void clock_sync_from_hal() {
  int dpack = hal_date();
  if (dpack != 0) {
    g_clk_is_manual = 0;
    g_clk_year  = r32(VMRAM_RTC + 0x00);
    g_clk_month = r32(VMRAM_RTC + 0x04);
    g_clk_day   = r32(VMRAM_RTC + 0x08);
    g_clk_hour  = r32(VMRAM_RTC + 0x0C);
    g_clk_min   = r32(VMRAM_RTC + 0x10);
    g_clk_sec   = r32(VMRAM_RTC + 0x14);
  }
}

void apps1_init() {
  hal_memcpy(SHELL_CWD_BUF, "/home", 5);
  g_caret_reset_ms = hal_time();
  g_edit_file_idx = -1;
  edit_load_file("/src/wm.sp");

  notes_load_file("/docs/README.txt");
  g_notes_cursor = 0; g_notes_sel_start = 0; g_notes_sel_end = 0;
  hal_memset(NOTES_PATH_BUF, 0, 64);
  hal_memcpy(NOTES_PATH_BUF, "/home/note.txt", 14);
  g_notes_wrap = 1;

  if (hal_date() != 0) {
    clock_sync_from_hal();
  } else {
    g_clk_is_manual = 1;
    g_clk_set_mode = 1;
  }
  g_clk_base_ms = hal_time();
  shell_print(os_version_str());

  g_paint_color = 14;
  hal_memset(PAINT_CANVAS, 16, 96 * 56);
  for (int i = 0; i < 40; i++) w8(PAINT_CANVAS + (12 + (i >> 1)) * 96 + (20 + i), 11);
  g_calc_entering = 1;
}

// from spiralos/os/apps1.sp:196-310 (extended with New Folder, New File, Rename, Delete confirm, Send to..., Inbox)
void app_draw_files(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  // Top toolbar inside Files: [All] [Inbox] [+Dir] [Ren] [Send]
  wbtn(4, 14, 26, 10, "All", g_fm_inbox_mode == 0);
  wbtn(32, 14, 34, 10, "Inbx", g_fm_inbox_mode == 1);
  wbtn(68, 14, 30, 10, "+Dir", g_fm_modal_mode == 2);
  wbtn(100, 14, 26, 10, "Ren", g_fm_modal_mode == 3);
  wbtn(128, 14, 24, 10, "Snd", g_fm_modal_mode == 5);

  if (h > 44 && w > 8) {
    hal_rect(x + 4, y + 25, w - 8, h - 43, 16);
  }
  int cnt = fs_count();
  int max_show = (h - 46) / 9;
  int name_cols = (w - 54) / 8;
  if (w < 116) {
    name_cols = (w - 16) / 8;
  }
  gui_reg_ctl(4, 25, w - 8, h - 43, 0);
  if (g_fm_selected < g_fm_scroll) g_fm_scroll = g_fm_selected;
  if (max_show > 0 && g_fm_selected >= g_fm_scroll + max_show) g_fm_scroll = g_fm_selected - max_show + 1;
  if (g_fm_scroll < 0) g_fm_scroll = 0;
  int shown = 0;
  int vis_idx = 0;
  for (int i = 0; i < cnt && shown < max_show; i++) {
    int fidx = fs_nth_index(i);
    int ep = fs_entry_ptr(fidx);
    if (g_fm_inbox_mode == 1 && match_prefix(ep, "/inbox/") == 0) continue;
    if (vis_idx >= g_fm_scroll) {
      int ry = y + 26 + shown * 9;
      if (i == g_fm_selected) {
        hal_rect(x + 5, ry - 1, w - 14, 9, thm_title_active);
      }
      if (name_cols > 0) {
        gui_str_clip(x + 8, ry, ep, name_cols, 15, -1);
      }
      if (w >= 116) {
        hal_itoa(fs_entry_size(fidx), NUM_STR_BUF, 10);
        gui_str_clip(x + w - 48, ry, NUM_STR_BUF, 5, 11, -1);
      }
      shown = shown + 1;
    }
    vis_idx = vis_idx + 1;
  }
  gui_draw_vscroll(w - 8, 25, h - 43, g_fm_scroll, max_show, cnt);
  wbtn(4, h - 16, 42, 12, "Edit", 0);
  wbtn(50, h - 16, 42, 12, "+New", 0);
  wbtn(96, h - 16, 40, 12, "Del", 0);

  if (g_fm_modal_mode != 0) {
    gui_bevel_rect(x + 8, y + 36, w - 16, 52, 18, thm_btn_hi, thm_btn_sh);
    int ml = "Send to Peer:";
    if (g_fm_modal_mode == 1) ml = "New File Path:";
    if (g_fm_modal_mode == 2) ml = "New Folder Path:";
    if (g_fm_modal_mode == 3) ml = "Rename To:";
    if (g_fm_modal_mode == 4) ml = "Confirm Delete?";
    wstr(12, 40, ml, 14);

    if (g_fm_modal_mode <= 3 || g_fm_modal_mode == 5) {
      hal_rect(x + 12, y + 52, w - 24, 11, 0);
      gui_str_clip(x + 14, y + 54, FM_INPUT_BUF, (w - 28) / 8, 15, -1);
      if (gui_caret_on()) {
        int mcx = x + 14 + g_fm_input_len * 8;
        if (mcx + 6 < x + w - 14) hal_rect(mcx, y + 61, 6, 2, 14);
      }
    }
    wbtn(12, 68, 42, 12, "OK", 1);
    wbtn(60, 68, 48, 12, "Cancel", 0);
  }
}

void fm_commit_modal() {
  int fidx = fs_nth_index(g_fm_selected);
  if (g_fm_modal_mode == 1 && g_fm_input_len > 0) {
    fs_write(FM_INPUT_BUF, "SpiralOS Note\n", 14);
  } if (g_fm_modal_mode == 2 && g_fm_input_len > 0) {
    int keep_path = sh_buf();
    hal_memcpy(keep_path, FM_INPUT_BUF, g_fm_input_len);
    hal_memcpy(keep_path + g_fm_input_len, "/.dir", 5);
    fs_write(keep_path, "", 0);
  } if (g_fm_modal_mode == 3 && g_fm_input_len > 0 && fidx >= 0) {
    int ep = fs_entry_ptr(fidx);
    hal_memset(ep, 0, 40);
    int nlen = g_fm_input_len;
    if (nlen > 39) nlen = 39;
    hal_memcpy(ep, FM_INPUT_BUF, nlen);
    hal_disk_sync(320, 8);
  } if (g_fm_modal_mode == 4 && fidx >= 0) {
    fs_delete(fs_entry_ptr(fidx));
    if (g_fm_selected > 0) g_fm_selected = g_fm_selected - 1;
  } if (g_fm_modal_mode == 5 && fidx >= 0) {
    int dst = sns_resolve("peer");
    if (g_fm_input_len > 0) dst = sns_resolve(FM_INPUT_BUF);
    srrp_put_inbox(dst, fs_entry_ptr(fidx));
  }
  g_fm_modal_mode = 0;
}

void fm_open_modal(int mode, int def_str) {
  g_fm_modal_mode = mode;
  hal_memset(FM_INPUT_BUF, 0, 48);
  int len = hal_strlen(def_str);
  hal_memcpy(FM_INPUT_BUF, def_str, len);
  g_fm_input_len = len;
}

void app_click_files(int wid, int rx, int ry) {
  int w = win_w[wid];
  int h = win_h[wid];
  if (g_fm_modal_mode != 0) {
    if (ry >= 68 && ry <= 80) {
      if (rx >= 12 && rx < 54) fm_commit_modal();
      else if (rx >= 60 && rx < 108) g_fm_modal_mode = 0;
    }
    return;
  }
  if (ry >= 14 && ry <= 24) {
    if (rx >= 4 && rx < 30) g_fm_inbox_mode = 0;
    else if (rx >= 32 && rx < 66) g_fm_inbox_mode = 1;
    else if (rx >= 68 && rx < 98) fm_open_modal(2, "/home/docs");
    else if (rx >= 100 && rx < 126 && fs_nth_index(g_fm_selected) >= 0) fm_open_modal(3, fs_entry_ptr(fs_nth_index(g_fm_selected)));
    else if (rx >= 128 && rx < 152) fm_open_modal(5, "peer");
    return;
  }
  if (ry >= 25 && ry < h - 20) {
    if (rx >= w - 12) {
      if (ry < 25 + ((h - 43) >> 1)) { if (g_fm_scroll > 0) g_fm_scroll = g_fm_scroll - 1; }
      else if (g_fm_scroll + 1 < fs_count()) g_fm_scroll = g_fm_scroll + 1;
      return;
    }
    int row = g_fm_scroll + (ry - 26) / 9;
    if (row >= 0 && row < fs_count()) g_fm_selected = row;
    return;
  }
  if (ry >= h - 16 && ry < h - 4) {
    int fidx = fs_nth_index(g_fm_selected);
    if (rx >= 4 && rx < 46 && fidx >= 0) {
      edit_load_file(fs_entry_ptr(fidx));
      wm_open(APP_EDIT, 24, 20, 216, 134, "SpiralEdit");
    } else if (rx >= 50 && rx < 92) {
      // Create default /home/note.txt immediately for compatibility AND open New File name prompt
      fs_write("/home/note.txt", "SpiralOS Note\n", 14);
      fm_open_modal(1, "/home/note.txt");
    } else if (rx >= 96 && rx < 136 && fidx >= 0) {
      g_fm_modal_mode = 4;
    }
  }
}

void app_key_files(int ascii, int vk) {
  if (g_fm_modal_mode == 0) {
    int cnt = fs_count();
    if (vk == 38 && g_fm_selected > 0) { g_fm_selected = g_fm_selected - 1; return; }
    if (vk == 40 && g_fm_selected + 1 < cnt) { g_fm_selected = g_fm_selected + 1; return; }
    if (vk == 33) { g_fm_selected = g_fm_selected - 5; if (g_fm_selected < 0) g_fm_selected = 0; return; }
    if (vk == 34) { g_fm_selected = g_fm_selected + 5; if (g_fm_selected >= cnt) g_fm_selected = cnt - 1; return; }
    if (vk == 36) { g_fm_selected = 0; return; }
    if (vk == 35 && cnt > 0) { g_fm_selected = cnt - 1; return; }
    if (ascii == 13) {
      int fidx = fs_nth_index(g_fm_selected);
      if (fidx >= 0) shell_open_file(fs_entry_ptr(fidx));
      return;
    }
    if (vk == 46 || ascii == 'd') {
      if (fs_nth_index(g_fm_selected) >= 0) g_fm_modal_mode = 4;
      return;
    }
    if (ascii == 'r' || vk == 113) {
      int fidx0 = fs_nth_index(g_fm_selected);
      if (fidx0 >= 0) fm_open_modal(3, fs_entry_ptr(fidx0));
      return;
    }
    if (ascii == 'n') {
      fs_write("/home/note.txt", "SpiralOS Note\n", 14);
      fm_open_modal(1, "/home/note.txt");
      return;
    }
    return;
  }
  if (vk == 27) { g_fm_modal_mode = 0; return; }
  if (ascii == 13) { fm_commit_modal(); return; }
  g_fm_input_len = field_key_common(FM_INPUT_BUF, g_fm_input_len, 38, ascii);
}

int g_doc_buf;
int g_doc_undo_buf;
int g_doc_max;
int g_doc_len;
int g_doc_cur;
int g_doc_sa;
int g_doc_sb;
int g_doc_sc;
int g_doc_dirty;
int g_doc_ulen;

void doc_begin(int is_notes) {
  if (is_notes == 1) {
    g_doc_buf = NOTES_BUF; g_doc_undo_buf = NOTES_UNDO_BUF; g_doc_max = 32000;
    g_doc_len = g_notes_len; g_doc_cur = g_notes_cursor;
    g_doc_sa = g_notes_sel_start; g_doc_sb = g_notes_sel_end;
    g_doc_sc = g_notes_scroll; g_doc_dirty = g_notes_dirty; g_doc_ulen = g_notes_undo_len;
  } else {
    g_doc_buf = EDIT_BUF; g_doc_undo_buf = EDIT_UNDO_BUF; g_doc_max = 35000;
    g_doc_len = g_edit_len; g_doc_cur = g_edit_cursor;
    g_doc_sa = g_edit_sel_a; g_doc_sb = g_edit_sel_b;
    g_doc_sc = g_edit_scroll; g_doc_dirty = g_edit_dirty; g_doc_ulen = g_edit_undo_len;
  }
}

void doc_end(int is_notes) {
  if (is_notes == 1) {
    g_notes_len = g_doc_len; g_notes_cursor = g_doc_cur;
    g_notes_sel_start = g_doc_sa; g_notes_sel_end = g_doc_sb;
    g_notes_scroll = g_doc_sc; g_notes_dirty = g_doc_dirty; g_notes_undo_len = g_doc_ulen;
  } else {
    g_edit_len = g_doc_len; g_edit_cursor = g_doc_cur;
    g_edit_sel_a = g_doc_sa; g_edit_sel_b = g_doc_sb;
    g_edit_scroll = g_doc_sc; g_edit_dirty = g_doc_dirty; g_edit_undo_len = g_doc_ulen;
  }
}

void doc_save_undo() {
  g_doc_ulen = g_doc_len;
  if (g_doc_len <= 4000) hal_memcpy(g_doc_undo_buf, g_doc_buf, g_doc_len);
}

void doc_delete_range(int a, int b) {
  if (a > b) { int t = a; a = b; b = t; }
  if (a < 0) a = 0;
  if (b > g_doc_len) b = g_doc_len;
  int dlen = b - a;
  if (dlen <= 0) return;
  doc_save_undo();
  int tail = g_doc_len - b;
  if (tail > 0) {
    hal_memcpy(EDIT_SCRATCH, g_doc_buf + b, tail);
    hal_memcpy(g_doc_buf + a, EDIT_SCRATCH, tail);
  }
  g_doc_len = g_doc_len - dlen;
  w8(g_doc_buf + g_doc_len, 0);
  g_doc_cur = a; g_doc_sa = a; g_doc_sb = a; g_doc_dirty = 1;
}

void doc_insert_char(int ch) {
  if (g_doc_len >= g_doc_max) return;
  doc_save_undo();
  if (g_doc_cur < 0) g_doc_cur = 0;
  if (g_doc_cur > g_doc_len) g_doc_cur = g_doc_len;
  int tail = g_doc_len - g_doc_cur;
  if (tail > 0) {
    hal_memcpy(EDIT_SCRATCH, g_doc_buf + g_doc_cur, tail);
    hal_memcpy(g_doc_buf + g_doc_cur + 1, EDIT_SCRATCH, tail);
  }
  w8(g_doc_buf + g_doc_cur, ch);
  g_doc_len = g_doc_len + 1;
  g_doc_cur = g_doc_cur + 1;
  g_doc_sa = g_doc_cur; g_doc_sb = g_doc_cur;
  w8(g_doc_buf + g_doc_len, 0);
  g_doc_dirty = 1;
}

void doc_sync_sel(int mods) {
  if ((mods & 1) != 0) g_doc_sb = g_doc_cur;
  else { g_doc_sa = g_doc_cur; g_doc_sb = g_doc_cur; }
}

void doc_key_common(int is_notes, int ascii, int vk, int mods) {
  doc_begin(is_notes);
  int ca = ascii;
  if ((mods & 2) != 0 && ascii >= 65) ca = ascii & 31;
  if (ca == 1) { g_doc_sa = 0; g_doc_sb = g_doc_len; g_doc_cur = g_doc_len; doc_end(is_notes); return; }
  if (ca == 3 || ca == 24) {
    int a = g_doc_sa; int b = g_doc_sb;
    if (a > b) { int t = a; a = b; b = t; }
    if (b <= a && ca == 3) { a = 0; b = g_doc_len; }
    if (b > a) {
      clip_copy_bytes(g_doc_buf + a, b - a, 0);
      if (ca == 24) doc_delete_range(a, b);
    }
    doc_end(is_notes); return;
  }
  if (ca == 22) {
    if (g_doc_sa != g_doc_sb) doc_delete_range(g_doc_sa, g_doc_sb);
    doc_save_undo();
    int old_l = g_doc_len;
    g_doc_len = clip_paste_buf(g_doc_buf, g_doc_len, g_doc_max, g_doc_cur);
    g_doc_cur = g_doc_cur + (g_doc_len - old_l);
    g_doc_sa = g_doc_cur; g_doc_sb = g_doc_cur; g_doc_dirty = 1;
    doc_end(is_notes); return;
  }
  if (ca == 26 && g_doc_ulen <= 4000) {
    hal_memcpy(g_doc_buf, g_doc_undo_buf, g_doc_ulen);
    g_doc_len = g_doc_ulen;
    w8(g_doc_buf + g_doc_len, 0);
    if (g_doc_cur > g_doc_len) g_doc_cur = g_doc_len;
    g_doc_sa = g_doc_cur; g_doc_sb = g_doc_cur;
    doc_end(is_notes); return;
  }
  if (ca == 19) {
    doc_end(is_notes);
    if (is_notes == 1) { fs_write(NOTES_PATH_BUF, NOTES_BUF, g_notes_len); g_notes_dirty = 0; }
    else edit_save_current();
    return;
  }
  if (ca == 6 && is_notes == 1) { g_notes_find_mode = 1 - g_notes_find_mode; return; }
  if (vk == 37) { if (g_doc_cur > 0) g_doc_cur = g_doc_cur - 1; doc_sync_sel(mods); doc_end(is_notes); return; }
  if (vk == 39) { if (g_doc_cur < g_doc_len) g_doc_cur = g_doc_cur + 1; doc_sync_sel(mods); doc_end(is_notes); return; }
  if (vk == 36) {
    if ((mods & 2) != 0) { g_doc_cur = 0; g_doc_sc = 0; }
    else { while (g_doc_cur > 0 && r8(g_doc_buf + g_doc_cur - 1) != 10) g_doc_cur = g_doc_cur - 1; }
    doc_sync_sel(mods); doc_end(is_notes); return;
  }
  if (vk == 35) {
    if ((mods & 2) != 0) g_doc_cur = g_doc_len;
    else { while (g_doc_cur < g_doc_len && r8(g_doc_buf + g_doc_cur) != 10) g_doc_cur = g_doc_cur + 1; }
    doc_sync_sel(mods); doc_end(is_notes); return;
  }
  if (vk == 38) { if (g_doc_sc > 0) g_doc_sc = g_doc_sc - 1; doc_end(is_notes); return; }
  if (vk == 40) { g_doc_sc = g_doc_sc + 1; doc_end(is_notes); return; }
  if (vk == 33) { g_doc_sc = g_doc_sc - 4; if (g_doc_sc < 0) g_doc_sc = 0; doc_end(is_notes); return; }
  if (vk == 34) { g_doc_sc = g_doc_sc + 4; doc_end(is_notes); return; }
  if (ascii == 8 || ascii == 127) {
    if (g_doc_sa != g_doc_sb) doc_delete_range(g_doc_sa, g_doc_sb);
    else if (ascii == 8 && g_doc_cur > 0) doc_delete_range(g_doc_cur - 1, g_doc_cur);
    else if (ascii == 127 && g_doc_cur < g_doc_len) doc_delete_range(g_doc_cur, g_doc_cur + 1);
    doc_end(is_notes); return;
  }
  if ((ascii >= 32 && ascii <= 126) || ascii == 13) {
    if (g_doc_sa != g_doc_sb) doc_delete_range(g_doc_sa, g_doc_sb);
    int ch = ascii;
    if (ch == 13) ch = 10;
    doc_insert_char(ch);
  }
  doc_end(is_notes);
}

int edit_pos_from_xy(int rx, int ry) {
  int target_row = g_edit_scroll + (ry - 30) / 9;
  int target_col = (rx - 7) / 8;
  if (target_row < 0) target_row = 0;
  if (target_col < 0) target_col = 0;
  int p = 0;
  int cur_line = 0;
  while (p < g_edit_len && cur_line < target_row) {
    if (r8(EDIT_BUF + p) == 10) cur_line = cur_line + 1;
    p = p + 1;
  }
  int col = 0;
  while (p < g_edit_len && r8(EDIT_BUF + p) != 10 && col < target_col) {
    p = p + 1; col = col + 1;
  }
  return p;
}

void app_draw_edit(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  int tx = x + 4; int ty = y + 28; int tw = w - 8; int th = h - 32;
  gui_reg_ctl(4, 28, tw, th, 0);
  wbtn(4, 15, 44, 11, "wm.sp", 0);
  wbtn(50, 15, 52, 11, "Col196", 0);
  wbtn(104, 15, 42, 11, "Save", g_edit_dirty);
  wbtn(148, 15, 58, 11, "Rebuild", 0);
  if (tw <= 8 || th <= 8) return;
  hal_rect(tx, ty, tw, th, 16);

  int sel_lo = g_edit_sel_a; int sel_hi = g_edit_sel_b;
  if (sel_lo > sel_hi) { int t = sel_lo; sel_lo = sel_hi; sel_hi = t; }

  int max_rows = (th - 4) / 9; int max_cols = (tw - 10) / 8;
  int p = 0; int cur_line = 0; int drawn = 0; int caret_drawn = 0;
  while (p <= g_edit_len && drawn < max_rows) {
    if (cur_line >= g_edit_scroll) {
      int col = 0; int ry = ty + 2 + drawn * 9;
      while (p < g_edit_len && r8(EDIT_BUF + p) != 10) {
        if (col < max_cols) {
          int bg = -1;
          if (p >= sel_lo && p < sel_hi) bg = thm_title_active;
          hal_char(tx + 3 + col * 8, ry, r8(EDIT_BUF + p), 15, bg, 0);
          if (p == g_edit_cursor && gui_caret_on()) {
            hal_rect(tx + 3 + col * 8, ry + 7, 8, 2, 14);
            caret_drawn = 1;
          }
        }
        p = p + 1; col = col + 1;
      }
      if (p == g_edit_cursor && caret_drawn == 0 && col < max_cols && gui_caret_on()) {
        hal_rect(tx + 3 + col * 8, ry + 7, 8, 2, 14);
        caret_drawn = 1;
      }
      drawn = drawn + 1;
    } else {
      while (p < g_edit_len && r8(EDIT_BUF + p) != 10) p = p + 1;
    }
    if (p >= g_edit_len) break;
    p = p + 1; cur_line = cur_line + 1;
  }
  gui_draw_vscroll(w - 8, 28, th, g_edit_scroll, max_rows, cur_line + 8);
}

void app_click_edit(int wid, int rx, int ry) {
  int w = win_w[wid]; int h = win_h[wid];
  if (ry >= 15 && ry <= 26) {
    if (rx >= 4 && rx < 48) edit_load_file("/src/wm.sp");
    else if (rx >= 50 && rx < 102) edit_set_wm_title_color(196);
    else if (rx >= 104 && rx < 146) edit_save_current();
    else if (rx >= 148 && rx < 206) {
      edit_save_current();
      cc_rebuild_os_image();
      wm_open(APP_BUILD, 48, 28, 204, 108, "SpiralBuild");
    }
    return;
  }
  if (ry >= 28 && ry < h - 4) {
    if (rx >= w - 12) {
      if (ry < 28 + ((h - 32) >> 1)) { if (g_edit_scroll > 0) g_edit_scroll = g_edit_scroll - 2; }
      else g_edit_scroll = g_edit_scroll + 2;
      if (g_edit_scroll < 0) g_edit_scroll = 0;
      return;
    }
    int pos = edit_pos_from_xy(rx, ry);
    g_edit_cursor = pos; g_edit_sel_a = pos; g_edit_sel_b = pos;
  }
}

void app_key_edit(int ascii, int vk, int mods) {
  doc_key_common(0, ascii, vk, mods);
}

int notes_pos_from_xy(int w, int rx, int ry) {
  int ty = 27 + g_notes_find_mode * 11;
  int target_row = g_notes_scroll + (ry - ty) / 16;
  int target_col = (rx - 6) / 8;
  if (target_row < 0) target_row = 0;
  if (target_col < 0) target_col = 0;
  int max_cols = (w - 14) / 8;
  if (max_cols < 1) max_cols = 1;
  int p = 0; int row = 0;
  while (p < g_notes_len && row < target_row) {
    int ls = p;
    while (p < g_notes_len && r8(NOTES_BUF + p) != 10 && (g_notes_wrap == 0 || (p - ls) < max_cols)) p = p + 1;
    if (p < g_notes_len && r8(NOTES_BUF + p) == 10) p = p + 1;
    row = row + 1;
  }
  int col = 0;
  while (p < g_notes_len && r8(NOTES_BUF + p) != 10 && col < target_col) { p = p + 1; col = col + 1; }
  return p;
}

void notes_copy_selection() {
  doc_begin(1);
  int a = g_doc_sa; int b = g_doc_sb;
  if (a > b) { int t = a; a = b; b = t; }
  if (b <= a) { a = 0; b = g_doc_len; }
  clip_copy_bytes(NOTES_BUF + a, b - a, 0);
}

void notes_paste_clipboard() {
  doc_key_common(1, 22, 86, 2);
}

void notes_find_next() {
  if (g_notes_find_len <= 0) return;
  int start = g_notes_cursor + 1;
  if (start >= g_notes_len) start = 0;
  for (int pass = 0; pass < 2; pass++) {
    int p = start;
    if (pass == 1) p = 0;
    while (p + g_notes_find_len <= g_notes_len) {
      if (match_prefix(NOTES_BUF + p, NOTES_FIND_BUF)) {
        g_notes_cursor = p; g_notes_sel_start = p; g_notes_sel_end = p + g_notes_find_len;
        return;
      }
      p = p + 1;
    }
  }
}

void app_draw_notes(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  wbtn(4, 14, 28, 11, "Open", 0);
  wbtn(34, 14, 28, 11, "Save", g_notes_dirty);
  wbtn(64, 14, 30, 11, "SvAs", 0);
  wbtn(96, 14, 28, 11, "Find", g_notes_find_mode);
  wbtn(126, 14, 28, 11, "Wrap", g_notes_wrap);
  wbtn(156, 14, 20, 11, "Cp", 0);
  wbtn(178, 14, 20, 11, "Ps", 0);
  if (g_notes_dirty == 1) wstr(200, 16, "*M", 14);

  int ty = y + 27;
  if (g_notes_find_mode == 1) {
    hal_rect(x + 4, y + 26, w - 8, 11, 0);
    wstr(6, 28, "Find:", 11);
    gui_str_clip(x + 48, y + 28, NOTES_FIND_BUF, (w - 56) / 8, 14, -1);
    ty = y + 38;
  }

  int th = (y + h - 4) - ty; int tw = w - 8;
  if (tw <= 8 || th <= 16) return;
  hal_rect(x + 4, ty, tw, th, 16);

  int max_cols = (tw - 6) / 8; int max_rows = th / 16;
  if (max_cols < 1) max_cols = 1;
  if (max_rows < 1) max_rows = 1;

  int sel_lo = g_notes_sel_start; int sel_hi = g_notes_sel_end;
  if (sel_lo > sel_hi) { int t = sel_lo; sel_lo = sel_hi; sel_hi = t; }

  int p = 0; int row = 0; int drawn = 0;
  while (p <= g_notes_len && drawn < max_rows) {
    int line_start = p; int line_end = p;
    if (g_notes_wrap == 1) {
      int last_space = -1;
      while (line_end < g_notes_len && r8(NOTES_BUF + line_end) != 10 && (line_end - line_start) < max_cols) {
        if (r8(NOTES_BUF + line_end) == 32) last_space = line_end;
        line_end = line_end + 1;
      }
      if ((line_end - line_start) == max_cols && line_end < g_notes_len && r8(NOTES_BUF + line_end) != 10 && last_space > line_start) {
        line_end = last_space;
      }
    } else {
      while (line_end < g_notes_len && r8(NOTES_BUF + line_end) != 10) line_end = line_end + 1;
    }

    if (row >= g_notes_scroll) {
      int ry = ty + drawn * 16;
      for (int ci = line_start; ci < line_end && (ci - line_start) < max_cols; ci++) {
        int cx = x + 6 + (ci - line_start) * 8;
        int bg = -1;
        if (ci >= sel_lo && ci < sel_hi) bg = thm_title_active;
        hal_char(cx, ry, r8(NOTES_BUF + ci), 15, bg, FONT_SERIF_8X16);
        if (ci == g_notes_cursor && gui_caret_on()) hal_rect(cx, ry + 14, 8, 2, 14);
      }
      if (g_notes_cursor == line_end && (line_end - line_start) < max_cols && gui_caret_on()) {
        hal_rect(x + 6 + (line_end - line_start) * 8, ry + 14, 8, 2, 14);
      }
      drawn = drawn + 1;
    }

    if (line_end >= g_notes_len) break;
    if (r8(NOTES_BUF + line_end) == 10 || r8(NOTES_BUF + line_end) == 32) p = line_end + 1;
    else p = line_end;
    row = row + 1;
  }

  gui_reg_ctl(4, ty - y, tw, th, 0);
  gui_draw_vscroll(w - 8, ty - y, th, g_notes_scroll, max_rows, row + 4);
  if (g_dlg_active != 0 && g_dlg_owner_app == APP_NOTES) dlg_draw(x, y, w, h);
}

void app_click_notes(int wid, int rx, int ry) {
  if (g_dlg_active != 0 && g_dlg_owner_app == APP_NOTES) { dlg_click(wid, rx, ry); return; }
  if (ry >= 14 && ry <= 25) {
    if (rx >= 4 && rx < 32) dlg_open(2, APP_NOTES, 0, "note.txt");
    else if (rx >= 34 && rx < 62) {
      if (r8(NOTES_PATH_BUF) != 0) { fs_write(NOTES_PATH_BUF, NOTES_BUF, g_notes_len); g_notes_dirty = 0; }
      else dlg_open(1, APP_NOTES, 0, "note.txt");
    } else if (rx >= 64 && rx < 94) dlg_open(1, APP_NOTES, 0, "note.txt");
    else if (rx >= 96 && rx < 124) g_notes_find_mode = 1 - g_notes_find_mode;
    else if (rx >= 126 && rx < 154) g_notes_wrap = 1 - g_notes_wrap;
    else if (rx >= 156 && rx < 176) notes_copy_selection();
    else if (rx >= 178 && rx < 198) notes_paste_clipboard();
    return;
  }
  int w = win_w[wid]; int h = win_h[wid];
  if (ry >= 27 && ry < h - 4) {
    if (rx >= w - 12) {
      if (ry < 27 + ((h - 31) >> 1)) { if (g_notes_scroll > 0) g_notes_scroll = g_notes_scroll - 1; }
      else g_notes_scroll = g_notes_scroll + 1;
      return;
    }
    int pos = notes_pos_from_xy(w, rx, ry);
    g_notes_cursor = pos; g_notes_sel_start = pos; g_notes_sel_end = pos;
  }
}

void app_key_notes(int ascii, int vk, int mods) {
  if (g_dlg_active != 0 && g_dlg_owner_app == APP_NOTES) { dlg_key(ascii, vk); return; }
  if (g_notes_find_mode == 1) {
    if (vk == 27) g_notes_find_mode = 0;
    else {
      g_notes_find_len = field_key_common(NOTES_FIND_BUF, g_notes_find_len, 30, ascii);
      if (ascii == 13 || ascii >= 32) notes_find_next();
    }
    return;
  }
  doc_key_common(1, ascii, vk, mods);
}

// 17. Clock & Calendar App (APP_CLOCK)
int clk_days_in_month(int yr, int mo) {
  if (mo == 2) {
    if ((yr % 4 == 0 && yr % 100 != 0) || (yr % 400 == 0)) return 29;
    return 28;
  }
  if (mo == 4 || mo == 6 || mo == 9 || mo == 11) return 30;
  return 31;
}

// Sakamoto day-of-week: 0 = Sunday .. 6 = Saturday
int clk_day_of_week(int y, int m, int d) {
  int t = r8("032503514624" + (m - 1)) - 48;
  if (m < 3) y = y - 1;
  return (y + y / 4 - y / 100 + y / 400 + t + d) % 7;
}
int clk_append_2d(int dst, int dp, int val, int sep) {
  if (val < 10) { w8(dst + dp, 48); dp = dp + 1; }
  dp = srrp_append_int(dst, dp, val);
  if (sep != 0) { w8(dst + dp, sep); dp = dp + 1; }
  return dp;
}

void app_draw_clock(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  hal_rect(x + 4, y + 15, w - 8, h - 19, 16);
  clock_sync_from_hal();

  if (g_clk_set_mode == 1) {
    wstr(8, 18, "Set time (No Hardware RTC)", 14);
    wstr(8, 32, "Y/M/D:", 11);
    for (int fi = 0; fi < 5; fi++) {
      wnum(56 + (fi >= 3) * 54, 32 + (fi % 3) * 12, r32(&g_clk_year + (fi << 2)), 15);
    }
    wbtn(8, 74, 28, 12, "+", 0);
    wbtn(40, 74, 28, 12, "-", 0);
    wbtn(72, 74, 38, 12, "Next", 0);
    wbtn(114, 74, 52, 12, "Apply", 1);
    return;
  }

  int disp_hr = g_clk_hour;
  int disp_min = g_clk_min;
  int disp_sec = g_clk_sec;
  if (g_clk_is_manual == 1) {
    int el_sec = (hal_time() - g_clk_base_ms) / 1000;
    if (el_sec < 0) el_sec = 0;
    int tot = g_clk_hour * 3600 + g_clk_min * 60 + g_clk_sec + el_sec;
    disp_sec = tot % 60;
    disp_min = (tot / 60) % 60;
    disp_hr  = (tot / 3600) % 24;
    wstr(8, 17, "MANUAL CLOCK", 14);
  } else {
    wstr(8, 17, "CMOS RTC", 10);
  }
  wbtn(w - 64, 15, 58, 10, "Set time", 0);

  // Format YYYY-MM-DD HH:MM:SS
  int dt_str = sh_buf();
  int dp = srrp_append_int(dt_str, 0, g_clk_year);
  w8(dt_str + dp, 45); dp = dp + 1;
  dp = clk_append_2d(dt_str, dp, g_clk_month, 45);
  dp = clk_append_2d(dt_str, dp, g_clk_day, 32);
  dp = clk_append_2d(dt_str, dp, disp_hr, 58);
  dp = clk_append_2d(dt_str, dp, disp_min, 58);
  dp = clk_append_2d(dt_str, dp, disp_sec, 0);
  wstr(8, 28, dt_str, 15);

  // Month Calendar Grid with Today highlighted
  wstr(8, 40, "Su Mo Tu We Th Fr Sa", 11);
  int dim = clk_days_in_month(g_clk_year, g_clk_month);
  int dow0 = clk_day_of_week(g_clk_year, g_clk_month, 1);
  for (int d = 1; d <= dim; d++) {
    int cell = dow0 + (d - 1);
    int crow = cell / 7;
    int ccol = cell % 7;
    int cx = x + 8 + ccol * 24;
    int cy = y + 50 + crow * 9;
    int dcol = 15;
    if (d == g_clk_day) { hal_rect(cx - 1, cy - 1, 18, 9, 14); dcol = 0; }
    wnum(cx - x, cy - y, d, dcol);
  }
}

void clock_apply_manual() {
  if (g_clk_year < 1970) g_clk_year = 2026;
  if (g_clk_month < 1) g_clk_month = 11;
  if (g_clk_day < 1) g_clk_day = 14;
  g_clk_is_manual = 1;
  g_clk_base_ms = hal_time();
  g_clk_set_mode = 0;
}

void clock_step_field(int delta) {
  int p = &g_clk_year + (g_clk_field << 2);
  int v = r32(p) + delta;
  if (g_clk_field == 0 && v < 1970) v = 1970;
  if (g_clk_field == 1) v = ((v - 1 + 12) % 12) + 1;
  if (g_clk_field == 2) v = ((v - 1 + 31) % 31) + 1;
  if (g_clk_field == 3) v = (v + 24) % 24;
  if (g_clk_field == 4) v = (v + 60) % 60;
  w32(p, v);
}

void app_click_clock(int wid, int rx, int ry) {
  int w = win_w[wid];
  if (g_clk_set_mode == 1) {
    if (ry >= 74 && ry <= 86) {
      if (rx >= 8 && rx < 36) clock_step_field(1);
      else if (rx >= 40 && rx < 68) clock_step_field(-1);
      else if (rx >= 72 && rx < 110) g_clk_field = (g_clk_field + 1) % 5;
      else if (rx >= 114 && rx < 166) clock_apply_manual();
    }
    return;
  }
  if (ry >= 15 && ry <= 25 && rx >= w - 64 && rx < w - 6) {
    if (g_clk_year == 0) { g_clk_year = 2026; g_clk_month = 11; g_clk_day = 14; g_clk_hour = 12; g_clk_min = 0; }
    g_clk_set_mode = 1;
  }
}

void app_key_clock(int ascii, int vk) {
  if (g_clk_set_mode == 0) {
    if (ascii == 's' || ascii == 'S' || ascii == 13 || ascii == 32) {
      if (g_clk_year == 0) { g_clk_year = 2026; g_clk_month = 11; g_clk_day = 14; g_clk_hour = 12; g_clk_min = 0; }
      g_clk_set_mode = 1;
    }
    return;
  }
  if (vk == 27) { g_clk_set_mode = 0; return; }
  if (ascii == 13) { clock_apply_manual(); return; }
  if (vk == 39 || ascii == 'n' || ascii == 'N') { g_clk_field = (g_clk_field + 1) % 5; return; }
  if (vk == 37) { g_clk_field = (g_clk_field + 4) % 5; return; }
  if (vk == 38 || ascii == '+' || ascii == '=') { clock_step_field(1); return; }
  if (vk == 40 || ascii == '-') { clock_step_field(-1); return; }
  if (ascii >= 48 && ascii <= 57) {
    int d = ascii - 48;
    int p = &g_clk_year + (g_clk_field << 2);
    int v = r32(p) * 10 + d;
    if (g_clk_field == 0) v = (r32(p) % 1000) * 10 + d;
    else {
      v = v % 100;
      int mx = 59;
      if (g_clk_field == 1) mx = 12;
      if (g_clk_field == 2) mx = 31;
      if (g_clk_field == 3) mx = 23;
      if (v > mx) v = d;
      if (g_clk_field <= 2 && v < 1) v = 1;
    }
    w32(p, v);
  }
}

// 1.2 F1: Soft-wrap shell output lines to inner width, recompute on resize,
// scroll so newest wrapped lines and prompt are always visible, and scroll
// the input line horizontally when longer than the inner width.
void app_draw_shell(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  if (w <= 12 || h <= 24) return;
  hal_rect(x + 4, y + 15, w - 8, h - 19, 0);
  gui_reg_ctl(4, 15, w - 8, h - 19, 0);
  int max_cols = (w - 14) / 8;
  int max_rows = (h - 20) / 10;
  if (max_cols < 1 || max_rows < 1) return;

  int avail_out = max_rows - 1;
  int total_wrapped = 0;
  for (int i = 0; i < g_shell_hist_cnt; i++) {
    int lptr = SHELL_HIST_BUF + i * 96;
    int slen = hal_strlen(lptr);
    int wrows = 1;
    if (slen > 0) wrows = (slen + max_cols - 1) / max_cols;
    total_wrapped = total_wrapped + wrows;
  }

  int skip_rows = 0;
  if (total_wrapped > avail_out) {
    skip_rows = total_wrapped - avail_out - g_shell_scroll;
    if (skip_rows < 0) skip_rows = 0;
  }

  int cur_wrow = 0;
  int drawn_rows = 0;
  for (int j = 0; j < g_shell_hist_cnt; j++) {
    int lptr2 = SHELL_HIST_BUF + j * 96;
    int slen2 = hal_strlen(lptr2);
    int wrows2 = 1;
    if (slen2 > 0) wrows2 = (slen2 + max_cols - 1) / max_cols;
    for (int r = 0; r < wrows2; r++) {
      if (cur_wrow >= skip_rows && drawn_rows < avail_out) {
        int ry = y + 18 + drawn_rows * 10;
        int start_c = r * max_cols;
        int rem_c = slen2 - start_c;
        if (rem_c > max_cols) rem_c = max_cols;
        if (rem_c > 0) {
          gui_str_clip(x + 6, ry, lptr2 + start_c, rem_c, 10, -1);
        }
        drawn_rows = drawn_rows + 1;
      }
      cur_wrow = cur_wrow + 1;
    }
  }

  int py = y + 18 + drawn_rows * 10;
  gui_str_clip(x + 6, py, "$ ", max_cols, 14, -1);
  if (max_cols >= 3) {
    int in_cols = max_cols - 3;
    int in_start = 0;
    int vis_len = g_shell_in_len;
    if (vis_len > in_cols) {
      in_start = vis_len - in_cols;
      vis_len = in_cols;
    }
    int slo = g_shell_sel_a;
    int shi = g_shell_sel_b;
    if (slo > shi) { int t = slo; slo = shi; shi = t; }
    for (int k = 0; k < vis_len; k++) {
      int idx = in_start + k;
      int bg = -1;
      if (idx >= slo && idx < shi) bg = thm_title_active;
      hal_char(x + 22 + k * 8, py, r8(SHELL_IN_BUF + idx), 15, bg, 0);
    }
    if (gui_caret_on()) {
      int cpos = g_shell_cursor - in_start;
      if (cpos < 0) cpos = 0;
      if (cpos > in_cols) cpos = in_cols;
      hal_rect(x + 22 + cpos * 8, py + 7, 6, 2, 14);
    }
  }
  gui_draw_vscroll(w - 8, 15, h - 19, skip_rows, avail_out, total_wrapped + 1);
}

void shell_tab_complete() {
  int sp_pos = -1;
  for (int i = 0; i < g_shell_in_len; i++) {
    if (r8(SHELL_IN_BUF + i) == 32) sp_pos = i;
  }
  if (sp_pos < 0) {
    int clist = "help|ls|cat|rm|cp|mv|touch|cd|open|run|edit|make|cc|rebuild|asm|ver|date|time|uptime|history|df|ps|mem|net|peers|peer|name|ping|send|get|share|deals|theme|workers|clear|reboot|shutdown";
    int p = 0;
    while (r8(clist + p) != 0) {
      int st = p;
      while (r8(clist + p) != 0 && r8(clist + p) != 124) p = p + 1;
      int cl = p - st;
      if (cl >= g_shell_in_len && match_prefix(clist + st, SHELL_IN_BUF)) {
        hal_memset(SHELL_IN_BUF, 0, 128);
        hal_memcpy(SHELL_IN_BUF, clist + st, cl);
        w8(SHELL_IN_BUF + cl, 32);
        g_shell_in_len = cl + 1;
        g_shell_cursor = g_shell_in_len; g_shell_sel_a = g_shell_cursor; g_shell_sel_b = g_shell_cursor;
        return;
      }
      if (r8(clist + p) == 124) p = p + 1;
    }
    return;
  }
  int pfx = SHELL_IN_BUF + sp_pos + 1;
  if (g_shell_in_len <= sp_pos + 1) return;
  int cnt = fs_count();
  for (int fi = 0; fi < cnt; fi++) {
    int ep = fs_entry_ptr(fs_nth_index(fi));
    int elen = hal_strlen(ep);
    int bo = 0;
    for (int bi = 0; bi < elen; bi++) if (r8(ep + bi) == 47) bo = bi + 1;
    int ms = 0;
    if (match_prefix(ep, pfx)) ms = ep;
    else if (match_prefix(ep + bo, pfx)) ms = ep + bo;
    if (ms != 0) {
      int ml = hal_strlen(ms);
      if (sp_pos + 1 + ml < 120) {
        hal_memset(pfx, 0, 120 - sp_pos);
        hal_memcpy(pfx, ms, ml);
        g_shell_in_len = sp_pos + 1 + ml;
        g_shell_cursor = g_shell_in_len; g_shell_sel_a = g_shell_cursor; g_shell_sel_b = g_shell_cursor;
      }
      return;
    }
  }
}

void shell_delete_sel() {
  int a = g_shell_sel_a; int b = g_shell_sel_b;
  if (a > b) { int t = a; a = b; b = t; }
  if (a < 0) a = 0;
  if (b > g_shell_in_len) b = g_shell_in_len;
  int dlen = b - a;
  if (dlen <= 0) return;
  for (int i = a; i + dlen <= g_shell_in_len; i++) {
    w8(SHELL_IN_BUF + i, r8(SHELL_IN_BUF + i + dlen));
  }
  g_shell_in_len = g_shell_in_len - dlen;
  g_shell_cursor = a;
  g_shell_sel_a = a;
  g_shell_sel_b = a;
}

void shell_sync_sel(int mods) {
  if ((mods & 1) != 0) g_shell_sel_b = g_shell_cursor;
  else { g_shell_sel_a = g_shell_cursor; g_shell_sel_b = g_shell_cursor; }
}

void app_key_shell(int ascii, int vk, int mods) {
  if (g_shell_cursor > g_shell_in_len) g_shell_cursor = g_shell_in_len;
  int ca = ascii;
  if ((mods & 2) != 0 && ascii >= 65) ca = ascii & 31;
  if (ca == 1) { g_shell_sel_a = 0; g_shell_sel_b = g_shell_in_len; g_shell_cursor = g_shell_in_len; return; }
  if (ca == 3) {
    int a = g_shell_sel_a; int b = g_shell_sel_b;
    if (a > b) { int t = a; a = b; b = t; }
    if (b > a) clip_copy_bytes(SHELL_IN_BUF + a, b - a, 1);
    else if (g_shell_in_len > 0) clip_copy_bytes(SHELL_IN_BUF, g_shell_in_len, 1);
    else if (g_shell_hist_cnt > 0) {
      int last_l = SHELL_HIST_BUF + (g_shell_hist_cnt - 1) * 96;
      clip_copy_bytes(last_l, hal_strlen(last_l), 1);
    }
    return;
  }
  if (ca == 24) {
    int a = g_shell_sel_a; int b = g_shell_sel_b;
    if (a > b) { int t = a; a = b; b = t; }
    if (b <= a) { a = 0; b = g_shell_in_len; g_shell_sel_a = 0; g_shell_sel_b = g_shell_in_len; }
    if (b > a) { clip_copy_bytes(SHELL_IN_BUF + a, b - a, 1); shell_delete_sel(); }
    return;
  }
  if (ca == 22) {
    if (g_shell_sel_a != g_shell_sel_b) shell_delete_sel();
    int old_l = g_shell_in_len;
    g_shell_in_len = clip_paste_buf(SHELL_IN_BUF, g_shell_in_len, 120, g_shell_cursor);
    g_shell_cursor = g_shell_cursor + (g_shell_in_len - old_l);
    g_shell_sel_a = g_shell_cursor;
    g_shell_sel_b = g_shell_cursor;
    return;
  }

  if (vk == 9) { shell_tab_complete(); return; }
  if (vk == 38 || vk == 40) {
    if (vk == 38 && g_sh_cmd_nav > 0) g_sh_cmd_nav = g_sh_cmd_nav - 1;
    if (vk == 40 && g_sh_cmd_nav < g_sh_cmd_cnt) g_sh_cmd_nav = g_sh_cmd_nav + 1;
    hal_memset(SHELL_IN_BUF, 0, 128);
    g_shell_in_len = 0;
    if (g_sh_cmd_nav < g_sh_cmd_cnt) {
      int hptr = SHELL_CMD_RING + g_sh_cmd_nav * 96;
      g_shell_in_len = hal_strlen(hptr);
      hal_memcpy(SHELL_IN_BUF, hptr, g_shell_in_len);
    }
    g_shell_cursor = g_shell_in_len;
    g_shell_sel_a = g_shell_cursor;
    g_shell_sel_b = g_shell_cursor;
    return;
  }
  if (vk == 33) { g_shell_scroll = g_shell_scroll + 3; return; }
  if (vk == 34) { g_shell_scroll = g_shell_scroll - 3; if (g_shell_scroll < 0) g_shell_scroll = 0; return; }
  if (vk == 37) { if (g_shell_cursor > 0) g_shell_cursor = g_shell_cursor - 1; shell_sync_sel(mods); return; }
  if (vk == 39) { if (g_shell_cursor < g_shell_in_len) g_shell_cursor = g_shell_cursor + 1; shell_sync_sel(mods); return; }
  if (vk == 36) { g_shell_cursor = 0; shell_sync_sel(mods); return; }
  if (vk == 35) { g_shell_cursor = g_shell_in_len; shell_sync_sel(mods); return; }

  if (ascii == 13) {
    w8(SHELL_IN_BUF + g_shell_in_len, 0);
    shell_exec_cmd(SHELL_IN_BUF);
    g_shell_in_len = 0;
    g_shell_cursor = 0;
    g_shell_sel_a = 0;
    g_shell_sel_b = 0;
    hal_memset(SHELL_IN_BUF, 0, 128);
    return;
  }
  if (ascii == 8 || ascii == 127) {
    if (g_shell_sel_a != g_shell_sel_b) {
      shell_delete_sel();
    } else if (ascii == 8 && g_shell_cursor > 0) {
      g_shell_sel_a = g_shell_cursor - 1;
      g_shell_sel_b = g_shell_cursor;
      shell_delete_sel();
    } else if (ascii == 127 && g_shell_cursor < g_shell_in_len) {
      g_shell_sel_a = g_shell_cursor;
      g_shell_sel_b = g_shell_cursor + 1;
      shell_delete_sel();
    }
    return;
  }
  if (ascii >= 32 && ascii <= 126 && g_shell_in_len < 120) {
    if (g_shell_sel_a != g_shell_sel_b) shell_delete_sel();
    int tail = g_shell_in_len - g_shell_cursor;
    if (tail > 0) {
      for (int i = g_shell_in_len; i > g_shell_cursor; i = i - 1) {
        w8(SHELL_IN_BUF + i, r8(SHELL_IN_BUF + i - 1));
      }
    }
    w8(SHELL_IN_BUF + g_shell_cursor, ascii);
    g_shell_in_len = g_shell_in_len + 1;
    g_shell_cursor = g_shell_cursor + 1;
    g_shell_sel_a = g_shell_cursor;
    g_shell_sel_b = g_shell_cursor;
    w8(SHELL_IN_BUF + g_shell_in_len, 0);
  }
}

void app_draw_build(int x, int y, int w, int h) {
  if (h > 36 && w > 8) hal_rect(x + 4, y + 15, w - 8, h - 36, 16);
  gui_set_win(x, y, w, h - 18);
  wstr(8, 19, os_version_str(), 14);
  wstr(8, 31, "Target: SPIR Unified VM", 15);
  wstr(8, 43, "TitleOverride:", 11);
  wnum(124, 43, g_cc_parsed_override, 15);
  if (g_cc_last_status == 1) {
    wstr(8, 55, "Status: IMAGE REBUILT OK", 10);
    wstr(8, 67, "Bytes:", 11);
    wnum(60, 67, g_cc_last_bytes, 15);
  } else if (g_cc_last_status == -1) {
    wstr(8, 55, CC_ERR_MSG, 12);
    wstr(8, 67, "Old image kept intact", 14);
  } else {
    wstr(8, 55, "Status: Ready to compile", 7);
  }
  gui_set_win(x, y, w, h);
  wbtn(4, h - 17, 64, 13, "Compile", 0);
  wbtn(72, h - 17, 62, 13, "AsmCore", 0);
  wbtn(138, h - 17, 60, 13, "Reboot", 0);
}

void app_click_build(int wid, int rx, int ry) {
  int h = win_h[wid];
  if (ry >= h - 17 && ry <= h - 4) {
    if (rx >= 4 && rx < 68) {
      cc_rebuild_os_image();
    } else if (rx >= 72 && rx < 134) {
      asm_rebuild_native_cores();
    } else if (rx >= 138 && rx < 198) {
      hal_reboot();
    }
  }
}

void app_key_build(int ascii, int vk) {
  if (ascii == 'c' || ascii == 'C') cc_rebuild_os_image();
  else if (ascii == 'a' || ascii == 'A') asm_rebuild_native_cores();
  else if (ascii == 'r' || ascii == 'R') hal_reboot();
}

void gui_blit_clipped(int dx, int dy, int bw, int bh, int max_w, int max_h, int src) {
  if (max_w <= 0 || max_h <= 0) return;
  if (max_w >= bw && max_h >= bh) {
    hal_blit(dx, dy, bw, bh, src);
    return;
  }
  int cw = bw;
  if (cw > max_w) cw = max_w;
  int ch = bh;
  if (ch > max_h) ch = max_h;
  for (int r = 0; r < ch; r++) {
    hal_blit(dx, dy + r, cw, 1, src + r * bw);
  }
}

void app_draw_paint(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  for (int c = 0; c < 8; c++) {
    int col = c + 9;
    if (4 + c * 11 + 10 <= w - 4 && 27 <= h - 4) {
      hal_rect(x + 4 + c * 11, y + 15, 10, 10, col);
      if (g_paint_color == col) {
        hal_rect(x + 4 + c * 11, y + 25, 10, 2, 15);
      }
    }
  }
  wbtn(94, 15, 28, 11, "Clr", 0);
  wbtn(124, 15, 34, 11, "Save", 0);
  wbtn(104, 30, 52, 11, "Open...", 0);
  wbtn(104, 44, 52, 11, "SaveAs", 0);
  gui_blit_clipped(x + 4, y + 29, 96, 56, w - 8, h - 33, PAINT_CANVAS);
  if (g_dlg_active != 0 && g_dlg_owner_app == 5) {
    dlg_draw(x, y, w, h);
  }
}

void app_click_paint(int wid, int rx, int ry) {
  if (g_dlg_active != 0 && g_dlg_owner_app == 5) {
    dlg_click(wid, rx, ry);
    return;
  }
  if (ry >= 15 && ry <= 26) {
    if (rx >= 4 && rx < 92) {
      g_paint_color = 9 + ((rx - 4) / 11);
    } else if (rx >= 94 && rx < 122) {
      hal_memset(PAINT_CANVAS, 16, 96 * 56);
      g_Paint_strokes = g_Paint_strokes + 1;
      g_paint_dirty = 1;
    } else if (rx >= 124 && rx < 158) {
      fs_write("/art/user.pic", PAINT_CANVAS, 96 * 56);
      g_paint_dirty = 0;
    }
    return;
  }
  if (rx >= 104 && rx < 156) {
    if (ry >= 30 && ry <= 41) {
      dlg_open(2, 5, 1, "user.pic");
      return;
    }
    if (ry >= 44 && ry <= 55) {
      dlg_open(1, 5, 1, "user.pic");
      return;
    }
  }
  if (rx >= 4 && rx < 100 && ry >= 29 && ry < 85) {
    int px = rx - 4;
    int py = ry - 29;
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        int nx = px + dx;
        int ny = py + dy;
        if (nx >= 0 && nx < 96 && ny >= 0 && ny < 56) {
          w8(PAINT_CANVAS + ny * 96 + nx, g_paint_color);
        }
      }
    }
    g_Paint_strokes = g_Paint_strokes + 1;
    g_paint_dirty = 1;
  }
}

void app_key_paint(int ascii, int vk, int mods) {
  if (g_dlg_active != 0 && g_dlg_owner_app == 5) {
    dlg_key(ascii, vk);
    return;
  }
  int ca = ascii;
  if ((mods & 2) != 0 && ascii >= 65) ca = ascii & 31;
  if (ca == 19 || ascii == 's') { fs_write("/art/user.pic", PAINT_CANVAS, 96 * 56); g_paint_dirty = 0; return; }
  if (ascii == 'o') { dlg_open(2, 5, 1, "user.pic"); return; }
  if (ascii == 'a') { dlg_open(1, 5, 1, "user.pic"); return; }
  if (ascii == 'c') { hal_memset(PAINT_CANVAS, 16, 96 * 56); g_Paint_strokes = g_Paint_strokes + 1; g_paint_dirty = 1; return; }
  if (ascii >= 49 && ascii <= 56) { g_paint_color = 9 + (ascii - 49); return; }
}

void calc_press_digit(int d) {
  if (g_calc_entering == 0) {
    g_calc_cur = d;
    g_calc_entering = 1;
  } else {
    g_calc_cur = g_calc_cur * 10 + d;
  }
}

void calc_eval_op(int next_op) {
  if (g_calc_op == 0) {
    g_calc_acc = g_calc_cur;
  } if (g_calc_op == 1) {
    g_calc_acc = g_calc_acc + g_calc_cur;
  } if (g_calc_op == 2) {
    g_calc_acc = g_calc_acc - g_calc_cur;
  } if (g_calc_op == 3) {
    g_calc_acc = g_calc_acc * g_calc_cur;
  } if (g_calc_op == 4) {
    if (g_calc_cur != 0) g_calc_acc = g_calc_acc / g_calc_cur;
  }
  g_calc_cur = g_calc_acc;
  g_calc_op = next_op;
  g_calc_entering = 0;
}

void app_draw_calc(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  if (h >= 34 && w > 8) {
    hal_rect(x + 4, y + 16, w - 8, 14, 16);
    wnum(8, 19, g_calc_cur, 14);
  }

  byte klbl[4];
  klbl[1] = 0;
  for (int r = 0; r < 4; r++) {
    for (int c = 0; c < 4; c++) {
      klbl[0] = r8("789+456-123*C0=/" + (r * 4 + c));
      wbtn(4 + c * 26, 33 + r * 15, 24, 13, klbl, c == 3 && g_calc_op == r + 1);
    }
  }
}

void app_click_calc(int wid, int rx, int ry) {
  if (ry < 33 || ry > 92 || rx < 4 || rx > 106) return;
  int col = (rx - 4) / 26;
  int row = (ry - 33) / 15;
  if (col == 3) {
    calc_eval_op(row + 1);
    return;
  }
  if (row == 0) calc_press_digit(7 + col);
  if (row == 1) calc_press_digit(4 + col);
  if (row == 2) calc_press_digit(1 + col);
  if (row == 3) {
    if (col == 0) { g_calc_acc = 0; g_calc_cur = 0; g_calc_op = 0; g_calc_entering = 1; }
    else if (col == 1) calc_press_digit(0);
    else if (col == 2) calc_eval_op(0);
  }
}

void app_key_calc(int ascii) {
  if (ascii >= 48 && ascii <= 57) calc_press_digit(ascii - 48);
  else if (ascii == 43) calc_eval_op(1);
  else if (ascii == 45) calc_eval_op(2);
  else if (ascii == 42) calc_eval_op(3);
  else if (ascii == 47) calc_eval_op(4);
  else if (ascii == 61 || ascii == 13) calc_eval_op(0);
  else if (ascii == 99 || ascii == 67) { g_calc_acc = 0; g_calc_cur = 0; g_calc_op = 0; g_calc_entering = 1; }
}

void app_draw_sysmon(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  if (h > 20 && w > 8) {
    hal_rect(x + 4, y + 16, w - 8, h - 20, 16);
  }
  if (g_machine_id == 1) wstr(8, 20, "CPU: TabComp TC-32", 14);
  else if (g_machine_id == 3) wstr(8, 20, "CPU: Triton", 14);
  else wstr(8, 20, "CPU: i586 Protected", 14);

  wstr(8, 32, "Tasks:", 11);
  int hw_tasks = r32(VMRAM_SCHED_HDR + 4);
  wnum(60, 32, g_num_tasks + hw_tasks - 1, 15);

  wstr(92, 32, "Sw:", 11);
  wnum(118, 32, r32(VMRAM_SCHED_HDR + 16), 10);

  wstr(8, 44, "VM Op:", 11);
  wnum(60, 44, hal_info(2), 15);

  if (g_has_snet == 1) {
    wstr(8, 56, "NetTX:", 11);
    wnum(60, 56, g_net_tx_pkts, 10);

    wstr(104, 56, "RX:", 11);
    wnum(130, 56, g_net_rx_pkts, 10);
  } else {
    wstr(8, 56, "Net: no network", 12);
  }

  if (h >= 82 && w > 16) {
    hal_rect(x + 8, y + 70, w - 16, 8, 8);
    hal_rect(x + 8, y + 70, (w - 16) / 3, 8, thm_accent);
  }
}
