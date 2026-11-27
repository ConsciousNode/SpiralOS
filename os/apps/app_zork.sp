// ============================================================================
// SpiralOS 1.7 "Bring Your Own" — Complete Z-Machine (v3, v4, v5, v7, v8)
// (/apps/zork.spir) · Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Implements Z-Machine Standards Document 1.1 for versions 3, 4, 5, 7, and 8:
//   - All 2OP, 1OP, 0OP, VAR, and EXT opcodes
//   - Split screen & upper window, cursor control, text styles, 16-color + true colour
//   - Timed input & interrupt routines, save_undo / restore_undo
//   - Output streams 1 (screen), 2 (transcript), 3 (memory table stack)
//   - @check_unicode / @print_unicode + Unicode translation table
//   - @sound_effect bleeps via OS PCM mixer
//   - Load story files and save/restore anywhere on SpiralFS or /shelf
// ============================================================================

import "/src/app_abi.sp";

const PC_Z_BAD_ABBREV       = 0;
const PC_Z_SWAP_INSERT      = 0;
const PC_Z_SPACE_ONLY_TOK   = 0;
const PC_Z_RESTORE_NO_STACK = 0;
const PC_Z_UNDO_NO_STACK    = 0;
const PC_Z_UPPER_NO_RESERVE = 0;

const Z_MEM_SIZE = 0x80000; // 512 KB (covers v3..v8 max story size)
const Z_SCR_COLS = 34;
const Z_SCR_ROWS = 15;

int z_mem;
int z_stack;
int z_frames;
int z_out_buf;
int z_tr_buf;
int z_hist_buf;
int z_sav_buf;
int z_undo_buf;
int z_up_chars;  // 16 * 40 bytes upper window characters
int z_up_fg;     // 16 * 40 bytes upper window fg color
int z_up_bg;     // 16 * 40 bytes upper window bg color
int z_up_style;  // 16 * 40 bytes upper window text style
int z_s3_tab;    // 16 * 8 bytes stream 3 stack (addr, count)
int z_s3_depth;

int z_ver;
int z_pc;
int z_sp;
int z_fp;
int z_halted;
int z_waiting_read; // 0=running, 1=line read, 2=char read
int z_read_tbuf;
int z_read_pbuf;
int z_in_time;      // tenths of a second
int z_in_routine;   // unpacked routine addr for timed interrupt
int z_in_t0;        // hal_time() when timer started
int z_dict_addr;
int z_obj_addr;
int z_glob_addr;
int z_static_base;
int z_abbrev_addr;
int z_routine_off;
int z_string_off;
int z_story_len;
int z_file_checksum;
int z_transcript_on;
int z_screen_on;
int z_tr_len;
int z_out_len;
int z_rng_state;
int z_prompt_cnt;
int z_in_len;
int z_hist_cnt;
int z_hist_pos;
int z_has_undo;

// Screen / Window / Style / Color state
int z_upper_lines;
int z_cur_win;   // 0=lower, 1=upper
int z_cur_row;   // 1-based row in upper window
int z_cur_col;   // 1-based col in upper window
int z_cur_style; // bitmask: 1=rev, 2=bold, 4=italic, 8=fixed
int z_cur_fg;    // SpiralOS palette index (default 7/15)
int z_cur_bg;    // SpiralOS palette index (default 0)
int z_z_fg;      // Z-Machine color code (default 9=white)
int z_z_bg;      // Z-Machine color code (default 2=black)
int z_cur_font;  // 1=normal, 4=fixed

byte z_in_buf[64];
byte z_stat_room[32];
int z_stat_score;
int z_stat_moves;
int z_stat_is_time;
byte z_story_path[128];
byte z_save_path[128];
int z_op_cnt;
int z_ops[8];
int z_abbrev_depth;
int z_stat_cap_mode;
int z_stat_cap_len;

int z_is_shelf(int p) {
  if (r8(p) == 47 && r8(p + 1) == 115 && r8(p + 2) == 104 && r8(p + 3) == 101 && r8(p + 4) == 108 && r8(p + 5) == 102 && (r8(p + 6) == 47 || r8(p + 6) == 0)) return 1;
  return 0;
}

int z_u8(int a) { return r8(z_mem + (a & 0x7FFFF)); }
void z_w8(int a, int v) { w8(z_mem + (a & 0x7FFFF), v & 0xFF); }
int z_u16(int a) {
  int p = z_mem + (a & 0x7FFFF);
  return (r8(p) << 8) | r8(p + 1);
}
void z_w16(int a, int v) {
  int p = z_mem + (a & 0x7FFFF);
  w8(p, (v >>> 8) & 0xFF);
  w8(p + 1, v & 0xFF);
}
int z_s16(int v) {
  v = v & 0xFFFF;
  if (v >= 32768) return v - 65536;
  return v;
}
int z_fetch8() {
  int v = z_u8(z_pc);
  z_pc = z_pc + 1;
  return v;
}
int z_fetch16() {
  int hi = z_u8(z_pc);
  int lo = z_u8(z_pc + 1);
  z_pc = z_pc + 2;
  return (hi << 8) | lo;
}

int z_unpack_routine(int pa) {
  if (z_ver <= 3) return pa * 2;
  if (z_ver <= 5) return pa * 4;
  if (z_ver == 7) return pa * 4 + z_routine_off;
  return pa * 8;
}

int z_unpack_string(int pa) {
  if (z_ver <= 3) return pa * 2;
  if (z_ver <= 5) return pa * 4;
  if (z_ver == 7) return pa * 4 + z_string_off;
  return pa * 8;
}

void z_push(int v) {
  if (z_sp < 2048) {
    w16(z_stack + z_sp * 2, v & 0xFFFF);
    z_sp = z_sp + 1;
  }
}
int z_pop() {
  if (z_sp > 0) {
    z_sp = z_sp - 1;
    return r16(z_stack + z_sp * 2);
  }
  return 0;
}
int z_peek() {
  if (z_sp > 0) return r16(z_stack + (z_sp - 1) * 2);
  return 0;
}
void z_poke(int v) {
  if (z_sp > 0) w16(z_stack + (z_sp - 1) * 2, v & 0xFFFF);
}

// Frame layout (56 bytes per frame):
//  0: ret_pc (int32, -1 = timed interrupt sentinel)
//  4: st_var (int32, -1 = discard result)
//  8: saved_sp (int32)
// 12: nloc (int32)
// 16: arg_cnt (int32)
// 20..49: 15 local variables (uint16 each)
int z_get_var(int v) {
  if (v == 0) return z_pop();
  if (v < 16) return r16(z_frames + z_fp * 56 + 20 + (v - 1) * 2);
  return z_u16(z_glob_addr + (v - 16) * 2);
}
void z_set_var(int v, int val) {
  val = val & 0xFFFF;
  if (v == 0) { z_push(val); return; }
  if (v < 16) { w16(z_frames + z_fp * 56 + 20 + (v - 1) * 2, val); return; }
  z_w16(z_glob_addr + (v - 16) * 2, val);
}
int z_get_var_ind(int v) {
  if (v == 0) return z_peek();
  return z_get_var(v);
}
void z_set_var_ind(int v, int val) {
  val = val & 0xFFFF;
  if (v == 0) { z_poke(val); return; }
  z_set_var(v, val);
}
void z_store_res(int val) {
  int v = z_fetch8();
  z_set_var(v, val);
}

int z_intr_done;
int z_intr_ret;

void z_do_ret(int val) {
  int f = z_frames + z_fp * 56;
  int ret_pc = r32(f + 0);
  int st_var = r32(f + 4);
  z_sp = r32(f + 8);
  if (ret_pc == -1) {
    // Return from timed interrupt routine
    z_fp = z_fp - 1;
    z_intr_done = 1;
    z_intr_ret = val & 0xFFFF;
    return;
  }
  if (z_fp == 0) { z_halted = 1; return; }
  z_fp = z_fp - 1;
  z_pc = ret_pc;
  if (st_var >= 0) z_set_var(st_var, val);
}

void z_branch(int cond) {
  int b = z_fetch8();
  int sense = (b >>> 7) & 1;
  int off = b & 63;
  if ((b & 64) == 0) {
    int b2 = z_fetch8();
    off = (off << 8) | b2;
    if (off >= 8192) off = off - 16384;
  }
  int take = 0;
  if (cond != 0 && sense == 1) take = 1;
  if (cond == 0 && sense == 0) take = 1;
  if (take == 1) {
    if (off == 0) { z_do_ret(0); return; }
    if (off == 1) { z_do_ret(1); return; }
    z_pc = z_pc + off - 2;
  }
}

void z_do_call(int paddr, int nargs, int has_store) {
  int st_var = -1;
  if (has_store == 1) st_var = z_fetch8();
  if (paddr == 0) {
    if (st_var >= 0) z_set_var(st_var, 0);
    return;
  }
  int raddr = z_unpack_routine(paddr);
  z_fp = z_fp + 1;
  int f = z_frames + z_fp * 56;
  w32(f + 0, z_pc);
  w32(f + 4, st_var);
  w32(f + 8, z_sp);
  z_pc = raddr;
  int nloc = z_fetch8();
  if (nloc > 15) nloc = 15;
  w32(f + 12, nloc);
  w32(f + 16, nargs);
  for (int i = 0; i < nloc; i++) {
    int defv = 0;
    if (z_ver <= 4) defv = z_fetch16();
    if (i < nargs) defv = z_ops[i + 1];
    w16(f + 20 + i * 2, defv & 0xFFFF);
  }
}

