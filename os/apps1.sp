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
const SHARED_ST      = 0x04DFC0;

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
  w32(SHARED_ST + 0x18, mode);
  w32(SHARED_ST + 0x1C, owner_app);
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
      g_notes_len = r32(SHARED_ST + 0x00);
      fs_write(DLG_FULL_BUF, NOTES_BUF, g_notes_len);
      hal_memset(NOTES_PATH_BUF, 0, 64);
      hal_memcpy(NOTES_PATH_BUF, DLG_FULL_BUF, hal_strlen(DLG_FULL_BUF));
      g_notes_dirty = 0;
      w32(SHARED_ST + 0x04, 0);
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
  g_dlg_active = 0; w32(SHARED_ST + 0x18, 0);
  g_dlg_confirm_ovw = 0;
  w32(SHARED_ST + 0x18, 0);
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
      g_dlg_active = 0; w32(SHARED_ST + 0x18, 0);
      g_dlg_confirm_ovw = 0;
    }
  }
  return 1;
}

int dlg_key(int ascii, int vk) {
  if (g_dlg_active == 0) return 0;
  if (vk == 27) {
    if (g_dlg_confirm_ovw == 1) g_dlg_confirm_ovw = 0;
    else g_dlg_active = 0; w32(SHARED_ST + 0x18, 0);
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
  w32(SHARED_ST + 0x08, sz);
  w32(SHARED_ST + 0x0C, 0);
  w32(SHARED_ST + 0x10, idx);
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
  g_pending_app_arg = 1;
  int fidx = fs_find(path_str);
  if (fidx < 0) return;
  int sz = fs_entry_size(fidx);
  if (sz > 32000) sz = 32000;
  hal_memset(NOTES_BUF, 0, 32768);
  hal_memcpy(NOTES_BUF, fs_entry_data_ptr(fidx), sz);
  g_notes_len = sz;
  w32(SHARED_ST + 0x00, sz);
  w32(SHARED_ST + 0x04, 0);
  g_notes_cursor = sz;
  g_notes_sel_start = sz;
  g_notes_sel_end = sz;
  g_notes_scroll = 0;
  g_notes_dirty = 0;
  hal_memset(NOTES_PATH_BUF, 0, 64);
  hal_memcpy(NOTES_PATH_BUF, path_str, hal_strlen(path_str));
}

void shell_open_file(int raw_arg) {
  int rlen0 = hal_strlen(raw_arg);
  if (rlen0 >= 3 && r8(raw_arg + rlen0 - 3) == 46 && r8(raw_arg + rlen0 - 2) == 122 && r8(raw_arg + rlen0 - 1) == 51) { g_pending_app_arg = raw_arg; open_app_by_id(APP_ZORK); return; }
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
      srrp_append_str(sb, rp, " ms (1.6)");
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
  if (hal_strcmp(cmd_str, "deals")) { int sb_m = app_load_path("/apps/solitaire.spir", 1); if (sb_m != 0) app_unload_base(sb_m); return; }
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
    int mp = srrp_kv(sb, 0, "VM RAM: ", hal_info(1) / 1024);
    mp = srrp_kv(sb, mp, " KB, HeapFree: ", heap_free_bytes() / 1024);
    srrp_append_str(sb, mp, " KB");
    shell_print(sb);
    return;
  }
  if (hal_strcmp(cmd_str, "z") || match_prefix(cmd_str, "z ")) {
    if (hal_strcmp(cmd_str, "z")) {
      g_pending_app_arg = "/games/zork1.z3";
    } else {
      int zarg = cmd_str + 2;
      if (r8(zarg) == 47) {
        hal_memcpy(sb, zarg, hal_strlen(zarg) + 1);
      } else {
        hal_memcpy(sb, "/games/", 7);
        hal_memcpy(sb + 7, zarg, hal_strlen(zarg) + 1);
      }
      g_pending_app_arg = sb;
    }
    open_app_by_id(APP_ZORK);
    return;
  }
  if (match_prefix(cmd_str, "load ")) {
    int mh = app_load_path(cmd_str + 5, 0);
    if (mh == 0) shell_print(LOADER_ERR_BUF);
    else { app_unload_base(mh); shell_print("Loaded & verified OK"); }
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
  if (match_prefix(cmd_str, "write ")) {
    byte wa1[64]; byte wa2[128];
    shell_split_two_args(cmd_str + 6, wa1, wa2);
    if (wa1[0] != 0) {
      byte wp[64];
      shell_resolve_path(wa1, wp);
      int wrc = fs_write(wp, wa2, hal_strlen(wa2));
      if (wrc >= 0) shell_print("Wrote file");
      else shell_print("Write failed");
    } else {
      shell_print("Usage: write <path> <text>");
    }
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
  hal_memset(SHELL_OUT_BUF, 0, 48);
  int vstr = os_version_str();
  int vlen = hal_strlen(vstr);
  if (vlen > 46) vlen = 46;
  hal_memcpy(SHELL_OUT_BUF, vstr, vlen);
  g_shell_lines = 1;
  g_shell_hist_cnt = 0;

  g_paint_color = 14;
  hal_memset(PAINT_CANVAS, 16, 96 * 56);
  for (int i = 0; i < 40; i++) w8(PAINT_CANVAS + (12 + (i >> 1)) * 96 + (20 + i), 11);
  g_calc_entering = 1;
}

// from spiralos/os/apps1.sp:196-310 (extended with New Folder, New File, Rename, Delete confirm, Send to..., Inbox)

int clk_append_2d(int dst, int dp, int val, int sep) {
  if (val < 10) { w8(dst + dp, 48); dp = dp + 1; }
  dp = srrp_append_int(dst, dp, val);
  if (sep != 0) { w8(dst + dp, sep); dp = dp + 1; }
  return dp;
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
    if (g_shell_in_len > 0) {
      int ep = SRRP_SCRATCH_BUF + 2048;
      w8(ep, '>'); w8(ep + 1, ' ');
      int el = g_shell_in_len; if (el > 88) el = 88;
      hal_memcpy(ep + 2, SHELL_IN_BUF, el);
      w8(ep + 2 + el, 0);
      shell_print(ep);
    }
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

