// ============================================================================
// SpiralOS — Core Desktop Applications Part 1 (/src/apps1.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Implements:
//   1. File Manager (APP_FILES)
//   2. Text Editor SpiralEdit (APP_EDIT)
//   3. Terminal & Shell SpiralSh (APP_SHELL)
//   4. Self-Hosting Compiler & Build Tool SpiralBuild (APP_BUILD)
//   5. Paint Program SpiralPaint (APP_PAINT)
//   6. Calculator SpiralCalc (APP_CALC)
//   7. System Monitor SpiralMon (APP_SYSMON)
// ============================================================================

const EDIT_BUF       = 0x058000; // 4 KB editor text buffer
const SHELL_OUT_BUF  = 0x04B000; // 4 lines of 48B shell output
const SHELL_IN_BUF   = 0x04B200; // 64B shell input line
const PAINT_CANVAS   = 0x04C000; // 96 x 56 = 5376B paint canvas
const NUM_STR_BUF    = 0x04DF00; // scratch number formatting buffer

int g_fm_selected;
int g_edit_file_idx;
int g_edit_len;
int g_edit_cursor;
int g_edit_scroll;
int g_edit_dirty;
int g_shell_in_len;
int g_shell_lines;
int g_paint_color;
int g_paint_tool; // 0=brush, 1=rect, 2=fill
int g_Paint_strokes;
int g_calc_acc;
int g_calc_cur;
int g_calc_op;    // 0=none, 1=+, 2=-, 3=*, 4=/
int g_calc_entering;

void edit_load_file(int path_str) {
  int idx = fs_find(path_str);
  if (idx < 0) return;
  g_edit_file_idx = idx;
  int sz = fs_entry_size(idx);
  if (sz > 12000) sz = 12000;
  hal_memset(EDIT_BUF, 0, 12288);
  hal_memcpy(EDIT_BUF, fs_entry_data_ptr(idx), sz);
  g_edit_len = sz;
  g_edit_cursor = 0;
  g_edit_scroll = 0;
  g_edit_dirty = 0;
}

void edit_save_current() {
  if (g_edit_file_idx < 0) return;
  int name_Buf = 0x04DE00;
  hal_memset(name_Buf, 0, 48);
  hal_memcpy(name_Buf, fs_entry_ptr(g_edit_file_idx), 39);
  fs_write(name_Buf, EDIT_BUF, g_edit_len);
  g_edit_dirty = 0;
}

// Replaces `const WM_TITLE_COLOR_OVERRIDE = <old>;` with new color in EDIT_BUF
void edit_set_wm_title_color(int new_col) {
  int p = 0;
  while (p + 30 < g_edit_len) {
    if (match_prefix(EDIT_BUF + p, "const WM_TITLE_COLOR_OVERRIDE = ") > 0) {
      int val_pos = p + 32;
      int end_pos = val_pos;
      while (end_pos < g_edit_len && r8(EDIT_BUF + end_pos) != 59) {
        end_pos = end_pos + 1;
      }
      int tail_len = g_edit_len - end_pos;
      hal_memcpy(0x050000, EDIT_BUF + end_pos, tail_len);
      int nlen = hal_itoa(new_col, NUM_STR_BUF, 10);
      hal_memcpy(EDIT_BUF + val_pos, NUM_STR_BUF, nlen);
      hal_memcpy(EDIT_BUF + val_pos + nlen, 0x050000, tail_len);
      g_edit_len = val_pos + nlen + tail_len;
      w8(EDIT_BUF + g_edit_len, 0);
      g_edit_dirty = 1;
      return;
    }
    p = p + 1;
  }
}

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
}

