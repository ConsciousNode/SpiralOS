import "/src/app_abi.sp";
int g_sel; int g_scroll; int g_modal; int g_in_len;
int g_view_shelf; // 0 = SpiralFS, 1 = /shelf (FAT)
int g_shelf_cnt;
int g_shelf_dir;  // heap-allocated 128 B current /shelf directory path
int g_shelf_path; // heap-allocated 128 B scratch full path
int g_status_msg; // heap-allocated 64 B status line

void fm_set_status(int s) {
  if (g_status_msg == 0) return;
  hal_memset(g_status_msg, 0, 64);
  int n = hal_strlen(s);
  if (n > 60) n = 60;
  hal_memcpy(g_status_msg, s, n);
}

void fm_refresh_shelf() {
  if (hal_disk2_info(0) <= 0) {
    g_shelf_cnt = -2; // no disk
    return;
  }
  int rc = abi_fat_list(g_shelf_dir, FAT_LIST_BUF_ADDR, 20);
  if (rc < 0) {
    g_shelf_cnt = -1; // error
  } else {
    g_shelf_cnt = rc;
  }
}

void fm_build_shelf_item_path(int idx) {
  hal_memset(g_shelf_path, 0, 128);
  int dl = hal_strlen(g_shelf_dir);
  hal_memcpy(g_shelf_path, g_shelf_dir, dl);
  if (dl == 0 || r8(g_shelf_path + dl - 1) != 47) {
    w8(g_shelf_path + dl, 47);
    dl = dl + 1;
  }
  int ent = FAT_LIST_BUF_ADDR + idx * 48;
  int nl = hal_strlen(ent);
  if (dl + nl > 124) nl = 124 - dl;
  hal_memcpy(g_shelf_path + dl, ent, nl);
}

void fm_copy_selected() {
  if (g_view_shelf == 0) {
    int fidx = abi_fs_nth(g_sel);
    if (fidx < 0) return;
    if (hal_disk2_info(0) <= 0) { fm_set_status("No disk in /shelf"); return; }
    int src_p = abi_fs_entry_ptr(fidx);
    int slen = hal_strlen(src_p);
    int base = src_p;
    for (int i = 0; i < slen; i++) {
      if (r8(src_p + i) == 47) base = src_p + i + 1;
    }
    hal_memset(g_shelf_path, 0, 128);
    hal_memcpy(g_shelf_path, "/shelf/", 7);
    int bl = hal_strlen(base);
    if (bl > 110) bl = 110;
    hal_memcpy(g_shelf_path + 7, base, bl);
    int rc = abi_fat_write(g_shelf_path, abi_fs_data(fidx), abi_fs_size(fidx));
    if (rc >= 0) fm_set_status("Copied to /shelf");
    else fm_set_status("Copy to /shelf failed");
  } else {
    if (g_shelf_cnt <= 0 || g_sel >= g_shelf_cnt) return;
    int ent = FAT_LIST_BUF_ADDR + g_sel * 48;
    int attr = r32(ent + 44);
    if ((attr & 0x10) != 0) { fm_set_status("Cannot copy folder"); return; }
    int fsz = r32(ent + 40);
    if (fsz > 262144) { fm_set_status("File too big for SpiralFS"); return; }
    fm_build_shelf_item_path(g_sel);
    int buf = abi_heap_alloc(fsz + 16);
    if (buf == 0) { fm_set_status("Out of heap memory"); return; }
    int rd = abi_fat_read(g_shelf_path, buf, fsz);
    if (rd >= 0) {
      hal_memset(FM_INPUT_BUF, 0, 48);
      hal_memcpy(FM_INPUT_BUF, "/home/", 6);
      int nl = hal_strlen(ent);
      if (nl > 32) nl = 32;
      hal_memcpy(FM_INPUT_BUF + 6, ent, nl);
      int rc = abi_fs_write(FM_INPUT_BUF, buf, rd);
      if (rc >= 0) fm_set_status("Copied to /home");
      else fm_set_status("SpiralFS write failed");
    } else {
      fm_set_status("FAT read error");
    }
    abi_heap_free(buf);
  }
}

void app_init(int abi, int arg0) {
  if (arg0 == -1) {
    if (g_shelf_dir != 0) abi_heap_free(g_shelf_dir);
    if (g_shelf_path != 0) abi_heap_free(g_shelf_path);
    if (g_status_msg != 0) abi_heap_free(g_status_msg);
    return;
  }
  g_sel = 0; g_scroll = 0; g_modal = 0; g_in_len = 0;
  g_view_shelf = 0; g_shelf_cnt = 0;
  g_shelf_dir = abi_heap_alloc(128);
  g_shelf_path = abi_heap_alloc(128);
  g_status_msg = abi_heap_alloc(64);
  if (g_shelf_dir != 0) { hal_memset(g_shelf_dir, 0, 128); hal_memcpy(g_shelf_dir, "/shelf", 6); }
  if (g_status_msg != 0) hal_memset(g_status_msg, 0, 64);
}

