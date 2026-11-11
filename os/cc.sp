// ============================================================================
// SpiralOS 1.1 — Real Self-Hosting SpiralC Compiler (/src/cc.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Full recursive-descent compiler written in the Spiral language itself.
// Compiles the complete /src/*.sp tree (and standalone .sp programs) into
// portable SpiralVM ('SPIR') bytecode inside the VM on both TabComp (TC-32)
// and Hummingbird (i586), producing a byte-for-byte identical fixed point
// (Stage 1 == Stage 2 == Stage 3 across both machines).
// ============================================================================

const TK_EOF      = 0;
const TK_NUM      = 1;
const TK_IDENT    = 2;
const TK_STR      = 3;

const TK_INT      = 10;
const TK_BYTE     = 11;
const TK_VOID     = 12;
const TK_CONST    = 13;
const TK_IF       = 14;
const TK_ELSE     = 15;
const TK_WHILE    = 16;
const TK_FOR      = 17;
const TK_RETURN   = 18;
const TK_BREAK    = 19;
const TK_CONTINUE = 20;
const TK_IMPORT   = 21;

const TK_EQ       = 256;
const TK_NE       = 257;
const TK_LE       = 258;
const TK_GE       = 259;
const TK_SHL      = 260;
const TK_SHR      = 261;
const TK_USHR     = 262;
const TK_LAND     = 263;
const TK_LOR      = 264;
const TK_INC      = 265;
const TK_DEC      = 266;
const TK_ADDEQ    = 267;
const TK_SUBEQ    = 268;

const OP_NOP         = 0x00;
const OP_HALT        = 0x01;
const OP_PUSH_I16    = 0x02;
const OP_PUSH_U16    = 0x03;
const OP_PUSH_HI     = 0x04;
const OP_DUP         = 0x05;
const OP_DROP        = 0x06;
const OP_SWAP        = 0x07;
const OP_GET_LOCAL   = 0x08;
const OP_SET_LOCAL   = 0x09;
const OP_GET_GLOBAL  = 0x0A;
const OP_SET_GLOBAL  = 0x0B;
const OP_ADDR_LOCAL  = 0x0C;
const OP_ADDR_GLOBAL = 0x0D;
const OP_LOAD8U      = 0x0E;
const OP_LOAD8S      = 0x0F;
const OP_LOAD16U     = 0x10;
const OP_LOAD32      = 0x11;
const OP_STORE8      = 0x12;
const OP_STORE16     = 0x13;
const OP_STORE32     = 0x14;
const OP_ADD         = 0x15;
const OP_SUB         = 0x16;
const OP_MUL         = 0x17;
const OP_DIV         = 0x18;
const OP_MOD         = 0x19;
const OP_AND         = 0x1A;
const OP_OR          = 0x1B;
const OP_XOR         = 0x1C;
const OP_SHL         = 0x1D;
const OP_SHR         = 0x1E;
const OP_SAR         = 0x1F;
const OP_CMP         = 0x20;
const OP_JMP         = 0x21;
const OP_JZ          = 0x22;
const OP_JNZ         = 0x23;
const OP_CALL        = 0x24;
const OP_ENTER       = 0x25;
const OP_RET         = 0x26;
const OP_SYSCALL     = 0x27;

const CC_IDENT_BUF   = 0x060000;
const CC_STR_BUF     = 0x060100;
const CC_ERR_MSG     = 0x060300;
const CC_CONST_TAB   = 0x061000;
const CC_GLOB_TAB    = 0x064000;
const CC_LOC_TAB     = 0x067000;
const CC_FUNC_TAB    = 0x068000;
const CC_FIXUP_TAB   = 0x06B000;
const CC_BREAK_TAB   = 0x076000;
const CC_CONT_TAB    = 0x077000;
const CC_POOL_TAB    = 0x078000;
const CC_CONST_HEAD  = 0x07A000;
const CC_GLOB_HEAD   = 0x07A400;
const CC_FUNC_HEAD   = 0x07A800;
const CC_POOL_HEAD   = 0x07AC00;
const CC_WORK_BUF    = 0x0B0000;

int g_cc_last_status;
int g_cc_last_bytes;
int g_cc_last_csum;
int g_cc_parsed_override;
int g_cc_err_flag;
int g_cc_err_line;

int g_cc_src_ptr;
int g_cc_src_len;
int g_cc_pos;
int g_cc_line;
int g_cc_inc_depth;
int g_cc_parent_src;
int g_cc_parent_len;
int g_cc_parent_pos;
int g_cc_parent_line;
int g_cc_allow_imports;

int g_cc_out_buf;
int g_cc_str_base;
int g_cc_max_size;
int g_cc_code_pos;
int g_cc_str_pos;

int g_cc_tok;
int g_cc_tok_val;
int g_cc_str_len;

int g_cc_const_cnt;
int g_cc_glob_cnt;
int g_cc_glob_slots;
int g_cc_loc_cnt;
int g_cc_loc_slots;
int g_cc_func_cnt;
int g_cc_fixup_cnt;
int g_cc_loop_depth;
int g_cc_break_cnt;
int g_cc_cont_cnt;
int g_cc_pool_cnt;

int cc_name_sig(int s) {
  int len = hal_strlen(s);
  if (len <= 0) return 0;
  return (len << 24) | (r8(s) << 16) | (r8(s + (len >> 1)) << 8) | r8(s + len - 1);
}

int cc_sig_bucket(int sig) {
  return (((sig >>> 24) * 17) ^ ((sig >>> 16) * 31) ^ ((sig >>> 8) * 13) ^ sig) & 255;
}

void cc_strcpy(int dst, int src) {
  int len = hal_strlen(src);
  if (len > 23) len = 23;
  if (len > 0) hal_memcpy(dst, src, len);
  w8(dst + len, 0);
  w32(dst + 28, (len << 24) | (r8(dst) << 16) | (r8(dst + (len >> 1)) << 8) | r8(dst + len - 1));
}

void cc_error(int msg_str) {
  if (g_cc_err_flag != 0) {
    g_cc_tok = TK_EOF;
    return;
  }
  g_cc_err_flag = 1;
  g_cc_err_line = g_cc_line;
  w32(VMRAM_STATUS + 0x6C, g_cc_line);
  hal_memset(CC_ERR_MSG, 0, 128);
  hal_memcpy(CC_ERR_MSG, "Err line ", 9);
  int nlen = hal_itoa(g_cc_line, CC_ERR_MSG + 9, 10);
  w8(CC_ERR_MSG + 9 + nlen, 58); // ':'
  w8(CC_ERR_MSG + 10 + nlen, 32);
  int mlen = hal_strlen(msg_str);
  if (mlen > 96) mlen = 96;
  hal_memcpy(CC_ERR_MSG + 11 + nlen, msg_str, mlen);
  g_cc_tok = TK_EOF;
}

int cc_is_alpha(int c) {
  if (c >= 65 && c <= 90) return 1;
  if (c >= 97 && c <= 122) return 1;
  if (c == 95) return 1;
  return 0;
}

int cc_is_digit(int c) {
  if (c >= 48 && c <= 57) return 1;
  return 0;
}

int cc_is_hex(int c) {
  if (c >= 48 && c <= 57) return 1;
  if (c >= 65 && c <= 70) return 1;
  if (c >= 97 && c <= 102) return 1;
  return 0;
}

int cc_hex_val(int c) {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 65 && c <= 70) return c - 55;
  return c - 87;
}

int cc_emit_word(int w) {
  if (g_cc_err_flag != 0) return g_cc_code_pos;
  if (g_cc_code_pos + 4 > g_cc_str_base) {
    cc_error("code size overflow");
    return g_cc_code_pos;
  }
  int addr = g_cc_code_pos;
  w32(g_cc_out_buf + addr, w);
  g_cc_code_pos = g_cc_code_pos + 4;
  return addr;
}

int cc_emit_op(int op, int a, int imm16) {
  return cc_emit_word(((op & 0xFF) << 24) | ((a & 0xFF) << 16) | (imm16 & 0xFFFF));
}

int cc_emit_jump(int op, int addr24) {
  return cc_emit_word(((op & 0xFF) << 24) | (addr24 & 0x00FFFFFF));
}

