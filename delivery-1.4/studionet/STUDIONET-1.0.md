# StudioNet 1.0: Protocol
**Kehai Interim with Kham · 2026-11-13 · status: **1.0, agreed with Kham 2026-11-13**; sent to builders for SpiralOS 1.4, TritOS 1.1.2 and CyberNetServerWeb**

> **The reference implementation is the tiebreaker.** `ref/studionet-ref.js` implements this document, `ref/selftest.js` checks it (38 checks, with positive controls), and `ref/golden-vectors.json` holds the byte-exact frames every stack must match. Where prose and reference disagree, the reference wins, and the prose gets fixed.

This is the contract that SpiralOS 1.4, TritOS 1.1.2, the StudioNet server and the StudioNet Bridge will be built to and audited against. It describes the protocol, not any one implementation. The builder specs for Argon get written from it once we've agreed on it.

**Ground rule: nothing that works today breaks.** The 16-byte frame, the BroadcastChannel name, chat on 4200, SpiralOS file push on 4300, TritOS chunked files on 4301 and SpiralHttpd's one-frame `GET` all keep working unchanged. Everything new is additive.

---

## 0. What exists today (verified against code, 2026-11-13)

- **Link:** `BroadcastChannel("studionet-v1")`, which only links tabs in one browser on one computer.
- **Frame:** 16-byte little-endian header (`dst, src, proto, flags, sport, dport, seq, ack, len`), payload 0..480 bytes, no checksum (SpiralOS `STUDIONET.md` §2 = TritOS `DRIVERS.md` §6).
- **Node IDs:** fixed defaults: TabComp `0x0101`, Hummingbird `0x0201`, Sonder gateway `0x00FE`, TritOS `0x0003..0x0006` (`?node=`).
- **Gaps this spec closes:**
  1. **No addressing by name.** SpiralOS `sns_resolve` is a hardcoded table, and `"peer"` means "the other emulator". It can't address TritOS: that's Triton test 18, 6 of 14 checks failing.
  2. **SpiralOS never answers ping.** Nothing listens on port 7.
  3. **Chat lines are labeled `TC:`/`HB:`** by node ID, so every other sender shows as `HB:`.
  4. **No messages bigger than one frame**, except TritOS's private chunking on 4301. SpiralOS is capped at 440 bytes.
  5. **No way across computers.**
- **Stale docs to fix in the same patches:**
  - TritOS `DESKTOP.md` line 60 says file sends use `PROTO_SFP (5)`; the driver uses SSP (3) on 4300/4301.
  - Our Bridge idea file says 12-byte header + checksum + `studionet_v1`. It should say 16-byte, no checksum, `studionet-v1`.

---

## 1. Layers

```
  apps:     chat · ping · files · web (SpiralWeb, Vanta) · Chat Jeepy Tea · MiniPedia
  ───────────────────────────────────────────────────────────────────────────
  L3  SRRP   request/response messages of any size        (NEW, §4)
  L2  SNS   names, peer table, presence                  (NEW frames on proto 1, §3)
  L1  frame 16-byte header + ≤480 B payload              (UNCHANGED)
  L0  link  BroadcastChannel "studionet-v1"  ⇄  Bridge   (Bridge NEW, §5)
```

---

## 2. Node IDs

- **Unchanged defaults.** Every page also accepts `?node=0xNNNN` and has a visible Node ID control, which TritOS already has and SpiralOS hosts need.
- **Reserved:**
  - `0x0000` (unset, never sent as `src`) and `0xFFFF` (broadcast);
  - `0x00F0..0x00FF` for studio infrastructure: `0x00FE` Sonder gateway (existing), `0x00FD` **CyberNetServerWeb** (the StudioNet server; name `cybernetserverweb`, alias `cnsw`), `0x00FC` reserved for a second server.
- **Uniqueness is now checked, not assumed** (§3.3). Once the Bridge joins two computers, two TabComps can both boot as `0x0101`.

---

