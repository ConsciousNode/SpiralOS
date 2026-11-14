// ============================================================================
// SpiralOS 1.4 "Daily Driver" — Master Desktop Compositor, Boot Splash & Event Loop (/src/os.sp)
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

int g_mouse_x;
int g_mouse_y;
int g_mouse_btn;
int g_prev_btn;

int g_l_y;
void litem(int lbl, int col) {
  wstr(8, g_l_y, lbl, col);
  g_l_y = g_l_y + 9;
}

void open_app_by_id(int app_id) {
  int t = 0;
  if (app_id == APP_FILES)     t = "SpiralFiles";
  if (app_id == APP_EDIT)      t = "SpiralEdit";
  if (app_id == APP_SHELL)     t = "SpiralSh";
  if (app_id == APP_BUILD)     t = "SpiralBuild";
  if (app_id == APP_PAINT)     t = "SpiralPaint";
  if (app_id == APP_CALC)      t = "SpiralCalc";
  if (app_id == APP_SYSMON)    t = "SpiralMon";
  if (app_id == APP_THEME)     t = "SpiralTheme";
  if (app_id == APP_VIEWER)    t = "SpiralView";
  if (app_id == APP_SNAKE)     t = "SpiralSnake";
  if (app_id == APP_BLOCKS)    t = "SpiralBlocks";
  if (app_id == APP_CHAT)      t = "SpiralChat";
  if (app_id == APP_TRANSFER)  t = "SpiralSend";
  if (app_id == APP_BROWSER)  wm_open(APP_BROWSER,  26, 22, 236, 132, "SpiralWeb");
  if (app_id == APP_NOTES)     t = "Notes";
  if (app_id == APP_CLOCK)     t = "Clock & Cal";
  if (app_id == APP_SOLITAIRE) t = "Solitaire";
  if (app_id == APP_ABOUT)     t = "About SpiralOS";
  if (t == 0) return;
  int gp = ",+I_1-ff55kS;1aYA/MR}.3TgJOOF4JOM17S?0H\\Q09W48_Q=:UP0.qe--7O/,mi>-cg+*{qC7[Q" + (app_id - 1) * 4;
  wm_open(app_id, (r8(gp) - 35) << 1, (r8(gp + 1) - 35) << 1, ((r8(gp + 2) - 35) << 1) + 80, (r8(gp + 3) - 35) << 1, t);
}

