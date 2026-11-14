# SpiralOS 1.4 "Daily Driver": StudioNet 1.0, everyday apps, and a games shelf

ConsciousNode SoftWorks, MIT. Xinu rules: single-file pages, zero dependencies, offline. The only network API is `BroadcastChannel("studionet-v1")`. **Inline everything, and label every inline:** code carried over from an attached file keeps a provenance comment naming its source file and line range, and is listed in `LIFTS.md`.

SpiralOS is our own from-scratch OS. It runs on TabComp (TC-32 core), on Hummingbird and real PCs (x86 core), and on Triton (balanced-ternary core). This release turns it into a machine you can live in. It talks to every other studio machine by name, its everyday apps save and open real files, and it gets a proper games shelf.

## Attached

- **`spiralos/`**: the SpiralOS repo at 1.3 (Triton Core), with `os/*.sp`, `core/*`, `compiler/*`, `tools/*`, `tabcomp.html`, `hummingbird.html`, `index.html`, `tests/*`.
- **`studionet/STUDIONET-1.0.md`**: **the protocol contract.** Implement it exactly.
- **`studionet/studionet-ref.js`**: the reference implementation (pure JS) and the **oracle** for your tests. Use it in the *test harness* as the peer your OS talks to. **Never** call it from inside SpiralOS or from the emulators: the OS must implement StudioNet itself, in SpiralC.
- **`studionet/golden-vectors.json`** and **`selftest.js`**: byte-exact frames, messages and naming scenarios. `node selftest.js` must keep passing unchanged.
- **`fonts/consciousnode-sans-8x8.hex`**, **`fonts/cnsw-serif-8x16.hex`**: the new studio fonts (same byte layout as the current font: row 0 first, bit 7 = leftmost pixel, ASCII 32..127).
- **`cnsw-mark.svg`**: the ConsciousNode SoftWorks logo, for the boot splash (`cnsw-lockup.svg` shows the intended mark-over-wordmark arrangement; set the wordmark in ConsciousNode Sans, not a system font).
- **`shared/DEALS.md`** and **`shared/deals-ref.js`**: the shared card-deal generators. They are integer-only so the balanced-ternary Triton runs them identically, and TritOS uses the same ones.

## Part A: StudioNet 1.0 (`os/net.sp` and friends)

Implement **every MUST in STUDIONET-1.0.md for a SpiralOS node**:

- **SNS** (proto 1, port 53): HELLO/WHO/BYE, the peer table (at least 8 entries, with stale marking), and the **naming rules of §3.4** exactly as `studionet-ref.js`'s `NameAgent` behaves:
  - default names `tabcomp`/`hummingbird`/`triton`, numbered `tc1`/`hb2`/`tri3` when duplicated;
  - the listen window;
  - age extrapolation, token ties;
  - chosen names kept on disk (`/etc/hostname`);
  - the `NODE ID CLASH` warning.
- **`sns_resolve`:** legacy aliases, then names, then `0xNNNN`, then a WHO broadcast. `peer` means the peer chosen with `peer <name>`; otherwise, the most recently heard live peer.
- **Echo responder** on SDP port 7: reply `ACK` with the same payload and `ack = seq + 1`. SpiralOS answering pings is new.
- **Chat lines are labeled with the sender's display name** from the peer table (no more `TC:`/`HB:`).
- **SRRP** (proto 3, port 80), client and server:
  - text heads;
  - `GET`, `PUT`, `POST`, `LIST`, `DEL`;
  - `Encoding: bytes | trytes16`;
  - multi-frame transfer with SACK, the advertised `Window`, an adaptive window and selective resend (§4.2);
  - refusing oversize bodies with 413 at the first frame;
  - legacy one-frame `GET /…` requests answered the old way.
- **SpiralHttpd** serves `/www`. It accepts `PUT /inbox/<name>` into `/inbox` (name rules and 403s per §4.3). It has a **"Share files (read-only)" setting**, off by default, that serves `LIST /share` and `GET /share/<name>` and sets services bit 6.
- **SpiralWeb** fetches pages over SRRP, at least 16 KB per page. Enlarge `WEB_PAGE_BUF` and document the memory-map change. It shows `Type: image/spiral-snap` responses: keep Convergence's `/snap` path working against `sonder.gw`. Ignore frames with flag 16 unless they are Convergence `/snap` segments.
- **Shell commands:**
  - `peers` (name, node, kind, OS, services, age, stale);
  - `peer <name>`, `name <new>`, `name --default`;
  - `ping <name>` (prints the RTT, or `NO REPLY`);
  - `send <file> <peer>` (SRRP `PUT /inbox`);
  - `get <peer> <path>`;
  - `share on|off`.