void cc_patch_jump(int inst_addr, int target_addr) {
  int prev = r32(g_cc_out_buf + inst_addr);
  int op = (prev >>> 24) & 0xFF;
  w32(g_cc_out_buf + inst_addr, (op << 24) | (target_addr & 0x00FFFFFF));
}

void cc_emit_push_const(int val) {
  if (val >= -32768 && val <= 32767) {
    cc_emit_op(OP_PUSH_I16, 0, val & 0xFFFF);
  } else if (val >= 0 && val <= 65535) {
    cc_emit_op(OP_PUSH_U16, 0, val & 0xFFFF);
  } else {
    cc_emit_op(OP_PUSH_U16, 0, val & 0xFFFF);
    cc_emit_op(OP_PUSH_HI, 0, (val >>> 16) & 0xFFFF);
  }
}

int cc_add_str_lit() {
  int len = g_cc_str_len;
  int b = (len * 31 + r8(CC_STR_BUF) * 7 + r8(CC_STR_BUF + (len >> 1))) & 255;
  int pidx = r32(CC_POOL_HEAD + (b << 2));
  while (pidx >= 0) {
    int pe = CC_POOL_TAB + pidx * 12;
    if (r32(pe + 4) == len) {
      int p_addr = r32(pe + 0);
      if (hal_strcmp(g_cc_out_buf + p_addr, CC_STR_BUF) == 1) return p_addr;
    }
    pidx = r32(pe + 8);
  }
  if (g_cc_str_pos + len + 1 > g_cc_max_size) {
    cc_error("string pool overflow");
    return g_cc_str_base;
  }
  int start_addr = g_cc_str_pos;
  if (len > 0) hal_memcpy(g_cc_out_buf + start_addr, CC_STR_BUF, len);
  w8(g_cc_out_buf + start_addr + len, 0);
  g_cc_str_pos = g_cc_str_pos + len + 1;
  if (g_cc_pool_cnt < 512) {
    int ne = CC_POOL_TAB + g_cc_pool_cnt * 12;
    w32(ne + 0, start_addr);
    w32(ne + 4, len);
    w32(ne + 8, r32(CC_POOL_HEAD + (b << 2)));
    w32(CC_POOL_HEAD + (b << 2), g_cc_pool_cnt);
    g_cc_pool_cnt = g_cc_pool_cnt + 1;
  }
  return start_addr;
}

int cc_find_const(int name_ptr) {
  int sig = cc_name_sig(name_ptr);
  int b = cc_sig_bucket(sig);
  int idx = r32(CC_CONST_HEAD + (b << 2));
  while (idx >= 0) {
    int e = CC_CONST_TAB + idx * 36;
    if (r32(e + 28) == sig && hal_strcmp(e, name_ptr) == 1) return idx;
    idx = r32(e + 24);
  }
  return -1;
}

void cc_set_const(int name_ptr, int val) {
  int idx = cc_find_const(name_ptr);
  int is_new = 0;
  if (idx < 0) {
    idx = g_cc_const_cnt;
    g_cc_const_cnt = g_cc_const_cnt + 1;
    is_new = 1;
  }
  int e = CC_CONST_TAB + idx * 36;
  cc_strcpy(e, name_ptr);
  if (is_new == 1) {
    int b = cc_sig_bucket(r32(e + 28));
    w32(e + 24, r32(CC_CONST_HEAD + (b << 2)));
    w32(CC_CONST_HEAD + (b << 2), idx);
  }
  w32(e + 32, val);
  if (hal_strcmp(name_ptr, "WM_TITLE_COLOR_OVERRIDE") == 1) {
    g_cc_parsed_override = val;
  }
}

int cc_find_glob(int name_ptr) {
  int sig = cc_name_sig(name_ptr);
  int b = cc_sig_bucket(sig);
  int idx = r32(CC_GLOB_HEAD + (b << 2));
  while (idx >= 0) {
    int e = CC_GLOB_TAB + idx * 48;
    if (r32(e + 28) == sig && hal_strcmp(e, name_ptr) == 1) return idx;
    idx = r32(e + 24);
  }
  return -1;
}

void cc_add_glob(int name_ptr, int slot, int is_byte, int is_arr, int sz) {
  int idx = cc_find_glob(name_ptr);
  int is_new = 0;
  if (idx < 0) {
    idx = g_cc_glob_cnt;
    g_cc_glob_cnt = g_cc_glob_cnt + 1;
    is_new = 1;
  }
  int e = CC_GLOB_TAB + idx * 48;
  cc_strcpy(e, name_ptr);
  if (is_new == 1) {
    int b = cc_sig_bucket(r32(e + 28));
    w32(e + 24, r32(CC_GLOB_HEAD + (b << 2)));
    w32(CC_GLOB_HEAD + (b << 2), idx);
  }
  w32(e + 32, slot);
  w32(e + 36, is_byte);
  w32(e + 40, is_arr);
  w32(e + 44, sz);
}

int cc_find_loc(int name_ptr) {
  int sig = cc_name_sig(name_ptr);
  for (int i = 0; i < g_cc_loc_cnt; i++) {
    int e = CC_LOC_TAB + i * 48;
    if (r32(e + 28) == sig && hal_strcmp(e, name_ptr) == 1) return i;
  }
  return -1;
}

void cc_add_loc(int name_ptr, int slot, int is_byte, int is_arr, int sz) {
  int idx = cc_find_loc(name_ptr);
  if (idx < 0) {
    idx = g_cc_loc_cnt;
    g_cc_loc_cnt = g_cc_loc_cnt + 1;
  }
  int e = CC_LOC_TAB + idx * 48;
  cc_strcpy(e, name_ptr);
  w32(e + 32, slot);
  w32(e + 36, is_byte);
  w32(e + 40, is_arr);
  w32(e + 44, sz);
}

int cc_find_func(int name_ptr) {
  int sig = cc_name_sig(name_ptr);
  int b = cc_sig_bucket(sig);
  int idx = r32(CC_FUNC_HEAD + (b << 2));
  while (idx >= 0) {
    int e = CC_FUNC_TAB + idx * 44;
    if (r32(e + 28) == sig && hal_strcmp(e, name_ptr) == 1) return idx;
    idx = r32(e + 24);
  }
  return -1;
}

void cc_set_func(int name_ptr, int addr, int nargs) {
  int idx = cc_find_func(name_ptr);
  int is_new = 0;
  if (idx < 0) {
    idx = g_cc_func_cnt;
    g_cc_func_cnt = g_cc_func_cnt + 1;
    is_new = 1;
  }
  int e = CC_FUNC_TAB + idx * 44;
  cc_strcpy(e, name_ptr);
  if (is_new == 1) {
    int b = cc_sig_bucket(r32(e + 28));
    w32(e + 24, r32(CC_FUNC_HEAD + (b << 2)));
    w32(CC_FUNC_HEAD + (b << 2), idx);
  }
  w32(e + 32, addr);
  w32(e + 36, nargs);
  w32(e + 40, 1);
}

void cc_add_fixup(int inst_addr, int name_ptr, int line, int is_fn_addr) {
  int e = CC_FIXUP_TAB + g_cc_fixup_cnt * 44;
  cc_strcpy(e, name_ptr);
  w32(e + 32, inst_addr);
  w32(e + 36, line);
  w32(e + 40, is_fn_addr);
  g_cc_fixup_cnt = g_cc_fixup_cnt + 1;
}

int cc_read_escape() {
  if (g_cc_pos >= g_cc_src_len) return 0;
  int c = r8(g_cc_src_ptr + g_cc_pos);
  g_cc_pos = g_cc_pos + 1;
  if (c == 110) return 10;
  if (c == 114) return 13;
  if (c == 116) return 9;
  if (c == 48)  return 0;
  return c;
}

