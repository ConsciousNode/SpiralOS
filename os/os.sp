// ============================================================================
// SpiralOS 1.5 "Make It Real" — Master Desktop Compositor, Boot Splash & Event Loop (/src/os.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
// ============================================================================

import "/src/kernel.sp";
import "/src/fs.sp";
import "/src/gui.sp";
import "/src/wm.sp";
import "/src/net.sp";
import "/src/cc.sp";
import "/src/asm.sp";
import "/src/apps1.sp";
import "/src/apps2.sp";

const PC_LAUNCHER_DRIFT    = 0;
const PC_SHUTDOWN_NO_FLUSH = 0;

int g_mouse_x;
int g_mouse_y;
int g_mouse_btn;
int g_prev_btn;

int g_launcher_scroll;
int g_launcher_sel;

int g_ctx_open;
int g_ctx_kind; // 0: text (Cut/Copy/Paste/Select All), 1: Files (Open/Rename/Delete)
int g_ctx_x;
int g_ctx_y;
int g_ctx_sel;

int launcher_item_label(int idx) {
  int s = "1. Files\02. Editor\03. Shell\04. Compiler\05. Paint\06. Calc\07. SysMon\08. Themes\09. Viewer\010. Snake\011. Blocks\012. NetChat\013. FileBeam\014. SpiralWeb\015. Notes\016. Clock\017. Solitaire\018. About";
  for (int i = 0; i < idx; i++) s = s + hal_strlen(s) + 1;
  return s;
}

int launcher_item_app_id(int idx) {
  int id = idx + 1;
  if (id >= 15) id = id + 1;
  return id;
}

void launcher_rebuild_table() {
  if (g_launcher_sel < 0) g_launcher_sel = 0;
  if (g_launcher_sel > 17) g_launcher_sel = 17;
  if (g_launcher_scroll < 0) g_launcher_scroll = 0;
  if (g_launcher_scroll > 1) g_launcher_scroll = 1;
  w32(LAUNCHER_TAB + 0, g_launcher_scroll);
  w32(LAUNCHER_TAB + 4, g_launcher_sel);
  w32(LAUNCHER_TAB + 8, 17);
  w32(LAUNCHER_TAB + 12, 18);
  // Top hover-scroll arrow box: (x=4, y=12, w=100, h=3)
  w32(LAUNCHER_TAB + 16, (4 << 24) | (12 << 16) | (100 << 8) | 3);
  // Bottom hover-scroll arrow box: (x=4, y=168, w=100, h=8)
  w32(LAUNCHER_TAB + 20, (4 << 24) | (168 << 16) | (100 << 8) | 8);

  for (int i = 0; i < 18; i++) {
    int e = LAUNCHER_TAB + 32 + i * 16;
    int row = i - g_launcher_scroll;
    int aid = launcher_item_app_id(i);
    if (row >= 0 && row < 17) {
      w32(e + 0, 4);
      w32(e + 4, 15 + row * 9);
      w32(e + 8, 100);
      w32(e + 12, (aid << 16) | 9);
    } else {
      w32(e + 0, -1);
      w32(e + 4, -1);
      w32(e + 8, 0);
      w32(e + 12, (aid << 16));
    }
  }
}

void os_shutdown() {
  if (PC_SHUTDOWN_NO_FLUSH == 0) {
    if (g_notes_dirty == 1 && r8(NOTES_PATH_BUF) != 0) {
      fs_write(NOTES_PATH_BUF, NOTES_BUF, g_notes_len);
      g_notes_dirty = 0;
    }
    if (g_edit_dirty == 1) {
      edit_save_current();
    }
    if (g_paint_dirty == 1) {
      fs_write("/art/user.pic", PAINT_CANVAS, 96 * 56);
      g_paint_dirty = 0;
    }
    hal_disk_sync(320, 8);
  }

  if (g_machine_id == 2) hal_disk_sync(0xFFFF, 1);
  hal_rect(0, 0, 320, 200, 0);
  hal_str(0, 96, "It is now safe to turn off your computer", 14, -1);
  hal_yield();
  sys(0, 0);
}

