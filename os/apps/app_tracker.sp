// ============================================================================
// SpiralOS 1.7 "Bring Your Own" — 4-Channel ProTracker MOD Player (/apps/tracker.spir)
// Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Plays standard 4-channel ProTracker .MOD files (M.K., 4CHN, M!K!, FLT4)
// from SpiralFS or /shelf through the OS 8-channel PCM mixer.
// Supported effects: 0xy Arpeggio, 1xx Porta Up, 2xx Porta Down, 3xx Tone Porta,
// 4xy Vibrato, 9xx Sample Offset, Axy Volume Slide, Bxx Position Jump,
// Cxx Set Volume, Dxx Pattern Break, ECx Note Cut, EDx Note Delay, Fxx Speed/BPM.
// ============================================================================

import "/src/app_abi.sp";

int g_mod_buf;
int g_mod_len;
int g_mod_loaded;
int g_playing;
int g_loop_song;
int g_song_len;
int g_num_pats;
int g_order;
int g_row;
int g_tick;
int g_speed;
int g_bpm;
int g_pat_jump;
int g_pat_break;
int g_smp_info; // heap: 32 * 16 bytes (ptr, len, vol, loop_start, loop_len -> 20 B each = 640 B)
int g_ch_st;    // heap: 4 * 48 bytes = 192 B
int g_path_buf; // heap: 128 B
int g_err_msg;  // heap: 64 B

// Standard ProTracker 36-note period table (C-1 .. B-3)
int mod_period_at(int idx) {
  if (idx < 0) idx = 0;
  if (idx > 35) idx = 35;
  int p = 856;
  if (idx == 0) p = 856; else if (idx == 1) p = 808; else if (idx == 2) p = 762;
  else if (idx == 3) p = 720; else if (idx == 4) p = 678; else if (idx == 5) p = 640;
  else if (idx == 6) p = 604; else if (idx == 7) p = 570; else if (idx == 8) p = 538;
  else if (idx == 9) p = 508; else if (idx == 10) p = 480; else if (idx == 11) p = 453;
  else if (idx == 12) p = 428; else if (idx == 13) p = 404; else if (idx == 14) p = 381;
  else if (idx == 15) p = 360; else if (idx == 16) p = 339; else if (idx == 17) p = 320;
  else if (idx == 18) p = 302; else if (idx == 19) p = 285; else if (idx == 20) p = 269;
  else if (idx == 21) p = 254; else if (idx == 22) p = 240; else if (idx == 23) p = 226;
  else if (idx == 24) p = 214; else if (idx == 25) p = 202; else if (idx == 26) p = 190;
  else if (idx == 27) p = 180; else if (idx == 28) p = 170; else if (idx == 29) p = 160;
  else if (idx == 30) p = 151; else if (idx == 31) p = 143; else if (idx == 32) p = 135;
  else if (idx == 33) p = 127; else if (idx == 34) p = 120; else if (idx == 35) p = 113;
  return p;
}

int mod_find_note_idx(int per) {
  int best = 0;
  int bdiff = 9999;
  for (int i = 0; i < 36; i++) {
    int d = mod_period_at(i) - per;
    if (d < 0) d = 0 - d;
    if (d < bdiff) { bdiff = d; best = i; }
  }
  return best;
}

// 32-entry ProTracker sine table (0..255)
int mod_sine(int pos) {
  int i = pos & 31;
  if (i == 0) return 0; if (i == 1) return 24; if (i == 2) return 49; if (i == 3) return 74;
  if (i == 4) return 97; if (i == 5) return 120; if (i == 6) return 141; if (i == 7) return 161;
  if (i == 8) return 180; if (i == 9) return 197; if (i == 10) return 212; if (i == 11) return 224;
  if (i == 12) return 235; if (i == 13) return 244; if (i == 14) return 250; if (i == 15) return 253;
  if (i == 16) return 255; if (i == 17) return 253; if (i == 18) return 250; if (i == 19) return 244;
  if (i == 20) return 235; if (i == 21) return 224; if (i == 22) return 212; if (i == 23) return 197;
  if (i == 24) return 180; if (i == 25) return 161; if (i == 26) return 141; if (i == 27) return 120;
  if (i == 28) return 97; if (i == 29) return 74; if (i == 30) return 49;
  return 24;
}

