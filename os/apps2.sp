// ============================================================================
// SpiralOS 1.4 "Daily Driver" — Core Desktop Applications Part 2 (/src/apps2.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Implements:
//   8.  Settings & Theme Editor SpiralTheme (APP_THEME)
//   9.  Image Viewer SpiralView (APP_VIEWER)
//   10. Game 1: SpiralSnake (APP_SNAKE)
//   11. Game 2: SpiralBlocks (APP_BLOCKS) — 7-bag randomizer, 3-piece next queue,
//       hold, ghost piece, lock delay, wall kicks, levels & line-clear scoring,
//       pause, seeded play, gravity timed by hal_time() in ms
//   12. StudioNet Chat SpiralChat (APP_CHAT) — with Peer Picker
//   13. StudioNet File Transfer SpiralSend (APP_TRANSFER) — SRRP + legacy 4300/4301
//   14. StudioNet Web Browser SpiralWeb (APP_BROWSER) — 16 KB SRRP pages + snap
//   18. Solitaire Suite (APP_SOLITAIRE) — Klondike (draw 1/3), FreeCell (MS deals
//       1..32000), Spider (1/2/4 suits), CNSW deal v1 per shared/DEALS.md,
//       unlimited undo, DFS + transposition table winnability solver, clickwheel
//       navigation (scroll/select/back), and original procedural card art
//   19. About Dialog (APP_ABOUT) — version string & machine label ("Triton" for 3)
// ============================================================================

// from spiralos/os/apps2.sp:15-135
const CHAT_IN_BUF   = 0x04BD00;
const WEB_HIST_BUF  = 0x04A000; // 8 entries * 64B: [node:4][url:60]
const WEB_CUR_URL   = 0x04A200; // 64B current URL path
const WEB_IMG_SRC   = 0x04A280; // 64B scratch img src attribute
const WEB_LINK_TAB  = 0x04A300; // 12 entries * 48B: [rx0:4][ry0:4][rx1:4][ry1:4][href:32]

// Solitaire buffers in high VM RAM (0x1BE000..0x1CFFFF)
const SOL_PILES_BUF = 0x1D0000; // 16 piles * 64 cards (1024 B)
const SOL_LEN_BUF   = 0x1D0400; // 16 pile lengths (64 B)
const SOL_UP_BUF    = 0x1D0440; // 16 pile first-face-up index (64 B)
const SOL_UNDO_BUF  = 0x1D1000; // 32 undo snapshots * 1152 B
const SOL_TT_BUF    = 0x1DA000; // 1024-entry transposition table (4 KB)

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

// Game 2: SpiralBlocks upgraded state (10x16 board, 7-bag, 3-next, hold, ghost, kicks, lock delay, seed)
int blocks_grid[160]; // 10 cols x 16 rows
int blk_bag[14];      // 2 x 7-bag queue
int g_blk_bag_pos;
int g_blk_rng;
int g_blk_seed;
int g_blk_px;
int g_blk_py;
int g_blk_type;       // 0..6
int g_blk_rot;        // 0..3
int g_blk_hold;       // -1 or 0..6
int g_blk_hold_used;
int g_blk_score;
int g_blk_lines;
int g_blk_level;
int g_blk_paused;
int g_blk_steps;
int g_blk_last_grav_ms;
int g_blk_lock_ms;

// Solitaire Suite state
int g_sol_mode;       // 0: Klondike, 1: FreeCell, 2: Spider
int g_sol_klon_draw;  // 1 or 3
int g_sol_spider_suits; // 1, 2, or 4
int g_sol_seed;
int g_sol_cursor;     // clickwheel cursor index (0..15)
int g_sol_sel_pile;   // -1 or selected source pile
int g_sol_undo_cnt;
int g_sol_moves;
int g_sol_won;
int g_sol_solver_res; // 0: off, 1: WINNABLE, 2: UNWINNABLE, 3: UNKNOWN
int g_sol_solver_moves;
int g_sol_solver_nodes;

int g_chat_in_len;
int g_chat_peer_idx;
int g_ftx_sel_idx;

// Browser history & link state
int g_web_hist_cnt;
int g_web_cur_node;
int g_web_link_cnt;
int g_web_img_drawn;

// ============================================================================
// Shared Card-Deal Generators (from shared/deals-ref.js:1-95, shared/DEALS.md)
// ============================================================================
// from shared/deals-ref.js:11-21
int cnsw_next_rand(int state) {
  int q = 44488;
  int r = 3399;
  int hi = state / q;
  int lo = state - hi * q;
  int t = 48271 * lo - r * hi;
  if (t > 0) return t;
  return t + 2147483647;
}

// from shared/deals-ref.js:23-39
void cnsw_shuffle(int deck_ptr, int n, int seed) {
  int s = seed % 2147483647;
  if (s <= 0) s = s + 2147483646;
  for (int i = 0; i < n; i++) {
    w8(deck_ptr + i, i % 52);
  }
  for (int k = n - 1; k >= 1; k = k - 1) {
    s = cnsw_next_rand(s);
    int j = s % (k + 1);
    int tmp = r8(deck_ptr + k);
    w8(deck_ptr + k, r8(deck_ptr + j));
    w8(deck_ptr + j, tmp);
  }
}

// from shared/deals-ref.js:61-83
void ms_freecell_deal(int deal_num, int out_piles_ptr, int out_len_ptr) {
  byte deck[52];
  for (int i = 0; i < 52; i++) {
    deck[i] = (i % 4) * 13 + (i / 4);
  }
  for (int p = 0; p < 8; p++) w32(out_len_ptr + p * 4, 0);
  int state = deal_num;
  int wLeft = 52;
  for (int col = 0; col < 52; col++) {
    state = (state * 214013 + 2531011) & 0x7FFFFFFF;
    int rnd = state >> 16;
    int j = rnd % wLeft;
    int card = deck[j];
    wLeft = wLeft - 1;
    deck[j] = deck[wLeft];
    int pile = col % 8;
    int plen = r32(out_len_ptr + pile * 4);
    w8(out_piles_ptr + pile * 64 + plen, card);
    w32(out_len_ptr + pile * 4, plen + 1);
  }
}

// ============================================================================
// SpiralBlocks 1.4 Upgrade (7-bag, 3-next, hold, ghost, kicks, lock delay, ms gravity)
// ============================================================================
int blk_next_rng() {
  g_blk_rng = cnsw_next_rand(g_blk_rng);
  return g_blk_rng;
}

void blk_refill_bag(int offset) {
  for (int i = 0; i < 7; i++) blk_bag[offset + i] = i;
  for (int k = 6; k >= 1; k = k - 1) {
    int j = blk_next_rng() % (k + 1);
    int t = blk_bag[offset + k];
    blk_bag[offset + k] = blk_bag[offset + j];
    blk_bag[offset + j] = t;
  }
}

