// ============================================================================
// SpiralOS — Master Desktop Compositor, Event Loop & Entry Point (/src/os.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
// ============================================================================

import "/src/kernel.sp";
import "/src/fs.sp";
import "/src/gui.sp";
import "/src/wm.sp";
import "/src/net.sp";
import "/src/cc.sp";
import "/src/apps1.sp";
import "/src/apps2.sp";

int g_mouse_x;
int g_mouse_y;
int g_mouse_btn;
int g_prev_btn;

void open_app_by_id(int app_id) {
  if (app_id == APP_FILES)    wm_open(APP_FILES,    18, 16, 156, 120, "SpiralFiles");
  if (app_id == APP_EDIT)     wm_open(APP_EDIT,     28, 20, 214, 134, "SpiralEdit");
  if (app_id == APP_SHELL)    wm_open(APP_SHELL,    36, 36, 224, 96,  "SpiralSh");
  if (app_id == APP_BUILD)    wm_open(APP_BUILD,    48, 28, 204, 108, "SpiralBuild");
  if (app_id == APP_PAINT)    wm_open(APP_PAINT,    60, 24, 164, 94,  "SpiralPaint");
  if (app_id == APP_CALC)     wm_open(APP_CALC,     180, 22, 112, 98, "SpiralCalc");
  if (app_id == APP_SYSMON)   wm_open(APP_SYSMON,   136, 78, 168, 88, "SpiralMon");
  if (app_id == APP_THEME)    wm_open(APP_THEME,    70, 34, 158, 88,  "SpiralTheme");
  if (app_id == APP_VIEWER)   wm_open(APP_VIEWER,   84, 28, 120, 96,  "SpiralView");
  if (app_id == APP_SNAKE)    wm_open(APP_SNAKE,    56, 26, 154, 114, "SpiralSnake");
  if (app_id == APP_BLOCKS)   wm_open(APP_BLOCKS,   92, 26, 124, 104, "SpiralBlocks");
  if (app_id == APP_CHAT)     wm_open(APP_CHAT,     34, 42, 200, 92,  "SpiralChat");
  if (app_id == APP_TRANSFER) wm_open(APP_TRANSFER, 52, 46, 180, 90,  "SpiralSend");
  if (app_id == APP_BROWSER)  wm_open(APP_BROWSER,  26, 22, 236, 132, "SpiralWeb");
}

void draw_window_client(int wid) {
  int app = win_app[wid];
  int x = win_x[wid];
  int y = win_y[wid];
  int w = win_w[wid];
  int h = win_h[wid];
  if (app == APP_FILES)    app_draw_files(x, y, w, h);
  if (app == APP_EDIT)     app_draw_edit(x, y, w, h);
  if (app == APP_SHELL)    app_draw_shell(x, y, w, h);
  if (app == APP_BUILD)    app_draw_build(x, y, w, h);
  if (app == APP_PAINT)    app_draw_paint(x, y, w, h);
  if (app == APP_CALC)     app_draw_calc(x, y, w, h);
  if (app == APP_SYSMON)   app_draw_sysmon(x, y, w, h);
  if (app == APP_THEME)    app_draw_theme(x, y, w, h);
  if (app == APP_VIEWER)   app_draw_viewer(x, y, w, h);
  if (app == APP_SNAKE)    app_draw_snake(x, y, w, h);
  if (app == APP_BLOCKS)   app_draw_blocks(x, y, w, h);
  if (app == APP_CHAT)     app_draw_chat(x, y, w, h);
  if (app == APP_TRANSFER) app_draw_transfer(x, y, w, h);
  if (app == APP_BROWSER)  app_draw_browser(x, y, w, h);
}

void dispatch_window_click(int wid, int rx, int ry) {
  int app = win_app[wid];
  if (app == APP_FILES)    app_click_files(wid, rx, ry);
  if (app == APP_EDIT)     app_click_edit(wid, rx, ry);
  if (app == APP_BUILD)    app_click_build(wid, rx, ry);
  if (app == APP_PAINT)    app_click_paint(wid, rx, ry);
  if (app == APP_CALC)     app_click_calc(wid, rx, ry);
  if (app == APP_THEME)    app_click_theme(wid, rx, ry);
  if (app == APP_VIEWER)   app_click_viewer(wid, rx, ry);
  if (app == APP_SNAKE)    app_click_snake(wid, rx, ry);
  if (app == APP_BLOCKS)   app_click_blocks(wid, rx, ry);
  if (app == APP_CHAT)     app_click_chat(wid, rx, ry);
  if (app == APP_TRANSFER) app_click_transfer(wid, rx, ry);
  if (app == APP_BROWSER)  app_click_browser(wid, rx, ry);
}

