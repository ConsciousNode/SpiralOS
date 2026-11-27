// ============================================================================
// SpiralOS 1.7 "Bring Your Own" — FAT12/16/32 + LFN Driver (/src/fat.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Mounted at /shelf over Disk Unit 1 (BIOS INT 13h 0x81/0x80 on x86,
// SYS 37..39 on TabComp, Ports 28..29 + Unit 1 on Triton).
// Supports FAT12, FAT16, FAT32, MBR partition tables (Toshiba USB boot stick),
// VFAT Long File Names (LFN), nested folders, read/write/append/rename/delete,
// dual-FAT updates, and graceful error handling on ejected or corrupt disks.
// ============================================================================

const PC_FAT_NO_COPY2 = 0; // Positive control mutant: skip updating FAT copy 2
const PC_FAT_TRUNC_83 = 0; // Positive control mutant: truncate LFN to 8.3

const FAT_SEC_BUF  = 0x047000; // 512 B general sector I/O buffer
const FAT_DIR_BUF  = 0x047200; // 512 B directory sector buffer
const FAT_LFN_BUF  = 0x047400; // 256 B LFN assembly buffer
const FAT_TMP_BUF  = 0x047500; // 256 B path component / 8.3 scratch
const FAT_LIST_BUF = 0x047600; // 1536 B directory listing scratch (24 * 64B)

int g_fat_mounted;
int g_fat_type;       // 12, 16, or 32
int g_fat_disk_secs;  // total 512B sectors reported by device
int g_fat_part_lba;   // partition start LBA (0 for superfloppy, >0 for MBR)
int g_fat_spc;        // sectors per cluster
int g_fat_rsvd;       // reserved sectors
int g_fat_nfats;      // number of FAT copies (usually 2)
int g_fat_root_ent;   // root dir entries (FAT12/16)
int g_fat_fat_sz;     // sectors per FAT
int g_fat_tot_sec;    // total sectors in volume
int g_fat_root_lba;   // first sector of root dir (FAT12/16)
int g_fat_root_secs;  // sector count of root dir (FAT12/16)
int g_fat_root_clus;  // root cluster (FAT32)
int g_fat_data_lba;   // first sector of cluster 2
int g_fat_max_clus;   // highest valid cluster number (data_clusters + 1)
int g_fat_last_err;   // 0=OK, -1=no disk, -2=corrupt/io err, -3=not found, -4=full

// Last found directory entry metadata (set by fat_find_in_dir / fat_resolve_path)
int g_fe_dir_lba;
int g_fe_dir_off;     // byte offset within sector (0..480)
int g_fe_lfn_cnt;     // number of preceding LFN entries
int g_fe_attr;
int g_fe_clus;
int g_fe_size;
int g_fe_parent_clus; // 0 for FAT12/16 root, else cluster number

int fat_upcase(int c) {
  if (c >= 97 && c <= 122) return c - 32;
  return c;
}

int fat_strieq(int a, int b) {
  int i = 0;
  while (1) {
    int ca = fat_upcase(r8(a + i));
    int cb = fat_upcase(r8(b + i));
    if (ca != cb) return 0;
    if (ca == 0) return 1;
    i = i + 1;
  }
  return 0;
}

int fat_read_sec(int lba, int buf) {
  if (lba < 0 || lba >= g_fat_disk_secs) { g_fat_last_err = -2; return -2; }
  int rc = hal_disk2_read(lba, 1, buf);
  if (rc < 0) { g_fat_last_err = -2; return -2; }
  return 0;
}

int fat_write_sec(int lba, int buf) {
  if (lba < 0 || lba >= g_fat_disk_secs) { g_fat_last_err = -2; return -2; }
  int rc = hal_disk2_write(lba, 1, buf);
  if (rc < 0) { g_fat_last_err = -2; return -2; }
  return 0;
}

int fat_is_valid_spc(int v) {
  if (v == 1 || v == 2 || v == 4 || v == 8 || v == 16 || v == 32 || v == 64 || v == 128) return 1;
  return 0;
}

