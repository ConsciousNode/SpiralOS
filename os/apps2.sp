// ============================================================================
// SpiralOS — Core Desktop Applications Part 2 (/src/apps2.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Implements:
//   8.  Settings & Theme Editor SpiralTheme (APP_THEME)
//   9.  Image Viewer SpiralView (APP_VIEWER)
//   10. Game 1: SpiralSnake (APP_SNAKE)
//   11. Game 2: SpiralBlocks (APP_BLOCKS)
//   12. StudioNet Chat SpiralChat (APP_CHAT)
//   13. StudioNet File Transfer SpiralSend (APP_TRANSFER)
//   14. StudioNet Web Browser SpiralWeb + Tiny Server (APP_BROWSER)
// ============================================================================

const CHAT_IN_BUF = 0x04BD00;

int g_viewer_idx;

// Game 1: SpiralSnake state
int snake_x[32];
int snake_y[32];
int g_snake_len;
int g_snake_dx;
int g_snake_dy;
int g_snake_fx;
int g_snake_fy;
int g_snake_score;

// Game 2: SpiralBlocks state
int blocks_grid[80]; // 8 cols x 10 rows
int g_blk_px;
int g_blk_py;
int g_blk_type;
int g_blk_score;

int g_chat_in_len;
int g_ftx_sel_idx;

void apps2_init() {
  g_viewer_idx = 0;

  // Initialize Snake
  g_snake_len = 4;
  for (int i = 0; i < 4; i++) {
    snake_x[i] = 8 - i;
    snake_y[i] = 5;
  }
  g_snake_dx = 1;
  g_snake_dy = 0;
  g_snake_fx = 12;
  g_snake_fy = 6;
  g_snake_score = 0;

  // Initialize Blocks
  for (int k = 0; k < 80; k++) blocks_grid[k] = 0;
  g_blk_px = 3;
  g_blk_py = 1;
  g_blk_type = 1;
  g_blk_score = 0;

  g_chat_in_len = 0;
  hal_memset(CHAT_IN_BUF, 0, 64);
  g_ftx_sel_idx = 0;
}

// 8. Settings & Theme Editor (SpiralTheme)
void app_draw_theme(int x, int y, int w, int h) {
  hal_rect(x + 4, y + 16, w - 8, h - 20, 16);
  hal_str(x + 8, y + 20, "Select Plain-Text Theme:", 14, -1);
  gui_button(x + 8,  y + 32, 68, 13, "1:Aether", g_current_theme_idx == 0);
  gui_button(x + 80, y + 32, 68, 13, "2:Amber",  g_current_theme_idx == 1);
  gui_button(x + 8,  y + 48, 68, 13, "3:Oberon", g_current_theme_idx == 2);
  gui_button(x + 80, y + 48, 68, 13, "4:Jade",   g_current_theme_idx == 3);

  gui_button(x + 8,  y + 66, 68, 13, "TitleCol+", 0);
  gui_button(x + 80, y + 66, 68, 13, "WallStyle", 0);
}

void app_click_theme(int wid, int rx, int ry) {
  if (ry >= 32 && ry <= 45) {
    if (rx >= 8 && rx < 76) theme_select(0);
    else if (rx >= 80 && rx < 148) theme_select(1);
  } else if (ry >= 48 && ry <= 61) {
    if (rx >= 8 && rx < 76) theme_select(2);
    else if (rx >= 80 && rx < 148) theme_select(3);
  } else if (ry >= 66 && ry <= 79) {
    if (rx >= 8 && rx < 76) thm_title_active = (thm_title_active + 4) & 127;
    else if (rx >= 80 && rx < 148) thm_wallpaper_style = (thm_wallpaper_style + 1) & 3;
  }
}

