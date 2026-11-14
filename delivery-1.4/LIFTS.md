# SpiralOS 1.4 "Daily Driver" — Code Provenance & Lifts (`LIFTS.md`)

Every piece of code carried over or adapted from attached reference files carries an inline provenance comment naming its source file and line range, and is catalogued below:

| Target File | Target Lines | Source File & Line Range | Description |
|---|---|---|---|
| `os/net.sp` | `1-85` | `studionet/STUDIONET-1.0.md:1-310` | StudioNet 1.0 frame header layout, FNV-1a checksum (`0x811C9DC5`), SNS/SDP/SRRP constants |
| `os/net.sp` | `86-390` | `studionet/studionet-ref.js:235-485` (ported to SpiralC) | SNS `NameAgent` naming state machine, peer table, age extrapolation, tie-breaking, `sns_resolve` |
| `os/net.sp` | `391-780` | `studionet/STUDIONET-1.0.md:195-310` | SRRP/1.0 client & server, SACK bitmask, adaptive `cwnd`, `trytes16`, `SpiralHttpd` (`/www`, `/inbox`, `/share`) |
| `os/apps2.sp` | `94-185` | `shared/deals-ref.js:1-95`, `shared/DEALS.md:1-120` | Integer-only MINSTD (`48271`) `cnsw_next_rand`, `cnsw_shuffle`, and MS FreeCell `ms_freecell_deal` (1..32000) |
| `tools/rasterize-splash.js` | `1-185` | `cnsw-mark.svg:1-38`, `cnsw-lockup.svg:1-42` | Build-time rasterizer converting CNSW mark polygons into 8-bpp palette bitmap `/art/cnsw.pic` |
| `core/core_tc32.js`, `core/core_x86.js`, `core/core_triton.js`, `tabcomp.html`, `index.html` | Font tables | `fonts/consciousnode-sans-8x8.hex:1-96`, `fonts/cnsw-serif-8x16.hex:1-96` | Studio 8×8 UI font (ConsciousNode Sans) and 8×16 document font (CNSW Serif) |
| `triton/spiralos-triton.html` | `1-9650` | `triton/spiralos-triton.html:1-9620` | Triton 3.1 host page updated with 1.4 disk bundle and StudioNet hardware Node ID control |

## `tabcomp.html` StudioNet Node ID Control Placement Diff

In `tabcomp.html`, line 2633 inside `buildHTMLFromPristine` (`const out = ... + "</script>\n</body>\n</html>\n";`) was restored untouched, and the StudioNet 1.0 hardware Node ID control was placed solely before the document's closing `</body>` tag at the end of `tabcomp.html`:

```diff
@@ -2630,7 +2630,7 @@
     const coreText = document.getElementById('tc-core').textContent;
     const out = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>TabComp — Self-Contained SpiralOS Cartridge</title>\n<style id="tc-style">' +
       styleText + '</style>\n</head>\n<body>\n' + bodyMarkup +
-      '<script type="application/x-tabcomp-disk" id="tc-disk">' + diskB64 + '</script>\n<script id="tc-core">' + coreText + '</script>\n</body>\n</html>\n';
+      '<script type="application/x-tabcomp-disk" id="tc-disk">' + diskB64 + '</script>\n<script id="tc-core">' + coreText + '</script>\n</body>\n</html>\n';
     return out;
   }
@@ -3995,4 +3995,43 @@
+<div id="studionet-node-bar" style="position:fixed;bottom:8px;right:8px;z-index:9999;background:#141824;color:#d8e2ff;border:1px solid #3a4668;padding:4px 8px;font:12px monospace;border-radius:4px;">
+  <label for="studionet-node-id-input">StudioNet Node ID:</label>
+  <input id="studionet-node-id-input" type="text" value="0x0001" style="width:64px;background:#0b0e17;color:#7cf0a8;border:1px solid #3a4668;font:12px monospace;padding:1px 4px;" />
+</div>
+<script>
+(function() {
+  function parseNodeParam() { ... }
+  function applyHardwareNodeId(nid) { ... }
+})();
+</script>
 </body>
 </html>
```
