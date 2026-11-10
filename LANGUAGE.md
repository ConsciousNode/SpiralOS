# Spiral Language (`SpiralC`) Specification (`LANGUAGE.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT · **Extension:** `.sp`

---

## 1. Overview

**SpiralC** (`.sp`) is the systems programming language created for SpiralOS. Inspired by C, TabTalk, and Oberon, it is a clean, statically-structured LL(1) systems language that compiles in a single recursive-descent pass directly into portable **SpiralVM** bytecode (`SPIR` format).

Every line of SpiralOS above the two Native Cores—the kernel task scheduler, IPC, SpiralFS driver, StudioNet network stack, Theme Engine, Window Manager, GUI toolkit, all 14 desktop applications, and the in-OS self-hosting compiler (`/src/cc.sp`)—is written in SpiralC.

---

## 2. Lexical & Module Structure

- **Comments**: Single-line `// ...` and multi-line `/* ... */`.
- **Module Imports**:
  ```c
  import "/src/kernel.sp";
  import "/src/wm.sp";
  ```
  Imports recursively inline modular `.sp` files from SpiralFS (preventing duplicate inclusions).
- **Compile-Time Constants**:
  ```c
  const WM_TITLE_COLOR_OVERRIDE = 0;
  const VMRAM_VRAM = 0x0F0000;
  ```
  Supports decimal, hexadecimal (`0x...`), character literals (`'x'`, `'\n'`), and constant expressions (`+`, `-`, `*`, `/`, `|`, `&`, `<<`, `>>`, `~`).

---

## 3. Types, Variables & Arrays

- **Scalar Types**: `int` (32-bit signed integer) and `byte` (8-bit unsigned integer).
- **Global Declarations** (allocated in `vmRam[0x010000 .. 0x047FFF]`):
  ```c
  int g_win_count;
  int win_x[12];
  byte packet_buf[512];
  ```
- **Local Declarations** (allocated in the current function's `VM_FP` frame):
  ```c
  int total = 0;
  byte temp_str[32];
  ```

---

## 4. Functions & Control Flow

```c
int wm_active_title_color() {
  if (WM_TITLE_COLOR_OVERRIDE > 0) {
    return WM_TITLE_COLOR_OVERRIDE;
  }
  return thm_title_active;
}
```
Supported statements:
- Compound blocks `{ ... }`
- `if (cond) stmt [else stmt]`
- `while (cond) stmt`
- `for (init; cond; step) stmt`
- `return [expr];`
- `break;` and `continue;`

---

## 5. Operators & Built-In Intrinsics

### Operator Precedence (Highest to Lowest)
1. Function call `fn(...)`, array subscript `arr[i]`, postfix `++`, `--`
2. Unary `-`, `!`, `~`, address-of `&ident`
3. Multiplicative `*`, `/`, `%`
4. Additive `+`, `-`
5. Bitwise shifts `<<`, `>>` (arithmetic `SAR`), `>>>` (logical `SHR`)
6. Relational `<`, `<=`, `>`, `>=`
7. Equality `==`, `!=`
8. Bitwise AND `&`
9. Bitwise XOR `^`
10. Bitwise OR `|`
11. Short-circuit Logical AND `&&`
12. Short-circuit Logical OR `||`
13. Assignment `=`, `+=`, `-=`

### Direct VM Memory & Syscall Intrinsics
SpiralC provides zero-overhead intrinsics that emit single SpiralVM instructions:
- `r8(addr)` → `LOAD8U` (`0x0E`)
- `r8s(addr)` → `LOAD8S` (`0x0F`)
- `r16(addr)` → `LOAD16U` (`0x10`)
- `r32(addr)` → `LOAD32` (`0x11`)
- `w8(addr, val)` → `STORE8` (`0x12`)
- `w16(addr, val)` → `STORE16` (`0x13`)
- `w32(addr, val)` → `STORE32` (`0x14`)
- `sys(sysnum, arg0, ...)` → `SYSCALL nargs, sysnum` (`0x27`)