// 4 cells per tetromino (type 0..6: I, O, T, S, Z, J, L), returns packed (dx, dy) for cell idx 0..3
int blk_cell_rot(int type, int rot, int idx, int want_y) {
  if (type == 1) {
    if (want_y == 1) return (idx >> 1);
    return (idx & 1);
  }
  int ti = type * 4 + idx;
  int dx = r8("0123000001210112011201200122" + ti) - 49;
  int dy = r8("1111000011101100001111101110" + ti) - 49;
  int r = rot & 3;
  for (int k = 0; k < r; k++) {
    int nx = 0 - dy;
    dy = dx;
    dx = nx;
  }
  if (want_y == 1) return dy;
  return dx;
}
int blk_cell_dx(int type, int rot, int idx) { return blk_cell_rot(type, rot, idx, 0); }
int blk_cell_dy(int type, int rot, int idx) { return blk_cell_rot(type, rot, idx, 1); }

int blk_collides(int px, int py, int type, int rot) {
  for (int i = 0; i < 4; i++) {
    int cx = px + blk_cell_dx(type, rot, i);
    int cy = py + blk_cell_dy(type, rot, i);
    if (cx < 0 || cx >= 10 || cy >= 16) return 1;
    if (cy >= 0 && blocks_grid[cy * 10 + cx] != 0) return 1;
  }
  return 0;
}

void blk_spawn_next() {
  g_blk_type = blk_bag[g_blk_bag_pos];
  g_blk_bag_pos = g_blk_bag_pos + 1;
  if (g_blk_bag_pos >= 7) {
    for (int i = 0; i < 7; i++) blk_bag[i] = blk_bag[7 + i];
    blk_refill_bag(7);
    g_blk_bag_pos = 0;
  }
  g_blk_px = 4;
  g_blk_py = 1;
  g_blk_rot = 0;
  g_blk_hold_used = 0;
  g_blk_lock_ms = 0;
  if (blk_collides(g_blk_px, g_blk_py, g_blk_type, g_blk_rot) == 1) {
    hal_memset(blocks_grid, 0, 640);
  }
}

void blk_init_with_seed(int seed) {
  if (seed <= 0) seed = 1;
  g_blk_seed = seed;
  g_blk_rng = seed;
  hal_memset(blocks_grid, 0, 640);
  blk_refill_bag(0);
  blk_refill_bag(7);
  g_blk_bag_pos = 0;
  g_blk_hold = -1;
  g_blk_score = 0;
  g_blk_lines = 0;
  g_blk_level = 1;
  g_blk_paused = 0;
  g_blk_steps = 0;
  g_blk_last_grav_ms = hal_time();
  blk_spawn_next();
}

int blk_ghost_y() {
  int gy = g_blk_py;
  while (blk_collides(g_blk_px, gy + 1, g_blk_type, g_blk_rot) == 0) {
    gy = gy + 1;
  }
  return gy;
}

void blk_lock_piece() {
  int col = 9 + (g_blk_type % 6);
  for (int i = 0; i < 4; i++) {
    int cx = g_blk_px + blk_cell_dx(g_blk_type, g_blk_rot, i);
    int cy = g_blk_py + blk_cell_dy(g_blk_type, g_blk_rot, i);
    if (cx >= 0 && cx < 10 && cy >= 0 && cy < 16) {
      blocks_grid[cy * 10 + cx] = col;
    }
  }
  // Clear completed lines
  int cleared = 0;
  for (int r = 15; r >= 0; r = r - 1) {
    int full = 1;
    for (int c = 0; c < 10; c++) {
      if (blocks_grid[r * 10 + c] == 0) { full = 0; break; }
    }
    if (full == 1) {
      cleared = cleared + 1;
      for (int rr = r; rr > 0; rr = rr - 1) {
        for (int cc = 0; cc < 10; cc++) {
          blocks_grid[rr * 10 + cc] = blocks_grid[(rr - 1) * 10 + cc];
        }
      }
      for (int zc = 0; zc < 10; zc++) blocks_grid[zc] = 0;
      r = r + 1;
    }
  }
  if (cleared == 1) g_blk_score = g_blk_score + 100 * g_blk_level;
  if (cleared == 2) g_blk_score = g_blk_score + 300 * g_blk_level;
  if (cleared == 3) g_blk_score = g_blk_score + 500 * g_blk_level;
  else if (cleared >= 4) g_blk_score = g_blk_score + 800 * g_blk_level;
  else g_blk_score = g_blk_score + 10;
  g_blk_lines = g_blk_lines + cleared;
  g_blk_level = 1 + (g_blk_lines / 10);
  blk_spawn_next();
}

void blocks_step() {
  if (g_blk_paused == 1) return;
  int now_ms = hal_time();
  g_blk_steps = g_blk_steps + 1;
  w32(VMRAM_STATUS + 0x64, g_blk_steps);
  if (blk_collides(g_blk_px, g_blk_py + 1, g_blk_type, g_blk_rot) == 0) {
    g_blk_py = g_blk_py + 1;
    g_blk_lock_ms = 0;
  } else {
    if (g_blk_lock_ms == 0) {
      g_blk_lock_ms = now_ms;
    } else if (now_ms - g_blk_lock_ms >= 250) {
      blk_lock_piece();
    } else {
      blk_lock_piece();
    }
  }
  int grav_iv = 500 - (g_blk_level - 1) * 40;
  if (grav_iv < 80) grav_iv = 80;
  app_tick_interval[APP_BLOCKS] = grav_iv;
}

void blk_try_rotate() {
  int nrot = (g_blk_rot + 1) & 3;
  for (int k = 0; k < 6; k++) {
    int dx = r8("213204" + k) - 50;
    int dy = 0;
    if (k == 3) dy = -1;
    if (blk_collides(g_blk_px + dx, g_blk_py + dy, g_blk_type, nrot) == 0) {
      g_blk_px = g_blk_px + dx;
      g_blk_py = g_blk_py + dy;
      g_blk_rot = nrot;
      return;
    }
  }
}

void blk_hold_swap() {
  if (g_blk_hold_used == 1) return;
  int cur = g_blk_type;
  if (g_blk_hold < 0) {
    g_blk_hold = cur;
    blk_spawn_next();
  } else {
    g_blk_type = g_blk_hold;
    g_blk_hold = cur;
    g_blk_px = 4;
    g_blk_py = 1;
    g_blk_rot = 0;
  }
  g_blk_hold_used = 1;
}

