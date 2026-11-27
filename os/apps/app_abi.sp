const ABI_BASE = 0x04DD80;
const VMRAM_STATUS = 0x0FFD00;
const VMRAM_RTC    = 0x0FFD90;
const NUM_STR_BUF  = 0x04DF00;
int hal_yield() { return sys(1); }
int hal_time() { return sys(2); }
int hal_rect(int x, int y, int w, int h, int col) { return sys(5, x, y, w, h, col); }
int hal_char(int x, int y, int ch, int fg, int bg, int font) { return sys(6, x, y, ch, fg, bg, font); }
int hal_str(int x, int y, int s, int fg, int bg) { return sys(7, x, y, s, fg, bg); }
int hal_memcpy(int dst, int src, int len) { return sys(8, dst, src, len); }
int hal_memset(int dst, int val, int len) { return sys(9, dst, val, len); }
int hal_disk_sync(int s, int c) { return sys(10, s, c); }
int hal_info(int q) { return sys(16, q); }
int hal_blit(int x, int y, int w, int h, int src) { return sys(17, x, y, w, h, src); }
int hal_strcmp(int a, int b) { return sys(18, a, b); }
int hal_strlen(int s) { return sys(19, s); }
int hal_itoa(int v, int b, int r) { return sys(20, v, b, r); }
int hal_date() { return sys(22); }
int hal_disk2_info(int cmd) { return sys(23, cmd); }
int hal_disk2_read(int lba, int cnt, int dst) { return sys(24, lba, cnt, dst); }
int hal_disk2_write(int lba, int cnt, int src) { return sys(25, lba, cnt, src); }
int hal_audio_info(int cmd) { return sys(26, cmd); }
int hal_audio_write(int src, int frames) { return sys(27, src, frames); }
int abi_fs_find(int p) { return icall(p, r32(ABI_BASE + 0 * 4)); }
int abi_fs_count() { return icall(r32(ABI_BASE + 1 * 4)); }
int abi_fs_nth(int n) { return icall(n, r32(ABI_BASE + 2 * 4)); }
int abi_fs_entry_ptr(int i) { return icall(i, r32(ABI_BASE + 3 * 4)); }
int abi_fs_entry_flags(int i) { return icall(i, r32(ABI_BASE + 4 * 4)); }
int abi_fs_data(int i) { return icall(i, r32(ABI_BASE + 5 * 4)); }
int abi_fs_size(int i) { return icall(i, r32(ABI_BASE + 6 * 4)); }
int abi_fs_write(int p, int s, int l) { return icall(p, s, l, r32(ABI_BASE + 7 * 4)); }
int abi_fs_delete(int p) { return icall(p, r32(ABI_BASE + 8 * 4)); }
int abi_fs_free() { return icall(r32(ABI_BASE + 9 * 4)); }
int abi_fs_used() { return icall(r32(ABI_BASE + 10 * 4)); }
void gui_set_win(int x, int y, int w, int h) { icall(x, y, w, h, r32(ABI_BASE + 11 * 4)); }
void gui_reg_ctl(int rx, int ry, int w, int h, int is_btn) { icall(rx, ry, w, h, is_btn, r32(ABI_BASE + 12 * 4)); }
void wbtn(int rx, int ry, int w, int h, int lbl, int act) { icall(rx, ry, w, h, lbl, act, r32(ABI_BASE + 14 * 4)); }
void wstr(int rx, int ry, int s, int fg) { icall(rx, ry, s, fg, r32(ABI_BASE + 15 * 4)); }
void wnum(int rx, int ry, int n, int fg) { icall(rx, ry, n, fg, r32(ABI_BASE + 16 * 4)); }
void gui_str_clip(int x, int y, int s, int mc, int fg, int bg) { icall(x, y, s, mc, fg, bg, r32(ABI_BASE + 17 * 4)); }
int gui_caret_on() { return icall(r32(ABI_BASE + 18 * 4)); }
void gui_draw_vscroll(int rx, int ry, int h, int pos, int vis, int tot) { icall(rx, ry, h, pos, vis, tot, r32(ABI_BASE + 19 * 4)); }
void gui_blit_clipped(int dx, int dy, int bw, int bh, int mw, int mh, int src) { icall(dx, dy, bw, bh, mw, mh, src, r32(ABI_BASE + 20 * 4)); }
int abi_heap_alloc(int n) { return icall(n, r32(ABI_BASE + 23 * 4)); }
void abi_heap_free(int p) { icall(p, r32(ABI_BASE + 24 * 4)); }
int abi_heap_free_bytes() { return icall(r32(ABI_BASE + 25 * 4)); }
int abi_heap_used_bytes() { return icall(r32(ABI_BASE + 50 * 4)); }
void abi_shell_print(int s) { icall(s, r32(ABI_BASE + 26 * 4)); }
void abi_dlg_open(int m, int oa, int fi, int dn) { icall(m, oa, fi, dn, r32(ABI_BASE + 28 * 4)); }
void abi_dlg_draw(int x, int y, int w, int h) { icall(x, y, w, h, r32(ABI_BASE + 29 * 4)); }
int abi_dlg_click(int wid, int rx, int ry) { return icall(wid, rx, ry, r32(ABI_BASE + 30 * 4)); }
int abi_dlg_key(int a, int vk) { return icall(a, vk, r32(ABI_BASE + 31 * 4)); }
void abi_clip_copy(int p, int l, int fs) { icall(p, l, fs, r32(ABI_BASE + 32 * 4)); }
int abi_clip_paste(int b, int cl, int ml, int cp) { return icall(b, cl, ml, cp, r32(ABI_BASE + 33 * 4)); }
int abi_os_version_str() { return icall(r32(ABI_BASE + 43 * 4)); }
int abi_os_machine_name() { return icall(r32(ABI_BASE + 48 * 4)); }
int abi_state() { return icall(r32(ABI_BASE + 49 * 4)); }
const SHARED_ST = 0x04DFC0;
const SNS_DISP_BUF = 0x049C20;
const NOTES_BUF = 0x1C1000;
const NOTES_CLIP_BUF = 0x030000;
const NOTES_FIND_BUF = 0x036000;
const NOTES_PATH_BUF = 0x036040;
const NOTES_UNDO_BUF = 0x02D900;
const EDIT_BUF = 0x050000;
const EDIT_SCRATCH = 0x059000;
const EDIT_UNDO_BUF = 0x02E900;
const PAINT_CANVAS = 0x04C000;
const FM_INPUT_BUF = 0x036120;
const CHAT_LOG_BUF = 0x048800;
const CHAT_IN_BUF = 0x04BD00;
const WEB_PAGE_BUF = 0x049000;
const WEB_PAGE_BUF_EXT = 0x190000;
const WEB_HIST_BUF = 0x04A000;
const WEB_CUR_URL = 0x04A200;
const WEB_IMG_SRC = 0x04A280;
const WEB_LINK_TAB = 0x04A300;
const SOL_PILES_BUF = 0x038000;
const SOL_LEN_BUF = 0x038400;
const SOL_UP_BUF = 0x038440;
const SOL_UNDO_BUF = 0x1D1000;
const SOL_TT_BUF = 0x039000;
const SRRP_SCRATCH_BUF = 0x044000;
void abi_set_tick(int aid, int ms) { icall(aid, ms, r32(ABI_BASE + 51 * 4)); }
void abi_theme_select(int idx) { icall(idx, r32(ABI_BASE + 52 * 4)); }
void abi_net_snake(int hx, int hy, int dx, int dy, int sc) { icall(hx, hy, dx, dy, sc, r32(ABI_BASE + 53 * 4)); }
int abi_srrp_app_str(int dst, int p, int s) { return icall(dst, p, s, r32(ABI_BASE + 54 * 4)); }
int abi_srrp_app_int(int dst, int p, int v) { return icall(dst, p, v, r32(ABI_BASE + 55 * 4)); }
int abi_srrp_kv(int dst, int p, int k, int v) { return icall(dst, p, k, v, r32(ABI_BASE + 56 * 4)); }
int abi_cc_rebuild() { return icall(r32(ABI_BASE + 35 * 4)); }
int abi_asm_rebuild() { return icall(r32(ABI_BASE + 36 * 4)); }
int abi_net_send_chat(int dst, int msg) { return icall(dst, msg, r32(ABI_BASE + 37 * 4)); }
int abi_net_send_file(int dst, int path) { return icall(dst, path, r32(ABI_BASE + 38 * 4)); }
int abi_http_get(int dst, int p) { return icall(dst, p, r32(ABI_BASE + 39 * 4)); }
int abi_sns_peer_cnt() { return icall(r32(ABI_BASE + 40 * 4)); }
int abi_sns_peer_name(int i) { return icall(i, r32(ABI_BASE + 41 * 4)); }
int abi_sns_peer_node(int i) { return icall(i, r32(ABI_BASE + 42 * 4)); }
void abi_shell_open(int p) { icall(p, r32(ABI_BASE + 27 * 4)); }
int abi_field_key(int b, int l, int ml, int a) { return icall(b, l, ml, a, r32(ABI_BASE + 47 * 4)); }
void abi_open_app(int id) { icall(id, r32(ABI_BASE + 46 * 4)); }
int abi_sns_resolve(int h) { return icall(h, r32(ABI_BASE + 57 * 4)); }
void abi_web_set_page_buf(int p, int l) { icall(p, l, r32(ABI_BASE + 58 * 4)); }
const APP_LAUNCH_PATH_BUF = 0x047B40;
const FAT_LIST_BUF_ADDR   = 0x047600;
int abi_fat_mount() { return icall(r32(ABI_BASE + 59 * 4)); }
int abi_fat_ensure() { return icall(r32(ABI_BASE + 60 * 4)); }
int abi_fat_stat(int p) { return icall(p, r32(ABI_BASE + 61 * 4)); }
int abi_fat_read(int p, int d, int m) { return icall(p, d, m, r32(ABI_BASE + 62 * 4)); }
int abi_fat_write(int p, int s, int l) { return icall(p, s, l, r32(ABI_BASE + 63 * 4)); }
int abi_fat_append(int p, int s, int l) { return icall(p, s, l, r32(ABI_BASE + 64 * 4)); }
int abi_fat_mkdir(int p) { return icall(p, r32(ABI_BASE + 65 * 4)); }
int abi_fat_delete(int p) { return icall(p, r32(ABI_BASE + 66 * 4)); }
int abi_fat_rename(int o, int n) { return icall(o, n, r32(ABI_BASE + 67 * 4)); }
int abi_fat_list(int d, int b, int m) { return icall(d, b, m, r32(ABI_BASE + 68 * 4)); }
int abi_audio_caps() { return icall(r32(ABI_BASE + 69 * 4)); }
int abi_audio_rate() { return icall(r32(ABI_BASE + 70 * 4)); }
void abi_audio_reset() { icall(r32(ABI_BASE + 71 * 4)); }
void abi_audio_ch_play(int ch, int ptr, int len, int bits, int step_fp, int vol, int pan, int ls, int ll) { icall(ch, ptr, len, bits, step_fp, vol, pan, ls, ll, r32(ABI_BASE + 72 * 4)); }
void abi_audio_ch_stop(int ch) { icall(ch, r32(ABI_BASE + 73 * 4)); }
void abi_audio_ch_vol_pan(int ch, int vol, int pan) { icall(ch, vol, pan, r32(ABI_BASE + 74 * 4)); }
void abi_audio_ch_step(int ch, int step_fp) { icall(ch, step_fp, r32(ABI_BASE + 75 * 4)); }
int abi_audio_mix_render(int dst, int nf) { return icall(dst, nf, r32(ABI_BASE + 76 * 4)); }
int abi_audio_mix_submit(int nf) { return icall(nf, r32(ABI_BASE + 77 * 4)); }
int abi_audio_tone(int freq, int dur) { return icall(freq, dur, r32(ABI_BASE + 78 * 4)); }
