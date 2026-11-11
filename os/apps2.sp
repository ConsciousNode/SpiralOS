// ============================================================================
// SpiralOS 1.1 — Core Desktop Applications Part 2 (/src/apps2.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Implements:
//   8.  Settings & Theme Editor SpiralTheme (APP_THEME)
//   9.  Image Viewer SpiralView (APP_VIEWER)
//   10. Game 1: SpiralSnake (APP_SNAKE) — Real-Time App Tick + StudioNet Multiplayer
//   11. Game 2: SpiralBlocks (APP_BLOCKS) — Real-Time Falling App Tick
//   12. StudioNet Chat SpiralChat (APP_CHAT)
//   13. StudioNet File Transfer SpiralSend (APP_TRANSFER)
//   14. StudioNet Web Browser SpiralWeb (APP_BROWSER) — Links, History & Inline Images
// ============================================================================

const CHAT_IN_BUF   = 0x04BD00;
const WEB_HIST_BUF  = 0x04A000; // 8 entries * 64B: [node:4][url:60]
const WEB_CUR_URL   = 0x04A200; // 64B current URL path
const WEB_IMG_SRC   = 0x04A280; // 64B scratch img src attribute
const WEB_LINK_TAB  = 0x04A300; // 12 entries * 48B: [rx0:4][ry0:4][rx1:4][ry1:4][href:32]

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
int g_snake_steps;
int g_snake_net_mode;

// Game 2: SpiralBlocks state
int blocks_grid[80]; // 8 cols x 10 rows
int g_blk_px;
int g_blk_py;
int g_blk_type;
int g_blk_score;
int g_blk_steps;

int g_chat_in_len;
int g_ftx_sel_idx;

// Browser history & link state
int g_web_hist_cnt;
int g_web_cur_node;
int g_web_link_cnt;
int g_web_img_drawn;

void web_navigate(int dst_node, int path_str, int push_hist) {
  if (push_hist == 1 && r8(WEB_CUR_URL) != 0 && g_web_hist_cnt < 8) {
    int slot = WEB_HIST_BUF + g_web_hist_cnt * 64;
    hal_memset(slot, 0, 64);
    w32(slot + 0, g_web_cur_node);
    int clen = hal_strlen(WEB_CUR_URL);
    if (clen > 58) clen = 58;
    hal_memcpy(slot + 4, WEB_CUR_URL, clen);
    g_web_hist_cnt = g_web_hist_cnt + 1;
  }
  hal_memset(WEB_CUR_URL, 0, 64);
  int plen = hal_strlen(path_str);
  if (plen > 58) plen = 58;
  hal_memcpy(WEB_CUR_URL, path_str, plen);
  g_web_cur_node = dst_node;

  if (dst_node == 0) {
    int widx = fs_find(path_str);
    if (widx < 0) widx = fs_find("/www/index.hts");
    if (widx >= 0) {
      hal_memset(WEB_PAGE_BUF, 0, 2048);
      int sz = fs_entry_size(widx);
      if (sz > 1023) sz = 1023;
      hal_memcpy(WEB_PAGE_BUF, fs_entry_data_ptr(widx), sz);
      g_web_status = 2;
    }
  } else {
    net_http_get(dst_node, path_str);
  }
}

void web_go_back() {
  if (g_web_hist_cnt <= 0) return;
  g_web_hist_cnt = g_web_hist_cnt - 1;
  int slot = WEB_HIST_BUF + g_web_hist_cnt * 64;
  int prev_node = r32(slot + 0);
  byte prev_url[60];
  hal_memset(prev_url, 0, 60);
  hal_memcpy(prev_url, slot + 4, 58);
  web_navigate(prev_node, prev_url, 0);
}

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
  g_snake_steps = 0;
  g_snake_net_mode = 1;

  // Initialize Blocks
  for (int k = 0; k < 80; k++) blocks_grid[k] = 0;
  g_blk_px = 3;
  g_blk_py = 1;
  g_blk_type = 1;
  g_blk_score = 0;
  g_blk_steps = 0;

  // Register real-time app timer ticks (§3)
  app_register_tick(APP_SNAKE, 80);
  app_register_tick(APP_BLOCKS, 120);

  g_chat_in_len = 0;
  hal_memset(CHAT_IN_BUF, 0, 64);
  g_ftx_sel_idx = 0;

  g_web_hist_cnt = 0;
  g_web_cur_node = 0;
  g_web_link_cnt = 0;
  g_web_img_drawn = 0;
  hal_memset(WEB_HIST_BUF, 0, 8 * 64);
  hal_memset(WEB_CUR_URL, 0, 64);
  hal_memcpy(WEB_CUR_URL, "/www/index.hts", 14);
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