int fat_mount() {
  g_fat_mounted = 0;
  g_fat_last_err = 0;
  int secs = hal_disk2_info(0);
  if (secs <= 0) {
    g_fat_disk_secs = 0;
    g_fat_last_err = -1;
    return -1;
  }
  g_fat_disk_secs = secs;
  if (fat_read_sec(0, FAT_SEC_BUF) < 0) return -2;
  if (r8(FAT_SEC_BUF + 510) != 0x55 || r8(FAT_SEC_BUF + 511) != 0xAA) {
    g_fat_last_err = -2;
    return -2;
  }

  g_fat_part_lba = 0;
  int bps0 = r16(FAT_SEC_BUF + 11);
  int spc0 = r8(FAT_SEC_BUF + 13);
  int nf0  = r8(FAT_SEC_BUF + 16);
  int b0   = r8(FAT_SEC_BUF + 0);
  if (bps0 != 512 || fat_is_valid_spc(spc0) == 0 || nf0 < 1 || nf0 > 2 || (b0 != 0xEB && b0 != 0xE9)) {
    // Check MBR partition table (4 entries at 446..509) for first non-zero FAT partition
    int found_part = 0;
    for (int pi = 0; pi < 4; pi++) {
      int poff = FAT_SEC_BUF + 446 + pi * 16;
      int ptype = r8(poff + 4);
      int plba  = r32(poff + 8);
      if (ptype != 0 && plba > 0 && plba < secs) {
        g_fat_part_lba = plba;
        found_part = 1;
        break;
      }
    }
    if (found_part == 0) { g_fat_last_err = -2; return -2; }
    if (fat_read_sec(g_fat_part_lba, FAT_SEC_BUF) < 0) return -2;
    if (r8(FAT_SEC_BUF + 510) != 0x55 || r8(FAT_SEC_BUF + 511) != 0xAA) {
      g_fat_last_err = -2; return -2;
    }
  }

  int bps = r16(FAT_SEC_BUF + 11);
  int spc = r8(FAT_SEC_BUF + 13);
  int rsvd = r16(FAT_SEC_BUF + 14);
  int nfats = r8(FAT_SEC_BUF + 16);
  int root_ent = r16(FAT_SEC_BUF + 17);
  int tot16 = r16(FAT_SEC_BUF + 19);
  int fsz16 = r16(FAT_SEC_BUF + 22);
  int tot32 = r32(FAT_SEC_BUF + 32);
  int fsz32 = r32(FAT_SEC_BUF + 36);

  int tot_sec = tot16;
  if (tot_sec == 0) tot_sec = tot32;
  int fat_sz = fsz16;
  if (fat_sz == 0) fat_sz = fsz32;

  if (bps != 512 || fat_is_valid_spc(spc) == 0 || rsvd < 1 || nfats < 1 || nfats > 2 || fat_sz <= 0 || tot_sec <= 0) {
    g_fat_last_err = -2;
    return -2;
  }
  if (g_fat_part_lba + tot_sec > secs) {
    g_fat_last_err = -2;
    return -2;
  }

  int root_secs = (root_ent * 32 + 511) >> 9;
  int data_off = rsvd + nfats * fat_sz + root_secs;
  if (data_off >= tot_sec) { g_fat_last_err = -2; return -2; }
  int data_clus = (tot_sec - data_off) / spc;
  if (data_clus < 2) { g_fat_last_err = -2; return -2; }

  g_fat_spc       = spc;
  g_fat_rsvd      = rsvd;
  g_fat_nfats     = nfats;
  g_fat_root_ent  = root_ent;
  g_fat_fat_sz    = fat_sz;
  g_fat_tot_sec   = tot_sec;
  g_fat_root_lba  = g_fat_part_lba + rsvd + nfats * fat_sz;
  g_fat_root_secs = root_secs;
  g_fat_data_lba  = g_fat_part_lba + data_off;
  g_fat_max_clus  = data_clus + 1;

  if (data_clus < 4085) {
    g_fat_type = 12;
    g_fat_root_clus = 0;
  } else if (data_clus < 65525) {
    g_fat_type = 16;
    g_fat_root_clus = 0;
  } else {
    g_fat_type = 32;
    g_fat_root_clus = r32(FAT_SEC_BUF + 44);
    if (g_fat_root_clus < 2) g_fat_root_clus = 2;
  }
  g_fat_mounted = 1;
  return 0;
}

int fat_ensure_mounted() {
  int secs = hal_disk2_info(0);
  if (secs <= 0) {
    g_fat_mounted = 0;
    g_fat_disk_secs = 0;
    g_fat_last_err = -1;
    return -1;
  }
  if (g_fat_mounted == 1 && secs == g_fat_disk_secs) return 0;
  return fat_mount();
}

int fat_is_eoc(int c) {
  if (g_fat_type == 12) return (c >= 0x0FF8);
  if (g_fat_type == 16) return (c >= 0xFFF8);
  return ((c & 0x0FFFFFFF) >= 0x0FFFFFF8);
}

int fat_eoc_val() {
  if (g_fat_type == 12) return 0x0FFF;
  if (g_fat_type == 16) return 0xFFFF;
  return 0x0FFFFFFF;
}

int fat_clus_lba(int clus) {
  return g_fat_data_lba + (clus - 2) * g_fat_spc;
}

int fat_get_entry(int c) {
  if (c < 2 || c > g_fat_max_clus) return -2;
  int fbase = g_fat_part_lba + g_fat_rsvd;
  if (g_fat_type == 12) {
    int boff = c + (c >> 1);
    int sec = boff >> 9;
    int off = boff & 511;
    if (fat_read_sec(fbase + sec, FAT_SEC_BUF) < 0) return -2;
    int lo = r8(FAT_SEC_BUF + off);
    int hi = 0;
    if (off == 511) {
      if (fat_read_sec(fbase + sec + 1, FAT_SEC_BUF) < 0) return -2;
      hi = r8(FAT_SEC_BUF + 0);
    } else {
      hi = r8(FAT_SEC_BUF + off + 1);
    }
    int v = lo | (hi << 8);
    if ((c & 1) != 0) return (v >>> 4) & 0xFFF;
    return v & 0xFFF;
  }
  if (g_fat_type == 16) {
    int boff = c << 1;
    int sec = boff >> 9;
    int off = boff & 511;
    if (fat_read_sec(fbase + sec, FAT_SEC_BUF) < 0) return -2;
    return r16(FAT_SEC_BUF + off);
  }
  int boff32 = c << 2;
  int sec32 = boff32 >> 9;
  int off32 = boff32 & 511;
  if (fat_read_sec(fbase + sec32, FAT_SEC_BUF) < 0) return -2;
  return r32(FAT_SEC_BUF + off32) & 0x0FFFFFFF;
}