- **Apps:**
  - Chat gets a peer picker.
  - Files gets **Send to…**, with a peer picker, and an **Inbox** view.
  - Transfer moves to SRRP. Keep accepting legacy 4300/4301 pushes.
- **Host pages** (`tabcomp.html`, `hummingbird.html`, `index.html`): a visible **Node ID** control and a `?node=0xNNNN` URL parameter. These are emulator hardware settings only. The emulators must not read or write SpiralOS memory to do this.

## Part B: daily-driver apps

1. **Clock & Calendar app:**
   - Uses a new HAL call `hal_date()` (document its number and return layout) where the core has a real-time clock: the x86 core reads the CMOS RTC (ports `0x70`/`0x71`), as on Hummingbird and real PCs.
   - **Cores without an RTC** (TabComp, Triton) show a **"Set time" dialog**. The clock then runs from that time plus `hal_time()` and is labeled `MANUAL CLOCK`. Never invent a date.
   - Month calendar view, today highlighted.
2. **Shared Save / Open dialog** (one module, used by every app below): a folder list, file list, name field, Save, Cancel, and an overwrite confirmation.
3. **Paint:** Save and Open its pictures through the dialog, in a documented format.
4. **Text editor ("Notes"):** a real editor, separate from SpiralEdit (which stays the self-host source editor). It does multi-line editing, scrolling, cursor keys, Home/End/PgUp/PgDn, selection with Shift, cut/copy/paste within the OS, find, Save/Save As/Open through the dialog, a "modified" mark, and word wrap on/off. It shows documents in **CNSW Serif** and UI text in ConsciousNode Sans.
5. **Files:** New Folder, New File, Rename and Delete (with confirmation), using real names.

## Part C: games shelf

- **SpiralBlocks upgrade** (keep the name SpiralBlocks; no third-party game names or branding anywhere):
  - a 7-bag randomizer;
  - a 3-piece next queue;
  - hold;
  - a ghost piece;
  - lock delay;
  - wall kicks;
  - levels and line-clear scoring;
  - pause;
  - seeded play (`seed` shown and settable).
  
  Gravity is timed by `hal_time()` in milliseconds, not by frames or instructions.
- **Solitaire Suite (new app):**
  - **Klondike** (draw 1 / draw 3), **FreeCell**, and **Spider** (1, 2 or 4 suits);
  - **seeded deals** (a seed shown on screen and enterable), and **unlimited undo**;
  - **Deals exactly per `shared/DEALS.md`:** CNSW deal v1 for Klondike and Spider, and Microsoft deal numbers 1..32000 for FreeCell. The same seed must give the same deal as TritOS;
  - an optional **"Was this deal winnable?" solver**: off by default, never nags, depth-first search with a transposition table and a node budget. It answers `WINNABLE` (with the move count), `UNWINNABLE` (search exhausted) or `UNKNOWN` (budget hit), and nothing else;
  - **the clickwheel rule:** every game in the suite is fully playable with only **scroll** (arrow keys or mouse wheel), **select** (Enter or click) and **back** (Esc or right-click). Mouse drag is an extra, never required;
  - card art drawn by you. No copied card designs.

## Part D: fixes and polish

