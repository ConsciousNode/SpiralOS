# StudioNet Specification (`STUDIONET.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT

> **Corrected 2026-11-12 (SpiralOS 1.2.1).** Earlier versions of this file described a 12-byte header with a checksum, echo ping, chat on port 900, ports `0x500..0x518` and node IDs `0x0001`/`0x0002`. None of that matched the code that ships. Sections 1 and 2 below now describe what `os/net.sp` and the NIC in `hummingbird.html`/`tabcomp.html` actually do. **The code is the authority; this file follows it.** The mismatch was found by Argon while building TritOS Desktop 1.1 (see the Triton repo, `AUDIT-DESKTOP-1.1.md`). Section 3 (Sonder) has not been rechecked against the code yet.

**StudioNet** is SpiralOS's virtual LAN. It connects TabComp, Hummingbird, the Sonder gateway and (from TritOS 1.1.1) Triton machines, across one page or across browser tabs on `BroadcastChannel("studionet-v1")` (hyphen: the name `tabcomp.html` and `hummingbird.html` use). Triton machines joined the same channel in Triton commit after TritOS 1.1.1 (they had used `studionet_v1`; found by Argon).

---

## 1. Hardware: the StudioNet NIC (TabComp and Hummingbird)

Both emulators carry the same `StudioNetNIC` device, with 16 byte-wide I/O ports at base **`0x2A0`**:

| Offset | Read | Write |
|---|---|---|
| `+0x00`, `+0x01` | Signature `'S'` (`0x53`), `'N'` (`0x4E`) | (none) |
| `+0x02` | Status: bit 0 = RX frame pending, bit 2 = present (always 1), bit 3 = IRQ enabled | **Command:** `1` TX_SEND, `2` RX_POP, `3` RESET, `4` IRQ_EN, `5` IRQ_DIS |
| `+0x04`, `+0x05` | Node ID, low and high byte | Set node ID |
| `+0x06`, `+0x07` | Length of current RX frame | TX length (lo, hi), max 512 |
| `+0x08..+0x0B` | DMA address | Set DMA address (32-bit, little-endian) |
| `+0x0C` | Next byte of the current RX frame (PIO) | Append a byte to the TX frame (PIO) |
| `+0x0D` | TX count (low byte) | (none) |
| `+0x0E`, `+0x0F` | RX count | (none) |

- **TX_SEND:** if the TX length is non-zero, sends `len` bytes from RAM at the DMA address. Otherwise it sends the PIO bytes appended through `+0x0C`.
- **RX_POP:** copies the next queued frame to RAM at the DMA address and makes it readable byte by byte at `+0x0C`.
- **Delivery:** a frame reaches a NIC when its `dst` (bytes 0–1) is that NIC's node ID, `0xFFFF` (broadcast), `0x0000`, or when the NIC is promiscuous.
- **Default node IDs:** TabComp `0x0101`, Hummingbird `0x0201`, Sonder gateway `0x00FE`. TritOS desktops use `0x0003..0x0006`.

The OS reaches the NIC through the Core HAL (`hal_net_send`, `hal_net_recv`, `hal_net_info`), so `net.sp` never touches ports directly.

---

## 2. Wire frame (`os/net.sp`)

Every frame is a **16-byte header** and then up to **480 bytes** of payload (`net_send_frame` clamps it). All fields are little-endian. **There is no checksum.**

| Bytes | Field | Notes |
|---|---|---|
| `0..1` | `dst` | destination node; `0xFFFF` = broadcast |
| `2..3` | `src` | sender's node ID (`g_local_node_id`, read from the NIC at boot) |
| `4` | `proto` | `1` SNS, `2` SDP (datagram), `3` SSP (sequenced stream) |
| `5` | `flags` | bit mask: `1` SYN, `2` ACK, `4` PSH, `8` FIN |
| `6..7` | `sport` | source port |
| `8..9` | `dport` | destination port |
| `10..11` | `seq` | sender's sequence number (starts at 100) |
| `12..13` | `ack` | acknowledged sequence (`seq + 1` of the frame being answered) |
| `14..15` | `len` | payload length in bytes |
| `16..` | payload | |

Receivers drop frames shorter than 16 bytes and handle at most 8 frames per poll. `net.sp` does **not** check that `len` matches the frame length (it trusts `len`); stricter stacks such as TritOS also drop frames whose `len` disagrees. The receiver writes a 0 after the payload, so text payloads can be read as C strings.

### 2.1 Services