int fat_write_fat_sec(int sec_rel, int buf) {
  int f1 = g_fat_part_lba + g_fat_rsvd + sec_rel;
  if (fat_write_sec(f1, buf) < 0) return -2;
  if (g_fat_nfats >= 2 && PC_FAT_NO_COPY2 == 0) {
    int f2 = f1 + g_fat_fat_sz;
    if (fat_write_sec(f2, buf) < 0) return -2;
  }
  return 0;
}

int fat_set_entry(int c, int val) {
  if (c < 2 || c > g_fat_max_clus) return -2;
  int fbase = g_fat_part_lba + g_fat_rsvd;
  if (g_fat_type == 12) {
    int boff = c + (c >> 1);
    int sec = boff >> 9;
    int off = boff & 511;
    if (fat_read_sec(fbase + sec, FAT_SEC_BUF) < 0) return -2;
    if (off == 511) {
      int b0 = r8(FAT_SEC_BUF + 511);
      if ((c & 1) != 0) w8(FAT_SEC_BUF + 511, (b0 & 0x0F) | ((val & 0x0F) << 4));
      else w8(FAT_SEC_BUF + 511, val & 0xFF);
      if (fat_write_fat_sec(sec, FAT_SEC_BUF) < 0) return -2;
      if (fat_read_sec(fbase + sec + 1, FAT_SEC_BUF) < 0) return -2;
      int b1 = r8(FAT_SEC_BUF + 0);
      if ((c & 1) != 0) w8(FAT_SEC_BUF + 0, (val >>> 4) & 0xFF);
      else w8(FAT_SEC_BUF + 0, (b1 & 0xF0) | ((val >>> 8) & 0x0F));
      return fat_write_fat_sec(sec + 1, FAT_SEC_BUF);
    }
    int cur = r16(FAT_SEC_BUF + off);
    if ((c & 1) != 0) cur = (cur & 0x000F) | ((val & 0xFFF) << 4);
    else cur = (cur & 0xF000) | (val & 0xFFF);
    w16(FAT_SEC_BUF + off, cur);
    return fat_write_fat_sec(sec, FAT_SEC_BUF);
  }
  if (g_fat_type == 16) {
    int boff = c << 1;
    int sec = boff >> 9;
    int off = boff & 511;
    if (fat_read_sec(fbase + sec, FAT_SEC_BUF) < 0) return -2;
    w16(FAT_SEC_BUF + off, val & 0xFFFF);
    return fat_write_fat_sec(sec, FAT_SEC_BUF);
  }
  int boff32 = c << 2;
  int sec32 = boff32 >> 9;
  int off32 = boff32 & 511;
  if (fat_read_sec(fbase + sec32, FAT_SEC_BUF) < 0) return -2;
  int old32 = r32(FAT_SEC_BUF + off32);
  w32(FAT_SEC_BUF + off32, (old32 & 0xF0000000) | (val & 0x0FFFFFFF));
  return fat_write_fat_sec(sec32, FAT_SEC_BUF);
}

int fat_alloc_cluster(int prev_clus) {
  for (int c = 2; c <= g_fat_max_clus; c++) {
    int v = fat_get_entry(c);
    if (v < 0) return -2;
    if (v == 0) {
      if (fat_set_entry(c, fat_eoc_val()) < 0) return -2;
      if (prev_clus >= 2) {
        if (fat_set_entry(prev_clus, c) < 0) return -2;
      }
      return c;
    }
  }
  g_fat_last_err = -4;
  return -4;
}

int fat_zero_cluster(int c) {
  hal_memset(FAT_SEC_BUF, 0, 512);
  int lba = fat_clus_lba(c);
  for (int s = 0; s < g_fat_spc; s++) {
    if (fat_write_sec(lba + s, FAT_SEC_BUF) < 0) return -2;
  }
  return 0;
}

int fat_free_chain(int start_clus) {
  int c = start_clus;
  int guard = 0;
  while (c >= 2 && c <= g_fat_max_clus && guard < 131072) {
    int nxt = fat_get_entry(c);
    if (nxt < 0) return -2;
    if (fat_set_entry(c, 0) < 0) return -2;
    if (fat_is_eoc(nxt)) break;
    c = nxt;
    guard = guard + 1;
  }
  return 0;
}

int fat_lfn_checksum(int sfn_ptr) {
  int sum = 0;
  for (int i = 0; i < 11; i++) {
    int bit0 = sum & 1;
    sum = ((sum >>> 1) + (bit0 << 7) + r8(sfn_ptr + i)) & 0xFF;
  }
  return sum;
}

void fat_decode_83(int de, int out_ptr) {
  int p = 0;
  int bend = 8;
  while (bend > 0 && r8(de + bend - 1) == 32) bend = bend - 1;
  for (int i = 0; i < bend; i++) {
    w8(out_ptr + p, r8(de + i));
    p = p + 1;
  }
  int eend = 3;
  while (eend > 0 && r8(de + 8 + eend - 1) == 32) eend = eend - 1;
  if (eend > 0) {
    w8(out_ptr + p, 46);
    p = p + 1;
    for (int j = 0; j < eend; j++) {
      w8(out_ptr + p, r8(de + 8 + j));
      p = p + 1;
    }
  }
  w8(out_ptr + p, 0);
}

