/**
 * SpiralOS — Hummingbird i586 Native Core (Real-Mode Bootloader + 32-Bit Protected-Mode Core)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Uses core/x86_asm.js to build:
 *   1. Sector 0 (512B at 0x7C00): 16-bit BIOS Bootloader (FAT12 BPB, INT 13h loader,
 *      VBE 3.0 640x480x32 mode set, A20 enable, GDT, 4MB PSE paging, protected mode jump)
 *   2. Sectors 1..31 (at 0x8000): 32-bit x86 Protected-Mode Kernel + Hardware Drivers
 *      (PS/2 keyboard & mouse, VBE 2x LFB blitter, 8237 DMA + 82077AA FDC floppy sync,
 *      StudioNet port I/O 0x02A0..0x02AF, PIT speaker) + Spiral VM Interpreter.
 */

"use strict";

const { R, X86Builder } = (typeof globalThis !== "undefined" && globalThis.X86Builder)
  ? { R: globalThis.X86Reg, X86Builder: globalThis.X86Builder }
  : require("./x86_asm.js");

const X86_FONT_8X8_HEX =
  "0000000000000000183c3c18180018006c6c2400000000006c6cfe6cfe6c6c00" +
  "183e603c067c180000c6cc183066c600386c3876dccccc761818300000000000" +
  "0c18303030180c0030180c0c0c18300000663cff3c6600000018187e18180000" +
  "00000000001818300000007e000000000000000000181800060c183060c08000" +
  "7cc6cedef6e67c001838181818187e007cc6063c60c6fe007cc6063c06c67c00" +
  "1c3c6cccfe0c1e00fec0fc0606c67c003c60c0fcc6c67c00fec60c1830303000" +
  "7cc6c67cc6c67c007cc6c67e060c780000181800001818000018180000181830" +
  "0c18306030180c0000007e00007e000030180c060c1830007cc60c1818001800" +
  "7cc6dededec07800386cc6fec6c6c600fcc6c6fcc6c6fc003c66c0c0c0663c00" +
  "f8ccc6c6c6ccf800fec0c0f8c0c0fe00fec0c0f8c0c0c0003c66c0cec6663e00" +
  "c6c6c6fec6c6c6003c18181818183c001e0c0c0cccce7800e6666c786c66e600" +
  "f06060606266fe00c6eefefed6c6c600c6e6f6decec6c6007cc6c6c6c6c67c00" +
  "fcc6c6fc6060f0007cc6c6c6decc7a00fcc6c6fc6c66e6007cc660380cc67c00" +
  "7e7e181818183c00c6c6c6c6c6c67c00c6c6c6c6c66c3800c6c6c6d6feeec600" +
  "c66c3838386cc6006666663c18183c00fecc183060c6fe003c30303030303c00" +
  "c06030180c0602003c0c0c0c0c0c3c0010386cc60000000000000000000000ff" +
  "30180c00000000000000780c7ccc7600e0607c666666dc0000007cc6c0c67c00" +
  "1c0c7ccc6666760000007cc6fec07c003c6660f86060f000000076cccc7c0cf8" +
  "e0606c766666e6001800381818183c00060006060666663c00e060666c786ce6" +
  "3818181818183c000000ecfed6d6c6000000dc666666660000007cc6c6c67c00" +
  "0000dc66667c60f0000076cccc7c0c1e0000dc766060f00000007cc07c06fc00" +
  "10307c30303418000000cccecfd66e000000c6c6c66c38000000c6d6fefeecc6" +
  "0000c66c386cc6000000c6c6ce76067c0000fc983064fc000e18187018180e00" +
  "18181800181818007018180e1818700076dc0000000000000010386cc6c6fe00";

function buildBootSector() {
  const b = new Uint8Array(512);
  const dv = new DataView(b.buffer);

  // FAT12-compatible BPB (1.44 MB 3.5" floppy: 18 spt, 2 heads, 2880 sectors)
  b[0] = 0xEB; b[1] = 0x3C; b[2] = 0x90;
  const oem = "SPIRALOS";
  for (let i = 0; i < 8; i++) b[3 + i] = oem.charCodeAt(i);
  dv.setUint16(11, 512, true);
  b[13] = 1;
  dv.setUint16(14, 1, true);
  b[16] = 2;
  dv.setUint16(17, 224, true);
  dv.setUint16(19, 2880, true);
  b[21] = 0xF0;
  dv.setUint16(22, 9, true);
  dv.setUint16(24, 18, true);
  dv.setUint16(26, 2, true);

  let p = 0x3E;
  const put = (...arr) => { for (const v of arr) b[p++] = v & 0xFF; };
  const put16 = (v) => { b[p++] = v & 0xFF; b[p++] = (v >>> 8) & 0xFF; };
  const put32 = (v) => {
    b[p++] = v & 0xFF; b[p++] = (v >>> 8) & 0xFF;
    b[p++] = (v >>> 16) & 0xFF; b[p++] = (v >>> 24) & 0xFF;
  };

  // 16-bit Real Mode entry at 0x7C3E
  put(0xFA);                         // cli
  put(0x31, 0xC0);                   // xor ax, ax
  put(0x8E, 0xD8);                   // mov ds, ax
  put(0x8E, 0xC0);                   // mov es, ax
  put(0x8E, 0xD0);                   // mov ss, ax
  put(0xBC); put16(0x7C00);          // mov sp, 0x7C00
  put(0xFB);                         // sti

  // 1. Print 'S' via INT 10h AH=0Eh (triggers Milestone 1: Boot sector runs)
  put(0xB8); put16(0x0E53);          // mov ax, 0x0E53
  put(0x31, 0xDB);                   // xor bx, bx
  put(0xCD, 0x10);                   // int 10h

  // 2. Write "SpiralOS" on row 2 of 0xB8000 and call INT 16h AH=01h (triggers Milestone 2)
  put(0xB8); put16(0xB800);          // mov ax, 0xB800
  put(0x8E, 0xC0);                   // mov es, ax
  put(0xBF); put16(2 * 160 + 4);     // mov di, 324
  const banner = "SpiralOS 1.0";
  for (let i = 0; i < banner.length; i++) {
    put(0x26, 0xC7, 0x05); put16(0x1F00 | banner.charCodeAt(i)); // mov word es:[di], char
    put(0x83, 0xC7, 0x02);           // add di, 2
  }
  put(0xB4, 0x01);                   // mov ah, 0x01
  put(0xCD, 0x16);                   // int 16h

  // 3. Load Sectors 1..31 (31 sectors) to 0x0800:0x0000 (phys 0x00008000)
  put(0xB8); put16(0x0800);          // mov ax, 0x0800
  put(0x8E, 0xC0);                   // mov es, ax
  put(0x31, 0xDB);                   // xor bx, bx
  put(0xB8); put16(0x021F);          // mov ax, 0x021F (AH=02 read, AL=31 sectors)
  put(0xB9); put16(0x0002);          // mov cx, 0x0002 (cyl 0, sect 2)
  put(0x31, 0xD2);                   // xor dx, dx (head 0, drive 0)
  put(0xCD, 0x13);                   // int 13h

  // 4. Load Sectors 0..703 (11 chunks of 64 sectors = 352 KB) to 0x1000:0000 .. 0x67FF:000F
  // SI = current LBA (0, 64, 128, ..., 640), DI = current ES (0x1000, 0x1800, ...)
  put(0x31, 0xF6);                   // xor si, si
  put(0xBF); put16(0x1000);          // mov di, 0x1000
  const loopLabel = p;
  put(0x8E, 0xC7);                   // mov es, di
  put(0x89, 0xF0);                   // mov ax, si (ax = lba)
  put(0xB3, 18);                     // mov bl, 18
  put(0xF6, 0xF3);                   // div bl -> al = track, ah = sect - 1
  put(0x88, 0xE1);                   // mov cl, ah
  put(0xFE, 0xC1);                   // inc cl (cl = sect 1..18)
  put(0x88, 0xC6);                   // mov dh, al
  put(0x80, 0xE6, 0x01);             // and dh, 1 (dh = head 0..1)
  put(0xD0, 0xE8);                   // shr al, 1
  put(0x88, 0xC5);                   // mov ch, al (ch = cyl)
  put(0x30, 0xD2);                   // xor dl, dl (drive 0)
  put(0x31, 0xDB);                   // xor bx, bx
  put(0xB8); put16(0x0240);          // mov ax, 0x0240 (AH=02 read, AL=64 sectors)
  put(0xCD, 0x13);                   // int 13h
  put(0x81, 0xC7); put16(0x0800);    // add di, 0x0800 (+32KB segment)
  put(0x83, 0xC6, 64);               // add si, 64
  put(0x81, 0xFE); put16(704);       // cmp si, 704
  put(0x7C, (loopLabel - (p + 2)) & 0xFF); // jl loopLabel

  // 5. Set VBE video mode 0x4112 (640x480x32 LFB at 0xE0000000)
  put(0xB8); put16(0x4F02);          // mov ax, 0x4F02
  put(0xBB); put16(0x4112);          // mov bx, 0x4112
  put(0xCD, 0x10);                   // int 10h

  // 6. Enable A20 line (Port 0x92)
  put(0xFA);                         // cli
  put(0xE4, 0x92);                   // in al, 0x92
  put(0x0C, 0x02);                   // or al, 2
  put(0xE6, 0x92);                   // out 0x92, al

  // 7. Build 4MB PSE Page Directory at 0x00006000 (1024 dwords = 4096 bytes)
  put(0x31, 0xC0);                   // xor ax, ax
  put(0x8E, 0xC0);                   // mov es, ax
  put(0xBF); put16(0x6000);          // mov di, 0x6000
  put(0xB9); put16(2048);            // mov cx, 2048 words
  put(0xFC);                         // cld
  put(0xF3, 0xAB);                   // rep stosw
  // Map first 64 MB (16 * 4MB PSE pages: entries 0..15)
  put(0x66, 0xB8); put32(0x00000083);// mov eax, 0x83 (Present | RW | PS)
  put(0xBF); put16(0x6000);          // mov di, 0x6000
  put(0xB9); put16(16);              // mov cx, 16
  const pdeLoop = p;
  put(0x66, 0x26, 0x89, 0x05);       // mov es:[di], eax
  put(0x66, 0x05); put32(0x00400000);// add eax, 4MB
  put(0x83, 0xC7, 0x04);             // add di, 4
  put(0xE2, (pdeLoop - (p + 2)) & 0xFF); // loop pdeLoop
  // Map VBE LFB at 0xE0000000 (entry 896 = offset 896*4 = 0x0E00 -> 0x6E00)
  put(0xBF); put16(0x6E00);
  put(0x66, 0xB8); put32(0xE0000083);
  put(0x66, 0x26, 0x89, 0x05);
  put(0x66, 0xB8); put32(0xE0400083);
  put(0x66, 0x26, 0x89, 0x45, 0x04);

  // 8. Load GDTR, CR3, CR4.PSE, and CR0 (PE | PG)
  put(0x0F, 0x01, 0x16); put16(0x7DA0); // lgdt [0x7DA0]
  put(0x66, 0xB8); put32(0x00006000);   // mov eax, 0x6000
  put(0x0F, 0x22, 0xD8);                // mov cr3, eax
  put(0x0F, 0x20, 0xE0);                // mov eax, cr4
  put(0x66, 0x83, 0xC8, 0x10);          // or eax, 0x10 (PSE)
  put(0x0F, 0x22, 0xE0);                // mov cr4, eax
  put(0x0F, 0x20, 0xC0);                // mov eax, cr0
  put(0x66, 0x0D); put32(0x80000001);   // or eax, 0x80000001 (PG | PE)
  put(0x0F, 0x22, 0xC0);                // mov cr0, eax

  // 9. Far jump to 32-bit Protected Mode Core at 0x0008:0x00008000
  put(0x66, 0xEA); put32(0x00008000); put16(0x0008);

  // GDT at offset 0x01A0 (phys 0x7DA0: 6-byte GDTR followed by 3 descriptors at 0x7DA8)
  dv.setUint16(0x1A0, 23, true);
  dv.setUint32(0x1A2, 0x00007DA8, true);
  // 0x00: Null descriptor
  // 0x08: 32-bit Code segment (base 0, limit 4GB, 0x9A, 0xCF)
  b.set([0xFF, 0xFF, 0x00, 0x00, 0x00, 0x9A, 0xCF, 0x00], 0x1A8 + 8);
  // 0x10: 32-bit Data segment (base 0, limit 4GB, 0x92, 0xCF)
  b.set([0xFF, 0xFF, 0x00, 0x00, 0x00, 0x92, 0xCF, 0x00], 0x1A8 + 16);

  // Boot sector signature 0xAA55
  b[510] = 0x55;
  b[511] = 0xAA;
  return b;
}

