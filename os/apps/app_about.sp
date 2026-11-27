import "/src/app_abi.sp";
void app_draw(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  hal_rect(x + 4, y + 15, w - 8, h - 19, 16);
  wstr(8, 19, abi_os_version_str(), 14);
  wstr(8, 30, "ConsciousNode SoftWorks (MIT)", 15);
  wstr(8, 41, "Machine:", 11);
  wstr(76, 41, abi_os_machine_name(), 10);
  wstr(8, 52, "Node:", 11);
  wstr(52, 52, SNS_DISP_BUF, 15);
  wstr(8, 64, "Inspired by KolibriOS (kolibrios.org)", 14);
  wstr(8, 76, "Zork I: Marc Blank, Dave Lebling,", 7);
  wstr(8, 86, "Bruce Daniels, Tim Anderson (MIT)", 7);
}
void app_key(int ascii, int vk, int mods) { }