void open_app_by_id(int app_id) {
  g_focus_ctl = 0;
  g_foc_is_btn = 0;
  if (app_id == APP_SNAKE) {
    snake_reset();
    app_tick_last_ms[APP_SNAKE] = hal_time();
  }
  if (app_id == APP_BLOCKS) {
    app_tick_last_ms[APP_BLOCKS] = hal_time();
  }
  if (app_id == APP_BROWSER)  wm_open(APP_BROWSER,  26, 22, 236, 132, "SpiralWeb");
  if (app_id == APP_BROWSER || app_id < 1 || app_id > 19 || app_id == 15) return;
  int ts = "SpiralFiles\0SpiralEdit\0SpiralSh\0SpiralBuild\0SpiralPaint\0SpiralCalc\0SpiralMon\0SpiralTheme\0SpiralView\0SpiralSnake\0SpiralBlocks\0SpiralChat\0SpiralSend\0\0\0Notes\0Clock & Cal\0Solitaire\0About SpiralOS";
  int t = ts;
  for (int ti = 1; ti < app_id; ti++) t = t + hal_strlen(t) + 1;
  int gp = ",+I_1-ff55kS;1aYA/MR}.3TgJOOF4JOM17S?0H\\Q09W48_Q=:UP0.qe--7O/,mi>-cg+*{qC7[Q" + (app_id - 1) * 4;
  wm_open(app_id, (r8(gp) - 35) << 1, (r8(gp + 1) - 35) << 1, ((r8(gp + 2) - 35) << 1) + 80, (r8(gp + 3) - 35) << 1, t);
}

void draw_window_client(int wid) {
  int app = win_app[wid];
  int x = win_x[wid];
  int y = win_y[wid];
  int w = win_w[wid];
  int h = win_h[wid];
  g_w_is_foc = (wid == g_focused_win);
  if (g_w_is_foc == 1) {
    g_w_ctl_seq = 0;
    g_foc_is_btn = 0;
  }
  if (app == APP_FILES)     app_draw_files(x, y, w, h);
  if (app == APP_EDIT)      app_draw_edit(x, y, w, h);
  if (app == APP_SHELL)     app_draw_shell(x, y, w, h);
  if (app == APP_BUILD)     app_draw_build(x, y, w, h);
  if (app == APP_PAINT)     app_draw_paint(x, y, w, h);
  if (app == APP_CALC)      app_draw_calc(x, y, w, h);
  if (app == APP_SYSMON)    app_draw_sysmon(x, y, w, h);
  if (app == APP_THEME)     app_draw_theme(x, y, w, h);
  if (app == APP_VIEWER)    app_draw_viewer(x, y, w, h);
  if (app == APP_SNAKE)     app_draw_snake(x, y, w, h);
  if (app == APP_BLOCKS)    app_draw_blocks(x, y, w, h);
  if (app == APP_CHAT)      app_draw_chat(x, y, w, h);
  if (app == APP_TRANSFER)  app_draw_transfer(x, y, w, h);
  if (app == APP_BROWSER)  app_draw_browser(x, y, w, h);
  if (app == APP_NOTES)     app_draw_notes(x, y, w, h);
  if (app == APP_CLOCK)     app_draw_clock(x, y, w, h);
  if (app == APP_SOLITAIRE) app_draw_solitaire(x, y, w, h);
  if (app == APP_ABOUT)     app_draw_about(x, y, w, h);
  if (g_w_is_foc == 1) {
    g_w_ctl_tot = g_w_ctl_seq;
    if (g_w_ctl_tot > 0 && g_focus_ctl >= g_w_ctl_tot) g_focus_ctl = 0;
  }
  g_w_is_foc = 0;
}

