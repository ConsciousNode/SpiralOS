import "/src/app_abi.sp";
int g_set_mode; int g_field;
void sync_hal() {
if (r32(SHARED_ST + 0x38) == 1) return;
int d = hal_date();
if (d != 0) {
w32(SHARED_ST + 0x20, (d >>> 16) & 0xFFFF);
w32(SHARED_ST + 0x24, (d >>> 8) & 0xFF);
w32(SHARED_ST + 0x28, d & 0xFF);
w32(SHARED_ST + 0x2C, r8(VMRAM_RTC + 4));
w32(SHARED_ST + 0x30, r8(VMRAM_RTC + 5));
w32(SHARED_ST + 0x34, r8(VMRAM_RTC + 6));
}
}
void app_init(int abi, int arg0) { if (arg0 == -1) return; g_set_mode = 0; g_field = 0; sync_hal(); }
int days_in_mo(int yr, int mo) {
if (mo == 2) { if ((yr % 4 == 0 && yr % 100 != 0) || yr % 400 == 0) return 29; return 28; }
if (mo == 4 || mo == 6 || mo == 9 || mo == 11) return 30;
return 31;
}
int dow(int y, int m, int d) {
if (m < 3) { m = m + 12; y = y - 1; }
int k = y % 100; int j = y / 100;
return (d + (13 * (m + 1)) / 5 + k + k / 4 + j / 4 + 5 * j + 6) % 7;
}
int app2d(int dst, int dp, int val, int sep) {
w8(dst + dp, 48 + (val / 10) % 10);
w8(dst + dp + 1, 48 + val % 10);
w8(dst + dp + 2, sep);
if (sep != 0) return dp + 3;
return dp + 2;
}
void app_draw(int x, int y, int w, int h) {
gui_set_win(x, y, w, h);
sync_hal();
hal_rect(x + 4, y + 14, w - 8, h - 18, 16);
int yr = r32(SHARED_ST + 0x20); int mo = r32(SHARED_ST + 0x24); int dy = r32(SHARED_ST + 0x28);
int hr = r32(SHARED_ST + 0x2C); int mn = r32(SHARED_ST + 0x30); int sc = r32(SHARED_ST + 0x34);
if (r32(SHARED_ST + 0x38) == 1) {
int el = (hal_time() - r32(SHARED_ST + 0x3C)) / 1000;
if (el < 0) el = 0;
int tot = hr * 3600 + mn * 60 + sc + el;
sc = tot % 60; mn = (tot / 60) % 60; hr = (tot / 3600) % 24;
}
wbtn(w - 42, 16, 36, 10, "Set", g_set_mode);
if (yr == 0) { wstr(8, 18, "CLOCK UNSET", 12); }
else {
int b = SRRP_SCRATCH_BUF;
int p = app2d(b, 0, hr, 58); p = app2d(b, p, mn, 58); app2d(b, p, sc, 0);
wstr(8, 17, b, 14);
p = abi_srrp_app_int(b, 0, yr); w8(b + p, 45); p = app2d(b, p + 1, mo, 45); app2d(b, p, dy, 0);
wstr(8, 28, b, 15);
if (r32(SHARED_ST + 0x38) == 1) wstr(96, 28, "MANUAL", 11);
else wstr(96, 28, "RTC", 10);
}
if (g_set_mode == 1) {
wstr(8, 42, "Set Time (Up/Dn, Tab, Enter):", 14);
wbtn(8, 54, 34, 11, "Yr", g_field == 0);
wbtn(44, 54, 24, 11, "Mo", g_field == 1);
wbtn(70, 54, 24, 11, "Dy", g_field == 2);
wbtn(96, 54, 24, 11, "Hr", g_field == 3);
wbtn(122, 54, 24, 11, "Mn", g_field == 4);
wbtn(8, 70, 26, 11, " - ", 0); wbtn(38, 70, 26, 11, " + ", 0);
wbtn(72, 70, 44, 11, "Apply", 1);
return;
}
if (yr > 0) {
wstr(8, 40, "Su Mo Tu We Th Fr Sa", 11);
int fd = dow(yr, mo, 1); int dim = days_in_mo(yr, mo);
for (int d = 1; d <= dim; d++) {
int cell = fd + d - 1; int row = cell / 7; int col = cell % 7;
int cx = 8 + col * 24; int cy = 50 + row * 10;
if (d == dy) hal_rect(x + cx - 1, y + cy - 1, 18, 9, 196);
int dc = 7; if (d == dy) dc = 15;
wnum(cx, cy, d, dc);
}
}
}
void step_fld(int dl) {
int yr = r32(SHARED_ST + 0x20); int mo = r32(SHARED_ST + 0x24); int dy = r32(SHARED_ST + 0x28);
int hr = r32(SHARED_ST + 0x2C); int mn = r32(SHARED_ST + 0x30);
if (yr == 0) { yr = 2026; mo = 11; dy = 25; }
if (g_field == 0) yr = yr + dl;
else if (g_field == 1) { mo = mo + dl; if (mo < 1) mo = 12; if (mo > 12) mo = 1; }
else if (g_field == 2) { dy = dy + dl; if (dy < 1) dy = 31; if (dy > 31) dy = 1; }
else if (g_field == 3) hr = (hr + dl + 24) % 24;
else if (g_field == 4) mn = (mn + dl + 60) % 60;
w32(SHARED_ST + 0x20, yr); w32(SHARED_ST + 0x24, mo); w32(SHARED_ST + 0x28, dy);
w32(SHARED_ST + 0x2C, hr); w32(SHARED_ST + 0x30, mn);
}
void apply_man() {
if (r32(SHARED_ST + 0x20) == 0) { w32(SHARED_ST + 0x20, 2026); w32(SHARED_ST + 0x24, 11); w32(SHARED_ST + 0x28, 25); }
w32(SHARED_ST + 0x34, 0); w32(SHARED_ST + 0x38, 1); w32(SHARED_ST + 0x3C, hal_time());
g_set_mode = 0;
}
void app_click(int wid, int rx, int ry) {
if (ry >= 15 && ry <= 27 && rx >= 130) { g_set_mode = 1 - g_set_mode; return; }
if (g_set_mode == 1) {
if (ry >= 54 && ry <= 65) {
if (rx < 42) g_field = 0; else if (rx < 68) g_field = 1; else if (rx < 94) g_field = 2;
else if (rx < 120) g_field = 3; else g_field = 4;
} else if (ry >= 70 && ry <= 81) {
if (rx < 36) step_fld(-1); else if (rx < 68) step_fld(1); else apply_man();
}
}
}
void app_key(int ascii, int vk, int mods) {
if (ascii == 's' || ascii == 'S') { g_set_mode = 1 - g_set_mode; return; }
if (g_set_mode == 1) {
if (vk == 38 || ascii == '+') step_fld(1);
else if (vk == 40 || ascii == '-') step_fld(-1);
else if (vk == 39 || ascii == 9) g_field = (g_field + 1) % 5;
else if (vk == 37) g_field = (g_field + 4) % 5;
else if (ascii == 13) apply_man();
else if (vk == 27) g_set_mode = 0;
}
}