// Color mapping: Z-Machine standard colors (2..9) -> SpiralOS 16-color VGA palette
int z_color_to_vga(int zc, int is_bg) {
  if (zc == 1) { if (is_bg == 1) return 0; return 7; }
  if (zc == 2) return 0;  // black
  if (zc == 3) return 4;  // red
  if (zc == 4) return 2;  // green
  if (zc == 5) return 14; // yellow
  if (zc == 6) return 1;  // blue
  if (zc == 7) return 5;  // magenta
  if (zc == 8) return 3;  // cyan
  if (zc == 9) return 15; // white
  if (is_bg == 1) return 0;
  return 7;
}

// True colour (15-bit 0bbbbbgggggrrrrr) -> nearest SpiralOS 16-color VGA palette index
int z_true_to_vga(int tc) {
  int r = (tc & 31) * 8;
  int g = ((tc >>> 5) & 31) * 8;
  int b = ((tc >>> 10) & 31) * 8;
  int best = 0;
  int bdist = 999999;
  for (int i = 0; i < 16; i++) {
    int pr = 0; int pg = 0; int pb = 0;
    if (i == 0) { pr = 0; pg = 0; pb = 0; }
    else if (i == 1) { pr = 0; pg = 0; pb = 170; }
    else if (i == 2) { pr = 0; pg = 170; pb = 0; }
    else if (i == 3) { pr = 0; pg = 170; pb = 170; }
    else if (i == 4) { pr = 170; pg = 0; pb = 0; }
    else if (i == 5) { pr = 170; pg = 0; pb = 170; }
    else if (i == 6) { pr = 170; pg = 85; pb = 0; }
    else if (i == 7) { pr = 170; pg = 170; pb = 170; }
    else if (i == 8) { pr = 85; pg = 85; pb = 85; }
    else if (i == 9) { pr = 85; pg = 85; pb = 255; }
    else if (i == 10) { pr = 85; pg = 255; pb = 85; }
    else if (i == 11) { pr = 85; pg = 255; pb = 255; }
    else if (i == 12) { pr = 255; pg = 85; pb = 85; }
    else if (i == 13) { pr = 255; pg = 85; pb = 255; }
    else if (i == 14) { pr = 255; pg = 255; pb = 85; }
    else { pr = 255; pg = 255; pb = 255; }
    int dr = r - pr; int dg = g - pg; int db = b - pb;
    int dist = dr * dr + dg * dg + db * db;
    if (dist < bdist) { bdist = dist; best = i; }
  }
  return best;
}

// Unicode translation table (Standard 1.1 §3.8.5.3)
int z_unicode_from_zscii(int zc) {
  if (zc < 155 || zc > 251) return zc;
  int idx = zc - 155;
  int hext = z_u16(0x36);
  if (hext != 0 && z_u16(hext) >= 3) {
    int utab = z_u16(hext + 6);
    if (utab != 0) {
      int ulen = z_u8(utab);
      if (idx < ulen) return z_u16(utab + 1 + idx * 2);
      return 63; // '?'
    }
  }
  // Default Standard 1.1 Unicode table (first 69 entries)
  if (idx == 0) return 0xE4; if (idx == 1) return 0xF6; if (idx == 2) return 0xFC;
  if (idx == 3) return 0xC4; if (idx == 4) return 0xD6; if (idx == 5) return 0xDC;
  if (idx == 6) return 0xDF; if (idx == 7) return 0xBB; if (idx == 8) return 0xAB;
  if (idx == 9) return 0xEB; if (idx == 10) return 0xEF; if (idx == 11) return 0xFF;
  if (idx == 12) return 0xCB; if (idx == 13) return 0xCF; if (idx == 14) return 0xE1;
  if (idx == 15) return 0xE9; if (idx == 16) return 0xED; if (idx == 17) return 0xF3;
  if (idx == 18) return 0xFA; if (idx == 19) return 0xFD; if (idx == 20) return 0xC1;
  if (idx == 21) return 0xC9; if (idx == 22) return 0xCD; if (idx == 23) return 0xD3;
  if (idx == 24) return 0xDA; if (idx == 25) return 0xDD; if (idx == 26) return 0xE0;
  if (idx == 27) return 0xE8; if (idx == 28) return 0xEC; if (idx == 29) return 0xF2;
  if (idx == 30) return 0xF9; if (idx == 31) return 0xC0; if (idx == 32) return 0xC8;
  if (idx == 33) return 0xCC; if (idx == 34) return 0xD2; if (idx == 35) return 0xD9;
  if (idx == 36) return 0xE2; if (idx == 37) return 0xEA; if (idx == 38) return 0xEE;
  if (idx == 39) return 0xF4; if (idx == 40) return 0xFB; if (idx == 41) return 0xC2;
  if (idx == 42) return 0xCA; if (idx == 43) return 0xCE; if (idx == 44) return 0xD4;
  if (idx == 45) return 0xDB; if (idx == 46) return 0xE5; if (idx == 47) return 0xC5;
  if (idx == 48) return 0xF8; if (idx == 49) return 0xD8; if (idx == 50) return 0xE3;
  if (idx == 51) return 0xF1; if (idx == 52) return 0xF5; if (idx == 53) return 0xC3;
  if (idx == 54) return 0xD1; if (idx == 55) return 0xD5; if (idx == 56) return 0xE6;
  if (idx == 57) return 0xC6; if (idx == 58) return 0xE7; if (idx == 59) return 0xC7;
  if (idx == 60) return 0xFE; if (idx == 61) return 0xF0; if (idx == 62) return 0xDE;
  if (idx == 63) return 0xD0; if (idx == 64) return 0xA3; if (idx == 65) return 0x153;
  if (idx == 66) return 0x152; if (idx == 67) return 0xA1; if (idx == 68) return 0xBF;
  return 63;
}

int z_unicode_to_ascii(int uc) {
  if (uc >= 32 && uc <= 126) return uc;
  if (uc == 10 || uc == 13) return 10;
  if (uc == 0xE4 || uc == 0xE1 || uc == 0xE0 || uc == 0xE2 || uc == 0xE5 || uc == 0xE3) return 97; // a
  if (uc == 0xC4 || uc == 0xC1 || uc == 0xC0 || uc == 0xC2 || uc == 0xC5 || uc == 0xC3) return 65; // A
  if (uc == 0xE9 || uc == 0xE8 || uc == 0xEA || uc == 0xEB) return 101; // e
  if (uc == 0xC9 || uc == 0xC8 || uc == 0xCA || uc == 0xCB) return 69;  // E
  if (uc == 0xED || uc == 0xEC || uc == 0xEE || uc == 0xEF) return 105; // i
  if (uc == 0xCD || uc == 0xCC || uc == 0xCE || uc == 0xCF) return 73;  // I
  if (uc == 0xF6 || uc == 0xF3 || uc == 0xF2 || uc == 0xF4 || uc == 0xF8 || uc == 0xF5) return 111; // o
  if (uc == 0xD6 || uc == 0xD3 || uc == 0xD2 || uc == 0xD4 || uc == 0xD8 || uc == 0xD5) return 79;  // O
  if (uc == 0xFC || uc == 0xFA || uc == 0xF9 || uc == 0xFB) return 117; // u
  if (uc == 0xDC || uc == 0xDA || uc == 0xD9 || uc == 0xDB) return 85;  // U
  if (uc == 0xF1) return 110; if (uc == 0xD1) return 78; // n/N
  if (uc == 0xE7) return 99;  if (uc == 0xC7) return 67; // c/C
  if (uc == 0xDF) return 115; // s
  if (uc == 0xA3) return 35;  // #
  if (uc == 0xA1) return 33;  // !
  if (uc == 0xBF) return 63;  // ?
  return 63;
}

void z_emit_ch(int ch) {
  // Stream 3 (memory table) captures raw ZSCII and suppresses screen/transcript
  if (z_s3_depth > 0 && z_stat_cap_mode == 0) {
    int slot = z_s3_tab + (z_s3_depth - 1) * 8;
    int taddr = r32(slot + 0);
    int cnt = r32(slot + 4);
    int zc = ch;
    if (zc == 10) zc = 13;
    z_w8(taddr + 2 + cnt, zc & 0xFF);
    w32(slot + 4, cnt + 1);
    return;
  }
  if (ch == 13) ch = 10;
  if (ch >= 155 && ch <= 251) ch = z_unicode_to_ascii(z_unicode_from_zscii(ch));
  if (z_stat_cap_mode == 1) {
    if (ch >= 32 && ch < 127 && z_stat_cap_len < 30) {
      z_stat_room[z_stat_cap_len] = ch;
      z_stat_cap_len = z_stat_cap_len + 1;
      z_stat_room[z_stat_cap_len] = 0;
    }
    return;
  }
  if (z_screen_on == 0) return;

  // Upper window output (window 1)
  if (z_cur_win == 1) {
    if (ch == 10) {
      z_cur_row = z_cur_row + 1;
      z_cur_col = 1;
      return;
    }
    if (ch >= 32 && ch <= 126) {
      if (z_cur_row >= 1 && z_cur_row <= z_upper_lines && z_cur_col >= 1 && z_cur_col <= Z_SCR_COLS) {
        int idx = (z_cur_row - 1) * 40 + (z_cur_col - 1);
        w8(z_up_chars + idx, ch);
        w8(z_up_fg + idx, z_cur_fg);
        w8(z_up_bg + idx, z_cur_bg);
        w8(z_up_style + idx, z_cur_style);
      }
      z_cur_col = z_cur_col + 1;
    }
    return;
  }

  // Lower window output (window 0)
  if (ch != 10 && (ch < 32 || ch > 126)) return;
  if (z_out_len >= 8000) {
    hal_memcpy(z_out_buf, z_out_buf + 2000, z_out_len - 2000);
    z_out_len = z_out_len - 2000;
  }
  w8(z_out_buf + z_out_len, ch);
  z_out_len = z_out_len + 1;
  w8(z_out_buf + z_out_len, 0);
  if (z_tr_len < 32000) {
    w8(z_tr_buf + z_tr_len, ch);
    z_tr_len = z_tr_len + 1;
    w8(z_tr_buf + z_tr_len, 0);
  }
}

