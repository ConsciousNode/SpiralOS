import "/src/app_abi.sp";
int g_sol_mode; int g_sol_klon_draw; int g_sol_spider_suits; int g_sol_seed;
int g_sol_cursor; int g_sol_sel_pile; int g_sol_undo_cnt; int g_sol_moves;
int g_sol_won; int g_sol_solver_res; int g_sol_solver_moves; int g_sol_solver_nodes;
int cnsw_next_rand(int state) {
int q = 44488;
int r = 3399;
int hi = state / q;
int lo = state - hi * q;
int t = 48271 * lo - r * hi;
if (t > 0) return t;
return t + 2147483647;
}
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
hal_memset(&g_sol_cursor, 0, 32);
g_sol_sel_pile = -1;
hal_memset(SOL_PILES_BUF, 0, 1152);
if (mode == 0) {
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
ms_freecell_deal(seed, SOL_PILES_BUF, SOL_LEN_BUF);
} else {
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
g_sol_solver_res = 1;
g_sol_solver_moves = res;
} else if (g_sol_hit_budget == 1) {
g_sol_solver_res = 3;
g_sol_solver_moves = 0;
} else {
g_sol_solver_res = 2;
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
int p1 = abi_srrp_app_str(line, 0, "MS #1 first row:");
for (int c = 0; c < 8; c++) {
w8(line + p1, 32);
p1 = sol_append_card(line, p1 + 1, r8(SOL_PILES_BUF + c * 64));
}
abi_shell_print(line);
hal_memcpy(SOL_PILES_BUF, save_ptr, 1152);
int s = 1;
for (int i = 0; i < 10000; i++) s = cnsw_next_rand(s);
int lb2 = SRRP_SCRATCH_BUF;
abi_srrp_kv(lb2, 0, "MINSTD(48271) 10,000th value from seed 1: ", s);
abi_shell_print(lb2);
byte deck[52];
cnsw_shuffle(deck, 52, 1222);
int lb = SRRP_SCRATCH_BUF;
int p3 = abi_srrp_app_str(lb, 0, "CNSW deal v1 seed 1222, first 8 cards:");
for (int k = 0; k < 8; k++) {
w8(lb + p3, 32);
p3 = sol_append_card(lb, p3 + 1, deck[k]);
}
abi_shell_print(lb);
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
void sol_draw_pile_slot(int px, int py, int p_idx, int face_up_top) {
int plen = r32(SOL_LEN_BUF + p_idx * 4);
if (p_idx == g_sol_cursor) hal_rect(px - 1, py - 2, 18, 2, 14);
if (plen <= 0) {
hal_rect(px, py, 16, 18, 80);
} else {
int card = r8(SOL_PILES_BUF + p_idx * 64 + plen - 1);
sol_draw_card(px, py, card, face_up_top, p_idx == g_sol_sel_pile);
}
}
void app_draw(int x, int y, int w, int h) {
gui_set_win(x, y, w, h);
hal_rect(x + 4, y + 14, w - 8, h - 18, 82);
wbtn(6, 15, 30, 10, "Klon", g_sol_mode == 0);
wbtn(38, 15, 32, 10, "Free", g_sol_mode == 1);
wbtn(72, 15, 30, 10, "Spid", g_sol_mode == 2);
wbtn(104, 15, 30, 10, "Undo", g_sol_undo_cnt > 0);
wbtn(136, 15, 34, 10, "Solve", g_sol_solver_res != 0);
wstr(174, 16, "#", 14);
wnum(182, 16, g_sol_seed, 15);
if (g_sol_mode == 0) {
int dlbl = "D1"; if (g_sol_klon_draw == 3) dlbl = "D3";
wbtn(150, 28, 22, 10, dlbl, g_sol_klon_draw == 3);
wbtn(174, 28, 28, 10, "New", 0);
} else if (g_sol_mode == 2) {
int slbl = "1S"; if (g_sol_spider_suits == 2) slbl = "2S"; if (g_sol_spider_suits == 4) slbl = "4S";
wbtn(6, 28, 24, 10, slbl, g_sol_spider_suits > 1);
wbtn(34, 28, 28, 10, "New", 0);
} else {
wbtn(174, 28, 28, 10, "New", 0);
}
if (y + 46 <= y + h - 4) {
if (g_sol_mode == 0) {
sol_draw_pile_slot(x + 6, y + 27, 11, 0);
sol_draw_pile_slot(x + 26, y + 27, 12, 1);
for (int fi = 0; fi < 4; fi++) {
sol_draw_pile_slot(x + 66 + fi * 20, y + 27, 7 + fi, 1);
}
} else if (g_sol_mode == 1) {
for (int fc = 0; fc < 4; fc++) {
sol_draw_pile_slot(x + 6 + fc * 19, y + 27, 8 + fc, 1);
}
for (int ff = 0; ff < 4; ff++) {
sol_draw_pile_slot(x + 88 + ff * 19, y + 27, 12 + ff, 1);
}
} else {
sol_draw_pile_slot(x + 186, y + 27, 10, 0);
}
}
int cols = 7;
if (g_sol_mode == 1) cols = 8;
else if (g_sol_mode == 2) cols = 10;
int py = y + 48;
int max_col_h = (y + h - 16) - py;
if (max_col_h < 20) max_col_h = 20;
for (int c = 0; c < cols; c++) {
int px = x + 6 + c * 20;
if (px + 16 > x + w - 4) break;
int plen = r32(SOL_LEN_BUF + c * 4);
int pup  = r32(SOL_UP_BUF + c * 4);
if (c == g_sol_cursor) {
hal_rect(px - 1, py - 2, 18, 2, 14);
}
if (plen == 0) {
if (py + 18 <= y + h - 4) hal_rect(px, py, 16, 18, 80);
} else {
int step_y = 8;
if (plen > 1 && (plen - 1) * step_y + 18 > max_col_h) {
step_y = (max_col_h - 18) / (plen - 1);
if (step_y < 3) step_y = 3;
}
for (int r = 0; r < plen; r++) {
int cy = py + r * step_y;
if (cy + 18 > y + h - 4) cy = y + h - 22;
int card = r8(SOL_PILES_BUF + c * 64 + r);
int is_up = 1;
if (g_sol_mode != 1 && r < pup) is_up = 0;
sol_draw_card(px, cy, card, is_up, c == g_sol_sel_pile && r == plen - 1);
}
}
}
if (g_sol_solver_res == 1) {
int wb = SRRP_SCRATCH_BUF;
abi_srrp_app_str(wb, abi_srrp_kv(wb, 0, "WINNABLE (", g_sol_solver_moves), " moves)");
wstr(8, h - 12, wb, 14);
}
if (g_sol_solver_res == 2) wstr(8, h - 12, "UNWINNABLE", 12);
if (g_sol_solver_res == 3) wstr(8, h - 12, "UNKNOWN", 11);
}
void app_click(int wid, int rx, int ry) {
if (ry >= 15 && ry <= 25) {
if (rx >= 6 && rx < 36) sol_deal_game(0, g_sol_seed);
else if (rx >= 38 && rx < 70) sol_deal_game(1, g_sol_seed);
else if (rx >= 72 && rx < 102) sol_deal_game(2, g_sol_seed);
else if (rx >= 104 && rx < 134) sol_pop_undo();
else if (rx >= 136 && rx < 170) sol_run_solver(500);
return;
}
if (ry >= 27 && ry < 46) {
if (g_sol_mode == 0) {
if (rx >= 6 && rx < 24) { g_sol_cursor = 11; sol_clickwheel_select(); return; }
if (rx >= 26 && rx < 44) { g_sol_cursor = 12; sol_clickwheel_select(); return; }
if (rx >= 66 && rx < 146) { g_sol_cursor = 7 + (rx - 66) / 20; sol_clickwheel_select(); return; }
if (rx >= 150 && rx < 172) { if (g_sol_klon_draw == 1) g_sol_klon_draw = 3; else g_sol_klon_draw = 1; sol_deal_game(0, g_sol_seed); return; }
if (rx >= 174 && rx < 204) { sol_deal_game(0, g_sol_seed + 1); return; }
} else if (g_sol_mode == 1) {
if (rx >= 6 && rx < 82) { g_sol_cursor = 8 + (rx - 6) / 19; sol_clickwheel_select(); return; }
if (rx >= 88 && rx < 164) { g_sol_cursor = 12 + (rx - 88) / 19; sol_clickwheel_select(); return; }
if (rx >= 174 && rx < 204) { sol_deal_game(1, g_sol_seed + 1); return; }
} else {
if (rx >= 6 && rx < 30) { if (g_sol_spider_suits == 1) g_sol_spider_suits = 2; else if (g_sol_spider_suits == 2) g_sol_spider_suits = 4; else g_sol_spider_suits = 1; sol_deal_game(2, g_sol_seed); return; }
if (rx >= 34 && rx < 64) { sol_deal_game(2, g_sol_seed + 1); return; }
if (rx >= 184 && rx < 204) { g_sol_cursor = 10; sol_clickwheel_select(); return; }
}
return;
}
if (ry >= 47) {
int col = (rx - 6) / 20;
if (col >= 0 && col < 10) {
g_sol_cursor = col;
sol_clickwheel_select();
}
}
}
void app_key(int ascii, int vk, int mods) {
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
if (ascii == 't' || ascii == 'T') {
if (g_sol_mode == 0) { if (g_sol_klon_draw == 1) g_sol_klon_draw = 3; else g_sol_klon_draw = 1; sol_deal_game(0, g_sol_seed); }
else if (g_sol_mode == 2) { if (g_sol_spider_suits == 1) g_sol_spider_suits = 2; else if (g_sol_spider_suits == 2) g_sol_spider_suits = 4; else g_sol_spider_suits = 1; sol_deal_game(2, g_sol_seed); }
return;
}
if (ascii == 'n' || ascii == 'N') { sol_deal_game(g_sol_mode, g_sol_seed + 1); return; }
if (ascii == 'r' || ascii == 'R') { sol_deal_game(g_sol_mode, g_sol_seed); return; }
if (ascii == 'k' || ascii == 'K') { sol_deal_game(0, g_sol_seed); return; }
if (ascii == 'f' || ascii == 'F') { sol_deal_game(1, g_sol_seed); return; }
if (ascii == 'p' || ascii == 'P') { sol_deal_game(2, g_sol_seed); return; }
}
void app_init(int abi, int arg0) {
if (arg0 == -1) return;
g_sol_klon_draw = 1;
g_sol_spider_suits = 1;
sol_deal_game(0, 1);
if (arg0 == 1) sol_print_deal_checks();
}