void shell_exec_cmd(int cmd_str) {
  if (hal_strcmp(cmd_str, "help") == 1) {
    shell_print("cmds: ls ps mem net cc rebuild asm");
    shell_print("      theme ping clear ver reboot");
    return;
  }
  if (hal_strcmp(cmd_str, "ver") == 1) {
    if (g_machine_id == 1) shell_print("SpiralOS 1.0 on TabComp TC-32");
    else shell_print("SpiralOS 1.0 on Hummingbird i586");
    return;
  }
  if (hal_strcmp(cmd_str, "ls") == 1) {
    int cnt = fs_count();
    hal_itoa(cnt, NUM_STR_BUF, 10);
    shell_print("SpiralFS files mounted:");
    shell_print(NUM_STR_BUF);
    return;
  }
  if (hal_strcmp(cmd_str, "ps") == 1) {
    hal_itoa(g_num_tasks, NUM_STR_BUF, 10);
    shell_print("Active SpiralVM tasks:");
    shell_print(NUM_STR_BUF);
    return;
  }
  if (hal_strcmp(cmd_str, "mem") == 1) {
    shell_print("VM RAM: 4096 KB unified, SPIR: 64 KB");
    return;
  }
  if (hal_strcmp(cmd_str, "net") == 1) {
    shell_print("StudioNet online: SNS/SDP/SSP active");
    return;
  }
  if (hal_strcmp(cmd_str, "ping") == 1) {
    int peer = sns_resolve("peer");
    net_send_chat(peer, "PING from SpiralSh");
    shell_print("Sent SDP PING to peer node");
    return;
  }
  if (hal_strcmp(cmd_str, "cc") == 1 || hal_strcmp(cmd_str, "rebuild") == 1) {
    cc_rebuild_os_image();
    shell_print("Rebuilt SPIR OS image (Sectors 64..191)");
    return;
  }
  if (hal_strcmp(cmd_str, "asm") == 1) {
    asm_rebuild_native_cores();
    shell_print("Assembled TC-32 & x86 Native Cores OK");
    return;
  }
  if (hal_strcmp(cmd_str, "theme") == 1) {
    theme_select(g_current_theme_idx + 1);
    shell_print("Switched desktop theme");
    return;
  }
  if (hal_strcmp(cmd_str, "clear") == 1) {
    hal_memset(SHELL_OUT_BUF, 0, 5 * 48);
    g_shell_lines = 0;
    return;
  }
  if (hal_strcmp(cmd_str, "reboot") == 1) {
    hal_reboot();
    return;
  }
  shell_print("Unknown cmd (type 'help')");
}

void apps1_init() {
  g_fm_selected = 0;
  g_edit_file_idx = -1;
  edit_load_file("/src/wm.sp");

  hal_memset(SHELL_OUT_BUF, 0, 5 * 48);
  hal_memset(SHELL_IN_BUF, 0, 64);
  g_shell_in_len = 0;
  g_shell_lines = 0;
  shell_print("SpiralOS 1.0 ('help')");

  // Initialize Paint canvas with a procedural starter pattern
  g_paint_color = 14;
  g_paint_tool = 0;
  g_Paint_strokes = 0;
  hal_memset(PAINT_CANVAS, 16, 96 * 56);
  for (int i = 0; i < 40; i++) {
    w8(PAINT_CANVAS + (12 + (i >> 1)) * 96 + (20 + i), 11);
  }

  // Initialize Calculator
  g_calc_acc = 0;
  g_calc_cur = 0;
  g_calc_op = 0;
  g_calc_entering = 1;
}

// 1. Draw & Click: File Manager
void app_draw_files(int x, int y, int w, int h) {
  hal_rect(x + 4, y + 16, w - 8, h - 36, 16);
  int cnt = fs_count();
  int max_show = (h - 42) / 10;
  for (int i = 0; i < cnt && i < max_show; i++) {
    int fidx = fs_nth_index(i);
    int ry = y + 18 + i * 10;
    if (i == g_fm_selected) {
      hal_rect(x + 5, ry - 1, w - 10, 9, thm_title_active);
    }
    hal_str(x + 8, ry, fs_entry_ptr(fidx), 15, -1);
    hal_itoa(fs_entry_size(fidx), NUM_STR_BUF, 10);
    hal_str(x + w - 44, ry, NUM_STR_BUF, 11, -1);
  }
  gui_button(x + 4,  y + h - 16, 42, 12, "Edit", 0);
  gui_button(x + 50, y + h - 16, 42, 12, "+New", 0);
  gui_button(x + 96, y + h - 16, 40, 12, "Del", 0);
}

