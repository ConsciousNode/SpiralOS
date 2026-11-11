// ============================================================================
// SpiralOS 1.1 — In-OS Symbolic Native Core Assemblers (/src/asm.sp)
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
    if (r32(e + 28) == sig && hal_strcmp(e, name_ptr) == 1) {
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

int asm_tc32_r_op(int m) {
  if (hal_strcmp(m, "ADD") == 1)  return 0x05;
  if (hal_strcmp(m, "SUB") == 1)  return 0x06;
  if (hal_strcmp(m, "MUL") == 1)  return 0x07;
  if (hal_strcmp(m, "DIV") == 1)  return 0x08;
  if (hal_strcmp(m, "MOD") == 1)  return 0x09;
  if (hal_strcmp(m, "UDIV") == 1) return 0x0A;
  if (hal_strcmp(m, "UMOD") == 1) return 0x0B;
  if (hal_strcmp(m, "AND") == 1)  return 0x0C;
  if (hal_strcmp(m, "OR") == 1)   return 0x0D;
  if (hal_strcmp(m, "XOR") == 1)  return 0x0E;
  if (hal_strcmp(m, "SHL") == 1)  return 0x0F;
  if (hal_strcmp(m, "SHR") == 1)  return 0x10;
  if (hal_strcmp(m, "SAR") == 1)  return 0x11;
  if (hal_strcmp(m, "CMP") == 1)  return 0x1A;
  return -1;
}

int asm_tc32_i_op(int m) {
  if (hal_strcmp(m, "MOV") == 1)   return 0x01;
  if (hal_strcmp(m, "LUI16") == 1) return 0x03;
  if (hal_strcmp(m, "LHI") == 1)   return 0x04;
  if (hal_strcmp(m, "ADDI") == 1)  return 0x12;
  if (hal_strcmp(m, "SUBI") == 1)  return 0x13;
  if (hal_strcmp(m, "ANDI") == 1)  return 0x14;
  if (hal_strcmp(m, "SHLI") == 1)  return 0x17;
  if (hal_strcmp(m, "SHRI") == 1)  return 0x18;
  if (hal_strcmp(m, "SARI") == 1)  return 0x19;
  if (hal_strcmp(m, "CMPI") == 1)  return 0x1B;
  if (hal_strcmp(m, "LDBU") == 1)  return 0x1C;
  if (hal_strcmp(m, "LDBS") == 1)  return 0x1D;
  if (hal_strcmp(m, "LDHU") == 1)  return 0x1E;
  if (hal_strcmp(m, "LDW") == 1)   return 0x20;
  if (hal_strcmp(m, "STB") == 1)   return 0x21;
  if (hal_strcmp(m, "STH") == 1)   return 0x22;
  if (hal_strcmp(m, "STW") == 1)   return 0x23;
  if (hal_strcmp(m, "RET") == 1)   return 0x2E;
  if (hal_strcmp(m, "JR") == 1)    return 0x35;
  if (hal_strcmp(m, "SETCC") == 1) return 0x36;
  return -1;
}

int asm_tc32_j_op(int m) {
  if (hal_strcmp(m, "JMP") == 1)  return 0x26;
  if (hal_strcmp(m, "JEQ") == 1)  return 0x27;
  if (hal_strcmp(m, "JNE") == 1)  return 0x28;
  if (hal_strcmp(m, "JLT") == 1)  return 0x29;
  if (hal_strcmp(m, "JGE") == 1)  return 0x2A;
  if (hal_strcmp(m, "JLE") == 1)  return 0x2B;
  if (hal_strcmp(m, "JGT") == 1)  return 0x2C;
  if (hal_strcmp(m, "CALL") == 1) return 0x2D;
  return -1;
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
      } else if (hal_strcmp(tok1, ".dd") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        asm_add_fixup(g_asm_out_len, tok2, 3, 0, 0);
        asm_emit32(0);
      } else if (hal_strcmp(tok1, ".ascii") == 1) {
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
      } else if (hal_strcmp(tok1, "LA") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        int rd = asm_parse_tc_reg(tok2);
        asm_add_fixup(g_asm_out_len, tok3, 2, 0, rd);
        asm_emit32((0x03 << 24) | ((rd & 15) << 20));
        asm_emit32((0x04 << 24) | ((rd & 15) << 20));
      } else if (hal_strcmp(tok1, "SYS") == 1) {
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

  // Pass 2: Resolve Fixups
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

  // Write 'TC32' header + length + code into Sectors 32..63 (VMRAM_IMG_BASE + 0x4000)
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
  if (hal_strcmp(s_ptr, "eax") == 1) return 0;
  if (hal_strcmp(s_ptr, "ecx") == 1) return 1;
  if (hal_strcmp(s_ptr, "edx") == 1) return 2;
  if (hal_strcmp(s_ptr, "ebx") == 1) return 3;
  if (hal_strcmp(s_ptr, "esp") == 1) return 4;
  if (hal_strcmp(s_ptr, "ebp") == 1) return 5;
  if (hal_strcmp(s_ptr, "esi") == 1) return 6;
  if (hal_strcmp(s_ptr, "edi") == 1) return 7;
  return 0;
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
  if (hal_strcmp(m, "je") == 1)  return 0x84;
  if (hal_strcmp(m, "jne") == 1) return 0x85;
  if (hal_strcmp(m, "jl") == 1)  return 0x8C;
  if (hal_strcmp(m, "jge") == 1) return 0x8D;
  if (hal_strcmp(m, "jle") == 1) return 0x8E;
  if (hal_strcmp(m, "jg") == 1)  return 0x8F;
  if (hal_strcmp(m, "jb") == 1)  return 0x82;
  if (hal_strcmp(m, "ja") == 1)  return 0x87;
  return -1;
}

int asm_x86_rr_op(int m) {
  if (hal_strcmp(m, "mov_rr") == 1) return 0x89;
  if (hal_strcmp(m, "add_rr") == 1) return 0x01;
  if (hal_strcmp(m, "sub_rr") == 1) return 0x29;
  if (hal_strcmp(m, "and_rr") == 1) return 0x21;
  if (hal_strcmp(m, "or_rr") == 1)  return 0x09;
  if (hal_strcmp(m, "xor_rr") == 1) return 0x31;
  if (hal_strcmp(m, "cmp_rr") == 1) return 0x39;
  return -1;
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
      } else if (hal_strcmp(tok1, ".org") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        base_addr = asm_parse_int(tok2);
      } else if (hal_strcmp(tok1, ".hex") == 1) {
        lp = asm_skip_ws(src, lp, line_end);
        while (lp + 1 < line_end) {
          int h1 = r8(src + lp);
          int h2 = r8(src + lp + 1);
          if (cc_is_hex(h1) == 0 || cc_is_hex(h2) == 0) break;
          asm_emit8((cc_hex_val(h1) << 4) | cc_hex_val(h2));
          lp = lp + 2;
        }
      } else if (hal_strcmp(tok1, ".banner") == 1) {
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
      } else if (hal_strcmp(tok1, ".dd") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        asm_add_fixup(g_asm_out_len, tok2, 1, 0, 0);
        asm_emit32(0);
      } else if (hal_strcmp(tok1, "cdq") == 1) {
        asm_emit8(0x99);
      } else if (hal_strcmp(tok1, "ret") == 1) {
        asm_emit8(0xC3);
      } else if (hal_strcmp(tok1, "cld") == 1) {
        asm_emit8(0xFC);
      } else if (hal_strcmp(tok1, "cli") == 1) {
        asm_emit8(0xFA);
      } else if (hal_strcmp(tok1, "hlt") == 1) {
        asm_emit8(0xF4);
      } else if (hal_strcmp(tok1, "rep_movsd") == 1) {
        asm_emit8(0xF3); asm_emit8(0xA5);
      } else if (hal_strcmp(tok1, "rep_movsb") == 1) {
        asm_emit8(0xF3); asm_emit8(0xA4);
      } else if (hal_strcmp(tok1, "rep_stosd") == 1) {
        asm_emit8(0xF3); asm_emit8(0xAB);
      } else if (hal_strcmp(tok1, "rep_stosb") == 1) {
        asm_emit8(0xF3); asm_emit8(0xAA);
      } else if (hal_strcmp(tok1, "push") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        asm_emit8(0x50 + asm_parse_x86_reg(tok2));
      } else if (hal_strcmp(tok1, "pop") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        asm_emit8(0x58 + asm_parse_x86_reg(tok2));
      } else if (hal_strcmp(tok1, "jmp") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        asm_emit8(0xE9);
        asm_add_fixup(g_asm_out_len, tok2, 2, 0, 0);
        asm_emit32(0);
      } else if (hal_strcmp(tok1, "call") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        asm_emit8(0xE8);
        asm_add_fixup(g_asm_out_len, tok2, 2, 0, 0);
        asm_emit32(0);
      } else if (hal_strcmp(tok1, "mov_ri") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        asm_emit8(0xB8 + asm_parse_x86_reg(tok2));
        asm_emit32(asm_parse_int(tok3));
      } else if (hal_strcmp(tok1, "mov_rl") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        asm_emit8(0xB8 + asm_parse_x86_reg(tok2));
        asm_add_fixup(g_asm_out_len, tok3, 1, 0, 0);
        asm_emit32(0);
      } else if (hal_strcmp(tok1, "add_ri") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        asm_x86_alu_ri(0, asm_parse_x86_reg(tok2), asm_parse_int(tok3));
      } else if (hal_strcmp(tok1, "sub_ri") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        asm_x86_alu_ri(5, asm_parse_x86_reg(tok2), asm_parse_int(tok3));
      } else if (hal_strcmp(tok1, "and_ri") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        asm_x86_alu_ri(4, asm_parse_x86_reg(tok2), asm_parse_int(tok3));
      } else if (hal_strcmp(tok1, "cmp_ri") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        asm_x86_alu_ri(7, asm_parse_x86_reg(tok2), asm_parse_int(tok3));
      } else if (hal_strcmp(tok1, "shl_ri") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        asm_x86_shift_ri(4, asm_parse_x86_reg(tok2), asm_parse_int(tok3));
      } else if (hal_strcmp(tok1, "shr_ri") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        asm_x86_shift_ri(5, asm_parse_x86_reg(tok2), asm_parse_int(tok3));
      } else if (hal_strcmp(tok1, "sar_ri") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        asm_x86_shift_ri(7, asm_parse_x86_reg(tok2), asm_parse_int(tok3));
      } else if (hal_strcmp(tok1, "mov_rm") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        lp = asm_read_word(src, lp, line_end, tok4);
        asm_emit8(0x8B);
        asm_x86_mem_disp(asm_parse_x86_reg(tok2), asm_parse_x86_reg(tok3), asm_parse_int(tok4));
      } else if (hal_strcmp(tok1, "mov_mr") == 1) {
        lp = asm_read_word(src, lp, line_end, tok2);
        lp = asm_read_word(src, lp, line_end, tok3);
        lp = asm_read_word(src, lp, line_end, tok4);
        asm_emit8(0x89);
        asm_x86_mem_disp(asm_parse_x86_reg(tok4), asm_parse_x86_reg(tok2), asm_parse_int(tok3));
      } else if (hal_strcmp(tok1, "mov_mi") == 1) {
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