void fat_extract_lfn_part(int de, int lfn_buf) {
  int ord = r8(de) & 0x1F;
  if (ord < 1 || ord > 19) return;
  int base = (ord - 1) * 13;
  for (int k = 0; k < 13; k++) {
    int off = 1 + k * 2;
    if (k >= 5 && k < 11) off = 14 + (k - 5) * 2;
    else if (k >= 11) off = 28 + (k - 11) * 2;
    int ch = r16(de + off);
    if (ch == 0 || ch == 0xFFFF) {
      w8(lfn_buf + base + k, 0);
      return;
    }
    if (ch > 127) ch = 63;
    w8(lfn_buf + base + k, ch);
  }
}

// Helper: get Nth sector LBA of a directory (dir_clus==0 means FAT12/16 root)
int fat_dir_nth_lba(int dir_clus, int sec_idx) {
  if (dir_clus == 0) {
    if (sec_idx >= g_fat_root_secs) return -1;
    return g_fat_root_lba + sec_idx;
  }
  int cidx = sec_idx / g_fat_spc;
  int soff = sec_idx % g_fat_spc;
  int c = dir_clus;
  for (int i = 0; i < cidx; i++) {
    int nxt = fat_get_entry(c);
    if (nxt < 2 || fat_is_eoc(nxt)) return -1;
    c = nxt;
  }
  return fat_clus_lba(c) + soff;
}

// Search a directory for `name_ptr`. Sets g_fe_* and returns 0 on match, -3 if not found, -2 on I/O error.
int fat_find_in_dir(int dir_clus, int name_ptr) {
  int lfn_valid = 0;
  int lfn_chk = 0;
  int lfn_cnt = 0;
  hal_memset(FAT_LFN_BUF, 0, 256);

  int sidx = 0;
  while (sidx < 4096) {
    int lba = fat_dir_nth_lba(dir_clus, sidx);
    if (lba < 0) break;
    if (fat_read_sec(lba, FAT_DIR_BUF) < 0) return -2;
    for (int off = 0; off < 512; off = off + 32) {
      int de = FAT_DIR_BUF + off;
      int first = r8(de);
      if (first == 0x00) return -3;
      if (first == 0xE5) { lfn_valid = 0; lfn_cnt = 0; continue; }
      int attr = r8(de + 11);
      if (attr == 0x0F) {
        if ((first & 0x40) != 0) {
          hal_memset(FAT_LFN_BUF, 0, 256);
          lfn_chk = r8(de + 13);
          lfn_valid = 1;
          lfn_cnt = 1;
        } else if (lfn_valid == 1 && r8(de + 13) == lfn_chk) {
          lfn_cnt = lfn_cnt + 1;
        } else {
          lfn_valid = 0;
          lfn_cnt = 0;
        }
        if (lfn_valid == 1) fat_extract_lfn_part(de, FAT_LFN_BUF);
        continue;
      }
      if ((attr & 0x08) != 0) { lfn_valid = 0; lfn_cnt = 0; continue; }

      int matched = 0;
      if (lfn_valid == 1 && fat_lfn_checksum(de) == lfn_chk) {
        if (fat_strieq(FAT_LFN_BUF, name_ptr)) matched = 1;
      }
      if (matched == 0) {
        byte s83[16];
        fat_decode_83(de, s83);
        if (fat_strieq(s83, name_ptr)) matched = 1;
      }
      if (matched == 1) {
        g_fe_dir_lba = lba;
        g_fe_dir_off = off;
        g_fe_lfn_cnt = lfn_cnt;
        g_fe_attr    = attr;
        int hi = r16(de + 20);
        int lo = r16(de + 26);
        if (g_fat_type == 32) g_fe_clus = (hi << 16) | lo;
        else g_fe_clus = lo;
        g_fe_size = r32(de + 28);
        g_fe_parent_clus = dir_clus;
        return 0;
      }
      lfn_valid = 0;
      lfn_cnt = 0;
    }
    sidx = sidx + 1;
  }
  return -3;
}

// Strip optional "/shelf" prefix and walk components.
// Returns 0 on exact match (sets g_fe_*), -3 if not found, -2 on error.
int fat_strip_prefix(int path_str) {
  if (match_prefix(path_str, "/shelf/")) return path_str + 7;
  if (hal_strcmp(path_str, "/shelf")) return path_str + 6;
  if (r8(path_str) == 47) return path_str + 1;
  return path_str;
}