void cc_next_tok() {
  if (g_cc_err_flag != 0) {
    g_cc_tok = TK_EOF;
    return;
  }
  while (1) {
    while (g_cc_pos < g_cc_src_len) {
      int c = r8(g_cc_src_ptr + g_cc_pos);
      if (c == 10) {
        g_cc_line = g_cc_line + 1;
        g_cc_pos = g_cc_pos + 1;
        continue;
      }
      if (c <= 32) {
        g_cc_pos = g_cc_pos + 1;
        continue;
      }
      if (c == 47 && g_cc_pos + 1 < g_cc_src_len && r8(g_cc_src_ptr + g_cc_pos + 1) == 47) {
        g_cc_pos = g_cc_pos + 2;
        while (g_cc_pos < g_cc_src_len && r8(g_cc_src_ptr + g_cc_pos) != 10) {
          g_cc_pos = g_cc_pos + 1;
        }
        continue;
      }
      if (c == 47 && g_cc_pos + 1 < g_cc_src_len && r8(g_cc_src_ptr + g_cc_pos + 1) == 42) {
        g_cc_pos = g_cc_pos + 2;
        while (g_cc_pos + 1 < g_cc_src_len) {
          if (r8(g_cc_src_ptr + g_cc_pos) == 42 && r8(g_cc_src_ptr + g_cc_pos + 1) == 47) break;
          if (r8(g_cc_src_ptr + g_cc_pos) == 10) g_cc_line = g_cc_line + 1;
          g_cc_pos = g_cc_pos + 1;
        }
        g_cc_pos = g_cc_pos + 2;
        continue;
      }
      break;
    }
    if (g_cc_pos >= g_cc_src_len) {
      if (g_cc_inc_depth > 0) {
        g_cc_src_ptr = g_cc_parent_src;
        g_cc_src_len = g_cc_parent_len;
        g_cc_pos     = g_cc_parent_pos;
        g_cc_line    = g_cc_parent_line;
        g_cc_inc_depth = 0;
        continue;
      }
      g_cc_tok = TK_EOF;
      return;
    }
    break;
  }

  int c = r8(g_cc_src_ptr + g_cc_pos);

  // Number literal
  if (cc_is_digit(c) == 1) {
    int v = 0;
    if (c == 48 && g_cc_pos + 1 < g_cc_src_len && (r8(g_cc_src_ptr + g_cc_pos + 1) == 120 || r8(g_cc_src_ptr + g_cc_pos + 1) == 88)) {
      g_cc_pos = g_cc_pos + 2;
      while (g_cc_pos < g_cc_src_len && cc_is_hex(r8(g_cc_src_ptr + g_cc_pos)) == 1) {
        v = (v << 4) | cc_hex_val(r8(g_cc_src_ptr + g_cc_pos));
        g_cc_pos = g_cc_pos + 1;
      }
    } else {
      while (g_cc_pos < g_cc_src_len && cc_is_digit(r8(g_cc_src_ptr + g_cc_pos)) == 1) {
        v = v * 10 + (r8(g_cc_src_ptr + g_cc_pos) - 48);
        g_cc_pos = g_cc_pos + 1;
      }
    }
    g_cc_tok = TK_NUM;
    g_cc_tok_val = v;
    return;
  }

  // Character literal 'x'
  if (c == 39) {
    g_cc_pos = g_cc_pos + 1;
    if (g_cc_pos >= g_cc_src_len) {
      cc_error("unclosed char literal");
      return;
    }
    int ch = r8(g_cc_src_ptr + g_cc_pos);
    g_cc_pos = g_cc_pos + 1;
    if (ch == 92) ch = cc_read_escape();
    if (g_cc_pos >= g_cc_src_len || r8(g_cc_src_ptr + g_cc_pos) != 39) {
      cc_error("expected closing quote");
      return;
    }
    g_cc_pos = g_cc_pos + 1;
    g_cc_tok = TK_NUM;
    g_cc_tok_val = ch & 0xFF;
    return;
  }

  // String literal "..."
  if (c == 34) {
    g_cc_pos = g_cc_pos + 1;
    g_cc_str_len = 0;
    while (g_cc_pos < g_cc_src_len && r8(g_cc_src_ptr + g_cc_pos) != 34) {
      int ch = r8(g_cc_src_ptr + g_cc_pos);
      if (ch == 10) {
        cc_error("unclosed string literal");
        return;
      }
      g_cc_pos = g_cc_pos + 1;
      if (ch == 92) ch = cc_read_escape();
      if (g_cc_str_len < 500) {
        w8(CC_STR_BUF + g_cc_str_len, ch & 0xFF);
        g_cc_str_len = g_cc_str_len + 1;
      }
    }
    if (g_cc_pos >= g_cc_src_len || r8(g_cc_src_ptr + g_cc_pos) != 34) {
      cc_error("unclosed string literal");
      return;
    }
    g_cc_pos = g_cc_pos + 1;
    w8(CC_STR_BUF + g_cc_str_len, 0);
    g_cc_tok = TK_STR;
    return;
  }

  // Identifier or keyword
  if (cc_is_alpha(c) == 1) {
    w32(CC_IDENT_BUF, 0);
    w32(CC_IDENT_BUF + 4, 0);
    int ilen = 0;
    while (g_cc_pos < g_cc_src_len) {
      int ic = r8(g_cc_src_ptr + g_cc_pos);
      if (cc_is_alpha(ic) == 0 && cc_is_digit(ic) == 0) break;
      if (ilen < 31) {
        w8(CC_IDENT_BUF + ilen, ic);
        ilen = ilen + 1;
      }
      g_cc_pos = g_cc_pos + 1;
    }
    w8(CC_IDENT_BUF + ilen, 0);
    if (ilen >= 2 && ilen <= 8 && c >= 98 && c <= 119) {
      if (c == 105) {
        if (hal_strcmp(CC_IDENT_BUF, "if") == 1)     { g_cc_tok = TK_IF; return; }
        if (hal_strcmp(CC_IDENT_BUF, "int") == 1)    { g_cc_tok = TK_INT; return; }
        if (hal_strcmp(CC_IDENT_BUF, "import") == 1) { g_cc_tok = TK_IMPORT; return; }
      } else if (c == 101) {
        if (hal_strcmp(CC_IDENT_BUF, "else") == 1)   { g_cc_tok = TK_ELSE; return; }
      } else if (c == 114) {
        if (hal_strcmp(CC_IDENT_BUF, "return") == 1) { g_cc_tok = TK_RETURN; return; }
      } else if (c == 119) {
        if (hal_strcmp(CC_IDENT_BUF, "while") == 1)  { g_cc_tok = TK_WHILE; return; }
      } else if (c == 99) {
        if (hal_strcmp(CC_IDENT_BUF, "const") == 1)    { g_cc_tok = TK_CONST; return; }
        if (hal_strcmp(CC_IDENT_BUF, "continue") == 1) { g_cc_tok = TK_CONTINUE; return; }
      } else if (c == 98) {
        if (hal_strcmp(CC_IDENT_BUF, "byte") == 1)  { g_cc_tok = TK_BYTE; return; }
        if (hal_strcmp(CC_IDENT_BUF, "break") == 1) { g_cc_tok = TK_BREAK; return; }
      } else if (c == 118) {
        if (hal_strcmp(CC_IDENT_BUF, "void") == 1)  { g_cc_tok = TK_VOID; return; }
      } else if (c == 102) {
        if (hal_strcmp(CC_IDENT_BUF, "for") == 1)   { g_cc_tok = TK_FOR; return; }
      }
    }
    g_cc_tok = TK_IDENT;
    return;
  }

  // Operators & punctuation
  g_cc_pos = g_cc_pos + 1;
  int c2 = 0;
  int c3 = 0;
  if (g_cc_pos < g_cc_src_len) c2 = r8(g_cc_src_ptr + g_cc_pos);
  if (g_cc_pos + 1 < g_cc_src_len) c3 = r8(g_cc_src_ptr + g_cc_pos + 1);

  if (c == 61 && c2 == 61) { g_cc_pos = g_cc_pos + 1; g_cc_tok = TK_EQ; return; }
  if (c == 33 && c2 == 61) { g_cc_pos = g_cc_pos + 1; g_cc_tok = TK_NE; return; }
  if (c == 60 && c2 == 61) { g_cc_pos = g_cc_pos + 1; g_cc_tok = TK_LE; return; }
  if (c == 62 && c2 == 61) { g_cc_pos = g_cc_pos + 1; g_cc_tok = TK_GE; return; }
  if (c == 60 && c2 == 60) { g_cc_pos = g_cc_pos + 1; g_cc_tok = TK_SHL; return; }
  if (c == 62 && c2 == 62 && c3 == 62) { g_cc_pos = g_cc_pos + 2; g_cc_tok = TK_USHR; return; }
  if (c == 62 && c2 == 62) { g_cc_pos = g_cc_pos + 1; g_cc_tok = TK_SHR; return; }
  if (c == 38 && c2 == 38) { g_cc_pos = g_cc_pos + 1; g_cc_tok = TK_LAND; return; }
  if (c == 124 && c2 == 124) { g_cc_pos = g_cc_pos + 1; g_cc_tok = TK_LOR; return; }
  if (c == 43 && c2 == 43) { g_cc_pos = g_cc_pos + 1; g_cc_tok = TK_INC; return; }
  if (c == 45 && c2 == 45) { g_cc_pos = g_cc_pos + 1; g_cc_tok = TK_DEC; return; }
  if (c == 43 && c2 == 61) { g_cc_pos = g_cc_pos + 1; g_cc_tok = TK_ADDEQ; return; }
  if (c == 45 && c2 == 61) { g_cc_pos = g_cc_pos + 1; g_cc_tok = TK_SUBEQ; return; }

  g_cc_tok = c;
}

