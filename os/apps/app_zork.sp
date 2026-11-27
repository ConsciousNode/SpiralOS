import "/src/app_abi.sp";
const PC_Z_BAD_ABBREV       = 0;
const PC_Z_SWAP_INSERT      = 0;
const PC_Z_SPACE_ONLY_TOK   = 0;
const PC_Z_RESTORE_NO_STACK = 0;
int z_mem;
int z_stack;
int z_frames;
int z_out_buf;
int z_tr_buf;
int z_hist_buf;
int z_sav_buf;
int z_pc;
int z_sp;
int z_fp;
int z_halted;
int z_waiting_read;
int z_read_tbuf;
int z_read_pbuf;
int z_dict_addr;
int z_obj_addr;
int z_glob_addr;
int z_static_base;
int z_abbrev_addr;
int z_story_len;
int z_story_idx;
int z_transcript_on;
int z_tr_len;
int z_out_len;
int z_out_scroll;
int z_rng_state;
int z_prompt_cnt;
int z_in_len;
int z_hist_cnt;
int z_hist_pos;
byte z_in_buf[64];
byte z_stat_room[32];
int z_stat_score;
int z_stat_moves;
int z_stat_is_time;
byte z_story_path[40];
int z_op_cnt;
int z_ops[8];
int z_abbrev_depth;
int z_u8(int a) { return r8(z_mem + (a & 0x1FFFF)); }
void z_w8(int a, int v) { w8(z_mem + (a & 0x1FFFF), v & 0xFF); }
int z_u16(int a) {
int p = z_mem + (a & 0x1FFFF);
return (r8(p) << 8) | r8(p + 1);
}
void z_w16(int a, int v) {
int p = z_mem + (a & 0x1FFFF);
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
int z_get_var(int v) {
if (v == 0) return z_pop();
if (v < 16) return r16(z_frames + z_fp * 48 + 16 + (v - 1) * 2);
return z_u16(z_glob_addr + (v - 16) * 2);
}
void z_set_var(int v, int val) {
val = val & 0xFFFF;
if (v == 0) { z_push(val); return; }
if (v < 16) { w16(z_frames + z_fp * 48 + 16 + (v - 1) * 2, val); return; }
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
void z_do_ret(int val) {
int f = z_frames + z_fp * 48;
int ret_pc = r32(f + 0);
int st_var = r32(f + 4);
z_sp = r32(f + 8);
if (z_fp == 0) { z_halted = 1; return; }
z_fp = z_fp - 1;
z_pc = ret_pc;
z_set_var(st_var, val);
}
int z_stat_cap_mode;
int z_stat_cap_len;
void z_emit_ch(int ch) {
if (ch == 13) ch = 10;
if (z_stat_cap_mode == 1) {
if (ch >= 32 && ch < 127 && z_stat_cap_len < 30) {
z_stat_room[z_stat_cap_len] = ch;
z_stat_cap_len = z_stat_cap_len + 1;
z_stat_room[z_stat_cap_len] = 0;
}
return;
}
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
if (shift == 0) {
z_emit_ch(97 + (zc - 6));
} else if (shift == 1) {
z_emit_ch(65 + (zc - 6));
} else {
if (zc == 6) {
zscii_st = 1;
} else if (zc == 7) {
z_emit_ch(10);
} else {
z_emit_ch(r8(a2 + (zc - 6)));
}
}
shift = 0;
}
}
}
return addr;
}
int z_obj_ptr(int obj) {
return z_obj_addr + 62 + (obj - 1) * 9;
}
int z_obj_parent(int obj) { if (obj == 0) return 0; return z_u8(z_obj_ptr(obj) + 4); }
int z_obj_sibling(int obj) { if (obj == 0) return 0; return z_u8(z_obj_ptr(obj) + 5); }
int z_obj_child(int obj) { if (obj == 0) return 0; return z_u8(z_obj_ptr(obj) + 6); }
void z_remove_obj(int obj) {
if (obj == 0) return;
int par = z_obj_parent(obj);
if (par == 0) return;
int first = z_obj_child(par);
if (first == obj) {
z_w8(z_obj_ptr(par) + 6, z_obj_sibling(obj));
} else {
int cur = first;
while (cur != 0) {
int nxt = z_obj_sibling(cur);
if (nxt == obj) {
z_w8(z_obj_ptr(cur) + 5, z_obj_sibling(obj));
break;
}
cur = nxt;
}
}
z_w8(z_obj_ptr(obj) + 4, 0);
z_w8(z_obj_ptr(obj) + 5, 0);
}
void z_insert_obj(int obj, int dest) {
if (obj == 0) return;
z_remove_obj(obj);
if (dest == 0) return;
int old_ch = z_obj_child(dest);
z_w8(z_obj_ptr(obj) + 4, dest);
if (PC_Z_SWAP_INSERT == 1) {
z_w8(z_obj_ptr(obj) + 6, old_ch);
z_w8(z_obj_ptr(dest) + 5, obj);
} else {
z_w8(z_obj_ptr(obj) + 5, old_ch);
z_w8(z_obj_ptr(dest) + 6, obj);
}
}
int z_prop_table_first(int obj) {
int pt = z_u16(z_obj_ptr(obj) + 7);
int nlen = z_u8(pt);
return pt + 1 + nlen * 2;
}
int z_find_prop(int obj, int pnum) {
if (obj == 0) return 0;
int p = z_prop_table_first(obj);
while (1) {
int sb = z_u8(p);
if (sb == 0) return 0;
int pn = sb & 31;
int plen = (sb >>> 5) + 1;
if (pn == pnum) return p + 1;
if (pn < pnum) return 0;
p = p + 1 + plen;
}
return 0;
}
int z_is_sep(int ch) {
if (PC_Z_SPACE_ONLY_TOK == 1) return 0;
int nsep = z_u8(z_dict_addr);
for (int i = 0; i < nsep; i++) {
if (z_u8(z_dict_addr + 1 + i) == ch) return 1;
}
return 0;
}
int z_lookup_word(int wptr, int wlen) {
int a2 = " \n0123456789.,!?_#'\"/\\-:()";
int zc[6];
int zi = 0;
for (int i = 0; i < wlen && zi < 6; i++) {
int ch = r8(wptr + i);
if (ch >= 65 && ch <= 90) ch = ch + 32;
if (ch >= 97 && ch <= 122) {
zc[zi] = ch - 97 + 6;
zi = zi + 1;
} else {
int found = -1;
for (int k = 2; k < 26; k++) {
if (r8(a2 + k) == ch) { found = k + 6; break; }
}
if (found >= 0) {
if (zi < 6) { zc[zi] = 5; zi = zi + 1; }
if (zi < 6) { zc[zi] = found; zi = zi + 1; }
} else {
if (zi < 6) { zc[zi] = 5; zi = zi + 1; }
if (zi < 6) { zc[zi] = 6; zi = zi + 1; }
if (zi < 6) { zc[zi] = (ch >>> 5) & 31; zi = zi + 1; }
if (zi < 6) { zc[zi] = ch & 31; zi = zi + 1; }
}
}
}
while (zi < 6) { zc[zi] = 5; zi = zi + 1; }
int w0 = ((zc[0] & 31) << 10) | ((zc[1] & 31) << 5) | (zc[2] & 31);
int w1 = 0x8000 | ((zc[3] & 31) << 10) | ((zc[4] & 31) << 5) | (zc[5] & 31);
int nsep = z_u8(z_dict_addr);
int elen = z_u8(z_dict_addr + 1 + nsep);
int nent = z_s16(z_u16(z_dict_addr + 2 + nsep));
int base = z_dict_addr + 4 + nsep;
if (nent < 0) nent = 0 - nent;
int lo = 0;
int hi = nent - 1;
while (lo <= hi) {
int mid = (lo + hi) >> 1;
int ea = base + mid * elen;
int e0 = z_u16(ea);
int e1 = z_u16(ea + 2);
if (e0 == w0 && e1 == w1) return ea;
if (e0 < w0 || (e0 == w0 && e1 < w1)) lo = mid + 1;
else hi = mid - 1;
}
return 0;
}
void z_tokenize(int tbuf, int pbuf) {
int max_words = z_u8(pbuf);
int wcnt = 0;
int pos = 1;
while (wcnt < max_words) {
int ch = z_u8(tbuf + pos);
if (ch == 0) break;
if (ch == 32) { pos = pos + 1; continue; }
int start = pos;
int wlen = 0;
if (z_is_sep(ch) == 1) {
wlen = 1;
pos = pos + 1;
} else {
while (1) {
int c2 = z_u8(tbuf + pos);
if (c2 == 0 || c2 == 32 || z_is_sep(c2) == 1) break;
wlen = wlen + 1;
pos = pos + 1;
}
}
int daddr = z_lookup_word(z_mem + ((tbuf + start) & 0x1FFFF), wlen);
int pe = pbuf + 2 + wcnt * 4;
z_w16(pe, daddr);
z_w8(pe + 2, wlen);
z_w8(pe + 3, start);
wcnt = wcnt + 1;
}
z_w8(pbuf + 1, wcnt);
}
void z_update_status() {
int loc = z_get_var(16);
z_stat_score = z_s16(z_get_var(17));
z_stat_moves = z_s16(z_get_var(18));
z_stat_room[0] = 0;
if (loc > 0 && loc < 256) {
int pt = z_u16(z_obj_ptr(loc) + 7);
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
int z_do_save() {
int st_bytes = z_sp * 2;
int fr_bytes = (z_fp + 1) * 48;
int total = 20 + z_static_base + st_bytes + fr_bytes;
if (total > 32000) return 0;
w32(z_sav_buf + 0, 0x5641535A);
w32(z_sav_buf + 4, z_pc);
w32(z_sav_buf + 8, z_sp);
w32(z_sav_buf + 12, z_fp);
w32(z_sav_buf + 16, z_static_base);
hal_memcpy(z_sav_buf + 20, z_mem, z_static_base);
if (st_bytes > 0) hal_memcpy(z_sav_buf + 20 + z_static_base, z_stack, st_bytes);
hal_memcpy(z_sav_buf + 20 + z_static_base + st_bytes, z_frames, fr_bytes);
int rc = abi_fs_write("/home/zork.sav", z_sav_buf, total);
if (rc < 0) return 0;
return 1;
}
int z_do_restore() {
int idx = abi_fs_find("/home/zork.sav");
if (idx < 0) return 0;
int ptr = abi_fs_data(idx);
int sz = abi_fs_size(idx);
if (sz < 20 || r32(ptr) != 0x5641535A) return 0;
int sb = r32(ptr + 16);
if (sb != z_static_base) return 0;
int n_pc = r32(ptr + 4);
int n_sp = r32(ptr + 8);
int n_fp = r32(ptr + 12);
int st_bytes = n_sp * 2;
int fr_bytes = (n_fp + 1) * 48;
if (20 + sb + st_bytes + fr_bytes > sz) return 0;
int old_f2 = z_u16(0x10) & 1;
hal_memcpy(z_mem, ptr + 20, sb);
z_w16(0x10, (z_u16(0x10) & (~1)) | old_f2);
if (PC_Z_RESTORE_NO_STACK == 0) {
z_sp = n_sp;
z_fp = n_fp;
if (st_bytes > 0) hal_memcpy(z_stack, ptr + 20 + sb, st_bytes);
hal_memcpy(z_frames, ptr + 20 + sb + st_bytes, fr_bytes);
}
z_pc = n_pc;
return 1;
}
int z_do_verify() {
int flen = z_u16(0x1A) * 2;
int want = z_u16(0x1C);
if (flen > z_story_len) flen = z_story_len;
int sum = 0;
for (int i = 0x40; i < flen; i++) {
sum = (sum + r8(z_mem + i)) & 0xFFFF;
}
if (sum == want) return 1;
return 0;
}
void z_load_story(int path_str) {
int idx = abi_fs_find(path_str);
if (idx < 0) idx = abi_fs_find("/games/zork1.z3");
if (idx < 0) {
z_halted = 1;
z_emit_str("Story file not found.\n");
return;
}
z_story_idx = idx;
int fptr = abi_fs_data(idx);
int flen = abi_fs_size(idx);
if (flen > 0x20000) flen = 0x20000;
z_story_len = flen;
hal_memset(z_mem, 0, 0x20000);
hal_memcpy(z_mem, fptr, flen);
z_pc = z_u16(0x06);
z_dict_addr = z_u16(0x08);
z_obj_addr = z_u16(0x0A);
z_glob_addr = z_u16(0x0C);
z_static_base = z_u16(0x0E);
z_abbrev_addr = z_u16(0x18);
z_stat_is_time = (z_u8(0x01) >>> 1) & 1;
z_w8(0x01, z_u8(0x01) & (~0x70));
z_sp = 0;
z_fp = 0;
hal_memset(z_frames, 0, 48);
z_halted = 0;
z_waiting_read = 0;
z_abbrev_depth = 0;
z_rng_state = 42;
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
z_branch(eq);
return;
}
if (op == 2) { z_branch(z_s16(a) < z_s16(b)); return; }
if (op == 3) { z_branch(z_s16(a) > z_s16(b)); return; }
if (op == 4) {
int v = z_s16(z_get_var_ind(a)) - 1;
z_set_var_ind(a, v);
z_branch(v < z_s16(b));
return;
}
if (op == 5) {
int v = z_s16(z_get_var_ind(a)) + 1;
z_set_var_ind(a, v);
z_branch(v > z_s16(b));
return;
}
if (op == 6) { z_branch(z_obj_parent(a) == b); return; }
if (op == 7) { z_branch((a & b) == b); return; }
if (op == 8) { z_store_res(a | b); return; }
if (op == 9) { z_store_res(a & b); return; }
if (op == 10) {
if (a == 0) { z_branch(0); return; }
int bo = z_obj_ptr(a) + (b >>> 3);
int bit = 128 >>> (b & 7);
z_branch((z_u8(bo) & bit) != 0);
return;
}
if (op == 11) {
if (a != 0) {
int bo = z_obj_ptr(a) + (b >>> 3);
z_w8(bo, z_u8(bo) | (128 >>> (b & 7)));
}
return;
}
if (op == 12) {
if (a != 0) {
int bo = z_obj_ptr(a) + (b >>> 3);
z_w8(bo, z_u8(bo) & (~(128 >>> (b & 7))));
}
return;
}
if (op == 13) { z_set_var_ind(a, b); return; }
if (op == 14) { z_insert_obj(a, b); return; }
if (op == 15) { z_store_res(z_u16((a + b * 2) & 0xFFFF)); return; }
if (op == 16) { z_store_res(z_u8((a + b) & 0xFFFF)); return; }
if (op == 17) {
int pa = z_find_prop(a, b);
if (pa == 0) {
z_store_res(z_u16(z_obj_addr + (b - 1) * 2));
} else {
int plen = (z_u8(pa - 1) >>> 5) + 1;
if (plen == 1) z_store_res(z_u8(pa));
else z_store_res(z_u16(pa));
}
return;
}
if (op == 18) { z_store_res(z_find_prop(a, b)); return; }
if (op == 19) {
if (a == 0) { z_store_res(0); return; }
int p = z_prop_table_first(a);
if (b == 0) {
z_store_res(z_u8(p) & 31);
return;
}
while (1) {
int sb = z_u8(p);
if (sb == 0) { z_store_res(0); return; }
int pn = sb & 31;
int plen = (sb >>> 5) + 1;
p = p + 1 + plen;
if (pn == b) { z_store_res(z_u8(p) & 31); return; }
}
}
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
}
void z_exec_1op(int op) {
int a = z_ops[0];
if (op == 0) { z_branch(a == 0); return; }
if (op == 1) { int s = z_obj_sibling(a); z_store_res(s); z_branch(s != 0); return; }
if (op == 2) { int c = z_obj_child(a); z_store_res(c); z_branch(c != 0); return; }
if (op == 3) { z_store_res(z_obj_parent(a)); return; }
if (op == 4) {
if (a == 0) z_store_res(0);
else z_store_res((z_u8(a - 1) >>> 5) + 1);
return;
}
if (op == 5) { z_set_var_ind(a, (z_s16(z_get_var_ind(a)) + 1) & 0xFFFF); return; }
if (op == 6) { z_set_var_ind(a, (z_s16(z_get_var_ind(a)) - 1) & 0xFFFF); return; }
if (op == 7) { z_print_zstr(a); return; }
if (op == 9) { z_remove_obj(a); return; }
if (op == 10) {
if (a != 0) {
int pt = z_u16(z_obj_ptr(a) + 7);
if (z_u8(pt) > 0) z_print_zstr(pt + 1);
}
return;
}
if (op == 11) { z_do_ret(a); return; }
if (op == 12) { z_pc = z_pc + z_s16(a) - 2; return; }
if (op == 13) { z_print_zstr(a * 2); return; }
if (op == 14) { z_store_res(z_get_var_ind(a)); return; }
if (op == 15) { z_store_res((~a) & 0xFFFF); return; }
}
void z_exec_0op(int op) {
if (op == 0) { z_do_ret(1); return; }
if (op == 1) { z_do_ret(0); return; }
if (op == 2) { z_pc = z_print_zstr(z_pc); return; }
if (op == 3) { z_pc = z_print_zstr(z_pc); z_emit_ch(10); z_do_ret(1); return; }
if (op == 4) { return; }
if (op == 5) { z_branch(z_do_save()); return; }
if (op == 6) {
if (z_do_restore() == 1) { z_branch(1); }
else { z_branch(0); }
return;
}
if (op == 7) {
int old_f2 = z_u16(0x10) & 1;
z_load_story(z_story_path);
z_w16(0x10, (z_u16(0x10) & (~1)) | old_f2);
return;
}
if (op == 8) { z_do_ret(z_pop()); return; }
if (op == 9) { z_pop(); return; }
if (op == 10) { z_halted = 1; return; }
if (op == 11) { z_emit_ch(10); return; }
if (op == 12) { z_update_status(); return; }
if (op == 13) { z_branch(z_do_verify()); return; }
}
void z_exec_var(int op) {
if (op == 0) {
int raddr = z_ops[0] * 2;
int st_var = z_fetch8();
if (raddr == 0) { z_set_var(st_var, 0); return; }
z_fp = z_fp + 1;
int f = z_frames + z_fp * 48;
w32(f + 0, z_pc);
w32(f + 4, st_var);
w32(f + 8, z_sp);
z_pc = raddr;
int nloc = z_fetch8();
w32(f + 12, nloc);
for (int i = 0; i < nloc; i++) {
int defv = z_fetch16();
if (i + 1 < z_op_cnt) defv = z_ops[i + 1];
w16(f + 16 + i * 2, defv & 0xFFFF);
}
return;
}
if (op == 1) { z_w16((z_ops[0] + z_ops[1] * 2) & 0xFFFF, z_ops[2]); return; }
if (op == 2) { z_w8((z_ops[0] + z_ops[1]) & 0xFFFF, z_ops[2]); return; }
if (op == 3) {
int pa = z_find_prop(z_ops[0], z_ops[1]);
if (pa != 0) {
int plen = (z_u8(pa - 1) >>> 5) + 1;
if (plen == 1) z_w8(pa, z_ops[2]);
else z_w16(pa, z_ops[2]);
}
return;
}
if (op == 4) {
z_update_status();
z_read_tbuf = z_ops[0];
z_read_pbuf = z_ops[1];
z_waiting_read = 1;
z_prompt_cnt = z_prompt_cnt + 1;
w32(VMRAM_STATUS + 0x58, z_dyn_hash());
w32(VMRAM_STATUS + 0x5C, z_prompt_cnt);
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
if (op == 19) {
int s = z_s16(z_ops[0]);
if (s == 2) { z_transcript_on = 1; z_w16(0x10, z_u16(0x10) | 1); }
else if (s == -2) {
if (z_transcript_on == 1 && z_tr_len > 0) abi_fs_write("/home/zork.log", z_tr_buf, z_tr_len);
z_transcript_on = 0;
z_w16(0x10, z_u16(0x10) & (~1));
}
return;
}
}
void z_step_until_input() {
int budget = 50000;
while (z_halted == 0 && z_waiting_read == 0 && budget > 0) {
budget = budget - 1;
int b = z_fetch8();
z_op_cnt = 0;
if (b >= 0xC0) {
int tb = z_fetch8();
for (int i = 0; i < 4; i++) {
int ot = (tb >>> (6 - i * 2)) & 3;
if (ot == 3) break;
z_decode_op_type(ot);
}
if ((b & 0x20) == 0) z_exec_2op(b & 31);
else z_exec_var(b & 31);
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
}
void z_submit_line() {
if (z_waiting_read == 0) return;
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
for (int j = 0; j < n; j++) {
int c = z_in_buf[j];
if (c >= 65 && c <= 90) c = c + 32;
z_w8(z_read_tbuf + 1 + j, c);
}
z_w8(z_read_tbuf + 1 + n, 0);
if (z_read_pbuf != 0) z_tokenize(z_read_tbuf, z_read_pbuf);
z_in_len = 0;
z_in_buf[0] = 0;
z_waiting_read = 0;
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
z_mem = 0;
return;
}
z_mem = abi_heap_alloc(0x20000);
z_stack = abi_heap_alloc(4096);
z_frames = abi_heap_alloc(64 * 48);
z_out_buf = abi_heap_alloc(8192);
z_tr_buf = abi_heap_alloc(32768);
z_hist_buf = abi_heap_alloc(16 * 64);
z_sav_buf = abi_heap_alloc(32768);
z_out_len = 0;
z_tr_len = 0;
z_transcript_on = 0;
z_prompt_cnt = 0;
z_in_len = 0;
z_hist_cnt = 0;
z_hist_pos = 0;
hal_memset(z_story_path, 0, 40);
if (arg0 != 0 && r8(arg0) != 0) {
int plen = hal_strlen(arg0);
if (plen > 38) plen = 38;
hal_memcpy(z_story_path, arg0, plen);
} else {
hal_memcpy(z_story_path, "/games/zork1.z3", 15);
}
z_load_story(z_story_path);
z_step_until_input();
}
void app_draw(int x, int y, int w, int h) {
gui_set_win(x, y, w, h);
gui_reg_ctl(4, h - 14, w - 8, 11, 0);
hal_rect(x + 4, y + 14, w - 8, 10, 1);
gui_str_clip(x + 6, y + 15, z_stat_room, (w - 86) / 8, 15, -1);
wstr(w - 78, 15, "S:", 14);
wnum(w - 62, 15, z_stat_score, 15);
wstr(w - 38, 15, "M:", 14);
wnum(w - 22, 15, z_stat_moves, 15);
int ty = y + 25;
int th = h - 41;
hal_rect(x + 4, ty, w - 8, th, 0);
int cols = (w - 14) / 8;
int rows = th / 9;
if (cols < 8) cols = 8;
if (rows < 1) rows = 1;
int lstart[24];
int llen[24];
int lcnt = 0;
int p = 0;
while (p < z_out_len) {
int ls = p;
int ll = 0;
while (p < z_out_len && ll < cols && r8(z_out_buf + p) != 10) {
p = p + 1;
ll = ll + 1;
}
if (p < z_out_len && r8(z_out_buf + p) == 10) p = p + 1;
if (lcnt < 24) {
lstart[lcnt] = ls;
llen[lcnt] = ll;
lcnt = lcnt + 1;
} else {
for (int s = 0; s < 23; s++) { lstart[s] = lstart[s + 1]; llen[s] = llen[s + 1]; }
lstart[23] = ls;
llen[23] = ll;
}
}
int first = lcnt - rows;
if (first < 0) first = 0;
for (int r = 0; r < rows && first + r < lcnt; r++) {
int ls2 = lstart[first + r];
int ll2 = llen[first + r];
for (int c = 0; c < ll2; c++) {
hal_char(x + 6 + c * 8, ty + 1 + r * 9, r8(z_out_buf + ls2 + c), 7, -1, 0);
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
if (ascii == 13) {
z_submit_line();
return;
}
if (ascii == 8 || vk == 8) {
if (z_in_len > 0) {
z_in_len = z_in_len - 1;
z_in_buf[z_in_len] = 0;
}
return;
}
if (ascii >= 32 && ascii < 127 && z_in_len < 60) {
z_in_buf[z_in_len] = ascii;
z_in_len = z_in_len + 1;
z_in_buf[z_in_len] = 0;
}
}
void app_tick() {
if (z_halted == 0 && z_waiting_read == 0) z_step_until_input();
}