void dispatch_window_click(int wid, int rx, int ry) {
  int app = win_app[wid];
  if (app == APP_FILES)     app_click_files(wid, rx, ry);
  if (app == APP_EDIT)      app_click_edit(wid, rx, ry);
  if (app == APP_BUILD)     app_click_build(wid, rx, ry);
  if (app == APP_PAINT)     app_click_paint(wid, rx, ry);
  if (app == APP_CALC)      app_click_calc(wid, rx, ry);
  if (app == APP_THEME)     app_click_theme(wid, rx, ry);
  if (app == APP_VIEWER)    app_click_viewer(wid, rx, ry);
  if (app == APP_SNAKE)     app_click_snake(wid, rx, ry);
  if (app == APP_BLOCKS)    app_click_blocks(wid, rx, ry);
  if (app == APP_CHAT)      app_click_chat(wid, rx, ry);
  if (app == APP_TRANSFER)  app_click_transfer(wid, rx, ry);
  if (app == APP_BROWSER)   app_click_browser(wid, rx, ry);
  if (app == APP_NOTES)     app_click_notes(wid, rx, ry);
  if (app == APP_CLOCK)     app_click_clock(wid, rx, ry);
  if (app == APP_SOLITAIRE) app_click_solitaire(wid, rx, ry);
}

void ctx_exec_item(int item_idx) {
  g_ctx_open = 0;
  if (g_focused_win < 0) return;
  int app = win_app[g_focused_win];
  if (g_ctx_kind == 1 && app == APP_FILES) {
    int fidx = fs_nth_index(g_fm_selected);
    if (item_idx == 0 && fidx >= 0) shell_open_file(fs_entry_ptr(fidx));
    if (item_idx == 1 && fidx >= 0) fm_open_modal(3, fs_entry_ptr(fidx));
    if (item_idx == 2 && fidx >= 0) g_fm_modal_mode = 4;
    return;
  }
  int syn_c = 24;
  if (item_idx == 1) syn_c = 3;
  if (item_idx == 2) syn_c = 22;
  if (item_idx == 3) syn_c = 1;
  dispatch_focused_key(syn_c, 0, 2);
}

void wm_clamp_geom(int fw, int nx, int ny, int nw, int nh) {
  if (nw < 80) nw = 80;
  if (nh < 50) nh = 50;
  if (nx < 0) nx = 0;
  if (ny < 12) ny = 12;
  if (nx + nw > 320) {
    if (nw != win_w[fw]) nw = 320 - nx;
    else nx = 320 - nw;
  }
  if (ny + nh > 184) {
    if (nh != win_h[fw]) nh = 184 - ny;
    else ny = 184 - nh;
  }
  win_x[fw] = nx; win_y[fw] = ny; win_w[fw] = nw; win_h[fw] = nh;
}

