import "/src/app_abi.sp";
const PC_SNAKE_NO_SELF = 0;
int sx[32]; int sy[32]; int slen; int sdx; int sdy; int sfx; int sfy; int sscore; int ssteps; int snet; int sover;
void snake_reset() {
slen = 4; sdx = 1; sdy = 0; sfx = 12; sfy = 6; sscore = 0; sover = 0;
for (int i = 0; i < 4; i++) { sx[i] = 6 - i; sy[i] = 6; }
w32(VMRAM_STATUS + 0x50, 0);
}
void app_init(int abi, int arg0) { if (arg0 == -1) return; snake_reset(); abi_set_tick(10, 125); }
void app_tick() {
if (sover == 1) return;
ssteps = ssteps + 1;
w32(VMRAM_STATUS + 0x60, ssteps);
int nx = sx[0] + sdx; int ny = sy[0] + sdy;
if (nx < 0 || nx >= 22 || ny < 0 || ny >= 12) { sover = 1; w32(VMRAM_STATUS + 0x50, 1); return; }
if (PC_SNAKE_NO_SELF == 0) {
for (int j = 0; j < slen - 1; j++) {
if (sx[j] == nx && sy[j] == ny) { sover = 1; w32(VMRAM_STATUS + 0x50, 1); return; }
}
}
for (int i = slen - 1; i > 0; i = i - 1) { sx[i] = sx[i - 1]; sy[i] = sy[i - 1]; }
sx[0] = nx; sy[0] = ny;
if (nx == sfx && ny == sfy) {
sscore = sscore + 10;
if (slen < 30) { sx[slen] = sx[slen - 1]; sy[slen] = sy[slen - 1]; slen = slen + 1; }
sfx = (sfx * 5 + 3) % 15; sfy = (sfy * 3 + 5) % 11;
}
abi_net_snake(sx[0], sy[0], sdx, sdy, sscore);
}
void app_draw(int x, int y, int w, int h) {
gui_set_win(x, y, w, h);
int pw = w - 8; if (pw > 128) pw = 128;
int ph = h - 30; if (ph > 72) ph = 72;
if (pw > 0 && ph > 0) hal_rect(x + 4, y + 16, pw, ph, 0);
if ((sfx + 1) * 6 <= pw && (sfy + 1) * 6 <= ph) hal_rect(x + 4 + sfx * 6, y + 16 + sfy * 6, 5, 5, 196);
for (int i = 0; i < slen; i++) {
if ((sx[i] + 1) * 6 <= pw && (sy[i] + 1) * 6 <= ph) {
int col = 10; if (i == 0) col = 14;
hal_rect(x + 4 + sx[i] * 6, y + 16 + sy[i] * 6, 5, 5, col);
}
}
wstr(6, h - 12, "Score:", 15); wnum(58, h - 12, sscore, 14);
if (sover == 1) wstr(90, h - 12, "OVER", 12);
wbtn(w - 42, h - 13, 36, 10, "Net", snet);
}
void app_key(int ascii, int vk, int mods) {
if (sover == 1 && (ascii == 13 || ascii == 32 || ascii == 'r')) { snake_reset(); return; }
if ((vk == 38 || ascii == 'w') && sdy != 1) { sdx = 0; sdy = -1; }
else if ((vk == 40 || ascii == 's') && sdy != -1) { sdx = 0; sdy = 1; }
else if ((vk == 37 || ascii == 'a') && sdx != 1) { sdx = -1; sdy = 0; }
else if ((vk == 39 || ascii == 'd') && sdx != -1) { sdx = 1; sdy = 0; }
app_tick();
}
void app_click(int wid, int rx, int ry) {
if (sover == 1) snake_reset();
app_tick();
}