void cc_expect(int t) {
  if (g_cc_tok != t) {
    cc_error("unexpected token");
    return;
  }
  cc_next_tok();
}

int cc_eval_const_atom() {
  int sign = 1;
  if (g_cc_tok == 45) {
    sign = -1;
    cc_next_tok();
  } else if (g_cc_tok == 126) {
    cc_next_tok();
    return ~cc_eval_const_atom();
  }
  if (g_cc_tok == TK_NUM) {
    int v = g_cc_tok_val;
    cc_next_tok();
    return v * sign;
  }
  if (g_cc_tok == TK_IDENT) {
    int cidx = cc_find_const(CC_IDENT_BUF);
    if (cidx < 0) {
      cc_error("unknown constant");
      return 0;
    }
    int cv = r32(CC_CONST_TAB + cidx * 36 + 32);
    cc_next_tok();
    return cv * sign;
  }
  if (g_cc_tok == 40) {
    cc_next_tok();
    int pv = cc_eval_const_expr();
    cc_expect(41);
    return pv * sign;
  }
  cc_error("constant expr expected");
  return 0;
}

int cc_eval_const_expr() {
  int v = cc_eval_const_atom();
  while (g_cc_tok == 43 || g_cc_tok == 45 || g_cc_tok == 42 || g_cc_tok == 47 || g_cc_tok == 124 || g_cc_tok == 38 || g_cc_tok == TK_SHL || g_cc_tok == TK_SHR) {
    int op = g_cc_tok;
    cc_next_tok();
    int r = cc_eval_const_atom();
    if (op == 43) v = v + r;
    else if (op == 45) v = v - r;
    else if (op == 42) v = v * r;
    else if (op == 47) v = v / r;
    else if (op == 124) v = v | r;
    else if (op == 38) v = v & r;
    else if (op == TK_SHL) v = v << r;
    else if (op == TK_SHR) v = v >> r;
  }
  return v;
}

void cc_emit_var_addr(int is_loc, int slot) {
  if (is_loc == 1) cc_emit_op(OP_ADDR_LOCAL, 0, slot);
  else cc_emit_op(OP_ADDR_GLOBAL, 0, slot);
}

void cc_emit_var_get(int is_loc, int slot, int is_arr) {
  if (is_arr == 1) {
    cc_emit_var_addr(is_loc, slot);
    return;
  }
  if (is_loc == 1) cc_emit_op(OP_GET_LOCAL, 0, slot);
  else cc_emit_op(OP_GET_GLOBAL, 0, slot);
}

void cc_emit_var_set(int is_loc, int slot) {
  if (is_loc == 1) cc_emit_op(OP_SET_LOCAL, 0, slot);
  else cc_emit_op(OP_SET_GLOBAL, 0, slot);
}

void cc_parse_primary() {
  if (g_cc_err_flag != 0) return;

  if (g_cc_tok == TK_NUM) {
    cc_emit_push_const(g_cc_tok_val);
    cc_next_tok();
    return;
  }
  if (g_cc_tok == TK_STR) {
    int saddr = cc_add_str_lit();
    cc_emit_push_const(saddr);
    cc_next_tok();
    return;
  }
  if (g_cc_tok == 40) {
    cc_next_tok();
    cc_parse_expr();
    cc_expect(41);
    return;
  }
  if (g_cc_tok == TK_IDENT) {
    byte name[32];
    cc_strcpy(name, CC_IDENT_BUF);
    cc_next_tok();

    // 1. Intrinsics and Function Calls (only when followed by '(')
    if (g_cc_tok == 40) {
      int nc0 = r8(name);
      if (nc0 == 114) {
        if (hal_strcmp(name, "r8") == 1 || hal_strcmp(name, "r8s") == 1 || hal_strcmp(name, "r16") == 1 || hal_strcmp(name, "r32") == 1) {
          cc_next_tok();
          cc_parse_expr();
          cc_expect(41);
          if (hal_strcmp(name, "r8") == 1) cc_emit_op(OP_LOAD8U, 0, 0);
          else if (hal_strcmp(name, "r8s") == 1) cc_emit_op(OP_LOAD8S, 0, 0);
          else if (hal_strcmp(name, "r16") == 1) cc_emit_op(OP_LOAD16U, 0, 0);
          else cc_emit_op(OP_LOAD32, 0, 0);
          return;
        }
      } else if (nc0 == 119) {
        if (hal_strcmp(name, "w8") == 1 || hal_strcmp(name, "w16") == 1 || hal_strcmp(name, "w32") == 1) {
          cc_next_tok();
          cc_parse_expr();
          cc_expect(44);
          cc_parse_expr();
          cc_expect(41);
          if (hal_strcmp(name, "w8") == 1) cc_emit_op(OP_STORE8, 0, 0);
          else if (hal_strcmp(name, "w16") == 1) cc_emit_op(OP_STORE16, 0, 0);
          else cc_emit_op(OP_STORE32, 0, 0);
          cc_emit_push_const(0);
          return;
        }
      } else if (nc0 == 115 && hal_strcmp(name, "sys") == 1) {
        cc_next_tok();
        int sysnum = cc_eval_const_expr();
        int nargs = 0;
        while (g_cc_tok == 44) {
          cc_next_tok();
          cc_parse_expr();
          nargs = nargs + 1;
        }
        cc_expect(41);
        cc_emit_op(OP_SYSCALL, nargs, sysnum);
        return;
      } else if (nc0 == 102 && hal_strcmp(name, "fn_addr") == 1) {
        cc_next_tok();
        byte tfn[32];
        cc_strcpy(tfn, CC_IDENT_BUF);
        cc_expect(TK_IDENT);
        cc_expect(41);
        int fidx = cc_find_func(tfn);
        if (fidx >= 0) {
          int faddr = r32(CC_FUNC_TAB + fidx * 44 + 32);
          cc_emit_op(OP_PUSH_U16, 0, faddr & 0xFFFF);
          cc_emit_op(OP_PUSH_HI, 0, (faddr >>> 16) & 0xFFFF);
        } else {
          int iaddr = cc_emit_op(OP_PUSH_U16, 0, 0);
          cc_emit_op(OP_PUSH_HI, 0, 0);
          cc_add_fixup(iaddr, tfn, g_cc_line, 1);
        }
        return;
      }

      cc_next_tok();
      int nargs = 0;
      if (g_cc_tok != 41) {
        cc_parse_expr();
        nargs = nargs + 1;
        while (g_cc_tok == 44) {
          cc_next_tok();
          cc_parse_expr();
          nargs = nargs + 1;
        }
      }
      cc_expect(41);
      int fidx = cc_find_func(name);
      if (fidx >= 0) {
        cc_emit_jump(OP_CALL, r32(CC_FUNC_TAB + fidx * 44 + 32));
      } else {
        int iaddr = cc_emit_jump(OP_CALL, 0);
        cc_add_fixup(iaddr, name, g_cc_line, 0);
      }
      return;
    }

    // 2. Local variable, Global variable, or Compile-time constant
    int is_loc = 0;
    int v_ptr = 0;
    int lidx = cc_find_loc(name);
    if (lidx >= 0) {
      is_loc = 1;
      v_ptr = CC_LOC_TAB + lidx * 48;
    } else {
      int gidx = cc_find_glob(name);
      if (gidx >= 0) {
        is_loc = 0;
        v_ptr = CC_GLOB_TAB + gidx * 48;
      } else {
        int cidx = cc_find_const(name);
        if (cidx >= 0) {
          cc_emit_push_const(r32(CC_CONST_TAB + cidx * 36 + 32));
          return;
        }
        cc_error("undefined identifier");
        return;
      }
    }
    int v_slot = r32(v_ptr + 32);
    int v_byte = r32(v_ptr + 36);
    int v_arr  = r32(v_ptr + 40);

    // Array indexing: v[expr]
    if (g_cc_tok == 91) {
      cc_next_tok();
      if (v_arr == 1) cc_emit_var_addr(is_loc, v_slot);
      else cc_emit_var_get(is_loc, v_slot, v_arr);
      cc_parse_expr();
      cc_expect(93);
      if (v_byte == 0) {
        cc_emit_push_const(2);
        cc_emit_op(OP_SHL, 0, 0);
      }
      cc_emit_op(OP_ADD, 0, 0);
      if (g_cc_tok == 61) {
        cc_next_tok();
        cc_parse_expr();
        if (v_byte == 1) cc_emit_op(OP_STORE8, 0, 0);
        else cc_emit_op(OP_STORE32, 0, 0);
        cc_emit_push_const(0);
        return;
      }
      if (g_cc_tok == TK_ADDEQ || g_cc_tok == TK_SUBEQ) {
        int is_add = (g_cc_tok == TK_ADDEQ);
        cc_next_tok();
        cc_emit_op(OP_DUP, 0, 0);
        if (v_byte == 1) cc_emit_op(OP_LOAD8U, 0, 0);
        else cc_emit_op(OP_LOAD32, 0, 0);
        cc_parse_expr();
        if (is_add == 1) cc_emit_op(OP_ADD, 0, 0);
        else cc_emit_op(OP_SUB, 0, 0);
        if (v_byte == 1) cc_emit_op(OP_STORE8, 0, 0);
        else cc_emit_op(OP_STORE32, 0, 0);
        cc_emit_push_const(0);
        return;
      }
      if (v_byte == 1) cc_emit_op(OP_LOAD8U, 0, 0);
      else cc_emit_op(OP_LOAD32, 0, 0);
      return;
    }

    // Scalar assignment: =, +=, -=, ++, --
    if (g_cc_tok == 61) {
      cc_next_tok();
      cc_parse_expr();
      cc_emit_op(OP_DUP, 0, 0);
      cc_emit_var_set(is_loc, v_slot);
      return;
    }
    if (g_cc_tok == TK_ADDEQ || g_cc_tok == TK_SUBEQ) {
      int is_add = (g_cc_tok == TK_ADDEQ);
      cc_next_tok();
      cc_emit_var_get(is_loc, v_slot, v_arr);
      cc_parse_expr();
      if (is_add == 1) cc_emit_op(OP_ADD, 0, 0);
      else cc_emit_op(OP_SUB, 0, 0);
      cc_emit_op(OP_DUP, 0, 0);
      cc_emit_var_set(is_loc, v_slot);
      return;
    }
    if (g_cc_tok == TK_INC || g_cc_tok == TK_DEC) {
      int is_inc = (g_cc_tok == TK_INC);
      cc_next_tok();
      cc_emit_var_get(is_loc, v_slot, v_arr);
      cc_emit_push_const(1);
      if (is_inc == 1) cc_emit_op(OP_ADD, 0, 0);
      else cc_emit_op(OP_SUB, 0, 0);
      cc_emit_op(OP_DUP, 0, 0);
      cc_emit_var_set(is_loc, v_slot);
      return;
    }

    cc_emit_var_get(is_loc, v_slot, v_arr);
    return;
  }

  cc_error("unexpected token in expr");
}