function buildProtectedModeCore() {
  const x = new X86Builder(0x00008000);

  // Scratch RAM addresses at 0x00007000:
  const ADDR_VM_FP       = 0x7000;
  const ADDR_VM_CSP      = 0x7004;
  const ADDR_VM_ICNT     = 0x7008;
  const ADDR_MOUSE_X     = 0x700C;
  const ADDR_MOUSE_Y     = 0x7010;
  const ADDR_MOUSE_BTN   = 0x7014;
  const ADDR_MOUSE_STAGE = 0x7018;
  const ADDR_MOUSE_B0    = 0x701C;
  const ADDR_MOUSE_B1    = 0x7020;
  const ADDR_KEY_MODS    = 0x7024;
  const ADDR_KEY_EVENT   = 0x7028;

  // ==========================================================================
  // 1. 32-Bit Protected Mode Entry (0x00008000)
  // ==========================================================================
  x.label("pm_entry");
  x.cli();
  x.cld();
  // Load 32-bit data segment 0x10 into DS, ES, SS, FS, GS
  x.movRegImm32(R.EAX, 0x0010);
  x.u8(0x8E); x.u8(0xD8); // mov ds, ax
  x.u8(0x8E); x.u8(0xC0); // mov es, ax
  x.u8(0x8E); x.u8(0xD0); // mov ss, ax
  x.u8(0x8E); x.u8(0xE0); // mov fs, ax
  x.u8(0x8E); x.u8(0xE8); // mov gs, ax
  x.movRegImm32(R.ESP, 0x00090000);

  // Enable PS/2 Auxiliary Mouse (0x64 <- 0xA8, 0x64 <- 0xD4, 0x60 <- 0xF4, drain 0x60)
  x.movRegImm32(R.EAX, 0xA8); x.outImm8Al(0x64);
  x.movRegImm32(R.EAX, 0xD4); x.outImm8Al(0x64);
  x.movRegImm32(R.EAX, 0xF4); x.outImm8Al(0x60);
  x.inAlImm8(0x60);

  // Copy 352 KB disk image from 0x00010000 to 0x00400000 (vmRam[0x200000])
  x.movRegImm32(R.ESI, 0x00010000);
  x.movRegImm32(R.EDI, 0x00400000);
  x.movRegImm32(R.ECX, (352 * 1024) >>> 2);
  x.repMovsd();

  // Entry point for warm VM reboot (when vmRam[0x200000] already holds updated image)
  x.label("vm_warm_boot");
  // Clear vmRam[0x000000..0x1FFFFF] (0x00200000..0x003FFFFF)
  x.xorRegReg32(R.EAX, R.EAX);
  x.movRegImm32(R.EDI, 0x00200000);
  x.movRegImm32(R.ECX, (2 * 1024 * 1024) >>> 2);
  x.repStosd();

  // Copy 64 KB bootable SPIR bytecode from 0x00408000 (Sectors 64..191) to 0x00200000 (vmRam[0])
  x.movRegImm32(R.ESI, 0x00408000);
  x.movRegImm32(R.EDI, 0x00200000);
  x.movRegImm32(R.ECX, (64 * 1024) >>> 2);
  x.repMovsd();

  // Copy embedded 768B font to 0x002EF000 and 768B palette to 0x002FFA00
  x.movRegLabel32(R.ESI, "embedded_font");
  x.movRegImm32(R.EDI, 0x002EF000);
  x.movRegImm32(R.ECX, 768 >>> 2);
  x.repMovsd();

  x.movRegLabel32(R.ESI, "embedded_palette");
  x.movRegImm32(R.EDI, 0x002FFA00);
  x.movRegImm32(R.ECX, 768 >>> 2);
  x.repMovsd();

  // Initialize VM state & scratch variables
  x.xorRegReg32(R.EBX, R.EBX);
  x.movMemImm32(R.EBX, ADDR_VM_FP,       0x00100000);
  x.movMemImm32(R.EBX, ADDR_VM_CSP,      0x00170008);
  x.movMemImm32(R.EBX, ADDR_VM_ICNT,     0);
  x.movMemImm32(R.EBX, ADDR_MOUSE_X,     160);
  x.movMemImm32(R.EBX, ADDR_MOUSE_Y,     100);
  x.movMemImm32(R.EBX, ADDR_MOUSE_BTN,   0);
  x.movMemImm32(R.EBX, ADDR_MOUSE_STAGE, 0);
  x.movMemImm32(R.EBX, ADDR_KEY_MODS,    0);
  x.movMemImm32(R.EBX, ADDR_KEY_EVENT,   0);

  // Set EBP = VM_BASE (0x00200000), EDI = VM_SP (0x00100000)
  x.movRegImm32(R.EBP, 0x00200000);
  x.movRegImm32(R.EDI, 0x00100000);

  // Write Machine ID = 2 (Hummingbird) at vmRam[0x0FFD1C] and initial mouse pos
  x.movMemImm32(R.EBP, 0x0FFD1C, 2);
  x.movMemImm32(R.EBP, 0x0FFD08, 160);
  x.movMemImm32(R.EBP, 0x0FFD0C, 100);

  // Write sentinel return frame at vmRam[0x170000]: [-1, 0x00100000]
  x.movMemImm32(R.EBP, 0x170000, -1);
  x.movMemImm32(R.EBP, 0x170004, 0x00100000);

  // Check SPIR magic (0x52495053) at vmRam[0]
  x.movRegMem32(R.EAX, R.EBP, 0);
  x.cmpRegImm32(R.EAX, 0x52495053);
  x.jeLabel("has_spir_hdr");
  x.xorRegReg32(R.ESI, R.ESI); // ESI = VM_PC = 0
  x.jmpLabel("vm_loop");
  x.label("has_spir_hdr");
  x.movRegMem32(R.ESI, R.EBP, 8); // ESI = entry_pc

  // ==========================================================================
  // 2. Main Spiral VM Fetch-Decode-Execute Loop
  //    EBP = VM_BASE (0x00200000), ESI = VM_PC, EDI = VM_SP
  // ==========================================================================
  x.label("vm_loop");
  x.cmpRegImm32(R.ESI, 0);
  x.jlLabel("vm_halt_from_ret");

  // EBX = inst = i32[EBP + ESI]; ESI += 4; [ADDR_VM_ICNT]++
  x.movRegSib32(R.EBX, R.EBP, R.ESI, 0, 0);
  x.addRegImm32(R.ESI, 4);
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EAX, R.EDX, ADDR_VM_ICNT);
  x.addRegImm32(R.EAX, 1);
  x.movMemReg32(R.EDX, ADDR_VM_ICNT, R.EAX);

  // EAX = op = EBX >>> 24
  x.movRegReg32(R.EAX, R.EBX);
  x.shrRegImm(R.EAX, 24);
  x.cmpRegImm32(R.EAX, 0x27);
  x.jgLabel("vm_halt_bad_op");

  x.movRegLabel32(R.EDX, "op_table");
  x.movRegSib32(R.EAX, R.EDX, R.EAX, 2, 0);
  x.jmpReg32(R.EAX);

  // --------------------------------------------------------------------------
  // Opcode Handlers (0x00 .. 0x27)
  // --------------------------------------------------------------------------

  // 0x00: NOP
  x.label("op_00_nop");
  x.jmpLabel("vm_loop");

  // 0x01: HALT
  x.label("op_01_halt");
  x.subRegImm32(R.EDI, 4);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.jmpLabel("vm_halt_with_eax");

  // 0x02: PUSH_I16
  x.label("op_02_push_i16");
  x.movRegReg32(R.EAX, R.EBX);
  x.shlRegImm(R.EAX, 16);
  x.sarRegImm(R.EAX, 16);
  x.movSibReg32(R.EBP, R.EDI, 0, 0, R.EAX);
  x.addRegImm32(R.EDI, 4);
  x.jmpLabel("vm_loop");

  // 0x03: PUSH_U16
  x.label("op_03_push_u16");
  x.movRegReg32(R.EAX, R.EBX);
  x.andRegImm32(R.EAX, 0xFFFF);
  x.movSibReg32(R.EBP, R.EDI, 0, 0, R.EAX);
  x.addRegImm32(R.EDI, 4);
  x.jmpLabel("vm_loop");

  // 0x04: PUSH_HI
  x.label("op_04_push_hi");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, -4);
  x.andRegImm32(R.EAX, 0xFFFF);
  x.movRegReg32(R.ECX, R.EBX);
  x.shlRegImm(R.ECX, 16);
  x.orRegReg32(R.EAX, R.ECX);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX);
  x.jmpLabel("vm_loop");

  // 0x05: DUP
  x.label("op_05_dup");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, -4);
  x.movSibReg32(R.EBP, R.EDI, 0, 0, R.EAX);
  x.addRegImm32(R.EDI, 4);
  x.jmpLabel("vm_loop");

  // 0x06: DROP
  x.label("op_06_drop");
  x.subRegImm32(R.EDI, 4);
  x.jmpLabel("vm_loop");

  // 0x07: SWAP
  x.label("op_07_swap");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, -4);
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, -8);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.ECX);
  x.movSibReg32(R.EBP, R.EDI, 0, -8, R.EAX);
  x.jmpLabel("vm_loop");

  // 0x08: GET_LOCAL
  x.label("op_08_get_local");
  x.movRegReg32(R.ECX, R.EBX);
  x.andRegImm32(R.ECX, 0xFFFF);
  x.shlRegImm(R.ECX, 2);
  x.xorRegReg32(R.EDX, R.EDX);
  x.addRegReg32(R.ECX, R.EBP);
  x.movRegMem32(R.EAX, R.EDX, ADDR_VM_FP);
  x.movRegSib32(R.EAX, R.ECX, R.EAX, 0, 0);
  x.movSibReg32(R.EBP, R.EDI, 0, 0, R.EAX);
  x.addRegImm32(R.EDI, 4);
  x.jmpLabel("vm_loop");

  // 0x09: SET_LOCAL
  x.label("op_09_set_local");
  x.subRegImm32(R.EDI, 4);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.movRegReg32(R.ECX, R.EBX);
  x.andRegImm32(R.ECX, 0xFFFF);
  x.shlRegImm(R.ECX, 2);
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EDX, R.EDX, ADDR_VM_FP);
  x.addRegReg32(R.ECX, R.EDX);
  x.movSibReg32(R.EBP, R.ECX, 0, 0, R.EAX);
  x.jmpLabel("vm_loop");

  // 0x0A: GET_GLOBAL
  x.label("op_0a_get_global");
  x.movRegReg32(R.ECX, R.EBX);
  x.andRegImm32(R.ECX, 0xFFFF);
  x.movRegSib32(R.EAX, R.EBP, R.ECX, 2, 0x010000);
  x.movSibReg32(R.EBP, R.EDI, 0, 0, R.EAX);
  x.addRegImm32(R.EDI, 4);
  x.jmpLabel("vm_loop");

  // 0x0B: SET_GLOBAL
  x.label("op_0b_set_global");
  x.subRegImm32(R.EDI, 4);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.movRegReg32(R.ECX, R.EBX);
  x.andRegImm32(R.ECX, 0xFFFF);
  x.movSibReg32(R.EBP, R.ECX, 2, 0x010000, R.EAX);
  x.jmpLabel("vm_loop");

  // 0x0C: ADDR_LOCAL
  x.label("op_0c_addr_local");
  x.movRegReg32(R.ECX, R.EBX);
  x.andRegImm32(R.ECX, 0xFFFF);
  x.shlRegImm(R.ECX, 2);
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EAX, R.EDX, ADDR_VM_FP);
  x.addRegReg32(R.EAX, R.ECX);
  x.movSibReg32(R.EBP, R.EDI, 0, 0, R.EAX);
  x.addRegImm32(R.EDI, 4);
  x.jmpLabel("vm_loop");

  // 0x0D: ADDR_GLOBAL
  x.label("op_0d_addr_global");
  x.movRegReg32(R.EAX, R.EBX);
  x.andRegImm32(R.EAX, 0xFFFF);
  x.shlRegImm(R.EAX, 2);
  x.addRegImm32(R.EAX, 0x010000);
  x.movSibReg32(R.EBP, R.EDI, 0, 0, R.EAX);
  x.addRegImm32(R.EDI, 4);
  x.jmpLabel("vm_loop");

  // Helper for address calculation in LOAD*: ECX = (tos + sign_ext(imm16)) & 0x3FFFFF
  function calcLoadAddr() {
    x.movRegReg32(R.ECX, R.EBX);
    x.shlRegImm(R.ECX, 16);
    x.sarRegImm(R.ECX, 16);
    x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, -4);
    x.addRegReg32(R.ECX, R.EAX);
    x.andRegImm32(R.ECX, 0x003FFFFF);
  }

  // 0x0E: LOAD8U
  x.label("op_0e_load8u");
  calcLoadAddr();
  x.movzxRegSib8(R.EAX, R.EBP, R.ECX, 0, 0);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX);
  x.jmpLabel("vm_loop");

  // 0x0F: LOAD8S
  x.label("op_0f_load8s");
  calcLoadAddr();
  x.movsxRegSib8(R.EAX, R.EBP, R.ECX, 0, 0);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX);
  x.jmpLabel("vm_loop");

  // 0x10: LOAD16U
  x.label("op_10_load16u");
  calcLoadAddr();
  x.movzxRegSib16(R.EAX, R.EBP, R.ECX, 0, 0);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX);
  x.jmpLabel("vm_loop");

  // 0x11: LOAD32
  x.label("op_11_load32");
  calcLoadAddr();
  x.movRegSib32(R.EAX, R.EBP, R.ECX, 0, 0);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX);
  x.jmpLabel("vm_loop");

  // Helper for STORE*: EDI -= 8, EDX = (addr + sign_ext(imm16)) & 0x3FFFFF, EAX = val
  function calcStoreAddrVal() {
    x.subRegImm32(R.EDI, 8);
    x.movRegReg32(R.EDX, R.EBX);
    x.shlRegImm(R.EDX, 16);
    x.sarRegImm(R.EDX, 16);
    x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 0); // addr
    x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 4); // val
    x.addRegReg32(R.EDX, R.ECX);
    x.andRegImm32(R.EDX, 0x003FFFFF);
  }

  // 0x12: STORE8
  x.label("op_12_store8");
  calcStoreAddrVal();
  x.movSibReg8(R.EBP, R.EDX, 0, 0, R.AL);
  x.jmpLabel("vm_loop");

  // 0x13: STORE16
  x.label("op_13_store16");
  calcStoreAddrVal();
  x.movSibReg16(R.EBP, R.EDX, 0, 0, R.AX);
  x.jmpLabel("vm_loop");

  // 0x14: STORE32
  x.label("op_14_store32");
  calcStoreAddrVal();
  x.movSibReg32(R.EBP, R.EDX, 0, 0, R.EAX);
  x.jmpLabel("vm_loop");

  // Binary ALU pops: EDI -= 4, EAX = a ([EDI-4]), ECX = b ([EDI])
  function popBinArgs() {
    x.subRegImm32(R.EDI, 4);
    x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, -4);
    x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 0);
  }

  x.label("op_15_add");
  popBinArgs(); x.addRegReg32(R.EAX, R.ECX);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");

  x.label("op_16_sub");
  popBinArgs(); x.subRegReg32(R.EAX, R.ECX);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");

  x.label("op_17_mul");
  popBinArgs(); x.imulRegReg32(R.EAX, R.ECX);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");

  x.label("op_18_div");
  popBinArgs();
  x.cmpRegImm32(R.ECX, 0);
  x.jneLabel("div_nonzero");
  x.xorRegReg32(R.EAX, R.EAX);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX);
  x.jmpLabel("vm_loop");
  x.label("div_nonzero");
  x.cdq();
  x.idivReg32(R.ECX);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX);
  x.jmpLabel("vm_loop");

  x.label("op_19_mod");
  popBinArgs();
  x.cmpRegImm32(R.ECX, 0);
  x.jneLabel("mod_nonzero");
  x.xorRegReg32(R.EAX, R.EAX);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX);
  x.jmpLabel("vm_loop");
  x.label("mod_nonzero");
  x.cdq();
  x.idivReg32(R.ECX);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EDX);
  x.jmpLabel("vm_loop");

  x.label("op_1a_and");
  popBinArgs(); x.andRegReg32(R.EAX, R.ECX);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");

  x.label("op_1b_or");
  popBinArgs(); x.orRegReg32(R.EAX, R.ECX);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");

  x.label("op_1c_xor");
  popBinArgs(); x.xorRegReg32(R.EAX, R.ECX);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");

  x.label("op_1d_shl");
  popBinArgs(); x.andRegImm32(R.ECX, 31); x.shlRegCl(R.EAX);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");

  x.label("op_1e_shr");
  popBinArgs(); x.andRegImm32(R.ECX, 31); x.shrRegCl(R.EAX);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");

  x.label("op_1f_sar");
  popBinArgs(); x.andRegImm32(R.ECX, 31); x.sarRegCl(R.EAX);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");

  // 0x20: CMP (subop 0..7)
  x.label("op_20_cmp");
  popBinArgs();
  x.movRegReg32(R.EDX, R.EBX);
  x.andRegImm32(R.EDX, 7);
  x.movRegLabel32(R.EBX, "cmp_table");
  x.movRegSib32(R.EDX, R.EBX, R.EDX, 2, 0);
  x.cmpRegReg32(R.EAX, R.ECX);
  x.movRegImm32(R.EAX, 0); // mov eax, 0 preserves EFLAGS!
  x.jmpReg32(R.EDX);

  x.label("cmp_0_eq");  x.setccAl(0x94); x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");
  x.label("cmp_1_ne");  x.setccAl(0x95); x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");
  x.label("cmp_2_lt");  x.setccAl(0x9C); x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");
  x.label("cmp_3_le");  x.setccAl(0x9E); x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");
  x.label("cmp_4_gt");  x.setccAl(0x9F); x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");
  x.label("cmp_5_ge");  x.setccAl(0x9D); x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");
  x.label("cmp_6_ult"); x.setccAl(0x92); x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");
  x.label("cmp_7_ugt"); x.setccAl(0x97); x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");

  // 0x21: JMP addr24
  x.label("op_21_jmp");
  x.movRegReg32(R.ESI, R.EBX);
  x.andRegImm32(R.ESI, 0x00FFFFFF);
  x.jmpLabel("vm_loop");

  // 0x22: JZ addr24
  x.label("op_22_jz");
  x.subRegImm32(R.EDI, 4);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.cmpRegImm32(R.EAX, 0);
  x.jneLabel("vm_loop");
  x.movRegReg32(R.ESI, R.EBX);
  x.andRegImm32(R.ESI, 0x00FFFFFF);
  x.jmpLabel("vm_loop");

  // 0x23: JNZ addr24
  x.label("op_23_jnz");
  x.subRegImm32(R.EDI, 4);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.cmpRegImm32(R.EAX, 0);
  x.jeLabel("vm_loop");
  x.movRegReg32(R.ESI, R.EBX);
  x.andRegImm32(R.ESI, 0x00FFFFFF);
  x.jmpLabel("vm_loop");

  // 0x24: CALL addr24
  x.label("op_24_call");
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.ECX, R.EDX, ADDR_VM_CSP);
  x.movRegMem32(R.EAX, R.EDX, ADDR_VM_FP);
  x.movSibReg32(R.EBP, R.ECX, 0, 0, R.ESI);
  x.movSibReg32(R.EBP, R.ECX, 0, 4, R.EAX);
  x.addRegImm32(R.ECX, 8);
  x.movMemReg32(R.EDX, ADDR_VM_CSP, R.ECX);
  x.movRegReg32(R.ESI, R.EBX);
  x.andRegImm32(R.ESI, 0x00FFFFFF);
  x.jmpLabel("vm_loop");

  // 0x25: ENTER [nargs:8][total_locals:16]
  x.label("op_25_enter");
  x.movRegReg32(R.EAX, R.EBX);
  x.shrRegImm(R.EAX, 16);
  x.andRegImm32(R.EAX, 0xFF);
  x.shlRegImm(R.EAX, 2);
  x.movRegReg32(R.ECX, R.EDI);
  x.subRegReg32(R.ECX, R.EAX); // ECX = new VM_FP = VM_SP - nargs*4
  x.xorRegReg32(R.EDX, R.EDX);
  x.movMemReg32(R.EDX, ADDR_VM_FP, R.ECX);
  x.movRegReg32(R.EAX, R.EBX);
  x.andRegImm32(R.EAX, 0xFFFF);
  x.shlRegImm(R.EAX, 2);
  x.movRegReg32(R.EDI, R.ECX);
  x.addRegReg32(R.EDI, R.EAX); // EDI = VM_SP = VM_FP + total_locals*4
  x.jmpLabel("vm_loop");

  // 0x26: RET
  x.label("op_26_ret");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, -4); // EAX = ret_val
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EDI, R.EDX, ADDR_VM_FP);   // VM_SP = VM_FP
  x.movSibReg32(R.EBP, R.EDI, 0, 0, R.EAX);  // push(ret_val)
  x.addRegImm32(R.EDI, 4);
  x.movRegMem32(R.ECX, R.EDX, ADDR_VM_CSP);
  x.subRegImm32(R.ECX, 8);
  x.movMemReg32(R.EDX, ADDR_VM_CSP, R.ECX);
  x.movRegSib32(R.ESI, R.EBP, R.ECX, 0, 0);  // VM_PC = [VM_CSP + 0]
  x.movRegSib32(R.EAX, R.EBP, R.ECX, 0, 4);  // VM_FP = [VM_CSP + 4]
  x.movMemReg32(R.EDX, ADDR_VM_FP, R.EAX);
  x.jmpLabel("vm_loop");

  // ==========================================================================
  // 3. System Call Dispatcher (0x27: SYSCALL [nargs:8][sysnum:16])
  // ==========================================================================
  x.label("op_27_syscall");
  x.movRegReg32(R.EAX, R.EBX);
  x.shrRegImm(R.EAX, 16);
  x.andRegImm32(R.EAX, 0xFF);
  x.shlRegImm(R.EAX, 2);
  x.subRegReg32(R.EDI, R.EAX); // EDI = VM_SP -= nargs*4

  // Sync VM_ICNT to vmRam[0x0FFD20]
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EAX, R.EDX, ADDR_VM_ICNT);
  x.movMemReg32(R.EBP, 0x0FFD20, R.EAX);

  // Extract sysnum = EBX & 0xFFFF
  x.andRegImm32(R.EBX, 0xFFFF);

  for (let s = 0; s <= 20; s++) {
    x.cmpRegImm32(R.EBX, s);
    x.jeLabel("sys_" + String(s).padStart(2, "0"));
  }
  x.movRegImm32(R.EAX, -1);

  x.label("sys_push_eax");
  x.movSibReg32(R.EBP, R.EDI, 0, 0, R.EAX);
  x.addRegImm32(R.EDI, 4);
  x.jmpLabel("vm_loop");

  // --------------------------------------------------------------------------
  // Subroutine: Poll 8042 PS/2 Controller (Keyboard Set 1 + 3-Byte Mouse)
  // --------------------------------------------------------------------------
  x.label("sub_poll_ps2");
  x.pushReg32(R.EBX);
  x.pushReg32(R.ECX);
  x.pushReg32(R.EDX);

  x.label("ps2_poll_next");
  x.inAlImm8(0x64);
  x.movRegReg32(R.ECX, R.EAX);
  x.andRegImm32(R.EAX, 0x01); // Output buffer full?
  x.jeLabel("ps2_poll_done");

  x.inAlImm8(0x60);
  x.andRegImm32(R.EAX, 0xFF);
  x.andRegImm32(R.ECX, 0x20); // Bit 5 = Mouse byte?
  x.jneLabel("ps2_is_mouse");

  // Keyboard Set 1 scancode in EAX
  x.cmpRegImm32(R.EAX, 0xE0);
  x.jeLabel("ps2_poll_next");
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegReg32(R.EBX, R.EAX);
  x.andRegImm32(R.EBX, 0x7F); // code = scancode & 0x7F
  // Check Shift make/break (0x2A Left Shift, 0x36 Right Shift)
  x.cmpRegImm32(R.EBX, 0x2A);
  x.jeLabel("ps2_shift_key");
  x.cmpRegImm32(R.EBX, 0x36);
  x.jeLabel("ps2_shift_key");

  // Normal key make/break
  x.movRegReg32(R.ECX, R.EAX);
  x.andRegImm32(R.ECX, 0x80); // break bit
  // Map Set 1 scancode to ASCII + Virtual Keycode via lookup table
  x.movRegMem32(R.EDX, R.EDX, ADDR_KEY_MODS);
  x.cmpRegImm32(R.EDX, 0);
  x.jneLabel("ps2_use_shift_tbl");
  x.movRegLabel32(R.EDX, "scancode_plain_tbl");
  x.jmpLabel("ps2_lookup_done");
  x.label("ps2_use_shift_tbl");
  x.movRegLabel32(R.EDX, "scancode_shift_tbl");
  x.label("ps2_lookup_done");
  x.movzxRegSib16(R.EBX, R.EDX, R.EBX, 1, 0); // (vk << 8) | ascii
  x.cmpRegImm32(R.ECX, 0);
  x.jneLabel("ps2_key_up");
  x.orRegImm32 = (reg, imm) => { x.u8(0x81); x.modrm(3, 1, reg); x.u32(imm); };
  x.orRegImm32(R.EBX, 0x01010000); // bit 24 = valid, bit 16 = pressed(1)
  x.jmpLabel("ps2_store_key");
  x.label("ps2_key_up");
  x.orRegImm32(R.EBX, 0x01000000); // bit 24 = valid, bit 16 = pressed(0)
  x.label("ps2_store_key");
  x.xorRegReg32(R.EDX, R.EDX);
  x.movMemReg32(R.EDX, ADDR_KEY_EVENT, R.EBX);
  x.jmpLabel("ps2_poll_next");

  x.label("ps2_shift_key");
  x.xorRegReg32(R.EDX, R.EDX);
  x.andRegImm32(R.EAX, 0x80);
  x.jneLabel("ps2_shift_up");
  x.movMemImm32(R.EDX, ADDR_KEY_MODS, 1);
  x.jmpLabel("ps2_poll_next");
  x.label("ps2_shift_up");
  x.movMemImm32(R.EDX, ADDR_KEY_MODS, 0);
  x.jmpLabel("ps2_poll_next");

  // Mouse packet state machine (3 bytes: b0, dx, dy)
  x.label("ps2_is_mouse");
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EBX, R.EDX, ADDR_MOUSE_STAGE);
  x.cmpRegImm32(R.EBX, 0);
  x.jeLabel("ms_stage0");
  x.cmpRegImm32(R.EBX, 1);
  x.jeLabel("ms_stage1");

  // Stage 2: EAX = dy byte (PS/2 dy is positive UP -> subtract from MOUSE_Y!)
  x.movMemImm32(R.EDX, ADDR_MOUSE_STAGE, 0);
  x.shlRegImm(R.EAX, 24);
  x.sarRegImm(R.EAX, 24); // sign-extend dy
  x.movRegMem32(R.ECX, R.EDX, ADDR_MOUSE_Y);
  x.subRegReg32(R.ECX, R.EAX);
  x.cmpRegImm32(R.ECX, 0); x.jgeLabel("ms_y_min_ok"); x.xorRegReg32(R.ECX, R.ECX);
  x.label("ms_y_min_ok");
  x.cmpRegImm32(R.ECX, 199); x.jleLabel("ms_y_max_ok"); x.movRegImm32(R.ECX, 199);
  x.label("ms_y_max_ok");
  x.movMemReg32(R.EDX, ADDR_MOUSE_Y, R.ECX);
  x.movMemReg32(R.EBP, 0x0FFD0C, R.ECX);

  // Process dx from ADDR_MOUSE_B1
  x.movRegMem32(R.EAX, R.EDX, ADDR_MOUSE_B1);
  x.shlRegImm(R.EAX, 24);
  x.sarRegImm(R.EAX, 24);
  x.movRegMem32(R.ECX, R.EDX, ADDR_MOUSE_X);
  x.addRegReg32(R.ECX, R.EAX);
  x.cmpRegImm32(R.ECX, 0); x.jgeLabel("ms_x_min_ok"); x.xorRegReg32(R.ECX, R.ECX);
  x.label("ms_x_min_ok");
  x.cmpRegImm32(R.ECX, 319); x.jleLabel("ms_x_max_ok"); x.movRegImm32(R.ECX, 319);
  x.label("ms_x_max_ok");
  x.movMemReg32(R.EDX, ADDR_MOUSE_X, R.ECX);
  x.movMemReg32(R.EBP, 0x0FFD08, R.ECX);

  // Process buttons from ADDR_MOUSE_B0
  x.movRegMem32(R.EAX, R.EDX, ADDR_MOUSE_B0);
  x.andRegImm32(R.EAX, 0x07);
  x.movMemReg32(R.EDX, ADDR_MOUSE_BTN, R.EAX);
  x.movMemReg32(R.EBP, 0x0FFD10, R.EAX);
  x.jmpLabel("ps2_poll_next");

  x.label("ms_stage0");
  x.movMemReg32(R.EDX, ADDR_MOUSE_B0, R.EAX);
  x.movMemImm32(R.EDX, ADDR_MOUSE_STAGE, 1);
  x.jmpLabel("ps2_poll_next");

  x.label("ms_stage1");
  x.movMemReg32(R.EDX, ADDR_MOUSE_B1, R.EAX);
  x.movMemImm32(R.EDX, ADDR_MOUSE_STAGE, 2);
  x.jmpLabel("ps2_poll_next");

  x.label("ps2_poll_done");
  x.popReg32(R.EDX);
  x.popReg32(R.ECX);
  x.popReg32(R.EBX);
  x.ret();

  // --------------------------------------------------------------------------
  // Syscall Implementations (0 .. 20)
  // --------------------------------------------------------------------------

  // SYS 0: EXIT(code)
  x.label("sys_00");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.jmpLabel("vm_halt_with_eax");

  // SYS 1: YIELD() -> 2x scale 320x200x8 vmRam[0x0F0000] + palette vmRam[0x0FFA00] into 640x480x32 VBE LFB at 0xE0000000
  x.label("sys_01");
  x.callLabel("sub_poll_ps2");
  x.pushReg32(R.ESI);
  x.pushReg32(R.EDI);

  // Increment frame counter at vmRam[0x0FFD04]
  x.movRegMem32(R.EAX, R.EBP, 0x0FFD04);
  x.addRegImm32(R.EAX, 1);
  x.movMemReg32(R.EBP, 0x0FFD04, R.EAX);

  // Build 256-entry 32-bit BGRX lookup table at 0x00007400 from vmRam[0x0FFA00]
  x.movRegImm32(R.ESI, 0x002FFA00);
  x.movRegImm32(R.EDI, 0x00007400);
  x.movRegImm32(R.ECX, 256);
  x.label("pal_lut_loop");
  x.movzxRegMem8(R.EAX, R.ESI, 0); // R
  x.shlRegImm(R.EAX, 16);
  x.movzxRegMem8(R.EBX, R.ESI, 1); // G
  x.shlRegImm(R.EBX, 8);
  x.orRegReg32(R.EAX, R.EBX);
  x.movzxRegMem8(R.EBX, R.ESI, 2); // B
  x.orRegReg32(R.EAX, R.EBX);
  x.movMemReg32(R.EDI, 0, R.EAX);
  x.addRegImm32(R.ESI, 3);
  x.addRegImm32(R.EDI, 4);
  x.subRegImm32(R.ECX, 1);
  x.jneLabel("pal_lut_loop");

  // Scale 320x200 (0x002F0000) 2x into 640x400 centered at y=40 in 640x480x32 LFB (0xE0000000 + 40*2560 = 0xE0019000)
  x.movRegImm32(R.ESI, 0x002F0000);
  x.movRegImm32(R.EDI, 0xE0019000);
  x.movRegImm32(R.EDX, 200); // 200 source scanlines
  x.label("blit_y_loop");
  x.movRegImm32(R.ECX, 320); // 320 source pixels per line
  x.label("blit_x_loop");
  x.movzxRegMem8(R.EAX, R.ESI, 0);
  x.xorRegReg32(R.EBX, R.EBX);
  x.movRegSib32(R.EAX, R.EBX, R.EAX, 2, 0x7400); // 32-bit RGB pixel
  // Write 2x2 block: [EDI], [EDI+4], [EDI+2560], [EDI+2564]
  x.movMemReg32(R.EDI, 0, R.EAX);
  x.movMemReg32(R.EDI, 4, R.EAX);
  x.movMemReg32(R.EDI, 2560, R.EAX);
  x.movMemReg32(R.EDI, 2564, R.EAX);
  x.addRegImm32(R.ESI, 1);
  x.addRegImm32(R.EDI, 8);
  x.subRegImm32(R.ECX, 1);
  x.jneLabel("blit_x_loop");
  x.addRegImm32(R.EDI, 2560); // skip second doubled scanline
  x.subRegImm32(R.EDX, 1);
  x.jneLabel("blit_y_loop");

  x.popReg32(R.EDI);
  x.popReg32(R.ESI);
  x.xorRegReg32(R.EAX, R.EAX);
  x.jmpLabel("sys_push_eax");

  // SYS 2: TIME_MS() -> derive from VM_ICNT / 50 + frame counter * 16
  x.label("sys_02");
  x.movRegMem32(R.EAX, R.EBP, 0x0FFD04);
  x.shlRegImm(R.EAX, 4); // frames * 16 ms
  x.movMemReg32(R.EBP, 0x0FFD24, R.EAX);
  x.jmpLabel("sys_push_eax");

  // SYS 3: KEY_POLL()
  x.label("sys_03");
  x.callLabel("sub_poll_ps2");
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EAX, R.EDX, ADDR_KEY_EVENT);
  x.movMemImm32(R.EDX, ADDR_KEY_EVENT, 0);
  x.jmpLabel("sys_push_eax");

  // SYS 4: MOUSE_POLL(out_ptr)
  x.label("sys_04");
  x.callLabel("sub_poll_ps2");
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 0); // out_ptr
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EAX, R.EDX, ADDR_MOUSE_X);
  x.movRegMem32(R.EBX, R.EDX, ADDR_MOUSE_Y);
  x.cmpRegImm32(R.ECX, 0);
  x.jeLabel("ms_poll_pack");
  x.andRegImm32(R.ECX, 0x003FFFFF);
  x.movSibReg32(R.EBP, R.ECX, 0, 0, R.EAX);
  x.movSibReg32(R.EBP, R.ECX, 0, 4, R.EBX);
  x.movRegMem32(R.EDX, R.EDX, ADDR_MOUSE_BTN);
  x.movSibReg32(R.EBP, R.ECX, 0, 8, R.EDX);
  x.label("ms_poll_pack");
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.ECX, R.EDX, ADDR_MOUSE_BTN);
  x.shlRegImm(R.ECX, 20);
  x.shlRegImm(R.EBX, 10);
  x.orRegReg32(R.EAX, R.EBX);
  x.orRegReg32(R.EAX, R.ECX);
  x.jmpLabel("sys_push_eax");

  // SYS 5: FILL_RECT(x, y, w, h, color)
  x.label("sys_05");
  x.pushReg32(R.ESI);
  x.pushReg32(R.EDI);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);  // x
  x.movRegSib32(R.EBX, R.EBP, R.EDI, 0, 4);  // y
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 8);  // w
  x.movRegSib32(R.EDX, R.EBP, R.EDI, 0, 12); // h
  x.movRegSib32(R.ESI, R.EBP, R.EDI, 0, 16); // color

  // Clip x < 0
  x.cmpRegImm32(R.EAX, 0); x.jgeLabel("fr5_x_ok");
  x.addRegReg32(R.ECX, R.EAX); x.xorRegReg32(R.EAX, R.EAX);
  x.label("fr5_x_ok");
  // Clip y < 0
  x.cmpRegImm32(R.EBX, 0); x.jgeLabel("fr5_y_ok");
  x.addRegReg32(R.EDX, R.EBX); x.xorRegReg32(R.EBX, R.EBX);
  x.label("fr5_y_ok");
  // Clip x + w > 320
  x.movRegReg32(R.EDI, R.EAX); x.addRegReg32(R.EDI, R.ECX);
  x.cmpRegImm32(R.EDI, 320); x.jleLabel("fr5_w_ok");
  x.movRegImm32(R.ECX, 320); x.subRegReg32(R.ECX, R.EAX);
  x.label("fr5_w_ok");
  // Clip y + h > 200
  x.movRegReg32(R.EDI, R.EBX); x.addRegReg32(R.EDI, R.EDX);
  x.cmpRegImm32(R.EDI, 200); x.jleLabel("fr5_h_ok");
  x.movRegImm32(R.EDX, 200); x.subRegReg32(R.EDX, R.EBX);
  x.label("fr5_h_ok");

  x.cmpRegImm32(R.ECX, 0); x.jleLabel("fr5_done");
  x.cmpRegImm32(R.EDX, 0); x.jleLabel("fr5_done");

  // EDI = 0x002F0000 + y * 320 + x
  x.movRegImm32(R.EDI, 320);
  x.imulRegReg32(R.EBX, R.EDI);
  x.addRegReg32(R.EBX, R.EAX);
  x.addRegImm32(R.EBX, 0x002F0000);
  x.movRegReg32(R.EAX, R.ESI); // AL = color
  x.movRegReg32(R.ESI, R.ECX); // ESI = w

  x.label("fr5_row");
  x.movRegReg32(R.EDI, R.EBX);
  x.movRegReg32(R.ECX, R.ESI);
  x.repStosb();
  x.addRegImm32(R.EBX, 320);
  x.subRegImm32(R.EDX, 1);
  x.jneLabel("fr5_row");

  x.label("fr5_done");
  x.popReg32(R.EDI);
  x.popReg32(R.ESI);
  x.xorRegReg32(R.EAX, R.EAX);
  x.jmpLabel("sys_push_eax");

  // Internal subroutine: draw single 8x8 glyph
  // Input: EAX=x, EBX=y, ECX=ch, EDX=fg, ESI=bg
  x.label("sub_draw_char");
  x.subRegImm32(R.ECX, 32);
  x.cmpRegImm32(R.ECX, 0); x.jlLabel("dc6_ret");
  x.cmpRegImm32(R.ECX, 95); x.jgLabel("dc6_ret");
  x.cmpRegImm32(R.EAX, 0); x.jlLabel("dc6_ret");
  x.cmpRegImm32(R.EAX, 312); x.jgLabel("dc6_ret");
  x.cmpRegImm32(R.EBX, 0); x.jlLabel("dc6_ret");
  x.cmpRegImm32(R.EBX, 192); x.jgLabel("dc6_ret");

  x.pushReg32(R.EDI);
  x.pushReg32(R.EBP);
  // ECX = 0x002EF000 + (ch - 32) * 8
  x.shlRegImm(R.ECX, 3);
  x.addRegImm32(R.ECX, 0x002EF000);
  // EDI = 0x002F0000 + y * 320 + x
  x.movRegImm32(R.EDI, 320);
  x.imulRegReg32(R.EBX, R.EDI);
  x.addRegReg32(R.EBX, R.EAX);
  x.addRegImm32(R.EBX, 0x002F0000);
  x.movRegReg32(R.EDI, R.EBX);

  x.movRegImm32(R.EBP, 8); // 8 rows
  x.label("dc6_row");
  x.movzxRegMem8(R.EBX, R.ECX, 0); // glyph row byte
  x.addRegImm32(R.ECX, 1);
  x.movRegImm32(R.EAX, 128); // bit mask
  x.label("dc6_bit");
  x.pushReg32(R.EAX);
  x.andRegReg32(R.EAX, R.EBX);
  x.jeLabel("dc6_off");
  x.movMemReg8(R.EDI, 0, R.DL); // fg
  x.jmpLabel("dc6_next");
  x.label("dc6_off");
  x.cmpRegImm32(R.ESI, 0);
  x.jlLabel("dc6_next");
  x.movRegReg32(R.EAX, R.ESI);
  x.movMemReg8(R.EDI, 0, R.AL); // bg
  x.label("dc6_next");
  x.popReg32(R.EAX);
  x.addRegImm32(R.EDI, 1);
  x.shrRegImm(R.EAX, 1);
  x.jneLabel("dc6_bit");
  x.addRegImm32(R.EDI, 312);
  x.subRegImm32(R.EBP, 1);
  x.jneLabel("dc6_row");

  x.popReg32(R.EBP);
  x.popReg32(R.EDI);
  x.label("dc6_ret");
  x.ret();

  // SYS 6: DRAW_CHAR(x, y, ch, fg, bg)
  x.label("sys_06");
  x.pushReg32(R.ESI);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.movRegSib32(R.EBX, R.EBP, R.EDI, 0, 4);
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 8);
  x.movRegSib32(R.EDX, R.EBP, R.EDI, 0, 12);
  x.movRegSib32(R.ESI, R.EBP, R.EDI, 0, 16);
  x.callLabel("sub_draw_char");
  x.popReg32(R.ESI);
  x.xorRegReg32(R.EAX, R.EAX);
  x.jmpLabel("sys_push_eax");

  // SYS 7: DRAW_STR(x, y, str_ptr, fg, bg)
  x.label("sys_07");
  x.pushReg32(R.ESI);
  x.pushReg32(R.EDI);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);  // x
  x.movRegSib32(R.EBX, R.EBP, R.EDI, 0, 4);  // y
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 8);  // str_ptr
  x.addRegReg32(R.ECX, R.EBP);               // phys str_ptr
  x.movRegSib32(R.EDX, R.EBP, R.EDI, 0, 12); // fg
  x.movRegSib32(R.ESI, R.EBP, R.EDI, 0, 16); // bg
  x.movRegReg32(R.EDI, R.ECX);               // EDI = phys str_ptr

  x.label("ds7_loop");
  x.movzxRegMem8(R.ECX, R.EDI, 0);
  x.cmpRegImm32(R.ECX, 0);
  x.jeLabel("ds7_done");
  x.pushReg32(R.EAX);
  x.pushReg32(R.EBX);
  x.pushReg32(R.EDX);
  x.pushReg32(R.ESI);
  x.pushReg32(R.EDI);
  x.callLabel("sub_draw_char");
  x.popReg32(R.EDI);
  x.popReg32(R.ESI);
  x.popReg32(R.EDX);
  x.popReg32(R.EBX);
  x.popReg32(R.EAX);
  x.addRegImm32(R.EAX, 8);
  x.addRegImm32(R.EDI, 1);
  x.jmpLabel("ds7_loop");

  x.label("ds7_done");
  x.popReg32(R.EDI);
  x.popReg32(R.ESI);
  x.xorRegReg32(R.EAX, R.EAX);
  x.jmpLabel("sys_push_eax");

  // SYS 8: MEMCPY(dst, src, len)
  x.label("sys_08");
  x.pushReg32(R.ESI);
  x.pushReg32(R.EDI);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0); // dst
  x.movRegSib32(R.ESI, R.EBP, R.EDI, 0, 4); // src
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 8); // len
  x.movRegReg32(R.EDI, R.EAX);
  x.addRegReg32(R.EDI, R.EBP);
  x.addRegReg32(R.ESI, R.EBP);
  x.cmpRegImm32(R.ECX, 0);
  x.jleLabel("mc8_done");
  x.repMovsb();
  x.label("mc8_done");
  x.popReg32(R.EDI);
  x.popReg32(R.ESI);
  x.xorRegReg32(R.EAX, R.EAX);
  x.jmpLabel("sys_push_eax");

  // SYS 9: MEMSET(dst, val, len)
  x.label("sys_09");
  x.pushReg32(R.EDI);
  x.movRegSib32(R.EBX, R.EBP, R.EDI, 0, 0); // dst
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 4); // val
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 8); // len
  x.movRegReg32(R.EDI, R.EBX);
  x.addRegReg32(R.EDI, R.EBP);
  x.cmpRegImm32(R.ECX, 0);
  x.jleLabel("ms9_done");
  x.repStosb();
  x.label("ms9_done");
  x.popReg32(R.EDI);
  x.xorRegReg32(R.EAX, R.EAX);
  x.jmpLabel("sys_push_eax");

  // SYS 10: DISK_SYNC(start_sector, sector_count)
  // Writes sectors from vmRam[0x200000 + lba*512] (phys 0x00400000) to floppy via 8237 DMA + 82077AA FDC!
  x.label("sys_10");
  x.pushReg32(R.ESI);
  x.pushReg32(R.EDI);
  x.movRegSib32(R.EBX, R.EBP, R.EDI, 0, 0); // EBX = current LBA
  x.movRegSib32(R.EDX, R.EBP, R.EDI, 0, 4); // EDX = remaining sectors

  x.label("fdc_sync_loop");
  x.cmpRegImm32(R.EDX, 0);
  x.jleLabel("fdc_sync_done");
  x.pushReg32(R.EDX);

  // Copy 1 sector (512 bytes) from 0x00400000 + EBX*512 to DMA bounce buffer at 0x00010000
  x.movRegReg32(R.ESI, R.EBX);
  x.shlRegImm(R.ESI, 9);
  x.addRegImm32(R.ESI, 0x00400000);
  x.movRegImm32(R.EDI, 0x00010000);
  x.movRegImm32(R.ECX, 128);
  x.repMovsd();

  // Program 8237A DMA Channel 2 for 512 bytes at phys 0x00010000 (page=0x01, addr=0x0000, count=511)
  x.movRegImm32(R.EAX, 0x06); x.outImm8Al(0x0A); // mask ch2
  x.movRegImm32(R.EAX, 0x00); x.outImm8Al(0x0C); // reset flip-flop
  x.movRegImm32(R.EAX, 0x4A); x.outImm8Al(0x0B); // mode: read from memory, ch2
  x.movRegImm32(R.EAX, 0x00); x.outImm8Al(0x04); // addr low
  x.movRegImm32(R.EAX, 0x00); x.outImm8Al(0x04); // addr high
  x.movRegImm32(R.EAX, 0x01); x.outImm8Al(0x81); // page = 0x01 (0x010000)
  x.movRegImm32(R.EAX, 0xFF); x.outImm8Al(0x05); // count low (511 = 0x01FF)
  x.movRegImm32(R.EAX, 0x01); x.outImm8Al(0x05); // count high
  x.movRegImm32(R.EAX, 0x02); x.outImm8Al(0x0A); // unmask ch2

  // Compute C, H, R from LBA in EBX:
  // track = LBA / 18, R = (LBA % 18) + 1, H = track & 1, C = track >> 1
  x.movRegReg32(R.EAX, R.EBX);
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegImm32(R.ECX, 18);
  x.divReg32(R.ECX); // EAX = track, EDX = R - 1
  x.addRegImm32(R.EDX, 1);
  x.movRegReg32(R.ECX, R.EAX);
  x.andRegImm32(R.ECX, 1); // ECX = H
  x.shrRegImm(R.EAX, 1);   // EAX = C
  x.movRegReg32(R.ESI, R.EAX); // ESI = C
  x.movRegReg32(R.EDI, R.EDX); // EDI = R

  // Send 9-byte FDC WRITE DATA command to port 0x03F5
  const fdcOut = (regOrImm, isReg = false) => {
    x.movRegImm32(R.EDX, 0x03F5);
    if (!isReg) x.movRegImm32(R.EAX, regOrImm);
    else if (regOrImm !== R.EAX) x.movRegReg32(R.EAX, regOrImm);
    x.outDxAl();
  };
  fdcOut(0xC5); // WRITE DATA
  x.movRegReg32(R.EAX, R.ECX); x.shlRegImm(R.EAX, 2); fdcOut(R.EAX, true); // HD<<2 | drv0
  fdcOut(R.ESI, true); // C
  fdcOut(R.ECX, true); // H
  fdcOut(R.EDI, true); // R
  fdcOut(0x02);        // N = 2 (512B)
  fdcOut(18);          // EOT = 18
  fdcOut(0x1B);        // GPL
  fdcOut(0xFF);        // DTL

  // Drain 7 result bytes from 0x03F5
  x.movRegImm32(R.ECX, 7);
  x.movRegImm32(R.EDX, 0x03F5);
  x.label("fdc_res_loop");
  x.inAlDx();
  x.subRegImm32(R.ECX, 1);
  x.jneLabel("fdc_res_loop");

  x.popReg32(R.EDX);
  x.addRegImm32(R.EBX, 1);
  x.subRegImm32(R.EDX, 1);
  x.jmpLabel("fdc_sync_loop");

  x.label("fdc_sync_done");
  x.popReg32(R.EDI);
  x.popReg32(R.ESI);
  x.xorRegReg32(R.EAX, R.EAX);
  x.jmpLabel("sys_push_eax");

  // SYS 11: REBOOT() -> triggers hardware reset on port 0x64 (0xFE) to reboot from updated floppyImage!
  x.label("sys_11");
  x.movRegImm32(R.EAX, 0xFE);
  x.outImm8Al(0x64);
  x.jmpLabel("vm_warm_boot");

  // SYS 12: NET_SEND(buf_ptr, len) -> StudioNet ports 0x02A0..0x02AF
  x.label("sys_12");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0); // buf_ptr
  x.addRegReg32(R.EAX, R.EBP);              // phys addr
  x.movRegImm32(R.EDX, 0x02A8);
  x.outDxEax();                             // SNET_DMA_ADDR = phys addr
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 4); // len
  x.movRegImm32(R.EDX, 0x02A6);
  x.outDxAx();                              // SNET_LEN = len
  x.movRegImm32(R.ECX, R.EAX);
  x.movRegImm32(R.EAX, 0x01);               // CMD_TX_SEND
  x.movRegImm32(R.EDX, 0x02A2);
  x.outDxAl();
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 4);
  x.jmpLabel("sys_push_eax");

  // SYS 13: NET_RECV(buf_ptr, max_len)
  x.label("sys_13");
  x.movRegImm32(R.EDX, 0x02A2);
  x.inAlDx();
  x.andRegImm32(R.EAX, 0x01);               // RX_READY?
  x.jeLabel("net_rx_empty");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0); // buf_ptr
  x.addRegReg32(R.EAX, R.EBP);
  x.movRegImm32(R.EDX, 0x02A8);
  x.outDxEax();                             // SNET_DMA_ADDR
  x.movRegImm32(R.EAX, 0x02);               // CMD_RX_POP
  x.movRegImm32(R.EDX, 0x02A2);
  x.outDxAl();
  x.movRegImm32(R.EDX, 0x02A6);
  x.xorRegReg32(R.EAX, R.EAX);
  x.inAxDx();                               // popped frame length
  x.jmpLabel("sys_push_eax");
  x.label("net_rx_empty");
  x.xorRegReg32(R.EAX, R.EAX);
  x.jmpLabel("sys_push_eax");

  // SYS 14: NET_INFO(cmd, val)
  x.label("sys_14");
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 0); // cmd
  x.cmpRegImm32(R.ECX, 0); x.jeLabel("ni_get_id");
  x.cmpRegImm32(R.ECX, 1); x.jeLabel("ni_set_id");
  x.cmpRegImm32(R.ECX, 2); x.jeLabel("ni_get_tx");
  x.movRegImm32(R.EDX, 0x02AE); x.xorRegReg32(R.EAX, R.EAX); x.inAxDx(); x.jmpLabel("sys_push_eax");
  x.label("ni_get_id");
  x.movRegImm32(R.EDX, 0x02A4); x.xorRegReg32(R.EAX, R.EAX); x.inAxDx(); x.jmpLabel("sys_push_eax");
  x.label("ni_set_id");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 4);
  x.movRegImm32(R.EDX, 0x02A4); x.outDxAx(); x.jmpLabel("sys_push_eax");
  x.label("ni_get_tx");
  x.movRegImm32(R.EDX, 0x02AD); x.xorRegReg32(R.EAX, R.EAX); x.inAlDx(); x.jmpLabel("sys_push_eax");

  // SYS 15: SOUND_TONE(freq_hz, duration_ms, wave) -> PIT Ch2 + Port 0x61 PC Speaker
  x.label("sys_15");
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 0); // freq_hz
  x.cmpRegImm32(R.ECX, 20);
  x.jlLabel("snd_mute");
  x.movRegImm32(R.EAX, 1193182);
  x.xorRegReg32(R.EDX, R.EDX);
  x.divReg32(R.ECX); // EAX = reload
  x.movRegReg32(R.ECX, R.EAX);
  x.movRegImm32(R.EAX, 0xB6); x.outImm8Al(0x43);
  x.movRegReg32(R.EAX, R.ECX); x.outImm8Al(0x42);
  x.shrRegImm(R.EAX, 8); x.outImm8Al(0x42);
  x.inAlImm8(0x61);
  x.orRegImm32(R.EAX, 3);
  x.outImm8Al(0x61);
  x.xorRegReg32(R.EAX, R.EAX);
  x.jmpLabel("sys_push_eax");
  x.label("snd_mute");
  x.inAlImm8(0x61);
  x.andRegImm32(R.EAX, 0xFC);
  x.outImm8Al(0x61);
  x.xorRegReg32(R.EAX, R.EAX);
  x.jmpLabel("sys_push_eax");

  // SYS 16: MACHINE_INFO(query) -> 0: machineId(2), 1: vmRamSize(4MB), 2: icnt, 3: nodeId(0x0201)
  x.label("sys_16");
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 0);
  x.cmpRegImm32(R.ECX, 0); x.jeLabel("mi16_0");
  x.cmpRegImm32(R.ECX, 1); x.jeLabel("mi16_1");
  x.cmpRegImm32(R.ECX, 2); x.jeLabel("mi16_2");
  x.movRegImm32(R.EAX, 0x0201); x.jmpLabel("sys_push_eax");
  x.label("mi16_0"); x.movRegImm32(R.EAX, 2); x.jmpLabel("sys_push_eax");
  x.label("mi16_1"); x.movRegImm32(R.EAX, 0x00400000); x.jmpLabel("sys_push_eax");
  x.label("mi16_2"); x.xorRegReg32(R.EDX, R.EDX); x.movRegMem32(R.EAX, R.EDX, ADDR_VM_ICNT); x.jmpLabel("sys_push_eax");

  // SYS 17: BLIT_RECT(x, y, w, h, src_ptr)
  x.label("sys_17");
  x.pushReg32(R.ESI);
  x.pushReg32(R.EDI);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);  // x
  x.movRegSib32(R.EBX, R.EBP, R.EDI, 0, 4);  // y
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 8);  // w
  x.movRegSib32(R.EDX, R.EBP, R.EDI, 0, 12); // h
  x.movRegSib32(R.ESI, R.EBP, R.EDI, 0, 16); // src_ptr
  x.addRegReg32(R.ESI, R.EBP);
  x.movRegImm32(R.EDI, 320);
  x.imulRegReg32(R.EBX, R.EDI);
  x.addRegReg32(R.EBX, R.EAX);
  x.addRegImm32(R.EBX, 0x002F0000);
  x.movRegReg32(R.EAX, R.ECX); // EAX = w
  x.cmpRegImm32(R.EAX, 0); x.jleLabel("br17_done");
  x.cmpRegImm32(R.EDX, 0); x.jleLabel("br17_done");
  x.label("br17_row");
  x.movRegReg32(R.EDI, R.EBX);
  x.movRegReg32(R.ECX, R.EAX);
  x.repMovsb();
  x.addRegImm32(R.EBX, 320);
  x.subRegImm32(R.EDX, 1);
  x.jneLabel("br17_row");
  x.label("br17_done");
  x.popReg32(R.EDI);
  x.popReg32(R.ESI);
  x.xorRegReg32(R.EAX, R.EAX);
  x.jmpLabel("sys_push_eax");

  // SYS 18: STRCMP(s1, s2)
  x.label("sys_18");
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 0);
  x.movRegSib32(R.EDX, R.EBP, R.EDI, 0, 4);
  x.addRegReg32(R.ECX, R.EBP);
  x.addRegReg32(R.EDX, R.EBP);
  x.label("sc18_loop");
  x.movzxRegMem8(R.EAX, R.ECX, 0);
  x.movzxRegMem8(R.EBX, R.EDX, 0);
  x.cmpRegReg32(R.EAX, R.EBX);
  x.jneLabel("sc18_diff");
  x.cmpRegImm32(R.EAX, 0);
  x.jeLabel("sc18_same");
  x.addRegImm32(R.ECX, 1);
  x.addRegImm32(R.EDX, 1);
  x.jmpLabel("sc18_loop");
  x.label("sc18_diff"); x.xorRegReg32(R.EAX, R.EAX); x.jmpLabel("sys_push_eax");
  x.label("sc18_same"); x.movRegImm32(R.EAX, 1); x.jmpLabel("sys_push_eax");

  // SYS 19: STRLEN(s)
  x.label("sys_19");
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 0);
  x.addRegReg32(R.ECX, R.EBP);
  x.xorRegReg32(R.EAX, R.EAX);
  x.label("sl19_loop");
  x.movzxRegMem8(R.EBX, R.ECX, 0);
  x.cmpRegImm32(R.EBX, 0);
  x.jeLabel("sys_push_eax");
  x.addRegImm32(R.EAX, 1);
  x.addRegImm32(R.ECX, 1);
  x.jmpLabel("sl19_loop");

  // SYS 20: INT_TO_STR(val, buf_ptr, base)
  x.label("sys_20");
  x.pushReg32(R.ESI);
  x.pushReg32(R.EDI);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0); // val
  x.movRegSib32(R.EBX, R.EBP, R.EDI, 0, 4); // buf_ptr
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 8); // base
  x.addRegReg32(R.EBX, R.EBP);              // phys buf_ptr
  x.cmpRegImm32(R.EAX, 0);
  x.jneLabel("itoa20_nz");
  x.movRegImm32(R.EDX, 48); x.movMemReg8(R.EBX, 0, R.DL);
  x.xorRegReg32(R.EDX, R.EDX); x.movMemReg8(R.EBX, 1, R.DL);
  x.popReg32(R.EDI); x.popReg32(R.ESI);
  x.movRegImm32(R.EAX, 1); x.jmpLabel("sys_push_eax");

  x.label("itoa20_nz");
  x.xorRegReg32(R.ESI, R.ESI); // neg flag
  x.cmpRegImm32(R.ECX, 10);
  x.jneLabel("itoa20_pos");
  x.cmpRegImm32(R.EAX, 0);
  x.jgeLabel("itoa20_pos");
  x.movRegImm32(R.ESI, 1);
  x.negReg32(R.EAX);
  x.label("itoa20_pos");
  x.movRegImm32(R.EDI, 0); // count in temp buffer at 0x00007300
  x.label("itoa20_div");
  x.cmpRegImm32(R.EAX, 0);
  x.jeLabel("itoa20_div_done");
  x.xorRegReg32(R.EDX, R.EDX);
  x.divReg32(R.ECX); // EAX = quot, EDX = rem
  x.cmpRegImm32(R.EDX, 10);
  x.jlLabel("itoa20_dec");
  x.addRegImm32(R.EDX, 55);
  x.jmpLabel("itoa20_store");
  x.label("itoa20_dec");
  x.addRegImm32(R.EDX, 48);
  x.label("itoa20_store");
  x.movMemReg8(R.EDI, 0x7300, R.DL);
  x.addRegImm32(R.EDI, 1);
  x.jmpLabel("itoa20_div");

  x.label("itoa20_div_done");
  x.movRegReg32(R.EAX, R.EDI); // total len
  x.cmpRegImm32(R.ESI, 0);
  x.jeLabel("itoa20_rev");
  x.movRegImm32(R.EDX, 45);
  x.movMemReg8(R.EBX, 0, R.DL);
  x.addRegImm32(R.EBX, 1);
  x.addRegImm32(R.EAX, 1);

  x.label("itoa20_rev");
  x.cmpRegImm32(R.EDI, 0);
  x.jeLabel("itoa20_end");
  x.subRegImm32(R.EDI, 1);
  x.movzxRegMem8(R.EDX, R.EDI, 0x7300);
  x.movMemReg8(R.EBX, 0, R.DL);
  x.addRegImm32(R.EBX, 1);
  x.jmpLabel("itoa20_rev");

  x.label("itoa20_end");
  x.xorRegReg32(R.EDX, R.EDX);
  x.movMemReg8(R.EBX, 0, R.DL);
  x.popReg32(R.EDI);
  x.popReg32(R.ESI);
  x.jmpLabel("sys_push_eax");

  // ==========================================================================
  // 4. VM Halt & Jump Tables
  // ==========================================================================
  x.label("vm_halt_from_ret");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, -4);
  x.jmpLabel("vm_halt_with_eax");

  x.label("vm_halt_bad_op");
  x.movRegImm32(R.EAX, -99);

  x.label("vm_halt_with_eax");
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.ECX, R.EDX, ADDR_VM_ICNT);
  x.movMemReg32(R.EBP, 0x0FFD20, R.ECX); // store VM_ICNT at vmRam[0x0FFD20]
  x.movMemReg32(R.EBP, 0x0FFD28, R.EAX); // store exitCode at vmRam[0x0FFD28]
  x.movMemImm32(R.EBP, 0x0FFD2C, 1);     // store halted=1 at vmRam[0x0FFD2C]
  x.label("halt_spin");
  x.hlt();
  x.jmpLabel("halt_spin");

  const opLabels = [
    "op_00_nop",       "op_01_halt",      "op_02_push_i16",  "op_03_push_u16",
    "op_04_push_hi",   "op_05_dup",       "op_06_drop",      "op_07_swap",
    "op_08_get_local", "op_09_set_local", "op_0a_get_global","op_0b_set_global",
    "op_0c_addr_local","op_0d_addr_global","op_0e_load8u",   "op_0f_load8s",
    "op_10_load16u",   "op_11_load32",    "op_12_store8",    "op_13_store16",
    "op_14_store32",   "op_15_add",       "op_16_sub",       "op_17_mul",
    "op_18_div",       "op_19_mod",       "op_1a_and",       "op_1b_or",
    "op_1c_xor",       "op_1d_shl",       "op_1e_shr",       "op_1f_sar",
    "op_20_cmp",       "op_21_jmp",       "op_22_jz",        "op_23_jnz",
    "op_24_call",      "op_25_enter",     "op_26_ret",       "op_27_syscall"
  ];
  x.label("op_table");
  x.labelTable32(opLabels);

  const cmpLabels = [
    "cmp_0_eq", "cmp_1_ne", "cmp_2_lt", "cmp_3_le",
    "cmp_4_gt", "cmp_5_ge", "cmp_6_ult", "cmp_7_ugt"
  ];
  x.label("cmp_table");
  x.labelTable32(cmpLabels);

  // Embedded 8x8 Font (768 bytes)
  x.label("embedded_font");
  for (let i = 0; i < 768; i++) {
    x.u8(parseInt(X86_FONT_8X8_HEX.substr(i * 2, 2), 16));
  }

  // Embedded 256-color Palette (768 bytes, identical to TabComp default)
  x.label("embedded_palette");
  const ega16 = [
    [0,0,0],       [0,18,110],    [0,150,40],    [0,160,160],
    [170,20,20],   [150,0,150],   [170,95,0],    [180,185,195],
    [85,90,105],   [65,125,255],  [72,255,122],  [0,240,255],
    [255,80,80],   [255,85,255],  [255,230,60],  [255,255,255]
  ];
  for (let i = 0; i < 16; i++) {
    x.u8(ega16[i][0]); x.u8(ega16[i][1]); x.u8(ega16[i][2]);
  }
  for (let i = 16; i < 256; i++) {
    x.u8((i * 37) & 255); x.u8((i * 73) & 255); x.u8((i * 139) & 255);
  }

  // PS/2 Set 1 Scancode -> (vk << 8) | ascii tables (128 * 2 bytes each)
  const plainMap = new Uint16Array(128);
  const shiftMap = new Uint16Array(128);
  const rowsPlain = [
    [0x02, "`1234567890-=", 0x29],
    [0x10, "qwertyuiop[]", 0],
    [0x1E, "asdfghjkl;'", 0],
    [0x2C, "zxcvbnm,./", 0]
  ];
  const plainChars = "1234567890-=\b\tqwertyuiop[]\r\0asdfghjkl;'`\0\\zxcvbnm,./";
  const shiftChars = "!@#$%^&*()_+\b\tQWERTYUIOP{}\r\0ASDFGHJKL:\"~\0|ZXCVBNM<>?";
  for (let i = 0; i < plainChars.length; i++) {
    const sc = i + 2;
    const cp = plainChars.charCodeAt(i);
    const cs = shiftChars.charCodeAt(i);
    if (cp) plainMap[sc] = (cp.toString ? cp : 0) | ((cp >= 97 && cp <= 122 ? cp - 32 : cp) << 8);
    if (cs) shiftMap[sc] = (cs.toString ? cs : 0) | ((cp >= 97 && cp <= 122 ? cp - 32 : cp) << 8);
  }
  plainMap[0x01] = (27 << 8) | 27; shiftMap[0x01] = (27 << 8) | 27; // Esc
  plainMap[0x0E] = (8 << 8) | 8;   shiftMap[0x0E] = (8 << 8) | 8;   // Backspace
  plainMap[0x0F] = (9 << 8) | 9;   shiftMap[0x0F] = (9 << 8) | 9;   // Tab
  plainMap[0x1C] = (13 << 8) | 13; shiftMap[0x1C] = (13 << 8) | 13; // Enter
  plainMap[0x39] = (32 << 8) | 32; shiftMap[0x39] = (32 << 8) | 32; // Space
  plainMap[0x48] = (38 << 8) | 0;  shiftMap[0x48] = (38 << 8) | 0;  // Up
  plainMap[0x50] = (40 << 8) | 0;  shiftMap[0x50] = (40 << 8) | 0;  // Down
  plainMap[0x4B] = (37 << 8) | 0;  shiftMap[0x4B] = (37 << 8) | 0;  // Left
  plainMap[0x4D] = (39 << 8) | 0;  shiftMap[0x4D] = (39 << 8) | 0;  // Right

  x.label("scancode_plain_tbl");
  for (let i = 0; i < 128; i++) x.u16(plainMap[i]);
  x.label("scancode_shift_tbl");
  for (let i = 0; i < 128; i++) x.u16(shiftMap[i]);

  return x.finalize();
}

function buildX86Core() {
  const bootSector = buildBootSector();
  const pmCore = buildProtectedModeCore();
  const combined = new Uint8Array(32 * 512); // Sectors 0..31 (16 KB)
  combined.set(bootSector, 0);
  combined.set(pmCore, 512);
  return {
    bootSector,
    pmCore,
    bytes: combined,
    totalBytes: 512 + pmCore.length
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildX86Core, buildBootSector, buildProtectedModeCore };
}
if (typeof globalThis !== "undefined") {
  globalThis.buildX86Core = buildX86Core;
}