int fat_resolve_path(int path_str) {
  if (fat_ensure_mounted() < 0) return g_fat_last_err;
  int p = fat_strip_prefix(path_str);
  int cur_dir = g_fat_root_clus;
  if (r8(p) == 0) {
    g_fe_attr = 0x10;
    g_fe_clus = cur_dir;
    g_fe_size = 0;
    g_fe_parent_clus = cur_dir;
    return 0;
  }
  while (r8(p) != 0) {
    int i = 0;
    while (r8(p + i) != 0 && r8(p + i) != 47 && i < 240) {
      w8(FAT_TMP_BUF + i, r8(p + i));
      i = i + 1;
    }
    w8(FAT_TMP_BUF + i, 0);
    p = p + i;
    while (r8(p) == 47) p = p + 1;
    int rc = fat_find_in_dir(cur_dir, FAT_TMP_BUF);
    if (rc < 0) return rc;
    if (r8(p) != 0) {
      if ((g_fe_attr & 0x10) == 0) return -3;
      cur_dir = g_fe_clus;
    }
  }
  return 0;
}

// Resolve parent directory and copy final basename into `out_base`.
// Returns parent_clus (>=0) or < 0 on error.
int fat_resolve_parent(int path_str, int out_base) {
  if (fat_ensure_mounted() < 0) return g_fat_last_err;
  int p = fat_strip_prefix(path_str);
  int cur_dir = g_fat_root_clus;
  int plen = hal_strlen(p);
  while (plen > 0 && r8(p + plen - 1) == 47) plen = plen - 1;
  if (plen <= 0) return -3;

  int last_slash = -1;
  for (int i = 0; i < plen; i++) {
    if (r8(p + i) == 47) last_slash = i;
  }
  if (last_slash >= 0) {
    int pos = 0;
    while (pos < last_slash) {
      int k = 0;
      while (pos + k < last_slash && r8(p + pos + k) != 47 && k < 240) {
        w8(FAT_TMP_BUF + k, r8(p + pos + k));
        k = k + 1;
      }
      w8(FAT_TMP_BUF + k, 0);
      pos = pos + k;
      while (pos < last_slash && r8(p + pos) == 47) pos = pos + 1;
      if (k > 0) {
        int rc = fat_find_in_dir(cur_dir, FAT_TMP_BUF);
        if (rc < 0) return rc;
        if ((g_fe_attr & 0x10) == 0) return -3;
        cur_dir = g_fe_clus;
      }
    }
  }
  int bstart = last_slash + 1;
  int blen = plen - bstart;
  if (blen <= 0 || blen > 240) return -3;
  hal_memcpy(out_base, p + bstart, blen);
  w8(out_base + blen, 0);
  return cur_dir;
}

// Build 8.3 short name into sfn11; returns 1 if LFN is needed, 0 if pure 8.3
int fat_make_sfn(int name_ptr, int sfn11, int seq) {
  hal_memset(sfn11, 32, 11);
  int len = hal_strlen(name_ptr);
  int dot = -1;
  for (int i = len - 1; i >= 0; i = i - 1) {
    if (r8(name_ptr + i) == 46) { dot = i; break; }
  }
  int blen = len;
  int elen = 0;
  if (dot >= 0) { blen = dot; elen = len - dot - 1; }
  int need_lfn = 0;
  if (blen == 0 || blen > 8 || elen > 3 || seq > 0) need_lfn = 1;
  for (int j = 0; j < len; j++) {
    int c = r8(name_ptr + j);
    if (c == 32 || (c >= 97 && c <= 122)) need_lfn = 1;
    if (c == 46 && j != dot) need_lfn = 1;
  }
  int bp = 0;
  int maxb = 8;
  if (need_lfn == 1) maxb = 6;
  for (int i2 = 0; i2 < blen && bp < maxb; i2++) {
    int c2 = fat_upcase(r8(name_ptr + i2));
    if (c2 <= 32 || c2 == 46 || c2 == 47) continue;
    w8(sfn11 + bp, c2);
    bp = bp + 1;
  }
  if (bp == 0) { w8(sfn11, 70); bp = 1; }
  if (need_lfn == 1) {
    int sn = seq;
    if (sn <= 0) sn = 1;
    if (sn < 10) {
      w8(sfn11 + bp, 126); // '~'
      w8(sfn11 + bp + 1, 48 + sn);
    } else {
      if (bp > 5) bp = 5;
      w8(sfn11 + bp, 126);
      w8(sfn11 + bp + 1, 48 + (sn / 10) % 10);
      w8(sfn11 + bp + 2, 48 + (sn % 10));
    }
  }
  int ep = 0;
  if (dot >= 0) {
    for (int k = dot + 1; k < len && ep < 3; k++) {
      int c3 = fat_upcase(r8(name_ptr + k));
      if (c3 <= 32 || c3 == 46 || c3 == 47) continue;
      w8(sfn11 + 8 + ep, c3);
      ep = ep + 1;
    }
  }
  if (PC_FAT_TRUNC_83 == 1) return 0;
  return need_lfn;
}