void dispatch_focused_key(int ascii, int vk) {
  if (g_focused_win < 0) return;
  int app = win_app[g_focused_win];
  if (app == APP_EDIT)   app_key_edit(ascii, vk);
  if (app == APP_SHELL)  app_key_shell(ascii, vk);
  if (app == APP_CALC)   app_key_calc(ascii);
  if (app == APP_SNAKE)  app_key_snake(ascii, vk);
  if (app == APP_BLOCKS) app_key_blocks(ascii, vk);
  if (app == APP_CHAT)   app_key_chat(ascii);
}

void draw_desktop_scene() {
  // 1. Top Aether Status Bar (y = 0..11)
  hal_rect(0, 0, 320, 12, thm_taskbar_bg);
  hal_rect(0, 11, 320, 1, thm_btn_hi);
  gui_button(2, 1, 52, 10, "Spiral", g_launcher_open);
  if (g_machine_id == 1) {
    hal_str(60, 2, "TC-32", thm_accent, -1);
  } else {
    hal_str(60, 2, "i586", thm_accent, -1);
  }
  gui_button(108, 1, 36, 10, "Thm", 0);
  gui_button(148, 1, 44, 10, "Build", 0);
  hal_str(200, 2, "SNet:OK", 10, -1);
  hal_itoa(g_uptime_frames, NUM_STR_BUF, 10);
  hal_str(272, 2, NUM_STR_BUF, thm_taskbar_fg, -1);

  // 2. Wallpaper & Desktop Shortcut Icons
  gui_draw_wallpaper();

  // Left column desktop icons
  gui_draw_icon(6, 18, 5, "Files");
  gui_draw_icon(6, 48, 4, "Edit");
  gui_draw_icon(6, 78, 18, "Shell");
  gui_draw_icon(6, 108, 1, "Build");
  gui_draw_icon(6, 138, 15, "Paint");

  // Right column desktop icons
  gui_draw_icon(280, 18, 2, "Calc");
  gui_draw_icon(280, 48, 12, "Mon");
  gui_draw_icon(280, 78, 7, "Chat");
  gui_draw_icon(280, 108, 22, "Web");
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
    gui_bevel_rect(2, 12, 92, 158, thm_taskbar_bg, thm_btn_hi, thm_btn_sh);
    hal_str(8, 16,  "1. Files",     15, -1);
    hal_str(8, 26,  "2. Editor",    15, -1);
    hal_str(8, 36,  "3. Shell",     15, -1);
    hal_str(8, 46,  "4. Compiler",  14, -1);
    hal_str(8, 56,  "5. Paint",     15, -1);
    hal_str(8, 66,  "6. Calc",      15, -1);
    hal_str(8, 76,  "7. SysMon",    15, -1);
    hal_str(8, 86,  "8. Themes",    15, -1);
    hal_str(8, 96,  "9. Viewer",    15, -1);
    hal_str(8, 106, "10. Snake",    10, -1);
    hal_str(8, 116, "11. Blocks",   10, -1);
    hal_str(8, 126, "12. NetChat",  11, -1);
    hal_str(8, 136, "13. FileBeam", 11, -1);
    hal_str(8, 146, "14. SpiralWeb",11, -1);
    hal_str(8, 158, "15. Reboot",   12, -1);
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
  // 1. Check Top Bar (y < 12)
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

  // 2. Check Launcher Popup Menu
  if (g_launcher_open == 1) {
    g_launcher_open = 0;
    if (mx >= 2 && mx < 94 && my >= 14 && my < 168) {
      int item = (my - 14) / 10 + 1;
      if (item >= 1 && item <= 14) open_app_by_id(item);
      else if (item == 15) hal_reboot();
      return;
    }
  }

  // 3. Check Bottom Taskbar (y >= 184)
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

  // 4. Check Windows from front to back (reverse z-order)
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
        // Close button [X]
        if (ry >= 2 && ry <= 12 && rx >= ww - 12 && rx < ww - 2) {
          wm_close(wid);
          return;
        }
        // Minimize button [_]
        if (ry >= 2 && ry <= 12 && rx >= ww - 23 && rx < ww - 13) {
          win_min[wid] = 1;
          return;
        }
        // Title bar drag
        if (ry <= 12) {
          g_drag_win = wid;
          g_drag_mode = 1;
          g_drag_ox = rx;
          g_drag_oy = ry;
          return;
        }
        // Bottom-right resize grip
        if (rx >= ww - 8 && ry >= wh - 8) {
          g_drag_win = wid;
          g_drag_mode = 2;
          return;
        }
        // Client area click
        dispatch_window_click(wid, rx, ry);
        return;
      }
    }
  }

  // 5. Desktop Icons (left column x = 4..40, right column x = 276..316)
  if (mx >= 4 && mx <= 40) {
    if (my >= 16 && my < 44)  open_app_by_id(APP_FILES);
    if (my >= 46 && my < 74)  open_app_by_id(APP_EDIT);
    if (my >= 76 && my < 104) open_app_by_id(APP_SHELL);
    if (my >= 106 && my < 134) open_app_by_id(APP_BUILD);
    if (my >= 136 && my < 168) open_app_by_id(APP_PAINT);
  }
  if (mx >= 276 && mx <= 316) {
    if (my >= 16 && my < 44)  open_app_by_id(APP_CALC);
    if (my >= 46 && my < 74)  open_app_by_id(APP_SYSMON);
    if (my >= 76 && my < 104) open_app_by_id(APP_CHAT);
    if (my >= 106 && my < 134) open_app_by_id(APP_BROWSER);
    if (my >= 136 && my < 168) open_app_by_id(APP_SNAKE);
  }
}