void dispatch_focused_key(int ascii, int vk, int mods) {
  g_caret_reset_ms = hal_time();

  // 1. Launcher toggle: Win/Super (vk == 91) or Ctrl+Esc (vk == 27 && (mods & 2))
  if (vk == 91 || (vk == 27 && (mods & 2) != 0)) {
    g_launcher_open = 1 - g_launcher_open;
    g_ctx_open = 0;
    return;
  }

  // 2. Context menu keyboard navigation when open
  if (g_ctx_open == 1) {
    int max_c = 4;
    if (g_ctx_kind == 1) max_c = 3;
    if (vk == 27) { g_ctx_open = 0; return; }
    if (vk == 38) { g_ctx_sel = (g_ctx_sel + max_c - 1) % max_c; return; }
    if (vk == 40) { g_ctx_sel = (g_ctx_sel + 1) % max_c; return; }
    if (ascii == 13 || ascii == 32) { ctx_exec_item(g_ctx_sel); return; }
    return;
  }

  // 3. Launcher keyboard navigation when open
  if (g_launcher_open == 1) {
    if (vk == 27) { g_launcher_open = 0; return; }
    if (vk == 38 && g_launcher_sel > 0) {
      g_launcher_sel = g_launcher_sel - 1;
      if (g_launcher_sel < g_launcher_scroll) g_launcher_scroll = g_launcher_sel;
      return;
    }
    if (vk == 40 && g_launcher_sel < 17) {
      g_launcher_sel = g_launcher_sel + 1;
      if (g_launcher_sel >= g_launcher_scroll + 17) g_launcher_scroll = g_launcher_sel - 16;
      return;
    }
    if (vk == 36 || vk == 33) { g_launcher_sel = 0; g_launcher_scroll = 0; return; }
    if (vk == 35 || vk == 34) { g_launcher_sel = 17; g_launcher_scroll = 1; return; }
    if (ascii == 13 || ascii == 32) {
      g_launcher_open = 0;
      open_app_by_id(launcher_item_app_id(g_launcher_sel));
      return;
    }
    return;
  }

  // 4. Desktop window management shortcuts:
  //    Alt+Tab: cycle windows; Alt+F4 or Ctrl+W: close window;
  //    Alt+Arrows: move window; Alt+Shift+Arrows: resize window.
  if ((mods & 4) != 0) {
    if (vk == 9 && g_win_count > 1) {
      wm_focus(win_zorder[0]);
      return;
    }
    if (vk == 115 && g_focused_win >= 0) {
      wm_close(g_focused_win);
      return;
    }
    if (g_focused_win >= 0 && vk >= 37 && vk <= 40) {
      int fw = g_focused_win;
      int dx = 0; int dy = 0;
      if (vk == 37) dx = -4;
      if (vk == 39) dx = 4;
      if (vk == 38) dy = -4;
      if (vk == 40) dy = 4;
      if ((mods & 1) != 0) wm_clamp_geom(fw, win_x[fw], win_y[fw], win_w[fw] + dx, win_h[fw] + dy);
      else wm_clamp_geom(fw, win_x[fw] + dx, win_y[fw] + dy, win_w[fw], win_h[fw]);
      return;
    }
  }
  if ((mods & 2) != 0 && (ascii == 'w' || ascii == 'W' || ascii == 23)) {
    if (g_focused_win >= 0) wm_close(g_focused_win);
    return;
  }

  if (g_focused_win < 0) return;
  int app = win_app[g_focused_win];

  // 5. Tab / Shift+Tab focus ring navigation (except in Shell when typing a command for Tab completion)
  if (vk == 9 && (mods & 6) == 0) {
    if (app == APP_SHELL && g_shell_in_len > 0 && (mods & 1) == 0) {
      app_key_shell(ascii, vk, mods);
      return;
    }
    if (g_w_ctl_tot > 0) {
      if ((mods & 1) != 0) g_focus_ctl = (g_focus_ctl + g_w_ctl_tot - 1) % g_w_ctl_tot;
      else g_focus_ctl = (g_focus_ctl + 1) % g_w_ctl_tot;
    }
    return;
  }

  // 6. Enter / Space on a focused button control activates that button
  if ((ascii == 13 || ascii == 32) && g_foc_is_btn == 1 && g_dlg_active == 0 && g_fm_modal_mode == 0) {
    dispatch_window_click(g_focused_win, g_foc_rx, g_foc_ry);
    return;
  }

  if (app == APP_FILES)     app_key_files(ascii, vk);
  if (app == APP_EDIT)      app_key_edit(ascii, vk, mods);
  if (app == APP_SHELL)     app_key_shell(ascii, vk, mods);
  if (app == APP_BUILD)     app_key_build(ascii, vk);
  if (app == APP_PAINT)     app_key_paint(ascii, vk, mods);
  if (app == APP_CALC)      app_key_calc(ascii);
  if (app == APP_THEME)     app_key_theme(ascii, vk);
  if (app == APP_VIEWER)    app_key_viewer(ascii, vk);
  if (app == APP_SNAKE)     app_key_snake(ascii, vk);
  if (app == APP_BLOCKS)    app_key_blocks(ascii, vk);
  if (app == APP_CHAT)      app_key_chat(ascii);
  if (app == APP_TRANSFER)  app_key_transfer(ascii, vk);
  if (app == APP_BROWSER)   app_key_browser(ascii, vk);
  if (app == APP_NOTES)     app_key_notes(ascii, vk, mods);
  if (app == APP_CLOCK)     app_key_clock(ascii, vk);
  if (app == APP_SOLITAIRE) app_key_solitaire(ascii, vk);
  if (app == APP_ABOUT)     app_key_about(ascii, vk);
}

