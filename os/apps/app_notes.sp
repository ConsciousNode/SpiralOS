import "/src/app_abi.sp";
int g_cur; int g_sel_a; int g_sel_b; int g_scroll; int g_wrap;
int g_find_mode; int g_find_len; int g_undo_len;
void app_init(int abi, int arg0) {
if (arg0 == -1) return;
g_wrap = 1; g_find_mode = 0; g_find_len = 0;
if (arg0 == 0) {
w8(NOTES_BUF, 0);
w8(NOTES_PATH_BUF, 0);
w32(SHARED_ST + 0x00, 0);
w32(SHARED_ST + 0x04, 0);
}
int len = r32(SHARED_ST + 0x00);
g_cur = len; g_sel_a = len; g_sel_b = len; g_scroll = 0; g_undo_len = len;
}
void save_undo() {
int len = r32(SHARED_ST + 0x00);
int u = len; if (u > 4096) u = 4096;
if (u > 0) hal_memcpy(NOTES_UNDO_BUF, NOTES_BUF, u);
g_undo_len = u;
}
void del_range(int a, int b) {
int len = r32(SHARED_ST + 0x00);
if (a > b) { int t = a; a = b; b = t; }
if (a < 0) a = 0; if (b > len) b = len;
if (a >= b) return;
int tail = len - b;
if (tail > 0) hal_memcpy(NOTES_BUF + a, NOTES_BUF + b, tail);
len = len - (b - a);
w8(NOTES_BUF + len, 0);
w32(SHARED_ST + 0x00, len);
w32(SHARED_ST + 0x04, 1);
g_cur = a; g_sel_a = a; g_sel_b = a;
}
void ins_ch(int ch) {
int len = r32(SHARED_ST + 0x00);
if (g_sel_a != g_sel_b) { del_range(g_sel_a, g_sel_b); len = r32(SHARED_ST + 0x00); }
if (len >= 32000) return;
if (g_cur > len) g_cur = len;
for (int i = len; i > g_cur; i = i - 1) w8(NOTES_BUF + i, r8(NOTES_BUF + i - 1));
w8(NOTES_BUF + g_cur, ch);
len = len + 1; w8(NOTES_BUF + len, 0);
g_cur = g_cur + 1; g_sel_a = g_cur; g_sel_b = g_cur;
w32(SHARED_ST + 0x00, len);
w32(SHARED_ST + 0x04, 1);
}
void app_draw(int x, int y, int w, int h) {
gui_set_win(x, y, w, h);
int tx = x + 4; int ty = y + 28; int tw = w - 8; int th = h - 32;
gui_reg_ctl(4, ty - y, tw, th, 0);
wbtn(4, 15, 26, 11, "New", 0);
wbtn(32, 15, 30, 11, "Open", 0);
wbtn(64, 15, 30, 11, "Save", 0);
wbtn(96, 15, 30, 11, "SvAs", 0);
wbtn(128, 15, 28, 11, "Find", g_find_mode);
wbtn(158, 15, 28, 11, "Wrap", g_wrap);
wbtn(188, 15, 16, 11, "Cp", 0);
wbtn(206, 15, 16, 11, "Ps", 0);
hal_rect(tx, ty, tw, th, 0);
int len = r32(SHARED_ST + 0x00);
int cols = (tw - 10) / 8; if (cols < 4) cols = 4;
int max_rows = (th - 4) / 16; if (max_rows < 1) max_rows = 1;
int sa = g_sel_a; int sb = g_sel_b;
if (sa > sb) { int t = sa; sa = sb; sb = t; }
int cur_row = 0; int ccol = 0;
for (int ci = 0; ci < g_cur && ci < len; ci++) {
int cch = r8(NOTES_BUF + ci);
if (cch == 10) { cur_row = cur_row + 1; ccol = 0; }
else { ccol = ccol + 1; if (g_wrap == 1 && ccol >= cols) { cur_row = cur_row + 1; ccol = 0; } }
}
if (cur_row < g_scroll) g_scroll = cur_row;
if (cur_row >= g_scroll + max_rows) g_scroll = cur_row - max_rows + 1;
w32(VMRAM_STATUS + 0xBC, g_scroll);
w32(VMRAM_STATUS + 0xC0, cur_row);
int row = 0; int col = 0;
for (int i = 0; i <= len; i++) {
int vr = row - g_scroll;
if (i == g_cur && vr >= 0 && vr < max_rows && gui_caret_on()) {
hal_rect(tx + 2 + col * 8, ty + 2 + vr * 16, 2, 14, 14);
}
if (i == len) break;
int ch = r8(NOTES_BUF + i);
if (ch == 10) { row = row + 1; col = 0; continue; }
if (vr >= 0 && vr < max_rows && col < cols) {
int bg = -1; int fg = 15;
if (i >= sa && i < sb) { bg = 1; fg = 14; }
hal_char(tx + 2 + col * 8, ty + 2 + vr * 16, ch, fg, bg, 1);
}
col = col + 1;
if (g_wrap == 1 && col >= cols) { row = row + 1; col = 0; }
}
gui_draw_vscroll(w - 8, ty - y, th, g_scroll, max_rows, row + 2);
if (r32(SHARED_ST + 0x18) != 0 && r32(SHARED_ST + 0x1C) == 16) abi_dlg_draw(x, y, w, h);
}
void app_click(int wid, int rx, int ry) {
if (r32(SHARED_ST + 0x18) != 0 && r32(SHARED_ST + 0x1C) == 16) { abi_dlg_click(wid, rx, ry); return; }
if (ry >= 15 && ry <= 26) {
if (rx >= 4 && rx < 30) {
w8(NOTES_BUF, 0); w8(NOTES_PATH_BUF, 0);
w32(SHARED_ST + 0x00, 0); w32(SHARED_ST + 0x04, 0);
g_cur = 0; g_sel_a = 0; g_sel_b = 0; g_scroll = 0;
return;
}
if (rx >= 32 && rx < 62) { abi_dlg_open(2, 16, 0, "note.txt"); return; }
if (rx >= 64 && rx < 94) {
if (r8(NOTES_PATH_BUF) != 0) {
abi_fs_write(NOTES_PATH_BUF, NOTES_BUF, r32(SHARED_ST + 0x00));
w32(SHARED_ST + 0x04, 0);
} else {
abi_dlg_open(1, 16, 0, "note.txt");
}
return;
}
if (rx >= 96 && rx < 126) { abi_dlg_open(1, 16, 0, "note.txt"); return; }
if (rx >= 128 && rx < 156) { g_find_mode = 1 - g_find_mode; return; }
if (rx >= 158 && rx < 186) { g_wrap = 1 - g_wrap; return; }
if (rx >= 188 && rx < 204) {
int a = g_sel_a; int b = g_sel_b; if (a > b) { int t = a; a = b; b = t; }
if (b > a) abi_clip_copy(NOTES_BUF + a, b - a, 0);
return;
}
if (rx >= 206 && rx < 224) {
save_undo();
if (g_sel_a != g_sel_b) del_range(g_sel_a, g_sel_b);
int nl = abi_clip_paste(NOTES_BUF, r32(SHARED_ST + 0x00), 32000, g_cur);
int add = nl - r32(SHARED_ST + 0x00);
w32(SHARED_ST + 0x00, nl); w32(SHARED_ST + 0x04, 1);
g_cur = g_cur + add; g_sel_a = g_cur; g_sel_b = g_cur;
return;
}
}
}
void app_key(int ascii, int vk, int mods) {
if (r32(SHARED_ST + 0x18) != 0 && r32(SHARED_ST + 0x1C) == 16) { abi_dlg_key(ascii, vk); return; }
int len = r32(SHARED_ST + 0x00);
if (g_cur > len) g_cur = len;
if ((mods & 2) != 0) {
if (ascii == 1 || ascii == 'a') { g_sel_a = 0; g_sel_b = len; g_cur = len; return; }
if (ascii == 3 || ascii == 'c') {
int a = g_sel_a; int b = g_sel_b; if (a > b) { int t = a; a = b; b = t; }
if (b > a) abi_clip_copy(NOTES_BUF + a, b - a, 0);
return;
}
if (ascii == 24 || ascii == 'x') {
int a = g_sel_a; int b = g_sel_b; if (a > b) { int t = a; a = b; b = t; }
if (b > a) { save_undo(); abi_clip_copy(NOTES_BUF + a, b - a, 0); del_range(a, b); }
return;
}
if (ascii == 22 || ascii == 'v') {
save_undo();
if (g_sel_a != g_sel_b) del_range(g_sel_a, g_sel_b);
int nl = abi_clip_paste(NOTES_BUF, r32(SHARED_ST + 0x00), 32000, g_cur);
int add = nl - r32(SHARED_ST + 0x00);
w32(SHARED_ST + 0x00, nl); w32(SHARED_ST + 0x04, 1);
g_cur = g_cur + add; g_sel_a = g_cur; g_sel_b = g_cur;
return;
}
if (ascii == 19 || ascii == 's') {
if (r8(NOTES_PATH_BUF) != 0) { abi_fs_write(NOTES_PATH_BUF, NOTES_BUF, len); w32(SHARED_ST + 0x04, 0); }
else abi_dlg_open(1, 16, 0, "note.txt");
return;
}
if (ascii == 26 || ascii == 'z') {
if (g_undo_len > 0) hal_memcpy(NOTES_BUF, NOTES_UNDO_BUF, g_undo_len);
w8(NOTES_BUF + g_undo_len, 0);
w32(SHARED_ST + 0x00, g_undo_len); g_cur = g_undo_len; g_sel_a = g_cur; g_sel_b = g_cur;
return;
}
}
if (vk == 37) { if (g_cur > 0) g_cur = g_cur - 1; if ((mods & 1) == 0) g_sel_a = g_cur; g_sel_b = g_cur; return; }
if (vk == 39) { if (g_cur < len) g_cur = g_cur + 1; if ((mods & 1) == 0) g_sel_a = g_cur; g_sel_b = g_cur; return; }
if (vk == 36) { g_cur = 0; if ((mods & 1) == 0) g_sel_a = 0; g_sel_b = 0; return; }
if (vk == 35) { g_cur = len; if ((mods & 1) == 0) g_sel_a = len; g_sel_b = len; return; }
if (ascii == 8 || vk == 8) {
save_undo();
if (g_sel_a != g_sel_b) del_range(g_sel_a, g_sel_b);
else if (g_cur > 0) del_range(g_cur - 1, g_cur);
return;
}
if (ascii == 13) { save_undo(); ins_ch(10); return; }
if (ascii >= 32 && ascii < 127) { save_undo(); ins_ch(ascii); return; }
}
