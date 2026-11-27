import "/src/app_abi.sp";
int g_col; int g_tool; int g_strokes;
int g_hires_buf; int g_cw; int g_ch;
void app_init(int abi, int arg0) {
if (arg0 == -1) {
if (g_hires_buf != 0) { abi_heap_free(g_hires_buf); g_hires_buf = 0; }
return;
}
g_col = 14; g_tool = 0; g_strokes = 0; g_hires_buf = 0;
if (hal_info(1) >= 0x02000000) {
g_hires_buf = abi_heap_alloc(192 * 112);
if (g_hires_buf != 0) {
hal_memset(g_hires_buf, 0, 192 * 112);
g_cw = 192; g_ch = 112;
w32(VMRAM_STATUS + 0x4C, 192 * 112);
return;
}
}
g_cw = 96; g_ch = 56;
w32(VMRAM_STATUS + 0x4C, 96 * 56);
}
void app_draw(int x, int y, int w, int h) {
gui_set_win(x, y, w, h);
for (int i = 0; i < 8; i++) {
int c = 9 + i; if (i == 7) c = 196;
if (6 + i * 11 + 9 <= w - 4) {
hal_rect(x + 4 + i * 11, y + 15, 9, 9, c);
if (g_col == c) hal_rect(x + 4 + i * 11, y + 25, 9, 2, 15);
}
}
wbtn(96, 15, 28, 10, "Clr", 0);
wbtn(126, 15, 32, 10, "Save", 0);
wbtn(160, 15, 32, 10, "Open", 0);
gui_blit_clipped(x + 4, y + 29, 96, 56, w - 12, h - 33, PAINT_CANVAS);
if (r32(SHARED_ST + 0x18) != 0 && r32(SHARED_ST + 0x1C) == 5) abi_dlg_draw(x, y, w, h);
}
void app_click(int wid, int rx, int ry) {
if (r32(SHARED_ST + 0x18) != 0 && r32(SHARED_ST + 0x1C) == 5) { abi_dlg_click(wid, rx, ry); return; }
if (ry >= 15 && ry <= 25) {
if (rx >= 4 && rx < 92) {
int idx = (rx - 4) / 11;
if (idx >= 0 && idx < 8) { g_col = 9 + idx; if (idx == 7) g_col = 196; }
return;
}
if (rx >= 96 && rx < 124) {
hal_memset(PAINT_CANVAS, 0, 96 * 56);
if (g_hires_buf != 0) hal_memset(g_hires_buf, 0, 192 * 112);
w32(SHARED_ST + 0x14, 1);
return;
}
if (rx >= 126 && rx < 158) {
abi_fs_write("/art/user.pic", PAINT_CANVAS, 96 * 56);
w32(SHARED_ST + 0x14, 0);
return;
}
if (rx >= 160 && rx < 192) { abi_dlg_open(2, 5, 1, "user.pic"); return; }
}
int cx = rx - 4; int cy = ry - 29;
if (cx >= 0 && cx < 96 && cy >= 0 && cy < 56) {
for (int dy = -1; dy <= 1; dy++) {
for (int dx = -1; dx <= 1; dx++) {
int px = cx + dx; int py = cy + dy;
if (px >= 0 && px < 96 && py >= 0 && py < 56) w8(PAINT_CANVAS + py * 96 + px, g_col);
}
}
if (g_hires_buf != 0) {
int hx = cx * 2; int hy = cy * 2;
w8(g_hires_buf + hy * 192 + hx, g_col);
w8(g_hires_buf + hy * 192 + hx + 1, g_col);
}
g_strokes = g_strokes + 1;
w32(SHARED_ST + 0x14, 1);
}
}
void app_key(int ascii, int vk, int mods) {
if (r32(SHARED_ST + 0x18) != 0 && r32(SHARED_ST + 0x1C) == 5) { abi_dlg_key(ascii, vk); return; }
if ((mods & 2) != 0 && (ascii == 19 || ascii == 's')) {
abi_fs_write("/art/user.pic", PAINT_CANVAS, 96 * 56);
w32(SHARED_ST + 0x14, 0);
}
}
