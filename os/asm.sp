// ============================================================================
// SpiralOS 1.4 "Daily Driver" — In-OS Symbolic Native Core Assemblers (/src/asm.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Two genuine two-pass symbolic assemblers written in Spiral Language:
//   1. asm_assemble_tc32() : Assembles /src/core_tc32.asm into TC-32 machine
//      code and writes Sectors 32..63 (VMRAM_IMG_BASE + 0x4000).
//   2. asm_assemble_x86()  : Assembles /src/core_x86.asm into 16/32-bit x86
//      machine code and writes Sectors 0..31 (VMRAM_IMG_BASE + 0x0000).
// Both produce binaries 100% byte-identical to the stage-0 JS core builders.
// ============================================================================

const ASM_LBL_TAB   = 0x080000; // 256 entries * 36B: [name:32][addr:4]
const ASM_FIX_TAB   = 0x083000; // 512 entries * 48B: [name:32][pos:4][type:4][op:4][rd:4]
const ASM_TOK_BUF   = 0x089000; // 128B token scratch
const ASM_WORK_BUF  = 0x0D0000; // 16 KB output machine code buffer

int g_asm_tc32_bytes;
int g_asm_x86_bytes;
int g_asm_lbl_cnt;
int g_asm_fix_cnt;
int g_asm_out_len;

void asm_add_label(int name_ptr, int addr) {
  int e = ASM_LBL_TAB + g_asm_lbl_cnt * 36;
  cc_strcpy(e, name_ptr);
  w32(e + 32, addr);
  g_asm_lbl_cnt = g_asm_lbl_cnt + 1;
}

int asm_find_label(int name_ptr) {
  int sig = cc_name_sig(name_ptr);
  for (int i = 0; i < g_asm_lbl_cnt; i++) {
    int e = ASM_LBL_TAB + i * 36;
    if (r32(e + 28) == sig && hal_strcmp(e, name_ptr)) {
      return r32(e + 32);
    }
  }
  return -1;
}

void asm_add_fixup(int pos, int name_ptr, int ftype, int op, int rd) {
  int e = ASM_FIX_TAB + g_asm_fix_cnt * 48;
  cc_strcpy(e, name_ptr);
  w32(e + 32, pos);
  w32(e + 36, ftype);
  w32(e + 40, op);
  w32(e + 44, rd);
  g_asm_fix_cnt = g_asm_fix_cnt + 1;
}

int asm_skip_ws(int src, int p, int end_p) {
  while (p < end_p) {
    int c = r8(src + p);
    if (c == 32 || c == 9 || c == 44 || c == 13) p = p + 1;
    else break;
  }
  return p;
}

int asm_read_word(int src, int p, int end_p, int dst) {
  p = asm_skip_ws(src, p, end_p);
  int len = 0;
  while (p < end_p) {
    int c = r8(src + p);
    if (c <= 32 || c == 44 || c == 59) break;
    if (len < 62) {
      w8(dst + len, c);
      len = len + 1;
    }
    p = p + 1;
  }
  w8(dst + len, 0);
  return p;
}

int asm_parse_int(int s_ptr) {
  int i = 0;
  int sign = 1;
  if (r8(s_ptr) == 45) {
    sign = -1;
    i = 1;
  }
  int v = 0;
  if (r8(s_ptr + i) == 48 && (r8(s_ptr + i + 1) == 120 || r8(s_ptr + i + 1) == 88)) {
    i = i + 2;
    while (cc_is_hex(r8(s_ptr + i)) == 1) {
      v = (v << 4) | cc_hex_val(r8(s_ptr + i));
      i = i + 1;
    }
  } else {
    while (cc_is_digit(r8(s_ptr + i)) == 1) {
      v = v * 10 + (r8(s_ptr + i) - 48);
      i = i + 1;
    }
  }
  return v * sign;
}

int asm_parse_tc_reg(int s_ptr) {
  if (r8(s_ptr) == 82 || r8(s_ptr) == 114) {
    return asm_parse_int(s_ptr + 1);
  }
  return 0;
}

int asm_find_tok(int s, int list_str, int hex_str) {
  int idx = tok_find_idx(s, list_str);
  if (idx < 0) return -1;
  return (cc_hex_val(r8(hex_str + idx * 2)) << 4) | cc_hex_val(r8(hex_str + idx * 2 + 1));
}

int asm_tc32_r_op(int m) {
  return asm_find_tok(m, "ADD|SUB|MUL|DIV|MOD|UDIV|UMOD|AND|OR|XOR|SHL|SHR|SAR|CMP", "05060708090a0b0c0d0e0f10111a");
}

