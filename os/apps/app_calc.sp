import "/src/app_abi.sp";
int g_acc; int g_cur; int g_op; int g_ent;
void app_init(int abi, int arg0) { if (arg0 == -1) return; g_acc = 0; g_cur = 0; g_op = 0; g_ent = 0; }
void press_dig(int d) {
if (g_ent == 0) { g_cur = d; g_ent = 1; }
else g_cur = g_cur * 10 + d;
}
void eval_op(int next_op) {
if (g_op == 0) g_acc = g_cur;
else if (g_op == 1) g_acc = g_acc + g_cur;
else if (g_op == 2) g_acc = g_acc - g_cur;
else if (g_op == 3) g_acc = g_acc * g_cur;
else if (g_op == 4 && g_cur != 0) g_acc = g_acc / g_cur;
g_cur = g_acc; g_op = next_op; g_ent = 0;
}
void app_draw(int x, int y, int w, int h) {
gui_set_win(x, y, w, h);
hal_rect(x + 6, y + 16, w - 12, 14, 0);
wnum(10, 19, g_cur, 14);
int labels = "7\08\09\0/\04\05\06\0*\01\02\03\0-\0C\00\0=\0+";
for (int r = 0; r < 4; r++) {
for (int c = 0; c < 4; c++) {
wbtn(6 + c * 22, 34 + r * 15, 20, 13, labels + (r * 4 + c) * 2, 0);
}
}
}
void app_click(int wid, int rx, int ry) {
if (ry < 34) return;
int r = (ry - 34) / 15; int c = (rx - 6) / 22;
if (r < 0 || r > 3 || c < 0 || c > 3) return;
int idx = r * 4 + c;
if (idx == 0) press_dig(7); else if (idx == 1) press_dig(8); else if (idx == 2) press_dig(9); else if (idx == 3) eval_op(4);
else if (idx == 4) press_dig(4); else if (idx == 5) press_dig(5); else if (idx == 6) press_dig(6); else if (idx == 7) eval_op(3);
else if (idx == 8) press_dig(1); else if (idx == 9) press_dig(2); else if (idx == 10) press_dig(3); else if (idx == 11) eval_op(2);
else if (idx == 12) { g_acc = 0; g_cur = 0; g_op = 0; g_ent = 0; }
else if (idx == 13) press_dig(0); else if (idx == 14) eval_op(0); else if (idx == 15) eval_op(1);
}
void app_key(int ascii, int vk, int mods) {
if (ascii >= 48 && ascii <= 57) press_dig(ascii - 48);
else if (ascii == 43) eval_op(1); else if (ascii == 45) eval_op(2);
else if (ascii == 42) eval_op(3); else if (ascii == 47) eval_op(4);
else if (ascii == 13 || ascii == 61) eval_op(0);
else if (ascii == 99 || ascii == 67) { g_acc = 0; g_cur = 0; g_op = 0; g_ent = 0; }
}
