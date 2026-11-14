; SpiralOS 1.3 — Triton 3.1 Balanced-Ternary Native Core (/src/core_triton.asm)
; Studio: ConsciousNode SoftWorks · Licence: MIT
.mode T3
.org 0
boot_rom_entry:
  LI R0, #0
  MTSPR R0, #2
  MTSPR R0, #8
  LI R0, #150
  MTSPR R0, #5
  LI R1, #-555
  LMI R1, #25
  OUT R1, #7
  IN R2, #8
  CMPI R2, #84
  JNZX boot_no_disk
  IN R2, #8
  CMPI R2, #82
  JNZX boot_no_disk
  IN R2, #8
  CMPI R2, #73
  JNZX boot_no_disk
  IN R2, #8
  CMPI R2, #84
  JNZX boot_no_disk
  IN R3, #8
  IN R4, #8
  MULI R4, R4, #256
  ADD R3, R3, R4
  ADDI R1, R1, #208
  OUT R1, #7
  LI R5, #96
rom_unpack_loop:
  CMP R5, R3
  JNNX rom_unpack_done
  IN R6, #8
  IN R7, #8
  MULI R7, R7, #256
  ADD R6, R6, R7
  SUBI R6, R6, #9841
  ST R6, R5, #0
  ADDI R5, R5, #1
  JMPX rom_unpack_loop
rom_unpack_done:
  LI R0, #0
  LI R1, #1
  ST R1, R0, #101
  LI R1, #2160
  JR R1
boot_no_disk:
  LI R0, #0
  ST R0, R0, #101
  LI R1, #2160
  JR R1
.org 150
vector_table:
  .word boot_rom_entry
  .word isr_default
  .word isr_default
  .word isr_default
  .word isr_default
  .word isr_default
  .word isr_default
  .word isr_irq_timer
  .word isr_default
  .word isr_default
  .word isr_default
  .word isr_default
.org 186
op_table:
  .word op_00_nop
  .word op_01_halt
  .word op_02_push_i16
  .word op_03_push_u16
  .word op_04_push_hi
  .word op_05_dup
  .word op_06_drop
  .word op_07_swap
  .word op_08_get_local
  .word op_09_set_local
  .word op_0a_get_global
  .word op_0b_set_global
  .word op_0c_addr_local
  .word op_0d_addr_global
  .word op_0e_load8u
  .word op_0f_load8s
  .word op_10_load16u
  .word op_11_load32
  .word op_12_store8
  .word op_13_store16
  .word op_14_store32
  .word op_15_add
  .word op_16_sub
  .word op_17_mul
  .word op_18_div
  .word op_19_mod
  .word op_1a_and
  .word op_1b_or
  .word op_1c_xor
  .word op_1d_shl
  .word op_1e_shr
  .word op_1f_sar
  .word op_20_cmp
  .word op_21_jmp
  .word op_22_jz
  .word op_23_jnz
  .word op_24_call
  .word op_25_enter
  .word op_26_ret
  .word op_27_syscall
.org 306
cmp_table:
  .word cmp_0_eq
  .word cmp_1_ne
  .word cmp_2_lt
  .word cmp_3_le
  .word cmp_4_gt
  .word cmp_5_ge
  .word cmp_6_ult
  .word cmp_7_ugt
.org 330
sys_table:
  .word sys_00
  .word sys_01
  .word sys_02
  .word sys_03
  .word sys_04
  .word sys_05
  .word sys_06
  .word sys_07
  .word sys_08
  .word sys_09
  .word sys_10
  .word sys_11
  .word sys_12
  .word sys_13
  .word sys_14
  .word sys_15
  .word sys_16
  .word sys_17
  .word sys_18
  .word sys_19
  .word sys_20
  .word sys_21
.org 396
pow2_table:
  .word 1
  .word 2
  .word 4
  .word 8
  .word 16
  .word 32
  .word 64
  .word 128
  .word 256
  .word 512
  .word 1024
  .word 2048
  .word 4096
  .word 8192
  .word 16384
  .word 32768
  .word 65536
  .word 131072
  .word 262144
  .word 524288
  .word 1048576
  .word 2097152
  .word 4194304
  .word 8388608
  .word 16777216
  .word 33554432
  .word 67108864
  .word 134217728
  .word 268435456
  .word 536870912
  .word 1073741824
  .word 2147483648
.org 492
pow2c_table:
  .word 4294967296
  .word 2147483648
  .word 1073741824
  .word 536870912
  .word 268435456
  .word 134217728
  .word 67108864
  .word 33554432
  .word 16777216
  .word 8388608
  .word 4194304
  .word 2097152
  .word 1048576
  .word 524288
  .word 262144
  .word 131072
  .word 65536
  .word 32768
  .word 16384
  .word 8192
  .word 4096
  .word 2048
  .word 1024
  .word 512
  .word 256
  .word 128
  .word 64
  .word 32
  .word 16
  .word 8
  .word 4
  .word 2
.org 590
boot_banner:
  .tryte #83, #112, #105, #114, #97, #108, #79, #83, #32, #49, #46, #50, #0, #0, #0, #0
.org 610
embedded_font:
  .tryte #0, #0, #0, #0, #0, #0, #0, #0, #16, #16, #16, #16, #0, #16, #16, #0
  .tryte #68, #68, #68, #0, #0, #0, #0, #0, #72, #252, #72, #72, #252, #72, #0, #0
  .tryte #16, #124, #144, #120, #20, #248, #16, #0, #196, #200, #16, #32, #76, #140, #0, #0
  .tryte #112, #136, #112, #148, #136, #116, #0, #0, #16, #16, #32, #0, #0, #0, #0, #0
  .tryte #8, #16, #32, #32, #32, #16, #8, #0, #32, #16, #8, #8, #8, #16, #32, #0
  .tryte #0, #84, #56, #124, #56, #84, #0, #0, #0, #16, #16, #124, #16, #16, #0, #0
  .tryte #0, #0, #0, #0, #0, #24, #16, #32, #0, #0, #0, #124, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #48, #48, #0, #4, #8, #16, #32, #64, #128, #0, #0
  .tryte #120, #140, #148, #164, #196, #132, #120, #0, #16, #48, #80, #16, #16, #16, #124, #0
  .tryte #120, #132, #4, #56, #64, #128, #252, #0, #248, #8, #16, #56, #4, #132, #120, #0
  .tryte #8, #24, #40, #72, #252, #8, #8, #0, #252, #128, #248, #4, #4, #132, #120, #0
  .tryte #56, #64, #128, #248, #132, #132, #120, #0, #252, #4, #8, #16, #32, #32, #32, #0
  .tryte #120, #132, #72, #48, #72, #132, #120, #0, #120, #132, #132, #124, #4, #8, #112, #0
  .tryte #0, #48, #48, #0, #48, #48, #0, #0, #0, #24, #24, #0, #24, #16, #32, #0
  .tryte #8, #16, #32, #64, #32, #16, #8, #0, #0, #0, #124, #0, #124, #0, #0, #0
  .tryte #64, #32, #16, #8, #16, #32, #64, #0, #120, #132, #8, #16, #16, #0, #16, #0
  .tryte #120, #132, #188, #164, #188, #128, #124, #0, #48, #72, #132, #252, #132, #132, #132, #0
  .tryte #248, #132, #132, #248, #132, #132, #248, #0, #120, #132, #128, #128, #128, #132, #120, #0
  .tryte #240, #136, #132, #132, #132, #136, #240, #0, #252, #128, #128, #248, #128, #128, #252, #0
  .tryte #252, #128, #128, #248, #128, #128, #128, #0, #120, #132, #128, #156, #132, #132, #120, #0
  .tryte #132, #132, #132, #252, #132, #132, #132, #0, #124, #16, #16, #16, #16, #16, #124, #0
  .tryte #60, #8, #8, #8, #136, #136, #112, #0, #132, #136, #144, #224, #144, #136, #132, #0
  .tryte #128, #128, #128, #128, #128, #128, #252, #0, #130, #198, #170, #146, #130, #130, #130, #0
  .tryte #132, #196, #164, #148, #140, #132, #132, #0, #120, #132, #132, #132, #132, #132, #120, #0
  .tryte #248, #132, #132, #248, #128, #128, #128, #0, #120, #132, #132, #132, #164, #148, #122, #0
  .tryte #248, #132, #132, #248, #144, #136, #132, #0, #120, #132, #128, #120, #4, #132, #120, #0
  .tryte #254, #16, #16, #16, #16, #16, #16, #0, #132, #132, #132, #132, #132, #132, #120, #0
  .tryte #132, #132, #132, #72, #72, #48, #48, #0, #130, #130, #130, #146, #170, #198, #130, #0
  .tryte #132, #72, #48, #48, #48, #72, #132, #0, #132, #72, #48, #16, #16, #16, #16, #0
  .tryte #252, #8, #16, #32, #64, #128, #252, #0, #56, #32, #32, #32, #32, #32, #56, #0
  .tryte #128, #64, #32, #16, #8, #4, #0, #0, #56, #8, #8, #8, #8, #8, #56, #0
  .tryte #16, #40, #68, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #254, #0
  .tryte #32, #16, #0, #0, #0, #0, #0, #0, #0, #0, #120, #4, #124, #132, #124, #0
  .tryte #128, #128, #248, #132, #132, #132, #248, #0, #0, #0, #120, #132, #128, #132, #120, #0
  .tryte #4, #4, #124, #132, #132, #132, #124, #0, #0, #0, #120, #132, #252, #128, #120, #0
  .tryte #28, #32, #248, #32, #32, #32, #32, #0, #0, #0, #124, #132, #132, #124, #4, #120
  .tryte #128, #128, #248, #132, #132, #132, #132, #0, #16, #0, #48, #16, #16, #16, #56, #0
  .tryte #8, #0, #24, #8, #8, #8, #136, #112, #128, #128, #136, #144, #224, #144, #136, #0
  .tryte #32, #32, #32, #32, #32, #32, #24, #0, #0, #0, #236, #146, #146, #146, #146, #0
  .tryte #0, #0, #240, #136, #136, #136, #136, #0, #0, #0, #120, #132, #132, #132, #120, #0
  .tryte #0, #0, #248, #132, #132, #248, #128, #128, #0, #0, #124, #132, #132, #124, #4, #4
  .tryte #0, #0, #156, #194, #128, #128, #128, #0, #0, #0, #124, #128, #120, #4, #248, #0
  .tryte #32, #32, #248, #32, #32, #36, #24, #0, #0, #0, #132, #132, #132, #140, #116, #0
  .tryte #0, #0, #132, #132, #72, #72, #48, #0, #0, #0, #130, #146, #146, #170, #68, #0
  .tryte #0, #0, #132, #72, #48, #72, #132, #0, #0, #0, #132, #132, #72, #48, #16, #96
  .tryte #0, #0, #252, #8, #48, #64, #252, #0, #24, #32, #32, #64, #32, #32, #24, #0
  .tryte #16, #16, #16, #16, #16, #16, #16, #0, #48, #8, #8, #4, #8, #8, #48, #0
  .tryte #0, #100, #152, #0, #0, #0, #0, #0, #0, #124, #84, #124, #84, #124, #0, #0
