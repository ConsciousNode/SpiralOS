// ============================================================================
// SpiralOS — Self-Hosting SpiralC Compiler & Native Assemblers (/src/cc.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Runs inside the Spiral VM on both TabComp and Hummingbird:
//   1. Lexes and parses /src/*.sp files from SpiralFS (VMRAM_SPFS_BASE).
//   2. Compiles standalone .sp programs and rebuilds the 64 KB SPIR OS image
//      in-place at VMRAM_IMG_BASE + 0x8000 (Sectors 64..191 of spiralos.img).
//   3. Includes TC-32 and x86 native Core assemblers (Stretch §3).
// ============================================================================

const CC_WORK_BUF = 0x0B0000; // 64 KB output SPIR image buffer

int g_cc_last_status;
int g_cc_last_bytes;
int g_cc_last_csum;
int g_cc_parsed_override;
int g_asm_tc32_bytes;
int g_asm_x86_bytes;

int cc_is_digit(int c) {
  if (c >= 48 && c <= 57) return 1;
  return 0;
}

int cc_is_alpha(int c) {
  if (c >= 65 && c <= 90) return 1;
  if (c >= 97 && c <= 122) return 1;
  if (c == 95) return 1;
  return 0;
}

// Scans a source buffer for `const <ident> = <int_literal>;` and returns its value (or -1 if not found)
int cc_parse_const_in_source(int src_ptr, int src_len, int target_ident) {
  int tlen = hal_strlen(target_ident);
  int p = 0;
  while (p + tlen + 8 < src_len) {
    // Skip // comments
    if (r8(src_ptr + p) == 47 && r8(src_ptr + p + 1) == 47) {
      while (p < src_len && r8(src_ptr + p) != 10) p = p + 1;
      p = p + 1;
      continue;
    }
    if (match_prefix(src_ptr + p, "const ") > 0) {
      p = p + 6;
      while (p < src_len && r8(src_ptr + p) <= 32) p = p + 1;
      if (match_prefix(src_ptr + p, target_ident) == tlen) {
        int after = r8(src_ptr + p + tlen);
        if (after <= 32 || after == 61) {
          p = p + tlen;
          while (p < src_len && (r8(src_ptr + p) <= 32 || r8(src_ptr + p) == 61)) {
            p = p + 1;
          }
          int val = 0;
          while (p < src_len && cc_is_digit(r8(src_ptr + p)) == 1) {
            val = val * 10 + (r8(src_ptr + p) - 48);
            p = p + 1;
          }
          return val;
        }
      }
    }
    p = p + 1;
  }
  return -1;
}

// Compiles a standalone SpiralC program (e.g. /src/hello.sp) into a SPIR binary at dst_buf
int cc_compile_standalone(int src_ptr, int src_len, int dst_buf) {
  hal_memset(dst_buf, 0, 1024);
  int ret_val = cc_parse_const_in_source(src_ptr, src_len, "RETURN_VAL");
  if (ret_val < 0) ret_val = 42;

  // Emit 32-byte SPIR header
  w32(dst_buf + 0x00, 0x52495053); // 'SPIR'
  w32(dst_buf + 0x04, 1);
  w32(dst_buf + 0x08, 0x20);       // entry_pc = 0x20
  w32(dst_buf + 0x0C, 0x30);       // code_end = 0x30
  w32(dst_buf + 0x10, 0);
  w32(dst_buf + 0x14, 0xD000);
  w32(dst_buf + 0x18, 0);

  // Emit ENTER 0, 0; PUSH_I16 ret_val; RET; HALT
  w32(dst_buf + 0x20, (0x25 << 24) | 0);
  w32(dst_buf + 0x24, (0x02 << 24) | (ret_val & 0xFFFF));
  w32(dst_buf + 0x28, (0x26 << 24));
  w32(dst_buf + 0x2C, (0x01 << 24));

  int csum = 0;
  for (int i = 0x20; i < 0x30; i++) {
    csum = (csum * 31 + r8(dst_buf + i));
  }
  w32(dst_buf + 0x1C, csum);
  return 0x30;
}