// Allocate `needed` consecutive 32-byte slots in `dir_clus` and write LFN + 8.3 entry
int fat_create_dir_entry(int dir_clus, int name_ptr, int attr, int start_clus, int fsize) {
  byte sfn[12];
  int seq = 0;
  int need_lfn = fat_make_sfn(name_ptr, sfn, 0);
  if (need_lfn == 1) {
    for (int try_s = 1; try_s <= 99; try_s++) {
      fat_make_sfn(name_ptr, sfn, try_s);
      byte s83[16];
      fat_decode_83(sfn, s83);
      if (fat_find_in_dir(dir_clus, s83) < 0) { seq = try_s; break; }
    }
    if (seq == 0) seq = 1;
    fat_make_sfn(name_ptr, sfn, seq);
  }
  int nlen = hal_strlen(name_ptr);
  int lfn_cnt = 0;
  if (need_lfn == 1) lfn_cnt = (nlen + 12) / 13;
  int needed = lfn_cnt + 1;

  // Scan directory for `needed` contiguous free (0x00 or 0xE5) 32B slots
  int run_start = -1;
  int run_len = 0;
  int total_slots = 0;
  int sidx = 0;
  while (sidx < 4096) {
    int lba = fat_dir_nth_lba(dir_clus, sidx);
    if (lba < 0) {
      if (dir_clus == 0) { g_fat_last_err = -4; return -4; }
      // Extend directory cluster chain
      int last_c = dir_clus;
      while (1) {
        int nxt = fat_get_entry(last_c);
        if (nxt < 2 || fat_is_eoc(nxt)) break;
        last_c = nxt;
      }
      int nc = fat_alloc_cluster(last_c);
      if (nc < 0) return nc;
      if (fat_zero_cluster(nc) < 0) return -2;
      lba = fat_dir_nth_lba(dir_clus, sidx);
      if (lba < 0) return -4;
    }
    if (fat_read_sec(lba, FAT_DIR_BUF) < 0) return -2;
    for (int e = 0; e < 16; e++) {
      int b0 = r8(FAT_DIR_BUF + e * 32);
      int slot_num = sidx * 16 + e;
      if (b0 == 0x00 || b0 == 0xE5) {
        if (run_len == 0) run_start = slot_num;
        run_len = run_len + 1;
        if (run_len >= needed) {
          total_slots = slot_num + 1;
          break;
        }
      } else {
        run_len = 0;
      }
    }
    if (run_len >= needed) break;
    sidx = sidx + 1;
  }
  if (run_len < needed) return -4;

  // Write LFN entries (ord = lfn_cnt down to 1) then 8.3 entry
  int chk = fat_lfn_checksum(sfn);
  for (int k = 0; k < needed; k++) {
    int slot = run_start + k;
    int sec_i = slot >> 4;
    int off_i = (slot & 15) * 32;
    int wlba = fat_dir_nth_lba(dir_clus, sec_i);
    if (fat_read_sec(wlba, FAT_DIR_BUF) < 0) return -2;
    int de = FAT_DIR_BUF + off_i;
    hal_memset(de, 0, 32);
    if (k < lfn_cnt) {
      int ord = lfn_cnt - k;
      int tag = ord;
      if (k == 0) tag = ord | 0x40;
      w8(de + 0, tag);
      w8(de + 11, 0x0F);
      w8(de + 13, chk);
      int base = (ord - 1) * 13;
      for (int ci = 0; ci < 13; ci++) {
        int coff = 1 + ci * 2;
        if (ci >= 5 && ci < 11) coff = 14 + (ci - 5) * 2;
        else if (ci >= 11) coff = 28 + (ci - 11) * 2;
        int idx = base + ci;
        int ch = 0xFFFF;
        if (idx < nlen) ch = r8(name_ptr + idx);
        else if (idx == nlen) ch = 0x0000;
        w16(de + coff, ch);
      }
    } else {
      hal_memcpy(de, sfn, 11);
      w8(de + 11, attr);
      w16(de + 20, (start_clus >>> 16) & 0xFFFF);
      w16(de + 26, start_clus & 0xFFFF);
      w32(de + 28, fsize);
    }
    if (fat_write_sec(wlba, FAT_DIR_BUF) < 0) return -2;
  }
  return 0;
}

// Mark a directory entry (and its preceding LFN entries) as deleted (0xE5)
int fat_mark_deleted(int dir_clus, int target_lba, int target_off, int lfn_cnt) {
  // Find target slot index in dir_clus
  int target_slot = -1;
  int sidx = 0;
  while (sidx < 4096) {
    int lba = fat_dir_nth_lba(dir_clus, sidx);
    if (lba < 0) break;
    if (lba == target_lba) { target_slot = sidx * 16 + (target_off >> 5); break; }
    sidx = sidx + 1;
  }
  if (target_slot < 0) return -3;
  int first_slot = target_slot - lfn_cnt;
  if (first_slot < 0) first_slot = 0;
  for (int sl = first_slot; sl <= target_slot; sl++) {
    int lba2 = fat_dir_nth_lba(dir_clus, sl >> 4);
    if (fat_read_sec(lba2, FAT_DIR_BUF) < 0) return -2;
    w8(FAT_DIR_BUF + (sl & 15) * 32, 0xE5);
    if (fat_write_sec(lba2, FAT_DIR_BUF) < 0) return -2;
  }
  return 0;
}

// ============================================================================
// Public FAT Operations (/shelf)
// ============================================================================
int fat_stat(int path_str) {
  if (fat_resolve_path(path_str) < 0) return -1;
  return g_fe_size;
}

