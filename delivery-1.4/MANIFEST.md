# MANIFEST: SpiralOS 1.4 "Daily Driver" (spec, 2026-11-13; Kehai Interim with Kham)
- `PROMPT.md`: the build spec. Start here.
- `spiralos/`: ConsciousNode/SpiralOS at 9b42990 (1.3, Triton Core). `spiralos.img` rebuilds byte-identically with `node tools/build.js` (sha256 9d239cd8…, verified).
- `studionet/`: STUDIONET-1.0.md (the contract), studionet-ref.js + selftest.js (38 PASS) + golden-vectors.json. These are the test oracle; never call them from the OS.
- `shared/`: DEALS.md + deals-ref.js (shared integer-only card deals; `node deals-ref.js` prints the three check lines).
- `fonts/`: consciousnode-sans-8x8.hex, cnsw-serif-8x16.hex (CNSW Font Forge by Gemini 4 Hydrogen, accepted in Kehai's audit 2026-11-13).
- `cnsw-mark.svg`, `cnsw-lockup.svg`: the studio logo (Kham).