int mod_per_to_step(int per) {
  if (per < 113) per = 113;
  if (per > 856) per = 856;
  int rate = 3546895 / per;
  return (rate << 16) / 22050;
}

int mod_ch_pan(int ch) {
  if (ch == 0 || ch == 3) return 64;
  return 192;
}

int mod_rd16be(int p) {
  return (r8(p) << 8) | r8(p + 1);
}

void mod_set_err(int s) {
  if (g_err_msg == 0) return;
  hal_memset(g_err_msg, 0, 64);
  int n = hal_strlen(s);
  if (n > 60) n = 60;
  hal_memcpy(g_err_msg, s, n);
}

int mod_is_shelf(int p) {
  if (r8(p) == 47 && r8(p + 1) == 115 && r8(p + 2) == 104 && r8(p + 3) == 101 && r8(p + 4) == 108 && r8(p + 5) == 102 && (r8(p + 6) == 47 || r8(p + 6) == 0)) return 1;
  return 0;
}

void mod_stop() {
  g_playing = 0;
  for (int c = 0; c < 4; c++) abi_audio_ch_stop(c);
}

int mod_load_file(int path_str) {
  mod_stop();
  g_mod_loaded = 0;
  if (g_mod_buf != 0) { abi_heap_free(g_mod_buf); g_mod_buf = 0; g_mod_len = 0; }
  if (path_str == 0 || r8(path_str) == 0) { mod_set_err("No MOD file specified"); return -1; }
  hal_memset(g_path_buf, 0, 128);
  int pl = hal_strlen(path_str); if (pl > 124) pl = 124;
  hal_memcpy(g_path_buf, path_str, pl);

  int fsz = -1;
  int buf = 0;
  if (mod_is_shelf(path_str)) {
    if (hal_disk2_info(0) <= 0) { mod_set_err("No disk in /shelf"); return -1; }
    fsz = abi_fat_stat(path_str);
    if (fsz < 1084) { mod_set_err("MOD not found on /shelf"); return -1; }
    buf = abi_heap_alloc(fsz + 16);
    if (buf == 0) { mod_set_err("Out of heap memory"); return -1; }
    int rd = abi_fat_read(path_str, buf, fsz);
    if (rd < 1084) { abi_heap_free(buf); mod_set_err("FAT read error"); return -1; }
  } else {
    int fidx = abi_fs_find(path_str);
    if (fidx < 0) { mod_set_err("MOD not found"); return -1; }
    fsz = abi_fs_size(fidx);
    if (fsz < 1084) { mod_set_err("File too small for MOD"); return -1; }
    buf = abi_heap_alloc(fsz + 16);
    if (buf == 0) { mod_set_err("Out of heap memory"); return -1; }
    hal_memcpy(buf, abi_fs_data(fidx), fsz);
  }

  // Verify 4-channel ProTracker magic at offset 1080
  int m0 = r8(buf + 1080); int m1 = r8(buf + 1081); int m2 = r8(buf + 1082); int m3 = r8(buf + 1083);
  int ok = 0;
  if (m0 == 77 && m1 == 46 && m2 == 75 && m3 == 46) ok = 1; // M.K.
  if (m0 == 52 && m1 == 67 && m2 == 72 && m3 == 78) ok = 1; // 4CHN
  if (m0 == 77 && m1 == 33 && m2 == 75 && m3 == 33) ok = 1; // M!K!
  if (m0 == 70 && m1 == 76 && m2 == 84 && m3 == 52) ok = 1; // FLT4
  if (ok == 0) {
    abi_heap_free(buf);
    mod_set_err("Unsupported MOD magic");
    return -1;
  }

  g_mod_buf = buf;
  g_mod_len = fsz;
  g_song_len = r8(buf + 950);
  if (g_song_len < 1) g_song_len = 1;
  if (g_song_len > 128) g_song_len = 128;

  int max_pat = 0;
  for (int i = 0; i < 128; i++) {
    int p = r8(buf + 952 + i);
    if (p > max_pat) max_pat = p;
  }
  g_num_pats = max_pat + 1;

  // Parse 31 sample headers & compute sample data pointers
  hal_memset(g_smp_info, 0, 32 * 20);
  int s_off = 1084 + g_num_pats * 1024;
  for (int si = 1; si <= 31; si++) {
    int hdr = buf + 20 + (si - 1) * 30;
    int slen = mod_rd16be(hdr + 22) * 2;
    int svol = r8(hdr + 25);
    if (svol > 64) svol = 64;
    int lstart = mod_rd16be(hdr + 26) * 2;
    int llen = mod_rd16be(hdr + 28) * 2;
    if (llen <= 2) { lstart = 0; llen = 0; }
    if (lstart + llen > slen) { lstart = 0; llen = 0; }
    int dst = g_smp_info + si * 20;
    if (slen > 0 && s_off + slen <= fsz) {
      w32(dst + 0, buf + s_off);
      w32(dst + 4, slen);
      w32(dst + 8, svol);
      w32(dst + 12, lstart);
      w32(dst + 16, llen);
    }
    s_off = s_off + slen;
  }

  hal_memset(g_ch_st, 0, 4 * 48);
  g_order = 0;
  g_row = 0;
  g_tick = 0;
  g_speed = 6;
  g_bpm = 125;
  g_pat_jump = -1;
  g_pat_break = -1;
  g_mod_loaded = 1;
  mod_set_err("");
  return 0;
}