void app_click_files(int wid, int rx, int ry) {
  int w = win_w[wid];
  int h = win_h[wid];
  if (ry >= 18 && ry < h - 20) {
    int row = (ry - 18) / 10;
    if (row >= 0 && row < fs_count()) g_fm_selected = row;
    return;
  }
  if (ry >= h - 16 && ry < h - 4) {
    int fidx = fs_nth_index(g_fm_selected);
    if (rx >= 4 && rx < 46 && fidx >= 0) {
      edit_load_file(fs_entry_ptr(fidx));
      wm_open(APP_EDIT, 24, 20, 216, 134, "SpiralEdit");
    } else if (rx >= 50 && rx < 92) {
      fs_write("/home/note.txt", "SpiralOS Note\n", 14);
    } else if (rx >= 96 && rx < 136 && fidx >= 0) {
      fs_delete(fs_entry_ptr(fidx));
      if (g_fm_selected > 0) g_fm_selected = g_fm_selected - 1;
    }
  }
}

// 2. Draw & Click: Text Editor (SpiralEdit)
void app_draw_edit(int x, int y, int w, int h) {
  // Toolbar
  gui_button(x + 4,   y + 15, 44, 11, "wm.sp", 0);
  gui_button(x + 50,  y + 15, 52, 11, "Col196", 0);
  gui_button(x + 104, y + 15, 42, 11, "Save", g_edit_dirty);
  gui_button(x + 148, y + 15, 58, 11, "Rebuild", 0);

  // Text area
  int tx = x + 4;
  int ty = y + 28;
  int tw = w - 8;
  int th = h - 32;
  hal_rect(tx, ty, tw, th, 16);

  // Render visible lines from EDIT_BUF
  int max_rows = (th - 4) / 9;
  int max_cols = (tw - 6) / 8;
  int p = 0;
  int cur_line = 0;
  int drawn = 0;
  while (p < g_edit_len && drawn < max_rows) {
    if (cur_line >= g_edit_scroll) {
      int col = 0;
      int ry = ty + 2 + drawn * 9;
      while (p < g_edit_len && r8(EDIT_BUF + p) != 10) {
        if (col < max_cols) {
          hal_char(tx + 3 + col * 8, ry, r8(EDIT_BUF + p), 15, -1);
        }
        p = p + 1;
        col = col + 1;
      }
      drawn = drawn + 1;
    } else {
      while (p < g_edit_len && r8(EDIT_BUF + p) != 10) p = p + 1;
    }
    p = p + 1;
    cur_line = cur_line + 1;
  }
}

void app_click_edit(int wid, int rx, int ry) {
  if (ry >= 15 && ry <= 26) {
    if (rx >= 4 && rx < 48) {
      edit_load_file("/src/wm.sp");
    } else if (rx >= 50 && rx < 102) {
      edit_set_wm_title_color(196);
    } else if (rx >= 104 && rx < 146) {
      edit_save_current();
    } else if (rx >= 148 && rx < 206) {
      edit_save_current();
      cc_rebuild_os_image();
      wm_open(APP_BUILD, 48, 28, 204, 108, "SpiralBuild");
    }
  }
}

void app_key_edit(int ascii, int vk) {
  if (vk == 38 && g_edit_scroll > 0) { g_edit_scroll = g_edit_scroll - 1; return; }
  if (vk == 40) { g_edit_scroll = g_edit_scroll + 1; return; }
  if (ascii == 8 && g_edit_len > 0) {
    g_edit_len = g_edit_len - 1;
    w8(EDIT_BUF + g_edit_len, 0);
    g_edit_dirty = 1;
    return;
  }
  if ((ascii >= 32 && ascii <= 126) || ascii == 13) {
    if (g_edit_len < 12000) {
      int ch = ascii;
      if (ch == 13) ch = 10;
      w8(EDIT_BUF + g_edit_len, ch);
      g_edit_len = g_edit_len + 1;
      w8(EDIT_BUF + g_edit_len, 0);
      g_edit_dirty = 1;
    }
  }
}

