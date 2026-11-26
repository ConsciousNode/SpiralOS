#!/usr/bin/env python3
"""Kehai, SpiralOS 1.6.1 audit: positive control for the APM fix. Puts 1.6's 8-bit `jc` back into the stage-2 APM
helper of a copy of the 1.6.1 tree (core/core_x86.js), then run `node tests/spiralos-161.js` in that copy: test 1's
missing-_S5_ control (no ACPI _S5_, APM unsupported) must now fail to halt.  Usage: mutant-apm-shortjump.py <tree-copy>"""
import sys, pathlib
p = pathlib.Path(sys.argv[1]) / "core/core_x86.js"; s = p.read_text()
new = "  put(0x0F, 0x82);                   // jc near wr_ok (APM unsupported -> return cleanly)\n  const jcApmFail1 = p; put16(0);"
old = "  const jcApmFail1 = p + 1;\n  put(0x72, 0);                      // MUTANT: 1.6 short jc"
assert new in s; s = s.replace(new, old)
a = "  dv.setInt16(jcApmFail1, p - (jcApmFail1 + 2), true);"
assert a in s; s = s.replace(a, "  b[jcApmFail1] = (p - (jcApmFail1 + 1)) & 0xFF;")
p.write_text(s); print("mutant applied")