void z_emit_str(int s) {
  int i = 0;
  while (r8(s + i) != 0) {
    z_emit_ch(r8(s + i));
    i = i + 1;
  }
}

void z_emit_num(int v) {
  int sv = z_s16(v);
  hal_itoa(sv, NUM_STR_BUF, 10);
  z_emit_str(NUM_STR_BUF);
}

int z_print_zstr(int addr) {
  int a2 = " \n0123456789.,!?_#'\"/\\-:()";
  int custom_alpha = 0;
  if (z_ver >= 5) custom_alpha = z_u16(0x34);
  int shift = 0;
  int abbrev = 0;
  int zscii_st = 0;
  int zscii_hi = 0;
  int done = 0;
  while (done == 0) {
    int w = z_u16(addr);
    addr = addr + 2;
    if ((w & 0x8000) != 0) done = 1;
    for (int k = 0; k < 3; k++) {
      int zc = 0;
      if (k == 0) zc = (w >>> 10) & 31;
      else if (k == 1) zc = (w >>> 5) & 31;
      else zc = w & 31;
      if (zscii_st == 1) {
        zscii_hi = zc;
        zscii_st = 2;
      } else if (zscii_st == 2) {
        z_emit_ch((zscii_hi << 5) | zc);
        zscii_st = 0;
        shift = 0;
      } else if (abbrev != 0) {
        int aidx = (abbrev - 1) * 32 + zc;
        if (PC_Z_BAD_ABBREV == 1) aidx = aidx + 1;
        int waddr = z_u16(z_abbrev_addr + aidx * 2);
        abbrev = 0;
        shift = 0;
        if (z_abbrev_depth == 0) {
          z_abbrev_depth = 1;
          z_print_zstr(waddr * 2);
          z_abbrev_depth = 0;
        }
      } else if (zc == 0) {
        z_emit_ch(32);
        shift = 0;
      } else if (zc >= 1 && zc <= 3) {
        abbrev = zc;
      } else if (zc == 4) {
        shift = 1;
      } else if (zc == 5) {
        shift = 2;
      } else {
        if (custom_alpha != 0) {
          if (shift == 2 && zc == 6) zscii_st = 1;
          else if (shift == 2 && zc == 7) z_emit_ch(10);
          else z_emit_ch(z_u8(custom_alpha + shift * 26 + (zc - 6)));
        } else if (shift == 0) {
          z_emit_ch(97 + (zc - 6));
        } else if (shift == 1) {
          z_emit_ch(65 + (zc - 6));
        } else {
          if (zc == 6) zscii_st = 1;
          else if (zc == 7) z_emit_ch(10);
          else z_emit_ch(r8(a2 + (zc - 6)));
        }
        shift = 0;
      }
    }
  }
  return addr;
}

// Object table helpers (v3 vs v4+)
int z_obj_ptr(int obj) {
  if (z_ver <= 3) return z_obj_addr + 62 + (obj - 1) * 9;
  return z_obj_addr + 126 + (obj - 1) * 14;
}
int z_obj_parent(int obj) {
  if (obj == 0) return 0;
  int p = z_obj_ptr(obj);
  if (z_ver <= 3) return z_u8(p + 4);
  return z_u16(p + 6);
}
int z_obj_sibling(int obj) {
  if (obj == 0) return 0;
  int p = z_obj_ptr(obj);
  if (z_ver <= 3) return z_u8(p + 5);
  return z_u16(p + 8);
}
int z_obj_child(int obj) {
  if (obj == 0) return 0;
  int p = z_obj_ptr(obj);
  if (z_ver <= 3) return z_u8(p + 6);
  return z_u16(p + 10);
}
void z_set_parent(int obj, int v) {
  int p = z_obj_ptr(obj);
  if (z_ver <= 3) z_w8(p + 4, v);
  else z_w16(p + 6, v);
}
void z_set_sibling(int obj, int v) {
  int p = z_obj_ptr(obj);
  if (z_ver <= 3) z_w8(p + 5, v);
  else z_w16(p + 8, v);
}
void z_set_child(int obj, int v) {
  int p = z_obj_ptr(obj);
  if (z_ver <= 3) z_w8(p + 6, v);
  else z_w16(p + 10, v);
}
int z_obj_prop_addr(int obj) {
  int p = z_obj_ptr(obj);
  if (z_ver <= 3) return z_u16(p + 7);
  return z_u16(p + 12);
}

void z_remove_obj(int obj) {
  if (obj == 0) return;
  int par = z_obj_parent(obj);
  if (par == 0) return;
  int first = z_obj_child(par);
  if (first == obj) {
    z_set_child(par, z_obj_sibling(obj));
  } else {
    int cur = first;
    while (cur != 0) {
      int nxt = z_obj_sibling(cur);
      if (nxt == obj) {
        z_set_sibling(cur, z_obj_sibling(obj));
        break;
      }
      cur = nxt;
    }
  }
  z_set_parent(obj, 0);
  z_set_sibling(obj, 0);
}

void z_insert_obj(int obj, int dest) {
  if (obj == 0) return;
  z_remove_obj(obj);
  if (dest == 0) return;
  int old_ch = z_obj_child(dest);
  z_set_parent(obj, dest);
  if (PC_Z_SWAP_INSERT == 1) {
    z_set_child(obj, old_ch);
    z_set_sibling(dest, obj);
  } else {
    z_set_sibling(obj, old_ch);
    z_set_child(dest, obj);
  }
}

int z_prop_table_first(int obj) {
  int pt = z_obj_prop_addr(obj);
  int nlen = z_u8(pt);
  return pt + 1 + nlen * 2;
}

int z_prop_len_at_data(int data_addr) {
  if (data_addr == 0) return 0;
  int sb = z_u8(data_addr - 1);
  if (z_ver <= 3) return (sb >>> 5) + 1;
  if ((sb & 0x80) != 0) {
    int l = sb & 63;
    if (l == 0) return 64;
    return l;
  }
  if ((sb & 0x40) != 0) return 2;
  return 1;
}

int z_find_prop(int obj, int pnum) {
  if (obj == 0) return 0;
  int p = z_prop_table_first(obj);
  while (1) {
    int sb = z_u8(p);
    if (sb == 0) return 0;
    int pn = 0; int plen = 0; int hlen = 1;
    if (z_ver <= 3) {
      pn = sb & 31;
      plen = (sb >>> 5) + 1;
    } else {
      pn = sb & 63;
      if ((sb & 0x80) != 0) {
        int sb2 = z_u8(p + 1);
        plen = sb2 & 63;
        if (plen == 0) plen = 64;
        hlen = 2;
      } else {
        plen = ((sb >>> 6) & 1) + 1;
      }
    }
    if (pn == pnum) return p + hlen;
    if (pn < pnum) return 0;
    p = p + hlen + plen;
  }
  return 0;
}

int z_next_prop(int obj, int pnum) {
  if (obj == 0) return 0;
  int p = z_prop_table_first(obj);
  if (pnum == 0) {
    int sb0 = z_u8(p);
    if (sb0 == 0) return 0;
    if (z_ver <= 3) return sb0 & 31;
    return sb0 & 63;
  }
  while (1) {
    int sb = z_u8(p);
    if (sb == 0) return 0;
    int pn = 0; int plen = 0; int hlen = 1;
    if (z_ver <= 3) {
      pn = sb & 31; plen = (sb >>> 5) + 1;
    } else {
      pn = sb & 63;
      if ((sb & 0x80) != 0) {
        plen = z_u8(p + 1) & 63; if (plen == 0) plen = 64; hlen = 2;
      } else {
        plen = ((sb >>> 6) & 1) + 1;
      }
    }
    p = p + hlen + plen;
    if (pn == pnum) {
      int nsb = z_u8(p);
      if (nsb == 0) return 0;
      if (z_ver <= 3) return nsb & 31;
      return nsb & 63;
    }
  }
}

int z_is_sep_dict(int daddr, int ch) {
  if (PC_Z_SPACE_ONLY_TOK == 1) return 0;
  int nsep = z_u8(daddr);
  for (int i = 0; i < nsep; i++) {
    if (z_u8(daddr + 1 + i) == ch) return 1;
  }
  return 0;
}

void z_encode_word(int wptr, int wlen, int out_w) {
  int a2 = " \n0123456789.,!?_#'\"/\\-:()";
  int max_zc = 6;
  if (z_ver >= 4) max_zc = 9;
  int zc[9];
  int zi = 0;
  for (int i = 0; i < wlen && zi < max_zc; i++) {
    int ch = r8(wptr + i);
    if (ch >= 65 && ch <= 90) ch = ch + 32;
    if (ch >= 97 && ch <= 122) {
      zc[zi] = ch - 97 + 6; zi = zi + 1;
    } else {
      int found = -1;
      for (int k = 2; k < 26; k++) {
        if (r8(a2 + k) == ch) { found = k + 6; break; }
      }
      if (found >= 0) {
        if (zi < max_zc) { zc[zi] = 5; zi = zi + 1; }
        if (zi < max_zc) { zc[zi] = found; zi = zi + 1; }
      } else {
        if (zi < max_zc) { zc[zi] = 5; zi = zi + 1; }
        if (zi < max_zc) { zc[zi] = 6; zi = zi + 1; }
        if (zi < max_zc) { zc[zi] = (ch >>> 5) & 31; zi = zi + 1; }
        if (zi < max_zc) { zc[zi] = ch & 31; zi = zi + 1; }
      }
    }
  }
  while (zi < max_zc) { zc[zi] = 5; zi = zi + 1; }
  w32(out_w + 0, ((zc[0] & 31) << 10) | ((zc[1] & 31) << 5) | (zc[2] & 31));
  if (z_ver <= 3) {
    w32(out_w + 4, 0x8000 | ((zc[3] & 31) << 10) | ((zc[4] & 31) << 5) | (zc[5] & 31));
    w32(out_w + 8, 0);
  } else {
    w32(out_w + 4, ((zc[3] & 31) << 10) | ((zc[4] & 31) << 5) | (zc[5] & 31));
    w32(out_w + 8, 0x8000 | ((zc[6] & 31) << 10) | ((zc[7] & 31) << 5) | (zc[8] & 31));
  }
}