| Service | proto | Port | Payload | Notes |
|---|---|---|---|---|
| **SpiralChat** | 2 SDP | `4200` → `4200` | message, NUL-terminated (`len` includes the NUL) | flags `PSH`. The receiver labels a line `TC:` if `src == 0x0101`, otherwise `HB:`. |
| **Ping** (shell `ping`) | 2 SDP | `4200` | the text `PING from SpiralSh` | Only a chat message. `PORT_ECHO = 7` is defined but nothing answers it, so there is no echo reply. |
| **Multiplayer Snake** | 2 SDP | `4400` → `4400` | 8 bytes: `x`, `y`, `dx+2`, `dy+2` (u8 each), `score` (u32) | sent to the peer |
| **File push** | 3 SSP | `4300` → `4300` | 32-byte NUL-padded name (max 31 chars), then the file bytes (max 440) | flags `SYN|PSH`, one frame per file. The receiver writes the file with `fs_write` and answers `ACK` with payload `OK`, `ack = seq + 1`. |
| **SpiralHttpd** (server) | 3 SSP | → `80` | `GET /…` | answers `ACK|PSH` from port 80 with `/www/index.hts`, or `/www/sonder.hts` for `GET /s…`, or a 404 page |
| **SpiralWeb** (client) | 3 SSP | `49152` → `80` | `GET <path>` | takes the response payload (first 1023 bytes) as the page |
| **SNS** | 1 | (none) | (none) | Name resolution is **local only**. `sns_resolve` maps `tabcomp.local` → `0x0101`, `hummingbird.local` → `0x0201`, `sonder.gw` → `0x00FE`, and `peer` → the other machine. No SNS frames are sent. |

### 2.2 Interop notes for new stacks (e.g. TritOS)

- To be heard by SpiralOS: send SDP chat to `dport 4200` with a NUL-terminated payload. The line will show as `HB:` unless `src` is `0x0101`. That's a known cosmetic limit.
- To push a file to SpiralOS: one SSP frame on port 4300 with `SYN|PSH`, the 32-byte name block, at most 440 bytes of data. Expect an `ACK` frame with `OK` back.
- SpiralOS never replies to a ping. A stack that wants round-trip time against SpiralOS has to measure something that does get a reply, such as the file-push ACK.

---

## 3. Deterministic Seeded Sonder Engine (`sonder.gw`, `/src/net.sp`)

In SpiralOS 1.1, **Sonder** is no longer a static JS string template. Both the in-OS network stack (`net_generate_sonder_into` in `/src/net.sp`) and the virtual gateway (`0x00FE`) run a **deterministic seeded procedural page generator**:

- **Seed Derivation (`net_hash_str`)**: Computes a 32-bit FNV-1a-style hash (`seed`) from the requested URL (`sonder://...` or `http://...`), mixed with a linear congruential step (`sonder_rng(seed)`).
- **Provenance Stamp**: Every generated document begins with an explicit provenance comment:
  ```html
  <!-- sonder: seed=0x........ template=ATLAS -->
  ```
- **Four Procedural Archetypes (`tmpl = seed & 3`)**:
  1. **`ATLAS` (`tmpl == 0`)**: Cartographic Sector Survey with procedurally generated coordinates, resonance indices, inline procedural emblem (`<img src='emblem:N'>`), and 3 deterministic cross-links (`<a href='sonder://...'>`).
  2. **`CHRONICLE` (`tmpl == 1`)**: Temporal Relay Log with procedural epoch timestamps, relay narrative paragraphs, inline waveform graphic (`<img src='wave:N'>`), and cross-links.
  3. **`SCHEMATIC` (`tmpl == 2`)**: Subsystem Blueprint (`TC-32` / `i586` register & bus matrices), inline circuit diagram (`<img src='circuit:N'>`), and diagnostic links.
  4. **`ARCHIVE` (`tmpl == 3`)**: Deep Storage Vault Index with artifact catalog records, inline crest graphic (`<img src='crest:N'>`), and vault links.
- **SpiralWeb Browser Capabilities (`/src/apps1.sp`)**:
  - Parses and renders `<h1>`, `<p>`, `<hr>`, `<!-- ... -->` provenance comments, inline procedural `<img src='...'>` graphics (`emblem`, `wave`, `circuit`, `crest`), and clickable `<a href='...'>` links.
  - Clicking any rendered link pushes the current URL onto a **4-level `[Back]` history stack** (`WEB_HIST_BUF`, `WEB_HIST_SP`) and fetches the target page.