void cc_parse_unary() {
  if (g_cc_err_flag != 0) return;
  if (g_cc_tok == 45) {
    cc_next_tok();
    cc_emit_push_const(0);
    cc_parse_unary();
    cc_emit_op(OP_SUB, 0, 0);
    return;
  }
  if (g_cc_tok == 33) {
    cc_next_tok();
    cc_parse_unary();
    cc_emit_push_const(0);
    cc_emit_op(OP_CMP, 0, 0);
    return;
  }
  if (g_cc_tok == 126) {
    cc_next_tok();
    cc_parse_unary();
    cc_emit_push_const(-1);
    cc_emit_op(OP_XOR, 0, 0);
    return;
  }
  if (g_cc_tok == 38) {
    cc_next_tok();
    if (g_cc_tok != TK_IDENT) {
      cc_error("ident expected after &");
      return;
    }
    int lidx = cc_find_loc(CC_IDENT_BUF);
    if (lidx >= 0) {
      cc_emit_var_addr(1, r32(CC_LOC_TAB + lidx * 48 + 32));
    } else {
      int gidx = cc_find_glob(CC_IDENT_BUF);
      if (gidx >= 0) {
        cc_emit_var_addr(0, r32(CC_GLOB_TAB + gidx * 48 + 32));
      } else {
        cc_error("unknown variable after &");
        return;
      }
    }
    cc_next_tok();
    return;
  }
  cc_parse_primary();
}

int cc_op_prec(int t) {
  if (t == 59 || t == 41 || t == 44 || t == 93) return 0;
  if (t == 43 || t == 45) return 9;
  if (t == 42 || t == 47 || t == 37) return 10;
  if (t == TK_EQ || t == TK_NE) return 6;
  if (t == 60 || t == TK_LE || t == 62 || t == TK_GE) return 7;
  if (t == TK_SHL || t == TK_SHR || t == TK_USHR) return 8;
  if (t == 38) return 5;
  if (t == 94) return 4;
  if (t == 124) return 3;
  if (t == TK_LAND) return 2;
  if (t == TK_LOR) return 1;
  return 0;
}

void cc_parse_bin(int min_prec) {
  cc_parse_unary();
  while (1) {
    int prec = cc_op_prec(g_cc_tok);
    if (prec < min_prec) break;
    int op = g_cc_tok;
    cc_next_tok();
    if (op == TK_LOR) {
      cc_emit_op(OP_DUP, 0, 0);
      int j_true = cc_emit_jump(OP_JNZ, 0);
      cc_emit_op(OP_DROP, 0, 0);
      cc_parse_bin(2);
      cc_patch_jump(j_true, g_cc_code_pos);
    } else if (op == TK_LAND) {
      cc_emit_op(OP_DUP, 0, 0);
      int j_false = cc_emit_jump(OP_JZ, 0);
      cc_emit_op(OP_DROP, 0, 0);
      cc_parse_bin(3);
      cc_patch_jump(j_false, g_cc_code_pos);
    } else {
      cc_parse_bin(prec + 1);
      if (op == 43) cc_emit_op(OP_ADD, 0, 0);
      else if (op == 45) cc_emit_op(OP_SUB, 0, 0);
      else if (op == 42) cc_emit_op(OP_MUL, 0, 0);
      else if (op == 47) cc_emit_op(OP_DIV, 0, 0);
      else if (op == 37) cc_emit_op(OP_MOD, 0, 0);
      else if (op == TK_EQ) cc_emit_op(OP_CMP, 0, 0);
      else if (op == TK_NE) cc_emit_op(OP_CMP, 0, 1);
      else if (op == 60) cc_emit_op(OP_CMP, 0, 2);
      else if (op == TK_LE) cc_emit_op(OP_CMP, 0, 3);
      else if (op == 62) cc_emit_op(OP_CMP, 0, 4);
      else if (op == TK_GE) cc_emit_op(OP_CMP, 0, 5);
      else if (op == TK_SHL) cc_emit_op(OP_SHL, 0, 0);
      else if (op == TK_USHR) cc_emit_op(OP_SHR, 0, 0);
      else if (op == TK_SHR) cc_emit_op(OP_SAR, 0, 0);
      else if (op == 38) cc_emit_op(OP_AND, 0, 0);
      else if (op == 94) cc_emit_op(OP_XOR, 0, 0);
      else if (op == 124) cc_emit_op(OP_OR, 0, 0);
    }
  }
}

void cc_parse_expr() {
  cc_parse_bin(1);
}