// 3. Draw & Input: Terminal & Shell (SpiralSh)
void app_draw_shell(int x, int y, int w, int h) {
  hal_rect(x + 4, y + 15, w - 8, h - 19, 0);
  int count = g_shell_lines;
  if (count > 5) count = 5;
  for (int i = 0; i < count; i++) {
    hal_str(x + 6, y + 18 + i * 10, SHELL_OUT_BUF + i * 48, 10, -1);
  }
  int py = y + 18 + count * 10;
  hal_str(x + 6, py, "$ ", 14, -1);
  hal_str(x + 22, py, SHELL_IN_BUF, 15, -1);
  hal_rect(x + 22 + g_shell_in_len * 8, py + 7, 6, 2, 14);
}

void app_key_shell(int ascii, int vk) {
  if (ascii == 13) {
    w8(SHELL_IN_BUF + g_shell_in_len, 0);
    shell_exec_cmd(SHELL_IN_BUF);
    g_shell_in_len = 0;
    hal_memset(SHELL_IN_BUF, 0, 64);
    return;
  }
  if (ascii == 8) {
    if (g_shell_in_len > 0) {
      g_shell_in_len = g_shell_in_len - 1;
      w8(SHELL_IN_BUF + g_shell_in_len, 0);
    }
    return;
  }
  if (ascii >= 32 && ascii <= 126 && g_shell_in_len < 36) {
    w8(SHELL_IN_BUF + g_shell_in_len, ascii);
    g_shell_in_len = g_shell_in_len + 1;
    w8(SHELL_IN_BUF + g_shell_in_len, 0);
  }
}

// 4. Draw & Click: Self-Hosting Compiler & Build Tool (SpiralBuild)
void app_draw_build(int x, int y, int w, int h) {
  hal_rect(x + 4, y + 15, w - 8, h - 36, 16);
  hal_str(x + 8, y + 19, "Self-Hosting SpiralC v1.0", 14, -1);
  hal_str(x + 8, y + 31, "Target: SPIR Unified VM", 15, -1);
  hal_str(x + 8, y + 43, "TitleOverride:", 11, -1);
  hal_itoa(g_cc_parsed_override, NUM_STR_BUF, 10);
  hal_str(x + 124, y + 43, NUM_STR_BUF, 15, -1);

  if (g_cc_last_status == 1) {
    hal_str(x + 8, y + 55, "Status: IMAGE REBUILT OK", 10, -1);
    hal_str(x + 8, y + 67, "Bytes:", 11, -1);
    hal_itoa(g_cc_last_bytes, NUM_STR_BUF, 10);
    hal_str(x + 60, y + 67, NUM_STR_BUF, 15, -1);
  } else {
    hal_str(x + 8, y + 55, "Status: Ready to compile", 7, -1);
  }

  gui_button(x + 4,   y + h - 17, 64, 13, "Compile", 0);
  gui_button(x + 72,  y + h - 17, 62, 13, "AsmCore", 0);
  gui_button(x + 138, y + h - 17, 60, 13, "Reboot", 0);
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

// 5. Draw & Click: Paint Program (SpiralPaint)
void app_draw_paint(int x, int y, int w, int h) {
  // 8-color swatch bar + Clear + Save buttons
  for (int c = 0; c < 8; c++) {
    int col = c + 9;
    hal_rect(x + 4 + c * 11, y + 15, 10, 10, col);
    if (g_paint_color == col) {
      hal_rect(x + 4 + c * 11, y + 25, 10, 2, 15);
    }
  }
  gui_button(x + 94,  y + 15, 28, 11, "Clr", 0);
  gui_button(x + 124, y + 15, 34, 11, "Save", 0);

  // Blit 96x56 canvas at (x + 4, y + 29)
  hal_blit(x + 4, y + 29, 96, 56, PAINT_CANVAS);
}

void app_click_paint(int wid, int rx, int ry) {
  if (ry >= 15 && ry <= 26) {
    if (rx >= 4 && rx < 92) {
      g_paint_color = 9 + ((rx - 4) / 11);
    } else if (rx >= 94 && rx < 122) {
      hal_memset(PAINT_CANVAS, 16, 96 * 56);
      g_Paint_strokes = g_Paint_strokes + 1;
    } else if (rx >= 124 && rx < 158) {
      fs_write("/art/user.pic", PAINT_CANVAS, 96 * 56);
    }
    return;
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
  }
}

// 6. Draw & Click: Calculator (SpiralCalc)
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
  } else if (g_calc_op == 1) {
    g_calc_acc = g_calc_acc + g_calc_cur;
  } else if (g_calc_op == 2) {
    g_calc_acc = g_calc_acc - g_calc_cur;
  } else if (g_calc_op == 3) {
    g_calc_acc = g_calc_acc * g_calc_cur;
  } else if (g_calc_op == 4) {
    if (g_calc_cur != 0) g_calc_acc = g_calc_acc / g_calc_cur;
  }
  g_calc_cur = g_calc_acc;
  g_calc_op = next_op;
  g_calc_entering = 0;
}