void app_run_ticks() {
  int now_ms = hal_time();
  for (int i = 0; i < MAX_WINS; i++) {
    if (win_used[i] == 1 && win_min[i] == 0) {
      int app = win_app[i];
      if (app >= 0 && app < 16) {
        int iv = app_tick_interval[app];
        if (iv > 0 && (now_ms - app_tick_last_ms[app]) >= iv) {
          if (now_ms - app_tick_last_ms[app] > iv * 4) app_tick_last_ms[app] = now_ms;
          else app_tick_last_ms[app] = app_tick_last_ms[app] + iv;
          app_tick_count[app] = app_tick_count[app] + 1;
          if (app == APP_SNAKE)  snake_step();
          if (app == APP_BLOCKS) blocks_step();
        }
      }
    }
  }
}

void draw_desktop_scene() {
  // 1. Top Aether Status Bar (y = 0..11)
  hal_rect(0, 0, 320, 12, thm_taskbar_bg);
  hal_rect(0, 11, 320, 1, thm_btn_hi);
  gui_button(2, 1, 52, 10, "Spiral", g_launcher_open);
  int mstr = "i586";
  if (g_machine_id == 1) mstr = "TC-32";
  if (g_machine_id == 3) mstr = "Triton";
  hal_str(58, 2, mstr, thm_accent, -1);
  gui_button(108, 1, 36, 10, "Thm", 0);
  gui_button(148, 1, 44, 10, "Build", 0);
  if (g_has_snet == 1) {
    if (g_sns_clash_active == 1) {
      gui_str_clip(196, 2, "NODE ID CLASH", 10, 12, -1);
    } else {
      gui_str_clip(196, 2, SNS_DISP_BUF, 10, 10, -1);
    }
  } else {
    hal_str(196, 2, "no network", 12, -1);
  }
  hal_itoa(g_uptime_frames, NUM_STR_BUF, 10);
  hal_str(282, 2, NUM_STR_BUF, thm_taskbar_fg, -1);

  // 2. Wallpaper & Desktop Shortcut Icons
  gui_draw_wallpaper();

  for (int di = 0; di < 4; di++) {
    int dy = 18 + di * 30;
    int l1 = "Files"; int l2 = "Calc";
    if (di == 1) { l1 = "Edit"; l2 = "Mon"; }
    if (di == 2) { l1 = "Shell"; l2 = "Chat"; }
    if (di == 3) { l1 = "Build"; l2 = "Web"; }
    gui_draw_icon(6, dy, r8("FESB" + di) - 64, l1);
    gui_draw_icon(280, dy, r8("CMCT" + di) - 64, l2);
  }
  gui_draw_icon(6, 138, 15, "Paint");
  gui_draw_icon(280, 138, 19, "Game");

  app_run_ticks();

  // 3. Open Windows in back-to-front z-order
  for (int i = 0; i < g_win_count; i++) {
    int wid = win_zorder[i];
    if (wid >= 0 && win_used[wid] == 1 && win_min[wid] == 0) {
      int is_foc = (wid == g_focused_win);
      wm_draw_window_frame(wid, is_foc);
      draw_window_client(wid);
    }
  }

  // 4. Launcher Popup Menu (if open) — drawn & hit-tested from single shared LAUNCHER_TAB
  if (g_launcher_open == 1) {
    launcher_rebuild_table();
    gui_set_win(0, 0, 320, 200);
    gui_bevel_rect(2, 12, 104, 166, thm_taskbar_bg, thm_btn_hi, thm_btn_sh);
    // Top hover-scroll arrow at (4, 12, 100, 3)
    hal_rect(4, 12, 100, 3, thm_btn_face + (g_launcher_scroll > 0) * (thm_accent - thm_btn_face));
    for (int li = 0; li < 18; li++) {
      int e = LAUNCHER_TAB + 32 + li * 16;
      int bx = r32(e + 0);
      int by = r32(e + 4);
      int bw = r32(e + 8);
      int bh = r32(e + 12) & 0xFFFF;
      if (PC_LAUNCHER_DRIFT == 1 && li == 0) bx = bx + 20;
      if (by >= 0) {
        int bg = 16;
        int brd = thm_btn_sh;
        if (li == g_launcher_sel) {
          bg = thm_title_active;
          brd = 14;
        }
        hal_rect(bx, by, bw, bh, bg);
        hal_rect(bx, by, bw, 1, brd);
        hal_rect(bx, by + bh - 1, bw, 1, brd);
        hal_rect(bx, by, 1, bh, brd);
        hal_rect(bx + bw - 1, by, 1, bh, brd);
        gui_str_clip(bx + 4, by + 1, launcher_item_label(li), 11, 15, -1);
      }
    }
    // Bottom hover-scroll arrow at (4, 168, 100, 8)
    hal_rect(4, 168, 100, 8, thm_btn_face + (g_launcher_scroll < 1) * (thm_accent - thm_btn_face));
    hal_str(44, 168, "v v", 15, -1);
  }

  // 4b. Right-Click Context Menu (if open)
  if (g_ctx_open == 1) {
    int n_items = 4;
    if (g_ctx_kind == 1) n_items = 3;
    int ch = 4 + n_items * 9;
    gui_bevel_rect(g_ctx_x, g_ctx_y, 68, ch, 18, thm_btn_hi, thm_btn_sh);
    for (int ci = 0; ci < n_items; ci++) {
      int cy = g_ctx_y + 2 + ci * 9;
      if (ci == g_ctx_sel) hal_rect(g_ctx_x + 2, cy, 64, 9, thm_title_active);
      int clbl = "Cut";
      if (g_ctx_kind == 0) {
        if (ci == 1) clbl = "Copy";
        if (ci == 2) clbl = "Paste";
        if (ci == 3) clbl = "Select All";
      } else {
        if (ci == 0) clbl = "Open";
        if (ci == 1) clbl = "Rename";
        if (ci == 2) clbl = "Delete";
      }
      gui_str_clip(g_ctx_x + 4, cy + 1, clbl, 8, 15, -1);
    }
  }

  // 5. Bottom Helix Taskbar (y = 184..199)
  hal_rect(0, 184, 320, 16, thm_taskbar_bg);
  hal_rect(0, 184, 320, 1, thm_btn_hi);
  int tx = 4;
  for (int k = 0; k < MAX_WINS; k++) {
    if (win_used[k] == 1 && tx + 74 <= 316) {
      gui_button(tx, 186, 72, 12, win_title[k], k == g_focused_win && win_min[k] == 0);
      tx = tx + 75;
    }
  }

  // 6. Mouse Pointer
  gui_draw_cursor(g_mouse_x, g_mouse_y);
}

