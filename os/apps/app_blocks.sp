import "/src/app_abi.sp";
int cnsw_next_rand(int state) {
int q = 44488;
int r = 3399;
int hi = state / q;
int lo = state - hi * q;
int t = 48271 * lo - r * hi;
if (t > 0) return t;
return t + 2147483647;
}
int blocks_grid[160];
int blk_bag[14];
int g_blk_bag_pos; int g_blk_rng; int g_blk_seed;
int g_blk_px; int g_blk_py; int g_blk_type; int g_blk_rot;
int g_blk_hold; int g_blk_hold_used; int g_blk_score; int g_blk_lines;
int g_blk_level; int g_blk_start_level; int g_blk_paused; int g_blk_steps;
int g_blk_last_grav_ms; int g_blk_lock_ms; int g_blk_cur_iv;
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
if (g_blk_start_level < 1) g_blk_start_level = 1;
if (g_blk_start_level > 10) g_blk_start_level = 10;
g_blk_level = g_blk_start_level;
int init_iv = 500 - (g_blk_level - 1) * 60;
if (init_iv < 80) init_iv = 80;
g_blk_cur_iv = init_iv;
abi_set_tick(11, init_iv);
w32(VMRAM_STATUS + 0x54, g_blk_level);
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
int nl = g_blk_start_level + (g_blk_lines / 10);
if (nl > g_blk_level) g_blk_level = nl;
w32(VMRAM_STATUS + 0x54, g_blk_level);
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
int grav_iv = 500 - (g_blk_level - 1) * 60;
if (grav_iv < 80) grav_iv = 80;
if (grav_iv != g_blk_cur_iv) { g_blk_cur_iv = grav_iv; abi_set_tick(11, grav_iv); }
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
void app_draw(int x, int y, int w, int h) {
gui_set_win(x, y, w, h);
int pw = w - 8;
if (pw > 50) pw = 50;
int ph = h - 20;
if (ph > 80) ph = 80;
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
wstr(58, 16, "Sc:", 11);
wnum(82, 16, g_blk_score, 15);
wstr(58, 26, "Lv:", 11);
wnum(82, 26, g_blk_level, 14);
wbtn(100, 24, 10, 10, "-", 0);
wbtn(112, 24, 10, 10, "+", 0);
wstr(58, 36, "Nxt:", 11);
for (int ni = 0; ni < 3; ni++) {
int ntype = blk_bag[g_blk_bag_pos + ni];
if (58 + 32 + ni * 8 + 6 <= w - 4 && 44 <= h - 4) {
hal_rect(x + 90 + ni * 8, y + 36, 6, 6, 9 + (ntype % 6));
}
}
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
void app_key(int ascii, int vk, int mods) {
if (ascii == 'p' || ascii == 'P') { g_blk_paused = 1 - g_blk_paused; return; }
if (ascii == '[' && g_blk_start_level > 1) { g_blk_start_level = g_blk_start_level - 1; blk_init_with_seed(g_blk_seed); return; }
if (ascii == ']' && g_blk_start_level < 10) { g_blk_start_level = g_blk_start_level + 1; blk_init_with_seed(g_blk_seed); return; }
if (ascii >= 49 && ascii <= 57) { g_blk_start_level = ascii - 48; blk_init_with_seed(g_blk_seed); return; }
if (g_blk_paused == 1) return;
if (ascii == 'c' || ascii == 'C') { blk_hold_swap(); return; }
if (vk == 38 || ascii == 'w') { blk_try_rotate(); return; }
if ((vk == 37 || ascii == 'a') && blk_collides(g_blk_px - 1, g_blk_py, g_blk_type, g_blk_rot) == 0) {
g_blk_px = g_blk_px - 1;
} else if ((vk == 39 || ascii == 'd') && blk_collides(g_blk_px + 1, g_blk_py, g_blk_type, g_blk_rot) == 0) {
g_blk_px = g_blk_px + 1;
} else if (vk == 40 || ascii == 's') {
if (blk_collides(g_blk_px, g_blk_py + 1, g_blk_type, g_blk_rot) == 0) {
g_blk_py = g_blk_py + 1;
g_blk_score = g_blk_score + 1;
} else {
blk_lock_piece();
}
} else if (ascii == 32) {
g_blk_py = blk_ghost_y();
blk_lock_piece();
}
}
void app_click(int wid, int rx, int ry) {
if (ry >= 24 && ry <= 34 && rx >= 100 && rx < 110) { if (g_blk_start_level > 1) g_blk_start_level = g_blk_start_level - 1; blk_init_with_seed(g_blk_seed); return; }
if (ry >= 24 && ry <= 34 && rx >= 112 && rx < 122) { if (g_blk_start_level < 10) g_blk_start_level = g_blk_start_level + 1; blk_init_with_seed(g_blk_seed); return; }
if (ry >= 76 && ry <= 87 && rx >= 90 && rx < 120) {
blk_init_with_seed(g_blk_seed + 1);
return;
}
blocks_step();
}
void app_init(int abi, int arg0) {
if (arg0 == -1) return;
g_blk_start_level = 1;
if (arg0 >= 1 && arg0 <= 10) g_blk_start_level = arg0;
blk_init_with_seed(1);
}
void app_tick() { blocks_step(); }
