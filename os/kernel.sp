// ============================================================================
// SpiralOS — Kernel, HAL Wrappers, Process Scheduler & IPC (/src/kernel.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
// ============================================================================

const SYS_EXIT         = 0;
const SYS_YIELD        = 1;
const SYS_TIME_MS      = 2;
const SYS_KEY_POLL     = 3;
const SYS_MOUSE_POLL   = 4;
const SYS_FILL_RECT    = 5;
const SYS_DRAW_CHAR    = 6;
const SYS_DRAW_STR     = 7;
const SYS_MEMCPY       = 8;
const SYS_MEMSET       = 9;
const SYS_DISK_SYNC    = 10;
const SYS_REBOOT       = 11;
const SYS_NET_SEND     = 12;
const SYS_NET_RECV     = 13;
const SYS_NET_INFO     = 14;
const SYS_SOUND_TONE   = 15;
const SYS_MACHINE_INFO = 16;
const SYS_BLIT_RECT    = 17;
const SYS_STRCMP       = 18;
const SYS_STRLEN       = 19;
const SYS_ITOA         = 20;

const VMRAM_VRAM       = 0x0F0000;
const VMRAM_PALETTE    = 0x0FFA00;
const VMRAM_STATUS     = 0x0FFD00;
const VMRAM_IMG_BASE   = 0x200000;
const VMRAM_SPFS_BASE  = 0x218000;

// Process / Task Table (up to 16 concurrent tasks)
const MAX_TASKS = 16;
int task_active[16];
int task_app_id[16];
int task_win_id[16];
int task_ticks[16];
int task_msg_type[16];
int task_msg_arg0[16];
int task_msg_arg1[16];
int g_num_tasks;
int g_uptime_frames;
int g_machine_id;
int g_local_node_id;

// HAL Wrapper Functions
int hal_yield() {
  g_uptime_frames = g_uptime_frames + 1;
  return sys(1);
}

int hal_time() {
  return sys(2);
}

int hal_key() {
  return sys(3);
}

int hal_mouse(int out_ptr) {
  return sys(4, out_ptr);
}

int hal_rect(int x, int y, int w, int h, int col) {
  return sys(5, x, y, w, h, col);
}

int hal_char(int x, int y, int ch, int fg, int bg) {
  return sys(6, x, y, ch, fg, bg);
}

int hal_str(int x, int y, int s, int fg, int bg) {
  return sys(7, x, y, s, fg, bg);
}

int hal_memcpy(int dst, int src, int len) {
  return sys(8, dst, src, len);
}

int hal_memset(int dst, int val, int len) {
  return sys(9, dst, val, len);
}

int hal_disk_sync(int start_sec, int count_sec) {
  return sys(10, start_sec, count_sec);
}

int hal_reboot() {
  return sys(11);
}

int hal_net_send(int buf, int len) {
  return sys(12, buf, len);
}

int hal_net_recv(int buf, int max_len) {
  return sys(13, buf, max_len);
}

int hal_net_info(int cmd, int val) {
  return sys(14, cmd, val);
}

int hal_beep(int freq, int ms, int wave) {
  return sys(15, freq, ms, wave);
}

int hal_info(int q) {
  return sys(16, q);
}

int hal_blit(int x, int y, int w, int h, int src) {
  return sys(17, x, y, w, h, src);
}

int hal_strcmp(int a, int b) {
  return sys(18, a, b);
}

int hal_strlen(int s) {
  return sys(19, s);
}

int hal_itoa(int val, int buf, int base) {
  return sys(20, val, buf, base);
}

void set_pal_rgb(int idx, int r, int g, int b) {
  int off = VMRAM_PALETTE + idx * 3;
  w8(off, r);
  w8(off + 1, g);
  w8(off + 2, b);
}

void init_spiral_palette() {
  // 16..31: Spiral Aether Twilight Slate & Indigo ramp
  for (int i = 0; i < 16; i++) {
    set_pal_rgb(16 + i, 12 + i * 7, 16 + i * 8, 34 + i * 11);
  }
  // 48..63: Kyoto Amber Phosphor ramp
  for (int j = 0; j < 16; j++) {
    set_pal_rgb(48 + j, 22 + j * 14, 10 + j * 9, 2 + j * 2);
  }
  // 64..79: Iridescent Violet/Magenta & Cyan Helix accents
  for (int k = 0; k < 16; k++) {
    set_pal_rgb(64 + k, 40 + k * 11, 20 + k * 8, 95 + k * 10);
  }
  // 80..95: Neo-Taipei Emerald Jade ramp
  for (int m = 0; m < 16; m++) {
    set_pal_rgb(80 + m, 8 + m * 5, 24 + m * 13, 20 + m * 9);
  }
  // High-visibility semantic colors
  set_pal_rgb(196, 235, 55, 90);  // Crimson / Rose (used in Self-Host Demo!)
  set_pal_rgb(200, 50, 210, 140); // Mint Signal
  set_pal_rgb(208, 255, 180, 40); // Solar Gold
}

void kernel_init() {
  g_machine_id = hal_info(0);
  g_local_node_id = hal_net_info(0, 0);
  g_uptime_frames = 0;
  g_num_tasks = 0;
  for (int i = 0; i < MAX_TASKS; i++) {
    task_active[i] = 0;
    task_app_id[i] = 0;
    task_win_id[i] = -1;
    task_ticks[i] = 0;
    task_msg_type[i] = 0;
  }
  // Task 0: Kernel & Window Manager
  task_active[0] = 1;
  task_app_id[0] = 100;
  g_num_tasks = 1;
  init_spiral_palette();
}

int task_spawn(int app_id, int win_id) {
  for (int i = 1; i < MAX_TASKS; i++) {
    if (task_active[i] == 0) {
      task_active[i] = 1;
      task_app_id[i] = app_id;
      task_win_id[i] = win_id;
      task_ticks[i] = 0;
      task_msg_type[i] = 0;
      g_num_tasks = g_num_tasks + 1;
      return i;
    }
  }
  return -1;
}

void task_kill_by_win(int win_id) {
  for (int i = 1; i < MAX_TASKS; i++) {
    if (task_active[i] == 1 && task_win_id[i] == win_id) {
      task_active[i] = 0;
      if (g_num_tasks > 1) g_num_tasks = g_num_tasks - 1;
    }
  }
}

int ipc_send(int dst_task, int msg_type, int a0, int a1) {
  if (dst_task < 0 || dst_task >= MAX_TASKS) return -1;
  if (task_active[dst_task] == 0) return -1;
  task_msg_type[dst_task] = msg_type;
  task_msg_arg0[dst_task] = a0;
  task_msg_arg1[dst_task] = a1;
  return 0;
}