void handle_mouse_down(int mx, int my) {
  g_caret_reset_ms = hal_time();
  if (g_ctx_open == 1) {
    int n_items = 4;
    if (g_ctx_kind == 1) n_items = 3;
    int ch = 4 + n_items * 9;
    if (mx >= g_ctx_x && mx < g_ctx_x + 68 && my >= g_ctx_y + 2 && my < g_ctx_y + ch - 2) {
      ctx_exec_item((my - g_ctx_y - 2) / 9);
      return;
    }
    g_ctx_open = 0;
  }

  if (my < 12) {
    if (mx >= 2 && mx < 54) {
      g_launcher_open = 1 - g_launcher_open;
      return;
    }
    if (mx >= 108 && mx < 144) {
      theme_select(g_current_theme_idx + 1);
      return;
    }
    if (mx >= 148 && mx < 192) {
      open_app_by_id(APP_BUILD);
      return;
    }
    return;
  }

  if (g_launcher_open == 1) {
    launcher_rebuild_table();
    if (mx >= 4 && mx < 104 && my >= 12 && my < 15) {
      if (g_launcher_scroll > 0) g_launcher_scroll = g_launcher_scroll - 1;
      return;
    }
    if (mx >= 4 && mx < 104 && my >= 168 && my < 177) {
      if (g_launcher_scroll < 1) g_launcher_scroll = g_launcher_scroll + 1;
      return;
    }
    for (int li = 0; li < 18; li++) {
      int e = LAUNCHER_TAB + 32 + li * 16;
      int bx = r32(e + 0);
      int by = r32(e + 4);
      int bw = r32(e + 8);
      int bh = r32(e + 12) & 0xFFFF;
      int aid = r32(e + 12) >> 16;
      if (by >= 0 && mx >= bx && mx < bx + bw && my >= by && my < by + bh) {
        g_launcher_sel = li;
        g_launcher_open = 0;
        open_app_by_id(aid);
        return;
      }
    }
    g_launcher_open = 0;
    return;
  }

  if (my >= 184) {
    int tx = 4;
    for (int k = 0; k < MAX_WINS; k++) {
      if (win_used[k] == 1 && tx + 74 <= 316) {
        if (mx >= tx && mx < tx + 72) {
          win_min[k] = 0;
          wm_focus(k);
          return;
        }
        tx = tx + 75;
      }
    }
    return;
  }

  int wid = wm_hit_win(mx, my);
  if (wid >= 0) {
    int rx = mx - win_x[wid];
    int ry = my - win_y[wid];
    int ww = win_w[wid];
    int wh = win_h[wid];
    if (ry >= 2 && ry <= 12 && rx >= ww - 12 && rx < ww - 2) { wm_close(wid); return; }
    if (ry >= 2 && ry <= 12 && rx >= ww - 23 && rx < ww - 13) { win_min[wid] = 1; return; }
    if (ry <= 12) { g_drag_win = wid; g_drag_mode = 1; g_drag_ox = rx; g_drag_oy = ry; return; }
    if (rx >= ww - 8 && ry >= wh - 8) { g_drag_win = wid; g_drag_mode = 2; return; }
    dispatch_window_click(wid, rx, ry);
    return;
  }

  if (my >= 16 && my < 168 && mx >= 4 && mx <= 40) open_app_by_id((my - 16) / 30 + 1);
  if (mx >= 276 && mx <= 316) {
    int slot = (my - 16) / 30;
    if (slot == 0) open_app_by_id(APP_CALC);
    if (slot == 1) open_app_by_id(APP_SYSMON);
    if (slot == 2) open_app_by_id(APP_CHAT);
    if (slot == 3) open_app_by_id(APP_BROWSER);
    if (my >= 136 && my < 168) open_app_by_id(APP_SNAKE);
  }
}

