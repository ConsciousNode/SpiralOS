const VM_HEAP_BASE    = 0x370000;
const HEAP_BLK_MAGIC  = 0x48454150; // "HEAP"
const ABI_TABLE_ADDR  = 0x04DD80;
const SAPP_HDR_MAGIC  = 0x50504153; // "SAPP"
const SAPP_FMT_VER    = 2;
int g_heap_total;
int g_heap_head;
int g_loader_last_err;
int win_mod_base[16];
int win_mod_draw[16];
int win_mod_click[16];
int win_mod_key[16];
int win_mod_tick[16];
int win_mod_init[16];
int g_abi_state[32];
void heap_update_stats() {
int free_b = 0;
int used_b = 0;
int p = g_heap_head;
while (p != 0) {
if (r32(p) != HEAP_BLK_MAGIC) break;
int sz = r32(p + 4);
if (r32(p + 8) != 0) free_b = free_b + sz;
else used_b = used_b + sz;
p = r32(p + 12);
}
w32(VMRAM_STATUS + 0x40, free_b);
w32(VMRAM_STATUS + 0x44, used_b);
w32(VMRAM_STATUS + 0x48, g_heap_total);
}
void heap_init() {
int ram_sz = hal_info(1);
if (ram_sz < 0x00400000) ram_sz = 0x00400000;
int avail = (ram_sz - VM_HEAP_BASE) & (~15);
if (avail < 65536) avail = 65536;
g_heap_total = avail;
g_heap_head = VM_HEAP_BASE;
w32(g_heap_head + 0, HEAP_BLK_MAGIC);
w32(g_heap_head + 4, avail);
w32(g_heap_head + 8, 1);
w32(g_heap_head + 12, 0);
heap_update_stats();
}
int heap_alloc(int req_bytes) {
if (req_bytes <= 0) req_bytes = 16;
int need = ((req_bytes + 15) & (~15)) + 16;
int p = g_heap_head;
while (p != 0) {
if (r32(p) != HEAP_BLK_MAGIC) return 0;
int sz = r32(p + 4);
int is_free = r32(p + 8);
if (is_free == 1 && sz >= need) {
int rem = sz - need;
if (rem >= 32) {
int nxt = p + need;
w32(nxt + 0, HEAP_BLK_MAGIC);
w32(nxt + 4, rem);
w32(nxt + 8, 1);
w32(nxt + 12, r32(p + 12));
w32(p + 4, need);
w32(p + 12, nxt);
}
w32(p + 8, 0);
heap_update_stats();
return p + 16;
}
p = r32(p + 12);
}
return 0;
}
void heap_free(int ptr) {
if (ptr < VM_HEAP_BASE + 16) return;
int blk = ptr - 16;
if (r32(blk) != HEAP_BLK_MAGIC) return;
w32(blk + 8, 1);
int p = g_heap_head;
while (p != 0) {
if (r32(p) != HEAP_BLK_MAGIC) break;
int nxt = r32(p + 12);
if (r32(p + 8) == 1 && nxt != 0 && r32(nxt) == HEAP_BLK_MAGIC && r32(nxt + 8) == 1) {
int sz = r32(p + 4);
if (p + sz == nxt) {
w32(p + 4, sz + r32(nxt + 4));
w32(p + 12, r32(nxt + 12));
w32(nxt, 0);
continue;
}
}
p = nxt;
}
heap_update_stats();
}
int heap_free_bytes() {
heap_update_stats();
return r32(VMRAM_STATUS + 0x40);
}
int heap_used_bytes() {
heap_update_stats();
return r32(VMRAM_STATUS + 0x44);
}
void loader_set_err(int msg_str) {
hal_memset(LOADER_ERR_BUF, 0, 128);
int n = hal_strlen(msg_str);
if (n > 126) n = 126;
hal_memcpy(LOADER_ERR_BUF, msg_str, n);
g_loader_last_err = 1;
}
int app_abi_state_sync() {
g_abi_state[0] = thm_taskbar_bg;
g_abi_state[1] = thm_win_bg;
g_abi_state[2] = thm_title_active;
g_abi_state[3] = thm_taskbar_fg;
g_abi_state[4] = thm_accent;
g_abi_state[5] = g_machine_id;
g_abi_state[6] = g_local_node_id;
g_abi_state[7] = g_has_snet;
g_abi_state[8] = g_uptime_frames;
g_abi_state[9] = g_win_count;
g_abi_state[10] = g_focused_win;
g_abi_state[11] = r32(VMRAM_STATUS + 0x08);
g_abi_state[12] = r32(VMRAM_STATUS + 0x0C);
g_abi_state[13] = r32(VMRAM_STATUS + 0x10);
g_abi_state[14] = g_notes_dirty;
g_abi_state[15] = g_notes_len;
g_abi_state[16] = g_edit_dirty;
g_abi_state[17] = g_edit_len;
g_abi_state[18] = g_paint_dirty;
g_abi_state[19] = g_dlg_active;
g_abi_state[20] = g_dlg_owner_app;
return &g_abi_state;
}
int app_load_path(int path_str, int arg0) {
g_loader_last_err = 0;
w8(LOADER_ERR_BUF, 0);
int idx = fs_find(path_str);
if (idx < 0) {
loader_set_err("App not found");
return 0;
}
int fptr = fs_entry_data_ptr(idx);
int fsz = fs_entry_size(idx);
if (fsz < 64) {
loader_set_err("Corrupt app: file too small");
return 0;
}
int magic = r32(fptr + 0x00);
if (magic != SAPP_HDR_MAGIC) {
loader_set_err("Corrupt app: bad SAPP magic");
return 0;
}
int ver = r32(fptr + 0x04);
if (ver < SAPP_FMT_VER) {
loader_set_err("Unsupported older app format version");
return 0;
}
if (ver > SAPP_FMT_VER) {
loader_set_err("Unsupported newer app format version");
return 0;
}
int code_off  = r32(fptr + 0x0C);
int code_sz   = r32(fptr + 0x10);
int bss_sz    = r32(fptr + 0x1C);
int reloc_off = r32(fptr + 0x20);
int reloc_cnt = r32(fptr + 0x24);
if (code_off < 64 || code_sz < 0 || reloc_off < code_off + code_sz || reloc_cnt < 0) {
loader_set_err("Corrupt app: invalid header layout");
return 0;
}
if (reloc_off + reloc_cnt * 4 > fsz) {
loader_set_err("Corrupt app: truncated relocation table");
return 0;
}
int want_hash = r32(fptr + 0x3C);
int h = 0x811C9DC5;
for (int i = 0; i < fsz; i++) {
int b = r8(fptr + i);
if (i >= 0x3C && i < 0x40) b = 0;
h = (h ^ b) * 0x01000193;
}
if (h != want_hash) {
loader_set_err("Corrupt app: checksum mismatch");
return 0;
}
int total_mem = reloc_off + bss_sz;
int base = heap_alloc(total_mem);
if (base == 0) {
loader_set_err("Out of heap memory loading app");
return 0;
}
if (base + reloc_off >= 0x007F0000) {
heap_free(base);
loader_set_err("Executable code address out of range");
return 0;
}
hal_memcpy(base, fptr, reloc_off);
if (bss_sz > 0) hal_memset(base + reloc_off, 0, bss_sz);
int bss_base = base + reloc_off;
for (int r = 0; r < reloc_cnt; r++) {
int ent = r32(fptr + reloc_off + r * 4);
int rtype = (ent >>> 24) & 0xFF;
int off = ent & 0x00FFFFFF;
if (off + 4 > reloc_off) {
heap_free(base);
loader_set_err("Corrupt app: relocation out of bounds");
return 0;
}
if (rtype == 1) {
int w = r32(base + off);
int tgt = (w & 0x007FFFFF) + base;
w32(base + off, (w & 0xFF800000) | (tgt & 0x007FFFFF));
} else if (rtype == 2 || rtype == 3) {
if (off + 8 > reloc_off) {
heap_free(base);
loader_set_err("Corrupt app: ptr32 reloc out of bounds");
return 0;
}
int lo = r32(base + off) & 0xFFFF;
int hi = r32(base + off + 4) & 0xFFFF;
int val = ((hi << 16) | lo) + base;
if (rtype == 3) val = ((hi << 16) | lo) + bss_base;
w32(base + off, (OP_PUSH_U16 << 24) | (val & 0xFFFF));
w32(base + off + 4, (OP_PUSH_HI << 24) | ((val >>> 16) & 0xFFFF));
}
}
int init_off = r32(base + 0x28);
if (init_off != 0) {
app_abi_state_sync();
icall(ABI_TABLE_ADDR, arg0, base + init_off);
}
return base;
}
void app_unload_base(int base) {
if (base == 0) return;
int init_off = r32(base + 0x28);
if (init_off != 0) {
icall(ABI_TABLE_ADDR, -1, base + init_off);
}
heap_free(base);
}
void app_unload_win(int wid) {
if (wid < 0 || wid >= 16) return;
if (win_mod_base[wid] != 0) {
app_unload_base(win_mod_base[wid]);
win_mod_base[wid] = 0;
win_mod_init[wid] = 0;
win_mod_draw[wid] = 0;
win_mod_click[wid] = 0;
win_mod_key[wid] = 0;
win_mod_tick[wid] = 0;
}
}
int app_path_for_id(int app_id) {
if (app_id == APP_ABOUT)     return "/apps/about.spir";
if (app_id == APP_CALC)      return "/apps/calc.spir";
if (app_id == APP_CLOCK)     return "/apps/clock.spir";
if (app_id == APP_SNAKE)     return "/apps/snake.spir";
if (app_id == APP_BLOCKS)    return "/apps/blocks.spir";
if (app_id == APP_SOLITAIRE) return "/apps/solitaire.spir";
if (app_id == APP_PAINT)     return "/apps/paint.spir";
if (app_id == APP_NOTES)     return "/apps/notes.spir";
if (app_id == APP_EDIT)      return "/apps/edit.spir";
if (app_id == APP_CHAT)      return "/apps/chat.spir";
if (app_id == APP_BROWSER)   return "/apps/browser.spir";
if (app_id == APP_TRANSFER)  return "/apps/transfer.spir";
if (app_id == APP_THEME)     return "/apps/theme.spir";
if (app_id == APP_VIEWER)    return "/apps/viewer.spir";
if (app_id == APP_SYSMON)    return "/apps/sysmon.spir";
if (app_id == APP_FILES)     return "/apps/files.spir";
if (app_id == APP_BUILD)     return "/apps/build.spir";
if (app_id == APP_ZORK)      return "/apps/zork.spir";
return 0;
}
int app_attach_to_win(int wid, int app_id, int arg0) {
if (wid < 0 || wid >= 16) return 0;
if (win_mod_base[wid] != 0) return 1;
int p = app_path_for_id(app_id);
if (p == 0) return 0;
int base = app_load_path(p, arg0);
if (base == 0) return -1;
win_mod_base[wid] = base;
int o = r32(base + 0x28); if (o != 0) win_mod_init[wid] = base + o;
o = r32(base + 0x2C);     if (o != 0) win_mod_draw[wid] = base + o;
o = r32(base + 0x30);     if (o != 0) win_mod_click[wid] = base + o;
o = r32(base + 0x34);     if (o != 0) win_mod_key[wid] = base + o;
o = r32(base + 0x38);     if (o != 0) win_mod_tick[wid] = base + o;
return 1;
}
int sns_peer_count() {
int c = 0;
for (int i = 0; i < 8; i++) {
int pe = SNS_PEER_TAB + i * 64;
if (r32(pe) != 0 && sns_peer_is_stale(pe) == 0) c = c + 1;
}
return c;
}
int sns_peer_name(int idx) {
int seen = 0;
for (int i = 0; i < 8; i++) {
int pe = SNS_PEER_TAB + i * 64;
if (r32(pe) != 0 && sns_peer_is_stale(pe) == 0) { if (seen == idx) return pe + 50; seen = seen + 1; }
}
return "Broadcast";
}
int sns_peer_node(int idx) {
int seen = 0;
for (int i = 0; i < 8; i++) {
int pe = SNS_PEER_TAB + i * 64;
if (r32(pe) != 0 && sns_peer_is_stale(pe) == 0) { if (seen == idx) return r32(pe); seen = seen + 1; }
}
return 0xFFFF;
}
void abi_init() {
for (int i = 0; i < 16; i++) {
win_mod_base[i] = 0;
win_mod_init[i] = 0;
win_mod_draw[i] = 0;
win_mod_click[i] = 0;
win_mod_key[i] = 0;
win_mod_tick[i] = 0;
}
w32(ABI_TABLE_ADDR + 0 * 4,  fn_addr(fs_find));
w32(ABI_TABLE_ADDR + 1 * 4,  fn_addr(fs_count));
w32(ABI_TABLE_ADDR + 2 * 4,  fn_addr(fs_nth_index));
w32(ABI_TABLE_ADDR + 3 * 4,  fn_addr(fs_entry_ptr));
w32(ABI_TABLE_ADDR + 4 * 4,  fn_addr(fs_entry_flags));
w32(ABI_TABLE_ADDR + 5 * 4,  fn_addr(fs_entry_data_ptr));
w32(ABI_TABLE_ADDR + 6 * 4,  fn_addr(fs_entry_size));
w32(ABI_TABLE_ADDR + 7 * 4,  fn_addr(fs_write));
w32(ABI_TABLE_ADDR + 8 * 4,  fn_addr(fs_delete));
w32(ABI_TABLE_ADDR + 9 * 4,  fn_addr(fs_free_bytes));
w32(ABI_TABLE_ADDR + 10 * 4, fn_addr(fs_used_bytes));
w32(ABI_TABLE_ADDR + 11 * 4, fn_addr(gui_set_win));
w32(ABI_TABLE_ADDR + 12 * 4, fn_addr(gui_reg_ctl));
w32(ABI_TABLE_ADDR + 13 * 4, fn_addr(gui_button));
w32(ABI_TABLE_ADDR + 14 * 4, fn_addr(wbtn));
w32(ABI_TABLE_ADDR + 15 * 4, fn_addr(wstr));
w32(ABI_TABLE_ADDR + 16 * 4, fn_addr(wnum));
w32(ABI_TABLE_ADDR + 17 * 4, fn_addr(gui_str_clip));
w32(ABI_TABLE_ADDR + 18 * 4, fn_addr(gui_caret_on));
w32(ABI_TABLE_ADDR + 19 * 4, fn_addr(gui_draw_vscroll));
w32(ABI_TABLE_ADDR + 20 * 4, fn_addr(gui_blit_clipped));
w32(ABI_TABLE_ADDR + 21 * 4, fn_addr(wm_open));
w32(ABI_TABLE_ADDR + 22 * 4, fn_addr(wm_close));
w32(ABI_TABLE_ADDR + 23 * 4, fn_addr(heap_alloc));
w32(ABI_TABLE_ADDR + 24 * 4, fn_addr(heap_free));
w32(ABI_TABLE_ADDR + 25 * 4, fn_addr(heap_free_bytes));
w32(ABI_TABLE_ADDR + 26 * 4, fn_addr(shell_print));
w32(ABI_TABLE_ADDR + 27 * 4, fn_addr(shell_open_file));
w32(ABI_TABLE_ADDR + 28 * 4, fn_addr(dlg_open));
w32(ABI_TABLE_ADDR + 29 * 4, fn_addr(dlg_draw));
w32(ABI_TABLE_ADDR + 30 * 4, fn_addr(dlg_click));
w32(ABI_TABLE_ADDR + 31 * 4, fn_addr(dlg_key));
w32(ABI_TABLE_ADDR + 32 * 4, fn_addr(clip_copy_bytes));
w32(ABI_TABLE_ADDR + 33 * 4, fn_addr(clip_paste_buf));
w32(ABI_TABLE_ADDR + 34 * 4, fn_addr(theme_select));
w32(ABI_TABLE_ADDR + 35 * 4, fn_addr(cc_rebuild_os_image));
w32(ABI_TABLE_ADDR + 36 * 4, fn_addr(asm_rebuild_native_cores));
w32(ABI_TABLE_ADDR + 37 * 4, fn_addr(net_send_chat));
w32(ABI_TABLE_ADDR + 38 * 4, fn_addr(net_send_file));
w32(ABI_TABLE_ADDR + 39 * 4, fn_addr(net_http_get));
w32(ABI_TABLE_ADDR + 40 * 4, fn_addr(sns_peer_count));
w32(ABI_TABLE_ADDR + 41 * 4, fn_addr(sns_peer_name));
w32(ABI_TABLE_ADDR + 42 * 4, fn_addr(sns_peer_node));
w32(ABI_TABLE_ADDR + 43 * 4, fn_addr(os_version_str));
w32(ABI_TABLE_ADDR + 44 * 4, fn_addr(app_load_path));
w32(ABI_TABLE_ADDR + 45 * 4, fn_addr(app_unload_base));
w32(ABI_TABLE_ADDR + 46 * 4, fn_addr(open_app_by_id));
w32(ABI_TABLE_ADDR + 47 * 4, fn_addr(field_key_common));
w32(ABI_TABLE_ADDR + 48 * 4, fn_addr(os_machine_name));
w32(ABI_TABLE_ADDR + 49 * 4, fn_addr(app_abi_state_sync));
w32(ABI_TABLE_ADDR + 50 * 4, fn_addr(heap_used_bytes));
w32(ABI_TABLE_ADDR + 51 * 4, fn_addr(app_register_tick));
w32(ABI_TABLE_ADDR + 52 * 4, fn_addr(theme_select));
w32(ABI_TABLE_ADDR + 53 * 4, fn_addr(net_send_snake_state));
w32(ABI_TABLE_ADDR + 54 * 4, fn_addr(srrp_append_str));
w32(ABI_TABLE_ADDR + 55 * 4, fn_addr(srrp_append_int));
w32(ABI_TABLE_ADDR + 56 * 4, fn_addr(srrp_kv));
w32(ABI_TABLE_ADDR + 57 * 4, fn_addr(sns_resolve));
w32(ABI_TABLE_ADDR + 58 * 4, fn_addr(web_set_page_buf));
}