int z_lookup_word_dict(int daddr, int wptr, int wlen) {
  int ew[3];
  z_encode_word(wptr, wlen, &ew);
  int w0 = ew[0]; int w1 = ew[1]; int w2 = ew[2];
  int nsep = z_u8(daddr);
  int elen = z_u8(daddr + 1 + nsep);
  int nent = z_s16(z_u16(daddr + 2 + nsep));
  int base = daddr + 4 + nsep;
  if (nent < 0) {
    // Unsorted dictionary: linear scan
    int cnt = 0 - nent;
    for (int i = 0; i < cnt; i++) {
      int ea = base + i * elen;
      if (z_u16(ea) == w0 && z_u16(ea + 2) == w1 && (z_ver <= 3 || z_u16(ea + 4) == w2)) return ea;
    }
    return 0;
  }
  int lo = 0;
  int hi = nent - 1;
  while (lo <= hi) {
    int mid = (lo + hi) >> 1;
    int ea = base + mid * elen;
    int e0 = z_u16(ea);
    int e1 = z_u16(ea + 2);
    int e2 = 0;
    if (z_ver >= 4) e2 = z_u16(ea + 4);
    if (e0 == w0 && e1 == w1 && (z_ver <= 3 || e2 == w2)) return ea;
    int lt = 0;
    if (e0 < w0) lt = 1;
    else if (e0 == w0 && e1 < w1) lt = 1;
    else if (z_ver >= 4 && e0 == w0 && e1 == w1 && e2 < w2) lt = 1;
    if (lt == 1) lo = mid + 1;
    else hi = mid - 1;
  }
  return 0;
}

void z_tokenize_ex(int tbuf, int pbuf, int daddr, int flag) {
  if (daddr == 0) daddr = z_dict_addr;
  int max_words = z_u8(pbuf);
  int wcnt = 0;
  int pos = 1;
  int end_pos = 0;
  if (z_ver >= 5) {
    pos = 2;
    end_pos = 2 + z_u8(tbuf + 1);
  }
  while (wcnt < max_words) {
    int ch = 0;
    if (z_ver >= 5) {
      if (pos >= end_pos) break;
      ch = z_u8(tbuf + pos);
    } else {
      ch = z_u8(tbuf + pos);
      if (ch == 0) break;
    }
    if (ch == 32) { pos = pos + 1; continue; }
    int start = pos;
    int wlen = 0;
    if (z_is_sep_dict(daddr, ch) == 1) {
      wlen = 1; pos = pos + 1;
    } else {
      while (1) {
        if (z_ver >= 5 && pos >= end_pos) break;
        int c2 = z_u8(tbuf + pos);
        if ((z_ver < 5 && c2 == 0) || c2 == 32 || z_is_sep_dict(daddr, c2) == 1) break;
        wlen = wlen + 1; pos = pos + 1;
      }
    }
    int found = z_lookup_word_dict(daddr, z_mem + ((tbuf + start) & 0x7FFFF), wlen);
    int pe = pbuf + 2 + wcnt * 4;
    if (flag == 0 || found != 0) {
      z_w16(pe, found);
      z_w8(pe + 2, wlen);
      z_w8(pe + 3, start);
    }
    wcnt = wcnt + 1;
  }
  z_w8(pbuf + 1, wcnt);
}

void z_update_status() {
  if (z_ver > 3) return;
  int loc = z_get_var(16);
  z_stat_score = z_s16(z_get_var(17));
  z_stat_moves = z_s16(z_get_var(18));
  z_stat_room[0] = 0;
  if (loc > 0 && loc < 256) {
    int pt = z_obj_prop_addr(loc);
    if (z_u8(pt) > 0) {
      z_stat_cap_mode = 1;
      z_stat_cap_len = 0;
      z_print_zstr(pt + 1);
      z_stat_cap_mode = 0;
    }
  }
}

int z_dyn_hash() {
  int h = 0x811C9DC5;
  for (int i = 0; i < z_static_base; i++) {
    h = (h ^ r8(z_mem + i)) * 0x01000193;
  }
  return h;
}

int z_screen_hash() {
  int h = 0x811C9DC5;
  h = (h ^ z_upper_lines) * 0x01000193;
  h = (h ^ z_cur_win) * 0x01000193;
  h = (h ^ z_cur_row) * 0x01000193;
  h = (h ^ z_cur_col) * 0x01000193;
  h = (h ^ z_cur_style) * 0x01000193;
  h = (h ^ z_cur_fg) * 0x01000193;
  h = (h ^ z_cur_bg) * 0x01000193;
  for (int r = 0; r < z_upper_lines && r < 16; r++) {
    for (int c = 0; c < Z_SCR_COLS; c++) {
      int idx = r * 40 + c;
      h = (h ^ r8(z_up_chars + idx)) * 0x01000193;
      h = (h ^ r8(z_up_fg + idx)) * 0x01000193;
      h = (h ^ r8(z_up_bg + idx)) * 0x01000193;
      h = (h ^ r8(z_up_style + idx)) * 0x01000193;
    }
  }
  return h;
}

int z_pack_snapshot(int dst_buf, int max_sz, int omit_stack) {
  int st_bytes = z_sp * 2;
  int fr_bytes = (z_fp + 1) * 56;
  int total = 20 + z_static_base + st_bytes + fr_bytes;
  if (total > max_sz) return 0;
  w32(dst_buf + 0, 0x5641535A);
  w32(dst_buf + 4, z_pc);
  w32(dst_buf + 8, z_sp);
  w32(dst_buf + 12, z_fp);
  w32(dst_buf + 16, z_static_base);
  hal_memcpy(dst_buf + 20, z_mem, z_static_base);
  if (omit_stack == 0) {
    if (st_bytes > 0) hal_memcpy(dst_buf + 20 + z_static_base, z_stack, st_bytes);
    hal_memcpy(dst_buf + 20 + z_static_base + st_bytes, z_frames, fr_bytes);
  }
  return total;
}

int z_unpack_snapshot(int src_buf, int sz, int omit_stack) {
  if (sz < 20 || r32(src_buf) != 0x5641535A) return 0;
  int sb = r32(src_buf + 16);
  if (sb != z_static_base) return 0;
  int n_pc = r32(src_buf + 4);
  int n_sp = r32(src_buf + 8);
  int n_fp = r32(src_buf + 12);
  int st_bytes = n_sp * 2;
  int fr_bytes = (n_fp + 1) * 56;
  if (20 + sb + st_bytes + fr_bytes > sz) return 0;
  int old_f2 = z_u16(0x10) & 3;
  hal_memcpy(z_mem, src_buf + 20, sb);
  z_w16(0x10, (z_u16(0x10) & (~3)) | old_f2);
  if (omit_stack == 0) {
    z_sp = n_sp;
    z_fp = n_fp;
    if (st_bytes > 0) hal_memcpy(z_stack, src_buf + 20 + sb, st_bytes);
    hal_memcpy(z_frames, src_buf + 20 + sb + st_bytes, fr_bytes);
  }
  z_pc = n_pc;
  return 1;
}

int z_do_save() {
  int total = z_pack_snapshot(z_sav_buf, 80000, 0);
  if (total <= 0) return 0;
  int rc = -1;
  if (z_is_shelf(z_save_path)) rc = abi_fat_write(z_save_path, z_sav_buf, total);
  else rc = abi_fs_write(z_save_path, z_sav_buf, total);
  if (rc < 0) return 0;
  return 1;
}

int z_do_restore() {
  int sz = -1;
  if (z_is_shelf(z_save_path)) {
    sz = abi_fat_read(z_save_path, z_sav_buf, 80000);
    if (sz < 20) return 0;
    return z_unpack_snapshot(z_sav_buf, sz, PC_Z_RESTORE_NO_STACK);
  }
  int idx = abi_fs_find(z_save_path);
  if (idx < 0) return 0;
  int ptr = abi_fs_data(idx);
  sz = abi_fs_size(idx);
  return z_unpack_snapshot(ptr, sz, PC_Z_RESTORE_NO_STACK);
}

int z_compute_pristine_checksum() {
  int v = z_u8(0x00);
  int mult = 2;
  if (v == 4 || v == 5) mult = 4;
  else if (v >= 7) mult = 8;
  int flen = z_u16(0x1A) * mult;
  if (flen == 0 || flen > z_story_len) flen = z_story_len;
  int sum = 0;
  for (int i = 0x40; i < flen; i++) {
    sum = (sum + r8(z_mem + i)) & 0xFFFF;
  }
  return sum;
}

int z_do_verify() {
  if (z_file_checksum == z_u16(0x1C)) return 1;
  return 0;
}

void z_clear_upper() {
  hal_memset(z_up_chars, 32, 16 * 40);
  hal_memset(z_up_fg, z_cur_fg, 16 * 40);
  hal_memset(z_up_bg, z_cur_bg, 16 * 40);
  hal_memset(z_up_style, 0, 16 * 40);
}