void app_draw(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  int max_show = (h - 46) / 10; if (max_show < 1) max_show = 1;
  gui_reg_ctl(4, 25, w - 8, h - 43, 0);
  wbtn(4, 14, 34, 10, "+New", 0);
  wbtn(40, 14, 34, 10, "+Dir", 0);
  wbtn(76, 14, 28, 10, "Ren", 0);
  wbtn(106, 14, 28, 10, "Del", 0);
  wbtn(136, 14, 34, 10, "Open", 0);
  if (w >= 216) wbtn(172, 14, 42, 10, "Shelf", g_view_shelf);
  if (g_view_shelf == 0) {
    int tot = abi_fs_count();
    if (g_sel >= tot && tot > 0) g_sel = tot - 1;
    if (g_sel < g_scroll) g_scroll = g_sel;
    if (g_sel >= g_scroll + max_show) g_scroll = g_sel - max_show + 1;
    hal_rect(x + 4, y + 25, w - 8, h - 43, 0);
    for (int i = 0; i < max_show && g_scroll + i < tot; i++) {
      int fidx = abi_fs_nth(g_scroll + i);
      if (fidx >= 0) {
        int ry = y + 26 + i * 10;
        if (g_scroll + i == g_sel) hal_rect(x + 5, ry, w - 16, 9, 1);
        gui_str_clip(x + 6, ry + 1, abi_fs_entry_ptr(fidx), (w - 20) / 8, 15, -1);
      }
    }
    gui_draw_vscroll(w - 8, 25, h - 43, g_scroll, max_show, tot);
    wbtn(56, h - 15, 38, 11, "+New", 0);
    wbtn(98, h - 15, 42, 11, "->Shf", 0);
    wnum(6, h - 13, abi_fs_free() / 1024, 14); wstr(36, h - 13, "KB", 11);
  } else {
    fm_refresh_shelf();
    hal_rect(x + 4, y + 25, w - 8, h - 43, 0);
    if (g_shelf_cnt == -2) {
      wstr(8, 30, "No disk in /shelf", 12);
    } else if (g_shelf_cnt < 0) {
      wstr(8, 30, "FAT disk error", 12);
    } else {
      int tot = g_shelf_cnt;
      if (g_sel >= tot && tot > 0) g_sel = tot - 1;
      if (g_sel < 0) g_sel = 0;
      if (g_sel < g_scroll) g_scroll = g_sel;
      if (g_sel >= g_scroll + max_show) g_scroll = g_sel - max_show + 1;
      for (int i = 0; i < max_show && g_scroll + i < tot; i++) {
        int ent = FAT_LIST_BUF_ADDR + (g_scroll + i) * 48;
        int ry = y + 26 + i * 10;
        if (g_scroll + i == g_sel) hal_rect(x + 5, ry, w - 16, 9, 1);
        int col = 15;
        if ((r32(ent + 44) & 0x10) != 0) col = 11;
        gui_str_clip(x + 6, ry + 1, ent, (w - 20) / 8, col, -1);
      }
      gui_draw_vscroll(w - 8, 25, h - 43, g_scroll, max_show, tot);
    }
    wbtn(56, h - 15, 38, 11, "Up", 0);
    wbtn(98, h - 15, 42, 11, "->FS", 0);
    wstr(6, h - 13, "/shelf", 10);
  }
  if (g_status_msg != 0 && r8(g_status_msg) != 0 && w >= 190) {
    gui_str_clip(x + 144, y + h - 13, g_status_msg, (w - 150) / 8, 14, -1);
  }
  if (g_modal != 0) {
    hal_rect(x + 12, y + 32, w - 24, 36, 16);
    if (g_modal == 1) wstr(16, 36, "New file path:", 14);
    else if (g_modal == 2) wstr(16, 36, "New folder:", 14);
    else if (g_modal == 3) wstr(16, 36, "Rename to:", 14);
    else wstr(16, 36, "Delete? (Enter)", 12);
    if (g_modal != 4) {
      hal_rect(x + 16, y + 48, w - 32, 11, 0);
      gui_str_clip(x + 18, y + 49, FM_INPUT_BUF, (w - 36) / 8, 15, -1);
    }
  }
}

void fm_open_selected() {
  if (g_view_shelf == 0) {
    int fidx = abi_fs_nth(g_sel);
    if (fidx >= 0) abi_shell_open(abi_fs_entry_ptr(fidx));
  } else {
    if (g_shelf_cnt <= 0 || g_sel >= g_shelf_cnt) return;
    int ent = FAT_LIST_BUF_ADDR + g_sel * 48;
    fm_build_shelf_item_path(g_sel);
    if ((r32(ent + 44) & 0x10) != 0) {
      hal_memcpy(g_shelf_dir, g_shelf_path, 128);
      g_sel = 0; g_scroll = 0;
      fm_set_status("Entered folder");
    } else {
      abi_shell_open(g_shelf_path);
    }
  }
}