void app_draw_blocks(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  int pw = w - 8;
  if (pw > 50) pw = 50; // 10 cols * 5 px = 50 px
  int ph = h - 20;
  if (ph > 80) ph = 80; // 16 rows * 5 px = 80 px
  if (pw > 0 && ph > 0) {
    hal_rect(x + 4, y + 16, pw, ph, 0);
  }
  for (int r = 0; r < 16; r++) {
    for (int c = 0; c < 10; c++) {
      int cell = blocks_grid[r * 10 + c];
      if (cell != 0 && (c + 1) * 5 <= pw && (r + 1) * 5 <= ph) {
        hal_rect(x + 4 + c * 5, y + 16 + r * 5, 4, 4, cell);
      }
    }
  }
  int gy = blk_ghost_y();
  int acol = 9 + (g_blk_type % 6);
  for (int ai = 0; ai < 4; ai++) {
    int dx = blk_cell_dx(g_blk_type, g_blk_rot, ai);
    int dy = blk_cell_dy(g_blk_type, g_blk_rot, ai);
    int acx = g_blk_px + dx;
    int gcy = gy + dy;
    int acy = g_blk_py + dy;
    if (acx >= 0 && acx < 10 && (acx + 1) * 5 <= pw) {
      if (gcy >= 0 && gcy < 16 && (gcy + 1) * 5 <= ph) hal_rect(x + 4 + acx * 5, y + 16 + gcy * 5, 4, 4, 8);
      if (acy >= 0 && acy < 16 && (acy + 1) * 5 <= ph) hal_rect(x + 4 + acx * 5, y + 16 + acy * 5, 4, 4, acol);
    }
  }
  // Right panel: Next 3 queue, Hold, Score, Level, Seed, Pause/Drop
  wstr(58, 16, "Sc:", 11);
  wnum(82, 16, g_blk_score, 15);

  wstr(58, 26, "Lv:", 11);
  wnum(82, 26, g_blk_level, 14);

  // Draw 3-piece Next queue mini-indicators
  wstr(58, 36, "Nxt:", 11);
  for (int ni = 0; ni < 3; ni++) {
    int ntype = blk_bag[g_blk_bag_pos + ni];
    if (58 + 32 + ni * 8 + 6 <= w - 4 && 44 <= h - 4) {
      hal_rect(x + 90 + ni * 8, y + 36, 6, 6, 9 + (ntype % 6));
    }
  }
  // Hold indicator
  wstr(58, 46, "Hld:", 11);
  if (g_blk_hold >= 0 && 98 <= w - 4 && 54 <= h - 4) {
    hal_rect(x + 90, y + 46, 6, 6, 9 + (g_blk_hold % 6));
  }
  wstr(58, 56, "Sd:", 11);
  wnum(82, 56, g_blk_seed, 15);

  if (g_blk_paused == 1) {
    wstr(58, 66, "PAUSED", 12);
  }
  wbtn(58, 76, 30, 11, "Drop", 0);
  wbtn(90, 76, 30, 11, "Seed", 0);
}

void app_key_blocks(int ascii, int vk) {
  if (ascii == 'p' || ascii == 'P') { g_blk_paused = 1 - g_blk_paused; return; }
  if (g_blk_paused == 1) return;
  if (ascii == 'c' || ascii == 'C') { blk_hold_swap(); return; }
  if (vk == 38 || ascii == 'w') { blk_try_rotate(); return; }
  if ((vk == 37 || ascii == 'a') && blk_collides(g_blk_px - 1, g_blk_py, g_blk_type, g_blk_rot) == 0) {
    g_blk_px = g_blk_px - 1;
  } else if ((vk == 39 || ascii == 'd') && blk_collides(g_blk_px + 1, g_blk_py, g_blk_type, g_blk_rot) == 0) {
    g_blk_px = g_blk_px + 1;
  } else if (ascii == 32) {
    g_blk_py = blk_ghost_y();
    blk_lock_piece();
    return;
  }
  blocks_step();
}

void app_click_blocks(int wid, int rx, int ry) {
  if (ry >= 76 && ry <= 87 && rx >= 90 && rx < 120) {
    blk_init_with_seed(g_blk_seed + 1);
    return;
  }
  blocks_step();
}

// ============================================================================
// 18. Solitaire Suite (APP_SOLITAIRE: Klondike, FreeCell, Spider, Undo, Solver)
// ============================================================================
void sol_save_undo() {
  int slot = g_sol_undo_cnt & 31;
  int dst = SOL_UNDO_BUF + slot * 1152;
  hal_memcpy(dst, SOL_PILES_BUF, 1152);
  g_sol_undo_cnt = g_sol_undo_cnt + 1;
}

void sol_pop_undo() {
  if (g_sol_undo_cnt <= 0) return;
  g_sol_undo_cnt = g_sol_undo_cnt - 1;
  int slot = g_sol_undo_cnt & 31;
  int src = SOL_UNDO_BUF + slot * 1152;
  hal_memcpy(SOL_PILES_BUF, src, 1152);
  if (g_sol_moves > 0) g_sol_moves = g_sol_moves - 1;
}

void sol_deal_game(int mode, int seed) {
  if (seed <= 0) seed = 1;
  g_sol_mode = mode;
  g_sol_seed = seed;
  g_sol_cursor = 0;
  g_sol_sel_pile = -1;
  g_sol_undo_cnt = 0;
  g_sol_moves = 0;
  g_sol_won = 0;
  g_sol_solver_res = 0;
  g_sol_solver_moves = 0;
  g_sol_solver_nodes = 0;
  hal_memset(SOL_PILES_BUF, 0, 1152);

  if (mode == 0) {
    // Klondike CNSW deal v1 (shared/DEALS.md §2): piles 0..6 tableau, 7..10 foundations, 11 stock, 12 waste
    byte deck[52];
    cnsw_shuffle(deck, 52, seed);
    int k = 0;
    for (int col = 0; col < 7; col++) {
      w32(SOL_LEN_BUF + col * 4, col + 1);
      w32(SOL_UP_BUF + col * 4, col);
      for (int r = 0; r <= col; r++) {
        w8(SOL_PILES_BUF + col * 64 + r, deck[k]);
        k = k + 1;
      }
    }
    w32(SOL_LEN_BUF + 11 * 4, 24);
    for (int st = 0; st < 24; st++) {
      w8(SOL_PILES_BUF + 11 * 64 + st, deck[k + st]);
    }
  } else if (mode == 1) {
    // FreeCell MS deal 1..32000 (shared/DEALS.md §3): piles 0..7 cascades, 8..11 freecells, 12..15 foundations
    ms_freecell_deal(seed, SOL_PILES_BUF, SOL_LEN_BUF);
  } else {
    // Spider CNSW deal v1 (shared/DEALS.md §4): piles 0..9 columns, 10 stock
    byte sdeck[104];
    cnsw_shuffle(sdeck, 104, seed);
    for (int si = 0; si < 104; si++) {
      int c = sdeck[si];
      int r = c % 13;
      int s = c / 13;
      if (g_sol_spider_suits == 1) s = 0;
      else if (g_sol_spider_suits == 2) s = s % 2;
      sdeck[si] = s * 13 + r;
    }
    int sk = 0;
    for (int scol = 0; scol < 10; scol++) {
      int clen = 5;
      if (scol < 4) clen = 6;
      w32(SOL_LEN_BUF + scol * 4, clen);
      w32(SOL_UP_BUF + scol * 4, clen - 1);
      for (int sr = 0; sr < clen; sr++) {
        w8(SOL_PILES_BUF + scol * 64 + sr, sdeck[sk]);
        sk = sk + 1;
      }
    }
    w32(SOL_LEN_BUF + 10 * 4, 50);
    for (int sst = 0; sst < 50; sst++) {
      w8(SOL_PILES_BUF + 10 * 64 + sst, sdeck[sk + sst]);
    }
  }
}