.org 1380
embedded_palette:
  .tryte #0, #0, #0, #0, #18, #110, #0, #150, #40, #0, #160, #160, #170, #20, #20, #150
  .tryte #0, #150, #170, #95, #0, #180, #185, #195, #85, #90, #105, #65, #125, #255, #72, #255
  .tryte #122, #0, #240, #255, #255, #80, #80, #255, #85, #255, #255, #230, #60, #255, #255, #255
  .tryte #80, #144, #176, #117, #217, #59, #154, #34, #198, #191, #107, #81, #228, #180, #220, #9
  .tryte #253, #103, #46, #70, #242, #83, #143, #125, #120, #216, #8, #157, #33, #147, #194, #106
  .tryte #30, #231, #179, #169, #12, #252, #52, #49, #69, #191, #86, #142, #74, #123, #215, #213
  .tryte #160, #32, #96, #197, #105, #235, #234, #178, #118, #15, #251, #1, #52, #68, #140, #89
  .tryte #141, #23, #126, #214, #162, #163, #31, #45, #200, #104, #184, #237, #177, #67, #18, #250
  .tryte #206, #55, #67, #89, #92, #140, #228, #129, #213, #111, #166, #30, #250, #203, #103, #133
  .tryte #240, #176, #16, #21, #249, #155, #58, #66, #38, #95, #139, #177, #132, #212, #60, #169
  .tryte #29, #199, #206, #102, #82, #243, #175, #221, #24, #248, #104, #61, #65, #243, #98, #138
  .tryte #126, #135, #211, #9, #172, #28, #148, #209, #101, #31, #246, #174, #170, #27, #247, #53
  .tryte #64, #64, #192, #101, #137, #75, #138, #210, #214, #175, #27, #97, #212, #100, #236, #249
  .tryte #173, #119, #30, #246, #2, #67, #63, #141, #104, #136, #24, #141, #209, #163, #178, #26
  .tryte #46, #215, #99, #185, #252, #172, #68, #33, #245, #207, #70, #62, #90, #107, #135, #229
  .tryte #144, #208, #112, #181, #25, #251, #218, #98, #134, #255, #171, #17, #36, #244, #156, #73
  .tryte #61, #39, #110, #134, #178, #147, #207, #61, #184, #24, #200, #221, #97, #83, #2, #170
  .tryte #222, #39, #243, #105, #76, #60, #244, #113, #133, #127, #150, #206, #10, #187, #23, #149
  .tryte #224, #96, #32, #5, #169, #171, #42, #242, #54, #79, #59, #193, #116, #132, #76, #153
  .tryte #205, #215, #190, #22, #98, #227, #95, #237, #8, #168, #120, #45, #241, #3, #82, #58
  .tryte #142, #119, #131, #25, #156, #204, #164, #193, #21, #47, #230, #94, #186, #11, #167, #69
  .tryte #48, #240, #208, #85, #57, #91, #122, #130, #230, #159, #203, #113, #196, #20, #252, #233
  .tryte #93, #135, #14, #166, #18, #51, #239, #157, #88, #56, #40, #125, #129, #179, #162, #202
  .tryte #62, #199, #19, #201, #236, #92, #84, #17, #165, #223, #54, #238, #106, #91, #55, #245
  .tryte #128, #128, #128, #165, #201, #11, #202, #18, #150, #239, #91, #33, #20, #164, #172, #57
  .tryte #237, #55, #94, #54, #194, #131, #127, #77, #168, #200, #216, #205, #17, #99, #242, #90
  .tryte #238, #23, #163, #121, #60, #236, #4, #97, #53, #143, #134, #126, #26, #171, #199, #165
  .tryte #208, #16, #48, #245, #89, #187, #26, #162, #70, #63, #235, #209, #100, #52, #92, #137
  .tryte #125, #231, #174, #198, #114, #211, #15, #253, #248, #88, #136, #29, #161, #19, #66, #234
  .tryte #158, #103, #51, #41, #140, #124, #180, #177, #197, #63, #214, #14, #202, #251, #87, #85
  .tryte #32, #160, #224, #69, #233, #107, #106, #50, #246, #143, #123, #129, #180, #196, #12, #217
  .tryte #13, #151, #254, #86, #34, #35, #159, #173, #72, #232, #56, #109, #49, #195, #146, #122
  .tryte #78, #183, #195, #217, #220, #12, #100, #1, #85, #239, #38, #158, #122, #75, #231, #5
  .tryte #112, #48, #144, #149, #121, #27, #186, #194, #166, #223, #11, #49, #4, #84, #188, #41
  .tryte #157, #71, #78, #230, #210, #115, #47, #93, #152, #120, #232, #189, #193, #115, #226, #10
  .tryte #254, #7, #83, #137, #44, #156, #20, #81, #229, #159, #118, #46, #42, #155, #119, #181
  .tryte #192, #192, #64, #229, #9, #203, #10, #82, #86, #47, #155, #225, #84, #228, #108, #121
  .tryte #45, #247, #158, #118, #130, #195, #191, #13, #232, #8, #152, #13, #81, #35, #50, #154
  .tryte #174, #87, #227, #57, #124, #44, #196, #161, #117, #79, #198, #190, #218, #235, #7, #101
  .tryte #16, #80, #240, #53, #153, #123, #90, #226, #6, #127, #43, #145, #164, #116, #28, #201
  .tryte #189, #167, #238, #6, #50, #19, #79, #189, #56, #152, #72, #93, #225, #211, #130, #42
  .tryte #94, #167, #115, #233, #204, #188, #116, #241, #5, #255, #22, #78, #138, #59, #151, #21
  .tryte #96, #224, #160, #133, #41, #43, #170, #114, #182, #207, #187, #65, #244, #4, #204, #25
  .tryte #77, #87, #62, #150, #226, #99, #223, #109, #136, #40, #248, #173, #113, #131, #210, #186
  .tryte #14, #247, #3, #153, #28, #76, #36, #65, #149, #175, #102, #222, #58, #139, #39, #197
  .tryte #176, #112, #80, #213, #185, #219, #250, #2, #102, #31, #75, #241, #68, #148, #124, #105
  .tryte #221, #7, #142, #38, #146, #179, #111, #29, #216, #184, #168, #253, #1, #51, #34, #74
  .tryte #190, #71, #147, #73, #108, #220, #212, #145, #37, #95, #182, #110, #234, #219, #183, #117
.org 2160
boot_entry:
  LI R0, #0
  MTSPR R0, #2
  MTSPR R0, #8
  LI R1, #150
  MTSPR R1, #5
  LI R1, #8317
  LMI R1, #1
  MOV R2, R1
  MTSPR R1, #10
  MTSPR R1, #14
  LI R2, #0
  MTSPR R2, #11
  JALR R3, R0, #boot_set_sp_next
boot_set_sp_next:
  ADDI R3, R3, #6
  MTSPR R3, #9
  IRET
boot_after_sp:
  LI R0, #0
  LT R1, R0, #102
  JNZX tables_ready
  LI R1, #0
init_tab_loop:
  LI R0, #-7683
  LMI R0, #1
  ADD R0, R0, R1
  LI R2, #16
  DIV R3, R1, R2
  MOD R4, R1, R2
  ST R4, R0, #0
  ST R3, R0, #512
  MULI R5, R4, #16
  ST R5, R0, #256
  MULI R5, R3, #16
  ST R5, R0, #768
  LI R5, #0
  LI R6, #0
  LI R7, #0
  LI R8, #1
init_bit_loop:
  LI R2, #2
  MOD R0, R3, R2
  DIV R3, R3, R2
  MOD R2, R4, R2
  PUSH R1
  LI R1, #2
  DIV R4, R4, R1
  SUB R1, R0, R2
  MUL R1, R1, R1
  MUL R1, R1, R8
  ADD R7, R7, R1
  MUL R1, R0, R2
  ADD R0, R0, R2
  SUB R0, R0, R1
  MUL R0, R0, R8
  ADD R6, R6, R0
  MUL R1, R1, R8
  ADD R5, R5, R1
  POP R1
  MULI R8, R8, #2
  CMPI R8, #16
  JNX init_bit_loop
  LI R0, #-7683
  LMI R0, #1
  ADD R0, R0, R1
  ST R5, R0, #1024
  MULI R5, R5, #16
  ST R5, R0, #1280
  ST R6, R0, #1536
  MULI R6, R6, #16
  ST R6, R0, #1792
  ST R7, R0, #2048
  MULI R7, R7, #16
  ST R7, R0, #2304
  ADDI R1, R1, #1
  CMPI R1, #256
  JNX init_tab_loop
  LI R0, #0
  LI R1, #1
  ST R1, R0, #102
tables_ready:
  LI R0, #0
  LT R1, R0, #101
  JZX cold_boot_no_disk
  LI R1, #0
  OUT R1, #17
  LI R1, #1825
  LMI R1, #213
  OUT R1, #18
  LI R1, #2023
  OUT R1, #19
  LI R1, #1
  OUT R1, #20
cold_boot_no_disk:
  LI R1, #-364
  OUT R1, #5
  LI R0, #0
  LI R1, #160
  SW R1, R0, #114
  LI R1, #100
  SW R1, R0, #117
  SW R0, R0, #120
  SW R0, R0, #108
  SW R0, R0, #111
vm_warm_boot:
  LI R0, #0
  MTSPR R0, #2
  LT R1, R0, #101
  JZX warm_boot_skip_disk
  LI R1, #44
  OUT R1, #17
  LI R1, #-9621
  LMI R1, #107
  OUT R1, #18
  LI R1, #181
  OUT R1, #19
  LI R1, #1
  OUT R1, #20
  LI R1, #224
  OUT R1, #17
  LI R1, #7657
  LMI R1, #221
  OUT R1, #18
  LI R1, #1125
  OUT R1, #19
  LI R1, #1
  OUT R1, #20
  LI R1, #4045
  LMI R1, #113
  LI R2, #0
  LI R3, #-2724
  LMI R3, #12
  BFILL R1, R2, R3
  LI R1, #9644
  LMI R1, #156
  LI R2, #0
  LI R3, #6487
  LMI R3, #3
  BFILL R1, R2, R3
warm_boot_skip_disk:
  LI R1, #5548
  LMI R1, #156
  LI R2, #610
  LI R3, #768
  BCOPY R1, R2, R3
  LI R1, #-3451
  LMI R1, #137
  LI R2, #610
  LI R3, #768
  BCOPY R1, R2, R3
  LI R1, #-5499
  LMI R1, #137
  LI R2, #9300
  LI R3, #1536
  BCOPY R1, R2, R3
  LI R1, #-5088
  LMI R1, #160
  LI R2, #1380
  LI R3, #768
  BCOPY R1, R2, R3
  LI R1, #-4192
  LMI R1, #160
  LI R2, #590
  LI R3, #16
  BCOPY R1, R2, R3
  LI R1, #-4320
  LMI R1, #160
  LI R2, #0
  LI R3, #128
  BFILL R1, R2, R3
  LI R1, #-4176
  LMI R1, #160
  LI R2, #0
  LI R3, #400
  BFILL R1, R2, R3
  LI R0, #0
  IN R1, #22
  LI R2, #0
  CMPI R1, #164
  JZX snet_present
  CMPI R1, #165
  JNZX snet_done
snet_present:
  LI R2, #1
snet_done:
  ST R2, R0, #103
  IN R3, #23
  SW R3, R0, #105
  LI R4, #-4320
  LMI R4, #160
  LI R1, #3
  ST R1, R4, #28
  ST R2, R4, #48
  LW R1, R0, #114
  ST R1, R4, #8
  LW R1, R0, #117
  ST R1, R4, #12
  LI R7, #-3552
  LMI R7, #160
  MOV R6, R7
  LI R5, #0
  LI R1, #2491
  LMI R1, #183
  LI R2, #255
  ST R2, R1, #0
  ST R2, R1, #1
  ST R2, R1, #2
  ST R2, R1, #3
  LI R2, #0
  ST R2, R1, #4
  ST R2, R1, #5
  LI R2, #16
  ST R2, R1, #6
  LI R2, #0
  ST R2, R1, #7
  ADDI R1, R1, #8
  SW R1, R0, #123
  LI R8, #-8929
  LMI R8, #107
  LT R1, R8, #0
  CMPI R1, #83
  JNZX no_spir_hdr
  LT R1, R8, #1
  CMPI R1, #80
  JNZX no_spir_hdr
  LT R1, R8, #2
  CMPI R1, #73
  JNZX no_spir_hdr
  LT R1, R8, #3
  CMPI R1, #82
  JNZX no_spir_hdr
  LT R1, R8, #11
  MULI R1, R1, #256
  LT R2, R8, #10
  ADD R1, R1, R2
  MULI R1, R1, #256
  LT R2, R8, #9
  ADD R1, R1, R2
  MULI R1, R1, #256
  LT R2, R8, #8
  ADD R1, R1, R2
  ADD R8, R8, R1
no_spir_hdr:
  LI R1, #-4064
  LMI R1, #160
  LI R2, #1
  ST R2, R1, #0
  LI R3, #-8929
  LMI R3, #107
  SUB R2, R8, R3
  LI R4, #256
  MOD R3, R2, R4
  ST R3, R1, #4
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #5
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #6
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #7
  LI R2, #16
  ST R2, R1, #10
  ST R2, R1, #14
  LI R2, #8
  ST R2, R1, #16
  LI R2, #23
  ST R2, R1, #18
  LI R1, #-3808
  LMI R1, #160
  LI R2, #0
  ST R2, R1, #0
  LI R2, #1
  ST R2, R1, #4
  ST R2, R1, #21
  LI R0, #0
  LI R2, #256
  ST R2, R0, #100
  LI R1, #5317
  LMI R1, #1
  OUT R1, #9
  LI R1, #1
  MTSPR R1, #3
  MTSPR R1, #2
vm_loop:
  LI R0, #-7104
  LMI R0, #320
  CMP R8, R0
  JNNX vm_task_exit_or_halt
  LI R0, #0
  LT R1, R0, #100
  SUBI R1, R1, #1
  ST R1, R0, #100
  JPX vm_no_preempt
  LI R1, #256
  ST R1, R0, #100
  LI R1, #-3808
  LMI R1, #160
  LI R2, #0
  ST R2, R1, #12
  LT R2, R1, #11
  MULI R2, R2, #256
  LT R3, R1, #10
  ADD R2, R2, R3
  MULI R2, R2, #256
  LT R3, R1, #9
  ADD R2, R2, R3
  MULI R2, R2, #256
  LT R3, R1, #8
  ADD R2, R2, R3
  ADDI R2, R2, #1
  LI R4, #256
  MOD R3, R2, R4
  ST R3, R1, #8
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #9
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #10
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #11
  LT R2, R1, #4
  CMPI R2, #1
  JNPX vm_no_preempt
  LT R2, R1, #0
  MULI R3, R2, #32
  LI R4, #-4064
  LMI R4, #160
  ADD R4, R4, R3
  LI R0, #0
  SW R2, R0, #126
  SW R4, R0, #129
  LI R0, #-8929
  LMI R0, #107
  SUB R1, R8, R0
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R4, #4
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #5
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #6
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #7
  LI R0, #-8929
  LMI R0, #107
  SUB R1, R7, R0
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R4, #8
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #9
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #10
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #11
  LI R0, #-8929
  LMI R0, #107
  SUB R1, R6, R0
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R4, #12
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #13
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #14
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #15
  LI R0, #0
  LW R1, R0, #123
  LI R0, #-8929
  LMI R0, #107
  SUB R1, R1, R0
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R4, #16
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #17
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #18
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #19
sched_pick_next:
  LI R0, #0
  LW R2, R0, #126
  LI R3, #8
sched_scan_loop:
  ADDI R2, R2, #1
  LI R4, #8
  MOD R2, R2, R4
  MULI R4, R2, #32
  LI R1, #-4064
  LMI R1, #160
  ADD R4, R1, R4
  LT R1, R4, #0
  CMPI R1, #1
  JZX sched_found
  SUBI R3, R3, #1
  JPX sched_scan_loop
  JMPX vm_no_preempt