void z_init_header() {
  z_ver = z_u8(0x00);
  z_pc = z_u16(0x06);
  z_dict_addr = z_u16(0x08);
  z_obj_addr = z_u16(0x0A);
  z_glob_addr = z_u16(0x0C);
  z_static_base = z_u16(0x0E);
  z_abbrev_addr = z_u16(0x18);
  z_routine_off = 0;
  z_string_off = 0;
  if (z_ver == 7) {
    z_routine_off = z_u16(0x28) * 8;
    z_string_off = z_u16(0x2A) * 8;
  }
  if (z_ver <= 3) {
    z_stat_is_time = (z_u8(0x01) >>> 1) & 1;
    z_w8(0x01, z_u8(0x01) & (~0x70));
  } else {
    // v4+: bold(4), italic(8), fixed(16), sound(32), timed input(128); v5+: colours(1)
    int f1 = 0xBC;
    if (z_ver >= 5) f1 = f1 | 0x01;
    z_w8(0x01, f1);
    int f2 = z_u16(0x10);
    f2 = f2 & (~0x0148); // clear pictures, mouse, menus
    z_w16(0x10, f2);
    z_w8(0x1E, 6);    // IBM PC interpreter
    z_w8(0x1F, 83);   // 'S'
    z_w8(0x20, Z_SCR_ROWS);
    z_w8(0x21, Z_SCR_COLS);
    if (z_ver >= 5) {
      z_w16(0x22, Z_SCR_COLS);
      z_w16(0x24, Z_SCR_ROWS);
      z_w8(0x26, 1);
      z_w8(0x27, 1);
      z_w8(0x2C, 2); // default bg: black
      z_w8(0x2D, 9); // default fg: white
    }
    z_w16(0x32, 0x0101); // Standard 1.1
  }
}

void z_load_story(int path_str) {
  hal_memset(z_mem, 0, Z_MEM_SIZE);
  int flen = -1;
  if (z_is_shelf(path_str)) {
    if (hal_disk2_info(0) <= 0) {
      z_halted = 1; z_emit_str("No disk in /shelf.\n"); return;
    }
    int fsz = abi_fat_stat(path_str);
    if (fsz < 64) {
      z_halted = 1; z_emit_str("Story not found on /shelf.\n"); return;
    }
    if (fsz > Z_MEM_SIZE) fsz = Z_MEM_SIZE;
    flen = abi_fat_read(path_str, z_mem, fsz);
    if (flen < 64) {
      z_halted = 1; z_emit_str("FAT read error.\n"); return;
    }
  } else {
    int idx = abi_fs_find(path_str);
    if (idx < 0) idx = abi_fs_find("/games/zork1.z3");
    if (idx < 0) {
      z_halted = 1; z_emit_str("Story file not found.\n"); return;
    }
    int fptr = abi_fs_data(idx);
    flen = abi_fs_size(idx);
    if (flen > Z_MEM_SIZE) flen = Z_MEM_SIZE;
    hal_memcpy(z_mem, fptr, flen);
  }
  z_story_len = flen;
  z_file_checksum = z_compute_pristine_checksum();
  z_init_header();
  z_sp = 0;
  z_fp = 0;
  hal_memset(z_frames, 0, 56);
  z_halted = 0;
  z_waiting_read = 0;
  z_in_time = 0;
  z_in_routine = 0;
  z_abbrev_depth = 0;
  z_rng_state = 42;
  z_screen_on = 1;
  z_s3_depth = 0;
  z_has_undo = 0;
  z_upper_lines = 0;
  z_cur_win = 0;
  z_cur_row = 1;
  z_cur_col = 1;
  z_cur_style = 0;
  z_cur_fg = 7;
  z_cur_bg = 0;
  z_z_fg = 9;
  z_z_bg = 2;
  z_cur_font = 1;
  z_clear_upper();
}

void z_decode_op_type(int otype) {
  if (otype == 0) { z_ops[z_op_cnt] = z_fetch16(); z_op_cnt = z_op_cnt + 1; }
  else if (otype == 1) { z_ops[z_op_cnt] = z_fetch8(); z_op_cnt = z_op_cnt + 1; }
  else if (otype == 2) { z_ops[z_op_cnt] = z_get_var(z_fetch8()); z_op_cnt = z_op_cnt + 1; }
}

void z_exec_2op(int op) {
  int a = z_ops[0];
  int b = z_ops[1];
  if (op == 1) {
    int eq = 0;
    for (int i = 1; i < z_op_cnt; i++) { if (a == z_ops[i]) eq = 1; }
    z_branch(eq); return;
  }
  if (op == 2) { z_branch(z_s16(a) < z_s16(b)); return; }
  if (op == 3) { z_branch(z_s16(a) > z_s16(b)); return; }
  if (op == 4) { int v = z_s16(z_get_var_ind(a)) - 1; z_set_var_ind(a, v); z_branch(v < z_s16(b)); return; }
  if (op == 5) { int v = z_s16(z_get_var_ind(a)) + 1; z_set_var_ind(a, v); z_branch(v > z_s16(b)); return; }
  if (op == 6) { z_branch(z_obj_parent(a) == b); return; }
  if (op == 7) { z_branch((a & b) == b); return; }
  if (op == 8) { z_store_res(a | b); return; }
  if (op == 9) { z_store_res(a & b); return; }
  if (op == 10) {
    if (a == 0) { z_branch(0); return; }
    int bo = z_obj_ptr(a) + (b >>> 3);
    z_branch((z_u8(bo) & (128 >>> (b & 7))) != 0); return;
  }
  if (op == 11) {
    if (a != 0) { int bo = z_obj_ptr(a) + (b >>> 3); z_w8(bo, z_u8(bo) | (128 >>> (b & 7))); }
    return;
  }
  if (op == 12) {
    if (a != 0) { int bo = z_obj_ptr(a) + (b >>> 3); z_w8(bo, z_u8(bo) & (~(128 >>> (b & 7)))); }
    return;
  }
  if (op == 13) { z_set_var_ind(a, b); return; }
  if (op == 14) { z_insert_obj(a, b); return; }
  if (op == 15) { z_store_res(z_u16((a + b * 2) & 0xFFFF)); return; }
  if (op == 16) { z_store_res(z_u8((a + b) & 0xFFFF)); return; }
  if (op == 17) {
    int pa = z_find_prop(a, b);
    if (pa == 0) { z_store_res(z_u16(z_obj_addr + (b - 1) * 2)); }
    else {
      int plen = z_prop_len_at_data(pa);
      if (plen == 1) z_store_res(z_u8(pa));
      else z_store_res(z_u16(pa));
    }
    return;
  }
  if (op == 18) { z_store_res(z_find_prop(a, b)); return; }
  if (op == 19) { z_store_res(z_next_prop(a, b)); return; }
  if (op == 20) { z_store_res((a + b) & 0xFFFF); return; }
  if (op == 21) { z_store_res((a - b) & 0xFFFF); return; }
  if (op == 22) { z_store_res((z_s16(a) * z_s16(b)) & 0xFFFF); return; }
  if (op == 23) {
    int sb = z_s16(b);
    if (sb == 0) z_store_res(0);
    else z_store_res((z_s16(a) / sb) & 0xFFFF);
    return;
  }
  if (op == 24) {
    int sb = z_s16(b);
    if (sb == 0) z_store_res(0);
    else z_store_res((z_s16(a) % sb) & 0xFFFF);
    return;
  }
  if (op == 25) { z_do_call(a, 1, 1); return; } // call_2s
  if (op == 26) { z_do_call(a, 1, 0); return; } // call_2n
  if (op == 27) { // set_colour fg bg
    if (a != 0) { z_z_fg = a; z_cur_fg = z_color_to_vga(a, 0); }
    if (b != 0) { z_z_bg = b; z_cur_bg = z_color_to_vga(b, 1); }
    return;
  }
  if (op == 28) { // throw val frame
    z_fp = b;
    z_do_ret(a);
    return;
  }
}

void z_exec_1op(int op) {
  int a = z_ops[0];
  if (op == 0) { z_branch(a == 0); return; }
  if (op == 1) { int s = z_obj_sibling(a); z_store_res(s); z_branch(s != 0); return; }
  if (op == 2) { int c = z_obj_child(a); z_store_res(c); z_branch(c != 0); return; }
  if (op == 3) { z_store_res(z_obj_parent(a)); return; }
  if (op == 4) { z_store_res(z_prop_len_at_data(a)); return; }
  if (op == 5) { z_set_var_ind(a, (z_s16(z_get_var_ind(a)) + 1) & 0xFFFF); return; }
  if (op == 6) { z_set_var_ind(a, (z_s16(z_get_var_ind(a)) - 1) & 0xFFFF); return; }
  if (op == 7) { z_print_zstr(a); return; }
  if (op == 8) { z_do_call(a, 0, 1); return; } // call_1s (v4+)
  if (op == 9) { z_remove_obj(a); return; }
  if (op == 10) {
    if (a != 0) {
      int pt = z_obj_prop_addr(a);
      if (z_u8(pt) > 0) z_print_zstr(pt + 1);
    }
    return;
  }
  if (op == 11) { z_do_ret(a); return; }
  if (op == 12) { z_pc = z_pc + z_s16(a) - 2; return; }
  if (op == 13) { z_print_zstr(z_unpack_string(a)); return; }
  if (op == 14) { z_store_res(z_get_var_ind(a)); return; }
  if (op == 15) {
    if (z_ver <= 4) z_store_res((~a) & 0xFFFF); // not
    else z_do_call(a, 0, 0); // call_1n (v5+)
    return;
  }
}