void draw_window_client(int wid) {
  int app = win_app[wid];
  int x = win_x[wid];
  int y = win_y[wid];
  int w = win_w[wid];
  int h = win_h[wid];
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

void dispatch_focused_key(int ascii, int vk, int mods) {
  if (g_focused_win < 0) return;
  int app = win_app[g_focused_win];
  if (app == APP_FILES)     app_key_files(ascii, vk);
  if (app == APP_EDIT)      app_key_edit(ascii, vk);
  if (app == APP_SHELL)     app_key_shell(ascii, vk);
  if (app == APP_CALC)      app_key_calc(ascii);
  if (app == APP_SNAKE)     app_key_snake(ascii, vk);
  if (app == APP_BLOCKS)    app_key_blocks(ascii, vk);
  if (app == APP_CHAT)      app_key_chat(ascii);
  if (app == APP_NOTES)     app_key_notes(ascii, vk, mods);
  if (app == APP_CLOCK)     app_key_clock(ascii, vk);
  if (app == APP_SOLITAIRE) app_key_solitaire(ascii, vk);
}

void app_run_ticks() {
  int now_ms = hal_time();
  for (int i = 0; i < MAX_WINS; i++) {
    if (win_used[i] == 1 && win_min[i] == 0) {
      int app = win_app[i];
      if (app >= 0 && app < 16) {
        int iv = app_tick_interval[app];
        if (iv > 0 && (now_ms - app_tick_last_ms[app]) >= iv) {
          app_tick_last_ms[app] = now_ms;
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
  if (g_machine_id == 1) {
    hal_str(58, 2, "TC-32", thm_accent, -1);
  } else if (g_machine_id == 3) {
    hal_str(58, 2, "Triton", thm_accent, -1);
  } else {
    hal_str(58, 2, "i586", thm_accent, -1);
  }
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

  // 3. Open Windows in back-to-front z-order
  for (int i = 0; i < g_win_count; i++) {
    int wid = win_zorder[i];
    if (wid >= 0 && win_used[wid] == 1 && win_min[wid] == 0) {
      int is_foc = (wid == g_focused_win);
      wm_draw_window_frame(wid, is_foc);
      draw_window_client(wid);
    }
  }

  // 4. Launcher Popup Menu (if open)
  if (g_launcher_open == 1) {
    gui_set_win(0, 0, 320, 200);
    gui_bevel_rect(2, 12, 104, 170, thm_taskbar_bg, thm_btn_hi, thm_btn_sh);
    g_l_y = 15;
    litem("1. Files",     15);
    litem("2. Editor",    15);
    litem("3. Shell",     15);
    litem("4. Compiler",  14);
    litem("5. Paint",     15);
    litem("6. Calc",      15);
    litem("7. SysMon",    15);
    litem("8. Themes",    15);
    litem("9. Viewer",    15);
    litem("10. Snake",    10);
    litem("11. Blocks",   10);
    litem("12. NetChat",  11);
    litem("13. FileBeam", 11);
    litem("14. SpiralWeb",11);
    litem("15. Notes",    14);
    litem("16. Clock",    14);
    litem("17. Solitaire",10);
    litem("18. About",    11);
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
    g_launcher_open = 0;
    if (mx >= 2 && mx < 106 && my >= 14 && my < 183) {
      int item = (my - 15) / 10 + 1;
      if (my >= 155) item = 16 + (my - 155) / 7;
      open_app_by_id(item);
      return;
    }
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

  for (int zi = g_win_count - 1; zi >= 0; zi = zi - 1) {
    int wid = win_zorder[zi];
    if (wid >= 0 && win_used[wid] == 1 && win_min[wid] == 0) {
      int wx = win_x[wid];
      int wy = win_y[wid];
      int ww = win_w[wid];
      int wh = win_h[wid];
      if (mx >= wx && mx < wx + ww && my >= wy && my < wy + wh) {
        wm_focus(wid);
        int rx = mx - wx;
        int ry = my - wy;
        if (ry >= 2 && ry <= 12 && rx >= ww - 12 && rx < ww - 2) {
          wm_close(wid);
          return;
        }
        if (ry >= 2 && ry <= 12 && rx >= ww - 23 && rx < ww - 13) {
          win_min[wid] = 1;
          return;
        }
        if (ry <= 12) {
          g_drag_win = wid;
          g_drag_mode = 1;
          g_drag_ox = rx;
          g_drag_oy = ry;
          return;
        }
        if (rx >= ww - 8 && ry >= wh - 8) {
          g_drag_win = wid;
          g_drag_mode = 2;
          return;
        }
        dispatch_window_click(wid, rx, ry);
        return;
      }
    }
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

void boot_splash() {
  // Draw CNSW mark-over-wordmark lockup (from cnsw-lockup.svg:1-42 & /art/cnsw.pic)
  hal_rect(0, 0, 320, 200, 16);
  int fidx = fs_find("/art/cnsw.pic");
  if (fidx >= 0) {
    hal_blit(120, 24, 80, 80, fs_entry_data_ptr(fidx));
  }
  // Wordmark in ConsciousNode Sans (font 0)
  hal_str(128, 114, "SpiralOS", 15, -1);
  hal_str(44, 130, os_version_str(), 11, -1);
  hal_str(48, 146, "ConsciousNode SoftWorks", 7, -1);
  hal_yield();

  int t0 = hal_time();
  while ((hal_time() - t0) < 1500) {
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

  w32(VMRAM_STATUS + 0x00, 0x53504F53);
  w32(VMRAM_STATUS + 0x1E * 4, wm_active_title_color());

  // Show boot splash on Frame 1 for ~1.5 s or until a key is pressed
  boot_splash();

  while (1) {
    net_poll();
    app_run_ticks();

    int mpack = hal_mouse(VMRAM_STATUS + 0x08);
    g_mouse_x = mpack & 0x3FF;
    g_mouse_y = (mpack >> 10) & 0x3FF;
    g_mouse_btn = (mpack >> 20) & 7;

    if ((g_mouse_btn & 1) != 0) {
      if ((g_prev_btn & 1) == 0) {
        handle_mouse_down(g_mouse_x, g_mouse_y);
      } else if (g_drag_win >= 0) {
        int dw = g_drag_win;
        if (g_drag_mode == 1) {
          int nx = g_mouse_x - g_drag_ox;
          int ny = g_mouse_y - g_drag_oy;
          if (nx < 0) nx = 0;
          if (ny < 12) ny = 12;
          if (nx + win_w[dw] > 320) nx = 320 - win_w[dw];
          if (ny + win_h[dw] > 184) ny = 184 - win_h[dw];
          win_x[dw] = nx;
          win_y[dw] = ny;
        } else if (g_drag_mode == 2) {
          int nw = g_mouse_x - win_x[dw] + 2;
          int nh = g_mouse_y - win_y[dw] + 2;
          if (nw < 80) nw = 80;
          if (nh < 50) nh = 50;
          if (win_x[dw] + nw > 320) nw = 320 - win_x[dw];
          if (win_y[dw] + nh > 184) nh = 184 - win_y[dw];
          win_w[dw] = nw;
          win_h[dw] = nh;
        }
      } else if (g_focused_win >= 0 && win_app[g_focused_win] == APP_PAINT) {
        app_click_paint(g_focused_win, g_mouse_x - win_x[g_focused_win], g_mouse_y - win_y[g_focused_win]);
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
