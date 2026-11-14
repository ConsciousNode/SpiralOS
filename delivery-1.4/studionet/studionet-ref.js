/*
 * studionet-ref.js — StudioNet 1.0 reference implementation (the oracle)
 * ConsciousNode SoftWorks · MIT · written by Kehai Interim, 2026-11-13
 *
 * Pure, dependency-free JavaScript (Node CommonJS or browser global `StudioNetRef`).
 * Implements STUDIONET-1.0-DRAFT.md: the 16-byte frame (§0/L1), SNS + naming (§3),
 * SRRP heads and windowed transfer with SACK (§4), and the Bridge envelope (§5).
 * Every OS stack is checked against this file and golden-vectors.json.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- constants
  const PROTO = { SNS: 1, SDP: 2, SSP: 3 };
  const FLAG = { SYN: 1, ACK: 2, PSH: 4, FIN: 8 };
  const PORT = { ECHO: 7, SNS: 53, SRRP: 80, CHAT: 4200, FTX: 4300, FTX_CHUNK: 4301, SNAKE: 4400 };
  const BROADCAST = 0xFFFF;
  const HEADER = 16, MAX_PAYLOAD = 480;
  const SNS_OP = { HELLO: 1, WHO: 2, BYE: 3 };
  const KIND = { TABCOMP: 1, HUMMINGBIRD: 2, TRITON: 3, SERVER: 4, GATEWAY: 5, BRIDGE: 6 };
  const OS = { SPIRALOS: 1, TRITOS: 2, HOST: 3 };
  const SERVICE = { CHAT: 1, ECHO: 2, FTX: 4, FTX_CHUNK: 8, SRRP: 16, SNAKE: 32, SHARE: 64 };
  const BASE_NAME = { 1: 'tabcomp', 2: 'hummingbird', 3: 'triton', 4: 'cybernetserverweb', 5: 'sonder', 6: 'bridge' };
  const SHORT_NAME = { 1: 'tc', 2: 'hb', 3: 'tri', 4: 'cnsw', 5: 'sg', 6: 'br' };
  const LEGACY_ALIAS = { 'tabcomp.local': 0x0101, 'hummingbird.local': 0x0201, 'sonder.gw': 0x00FE };
  const NAME_RE = /^[a-z0-9.-]{1,31}$/;

  // ---------------------------------------------------------------- frames (L1)
  function encodeFrame(f) {
    const payload = f.payload ? Uint8Array.from(f.payload) : new Uint8Array(0);
    if (payload.length > MAX_PAYLOAD) throw new Error('payload > 480');
    const b = new Uint8Array(HEADER + payload.length);
    const w16 = (o, v) => { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; };
    w16(0, f.dst); w16(2, f.src); b[4] = f.proto & 255; b[5] = f.flags & 255;
    w16(6, f.sport); w16(8, f.dport); w16(10, f.seq || 0); w16(12, f.ack || 0); w16(14, payload.length);
    b.set(payload, HEADER);
    return b;
  }
  /** Strict decode (TritOS rules): returns {ok:true, ...} or {ok:false, error}. */
  function decodeFrame(bytes) {
    const b = Uint8Array.from(bytes);
    if (b.length < HEADER) return { ok: false, error: 'short' };
    if (b.length > HEADER + MAX_PAYLOAD) return { ok: false, error: 'long' };
    const r16 = (o) => b[o] | (b[o + 1] << 8);
    const len = r16(14);
    if (len > MAX_PAYLOAD) return { ok: false, error: 'len>480' };
    if (len !== b.length - HEADER) return { ok: false, error: 'len mismatch' };
    return {
      ok: true, dst: r16(0), src: r16(2), proto: b[4], flags: b[5], sport: r16(6), dport: r16(8),
      seq: r16(10), ack: r16(12), payload: b.slice(HEADER)
    };
  }

  // ---------------------------------------------------------------- SNS (§3)
  const enc = (s) => Array.from(s, (c) => c.charCodeAt(0) & 255);
  const dec = (a) => String.fromCharCode.apply(null, Array.from(a));
  function cstr(a, from) { let e = from; while (e < a.length && a[e] !== 0) e++; return dec(a.slice(from, e)); }

  /** HELLO: name = base name (chosen, or core base name); num = 0 plain, else the number (§3.4). */
  function encodeHello(h) {
    if (!NAME_RE.test(h.name)) throw new Error('bad name ' + h.name);
    const p = [SNS_OP.HELLO, h.kind & 255, h.os & 255, h.services & 255, (h.services >>> 8) & 255];
    for (const v of [h.age >>> 0, h.token >>> 0]) p.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255);
    p.push(h.named ? 1 : 0, (h.num || 0) & 255, ...enc(h.name), 0);
    return p;
  }
  function encodeWho(name) { return [SNS_OP.WHO, ...enc(name), 0]; }
  function encodeBye() { return [SNS_OP.BYE]; }
  function decodeSns(payload) {
    const a = Uint8Array.from(payload);
    if (a.length < 1) return { ok: false, error: 'empty' };
    const u32 = (o) => (a[o] | (a[o + 1] << 8) | (a[o + 2] << 16) | (a[o + 3] << 24)) >>> 0;
    if (a[0] === SNS_OP.HELLO) {
      if (a.length < 18) return { ok: false, error: 'short hello' };
      const name = cstr(a, 15);
      if (!NAME_RE.test(name) || a[15 + name.length] !== 0) return { ok: false, error: 'bad name' };
      return { ok: true, op: 'HELLO', kind: a[1], os: a[2], services: a[3] | (a[4] << 8), age: u32(5), token: u32(9), named: a[13] === 1, num: a[14], name };
    }
    if (a[0] === SNS_OP.WHO) {
      const name = cstr(a, 1);
      if (!NAME_RE.test(name)) return { ok: false, error: 'bad name' };
      return { ok: true, op: 'WHO', name };
    }
    if (a[0] === SNS_OP.BYE) return { ok: true, op: 'BYE' };
    return { ok: false, error: 'unknown op' };
  }
  function snsFrame(src, dst, seq, payload) {
    return encodeFrame({ dst, src, proto: PROTO.SNS, flags: FLAG.PSH, sport: PORT.SNS, dport: PORT.SNS, seq, ack: 0, payload });
  }

  /**
   * Seniority (total order): larger current age first; equal whole-second ages
   * fall to the lower random token; equal tokens fall to the lower node ID.
   */
  function senior(a, b) {
    if (a.age !== b.age) return a.age > b.age ? -1 : 1;
    if (a.token !== b.token) return a.token < b.token ? -1 : 1;
    return a.node < b.node ? -1 : a.node > b.node ? 1 : 0;
  }

  /** Display name from (named, kind, base, num): hb2, toshiba, toshiba2, hummingbird. */
  function displayName(n) {
    if (!n.num) return n.name;
    return n.named ? n.name + n.num : SHORT_NAME[n.kind] + n.num;
  }

  /**
   * NameAgent: one node's naming state machine (§3.4).
   * me = {node, kind, age, token, named, name}: name is the chosen name (named) or ignored (default).
   * peers = live peers as decoded from HELLO: {node, kind, age, token, named, num, name}, with
   * `age` extrapolated to now. The agent keeps its number across calls: numbers never shift.
   * Group = default-named nodes of my kind, or named nodes with my chosen name.
   *   default group: alone -> num 0 (plain core name); 2+ -> everyone numbered from 1.
   *   chosen group:  the most senior unnumbered claimant stays plain (num 0); others number from 2.
   * Conflicts: if a senior group member holds my number, I give it up and take the lowest free.
   */
  class NameAgent {
    constructor(me) { this.me = Object.assign({}, me); this.num = 0; if (!me.named) this.me.name = BASE_NAME[me.kind]; }
    get display() { return displayName({ named: this.me.named, kind: this.me.kind, name: this.me.name, num: this.num }); }
    update(peers, myAge) {
      if (myAge !== undefined) this.me.age = myAge;
      const me = this.me;
      const group = peers.filter((p) => p.node !== me.node && (me.named
        ? (p.named && p.name === me.name)
        : (!p.named && p.kind === me.kind)));
      const first = me.named ? 2 : 1;
      const clash = (n) => group.some((p) => p.num === n && senior(p, me) < 0);
      if (this.num > 0 && !clash(this.num)) return this.display;           // keep my number
      if (this.num === 0 && group.length === 0) return this.display;       // alone: plain
      if (me.named && this.num === 0 && !clash(0)) {
        // plain chosen name is mine unless a more senior unnumbered rival exists
        const plainRivals = group.filter((p) => p.num === 0);
        if (plainRivals.every((p) => senior(me, p) < 0)) return this.display;
      }
      // Need a (new) number: unnumbered members (and me) take the lowest free numbers by seniority.
      const held = new Set(group.map((p) => p.num).filter((n) => n > 0));
      const waiting = group.filter((p) => p.num === 0).concat([me]).sort(senior);
      let n = first, plainGiven = !me.named; // named groups: the first waiting node stays plain
      for (const w of waiting) {
        let mineNow;
        if (!plainGiven) { plainGiven = true; mineNow = 0; }
        else { while (held.has(n)) n++; mineNow = n; held.add(n); }
        if (w === me) { this.num = mineNow; return this.display; }
      }
      return this.display;
    }
    hello(o) {
      return encodeHello({ kind: this.me.kind, os: o.os, services: o.services, age: this.me.age, token: this.me.token, named: this.me.named, num: this.num, name: this.me.name });
    }
  }

  /** Resolve a name against a live peer table (§3.1). Peers: decoded HELLO records. */
  function resolveName(name, peers) {
    if (/^0x[0-9a-fA-F]{4}$/.test(name)) return parseInt(name, 16);
    if (Object.prototype.hasOwnProperty.call(LEGACY_ALIAS, name)) return LEGACY_ALIAS[name];
    const exact = peers.find((p) => displayName(p) === name);
    if (exact) return exact.node;
    const kind = Object.keys(BASE_NAME).find((k) => BASE_NAME[k] === name);
    if (kind) {
      const c = peers.filter((p) => !p.named && p.kind === +kind).sort((a, b) => a.num - b.num);
      if (c.length) return c[0].node;
    }
    return null;
  }

  // ---------------------------------------------------------------- SRRP heads (§4.1)
  function encodeMessage(m) {
    const lines = [m.request ? `${m.method} ${m.path} SRRP/1` : `SRRP/1 ${m.status} ${m.reason}`];
    const headers = Object.assign({}, m.headers || {});
    const body = m.body ? Uint8Array.from(m.body) : null;
    if (body) headers.Size = String(body.length);
    for (const k of Object.keys(headers)) lines.push(`${k}: ${headers[k]}`);
    const head = enc(lines.join('\n') + '\n\n');
    const out = new Uint8Array(head.length + (body ? body.length : 0));
    out.set(head, 0); if (body) out.set(body, head.length);
    return out;
  }
  /** Parse a complete message. Legacy (no "SRRP/1") request lines are reported as legacy. */
  function decodeMessage(bytes, headOnly) {
    const a = Uint8Array.from(bytes);
    let e = -1;
    for (let i = 0; i + 1 < a.length; i++) if (a[i] === 10 && a[i + 1] === 10) { e = i; break; }
    if (e < 0) {
      const line = dec(a).replace(/\0.*$/s, '');
      if (/^GET \S+$/.test(line.trim())) return { ok: true, legacy: true, method: 'GET', path: line.trim().slice(4) };
      return { ok: false, error: 'no head end' };
    }
    const lines = dec(a.slice(0, e)).split('\n');
    const first = lines.shift();
    const headers = {};
    for (const l of lines) {
      const m = /^([A-Za-z-]+): (.*)$/.exec(l);
      if (!m) return { ok: false, error: 'bad header: ' + l };
      headers[m[1]] = m[2];
    }
    const body = a.slice(e + 2);
    if (!headOnly) {
      if (body.length && headers.Size === undefined) return { ok: false, error: 'body without Size' };
      if (headers.Size !== undefined && +headers.Size !== body.length) return { ok: false, error: 'Size mismatch' };
    }
    let m;
    if ((m = /^(GET|PUT|POST|LIST|DEL) (\/\S*) SRRP\/1$/.exec(first))) return { ok: true, request: true, method: m[1], path: m[2], headers, body };
    if ((m = /^SRRP\/1 ([0-9]{3}) (.+)$/.exec(first))) return { ok: true, request: false, status: +m[1], reason: m[2], headers, body };
    return { ok: false, error: 'bad first line' };
  }
  /** Peek the head from the first frame only (to refuse 413 before a body arrives). */
  function peekHead(firstPayload) {
    const a = Uint8Array.from(firstPayload);
    for (let i = 0; i + 1 < a.length; i++) if (a[i] === 10 && a[i + 1] === 10) {
      const r = decodeMessage(a.slice(0, i + 2), true);
      return r.ok ? r : null;
    }
    return null; // head must fit in the first frame
  }
  function trytes16Encode(trytes) {
    const out = new Uint8Array(trytes.length * 2);
    trytes.forEach((t, i) => { if (t < -9841 || t > 9841) throw new Error('not a tryte'); const v = t & 0xFFFF; out[2 * i] = v & 255; out[2 * i + 1] = v >>> 8; });
    return out;
  }
  function trytes16Decode(bytes) {
    const out = [];
    for (let i = 0; i + 1 < bytes.length; i += 2) { let v = bytes[i] | (bytes[i + 1] << 8); if (v & 0x8000) v -= 0x10000; out.push(v); }
    return out;
  }
  /** Inbox / share name rule (§4.3). */
  function safeFileName(n) { return /^[A-Za-z0-9._-]{1,31}$/.test(n) && n !== '.' && n !== '..' && !n.includes('..'); }

  // ---------------------------------------------------------------- transfer (§4.2)
  const SEQ = (x) => x & 0xFFFF;
  const seqDiff = (a, b) => ((a - b) << 16) >> 16; // signed distance a-b in 16-bit space

  /**
   * Sender: splits `message` (Uint8Array) into ≤480-byte frames and sends them with an
   * adaptive window, cumulative ACK + 16-frame SACK bitmap, and selective resend.
   * Clock is abstract (`now` passed in), so the same code runs on wall time or virtual steps.
   */
  class Sender {
    constructor(o) {
      this.src = o.src; this.dst = o.dst; this.sport = o.sport; this.dport = o.dport;
      this.rto = o.rto || 500; this.maxTries = o.maxTries || 5;
      const msg = Uint8Array.from(o.message);
      this.chunks = [];
      for (let i = 0; i < Math.max(1, Math.ceil(msg.length / MAX_PAYLOAD)); i++) this.chunks.push(msg.slice(i * MAX_PAYLOAD, (i + 1) * MAX_PAYLOAD));
      this.S = SEQ(o.startSeq || 0);
      this.base = 0;            // index of first unacked chunk
      this.next = 0;            // index of next never-sent chunk
      this.cwnd = 2; this.peerWindow = 4; this.grownAt = 0;
      this.sacked = new Set(); this.sentAt = new Map(); this.fast = new Set();
      this.fails = 0; this.state = 'sending'; this.stats = { sent: 0, resent: 0, timeouts: 0, maxCwnd: 2 };
    }
    _frame(i) {
      const last = i === this.chunks.length - 1;
      let flags = FLAG.PSH | (i === 0 ? FLAG.SYN : 0) | (last ? FLAG.FIN : 0);
      return encodeFrame({ dst: this.dst, src: this.src, proto: PROTO.SSP, flags, sport: this.sport, dport: this.dport, seq: SEQ(this.S + i), ack: 0, payload: this.chunks[i] });
    }
    /** Frames to put on the wire now. */
    poll(now) {
      const out = [];
      if (this.state !== 'sending') return out;
      // timeout on the oldest unacked frame
      const t0 = this.sentAt.get(this.base);
      if (t0 !== undefined && now - t0 >= this.rto) {
        this.stats.timeouts++; this.fails++;
        if (this.fails > this.maxTries) { this.state = 'failed'; return out; }
        this.cwnd = Math.max(1, Math.floor(this.cwnd / 2));
        for (let i = this.base; i < this.next; i++) if (!this.sacked.has(i)) { out.push(this._frame(i)); this.sentAt.set(i, now); this.fast.delete(i); this.stats.resent++; }
      }
      const limit = Math.min(this.cwnd, this.peerWindow);
      while (this.next < this.chunks.length && this.next - this.base < limit) {
        out.push(this._frame(this.next)); this.sentAt.set(this.next, now); this.next++; this.stats.sent++;
      }
      return out;
    }
    /** Feed an ACK frame (decoded). Returns frames to resend immediately (fast selective resend). */
    onAck(f, now) {
      const out = [];
      if (this.state !== 'sending' || !(f.flags & FLAG.ACK) || (f.flags & FLAG.PSH)) return out;
      const ackIdx = seqDiff(f.ack, this.S);              // next expected chunk index at receiver
      if (f.payload.length >= 3) this.peerWindow = Math.max(1, Math.min(16, f.payload[2]));
      const bitmap = f.payload.length >= 2 ? (f.payload[0] | (f.payload[1] << 8)) : 0;
      if (ackIdx > this.base && ackIdx <= this.next) {
        for (let i = this.base; i < ackIdx; i++) { this.sentAt.delete(i); this.sacked.delete(i); }
        this.base = ackIdx; this.fails = 0;
        if (this.base - this.grownAt >= this.cwnd) { this.cwnd = Math.min(this.peerWindow, this.cwnd + 1); this.grownAt = this.base; this.stats.maxCwnd = Math.max(this.stats.maxCwnd, this.cwnd); }
      }
      for (let i = 0; i < 16; i++) if (bitmap & (1 << i)) { const idx = ackIdx + 1 + i; if (idx < this.next) this.sacked.add(idx); }
      if (this.base >= this.chunks.length) { this.state = 'done'; return out; }
      // Fast selective resend: a missing frame with at least 3 later frames SACKed is lost
      // (TCP's duplicate threshold); resend it once. Timeouts still cover everything else.
      for (let i = this.base; i < this.next; i++) {
        if (this.sacked.has(i) || this.fast.has(i)) continue;
        let later = 0; for (const j of this.sacked) if (j > i) later++;
        if (later >= 3) { out.push(this._frame(i)); this.sentAt.set(i, now); this.fast.add(i); this.stats.resent++; }
      }
      return out;
    }
  }

  /** Receiver: reassembles one message, emits ACK frames, refuses early by Size. */
  class Receiver {
    constructor(o) {
      this.me = o.me; this.window = Math.max(4, Math.min(16, o.window || 8)); this.maxSize = o.maxSize || 65536;
      this.S = null; this.buf = new Map(); this.expect = 0; this.finIdx = -1; this.sinceAck = 0;
      this.state = 'waiting'; this.message = null; this.peer = null;
      this.stats = { received: 0, duplicates: 0, outOfWindow: 0 };
    }
    _ack(f) {
      let bm = 0;
      for (let i = 0; i < 16; i++) if (this.buf.has(this.expect + 1 + i)) bm |= 1 << i;
      return encodeFrame({ dst: f.src, src: this.me, proto: PROTO.SSP, flags: FLAG.ACK, sport: f.dport, dport: f.sport, seq: 0, ack: SEQ(this.S + this.expect), payload: [bm & 255, bm >>> 8, this.window] });
    }
    /** Feed a decoded data frame. Returns frames to send back (ACKs). */
    onData(f) {
      if (this.state === 'refused' || this.state === 'done') return this.state === 'done' && this.S !== null ? [this._ack(f)] : [];
      if (!(f.flags & FLAG.PSH)) return [];
      if (this.S === null) {
        if (!(f.flags & FLAG.SYN)) return []; // wait for the first frame of a message
        this.S = f.seq; this.peer = { node: f.src, port: f.sport };
        const head = peekHead(f.payload);
        if (head && head.headers && head.headers.Size !== undefined && +head.headers.Size > this.maxSize) { this.state = 'refused'; this.refusedHead = head; return []; }
        this.state = 'receiving';
      }
      const idx = seqDiff(f.seq, this.S);
      if (idx < this.expect || this.buf.has(idx)) { this.stats.duplicates++; return [this._ack(f)]; }
      if (idx >= this.expect + this.window) { this.stats.outOfWindow++; return [this._ack(f)]; }
      this.buf.set(idx, f.payload); this.stats.received++;
      if (f.flags & FLAG.FIN) this.finIdx = idx;
      const gap = idx !== this.expect;
      while (this.buf.has(this.expect)) this.expect++;
      this.sinceAck++;
      const complete = this.finIdx >= 0 && this.expect > this.finIdx;
      if (complete) {
        const parts = []; let total = 0;
        for (let i = 0; i <= this.finIdx; i++) { parts.push(this.buf.get(i)); total += this.buf.get(i).length; }
        const m = new Uint8Array(total); let o = 0; for (const p of parts) { m.set(p, o); o += p.length; }
        this.message = m; this.state = 'done';
      }
      if (complete || gap || this.sinceAck >= 2) { this.sinceAck = 0; return [this._ack(f)]; }
      return [];
    }
  }

  // ---------------------------------------------------------------- Bridge envelope (§5)
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xFFFFFFFF; for (const x of bytes) c = CRC_TABLE[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function wrapBridge(frame, origin, hop) {
    const f = Uint8Array.from(frame), out = new Uint8Array(13 + f.length), c = crc32(f);
    out.set([0x53, 0x4E, 0x42, 0x31], 0); out[4] = hop & 255;
    for (let i = 0; i < 4; i++) { out[5 + i] = (origin >>> (8 * i)) & 255; out[9 + i] = (c >>> (8 * i)) & 255; }
    out.set(f, 13);
    return out;
  }
  /** Returns {ok, frame, origin, hop} or {ok:false, error}. `self` = this bridge's origin id. */
  function unwrapBridge(env, self) {
    const e = Uint8Array.from(env);
    if (e.length < 13 + HEADER || e[0] !== 0x53 || e[1] !== 0x4E || e[2] !== 0x42 || e[3] !== 0x31) return { ok: false, error: 'not SNB1' };
    const u32 = (o) => (e[o] | (e[o + 1] << 8) | (e[o + 2] << 16) | (e[o + 3] << 24)) >>> 0;
    const hop = e[4], origin = u32(5), crc = u32(9), frame = e.slice(13);
    if (origin === (self >>> 0)) return { ok: false, error: 'own origin (loop)' };
    if (hop >= 4) return { ok: false, error: 'hop limit' };
    if (crc32(frame) !== crc) return { ok: false, error: 'crc' };
    return { ok: true, frame, origin, hop };
  }

  const api = {
    PROTO, FLAG, PORT, BROADCAST, HEADER, MAX_PAYLOAD, SNS_OP, KIND, OS, SERVICE, BASE_NAME, SHORT_NAME, LEGACY_ALIAS,
    encodeFrame, decodeFrame, encodeHello, encodeWho, encodeBye, decodeSns, snsFrame, senior, NameAgent, displayName, resolveName,
    encodeMessage, decodeMessage, peekHead, trytes16Encode, trytes16Decode, safeFileName, Sender, Receiver,
    crc32, wrapBridge, unwrapBridge, seqDiff
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.StudioNetRef = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
