import "/src/app_abi.sp";
void app_draw(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  int st = abi_state();
  wstr(6, 15, "CPU:", 11);
  wstr(40, 15, abi_os_machine_name(), 15);
  wstr(6, 24, "RAM KB:", 11);
  wnum(64, 24, hal_info(1) / 1024, 14);
  wstr(6, 33, "HeapF:", 11);
  wnum(56, 33, abi_heap_free_bytes() / 1024, 10);
  wstr(6, 42, "HeapU:", 11);
  wnum(56, 42, abi_heap_used_bytes() / 1024, 15);
  wstr(6, 51, "Preempt:", 11);
  wnum(72, 51, r32(0x0FFF10), 10);
  wstr(6, 60, "DiskF:", 11);
  wnum(56, 60, abi_fs_free() / 1024, 15);
  int mlog = r32(SHARED_ST + 0x38);
  wbtn(6, 71, 82, 11, "MouseLog", mlog);
  wstr(92, 73, "D:", 11);
  wnum(108, 73, r32(VMRAM_STATUS + 0xA8), 12);
}
void app_click(int wid, int rx, int ry) {
  if (ry >= 71 && ry <= 82 && rx >= 6 && rx < 88) {
    w32(SHARED_ST + 0x38, 1 - r32(SHARED_ST + 0x38));
  }
}
void app_key(int ascii, int vk, int mods) {
  if (ascii == 'm' || ascii == 'M') {
    w32(SHARED_ST + 0x38, 1 - r32(SHARED_ST + 0x38));
  }
}
