# StudioNet Virtual Network & Protocol Specification (`STUDIONET.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT · **Version:** `StudioNet 1.0`

---

## 1. Overview

**StudioNet** is a zero-dependency virtual local area network device (`StudioNetNIC`) added to both **Hummingbird** and **TabComp**, paired with a complete portable network stack (`/src/net.sp`) inside SpiralOS.

- **Browser Backend**: Uses the browser's native `BroadcastChannel("studionet-v1")` for real-time tab-to-tab packet switching across separate browser tabs (`tabcomp.html` ↔ `hummingbird.html` ↔ `index.html`), plus an in-page virtual switch (`globalThis.__STUDIONET_SWITCH`) for dual-machine operation inside the Spiral Build Station.
- **Headless Node.js Backend**: Uses `globalThis.__STUDIONET_SWITCH` for deterministic, zero-latency cross-machine packet routing in `tests/net.js`.
- **Sonder Procedural Internet Bridge (Stretch §5)**: Station `0x00FE` (`"sonder.gw"`) acts as a built-in gateway that responds to StudioNet HTTP/SSP requests with procedural hypertext capsules.

---

## 2. Hardware Device Interfaces

### 2.1 Hummingbird i586 PC Interface (`I/O Ports 0x02A0 .. 0x02AF`, `IRQ 10`)

| Port | Width | Access | Register Name | Description |
| :--- | :--- | :--- | :--- | :--- |
| `0x02A0` | 16-bit | R | `SNET_MAGIC` | Identification word `0x4E53` (`'SN'`). |
| `0x02A2` | 8-bit | R | `SNET_STATUS` | Bit 0 (`0x01`): `RX_READY` (≥1 frame queued); Bit 2 (`0x04`): `LINK_UP`; Bit 3 (`0x08`): `IRQ_ENABLED`. |
| `0x02A2` | 8-bit | W | `SNET_CMD` | `0x01` (`CMD_TX_SEND`): DMA transmit `SNET_LEN` bytes from `SNET_DMA_ADDR`.<br>`0x02` (`CMD_RX_POP`): DMA copy head RX frame to `SNET_DMA_ADDR` & pop.<br>`0x03` (`CMD_RESET`): Clear queues.<br>`0x04` / `0x05`: Enable / disable `IRQ 10` on RX arrival. |
| `0x02A4` | 16-bit | R/W | `SNET_NODE_ID` | 16-bit station address (default `0x0201` on Hummingbird). |
| `0x02A6` | 16-bit | R/W | `SNET_LEN` | Write: sets TX frame byte length (`1..512`). Read: returns byte length of popped/head RX frame. |
| `0x02A8` | 32-bit | R/W | `SNET_DMA_ADDR`| 32-bit physical memory address in Hummingbird RAM for zero-copy DMA TX/RX. |
| `0x02AC` | 8-bit | R/W | `SNET_PIO_FIFO`| Byte-by-byte PIO fallback data port. |
| `0x02AD` | 8-bit | R | `SNET_TX_CNT` | Low 8 bits of transmitted frame counter. |
| `0x02AE` | 16-bit | R | `SNET_RX_CNT` | 16-bit received frame counter. |

### 2.2 TabComp TC-32 Interface (`MMIO 0x0FFD40 .. 0x0FFD7F` + `SYS 32..34`)

| MMIO Address | Width | Register Name | Description |
| :--- | :--- | :--- | :--- |
| `0x0FFD40` | 32-bit | `SNET_MAGIC` | Reads `0x534E4554` (`'SNET'`). |
| `0x0FFD44` | 32-bit | `SNET_STATUS` | Bit 0: `RX_READY`, Bit 2: `LINK_UP`. |
| `0x0FFD48` | 32-bit | `SNET_CMD` | Write `1` = TX send from `SNET_DMA_ADDR`; Write `2` = RX pop to `SNET_DMA_ADDR`; Write `3` = reset. |
| `0x0FFD4C` | 32-bit | `SNET_NODE_ID` | Station address (default `0x0101` on TabComp). |
| `0x0FFD50` | 32-bit | `SNET_LEN` | TX frame length or received frame length (`0..512`). |
| `0x0FFD54` | 32-bit | `SNET_DMA_ADDR`| 24-bit physical RAM address in TabComp memory. |
| `0x0FFD58` | 32-bit | `SNET_TX_CNT` | Total transmitted frames. |
| `0x0FFD5C` | 32-bit | `SNET_RX_CNT` | Total received frames. |

---

## 3. Wire Frame Format & Protocol Stack (`/src/net.sp`)

Every StudioNet frame (`16 .. 512` bytes) begins with a 16-byte little-endian header:

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|          dst_node (16)        |          src_node (16)        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   proto (8)   |   flags (8)   |           sport (16)          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|           dport (16)          |            seq (16)           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|            ack (16)           |        payload_len (16)       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     payload (0 .. 496 bytes)                  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

### 3.1 Addressing & StudioNet Name Service (`SNS`, `proto = 1`)
- `0x0101`: `"tabcomp.local"` (TabComp station)
- `0x0201`: `"hummingbird.local"` (Hummingbird i586 station)
- `0x00FE`: `"sonder.gw"` (Sonder Procedural Internet Gateway)
- `0xFFFF`: `"broadcast"` (All stations on bus)

### 3.2 StudioNet Datagram Protocol (`SDP`, `proto = 2`)
Connectionless port-addressed datagrams:
- **Port `7` (`PORT_ECHO`)**: Diagnostic echo/ping service.
- **Port `4200` (`PORT_CHAT`)**: Used by **`SpiralChat`** and the `ping` shell command to exchange live text messages between TabComp and Hummingbird.

### 3.3 StudioNet Stream Protocol (`SSP`, `proto = 3`)
Reliable sequenced (`seq`) and acknowledged (`ack`, `FLAG_SYN = 0x01`, `FLAG_ACK = 0x02`, `FLAG_PSH = 0x04`, `FLAG_FIN = 0x08`) stream layer:
- **Port `4300` (`PORT_FTX` — `SpiralSend` File Transfer)**:
  Encapsulates `[filename : 32B][file_payload : 0..440B]` with `FLAG_SYN | FLAG_PSH`. The receiving SpiralOS kernel writes the file directly into its `SpiralFS` volume, syncs the sectors to disk, and replies with a `FLAG_ACK` frame (`ack = seq + 1`).
- **Port `80` (`PORT_HTTP` — `SpiralHttpd` Tiny Server & `SpiralWeb` Browser)**:
  `SpiralWeb` sends `GET /index.hts` (or `GET /atlas` to `0x00FE`) over SSP to `PORT_HTTP`. The remote `SpiralHttpd` daemon serves the hypertext document from its local `SpiralFS` (`/www/index.hts`) in an `ACK | PSH` response, which `SpiralWeb` parses and renders (`<h1>`, `<p>`, `<a href='...'>`).