// Channel state layout (48 bytes per channel):
//  0: smp (1..31)
//  4: period (113..856)
//  8: vol (0..64)
// 12: eff (0..15)
// 16: param (0..255)
// 20: target_per (for 3xx)
// 24: porta_spd (for 3xx)
// 28: vib_pos (0..63)
// 32: vib_param (xy)
// 36: delay_per (for EDx)
// 40: delay_smp (for EDx)
// 44: delay_tick (for EDx)

void mod_trigger_ch(int ch, int smp, int per, int offset_bytes) {
  int cs = g_ch_st + ch * 48;
  int si = g_smp_info + smp * 20;
  int ptr = r32(si + 0);
  int slen = r32(si + 4);
  int lstart = r32(si + 12);
  int llen = r32(si + 16);
  if (ptr == 0 || slen <= 0 || per <= 0) return;
  if (offset_bytes > 0) {
    if (offset_bytes >= slen) { abi_audio_ch_stop(ch); return; }
    ptr = ptr + offset_bytes;
    slen = slen - offset_bytes;
    if (llen > 0) {
      if (lstart >= offset_bytes) lstart = lstart - offset_bytes;
      else { lstart = 0; llen = 0; }
    }
  }
  abi_audio_ch_play(ch, ptr, slen, 8, mod_per_to_step(per), r32(cs + 8), mod_ch_pan(ch), lstart, llen);
}