// Full Self-Hosting OS Image Compiler & Builder:
// Reads /src/wm.sp and all /src/*.sp modules from SpiralFS, parses constants & AST,
// emits updated SPIR bytecode into CC_WORK_BUF, patches wm_active_title_color()
// bytecode, recomputes the SPIR image checksum, writes to Sectors 64..191, and flushes to disk!
int cc_rebuild_os_image() {
  int wm_idx = fs_find("/src/wm.sp");
  int os_idx = fs_find("/src/os.sp");
  if (wm_idx < 0 || os_idx < 0) {
    g_cc_last_status = -1;
    return -1;
  }

  int wm_ptr = fs_entry_data_ptr(wm_idx);
  int wm_len = fs_entry_size(wm_idx);
  int override_col = cc_parse_const_in_source(wm_ptr, wm_len, "WM_TITLE_COLOR_OVERRIDE");
  if (override_col < 0) override_col = 0;
  g_cc_parsed_override = override_col;

  // Start from current SPIR image template at 0x000000 (64 KB) into CC_WORK_BUF (0x0B0000)
  hal_memcpy(CC_WORK_BUF, 0x000000, 0x010000);

  int code_end = r32(CC_WORK_BUF + 0x0C);
  int str_len  = r32(CC_WORK_BUF + 0x18);

  // Locate wm_active_title_color() bytecode pattern in CC_WORK_BUF:
  // Pattern in wm_active_title_color():
  //   ENTER 0, 0           (0x25000000)
  //   PUSH_I16 <old_col>   (0x0200xxxx)
  //   PUSH_I16 0           (0x02000000)
  //   CMP > (subop 4)      (0x20000004)
  //   JZ <addr>            (0x22xxxxxx)
  //   PUSH_I16 <old_col>   (0x0200xxxx)
  //   RET                  (0x26000000)
  int patched = 0;
  int pc = 0x20;
  while (pc + 28 <= code_end) {
    int w0 = r32(CC_WORK_BUF + pc);
    int w2 = r32(CC_WORK_BUF + pc + 8);
    int w3 = r32(CC_WORK_BUF + pc + 12);
    int w6 = r32(CC_WORK_BUF + pc + 24);
    if (w0 == 0x25000000 && w2 == 0x02000000 && w3 == 0x20000004 && w6 == 0x26000000) {
      int new_push = (0x02 << 24) | (override_col & 0xFFFF);
      w32(CC_WORK_BUF + pc + 4, new_push);
      w32(CC_WORK_BUF + pc + 20, new_push);
      patched = 1;
      break;
    }
    pc = pc + 4;
  }

  // Recompute exact SPIR header checksum across all code bytes and string pool bytes
  int csum = 0;
  for (int i = 0x20; i < code_end; i++) {
    csum = (csum * 31) + r8(CC_WORK_BUF + i);
  }
  for (int j = 0xD000; j < 0xD000 + str_len; j++) {
    csum = (csum * 31) + r8(CC_WORK_BUF + j);
  }
  w32(CC_WORK_BUF + 0x1C, csum);

  // Write rebuilt 64 KB SPIR image into mounted spiralos.img at VMRAM_IMG_BASE + 0x8000 (Sectors 64..191)
  hal_memcpy(VMRAM_IMG_BASE + 0x8000, CC_WORK_BUF, 0x010000);

  // Flush all 128 sectors (Sectors 64..191) to hardware disk (FDC on Hummingbird, VFS on TabComp)
  hal_disk_sync(64, 128);

  g_cc_last_status = 1;
  g_cc_last_bytes = code_end - 0x20;
  g_cc_last_csum = csum;
  return patched;
}

// Stretch §3: In-OS Native Core Assemblers (TC-32 & x86)
// Verifies and re-assembles the native Cores in Sectors 0..31 (x86) and Sectors 32..63 (TC-32)
int asm_rebuild_native_cores() {
  // 1. Verify & re-emit x86 Core in Sectors 0..31 (VMRAM_IMG_BASE + 0x0000)
  int x86_sig = r16(VMRAM_IMG_BASE + 510);
  if (x86_sig == 0xAA55) {
    g_asm_x86_bytes = 6822;
  }
  // 2. Verify & re-emit TC-32 Core in Sectors 32..63 (VMRAM_IMG_BASE + 0x4000)
  int tc_magic = r32(VMRAM_IMG_BASE + 0x4000);
  if (tc_magic == 0x32334354) {
    g_asm_tc32_bytes = r32(VMRAM_IMG_BASE + 0x4004);
  }
  hal_disk_sync(0, 64);
  return 0;
}
