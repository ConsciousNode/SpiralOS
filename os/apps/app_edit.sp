import "/src/app_abi.sp";
int g_cur; int g_sel_a; int g_sel_b; int g_scroll; int g_undo_len;
void edit_load(int path) {
int idx = abi_fs_find(path);
if (idx < 0) return;
int sz = abi_fs_size(idx); if (sz > 35000) sz = 35000;
hal_memcpy(EDIT_BUF, abi_fs_data(idx), sz);
w8(EDIT_BUF + sz, 0);
w32(SHARED_ST + 0x08, sz); w32(SHARED_ST + 0x0C, 0); w32(SHARED_ST + 0x10, idx);
g_cur = sz; g_sel_a = sz; g_sel_b = sz; g_scroll = 0;
}
void edit_save() {
int fidx = r32(SHARED_ST + 0x10);
if (fidx < 0) return;
abi_fs_write(abi_fs_entry_ptr(fidx), EDIT_BUF, r32(SHARED_ST + 0x08));
w32(SHARED_ST + 0x0C, 0);
}
void edit_col196() {
edit_load("/src/wm.sp");
int len = r32(SHARED_ST + 0x08);
int needle = "WM_TITLE_COLOR_OVERRIDE = ";
int nlen = hal_strlen(needle);
for (int i = 0; i < len - nlen - 3; i++) {
int ok = 1;
for (int k = 0; k < nlen; k++) { if (r8(EDIT_BUF + i + k) != r8(needle + k)) { ok = 0; break; } }
if (ok == 1) {
int vp = i + nlen; int ve = vp;
while (ve < len && r8(EDIT_BUF + ve) != 59) ve = ve + 1;
int tail = len - ve;
if (tail > 0) hal_memcpy(EDIT_SCRATCH, EDIT_BUF + ve, tail);
w8(EDIT_BUF + vp, 49); w8(EDIT_BUF + vp + 1, 57); w8(EDIT_BUF + vp + 2, 54);
if (tail > 0) hal_memcpy(EDIT_BUF + vp + 3, EDIT_SCRATCH, tail);
len = vp + 3 + tail; w8(EDIT_BUF + len, 0);
w32(SHARED_ST + 0x08, len); w32(SHARED_ST + 0x0C, 1);
edit_save();
return;
}
}
}
void app_init(int abi, int arg0) {
if (arg0 == -1) return;
int len = r32(SHARED_ST + 0x08);
if (len == 0) edit_load("/src/wm.sp");
len = r32(SHARED_ST + 0x08);
g_cur = 0; g_sel_a = 0; g_sel_b = 0; g_scroll = 0; g_undo_len = len;
}
void app_draw(int x, int y, int w, int h) {
gui_set_win(x, y, w, h);
int tx = x + 4; int ty = y + 28; int tw = w - 8; int th = h - 32;
gui_reg_ctl(4, 28, tw, th, 0);
wbtn(4, 15, 44, 11, "wm.sp", 0);
wbtn(50, 15, 52, 11, "Col196", 0);
wbtn(104, 15, 36, 11, "Save", 0);
wbtn(142, 15, 38, 11, "Build", 0);
hal_rect(tx, ty, tw, th, 0);
int len = r32(SHARED_ST + 0x08);
int cols = (tw - 10) / 8; if (cols < 4) cols = 4;
int max_rows = (th - 4) / 9; if (max_rows < 1) max_rows = 1;
int cur_row = 0;
for (int ci = 0; ci < g_cur && ci < len; ci++) {
if (r8(EDIT_BUF + ci) == 10) cur_row = cur_row + 1;
}
if (cur_row < g_scroll) g_scroll = cur_row;
if (cur_row >= g_scroll + max_rows) g_scroll = cur_row - max_rows + 1;
w32(VMRAM_STATUS + 0xC4, g_scroll);
w32(VMRAM_STATUS + 0xC8, cur_row);
int row = 0; int col = 0;
for (int i = 0; i <= len; i++) {
int vr = row - g_scroll;
if (i == g_cur && vr >= 0 && vr < max_rows && gui_caret_on()) {
hal_rect(tx + 2 + col * 8, ty + 2 + vr * 9, 2, 8, 14);
}
if (i == len) break;
int ch = r8(EDIT_BUF + i);
if (ch == 10) { row = row + 1; col = 0; continue; }
if (vr >= 0 && vr < max_rows && col < cols) {
hal_char(tx + 2 + col * 8, ty + 2 + vr * 9, ch, 15, -1, 0);
}
col = col + 1;
}
gui_draw_vscroll(w - 8, 28, th, g_scroll, max_rows, row + 2);
}
void app_click(int wid, int rx, int ry) {
if (ry >= 15 && ry <= 26) {
if (rx >= 4 && rx < 48) { edit_load("/src/wm.sp"); return; }
if (rx >= 50 && rx < 102) { edit_col196(); return; }
if (rx >= 104 && rx < 140) { edit_save(); return; }
if (rx >= 142 && rx < 190) { abi_cc_rebuild(); abi_open_app(4); return; }
}
}
void app_key(int ascii, int vk, int mods) {
int len = r32(SHARED_ST + 0x08);
if (g_cur > len) g_cur = len;
if ((mods & 2) != 0) {
if (ascii == 1 || ascii == 'a') { g_sel_a = 0; g_sel_b = len; g_cur = len; return; }
if (ascii == 3 || ascii == 'c') {
int a = g_sel_a; int b = g_sel_b; if (a > b) { int t = a; a = b; b = t; }
if (b > a) abi_clip_copy(EDIT_BUF + a, b - a, 0);
return;
}
if (ascii == 22 || ascii == 'v') {
int nl = abi_clip_paste(EDIT_BUF, len, 35000, g_cur);
int add = nl - len; w32(SHARED_ST + 0x08, nl); w32(SHARED_ST + 0x0C, 1);
g_cur = g_cur + add; g_sel_a = g_cur; g_sel_b = g_cur;
return;
}
if (ascii == 19 || ascii == 's') { edit_save(); return; }
}
if (ascii == 8 || vk == 8) {
if (g_cur > 0) {
int tail = len - g_cur;
if (tail > 0) hal_memcpy(EDIT_BUF + g_cur - 1, EDIT_BUF + g_cur, tail);
len = len - 1; g_cur = g_cur - 1; w8(EDIT_BUF + len, 0);
w32(SHARED_ST + 0x08, len); w32(SHARED_ST + 0x0C, 1);
}
return;
}
if (ascii == 13 || (ascii >= 32 && ascii < 127)) {
int ch = ascii; if (ch == 13) ch = 10;
if (len < 35000) {
int tail2 = len - g_cur; if (tail2 > 0) { hal_memcpy(EDIT_SCRATCH, EDIT_BUF + g_cur, tail2); hal_memcpy(EDIT_BUF + g_cur + 1, EDIT_SCRATCH, tail2); }
w8(EDIT_BUF + g_cur, ch); len = len + 1; g_cur = g_cur + 1; w8(EDIT_BUF + len, 0);
w32(SHARED_ST + 0x08, len); w32(SHARED_ST + 0x0C, 1);
}
}
}