// 10. Game 1: SpiralSnake (Real-Time Tick + Step Button + StudioNet Multiplayer)
void snake_step() {
  int nx = (snake_x[0] + g_snake_dx + 18) % 18;
  int ny = (snake_y[0] + g_snake_dy + 10) % 10;
  for (int i = g_snake_len - 1; i > 0; i = i - 1) {
    snake_x[i] = snake_x[i - 1];
    snake_y[i] = snake_y[i - 1];
  }
  snake_x[0] = nx;
  snake_y[0] = ny;
  g_snake_steps = g_snake_steps + 1;
  w32(VMRAM_STATUS + 0x60, g_snake_steps);
  if (nx == g_snake_fx && ny == g_snake_fy) {
    g_snake_score = g_snake_score + 10;
    if (g_snake_len < 28) g_snake_len = g_snake_len + 1;
    g_snake_fx = (g_snake_fx * 7 + 3) % 18;
    g_snake_fy = (g_snake_fy * 5 + 2) % 10;
  }
  if (g_snake_net_mode == 1 && g_has_snet == 1) {
    net_send_snake_state(snake_x[0], snake_y[0], g_snake_dx, g_snake_dy, g_snake_score);
  }
}

void app_draw_snake(int x, int y, int w, int h) {
  hal_rect(x + 4, y + 16, 144, 80, 0);
  // Draw food
  hal_rect(x + 4 + g_snake_fx * 8, y + 16 + g_snake_fy * 8, 7, 7, 12);
  // Draw peer snake if active over StudioNet
  if (g_peer_snake_active == 1) {
    for (int k = 0; k < 3; k++) {
      int px = (g_peer_snake_x - k * g_peer_snake_dx + 18) % 18;
      int py = (g_peer_snake_y - k * g_peer_snake_dy + 10) % 10;
      int pcol = 11;
      if (k == 0) pcol = 13;
      hal_rect(x + 4 + px * 8, y + 16 + py * 8, 7, 7, pcol);
    }
  }
  // Draw local snake
  for (int i = 0; i < g_snake_len; i++) {
    int col = 10;
    if (i == 0) col = 14;
    hal_rect(x + 4 + snake_x[i] * 8, y + 16 + snake_y[i] * 8, 7, 7, col);
  }
  hal_str(x + 4, y + 98, "Sc:", 11, -1);
  hal_itoa(g_snake_score, NUM_STR_BUF, 10);
  hal_str(x + 28, y + 98, NUM_STR_BUF, 15, -1);
  if (g_peer_snake_active == 1) {
    hal_str(x + 54, y + 98, "P2:", 13, -1);
    hal_itoa(g_peer_snake_score, NUM_STR_BUF, 10);
    hal_str(x + 78, y + 98, NUM_STR_BUF, 11, -1);
  }
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

// 11. Game 2: SpiralBlocks (Real-Time Falling + Drop Button)
void blocks_step() {
  int ny = g_blk_py + 1;
  g_blk_steps = g_blk_steps + 1;
  w32(VMRAM_STATUS + 0x64, g_blk_steps);
  if (ny >= 10 || blocks_grid[ny * 8 + g_blk_px] != 0) {
    blocks_grid[g_blk_py * 8 + g_blk_px] = 10 + (g_blk_type & 3);
    g_blk_score = g_blk_score + 5;
    g_blk_py = 0;
    g_blk_px = (g_blk_px + 3) & 7;
    g_blk_type = g_blk_type + 1;
    if (blocks_grid[g_blk_px] != 0) {
      for (int c = 0; c < 80; c++) blocks_grid[c] = 0;
    }
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

// 14. StudioNet Web Browser (SpiralWeb: Clickable Links, Back History & Inline Images)
void web_draw_inline_img(int x, int y, int src_str) {
  int fidx = fs_find(src_str);
  if (fidx >= 0 && fs_entry_size(fidx) >= 96 * 16) {
    hal_blit(x, y, 96, 16, fs_entry_data_ptr(fidx));
    return;
  }
  int seed = 5381;
  int i = 0;
  while (r8(src_str + i) != 0) {
    seed = ((seed << 5) + seed) ^ r8(src_str + i);
    i = i + 1;
  }
  hal_rect(x, y, 64, 14, 0);
  for (int row = 0; row < 12; row++) {
    for (int col = 0; col < 15; col++) {
      seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
      int c = 9 + ((seed >> 8) % 6);
      if (((seed >> 4) & 3) != 0) {
        hal_rect(x + 2 + col * 4, y + 1 + row, 3, 1, c);
      }
    }
  }
}

void app_draw_browser(int x, int y, int w, int h) {
  gui_button(x + 4,   y + 15, 52, 11, "PeerWeb", 0);
  gui_button(x + 58,  y + 15, 60, 11, "SonderGW", 0);
  gui_button(x + 120, y + 15, 48, 11, "Local", 0);
  gui_button(x + 170, y + 15, 58, 11, "Back", g_web_hist_cnt > 0);

  hal_rect(x + 4, y + 28, w - 8, h - 32, 16);
  g_web_link_cnt = 0;
  g_web_img_drawn = 0;

  int p = 0;
  int ry = y + 31;
  int cx = x + 8;
  int col = 15;
  int in_link = 0;

  while (r8(WEB_PAGE_BUF + p) != 0 && ry < y + h - 10) {
    if (r8(WEB_PAGE_BUF + p) == 60) {
      if (match_prefix(WEB_PAGE_BUF + p, "<h1>") > 0) {
        col = 14; p = p + 4; cx = x + 8; continue;
      }
      if (match_prefix(WEB_PAGE_BUF + p, "</h1>") > 0) {
        col = 15; p = p + 5; ry = ry + 10; cx = x + 8; continue;
      }
      if (match_prefix(WEB_PAGE_BUF + p, "<p>") > 0) {
        col = 15; p = p + 3; cx = x + 8; continue;
      }
      if (match_prefix(WEB_PAGE_BUF + p, "</p>") > 0) {
        p = p + 4; ry = ry + 9; cx = x + 8; continue;
      }
      if (match_prefix(WEB_PAGE_BUF + p, "<img ") > 0) {
        p = p + 5;
        hal_memset(WEB_IMG_SRC, 0, 64);
        while (r8(WEB_PAGE_BUF + p) != 0 && r8(WEB_PAGE_BUF + p) != 62) {
          if (match_prefix(WEB_PAGE_BUF + p, "src=") > 0) {
            p = p + 4;
            int q = r8(WEB_PAGE_BUF + p);
            if (q == 39 || q == 34) p = p + 1;
            int si = 0;
            while (r8(WEB_PAGE_BUF + p) != 0 && r8(WEB_PAGE_BUF + p) != 39 && r8(WEB_PAGE_BUF + p) != 34 && r8(WEB_PAGE_BUF + p) != 62 && si < 58) {
              w8(WEB_IMG_SRC + si, r8(WEB_PAGE_BUF + p));
              p = p + 1;
              si = si + 1;
            }
          } else {
            p = p + 1;
          }
        }
        if (r8(WEB_PAGE_BUF + p) == 62) p = p + 1;
        if (cx > x + 8) { ry = ry + 9; cx = x + 8; }
        web_draw_inline_img(cx, ry, WEB_IMG_SRC);
        g_web_img_drawn = g_web_img_drawn + 1;
        w32(VMRAM_STATUS + 0x68, g_web_img_drawn);
        ry = ry + 16;
        cx = x + 8;
        continue;
      }
      if (match_prefix(WEB_PAGE_BUF + p, "<a ") > 0) {
        p = p + 3;
        int lslot = WEB_LINK_TAB + g_web_link_cnt * 48;
        hal_memset(lslot, 0, 48);
        while (r8(WEB_PAGE_BUF + p) != 0 && r8(WEB_PAGE_BUF + p) != 62) {
          if (match_prefix(WEB_PAGE_BUF + p, "href=") > 0) {
            p = p + 5;
            int q = r8(WEB_PAGE_BUF + p);
            if (q == 39 || q == 34) p = p + 1;
            int hi = 0;
            while (r8(WEB_PAGE_BUF + p) != 0 && r8(WEB_PAGE_BUF + p) != 39 && r8(WEB_PAGE_BUF + p) != 34 && r8(WEB_PAGE_BUF + p) != 62 && hi < 30) {
              w8(lslot + 16 + hi, r8(WEB_PAGE_BUF + p));
              p = p + 1;
              hi = hi + 1;
            }
          } else {
            p = p + 1;
          }
        }
        if (r8(WEB_PAGE_BUF + p) == 62) p = p + 1;
        if (g_web_link_cnt < 12) {
          w32(lslot + 0, cx - x);
          w32(lslot + 4, ry - y);
          in_link = 1;
        }
        col = 11;
        continue;
      }
      if (match_prefix(WEB_PAGE_BUF + p, "</a>") > 0) {
        if (in_link == 1 && g_web_link_cnt < 12) {
          int lslot = WEB_LINK_TAB + g_web_link_cnt * 48;
          int rx0 = r32(lslot + 0);
          int ry0 = r32(lslot + 4);
          int rx1 = cx - x;
          if (rx1 <= rx0) rx1 = rx0 + 32;
          w32(lslot + 8, rx1);
          w32(lslot + 12, (ry - y) + 9);
          hal_rect(x + rx0, y + ry0 + 8, rx1 - rx0, 1, 11);
          g_web_link_cnt = g_web_link_cnt + 1;
        }
        in_link = 0;
        col = 15;
        p = p + 4;
        continue;
      }
      while (r8(WEB_PAGE_BUF + p) != 0 && r8(WEB_PAGE_BUF + p) != 62) p = p + 1;
      if (r8(WEB_PAGE_BUF + p) == 62) p = p + 1;
      continue;
    }
    int ch = r8(WEB_PAGE_BUF + p);
    if (ch == 10) {
      if (cx > x + 8) {
        ry = ry + 9;
        cx = x + 8;
      }
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
      web_navigate(peer, "/index.hts", 1);
    } else if (rx >= 58 && rx < 118) {
      int sonder = sns_resolve("sonder.gw");
      web_navigate(sonder, "/atlas", 1);
    } else if (rx >= 120 && rx < 168) {
      web_navigate(0, "/www/index.hts", 1);
    } else if (rx >= 170 && rx < 228) {
      web_go_back();
    }
    return;
  }
  if (ry >= 28) {
    for (int i = 0; i < g_web_link_cnt; i++) {
      int lslot = WEB_LINK_TAB + i * 48;
      int rx0 = r32(lslot + 0);
      int ry0 = r32(lslot + 4);
      int rx1 = r32(lslot + 8);
      int ry1 = r32(lslot + 12);
      if (ry >= ry0 - 2 && ry <= ry1 + 2 && rx >= rx0 - 4 && rx <= rx1 + 12) {
        int dst = g_web_cur_node;
        if (dst == 0) dst = sns_resolve("sonder.gw");
        byte target_href[36];
        hal_memset(target_href, 0, 36);
        hal_memcpy(target_href, lslot + 16, 31);
        web_navigate(dst, target_href, 1);
        return;
      }
    }
  }
}
