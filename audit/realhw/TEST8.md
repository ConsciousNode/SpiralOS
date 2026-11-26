# Real-hardware test 8: SpiralOS 1.6.1 on Kham's Toshiba (2026-11-26)

Image: `delivery-1.6.1/spiralos-1.6.1.img` (sha256 `1a7deae3…42f1`), written to USB. Reported by Kham at 06:14 ET,
recorded by Kehai.

| Area | Result |
|---|---|
| `shutdown` | **Works** ("It works! Woohoo!"). The 1.6 full restart is gone. That confirms the 1.6.1 audit's root cause on real hardware: 1.6's 8-bit `jc` in the APM helper jumped into the middle of other code on a machine without APM and restarted it. Whether the laptop powered off through ACPI S5 or halted on "It is now safe to turn off your computer" is not yet recorded. |
| Notes New / scroll, mouse log, Zork | Not reported yet. |