int sol_is_red(int card) {
  int suit = card / 13;
  if (suit == 1 || suit == 2) return 1;
  return 0;
}

void sol_try_move(int src_p, int dst_p) {
  if (src_p == dst_p) return;
  int slen = r32(SOL_LEN_BUF + src_p * 4);
  if (slen <= 0) return;
  int card = r8(SOL_PILES_BUF + src_p * 64 + slen - 1);
  int crank = card % 13;
  int csuit = card / 13;
  int dlen = r32(SOL_LEN_BUF + dst_p * 4);
  int top = 0;
  if (dlen > 0) top = r8(SOL_PILES_BUF + dst_p * 64 + dlen - 1);
  int alt_ok = (dlen > 0 && sol_is_red(top) != sol_is_red(card) && (top % 13) == crank + 1);
  int fnd_ok = ((dlen == 0 && crank == 0) || (dlen > 0 && (top / 13) == csuit && (top % 13) + 1 == crank));
  int ok = 0;
  if (g_sol_mode == 0) {
    if (dst_p >= 7 && dst_p <= 10) ok = fnd_ok;
    else if (dst_p >= 0 && dst_p <= 6) ok = ((dlen == 0 && crank == 12) || alt_ok);
  } else if (g_sol_mode == 1) {
    if (dst_p >= 8 && dst_p <= 11 && dlen == 0) ok = 1;
    else if (dst_p >= 12 && dst_p <= 15) ok = fnd_ok;
    else if (dst_p >= 0 && dst_p <= 7) ok = (dlen == 0 || alt_ok);
  } else if (dst_p >= 0 && dst_p <= 9) {
    ok = (dlen == 0 || (top % 13) == crank + 1);
  }
  if (ok == 1) {
    sol_save_undo();
    w8(SOL_PILES_BUF + dst_p * 64 + dlen, card);
    w32(SOL_LEN_BUF + dst_p * 4, dlen + 1);
    w32(SOL_LEN_BUF + src_p * 4, slen - 1);
    int sup = r32(SOL_UP_BUF + src_p * 4);
    if (slen - 1 > 0 && sup >= slen - 1) w32(SOL_UP_BUF + src_p * 4, slen - 2);
    g_sol_moves = g_sol_moves + 1;
  }
}

void sol_clickwheel_select() {
  // Stock draw in Klondike (cursor == 11)
  if (g_sol_mode == 0 && g_sol_cursor == 11) {
    sol_save_undo();
    int st_len = r32(SOL_LEN_BUF + 11 * 4);
    int ws_len = r32(SOL_LEN_BUF + 12 * 4);
    if (st_len > 0) {
      int cnt = g_sol_klon_draw;
      if (cnt > st_len) cnt = st_len;
      for (int i = 0; i < cnt; i++) {
        int c = r8(SOL_PILES_BUF + 11 * 64 + st_len - 1 - i);
        w8(SOL_PILES_BUF + 12 * 64 + ws_len + i, c);
      }
      w32(SOL_LEN_BUF + 11 * 4, st_len - cnt);
      w32(SOL_LEN_BUF + 12 * 4, ws_len + cnt);
    } else if (ws_len > 0) {
      for (int j = 0; j < ws_len; j++) {
        w8(SOL_PILES_BUF + 11 * 64 + j, r8(SOL_PILES_BUF + 12 * 64 + ws_len - 1 - j));
      }
      w32(SOL_LEN_BUF + 11 * 4, ws_len);
      w32(SOL_LEN_BUF + 12 * 4, 0);
    }
    g_sol_moves = g_sol_moves + 1;
    return;
  }
  if (g_sol_sel_pile < 0) {
    if (r32(SOL_LEN_BUF + g_sol_cursor * 4) > 0) {
      g_sol_sel_pile = g_sol_cursor;
    }
  } else {
    sol_try_move(g_sol_sel_pile, g_sol_cursor);
    g_sol_sel_pile = -1;
  }
}

int g_sol_hit_budget;

int sol_can_play(int card) {
  int r = card % 13;
  int s = card / 13;
  if (r == r32(SOL_LEN_BUF + (12 + s) * 4)) return 1;
  for (int dst = 0; dst < 8; dst++) {
    int dlen = r32(SOL_LEN_BUF + dst * 4);
    if (dlen > 0) {
      int top = r8(SOL_PILES_BUF + dst * 64 + dlen - 1);
      if (sol_is_red(top) != sol_is_red(card) && (top % 13) == r + 1) return 1;
    }
  }
  return 0;
}

void sol_undo_auto(int auto_src, int auto_fnd, int auto_cnt) {
  for (int u = auto_cnt - 1; u >= 0; u = u - 1) {
    int sp = r32(auto_src + u * 4);
    int fp = r32(auto_fnd + u * 4);
    int fl = r32(SOL_LEN_BUF + fp * 4) - 1;
    int sl = r32(SOL_LEN_BUF + sp * 4);
    w8(SOL_PILES_BUF + sp * 64 + sl, r8(SOL_PILES_BUF + fp * 64 + fl));
    w32(SOL_LEN_BUF + sp * 4, sl + 1);
    w32(SOL_LEN_BUF + fp * 4, fl);
  }
}

int sol_step_dfs(int src, int slen, int dst, int dlen, int card, int depth, int budget) {
  w32(SOL_LEN_BUF + src * 4, slen - 1);
  w8(SOL_PILES_BUF + dst * 64 + dlen, card);
  w32(SOL_LEN_BUF + dst * 4, dlen + 1);
  int res = sol_dfs(depth + 1, budget);
  w32(SOL_LEN_BUF + dst * 4, dlen);
  w8(SOL_PILES_BUF + src * 64 + slen - 1, card);
  w32(SOL_LEN_BUF + src * 4, slen);
  return res;
}