void handle_right_click(int mx, int my) {
  int wid = wm_hit_win(mx, my);
  if (wid < 0) return;
  int app = win_app[wid];
  int ry = my - win_y[wid];
  if (app == APP_FILES && g_fm_modal_mode == 0) {
    if (ry >= 25 && ry < win_h[wid] - 20) {
      int row = g_fm_scroll + (ry - 26) / 9;
      if (row >= 0 && row < fs_count()) g_fm_selected = row;
    }
    g_ctx_kind = 1;
  } else {
    g_ctx_kind = 0;
  }
  g_ctx_x = mx;
  g_ctx_y = my;
  if (g_ctx_x > 248) g_ctx_x = 248;
  if (g_ctx_y > 140) g_ctx_y = 140;
  g_ctx_sel = 0;
  g_ctx_open = 1;
}

void boot_splash() {
  hal_rect(0, 0, 320, 200, 16);
  int fidx = fs_find("/art/cnsw.pic");
  if (fidx >= 0) {
    hal_blit(120, 24, 80, 80, fs_entry_data_ptr(fidx));
  }
  hal_str(128, 114, "SpiralOS", 15, -1);
  hal_str(44, 130, os_version_str(), 11, -1);
  hal_str(48, 146, "ConsciousNode SoftWorks", 7, -1);
  hal_yield();

  int t0 = hal_time();
  while ((hal_time() - t0) < 3141) {
    int kev = hal_key();
    if (kev != 0) {
      int pressed = (kev >> 16) & 1;
      if (pressed == 1) break;
    }
  }
}