int asm_tc32_i_op(int m) {
  return asm_find_tok(m, "MOV|LUI16|LHI|ADDI|SUBI|ANDI|SHLI|SHRI|SARI|CMPI|LDBU|LDBS|LDHU|LDW|STB|STH|STW|RET|JR|SETCC", "0103041213141718191b1c1d1e202122232e3536");
}

int asm_tc32_j_op(int m) {
  return asm_find_tok(m, "JMP|JEQ|JNE|JLT|JGE|JLE|JGT|CALL", "262728292a2b2c2d");
}

void asm_emit32(int w) {
  w32(ASM_WORK_BUF + g_asm_out_len, w);
  g_asm_out_len = g_asm_out_len + 4;
}

int asm_assemble_tc32() {
  int fidx = fs_find("/src/core_tc32.asm");
  if (fidx < 0) return -1;
  int src = fs_entry_data_ptr(fidx);
  int slen = fs_entry_size(fidx);

  g_asm_lbl_cnt = 0;
  g_asm_fix_cnt = 0;
  g_asm_out_len = 0;
  hal_memset(ASM_WORK_BUF, 0, 16384);

  int p = 0;
  while (p < slen) {
    int line_end = p;
    while (line_end < slen && r8(src + line_end) != 10) line_end = line_end + 1;

    int lp = asm_skip_ws(src, p, line_end);
    if (lp < line_end && r8(src + lp) != 59) {
      int tok1 = ASM_TOK_BUF;
      int tok2 = ASM_TOK_BUF + 32;
      int tok3 = ASM_TOK_BUF + 64;
      int tok4 = ASM_TOK_BUF + 96;
      lp = asm_read_word(src, lp, line_end, tok1);
      int tlen = hal_strlen(tok1);

      if (tlen > 1 && r8(tok1 + tlen - 1) == 58) {
        w8(tok1 + tlen - 1, 0);
        asm_add_label(tok1, g_asm_out_len);
      } else if (hal_strcmp(tok1, ".dd")) {
        lp = asm_read_word(src, lp, line_end, tok2);
        asm_add_fixup(g_asm_out_len, tok2, 3, 0, 0);
        asm_emit32(0);
      } else if (hal_strcmp(tok1, ".hex")) {
        lp = asm_skip_ws(src, lp, line_end);
        int w_acc = 0;
        int b_idx = 0;
        while (lp + 1 < line_end) {
          int h1 = r8(src + lp);
          int h2 = r8(src + lp + 1);
          if (cc_is_hex(h1) == 0 || cc_is_hex(h2) == 0) break;
          int bv = (cc_hex_val(h1) << 4) | cc_hex_val(h2);
          w_acc = w_acc | (bv << (b_idx * 8));
          b_idx = b_idx + 1;
          if (b_idx == 4) {
            asm_emit32(w_acc);
            w_acc = 0;
            b_idx = 0;
          }
          lp = lp + 2;
        }
      } else if (hal_strcmp(tok1, ".ascii")) {
        while (lp < line_end && r8(src + lp) != 34) lp = lp + 1;
        if (lp < line_end && r8(src + lp) == 34) lp = lp + 1;
        for (int b = 0; b < 16; b++) w8(ASM_WORK_BUF + g_asm_out_len + b, 0);
        int bi = 0;
        while (lp < line_end && r8(src + lp) != 34 && bi < 15) {
          w8(ASM_WORK_BUF + g_asm_out_len + bi, r8(src + lp));
          lp = lp + 1;
          bi = bi + 1;
        }
        g_asm_out_len = g_asm_out_len + 16;
      } else if (hal_strcmp(tok1, "LA")) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        int rd = asm_parse_tc_reg(tok2);
        asm_add_fixup(g_asm_out_len, tok3, 2, 0, rd);
        asm_emit32((0x03 << 24) | ((rd & 15) << 20));
        asm_emit32((0x04 << 24) | ((rd & 15) << 20));
      } else if (hal_strcmp(tok1, "SYS")) {
        lp = asm_read_word(src, lp, line_end, tok2);
        int snum = asm_parse_int(tok2);
        asm_emit32((0x2F << 24) | (snum & 0xFFFF));
      } else {
        int jop = asm_tc32_j_op(tok1);
        if (jop >= 0) {
          lp = asm_read_word(src, lp, line_end, tok2);
          asm_add_fixup(g_asm_out_len, tok2, 1, jop, 0);
          asm_emit32((jop & 0x3F) << 24);
        } else {
          int rop = asm_tc32_r_op(tok1);
          if (rop >= 0) {
            lp = asm_read_word(src, lp, line_end, tok2);
            lp = asm_read_word(src, lp, line_end, tok3);
            lp = asm_read_word(src, lp, line_end, tok4);
            int rd = asm_parse_tc_reg(tok2);
            int ra = asm_parse_tc_reg(tok3);
            int rb = asm_parse_tc_reg(tok4);
            asm_emit32(((rop & 0x3F) << 24) | ((rd & 15) << 20) | ((ra & 15) << 16) | ((rb & 15) << 12));
          } else {
            int iop = asm_tc32_i_op(tok1);
            if (iop >= 0) {
              lp = asm_read_word(src, lp, line_end, tok2);
              lp = asm_read_word(src, lp, line_end, tok3);
              lp = asm_read_word(src, lp, line_end, tok4);
              int rd = asm_parse_tc_reg(tok2);
              int ra = asm_parse_tc_reg(tok3);
              int imm = asm_parse_int(tok4);
              asm_emit32(((iop & 0x3F) << 24) | ((rd & 15) << 20) | ((ra & 15) << 16) | (imm & 0xFFFF));
            }
          }
        }
      }
    }
    p = line_end + 1;
  }

  for (int i = 0; i < g_asm_fix_cnt; i++) {
    int fx = ASM_FIX_TAB + i * 48;
    int target = asm_find_label(fx);
    int fpos = r32(fx + 32);
    int ftype = r32(fx + 36);
    int fop = r32(fx + 40);
    int frd = r32(fx + 44);
    if (ftype == 1) {
      w32(ASM_WORK_BUF + fpos, ((fop & 0x3F) << 24) | (target & 0x00FFFFFF));
    } else if (ftype == 2) {
      w32(ASM_WORK_BUF + fpos, (0x03 << 24) | ((frd & 15) << 20) | (target & 0xFFFF));
      w32(ASM_WORK_BUF + fpos + 4, (0x04 << 24) | ((frd & 15) << 20) | ((target >>> 16) & 0xFFFF));
    } else if (ftype == 3) {
      w32(ASM_WORK_BUF + fpos, target);
    }
  }

  hal_memset(VMRAM_IMG_BASE + 0x4000, 0, 16384);
  w32(VMRAM_IMG_BASE + 0x4000, 0x32334354);
  w32(VMRAM_IMG_BASE + 0x4004, g_asm_out_len);
  hal_memcpy(VMRAM_IMG_BASE + 0x4008, ASM_WORK_BUF, g_asm_out_len);
  hal_disk_sync(32, 32);

  g_asm_tc32_bytes = g_asm_out_len;
  return g_asm_out_len;
}