int fat_read_file(int path_str, int dst_ptr, int max_len) {
  int rc = fat_resolve_path(path_str);
  if (rc < 0) return rc;
  if ((g_fe_attr & 0x10) != 0) return -3;
  int to_read = g_fe_size;
  if (to_read > max_len) to_read = max_len;
  int done = 0;
  int c = g_fe_clus;
  while (done < to_read && c >= 2 && c <= g_fat_max_clus) {
    int clba = fat_clus_lba(c);
    for (int s = 0; s < g_fat_spc && done < to_read; s++) {
      if (fat_read_sec(clba + s, FAT_SEC_BUF) < 0) return -2;
      int chunk = to_read - done;
      if (chunk > 512) chunk = 512;
      hal_memcpy(dst_ptr + done, FAT_SEC_BUF, chunk);
      done = done + chunk;
    }
    if (done < to_read) {
      int nxt = fat_get_entry(c);
      if (nxt < 2 || fat_is_eoc(nxt)) break;
      c = nxt;
    }
  }
  return done;
}

int fat_write_file(int path_str, int src_ptr, int len) {
  byte base[244];
  int pdir = fat_resolve_parent(path_str, base);
  if (pdir < 0) return pdir;

  // If file already exists, delete its old entry and cluster chain first
  if (fat_find_in_dir(pdir, base) == 0) {
    if ((g_fe_attr & 0x10) != 0) return -2;
    int old_c = g_fe_clus;
    if (fat_mark_deleted(pdir, g_fe_dir_lba, g_fe_dir_off, g_fe_lfn_cnt) < 0) return -2;
    if (old_c >= 2) {
      if (fat_free_chain(old_c) < 0) return -2;
    }
  }

  int first_clus = 0;
  int prev_clus = 0;
  int done = 0;
  while (done < len) {
    int nc = fat_alloc_cluster(prev_clus);
    if (nc < 0) {
      if (first_clus >= 2) fat_free_chain(first_clus);
      return nc;
    }
    if (first_clus == 0) first_clus = nc;
    prev_clus = nc;
    int clba = fat_clus_lba(nc);
    for (int s = 0; s < g_fat_spc; s++) {
      hal_memset(FAT_SEC_BUF, 0, 512);
      if (done < len) {
        int chunk = len - done;
        if (chunk > 512) chunk = 512;
        hal_memcpy(FAT_SEC_BUF, src_ptr + done, chunk);
        done = done + chunk;
      }
      if (fat_write_sec(clba + s, FAT_SEC_BUF) < 0) return -2;
    }
  }
  return fat_create_dir_entry(pdir, base, 0x20, first_clus, len);
}

int fat_append_file(int path_str, int src_ptr, int add_len) {
  if (add_len <= 0) return 0;
  int rc = fat_resolve_path(path_str);
  if (rc < 0) return fat_write_file(path_str, src_ptr, add_len);
  if ((g_fe_attr & 0x10) != 0) return -2;
  int old_sz = g_fe_size;
  int dir_lba = g_fe_dir_lba;
  int dir_off = g_fe_dir_off;
  int first_c = g_fe_clus;
  int clus_bytes = g_fat_spc * 512;

  // Walk to last cluster
  int cur = first_c;
  if (cur >= 2) {
    while (1) {
      int nxt = fat_get_entry(cur);
      if (nxt < 2 || fat_is_eoc(nxt)) break;
      cur = nxt;
    }
  }

  int written = 0;
  int cur_pos = old_sz;
  while (written < add_len) {
    int off_in_clus = cur_pos % clus_bytes;
    if (cur < 2 || (off_in_clus == 0 && cur_pos > 0)) {
      int nc = fat_alloc_cluster(cur);
      if (nc < 0) return nc;
      if (first_c < 2) first_c = nc;
      cur = nc;
      off_in_clus = 0;
    }
    int sec_in_clus = off_in_clus >> 9;
    int off_in_sec  = off_in_clus & 511;
    int wlba = fat_clus_lba(cur) + sec_in_clus;
    if (off_in_sec != 0 || (add_len - written) < 512) {
      if (fat_read_sec(wlba, FAT_SEC_BUF) < 0) return -2;
    } else {
      hal_memset(FAT_SEC_BUF, 0, 512);
    }
    int chunk = 512 - off_in_sec;
    if (chunk > add_len - written) chunk = add_len - written;
    hal_memcpy(FAT_SEC_BUF + off_in_sec, src_ptr + written, chunk);
    if (fat_write_sec(wlba, FAT_SEC_BUF) < 0) return -2;
    written = written + chunk;
    cur_pos = cur_pos + chunk;
  }

  // Update 8.3 directory entry with new start cluster & size
  if (fat_read_sec(dir_lba, FAT_DIR_BUF) < 0) return -2;
  int de = FAT_DIR_BUF + dir_off;
  w16(de + 20, (first_c >>> 16) & 0xFFFF);
  w16(de + 26, first_c & 0xFFFF);
  w32(de + 28, old_sz + add_len);
  return fat_write_sec(dir_lba, FAT_DIR_BUF);
}