// 9. Image Viewer (SpiralView)
void app_draw_viewer(int x, int y, int w, int h) {
  hal_rect(x + 4, y + 16, w - 8, h - 34, 0);
  if (g_viewer_idx == 0) {
    int f0 = fs_find("/art/spiral.pic");
    if (f0 >= 0) hal_blit(x + 8, y + 18, 96, 56, fs_entry_data_ptr(f0));
    else hal_blit(x + 8, y + 18, 96, 56, PAINT_CANVAS);
  } else {
    hal_blit(x + 8, y + 18, 96, 56, PAINT_CANVAS);
  }
  gui_button(x + 4,  y + h - 15, 52, 12, "NextPic", 0);
  gui_button(x + 60, y + h - 15, 52, 12, "Canvas", 0);
}

void app_click_viewer(int wid, int rx, int ry) {
  int h = win_h[wid];
  if (ry >= h - 15) {
    g_viewer_idx = (g_viewer_idx + 1) & 1;
  }
}

// 10. Game 1: SpiralSnake
void snake_step() {
  int nx = (snake_x[0] + g_snake_dx + 18) % 18;
  int ny = (snake_y[0] + g_snake_dy + 10) % 10;
  for (int i = g_snake_len - 1; i > 0; i = i - 1) {
    snake_x[i] = snake_x[i - 1];
    snake_y[i] = snake_y[i - 1];
  }
  snake_x[0] = nx;
  snake_y[0] = ny;
  if (nx == g_snake_fx && ny == g_snake_fy) {
    g_snake_score = g_snake_score + 10;
    if (g_snake_len < 28) g_snake_len = g_snake_len + 1;
    g_snake_fx = (g_snake_fx * 7 + 3) % 18;
    g_snake_fy = (g_snake_fy * 5 + 2) % 10;
  }
}

void app_draw_snake(int x, int y, int w, int h) {
  hal_rect(x + 4, y + 16, 144, 80, 0);
  // Draw food
  hal_rect(x + 4 + g_snake_fx * 8, y + 16 + g_snake_fy * 8, 7, 7, 12);
  // Draw snake
  for (int i = 0; i < g_snake_len; i++) {
    int col = 10;
    if (i == 0) col = 14;
    hal_rect(x + 4 + snake_x[i] * 8, y + 16 + snake_y[i] * 8, 7, 7, col);
  }
  hal_str(x + 4, y + 98, "Score:", 11, -1);
  hal_itoa(g_snake_score, NUM_STR_BUF, 10);
  hal_str(x + 54, y + 98, NUM_STR_BUF, 15, -1);
  gui_button(x + 96, y + 96, 52, 11, "Step", 0);
}

void app_key_snake(int ascii, int vk) {
  if (vk == 38 || ascii == 'w') { g_snake_dx = 0; g_snake_dy = -1; }
  else if (vk == 40 || ascii == 's') { g_snake_dx = 0; g_snake_dy = 1; }
  else if (vk == 37 || ascii == 'a') { g_snake_dx = -1; g_snake_dy = 0; }
  else if (vk == 39 || ascii == 'd') { g_snake_dx = 1; g_snake_dy = 0; }
  snake_step();
}

void app_click_snake(int wid, int rx, int ry) {
  snake_step();
}

// 11. Game 2: SpiralBlocks
void blocks_step() {
  int ny = g_blk_py + 1;
  if (ny >= 10 || blocks_grid[ny * 8 + g_blk_px] != 0) {
    blocks_grid[g_blk_py * 8 + g_blk_px] = 10 + (g_blk_type & 3);
    g_blk_score = g_blk_score + 5;
    g_blk_py = 0;
    g_blk_px = (g_blk_px + 3) & 7;
    g_blk_type = g_blk_type + 1;
  } else {
    g_blk_py = ny;
  }
}

void app_draw_blocks(int x, int y, int w, int h) {
  hal_rect(x + 4, y + 16, 64, 80, 0);
  for (int r = 0; r < 10; r++) {
    for (int c = 0; c < 8; c++) {
      int cell = blocks_grid[r * 8 + c];
      if (cell != 0) {
        hal_rect(x + 4 + c * 8, y + 16 + r * 8, 7, 7, cell);
      }
    }
  }
  hal_rect(x + 4 + g_blk_px * 8, y + 16 + g_blk_py * 8, 7, 7, 14);
  hal_str(x + 72, y + 20, "Score:", 11, -1);
  hal_itoa(g_blk_score, NUM_STR_BUF, 10);
  hal_str(x + 72, y + 32, NUM_STR_BUF, 15, -1);
  gui_button(x + 72, y + 50, 44, 12, "Drop", 0);
}

