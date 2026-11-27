import "/src/app_abi.sp";
int g_sel;
void app_draw(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  wstr(6, 16, "Select /themes/*.thm:", 15);
  wbtn(6, 30, 72, 14, "1:Aether", g_sel == 0);
  wbtn(82, 30, 72, 14, "2:Amber", g_sel == 1);
  wbtn(6, 48, 72, 14, "3:Oberon", g_sel == 2);
  wbtn(82, 48, 72, 14, "4:Jade", g_sel == 3);
}
void app_click(int wid, int rx, int ry) {
  if (ry >= 28 && ry < 46) {
    if (rx < 80) { g_sel = 0; abi_theme_select(0); }
    else { g_sel = 1; abi_theme_select(1); }
  } else if (ry >= 46 && ry < 64) {
    if (rx < 80) { g_sel = 2; abi_theme_select(2); }
    else { g_sel = 3; abi_theme_select(3); }
  }
}
void app_key(int ascii, int vk, int mods) {
  if (vk == 38 || vk == 37) { g_sel = (g_sel + 3) & 3; abi_theme_select(g_sel); }
  else if (vk == 40 || vk == 39) { g_sel = (g_sel + 1) & 3; abi_theme_select(g_sel); }
  else if (ascii >= 49 && ascii <= 52) { g_sel = ascii - 49; abi_theme_select(g_sel); }
}
