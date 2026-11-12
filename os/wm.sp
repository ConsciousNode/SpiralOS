// ============================================================================
// SpiralOS — Window Manager & Desktop Chrome (/src/wm.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
//
// NOTE FOR SELF-HOSTING DEMO (§3):
// Changing WM_TITLE_COLOR_OVERRIDE below (e.g. from 0 to 196) in SpiralOS's
// Text Editor, compiling with SpiralBuild, and rebooting visibly changes the
// active window title-bar color across the entire desktop!
// ============================================================================

const WM_TITLE_COLOR_OVERRIDE = 0;

// from spiralos/os/wm.sp:13-166
const MAX_WINS = 12;
const APP_FILES    = 1;
const APP_EDIT     = 2;
const APP_SHELL    = 3;
const APP_BUILD    = 4;
const APP_PAINT    = 5;
const APP_CALC     = 6;
const APP_SYSMON   = 7;
const APP_THEME    = 8;
const APP_VIEWER   = 9;
const APP_SNAKE    = 10;
const APP_BLOCKS   = 11;
const APP_CHAT     = 12;
const APP_TRANSFER = 13;
const APP_BROWSER  = 14;

int win_used[12];
int win_app[12];
int win_x[12];
int win_y[12];
int win_w[12];
int win_h[12];
int win_min[12];
int win_title[12];
int win_zorder[12];
int g_win_count;
int g_focused_win;

int g_drag_win;
int g_drag_mode; // 0=none, 1=move, 2=resize
int g_drag_ox;
int g_drag_oy;
int g_launcher_open;

void wm_init() {
  g_win_count = 0;
  g_focused_win = -1;
  g_drag_win = -1;
  g_drag_mode = 0;
  g_launcher_open = 0;
  for (int i = 0; i < MAX_WINS; i++) {
    win_used[i] = 0;
    win_min[i] = 0;
    win_zorder[i] = -1;
  }
}

void wm_focus(int wid) {
  if (wid < 0 || wid >= MAX_WINS) return;
  if (win_used[wid] == 0) return;
  win_min[wid] = 0;
  int pos = -1;
  for (int i = 0; i < g_win_count; i++) {
    if (win_zorder[i] == wid) { pos = i; break; }
  }
  if (pos >= 0) {
    for (int j = pos; j < g_win_count - 1; j++) {
      win_zorder[j] = win_zorder[j + 1];
    }
    win_zorder[g_win_count - 1] = wid;
  }
  g_focused_win = wid;
  w32(VMRAM_STATUS + 0x18, win_app[wid]);
}

int wm_open(int app_id, int x, int y, int w, int h, int title_str) {
  // Check if app already has an open window
  for (int i = 0; i < MAX_WINS; i++) {
    if (win_used[i] == 1 && win_app[i] == app_id) {
      wm_focus(i);
      return i;
    }
  }
  int wid = -1;
  for (int k = 0; k < MAX_WINS; k++) {
    if (win_used[k] == 0) { wid = k; break; }
  }
  if (wid < 0) return -1;

  win_used[wid] = 1;
  win_app[wid] = app_id;
  win_x[wid] = x;
  win_y[wid] = y;
  win_w[wid] = w;
  win_h[wid] = h;
  win_min[wid] = 0;
  win_title[wid] = title_str;
  win_zorder[g_win_count] = wid;
  g_win_count = g_win_count + 1;
  task_spawn(app_id, wid);
  wm_focus(wid);
  w32(VMRAM_STATUS + 0x14, g_win_count);
  return wid;
}

void wm_close(int wid) {
  if (wid < 0 || wid >= MAX_WINS) return;
  if (win_used[wid] == 0) return;
  win_used[wid] = 0;
  task_kill_by_win(wid);
  int pos = -1;
  for (int i = 0; i < g_win_count; i++) {
    if (win_zorder[i] == wid) { pos = i; break; }
  }
  if (pos >= 0) {
    for (int j = pos; j < g_win_count - 1; j++) {
      win_zorder[j] = win_zorder[j + 1];
    }
    g_win_count = g_win_count - 1;
  }
  if (g_win_count > 0) {
    g_focused_win = win_zorder[g_win_count - 1];
    w32(VMRAM_STATUS + 0x18, win_app[g_focused_win]);
  } else {
    g_focused_win = -1;
  }
  w32(VMRAM_STATUS + 0x14, g_win_count);
}

int wm_active_title_color() {
  if (WM_TITLE_COLOR_OVERRIDE > 0) {
    return WM_TITLE_COLOR_OVERRIDE;
  }
  return thm_title_active;
}

void wm_draw_window_frame(int wid, int is_focused) {
  int x = win_x[wid];
  int y = win_y[wid];
  int w = win_w[wid];
  int h = win_h[wid];

  // Drop shadow
  hal_rect(x + 2, y + 2, w, h, 0);

  // Outer bevel & body
  gui_bevel_rect(x, y, w, h, thm_win_bg, thm_btn_hi, thm_btn_sh);

  // Chamfered corner ticks (SpiralOS signature 1991 look)
  hal_rect(x, y, 2, 2, thm_accent);
  hal_rect(x + w - 2, y, 2, 2, thm_accent);

  // Title bar (height 11px)
  int tcol = thm_title_inactive;
  if (is_focused) {
    tcol = wm_active_title_color();
  }
  hal_rect(x + 2, y + 2, w - 4, 11, tcol);

  // Decorative grip lines on active title bar
  if (is_focused) {
    hal_rect(x + 4, y + 5, 2, 5, thm_accent);
  }

  // 1.2 F1: Clip title text to the space before the minimize/close buttons
  int t_cols = (w - 30) / 8;
  if (t_cols > 0) {
    gui_str_clip(x + 8, y + 4, win_title[wid], t_cols, thm_title_text, -1);
  }

  // from spiralos/os/wm.sp:170-180
  // Minimize button [_] at x + w - 22
  gui_bevel_rect(x + w - 22, y + 3, 9, 9, thm_btn_face, thm_btn_hi, thm_btn_sh);
  hal_rect(x + w - 20, y + 9, 5, 2, thm_title_text);

  // Close button [X] at x + w - 11
  gui_bevel_rect(x + w - 11, y + 3, 9, 9, 4, thm_btn_hi, thm_btn_sh);
  hal_char(x + w - 10, y + 4, 'x', 15, -1);

  // Bottom-right resize grip corner
  hal_rect(x + w - 5, y + h - 5, 4, 4, thm_accent);
}