void app_key_blocks(int ascii, int vk) {
  if ((vk == 37 || ascii == 'a') && g_blk_px > 0) g_blk_px = g_blk_px - 1;
  else if ((vk == 39 || ascii == 'd') && g_blk_px < 7) g_blk_px = g_blk_px + 1;
  blocks_step();
}

void app_click_blocks(int wid, int rx, int ry) {
  blocks_step();
}

// 12. StudioNet Chat (SpiralChat)
void app_draw_chat(int x, int y, int w, int h) {
  hal_rect(x + 4, y + 16, w - 8, h - 36, 0);
  int lines = g_chat_count;
  if (lines > 4) lines = 4;
  for (int i = 0; i < lines; i++) {
    hal_str(x + 6, y + 18 + i * 11, CHAT_LOG_BUF + i * 64, 11, -1);
  }
  hal_rect(x + 4, y + h - 17, w - 52, 13, 16);
  hal_str(x + 6, y + h - 15, CHAT_IN_BUF, 15, -1);
  gui_button(x + w - 44, y + h - 17, 40, 13, "Send", 0);
}

void app_click_chat(int wid, int rx, int ry) {
  int w = win_w[wid];
  int h = win_h[wid];
  if (ry >= h - 17 && rx >= w - 44) {
    int peer = sns_resolve("peer");
    if (g_chat_in_len > 0) {
      net_send_chat(peer, CHAT_IN_BUF);
      g_chat_in_len = 0;
      hal_memset(CHAT_IN_BUF, 0, 64);
    } else {
      net_send_chat(peer, "Hello across StudioNet!");
    }
  }
}

void app_key_chat(int ascii) {
  if (ascii == 13) {
    int peer = sns_resolve("peer");
    if (g_chat_in_len > 0) {
      net_send_chat(peer, CHAT_IN_BUF);
      g_chat_in_len = 0;
      hal_memset(CHAT_IN_BUF, 0, 64);
    }
    return;
  }
  if (ascii == 8 && g_chat_in_len > 0) {
    g_chat_in_len = g_chat_in_len - 1;
    w8(CHAT_IN_BUF + g_chat_in_len, 0);
    return;
  }
  if (ascii >= 32 && ascii <= 126 && g_chat_in_len < 28) {
    w8(CHAT_IN_BUF + g_chat_in_len, ascii);
    g_chat_in_len = g_chat_in_len + 1;
    w8(CHAT_IN_BUF + g_chat_in_len, 0);
  }
}

// 13. StudioNet File Transfer (SpiralSend)
void app_draw_transfer(int x, int y, int w, int h) {
  hal_rect(x + 4, y + 16, w - 8, h - 36, 16);
  hal_str(x + 8, y + 20, "SSP Reliable File Beam", 14, -1);
  int fidx = fs_nth_index(g_ftx_sel_idx);
  if (fidx >= 0) {
    hal_str(x + 8, y + 32, "File:", 11, -1);
    hal_str(x + 50, y + 32, fs_entry_ptr(fidx), 15, -1);
  }
  hal_str(x + 8, y + 44, "RX Files:", 11, -1);
  hal_itoa(g_ftx_rx_count, NUM_STR_BUF, 10);
  hal_str(x + 84, y + 44, NUM_STR_BUF, 10, -1);
  if (r8(FTX_LAST_FILE) != 0) {
    hal_str(x + 8, y + 56, "Last:", 11, -1);
    hal_str(x + 50, y + 56, FTX_LAST_FILE, 15, -1);
  }
  gui_button(x + 4,  y + h - 17, 54, 13, "NextFile", 0);
  gui_button(x + 62, y + h - 17, 74, 13, "BeamToPeer", 0);
}