void cc_parse_stmt() {
  if (g_cc_err_flag != 0) return;

  // 1. Block { ... }
  if (g_cc_tok == 123) {
    cc_next_tok();
    while (g_cc_tok != 125 && g_cc_tok != TK_EOF) {
      cc_parse_stmt();
    }
    cc_expect(125);
    return;
  }

  // 2. Local variable/array declaration
  if (g_cc_tok == TK_INT || g_cc_tok == TK_BYTE) {
    int is_byte = (g_cc_tok == TK_BYTE);
    cc_next_tok();
    while (1) {
      if (g_cc_tok == 42) cc_next_tok();
      if (g_cc_tok != TK_IDENT) {
        cc_error("var name expected");
        return;
      }
      byte vname[32];
      cc_strcpy(vname, CC_IDENT_BUF);
      cc_next_tok();
      if (g_cc_tok == 91) {
        cc_next_tok();
        int len = cc_eval_const_expr();
        cc_expect(93);
        int words = len;
        if (is_byte == 1) words = (len + 3) >> 2;
        if (words < 1) words = 1;
        int slot = g_cc_loc_slots;
        g_cc_loc_slots = g_cc_loc_slots + words;
        cc_add_loc(vname, slot, is_byte, 1, len);
      } else {
        int slot = g_cc_loc_slots;
        g_cc_loc_slots = g_cc_loc_slots + 1;
        cc_add_loc(vname, slot, is_byte, 0, 1);
        if (g_cc_tok == 61) {
          cc_next_tok();
          cc_parse_expr();
          cc_emit_op(OP_SET_LOCAL, 0, slot);
        } else {
          cc_emit_push_const(0);
          cc_emit_op(OP_SET_LOCAL, 0, slot);
        }
      }
      if (g_cc_tok == 44) {
        cc_next_tok();
        continue;
      }
      break;
    }
    cc_expect(59);
    return;
  }

  // 3. if (cond) stmt [else stmt]
  if (g_cc_tok == TK_IF) {
    cc_next_tok();
    cc_expect(40);
    cc_parse_expr();
    cc_expect(41);
    int j_false = cc_emit_jump(OP_JZ, 0);
    cc_parse_stmt();
    if (g_cc_tok == TK_ELSE) {
      cc_next_tok();
      int j_end = cc_emit_jump(OP_JMP, 0);
      cc_patch_jump(j_false, g_cc_code_pos);
      cc_parse_stmt();
      cc_patch_jump(j_end, g_cc_code_pos);
    } else {
      cc_patch_jump(j_false, g_cc_code_pos);
    }
    return;
  }

  // 4. while (cond) stmt
  if (g_cc_tok == TK_WHILE) {
    cc_next_tok();
    int loop_start = g_cc_code_pos;
    g_cc_loop_depth = g_cc_loop_depth + 1;
    int cur_depth = g_cc_loop_depth;

    cc_expect(40);
    cc_parse_expr();
    cc_expect(41);
    int j_exit = cc_emit_jump(OP_JZ, 0);
    cc_parse_stmt();

    while (g_cc_cont_cnt > 0 && r32(CC_CONT_TAB + (g_cc_cont_cnt - 1) * 8) == cur_depth) {
      g_cc_cont_cnt = g_cc_cont_cnt - 1;
      cc_patch_jump(r32(CC_CONT_TAB + g_cc_cont_cnt * 8 + 4), loop_start);
    }
    cc_emit_jump(OP_JMP, loop_start);
    int loop_end = g_cc_code_pos;
    cc_patch_jump(j_exit, loop_end);
    while (g_cc_break_cnt > 0 && r32(CC_BREAK_TAB + (g_cc_break_cnt - 1) * 8) == cur_depth) {
      g_cc_break_cnt = g_cc_break_cnt - 1;
      cc_patch_jump(r32(CC_BREAK_TAB + g_cc_break_cnt * 8 + 4), loop_end);
    }
    g_cc_loop_depth = g_cc_loop_depth - 1;
    return;
  }

  // 5. for (init; cond; step) stmt
  if (g_cc_tok == TK_FOR) {
    cc_next_tok();
    cc_expect(40);
    if (g_cc_tok == TK_INT) {
      cc_next_tok();
      byte vname[32];
      cc_strcpy(vname, CC_IDENT_BUF);
      cc_expect(TK_IDENT);
      int slot = g_cc_loc_slots;
      g_cc_loc_slots = g_cc_loc_slots + 1;
      cc_add_loc(vname, slot, 0, 0, 1);
      cc_expect(61);
      cc_parse_expr();
      cc_emit_op(OP_SET_LOCAL, 0, slot);
      cc_expect(59);
    } else if (g_cc_tok != 59) {
      cc_parse_expr();
      cc_emit_op(OP_DROP, 0, 0);
      cc_expect(59);
    } else {
      cc_expect(59);
    }

    int cond_start = g_cc_code_pos;
    int j_exit = -1;
    if (g_cc_tok != 59) {
      cc_parse_expr();
      j_exit = cc_emit_jump(OP_JZ, 0);
    }
    cc_expect(59);
    int j_body = cc_emit_jump(OP_JMP, 0);

    int step_start = g_cc_code_pos;
    if (g_cc_tok != 41) {
      cc_parse_expr();
      cc_emit_op(OP_DROP, 0, 0);
    }
    cc_expect(41);
    cc_emit_jump(OP_JMP, cond_start);

    int body_start = g_cc_code_pos;
    cc_patch_jump(j_body, body_start);

    g_cc_loop_depth = g_cc_loop_depth + 1;
    int cur_depth = g_cc_loop_depth;

    cc_parse_stmt();

    while (g_cc_cont_cnt > 0 && r32(CC_CONT_TAB + (g_cc_cont_cnt - 1) * 8) == cur_depth) {
      g_cc_cont_cnt = g_cc_cont_cnt - 1;
      cc_patch_jump(r32(CC_CONT_TAB + g_cc_cont_cnt * 8 + 4), step_start);
    }
    cc_emit_jump(OP_JMP, step_start);

    int loop_end = g_cc_code_pos;
    if (j_exit >= 0) cc_patch_jump(j_exit, loop_end);
    while (g_cc_break_cnt > 0 && r32(CC_BREAK_TAB + (g_cc_break_cnt - 1) * 8) == cur_depth) {
      g_cc_break_cnt = g_cc_break_cnt - 1;
      cc_patch_jump(r32(CC_BREAK_TAB + g_cc_break_cnt * 8 + 4), loop_end);
    }
    g_cc_loop_depth = g_cc_loop_depth - 1;
    return;
  }

  // 6. return [expr];
  if (g_cc_tok == TK_RETURN) {
    cc_next_tok();
    if (g_cc_tok == 59) {
      cc_emit_push_const(0);
    } else {
      cc_parse_expr();
    }
    cc_expect(59);
    cc_emit_op(OP_RET, 0, 0);
    return;
  }

  // 7. break;
  if (g_cc_tok == TK_BREAK) {
    cc_next_tok();
    cc_expect(59);
    if (g_cc_loop_depth <= 0) {
      cc_error("break outside loop");
      return;
    }
    int jb = cc_emit_jump(OP_JMP, 0);
    w32(CC_BREAK_TAB + g_cc_break_cnt * 8, g_cc_loop_depth);
    w32(CC_BREAK_TAB + g_cc_break_cnt * 8 + 4, jb);
    g_cc_break_cnt = g_cc_break_cnt + 1;
    return;
  }

  // 8. continue;
  if (g_cc_tok == TK_CONTINUE) {
    cc_next_tok();
    cc_expect(59);
    if (g_cc_loop_depth <= 0) {
      cc_error("continue outside loop");
      return;
    }
    int jc = cc_emit_jump(OP_JMP, 0);
    w32(CC_CONT_TAB + g_cc_cont_cnt * 8, g_cc_loop_depth);
    w32(CC_CONT_TAB + g_cc_cont_cnt * 8 + 4, jc);
    g_cc_cont_cnt = g_cc_cont_cnt + 1;
    return;
  }

  // 9. Empty statement ;
  if (g_cc_tok == 59) {
    cc_next_tok();
    return;
  }

  // 10. Expression statement
  cc_parse_expr();
  cc_emit_op(OP_DROP, 0, 0);
  cc_expect(59);
}

