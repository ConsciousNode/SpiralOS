import "/src/app_abi.sp";
int g_ftx_sel;
void app_init(int abi, int arg0) { if (arg0 == -1) return; g_ftx_sel = 0; }
void app_draw(int x, int y, int w, int h) {
gui_set_win(x, y, w, h);
int cnt = abi_fs_count();
if (cnt > 0 && g_ftx_sel >= cnt) g_ftx_sel = 0;
wstr(6, 15, "StudioNet SSP File Beam", 14);
wstr(6, 28, "Selected:", 11);
if (cnt > 0) {
int eidx = abi_fs_nth(g_ftx_sel);
if (eidx >= 0) gui_str_clip(x + 6, y + 38, abi_fs_entry_ptr(eidx), (w - 12) / 8, 15, -1);
}
wstr(6, 52, "Last RX:", 11);
gui_str_clip(x + 6, y + 62, 0x049B00, (w - 12) / 8, 10, -1);
wbtn(4, h - 16, 68, 12, "NextFile", 0);
wbtn(76, h - 16, 96, 12, "BeamToPeer", 0);
}
void app_click(int wid, int rx, int ry) {
int cnt = abi_fs_count();
if (rx < 74) {
if (cnt > 0) g_ftx_sel = (g_ftx_sel + 1) % cnt;
return;
}
if (cnt > 0) {
int eidx = abi_fs_nth(g_ftx_sel);
if (eidx >= 0) {
int dst = 0xFFFF;
if (abi_sns_peer_cnt() > 0) dst = abi_sns_peer_node(0);
abi_net_send_file(dst, abi_fs_entry_ptr(eidx));
}
}
}
void app_key(int ascii, int vk, int mods) {
int cnt = abi_fs_count();
if (ascii == 9 && cnt > 0) { g_ftx_sel = (g_ftx_sel + 1) % cnt; return; }
if ((ascii == 13 || ascii == 32) && cnt > 0) {
int eidx = abi_fs_nth(g_ftx_sel);
if (eidx >= 0) {
int dst = 0xFFFF;
if (abi_sns_peer_cnt() > 0) dst = abi_sns_peer_node(0);
abi_net_send_file(dst, abi_fs_entry_ptr(eidx));
}
}
}