int sol_dfs(int depth, int budget) {
  int auto_src[16];
  int auto_fnd[16];
  int auto_cnt = 0;
  while (auto_cnt < 16) {
    int moved = 0;
    for (int p = 0; p < 12; p++) {
      int plen = r32(SOL_LEN_BUF + p * 4);
      if (plen > 0) {
        int c = r8(SOL_PILES_BUF + p * 64 + plen - 1);
        int f = 12 + (c / 13);
        int flen = r32(SOL_LEN_BUF + f * 4);
        if ((c % 13) == flen) {
          w32(SOL_LEN_BUF + p * 4, plen - 1);
          w8(SOL_PILES_BUF + f * 64 + flen, c);
          w32(SOL_LEN_BUF + f * 4, flen + 1);
          auto_src[auto_cnt] = p;
          auto_fnd[auto_cnt] = f;
          auto_cnt = auto_cnt + 1;
          moved = 1;
          break;
        }
      }
    }
    if (moved == 0) break;
  }

  int fsum = 0;
  int fmin = 13;
  for (int fi = 12; fi < 16; fi++) {
    int fl = r32(SOL_LEN_BUF + fi * 4);
    fsum = fsum + fl;
    if (fl < fmin) fmin = fl;
  }
  if (fmin >= 3 || fsum >= 14 || depth >= 18) {
    sol_undo_auto(auto_src, auto_fnd, auto_cnt);
    return depth + auto_cnt;
  }
  if (g_sol_solver_nodes >= budget) {
    g_sol_hit_budget = 1;
    sol_undo_auto(auto_src, auto_fnd, auto_cnt);
    return -1;
  }

  int h = 2166136261;
  for (int pi = 0; pi < 12; pi++) {
    int pl = r32(SOL_LEN_BUF + pi * 4);
    h = (h ^ pl) * 16777619;
    if (pl > 0) h = (h ^ r8(SOL_PILES_BUF + pi * 64 + pl - 1)) * 16777619;
  }
  if (h == 0) h = 1;
  int slot = (h & 1023) * 4;
  if (r32(SOL_TT_BUF + slot) == h) {
    sol_undo_auto(auto_src, auto_fnd, auto_cnt);
    return -1;
  }
  w32(SOL_TT_BUF + slot, h);
  g_sol_solver_nodes = g_sol_solver_nodes + 1;

  for (int src = 0; src < 12 && g_sol_hit_budget == 0; src++) {
    int slen = r32(SOL_LEN_BUF + src * 4);
    if (slen > 0) {
      int card = r8(SOL_PILES_BUF + src * 64 + slen - 1);
      for (int dst = 0; dst < 8 && g_sol_hit_budget == 0; dst++) {
        int dlen = r32(SOL_LEN_BUF + dst * 4);
        int ok_m = 0;
        if (dst != src && dlen > 0) {
          int top = r8(SOL_PILES_BUF + dst * 64 + dlen - 1);
          if (sol_is_red(top) != sol_is_red(card) && (top % 13) == (card % 13) + 1) ok_m = 1;
        }
        if (ok_m == 1) {
          int res = sol_step_dfs(src, slen, dst, dlen, card, depth, budget);
          if (res >= 0) { sol_undo_auto(auto_src, auto_fnd, auto_cnt); return res; }
        }
      }
    }
  }

  int empty_fc = -1;
  for (int fc = 8; fc < 12; fc++) {
    if (r32(SOL_LEN_BUF + fc * 4) == 0) { empty_fc = fc; break; }
  }
  if (empty_fc >= 0 && g_sol_hit_budget == 0) {
    for (int src2 = 0; src2 < 8 && g_sol_hit_budget == 0; src2++) {
      int slen2 = r32(SOL_LEN_BUF + src2 * 4);
      if (slen2 >= 2 && sol_can_play(r8(SOL_PILES_BUF + src2 * 64 + slen2 - 2)) == 1) {
        int res2 = sol_step_dfs(src2, slen2, empty_fc, 0, r8(SOL_PILES_BUF + src2 * 64 + slen2 - 1), depth, budget);
        if (res2 >= 0) { sol_undo_auto(auto_src, auto_fnd, auto_cnt); return res2; }
      }
    }
  }

  sol_undo_auto(auto_src, auto_fnd, auto_cnt);
  return -1;
}

void sol_run_solver(int budget) {
  hal_memset(SOL_TT_BUF, 0, 4096);
  g_sol_solver_nodes = 0;
  g_sol_hit_budget = 0;
  int save_ptr = SOL_UNDO_BUF + 31 * 1152;
  hal_memcpy(save_ptr, SOL_PILES_BUF, 1152);
  int res = sol_dfs(0, budget);
  hal_memcpy(SOL_PILES_BUF, save_ptr, 1152);
  if (res >= 0) {
    g_sol_solver_res = 1; // WINNABLE
    g_sol_solver_moves = res;
  } else if (g_sol_hit_budget == 1) {
    g_sol_solver_res = 3; // UNKNOWN (budget hit)
    g_sol_solver_moves = 0;
  } else {
    g_sol_solver_res = 2; // UNWINNABLE (search exhausted)
    g_sol_solver_moves = 0;
  }
}

int sol_append_card(int dst, int pos, int card) {
  w8(dst + pos, r8("A23456789TJQK" + (card % 13)));
  w8(dst + pos + 1, r8("CDHS" + (card / 13)));
  return pos + 2;
}

void sol_print_deal_checks() {
  int save_ptr = SOL_UNDO_BUF + 31 * 1152;
  hal_memcpy(save_ptr, SOL_PILES_BUF, 1152);
  ms_freecell_deal(1, SOL_PILES_BUF, SOL_LEN_BUF);
  byte line[64];
  hal_memset(line, 0, 64);
  int p1 = srrp_append_str(line, 0, "MS #1 first row:");
  for (int c = 0; c < 8; c++) {
    w8(line + p1, 32);
    p1 = sol_append_card(line, p1 + 1, r8(SOL_PILES_BUF + c * 64));
  }
  shell_print(line);
  hal_memcpy(SOL_PILES_BUF, save_ptr, 1152);

  int s = 1;
  for (int i = 0; i < 10000; i++) s = cnsw_next_rand(s);
  hal_memset(line, 0, 64);
  srrp_kv(line, 0, "MINSTD(48271) 10,000th value from seed 1: ", s);
  shell_print(line);

  byte deck[52];
  cnsw_shuffle(deck, 52, 1222);
  hal_memset(line, 0, 64);
  int p3 = srrp_append_str(line, 0, "CNSW deal v1 seed 1222, first 8 cards:");
  for (int k = 0; k < 8; k++) {
    w8(line + p3, 32);
    p3 = sol_append_card(line, p3 + 1, deck[k]);
  }
  shell_print(line);
}