void z_exec_0op(int op) {
  if (op == 0) { z_do_ret(1); return; }
  if (op == 1) { z_do_ret(0); return; }
  if (op == 2) { z_pc = z_print_zstr(z_pc); return; }
  if (op == 3) { z_pc = z_print_zstr(z_pc); z_emit_ch(10); z_do_ret(1); return; }
  if (op == 4) { return; } // nop
  if (op == 5) { // save (v3 branch, v4 store)
    int ok = z_do_save();
    if (z_ver <= 3) z_branch(ok);
    else z_store_res(ok);
    return;
  }
  if (op == 6) { // restore (v3 branch, v4 store)
    int ok = z_do_restore();
    if (z_ver <= 3) {
      if (ok == 1) z_branch(1);
      else z_branch(0);
    } else {
      if (ok == 1) z_store_res(2);
      else z_store_res(0);
    }
    return;
  }
  if (op == 7) { // restart
    int old_f2 = z_u16(0x10) & 3;
    z_load_story(z_story_path);
    z_w16(0x10, (z_u16(0x10) & (~3)) | old_f2);
    return;
  }
  if (op == 8) { z_do_ret(z_pop()); return; }
  if (op == 9) {
    if (z_ver <= 4) z_pop();
    else z_store_res(z_fp); // catch (v5+)
    return;
  }
  if (op == 10) { z_halted = 1; return; }
  if (op == 11) { z_emit_ch(10); return; }
  if (op == 12) { z_update_status(); return; }
  if (op == 13) { z_branch(z_do_verify()); return; }
  if (op == 15) { z_branch(1); return; } // piracy (v5+)
}

void z_exec_ext(int op) {
  if (op == 0) { // save (v5+)
    if (z_do_save() == 1) z_store_res(1);
    else z_store_res(0);
    return;
  }
  if (op == 1) { // restore (v5+)
    if (z_do_restore() == 1) z_store_res(2);
    else z_store_res(0);
    return;
  }
  if (op == 2) { // log_shift
    int n = z_ops[0] & 0xFFFF;
    int pl = z_s16(z_ops[1]);
    if (pl >= 0) z_store_res((n << pl) & 0xFFFF);
    else z_store_res((n >>> (0 - pl)) & 0xFFFF);
    return;
  }
  if (op == 3) { // art_shift
    int n = z_s16(z_ops[0]);
    int pl = z_s16(z_ops[1]);
    if (pl >= 0) z_store_res((n << pl) & 0xFFFF);
    else z_store_res((n >> (0 - pl)) & 0xFFFF);
    return;
  }
  if (op == 4) { // set_font
    int f = z_ops[0];
    int prev = z_cur_font;
    if (f == 0) { z_store_res(prev); return; }
    if (f == 1 || f == 4) { z_cur_font = f; z_store_res(prev); }
    else z_store_res(0);
    return;
  }
  if (op == 9) { // save_undo
    int sz = z_pack_snapshot(z_undo_buf, 80000, PC_Z_UNDO_NO_STACK);
    if (sz > 0) { z_has_undo = sz; z_store_res(1); }
    else z_store_res(0);
    return;
  }
  if (op == 10) { // restore_undo
    if (z_has_undo > 0) {
      if (z_unpack_snapshot(z_undo_buf, z_has_undo, PC_Z_UNDO_NO_STACK) == 1) {
        z_store_res(2);
        return;
      }
    }
    z_store_res(0);
    return;
  }
  if (op == 11) { // print_unicode
    z_emit_ch(z_unicode_to_ascii(z_ops[0]));
    return;
  }
  if (op == 12) { // check_unicode
    int uc = z_ops[0];
    if (uc >= 32 && uc <= 126) z_store_res(3);
    else if (uc >= 160 && uc <= 0x17F) z_store_res(1);
    else z_store_res(0);
    return;
  }
  if (op == 13) { // set_true_colour fg bg
    int fg = z_s16(z_ops[0]);
    int bg = z_s16(z_ops[1]);
    if (fg == -2) z_cur_fg = 7;
    else if (fg >= 0) z_cur_fg = z_true_to_vga(fg);
    if (bg == -2) z_cur_bg = 0;
    else if (bg >= 0) z_cur_bg = z_true_to_vga(bg);
    return;
  }
}

void z_exec_var(int op) {
  if (op == 0 || op == 12) { // call_vs / call_vs2
    z_do_call(z_ops[0], z_op_cnt - 1, 1);
    return;
  }
  if (op == 25 || op == 26) { // call_vn / call_vn2
    z_do_call(z_ops[0], z_op_cnt - 1, 0);
    return;
  }
  if (op == 1) { z_w16((z_ops[0] + z_ops[1] * 2) & 0xFFFF, z_ops[2]); return; }
  if (op == 2) { z_w8((z_ops[0] + z_ops[1]) & 0xFFFF, z_ops[2]); return; }
  if (op == 3) {
    int pa = z_find_prop(z_ops[0], z_ops[1]);
    if (pa != 0) {
      int plen = z_prop_len_at_data(pa);
      if (plen == 1) z_w8(pa, z_ops[2]);
      else z_w16(pa, z_ops[2]);
    }
    return;
  }
  if (op == 4) { // sread / aread
    z_update_status();
    z_read_tbuf = z_ops[0];
    z_read_pbuf = 0;
    if (z_op_cnt >= 2) z_read_pbuf = z_ops[1];
    z_in_time = 0; z_in_routine = 0;
    if (z_ver >= 4 && z_op_cnt >= 4 && z_ops[2] > 0 && z_ops[3] != 0) {
      z_in_time = z_ops[2];
      z_in_routine = z_ops[3];
      z_in_t0 = hal_time();
    }
    z_waiting_read = 1;
    z_prompt_cnt = z_prompt_cnt + 1;
    w32(VMRAM_STATUS + 0x58, z_dyn_hash());
    w32(VMRAM_STATUS + 0x5C, z_prompt_cnt);
    w32(VMRAM_STATUS + 0x60, z_screen_hash());
    if (z_transcript_on == 1 && z_tr_len > 0) {
      abi_fs_write("/home/zork.log", z_tr_buf, z_tr_len);
    }
    return;
  }
  if (op == 5) { z_emit_ch(z_ops[0]); return; }
  if (op == 6) { z_emit_num(z_ops[0]); return; }
  if (op == 7) {
    int r = z_s16(z_ops[0]);
    if (r < 0) {
      z_rng_state = 0 - r;
      if (z_rng_state == 0) z_rng_state = 1;
      z_store_res(0);
    } else if (r == 0) {
      z_rng_state = hal_time() | 1;
      z_store_res(0);
    } else {
      z_rng_state = (z_rng_state * 1103515245 + 12345) & 0x7FFFFFFF;
      z_store_res(1 + ((z_rng_state >>> 16) % r));
    }
    return;
  }
  if (op == 8) { z_push(z_ops[0]); return; }
  if (op == 9) { z_set_var_ind(z_ops[0], z_pop()); return; }
  if (op == 10) { // split_window lines
    int lines = z_ops[0];
    if (lines > Z_SCR_ROWS - 1) lines = Z_SCR_ROWS - 1;
    if (lines < 0) lines = 0;
    if (PC_Z_UPPER_NO_RESERVE == 0) {
      z_upper_lines = lines;
      if (z_ver == 3) z_clear_upper();
    }
    return;
  }
  if (op == 11) { // set_window window
    z_cur_win = z_ops[0] & 1;
    if (z_cur_win == 1) { z_cur_row = 1; z_cur_col = 1; }
    return;
  }
  if (op == 13) { // erase_window window
    int win = z_s16(z_ops[0]);
    if (win == -1) {
      z_upper_lines = 0; z_cur_win = 0; z_cur_row = 1; z_cur_col = 1;
      z_clear_upper(); z_out_len = 0; w8(z_out_buf, 0);
    } else if (win == -2) {
      z_clear_upper(); z_out_len = 0; w8(z_out_buf, 0);
    } else if (win == 0) {
      z_out_len = 0; w8(z_out_buf, 0);
    } else if (win == 1) {
      z_clear_upper(); z_cur_row = 1; z_cur_col = 1;
    }
    return;
  }
  if (op == 14) { // erase_line value
    if (z_ops[0] == 1 && z_cur_win == 1 && z_cur_row >= 1 && z_cur_row <= 16) {
      for (int c = z_cur_col - 1; c < Z_SCR_COLS; c++) {
        if (c >= 0) {
          int idx = (z_cur_row - 1) * 40 + c;
          w8(z_up_chars + idx, 32);
          w8(z_up_fg + idx, z_cur_fg);
          w8(z_up_bg + idx, z_cur_bg);
          w8(z_up_style + idx, 0);
        }
      }
    }
    return;
  }
  if (op == 15) { // set_cursor line col
    if (z_cur_win == 1) {
      z_cur_row = z_ops[0];
      z_cur_col = z_ops[1];
      if (z_cur_row < 1) z_cur_row = 1;
      if (z_cur_col < 1) z_cur_col = 1;
    }
    return;
  }
  if (op == 16) { // get_cursor array
    z_w16(z_ops[0], z_cur_row);
    z_w16(z_ops[0] + 2, z_cur_col);
    return;
  }
  if (op == 17) { // set_text_style
    int st = z_ops[0];
    if (st == 0) z_cur_style = 0;
    else z_cur_style = z_cur_style | st;
    return;
  }
  if (op == 18) { return; } // buffer_mode
  if (op == 19) { // output_stream
    int s = z_s16(z_ops[0]);
    if (s == 1) z_screen_on = 1;
    else if (s == -1) z_screen_on = 0;
    else if (s == 2) { z_transcript_on = 1; z_w16(0x10, z_u16(0x10) | 1); }
    else if (s == -2) {
      if (z_transcript_on == 1 && z_tr_len > 0) abi_fs_write("/home/zork.log", z_tr_buf, z_tr_len);
      z_transcript_on = 0;
      z_w16(0x10, z_u16(0x10) & (~1));
    } else if (s == 3 && z_op_cnt >= 2 && z_s3_depth < 16) {
      int slot = z_s3_tab + z_s3_depth * 8;
      w32(slot + 0, z_ops[1]);
      w32(slot + 4, 0);
      z_s3_depth = z_s3_depth + 1;
    } else if (s == -3 && z_s3_depth > 0) {
      z_s3_depth = z_s3_depth - 1;
      int slot = z_s3_tab + z_s3_depth * 8;
      z_w16(r32(slot + 0), r32(slot + 4));
    }
    return;
  }
  if (op == 20) { return; } // input_stream
  if (op == 21) { // sound_effect
    int num = 1;
    if (z_op_cnt >= 1) num = z_ops[0];
    if (num == 1) abi_audio_tone(880, 80);
    else if (num == 2) abi_audio_tone(220, 100);
    return;
  }
  if (op == 22) { // read_char 1 [time routine]
    z_in_time = 0; z_in_routine = 0;
    if (z_ver >= 4 && z_op_cnt >= 3 && z_ops[1] > 0 && z_ops[2] != 0) {
      z_in_time = z_ops[1];
      z_in_routine = z_ops[2];
      z_in_t0 = hal_time();
    }
    z_waiting_read = 2;
    z_prompt_cnt = z_prompt_cnt + 1;
    w32(VMRAM_STATUS + 0x58, z_dyn_hash());
    w32(VMRAM_STATUS + 0x5C, z_prompt_cnt);
    w32(VMRAM_STATUS + 0x60, z_screen_hash());
    return;
  }
  if (op == 23) { // scan_table x table len [form]
    int xval = z_ops[0];
    int tab = z_ops[1];
    int len = z_ops[2];
    int form = 0x82;
    if (z_op_cnt >= 4) form = z_ops[3];
    int is_word = (form >>> 7) & 1;
    int elen = form & 0x7F;
    if (elen == 0) elen = 2;
    int found = 0;
    for (int i = 0; i < len; i++) {
      int ea = tab + i * elen;
      int v = 0;
      if (is_word == 1) v = z_u16(ea);
      else v = z_u8(ea);
      if (v == xval) { found = ea; break; }
    }
    z_store_res(found);
    z_branch(found != 0);
    return;
  }
  if (op == 24) { z_store_res((~z_ops[0]) & 0xFFFF); return; } // not (v5+)
  if (op == 27) { // tokenise text parse [dict flag]
    int daddr = 0; int flg = 0;
    if (z_op_cnt >= 3) daddr = z_ops[2];
    if (z_op_cnt >= 4) flg = z_ops[3];
    z_tokenize_ex(z_ops[0], z_ops[1], daddr, flg);
    return;
  }
  if (op == 28) { // encode_text zscii-text length from coded-text
    int ew[3];
    z_encode_word(z_mem + ((z_ops[0] + z_ops[2]) & 0x7FFFF), z_ops[1], &ew);
    z_w16(z_ops[3] + 0, ew[0]);
    z_w16(z_ops[3] + 2, ew[1]);
    z_w16(z_ops[3] + 4, ew[2]);
    return;
  }
  if (op == 29) { // copy_table first second size
    int src = z_ops[0];
    int dst = z_ops[1];
    int sz = z_s16(z_ops[2]);
    if (dst == 0) {
      int n = sz; if (n < 0) n = 0 - n;
      for (int i = 0; i < n; i++) z_w8(src + i, 0);
    } else if (sz < 0) {
      int n = 0 - sz;
      for (int i = 0; i < n; i++) z_w8(dst + i, z_u8(src + i));
    } else if (sz > 0) {
      if (dst > src && dst < src + sz) {
        for (int i = sz - 1; i >= 0; i--) z_w8(dst + i, z_u8(src + i));
      } else {
        for (int i = 0; i < sz; i++) z_w8(dst + i, z_u8(src + i));
      }
    }
    return;
  }
  if (op == 30) { // print_table zscii-text width [height skip]
    int addr = z_ops[0];
    int width = z_ops[1];
    int height = 1;
    int skip = 0;
    if (z_op_cnt >= 3) height = z_ops[2];
    if (z_op_cnt >= 4) skip = z_ops[3];
    int start_col = z_cur_col;
    for (int r = 0; r < height; r++) {
      if (r > 0) {
        if (z_cur_win == 1) { z_cur_row = z_cur_row + 1; z_cur_col = start_col; }
        else z_emit_ch(10);
      }
      for (int c = 0; c < width; c++) {
        z_emit_ch(z_u8(addr));
        addr = addr + 1;
      }
      addr = addr + skip;
    }
    return;
  }
  if (op == 31) { // check_arg_count
    int arg_cnt = r32(z_frames + z_fp * 56 + 16);
    z_branch(z_ops[0] <= arg_cnt);
    return;
  }
}