void asm_emit8(int b) {
  w8(ASM_WORK_BUF + g_asm_out_len, b & 0xFF);
  g_asm_out_len = g_asm_out_len + 1;
}

int asm_parse_x86_reg(int s_ptr) {
  int r = tok_find_idx(s_ptr, "eax|ecx|edx|ebx|esp|ebp|esi|edi");
  if (r < 0) return 0;
  return r;
}

void asm_x86_mem_disp(int reg_field, int base_reg, int disp) {
  if (disp == 0 && base_reg != 5) {
    asm_emit8(((reg_field & 7) << 3) | (base_reg & 7));
    if (base_reg == 4) asm_emit8(0x24);
  } else if (disp >= -128 && disp <= 127) {
    asm_emit8(0x40 | ((reg_field & 7) << 3) | (base_reg & 7));
    if (base_reg == 4) asm_emit8(0x24);
    asm_emit8(disp & 0xFF);
  } else {
    asm_emit8(0x80 | ((reg_field & 7) << 3) | (base_reg & 7));
    if (base_reg == 4) asm_emit8(0x24);
    asm_emit32(disp);
  }
}

void asm_x86_alu_ri(int subop, int reg, int imm) {
  if (imm >= -128 && imm <= 127) {
    asm_emit8(0x83);
    asm_emit8(0xC0 | ((subop & 7) << 3) | (reg & 7));
    asm_emit8(imm & 0xFF);
  } else {
    asm_emit8(0x81);
    asm_emit8(0xC0 | ((subop & 7) << 3) | (reg & 7));
    asm_emit32(imm);
  }
}

void asm_x86_shift_ri(int subop, int reg, int count) {
  asm_emit8(0xC1);
  asm_emit8(0xC0 | ((subop & 7) << 3) | (reg & 7));
  asm_emit8(count & 0xFF);
}