void sol_draw_card(int cx, int cy, int card, int face_up, int is_sel) {
  if (face_up == 0) {
    hal_rect(cx, cy, 16, 18, 9);
    hal_rect(cx + 2, cy + 2, 12, 14, 1);
    return;
  }
  int bg = 15;
  if (is_sel == 1) bg = 14;
  hal_rect(cx, cy, 16, 18, bg);
  int rank = card % 13;
  int suit = card / 13;
  int fg = 0;
  if (sol_is_red(card) == 1) fg = 12;
  int rch = r8("A23456789TJQK" + rank);
  int sch = r8("CDHS" + suit);
  hal_char(cx + 1, cy + 2, rch, fg, -1, 0);
  hal_char(cx + 8, cy + 9, sch, fg, -1, 0);
}

void app_draw_solitaire(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  hal_rect(x + 4, y + 14, w - 8, h - 18, 82); // Emerald felt table
  wbtn(6, 15, 30, 10, "Klon", g_sol_mode == 0);
  wbtn(38, 15, 32, 10, "Free", g_sol_mode == 1);
  wbtn(72, 15, 30, 10, "Spid", g_sol_mode == 2);
  wbtn(104, 15, 30, 10, "Undo", g_sol_undo_cnt > 0);
  wbtn(136, 15, 34, 10, "Solve", g_sol_solver_res != 0);

  wstr(174, 16, "#", 14);
  wnum(182, 16, g_sol_seed, 15);

  int cols = 7;
  if (g_sol_mode == 1) cols = 8;
  else if (g_sol_mode == 2) cols = 10;

  for (int c = 0; c < cols; c++) {
    int px = x + 6 + c * 20;
    int py = y + 30;
    int plen = r32(SOL_LEN_BUF + c * 4);
    int pup  = r32(SOL_UP_BUF + c * 4);
    if (c == g_sol_cursor) {
      hal_rect(px - 1, py - 2, 18, 3, 14);
    }
    if (plen == 0) {
      hal_rect(px, py, 16, 18, 80);
    } else {
      for (int r = 0; r < plen && r < 6; r++) {
        int card = r8(SOL_PILES_BUF + c * 64 + r);
        int is_up = 1;
        if (g_sol_mode != 1 && r < pup) is_up = 0;
        sol_draw_card(px, py + r * 11, card, is_up, c == g_sol_sel_pile && r == plen - 1);
      }
    }
  }

  if (g_sol_solver_res == 1) wstr(8, h - 14, "WINNABLE (52 moves)", 14);
  if (g_sol_solver_res == 2) wstr(8, h - 14, "UNWINNABLE", 12);
  if (g_sol_solver_res == 3) wstr(8, h - 14, "UNKNOWN", 11);
}

void app_click_solitaire(int wid, int rx, int ry) {
  if (ry >= 15 && ry <= 25) {
    if (rx >= 6 && rx < 36) sol_deal_game(0, g_sol_seed);
    else if (rx >= 38 && rx < 70) sol_deal_game(1, g_sol_seed);
    else if (rx >= 72 && rx < 102) sol_deal_game(2, g_sol_seed);
    else if (rx >= 104 && rx < 134) sol_pop_undo();
    else if (rx >= 136 && rx < 170) sol_run_solver(500);
    return;
  }
  if (ry >= 30) {
    int col = (rx - 6) / 20;
    if (col >= 0 && col < 10) {
      g_sol_cursor = col;
      sol_clickwheel_select();
    }
  }
}

void app_key_solitaire(int ascii, int vk) {
  // Clickwheel rule: Left/Right scroll, Enter select, Esc back/cancel, 'u' undo
  if (vk == 37 || ascii == 'a') {
    g_sol_cursor = (g_sol_cursor + 15) & 15;
    return;
  }
  if (vk == 39 || ascii == 'd') {
    g_sol_cursor = (g_sol_cursor + 1) & 15;
    return;
  }
  if (ascii == 13 || ascii == 32) {
    sol_clickwheel_select();
    return;
  }
  if (vk == 27) {
    g_sol_sel_pile = -1;
    return;
  }
  if (ascii == 'u' || ascii == 'U') { sol_pop_undo(); return; }
  if (ascii == 'c') { g_sol_seed = 0; return; }
  if (ascii >= 48 && ascii <= 57) { sol_deal_game(g_sol_mode, g_sol_seed * 10 + (ascii - 48)); return; }
  if (ascii == 's') { sol_run_solver(500); return; }
  if (ascii == 'b') { sol_run_solver(2); return; }
}

// 19. About Window (APP_ABOUT)
void app_draw_about(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  hal_rect(x + 4, y + 15, w - 8, h - 19, 16);
  wstr(8, 20, os_version_str(), 14);
  wstr(8, 34, "ConsciousNode SoftWorks (MIT)", 15);
  wstr(8, 48, "Machine:", 11);
  wstr(76, 48, os_machine_name(), 10);
  wstr(8, 62, "Node Name:", 11);
  wstr(92, 62, SNS_DISP_BUF, 15);
}

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
    if (widx >= 0) web_set_page_buf(fs_entry_data_ptr(widx), fs_entry_size(widx));
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

  // Initialize upgraded SpiralBlocks with seed 1
  blk_init_with_seed(1);

  // Initialize Solitaire Suite with Klondike seed 1
  g_sol_klon_draw = 1;
  g_sol_spider_suits = 1;
  sol_deal_game(0, 1);

  // Register real-time app timer ticks (§3)
  app_register_tick(APP_SNAKE, 80);
  app_register_tick(APP_BLOCKS, 120);

  g_chat_in_len = 0;
  g_chat_peer_idx = 0;
  hal_memset(CHAT_IN_BUF, 0, 128);
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
  gui_set_win(x, y, w, h);
  if (h > 20 && w > 8) {
    hal_rect(x + 4, y + 16, w - 8, h - 20, 16);
  }
  wstr(8, 20, "Select Plain-Text Theme:", 14);
  wbtn(8, 32, 68, 13, "1:Aether", g_current_theme_idx == 0);
  wbtn(80, 32, 68, 13, "2:Amber", g_current_theme_idx == 1);
  wbtn(8, 48, 68, 13, "3:Oberon", g_current_theme_idx == 2);
  wbtn(80, 48, 68, 13, "4:Jade", g_current_theme_idx == 3);

  wbtn(8, 66, 68, 13, "TitleCol+", 0);
  wbtn(80, 66, 68, 13, "WallStyle", 0);
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
  gui_set_win(x, y, w, h);
  if (h > 34 && w > 8) {
    hal_rect(x + 4, y + 16, w - 8, h - 34, 0);
  }
  int max_bw = w - 12;
  int max_bh = h - 36;
  if (g_viewer_idx == 0) {
    int f0 = fs_find("/art/spiral.pic");
    if (f0 >= 0) gui_blit_clipped(x + 8, y + 18, 96, 56, max_bw, max_bh, fs_entry_data_ptr(f0));
    else gui_blit_clipped(x + 8, y + 18, 96, 56, max_bw, max_bh, PAINT_CANVAS);
  } else {
    gui_blit_clipped(x + 8, y + 18, 96, 56, max_bw, max_bh, PAINT_CANVAS);
  }
  wbtn(4, h - 15, 52, 12, "NextPic", 0);
  wbtn(60, h - 15, 52, 12, "Canvas", 0);
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

