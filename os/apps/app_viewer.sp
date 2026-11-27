import "/src/app_abi.sp";
int g_idx;
void app_draw(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  wbtn(6, 15, 44, 11, "Spiral", g_idx == 0);
  wbtn(52, 15, 44, 11, "Prism", g_idx == 1);
  wbtn(98, 15, 40, 11, "User", g_idx == 2);
  int path = "/art/spiral.pic";
  if (g_idx == 1) path = "/art/prism.pic";
  if (g_idx == 2) path = "/art/user.pic";
  int idx = abi_fs_find(path);
  if (idx >= 0) gui_blit_clipped(x + 8, y + 30, 96, 56, w - 12, h - 34, abi_fs_data(idx));
  else wstr(8, 36, "No /art/user.pic yet", 12);
}
void app_click(int wid, int rx, int ry) {
  if (ry >= 15 && ry <= 26) {
    if (rx >= 6 && rx < 50) g_idx = 0;
    else if (rx >= 52 && rx < 96) g_idx = 1;
    else if (rx >= 98 && rx < 138) g_idx = 2;
  }
}
void app_key(int ascii, int vk, int mods) {
  if (vk == 37) g_idx = (g_idx + 2) % 3;
  else if (vk == 39 || ascii == 32) g_idx = (g_idx + 1) % 3;
}
