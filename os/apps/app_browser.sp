import "/src/app_abi.sp";
int match_prefix(int s, int pfx) {
int i = 0;
while (1) {
int c = r8(pfx + i);
if (c == 0) return 1;
if (r8(s + i) != c) return 0;
i = i + 1;
}
return 0;
}
int g_web_hist_cnt; int g_web_cur_node; int g_web_link_cnt; int g_web_img_drawn;
int g_web_scroll; int g_web_sel_link;
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
int widx = abi_fs_find(path_str);
if (widx < 0) widx = abi_fs_find("/www/index.hts");
if (widx >= 0) abi_web_set_page_buf(abi_fs_data(widx), abi_fs_size(widx));
} else {
abi_http_get(dst_node, path_str);
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
void web_draw_inline_img(int x, int y, int max_w, int max_h, int src_str) {
if (max_w <= 0 || max_h <= 0) return;
int fidx = abi_fs_find(src_str);
if (fidx >= 0 && abi_fs_size(fidx) >= 96 * 16) {
gui_blit_clipped(x, y, 96, 16, max_w, max_h, abi_fs_data(fidx));
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
void app_draw(int x, int y, int w, int h) {
gui_set_win(x, y, w, h);
wbtn(4, 15, 52, 11, "PeerWeb", 0);
wbtn(58, 15, 60, 11, "SonderGW", 0);
wbtn(120, 15, 48, 11, "Local", 0);
wbtn(170, 15, 58, 11, "Back", g_web_hist_cnt > 0);
if (h <= 32 || w <= 8) return;
hal_rect(x + 4, y + 28, w - 8, h - 32, 16);
g_web_link_cnt = 0;
g_web_img_drawn = 0;
if (r32(SHARED_ST + 0x20) == 1) {
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
int wp = WEB_PAGE_BUF_EXT + p;
int ch = r8(wp);
if (ch == 60) {
if (match_prefix(wp, "<h1>")) { col = 14; p = p + 4; cx = x + 8; continue; }
if (match_prefix(wp, "</h1>")) { col = 15; p = p + 5; ry = ry + 10; cx = x + 8; continue; }
if (match_prefix(wp, "<p>")) { col = 15; p = p + 3; cx = x + 8; continue; }
if (match_prefix(wp, "</p>")) { p = p + 4; ry = ry + 9; cx = x + 8; continue; }
if (match_prefix(wp, "<img ")) {
p = web_extract_attr(p + 5, "src=", 4, WEB_IMG_SRC, 58);
if (cx > x + 8) { ry = ry + 9; cx = x + 8; }
if (ry + 16 <= y + h - 4) {
web_draw_inline_img(cx, ry, x + w - 4 - cx, y + h - 4 - ry, WEB_IMG_SRC);
g_web_img_drawn = g_web_img_drawn + 1;
w32(VMRAM_STATUS + 0x68, g_web_img_drawn);
}
ry = ry + 16; cx = x + 8; continue;
}
if (match_prefix(wp, "<a ")) {
int lslot = WEB_LINK_TAB + g_web_link_cnt * 48;
hal_memset(lslot, 0, 48);
p = web_extract_attr(p + 3, "href=", 5, lslot + 16, 30);
if (g_web_link_cnt < 12) { w32(lslot, cx - x); w32(lslot + 4, ry - y); in_link = 1; }
col = 11; continue;
}
if (match_prefix(wp, "</a>")) {
if (in_link == 1 && g_web_link_cnt < 12) {
int lslot = WEB_LINK_TAB + g_web_link_cnt * 48;
int rx0 = r32(lslot); int ry0 = r32(lslot + 4); int rx1 = cx - x;
if (rx1 <= rx0) rx1 = rx0 + 32;
if (rx1 > w - 6) rx1 = w - 6;
w32(lslot + 8, rx1); w32(lslot + 12, (ry - y) + 9);
if (rx1 > rx0 && y + ry0 + 8 < y + h - 4) hal_rect(x + rx0, y + ry0 + 8, rx1 - rx0, 1, 11);
g_web_link_cnt = g_web_link_cnt + 1;
}
in_link = 0; col = 15; p = p + 4; continue;
}
while (r8(WEB_PAGE_BUF_EXT + p) != 0 && r8(WEB_PAGE_BUF_EXT + p) != 62) p = p + 1;
if (r8(WEB_PAGE_BUF_EXT + p) == 62) p = p + 1;
continue;
}
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
void app_click(int wid, int rx, int ry) {
if (ry >= 15 && ry <= 26) {
if (rx >= 4 && rx < 56) {
int peer = abi_sns_resolve("peer");
web_navigate(peer, "/index.hts", 1);
} else if (rx >= 58 && rx < 118) {
int sonder = abi_sns_resolve("sonder.gw");
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
if (dst == 0) dst = abi_sns_resolve("sonder.gw");
web_navigate(dst, lslot + 16, 1);
return;
}
}
}
}
void app_key(int ascii, int vk, int mods) {
if (vk == 38 || vk == 33) { if (g_web_scroll > 0) g_web_scroll = g_web_scroll - 1; }
else if (vk == 40 || vk == 34) g_web_scroll = g_web_scroll + 1;
else if (vk == 36) g_web_scroll = 0;
else if (ascii == 8 || ascii == 'b') web_go_back();
else if (ascii == '1') web_navigate(abi_sns_resolve("peer"), "/index.hts", 1);
else if (ascii == '2') web_navigate(abi_sns_resolve("sonder.gw"), "/atlas", 1);
else if (ascii == '3') web_navigate(0, "/www/index.hts", 1);
else if (ascii == 13 && g_web_link_cnt > 0) {
int lslot = WEB_LINK_TAB + (g_web_sel_link % g_web_link_cnt) * 48;
int dst = g_web_cur_node;
if (dst == 0) dst = abi_sns_resolve("sonder.gw");
web_navigate(dst, lslot + 16, 1);
}
}
void app_init(int abi, int arg0) {
if (arg0 == -1) return;
g_web_hist_cnt = 0; g_web_cur_node = 0; g_web_link_cnt = 0; g_web_img_drawn = 0; g_web_scroll = 0; g_web_sel_link = 0;
web_navigate(0, "/www/index.hts", 1);
}
