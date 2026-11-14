/**
 * SpiralOS 1.1 — SpiralC Compiler (compiler/spiralc.js)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Compiles Spiral Language (.sp) source files into a portable Spiral VM
 * bytecode image ('SPIR' format, up to 128 KB: 112 KB code + 16 KB strings).
 *
 * Designed in 1-to-1 algorithmic correspondence with /src/cc.sp (the in-OS
 * self-hosted compiler) so that compiling SpiralOS inside SpiralOS on either
 * TabComp or Hummingbird produces a byte-for-byte identical SPIR image
 * (Stage 1 == Stage 2 == Stage 3 across both machines).
 */

"use strict";

// Token constants (identical in compiler/spiralc.js and /src/cc.sp)
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

const TK_EQ       = 256; // ==
const TK_NE       = 257; // !=
const TK_LE       = 258; // <=
const TK_GE       = 259; // >=
const TK_SHL      = 260; // <<
const TK_SHR      = 261; // >>
const TK_USHR     = 262; // >>>
const TK_LAND     = 263; // &&
const TK_LOR      = 264; // ||
const TK_INC      = 265; // ++
const TK_DEC      = 266; // --
const TK_ADDEQ    = 267; // +=
const TK_SUBEQ    = 268; // -=

// SpiralVM Opcodes (0x00 .. 0x27)
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

const SPIR_MAGIC     = 0x52495053; // 'SPIR'
const SPIR_STR_BASE  = 0x000020;
const SPIR_CODE_BASE = 0x001580;   // String pool base in 128KB SPIR image (114,688 .. 131,071)
const SPIR_MAX_SIZE  = 0x020000;   // 128 KB total SPIR image size

function expandImports(entryPath, readFileTextFn) {
  const visited = new Set();
  const chunks = [];

  function loadRec(filePath) {
    if (visited.has(filePath)) return;
    visited.add(filePath);
    const text = readFileTextFn(filePath);
    if (text === null || text === undefined) {
      throw new Error(`SpiralC: Cannot read imported file '${filePath}'`);
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith("import ")) {
        const m = trimmed.match(/^import\s+"([^"]+)"\s*;/);
        if (m) {
          loadRec(m[1]);
          continue;
        }
      }
      chunks.push(line);
    }
  }

  loadRec(entryPath);
  return chunks.join("\n");
}

