import "/src/app_abi.sp";
int g_sel; int g_scroll; int g_modal; int g_in_len;
void app_init(int abi, int arg0) { if (arg0 == -1) return; g_sel = 0; g_scroll = 0; g_modal = 0; g_in_len = 0; }
void app_draw(int x, int y, int w, int h) {
gui_set_win(x, y, w, h);
int max_show = (h - 46) / 10; if (max_show < 1) max_show = 1;
gui_reg_ctl(4, 25, w - 8, h - 43, 0);
wbtn(4, 14, 34, 10, "+New", 0);
wbtn(40, 14, 34, 10, "+Dir", 0);
wbtn(76, 14, 28, 10, "Ren", 0);
wbtn(106, 14, 28, 10, "Del", 0);
wbtn(136, 14, 34, 10, "Open", 0);
int tot = abi_fs_count();
if (g_sel >= tot && tot > 0) g_sel = tot - 1;
if (g_sel < g_scroll) g_scroll = g_sel;
if (g_sel >= g_scroll + max_show) g_scroll = g_sel - max_show + 1;
hal_rect(x + 4, y + 25, w - 8, h - 43, 0);
for (int i = 0; i < max_show && g_scroll + i < tot; i++) {
int fidx = abi_fs_nth(g_scroll + i);
if (fidx >= 0) {
int ry = y + 26 + i * 10;
if (g_scroll + i == g_sel) hal_rect(x + 5, ry, w - 16, 9, 1);
gui_str_clip(x + 6, ry + 1, abi_fs_entry_ptr(fidx), (w - 20) / 8, 15, -1);
}
}
gui_draw_vscroll(w - 8, 25, h - 43, g_scroll, max_show, tot);
wbtn(56, h - 15, 38, 11, "+New", 0); wnum(6, h - 13, abi_fs_free() / 1024, 14); wstr(36, h - 13, "KB", 11);
if (g_modal != 0) {
hal_rect(x + 12, y + 32, w - 24, 36, 16);
if (g_modal == 1) wstr(16, 36, "New file path:", 14);
else if (g_modal == 2) wstr(16, 36, "New folder:", 14);
else if (g_modal == 3) wstr(16, 36, "Rename to:", 14);
else wstr(16, 36, "Delete? (Enter)", 12);
if (g_modal != 4) {
hal_rect(x + 16, y + 48, w - 32, 11, 0);
gui_str_clip(x + 18, y + 49, FM_INPUT_BUF, (w - 36) / 8, 15, -1);
}
}
}
void app_click(int wid, int rx, int ry) {
if (ry >= 100 && rx >= 52 && rx < 96) {
abi_fs_write("/home/note.txt", "SpiralOS Note\n", 14);
return;
}
if (ry >= 14 && ry <= 24) {
if (rx >= 4 && rx < 38) {
abi_fs_write("/home/note.txt", "SpiralOS Note\n", 14);
return;
}
if (rx >= 40 && rx < 74) { g_modal = 2; hal_memset(FM_INPUT_BUF, 0, 48); hal_memcpy(FM_INPUT_BUF, "/home/dir", 9); g_in_len = 9; return; }
if (rx >= 76 && rx < 104) { g_modal = 3; hal_memset(FM_INPUT_BUF, 0, 48); g_in_len = 0; return; }
if (rx >= 106 && rx < 134) { g_modal = 4; return; }
if (rx >= 136 && rx < 170) {
int fidx = abi_fs_nth(g_sel);
if (fidx >= 0) abi_shell_open(abi_fs_entry_ptr(fidx));
return;
}
}
if (ry >= 25) {
int row = (ry - 26) / 10;
if (row >= 0) g_sel = g_scroll + row;
}
}
void app_key(int ascii, int vk, int mods) {
if (g_modal != 0) {
if (vk == 27) { g_modal = 0; return; }
if (ascii == 13) {
int fidx = abi_fs_nth(g_sel);
if (g_modal == 1 && g_in_len > 0) abi_fs_write(FM_INPUT_BUF, "", 0);
else if (g_modal == 2 && g_in_len > 0) abi_fs_write(FM_INPUT_BUF, "", 0);
else if (g_modal == 3 && g_in_len > 0 && fidx >= 0) {
abi_fs_write(FM_INPUT_BUF, abi_fs_data(fidx), abi_fs_size(fidx));
abi_fs_delete(abi_fs_entry_ptr(fidx));
} else if (g_modal == 4 && fidx >= 0) {
abi_fs_delete(abi_fs_entry_ptr(fidx));
}
g_modal = 0; return;
}
if (g_modal != 4) g_in_len = abi_field_key(FM_INPUT_BUF, g_in_len, 44, ascii);
return;
}
int tot = abi_fs_count();
if (vk == 38 && g_sel > 0) g_sel = g_sel - 1;
else if (vk == 40 && g_sel + 1 < tot) g_sel = g_sel + 1;
else if (ascii == 13) {
int fidx = abi_fs_nth(g_sel);
if (fidx >= 0) abi_shell_open(abi_fs_entry_ptr(fidx));
}
}