void z_step_one() {
  int b = z_fetch8();
  z_op_cnt = 0;
  if (b == 0xBE && z_ver >= 5) {
    int eop = z_fetch8();
    int tb = z_fetch8();
    for (int i = 0; i < 4; i++) {
      int ot = (tb >>> (6 - i * 2)) & 3;
      if (ot == 3) break;
      z_decode_op_type(ot);
    }
    z_exec_ext(eop);
    return;
  }
  if (b >= 0xC0) {
    int op = b & 31;
    int is_var = (b & 0x20) != 0;
    int tb1 = z_fetch8();
    int tb2 = 0xFF;
    if (is_var == 1 && (op == 12 || op == 26)) tb2 = z_fetch8();
    for (int i = 0; i < 4; i++) {
      int ot = (tb1 >>> (6 - i * 2)) & 3;
      if (ot == 3) break;
      z_decode_op_type(ot);
    }
    if (is_var == 1 && (op == 12 || op == 26)) {
      for (int i = 0; i < 4; i++) {
        int ot = (tb2 >>> (6 - i * 2)) & 3;
        if (ot == 3) break;
        z_decode_op_type(ot);
      }
    }
    if (is_var == 0) z_exec_2op(op);
    else z_exec_var(op);
  } else if (b >= 0x80) {
    int ot = (b >>> 4) & 3;
    if (ot == 3) {
      z_exec_0op(b & 15);
    } else {
      z_decode_op_type(ot);
      z_exec_1op(b & 15);
    }
  } else {
    int t0 = 1; if ((b & 0x40) != 0) t0 = 2;
    int t1 = 1; if ((b & 0x20) != 0) t1 = 2;
    z_decode_op_type(t0);
    z_decode_op_type(t1);
    z_exec_2op(b & 31);
  }
}

void z_step_until_input() {
  int budget = 50000;
  while (z_halted == 0 && z_waiting_read == 0 && budget > 0) {
    budget = budget - 1;
    z_step_one();
  }
}

int z_run_timed_interrupt() {
  int saved_pc = z_pc;
  int saved_wait = z_waiting_read;
  z_waiting_read = 0;
  z_intr_done = 0;
  z_intr_ret = 0;
  int raddr = z_unpack_routine(z_in_routine);
  z_fp = z_fp + 1;
  int f = z_frames + z_fp * 56;
  w32(f + 0, -1);
  w32(f + 4, -1);
  w32(f + 8, z_sp);
  z_pc = raddr;
  int nloc = z_fetch8();
  if (nloc > 15) nloc = 15;
  w32(f + 12, nloc);
  w32(f + 16, 0);
  for (int i = 0; i < nloc; i++) {
    int defv = 0;
    if (z_ver <= 4) defv = z_fetch16();
    w16(f + 20 + i * 2, defv & 0xFFFF);
  }
  int budget = 20000;
  while (z_halted == 0 && z_intr_done == 0 && budget > 0) {
    budget = budget - 1;
    z_step_one();
  }
  z_pc = saved_pc;
  z_waiting_read = saved_wait;
  return z_intr_ret;
}

void z_submit_line() {
  if (z_waiting_read != 1) return;
  z_in_buf[z_in_len] = 0;
  // Built-in meta-command: /savepath <path> lets player choose SpiralFS or /shelf save file
  if (z_in_len > 10 && r8(&z_in_buf + 0) == 47 && r8(&z_in_buf + 1) == 115 && r8(&z_in_buf + 2) == 97 && r8(&z_in_buf + 3) == 118 && r8(&z_in_buf + 4) == 101 && r8(&z_in_buf + 5) == 112 && r8(&z_in_buf + 6) == 97 && r8(&z_in_buf + 7) == 116 && r8(&z_in_buf + 8) == 104 && r8(&z_in_buf + 9) == 32) {
    hal_memset(z_save_path, 0, 128);
    int nl = z_in_len - 10; if (nl > 120) nl = 120;
    hal_memcpy(z_save_path, &z_in_buf + 10, nl);
    z_emit_str("[Save path set to "); z_emit_str(z_save_path); z_emit_str("]\n");
    z_in_len = 0; z_in_buf[0] = 0;
    return;
  }
  if (z_in_len > 0) {
    int slot = z_hist_cnt & 15;
    hal_memset(z_hist_buf + slot * 64, 0, 64);
    hal_memcpy(z_hist_buf + slot * 64, z_in_buf, z_in_len);
    z_hist_cnt = z_hist_cnt + 1;
    z_hist_pos = z_hist_cnt;
  }
  for (int i = 0; i < z_in_len; i++) z_emit_ch(z_in_buf[i]);
  z_emit_ch(10);
  int max_ch = z_u8(z_read_tbuf);
  int n = z_in_len;
  if (n > max_ch) n = max_ch;
  if (z_ver >= 5) {
    z_w8(z_read_tbuf + 1, n);
    for (int j = 0; j < n; j++) {
      int c = z_in_buf[j];
      if (c >= 65 && c <= 90) c = c + 32;
      z_w8(z_read_tbuf + 2 + j, c);
    }
    if (z_read_pbuf != 0) z_tokenize_ex(z_read_tbuf, z_read_pbuf, 0, 0);
    z_store_res(13);
  } else {
    for (int j = 0; j < n; j++) {
      int c = z_in_buf[j];
      if (c >= 65 && c <= 90) c = c + 32;
      z_w8(z_read_tbuf + 1 + j, c);
    }
    z_w8(z_read_tbuf + 1 + n, 0);
    if (z_read_pbuf != 0) z_tokenize_ex(z_read_tbuf, z_read_pbuf, 0, 0);
  }
  z_in_len = 0;
  z_in_buf[0] = 0;
  z_waiting_read = 0;
  z_in_time = 0;
  z_step_until_input();
}