int cc_compile_core(int src_ptr, int src_len, int dst_buf, int str_base, int max_size, int allow_imports) {
  g_cc_err_flag = 0;
  g_cc_err_line = 0;
  w32(VMRAM_STATUS + 0x6C, 0);
  hal_memset(CC_ERR_MSG, 0, 128);

  g_cc_src_ptr = src_ptr;
  g_cc_src_len = src_len;
  g_cc_pos = 0;
  g_cc_line = 1;
  g_cc_inc_depth = 0;
  g_cc_allow_imports = allow_imports;

  g_cc_out_buf = dst_buf;
  g_cc_str_base = str_base;
  g_cc_max_size = max_size;
  g_cc_code_pos = 0x0020;
  g_cc_str_pos = str_base;

  g_cc_const_cnt = 0;
  g_cc_glob_cnt = 0;
  g_cc_glob_slots = 0;
  g_cc_loc_cnt = 0;
  g_cc_loc_slots = 0;
  g_cc_func_cnt = 0;
  g_cc_fixup_cnt = 0;
  g_cc_loop_depth = 0;
  g_cc_break_cnt = 0;
  g_cc_cont_cnt = 0;
  g_cc_pool_cnt = 0;

  hal_memset(CC_CONST_HEAD, 255, 4096);
  hal_memset(dst_buf, 0, max_size);

  cc_next_tok();
  while (g_cc_tok != TK_EOF && g_cc_err_flag == 0) {
    if (g_cc_tok == TK_IMPORT) {
      cc_next_tok();
      if (g_cc_tok != TK_STR) {
        cc_error("string expected after import");
        break;
      }
      byte imp_path[48];
      hal_memset(imp_path, 0, 48);
      int ilen = g_cc_str_len;
      if (ilen > 44) ilen = 44;
      hal_memcpy(imp_path, CC_STR_BUF, ilen);
      cc_next_tok();
      if (g_cc_tok != 59) {
        cc_error("expected ; after import");
        break;
      }
      if (g_cc_allow_imports == 0) {
        cc_next_tok();
        continue;
      }
      int fidx = fs_find(imp_path);
      if (fidx < 0) {
        cc_error("cannot read imported file");
        break;
      }
      g_cc_parent_src = g_cc_src_ptr;
      g_cc_parent_len = g_cc_src_len;
      g_cc_parent_pos = g_cc_pos;
      g_cc_parent_line = g_cc_line;
      g_cc_src_ptr = fs_entry_data_ptr(fidx);
      g_cc_src_len = fs_entry_size(fidx);
      g_cc_pos = 0;
      g_cc_line = 1;
      g_cc_inc_depth = 1;
      cc_next_tok();
      continue;
    }

    if (g_cc_tok == TK_CONST) {
      cc_next_tok();
      if (g_cc_tok == TK_INT || g_cc_tok == TK_BYTE) cc_next_tok();
      byte cname[32];
      cc_strcpy(cname, CC_IDENT_BUF);
      cc_expect(TK_IDENT);
      cc_expect(61);
      int cval = cc_eval_const_expr();
      cc_set_const(cname, cval);
      cc_expect(59);
      continue;
    }

    if (g_cc_tok == TK_INT || g_cc_tok == TK_BYTE || g_cc_tok == TK_VOID) {
      int is_byte = (g_cc_tok == TK_BYTE);
      cc_next_tok();
      if (g_cc_tok == 42) cc_next_tok();
      byte dname[32];
      cc_strcpy(dname, CC_IDENT_BUF);
      cc_expect(TK_IDENT);

      if (g_cc_tok == 40) {
        cc_next_tok();
        g_cc_loc_cnt = 0;
        g_cc_loc_slots = 0;
        int nargs = 0;
        if (g_cc_tok != 41) {
          while (1) {
            int p_byte = (g_cc_tok == TK_BYTE);
            if (g_cc_tok == TK_INT || g_cc_tok == TK_BYTE) cc_next_tok();
            int p_ptr = 0;
            if (g_cc_tok == 42) {
              p_ptr = 1;
              cc_next_tok();
            }
            byte pname[32];
            cc_strcpy(pname, CC_IDENT_BUF);
            cc_expect(TK_IDENT);
            if (g_cc_tok == 91) {
              cc_next_tok();
              cc_expect(93);
              p_ptr = 1;
            }
            int p_slot = g_cc_loc_slots;
            g_cc_loc_slots = g_cc_loc_slots + 1;
            cc_add_loc(pname, p_slot, p_byte & p_ptr, 0, 1);
            nargs = nargs + 1;
            if (g_cc_tok == 44) {
              cc_next_tok();
              continue;
            }
            break;
          }
        }
        cc_expect(41);

        int fn_addr = g_cc_code_pos;
        cc_set_func(dname, fn_addr, nargs);
        int enter_addr = cc_emit_op(OP_ENTER, nargs, 0);

        cc_parse_stmt();

        w32(g_cc_out_buf + enter_addr, (OP_ENTER << 24) | ((nargs & 0xFF) << 16) | (g_cc_loc_slots & 0xFFFF));
        cc_emit_push_const(0);
        cc_emit_op(OP_RET, 0, 0);
        continue;
      }

      int first_var = 1;
      while (1) {
        if (first_var == 0) {
          if (g_cc_tok == 42) cc_next_tok();
          cc_strcpy(dname, CC_IDENT_BUF);
          cc_expect(TK_IDENT);
        }
        first_var = 0;
        if (g_cc_tok == 91) {
          cc_next_tok();
          int glen = cc_eval_const_expr();
          cc_expect(93);
          int gwords = glen;
          if (is_byte == 1) gwords = (glen + 3) >> 2;
          if (gwords < 1) gwords = 1;
          int gslot = g_cc_glob_slots;
          g_cc_glob_slots = g_cc_glob_slots + gwords;
          cc_add_glob(dname, gslot, is_byte, 1, glen);
        } else {
          int gslot = g_cc_glob_slots;
          g_cc_glob_slots = g_cc_glob_slots + 1;
          cc_add_glob(dname, gslot, is_byte, 0, 1);
        }
        if (g_cc_tok == 44) {
          cc_next_tok();
          continue;
        }
        break;
      }
      cc_expect(59);
      continue;
    }

    cc_error("unexpected top-level token");
    break;
  }

  if (g_cc_err_flag != 0) return -1;

  for (int i = 0; i < g_cc_fixup_cnt; i++) {
    int fx = CC_FIXUP_TAB + i * 44;
    int fidx = cc_find_func(fx);
    if (fidx < 0) {
      g_cc_line = r32(fx + 36);
      cc_error("undefined function");
      return -1;
    }
    int faddr = r32(CC_FUNC_TAB + fidx * 44 + 32);
    int iaddr = r32(fx + 32);
    if (r32(fx + 40) == 1) {
      w32(g_cc_out_buf + iaddr, (OP_PUSH_U16 << 24) | (faddr & 0xFFFF));
      w32(g_cc_out_buf + iaddr + 4, (OP_PUSH_HI << 24) | ((faddr >>> 16) & 0xFFFF));
    } else {
      cc_patch_jump(iaddr, faddr);
    }
  }

  int midx = cc_find_func("main");
  if (midx < 0) {
    cc_error("no main function");
    return -1;
  }
  int main_addr = r32(CC_FUNC_TAB + midx * 44 + 32);

  w32(dst_buf + 0x00, 0x52495053);
  w32(dst_buf + 0x04, 1);
  w32(dst_buf + 0x08, main_addr);
  w32(dst_buf + 0x0C, g_cc_code_pos);
  w32(dst_buf + 0x10, g_cc_glob_slots);
  w32(dst_buf + 0x14, str_base);
  w32(dst_buf + 0x18, g_cc_str_pos - str_base);

  int csum = 0;
  for (int c = 0x20; c < g_cc_code_pos; c++) {
    csum = csum * 31 + r8(dst_buf + c);
  }
  for (int s = str_base; s < g_cc_str_pos; s++) {
    csum = csum * 31 + r8(dst_buf + s);
  }
  w32(dst_buf + 0x1C, csum);
  g_cc_last_bytes = g_cc_code_pos - 0x20;
  g_cc_last_csum = csum;
  return g_cc_code_pos;
}

