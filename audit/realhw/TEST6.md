# Real-hardware test 6: SpiralOS 1.5 on the Toshiba (Kham, 2026-11-16 ~15:30)

## Kham's report
- **Boots.** Almost everything tried worked perfectly:
  - creating a new directory and a new file
  - scrolling
  - the start menu / launcher
  - "it looks so good"
- ❌ **`shutdown` acts like a soft reboot.** The OS restarts without going back to the BIOS.
- ❌ **Space in Notes opens the save dialog.**

## Diagnosis (Kehai, from source)

### Notes: Space opens a dialog. Root cause found; the 1.5 report was wrong on this point.
- `app_draw_notes` registers its 7 toolbar buttons (Open, Save, SvAs, Find, Wrap, Cp, Ps) **before** its text area (`gui_reg_ctl(4, ty - y, tw, th, 0)` at `os/apps1.sp:1503`). So when Notes opens, focus index 0 is the **Open** button.
- `os/os.sp:298` makes Enter or Space on a focused button press that button. So the first Space (or Enter) opens the Open dialog, which shares the Save/Open dialog UI.
- **REPORT §4.3 claims** the text areas were registered as control 0 in `app_draw_edit`, `app_draw_notes` and `app_draw_chat`. **That's true for Edit and false for Notes.**
- **Why the suite missed it:** the §5 scenario types `HEADER_CROSS_APP_CLIP_TOKEN` (no spaces) after Ctrl+A.
- **Fix:** register the text area before the `wbtn` calls.
- **Test to add:** open Notes fresh, type "a b", press Enter, and assert the buffer contains it with no dialog open.

### Shutdown restarts the OS. Root cause not found yet.
- **Not the timer interrupt.** `vm_halt_with_eax` → `halt_spin: hlt; jmp halt_spin`. The IRQ0 ISR only bumps ticks and returns with `iretd`, so it returns to the spin loop. That theory is ruled out.
- **Suspect:** the disk flush. On x86 from USB, `os_shutdown` calls `hal_disk_sync(320, 8)`, then `hal_disk_sync(0xFFFF, 1)` when `g_machine_id == 2`, through the INT 13h real-mode thunk. A bad thunk return could re-enter the boot path, which would restart without POST.
- **Why the suite missed it:** the shutdown test only runs on TabComp (`createTabCompDriver`). It never runs on x86.
- **Questions for Kham:**
  1. Does "It is now safe to turn off your computer" appear, even briefly?
  2. After the restart, does unsaved Notes text (or a new file) survive? In other words, did the flush happen?