void mod_process_row() {
  int pat = r8(g_mod_buf + 952 + g_order);
  int row_ptr = g_mod_buf + 1084 + pat * 1024 + g_row * 16;
  g_pat_jump = -1;
  g_pat_break = -1;

  for (int ch = 0; ch < 4; ch++) {
    int p = row_ptr + ch * 4;
    int b0 = r8(p + 0); int b1 = r8(p + 1); int b2 = r8(p + 2); int b3 = r8(p + 3);
    int smp = (b0 & 0xF0) | (b2 >>> 4);
    int per = ((b0 & 0x0F) << 8) | b1;
    int eff = b2 & 0x0F;
    int param = b3;
    int cs = g_ch_st + ch * 48;

    w32(cs + 12, eff);
    w32(cs + 16, param);
    w32(cs + 44, 0);

    if (smp > 0 && smp <= 31) {
      w32(cs + 0, smp);
      w32(cs + 8, r32(g_smp_info + smp * 20 + 8));
      abi_audio_ch_vol_pan(ch, r32(cs + 8), mod_ch_pan(ch));
    }

    // EDx Note Delay: defer trigger until tick x
    if (eff == 0xE && (param >>> 4) == 0xD && (param & 0x0F) > 0) {
      w32(cs + 36, per);
      w32(cs + 40, r32(cs + 0));
      w32(cs + 44, param & 0x0F);
      continue;
    }

    if (eff == 3) {
      // Tone Portamento: set target period, do not retrigger
      if (per > 0) w32(cs + 20, per);
      if (param > 0) w32(cs + 24, param);
    } else if (per > 0) {
      w32(cs + 4, per);
      w32(cs + 28, 0); // reset vibrato phase
      int off_b = 0;
      if (eff == 9) off_b = param * 256;
      mod_trigger_ch(ch, r32(cs + 0), per, off_b);
    }

    if (eff == 4 && param != 0) {
      int vp = r32(cs + 32);
      int vx = param >>> 4; if (vx == 0) vx = vp >>> 4;
      int vy = param & 0x0F; if (vy == 0) vy = vp & 0x0F;
      w32(cs + 32, (vx << 4) | vy);
    } else if (eff == 0xB) {
      g_pat_jump = param;
    } else if (eff == 0xC) {
      int v = param;
      if (v > 64) v = 64;
      w32(cs + 8, v);
      abi_audio_ch_vol_pan(ch, v, mod_ch_pan(ch));
    } else if (eff == 0xD) {
      g_pat_break = (param >>> 4) * 10 + (param & 0x0F);
      if (g_pat_break >= 64) g_pat_break = 0;
    } else if (eff == 0xF) {
      if (param > 0 && param < 32) g_speed = param;
      else if (param >= 32) g_bpm = param;
    }
  }
}

void mod_process_tick_fx() {
  for (int ch = 0; ch < 4; ch++) {
    int cs = g_ch_st + ch * 48;
    int eff = r32(cs + 12);
    int param = r32(cs + 16);
    int per = r32(cs + 4);
    int vol = r32(cs + 8);

    // Note Delay trigger
    int dt = r32(cs + 44);
    if (dt > 0 && g_tick == dt) {
      int dp = r32(cs + 36);
      if (dp > 0) {
        w32(cs + 4, dp);
        mod_trigger_ch(ch, r32(cs + 40), dp, 0);
      }
      w32(cs + 44, 0);
    }

    if (eff == 0 && param != 0 && per > 0) {
      int step = g_tick % 3;
      int semi = 0;
      if (step == 1) semi = param >>> 4;
      else if (step == 2) semi = param & 0x0F;
      int ni = mod_find_note_idx(per) + semi;
      if (ni > 35) ni = 35;
      abi_audio_ch_step(ch, mod_per_to_step(mod_period_at(ni)));
    } else if (eff == 1 && per > 0) {
      per = per - param;
      if (per < 113) per = 113;
      w32(cs + 4, per);
      abi_audio_ch_step(ch, mod_per_to_step(per));
    } else if (eff == 2 && per > 0) {
      per = per + param;
      if (per > 856) per = 856;
      w32(cs + 4, per);
      abi_audio_ch_step(ch, mod_per_to_step(per));
    } else if (eff == 3 && per > 0) {
      int tgt = r32(cs + 20);
      int spd = r32(cs + 24);
      if (tgt > 0 && spd > 0) {
        if (per < tgt) { per = per + spd; if (per > tgt) per = tgt; }
        else if (per > tgt) { per = per - spd; if (per < tgt) per = tgt; }
        w32(cs + 4, per);
        abi_audio_ch_step(ch, mod_per_to_step(per));
      }
    } else if (eff == 4 && per > 0) {
      int vp = r32(cs + 32);
      int spd = vp >>> 4;
      int dep = vp & 0x0F;
      int vpos = r32(cs + 28);
      int delta = (mod_sine(vpos) * dep) >>> 7;
      int np = per + delta;
      if ((vpos & 32) != 0) np = per - delta;
      w32(cs + 28, (vpos + spd) & 63);
      abi_audio_ch_step(ch, mod_per_to_step(np));
    } else if (eff == 0xA) {
      int up = param >>> 4;
      int dn = param & 0x0F;
      if (up > 0) vol = vol + up;
      else vol = vol - dn;
      if (vol < 0) vol = 0;
      if (vol > 64) vol = 64;
      w32(cs + 8, vol);
      abi_audio_ch_vol_pan(ch, vol, mod_ch_pan(ch));
    } else if (eff == 0xE && (param >>> 4) == 0xC) {
      if (g_tick == (param & 0x0F)) {
        w32(cs + 8, 0);
        abi_audio_ch_vol_pan(ch, 0, mod_ch_pan(ch));
      }
    }
  }
}

