import "/src/app_abi.sp";
int g_in_len; int g_peer_idx; int g_scroll;
void app_init(int abi, int arg0) { if (arg0 == -1) return; g_in_len = 0; g_peer_idx = 0; g_scroll = 0; w8(CHAT_IN_BUF, 0); }
void app_draw(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  gui_reg_ctl(4, h - 17, w - 52, 13, 0);
  wbtn(4, 14, 42, 10, "Peer>", 0);
  int pc = abi_sns_peer_cnt();
  if (pc > 0) wstr(50, 15, abi_sns_peer_name(g_peer_idx % pc), 10);
  else wstr(50, 15, "Broadcast", 11);
  hal_rect(x + 4, y + 26, w - 8, h - 46, 0);
  gui_str_clip(x + 6, y + 28, CHAT_LOG_BUF, (w - 14) / 8, 15, -1);
  hal_rect(x + 4, y + h - 17, w - 52, 13, 0);
  gui_str_clip(x + 6, y + h - 15, CHAT_IN_BUF, (w - 56) / 8, 14, -1);
  wbtn(w - 44, h - 17, 40, 13, "Send", 0);
}
void send_cur() {
  if (g_in_len <= 0) return;
  int dst = 0xFFFF;
  int pc = abi_sns_peer_cnt();
  if (pc > 0) dst = abi_sns_peer_node(g_peer_idx % pc);
  abi_net_send_chat(dst, CHAT_IN_BUF);
  g_in_len = 0; w8(CHAT_IN_BUF, 0);
}
void app_click(int wid, int rx, int ry) {
  if (ry >= 14 && ry <= 24 && rx >= 4 && rx < 46) { g_peer_idx = g_peer_idx + 1; return; }
  if (rx >= 120) send_cur();
}
void app_key(int ascii, int vk, int mods) {
  if (ascii == 13) { send_cur(); return; }
  g_in_len = abi_field_key(CHAT_IN_BUF, g_in_len, 120, ascii);
}