sched_found:
  LI R1, #-3808
  LMI R1, #160
  ST R2, R1, #0
  LI R0, #0
  SW R4, R0, #129
  LT R2, R1, #19
  MULI R2, R2, #256
  LT R3, R1, #18
  ADD R2, R2, R3
  MULI R2, R2, #256
  LT R3, R1, #17
  ADD R2, R2, R3
  MULI R2, R2, #256
  LT R3, R1, #16
  ADD R2, R2, R3
  ADDI R2, R2, #1
  LI R4, #256
  MOD R3, R2, R4
  ST R3, R1, #16
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #17
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #18
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #19
  LI R0, #0
  LW R4, R0, #129
  LT R2, R4, #23
  MULI R2, R2, #256
  LT R3, R4, #22
  ADD R2, R2, R3
  MULI R2, R2, #256
  LT R3, R4, #21
  ADD R2, R2, R3
  MULI R2, R2, #256
  LT R3, R4, #20
  ADD R2, R2, R3
  ADDI R2, R2, #1
  LI R1, #256
  MOD R3, R2, R1
  ST R3, R4, #20
  DIV R2, R2, R1
  MOD R3, R2, R1
  ST R3, R4, #21
  DIV R2, R2, R1
  MOD R3, R2, R1
  ST R3, R4, #22
  DIV R2, R2, R1
  MOD R3, R2, R1
  ST R3, R4, #23
  LI R0, #0
  LW R4, R0, #129
  LI R0, #-8929
  LMI R0, #107
  LT R8, R4, #7
  MULI R8, R8, #256
  LT R1, R4, #6
  ADD R8, R8, R1
  MULI R8, R8, #256
  LT R1, R4, #5
  ADD R8, R8, R1
  MULI R8, R8, #256
  LT R1, R4, #4
  ADD R8, R8, R1
  ADD R8, R8, R0
  LT R7, R4, #11
  MULI R7, R7, #256
  LT R1, R4, #10
  ADD R7, R7, R1
  MULI R7, R7, #256
  LT R1, R4, #9
  ADD R7, R7, R1
  MULI R7, R7, #256
  LT R1, R4, #8
  ADD R7, R7, R1
  ADD R7, R7, R0
  LT R6, R4, #15
  MULI R6, R6, #256
  LT R1, R4, #14
  ADD R6, R6, R1
  MULI R6, R6, #256
  LT R1, R4, #13
  ADD R6, R6, R1
  MULI R6, R6, #256
  LT R1, R4, #12
  ADD R6, R6, R1
  ADD R6, R6, R0
  LT R2, R4, #19
  MULI R2, R2, #256
  LT R1, R4, #18
  ADD R2, R2, R1
  MULI R2, R2, #256
  LT R1, R4, #17
  ADD R2, R2, R1
  MULI R2, R2, #256
  LT R1, R4, #16
  ADD R2, R2, R1
  ADD R2, R2, R0
  LI R0, #0
  SW R2, R0, #123
vm_no_preempt:
  LT R1, R8, #3
  ADDI R8, R8, #4
  ADDI R5, R5, #1
  CMPI R1, #0
  JNX vm_halt_bad_op
  CMPI R1, #39
  JPX vm_halt_bad_op
  MULI R1, R1, #3
  LW R0, R1, #186
  JR R0
isr_default:
  IRET
isr_irq_timer:
  PUSH R0
  PUSH R1
  LI R0, #0
  LI R1, #1
  ST R1, R0, #100
  LI R0, #-3796
  LMI R0, #160
  ST R1, R0, #0
  POP R1
  POP R0
  IRET
op_00_nop:
  JMP vm_loop
op_01_halt:
  SUBI R7, R7, #4
  LT R0, R7, #3
  CMPI R0, #128
  JNX lds32_pos_1
  SUBI R0, R0, #256
lds32_pos_1:
  MULI R0, R0, #256
  LT R1, R7, #2
  ADD R0, R0, R1
  MULI R0, R0, #256
  LT R1, R7, #1
  ADD R0, R0, R1
  MULI R0, R0, #256
  LT R1, R7, #0
  ADD R0, R0, R1
  JMP vm_halt_with_r0
op_02_push_i16:
  LT R0, R8, #-4
  LT R1, R8, #-3
  ST R0, R7, #0
  ST R1, R7, #1
  LI R2, #0
  CMPI R1, #128
  JNX push_i16_pos
  LI R2, #255
push_i16_pos:
  ST R2, R7, #2
  ST R2, R7, #3
  ADDI R7, R7, #4
  JMP vm_loop
op_03_push_u16:
  LT R0, R8, #-4
  LT R1, R8, #-3
  ST R0, R7, #0
  ST R1, R7, #1
  LI R2, #0
  ST R2, R7, #2
  ST R2, R7, #3
  ADDI R7, R7, #4
  JMP vm_loop
op_04_push_hi:
  LT R0, R8, #-4
  LT R1, R8, #-3
  ST R0, R7, #-2
  ST R1, R7, #-1
  JMP vm_loop
op_05_dup:
  LW R0, R7, #-4
  SW R0, R7, #0
  LT R0, R7, #-1
  ST R0, R7, #3
  ADDI R7, R7, #4
  JMP vm_loop
op_06_drop:
  SUBI R7, R7, #4
  JMP vm_loop
op_07_swap:
  LW R0, R7, #-4
  LT R1, R7, #-1
  LW R2, R7, #-8
  LT R3, R7, #-5
  SW R2, R7, #-4
  ST R3, R7, #-1
  SW R0, R7, #-8
  ST R1, R7, #-5
  JMP vm_loop
op_08_get_local:
  LT R1, R8, #-3
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  MULI R1, R1, #4
  ADD R1, R6, R1
  LW R0, R1, #0
  SW R0, R7, #0
  LT R0, R1, #3
  ST R0, R7, #3
  ADDI R7, R7, #4
  JMP vm_loop
op_09_set_local:
  SUBI R7, R7, #4
  LT R1, R8, #-3
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  MULI R1, R1, #4
  ADD R1, R6, R1
  LW R0, R7, #0
  SW R0, R1, #0
  LT R0, R7, #3
  ST R0, R1, #3
  JMP vm_loop
op_0a_get_global:
  LT R1, R8, #-3
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  MULI R1, R1, #4
  LI R2, #4045
  LMI R2, #113
  ADD R1, R2, R1
  LW R0, R1, #0
  SW R0, R7, #0
  LT R0, R1, #3
  ST R0, R7, #3
  ADDI R7, R7, #4
  JMP vm_loop
op_0b_set_global:
  SUBI R7, R7, #4
  LT R1, R8, #-3
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  MULI R1, R1, #4
  LI R2, #4045
  LMI R2, #113
  ADD R1, R2, R1
  LW R0, R7, #0
  SW R0, R1, #0
  LT R0, R7, #3
  ST R0, R1, #3
  JMP vm_loop
op_0c_addr_local:
  LT R1, R8, #-3
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  MULI R1, R1, #4
  LI R2, #-8929
  LMI R2, #107
  SUB R0, R6, R2
  ADD R1, R0, R1
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R7, #0
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #1
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #2
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #3
  ADDI R7, R7, #4
  JMP vm_loop
op_0d_addr_global:
  LT R1, R8, #-3
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  MULI R1, R1, #4
  LI R2, #-6709
  LMI R2, #7
  ADD R1, R2, R1
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R7, #0
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #1
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #2
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #3
  ADDI R7, R7, #4
  JMP vm_loop
op_0e_load8u:
  LT R1, R8, #-3
  CMPI R1, #128
  JNX ea_imm_pos_2
  SUBI R1, R1, #256
ea_imm_pos_2:
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  LT R2, R7, #-1
  MULI R2, R2, #256
  LT R0, R7, #-2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #-3
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #-4
  ADD R2, R2, R0
  ADD R1, R2, R1
  LI R2, #1825
  LMI R2, #213
  MOD R1, R1, R2
  JNNX ea_mod_pos_3
  ADD R1, R1, R2
ea_mod_pos_3:
  LI R2, #-8929
  LMI R2, #107
  ADD R1, R1, R2
  LT R0, R1, #0
  ST R0, R7, #-4
  LI R0, #0
  SW R0, R7, #-3
  JMP vm_loop
op_0f_load8s:
  LT R1, R8, #-3
  CMPI R1, #128
  JNX ea_imm_pos_4
  SUBI R1, R1, #256
ea_imm_pos_4:
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  LT R2, R7, #-1
  MULI R2, R2, #256
  LT R0, R7, #-2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #-3
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #-4
  ADD R2, R2, R0
  ADD R1, R2, R1
  LI R2, #1825
  LMI R2, #213
  MOD R1, R1, R2
  JNNX ea_mod_pos_5
  ADD R1, R1, R2
ea_mod_pos_5:
  LI R2, #-8929
  LMI R2, #107
  ADD R1, R1, R2
  LT R0, R1, #0
  ST R0, R7, #-4
  LI R2, #0
  CMPI R0, #128
  JNX load8s_pos
  LI R2, #255
load8s_pos:
  ST R2, R7, #-3
  ST R2, R7, #-2
  ST R2, R7, #-1
  JMP vm_loop
op_10_load16u:
  LT R1, R8, #-3
  CMPI R1, #128
  JNX ea_imm_pos_6
  SUBI R1, R1, #256
ea_imm_pos_6:
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  LT R2, R7, #-1
  MULI R2, R2, #256
  LT R0, R7, #-2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #-3
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #-4
  ADD R2, R2, R0
  ADD R1, R2, R1
  LI R2, #1825
  LMI R2, #213
  MOD R1, R1, R2
  JNNX ea_mod_pos_7
  ADD R1, R1, R2
ea_mod_pos_7:
  LI R2, #-8929
  LMI R2, #107
  ADD R1, R1, R2
  LT R0, R1, #0
  LT R2, R1, #1
  ST R0, R7, #-4
  ST R2, R7, #-3
  LI R0, #0
  ST R0, R7, #-2
  ST R0, R7, #-1
  JMP vm_loop
op_11_load32:
  LT R1, R8, #-3
  CMPI R1, #128
  JNX ea_imm_pos_8
  SUBI R1, R1, #256
ea_imm_pos_8:
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  LT R2, R7, #-1
  MULI R2, R2, #256
  LT R0, R7, #-2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #-3
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #-4
  ADD R2, R2, R0
  ADD R1, R2, R1
  LI R2, #1825
  LMI R2, #213
  MOD R1, R1, R2
  JNNX ea_mod_pos_9
  ADD R1, R1, R2
ea_mod_pos_9:
  LI R2, #-8929
  LMI R2, #107
  ADD R1, R1, R2
  LW R0, R1, #0
  SW R0, R7, #-4
  LT R0, R1, #3
  ST R0, R7, #-1
  JMP vm_loop
op_12_store8:
  SUBI R7, R7, #8
  LT R1, R8, #-3
  CMPI R1, #128
  JNX ea_imm_pos_10
  SUBI R1, R1, #256
ea_imm_pos_10:
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  LT R2, R7, #3
  MULI R2, R2, #256
  LT R0, R7, #2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #1
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #0
  ADD R2, R2, R0
  ADD R1, R2, R1
  LI R2, #1825
  LMI R2, #213
  MOD R1, R1, R2
  JNNX ea_mod_pos_11
  ADD R1, R1, R2
ea_mod_pos_11:
  LI R2, #-8929
  LMI R2, #107
  ADD R1, R1, R2
  LT R0, R7, #4
  ST R0, R1, #0
  JMP vm_loop
op_13_store16:
  SUBI R7, R7, #8
  LT R1, R8, #-3
  CMPI R1, #128
  JNX ea_imm_pos_12
  SUBI R1, R1, #256
ea_imm_pos_12:
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  LT R2, R7, #3
  MULI R2, R2, #256
  LT R0, R7, #2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #1
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #0
  ADD R2, R2, R0
  ADD R1, R2, R1
  LI R2, #1825
  LMI R2, #213
  MOD R1, R1, R2
  JNNX ea_mod_pos_13
  ADD R1, R1, R2
ea_mod_pos_13:
  LI R2, #-8929
  LMI R2, #107
  ADD R1, R1, R2
  LT R0, R7, #4
  LT R2, R7, #5
  ST R0, R1, #0
  ST R2, R1, #1
  JMP vm_loop
op_14_store32:
  SUBI R7, R7, #8
  LT R1, R8, #-3
  CMPI R1, #128
  JNX ea_imm_pos_14
  SUBI R1, R1, #256
ea_imm_pos_14:
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  LT R2, R7, #3
  MULI R2, R2, #256
  LT R0, R7, #2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #1
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #0
  ADD R2, R2, R0
  ADD R1, R2, R1
  LI R2, #1825
  LMI R2, #213
  MOD R1, R1, R2
  JNNX ea_mod_pos_15
  ADD R1, R1, R2
ea_mod_pos_15:
  LI R2, #-8929
  LMI R2, #107
  ADD R1, R1, R2
  LW R0, R7, #4
  SW R0, R1, #0
  LT R0, R7, #7
  ST R0, R1, #3
  JMP vm_loop
op_15_add:
  SUBI R7, R7, #4
  LT R1, R7, #-1
  MULI R1, R1, #256
  LT R0, R7, #-2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-4
  ADD R1, R1, R0
  LT R2, R7, #3
  MULI R2, R2, #256
  LT R0, R7, #2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #1
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #0
  ADD R2, R2, R0
  ADD R1, R1, R2
  LI R2, #-1085
  LMI R2, #1694
  LHI R2, #11
  MOD R1, R1, R2
  JNNX wrap_nn_16
  ADD R1, R1, R2
wrap_nn_16:
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R7, #-4
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-3
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-2
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-1
  JMP vm_loop
op_16_sub:
  SUBI R7, R7, #4
  LT R1, R7, #-1
  MULI R1, R1, #256
  LT R0, R7, #-2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-4
  ADD R1, R1, R0
  LT R2, R7, #3
  MULI R2, R2, #256
  LT R0, R7, #2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #1
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #0
  ADD R2, R2, R0
  SUB R1, R1, R2
  LI R2, #-1085
  LMI R2, #1694
  LHI R2, #11
  MOD R1, R1, R2
  JNNX wrap_nn_17
  ADD R1, R1, R2
wrap_nn_17:
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R7, #-4
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-3
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-2
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-1
  JMP vm_loop
op_17_mul:
  SUBI R7, R7, #4
  LT R1, R7, #-3
  MULI R1, R1, #256
  LT R0, R7, #-4
  ADD R1, R1, R0
  LT R2, R7, #-1
  MULI R2, R2, #256
  LT R0, R7, #-2
  ADD R2, R2, R0
  LT R3, R7, #1
  MULI R3, R3, #256
  LT R0, R7, #0
  ADD R3, R3, R0
  LT R4, R7, #3
  MULI R4, R4, #256
  LT R0, R7, #2
  ADD R4, R4, R0
  MUL R0, R1, R4
  MUL R2, R2, R3
  ADD R0, R0, R2
  LI R4, #6487
  LMI R4, #3
  MOD R0, R0, R4
  MUL R0, R0, R4
  MUL R1, R1, R3
  ADD R1, R1, R0
  LI R2, #-1085
  LMI R2, #1694
  LHI R2, #11
  MOD R1, R1, R2
  JNNX wrap_nn_18
  ADD R1, R1, R2