void app_init(int abi, int arg0) {
  if (arg0 == -1) {
    if (z_tr_len > 0) abi_fs_write("/home/zork.log", z_tr_buf, z_tr_len);
    if (z_mem != 0) abi_heap_free(z_mem);
    if (z_stack != 0) abi_heap_free(z_stack);
    if (z_frames != 0) abi_heap_free(z_frames);
    if (z_out_buf != 0) abi_heap_free(z_out_buf);
    if (z_tr_buf != 0) abi_heap_free(z_tr_buf);
    if (z_hist_buf != 0) abi_heap_free(z_hist_buf);
    if (z_sav_buf != 0) abi_heap_free(z_sav_buf);
    if (z_undo_buf != 0) abi_heap_free(z_undo_buf);
    if (z_up_chars != 0) abi_heap_free(z_up_chars);
    if (z_up_fg != 0) abi_heap_free(z_up_fg);
    if (z_up_bg != 0) abi_heap_free(z_up_bg);
    if (z_up_style != 0) abi_heap_free(z_up_style);
    if (z_s3_tab != 0) abi_heap_free(z_s3_tab);
    z_mem = 0;
    return;
  }
  z_mem = abi_heap_alloc(Z_MEM_SIZE);
  z_stack = abi_heap_alloc(4096);
  z_frames = abi_heap_alloc(64 * 56);
  z_out_buf = abi_heap_alloc(8192);
  z_tr_buf = abi_heap_alloc(32768);
  z_hist_buf = abi_heap_alloc(16 * 64);
  z_sav_buf = abi_heap_alloc(80000);
  z_undo_buf = abi_heap_alloc(80000);
  z_up_chars = abi_heap_alloc(16 * 40);
  z_up_fg = abi_heap_alloc(16 * 40);
  z_up_bg = abi_heap_alloc(16 * 40);
  z_up_style = abi_heap_alloc(16 * 40);
  z_s3_tab = abi_heap_alloc(16 * 8);
  z_out_len = 0;
  z_tr_len = 0;
  z_transcript_on = 0;
  z_prompt_cnt = 0;
  z_in_len = 0;
  z_hist_cnt = 0;
  z_hist_pos = 0;
  hal_memset(z_save_path, 0, 128);
  hal_memcpy(z_save_path, "/home/zork.sav", 14);
  hal_memset(z_story_path, 0, 128);
  int sp = arg0;
  if (sp == 0 && r8(APP_LAUNCH_PATH_BUF) != 0) sp = APP_LAUNCH_PATH_BUF;
  if (sp != 0 && r8(sp) != 0) {
    int plen = hal_strlen(sp);
    if (plen > 124) plen = 124;
    hal_memcpy(z_story_path, sp, plen);
  } else {
    hal_memcpy(z_story_path, "/games/zork1.z3", 15);
  }
  abi_set_tick(20, 50);
  z_load_story(z_story_path);
  z_step_until_input();
}

void app_draw(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  gui_reg_ctl(4, h - 14, w - 8, 11, 0);
  int ty = y + 14;
  int th = h - 30;
  if (z_ver <= 3 && z_upper_lines == 0) {
    hal_rect(x + 4, y + 14, w - 8, 10, 1);
    gui_str_clip(x + 6, y + 15, z_stat_room, (w - 86) / 8, 15, -1);
    wstr(w - 78, 15, "S:", 14);
    wnum(w - 62, 15, z_stat_score, 15);
    wstr(w - 38, 15, "M:", 14);
    wnum(w - 22, 15, z_stat_moves, 15);
    ty = y + 25;
    th = h - 41;
  }
  hal_rect(x + 4, ty, w - 8, th, z_cur_bg);
  int cols = (w - 12) / 8;
  int tot_rows = th / 9;
  if (cols < 8) cols = 8;
  if (tot_rows < 1) tot_rows = 1;

  // Draw upper window (if split)
  int up_r = z_upper_lines;
  if (up_r > tot_rows - 1) up_r = tot_rows - 1;
  if (up_r > 0) {
    for (int ur = 0; ur < up_r; ur++) {
      for (int uc = 0; uc < cols && uc < Z_SCR_COLS; uc++) {
        int idx = ur * 40 + uc;
        int ch = r8(z_up_chars + idx);
        int fg = r8(z_up_fg + idx);
        int bg = r8(z_up_bg + idx);
        int st = r8(z_up_style + idx);
        if ((st & 1) != 0) { int t = fg; fg = bg; bg = t; }
        if ((st & 2) != 0 && fg < 8) fg = fg + 8;
        hal_rect(x + 6 + uc * 8, ty + 1 + ur * 9, 8, 9, bg);
        if (ch > 32) hal_char(x + 6 + uc * 8, ty + 1 + ur * 9, ch, fg, -1, 0);
      }
    }
  }

  // Draw lower window below reserved upper window lines
  int low_ty = ty + up_r * 9;
  int rows = tot_rows - up_r;
  if (rows < 1) rows = 1;
  int lstart[24];
  int llen[24];
  int lcnt = 0;
  int p = 0;
  while (p < z_out_len) {
    int ls = p;
    int ll = 0;
    while (p < z_out_len && ll < cols && r8(z_out_buf + p) != 10) {
      p = p + 1; ll = ll + 1;
    }
    if (p < z_out_len && r8(z_out_buf + p) == 10) p = p + 1;
    if (lcnt < 24) {
      lstart[lcnt] = ls; llen[lcnt] = ll; lcnt = lcnt + 1;
    } else {
      for (int s = 0; s < 23; s++) { lstart[s] = lstart[s + 1]; llen[s] = llen[s + 1]; }
      lstart[23] = ls; llen[23] = ll;
    }
  }
  int first = lcnt - rows;
  if (first < 0) first = 0;
  int dfg = z_cur_fg;
  if ((z_cur_style & 2) != 0 && dfg < 8) dfg = dfg + 8;
  for (int r = 0; r < rows && first + r < lcnt; r++) {
    int ls2 = lstart[first + r];
    int ll2 = llen[first + r];
    for (int c = 0; c < ll2; c++) {
      hal_char(x + 6 + c * 8, low_ty + 1 + r * 9, r8(z_out_buf + ls2 + c), dfg, -1, 0);
    }
  }
  hal_rect(x + 4, y + h - 14, w - 8, 11, 16);
  hal_str(x + 6, y + h - 12, ">", 10, -1);
  z_in_buf[z_in_len] = 0;
  gui_str_clip(x + 14, y + h - 12, z_in_buf, cols - 2, 15, -1);
  if (gui_caret_on()) {
    int cx = x + 14 + z_in_len * 8;
    if (cx < x + w - 8) hal_rect(cx, y + h - 12, 2, 8, 14);
  }
}

void app_click(int wid, int rx, int ry) {
}

void app_key(int ascii, int vk, int mods) {
  if (z_halted != 0) return;
  if (z_waiting_read == 2) {
    // @read_char mode
    int zc = ascii;
    if (vk == 38) zc = 129;
    else if (vk == 40) zc = 130;
    else if (vk == 37) zc = 131;
    else if (vk == 39) zc = 132;
    else if (ascii == 8 || vk == 8) zc = 8;
    else if (ascii == 13) zc = 13;
    else if (vk == 27) zc = 27;
    if (zc == 0) return;
    z_waiting_read = 0;
    z_in_time = 0;
    z_store_res(zc);
    z_step_until_input();
    return;
  }
  if (vk == 38) {
    if (z_hist_cnt > 0 && z_hist_pos > 0) {
      z_hist_pos = z_hist_pos - 1;
      int slot = z_hist_pos & 15;
      int hp = z_hist_buf + slot * 64;
      z_in_len = hal_strlen(hp);
      if (z_in_len > 62) z_in_len = 62;
      hal_memcpy(z_in_buf, hp, z_in_len);
      z_in_buf[z_in_len] = 0;
    }
    return;
  }
  if (vk == 40) {
    if (z_hist_pos + 1 < z_hist_cnt) {
      z_hist_pos = z_hist_pos + 1;
      int slot = z_hist_pos & 15;
      int hp = z_hist_buf + slot * 64;
      z_in_len = hal_strlen(hp);
      if (z_in_len > 62) z_in_len = 62;
      hal_memcpy(z_in_buf, hp, z_in_len);
      z_in_buf[z_in_len] = 0;
    } else {
      z_hist_pos = z_hist_cnt;
      z_in_len = 0;
      z_in_buf[0] = 0;
    }
    return;
  }
  if (ascii == 13) { z_submit_line(); return; }
  if (ascii == 8 || vk == 8) {
    if (z_in_len > 0) { z_in_len = z_in_len - 1; z_in_buf[z_in_len] = 0; }
    return;
  }
  if (ascii >= 32 && ascii < 127 && z_in_len < 60) {
    z_in_buf[z_in_len] = ascii;
    z_in_len = z_in_len + 1;
    z_in_buf[z_in_len] = 0;
  }
}

void app_tick() {
  if (z_halted != 0) return;
  if (z_waiting_read != 0 && z_in_time > 0 && z_in_routine != 0) {
    if ((hal_time() - z_in_t0) >= z_in_time * 100) {
      z_in_t0 = hal_time();
      int stop = z_run_timed_interrupt();
      if (stop != 0) {
        int was = z_waiting_read;
        z_waiting_read = 0;
        z_in_time = 0;
        if (was == 2) {
          z_store_res(0);
        } else if (was == 1) {
          if (z_ver >= 5) {
            z_w8(z_read_tbuf + 1, 0);
            z_store_res(0);
          } else {
            z_w8(z_read_tbuf + 1, 0);
          }
        }
        z_step_until_input();
      }
    }
    return;
  }
  if (z_waiting_read == 0) z_step_until_input();
}
