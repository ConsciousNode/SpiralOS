// ============================================================================
// SpiralOS 1.4 "Daily Driver" — SpiralFS Filesystem Driver (/src/fs.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Operates on the mounted SpiralFS volume at VMRAM_SPFS_BASE (0x228000,
// Sectors 320..1919 of spiralos.img, 768 KB usable capacity + 32 KB reserved
// Triton Core window in Sectors 960..1023 at relative offset 0x50000..0x57FFF).
// ============================================================================

// from spiralos/os/fs.sp:1-123
const FS_MAX_ENTRIES = 63;
const SPFS_SIZE      = 0xC8000;
const SPFS_HOLE_LO   = 0x50000;
const SPFS_HOLE_HI   = 0x58000;

int fs_entry_ptr(int idx) {
  return VMRAM_SPFS_BASE + 0x40 + idx * 64;
}

int fs_entry_flags(int idx) {
  return r32(fs_entry_ptr(idx) + 0x28);
}

int fs_entry_data_ptr(int idx) {
  int rel = r32(fs_entry_ptr(idx) + 0x2C);
  return VMRAM_SPFS_BASE + rel;
}

int fs_entry_size(int idx) {
  return r32(fs_entry_ptr(idx) + 0x30);
}

int fs_entry_cap(int idx) {
  return r32(fs_entry_ptr(idx) + 0x34);
}

int fs_free_bytes() {
  int next_free = r32(VMRAM_SPFS_BASE + 0x0C);
  if (next_free <= SPFS_HOLE_LO) {
    return (SPFS_HOLE_LO - next_free) + (SPFS_SIZE - SPFS_HOLE_HI);
  }
  if (next_free >= SPFS_SIZE) return 0;
  return SPFS_SIZE - next_free;
}

int fs_used_bytes() {
  return (SPFS_SIZE - 0x8000) - fs_free_bytes();
}

int fs_find(int path_str) {
  for (int i = 0; i < FS_MAX_ENTRIES; i++) {
    int e = fs_entry_ptr(i);
    if (r32(e + 0x28) != 0) {
      if (hal_strcmp(e, path_str)) {
        return i;
      }
    }
  }
  return -1;
}

int fs_count() {
  int c = 0;
  for (int i = 0; i < FS_MAX_ENTRIES; i++) {
    if (fs_entry_flags(i) != 0) c = c + 1;
  }
  return c;
}

int fs_nth_index(int n) {
  int seen = 0;
  for (int i = 0; i < FS_MAX_ENTRIES; i++) {
    if (fs_entry_flags(i) != 0) {
      if (seen == n) return i;
      seen = seen + 1;
    }
  }
  return -1;
}

int fs_write(int path_str, int src_ptr, int len) {
  int idx = fs_find(path_str);
  if (idx < 0) {
    for (int i = 0; i < FS_MAX_ENTRIES; i++) {
      if (fs_entry_flags(i) == 0) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return -1;
  }

  int e = fs_entry_ptr(idx);
  int old_flags = r32(e + 0x28);
  int rel_off = r32(e + 0x2C);
  int cap = r32(e + 0x34);

  if (old_flags == 0 || len + 1 > cap) {
    int next_free = r32(VMRAM_SPFS_BASE + 0x0C);
    int need = (len + 1024) & (~511);
    if (need < 1024) need = 1024;
    if (next_free < SPFS_HOLE_HI && next_free + need > SPFS_HOLE_LO) {
      next_free = SPFS_HOLE_HI;
    }
    if (next_free + need > SPFS_SIZE) return -2;
    rel_off = next_free;
    cap = need;
    w32(VMRAM_SPFS_BASE + 0x0C, next_free + need);
  }

  hal_memset(e, 0, 40);
  int plen = hal_strlen(path_str);
  if (plen > 39) plen = 39;
  hal_memcpy(e, path_str, plen);

  w32(e + 0x28, 1);
  w32(e + 0x2C, rel_off);
  w32(e + 0x30, len);
  w32(e + 0x34, cap);
  w32(e + 0x38, r32(e + 0x38) + 1);

  int dst = VMRAM_SPFS_BASE + rel_off;
  hal_memset(dst, 0, cap);
  if (len > 0) {
    hal_memcpy(dst, src_ptr, len);
  }

  // Sync directory table (Sectors 320..327) and modified file sectors to disk
  hal_disk_sync(320, 8);
  int file_start_sec = 320 + (rel_off >> 9);
  int file_sec_cnt = (cap + 511) >> 9;
  hal_disk_sync(file_start_sec, file_sec_cnt);
  return idx;
}

int fs_delete(int path_str) {
  int idx = fs_find(path_str);
  if (idx < 0) return -1;
  int e = fs_entry_ptr(idx);
  w32(e + 0x28, 0);
  hal_disk_sync(320, 8);
  return 0;
}