function compileSpiralSource(sourceText, readFileFn = null) {
  let src = typeof sourceText === "string"
    ? new TextEncoder().encode(sourceText)
    : new Uint8Array(sourceText);
  let srcLen = src.length;
  let pos = 0;
  let lineNum = 1;
  let includeDepth = 0;
  let parentSrc = null;
  let parentLen = 0;
  let parentPos = 0;
  let parentLine = 1;

  // Output 128 KB SPIR buffer
  const outBuf = new Uint8Array(SPIR_MAX_SIZE);
  const outDV = new DataView(outBuf.buffer);
  let codePos = SPIR_CODE_BASE;
  let lastPatchPos = -1; // Bytecode starts right after 32-byte SPIR header
  let strPos = SPIR_STR_BASE;

  function emitWord(w) {
    if (codePos + 4 > SPIR_MAX_SIZE) {
      throw new Error(`SpiralC: Code size exceeded ${SPIR_MAX_SIZE} bytes at line ${lineNum}`);
    }
    outDV.setUint32(codePos, w >>> 0, true);
    const addr = codePos;
    codePos += 4;
    return addr;
  }

  function popAddOffset16() {
    if (codePos >= SPIR_CODE_BASE + 8) {
      const last1 = outDV.getUint32(codePos - 4, true);
      const last2 = outDV.getUint32(codePos - 8, true);
      if (last1 === (OP_ADD << 24) && ((last2 >>> 24) & 0xFF) === OP_PUSH_I16) {
        codePos -= 8;
        return last2 & 0xFFFF;
      }
    }
    return 0;
  }

  function emitDropStmt() {
    if (codePos >= SPIR_CODE_BASE + 8) {
      const last1 = outDV.getUint32(codePos - 4, true);
      const last2 = outDV.getUint32(codePos - 8, true);
      const op1 = (last1 >>> 24) & 0xFF;
      const op2 = (last2 >>> 24) & 0xFF;
      if (last1 === (OP_PUSH_I16 << 24) && op2 >= OP_STORE8 && op2 <= OP_STORE32) {
        codePos -= 4;
        return;
      }
      if ((op1 === OP_SET_LOCAL || op1 === OP_SET_GLOBAL) && last2 === (OP_DUP << 24)) {
        outDV.setUint32(codePos - 8, last1, true);
        codePos -= 4;
        return;
      }
    }
    emitOp(OP_DROP);
  }

  function emitOp(op, a = 0, imm16 = 0) {
    if ((op === OP_ADD || op === OP_SUB || op === OP_MUL || op === OP_SHL) && codePos >= SPIR_CODE_BASE + 8) {
      const w1 = outDV.getUint32(codePos - 4, true);
      if (((w1 >>> 24) & 0xFF) === OP_PUSH_I16) {
        const c2 = ((w1 & 0xFFFF) << 16) >> 16;
        const w2 = outDV.getUint32(codePos - 8, true);
        const op2 = (w2 >>> 24) & 0xFF;
        if (op2 === OP_PUSH_I16) {
          const c1 = ((w2 & 0xFFFF) << 16) >> 16;
          codePos -= 8;
          const r = (op === OP_ADD) ? (c1 + c2) : (op === OP_SUB) ? (c1 - c2) : (op === OP_MUL) ? Math.imul(c1, c2) : (c1 << (c2 & 31));
          return emitPushConst(r | 0);
        }
        if ((op === OP_ADD || op === OP_SUB) && op2 === OP_PUSH_HI && codePos >= SPIR_CODE_BASE + 12) {
          const w3 = outDV.getUint32(codePos - 12, true);
          if (((w3 >>> 24) & 0xFF) === OP_PUSH_U16) {
            const c1 = (((w2 & 0xFFFF) << 16) | (w3 & 0xFFFF)) | 0;
            codePos -= 12;
            return emitPushConst(((op === OP_ADD) ? (c1 + c2) : (c1 - c2)) | 0);
          }
        }
      }
    }
    return emitWord((((op & 0xFF) << 24) | ((a & 0xFF) << 16) | (imm16 & 0xFFFF)) >>> 0);
  }

  function emitJump(op, addr24 = 0) {
    if (op === OP_JZ && addr24 === 0 && codePos >= SPIR_CODE_BASE + 8 && lastPatchPos !== codePos) {
      const w1 = outDV.getUint32(codePos - 4, true);
      const w2 = outDV.getUint32(codePos - 8, true);
      if (w2 === (OP_PUSH_I16 << 24)) {
        if (w1 === (OP_CMP << 24)) { codePos -= 8; op = OP_JNZ; }
        else if (w1 === ((OP_CMP << 24) | 1)) { codePos -= 8; op = OP_JZ; }
      }
    }
    return emitWord((((op & 0xFF) << 24) | (addr24 & 0x00FFFFFF)) >>> 0);
  }

  function patchJump(instByteAddr, targetByteAddr) {
    lastPatchPos = targetByteAddr;
    const prev = outDV.getUint32(instByteAddr, true);
    const op = (prev >>> 24) & 0xFF;
    outDV.setUint32(instByteAddr, ((op << 24) | (targetByteAddr & 0x00FFFFFF)) >>> 0, true);
  }

  function emitPushConst(val) {
    const v = val | 0;
    if (v >= -32768 && v <= 32767) {
      emitOp(OP_PUSH_I16, 0, v & 0xFFFF);
    } else if (v >= 0 && v <= 65535) {
      emitOp(OP_PUSH_U16, 0, v & 0xFFFF);
    } else {
      emitOp(OP_PUSH_U16, 0, v & 0xFFFF);
      emitOp(OP_PUSH_HI, 0, (v >>> 16) & 0xFFFF);
    }
  }

  function addStringLiteral(bytesArr) {
    const len = bytesArr.length;
    let p = SPIR_STR_BASE;
    while (p < strPos) {
      let slen = 0;
      while (p + slen < strPos && outBuf[p + slen] !== 0) slen++;
      if (slen === len) {
        let match = true;
        for (let k = 0; k < len; k++) {
          if (outBuf[p + k] !== bytesArr[k]) { match = false; break; }
        }
        if (match) return p;
      }
      p += slen + 1;
    }
    if (strPos + len + 1 > SPIR_CODE_BASE) {
      throw new Error(`SpiralC: String pool overflow at line ${lineNum}`);
    }
    const startAddr = strPos;
    for (let i = 0; i < len; i++) {
      outBuf[strPos++] = bytesArr[i] & 0xFF;
    }
    outBuf[strPos++] = 0;
    return startAddr;
  }

  // Symbol Tables
  const consts = new Map(); // name -> int32
  const globals = new Map(); // name -> { slot, isByte, isArray, size }
  let globalSlotCount = 0;

  const funcs = new Map(); // name -> { addr, nargs, defined }
  const callFixups = [];   // { instAddr, name, line, isFnAddr }

  let locals = new Map();  // name -> { slot, isByte, isArray, size }
  let localSlotCount = 0;

  // Loop break/continue stacks
  const breakStack = [];
  const continueStack = [];

  // Lexer state
  let tok = TK_EOF;
  let tokVal = 0;
  let tokIdent = "";
  let tokStrBytes = [];

  function isAlpha(c) {
    return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
  }
  function isDigit(c) {
    return c >= 48 && c <= 57;
  }
  function isHex(c) {
    return isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
  }
  function hexVal(c) {
    if (c >= 48 && c <= 57) return c - 48;
    if (c >= 65 && c <= 70) return c - 55;
    return c - 87;
  }

  function readEscapeChar() {
    if (pos >= srcLen) return 0;
    const c = src[pos++];
    if (c === 110) return 10; // \n
    if (c === 114) return 13; // \r
    if (c === 116) return 9;  // \t
    if (c === 48)  return 0;  // \0
    return c;
  }

  function nextToken() {
    while (true) {
      while (pos < srcLen) {
        const c = src[pos];
        if (c === 10) { lineNum++; pos++; continue; }
        if (c <= 32) { pos++; continue; }
        // Line comment //
        if (c === 47 && pos + 1 < srcLen && src[pos + 1] === 47) {
          pos += 2;
          while (pos < srcLen && src[pos] !== 10) pos++;
          continue;
        }
        // Block comment /* ... */
        if (c === 47 && pos + 1 < srcLen && src[pos + 1] === 42) {
          pos += 2;
          while (pos + 1 < srcLen && !(src[pos] === 42 && src[pos + 1] === 47)) {
            if (src[pos] === 10) lineNum++;
            pos++;
          }
          pos += 2;
          continue;
        }
        break;
      }

      if (pos >= srcLen) {
        if (includeDepth > 0) {
          src = parentSrc;
          srcLen = parentLen;
          pos = parentPos;
          lineNum = parentLine;
          includeDepth = 0;
          continue;
        }
        tok = TK_EOF;
        return;
      }
      break;
    }

    const c = src[pos];

    // Number literal
    if (isDigit(c)) {
      let v = 0;
      if (c === 48 && pos + 1 < srcLen && (src[pos + 1] === 120 || src[pos + 1] === 88)) {
        pos += 2;
        while (pos < srcLen && isHex(src[pos])) {
          v = ((v << 4) | hexVal(src[pos])) | 0;
          pos++;
        }
      } else {
        while (pos < srcLen && isDigit(src[pos])) {
          v = (Math.imul(v, 10) + (src[pos] - 48)) | 0;
          pos++;
        }
      }
      tok = TK_NUM;
      tokVal = v;
      return;
    }

    // Character literal 'x'
    if (c === 39) {
      pos++;
      let ch = src[pos++];
      if (ch === 92) ch = readEscapeChar();
      if (pos < srcLen && src[pos] === 39) pos++;
      tok = TK_NUM;
      tokVal = ch & 0xFF;
      return;
    }

    // String literal "..."
    if (c === 34) {
      pos++;
      const bytes = [];
      while (pos < srcLen && src[pos] !== 34) {
        let ch = src[pos++];
        if (ch === 92) ch = readEscapeChar();
        bytes.push(ch & 0xFF);
      }
      if (pos < srcLen && src[pos] === 34) pos++;
      tok = TK_STR;
      tokStrBytes = bytes;
      return;
    }

    // Identifier or Keyword
    if (isAlpha(c)) {
      let s = "";
      while (pos < srcLen && (isAlpha(src[pos]) || isDigit(src[pos]))) {
        s += String.fromCharCode(src[pos++]);
      }
      tokIdent = s;
      if (s === "int")      { tok = TK_INT; return; }
      if (s === "byte")     { tok = TK_BYTE; return; }
      if (s === "void")     { tok = TK_VOID; return; }
      if (s === "const")    { tok = TK_CONST; return; }
      if (s === "if")       { tok = TK_IF; return; }
      if (s === "else")     { tok = TK_ELSE; return; }
      if (s === "while")    { tok = TK_WHILE; return; }
      if (s === "for")      { tok = TK_FOR; return; }
      if (s === "return")   { tok = TK_RETURN; return; }
      if (s === "break")    { tok = TK_BREAK; return; }
      if (s === "continue") { tok = TK_CONTINUE; return; }
      if (s === "import")   { tok = TK_IMPORT; return; }
      tok = TK_IDENT;
      return;
    }

    // Multi-char operators
    pos++;
    const c2 = pos < srcLen ? src[pos] : 0;
    const c3 = pos + 1 < srcLen ? src[pos + 1] : 0;

    if (c === 61 && c2 === 61) { pos++; tok = TK_EQ; return; }
    if (c === 33 && c2 === 61) { pos++; tok = TK_NE; return; }
    if (c === 60 && c2 === 61) { pos++; tok = TK_LE; return; }
    if (c === 62 && c2 === 61) { pos++; tok = TK_GE; return; }
    if (c === 60 && c2 === 60) { pos++; tok = TK_SHL; return; }
    if (c === 62 && c2 === 62 && c3 === 62) { pos += 2; tok = TK_USHR; return; }
    if (c === 62 && c2 === 62) { pos++; tok = TK_SHR; return; }
    if (c === 38 && c2 === 38) { pos++; tok = TK_LAND; return; }
    if (c === 124 && c2 === 124) { pos++; tok = TK_LOR; return; }
    if (c === 43 && c2 === 43) { pos++; tok = TK_INC; return; }
    if (c === 45 && c2 === 45) { pos++; tok = TK_DEC; return; }
    if (c === 43 && c2 === 61) { pos++; tok = TK_ADDEQ; return; }
    if (c === 45 && c2 === 61) { pos++; tok = TK_SUBEQ; return; }

    tok = c;
  }

  function expect(t) {
    if (tok !== t) {
      const expStr = t < 256 ? String.fromCharCode(t) : `tok(${t})`;
      const gotStr = tok < 256 && tok > 0 ? String.fromCharCode(tok) : `tok(${tok}, '${tokIdent}')`;
      throw new Error(`SpiralC syntax error at line ${lineNum}: expected ${expStr}, got ${gotStr}`);
    }
    nextToken();
  }

  function evalConstAtom() {
    let sign = 1;
    if (tok === 45) { sign = -1; nextToken(); }
    else if (tok === 126) { nextToken(); return ~evalConstAtom(); }
    if (tok === TK_NUM) {
      const v = tokVal;
      nextToken();
      return Math.imul(v, sign);
    }
    if (tok === TK_IDENT) {
      const name = tokIdent;
      nextToken();
      if (!consts.has(name)) {
        throw new Error(`SpiralC: Unknown constant '${name}' at line ${lineNum}`);
      }
      return Math.imul(consts.get(name), sign);
    }
    if (tok === 40) { // '('
      nextToken();
      const v = evalConstExpr();
      expect(41);
      return Math.imul(v, sign);
    }
    throw new Error(`SpiralC: Constant expression expected at line ${lineNum}`);
  }

  function evalConstExpr() {
    let v = evalConstAtom();
    while (tok === 43 || tok === 45 || tok === 42 || tok === 47 || tok === 124 || tok === 38 || tok === TK_SHL || tok === TK_SHR) {
      const op = tok;
      nextToken();
      const r = evalConstAtom();
      if (op === 43) v = (v + r) | 0;
      else if (op === 45) v = (v - r) | 0;
      else if (op === 42) v = Math.imul(v, r);
      else if (op === 47) v = (v / r) | 0;
      else if (op === 124) v = v | r;
      else if (op === 38) v = v & r;
      else if (op === TK_SHL) v = v << r;
      else if (op === TK_SHR) v = v >> r;
    }
    return v;
  }

  function lookupVar(name) {
    if (locals.has(name)) {
      return { scope: "local", ...locals.get(name) };
    }
    if (globals.has(name)) {
      return { scope: "global", ...globals.get(name) };
    }
    return null;
  }

  function emitVarAddr(v) {
    if (v.scope === "local") {
      emitOp(OP_ADDR_LOCAL, 0, v.slot);
    } else {
      emitOp(OP_ADDR_GLOBAL, 0, v.slot);
    }
  }

  function emitVarGet(v) {
    if (v.isArray) {
      emitVarAddr(v);
      return;
    }
    if (v.scope === "local") {
      emitOp(OP_GET_LOCAL, 0, v.slot);
    } else {
      emitOp(OP_GET_GLOBAL, 0, v.slot);
    }
  }

  function emitVarSet(v) {
    if (v.scope === "local") {
      emitOp(OP_SET_LOCAL, 0, v.slot);
    } else {
      emitOp(OP_SET_GLOBAL, 0, v.slot);
    }
  }

  // Expression Parser
  function parseExpr() {
    return parseLor();
  }

  function parseLor() {
    let left = parseLand();
    while (tok === TK_LOR) {
      nextToken();
      emitOp(OP_DUP);
      const jTrue = emitJump(OP_JNZ, 0);
      emitOp(OP_DROP);
      parseLand();
      const endLbl = codePos;
      patchJump(jTrue, endLbl);
    }
    return left;
  }

  function parseLand() {
    let left = parseBitOr();
    while (tok === TK_LAND) {
      nextToken();
      emitOp(OP_DUP);
      const jFalse = emitJump(OP_JZ, 0);
      emitOp(OP_DROP);
      parseBitOr();
      const endLbl = codePos;
      patchJump(jFalse, endLbl);
    }
    return left;
  }

  function parseBitOr() {
    parseBitXor();
    while (tok === 124) { // '|'
      nextToken();
      parseBitXor();
      emitOp(OP_OR);
    }
  }

  function parseBitXor() {
    parseBitAnd();
    while (tok === 94) { // '^'
      nextToken();
      parseBitAnd();
      emitOp(OP_XOR);
    }
  }

  function parseBitAnd() {
    parseEq();
    while (tok === 38) { // '&'
      nextToken();
      parseEq();
      emitOp(OP_AND);
    }
  }

  function parseEq() {
    parseRel();
    while (tok === TK_EQ || tok === TK_NE) {
      const op = tok;
      nextToken();
      parseRel();
      emitOp(OP_CMP, 0, op === TK_EQ ? 0 : 1);
    }
  }

  function parseRel() {
    parseShift();
    while (tok === 60 || tok === TK_LE || tok === 62 || tok === TK_GE) {
      const op = tok;
      nextToken();
      parseShift();
      if (op === 60) emitOp(OP_CMP, 0, 2);      // <
      else if (op === TK_LE) emitOp(OP_CMP, 0, 3); // <=
      else if (op === 62) emitOp(OP_CMP, 0, 4); // >
      else emitOp(OP_CMP, 0, 5);                // >=
    }
  }

  function parseShift() {
    parseAdd();
    while (tok === TK_SHL || tok === TK_SHR || tok === TK_USHR) {
      const op = tok;
      nextToken();
      parseAdd();
      if (op === TK_SHL) emitOp(OP_SHL);
      else if (op === TK_USHR) emitOp(OP_SHR);
      else emitOp(OP_SAR);
    }
  }

  function parseAdd() {
    parseMul();
    while (tok === 43 || tok === 45) {
      const op = tok;
      nextToken();
      parseMul();
      emitOp(op === 43 ? OP_ADD : OP_SUB);
    }
  }

  function parseMul() {
    parseUnary();
    while (tok === 42 || tok === 47 || tok === 37) {
      const op = tok;
      nextToken();
      parseUnary();
      if (op === 42) emitOp(OP_MUL);
      else if (op === 47) emitOp(OP_DIV);
      else emitOp(OP_MOD);
    }
  }

  function parseUnary() {
    if (tok === 45) { // '-x' -> 0 - x
      nextToken();
      if (tok === TK_NUM) {
        emitPushConst((-tokVal) | 0);
        nextToken();
        return;
      }
      emitPushConst(0);
      parseUnary();
      emitOp(OP_SUB);
      return;
    }
    if (tok === 33) { // '!x' -> (x == 0)
      nextToken();
      parseUnary();
      emitPushConst(0);
      emitOp(OP_CMP, 0, 0);
      return;
    }
    if (tok === 126) { // '~x' -> x ^ -1
      nextToken();
      parseUnary();
      emitPushConst(-1);
      emitOp(OP_XOR);
      return;
    }
    if (tok === 38) { // '&ident'
      nextToken();
      if (tok !== TK_IDENT) throw new Error(`SpiralC: Identifier expected after '&' at line ${lineNum}`);
      const name = tokIdent;
      nextToken();
      const v = lookupVar(name);
      if (!v) throw new Error(`SpiralC: Unknown variable '${name}' at line ${lineNum}`);
      emitVarAddr(v);
      return;
    }
    parsePrimary();
  }

  function parsePrimary() {
    if (tok === TK_NUM) {
      emitPushConst(tokVal);
      nextToken();
      return;
    }
    if (tok === TK_STR) {
      const strAddr = addStringLiteral(tokStrBytes);
      emitPushConst(strAddr);
      nextToken();
      return;
    }
    if (tok === 40) { // '('
      nextToken();
      parseExpr();
      expect(41);
      return;
    }
    if (tok === TK_IDENT) {
      const name = tokIdent;
      nextToken();

      // 1. Check built-in memory, syscall, and fn_addr intrinsics
      if (name === "r8" || name === "r8s" || name === "r16" || name === "r32") {
        expect(40);
        parseExpr();
        expect(41);
        const off16 = popAddOffset16();
        if (name === "r8") emitOp(OP_LOAD8U, 0, off16);
        else if (name === "r8s") emitOp(OP_LOAD8S, 0, off16);
        else if (name === "r16") emitOp(OP_LOAD16U, 0, off16);
        else emitOp(OP_LOAD32, 0, off16);
        return;
      }
      if (name === "w8" || name === "w16" || name === "w32") {
        expect(40);
        parseExpr(); // addr
        const off16 = popAddOffset16();
        expect(44);  // ','
        parseExpr(); // val
        expect(41);
        if (name === "w8") emitOp(OP_STORE8, 0, off16);
        else if (name === "w16") emitOp(OP_STORE16, 0, off16);
        else emitOp(OP_STORE32, 0, off16);
        emitPushConst(0); // expression value 0
        return;
      }
      if (name === "sys") {
        expect(40);
        const sysnum = evalConstExpr();
        let nargs = 0;
        while (tok === 44) { // ','
          nextToken();
          parseExpr();
          nargs++;
        }
        expect(41);
        emitOp(OP_SYSCALL, nargs, sysnum);
        return;
      }
      if (name === "fn_addr" && tok === 40) {
        expect(40);
        const targetFn = tokIdent;
        expect(TK_IDENT);
        expect(41);
        const fn = funcs.get(targetFn);
        if (fn && fn.defined) {
          emitOp(OP_PUSH_U16, 0, fn.addr & 0xFFFF);
          emitOp(OP_PUSH_HI, 0, (fn.addr >>> 16) & 0xFFFF);
        } else {
          const instAddr = emitOp(OP_PUSH_U16, 0, 0);
          emitOp(OP_PUSH_HI, 0, 0);
          callFixups.push({ instAddr, name: targetFn, line: lineNum, isFnAddr: true });
        }
        return;
      }

      // 2. Check compile-time constant
      if (consts.has(name)) {
        emitPushConst(consts.get(name));
        return;
      }

      // 3. Function call: name(arg0, ...)
      if (tok === 40) { // '('
        nextToken();
        let nargs = 0;
        if (tok !== 41) {
          parseExpr();
          nargs++;
          while (tok === 44) {
            nextToken();
            parseExpr();
            nargs++;
          }
        }
        expect(41);
        if (nargs === 5 && name === "hal_char") {
          emitPushConst(0);
          nargs = 6;
        }
        const fn = funcs.get(name);
        if (fn && fn.defined) {
          emitJump(OP_CALL, fn.addr);
        } else {
          const instAddr = emitJump(OP_CALL, 0);
          callFixups.push({ instAddr, name, line: lineNum, isFnAddr: false });
        }
        return;
      }

      // 4. Local or Global Variable / Array
      const v = lookupVar(name);
      if (!v) {
        throw new Error(`SpiralC: Undefined identifier '${name}' at line ${lineNum}`);
      }

      // Array indexing: v[expr]
      if (tok === 91) { // '['
        nextToken();
        if (v.isArray) {
          emitVarAddr(v);
        } else {
          emitVarGet(v);
        }
        parseExpr(); // index
        expect(93);  // ']'
        if (!v.isByte) {
          emitPushConst(2);
          emitOp(OP_SHL); // index * 4
        }
        emitOp(OP_ADD); // base + offset
        if (tok === TK_ADDEQ || tok === TK_SUBEQ) {
          const isAdd = (tok === TK_ADDEQ);
          nextToken();
          emitOp(OP_DUP);
          emitOp(v.isByte ? OP_LOAD8U : OP_LOAD32, 0, 0);
          parseExpr();
          emitOp(isAdd ? OP_ADD : OP_SUB);
          emitOp(v.isByte ? OP_STORE8 : OP_STORE32, 0, 0);
          emitPushConst(0);
          return;
        }
        const arrOff16 = popAddOffset16();
        if (tok === 61) { // '='
          nextToken();
          parseExpr();
          emitOp(v.isByte ? OP_STORE8 : OP_STORE32, 0, arrOff16);
          emitPushConst(0);
          return;
        }
        emitOp(v.isByte ? OP_LOAD8U : OP_LOAD32, 0, arrOff16);
        return;
      }

      // Scalar assignment: v = expr, v += expr, v -= expr, v++, v--
      if (tok === 61) { // '='
        nextToken();
        parseExpr();
        emitOp(OP_DUP);
        emitVarSet(v);
        return;
      }
      if (tok === TK_ADDEQ || tok === TK_SUBEQ) {
        const isAdd = (tok === TK_ADDEQ);
        nextToken();
        emitVarGet(v);
        parseExpr();
        emitOp(isAdd ? OP_ADD : OP_SUB);
        emitOp(OP_DUP);
        emitVarSet(v);
        return;
      }
      if (tok === TK_INC || tok === TK_DEC) {
        const isInc = (tok === TK_INC);
        nextToken();
        emitVarGet(v);
        emitPushConst(1);
        emitOp(isInc ? OP_ADD : OP_SUB);
        emitOp(OP_DUP);
        emitVarSet(v);
        return;
      }

      emitVarGet(v);
      return;
    }

    throw new Error(`SpiralC: Unexpected token ${tok} ('${tokIdent}') in expression at line ${lineNum}`);
  }

  function parseStmt() {
    // 1. Block { ... }
    if (tok === 123) { // '{'
      nextToken();
      while (tok !== 125 && tok !== TK_EOF) {
        parseStmt();
      }
      expect(125);
      return;
    }

    // 2. Local variable/array declaration: int x = ...; or byte buf[64];
    if (tok === TK_INT || tok === TK_BYTE) {
      const isByte = (tok === TK_BYTE);
      nextToken();
      while (true) {
        if (tok === 42) nextToken(); // optional '*' pointer marker
        if (tok !== TK_IDENT) throw new Error(`SpiralC: Variable name expected at line ${lineNum}`);
        const vName = tokIdent;
        nextToken();
        if (tok === 91) { // '[' array
          nextToken();
          const len = evalConstExpr();
          expect(93);
          const words = isByte ? ((len + 3) >> 2) : len;
          const slot = localSlotCount;
          localSlotCount += Math.max(1, words);
          locals.set(vName, { slot, isByte, isArray: true, size: len });
        } else {
          const slot = localSlotCount++;
          locals.set(vName, { slot, isByte, isArray: false, size: 1 });
          if (tok === 61) { // '='
            nextToken();
            parseExpr();
            emitOp(OP_SET_LOCAL, 0, slot);
          } else {
            emitPushConst(0);
            emitOp(OP_SET_LOCAL, 0, slot);
          }
        }
        if (tok === 44) { nextToken(); continue; }
        break;
      }
      expect(59); // ';'
      return;
    }

    // 3. if (cond) stmt [else stmt]
    if (tok === TK_IF) {
      nextToken();
      expect(40);
      parseExpr();
      expect(41);
      const jFalse = emitJump(OP_JZ, 0);
      parseStmt();
      if (tok === TK_ELSE) {
        nextToken();
        const prevOp = (outDV.getUint32(codePos - 4, true) >>> 24) & 0xFF;
        const noFall = (lastPatchPos !== codePos && (prevOp === OP_RET || prevOp === OP_JMP));
        const jEnd = noFall ? -1 : emitJump(OP_JMP, 0);
        patchJump(jFalse, codePos);
        parseStmt();
        if (jEnd >= 0) patchJump(jEnd, codePos);
      } else {
        patchJump(jFalse, codePos);
      }
      return;
    }

    // 4. while (cond) stmt
    if (tok === TK_WHILE) {
      nextToken();
      const loopStart = codePos;
      const bList = [];
      const cList = [];
      breakStack.push(bList);
      continueStack.push(cList);

      expect(40);
      parseExpr();
      expect(41);
      const jExit = emitJump(OP_JZ, 0);
      parseStmt();
      for (const cAddr of cList) patchJump(cAddr, loopStart);
      emitJump(OP_JMP, loopStart);
      const loopEnd = codePos;
      patchJump(jExit, loopEnd);
      for (const bAddr of bList) patchJump(bAddr, loopEnd);

      breakStack.pop();
      continueStack.pop();
      return;
    }

    // 5. for (init; cond; step) stmt
    if (tok === TK_FOR) {
      nextToken();
      expect(40);
      if (tok === TK_INT) {
        nextToken();
        const vName = tokIdent;
        expect(TK_IDENT);
        const slot = localSlotCount++;
        locals.set(vName, { slot, isByte: false, isArray: false, size: 1 });
        expect(61);
        parseExpr();
        emitOp(OP_SET_LOCAL, 0, slot);
        expect(59);
      } else if (tok !== 59) {
        parseExpr();
        emitDropStmt();
        expect(59);
      } else {
        expect(59);
      }

      const condStart = codePos;
      let jExit = -1;
      if (tok !== 59) {
        parseExpr();
        jExit = emitJump(OP_JZ, 0);
      }
      expect(59);
      const jBody = emitJump(OP_JMP, 0);

      const stepStart = codePos;
      if (tok !== 41) {
        parseExpr();
        emitDropStmt();
      }
      expect(41);
      emitJump(OP_JMP, condStart);

      const bodyStart = codePos;
      patchJump(jBody, bodyStart);

      const bList = [];
      const cList = [];
      breakStack.push(bList);
      continueStack.push(cList);

      parseStmt();

      for (const cAddr of cList) patchJump(cAddr, stepStart);
      emitJump(OP_JMP, stepStart);

      const loopEnd = codePos;
      if (jExit >= 0) patchJump(jExit, loopEnd);
      for (const bAddr of bList) patchJump(bAddr, loopEnd);

      breakStack.pop();
      continueStack.pop();
      return;
    }

    // 6. return [expr];
    if (tok === TK_RETURN) {
      nextToken();
      if (tok === 59) {
        emitPushConst(0);
      } else {
        parseExpr();
      }
      expect(59);
      emitOp(OP_RET);
      return;
    }

    // 7. break;
    if (tok === TK_BREAK) {
      nextToken();
      expect(59);
      if (breakStack.length === 0) throw new Error(`SpiralC: 'break' outside loop at line ${lineNum}`);
      breakStack[breakStack.length - 1].push(emitJump(OP_JMP, 0));
      return;
    }

    // 8. continue;
    if (tok === TK_CONTINUE) {
      nextToken();
      expect(59);
      if (continueStack.length === 0) throw new Error(`SpiralC: 'continue' outside loop at line ${lineNum}`);
      continueStack[continueStack.length - 1].push(emitJump(OP_JMP, 0));
      return;
    }

    // 9. Empty statement ;
    if (tok === 59) {
      nextToken();
      return;
    }

    // 10. Expression statement
    parseExpr();
    emitDropStmt();
    expect(59);
  }

  // Top-level Parser
  nextToken();
  while (tok !== TK_EOF) {
    if (tok === TK_IMPORT) {
      nextToken();
      if (tok !== TK_STR) {
        throw new Error(`SpiralC syntax error at line ${lineNum}: string expected after import`);
      }
      let impPath = "";
      for (let i = 0; i < tokStrBytes.length; i++) {
        impPath += String.fromCharCode(tokStrBytes[i]);
      }
      nextToken();
      if (tok !== 59) {
        throw new Error(`SpiralC syntax error at line ${lineNum}: expected ';' after import`);
      }
      if (!readFileFn) {
        nextToken();
        continue;
      }
      const childBytes = readFileFn(impPath);
      if (!childBytes) {
        throw new Error(`SpiralC: Cannot read imported file '${impPath}' at line ${lineNum}`);
      }
      parentSrc = src;
      parentLen = srcLen;
      parentPos = pos;
      parentLine = lineNum;
      src = typeof childBytes === "string" ? new TextEncoder().encode(childBytes) : new Uint8Array(childBytes);
      srcLen = src.length;
      pos = 0;
      lineNum = 1;
      includeDepth = 1;
      nextToken();
      continue;
    }

    if (tok === TK_CONST) {
      nextToken();
      if (tok === TK_INT || tok === TK_BYTE) nextToken();
      const cName = tokIdent;
      expect(TK_IDENT);
      expect(61); // '='
      const cVal = evalConstExpr();
      consts.set(cName, cVal);
      expect(59); // ';'
      continue;
    }

    if (tok === TK_INT || tok === TK_BYTE || tok === TK_VOID) {
      const isByte = (tok === TK_BYTE);
      nextToken();
      if (tok === 42) nextToken(); // optional '*'
      const name = tokIdent;
      expect(TK_IDENT);

      // Function definition: name(...) { ... }
      if (tok === 40) { // '('
        nextToken();
        locals = new Map();
        localSlotCount = 0;
        let nargs = 0;
        if (tok !== 41) {
          while (true) {
            const pIsByte = (tok === TK_BYTE);
            if (tok === TK_INT || tok === TK_BYTE) nextToken();
            let pIsPtr = false;
            if (tok === 42) { pIsPtr = true; nextToken(); }
            const pName = tokIdent;
            expect(TK_IDENT);
            if (tok === 91) { nextToken(); expect(93); pIsPtr = true; }
            locals.set(pName, { slot: localSlotCount++, isByte: pIsByte && pIsPtr, isArray: false, size: 1 });
            nargs++;
            if (tok === 44) { nextToken(); continue; }
            break;
          }
        }
        expect(41);

        const fnAddr = codePos;
        funcs.set(name, { addr: fnAddr, nargs, defined: true });
        const enterInstAddr = emitOp(OP_ENTER, nargs, 0);

        parseStmt(); // function body { ... }

        // Patch total_locals in ENTER instruction
        outDV.setUint32(
          enterInstAddr,
          ((OP_ENTER << 24) | ((nargs & 0xFF) << 16) | (localSlotCount & 0xFFFF)) >>> 0,
          true
        );

        // Fallback return 0 (omit if function already ended with OP_RET)
        if (outDV.getUint32(codePos - 4, true) !== ((OP_RET << 24) >>> 0)) {
          emitPushConst(0);
          emitOp(OP_RET);
        }
        continue;
      }

      // Global variable or array declaration
      let firstVar = true;
      while (true) {
        let curName = firstVar ? name : null;
        firstVar = false;
        if (curName === null) {
          if (tok === 42) nextToken();
          curName = tokIdent;
          expect(TK_IDENT);
        }
        if (tok === 91) {
          nextToken();
          const len = evalConstExpr();
          expect(93);
          const words = isByte ? ((len + 3) >> 2) : len;
          const slot = globalSlotCount;
          globalSlotCount += Math.max(1, words);
          globals.set(curName, { slot, isByte, isArray: true, size: len });
        } else {
          const slot = globalSlotCount++;
          globals.set(curName, { slot, isByte, isArray: false, size: 1 });
        }
        if (tok === 44) {
          nextToken();
          continue;
        }
        break;
      }
      expect(59);
      continue;
    }

    throw new Error(`SpiralC syntax error at line ${lineNum}: unexpected top-level token ${tok} ('${tokIdent}')`);
  }

  // Resolve forward function calls and fn_addr references
  for (const fx of callFixups) {
    const fn = funcs.get(fx.name);
    if (!fn || !fn.defined) {
      throw new Error(`SpiralC: Undefined function '${fx.name}' referenced at line ${fx.line}`);
    }
    if (fx.isFnAddr) {
      outDV.setUint32(fx.instAddr, ((OP_PUSH_U16 << 24) | (fn.addr & 0xFFFF)) >>> 0, true);
      outDV.setUint32(fx.instAddr + 4, ((OP_PUSH_HI << 24) | ((fn.addr >>> 16) & 0xFFFF)) >>> 0, true);
    } else {
      patchJump(fx.instAddr, fn.addr);
    }
  }

  const mainFn = funcs.get("main");
  if (!mainFn) {
    throw new Error("SpiralC: No 'main()' function defined");
  }

  // Write 32-byte SPIR Header at 0x0000..0x001F
  outDV.setUint32(0x00, SPIR_MAGIC, true);
  outDV.setUint32(0x04, 1, true);
  outDV.setUint32(0x08, mainFn.addr, true);
  outDV.setUint32(0x0C, codePos, true);
  outDV.setUint32(0x10, globalSlotCount, true);
  outDV.setUint32(0x14, SPIR_STR_BASE, true);
  outDV.setUint32(0x18, strPos - SPIR_STR_BASE, true);

  let csum = 0;
  for (let i = SPIR_CODE_BASE; i < codePos; i++) csum = (Math.imul(csum, 31) + outBuf[i]) | 0;
  for (let i = SPIR_STR_BASE; i < strPos; i++) csum = (Math.imul(csum, 31) + outBuf[i]) | 0;
  outDV.setUint32(0x1C, csum >>> 0, true);

  return {
    image: outBuf,
    entryPc: mainFn.addr,
    codeBytes: codePos - SPIR_CODE_BASE,
    stringBytes: strPos - SPIR_STR_BASE,
    globalWords: globalSlotCount,
    funcCount: funcs.size,
    checksum: csum >>> 0
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    compileSpiralSource,
    expandImports,
    SPIR_MAGIC,
    SPIR_STR_BASE,
    SPIR_MAX_SIZE
  };
}
if (typeof globalThis !== "undefined") {
  globalThis.compileSpiralSource = compileSpiralSource;
  globalThis.expandImports = expandImports;
}