void app_click(int wid, int rx, int ry) {
  if (ry >= 100 && rx >= 52 && rx < 96) {
    if (g_view_shelf == 0) {
      abi_fs_write("/home/note.txt", "SpiralOS Note\n", 14);
    } else {
      // Up one folder in /shelf
      int dl = hal_strlen(g_shelf_dir);
      if (dl > 6) {
        int i = dl - 1;
        while (i > 6 && r8(g_shelf_dir + i) != 47) i = i - 1;
        w8(g_shelf_dir + i, 0);
        g_sel = 0; g_scroll = 0;
      }
    }
    return;
  }
  if (ry >= 100 && rx >= 98 && rx < 140) {
    fm_copy_selected();
    return;
  }
  if (ry >= 14 && ry <= 24) {
    if (rx >= 4 && rx < 38) {
      if (g_view_shelf == 0) abi_fs_write("/home/note.txt", "SpiralOS Note\n", 14);
      else { g_modal = 1; hal_memset(FM_INPUT_BUF, 0, 48); hal_memcpy(FM_INPUT_BUF, "/shelf/new.txt", 14); g_in_len = 14; }
      return;
    }
    if (rx >= 40 && rx < 74) {
      g_modal = 2; hal_memset(FM_INPUT_BUF, 0, 48);
      if (g_view_shelf == 0) { hal_memcpy(FM_INPUT_BUF, "/home/dir", 9); g_in_len = 9; }
      else { hal_memcpy(FM_INPUT_BUF, "/shelf/dir", 10); g_in_len = 10; }
      return;
    }
    if (rx >= 76 && rx < 104) { g_modal = 3; hal_memset(FM_INPUT_BUF, 0, 48); g_in_len = 0; return; }
    if (rx >= 106 && rx < 134) { g_modal = 4; return; }
    if (rx >= 136 && rx < 170) { fm_open_selected(); return; }
    if (rx >= 172 && rx < 214) {
      g_view_shelf = 1 - g_view_shelf;
      g_sel = 0; g_scroll = 0;
      fm_set_status("");
      return;
    }
  }
  if (ry >= 25) {
    int row = (ry - 26) / 10;
    if (row >= 0) g_sel = g_scroll + row;
  }
}

void app_key(int ascii, int vk, int mods) {
  if (g_modal != 0) {
    if (vk == 27) { g_modal = 0; return; }
    if (ascii == 13) {
      if (g_view_shelf == 0) {
        int fidx = abi_fs_nth(g_sel);
        if (g_modal == 1 && g_in_len > 0) abi_fs_write(FM_INPUT_BUF, "", 0);
        else if (g_modal == 2 && g_in_len > 0) abi_fs_write(FM_INPUT_BUF, "", 0);
        else if (g_modal == 3 && g_in_len > 0 && fidx >= 0) {
          abi_fs_write(FM_INPUT_BUF, abi_fs_data(fidx), abi_fs_size(fidx));
          abi_fs_delete(abi_fs_entry_ptr(fidx));
        } else if (g_modal == 4 && fidx >= 0) {
          abi_fs_delete(abi_fs_entry_ptr(fidx));
        }
      } else {
        if (g_modal == 1 && g_in_len > 0) abi_fat_write(FM_INPUT_BUF, "", 0);
        else if (g_modal == 2 && g_in_len > 0) abi_fat_mkdir(FM_INPUT_BUF);
        else if (g_modal == 3 && g_in_len > 0 && g_sel < g_shelf_cnt) {
          fm_build_shelf_item_path(g_sel);
          abi_fat_rename(g_shelf_path, FM_INPUT_BUF);
        } else if (g_modal == 4 && g_sel < g_shelf_cnt) {
          fm_build_shelf_item_path(g_sel);
          abi_fat_delete(g_shelf_path);
        }
      }
      g_modal = 0; return;
    }
    if (g_modal != 4) g_in_len = abi_field_key(FM_INPUT_BUF, g_in_len, 44, ascii);
    return;
  }
  int tot = abi_fs_count();
  if (g_view_shelf == 1) tot = g_shelf_cnt;
  if (vk == 38 && g_sel > 0) g_sel = g_sel - 1;
  else if (vk == 40 && g_sel + 1 < tot) g_sel = g_sel + 1;
  else if (ascii == 13) fm_open_selected();
  else if (ascii == 's' || ascii == 'S') { g_view_shelf = 1 - g_view_shelf; g_sel = 0; g_scroll = 0; }
}