wrap_nn_18:
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R7, #-4
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-3
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-2
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-1
  JMP vm_loop
op_18_div:
  SUBI R7, R7, #4
  LT R2, R7, #3
  CMPI R2, #128
  JNX lds32_pos_19
  SUBI R2, R2, #256
lds32_pos_19:
  MULI R2, R2, #256
  LT R0, R7, #2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #1
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #0
  ADD R2, R2, R0
  JZX div_by_zero
  LT R1, R7, #-1
  CMPI R1, #128
  JNX lds32_pos_20
  SUBI R1, R1, #256
lds32_pos_20:
  MULI R1, R1, #256
  LT R0, R7, #-2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-4
  ADD R1, R1, R0
  DIV R1, R1, R2
  LI R2, #-1085
  LMI R2, #1694
  LHI R2, #11
  MOD R1, R1, R2
  JNNX wrap_nn_21
  ADD R1, R1, R2
wrap_nn_21:
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R7, #-4
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-3
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-2
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-1
  JMP vm_loop
div_by_zero:
  LI R0, #0
  SW R0, R7, #-4
  ST R0, R7, #-1
  JMP vm_loop
op_19_mod:
  SUBI R7, R7, #4
  LT R2, R7, #3
  CMPI R2, #128
  JNX lds32_pos_22
  SUBI R2, R2, #256
lds32_pos_22:
  MULI R2, R2, #256
  LT R0, R7, #2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #1
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #0
  ADD R2, R2, R0
  JZX div_by_zero
  LT R1, R7, #-1
  CMPI R1, #128
  JNX lds32_pos_23
  SUBI R1, R1, #256
lds32_pos_23:
  MULI R1, R1, #256
  LT R0, R7, #-2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-4
  ADD R1, R1, R0
  MOD R1, R1, R2
  LI R2, #-1085
  LMI R2, #1694
  LHI R2, #11
  MOD R1, R1, R2
  JNNX wrap_nn_24
  ADD R1, R1, R2
wrap_nn_24:
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R7, #-4
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-3
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-2
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-1
  JMP vm_loop
op_1a_and:
  SUBI R7, R7, #4
  LI R0, #-7683
  LMI R0, #1
  LT R1, R7, #-4
  ADD R1, R1, R0
  LT R2, R7, #0
  ADD R2, R2, R0
  LT R3, R1, #256
  LT R4, R2, #0
  ADD R3, R3, R4
  ADD R3, R3, R0
  LT R3, R3, #1024
  LT R1, R1, #768
  LT R2, R2, #512
  ADD R1, R1, R2
  ADD R1, R1, R0
  LT R1, R1, #1280
  ADD R1, R1, R3
  ST R1, R7, #-4
  LT R1, R7, #-3
  ADD R1, R1, R0
  LT R2, R7, #1
  ADD R2, R2, R0
  LT R3, R1, #256
  LT R4, R2, #0
  ADD R3, R3, R4
  ADD R3, R3, R0
  LT R3, R3, #1024
  LT R1, R1, #768
  LT R2, R2, #512
  ADD R1, R1, R2
  ADD R1, R1, R0
  LT R1, R1, #1280
  ADD R1, R1, R3
  ST R1, R7, #-3
  LT R1, R7, #-2
  ADD R1, R1, R0
  LT R2, R7, #2
  ADD R2, R2, R0
  LT R3, R1, #256
  LT R4, R2, #0
  ADD R3, R3, R4
  ADD R3, R3, R0
  LT R3, R3, #1024
  LT R1, R1, #768
  LT R2, R2, #512
  ADD R1, R1, R2
  ADD R1, R1, R0
  LT R1, R1, #1280
  ADD R1, R1, R3
  ST R1, R7, #-2
  LT R1, R7, #-1
  ADD R1, R1, R0
  LT R2, R7, #3
  ADD R2, R2, R0
  LT R3, R1, #256
  LT R4, R2, #0
  ADD R3, R3, R4
  ADD R3, R3, R0
  LT R3, R3, #1024
  LT R1, R1, #768
  LT R2, R2, #512
  ADD R1, R1, R2
  ADD R1, R1, R0
  LT R1, R1, #1280
  ADD R1, R1, R3
  ST R1, R7, #-1
  JMP vm_loop
op_1b_or:
  SUBI R7, R7, #4
  LI R0, #-7683
  LMI R0, #1
  LT R1, R7, #-4
  ADD R1, R1, R0
  LT R2, R7, #0
  ADD R2, R2, R0
  LT R3, R1, #256
  LT R4, R2, #0
  ADD R3, R3, R4
  ADD R3, R3, R0
  LT R3, R3, #1536
  LT R1, R1, #768
  LT R2, R2, #512
  ADD R1, R1, R2
  ADD R1, R1, R0
  LT R1, R1, #1792
  ADD R1, R1, R3
  ST R1, R7, #-4
  LT R1, R7, #-3
  ADD R1, R1, R0
  LT R2, R7, #1
  ADD R2, R2, R0
  LT R3, R1, #256
  LT R4, R2, #0
  ADD R3, R3, R4
  ADD R3, R3, R0
  LT R3, R3, #1536
  LT R1, R1, #768
  LT R2, R2, #512
  ADD R1, R1, R2
  ADD R1, R1, R0
  LT R1, R1, #1792
  ADD R1, R1, R3
  ST R1, R7, #-3
  LT R1, R7, #-2
  ADD R1, R1, R0
  LT R2, R7, #2
  ADD R2, R2, R0
  LT R3, R1, #256
  LT R4, R2, #0
  ADD R3, R3, R4
  ADD R3, R3, R0
  LT R3, R3, #1536
  LT R1, R1, #768
  LT R2, R2, #512
  ADD R1, R1, R2
  ADD R1, R1, R0
  LT R1, R1, #1792
  ADD R1, R1, R3
  ST R1, R7, #-2
  LT R1, R7, #-1
  ADD R1, R1, R0
  LT R2, R7, #3
  ADD R2, R2, R0
  LT R3, R1, #256
  LT R4, R2, #0
  ADD R3, R3, R4
  ADD R3, R3, R0
  LT R3, R3, #1536
  LT R1, R1, #768
  LT R2, R2, #512
  ADD R1, R1, R2
  ADD R1, R1, R0
  LT R1, R1, #1792
  ADD R1, R1, R3
  ST R1, R7, #-1
  JMP vm_loop
op_1c_xor:
  SUBI R7, R7, #4
  LI R0, #-7683
  LMI R0, #1
  LT R1, R7, #-4
  ADD R1, R1, R0
  LT R2, R7, #0
  ADD R2, R2, R0
  LT R3, R1, #256
  LT R4, R2, #0
  ADD R3, R3, R4
  ADD R3, R3, R0
  LT R3, R3, #2048
  LT R1, R1, #768
  LT R2, R2, #512
  ADD R1, R1, R2
  ADD R1, R1, R0
  LT R1, R1, #2304
  ADD R1, R1, R3
  ST R1, R7, #-4
  LT R1, R7, #-3
  ADD R1, R1, R0
  LT R2, R7, #1
  ADD R2, R2, R0
  LT R3, R1, #256
  LT R4, R2, #0
  ADD R3, R3, R4
  ADD R3, R3, R0
  LT R3, R3, #2048
  LT R1, R1, #768
  LT R2, R2, #512
  ADD R1, R1, R2
  ADD R1, R1, R0
  LT R1, R1, #2304
  ADD R1, R1, R3
  ST R1, R7, #-3
  LT R1, R7, #-2
  ADD R1, R1, R0
  LT R2, R7, #2
  ADD R2, R2, R0
  LT R3, R1, #256
  LT R4, R2, #0
  ADD R3, R3, R4
  ADD R3, R3, R0
  LT R3, R3, #2048
  LT R1, R1, #768
  LT R2, R2, #512
  ADD R1, R1, R2
  ADD R1, R1, R0
  LT R1, R1, #2304
  ADD R1, R1, R3
  ST R1, R7, #-2
  LT R1, R7, #-1
  ADD R1, R1, R0
  LT R2, R7, #3
  ADD R2, R2, R0
  LT R3, R1, #256
  LT R4, R2, #0
  ADD R3, R3, R4
  ADD R3, R3, R0
  LT R3, R3, #2048
  LT R1, R1, #768
  LT R2, R2, #512
  ADD R1, R1, R2
  ADD R1, R1, R0
  LT R1, R1, #2304
  ADD R1, R1, R3
  ST R1, R7, #-1
  JMP vm_loop
op_1d_shl:
  SUBI R7, R7, #4
  LT R2, R7, #0
  LI R3, #32
  MOD R2, R2, R3
  JZX shl_done
  LT R1, R7, #-1
  MULI R1, R1, #256
  LT R0, R7, #-2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-4
  ADD R1, R1, R0
  MULI R2, R2, #3
  LW R3, R2, #396
  LW R4, R2, #492
  MOD R1, R1, R4
  MUL R1, R1, R3
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R7, #-4
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-3
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-2
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-1
shl_done:
  JMP vm_loop
op_1e_shr:
  SUBI R7, R7, #4
  LT R2, R7, #0
  LI R3, #32
  MOD R2, R2, R3
  JZX shr_done
  LT R1, R7, #-1
  MULI R1, R1, #256
  LT R0, R7, #-2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-4
  ADD R1, R1, R0
  MULI R2, R2, #3
  LW R3, R2, #396
  DIV R1, R1, R3
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R7, #-4
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-3
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-2
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-1
shr_done:
  JMP vm_loop
op_1f_sar:
  SUBI R7, R7, #4
  LT R2, R7, #0
  LI R3, #32
  MOD R2, R2, R3
  JZX sar_done
  LT R1, R7, #-1
  MULI R1, R1, #256
  LT R0, R7, #-2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-4
  ADD R1, R1, R0
  MULI R2, R2, #3
  LW R3, R2, #396
  LT R0, R7, #-1
  CMPI R0, #128
  JNNX sar_neg
  DIV R1, R1, R3
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R7, #-4
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-3
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-2
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-1
  JMP vm_loop
sar_neg:
  LI R4, #-1086
  LMI R4, #1694
  LHI R4, #11
  SUB R1, R4, R1
  DIV R1, R1, R3
  SUB R1, R4, R1
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R7, #-4
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-3
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-2
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R7, #-1
sar_done:
  JMP vm_loop
op_20_cmp:
  SUBI R7, R7, #4
  LT R4, R8, #-4
  LI R3, #8
  MOD R4, R4, R3
  MULI R4, R4, #3
  LW R4, R4, #306
  JR R4
cmp_0_eq:
  LT R1, R7, #-1
  MULI R1, R1, #256
  LT R0, R7, #-2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-4
  ADD R1, R1, R0
  LT R2, R7, #3
  MULI R2, R2, #256
  LT R0, R7, #2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #1
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #0
  ADD R2, R2, R0
  CMP R1, R2
  JZX cmp_true_25
  LI R0, #0
  JMPX cmp_done_26
cmp_true_25:
  LI R0, #1
cmp_done_26:
  ST R0, R7, #-4
  LI R0, #0
  SW R0, R7, #-3
  JMP vm_loop
cmp_1_ne:
  LT R1, R7, #-1
  MULI R1, R1, #256
  LT R0, R7, #-2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-4
  ADD R1, R1, R0
  LT R2, R7, #3
  MULI R2, R2, #256
  LT R0, R7, #2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #1
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #0
  ADD R2, R2, R0
  CMP R1, R2
  JNZX cmp_true_27
  LI R0, #0
  JMPX cmp_done_28
cmp_true_27:
  LI R0, #1
cmp_done_28:
  ST R0, R7, #-4
  LI R0, #0
  SW R0, R7, #-3
  JMP vm_loop
cmp_2_lt:
  LT R1, R7, #-1
  CMPI R1, #128
  JNX lds32_pos_29
  SUBI R1, R1, #256
lds32_pos_29:
  MULI R1, R1, #256
  LT R0, R7, #-2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-4
  ADD R1, R1, R0
  LT R2, R7, #3
  CMPI R2, #128
  JNX lds32_pos_30
  SUBI R2, R2, #256
lds32_pos_30:
  MULI R2, R2, #256
  LT R0, R7, #2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #1
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #0
  ADD R2, R2, R0
  CMP R1, R2
  JNX cmp_true_31
  LI R0, #0
  JMPX cmp_done_32
cmp_true_31:
  LI R0, #1
cmp_done_32:
  ST R0, R7, #-4
  LI R0, #0
  SW R0, R7, #-3
  JMP vm_loop
cmp_3_le:
  LT R1, R7, #-1
  CMPI R1, #128
  JNX lds32_pos_33
  SUBI R1, R1, #256
lds32_pos_33:
  MULI R1, R1, #256
  LT R0, R7, #-2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-4
  ADD R1, R1, R0
  LT R2, R7, #3
  CMPI R2, #128
  JNX lds32_pos_34
  SUBI R2, R2, #256
lds32_pos_34:
  MULI R2, R2, #256
  LT R0, R7, #2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #1
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #0
  ADD R2, R2, R0
  CMP R1, R2
  JNPX cmp_true_35
  LI R0, #0
  JMPX cmp_done_36
cmp_true_35:
  LI R0, #1
cmp_done_36:
  ST R0, R7, #-4
  LI R0, #0
  SW R0, R7, #-3
  JMP vm_loop
cmp_4_gt:
  LT R1, R7, #-1
  CMPI R1, #128
  JNX lds32_pos_37
  SUBI R1, R1, #256
lds32_pos_37:
  MULI R1, R1, #256
  LT R0, R7, #-2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-4
  ADD R1, R1, R0
  LT R2, R7, #3
  CMPI R2, #128
  JNX lds32_pos_38
  SUBI R2, R2, #256
lds32_pos_38:
  MULI R2, R2, #256
  LT R0, R7, #2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #1
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #0
  ADD R2, R2, R0
  CMP R1, R2
  JPX cmp_true_39
  LI R0, #0
  JMPX cmp_done_40
cmp_true_39:
  LI R0, #1