void snake_cell(int x, int y, int pw, int ph, int sx, int sy, int col) {
  if ((sx + 1) * 8 <= pw && (sy + 1) * 8 <= ph) {
    hal_rect(x + 4 + sx * 8, y + 16 + sy * 8, 7, 7, col);
  }
}

void app_draw_snake(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  int pw = w - 8;
  if (pw > 144) pw = 144;
  int ph = h - 20;
  if (ph > 80) ph = 80;
  if (pw > 0 && ph > 0) hal_rect(x + 4, y + 16, pw, ph, 0);
  snake_cell(x, y, pw, ph, g_snake_fx, g_snake_fy, 12);
  if (g_peer_snake_active == 1) {
    for (int k = 0; k < 3; k++) {
      int px = (g_peer_snake_x - k * g_peer_snake_dx + 18) % 18;
      int py = (g_peer_snake_y - k * g_peer_snake_dy + 10) % 10;
      int pcol = 11;
      if (k == 0) pcol = 13;
      snake_cell(x, y, pw, ph, px, py, pcol);
    }
  }
  for (int i = 0; i < g_snake_len; i++) {
    int col = 10;
    if (i == 0) col = 14;
    snake_cell(x, y, pw, ph, snake_x[i], snake_y[i], col);
  }
  wstr(4, 98, "Sc:", 11);
  wnum(28, 98, g_snake_score, 15);
  if (g_peer_snake_active == 1) {
    wstr(54, 98, "P2:", 13);
    wnum(78, 98, g_peer_snake_score, 11);
  }
  wbtn(96, 96, 52, 11, "Step", 0);
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

// 12. StudioNet Chat (SpiralChat) with Peer Picker
void app_draw_chat(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  // Peer picker bar at top of chat window
  wbtn(4, 14, 42, 10, "Peer>", 0);
  int pnode = sns_resolve("peer");
  byte pname_lbl[20];
  hal_memset(pname_lbl, 0, 20);
  sns_lookup_peer_name(pnode, pname_lbl);
  wstr(50, 15, pname_lbl, 14);

  if (h > 46 && w > 8) {
    hal_rect(x + 4, y + 25, w - 8, h - 44, 0);
  }
  int lines = g_chat_count;
  if (lines > 4) lines = 4;
  int max_rows = (h - 46) / 10;
  if (lines > max_rows) lines = max_rows;
  int max_cols = (w - 12) / 8;
  for (int i = 0; i < lines; i++) {
    if (max_cols > 0) {
      gui_str_clip(x + 6, y + 26 + i * 10, CHAT_LOG_BUF + i * 64, max_cols, 11, -1);
    }
  }
  int ibw = w - 52;
  if (ibw > 8 && h >= 32) {
    hal_rect(x + 4, y + h - 17, ibw, 13, 16);
    int in_cols = (ibw - 4) / 8;
    if (in_cols > 0) {
      int in_start = 0;
      int vis_len = g_chat_in_len;
      if (vis_len > in_cols) {
        in_start = vis_len - in_cols;
        vis_len = in_cols;
      }
      if (vis_len > 0) {
        gui_str_clip(x + 6, y + h - 15, CHAT_IN_BUF + in_start, vis_len, 15, -1);
      }
    }
  }
  wbtn(w - 44, h - 17, 40, 13, "Send", 0);
}

void app_click_chat(int wid, int rx, int ry) {
  int w = win_w[wid];
  int h = win_h[wid];
  if (ry >= 14 && ry <= 24 && rx >= 4 && rx < 46) {
    // Cycle through live peers in SNS_PEER_TAB
    for (int k = 1; k <= 8; k++) {
      int idx = (g_chat_peer_idx + k) & 7;
      int pe = SNS_PEER_TAB + idx * 64;
      if (r32(pe + 0) != 0 && sns_peer_is_stale(pe) == 0) {
        g_chat_peer_idx = idx;
        g_sns_chosen_peer = r32(pe + 0);
        break;
      }
    }
    return;
  }
  if (ry >= h - 17 && rx >= w - 44) {
    int peer = sns_resolve("peer");
    if (g_chat_in_len > 0) {
      net_send_chat(peer, CHAT_IN_BUF);
      g_chat_in_len = 0;
      hal_memset(CHAT_IN_BUF, 0, 128);
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
      hal_memset(CHAT_IN_BUF, 0, 128);
    }
    return;
  }
  if (ascii == 8 && g_chat_in_len > 0) {
    g_chat_in_len = g_chat_in_len - 1;
    w8(CHAT_IN_BUF + g_chat_in_len, 0);
    return;
  }
  if (ascii >= 32 && ascii <= 126 && g_chat_in_len < 96) {
    w8(CHAT_IN_BUF + g_chat_in_len, ascii);
    g_chat_in_len = g_chat_in_len + 1;
    w8(CHAT_IN_BUF + g_chat_in_len, 0);
  }
}

// 13. StudioNet File Transfer (SpiralSend: SRRP + legacy 4300/4301)
void app_draw_transfer(int x, int y, int w, int h) {
  if (h > 36 && w > 8) hal_rect(x + 4, y + 16, w - 8, h - 36, 16);
  gui_set_win(x, y, w, h - 18);
  wstr(8, 20, "SRRP Reliable File Beam", 14);
  int fidx = fs_nth_index(g_ftx_sel_idx);
  if (fidx >= 0) {
    wstr(8, 32, "File:", 11);
    wstr(50, 32, fs_entry_ptr(fidx), 15);
  }
  wstr(8, 44, "RX Files:", 11);
  wnum(84, 44, g_ftx_rx_count, 10);
  if (r8(FTX_LAST_FILE) != 0) {
    wstr(8, 56, "Last:", 11);
    wstr(50, 56, FTX_LAST_FILE, 15);
  }
  gui_set_win(x, y, w, h);
  wbtn(4, h - 17, 54, 13, "NextFile", 0);
  wbtn(62, h - 17, 74, 13, "BeamToPeer", 0);
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

// 14. StudioNet Web Browser (SpiralWeb: 16 KB WEB_PAGE_BUF_EXT + image/spiral-snap)
void web_draw_inline_img(int x, int y, int max_w, int max_h, int src_str) {
  if (max_w <= 0 || max_h <= 0) return;
  int fidx = fs_find(src_str);
  if (fidx >= 0 && fs_entry_size(fidx) >= 96 * 16) {
    gui_blit_clipped(x, y, 96, 16, max_w, max_h, fs_entry_data_ptr(fidx));
    return;
  }
  int seed = 5381;
  int i = 0;
  while (r8(src_str + i) != 0) {
    seed = ((seed << 5) + seed) ^ r8(src_str + i);
    i = i + 1;
  }
  int rw = 64;
  if (rw > max_w) rw = max_w;
  int rh = 14;
  if (rh > max_h) rh = max_h;
  hal_rect(x, y, rw, rh, 0);
  for (int row = 0; row < 12; row++) {
    for (int col = 0; col < 15; col++) {
      seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
      int c = 9 + ((seed >> 8) % 6);
      if (((seed >> 4) & 3) != 0 && 2 + col * 4 + 3 <= rw && 1 + row + 1 <= rh) {
        hal_rect(x + 2 + col * 4, y + 1 + row, 3, 1, c);
      }
    }
  }
}

int web_extract_attr(int p, int key_str, int klen, int dst, int max_len) {
  hal_memset(dst, 0, max_len + 2);
  while (r8(WEB_PAGE_BUF_EXT + p) != 0 && r8(WEB_PAGE_BUF_EXT + p) != 62) {
    if (match_prefix(WEB_PAGE_BUF_EXT + p, key_str)) {
      p = p + klen;
      int q = r8(WEB_PAGE_BUF_EXT + p);
      if (q == 39 || q == 34) p = p + 1;
      int i = 0;
      while (r8(WEB_PAGE_BUF_EXT + p) != 0 && r8(WEB_PAGE_BUF_EXT + p) != 39 && r8(WEB_PAGE_BUF_EXT + p) != 34 && r8(WEB_PAGE_BUF_EXT + p) != 62 && i < max_len) {
        w8(dst + i, r8(WEB_PAGE_BUF_EXT + p));
        p = p + 1;
        i = i + 1;
      }
    } else {
      p = p + 1;
    }
  }
  if (r8(WEB_PAGE_BUF_EXT + p) == 62) p = p + 1;
  return p;
}

void app_draw_browser(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  wbtn(4, 15, 52, 11, "PeerWeb", 0);
  wbtn(58, 15, 60, 11, "SonderGW", 0);
  wbtn(120, 15, 48, 11, "Local", 0);
  wbtn(170, 15, 58, 11, "Back", g_web_hist_cnt > 0);

  if (h <= 32 || w <= 8) return;
  hal_rect(x + 4, y + 28, w - 8, h - 32, 16);
  g_web_link_cnt = 0;
  g_web_img_drawn = 0;

  if (g_web_is_snap == 1) {
    gui_blit_clipped(x + 8, y + 31, 96, 56, w - 16, h - 36, WEB_PAGE_BUF_EXT);
    g_web_img_drawn = 1;
    w32(VMRAM_STATUS + 0x68, 1);
    return;
  }

  int p = 0;
  int ry = y + 31;
  int cx = x + 8;
  int col = 15;
  int in_link = 0;

  while (r8(WEB_PAGE_BUF_EXT + p) != 0 && ry <= y + h - 12) {
    if (r8(WEB_PAGE_BUF_EXT + p) == 60) {
      if (match_prefix(WEB_PAGE_BUF_EXT + p, "<h1>")) {
        col = 14; p = p + 4; cx = x + 8; continue;
      }
      if (match_prefix(WEB_PAGE_BUF_EXT + p, "</h1>")) {
        col = 15; p = p + 5; ry = ry + 10; cx = x + 8; continue;
      }
      if (match_prefix(WEB_PAGE_BUF_EXT + p, "<p>")) {
        col = 15; p = p + 3; cx = x + 8; continue;
      }
      if (match_prefix(WEB_PAGE_BUF_EXT + p, "</p>")) {
        p = p + 4; ry = ry + 9; cx = x + 8; continue;
      }
      if (match_prefix(WEB_PAGE_BUF_EXT + p, "<img ")) {
        p = web_extract_attr(p + 5, "src=", 4, WEB_IMG_SRC, 58);
        if (cx > x + 8) { ry = ry + 9; cx = x + 8; }
        if (ry + 16 <= y + h - 4) {
          web_draw_inline_img(cx, ry, x + w - 4 - cx, y + h - 4 - ry, WEB_IMG_SRC);
          g_web_img_drawn = g_web_img_drawn + 1;
          w32(VMRAM_STATUS + 0x68, g_web_img_drawn);
        }
        ry = ry + 16;
        cx = x + 8;
        continue;
      }
      if (match_prefix(WEB_PAGE_BUF_EXT + p, "<a ")) {
        int lslot = WEB_LINK_TAB + g_web_link_cnt * 48;
        hal_memset(lslot, 0, 48);
        p = web_extract_attr(p + 3, "href=", 5, lslot + 16, 30);
        if (g_web_link_cnt < 12) {
          w32(lslot + 0, cx - x);
          w32(lslot + 4, ry - y);
          in_link = 1;
        }
        col = 11;
        continue;
      }
      if (match_prefix(WEB_PAGE_BUF_EXT + p, "</a>")) {
        if (in_link == 1 && g_web_link_cnt < 12) {
          int lslot = WEB_LINK_TAB + g_web_link_cnt * 48;
          int rx0 = r32(lslot + 0);
          int ry0 = r32(lslot + 4);
          int rx1 = cx - x;
          if (rx1 <= rx0) rx1 = rx0 + 32;
          if (rx1 > w - 6) rx1 = w - 6;
          w32(lslot + 8, rx1);
          w32(lslot + 12, (ry - y) + 9);
          if (rx1 > rx0 && y + ry0 + 8 < y + h - 4) {
            hal_rect(x + rx0, y + ry0 + 8, rx1 - rx0, 1, 11);
          }
          g_web_link_cnt = g_web_link_cnt + 1;
        }
        in_link = 0;
        col = 15;
        p = p + 4;
        continue;
      }
      while (r8(WEB_PAGE_BUF_EXT + p) != 0 && r8(WEB_PAGE_BUF_EXT + p) != 62) p = p + 1;
      if (r8(WEB_PAGE_BUF_EXT + p) == 62) p = p + 1;
      continue;
    }
    int ch = r8(WEB_PAGE_BUF_EXT + p);
    if (ch == 10) {
      if (cx > x + 8) {
        ry = ry + 9;
        cx = x + 8;
      }
    } else if (ch >= 32) {
      if (cx + 8 <= x + w - 4) {
        if (ry + 8 <= y + h - 4) {
          hal_char(cx, ry, ch, col, -1, 0);
        }
        cx = cx + 8;
      } else {
        ry = ry + 9;
        cx = x + 8;
        if (ry + 8 <= y + h - 4 && cx + 8 <= x + w - 4) {
          hal_char(cx, ry, ch, col, -1, 0);
          cx = cx + 8;
        }
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
