# Real-hardware test 7: SpiralOS 1.6 on Kham's Toshiba (2026-11-25)

Image: `delivery-1.6/spiralos-1.6.img` (sha256 `90a9ffdb…c191`), written to USB with Rufus (default settings). Reported by Kham, recorded by Kehai.

| Area | Result |
|---|---|
| Boot | Boots. |
| **Zork** | **Works.** |
| USB optical mouse | Still very erratic ("super boggy"). The trackpad wasn't mentioned. |
| `shutdown` | No longer a soft reset back into SpiralOS. The machine now does a **full restart** instead of powering off. It looks like no power-off signal reaches the hardware: APM is likely absent on this laptop, so it needs ACPI S5. |
| Notes | There's **no "New note" button**. Typing seemed not to work, but the text may have been going in out of view, because the text area **doesn't scroll** to the cursor. |