cmp_done_40:
  ST R0, R7, #-4
  LI R0, #0
  SW R0, R7, #-3
  JMP vm_loop
cmp_5_ge:
  LT R1, R7, #-1
  CMPI R1, #128
  JNX lds32_pos_41
  SUBI R1, R1, #256
lds32_pos_41:
  MULI R1, R1, #256
  LT R0, R7, #-2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-4
  ADD R1, R1, R0
  LT R2, R7, #3
  CMPI R2, #128
  JNX lds32_pos_42
  SUBI R2, R2, #256
lds32_pos_42:
  MULI R2, R2, #256
  LT R0, R7, #2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #1
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #0
  ADD R2, R2, R0
  CMP R1, R2
  JNNX cmp_true_43
  LI R0, #0
  JMPX cmp_done_44
cmp_true_43:
  LI R0, #1
cmp_done_44:
  ST R0, R7, #-4
  LI R0, #0
  SW R0, R7, #-3
  JMP vm_loop
cmp_6_ult:
  LT R1, R7, #-1
  MULI R1, R1, #256
  LT R0, R7, #-2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-4
  ADD R1, R1, R0
  LT R2, R7, #3
  MULI R2, R2, #256
  LT R0, R7, #2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #1
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #0
  ADD R2, R2, R0
  CMP R1, R2
  JNX cmp_true_45
  LI R0, #0
  JMPX cmp_done_46
cmp_true_45:
  LI R0, #1
cmp_done_46:
  ST R0, R7, #-4
  LI R0, #0
  SW R0, R7, #-3
  JMP vm_loop
cmp_7_ugt:
  LT R1, R7, #-1
  MULI R1, R1, #256
  LT R0, R7, #-2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #-4
  ADD R1, R1, R0
  LT R2, R7, #3
  MULI R2, R2, #256
  LT R0, R7, #2
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #1
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #0
  ADD R2, R2, R0
  CMP R1, R2
  JPX cmp_true_47
  LI R0, #0
  JMPX cmp_done_48
cmp_true_47:
  LI R0, #1
cmp_done_48:
  ST R0, R7, #-4
  LI R0, #0
  SW R0, R7, #-3
  JMP vm_loop
op_21_jmp:
  LT R1, R8, #-2
  MULI R1, R1, #256
  LT R0, R8, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  LI R8, #-8929
  LMI R8, #107
  ADD R8, R8, R1
  JMP vm_loop
op_22_jz:
  SUBI R7, R7, #4
  LW R0, R7, #0
  JNZX jz_no_take
  LT R0, R7, #3
  JNZX jz_no_take
  LT R1, R8, #-2
  MULI R1, R1, #256
  LT R0, R8, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  LI R8, #-8929
  LMI R8, #107
  ADD R8, R8, R1
jz_no_take:
  JMP vm_loop
op_23_jnz:
  SUBI R7, R7, #4
  LW R0, R7, #0
  JNZX jnz_take
  LT R0, R7, #3
  JZX jnz_no_take
jnz_take:
  LT R1, R8, #-2
  MULI R1, R1, #256
  LT R0, R8, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  LI R8, #-8929
  LMI R8, #107
  ADD R8, R8, R1
jnz_no_take:
  JMP vm_loop
op_24_call:
  LI R0, #0
  LW R4, R0, #123
  LI R0, #-8929
  LMI R0, #107
  SUB R1, R8, R0
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R4, #0
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #1
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #2
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #3
  LI R0, #-8929
  LMI R0, #107
  SUB R1, R6, R0
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R4, #4
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #5
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #6
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #7
  ADDI R4, R4, #8
  LI R0, #0
  SW R4, R0, #123
  LT R1, R8, #-2
  MULI R1, R1, #256
  LT R0, R8, #-3
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  LI R8, #-8929
  LMI R8, #107
  ADD R8, R8, R1
  JMP vm_loop
op_25_enter:
  LT R1, R8, #-2
  MULI R1, R1, #4
  SUB R6, R7, R1
  LT R1, R8, #-3
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  MULI R1, R1, #4
  ADD R7, R6, R1
  JMP vm_loop
op_26_ret:
  LW R0, R7, #-4
  LT R1, R7, #-1
  SW R0, R6, #0
  ST R1, R6, #3
  ADDI R7, R6, #4
  LI R0, #0
  LW R4, R0, #123
  SUBI R4, R4, #8
  SW R4, R0, #123
  LI R0, #-8929
  LMI R0, #107
  LT R8, R4, #3
  MULI R8, R8, #256
  LT R1, R4, #2
  ADD R8, R8, R1
  MULI R8, R8, #256
  LT R1, R4, #1
  ADD R8, R8, R1
  MULI R8, R8, #256
  LT R1, R4, #0
  ADD R8, R8, R1
  ADD R8, R8, R0
  LT R6, R4, #7
  MULI R6, R6, #256
  LT R1, R4, #6
  ADD R6, R6, R1
  MULI R6, R6, #256
  LT R1, R4, #5
  ADD R6, R6, R1
  MULI R6, R6, #256
  LT R1, R4, #4
  ADD R6, R6, R1
  ADD R6, R6, R0
  JMP vm_loop
op_27_syscall:
  LT R1, R8, #-2
  MULI R1, R1, #4
  SUB R7, R7, R1
  LI R1, #-4288
  LMI R1, #160
  MOV R2, R5
  LI R4, #256
  MOD R3, R2, R4
  ST R3, R1, #0
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #1
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #2
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #3
  LT R1, R8, #-3
  MULI R1, R1, #256
  LT R0, R8, #-4
  ADD R1, R1, R0
  CMPI R1, #0
  JNX sys_unknown
  CMPI R1, #22
  JZX sys_22
  CMPI R1, #21
  JPX sys_unknown
  MULI R1, R1, #3
  LW R0, R1, #330
  JR R0
sys_unknown:
  LI R0, #-1086
  LMI R0, #1694
  LHI R0, #11
sys_push_r0:
  LI R2, #-1085
  LMI R2, #1694
  LHI R2, #11
  MOD R0, R0, R2
  JNNX wrap_nn_49
  ADD R0, R0, R2
wrap_nn_49:
  LI R3, #256
  MOD R2, R0, R3
  ST R2, R7, #0
  DIV R0, R0, R3
  MOD R2, R0, R3
  ST R2, R7, #1
  DIV R0, R0, R3
  MOD R2, R0, R3
  ST R2, R7, #2
  DIV R0, R0, R3
  MOD R2, R0, R3
  ST R2, R7, #3
  ADDI R7, R7, #4
  JMP vm_loop
sub_poll_mouse:
  LI R0, #0
  LW R1, R0, #114
  LW R2, R0, #117
  LW R3, R0, #120
mouse_poll_lp:
  IN R4, #13
  JNPX mouse_poll_done
  IN R4, #14
  ADD R1, R1, R4
  CMPI R1, #0
  JNNX mx_min_ok
  LI R1, #0
mx_min_ok:
  CMPI R1, #319
  JNPX mx_max_ok
  LI R1, #319
mx_max_ok:
  IN R4, #15
  ADD R2, R2, R4
  CMPI R2, #0
  JNNX my_min_ok
  LI R2, #0
my_min_ok:
  CMPI R2, #199
  JNPX my_max_ok
  LI R2, #199
my_max_ok:
  IN R4, #16
  SUB R0, R4, R3
  MOV R3, R4
  CMPI R0, #0
  JNZX mouse_poll_done
  JMPX mouse_poll_lp
mouse_poll_done:
  LI R0, #0
  SW R1, R0, #114
  SW R2, R0, #117
  SW R3, R0, #120
  LI R4, #-4312
  LMI R4, #160
  ST R1, R4, #0
  LI R0, #256
  MOD R0, R1, R0
  ST R0, R4, #0
  LI R0, #256
  DIV R0, R1, R0
  ST R0, R4, #1
  ST R2, R4, #4
  ST R3, R4, #8
  RET
sys_00:
  LT R0, R7, #3
  CMPI R0, #128
  JNX lds32_pos_50
  SUBI R0, R0, #256
lds32_pos_50:
  MULI R0, R0, #256
  LT R1, R7, #2
  ADD R0, R0, R1
  MULI R0, R0, #256
  LT R1, R7, #1
  ADD R0, R0, R1
  MULI R0, R0, #256
  LT R1, R7, #0
  ADD R0, R0, R1
  JMP vm_halt_with_r0
sys_01:
  CALL sub_poll_mouse
  LI R1, #-4288
  LMI R1, #160
  MOV R2, R5
  LI R4, #256
  MOD R3, R2, R4
  ST R3, R1, #0
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #1
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #2
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #3
  LI R1, #-4316
  LMI R1, #160
  LT R2, R1, #3
  MULI R2, R2, #256
  LT R3, R1, #2
  ADD R2, R2, R3
  MULI R2, R2, #256
  LT R3, R1, #1
  ADD R2, R2, R3
  MULI R2, R2, #256
  LT R3, R1, #0
  ADD R2, R2, R3
  ADDI R2, R2, #1
  LI R4, #256
  MOD R3, R2, R4
  ST R3, R1, #0
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #1
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #2
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #3
  LI R1, #-5088
  LMI R1, #160
  LI R2, #0
  LI R4, #32
pal_lut_loop:
  LT R0, R1, #0
  ADDI R0, R0, #16
  DIV R0, R0, R4
  SUBI R0, R0, #4
  MULI R3, R0, #81
  LT R0, R1, #1
  ADDI R0, R0, #16
  DIV R0, R0, R4
  SUBI R0, R0, #4
  MULI R0, R0, #9
  ADD R3, R3, R0
  LT R0, R1, #2
  ADDI R0, R0, #16
  DIV R0, R0, R4
  SUBI R0, R0, #4
  ADD R3, R3, R0
  ST R3, R2, #9000
  ADDI R1, R1, #3
  ADDI R2, R2, #1
  CMPI R2, #256
  JNX pal_lut_loop
  LI R1, #9644
  LMI R1, #156
  LI R2, #-6421
  LMI R2, #764
  LI R4, #200
blit_y_loop:
  ADDI R3, R2, #729
  PUSH R4
  LI R4, #80
blit_x_loop:
  LT R0, R1, #0
  LT R0, R0, #9000
  ST R0, R2, #0
  ST R0, R2, #1
  ST R0, R3, #0
  ST R0, R3, #1
  LT R0, R1, #1
  LT R0, R0, #9000
  ST R0, R2, #2
  ST R0, R2, #3
  ST R0, R3, #2
  ST R0, R3, #3
  LT R0, R1, #2
  LT R0, R0, #9000
  ST R0, R2, #4
  ST R0, R2, #5
  ST R0, R3, #4
  ST R0, R3, #5
  LT R0, R1, #3
  LT R0, R0, #9000
  ST R0, R2, #6
  ST R0, R2, #7
  ST R0, R3, #6
  ST R0, R3, #7
  ADDI R1, R1, #4
  ADDI R2, R2, #8
  ADDI R3, R3, #8
  SUBI R4, R4, #1
  JPX blit_x_loop
  POP R4
  ADDI R2, R2, #818
  SUBI R4, R4, #1
  JPX blit_y_loop
  LI R0, #0
  LI R1, #1
  ST R1, R0, #100
  LI R1, #-3796
  LMI R1, #160
  LI R2, #1
  ST R2, R1, #0
  LI R0, #0
  JMP sys_push_r0
sys_02:
  IN R0, #6
  LI R1, #8192
  DIV R0, R0, R1
  LI R1, #-4316
  LMI R1, #160
  LT R2, R1, #3
  MULI R2, R2, #256
  LT R3, R1, #2
  ADD R2, R2, R3
  MULI R2, R2, #256
  LT R3, R1, #1
  ADD R2, R2, R3
  MULI R2, R2, #256
  LT R3, R1, #0
  ADD R2, R2, R3
  MULI R2, R2, #16
  ADD R0, R0, R2
  LI R2, #-1085
  LMI R2, #1694
  LHI R2, #11
  MOD R0, R0, R2
  JNNX wrap_nn_51
  ADD R0, R0, R2
wrap_nn_51:
  LI R1, #-4284
  LMI R1, #160
  MOV R2, R0
  LI R4, #256
  MOD R3, R2, R4
  ST R3, R1, #0
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #1
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #2
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #3
  JMP sys_push_r0
sys_03:
key_poll_lp:
  IN R1, #10
  JNPX key_poll_empty
  IN R2, #11
  IN R3, #12
  JNZX key_poll_lp
  CMPI R2, #10
  JNZX key_not_lf
  LI R2, #13
key_not_lf:
  CMPI R2, #256
  JNNX key_already_packed
  MOV R3, R2
  CMPI R3, #97
  JNX key_pack
  CMPI R3, #122
  JPX key_pack
  SUBI R3, R3, #32
key_pack:
  MULI R3, R3, #256
  ADD R2, R2, R3
key_already_packed:
  LI R0, #-5896
  LMI R0, #856
  ADD R0, R0, R2
  JMP sys_push_r0
key_poll_empty:
  LI R0, #0
  JMP sys_push_r0
sys_04:
  CALL sub_poll_mouse
  LT R1, R7, #3
  MULI R1, R1, #256
  LT R0, R7, #2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #1
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #0
  ADD R1, R1, R0
  LI R0, #0
  CMP R1, R0
  JZX mouse_skip_ptr
  LI R2, #1825
  LMI R2, #213
  MOD R1, R1, R2
  LI R2, #-8929
  LMI R2, #107
  ADD R4, R1, R2
  LW R1, R0, #114
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R4, #0
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #1
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #2
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #3
  LI R0, #0
  LW R1, R0, #117
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R4, #4
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #5
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #6
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #7
  LI R0, #0
  LW R1, R0, #120
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R4, #8
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #9
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #10
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #11
mouse_skip_ptr:
  LI R0, #0
  LW R1, R0, #114
  LW R2, R0, #117
  LW R3, R0, #120
  MULI R2, R2, #1024
  LI R4, #5377
  LMI R4, #53
  MUL R3, R3, R4
  ADD R0, R1, R2
  ADD R0, R0, R3
  JMP sys_push_r0
