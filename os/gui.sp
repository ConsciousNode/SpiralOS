// ============================================================================
// SpiralOS — Theme Engine & Alternate-Universe GUI Toolkit (/src/gui.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Reads & writes plain-text .thm files in /themes/*.thm, draws procedural
// wallpapers, chamfered/beveled window frames, buttons, icons, and cursors.
// ============================================================================

// from spiralos/os/gui.sp:9-125
int thm_desk_top;
int thm_desk_bot;
int thm_taskbar_bg;
int thm_taskbar_fg;
int thm_win_bg;
int thm_win_border;
int thm_title_active;
int thm_title_inactive;
int thm_title_text;
int thm_btn_face;
int thm_btn_hi;
int thm_btn_sh;
int thm_accent;
int thm_wallpaper_style;
int thm_bevel_style;
int g_current_theme_idx;

void theme_defaults() {
  thm_desk_top = 16;
  thm_desk_bot = 22;
  thm_taskbar_bg = 18;
  thm_taskbar_fg = 15;
  thm_win_bg = 24;
  thm_win_border = 11;
  thm_title_active = 68;
  thm_title_inactive = 20;
  thm_title_text = 15;
  thm_btn_face = 28;
  thm_btn_hi = 11;
  thm_btn_sh = 17;
  thm_accent = 14;
  thm_wallpaper_style = 0;
  thm_bevel_style = 1;
}

int match_prefix(int ptr, int pat) {
  int i = 0;
  while (r8(pat + i) != 0) {
    if (r8(ptr + i) != r8(pat + i)) return 0;
    i = i + 1;
  }
  return i;
}

int parse_int_at(int ptr) {
  int v = 0;
  int i = 0;
  while (r8(ptr + i) >= 48 && r8(ptr + i) <= 57) {
    v = v * 10 + (r8(ptr + i) - 48);
    i = i + 1;
  }
  return v;
}

int theme_load_file(int path_str) {
  theme_defaults();
  int idx = fs_find(path_str);
  if (idx < 0) return -1;
  int data = fs_entry_data_ptr(idx);
  int sz = fs_entry_size(idx);
  int p = 0;
  while (p < sz) {
    int line_ptr = data + p;
    int klen = 0;
    klen = match_prefix(line_ptr, "desk_top=");
    if (klen > 0) thm_desk_top = parse_int_at(line_ptr + klen);
    klen = match_prefix(line_ptr, "desk_bot=");
    if (klen > 0) thm_desk_bot = parse_int_at(line_ptr + klen);
    klen = match_prefix(line_ptr, "taskbar_bg=");
    if (klen > 0) thm_taskbar_bg = parse_int_at(line_ptr + klen);
    klen = match_prefix(line_ptr, "taskbar_fg=");
    if (klen > 0) thm_taskbar_fg = parse_int_at(line_ptr + klen);
    klen = match_prefix(line_ptr, "win_bg=");
    if (klen > 0) thm_win_bg = parse_int_at(line_ptr + klen);
    klen = match_prefix(line_ptr, "win_border=");
    if (klen > 0) thm_win_border = parse_int_at(line_ptr + klen);
    klen = match_prefix(line_ptr, "title_active=");
    if (klen > 0) thm_title_active = parse_int_at(line_ptr + klen);
    klen = match_prefix(line_ptr, "title_inactive=");
    if (klen > 0) thm_title_inactive = parse_int_at(line_ptr + klen);
    klen = match_prefix(line_ptr, "title_text=");
    if (klen > 0) thm_title_text = parse_int_at(line_ptr + klen);
    klen = match_prefix(line_ptr, "btn_face=");
    if (klen > 0) thm_btn_face = parse_int_at(line_ptr + klen);
    klen = match_prefix(line_ptr, "btn_hi=");
    if (klen > 0) thm_btn_hi = parse_int_at(line_ptr + klen);
    klen = match_prefix(line_ptr, "btn_sh=");
    if (klen > 0) thm_btn_sh = parse_int_at(line_ptr + klen);
    klen = match_prefix(line_ptr, "accent=");
    if (klen > 0) thm_accent = parse_int_at(line_ptr + klen);
    klen = match_prefix(line_ptr, "wallpaper_style=");
    if (klen > 0) thm_wallpaper_style = parse_int_at(line_ptr + klen);
    klen = match_prefix(line_ptr, "bevel_style=");
    if (klen > 0) thm_bevel_style = parse_int_at(line_ptr + klen);

    while (p < sz && r8(data + p) != 10) p = p + 1;
    p = p + 1;
  }
  return 0;
}

void theme_select(int idx) {
  g_current_theme_idx = idx & 3;
  if (g_current_theme_idx == 0) theme_load_file("/themes/spiral.thm");
  if (g_current_theme_idx == 1) theme_load_file("/themes/amber.thm");
  if (g_current_theme_idx == 2) theme_load_file("/themes/oberon.thm");
  if (g_current_theme_idx == 3) theme_load_file("/themes/jade.thm");
}