int asm_x86_jcc_code(int m) {
  return asm_find_tok(m, "je|jne|jl|jge|jle|jg|jb|ja", "84858c8d8e8f8287");
}

int asm_x86_rr_op(int m) {
  return asm_find_tok(m, "mov_rr|add_rr|sub_rr|and_rr|or_rr|xor_rr|cmp_rr", "89012921093139");
}

int asm_assemble_x86() {
  int fidx = fs_find("/src/core_x86.asm");
  if (fidx < 0) return -1;
  int src = fs_entry_data_ptr(fidx);
  int slen = fs_entry_size(fidx);

  g_asm_lbl_cnt = 0;
  g_asm_fix_cnt = 0;
  g_asm_out_len = 0;
  hal_memset(ASM_WORK_BUF, 0, 16384);

  int base_addr = 0x7C00;
  int p = 0;
  while (p < slen) {
    int line_end = p;
    while (line_end < slen && r8(src + line_end) != 10) line_end = line_end + 1;

    int lp = asm_skip_ws(src, p, line_end);
    if (lp < line_end && r8(src + lp) != 59) {
      int tok1 = ASM_TOK_BUF;
      int tok2 = ASM_TOK_BUF + 32;
      int tok3 = ASM_TOK_BUF + 64;
      int tok4 = ASM_TOK_BUF + 96;
      lp = asm_read_word(src, lp, line_end, tok1);
      int tlen = hal_strlen(tok1);

      if (tlen > 1 && r8(tok1 + tlen - 1) == 58) {
        w8(tok1 + tlen - 1, 0);
        asm_add_label(tok1, base_addr + g_asm_out_len);
      } else if (hal_strcmp(tok1, ".org")) {
        lp = asm_read_word(src, lp, line_end, tok2);
        base_addr = asm_parse_int(tok2);
      } else if (hal_strcmp(tok1, ".hex")) {
        lp = asm_skip_ws(src, lp, line_end);
        while (lp + 1 < line_end) {
          int h1 = r8(src + lp);
          int h2 = r8(src + lp + 1);
          if (cc_is_hex(h1) == 0 || cc_is_hex(h2) == 0) break;
          asm_emit8((cc_hex_val(h1) << 4) | cc_hex_val(h2));
          lp = lp + 2;
        }
      } else if (hal_strcmp(tok1, ".banner")) {
        while (lp < line_end && r8(src + lp) != 34) lp = lp + 1;
        if (lp < line_end && r8(src + lp) == 34) lp = lp + 1;
        for (int b = 0; b < 16; b++) w8(ASM_WORK_BUF + g_asm_out_len + b, 0);
        int bi = 0;
        while (lp < line_end && r8(src + lp) != 34 && bi < 15) {
          w8(ASM_WORK_BUF + g_asm_out_len + bi, r8(src + lp));
          lp = lp + 1;
          bi = bi + 1;
        }
        g_asm_out_len = g_asm_out_len + 16;
      } else if (hal_strcmp(tok1, ".dd")) {
        lp = asm_read_word(src, lp, line_end, tok2);
        asm_add_fixup(g_asm_out_len, tok2, 1, 0, 0);
        asm_emit32(0);
      } else if (asm_find_tok(tok1, "cdq|ret|cld|cli|hlt", "99c3fcfaf4") >= 0) {
        asm_emit8(asm_find_tok(tok1, "cdq|ret|cld|cli|hlt", "99c3fcfaf4"));
      } else if (asm_find_tok(tok1, "rep_movsd|rep_movsb|rep_stosd|rep_stosb", "a5a4abaa") >= 0) {
        asm_emit8(0xF3);
        asm_emit8(asm_find_tok(tok1, "rep_movsd|rep_movsb|rep_stosd|rep_stosb", "a5a4abaa"));
      } else if (hal_strcmp(tok1, "push")) {
        lp = asm_read_word(src, lp, line_end, tok2);
        asm_emit8(0x50 + asm_parse_x86_reg(tok2));
      } else if (hal_strcmp(tok1, "pop")) {
        lp = asm_read_word(src, lp, line_end, tok2);
        asm_emit8(0x58 + asm_parse_x86_reg(tok2));
      } else if (hal_strcmp(tok1, "jmp")) {
        lp = asm_read_word(src, lp, line_end, tok2);
        asm_emit8(0xE9);
        asm_add_fixup(g_asm_out_len, tok2, 2, 0, 0);
        asm_emit32(0);
      } else if (hal_strcmp(tok1, "call")) {
        lp = asm_read_word(src, lp, line_end, tok2);
        asm_emit8(0xE8);
        asm_add_fixup(g_asm_out_len, tok2, 2, 0, 0);
        asm_emit32(0);
      } else if (hal_strcmp(tok1, "mov_ri")) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        asm_emit8(0xB8 + asm_parse_x86_reg(tok2));
        asm_emit32(asm_parse_int(tok3));
      } else if (hal_strcmp(tok1, "mov_rl")) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        asm_emit8(0xB8 + asm_parse_x86_reg(tok2));
        asm_add_fixup(g_asm_out_len, tok3, 1, 0, 0);
        asm_emit32(0);
      } else if (asm_find_tok(tok1, "add_ri|sub_ri|and_ri|cmp_ri", "00050407") >= 0) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        asm_x86_alu_ri(asm_find_tok(tok1, "add_ri|sub_ri|and_ri|cmp_ri", "00050407"), asm_parse_x86_reg(tok2), asm_parse_int(tok3));
      } else if (asm_find_tok(tok1, "shl_ri|shr_ri|sar_ri", "040507") >= 0) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        asm_x86_shift_ri(asm_find_tok(tok1, "shl_ri|shr_ri|sar_ri", "040507"), asm_parse_x86_reg(tok2), asm_parse_int(tok3));
      } else if (hal_strcmp(tok1, "mov_rm")) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        lp = asm_read_word(src, lp, line_end, tok4);
        asm_emit8(0x8B);
        asm_x86_mem_disp(asm_parse_x86_reg(tok2), asm_parse_x86_reg(tok3), asm_parse_int(tok4));
      } else if (hal_strcmp(tok1, "mov_mr")) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        lp = asm_read_word(src, lp, line_end, tok4);
        asm_emit8(0x89);
        asm_x86_mem_disp(asm_parse_x86_reg(tok4), asm_parse_x86_reg(tok2), asm_parse_int(tok3));
      } else if (hal_strcmp(tok1, "mov_mi")) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        lp = asm_read_word(src, lp, line_end, tok4);
        asm_emit8(0xC7);
        asm_x86_mem_disp(0, asm_parse_x86_reg(tok2), asm_parse_int(tok3));
        asm_emit32(asm_parse_int(tok4));
      } else {
        int jcc = asm_x86_jcc_code(tok1);
        if (jcc >= 0) {
          lp = asm_read_word(src, lp, line_end, tok2);
          asm_emit8(0x0F);
          asm_emit8(jcc);
          asm_add_fixup(g_asm_out_len, tok2, 2, 0, 0);
          asm_emit32(0);
        } else {
          int rrop = asm_x86_rr_op(tok1);
          if (rrop >= 0) {
            lp = asm_read_word(src, lp, line_end, tok2);
            lp = asm_read_word(src, lp, line_end, tok3);
            int dst = asm_parse_x86_reg(tok2);
            int srg = asm_parse_x86_reg(tok3);
            asm_emit8(rrop);
            asm_emit8(0xC0 | ((srg & 7) << 3) | (dst & 7));
          }
        }
      }
    }
    p = line_end + 1;
  }

  // Pass 2: Resolve ABS32 (type 1) and REL32 (type 2) Fixups
  for (int i = 0; i < g_asm_fix_cnt; i++) {
    int fx = ASM_FIX_TAB + i * 48;
    int target = asm_find_label(fx);
    int fpos = r32(fx + 32);
    int ftype = r32(fx + 36);
    if (ftype == 1) {
      w32(ASM_WORK_BUF + fpos, target);
    } else if (ftype == 2) {
      int next_pc = base_addr + fpos + 4;
      w32(ASM_WORK_BUF + fpos, target - next_pc);
    }
  }

  // Write assembled x86 Core into Sectors 0..31 (VMRAM_IMG_BASE + 0x0000)
  hal_memset(VMRAM_IMG_BASE + 0x0000, 0, 16384);
  hal_memcpy(VMRAM_IMG_BASE + 0x0000, ASM_WORK_BUF, g_asm_out_len);
  hal_disk_sync(0, 32);

  g_asm_x86_bytes = g_asm_out_len;
  return g_asm_out_len;
}

int asm_rebuild_native_cores() {
  int tc_len = asm_assemble_tc32();
  int x86_len = asm_assemble_x86();
  if (tc_len < 0 || x86_len < 0) return -1;
  return tc_len + x86_len;
}
