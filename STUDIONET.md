# StudioNet & Sonder Engine Specification (`STUDIONET.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT

**StudioNet** is SpiralOS's zero-dependency virtual local area network device and protocol stack, connecting **TabComp (`0x0001`)**, **Hummingbird (`0x0002`)**, and the **Sonder Procedural Web Gateway (`0x00FE`)** across both single-page dual-station mode (`index.html`) and cross-tab `BroadcastChannel('studionet_v1')` links.

---

## 1. Hardware Interface

### 1.1 Hummingbird (`i586`) I/O Port Interface (`0x500 .. 0x518`)
Added to `HummingbirdPC` as an emulated I/O device with **hardware presence detection**:

| I/O Port | Width | Access | Description |
| :--- | :--- | :--- | :--- |
| `0x500` | `8/32-bit` | Read/Write | **Status / Control Register**: Returns `0xA5` (`bit 7 = 1` present magic, `bit 0 = RX ready`) when a StudioNet NIC is installed. On machines without StudioNet (e.g. QEMU or `strictBios: { noStudioNet: true }`), reading `0x500` returns `0xFF` (`0x00` in strict unconnected buses). The x86 Core checks `(inb(0x500) & 0xFE) == 0xA4` before touching any FIFO registers, preventing bogus RX reads on bare metal. |
| `0x504` | `32-bit` | Read | **Node ID**: `0x0002` (Hummingbird station address). |
| `0x508` | `32-bit` | Read/Write | **TX Length / Trigger**: Writing frame byte length (`1..512`) transmits the TX buffer onto the StudioNet bus. |
| `0x50C` | `32-bit` | Read/Write | **RX Length / Pop**: Reading returns pending RX frame byte length (`0` if empty); writing `1` pops the current RX frame. |
| `0x510` | `8-bit` | Write | **TX FIFO Byte Port**: Appends a byte to the outbound frame buffer. |
| `0x514` | `8-bit` | Read | **RX FIFO Byte Port**: Reads the next byte from the current inbound frame. |

### 1.2 TabComp (`TC-32`) System Trap Interface
- `SYS 40` (`sys_net_tx(buf_addr, len)`): Copies `len` bytes from `VM_MEM[buf_addr]` and broadcasts the frame over `BroadcastChannel('studionet_v1')` and `window._studioNetLocalHook`.
- `SYS 41` (`sys_net_rx(buf_addr, max_len)`): Dequeues the next frame from `netRxQueue` into `VM_MEM[buf_addr]` and returns its byte length (`0` if empty).
- `SYS 42` (`sys_net_node()`): Returns `0x0001` (TabComp station address).

---

## 2. Wire Frame Format & Protocol Stack (`/src/net.sp`)

Every StudioNet frame has a **12-byte header** followed by up to `500` bytes of payload:

| Byte Offset | Size | Field | Description |
| :--- | :--- | :--- | :--- |
| `0x00 .. 0x01` | `u16 LE` | `dst_node` | Destination node (`0x0001` TabComp, `0x0002` Hummingbird, `0x00FE` Sonder Gateway, `0xFFFF` Broadcast) |
| `0x02 .. 0x03` | `u16 LE` | `src_node` | Source node (`0x0001` or `0x0002`) |
| `0x04` | `u8` | `proto` | Protocol ID (`1`=`ECHO_REQ`, `2`=`ECHO_REP`, `3`=`SDP` Datagram, `4`=`SHP` Hypertext, `5`=`SFP` File Transfer) |
| `0x05` | `u8` | `ttl` | Time-to-live (`16` default) |
| `0x06 .. 0x07` | `u16 LE` | `seq` | Monotonic packet sequence number |
| `0x08 .. 0x09` | `u16 LE` | `len` | Payload length in bytes |
| `0x0A .. 0x0B` | `u16 LE` | `checksum` | 16-bit XOR/additive frame checksum (`net_checksum`) |

### Supported Protocols
1. **`PROTO_ECHO_REQ` (`1`) / `PROTO_ECHO_REP` (`2`)**: Hardware/OS ping with round-trip latency tracking.
2. **`PROTO_SDP` (`3`, Studio Datagram Protocol)**: Port-addressed UDP-style datagrams (`dst_port u16`, `src_port u16`, payload):
   - Port `900`: **SpiralChat** real-time peer-to-peer messaging between TabComp and Hummingbird.
   - Port `4400`: **Multiplayer SpiralSnake** (`net_send_snake_state`) — live dual-snake arena synchronization (`head_x`, `head_y`, `dir`, `score`) between TabComp and Hummingbird.
3. **`PROTO_SHP` (`4`, Studio Hypertext Protocol)**: Request/response hypertext transport serving both local `/www/*.shm` pages and procedural Sonder pages from `sonder.gw` (`0x00FE`).
4. **`PROTO_SFP` (`5`, Studio File Protocol)**: Cross-machine file push (`net_send_file`), writing received files directly into `/home/` on the remote machine's `SpiralFS`.

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
