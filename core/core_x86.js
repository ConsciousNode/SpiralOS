/**
 * SpiralOS 1.1 — Hummingbird i586 Native Core
 * (Stage 1 Boot Sector + Stage 2 Track-Safe Loader & BIOS Thunk + 32-Bit Protected-Mode Core)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Uses core/x86_asm.js to build:
 *   1. Sector 0 (512B at 0x7C00): Stage 1 BIOS Boot Sector (FAT12 BPB, boot banner at 0x180,
 *      3-retry INT 13h load of Stage 2 to 0x7E00, GDT with 32-bit & 16-bit descriptors)
 *   2. Sector 1 (512B at 0x7E00): Stage 2 Real-Mode Loader (track-safe LBA-to-CHS reader
 *      that never crosses 18-sector track boundaries, 3-retry CF error check, VBE 32/24-bpp
 *      mode scanner, PhysBasePtr page-directory mapper, and Real-Mode INT 13h AH=03h write thunk)
 *   3. Sectors 2..31 (at 0x8000): 32-bit x86 Protected-Mode Kernel + Hardware Drivers
 *      (8259A PIC + 8254 PIT IRQ0 timer ISR + Preemptive VM Task Scheduler, PS/2 keyboard & mouse,
 *      VBE 24-bpp & 32-bpp 2x LFB blitter, 82077AA FDC + BIOS INT 13h fallback sync,
 *      StudioNet presence detection & port I/O, PIT speaker) + Spiral VM Interpreter.
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

function buildBootSector(customBanner = "SpiralOS 1.1") {
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

  // 16-bit Real Mode entry at 0x7C3E
  put(0xFA);                         // cli
  put(0x31, 0xC0);                   // xor ax, ax
  put(0x8E, 0xD8);                   // mov ds, ax
  put(0x8E, 0xC0);                   // mov es, ax
  put(0x8E, 0xD0);                   // mov ss, ax
  put(0xBC); put16(0x7C00);          // mov sp, 0x7C00
  put(0x88, 0x16); put16(0x7DFC);    // mov [0x7DFC], dl (save boot drive)
  put(0xFB);                         // sti
  // 1. Print 'S' via INT 10h AH=0Eh (triggers Milestone 1: Boot sector runs)
  put(0xB8); put16(0x0E53);          // mov ax, 0x0E53
  put(0x31, 0xDB);                   // xor bx, bx
  put(0xCD, 0x10);                   // int 10h

  // 2. Write banner from 0x7D80 (offset 0x180) onto row 2 of 0xB8000 and call INT 16h AH=01h
  put(0xB8); put16(0xB800);          // mov ax, 0xB800
  put(0x8E, 0xC0);                   // mov es, ax
  put(0xBE); put16(0x7D80);          // mov si, 0x7D80
  put(0xBF); put16(2 * 160 + 4);     // mov di, 324
  const bannerLoop = p;
  put(0xAC);                         // lodsb
  put(0x84, 0xC0);                   // test al, al
  put(0x74, 0x06);                   // jz +6
  put(0xB4, 0x1F);                   // mov ah, 0x1F
  put(0xAB);                         // stosw
  put(0xEB, (bannerLoop - (p + 2)) & 0xFF);
  put(0xB4, 0x01);                   // mov ah, 0x01
  put(0xCD, 0x16);                   // int 16h

  // --------------------------------------------------------------------------
  // AUDIT FIX (Kehai, 2026-11-10): one disk reader for every boot medium.
  // A USB stick usually boots as a hard disk (DL >= 0x80) with a geometry the BIOS
  // invents (SeaBIOS reports 2/16/90 for a 1.44 MB image; real PCs vary), so fixed
  // 18-sector, 2-head CHS math read the wrong sectors and halted with 'E'.
  // Now: hard disks use INT 13h extensions (LBA, AH=42h) when present; everything
  // else uses CHS with the geometry INT 13h AH=08h reports (default 18/2). Reads never
  // cross a track (CHS) or a 64 KB DMA boundary. Stage 2 calls this same routine.
  // Variables: [7D90] sectors/track, [7D91] heads, [7D92] use LBA, [7DF4] CX, [7DF6] DH,
  //            [7DF8] chunk count, [7DFA] retries, [7DFC] boot drive. DAP built on the stack.
  // --------------------------------------------------------------------------
  const L = {}, fx = [];
  const lab = (n) => { L[n] = p; };
  const j8 = (op, n) => { put(op, 0); fx.push([p - 1, n, 1]); };
  const j16 = (op, n) => { put(op); put16(0); fx.push([p - 2, n, 2]); };

  // Geometry. Defaults (18 spt, 2 heads, CHS) are stored in this sector's own bytes
  // 0x190..0x192 (right after the banner), so they are already in memory at 7D90..7D92 when the BIOS loads us.
  b[0x190] = 18; b[0x191] = 2; b[0x192] = 0;
  put(0xB4, 0x08);                           // mov ah, 08h
  put(0x8A, 0x16); put16(0x7DFC);            // mov dl, [7DFC]
  put(0xCD, 0x13);                           // int 13h
  j8(0x72, 'geom_done');                     // jc geom_done
  put(0x80, 0xE1, 0x3F);                     // and cl, 3Fh
  j8(0x74, 'geom_done');                     // jz geom_done (0 sectors/track = bogus)
  put(0x88, 0x0E); put16(0x7D90);            // mov [7D90], cl
  put(0xFE, 0xC6);                           // inc dh
  put(0x88, 0x36); put16(0x7D91);            // mov [7D91], dh
  lab('geom_done');
  // INT 13h extensions (hard-disk boot only)
  put(0x8A, 0x16); put16(0x7DFC);            // mov dl, [7DFC]
  put(0x80, 0xFA, 0x80);                     // cmp dl, 80h
  j8(0x72, 'ext_done');                      // jb ext_done
  put(0xB4, 0x41);                           // mov ah, 41h
  put(0xBB); put16(0x55AA);                  // mov bx, 55AAh
  put(0xCD, 0x13);                           // int 13h
  j8(0x72, 'ext_done');                      // jc ext_done
  put(0x81, 0xFB); put16(0xAA55);            // cmp bx, AA55h
  j8(0x75, 'ext_done');                      // jne ext_done
  put(0xF6, 0xC1, 0x01);                     // test cl, 1
  j8(0x74, 'ext_done');                      // jz ext_done
  put(0xC6, 0x06); put16(0x7D92); put(1);    // mov byte [7D92], 1
  lab('ext_done');

  // Load Stage 2 (LBA 1, 1 sector) to 0000:7E00 and jump to it
  put(0xBE); put16(1);                       // mov si, 1
  put(0xBD); put16(1);                       // mov bp, 1
  put(0xBF); put16(0x07E0);                  // mov di, 07E0h
  j16(0xE8, 'read_range');                   // call read_range
  put(0xEA); put16(0x7E00); put16(0x0000);   // jmp 0000:7E00

  // read_range: SI = first LBA, BP = sector count, DI = destination segment
  lab('read_range');
  lab('rr_loop');
  put(0x85, 0xED);                           // test bp, bp
  put(0x0F); j16(0x84, 'rr_done');           // jz near rr_done
  put(0x89, 0xFB);                           // mov bx, di
  put(0x81, 0xE3); put16(0x0FFF);            // and bx, 0FFFh
  put(0xC1, 0xEB, 0x05);                     // shr bx, 5
  put(0xF7, 0xDB);                           // neg bx
  put(0x81, 0xC3); put16(128);               // add bx, 128   (sectors left before 64 KB boundary)
  put(0x89, 0xE8);                           // mov ax, bp
  put(0x39, 0xD8);                           // cmp ax, bx
  put(0x76, 0x02);                           // jbe +2
  put(0x89, 0xD8);                           // mov ax, bx
  put(0x3C, 0x7F);                           // cmp al, 127 (ax <= 128 here, so ah = 0)
  put(0x76, 0x02);                           // jbe +2
  put(0xB0, 0x7F);                           // mov al, 127 (some BIOSes reject >127 per call)
  put(0x80, 0x3E); put16(0x7D92); put(0);    // cmp byte [7D92], 0
  j8(0x75, 'rr_chunk');                      // jne rr_chunk (LBA: no track limit)
  put(0x50);                                 // push ax
  put(0x89, 0xF0);                           // mov ax, si
  put(0xF6, 0x36); put16(0x7D90);            // div byte [7D90] -> al = track, ah = sector-1
  put(0x88, 0xE1);                           // mov cl, ah
  put(0xFE, 0xC1);                           // inc cl
  put(0x30, 0xE4);                           // xor ah, ah
  put(0xF6, 0x36); put16(0x7D91);            // div byte [7D91] -> al = cyl, ah = head
  put(0x88, 0xC5);                           // mov ch, al
  put(0x89, 0x0E); put16(0x7DF4);            // mov [7DF4], cx
  put(0x88, 0x26); put16(0x7DF6);            // mov [7DF6], ah (head)
  put(0x8A, 0x1E); put16(0x7D90);            // mov bl, [7D90]
  put(0x28, 0xCB);                           // sub bl, cl
  put(0xFE, 0xC3);                           // inc bl
  put(0x30, 0xFF);                           // xor bh, bh   (sectors left on this track)
  put(0x58);                                 // pop ax
  put(0x39, 0xD8);                           // cmp ax, bx
  put(0x76, 0x02);                           // jbe +2
  put(0x89, 0xD8);                           // mov ax, bx
  lab('rr_chunk');
  put(0xA3); put16(0x7DF8);                  // mov [7DF8], ax
  put(0xC6, 0x06); put16(0x7DFA); put(3);    // mov byte [7DFA], 3
  lab('rr_retry');
  put(0x8A, 0x16); put16(0x7DFC);            // mov dl, [7DFC]
  put(0x80, 0x3E); put16(0x7D92); put(0);    // cmp byte [7D92], 0
  j8(0x74, 'rr_chs');                        // je rr_chs
  // Disk address packet built on the stack (SS = DS = 0): size 16, count, 0000:offset, LBA
  put(0x56);                                 // push si (keep LBA)
  put(0x31, 0xC0);                           // xor ax, ax
  put(0x50, 0x50, 0x50);                     // push ax x3 (LBA bits 16..63)
  put(0x56);                                 // push si (LBA bits 0..15)
  put(0x57);                                 // push di (segment)
  put(0x50);                                 // push ax (offset 0)
  put(0xFF, 0x36); put16(0x7DF8);            // push word [7DF8] (count)
  put(0x6A, 0x10);                           // push 10h (size 16, reserved 0)
  put(0x89, 0xE6);                           // mov si, sp
  put(0xB4, 0x42);                           // mov ah, 42h
  put(0xCD, 0x13);                           // int 13h
  put(0x5B, 0x5B, 0x5B, 0x5B, 0x5B, 0x5B, 0x5B, 0x5B); // pop bx x8 (drop the packet; keeps CF)
  put(0x5E);                                 // pop si
  j8(0xEB, 'rr_check');                      // jmp rr_check
  lab('rr_chs');
  put(0x8E, 0xC7);                           // mov es, di
  put(0x31, 0xDB);                           // xor bx, bx
  put(0x8B, 0x0E); put16(0x7DF4);            // mov cx, [7DF4]
  put(0x8A, 0x36); put16(0x7DF6);            // mov dh, [7DF6]
  put(0xA0); put16(0x7DF8);                  // mov al, [7DF8]
  put(0xB4, 0x02);                           // mov ah, 02h
  put(0xCD, 0x13);                           // int 13h
  lab('rr_check');
  j8(0x73, 'rr_ok');                         // jnc rr_ok
  put(0x31, 0xC0);                           // xor ax, ax
  put(0x8A, 0x16); put16(0x7DFC);            // mov dl, [7DFC]
  put(0xCD, 0x13);                           // int 13h (reset)
  put(0xFE, 0x0E); put16(0x7DFA);            // dec byte [7DFA]
  j8(0x75, 'rr_retry');                      // jnz rr_retry
  put(0xB8); put16(0x0E45);                  // mov ax, 0E45h ('E')
  put(0x31, 0xDB);                           // xor bx, bx
  put(0xCD, 0x10);                           // int 10h
  put(0xFA, 0xF4);                           // cli; hlt
  lab('rr_ok');
  put(0xA1); put16(0x7DF8);                  // mov ax, [7DF8]
  put(0x01, 0xC6);                           // add si, ax
  put(0x29, 0xC5);                           // sub bp, ax
  put(0xC1, 0xE0, 0x05);                     // shl ax, 5
  put(0x01, 0xC7);                           // add di, ax
  j16(0xE9, 'rr_loop');                      // jmp near rr_loop
  lab('rr_done');
  put(0xC3);                                 // ret

  for (const [at, n, size] of fx) {
    const rel = L[n] - (at + size);
    if (size === 1) {
      if (rel < -128 || rel > 127) throw new Error(`Stage 1 short jump to ${n} out of range (${rel})`);
      b[at] = rel & 0xFF;
    } else {
      dv.setInt16(at, rel, true);
    }
  }
  if (p > 0x180) throw new Error(`Stage 1 code overflows into the boot banner (${p} > 0x180)`);
  b.readRangeAddr = 0x7C00 + L.read_range;

  // Offset 0x180 (phys 0x7D80): 16-byte Boot Banner String
  for (let i = 0; i < 16; i++) {
    b[0x180 + i] = i < customBanner.length ? (customBanner.charCodeAt(i) & 0xFF) : 0;
  }

  // AUDIT FIX (Kehai, 2026-11-10): the GDT used to live at 0x1A0..0x1CF, on top of the MBR
  // partition table (entry 1 status byte was 0xCF). Older BIOSes reject a USB stick whose
  // partition status bytes aren't 0x00/0x80, so the table is now all zeros (a classic
  // "superfloppy" with a FAT12 BPB) and the GDT lives in Stage 2 at 0x7F00.
  // Boot sector signature 0xAA55
  b[510] = 0x55;
  b[511] = 0xAA;
  return b;
}

function buildStage2Loader(pmBiosWriteRetAddr, readRangeAddr = buildBootSector().readRangeAddr) {
  const b = new Uint8Array(512);
  const dv = new DataView(b.buffer);
  let p = 0;
  const put = (...arr) => { for (const v of arr) b[p++] = v & 0xFF; };
  const put16 = (v) => { b[p++] = v & 0xFF; b[p++] = (v >>> 8) & 0xFF; };
  const put32 = (v) => {
    b[p++] = v & 0xFF; b[p++] = (v >>> 8) & 0xFF;
    b[p++] = (v >>> 16) & 0xFF; b[p++] = (v >>> 24) & 0xFF;
  };

  // Stage 2 entry at 0x7E00:
  // 1. Load 32-bit Protected Mode Core: Sectors 2..31 (SI=2, BP=30) to ES=0x0800 (phys 0x00008000)
  put(0xBE); put16(2);               // mov si, 2
  put(0xBD); put16(30);              // mov bp, 30
  put(0xBF); put16(0x0800);          // mov di, 0x0800
  const call1Pos = p;
  put(0xE8); put16(0);               // call rm_read_lba_range (patched below)

  // 2. Load 480 KB Unified Image: Sectors 0..959 (SI=0, BP=960) to ES=0x1000 (phys 0x00010000..0x00087FFF)
  put(0x31, 0xF6);                   // xor si, si
  put(0xBD); put16(960);             // mov bp, 960
  put(0xBF); put16(0x1000);          // mov di, 0x1000
  const call2Pos = p;
  put(0xE8); put16(0);               // call rm_read_lba_range (patched below)

  // 3. Query VBE ModeInfoBlock into 0000:5000 for 0x0112; if bpp != 32, try 0x0142; if 0x0142 fails, re-query 0x0112 (24-bpp)
  put(0x31, 0xC0);                   // xor ax, ax
  put(0x8E, 0xC0);                   // mov es, ax
  put(0xB9); put16(0x0112);          // mov cx, 0x0112
  put(0xBF); put16(0x5000);          // mov di, 0x5000
  put(0xB8); put16(0x4F01);          // mov ax, 0x4F01
  put(0xCD, 0x10);                   // int 10h
  put(0x80, 0x3E); put16(0x5019); put(32); // cmp byte [0x5019], 32
  const jeMode1 = p + 1;
  put(0x74, 0);                      // je vbe_set_mode
  put(0xB9); put16(0x0142);          // mov cx, 0x0142
  put(0xB8); put16(0x4F01);          // mov ax, 0x4F01
  put(0xCD, 0x10);                   // int 10h
  put(0x3D); put16(0x004F);          // cmp ax, 0x004F
  const jeMode2 = p + 1;
  put(0x74, 0);                      // je vbe_set_mode
  put(0xB9); put16(0x0112);          // mov cx, 0x0112 (fallback to 24-bpp 0x0112)
  put(0xB8); put16(0x4F01);          // mov ax, 0x4F01
  put(0xCD, 0x10);                   // int 10h
  // vbe_set_mode:
  b[jeMode1] = (p - (jeMode1 + 1)) & 0xFF;
  b[jeMode2] = (p - (jeMode2 + 1)) & 0xFF;
  put(0xB8); put16(0x4F02);          // mov ax, 0x4F02
  put(0x89, 0xCB);                   // mov bx, cx
  put(0x80, 0xCF, 0x40);             // or bh, 0x40 (LFB)
  put(0xCD, 0x10);                   // int 10h

  // 4. Enable A20 line (Port 0x92)
  put(0xFA);                         // cli
  put(0xE4, 0x92);                   // in al, 0x92
  put(0x0C, 0x02);                   // or al, 2
  put(0xE6, 0x92);                   // out 0x92, al

  // 5. Build 4MB PSE Page Directory at 0x00006000
  put(0x31, 0xC0);                   // xor ax, ax
  put(0x8E, 0xC0);                   // mov es, ax
  put(0xBF); put16(0x6000);          // mov di, 0x6000
  put(0xB9); put16(2048);            // mov cx, 2048 words
  put(0xFC);                         // cld
  put(0xF3, 0xAB);                   // rep stosw
  // Map first 64 MB identity (entries 0..15)
  put(0x66, 0xB8); put32(0x00000083);// mov eax, 0x83 (Present | RW | PS)
  put(0xBF); put16(0x6000);
  put(0xB9); put16(16);
  const pdeLoop = p;
  put(0x66, 0x26, 0x89, 0x05);
  put(0x66, 0x05); put32(0x00400000);
  put(0x83, 0xC7, 0x04);
  put(0xE2, (pdeLoop - (p + 2)) & 0xFF);
  // Map VBE LFB PhysBasePtr ([0x5028]) at virtual 0xE0000000 (PDE 896 at 0x6E00)
  put(0xBF); put16(0x6E00);
  put(0x66, 0xA1); put16(0x5028);    // mov eax, [0x5028]
  put(0x66, 0x25); put32(0xFFC00000);
  put(0x0C, 0x83);
  put(0x66, 0x26, 0x89, 0x05);
  put(0x66, 0x05); put32(0x00400000);
  put(0x66, 0x26, 0x89, 0x45, 0x04);

  // 6. Load GDTR, CR3, CR4.PSE, CR0 (PG | PE), and far jump to 0x0008:0x00008000
  put(0x0F, 0x01, 0x16); put16(0x7F00); // lgdt [0x7F00]
  put(0x66, 0xB8); put32(0x00006000);   // mov eax, 0x6000
  put(0x0F, 0x22, 0xD8);                // mov cr3, eax
  put(0x0F, 0x20, 0xE0);                // mov eax, cr4
  put(0x66, 0x83, 0xC8, 0x10);          // or eax, 0x10 (PSE)
  put(0x0F, 0x22, 0xE0);                // mov cr4, eax
  put(0x0F, 0x20, 0xC0);                // mov eax, cr0
  put(0x66, 0x0D); put32(0x80000001);   // or eax, 0x80000001 (PG | PE)
  put(0x0F, 0x22, 0xC0);                // mov cr0, eax
  put(0x66, 0xEA); put32(0x00008000); put16(0x0008);

  // AUDIT FIX (Kehai, 2026-11-10): both loads above call Stage 1's read_range, which
  // handles LBA/CHS, BIOS-reported geometry, track and 64 KB DMA boundaries.
  dv.setInt16(call1Pos + 1, (readRangeAddr - 0x7E00) - (call1Pos + 3), true);
  dv.setInt16(call2Pos + 1, (readRangeAddr - 0x7E00) - (call2Pos + 3), true);

  if (p > 0x0100) throw new Error(`Stage 2 loader overflows into the GDT (${p} > 0x100)`);

  // Offset 0x100 (phys 0x7F00): GDTR (6 bytes) + 5 GDT descriptors at 0x7F08 (40 bytes)
  dv.setUint16(0x100, 39, true);
  dv.setUint32(0x102, 0x00007F08, true);
  // 0x08: 32-bit Code segment (base 0, limit 4GB, 0x9A, 0xCF)
  b.set([0xFF, 0xFF, 0x00, 0x00, 0x00, 0x9A, 0xCF, 0x00], 0x108 + 8);
  // 0x10: 32-bit Data segment (base 0, limit 4GB, 0x92, 0xCF)
  b.set([0xFF, 0xFF, 0x00, 0x00, 0x00, 0x92, 0xCF, 0x00], 0x108 + 16);
  // 0x18: 16-bit Code segment (base 0, limit 64KB, 0x9A, 0x00)
  b.set([0xFF, 0xFF, 0x00, 0x00, 0x00, 0x9A, 0x00, 0x00], 0x108 + 24);
  // 0x20: 16-bit Data segment (base 0, limit 64KB, 0x92, 0x00)
  b.set([0xFF, 0xFF, 0x00, 0x00, 0x00, 0x92, 0x00, 0x00], 0x108 + 32);

  // --------------------------------------------------------------------------
  // Offset 0x0140 (phys 0x7F40): Real-Mode BIOS INT 13h AH=03h Write Thunk
  // Entered via jmp 0x0018:0x7F40 with CR0.PG=0, sector in 0x5800, LBA in [0x57FC]
  // --------------------------------------------------------------------------
  p = 0x0140;
  put(0xB8); put16(0x0020);          // mov ax, 0x0020 (16-bit data seg)
  put(0x8E, 0xD8);                   // mov ds, ax
  put(0x8E, 0xC0);                   // mov es, ax
  put(0x8E, 0xD0);                   // mov ss, ax
  put(0x66, 0xB8); put32(0x00000010);// mov eax, 0x10 (clear PE)
  put(0x0F, 0x22, 0xC0);             // mov cr0, eax
  const realEntryOff = 0x7E00 + p + 5;
  put(0xEA); put16(realEntryOff); put16(0x0000); // jmp 0x0000:realEntryOff

  // Now in 16-bit Real Mode!
  put(0x31, 0xC0);                   // xor ax, ax
  put(0x8E, 0xD8);                   // mov ds, ax
  put(0x8E, 0xC0);                   // mov es, ax
  put(0x8E, 0xD0);                   // mov ss, ax
  put(0xBC); put16(0x7C00);          // mov sp, 0x7C00
  put(0x0F, 0x01, 0x1E); put16(0x7FF0); // lidt [0x7FF0] (Real-Mode IVT)

  // Compute CHS from LBA at [0x57FC]
  put(0xA1); put16(0x57FC);          // mov ax, [0x57FC]
  put(0x8A, 0x1E); put16(0x7D90);    // mov bl, [0x7D90] (sectors per track, saved by stage 1)
  put(0xF6, 0xF3);                   // div bl -> al = track, ah = sect - 1
  put(0x88, 0xE1);                   // mov cl, ah
  put(0xFE, 0xC1);                   // inc cl
  put(0x30, 0xE4);                   // xor ah, ah
  put(0xF6, 0x36); put16(0x7D91);    // div byte [0x7D91] -> al = cyl, ah = head
  put(0x88, 0xE6);                   // mov dh, ah
  put(0x88, 0xC5);                   // mov ch, al

  put(0xBE); put16(3);               // mov si, 3 retries
  const wrRetry = p;
  // AUDIT FIX (Kehai, 2026-11-10): on a hard-disk/USB boot with INT 13h extensions, write by
  // LBA (AH=43h) like Stage 1 reads; BIOS-invented CHS geometry would hit the wrong sector.
  put(0x8A, 0x16); put16(0x7DFC);    // mov dl, [0x7DFC]
  put(0x80, 0x3E); put16(0x7D92); put(0); // cmp byte [0x7D92], 0
  const jeChsWr = p + 1;
  put(0x74, 0);                      // je chs_write
  put(0x56);                         // push si (retry counter)
  put(0x31, 0xC0);                   // xor ax, ax
  put(0x50, 0x50, 0x50);             // push ax x3 (LBA bits 16..63)
  put(0xFF, 0x36); put16(0x57FC);    // push word [0x57FC] (LBA bits 0..15)
  put(0x50);                         // push ax (segment 0)
  put(0x68); put16(0x5800);          // push 0x5800 (offset)
  put(0x6A, 0x01);                   // push 1 (count)
  put(0x6A, 0x10);                   // push 0x10 (packet size)
  put(0x89, 0xE6);                   // mov si, sp
  put(0xB8); put16(0x4300);          // mov ax, 0x4300 (extended write, no verify)
  put(0xCD, 0x13);                   // int 13h
  put(0x5B, 0x5B, 0x5B, 0x5B, 0x5B, 0x5B, 0x5B, 0x5B); // pop bx x8 (keeps CF)
  put(0x5E);                         // pop si
  const jmpWrCheck = p + 1;
  put(0xEB, 0);                      // jmp wr_check
  b[jeChsWr] = (p - (jeChsWr + 1)) & 0xFF;
  // chs_write:
  put(0xBB); put16(0x5800);          // mov bx, 0x5800
  put(0xB8); put16(0x0301);          // mov ax, 0x0301 (write 1 sector)
  put(0xCD, 0x13);                   // int 13h
  b[jmpWrCheck] = (p - (jmpWrCheck + 1)) & 0xFF;
  // wr_check:
  const jncWrPos = p + 1;
  put(0x73, 0);                      // jnc wr_ok
  put(0x31, 0xC0);                   // xor ax, ax
  put(0x8A, 0x16); put16(0x7DFC);    // mov dl, [0x7DFC]
  put(0xCD, 0x13);                   // int 13h
  put(0x4E);                         // dec si
  put(0x75, (wrRetry - (p + 2)) & 0xFF);
  // wr_ok: return to 32-bit Protected Mode with Paging!
  b[jncWrPos] = (p - (jncWrPos + 1)) & 0xFF;
  put(0x0F, 0x01, 0x16); put16(0x7F00); // lgdt [0x7F00]
  put(0x66, 0xB8); put32(0x00006000);   // mov eax, 0x6000
  put(0x0F, 0x22, 0xD8);                // mov cr3, eax
  put(0x66, 0xB8); put32(0x80000011);   // mov eax, 0x80000011 (PG | PE | ET)
  put(0x0F, 0x22, 0xC0);                // mov cr0, eax
  put(0x66, 0xEA); put32(pmBiosWriteRetAddr >>> 0); put16(0x0008);

  if (p > 0x1F0) throw new Error(`BIOS write thunk overflows into the IDTRs (${p} > 0x1F0)`);
  // Offset 0x01F0 (phys 0x7FF0): Real-Mode IDTR (limit 0x03FF, base 0x00000000)
  dv.setUint16(0x1F0, 0x03FF, true);
  dv.setUint32(0x1F2, 0x00000000, true);
  // Offset 0x01F8 (phys 0x7FF8): Protected-Mode IDTR (limit 383, base 0x00006800)
  dv.setUint16(0x1F8, 383, true);
  dv.setUint32(0x1FA, 0x00006800, true);

  return b;
}

function buildProtectedModeCore() {
  const x = new X86Builder(0x00008000);
  x.orRegImm32 = (reg, imm) => { x.u8(0x81); x.modrm(3, 1, reg); x.u32(imm); };

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
  const ADDR_HAS_SNET    = 0x7030;
  const ADDR_HAS_FDC     = 0x7034;

  // ==========================================================================
  // 1. 32-Bit Protected Mode Entry (0x00008000)
  // ==========================================================================
  x.label("pm_entry");
  x.cli();
  x.cld();
  x.movRegImm32(R.EAX, 0x0010);
  x.u8(0x8E); x.u8(0xD8); // mov ds, ax
  x.u8(0x8E); x.u8(0xC0); // mov es, ax
  x.u8(0x8E); x.u8(0xD0); // mov ss, ax
  x.u8(0x8E); x.u8(0xE0); // mov fs, ax
  x.u8(0x8E); x.u8(0xE8); // mov gs, ax
  x.movRegImm32(R.ESP, 0x00098000);

  // Detect PS/2 controller (port 0x64 != 0xFF) and enable auxiliary mouse
  x.inAlImm8(0x64);
  x.andRegImm32(R.EAX, 0xFF);
  x.cmpRegImm32(R.EAX, 0xFF);
  x.jeLabel("skip_ps2_init");
  x.movRegImm32(R.EAX, 0xA8); x.outImm8Al(0x64);
  x.movRegImm32(R.EAX, 0xD4); x.outImm8Al(0x64);
  x.movRegImm32(R.EAX, 0xF4); x.outImm8Al(0x60);
  x.inAlImm8(0x60);
  x.label("skip_ps2_init");

  // Detect StudioNet presence (port 0x02A0 == 0x4E53 'SN')
  x.xorRegReg32(R.EBX, R.EBX);
  x.movMemImm32(R.EBX, ADDR_HAS_SNET, 0);
  x.movRegImm32(R.EDX, 0x02A0);
  x.xorRegReg32(R.EAX, R.EAX);
  x.inAxDx();
  x.cmpRegImm32(R.EAX, 0x4E53);
  x.jneLabel("no_snet_card");
  x.movMemImm32(R.EBX, ADDR_HAS_SNET, 1);
  x.label("no_snet_card");

  // Detect 82077AA FDC presence (port 0x03F4 != 0xFF)
  x.movMemImm32(R.EBX, ADDR_HAS_FDC, 0);
  x.movRegImm32(R.EDX, 0x03F4);
  x.xorRegReg32(R.EAX, R.EAX);
  x.inAlDx();
  x.andRegImm32(R.EAX, 0xFF);
  x.cmpRegImm32(R.EAX, 0xFF);
  x.jeLabel("no_fdc_chip");
  x.movMemImm32(R.EBX, ADDR_HAS_FDC, 1);
  x.label("no_fdc_chip");
  // AUDIT FIX (Kehai, 2026-11-10): only save through the FDC when we booted from a floppy.
  // Booted from a USB stick or hard disk (boot drive >= 0x80, saved by Stage 1 at 0x7DFC),
  // a present-but-empty FDC would swallow every save; use the BIOS thunk on the boot drive.
  x.movRegMem32(R.EAX, R.EBX, 0x7DFC);
  x.andRegImm32(R.EAX, 0xFF);
  x.cmpRegImm32(R.EAX, 0x80);
  x.jlLabel("fdc_boot_ok");
  x.movMemImm32(R.EBX, ADDR_HAS_FDC, 0);
  x.label("fdc_boot_ok");

  // Reprogram 8259A Master & Slave PICs (vectors 0x20..0x27 and 0x28..0x2F, unmask IRQ0 timer)
  x.movRegImm32(R.EAX, 0x11); x.outImm8Al(0x20); x.outImm8Al(0xA0);
  x.movRegImm32(R.EAX, 0x20); x.outImm8Al(0x21);
  x.movRegImm32(R.EAX, 0x28); x.outImm8Al(0xA1);
  x.movRegImm32(R.EAX, 0x04); x.outImm8Al(0x21);
  x.movRegImm32(R.EAX, 0x02); x.outImm8Al(0xA1);
  x.movRegImm32(R.EAX, 0x01); x.outImm8Al(0x21); x.outImm8Al(0xA1);
  x.movRegImm32(R.EAX, 0xFE); x.outImm8Al(0x21); // unmask IRQ0 (timer)
  x.movRegImm32(R.EAX, 0xFF); x.outImm8Al(0xA1);

  // Reprogram 8254 PIT Channel 0 for 100 Hz (divisor 11931 = 0x2E9B)
  x.movRegImm32(R.EAX, 0x36); x.outImm8Al(0x43);
  x.movRegImm32(R.EAX, 0x9B); x.outImm8Al(0x40);
  x.movRegImm32(R.EAX, 0x2E); x.outImm8Al(0x40);

  // Build 48-entry Protected-Mode IDT at 0x00006800 (vectors 0x00..0x2F)
  x.movRegLabel32(R.EAX, "isr_default");
  x.movRegReg32(R.EBX, R.EAX);
  x.andRegImm32(R.EAX, 0xFFFF);
  x.orRegImm32(R.EAX, 0x00080000); // selector 0x0008 << 16 | offset_lo
  x.andRegImm32(R.EBX, 0xFFFF0000);
  x.orRegImm32(R.EBX, 0x00008E00); // 32-bit interrupt gate DPL=0, P=1
  x.movRegImm32(R.EDI, 0x00006800);
  x.movRegImm32(R.ECX, 48);
  x.label("idt_fill_loop");
  x.movMemReg32(R.EDI, 0, R.EAX);
  x.movMemReg32(R.EDI, 4, R.EBX);
  x.addRegImm32(R.EDI, 8);
  x.subRegImm32(R.ECX, 1);
  x.jneLabel("idt_fill_loop");

  // Install IRQ0 Timer ISR at vector 0x20 (0x00006800 + 0x20*8 = 0x00006900)
  x.movRegLabel32(R.EAX, "isr_irq0_timer");
  x.movRegReg32(R.EBX, R.EAX);
  x.andRegImm32(R.EAX, 0xFFFF);
  x.orRegImm32(R.EAX, 0x00080000);
  x.andRegImm32(R.EBX, 0xFFFF0000);
  x.orRegImm32(R.EBX, 0x00008E00);
  x.movRegImm32(R.EDI, 0x00006900);
  x.movMemReg32(R.EDI, 0, R.EAX);
  x.movMemReg32(R.EDI, 4, R.EBX);

  // Load Protected-Mode IDTR from [0x7FF8]
  x.u8(0x0F); x.u8(0x01); x.u8(0x1D); x.u32(0x00007FF8); // lidt [0x7FF8]

  // Copy 480 KB disk image from 0x00010000 to 0x00400000 (vmRam[0x200000])
  x.movRegImm32(R.ESI, 0x00010000);
  x.movRegImm32(R.EDI, 0x00400000);
  x.movRegImm32(R.ECX, (480 * 1024) >>> 2);
  x.repMovsd();

  // Entry point for warm VM reboot (when vmRam[0x200000] already holds updated image)
  x.label("vm_warm_boot");
  x.cli();
  // Clear vmRam[0x000000..0x1FFFFF] (0x00200000..0x003FFFFF)
  x.xorRegReg32(R.EAX, R.EAX);
  x.movRegImm32(R.EDI, 0x00200000);
  x.movRegImm32(R.ECX, (2 * 1024 * 1024) >>> 2);
  x.repStosd();

  // Copy 128 KB bootable SPIR bytecode from 0x00408000 (Sectors 64..319) to 0x00200000 (vmRam[0])
  x.movRegImm32(R.ESI, 0x00408000);
  x.movRegImm32(R.EDI, 0x00200000);
  x.movRegImm32(R.ECX, (128 * 1024) >>> 2);
  x.repMovsd();

  // Copy 16-byte boot banner from mounted Sector 0 offset 0x180 (0x00400180) to vmRam[0x0FFD80] (0x002FFD80)
  x.movRegImm32(R.ESI, 0x00400180);
  x.movRegImm32(R.EDI, 0x002FFD80);
  x.movRegImm32(R.ECX, 4);
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

  // Write Machine ID = 2 (Hummingbird) at vmRam[0x0FFD1C], StudioNet flag at vmRam[0x0FFD30], and mouse pos
  x.movMemImm32(R.EBP, 0x0FFD1C, 2);
  x.movMemImm32(R.EBP, 0x0FFD08, 160);
  x.movMemImm32(R.EBP, 0x0FFD0C, 100);
  x.movRegMem32(R.EAX, R.EBX, ADDR_HAS_SNET);
  x.movMemReg32(R.EBP, 0x0FFD30, R.EAX);

  // Write sentinel return frame at vmRam[0x170000]: [-1, 0x00100000]
  x.movMemImm32(R.EBP, 0x170000, -1);
  x.movMemImm32(R.EBP, 0x170004, 0x00100000);

  // Check SPIR magic (0x52495053) at vmRam[0]
  x.movRegMem32(R.EAX, R.EBP, 0);
  x.cmpRegImm32(R.EAX, 0x52495053);
  x.jeLabel("has_spir_hdr");
  x.xorRegReg32(R.ESI, R.ESI); // ESI = VM_PC = 0
  x.jmpLabel("init_scheduler");
  x.label("has_spir_hdr");
  x.movRegMem32(R.ESI, R.EBP, 8); // ESI = entry_pc

  // Initialize Preemptive Task Table at 0x002FFE00..0x002FFF1F
  x.label("init_scheduler");
  x.movMemImm32(R.EBP, 0x0FFE00, 1);          // TCB[0].state = 1 (ACTIVE)
  x.movMemReg32(R.EBP, 0x0FFE04, R.ESI);      // TCB[0].vm_pc
  x.movMemReg32(R.EBP, 0x0FFE08, R.EDI);      // TCB[0].vm_sp
  x.movMemImm32(R.EBP, 0x0FFE0C, 0x00100000); // TCB[0].vm_fp
  x.movMemImm32(R.EBP, 0x0FFE10, 0x00170008); // TCB[0].vm_csp
  x.movMemImm32(R.EBP, 0x0FFF00, 0);          // cur_tid = 0
  x.movMemImm32(R.EBP, 0x0FFF04, 1);          // num_active_tids = 1
  x.movMemImm32(R.EBP, 0x0FFF14, 256);        // quantum_countdown = 256
  x.u8(0xFB);                                 // sti (enable hardware IRQ0 timer interrupts!)

  // ==========================================================================
  // 2. Main Spiral VM Fetch-Decode-Execute Loop (with IRQ0 / Quantum Preemption)
  //    EBP = VM_BASE (0x00200000), ESI = VM_PC, EDI = VM_SP
  // ==========================================================================
  x.label("vm_loop");
  x.cmpRegImm32(R.ESI, 0);
  x.jlLabel("vm_task_exit_or_halt");

  // Check hardware IRQ0 preempt_flag ([EBP + 0x0FFF0C]) or quantum_countdown ([EBP + 0x0FFF14])
  x.movRegMem32(R.EAX, R.EBP, 0x0FFF14);
  x.subRegImm32(R.EAX, 1);
  x.movMemReg32(R.EBP, 0x0FFF14, R.EAX);
  x.cmpRegImm32(R.EAX, 0);
  x.jleLabel("vm_do_preempt_check");
  x.movRegMem32(R.EAX, R.EBP, 0x0FFF0C);
  x.cmpRegImm32(R.EAX, 0);
  x.jeLabel("vm_no_preempt");

  x.label("vm_do_preempt_check");
  x.movMemImm32(R.EBP, 0x0FFF0C, 0);   // clear preempt_flag
  x.movMemImm32(R.EBP, 0x0FFF14, 256); // reset quantum_countdown
  x.movRegMem32(R.EAX, R.EBP, 0x0FFF04); // num_active_tids
  x.cmpRegImm32(R.EAX, 1);
  x.jleLabel("vm_no_preempt");

  // Save current task (cur_tid) registers into TCB[cur_tid] at EBP + 0x0FFE00 + cur_tid * 32
  x.movRegMem32(R.ECX, R.EBP, 0x0FFF00); // ECX = cur_tid
  x.movRegReg32(R.EBX, R.ECX);
  x.shlRegImm(R.EBX, 5);
  x.addRegReg32(R.EBX, R.EBP);
  x.addRegImm32(R.EBX, 0x0FFE00);        // EBX = &TCB[cur_tid]
  x.movMemReg32(R.EBX, 4, R.ESI);        // vm_pc
  x.movMemReg32(R.EBX, 8, R.EDI);        // vm_sp
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EAX, R.EDX, ADDR_VM_FP);
  x.movMemReg32(R.EBX, 12, R.EAX);       // vm_fp
  x.movRegMem32(R.EAX, R.EDX, ADDR_VM_CSP);
  x.movMemReg32(R.EBX, 16, R.EAX);       // vm_csp

  // Round-robin scan for next runnable task (ECX = cur_tid)
  x.label("sched_pick_next");
  x.movRegImm32(R.EDX, 8);
  x.label("sched_scan_loop");
  x.addRegImm32(R.ECX, 1);
  x.andRegImm32(R.ECX, 7);
  x.movRegReg32(R.EBX, R.ECX);
  x.shlRegImm(R.EBX, 5);
  x.addRegReg32(R.EBX, R.EBP);
  x.addRegImm32(R.EBX, 0x0FFE00);
  x.movRegMem32(R.EAX, R.EBX, 0);        // TCB.state
  x.cmpRegImm32(R.EAX, 1);
  x.jeLabel("sched_found");
  x.subRegImm32(R.EDX, 1);
  x.jneLabel("sched_scan_loop");
  x.jmpLabel("vm_no_preempt");

  x.label("sched_found");
  x.movMemReg32(R.EBP, 0x0FFF00, R.ECX); // cur_tid = cand
  x.movRegMem32(R.EAX, R.EBP, 0x0FFF10);
  x.addRegImm32(R.EAX, 1);
  x.movMemReg32(R.EBP, 0x0FFF10, R.EAX); // context_switches++
  x.movRegMem32(R.EAX, R.EBX, 20);
  x.addRegImm32(R.EAX, 1);
  x.movMemReg32(R.EBX, 20, R.EAX);       // TCB.ticks++
  x.movRegMem32(R.ESI, R.EBX, 4);        // load VM_PC
  x.movRegMem32(R.EDI, R.EBX, 8);        // load VM_SP
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EAX, R.EBX, 12);
  x.movMemReg32(R.EDX, ADDR_VM_FP, R.EAX);
  x.movRegMem32(R.EAX, R.EBX, 16);
  x.movMemReg32(R.EDX, ADDR_VM_CSP, R.EAX);

  x.label("vm_no_preempt");
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
  // Hardware Interrupt Service Routines (Protected Mode IDT)
  // --------------------------------------------------------------------------
  x.label("isr_default");
  x.u8(0xCF); // iretd

  x.label("isr_irq0_timer");
  x.pushReg32(R.EAX);
  x.pushReg32(R.EDX);
  x.movRegImm32(R.EDX, 0x002FFF00);
  x.movRegMem32(R.EAX, R.EDX, 8);  // irq0_ticks
  x.addRegImm32(R.EAX, 1);
  x.movMemReg32(R.EDX, 8, R.EAX);
  x.movMemImm32(R.EDX, 12, 1);     // preempt_flag = 1
  x.movRegImm32(R.EAX, 0x20);
  x.outImm8Al(0x20);               // Master PIC EOI
  x.popReg32(R.EDX);
  x.popReg32(R.EAX);
  x.u8(0xCF);                      // iretd

  // --------------------------------------------------------------------------
  // Opcode Handlers (0x00 .. 0x27)
  // --------------------------------------------------------------------------

  x.label("op_00_nop");
  x.jmpLabel("vm_loop");

  x.label("op_01_halt");
  x.subRegImm32(R.EDI, 4);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.jmpLabel("vm_halt_with_eax");

  x.label("op_02_push_i16");
  x.movRegReg32(R.EAX, R.EBX);
  x.shlRegImm(R.EAX, 16);
  x.sarRegImm(R.EAX, 16);
  x.movSibReg32(R.EBP, R.EDI, 0, 0, R.EAX);
  x.addRegImm32(R.EDI, 4);
  x.jmpLabel("vm_loop");

  x.label("op_03_push_u16");
  x.movRegReg32(R.EAX, R.EBX);
  x.andRegImm32(R.EAX, 0xFFFF);
  x.movSibReg32(R.EBP, R.EDI, 0, 0, R.EAX);
  x.addRegImm32(R.EDI, 4);
  x.jmpLabel("vm_loop");

  x.label("op_04_push_hi");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, -4);
  x.andRegImm32(R.EAX, 0xFFFF);
  x.movRegReg32(R.ECX, R.EBX);
  x.shlRegImm(R.ECX, 16);
  x.orRegReg32(R.EAX, R.ECX);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX);
  x.jmpLabel("vm_loop");

  x.label("op_05_dup");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, -4);
  x.movSibReg32(R.EBP, R.EDI, 0, 0, R.EAX);
  x.addRegImm32(R.EDI, 4);
  x.jmpLabel("vm_loop");

  x.label("op_06_drop");
  x.subRegImm32(R.EDI, 4);
  x.jmpLabel("vm_loop");

  x.label("op_07_swap");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, -4);
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, -8);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.ECX);
  x.movSibReg32(R.EBP, R.EDI, 0, -8, R.EAX);
  x.jmpLabel("vm_loop");

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

  // 0x0A: GET_GLOBAL (at 0x020000)
  x.label("op_0a_get_global");
  x.movRegReg32(R.ECX, R.EBX);
  x.andRegImm32(R.ECX, 0xFFFF);
  x.movRegSib32(R.EAX, R.EBP, R.ECX, 2, 0x020000);
  x.movSibReg32(R.EBP, R.EDI, 0, 0, R.EAX);
  x.addRegImm32(R.EDI, 4);
  x.jmpLabel("vm_loop");

  // 0x0B: SET_GLOBAL (at 0x020000)
  x.label("op_0b_set_global");
  x.subRegImm32(R.EDI, 4);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.movRegReg32(R.ECX, R.EBX);
  x.andRegImm32(R.ECX, 0xFFFF);
  x.movSibReg32(R.EBP, R.ECX, 2, 0x020000, R.EAX);
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

  // 0x0D: ADDR_GLOBAL (at 0x020000)
  x.label("op_0d_addr_global");
  x.movRegReg32(R.EAX, R.EBX);
  x.andRegImm32(R.EAX, 0xFFFF);
  x.shlRegImm(R.EAX, 2);
  x.addRegImm32(R.EAX, 0x020000);
  x.movSibReg32(R.EBP, R.EDI, 0, 0, R.EAX);
  x.addRegImm32(R.EDI, 4);
  x.jmpLabel("vm_loop");

  function calcLoadAddr() {
    x.movRegReg32(R.ECX, R.EBX);
    x.shlRegImm(R.ECX, 16);
    x.sarRegImm(R.ECX, 16);
    x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, -4);
    x.addRegReg32(R.ECX, R.EAX);
    x.andRegImm32(R.ECX, 0x003FFFFF);
  }

  x.label("op_0e_load8u");
  calcLoadAddr();
  x.movzxRegSib8(R.EAX, R.EBP, R.ECX, 0, 0);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX);
  x.jmpLabel("vm_loop");

  x.label("op_0f_load8s");
  calcLoadAddr();
  x.movsxRegSib8(R.EAX, R.EBP, R.ECX, 0, 0);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX);
  x.jmpLabel("vm_loop");

  x.label("op_10_load16u");
  calcLoadAddr();
  x.movzxRegSib16(R.EAX, R.EBP, R.ECX, 0, 0);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX);
  x.jmpLabel("vm_loop");

  x.label("op_11_load32");
  calcLoadAddr();
  x.movRegSib32(R.EAX, R.EBP, R.ECX, 0, 0);
  x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX);
  x.jmpLabel("vm_loop");

  function calcStoreAddrVal() {
    x.subRegImm32(R.EDI, 8);
    x.movRegReg32(R.EDX, R.EBX);
    x.shlRegImm(R.EDX, 16);
    x.sarRegImm(R.EDX, 16);
    x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 0);
    x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 4);
    x.addRegReg32(R.EDX, R.ECX);
    x.andRegImm32(R.EDX, 0x003FFFFF);
  }

  x.label("op_12_store8");
  calcStoreAddrVal();
  x.movSibReg8(R.EBP, R.EDX, 0, 0, R.AL);
  x.jmpLabel("vm_loop");

  x.label("op_13_store16");
  calcStoreAddrVal();
  x.movSibReg16(R.EBP, R.EDX, 0, 0, R.AX);
  x.jmpLabel("vm_loop");

  x.label("op_14_store32");
  calcStoreAddrVal();
  x.movSibReg32(R.EBP, R.EDX, 0, 0, R.EAX);
  x.jmpLabel("vm_loop");

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

  x.label("op_20_cmp");
  popBinArgs();
  x.movRegReg32(R.EDX, R.EBX);
  x.andRegImm32(R.EDX, 7);
  x.movRegLabel32(R.EBX, "cmp_table");
  x.movRegSib32(R.EDX, R.EBX, R.EDX, 2, 0);
  x.cmpRegReg32(R.EAX, R.ECX);
  x.movRegImm32(R.EAX, 0);
  x.jmpReg32(R.EDX);

  x.label("cmp_0_eq");  x.setccAl(0x94); x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");
  x.label("cmp_1_ne");  x.setccAl(0x95); x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");
  x.label("cmp_2_lt");  x.setccAl(0x9C); x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");
  x.label("cmp_3_le");  x.setccAl(0x9E); x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");
  x.label("cmp_4_gt");  x.setccAl(0x9F); x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");
  x.label("cmp_5_ge");  x.setccAl(0x9D); x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");
  x.label("cmp_6_ult"); x.setccAl(0x92); x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");
  x.label("cmp_7_ugt"); x.setccAl(0x97); x.movSibReg32(R.EBP, R.EDI, 0, -4, R.EAX); x.jmpLabel("vm_loop");

  x.label("op_21_jmp");
  x.movRegReg32(R.ESI, R.EBX);
  x.andRegImm32(R.ESI, 0x00FFFFFF);
  x.jmpLabel("vm_loop");

  x.label("op_22_jz");
  x.subRegImm32(R.EDI, 4);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.cmpRegImm32(R.EAX, 0);
  x.jneLabel("vm_loop");
  x.movRegReg32(R.ESI, R.EBX);
  x.andRegImm32(R.ESI, 0x00FFFFFF);
  x.jmpLabel("vm_loop");

  x.label("op_23_jnz");
  x.subRegImm32(R.EDI, 4);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.cmpRegImm32(R.EAX, 0);
  x.jeLabel("vm_loop");
  x.movRegReg32(R.ESI, R.EBX);
  x.andRegImm32(R.ESI, 0x00FFFFFF);
  x.jmpLabel("vm_loop");

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

  x.label("op_25_enter");
  x.movRegReg32(R.EAX, R.EBX);
  x.shrRegImm(R.EAX, 16);
  x.andRegImm32(R.EAX, 0xFF);
  x.shlRegImm(R.EAX, 2);
  x.movRegReg32(R.ECX, R.EDI);
  x.subRegReg32(R.ECX, R.EAX);
  x.xorRegReg32(R.EDX, R.EDX);
  x.movMemReg32(R.EDX, ADDR_VM_FP, R.ECX);
  x.movRegReg32(R.EAX, R.EBX);
  x.andRegImm32(R.EAX, 0xFFFF);
  x.shlRegImm(R.EAX, 2);
  x.movRegReg32(R.EDI, R.ECX);
  x.addRegReg32(R.EDI, R.EAX);
  x.jmpLabel("vm_loop");

  x.label("op_26_ret");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, -4);
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EDI, R.EDX, ADDR_VM_FP);
  x.movSibReg32(R.EBP, R.EDI, 0, 0, R.EAX);
  x.addRegImm32(R.EDI, 4);
  x.movRegMem32(R.ECX, R.EDX, ADDR_VM_CSP);
  x.subRegImm32(R.ECX, 8);
  x.movMemReg32(R.EDX, ADDR_VM_CSP, R.ECX);
  x.movRegSib32(R.ESI, R.EBP, R.ECX, 0, 0);
  x.movRegSib32(R.EAX, R.EBP, R.ECX, 0, 4);
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
  x.subRegReg32(R.EDI, R.EAX);

  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EAX, R.EDX, ADDR_VM_ICNT);
  x.movMemReg32(R.EBP, 0x0FFD20, R.EAX);

  x.andRegImm32(R.EBX, 0xFFFF);

  for (let s = 0; s <= 21; s++) {
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
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EAX, R.EDX, ADDR_KEY_EVENT);
  x.cmpRegImm32(R.EAX, 0);
  x.jneLabel("ps2_poll_done");
  x.inAlImm8(0x64);
  x.andRegImm32(R.EAX, 0xFF);
  x.cmpRegImm32(R.EAX, 0xFF);
  x.jeLabel("ps2_poll_done");
  x.movRegReg32(R.ECX, R.EAX);
  x.andRegImm32(R.EAX, 0x01);
  x.jeLabel("ps2_poll_done");

  x.inAlImm8(0x60);
  x.andRegImm32(R.EAX, 0xFF);
  x.andRegImm32(R.ECX, 0x20);
  x.jneLabel("ps2_is_mouse");

  x.cmpRegImm32(R.EAX, 0xE0);
  x.jeLabel("ps2_poll_next");
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegReg32(R.EBX, R.EAX);
  x.andRegImm32(R.EBX, 0x7F);
  x.cmpRegImm32(R.EBX, 0x2A);
  x.jeLabel("ps2_shift_key");
  x.cmpRegImm32(R.EBX, 0x36);
  x.jeLabel("ps2_shift_key");

  x.movRegReg32(R.ECX, R.EAX);
  x.andRegImm32(R.ECX, 0x80);
  x.movRegMem32(R.EDX, R.EDX, ADDR_KEY_MODS);
  x.cmpRegImm32(R.EDX, 0);
  x.jneLabel("ps2_use_shift_tbl");
  x.movRegLabel32(R.EDX, "scancode_plain_tbl");
  x.jmpLabel("ps2_lookup_done");
  x.label("ps2_use_shift_tbl");
  x.movRegLabel32(R.EDX, "scancode_shift_tbl");
  x.label("ps2_lookup_done");
  x.movzxRegSib16(R.EBX, R.EDX, R.EBX, 1, 0);
  x.cmpRegImm32(R.ECX, 0);
  x.jneLabel("ps2_poll_next");
  x.orRegImm32(R.EBX, 0x01010000);
  x.xorRegReg32(R.EDX, R.EDX);
  x.movMemReg32(R.EDX, ADDR_KEY_EVENT, R.EBX);
  x.jmpLabel("ps2_poll_done");

  x.label("ps2_shift_key");
  x.xorRegReg32(R.EDX, R.EDX);
  x.andRegImm32(R.EAX, 0x80);
  x.jneLabel("ps2_shift_up");
  x.movMemImm32(R.EDX, ADDR_KEY_MODS, 1);
  x.jmpLabel("ps2_poll_next");
  x.label("ps2_shift_up");
  x.movMemImm32(R.EDX, ADDR_KEY_MODS, 0);
  x.jmpLabel("ps2_poll_next");

  x.label("ps2_is_mouse");
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EBX, R.EDX, ADDR_MOUSE_STAGE);
  x.cmpRegImm32(R.EBX, 0);
  x.jeLabel("ms_stage0");
  x.cmpRegImm32(R.EBX, 1);
  x.jeLabel("ms_stage1");

  x.movMemImm32(R.EDX, ADDR_MOUSE_STAGE, 0);
  x.shlRegImm(R.EAX, 24);
  x.sarRegImm(R.EAX, 24);
  x.movRegMem32(R.ECX, R.EDX, ADDR_MOUSE_Y);
  x.subRegReg32(R.ECX, R.EAX);
  x.cmpRegImm32(R.ECX, 0); x.jgeLabel("ms_y_min_ok"); x.xorRegReg32(R.ECX, R.ECX);
  x.label("ms_y_min_ok");
  x.cmpRegImm32(R.ECX, 199); x.jleLabel("ms_y_max_ok"); x.movRegImm32(R.ECX, 199);
  x.label("ms_y_max_ok");
  x.movMemReg32(R.EDX, ADDR_MOUSE_Y, R.ECX);
  x.movMemReg32(R.EBP, 0x0FFD0C, R.ECX);

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
  // Syscall Implementations (0 .. 21)
  // --------------------------------------------------------------------------

  // SYS 0: EXIT(code)
  x.label("sys_00");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.jmpLabel("vm_halt_with_eax");

  // SYS 1: YIELD() -> 2x scale 320x200x8 vmRam[0x0F0000] into 640x480x32 or 640x480x24 VBE LFB at 0xE0000000
  x.label("sys_01");
  x.callLabel("sub_poll_ps2");
  x.pushReg32(R.ESI);
  x.pushReg32(R.EDI);

  x.movRegMem32(R.EAX, R.EBP, 0x0FFD04);
  x.addRegImm32(R.EAX, 1);
  x.movMemReg32(R.EBP, 0x0FFD04, R.EAX);

  // Build 256-entry 32-bit 0x00RRGGBB lookup table at 0x00007400 from vmRam[0x0FFA00]
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

  // Check VBE BitsPerPixel at 0x00005019 (24 vs 32)
  x.xorRegReg32(R.EBX, R.EBX);
  x.movzxRegMem8(R.EAX, R.EBX, 0x5019);
  x.cmpRegImm32(R.EAX, 24);
  x.jeLabel("blit_24bpp");

  // 32-bpp Blitter (pitch = 2560, y=40 offset = 0xE0019000)
  x.movRegImm32(R.ESI, 0x002F0000);
  x.movRegImm32(R.EDI, 0xE0019000);
  x.movRegImm32(R.EDX, 200);
  x.label("blit_y_loop");
  x.movRegImm32(R.ECX, 320);
  x.label("blit_x_loop");
  x.movzxRegMem8(R.EAX, R.ESI, 0);
  x.xorRegReg32(R.EBX, R.EBX);
  x.movRegSib32(R.EAX, R.EBX, R.EAX, 2, 0x7400);
  x.movMemReg32(R.EDI, 0, R.EAX);
  x.movMemReg32(R.EDI, 4, R.EAX);
  x.movMemReg32(R.EDI, 2560, R.EAX);
  x.movMemReg32(R.EDI, 2564, R.EAX);
  x.addRegImm32(R.ESI, 1);
  x.addRegImm32(R.EDI, 8);
  x.subRegImm32(R.ECX, 1);
  x.jneLabel("blit_x_loop");
  x.addRegImm32(R.EDI, 2560);
  x.subRegImm32(R.EDX, 1);
  x.jneLabel("blit_y_loop");
  x.jmpLabel("blit_done");

  // 24-bpp Blitter (pitch = 1920, y=40 offset = 0xE0000000 + 40*1920 = 0xE0012C00)
  x.label("blit_24bpp");
  x.movRegImm32(R.ESI, 0x002F0000);
  x.movRegImm32(R.EDI, 0xE0012C00);
  x.movRegImm32(R.EDX, 200);
  x.label("blit24_y_loop");
  x.movRegImm32(R.ECX, 320);
  x.label("blit24_x_loop");
  x.movzxRegMem8(R.EAX, R.ESI, 0);
  x.xorRegReg32(R.EBX, R.EBX);
  x.movRegSib32(R.EAX, R.EBX, R.EAX, 2, 0x7400); // AL=B, AH=G, EAX>>16=R
  x.movMemReg8(R.EDI, 0, R.AL);
  x.movMemReg8(R.EDI, 3, R.AL);
  x.movMemReg8(R.EDI, 1920, R.AL);
  x.movMemReg8(R.EDI, 1923, R.AL);
  x.movMemReg8(R.EDI, 1, R.AH);
  x.movMemReg8(R.EDI, 4, R.AH);
  x.movMemReg8(R.EDI, 1921, R.AH);
  x.movMemReg8(R.EDI, 1924, R.AH);
  x.shrRegImm(R.EAX, 16);
  x.movMemReg8(R.EDI, 2, R.AL);
  x.movMemReg8(R.EDI, 5, R.AL);
  x.movMemReg8(R.EDI, 1922, R.AL);
  x.movMemReg8(R.EDI, 1925, R.AL);
  x.addRegImm32(R.ESI, 1);
  x.addRegImm32(R.EDI, 6);
  x.subRegImm32(R.ECX, 1);
  x.jneLabel("blit24_x_loop");
  x.addRegImm32(R.EDI, 1920);
  x.subRegImm32(R.EDX, 1);
  x.jneLabel("blit24_y_loop");

  x.label("blit_done");
  // Trigger preemptive check after frame yield
  x.movMemImm32(R.EBP, 0x0FFF0C, 1);
  x.popReg32(R.EDI);
  x.popReg32(R.ESI);
  x.xorRegReg32(R.EAX, R.EAX);
  x.jmpLabel("sys_push_eax");

  // SYS 2: TIME_MS() -> derive from irq0_ticks * 10 + frame counter * 16 + VM_ICNT / 512
  x.label("sys_02");
  x.movRegMem32(R.EAX, R.EBP, 0x0FFD04);
  x.shlRegImm(R.EAX, 4);
  x.movRegMem32(R.ECX, R.EBP, 0x0FFF08); // irq0_ticks
  x.shlRegImm(R.ECX, 3);
  x.addRegReg32(R.EAX, R.ECX);
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.ECX, R.EDX, ADDR_VM_ICNT);
  x.shrRegImm(R.ECX, 9);
  x.addRegReg32(R.EAX, R.ECX);
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
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 0);
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
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.movRegSib32(R.EBX, R.EBP, R.EDI, 0, 4);
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 8);
  x.movRegSib32(R.EDX, R.EBP, R.EDI, 0, 12);
  x.movRegSib32(R.ESI, R.EBP, R.EDI, 0, 16);

  x.cmpRegImm32(R.EAX, 0); x.jgeLabel("fr5_x_ok");
  x.addRegReg32(R.ECX, R.EAX); x.xorRegReg32(R.EAX, R.EAX);
  x.label("fr5_x_ok");
  x.cmpRegImm32(R.EBX, 0); x.jgeLabel("fr5_y_ok");
  x.addRegReg32(R.EDX, R.EBX); x.xorRegReg32(R.EBX, R.EBX);
  x.label("fr5_y_ok");
  x.movRegReg32(R.EDI, R.EAX); x.addRegReg32(R.EDI, R.ECX);
  x.cmpRegImm32(R.EDI, 320); x.jleLabel("fr5_w_ok");
  x.movRegImm32(R.ECX, 320); x.subRegReg32(R.ECX, R.EAX);
  x.label("fr5_w_ok");
  x.movRegReg32(R.EDI, R.EBX); x.addRegReg32(R.EDI, R.EDX);
  x.cmpRegImm32(R.EDI, 200); x.jleLabel("fr5_h_ok");
  x.movRegImm32(R.EDX, 200); x.subRegReg32(R.EDX, R.EBX);
  x.label("fr5_h_ok");

  x.cmpRegImm32(R.ECX, 0); x.jleLabel("fr5_done");
  x.cmpRegImm32(R.EDX, 0); x.jleLabel("fr5_done");

  x.movRegImm32(R.EDI, 320);
  x.imulRegReg32(R.EBX, R.EDI);
  x.addRegReg32(R.EBX, R.EAX);
  x.addRegImm32(R.EBX, 0x002F0000);
  x.movRegReg32(R.EAX, R.ESI);
  x.movRegReg32(R.ESI, R.ECX);

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
  x.shlRegImm(R.ECX, 3);
  x.addRegImm32(R.ECX, 0x002EF000);
  x.movRegImm32(R.EDI, 320);
  x.imulRegReg32(R.EBX, R.EDI);
  x.addRegReg32(R.EBX, R.EAX);
  x.addRegImm32(R.EBX, 0x002F0000);
  x.movRegReg32(R.EDI, R.EBX);

  x.movRegImm32(R.EBP, 8);
  x.label("dc6_row");
  x.movzxRegMem8(R.EBX, R.ECX, 0);
  x.addRegImm32(R.ECX, 1);
  x.movRegImm32(R.EAX, 128);
  x.label("dc6_bit");
  x.pushReg32(R.EAX);
  x.andRegReg32(R.EAX, R.EBX);
  x.jeLabel("dc6_off");
  x.movMemReg8(R.EDI, 0, R.DL);
  x.jmpLabel("dc6_next");
  x.label("dc6_off");
  x.cmpRegImm32(R.ESI, 0);
  x.jlLabel("dc6_next");
  x.movRegReg32(R.EAX, R.ESI);
  x.movMemReg8(R.EDI, 0, R.AL);
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
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.movRegSib32(R.EBX, R.EBP, R.EDI, 0, 4);
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 8);
  x.addRegReg32(R.ECX, R.EBP);
  x.movRegSib32(R.EDX, R.EBP, R.EDI, 0, 12);
  x.movRegSib32(R.ESI, R.EBP, R.EDI, 0, 16);
  x.movRegReg32(R.EDI, R.ECX);

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
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.movRegSib32(R.ESI, R.EBP, R.EDI, 0, 4);
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 8);
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
  x.movRegSib32(R.EBX, R.EBP, R.EDI, 0, 0);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 4);
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 8);
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
  // Uses 8237 DMA + 82077AA FDC when ADDR_HAS_FDC == 1, or falls back to
  // 16-bit Real-Mode BIOS INT 13h AH=03h thunk at 0x7F40 when ADDR_HAS_FDC == 0!
  x.label("sys_10");
  x.pushReg32(R.ESI);
  x.pushReg32(R.EDI);
  x.movRegSib32(R.EBX, R.EBP, R.EDI, 0, 0); // EBX = current LBA
  x.movRegSib32(R.EDX, R.EBP, R.EDI, 0, 4); // EDX = remaining sectors

  // Check if FDC is present
  x.xorRegReg32(R.ECX, R.ECX);
  x.movRegMem32(R.EAX, R.ECX, ADDR_HAS_FDC);
  x.cmpRegImm32(R.EAX, 0);
  x.jeLabel("bios_sync_loop");

  x.label("fdc_sync_loop");
  x.cmpRegImm32(R.EDX, 0);
  x.jleLabel("fdc_sync_done");
  x.pushReg32(R.EDX);

  x.movRegReg32(R.ESI, R.EBX);
  x.shlRegImm(R.ESI, 9);
  x.addRegImm32(R.ESI, 0x00400000);
  x.movRegImm32(R.EDI, 0x00010000);
  x.movRegImm32(R.ECX, 128);
  x.repMovsd();

  x.movRegImm32(R.EAX, 0x06); x.outImm8Al(0x0A);
  x.movRegImm32(R.EAX, 0x00); x.outImm8Al(0x0C);
  x.movRegImm32(R.EAX, 0x4A); x.outImm8Al(0x0B);
  x.movRegImm32(R.EAX, 0x00); x.outImm8Al(0x04);
  x.movRegImm32(R.EAX, 0x00); x.outImm8Al(0x04);
  x.movRegImm32(R.EAX, 0x01); x.outImm8Al(0x81);
  x.movRegImm32(R.EAX, 0xFF); x.outImm8Al(0x05);
  x.movRegImm32(R.EAX, 0x01); x.outImm8Al(0x05);
  x.movRegImm32(R.EAX, 0x02); x.outImm8Al(0x0A);

  x.movRegReg32(R.EAX, R.EBX);
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegImm32(R.ECX, 18);
  x.divReg32(R.ECX);
  x.addRegImm32(R.EDX, 1);
  x.movRegReg32(R.ECX, R.EAX);
  x.andRegImm32(R.ECX, 1);
  x.shrRegImm(R.EAX, 1);
  x.movRegReg32(R.ESI, R.EAX);
  x.movRegReg32(R.EDI, R.EDX);

  const fdcOut = (regOrImm, isReg = false) => {
    x.movRegImm32(R.EDX, 0x03F5);
    if (!isReg) x.movRegImm32(R.EAX, regOrImm);
    else if (regOrImm !== R.EAX) x.movRegReg32(R.EAX, regOrImm);
    x.outDxAl();
  };
  fdcOut(0xC5);
  x.movRegReg32(R.EAX, R.ECX); x.shlRegImm(R.EAX, 2); fdcOut(R.EAX, true);
  fdcOut(R.ESI, true);
  fdcOut(R.ECX, true);
  fdcOut(R.EDI, true);
  fdcOut(0x02);
  fdcOut(18);
  fdcOut(0x1B);
  fdcOut(0xFF);

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

  // BIOS INT 13h AH=03h Real-Mode Thunk Loop (when no FDC is present)
  x.label("bios_sync_loop");
  x.cmpRegImm32(R.EDX, 0);
  x.jleLabel("fdc_sync_done");
  // Copy 1 sector (512B) from 0x00400000 + EBX*512 to bounce buffer 0x00005800
  x.movRegReg32(R.ESI, R.EBX);
  x.shlRegImm(R.ESI, 9);
  x.addRegImm32(R.ESI, 0x00400000);
  x.movRegImm32(R.EDI, 0x00005800);
  x.movRegImm32(R.ECX, 128);
  x.repMovsd();
  // Save LBA at [0x57FC], remaining EDX at [0x57F8], ESP at [0x57F4]
  x.xorRegReg32(R.ECX, R.ECX);
  x.movMemReg32(R.ECX, 0x57FC, R.EBX);
  x.movMemReg32(R.ECX, 0x57F8, R.EDX);
  x.movMemReg32(R.ECX, 0x57F4, R.ESP);
  // Disable interrupts, clear CR0.PG, far jump to 0x0018:0x7F40
  x.cli();
  x.movRegImm32(R.EAX, 0x00000011); // PE=1, PG=0
  x.u8(0x0F); x.u8(0x22); x.u8(0xC0); // mov cr0, eax
  x.u8(0xEA); x.u32(0x00007F40); x.u16(0x0018); // jmp 0x0018:0x00007F40

  x.label("pm_bios_write_ret");
  x.movRegImm32(R.EAX, 0x0010);
  x.u8(0x8E); x.u8(0xD8);
  x.u8(0x8E); x.u8(0xC0);
  x.u8(0x8E); x.u8(0xD0);
  x.u8(0x8E); x.u8(0xE0);
  x.u8(0x8E); x.u8(0xE8);
  x.xorRegReg32(R.ECX, R.ECX);
  x.movRegMem32(R.ESP, R.ECX, 0x57F4);
  x.movRegMem32(R.EDX, R.ECX, 0x57F8);
  x.movRegMem32(R.EBX, R.ECX, 0x57FC);
  x.movRegImm32(R.EBP, 0x00200000);
  x.u8(0x0F); x.u8(0x01); x.u8(0x1D); x.u32(0x00007FF8); // lidt [0x7FF8]
  x.u8(0xFB); // sti
  x.addRegImm32(R.EBX, 1);
  x.subRegImm32(R.EDX, 1);
  x.jmpLabel("bios_sync_loop");

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

  // SYS 12: NET_SEND(buf_ptr, len) -> StudioNet ports 0x02A0..0x02AF (if present)
  x.label("sys_12");
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EAX, R.EDX, ADDR_HAS_SNET);
  x.cmpRegImm32(R.EAX, 0);
  x.jeLabel("net_rx_empty");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.addRegReg32(R.EAX, R.EBP);
  x.movRegImm32(R.EDX, 0x02A8);
  x.outDxEax();
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 4);
  x.movRegImm32(R.EDX, 0x02A6);
  x.outDxAx();
  x.movRegImm32(R.EAX, 0x01);
  x.movRegImm32(R.EDX, 0x02A2);
  x.outDxAl();
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 4);
  x.jmpLabel("sys_push_eax");

  // SYS 13: NET_RECV(buf_ptr, max_len)
  x.label("sys_13");
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EAX, R.EDX, ADDR_HAS_SNET);
  x.cmpRegImm32(R.EAX, 0);
  x.jeLabel("net_rx_empty");
  x.movRegImm32(R.EDX, 0x02A2);
  x.inAlDx();
  x.andRegImm32(R.EAX, 0x01);
  x.jeLabel("net_rx_empty");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.addRegReg32(R.EAX, R.EBP);
  x.movRegImm32(R.EDX, 0x02A8);
  x.outDxEax();
  x.movRegImm32(R.EAX, 0x02);
  x.movRegImm32(R.EDX, 0x02A2);
  x.outDxAl();
  x.movRegImm32(R.EDX, 0x02A6);
  x.xorRegReg32(R.EAX, R.EAX);
  x.inAxDx();
  x.jmpLabel("sys_push_eax");
  x.label("net_rx_empty");
  x.xorRegReg32(R.EAX, R.EAX);
  x.jmpLabel("sys_push_eax");

  // SYS 14: NET_INFO(cmd, val)
  x.label("sys_14");
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.EAX, R.EDX, ADDR_HAS_SNET);
  x.cmpRegImm32(R.EAX, 0);
  x.jeLabel("net_rx_empty");
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 0);
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
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 0);
  x.cmpRegImm32(R.ECX, 20);
  x.jlLabel("snd_mute");
  x.movRegImm32(R.EAX, 1193182);
  x.xorRegReg32(R.EDX, R.EDX);
  x.divReg32(R.ECX);
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

  // SYS 16: MACHINE_INFO(query) -> 0: machineId(2), 1: vmRamSize(4MB), 2: icnt, 3: nodeId(0x0201), 4: hasSnet
  x.label("sys_16");
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 0);
  x.cmpRegImm32(R.ECX, 0); x.jeLabel("mi16_0");
  x.cmpRegImm32(R.ECX, 1); x.jeLabel("mi16_1");
  x.cmpRegImm32(R.ECX, 2); x.jeLabel("mi16_2");
  x.cmpRegImm32(R.ECX, 4); x.jeLabel("mi16_4");
  x.movRegImm32(R.EAX, 0x0201); x.jmpLabel("sys_push_eax");
  x.label("mi16_0"); x.movRegImm32(R.EAX, 2); x.jmpLabel("sys_push_eax");
  x.label("mi16_1"); x.movRegImm32(R.EAX, 0x00400000); x.jmpLabel("sys_push_eax");
  x.label("mi16_2"); x.xorRegReg32(R.EDX, R.EDX); x.movRegMem32(R.EAX, R.EDX, ADDR_VM_ICNT); x.jmpLabel("sys_push_eax");
  x.label("mi16_4"); x.xorRegReg32(R.EDX, R.EDX); x.movRegMem32(R.EAX, R.EDX, ADDR_HAS_SNET); x.jmpLabel("sys_push_eax");

  // SYS 17: BLIT_RECT(x, y, w, h, src_ptr)
  x.label("sys_17");
  x.pushReg32(R.ESI);
  x.pushReg32(R.EDI);
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.movRegSib32(R.EBX, R.EBP, R.EDI, 0, 4);
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 8);
  x.movRegSib32(R.EDX, R.EBP, R.EDI, 0, 12);
  x.movRegSib32(R.ESI, R.EBP, R.EDI, 0, 16);
  x.addRegReg32(R.ESI, R.EBP);
  x.movRegImm32(R.EDI, 320);
  x.imulRegReg32(R.EBX, R.EDI);
  x.addRegReg32(R.EBX, R.EAX);
  x.addRegImm32(R.EBX, 0x002F0000);
  x.movRegReg32(R.EAX, R.ECX);
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
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, 0);
  x.movRegSib32(R.EBX, R.EBP, R.EDI, 0, 4);
  x.movRegSib32(R.ECX, R.EBP, R.EDI, 0, 8);
  x.addRegReg32(R.EBX, R.EBP);
  x.cmpRegImm32(R.EAX, 0);
  x.jneLabel("itoa20_nz");
  x.movRegImm32(R.EDX, 48); x.movMemReg8(R.EBX, 0, R.DL);
  x.xorRegReg32(R.EDX, R.EDX); x.movMemReg8(R.EBX, 1, R.DL);
  x.popReg32(R.EDI); x.popReg32(R.ESI);
  x.movRegImm32(R.EAX, 1); x.jmpLabel("sys_push_eax");

  x.label("itoa20_nz");
  x.xorRegReg32(R.ESI, R.ESI);
  x.cmpRegImm32(R.ECX, 10);
  x.jneLabel("itoa20_pos");
  x.cmpRegImm32(R.EAX, 0);
  x.jgeLabel("itoa20_pos");
  x.movRegImm32(R.ESI, 1);
  x.negReg32(R.EAX);
  x.label("itoa20_pos");
  x.movRegImm32(R.EDI, 0);
  x.label("itoa20_div");
  x.cmpRegImm32(R.EAX, 0);
  x.jeLabel("itoa20_div_done");
  x.xorRegReg32(R.EDX, R.EDX);
  x.divReg32(R.ECX);
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
  x.movRegReg32(R.EAX, R.EDI);
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

  // SYS 21: TASK_SPAWN_VM(fn_pc, arg0) -> tid (1..7) or -1
  x.label("sys_21");
  x.pushReg32(R.ESI);
  x.movRegSib32(R.ESI, R.EBP, R.EDI, 0, 0); // ESI = fn_pc
  x.movRegSib32(R.EDX, R.EBP, R.EDI, 0, 4); // EDX = arg0
  x.movRegImm32(R.ECX, 1);                  // ECX = candidate tid = 1..7
  x.label("ts21_find");
  x.movRegReg32(R.EBX, R.ECX);
  x.shlRegImm(R.EBX, 5);
  x.addRegReg32(R.EBX, R.EBP);
  x.addRegImm32(R.EBX, 0x0FFE00);           // EBX = &TCB[tid]
  x.movRegMem32(R.EAX, R.EBX, 0);           // state
  x.cmpRegImm32(R.EAX, 1);
  x.jneLabel("ts21_found");
  x.addRegImm32(R.ECX, 1);
  x.cmpRegImm32(R.ECX, 8);
  x.jlLabel("ts21_find");
  x.popReg32(R.ESI);
  x.movRegImm32(R.EAX, -1);
  x.jmpLabel("sys_push_eax");

  x.label("ts21_found");
  // EAX = sp_base = 0x140000 + tid * 0x6000
  x.movRegReg32(R.EAX, R.ECX);
  x.movRegImm32(R.EBX, 0x006000);
  x.imulRegReg32(R.EAX, R.EBX);
  x.addRegImm32(R.EAX, 0x00140000);
  // Push arg0 at vmRam[sp_base]
  x.movSibReg32(R.EBP, R.EAX, 0, 0, R.EDX);
  // EDX = csp_base = 0x178000 + tid * 0x2000
  x.movRegReg32(R.EDX, R.ECX);
  x.shlRegImm(R.EDX, 13);
  x.addRegImm32(R.EDX, 0x00178000);
  x.movRegImm32(R.EBX, -1);
  x.movSibReg32(R.EBP, R.EDX, 0, 0, R.EBX); // sentinel PC = -1
  x.movSibReg32(R.EBP, R.EDX, 0, 4, R.EAX); // sentinel FP = sp_base

  // Populate TCB[tid]
  x.movRegReg32(R.EBX, R.ECX);
  x.shlRegImm(R.EBX, 5);
  x.addRegReg32(R.EBX, R.EBP);
  x.addRegImm32(R.EBX, 0x0FFE00);
  x.movMemImm32(R.EBX, 0, 1);               // state = 1 (ACTIVE)
  x.movMemReg32(R.EBX, 4, R.ESI);           // vm_pc = fn_pc
  x.movMemReg32(R.EBX, 12, R.EAX);          // vm_fp = sp_base
  x.addRegImm32(R.EAX, 4);
  x.movMemReg32(R.EBX, 8, R.EAX);           // vm_sp = sp_base + 4
  x.addRegImm32(R.EDX, 8);
  x.movMemReg32(R.EBX, 16, R.EDX);          // vm_csp = csp_base + 8
  x.movMemImm32(R.EBX, 20, 0);              // ticks = 0
  x.movMemReg32(R.EBX, 24, R.ESI);          // entry_pc
  x.movMemImm32(R.EBX, 28, 0);              // exit_val = 0

  // Increment num_active_tids at [EBP + 0x0FFF04]
  x.movRegMem32(R.EAX, R.EBP, 0x0FFF04);
  x.addRegImm32(R.EAX, 1);
  x.movMemReg32(R.EBP, 0x0FFF04, R.EAX);
  x.movRegReg32(R.EAX, R.ECX);              // return tid
  x.popReg32(R.ESI);
  x.jmpLabel("sys_push_eax");

  // ==========================================================================
  // 4. VM Task Exit / Halt & Jump Tables
  // ==========================================================================
  x.label("vm_task_exit_or_halt");
  x.movRegSib32(R.EAX, R.EBP, R.EDI, 0, -4); // EAX = return value
  x.movRegMem32(R.ECX, R.EBP, 0x0FFF00);     // ECX = cur_tid
  x.cmpRegImm32(R.ECX, 0);
  x.jeLabel("vm_halt_with_eax");
  // Background task finished: mark TCB as HALTED (2), decrement num_active_tids, and switch!
  x.movRegReg32(R.EBX, R.ECX);
  x.shlRegImm(R.EBX, 5);
  x.addRegReg32(R.EBX, R.EBP);
  x.addRegImm32(R.EBX, 0x0FFE00);
  x.movMemImm32(R.EBX, 0, 2);                // state = 2 (HALTED)
  x.movMemReg32(R.EBX, 28, R.EAX);           // exit_val
  x.movRegMem32(R.EAX, R.EBP, 0x0FFF04);
  x.subRegImm32(R.EAX, 1);
  x.movMemReg32(R.EBP, 0x0FFF04, R.EAX);
  x.jmpLabel("sched_pick_next");

  x.label("vm_halt_bad_op");
  x.movRegImm32(R.EAX, -99);

  x.label("vm_halt_with_eax");
  x.xorRegReg32(R.EDX, R.EDX);
  x.movRegMem32(R.ECX, R.EDX, ADDR_VM_ICNT);
  x.movMemReg32(R.EBP, 0x0FFD20, R.ECX);
  x.movMemReg32(R.EBP, 0x0FFD28, R.EAX);
  x.movMemImm32(R.EBP, 0x0FFD2C, 1);
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

  x.label("embedded_font");
  for (let i = 0; i < 768; i++) {
    x.u8(parseInt(X86_FONT_8X8_HEX.substr(i * 2, 2), 16));
  }

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

  const plainMap = new Uint16Array(128);
  const shiftMap = new Uint16Array(128);
  const plainChars = "1234567890-=\b\tqwertyuiop[]\r\0asdfghjkl;'`\0\\zxcvbnm,./";
  const shiftChars = "!@#$%^&*()_+\b\tQWERTYUIOP{}\r\0ASDFGHJKL:\"~\0|ZXCVBNM<>?";
  for (let i = 0; i < plainChars.length; i++) {
    const sc = i + 2;
    const cp = plainChars.charCodeAt(i);
    const cs = shiftChars.charCodeAt(i);
    if (cp) plainMap[sc] = cp | ((cp >= 97 && cp <= 122 ? cp - 32 : cp) << 8);
    if (cs) shiftMap[sc] = cs | ((cp >= 97 && cp <= 122 ? cp - 32 : cp) << 8);
  }
  plainMap[0x01] = (27 << 8) | 27; shiftMap[0x01] = (27 << 8) | 27;
  plainMap[0x0E] = (8 << 8) | 8;   shiftMap[0x0E] = (8 << 8) | 8;
  plainMap[0x0F] = (9 << 8) | 9;   shiftMap[0x0F] = (9 << 8) | 9;
  plainMap[0x1C] = (13 << 8) | 13; shiftMap[0x1C] = (13 << 8) | 13;
  plainMap[0x39] = (32 << 8) | 32; shiftMap[0x39] = (32 << 8) | 32;
  plainMap[0x48] = (38 << 8) | 0;  shiftMap[0x48] = (38 << 8) | 0;
  plainMap[0x50] = (40 << 8) | 0;  shiftMap[0x50] = (40 << 8) | 0;
  plainMap[0x4B] = (37 << 8) | 0;  shiftMap[0x4B] = (37 << 8) | 0;
  plainMap[0x4D] = (39 << 8) | 0;  shiftMap[0x4D] = (39 << 8) | 0;

  x.label("scancode_plain_tbl");
  for (let i = 0; i < 128; i++) x.u16(plainMap[i]);
  x.label("scancode_shift_tbl");
  for (let i = 0; i < 128; i++) x.u16(shiftMap[i]);

  return { bytes: x.finalize(), labels: x.labels, asmLines: x.asmLines };
}

function formatHexLines(bytesArr, startIdx, endIdx) {
  const lines = [];
  let hex = "";
  for (let i = startIdx; i < endIdx; i++) {
    hex += (bytesArr[i] & 0xFF).toString(16).padStart(2, "0");
    if (hex.length >= 64) {
      lines.push("  .hex " + hex);
      hex = "";
    }
  }
  if (hex.length > 0) lines.push("  .hex " + hex);
  return lines;
}

function buildX86Core(customBanner = "SpiralOS 1.1") {
  const pm = buildProtectedModeCore();
  const bootSector = buildBootSector(customBanner);
  const stage2 = buildStage2Loader(pm.labels.pm_bios_write_ret, bootSector.readRangeAddr);
  const combined = new Uint8Array(32 * 512); // Sectors 0..31 (16 KB)
  combined.set(bootSector, 0);
  combined.set(stage2, 512);
  combined.set(pm.bytes, 1024);

  const asmLines = [
    "; SpiralOS 1.1 — Hummingbird i586 Native Core Assembly (/src/core_x86.asm)",
    "; Stage 1 Boot Sector (0x7C00), Stage 2 Track-Safe Loader + BIOS Thunk (0x7E00),",
    "; and 32-bit Protected-Mode Core (0x8000)",
    "  .org 0x7C00",
    "stage1_boot_sector:"
  ];
  asmLines.push(...formatHexLines(bootSector, 0, 0x0180));
  asmLines.push("boot_banner:");
  asmLines.push(`  .banner "${customBanner}"`);
  asmLines.push(...formatHexLines(bootSector, 0x0190, 512));
  asmLines.push("stage2_loader:");
  asmLines.push(...formatHexLines(stage2, 0, 512));
  asmLines.push("pm_core_entry:");
  asmLines.push(...pm.asmLines);

  return {
    bootSector,
    stage2,
    pmCore: pm.bytes,
    labels: pm.labels,
    bytes: combined,
    totalBytes: 1024 + pm.bytes.length,
    bannerOffset: 0x0180,
    asmSource: asmLines.join("\n") + "\n"
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildX86Core, buildBootSector, buildStage2Loader, buildProtectedModeCore };
}
if (typeof globalThis !== "undefined") {
  globalThis.buildX86Core = buildX86Core;
}