void app_click_transfer(int wid, int rx, int ry) {
  int h = win_h[wid];
  if (ry >= h - 17) {
    if (rx >= 4 && rx < 58) {
      g_ftx_sel_idx = (g_ftx_sel_idx + 1) % fs_count();
    } else if (rx >= 62) {
      int fidx = fs_nth_index(g_ftx_sel_idx);
      if (fidx >= 0) {
        int peer = sns_resolve("peer");
        net_send_file(peer, fs_entry_ptr(fidx));
      }
    }
  }
}

// 14. StudioNet Web Browser (SpiralWeb + Tiny Server SpiralHttpd + Sonder Gateway)
void app_draw_browser(int x, int y, int w, int h) {
  gui_button(x + 4,   y + 15, 52, 11, "PeerWeb", 0);
  gui_button(x + 58,  y + 15, 60, 11, "SonderGW", 0);
  gui_button(x + 120, y + 15, 48, 11, "Local", 0);

  hal_rect(x + 4, y + 28, w - 8, h - 32, 16);
  // Render simple HTML subset (<h1>, <p>, <a href=...>) from WEB_PAGE_BUF
  int p = 0;
  int ry = y + 32;
  int cx = x + 8;
  int col = 15;
  while (r8(WEB_PAGE_BUF + p) != 0 && ry < y + h - 12) {
    if (r8(WEB_PAGE_BUF + p) == 60) { // '<' tag
      if (match_prefix(WEB_PAGE_BUF + p, "<h1>") > 0) {
        col = 14; p = p + 4; cx = x + 8; continue;
      }
      if (match_prefix(WEB_PAGE_BUF + p, "</h1>") > 0) {
        col = 15; p = p + 5; ry = ry + 11; cx = x + 8; continue;
      }
      if (match_prefix(WEB_PAGE_BUF + p, "<p>") > 0) {
        col = 15; p = p + 3; cx = x + 8; continue;
      }
      if (match_prefix(WEB_PAGE_BUF + p, "</p>") > 0) {
        p = p + 4; ry = ry + 10; cx = x + 8; continue;
      }
      if (match_prefix(WEB_PAGE_BUF + p, "<a ") > 0) {
        col = 11;
        while (r8(WEB_PAGE_BUF + p) != 0 && r8(WEB_PAGE_BUF + p) != 62) p = p + 1;
        if (r8(WEB_PAGE_BUF + p) == 62) p = p + 1;
        continue;
      }
      if (match_prefix(WEB_PAGE_BUF + p, "</a>") > 0) {
        col = 15; p = p + 4; continue;
      }
      while (r8(WEB_PAGE_BUF + p) != 0 && r8(WEB_PAGE_BUF + p) != 62) p = p + 1;
      if (r8(WEB_PAGE_BUF + p) == 62) p = p + 1;
      continue;
    }
    int ch = r8(WEB_PAGE_BUF + p);
    if (ch == 10) {
      ry = ry + 9;
      cx = x + 8;
    } else if (ch >= 32) {
      if (cx + 8 < x + w - 6) {
        hal_char(cx, ry, ch, col, -1);
        cx = cx + 8;
      } else {
        ry = ry + 9;
        cx = x + 8;
        hal_char(cx, ry, ch, col, -1);
        cx = cx + 8;
      }
    }
    p = p + 1;
  }
}

void app_click_browser(int wid, int rx, int ry) {
  if (ry >= 15 && ry <= 26) {
    if (rx >= 4 && rx < 56) {
      int peer = sns_resolve("peer");
      net_http_get(peer, "/index.hts");
    } else if (rx >= 58 && rx < 118) {
      int sonder = sns_resolve("sonder.gw");
      net_http_get(sonder, "/atlas");
    } else if (rx >= 120 && rx < 168) {
      int widx = fs_find("/www/index.hts");
      if (widx >= 0) {
        hal_memset(WEB_PAGE_BUF, 0, 2048);
        hal_memcpy(WEB_PAGE_BUF, fs_entry_data_ptr(widx), fs_entry_size(widx));
      }
    }
  }
}
