// ============================================================================
// SpiralOS 1.4 "Daily Driver" — Kernel, HAL Wrappers, Preemptive Multitasking & App Tick API
// (/src/kernel.sp) · Studio: ConsciousNode SoftWorks · Licence: MIT
// ============================================================================

const SYS_EXIT          = 0;
const SYS_YIELD         = 1;
const SYS_TIME_MS       = 2;
const SYS_KEY_POLL      = 3;
const SYS_MOUSE_POLL    = 4;
const SYS_FILL_RECT     = 5;
const SYS_DRAW_CHAR     = 6;
const SYS_DRAW_STR      = 7;
const SYS_MEMCPY        = 8;
const SYS_MEMSET        = 9;
const SYS_DISK_SYNC     = 10;
const SYS_REBOOT        = 11;
const SYS_NET_SEND      = 12;
const SYS_NET_RECV      = 13;
const SYS_NET_INFO      = 14;
const SYS_SOUND_TONE    = 15;
const SYS_MACHINE_INFO  = 16;
const SYS_BLIT_RECT     = 17;
const SYS_STRCMP        = 18;
const SYS_STRLEN        = 19;
const SYS_ITOA          = 20;
const SYS_TASK_SPAWN_VM = 21;
const SYS_DATE          = 22;

const FONT_SANS_8X8     = 0;
const FONT_SERIF_8X16   = 1;
const VMRAM_FONT_SERIF  = 0x091000;
const VMRAM_FONT_SANS2  = 0x091800;
const VMRAM_RTC         = 0x0FFD90;

const VMRAM_VRAM        = 0x0F0000;
const VMRAM_PALETTE     = 0x0FFA00;
const VMRAM_STATUS      = 0x0FFD00;
const VMRAM_TCB_BASE    = 0x0FFE00;
const VMRAM_SCHED_HDR   = 0x0FFF00;
const VMRAM_IMG_BASE    = 0x200000;
const VMRAM_SPFS_BASE   = 0x228000;
const NUM_STR_BUF       = 0x04DF00;

// Process / Task Table (up to 16 desktop tasks + 8 hardware-preempted VM stack tasks)
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
int g_has_snet;

// App Tick API table (indexed by app_id 0..15)
int app_tick_interval[16];
int app_tick_last_ms[16];
int app_tick_count[16];

// Preemptive compute worker progress counters
int g_worker_a_progress;
int g_worker_b_progress;
int g_worker_a_tid;
int g_worker_b_tid;

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

int hal_char(int x, int y, int ch, int fg, int bg, int font) {
  return sys(6, x, y, ch, fg, bg, font);
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

int hal_task_spawn_vm(int entry_pc, int arg0) {
  return sys(21, entry_pc, arg0);
}

int hal_date() {
  return sys(22);
}

void set_pal_rgb(int idx, int r, int g, int b) {
  int off = VMRAM_PALETTE + idx * 3;
  w8(off, r);
  w8(off + 1, g);
  w8(off + 2, b);
}

void init_spiral_palette() {
  for (int i = 0; i < 16; i++) {
    set_pal_rgb(16 + i, 12 + i * 7, 16 + i * 8, 34 + i * 11);
  }
  for (int j = 0; j < 16; j++) {
    set_pal_rgb(48 + j, 22 + j * 14, 10 + j * 9, 2 + j * 2);
  }
  for (int k = 0; k < 16; k++) {
    set_pal_rgb(64 + k, 40 + k * 11, 20 + k * 8, 95 + k * 10);
  }
  for (int m = 0; m < 16; m++) {
    set_pal_rgb(80 + m, 8 + m * 5, 24 + m * 13, 20 + m * 9);
  }
  set_pal_rgb(196, 235, 55, 90);
  set_pal_rgb(200, 50, 210, 140);
  set_pal_rgb(208, 255, 180, 40);
}

void app_register_tick(int app_id, int interval_ms) {
  if (app_id >= 0 && app_id < 16) {
    app_tick_interval[app_id] = interval_ms;
    app_tick_last_ms[app_id] = hal_time();
  }
}

// Preemptive CPU-bound background worker A (runs on its own VM stack without calling hal_yield)
int compute_worker_a(int max_iters) {
  int acc = 17;
  int i = 0;
  while (i < max_iters) {
    acc = (acc * 1103515245 + 12345) ^ (i * 37);
    g_worker_a_progress = g_worker_a_progress + 1;
    w32(VMRAM_STATUS + 0x70, g_worker_a_progress);
    i = i + 1;
  }
  return acc;
}

// Preemptive CPU-bound background worker B (runs on its own VM stack without calling hal_yield)
int compute_worker_b(int max_iters) {
  int acc = 29;
  int i = 0;
  while (i < max_iters) {
    acc = (acc * 1664525 + 1013904223) ^ (i * 73);
    g_worker_b_progress = g_worker_b_progress + 1;
    w32(VMRAM_STATUS + 0x74, g_worker_b_progress);
    i = i + 1;
  }
  return acc;
}

void spawn_compute_workers(int max_iters) {
  g_worker_a_progress = 0;
  g_worker_b_progress = 0;
  w32(VMRAM_STATUS + 0x70, 0);
  w32(VMRAM_STATUS + 0x74, 0);
  g_worker_a_tid = hal_task_spawn_vm(fn_addr(compute_worker_a), max_iters);
  g_worker_b_tid = hal_task_spawn_vm(fn_addr(compute_worker_b), max_iters);
}

void kernel_init() {
  g_machine_id = hal_info(0);
  g_has_snet = hal_info(4);
  if (g_has_snet == 1) {
    g_local_node_id = hal_net_info(0, 0);
  } else {
    g_local_node_id = 0;
  }
  g_uptime_frames = 0;
  g_num_tasks = 0;
  g_worker_a_progress = 0;
  g_worker_b_progress = 0;
  g_worker_a_tid = -1;
  g_worker_b_tid = -1;
  for (int i = 0; i < MAX_TASKS; i++) {
    task_active[i] = 0;
    task_app_id[i] = 0;
    task_win_id[i] = -1;
    task_ticks[i] = 0;
    task_msg_type[i] = 0;
    app_tick_interval[i] = 0;
    app_tick_last_ms[i] = 0;
    app_tick_count[i] = 0;
  }
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

// Single canonical version string used across boot banner, shell, About, Build Station, and /docs/README.txt
int os_version_str() {
  return "SpiralOS 1.4 \"Daily Driver\"";
}

int os_machine_name() {
  if (g_machine_id == 1) return "TabComp TC-32";
  if (g_machine_id == 3) return "Triton";
  return "Hummingbird i586";
}

int tok_find_idx(int s, int list_str) {
  int idx = 0;
  int p = 0;
  while (r8(list_str + p) != 0) {
    int k = 0;
    int ok = 1;
    while (r8(list_str + p + k) != 0 && r8(list_str + p + k) != 124) {
      if (r8(s + k) != r8(list_str + p + k)) ok = 0;
      k = k + 1;
    }
    if (ok == 1 && r8(s + k) == 0) return idx;
    p = p + k;
    if (r8(list_str + p) == 124) p = p + 1;
    idx = idx + 1;
  }
  return -1;
}