sys_05:
  LT R1, R7, #3
  CMPI R1, #128
  JNX lds32_pos_52
  SUBI R1, R1, #256
lds32_pos_52:
  MULI R1, R1, #256
  LT R0, R7, #2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #1
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #0
  ADD R1, R1, R0
  LT R2, R7, #7
  CMPI R2, #128
  JNX lds32_pos_53
  SUBI R2, R2, #256
lds32_pos_53:
  MULI R2, R2, #256
  LT R0, R7, #6
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #5
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #4
  ADD R2, R2, R0
  LT R3, R7, #11
  CMPI R3, #128
  JNX lds32_pos_54
  SUBI R3, R3, #256
lds32_pos_54:
  MULI R3, R3, #256
  LT R0, R7, #10
  ADD R3, R3, R0
  MULI R3, R3, #256
  LT R0, R7, #9
  ADD R3, R3, R0
  MULI R3, R3, #256
  LT R0, R7, #8
  ADD R3, R3, R0
  LT R4, R7, #15
  CMPI R4, #128
  JNX lds32_pos_55
  SUBI R4, R4, #256
lds32_pos_55:
  MULI R4, R4, #256
  LT R0, R7, #14
  ADD R4, R4, R0
  MULI R4, R4, #256
  LT R0, R7, #13
  ADD R4, R4, R0
  MULI R4, R4, #256
  LT R0, R7, #12
  ADD R4, R4, R0
  CMPI R1, #0
  JNNX fr_x_ok
  ADD R3, R3, R1
  LI R1, #0
fr_x_ok:
  CMPI R2, #0
  JNNX fr_y_ok
  ADD R4, R4, R2
  LI R2, #0
fr_y_ok:
  ADD R0, R1, R3
  CMPI R0, #320
  JNPX fr_w_ok
  LI R0, #320
  SUB R3, R0, R1
fr_w_ok:
  ADD R0, R2, R4
  CMPI R0, #200
  JNPX fr_h_ok
  LI R0, #200
  SUB R4, R0, R2
fr_h_ok:
  CMPI R3, #0
  JNPX fr_done
  CMPI R4, #0
  JNPX fr_done
  MULI R2, R2, #320
  ADD R2, R2, R1
  LI R0, #9644
  LMI R0, #156
  ADD R2, R2, R0
  LT R1, R7, #16
fr_row_loop:
  MOV R0, R2
  PUSH R3
  BFILL R0, R1, R3
  POP R3
  ADDI R2, R2, #320
  SUBI R4, R4, #1
  JPX fr_row_loop
fr_done:
  LI R0, #0
  JMP sys_push_r0
sub_draw_char:
  LI R0, #256
  MOD R3, R3, R0
  SUBI R3, R3, #32
  CMPI R3, #0
  JNX dc_ret
  CMPI R3, #95
  JPX dc_ret
  CMPI R1, #0
  JNX dc_ret
  CMPI R1, #312
  JPX dc_ret
  CMPI R2, #0
  JNX dc_ret
  PUSH R5
  PUSH R6
  LI R0, #0
  LW R0, R0, #141
  CMPI R0, #0
  JNZ dc_serif
  CMPI R2, #192
  JPX dc_pop_ret
  MULI R3, R3, #8
  LI R0, #5548
  LMI R0, #156
  ADD R3, R3, R0
  LI R5, #8
  JMP dc_vram
dc_serif:
  CMPI R2, #184
  JPX dc_pop_ret
  MULI R3, R3, #16
  LI R0, #-5499
  LMI R0, #137
  ADD R3, R3, R0
  LI R5, #16
dc_vram:
  MULI R2, R2, #320
  ADD R2, R2, R1
  LI R0, #9644
  LMI R0, #156
  ADD R2, R2, R0
  LI R0, #0
  LW R1, R0, #126
dc_row_loop:
  LT R0, R3, #0
  ADDI R3, R3, #1
  LI R6, #2
  MOD R6, R0, R6
  PUSH R6
  LI R6, #2
  DIV R0, R0, R6
  POP R6
  CMPI R6, #0
  JZX dc_bg_56
  ST R4, R2, #7
  JMPX dc_next_57
dc_bg_56:
  CMPI R1, #0
  JNX dc_next_57
  ST R1, R2, #7
dc_next_57:
  LI R6, #2
  MOD R6, R0, R6
  PUSH R6
  LI R6, #2
  DIV R0, R0, R6
  POP R6
  CMPI R6, #0
  JZX dc_bg_58
  ST R4, R2, #6
  JMPX dc_next_59
dc_bg_58:
  CMPI R1, #0
  JNX dc_next_59
  ST R1, R2, #6
dc_next_59:
  LI R6, #2
  MOD R6, R0, R6
  PUSH R6
  LI R6, #2
  DIV R0, R0, R6
  POP R6
  CMPI R6, #0
  JZX dc_bg_60
  ST R4, R2, #5
  JMPX dc_next_61
dc_bg_60:
  CMPI R1, #0
  JNX dc_next_61
  ST R1, R2, #5
dc_next_61:
  LI R6, #2
  MOD R6, R0, R6
  PUSH R6
  LI R6, #2
  DIV R0, R0, R6
  POP R6
  CMPI R6, #0
  JZX dc_bg_62
  ST R4, R2, #4
  JMPX dc_next_63
dc_bg_62:
  CMPI R1, #0
  JNX dc_next_63
  ST R1, R2, #4
dc_next_63:
  LI R6, #2
  MOD R6, R0, R6
  PUSH R6
  LI R6, #2
  DIV R0, R0, R6
  POP R6
  CMPI R6, #0
  JZX dc_bg_64
  ST R4, R2, #3
  JMPX dc_next_65
dc_bg_64:
  CMPI R1, #0
  JNX dc_next_65
  ST R1, R2, #3
dc_next_65:
  LI R6, #2
  MOD R6, R0, R6
  PUSH R6
  LI R6, #2
  DIV R0, R0, R6
  POP R6
  CMPI R6, #0
  JZX dc_bg_66
  ST R4, R2, #2
  JMPX dc_next_67
dc_bg_66:
  CMPI R1, #0
  JNX dc_next_67
  ST R1, R2, #2
dc_next_67:
  LI R6, #2
  MOD R6, R0, R6
  PUSH R6
  LI R6, #2
  DIV R0, R0, R6
  POP R6
  CMPI R6, #0
  JZX dc_bg_68
  ST R4, R2, #1
  JMPX dc_next_69
dc_bg_68:
  CMPI R1, #0
  JNX dc_next_69
  ST R1, R2, #1
dc_next_69:
  CMPI R0, #0
  JZX dc_bg_70
  ST R4, R2, #0
  JMPX dc_next_71
dc_bg_70:
  CMPI R1, #0
  JNX dc_next_71
  ST R1, R2, #0
dc_next_71:
  ADDI R2, R2, #320
  SUBI R5, R5, #1
  JPX dc_row_loop
dc_pop_ret:
  POP R6
  POP R5
dc_ret:
  RET
sys_06:
  LT R0, R8, #-2
  LI R1, #0
  CMPI R0, #6
  JNX sys06_store_font
  LT R1, R7, #23
  CMPI R1, #128
  JNX lds32_pos_72
  SUBI R1, R1, #256
lds32_pos_72:
  MULI R1, R1, #256
  LT R0, R7, #22
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #21
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #20
  ADD R1, R1, R0
sys06_store_font:
  LI R0, #0
  SW R1, R0, #141
  LT R1, R7, #19
  CMPI R1, #128
  JNX lds32_pos_73
  SUBI R1, R1, #256
lds32_pos_73:
  MULI R1, R1, #256
  LT R0, R7, #18
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #17
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #16
  ADD R1, R1, R0
  LI R0, #0
  SW R1, R0, #126
  LT R1, R7, #3
  CMPI R1, #128
  JNX lds32_pos_74
  SUBI R1, R1, #256
lds32_pos_74:
  MULI R1, R1, #256
  LT R0, R7, #2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #1
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #0
  ADD R1, R1, R0
  LT R2, R7, #7
  CMPI R2, #128
  JNX lds32_pos_75
  SUBI R2, R2, #256
lds32_pos_75:
  MULI R2, R2, #256
  LT R0, R7, #6
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #5
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #4
  ADD R2, R2, R0
  LT R3, R7, #11
  CMPI R3, #128
  JNX lds32_pos_76
  SUBI R3, R3, #256
lds32_pos_76:
  MULI R3, R3, #256
  LT R0, R7, #10
  ADD R3, R3, R0
  MULI R3, R3, #256
  LT R0, R7, #9
  ADD R3, R3, R0
  MULI R3, R3, #256
  LT R0, R7, #8
  ADD R3, R3, R0
  LT R4, R7, #12
  CALL sub_draw_char
  LI R0, #0
  JMP sys_push_r0
sys_07:
  LT R0, R8, #-2
  LI R1, #0
  CMPI R0, #6
  JNX sys07_store_font
  LT R1, R7, #23
  CMPI R1, #128
  JNX lds32_pos_77
  SUBI R1, R1, #256
lds32_pos_77:
  MULI R1, R1, #256
  LT R0, R7, #22
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #21
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #20
  ADD R1, R1, R0
sys07_store_font:
  LI R0, #0
  SW R1, R0, #141
  LT R1, R7, #19
  CMPI R1, #128
  JNX lds32_pos_78
  SUBI R1, R1, #256
lds32_pos_78:
  MULI R1, R1, #256
  LT R0, R7, #18
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #17
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #16
  ADD R1, R1, R0
  LI R0, #0
  SW R1, R0, #126
  LT R1, R7, #3
  CMPI R1, #128
  JNX lds32_pos_79
  SUBI R1, R1, #256
lds32_pos_79:
  MULI R1, R1, #256
  LT R2, R7, #2
  ADD R1, R1, R2
  MULI R1, R1, #256
  LT R2, R7, #1
  ADD R1, R1, R2
  MULI R1, R1, #256
  LT R2, R7, #0
  ADD R1, R1, R2
  SW R1, R0, #129
  LT R2, R7, #7
  CMPI R2, #128
  JNX lds32_pos_80
  SUBI R2, R2, #256
lds32_pos_80:
  MULI R2, R2, #256
  LT R1, R7, #6
  ADD R2, R2, R1
  MULI R2, R2, #256
  LT R1, R7, #5
  ADD R2, R2, R1
  MULI R2, R2, #256
  LT R1, R7, #4
  ADD R2, R2, R1
  SW R2, R0, #132
  LT R3, R7, #11
  MULI R3, R3, #256
  LT R0, R7, #10
  ADD R3, R3, R0
  MULI R3, R3, #256
  LT R0, R7, #9
  ADD R3, R3, R0
  MULI R3, R3, #256
  LT R0, R7, #8
  ADD R3, R3, R0
  LI R0, #-8929
  LMI R0, #107
  ADD R3, R3, R0
  LI R0, #0
  SW R3, R0, #135
  LT R4, R7, #12
  SW R4, R0, #138
ds_loop:
  LI R0, #0
  LW R3, R0, #135
  LT R3, R3, #0
  JZX ds_done
  LW R1, R0, #129
  LW R2, R0, #132
  LW R4, R0, #138
  CALL sub_draw_char
  LI R0, #0
  LW R1, R0, #129
  ADDI R1, R1, #8
  SW R1, R0, #129
  LW R3, R0, #135
  ADDI R3, R3, #1
  SW R3, R0, #135
  JMPX ds_loop
ds_done:
  LI R0, #0
  JMP sys_push_r0
sys_08:
  LT R3, R7, #11
  CMPI R3, #128
  JNX lds32_pos_81
  SUBI R3, R3, #256
lds32_pos_81:
  MULI R3, R3, #256
  LT R0, R7, #10
  ADD R3, R3, R0
  MULI R3, R3, #256
  LT R0, R7, #9
  ADD R3, R3, R0
  MULI R3, R3, #256
  LT R0, R7, #8
  ADD R3, R3, R0
  CMPI R3, #0
  JNPX mc_done
  LT R1, R7, #3
  MULI R1, R1, #256
  LT R0, R7, #2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #1
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #0
  ADD R1, R1, R0
  LT R2, R7, #7
  MULI R2, R2, #256
  LT R0, R7, #6
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #5
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #4
  ADD R2, R2, R0
  LI R0, #-8929
  LMI R0, #107
  ADD R1, R1, R0
  ADD R2, R2, R0
  BCOPY R1, R2, R3
mc_done:
  LI R0, #0
  JMP sys_push_r0
sys_09:
  LT R3, R7, #11
  CMPI R3, #128
  JNX lds32_pos_82
  SUBI R3, R3, #256
lds32_pos_82:
  MULI R3, R3, #256
  LT R0, R7, #10
  ADD R3, R3, R0
  MULI R3, R3, #256
  LT R0, R7, #9
  ADD R3, R3, R0
  MULI R3, R3, #256
  LT R0, R7, #8
  ADD R3, R3, R0
  CMPI R3, #0
  JNPX ms_done
  LT R1, R7, #3
  MULI R1, R1, #256
  LT R0, R7, #2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #1
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #0
  ADD R1, R1, R0
  LT R2, R7, #4
  LI R0, #-8929
  LMI R0, #107
  ADD R1, R1, R0
  BFILL R1, R2, R3
ms_done:
  LI R0, #0
  JMP sys_push_r0
sys_10:
  LT R1, R7, #3
  CMPI R1, #128
  JNX lds32_pos_83
  SUBI R1, R1, #256
lds32_pos_83:
  MULI R1, R1, #256
  LT R0, R7, #2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #1
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #0
  ADD R1, R1, R0
  LT R2, R7, #7
  CMPI R2, #128
  JNX lds32_pos_84
  SUBI R2, R2, #256
lds32_pos_84:
  MULI R2, R2, #256
  LT R0, R7, #6
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #5
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #4
  ADD R2, R2, R0
  CMPI R2, #0
  JNPX dsync_done
  MULI R1, R1, #512
  MULI R2, R2, #512
  ADD R2, R1, R2
  ADDI R2, R2, #728
  LI R3, #729
  DIV R1, R1, R3
  DIV R2, R2, R3
  SUB R2, R2, R1
  OUT R1, #17
  MULI R1, R1, #729
  LI R0, #1825
  LMI R0, #213
  ADD R1, R1, R0
  OUT R1, #18
  OUT R2, #19
  LI R1, #2
  OUT R1, #20