int main() {
  kernel_init();
  wm_init();
  theme_select(0);
  net_init();
  apps1_init();
  apps2_init();

  // Open two welcoming default windows on boot: System Monitor & SpiralSh Terminal
  open_app_by_id(APP_SYSMON);
  open_app_by_id(APP_SHELL);

  g_mouse_x = 160;
  g_mouse_y = 100;
  g_mouse_btn = 0;
  g_prev_btn = 0;

  // Signal desktop ready magic 'SPOS' (0x53504F53) at VMRAM_STATUS (0x0FFD00)
  w32(VMRAM_STATUS + 0x00, 0x53504F53);
  w32(VMRAM_STATUS + 0x1E * 4, wm_active_title_color());

  while (1) {
    // 1. Poll StudioNet stack
    net_poll();

    // 2. Poll Mouse
    int mpack = hal_mouse(VMRAM_STATUS + 0x08);
    g_mouse_x = mpack & 0x3FF;
    g_mouse_y = (mpack >> 10) & 0x3FF;
    g_mouse_btn = (mpack >> 20) & 7;

    if ((g_mouse_btn & 1) != 0) {
      if ((g_prev_btn & 1) == 0) {
        handle_mouse_down(g_mouse_x, g_mouse_y);
      } else if (g_drag_win >= 0) {
        if (g_drag_mode == 1) {
          int nx = g_mouse_x - g_drag_ox;
          int ny = g_mouse_y - g_drag_oy;
          if (nx < 0) nx = 0;
          if (ny < 12) ny = 12;
          if (nx + win_w[g_drag_win] > 320) nx = 320 - win_w[g_drag_win];
          if (ny + win_h[g_drag_win] > 184) ny = 184 - win_h[g_drag_win];
          win_x[g_drag_win] = nx;
          win_y[g_drag_win] = ny;
        } else if (g_drag_mode == 2) {
          int nw = g_mouse_x - win_x[g_drag_win] + 2;
          int nh = g_mouse_y - win_y[g_drag_win] + 2;
          if (nw < 80) nw = 80;
          if (nh < 50) nh = 50;
          if (win_x[g_drag_win] + nw > 320) nw = 320 - win_x[g_drag_win];
          if (win_y[g_drag_win] + nh > 184) nh = 184 - win_y[g_drag_win];
          win_w[g_drag_win] = nw;
          win_h[g_drag_win] = nh;
        }
      } else if (g_focused_win >= 0 && win_app[g_focused_win] == APP_PAINT) {
        // Continuous paint stroke while dragging inside Paint window
        int rx = g_mouse_x - win_x[g_focused_win];
        int ry = g_mouse_y - win_y[g_focused_win];
        app_click_paint(g_focused_win, rx, ry);
      }
    } else {
      g_drag_win = -1;
      g_drag_mode = 0;
    }
    g_prev_btn = g_mouse_btn;

    // 3. Poll Keyboard (drain all queued events for instant typing response)
    while (1) {
      int kev = hal_key();
      if (kev == 0) break;
      int pressed = (kev >> 16) & 1;
      int vk = (kev >> 8) & 0xFF;
      int ascii = kev & 0xFF;
      if (pressed == 1) {
        dispatch_focused_key(ascii, vk);
      }
    }

    // 4. Update active title color telemetry in VMRAM_STATUS + 0x78
    w32(VMRAM_STATUS + 0x78, wm_active_title_color());

    // 5. Render Desktop & Yield Frame
    draw_desktop_scene();
    hal_yield();
  }
  return 0;
}