void mod_step_tick() {
  if (g_playing == 0 || g_mod_loaded == 0) return;
  if (g_tick == 0) {
    mod_process_row();
  } else {
    mod_process_tick_fx();
  }
  int frames = 55125 / g_bpm;
  abi_audio_mix_submit(frames);

  g_tick = g_tick + 1;
  if (g_tick >= g_speed) {
    g_tick = 0;
    if (g_pat_jump >= 0) {
      g_order = g_pat_jump;
      g_row = 0;
      if (g_pat_break >= 0) g_row = g_pat_break;
    } else if (g_pat_break >= 0) {
      g_order = g_order + 1;
      g_row = g_pat_break;
    } else {
      g_row = g_row + 1;
      if (g_row >= 64) {
        g_row = 0;
        g_order = g_order + 1;
      }
    }
    if (g_order >= g_song_len) {
      if (g_loop_song == 1) {
        g_order = 0; g_row = 0;
      } else {
        mod_stop();
      }
    }
  }
}

void mod_note_str(int per, int out4) {
  if (per <= 0) {
    w8(out4 + 0, 45); w8(out4 + 1, 45); w8(out4 + 2, 45); w8(out4 + 3, 0);
    return;
  }
  int idx = mod_find_note_idx(per);
  int oct = (idx / 12) + 1;
  int n = idx % 12;
  int names = "C-C#D-D#E-F-F#G-G#A-A#B-";
  w8(out4 + 0, r8(names + n * 2));
  w8(out4 + 1, r8(names + n * 2 + 1));
  w8(out4 + 2, 48 + oct);
  w8(out4 + 3, 0);
}

void app_init(int abi, int arg0) {
  if (arg0 == -1) {
    mod_stop();
    if (g_mod_buf != 0) abi_heap_free(g_mod_buf);
    if (g_smp_info != 0) abi_heap_free(g_smp_info);
    if (g_ch_st != 0) abi_heap_free(g_ch_st);
    if (g_path_buf != 0) abi_heap_free(g_path_buf);
    if (g_err_msg != 0) abi_heap_free(g_err_msg);
    return;
  }
  g_mod_buf = 0; g_mod_len = 0; g_mod_loaded = 0; g_playing = 0; g_loop_song = 0;
  g_smp_info = abi_heap_alloc(32 * 20);
  g_ch_st = abi_heap_alloc(4 * 48);
  g_path_buf = abi_heap_alloc(128);
  g_err_msg = abi_heap_alloc(64);
  if (g_err_msg != 0) hal_memset(g_err_msg, 0, 64);
  if (g_path_buf != 0) hal_memset(g_path_buf, 0, 128);
  abi_set_tick(21, 20);
  int p = arg0;
  if (p == 0 && r8(APP_LAUNCH_PATH_BUF) != 0) p = APP_LAUNCH_PATH_BUF;
  if (p != 0 && r8(p) != 0) {
    if (mod_load_file(p) == 0) {
      g_playing = 1;
    }
  }
}