## 3. SNS: names and the peer table (proto 1)

SNS frames finally exist. All of them use `proto = 1`, `sport = dport = 53`, with a payload that starts with a 1-byte opcode.

| Op | Name | Sent | Payload after the opcode |
|---|---|---|---|
| `1` | **HELLO** | broadcast at boot (after the listen window, §3.4), every 30 s (or the OS's equivalent tick), and unicast in answer to WHO | `kind` (u8: 1 TabComp, 2 Hummingbird, 3 Triton, 4 server, 5 gateway, 6 bridge), `os` (u8: 1 SpiralOS, 2 TritOS, 3 none/host), `services` (u16 bitmap, §3.2), `age` (u32, seconds since this node joined, by its own clock), `token` (u32, random, drawn once at boot), `named` (u8: 1 = name chosen by the user, 0 = default), `num` (u8: 0 = plain, else the number this node holds), `name` (the **base** name: the chosen name, or the core base name; 1..31 bytes, `[a-z0-9.-]`, NUL-terminated). Display name: plain → `name`; numbered default → short form + `num` (`hb2`); numbered chosen → `name` + `num` (`toshiba2`). Sending base and number separately means no stack ever has to parse digits out of a name. |
| `2` | **WHO** | broadcast | `name` (NUL-terminated): "whoever owns this name, say HELLO to me" |
| `3` | **BYE** | broadcast at clean shutdown | (none) |

### 3.1 Peer table (every stack)
- At least **8 entries**: `node, name, kind, os, services, lastSeen`.
- On HELLO from `src`: insert or update. If the table is full, evict the least recently seen entry.
- An entry is **stale** after 3 missed HELLO periods. Stale entries stay listed (marked stale), but name lookups skip them.
- **`sns_resolve(name)`**, in order:
  1. the built-in aliases `tabcomp.local`, `hummingbird.local`, `sonder.gw` (kept for compatibility);
  2. the live peer table;
  3. if not found, send WHO and return "unknown" (the app can retry).
- **`peer`** now means "the peer most recently chosen with `peer <name>`", falling back to "the most recently heard live peer that isn't me".
- **Names:** see §3.4. Lookups also accept a node's base name and its node ID written as `0xNNNN`.

### 3.2 Services bitmap
| Bit | Service |
|---|---|
| 0 | chat (SDP 4200) |
| 1 | echo / ping (SDP 7) |
| 2 | legacy file push (SSP 4300) |
| 3 | TritOS chunked files (SSP 4301) |
| 4 | SRRP server (port 80) |
| 5 | snake (SDP 4400) |
| 6 | read-only share is ON (`GET/LIST /share`, §4.3) |
| 7–15 | reserved, must be 0 |

### 3.3 Duplicate node IDs
- If a HELLO arrives whose `src` equals my own node ID, two machines share an ID.
- Each OS shows a warning: `NODE ID CLASH: 0x0101 (tabcomp-0101 vs <their name>)`.
- Neither machine renumbers itself automatically; the user changes one ID. Silently changing IDs would hide the problem.

### 3.4 Machine names (Kham's rules)
- **Each machine can name itself.** The user sets the name in the OS, and it's kept on disk.
- **With no chosen name, a machine is called by its core name:**

  | Core | Base name | Short form for numbering |
  |---|---|---|
  | TabComp | `tabcomp` | `tc` |
  | Hummingbird | `hummingbird` | `hb` |
  | Triton | `triton` | `tri` |
  | server | `cybernetserverweb` | `cnsw` |
  | Sonder gateway | `sonder` | `sg` |
  | bridge | `bridge` | `br` |

- **Duplicate cores get numbered: `hb1`, `hb2`, `hb3`…, round robin in join order.**
  - While a core is the only one of its kind, it is just `hummingbird`.
  - When a second appears, both switch to numbered names: the earlier joiner is `hb1`, the newcomer `hb2`.
  - The base name keeps resolving to the lowest-numbered live one, so `hummingbird` still finds `hb1`.
  - When `hb1` leaves (BYE or stale), the remaining numbers **do not shift**. The next newcomer takes the lowest free number.
- **Join order, without a shared clock.**
  1. **Listen first:** a booting node listens for one HELLO period (3 s, or the OS's tick equivalent) before announcing. Every node it heard from joined earlier, so it takes the lowest number those nodes leave free.
  2. **Merges and races:** when two numbered sets meet (two LANs bridged together, or two nodes that announced without hearing each other), the claimant with the **larger `age`** keeps the number.
  3. **Ties:** `age` is in whole seconds, and **only identical ages tie**. Then the **lower `token`** keeps the number (and if tokens are equal too, the lower node ID). The token is random and drawn once at boot, so a tie gets a random #1 and the round robin continues from there. *(Draft v2 said "within 2 s". That isn't transitive: with ages 0, 1.5 and 3, A ties B and B ties C, but A doesn't tie C, so nodes could rank the same three machines differently. Found while writing the reference.)*
  - **Ages are extrapolated:** a stack stores a peer's HELLO `age` and the local time it arrived, and compares `age + seconds since arrival`. It never compares stale snapshots.
  4. The loser takes the next free number and announces it at once.
- **Chosen names clash too.** If two machines choose the same name, the same order applies: the earlier joiner keeps it, and the other becomes `<name>2` (then `3`…). Its screen shows `NAME TAKEN: using <name>2`.
- **Every rename is announced in a HELLO**, and peers update their tables, so chat labels and `peers` follow along.
- **Note:** TritOS has no wall clock, so its `age` comes from virtual steps at the machine's nominal rate. It's approximate, which is why close calls go to the token.

---

## 4. SRRP: StudioNet Request/Response Protocol (the ternary-friendly "HTTP")

*Reserved:* **SSRRP** for a future secure layer (named for the sound of someone noisily eating ramen).

Used by the server, file transfer, SpiralWeb and Vanta. It runs on **SSP (proto 3)**, with the server on **port 80**. Clients use ephemeral ports `49152..65534`, one per conversation.

### 4.1 Message format (text head, so a person can read it in a frame dump)
```
GET /minipedia/ternary SRRP/1\n           ← request line: METHOD PATH VERSION
Accept-Size: 65536\n                     ← headers: "Key: value", ASCII
\n                                       ← blank line ends the head
<body bytes>                             ← optional
```
```
SRRP/1 200 OK\n
Size: 1834\n
Type: text/hts\n
Encoding: bytes\n
\n
<1834 body bytes>
```
- **Methods:** `GET`, `PUT` (upload), `POST` (form submit: `Type: form`, body `key=value&…`, URL-encoded), `LIST` (directory listing), `DEL`.
- **Status:** `200 OK`, `201 CREATED`, `400 BAD`, `403 FORBIDDEN`, `404 NOT FOUND`, `413 TOO BIG`, `500 ERROR`, `503 BUSY`.
- **`Encoding: bytes | trytes16`.** `trytes16` packs each tryte as a signed 16-bit LE pair, exactly TritOS's mode `'T'`, so ternary files cross the wire losslessly and every stack can read the head as plain bytes.
- **`Size:`** is required whenever there is a body. A receiver refuses (413) anything over its own advertised limit before accepting the body.
- **Reserved flag `16`:** Convergence's unmerged segmented transfer (`FLAG_SEG`, 8-byte segment header, stop-and-wait, CRC16) used flags bit 4. SRRP never sets it, stacks must ignore frames carrying it on port 80 unless they implement Convergence's `/snap`, and the gateway's `/snap` keeps working until CyberNetServerWeb replaces it.
- **Compatibility:** a request line *without* ` SRRP/1` is a legacy SpiralHttpd request. Servers answer it the old way: one frame, `ACK|PSH`, body only, truncated to 480 bytes.

### 4.2 Splitting a message into frames
- Each frame carries up to 480 payload bytes.
- **First frame:** `SYN|PSH`, with `seq = S` (any start value).
- **Frame k:** `seq = S + k` (mod 65536), flags `PSH`. The **last** frame also has `FIN`. A one-frame message is `SYN|PSH|FIN`.
- **Selective acknowledgement (full send, Kham 22:37).**
  - Every ACK frame has flags `ACK` (no `PSH`) and `ack = (seq of the highest frame received in order) + 1`, i.e. the next seq it expects. ACK frames carry `seq = 0` (ignored).
  - Its payload is **3 bytes**: a **SACK bitmap** (u16 LE; bit i set means frame `ack + 1 + i` has already arrived out of order, for the next 16 frames), then the receiver's current `Window` (u8). So the window travels on every ACK, not only in message heads.
  - The receiver ACKs at least every 2 frames, on any gap, and on FIN.
- **The receiver advertises its buffer** in its head as `Window: N` (frames it can hold per conversation; at least 4, at most 16).
- **The sender's window adapts:** it starts at 2 frames, grows by 1 per fully ACKed window up to the peer's `Window`, and halves (to no less than 1) on any timeout. Until it hears an ACK, the sender assumes the minimum `Window: 4`.
- **Selective resend:**
  - **On timeout**, the sender resends only the frames not yet SACKed.
  - **Fast resend:** a missing frame with **at least 3 later frames SACKed** counts as lost and is resent once, without waiting for the timeout (TCP's duplicate threshold).
  - The reference first tried "resend every gap at once". That resent frames that were merely delayed, and the reference self-test's control caught it (SACK did no better than no SACK).
- **Timeouts:** at least 500 ms of wall time (SpiralOS hosts), or the TritOS virtual-step equivalent its driver already uses for ping (250,000 steps). After 5 resends with no progress, the conversation fails with `TIMEOUT`.
- **Receivers buffer what they advertise.** TritOS's 10-slot ring supports `Window: 8` for one conversation at a time. SpiralOS handles 8 frames per poll; it advertises 8 and buffers out-of-order frames in RAM.
- **The response** goes back on the same port pair, as its own `SYN … FIN` sequence with its own `S`.

**Why go full send:** with one frame at a time, a 64 KB page takes 137 round trips, each limited by how often the guest OS polls. A window of 8 cuts that to about 18. Selective resend means one lost frame costs one resend, not a whole window. It's also a real ceiling probe: SACK plus an adaptive window is TCP-grade machinery, and the guest OSes have to implement it in SpiralC and Triton assembly.

### 4.3 Peer-to-peer files
- Any node with SRRP bit 4 set accepts **`PUT /inbox/<name>`** (name `[A-Za-z0-9._-]`, at most 31 characters). Files land in the user's inbox, never anywhere else. `..` and `/` in names are refused with 403.
- `LIST /inbox` and `GET /inbox/<name>` let the sender check. `DEL` stays local-only on peers (403 over the wire).
- **Read-only share (toggle, off by default, Kham 22:37).** A machine setting, "Share files (read-only)", turns on `LIST /share` and `GET /share/<name>`. They serve **only** the `/share` folder, never the inbox or anything else. `PUT` and `DEL` on `/share` are always refused (403). The toggle is visible in the services bitmap (bit 6), so `peers` shows who is sharing.
- Legacy pushes on 4300/4301 stay accepted, so old senders still work.

### 4.4 Limits a stack must advertise
In its HELLO and as headers in replies, each stack advertises `Max-Size` (largest body it accepts) and `Max-Name`. Proposed minimums: SpiralOS 64 KB, TritOS 16 K trytes, server 1 MB.

---

## 5. StudioNet Bridge (across computers)

- **Off by default** and clearly labeled. It's the one documented exception to "no network APIs except BroadcastChannel".
- **Transport:** WebRTC DataChannel with **copy-paste pairing**: paste the offer and answer between the two pages. There's no server, and Tailscale gives the reachability. Fallback: a tiny WebSocket relay script.
- **Envelope:** every frame crossing the bridge is wrapped as `"SNB1"`, `hop` (u8), `origin bridge id` (u32), `CRC-32` of the frame (u32), and then the unchanged frame.
  - The CRC is checked on arrival. A mismatched frame is dropped and counted; that's the positive control for corruption.
  - **Loop guard:** a bridge never forwards a frame back out with its own origin ID, and it drops anything with `hop ≥ 4`. Three computers bridged in a triangle must not echo frames forever.
- **The bridge is a StudioNet node too** (`kind 6`, a node in `0x00F0..0x00FB`). It sends HELLO, so `peers` on any machine shows it's there.

---

## 6. User-visible changes (what the patches must deliver)

- **SpiralOS 1.4:**
  - `net.sp` gets SNS HELLO/WHO/BYE with the naming rules, the peer table, the `peer <name>` command, an echo responder on port 7, chat labels from peer names, and an SRRP client + server (SpiralHttpd upgraded, legacy mode kept), a machine-name setting, and the read-only share toggle.
  - The Files app gets "Send to…" with a peer picker, and an inbox.
  - The Node ID becomes a visible host control on TabComp and Hummingbird.
- **TritOS 1.1.2:** the `net` driver v3 gets SNS + peer table + naming + SRRP. Its NET app lists peers, sends to peers by name, and browses SRRP pages (the first real StudioNet browser app on ternary). It also gets a machine-name setting and the share toggle.
- **CyberNetServerWeb (after the patches):** one Xinu page at node `0x00FD` (name `cybernetserverweb`, alias `cnsw`), serving SRRP: static pages, `/files` (upload with size caps, never executed), MiniPedia (CC BY-SA text, attributed), and Chat Jeepy Tea (a small WASM model, honest about its size).
- **Five-node test:** SpiralOS on TabComp, Hummingbird and Triton, TritOS, and the server. Every node must see the others in `peers`, chat by name both ways, ping with a reply, move a file over 440 B both ways, and fetch a page from the server.

---

## 7. How this will be verified (preview for the builder specs)

- **A reference implementation**, `studionet-ref.js` in the server repo: frame/SNS/SRRP encode-decode plus a chunker. It's tiny, pure, and the oracle for every stack.
- **Golden test vectors** (hex frames plus expected decodes) generated from the reference and attached to every builder spec. Every stack must parse and produce them byte for byte.
- **Naming tests:**
  - three Hummingbirds booted in a known order must come out `hb1`, `hb2`, `hb3`;
  - `hb1` leaving and a new one joining gives the newcomer `hb1` back (lowest free) without renumbering the others;
  - a forced simultaneous join (same age, both deaf to each other) settles on one `hb1` decided by token, with every node agreeing;
  - two bridged LANs that each have an `hb1` merge with the older one keeping it;
  - a chosen-name clash gives `<name>2`.
- **Positive controls:**
  - a dropped frame must trigger a resend of that frame only (SACK);
  - a forced timeout must halve the window;
  - a duplicated frame must not duplicate data;
  - a reordered frame must be held, not delivered early;
  - a corrupted bridged frame must be dropped by the CRC;
  - a duplicate node ID must raise the clash warning;
  - a `../` name must get 403;
  - an oversize PUT must get 413 before its body is accepted.
- **Real browsers** for the five-node test and the bridge (two browser contexts over loopback). Never Node-only.

---

## Decisions (Kham, 2026-11-13 22:37)
1. **Names:** the request/response protocol is **SRRP**, with **SSRRP** reserved for a secure layer. The server is **CyberNetServerWeb**. Machines can name themselves and default to their core name, with numbered short names (`hb1`, `hb2`…) for duplicate cores in join order and a random #1 on ties (§3.4).
2. **Heads:** readable text (Kehai's pick).
3. **Transfer:** full send: SACK, an adaptive window up to the peer's advertised `Window`, selective resend (§4.2).
4. **Sharing:** inbox-only uploads by default, plus an optional read-only `/share` toggle (§4.3).