1. **x86 core `IDIV` guard:** `INT_MIN / -1` must not trap. The quotient is `INT_MIN` (two's-complement wrap) and the remainder 0, matching the TC-32 core. Add a cross-core test.
2. **The machine label for `g_machine_id == 3` is "Triton"** everywhere: shell banner, System Monitor, About.
3. **One version string**, `SpiralOS 1.4 "Daily Driver"`, defined in exactly one place and used everywhere: boot banner, shell, About, Build Station header and page title, `/docs/README.txt`. The Build Station still says 1.1 "Real Spiral".
4. **The Build Station and `tools/build.js` build the full current image**, including the Triton core. The 1.3 delivery changed no build files: verify, and fix if needed.
5. **Fonts:**
   - Replace the 8 × 8 system font in **all four copies** (`core/core_x86.js`, `core/core_triton.js`, `tabcomp.html`, `index.html`) with `consciousnode-sans-8x8.hex`.
   - Add CNSW Serif as a second font bank (`0x91000` region; document the layout), selectable through `hal_char`'s font parameter.
   - Regenerate every hash-pinned figure **with a script**.
6. **Boot splash:** the CNSW logo and the wordmark "SpiralOS" in ConsciousNode Sans, shown for about 1.5 s or until a key is pressed, on every core. Rasterize the logo from the attached SVG with a build-time script into a palette bitmap stored in the image. No SVG parser in the OS.

## Forbidden

- The OS (or the emulators) calling `studionet-ref.js`, or any host-side shortcut for networking. Frames go through the NIC only.
- An emulator reading or writing SpiralOS memory, detecting tests, or special-casing harness traffic.
- Precomputed protocol outputs, canned replies, or a "test mode" in the OS.
- Fake time: no date on a machine without an RTC unless the user set one.
- Third-party game names, logos or card designs.
- **Verbatim:** "If a requirement can't be met, or conflicts with another, say so in REPORT.md and leave it failing. Never change emulator or VM accessors, I/O, consoles, test harnesses, or the auditor's scripts to make a check pass. An emulator must never read or write a guest's private memory."
- Do not predict, rank or praise results anywhere in code, docs or UI.

## Tests (all new tests run on the real emulators: TabComp, Hummingbird, and Triton where the core supports it)

The harness may only:
- push frames into a NIC and read frames out of a NIC;
- press keys and move the mouse through the emulated devices;
- read the framebuffer;
- read the disk image after a sync.

It must never read or write guest RAM.

1. **Golden vectors:**
   - every `produce` vector is matched **field for field**. `seq`/`ack` values are the OS's own, so compare everything else byte-exact, and check that `seq` increments correctly;
   - every `parse` vector is accepted or refused as listed, observed through counters the OS shows in `peers`/`netstat`;
   - every SRRP message is produced and parsed byte-exact.
2. **Naming on live machines:**
   - boot three Hummingbirds in order → `hb1`, `hb2`, `hb3`;
   - stop `hb1` and boot a fourth → `hb1` again, the others unchanged;
   - start two at the same moment, deaf to each other, then connect them → the lower token takes `hb1`, and all nodes agree;
   - a chosen-name clash → `name2`;
   - a duplicate node ID → `NODE ID CLASH` on both screens.
3. **Transfers against the reference peer, over a fault-injecting link** (the harness drops, duplicates and reorders frames between the NIC and the reference, with a seeded RNG):
   - 1 KB, 16 KB and 64 KB both ways (`GET` and `PUT`);
   - byte-identical results;
   - report resends and timeouts.
   
   **Positive controls:**
   - with 100% loss, the OS must report `TIMEOUT` (not hang, not succeed);
   - an oversize `PUT` must get 413 before the body;
   - `../x` gets 403.
4. **Echo and chat:** the reference sends a ping and gets a reply. Chat both ways shows the reference's display name.
5. **Interop with TritOS:** run Triton's `desktop-18-spiralos-interop.js` against the new image; its 6 currently failing checks must now pass. If one can't be passed without changing Triton, say so.
6. **Apps:** scripted key/mouse sessions for:
   - Notes: type, save, reopen, find;
   - Paint: draw, save, reopen, then pixel-compare;
   - Files: new, rename, delete;
   - the Save/Open dialog: overwrite confirm;
   - Clock: on Hummingbird, the date matches the emulator's CMOS; on TabComp, `MANUAL CLOCK` after "Set time".
7. **Games:**
   - SpiralBlocks: the bag yields each piece once per 7, seeded runs are reproducible, and the gravity interval is measured in `hal_time()` ms;
   - Solitaire: `deals-ref.js`'s three check lines are reproduced in-OS; a seeded deal is identical across TabComp, Hummingbird and Triton, and to `deals-ref.js`;
   - FreeCell deals #1 and #617 match their published layouts; the solver reports `UNWINNABLE` for **#11982** and `WINNABLE` for #1 (use the same node budget across cores, and report the time per core);
   - **clickwheel:** win a scripted Klondike deal using only scroll/select/back inputs;
   - undo restores the exact prior state.
8. **Fixes:**
   - `IDIV INT_MIN,-1` gives the same results on all cores;
   - the "Triton" label appears on the Triton core;
   - every place the version shows reads `1.4 "Daily Driver"` (a grep test, plus screen checks);
   - the Build Station image boots on all cores.
9. **Fonts & splash:**
   - the font bytes in all four copies hash-match the attached `.hex`;
   - the splash appears on each core (framebuffer check) and is dismissed by a key.
10. **No regressions:** every existing test in `tests/` passes. The determinism and self-host fixed points are regenerated by script, with the old and new values both reported.
11. **Real browser:** every page loads in headless Chromium with 0 page errors, and the five-tab chat test passes: TabComp, Hummingbird, Triton/SpiralOS, a TritOS desktop if one is attached, and the reference peer page. Each must see the others in `peers` and chat by name.

## Report

`REPORT.md`:
- what was built and how each test verified it, with numbers copied from test output (never typed);
- every requirement you could not meet;
- the memory-map changes;
- anything you looked at besides the attachments.

Do not describe anything as working unless a test exercises it. Package the full repo tree plus test logs as a zip.