void app_tick() {
  if (g_playing == 1 && g_mod_loaded == 1) {
    mod_step_tick();
  }
}

void app_draw(int x, int y, int w, int h) {
  gui_set_win(x, y, w, h);
  hal_rect(x + 4, y + 14, w - 8, h - 18, 0);

  wbtn(6, 16, 40, 10, "Play", g_playing);
  wbtn(50, 16, 40, 10, "Stop", 1 - g_playing);
  wbtn(94, 16, 40, 10, "Loop", g_loop_song);

  if (abi_audio_caps() == 0) {
    wstr(140, 18, "No PCM hw", 12);
  } else {
    wstr(140, 18, "22kHz 16b", 10);
  }

  if (g_mod_loaded == 0) {
    wstr(8, 34, "SpiralTracker - ProTracker MOD", 14);
    wstr(8, 48, "Open a .mod file from Files or", 15);
    wstr(8, 58, "Shell: mod /shelf/song.mod", 11);
    if (g_err_msg != 0 && r8(g_err_msg) != 0) wstr(8, 76, g_err_msg, 12);
    return;
  }

  // Song title (first 20 bytes of MOD)
  byte title[24];
  hal_memset(title, 0, 24);
  hal_memcpy(title, g_mod_buf, 20);
  wstr(8, 30, title, 14);

  // Status bar: Ord / Pat / Row / Spd / BPM
  int pat = r8(g_mod_buf + 952 + g_order);
  wstr(8, 40, "Ord:", 7); wnum(40, 40, g_order, 15);
  wstr(68, 40, "Pat:", 7); wnum(100, 40, pat, 15);
  wstr(128, 40, "Row:", 7); wnum(160, 40, g_row, 11);
  wstr(188, 40, "BPM:", 7); wnum(220, 40, g_bpm, 10);

  // Pattern view (8 visible rows centered around g_row)
  int pat_base = g_mod_buf + 1084 + pat * 1024;
  int start_r = g_row - 3;
  if (start_r < 0) start_r = 0;
  if (start_r > 56) start_r = 56;
  wstr(8, 52, "RW CH1    CH2    CH3    CH4", 11);
  byte nbuf[4];
  for (int i = 0; i < 8; i++) {
    int rr = start_r + i;
    int ry = 62 + i * 10;
    if (rr == g_row) hal_rect(x + 6, y + ry - 1, w - 12, 9, 1);
    wnum(8, ry, rr, 14);
    int rptr = pat_base + rr * 16;
    for (int ch = 0; ch < 4; ch++) {
      int p = rptr + ch * 4;
      int per = ((r8(p) & 0x0F) << 8) | r8(p + 1);
      int eff = r8(p + 2) & 0x0F;
      int prm = r8(p + 3);
      mod_note_str(per, nbuf);
      int cx = 30 + ch * 58;
      wstr(cx, ry, nbuf, 15);
      if (eff != 0 || prm != 0) {
        int hex = "0123456789ABCDEF";
        nbuf[0] = r8(hex + eff);
        nbuf[1] = r8(hex + (prm >>> 4));
        nbuf[2] = r8(hex + (prm & 15));
        nbuf[3] = 0;
        wstr(cx + 26, ry, nbuf, 10);
      }
    }
  }
}

void app_click(int wid, int rx, int ry) {
  if (ry >= 16 && ry <= 26) {
    if (rx >= 6 && rx < 46 && g_mod_loaded == 1) { g_playing = 1; return; }
    if (rx >= 50 && rx < 90) { mod_stop(); return; }
    if (rx >= 94 && rx < 134) { g_loop_song = 1 - g_loop_song; return; }
  }
}

void app_key(int ascii, int vk, int mods) {
  if (ascii == 32 && g_mod_loaded == 1) {
    if (g_playing == 1) mod_stop();
    else g_playing = 1;
  } else if (ascii == 'l' || ascii == 'L') {
    g_loop_song = 1 - g_loop_song;
  }
}