dsync_done:
  LI R0, #0
  JMP sys_push_r0
sys_11:
  LI R0, #0
  LT R1, R0, #101
  JZX reboot_now
  LI R1, #0
  OUT R1, #17
  LI R1, #1825
  LMI R1, #213
  OUT R1, #18
  LI R1, #1349
  OUT R1, #19
  LI R1, #2
  OUT R1, #20
reboot_now:
  JMP vm_warm_boot
sys_12:
  LI R0, #0
  LT R1, R0, #103
  JZX net_ret_zero
  LT R2, R7, #7
  CMPI R2, #128
  JNX lds32_pos_85
  SUBI R2, R2, #256
lds32_pos_85:
  MULI R2, R2, #256
  LT R0, R7, #6
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #5
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #4
  ADD R2, R2, R0
  CMPI R2, #0
  JNPX net_ret_zero
  CMPI R2, #512
  JNPX net_tx_len_ok
  LI R2, #512
net_tx_len_ok:
  LT R1, R7, #3
  MULI R1, R1, #256
  LT R0, R7, #2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #1
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #0
  ADD R1, R1, R0
  LI R0, #-8929
  LMI R0, #107
  ADD R1, R1, R0
  MOV R3, R2
net_tx_loop:
  LT R0, R1, #0
  OUT R0, #26
  ADDI R1, R1, #1
  SUBI R3, R3, #1
  JPX net_tx_loop
  OUT R2, #24
  LI R0, #0
  LW R1, R0, #108
  ADDI R1, R1, #1
  SW R1, R0, #108
  MOV R0, R2
  JMP sys_push_r0
sys_13:
  LI R0, #0
  LT R1, R0, #103
  JZX net_ret_zero
  IN R2, #25
  CMPI R2, #0
  JNPX net_ret_zero
  LT R3, R7, #7
  CMPI R3, #128
  JNX lds32_pos_86
  SUBI R3, R3, #256
lds32_pos_86:
  MULI R3, R3, #256
  LT R0, R7, #6
  ADD R3, R3, R0
  MULI R3, R3, #256
  LT R0, R7, #5
  ADD R3, R3, R0
  MULI R3, R3, #256
  LT R0, R7, #4
  ADD R3, R3, R0
  CMP R2, R3
  JNPX net_rx_len_ok
  MOV R2, R3
net_rx_len_ok:
  LT R1, R7, #3
  MULI R1, R1, #256
  LT R0, R7, #2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #1
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #0
  ADD R1, R1, R0
  LI R0, #-8929
  LMI R0, #107
  ADD R1, R1, R0
  MOV R3, R2
net_rx_loop:
  CMPI R3, #0
  JNPX net_rx_done
  IN R0, #27
  ST R0, R1, #0
  ADDI R1, R1, #1
  SUBI R3, R3, #1
  JMPX net_rx_loop
net_rx_done:
  LI R0, #1
  OUT R0, #25
  LI R0, #0
  LW R1, R0, #111
  ADDI R1, R1, #1
  SW R1, R0, #111
  MOV R0, R2
  JMP sys_push_r0
net_ret_zero:
  LI R0, #0
  JMP sys_push_r0
sys_14:
  LT R1, R7, #3
  CMPI R1, #128
  JNX lds32_pos_87
  SUBI R1, R1, #256
lds32_pos_87:
  MULI R1, R1, #256
  LT R0, R7, #2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #1
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #0
  ADD R1, R1, R0
  LI R0, #0
  CMPI R1, #0
  JZX ni_get_node
  CMPI R1, #1
  JZX ni_set_node
  CMPI R1, #2
  JZX ni_get_tx
  LW R0, R0, #111
  JMP sys_push_r0
ni_get_node:
  LW R0, R0, #105
  JMP sys_push_r0
ni_set_node:
  LT R2, R7, #7
  MULI R2, R2, #256
  LT R0, R7, #6
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #5
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #4
  ADD R2, R2, R0
  LI R0, #0
  SW R2, R0, #105
  MOV R0, R2
  JMP sys_push_r0
ni_get_tx:
  LW R0, R0, #108
  JMP sys_push_r0
sys_15:
  LI R0, #0
  JMP sys_push_r0
sys_16:
  LT R1, R7, #3
  CMPI R1, #128
  JNX lds32_pos_88
  SUBI R1, R1, #256
lds32_pos_88:
  MULI R1, R1, #256
  LT R0, R7, #2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #1
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #0
  ADD R1, R1, R0
  CMPI R1, #0
  JZX mi_0
  CMPI R1, #1
  JZX mi_1
  CMPI R1, #2
  JZX mi_2
  CMPI R1, #4
  JZX mi_4
  LI R0, #0
  LW R0, R0, #105
  JMP sys_push_r0
mi_0:
  LI R0, #3
  JMP sys_push_r0
mi_1:
  LI R0, #1825
  LMI R0, #213
  JMP sys_push_r0
mi_2:
  MOV R0, R5
  JMP sys_push_r0
mi_4:
  LI R0, #0
  LT R0, R0, #103
  JMP sys_push_r0
sys_17:
  LT R1, R7, #3
  CMPI R1, #128
  JNX lds32_pos_89
  SUBI R1, R1, #256
lds32_pos_89:
  MULI R1, R1, #256
  LT R0, R7, #2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #1
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #0
  ADD R1, R1, R0
  LT R2, R7, #7
  CMPI R2, #128
  JNX lds32_pos_90
  SUBI R2, R2, #256
lds32_pos_90:
  MULI R2, R2, #256
  LT R0, R7, #6
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #5
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #4
  ADD R2, R2, R0
  LT R3, R7, #11
  CMPI R3, #128
  JNX lds32_pos_91
  SUBI R3, R3, #256
lds32_pos_91:
  MULI R3, R3, #256
  LT R0, R7, #10
  ADD R3, R3, R0
  MULI R3, R3, #256
  LT R0, R7, #9
  ADD R3, R3, R0
  MULI R3, R3, #256
  LT R0, R7, #8
  ADD R3, R3, R0
  LT R4, R7, #15
  CMPI R4, #128
  JNX lds32_pos_92
  SUBI R4, R4, #256
lds32_pos_92:
  MULI R4, R4, #256
  LT R0, R7, #14
  ADD R4, R4, R0
  MULI R4, R4, #256
  LT R0, R7, #13
  ADD R4, R4, R0
  MULI R4, R4, #256
  LT R0, R7, #12
  ADD R4, R4, R0
  CMPI R3, #0
  JNPX br_done
  CMPI R4, #0
  JNPX br_done
  LT R0, R7, #19
  MULI R0, R0, #256
  LT R1, R7, #18
  ADD R0, R0, R1
  MULI R0, R0, #256
  LT R1, R7, #17
  ADD R0, R0, R1
  MULI R0, R0, #256
  LT R1, R7, #16
  ADD R0, R0, R1
  LI R1, #-8929
  LMI R1, #107
  ADD R1, R0, R1
  LT R0, R7, #3
  CMPI R0, #128
  JNX lds32_pos_93
  SUBI R0, R0, #256
lds32_pos_93:
  MULI R0, R0, #256
  LT R2, R7, #2
  ADD R0, R0, R2
  MULI R0, R0, #256
  LT R2, R7, #1
  ADD R0, R0, R2
  MULI R0, R0, #256
  LT R2, R7, #0
  ADD R0, R0, R2
  MULI R2, R2, #320
  ADD R2, R2, R0
  LI R0, #9644
  LMI R0, #156
  ADD R2, R2, R0
br_row_loop:
  MOV R0, R2
  PUSH R3
  BCOPY R0, R1, R3
  POP R3
  ADDI R2, R2, #320
  SUBI R4, R4, #1
  JPX br_row_loop
br_done:
  LI R0, #0
  JMP sys_push_r0
sys_18:
  LT R1, R7, #3
  MULI R1, R1, #256
  LT R0, R7, #2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #1
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #0
  ADD R1, R1, R0
  LT R2, R7, #7
  MULI R2, R2, #256
  LT R0, R7, #6
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #5
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #4
  ADD R2, R2, R0
  LI R0, #-8929
  LMI R0, #107
  ADD R1, R1, R0
  ADD R2, R2, R0
sc_loop:
  LT R3, R1, #0
  LT R4, R2, #0
  CMP R3, R4
  JNZX sc_diff
  CMPI R3, #0
  JZX sc_same
  ADDI R1, R1, #1
  ADDI R2, R2, #1
  JMPX sc_loop
sc_diff:
  LI R0, #0
  JMP sys_push_r0
sc_same:
  LI R0, #1
  JMP sys_push_r0
sys_19:
  LT R1, R7, #3
  MULI R1, R1, #256
  LT R0, R7, #2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #1
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #0
  ADD R1, R1, R0
  LI R0, #-8929
  LMI R0, #107
  ADD R1, R1, R0
  LI R0, #0
sl_loop:
  LT R2, R1, #0
  JZX sys_push_r0
  ADDI R0, R0, #1
  ADDI R1, R1, #1
  JMPX sl_loop
sys_20:
  LT R2, R7, #7
  MULI R2, R2, #256
  LT R0, R7, #6
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #5
  ADD R2, R2, R0
  MULI R2, R2, #256
  LT R0, R7, #4
  ADD R2, R2, R0
  LI R0, #-8929
  LMI R0, #107
  ADD R2, R2, R0
  LT R3, R7, #11
  CMPI R3, #128
  JNX lds32_pos_94
  SUBI R3, R3, #256
lds32_pos_94:
  MULI R3, R3, #256
  LT R0, R7, #10
  ADD R3, R3, R0
  MULI R3, R3, #256
  LT R0, R7, #9
  ADD R3, R3, R0
  MULI R3, R3, #256
  LT R0, R7, #8
  ADD R3, R3, R0
  LT R1, R7, #3
  CMPI R1, #128
  JNX lds32_pos_95
  SUBI R1, R1, #256
lds32_pos_95:
  MULI R1, R1, #256
  LT R0, R7, #2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #1
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #0
  ADD R1, R1, R0
  CMPI R1, #0
  JNZX itoa_nonzero
  LI R4, #48
  ST R4, R2, #0
  LI R4, #0
  ST R4, R2, #1
  LI R0, #1
  JMP sys_push_r0
itoa_nonzero:
  LI R4, #0
  CMPI R3, #10
  JNZX itoa_unsigned
  CMPI R1, #0
  JNNX itoa_pos
  LI R4, #1
  NEG R1, R1
  JMPX itoa_pos
itoa_unsigned:
  LT R1, R7, #3
  MULI R1, R1, #256
  LT R0, R7, #2
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #1
  ADD R1, R1, R0
  MULI R1, R1, #256
  LT R0, R7, #0
  ADD R1, R1, R0
itoa_pos:
  PUSH R5
  PUSH R6
  LI R5, #0
itoa_div_loop:
  CMPI R1, #0
  JZX itoa_div_done
  MOD R0, R1, R3
  DIV R1, R1, R3
  CMPI R0, #10
  JNX itoa_dec_dig
  ADDI R0, R0, #55
  JMPX itoa_push_dig
itoa_dec_dig:
  ADDI R0, R0, #48
itoa_push_dig:
  PUSH R0
  ADDI R5, R5, #1
  JMPX itoa_div_loop
itoa_div_done:
  MOV R6, R5
  CMPI R4, #0
  JZX itoa_pop_loop
  LI R0, #45
  ST R0, R2, #0
  ADDI R2, R2, #1
  ADDI R6, R6, #1
itoa_pop_loop:
  CMPI R5, #0
  JZX itoa_finish
  POP R0
  ST R0, R2, #0
  ADDI R2, R2, #1
  SUBI R5, R5, #1
  JMPX itoa_pop_loop
itoa_finish:
  LI R0, #0
  ST R0, R2, #0
  MOV R0, R6
  POP R6
  POP R5
  JMP sys_push_r0
sys_21:
  LI R3, #1
ts21_find_loop:
  MULI R4, R3, #32
  LI R0, #-4064
  LMI R0, #160
  ADD R4, R0, R4
  LT R0, R4, #0
  CMPI R0, #1
  JNZX ts21_found
  ADDI R3, R3, #1
  CMPI R3, #8
  JNX ts21_find_loop
  LI R0, #-1086
  LMI R0, #1694
  LHI R0, #11
  JMP sys_push_r0
ts21_found:
  LI R0, #0
  SW R3, R0, #126
  SW R4, R0, #129
  LI R1, #4893
  LMI R1, #1
  MUL R1, R3, R1
  LI R2, #-8041
  LMI R2, #67
  ADD R1, R1, R2
  SW R1, R0, #132
  LI R2, #-8929
  LMI R2, #107
  ADD R2, R1, R2
  LW R0, R7, #4
  SW R0, R2, #0
  LT R0, R7, #7
  ST R0, R2, #3
  LI R0, #0
  LW R3, R0, #126
  MULI R2, R3, #8192
  LI R0, #4822
  LMI R0, #78
  ADD R2, R2, R0
  LI R0, #0
  SW R2, R0, #135
  LI R0, #-8929
  LMI R0, #107
  ADD R2, R2, R0
  LI R0, #255
  ST R0, R2, #0
  ST R0, R2, #1
  ST R0, R2, #2
  ST R0, R2, #3
  LI R0, #0
  LW R1, R0, #132
  LI R4, #256
  MOD R3, R1, R4
  ST R3, R2, #4
  DIV R1, R1, R4
  MOD R3, R1, R4
  ST R3, R2, #5
  DIV R1, R1, R4
  MOD R3, R1, R4
  ST R3, R2, #6
  DIV R1, R1, R4
  MOD R3, R1, R4
  ST R3, R2, #7
  LI R0, #0
  LW R4, R0, #129
  LI R1, #1
  ST R1, R4, #0
  LI R1, #0
  ST R1, R4, #1
  ST R1, R4, #2
  ST R1, R4, #3
  LW R0, R7, #0
  SW R0, R4, #4
  LT R0, R7, #3
  ST R0, R4, #7
  LW R0, R7, #0
  SW R0, R4, #24
  LT R0, R7, #3
  ST R0, R4, #27
  LI R0, #0
  LW R1, R0, #132
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R4, #12
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #13
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #14
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #15
  LI R0, #0
  LW R1, R0, #132
  ADDI R1, R1, #4
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R4, #8
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #9
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #10
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #11
  LI R0, #0
  LW R1, R0, #135
  ADDI R1, R1, #8
  LI R3, #256
  MOD R2, R1, R3
  ST R2, R4, #16
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #17
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #18
  DIV R1, R1, R3
  MOD R2, R1, R3
  ST R2, R4, #19
  LI R0, #0
  SW R0, R4, #20
  ST R0, R4, #23
  SW R0, R4, #28
  ST R0, R4, #31
  LI R1, #-3804
  LMI R1, #160
  LT R2, R1, #0
  ADDI R2, R2, #1
  ST R2, R1, #0
  LI R0, #0
  LW R0, R0, #126
  JMP sys_push_r0
