// ============================================================================
// SpiralOS 1.6 "Open Shelf" — Core App Buffer Constants & Compatibility Stub (/src/apps2.sp)
// All desktop applications now live as loadable SAPP v2 modules in /apps/*.spir!
// Studio: ConsciousNode SoftWorks · Licence: MIT
// ============================================================================

const CHAT_IN_BUF   = 0x04BD00;
const WEB_HIST_BUF  = 0x04A000;
const WEB_CUR_URL   = 0x04A200;
const WEB_IMG_SRC   = 0x04A280;
const WEB_LINK_TAB  = 0x04A300;
const SOL_PILES_BUF = 0x038000;
const SOL_LEN_BUF   = 0x038400;
const SOL_UP_BUF    = 0x038440;
const SOL_UNDO_BUF  = 0x1D1000;
const SOL_TT_BUF    = 0x039000;

int g_web_cur_node;

void web_navigate(int dst_node, int path_str, int push_hist) {
  g_web_cur_node = dst_node;
  hal_memset(WEB_CUR_URL, 0, 64);
  int pl = hal_strlen(path_str);
  if (pl > 60) pl = 60;
  hal_memcpy(WEB_CUR_URL, path_str, pl);
  int idx = fs_find(path_str);
  if (idx >= 0) {
    int sz = fs_entry_size(idx);
    if (sz > 60000) sz = 60000;
    hal_memcpy(WEB_PAGE_BUF_EXT, fs_entry_data_ptr(idx), sz);
    w8(WEB_PAGE_BUF_EXT + sz, 0);
    int m = sz; if (m > 2000) m = 2000;
    hal_memcpy(WEB_PAGE_BUF, WEB_PAGE_BUF_EXT, m);
    w8(WEB_PAGE_BUF + m, 0);
  } else {
    net_http_get(dst_node, path_str);
  }
}

void apps2_init() {
  hal_memset(WEB_CUR_URL, 0, 64);
  hal_memset(CHAT_IN_BUF, 0, 128);
  app_register_tick(APP_SNAKE, 125);
  app_register_tick(APP_BLOCKS, 500);
}