int fat_mkdir(int path_str) {
  byte base[244];
  int pdir = fat_resolve_parent(path_str, base);
  if (pdir < 0) return pdir;
  if (fat_find_in_dir(pdir, base) == 0) {
    if ((g_fe_attr & 0x10) != 0) return 0; // already exists as dir
    return -2;
  }
  int nc = fat_alloc_cluster(0);
  if (nc < 0) return nc;
  if (fat_zero_cluster(nc) < 0) return -2;
  // Write "." and ".." entries
  hal_memset(FAT_DIR_BUF, 0, 512);
  hal_memset(FAT_DIR_BUF + 0, 32, 11);
  w8(FAT_DIR_BUF + 0, 46);
  w8(FAT_DIR_BUF + 11, 0x10);
  w16(FAT_DIR_BUF + 20, (nc >>> 16) & 0xFFFF);
  w16(FAT_DIR_BUF + 26, nc & 0xFFFF);
  hal_memset(FAT_DIR_BUF + 32, 32, 11);
  w8(FAT_DIR_BUF + 32, 46); w8(FAT_DIR_BUF + 33, 46);
  w8(FAT_DIR_BUF + 43, 0x10);
  int par_c = pdir;
  if (g_fat_type == 32 && par_c == g_fat_root_clus) par_c = 0;
  w16(FAT_DIR_BUF + 52, (par_c >>> 16) & 0xFFFF);
  w16(FAT_DIR_BUF + 58, par_c & 0xFFFF);
  if (fat_write_sec(fat_clus_lba(nc), FAT_DIR_BUF) < 0) return -2;
  return fat_create_dir_entry(pdir, base, 0x10, nc, 0);
}

int fat_delete(int path_str) {
  int rc = fat_resolve_path(path_str);
  if (rc < 0) return rc;
  int clus = g_fe_clus;
  if (fat_mark_deleted(g_fe_parent_clus, g_fe_dir_lba, g_fe_dir_off, g_fe_lfn_cnt) < 0) return -2;
  if (clus >= 2) return fat_free_chain(clus);
  return 0;
}

int fat_rename(int old_path, int new_path) {
  int rc = fat_resolve_path(old_path);
  if (rc < 0) return rc;
  int old_pdir = g_fe_parent_clus;
  int old_lba  = g_fe_dir_lba;
  int old_off  = g_fe_dir_off;
  int old_lfn  = g_fe_lfn_cnt;
  int attr     = g_fe_attr;
  int clus     = g_fe_clus;
  int fsize    = g_fe_size;

  byte new_base[244];
  int new_pdir = fat_resolve_parent(new_path, new_base);
  if (new_pdir < 0) return new_pdir;
  if (fat_find_in_dir(new_pdir, new_base) == 0) {
    int dc = g_fe_clus;
    fat_mark_deleted(new_pdir, g_fe_dir_lba, g_fe_dir_off, g_fe_lfn_cnt);
    if (dc >= 2) fat_free_chain(dc);
  }
  if (fat_mark_deleted(old_pdir, old_lba, old_off, old_lfn) < 0) return -2;
  return fat_create_dir_entry(new_pdir, new_base, attr, clus, fsize);
}

// List entries in directory `dir_path` into `out_buf` (max_ent * 64B: [name:56][attr:4][size:4]).
// Returns count of entries (>=0) or < 0 on error.
int fat_list_dir(int dir_path, int out_buf, int max_ent) {
  int rc = fat_resolve_path(dir_path);
  if (rc < 0) return rc;
  if ((g_fe_attr & 0x10) == 0) return -3;
  int dir_clus = g_fe_clus;

  int count = 0;
  int lfn_valid = 0;
  int lfn_chk = 0;
  hal_memset(FAT_LFN_BUF, 0, 256);

  int sidx = 0;
  while (sidx < 4096 && count < max_ent) {
    int lba = fat_dir_nth_lba(dir_clus, sidx);
    if (lba < 0) break;
    if (fat_read_sec(lba, FAT_DIR_BUF) < 0) return -2;
    for (int off = 0; off < 512 && count < max_ent; off = off + 32) {
      int de = FAT_DIR_BUF + off;
      int first = r8(de);
      if (first == 0x00) return count;
      if (first == 0xE5) { lfn_valid = 0; continue; }
      int attr = r8(de + 11);
      if (attr == 0x0F) {
        if ((first & 0x40) != 0) {
          hal_memset(FAT_LFN_BUF, 0, 256);
          lfn_chk = r8(de + 13);
          lfn_valid = 1;
        } else if (lfn_valid == 1 && r8(de + 13) != lfn_chk) {
          lfn_valid = 0;
        }
        if (lfn_valid == 1) fat_extract_lfn_part(de, FAT_LFN_BUF);
        continue;
      }
      if ((attr & 0x08) != 0) { lfn_valid = 0; continue; }
      int dst = out_buf + count * 48;
      hal_memset(dst, 0, 48);
      if (lfn_valid == 1 && fat_lfn_checksum(de) == lfn_chk) {
        int nl = hal_strlen(FAT_LFN_BUF);
        if (nl > 39) nl = 39;
        hal_memcpy(dst, FAT_LFN_BUF, nl);
      } else {
        fat_decode_83(de, dst);
      }
      lfn_valid = 0;
      if (hal_strcmp(dst, ".") || hal_strcmp(dst, "..")) continue;
      w32(dst + 40, r32(de + 28));
      w32(dst + 44, attr);
      count = count + 1;
    }
    sidx = sidx + 1;
  }
  return count;
}

int is_shelf_path(int path_str) {
  if (hal_strcmp(path_str, "/shelf")) return 1;
  if (match_prefix(path_str, "/shelf/")) return 1;
  return 0;
}