int cc_compile_standalone(int src_ptr, int src_len, int dst_buf) {
  int rc = cc_compile_core(src_ptr, src_len, dst_buf, 0x0800, 0x04000, 0);
  if (rc < 0) {
    g_cc_last_status = -1;
    return -1;
  }
  g_cc_last_status = 1;
  if (g_cc_str_pos > 0x0800) return g_cc_str_pos;
  return g_cc_code_pos;
}

int cc_map_standalone_addr(int spir_buf, int addr) {
  if (addr >= 0 && addr < 0x04000) return spir_buf + addr;
  return addr;
}

int cc_exec_standalone(int spir_buf) {
  if (r32(spir_buf + 0x00) != 0x52495053) return -999;
  int pc  = r32(spir_buf + 0x08);
  int sp  = 0x099000;
  int fp  = 0x099000;
  int csp = 0x09B000;
  int glob_base = 0x098000;
  hal_memset(glob_base, 0, 0x4000);
  w32(csp + 0, -1);
  w32(csp + 4, fp);
  csp = csp + 8;

  int steps = 0;
  while (pc >= 0 && steps < 200000) {
    steps = steps + 1;
    int inst = r32(spir_buf + pc);
    pc = pc + 4;
    int op = (inst >>> 24) & 0xFF;
    int a  = (inst >>> 16) & 0xFF;
    int u16 = inst & 0xFFFF;
    int s16 = (inst << 16) >> 16;
    int addr24 = inst & 0x00FFFFFF;

    if (op == OP_NOP) continue;
    if (op == OP_HALT) {
      sp = sp - 4;
      return r32(sp);
    }
    if (op == OP_PUSH_I16) { w32(sp, s16); sp = sp + 4; continue; }
    if (op == OP_PUSH_U16) { w32(sp, u16); sp = sp + 4; continue; }
    if (op == OP_PUSH_HI) {
      int prev = r32(sp - 4) & 0xFFFF;
      w32(sp - 4, prev | (u16 << 16));
      continue;
    }
    if (op == OP_DUP)  { w32(sp, r32(sp - 4)); sp = sp + 4; continue; }
    if (op == OP_DROP) { sp = sp - 4; continue; }
    if (op == OP_SWAP) {
      int t1 = r32(sp - 4);
      int t2 = r32(sp - 8);
      w32(sp - 4, t2);
      w32(sp - 8, t1);
      continue;
    }
    if (op == OP_GET_LOCAL)   { w32(sp, r32(fp + (u16 << 2))); sp = sp + 4; continue; }
    if (op == OP_SET_LOCAL)   { sp = sp - 4; w32(fp + (u16 << 2), r32(sp)); continue; }
    if (op == OP_GET_GLOBAL)  { w32(sp, r32(glob_base + (u16 << 2))); sp = sp + 4; continue; }
    if (op == OP_SET_GLOBAL)  { sp = sp - 4; w32(glob_base + (u16 << 2), r32(sp)); continue; }
    if (op == OP_ADDR_LOCAL)  { w32(sp, fp + (u16 << 2)); sp = sp + 4; continue; }
    if (op == OP_ADDR_GLOBAL) { w32(sp, glob_base + (u16 << 2)); sp = sp + 4; continue; }
    if (op >= OP_LOAD8U && op <= OP_LOAD32) {
      int eff = cc_map_standalone_addr(spir_buf, r32(sp - 4) + s16);
      if (op == OP_LOAD8U) w32(sp - 4, r8(eff));
      else if (op == OP_LOAD8S) w32(sp - 4, r8s(eff));
      else if (op == OP_LOAD16U) w32(sp - 4, r16(eff));
      else w32(sp - 4, r32(eff));
      continue;
    }
    if (op >= OP_STORE8 && op <= OP_STORE32) {
      sp = sp - 8;
      int eff = cc_map_standalone_addr(spir_buf, r32(sp) + s16);
      int sval = r32(sp + 4);
      if (op == OP_STORE8) w8(eff, sval);
      else if (op == OP_STORE16) w16(eff, sval);
      else w32(eff, sval);
      continue;
    }
    if (op >= OP_ADD && op <= OP_CMP) {
      sp = sp - 4;
      int lhs = r32(sp - 4);
      int rhs = r32(sp);
      int res = 0;
      if (op == OP_ADD) res = lhs + rhs;
      else if (op == OP_SUB) res = lhs - rhs;
      else if (op == OP_MUL) res = lhs * rhs;
      else if (op == OP_DIV) { if (rhs != 0) res = lhs / rhs; }
      else if (op == OP_MOD) { if (rhs != 0) res = lhs % rhs; }
      else if (op == OP_AND) res = lhs & rhs;
      else if (op == OP_OR)  res = lhs | rhs;
      else if (op == OP_XOR) res = lhs ^ rhs;
      else if (op == OP_SHL) res = lhs << (rhs & 31);
      else if (op == OP_SHR) res = lhs >>> (rhs & 31);
      else if (op == OP_SAR) res = lhs >> (rhs & 31);
      else if (op == OP_CMP) {
        if (u16 == 0) res = (lhs == rhs);
        else if (u16 == 1) res = (lhs != rhs);
        else if (u16 == 2) res = (lhs < rhs);
        else if (u16 == 3) res = (lhs <= rhs);
        else if (u16 == 4) res = (lhs > rhs);
        else if (u16 == 5) res = (lhs >= rhs);
      }
      w32(sp - 4, res);
      continue;
    }
    if (op == OP_JMP) { pc = addr24; continue; }
    if (op == OP_JZ)  { sp = sp - 4; if (r32(sp) == 0) pc = addr24; continue; }
    if (op == OP_JNZ) { sp = sp - 4; if (r32(sp) != 0) pc = addr24; continue; }
    if (op == OP_CALL) {
      w32(csp + 0, pc);
      w32(csp + 4, fp);
      csp = csp + 8;
      pc = addr24;
      continue;
    }
    if (op == OP_ENTER) {
      fp = sp - (a << 2);
      sp = fp + (u16 << 2);
      continue;
    }
    if (op == OP_RET) {
      int rval = r32(sp - 4);
      sp = fp;
      w32(sp, rval);
      sp = sp + 4;
      csp = csp - 8;
      pc = r32(csp + 0);
      fp = r32(csp + 4);
      continue;
    }
    if (op == OP_SYSCALL) {
      sp = sp - (a << 2);
      int sres = 0;
      if (u16 == 0) return r32(sp);
      else if (u16 == 8) sres = hal_memcpy(cc_map_standalone_addr(spir_buf, r32(sp)), cc_map_standalone_addr(spir_buf, r32(sp + 4)), r32(sp + 8));
      else if (u16 == 9) sres = hal_memset(cc_map_standalone_addr(spir_buf, r32(sp)), r32(sp + 4), r32(sp + 8));
      else if (u16 == 18) sres = hal_strcmp(cc_map_standalone_addr(spir_buf, r32(sp)), cc_map_standalone_addr(spir_buf, r32(sp + 4)));
      else if (u16 == 19) sres = hal_strlen(cc_map_standalone_addr(spir_buf, r32(sp)));
      else if (u16 == 20) sres = hal_itoa(r32(sp), cc_map_standalone_addr(spir_buf, r32(sp + 4)), r32(sp + 8));
      w32(sp, sres);
      sp = sp + 4;
      continue;
    }
  }
  return r32(sp - 4);
}

int cc_rebuild_os_image() {
  int os_idx = fs_find("/src/os.sp");
  if (os_idx < 0) {
    g_cc_last_status = -1;
    return -1;
  }
  int os_ptr = fs_entry_data_ptr(os_idx);
  int os_len = fs_entry_size(os_idx);

  int rc = cc_compile_core(os_ptr, os_len, CC_WORK_BUF, 0x01C000, 0x020000, 1);
  if (rc < 0 || g_cc_err_flag != 0) {
    g_cc_last_status = -1;
    return -1;
  }

  // Copy newly compiled 128 KB SPIR image to mounted spiralos.img (Sectors 64..319)
  hal_memcpy(VMRAM_IMG_BASE + 0x8000, CC_WORK_BUF, 0x020000);
  hal_disk_sync(64, 256);

  g_cc_last_status = 1;
  return 1;
}