vm_task_exit_or_halt:
  LT R0, R7, #-1
  CMPI R0, #128
  JNX lds32_pos_96
  SUBI R0, R0, #256
lds32_pos_96:
  MULI R0, R0, #256
  LT R1, R7, #-2
  ADD R0, R0, R1
  MULI R0, R0, #256
  LT R1, R7, #-3
  ADD R0, R0, R1
  MULI R0, R0, #256
  LT R1, R7, #-4
  ADD R0, R0, R1
  LI R1, #-3808
  LMI R1, #160
  LT R2, R1, #0
  CMPI R2, #0
  JZX vm_halt_with_r0
  LI R3, #0
  SW R2, R3, #126
  MULI R3, R2, #32
  LI R4, #-4064
  LMI R4, #160
  ADD R4, R4, R3
  LI R3, #2
  ST R3, R4, #0
  LI R2, #-1085
  LMI R2, #1694
  LHI R2, #11
  MOD R0, R0, R2
  JNNX wrap_nn_97
  ADD R0, R0, R2
wrap_nn_97:
  LI R3, #256
  MOD R2, R0, R3
  ST R2, R4, #28
  DIV R0, R0, R3
  MOD R2, R0, R3
  ST R2, R4, #29
  DIV R0, R0, R3
  MOD R2, R0, R3
  ST R2, R4, #30
  DIV R0, R0, R3
  MOD R2, R0, R3
  ST R2, R4, #31
  LT R2, R1, #4
  SUBI R2, R2, #1
  ST R2, R1, #4
  JMP sched_pick_next
vm_halt_bad_op:
  LI R0, #-99
vm_halt_with_r0:
  PUSH R0
  LI R1, #-4288
  LMI R1, #160
  MOV R2, R5
  LI R4, #256
  MOD R3, R2, R4
  ST R3, R1, #0
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #1
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #2
  DIV R2, R2, R4
  MOD R3, R2, R4
  ST R3, R1, #3
  POP R0
  LI R2, #-1085
  LMI R2, #1694
  LHI R2, #11
  MOD R0, R0, R2
  JNNX wrap_nn_98
  ADD R0, R0, R2
wrap_nn_98:
  LI R1, #-4280
  LMI R1, #160
  LI R3, #256
  MOD R2, R0, R3
  ST R2, R1, #0
  DIV R0, R0, R3
  MOD R2, R0, R3
  ST R2, R1, #1
  DIV R0, R0, R3
  MOD R2, R0, R3
  ST R2, R1, #2
  DIV R0, R0, R3
  MOD R2, R0, R3
  ST R2, R1, #3
  LI R1, #-4276
  LMI R1, #160
  LI R2, #1
  ST R2, R1, #0
  HALT
sys_22:
  LI R0, #0
  JMP sys_push_r0
.org 9300
embedded_font_serif:
  .tryte #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0
  .tryte #0, #48, #48, #48, #48, #48, #16, #16, #0, #0, #48, #48, #0, #0, #0, #0
  .tryte #0, #102, #102, #68, #68, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0
  .tryte #0, #0, #68, #68, #254, #68, #68, #254, #68, #68, #0, #0, #0, #0, #0, #0
  .tryte #0, #16, #124, #146, #144, #120, #20, #18, #146, #124, #16, #0, #0, #0, #0, #0
  .tryte #0, #0, #196, #200, #16, #16, #32, #32, #76, #140, #0, #0, #0, #0, #0, #0
  .tryte #0, #56, #68, #68, #56, #80, #138, #132, #140, #114, #0, #0, #0, #0, #0, #0
  .tryte #0, #48, #48, #64, #64, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0
  .tryte #0, #12, #16, #32, #32, #64, #64, #64, #32, #32, #16, #12, #0, #0, #0, #0
  .tryte #0, #96, #16, #8, #8, #4, #4, #4, #8, #8, #16, #96, #0, #0, #0, #0
  .tryte #0, #0, #0, #16, #84, #56, #124, #56, #84, #16, #0, #0, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #16, #16, #124, #16, #16, #0, #0, #0, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #48, #48, #16, #32, #0, #0
  .tryte #0, #0, #0, #0, #0, #0, #0, #124, #0, #0, #0, #0, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #48, #48, #0, #0, #0, #0
  .tryte #0, #4, #4, #8, #8, #16, #16, #32, #32, #64, #64, #128, #0, #0, #0, #0
  .tryte #0, #56, #68, #134, #138, #146, #162, #194, #130, #130, #68, #56, #0, #0, #0, #0
  .tryte #0, #16, #48, #80, #16, #16, #16, #16, #16, #16, #16, #124, #0, #0, #0, #0
  .tryte #0, #120, #132, #132, #4, #8, #16, #32, #64, #128, #132, #252, #0, #0, #0, #0
  .tryte #0, #120, #132, #4, #4, #56, #4, #4, #4, #132, #132, #120, #0, #0, #0, #0
  .tryte #0, #8, #24, #40, #72, #136, #136, #252, #8, #8, #8, #60, #0, #0, #0, #0
  .tryte #0, #252, #132, #128, #128, #248, #4, #4, #4, #132, #132, #120, #0, #0, #0, #0
  .tryte #0, #56, #68, #128, #128, #248, #132, #132, #132, #132, #68, #56, #0, #0, #0, #0
  .tryte #0, #252, #132, #4, #8, #8, #16, #16, #32, #32, #32, #56, #0, #0, #0, #0
  .tryte #0, #120, #132, #132, #72, #48, #48, #72, #132, #132, #132, #120, #0, #0, #0, #0
  .tryte #0, #120, #132, #132, #132, #132, #124, #4, #4, #8, #72, #48, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #48, #48, #0, #0, #0, #48, #48, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #48, #48, #0, #0, #0, #48, #48, #16, #32, #0, #0
  .tryte #0, #0, #0, #8, #16, #32, #64, #32, #16, #8, #0, #0, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #124, #0, #0, #124, #0, #0, #0, #0, #0, #0, #0
  .tryte #0, #0, #0, #64, #32, #16, #8, #16, #32, #64, #0, #0, #0, #0, #0, #0
  .tryte #0, #120, #132, #132, #4, #8, #16, #16, #0, #0, #16, #16, #0, #0, #0, #0
  .tryte #0, #120, #132, #132, #188, #164, #164, #188, #128, #128, #64, #60, #0, #0, #0, #0
  .tryte #0, #56, #40, #68, #68, #68, #130, #254, #130, #130, #130, #198, #0, #0, #0, #0
  .tryte #0, #248, #68, #68, #68, #120, #68, #66, #66, #66, #68, #248, #0, #0, #0, #0
  .tryte #0, #60, #68, #132, #128, #128, #128, #128, #128, #132, #68, #56, #0, #0, #0, #0
  .tryte #0, #248, #68, #66, #66, #66, #66, #66, #66, #66, #68, #248, #0, #0, #0, #0
  .tryte #0, #252, #68, #64, #80, #112, #80, #64, #64, #64, #68, #252, #0, #0, #0, #0
  .tryte #0, #252, #68, #64, #80, #112, #80, #64, #64, #64, #64, #224, #0, #0, #0, #0
  .tryte #0, #60, #68, #132, #128, #128, #156, #132, #132, #132, #68, #56, #0, #0, #0, #0
  .tryte #0, #198, #68, #68, #68, #68, #124, #68, #68, #68, #68, #198, #0, #0, #0, #0
  .tryte #0, #124, #16, #16, #16, #16, #16, #16, #16, #16, #16, #124, #0, #0, #0, #0
  .tryte #0, #62, #8, #8, #8, #8, #8, #8, #136, #136, #136, #112, #0, #0, #0, #0
  .tryte #0, #198, #72, #80, #96, #64, #96, #80, #72, #68, #68, #198, #0, #0, #0, #0
  .tryte #0, #224, #64, #64, #64, #64, #64, #64, #64, #64, #68, #252, #0, #0, #0, #0
  .tryte #0, #198, #238, #84, #84, #84, #68, #68, #68, #68, #68, #198, #0, #0, #0, #0
  .tryte #0, #198, #100, #84, #84, #76, #76, #68, #68, #68, #68, #198, #0, #0, #0, #0
  .tryte #0, #56, #68, #130, #130, #130, #130, #130, #130, #130, #68, #56, #0, #0, #0, #0
  .tryte #0, #248, #68, #68, #68, #68, #248, #64, #64, #64, #64, #224, #0, #0, #0, #0
  .tryte #0, #56, #68, #130, #130, #130, #130, #130, #146, #138, #70, #58, #0, #0, #0, #0
  .tryte #0, #248, #68, #68, #68, #68, #248, #80, #72, #68, #68, #198, #0, #0, #0, #0
  .tryte #0, #124, #132, #128, #64, #56, #4, #4, #4, #132, #132, #248, #0, #0, #0, #0
  .tryte #0, #254, #146, #16, #16, #16, #16, #16, #16, #16, #16, #56, #0, #0, #0, #0
  .tryte #0, #198, #68, #68, #68, #68, #68, #68, #68, #68, #68, #56, #0, #0, #0, #0
  .tryte #0, #198, #68, #68, #68, #68, #68, #40, #40, #40, #16, #16, #0, #0, #0, #0
  .tryte #0, #198, #68, #68, #68, #84, #84, #84, #84, #40, #40, #40, #0, #0, #0, #0
  .tryte #0, #198, #68, #40, #40, #16, #16, #16, #40, #40, #68, #198, #0, #0, #0, #0
  .tryte #0, #198, #68, #40, #40, #16, #16, #16, #16, #16, #16, #56, #0, #0, #0, #0
  .tryte #0, #252, #132, #8, #8, #16, #32, #32, #64, #128, #132, #252, #0, #0, #0, #0
  .tryte #0, #56, #32, #32, #32, #32, #32, #32, #32, #32, #32, #56, #0, #0, #0, #0
  .tryte #0, #128, #128, #64, #64, #32, #32, #16, #16, #8, #8, #4, #0, #0, #0, #0
  .tryte #0, #56, #8, #8, #8, #8, #8, #8, #8, #8, #8, #56, #0, #0, #0, #0
  .tryte #0, #16, #40, #68, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #254, #0, #0, #0
  .tryte #0, #32, #16, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #120, #132, #4, #124, #132, #132, #124, #0, #0, #0, #0
  .tryte #0, #192, #64, #64, #64, #120, #68, #66, #66, #66, #68, #248, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #120, #132, #128, #128, #128, #132, #120, #0, #0, #0, #0
  .tryte #0, #12, #4, #4, #4, #60, #68, #132, #132, #132, #68, #60, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #120, #132, #132, #252, #128, #132, #120, #0, #0, #0, #0
  .tryte #0, #28, #36, #32, #32, #124, #32, #32, #32, #32, #32, #112, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #124, #136, #136, #112, #128, #124, #132, #132, #68, #56, #0
  .tryte #0, #192, #64, #64, #64, #88, #100, #68, #68, #68, #68, #204, #0, #0, #0, #0
  .tryte #0, #0, #16, #0, #0, #48, #16, #16, #16, #16, #16, #56, #0, #0, #0, #0
  .tryte #0, #0, #8, #0, #0, #24, #8, #8, #8, #8, #8, #8, #136, #136, #112, #0
  .tryte #0, #192, #64, #64, #64, #76, #80, #96, #80, #72, #72, #204, #0, #0, #0, #0
  .tryte #0, #32, #96, #32, #32, #32, #32, #32, #32, #32, #32, #112, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #212, #84, #84, #84, #84, #84, #214, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #216, #68, #68, #68, #68, #68, #204, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #120, #132, #132, #132, #132, #132, #120, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #248, #68, #68, #68, #68, #68, #120, #64, #64, #224, #0
  .tryte #0, #0, #0, #0, #0, #124, #136, #136, #136, #136, #136, #120, #8, #8, #28, #0
  .tryte #0, #0, #0, #0, #0, #220, #68, #64, #64, #64, #64, #224, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #124, #132, #64, #56, #4, #132, #248, #0, #0, #0, #0
  .tryte #0, #0, #0, #32, #32, #124, #32, #32, #32, #32, #36, #24, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #204, #68, #68, #68, #68, #76, #54, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #204, #72, #72, #72, #48, #48, #48, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #198, #68, #84, #84, #84, #40, #40, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #204, #72, #48, #48, #48, #72, #204, #0, #0, #0, #0
  .tryte #0, #0, #0, #0, #0, #204, #72, #72, #48, #48, #16, #16, #32, #64, #192, #0
  .tryte #0, #0, #0, #0, #0, #252, #136, #16, #32, #64, #136, #252, #0, #0, #0, #0
  .tryte #0, #24, #32, #32, #32, #64, #64, #32, #32, #32, #32, #24, #0, #0, #0, #0
  .tryte #0, #16, #16, #16, #16, #16, #16, #16, #16, #16, #16, #16, #0, #0, #0, #0
  .tryte #0, #48, #8, #8, #8, #4, #4, #8, #8, #8, #8, #48, #0, #0, #0, #0
  .tryte #0, #0, #0, #100, #152, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0, #0
  .tryte #0, #0, #0, #56, #84, #146, #146, #146, #84, #56, #0, #0, #0, #0, #0, #0
