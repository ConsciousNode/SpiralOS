import "/src/app_abi.sp";
int g_st;
void app_draw(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  wstr(6, 16, "SpiralC + Loadable Apps", 14);
  wbtn(6, 28, 134, 13, "[Compile OS + Apps]", 0);
  wbtn(6, 44, 134, 13, "[Assemble Native Cores]", 0);
  wbtn(6, 60, 134, 13, "[Warm Reboot Machine]", 0);
  wbtn(132, h - 16, 64, 12, "Reboot", 0);
  if (g_st == 1) wstr(6, 78, "BUILD OK (Core+Apps)", 10);
  else if (g_st == -1) wstr(6, 78, "BUILD ERROR", 12);
  else wstr(6, 78, "Status: Ready", 15);
}
void app_click(int wid, int rx, int ry) {
  if (ry >= 28 && ry <= 41) { g_st = abi_cc_rebuild(); }
  else if (ry >= 44 && ry <= 57) { abi_asm_rebuild(); g_st = 1; }
  else if ((ry >= 60 && ry <= 73) || (ry >= 85 && rx >= 120)) { sys(11); }
}
void app_key(int ascii, int vk, int mods) {
  if (ascii == 13 || ascii == 32 || ascii == 'c') g_st = abi_cc_rebuild();
  else if (ascii == 'a') { abi_asm_rebuild(); g_st = 1; }
  else if (ascii == 'r') sys(11);
}