void gui_bevel_rect(int x, int y, int w, int h, int face, int hi, int sh) {
  hal_rect(x, y, w, h, face);
  hal_rect(x, y, w, 1, hi);
  hal_rect(x, y, 1, h, hi);
  hal_rect(x, y + h - 1, w, 1, sh);
  hal_rect(x + w - 1, y, 1, h, sh);
}

// 1.2 F1: Clipped string & window-bounded widget helpers
void gui_str_clip(int x, int y, int s, int max_c, int fg, int bg) {
  int i = 0;
  while (i < max_c && r8(s + i) != 0) {
    hal_char(x + i * 8, y, r8(s + i), fg, bg);
    i = i + 1;
  }
}

void gui_win_str(int wx, int wy, int ww, int wh, int sx, int sy, int s, int fg, int bg) {
  if (sy < wy + 14 || sy + 8 > wy + wh - 3) return;
  int max_c = (wx + ww - 4 - sx) / 8;
  if (max_c <= 0) return;
  gui_str_clip(sx, sy, s, max_c, fg, bg);
}

// from spiralos/os/gui.sp:126-140 (modified for 1.2 F1: clip button label to button width)
void gui_button(int x, int y, int w, int h, int label_str, int active) {
  if (w <= 2 || h <= 2) return;
  int face = thm_btn_face;
  int hi = thm_btn_hi;
  int sh = thm_btn_sh;
  if (active) {
    face = thm_title_active;
    hi = thm_btn_sh;
    sh = thm_btn_hi;
  }
  gui_bevel_rect(x, y, w, h, face, hi, sh);
  int max_c = (w - 2) / 8;
  int slen = hal_strlen(label_str);
  if (slen > max_c) slen = max_c;
  if (slen > 0 && h >= 8) {
    int tx = x + ((w - slen * 8) >> 1);
    int ty = y + ((h - 8) >> 1);
    gui_str_clip(tx, ty, label_str, slen, thm_title_text, -1);
  }
}

void gui_win_btn(int wx, int wy, int ww, int wh, int bx, int by, int bw, int bh, int label_str, int active) {
  if (by < wy + 14 || by + bh > wy + wh - 2) return;
  int right_lim = wx + ww - 4;
  if (bx + 6 > right_lim) return;
  if (bx + bw > right_lim) bw = right_lim - bx;
  gui_button(bx, by, bw, bh, label_str, active);
}

// from spiralos/os/gui.sp:142-197
void gui_draw_wallpaper() {
  // Gradient background bands (y = 12 .. 183)
  for (int band = 0; band < 6; band++) {
    int by = 12 + band * 29;
    int col = thm_desk_top + band;
    hal_rect(0, by, 320, 29, col);
  }
  // Alternate-universe geometric horizon & Helix motif
  if (thm_wallpaper_style == 0 || thm_wallpaper_style == 3) {
    // Concentric Aether rings & grid nodes
    for (int r = 1; r <= 4; r++) {
      int rw = r * 28;
      int rh = r * 16;
      int rx = 160 - (rw >> 1);
      int ry = 96 - (rh >> 1);
      hal_rect(rx, ry, rw, 1, thm_desk_bot + 2);
      hal_rect(rx, ry + rh, rw, 1, thm_desk_bot + 2);
      hal_rect(rx, ry, 1, rh, thm_desk_bot + 2);
      hal_rect(rx + rw, ry, 1, rh, thm_desk_bot + 2);
    }
  } else if (thm_wallpaper_style == 1) {
    // Kyoto Amber phosphor scanline grid
    for (int gy = 20; gy < 180; gy += 16) {
      hal_rect(0, gy, 320, 1, thm_desk_bot + 3);
    }
  } else {
    // ETH Ceres dot matrix paper
    for (int py = 24; py < 180; py += 16) {
      for (int px = 16; px < 310; px += 16) {
        hal_rect(px, py, 1, 1, 8);
      }
    }
  }
}

void gui_draw_icon(int x, int y, int icon_id, int label_str) {
  // 18x16 stylized alternate-80s cartridge/glyph badge
  gui_bevel_rect(x + 7, y, 18, 15, thm_btn_face, thm_btn_hi, thm_btn_sh);
  hal_rect(x + 9, y + 2, 14, 3, thm_title_active);
  hal_rect(x + 10, y + 7, 12, 5, thm_accent);
  hal_char(x + 12, y + 4, 65 + (icon_id % 26), 15, -1);
  int slen = hal_strlen(label_str);
  int lx = x + 16 - (slen * 4);
  hal_str(lx, y + 17, label_str, thm_taskbar_fg, thm_taskbar_bg);
}

void gui_draw_cursor(int mx, int my) {
  // Distinctive SpiralOS cross-chevron pointer
  hal_rect(mx, my, 7, 2, 15);
  hal_rect(mx, my, 2, 7, 15);
  hal_rect(mx + 2, my + 2, 2, 2, thm_accent);
  hal_rect(mx + 4, my + 4, 2, 2, thm_accent);
  hal_rect(mx + 1, my + 1, 5, 1, 0);
  hal_rect(mx + 1, my + 1, 1, 5, 0);
}