void app_draw_calc(int x, int y, int w, int h) {
  hal_rect(x + 4, y + 16, w - 8, 14, 16);
  hal_itoa(g_calc_cur, NUM_STR_BUF, 10);
  hal_str(x + 8, y + 19, NUM_STR_BUF, 14, -1);

  gui_button(x + 4,  y + 33, 24, 13, "7", 0);
  gui_button(x + 30, y + 33, 24, 13, "8", 0);
  gui_button(x + 56, y + 33, 24, 13, "9", 0);
  gui_button(x + 82, y + 33, 24, 13, "+", g_calc_op == 1);

  gui_button(x + 4,  y + 48, 24, 13, "4", 0);
  gui_button(x + 30, y + 48, 24, 13, "5", 0);
  gui_button(x + 56, y + 48, 24, 13, "6", 0);
  gui_button(x + 82, y + 48, 24, 13, "-", g_calc_op == 2);

  gui_button(x + 4,  y + 63, 24, 13, "1", 0);
  gui_button(x + 30, y + 63, 24, 13, "2", 0);
  gui_button(x + 56, y + 63, 24, 13, "3", 0);
  gui_button(x + 82, y + 63, 24, 13, "*", g_calc_op == 3);

  gui_button(x + 4,  y + 78, 24, 13, "C", 0);
  gui_button(x + 30, y + 78, 24, 13, "0", 0);
  gui_button(x + 56, y + 78, 24, 13, "=", 0);
  gui_button(x + 82, y + 78, 24, 13, "/", g_calc_op == 4);
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
  else if (row == 1) calc_press_digit(4 + col);
  else if (row == 2) calc_press_digit(1 + col);
  else if (row == 3) {
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

// 7. Draw: System Monitor (SpiralMon)
void app_draw_sysmon(int x, int y, int w, int h) {
  hal_rect(x + 4, y + 16, w - 8, h - 20, 16);
  if (g_machine_id == 1) hal_str(x + 8, y + 20, "CPU: TabComp TC-32", 14, -1);
  else hal_str(x + 8, y + 20, "CPU: i586 Protected", 14, -1);

  hal_str(x + 8, y + 32, "Tasks:", 11, -1);
  hal_itoa(g_num_tasks, NUM_STR_BUF, 10);
  hal_str(x + 60, y + 32, NUM_STR_BUF, 15, -1);

  hal_str(x + 8, y + 44, "VM Op:", 11, -1);
  hal_itoa(hal_info(2), NUM_STR_BUF, 10);
  hal_str(x + 60, y + 44, NUM_STR_BUF, 15, -1);

  hal_str(x + 8, y + 56, "NetTX:", 11, -1);
  hal_itoa(g_net_tx_pkts, NUM_STR_BUF, 10);
  hal_str(x + 60, y + 56, NUM_STR_BUF, 10, -1);

  hal_str(x + 104, y + 56, "RX:", 11, -1);
  hal_itoa(g_net_rx_pkts, NUM_STR_BUF, 10);
  hal_str(x + 130, y + 56, NUM_STR_BUF, 10, -1);

  // Memory usage bar
  hal_rect(x + 8, y + 70, w - 16, 8, 8);
  hal_rect(x + 8, y + 70, (w - 16) / 3, 8, thm_accent);
}