int main() {
  kernel_init();
  wm_init();
  theme_select(0);
  net_init();
  apps1_init();
  apps2_init();

  open_app_by_id(APP_SYSMON);
  open_app_by_id(APP_SHELL);

  g_mouse_x = 160;
  g_mouse_y = 100;
  g_mouse_btn = 0;
  g_prev_btn = 0;
  g_launcher_scroll = 0;
  g_launcher_sel = 0;
  g_ctx_open = 0;
  launcher_rebuild_table();

  w32(VMRAM_STATUS + 0x00, 0x53504F53);
  w32(VMRAM_STATUS + 0x1E * 4, wm_active_title_color());

  boot_splash();

  while (1) {
    net_poll();
    app_run_ticks();

    int mpack = hal_mouse(VMRAM_STATUS + 0x08);
    g_mouse_x = mpack & 0x3FF;
    g_mouse_y = (mpack >> 10) & 0x3FF;
    g_mouse_btn = (mpack >> 20) & 7;

    // Launcher hover-scroll arrows when launcher is open
    if (g_launcher_open == 1 && g_mouse_x >= 4 && g_mouse_x < 104) {
      if (g_mouse_y >= 168 && g_mouse_y < 177 && g_launcher_scroll < 1) {
        g_launcher_scroll = 1;
        launcher_rebuild_table();
      } else if (g_mouse_y >= 12 && g_mouse_y < 15 && g_launcher_scroll > 0) {
        g_launcher_scroll = 0;
        launcher_rebuild_table();
      }
    }

    if ((g_mouse_btn & 2) != 0 && (g_prev_btn & 2) == 0) {
      handle_right_click(g_mouse_x, g_mouse_y);
    }

    if ((g_mouse_btn & 1) != 0) {
      if ((g_prev_btn & 1) == 0) {
        handle_mouse_down(g_mouse_x, g_mouse_y);
      } else if (g_drag_win >= 0) {
        int dw = g_drag_win;
        if (g_drag_mode == 1) wm_clamp_geom(dw, g_mouse_x - g_drag_ox, g_mouse_y - g_drag_oy, win_w[dw], win_h[dw]);
        else if (g_drag_mode == 2) wm_clamp_geom(dw, win_x[dw], win_y[dw], g_mouse_x - win_x[dw] + 2, g_mouse_y - win_y[dw] + 2);
      } else if (g_focused_win >= 0) {
        int fapp = win_app[g_focused_win];
        int frx = g_mouse_x - win_x[g_focused_win];
        int fry = g_mouse_y - win_y[g_focused_win];
        if (fapp == APP_PAINT) {
          app_click_paint(g_focused_win, frx, fry);
        } else if (fapp == APP_NOTES && fry >= 27 && frx < win_w[g_focused_win] - 12) {
          int npos = notes_pos_from_xy(win_w[g_focused_win], frx, fry);
          g_notes_cursor = npos;
          g_notes_sel_end = npos;
        } else if (fapp == APP_EDIT && fry >= 28 && frx < win_w[g_focused_win] - 12) {
          int epos = edit_pos_from_xy(frx, fry);
          g_edit_cursor = epos;
          g_edit_sel_b = epos;
        }
      }
    } else {
      g_drag_win = -1;
      g_drag_mode = 0;
    }
    g_prev_btn = g_mouse_btn;

    while (1) {
      int kev = hal_key();
      if (kev == 0) break;
      if ((kev >> 16) & 1) {
        dispatch_focused_key(kev & 0xFF, (kev >> 8) & 0xFF, (kev >> 24) & 0xFF);
      }
    }

    w32(VMRAM_STATUS + 0x78, wm_active_title_color());

    draw_desktop_scene();
    hal_yield();
  }
  return 0;
}
