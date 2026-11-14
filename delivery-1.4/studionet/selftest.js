#!/usr/bin/env node
'use strict';
/*
 * selftest.js — checks studionet-ref.js against STUDIONET-1.0-DRAFT.md, with positive controls.
 * ConsciousNode SoftWorks · MIT · Kehai Interim, 2026-11-13
 * Usage: node selftest.js   (prints one line per check, exits 1 on any failure)
 */
const R = require('./studionet-ref.js');
let fails = 0;
function check(name, ok, detail) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fails++; }

// Deterministic PRNG (mulberry32) for the simulated link.
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- 1. frames
{
  const f = R.encodeFrame({ dst: 0x0201, src: 0x0101, proto: 2, flags: 4, sport: 4200, dport: 4200, seq: 100, ack: 0, payload: [72, 105, 0] });
  const d = R.decodeFrame(f);
  check('1a frame round trip', d.ok && d.dst === 0x0201 && d.src === 0x0101 && d.seq === 100 && d.payload.length === 3);
  check('1b short frame refused', !R.decodeFrame(f.slice(0, 15)).ok);
  const bad = Uint8Array.from(f); bad[14] = 9;
  check('1c len mismatch refused', R.decodeFrame(bad).error === 'len mismatch');
  check('1d 481-byte payload refused by encoder', (() => { try { R.encodeFrame({ dst: 1, src: 2, proto: 2, flags: 0, sport: 1, dport: 1, payload: new Uint8Array(481) }); return false; } catch (e) { return true; } })());
}

// ---------------------------------------------------------------- 2. SNS
{
  const h = { kind: 2, os: 1, services: 0x17, age: 1234, token: 0xDEADBEEF, named: false, num: 2, name: 'hummingbird' };
  const d = R.decodeSns(R.encodeHello(h));
  check('2a HELLO round trip', d.ok && d.op === 'HELLO' && d.age === 1234 && d.token === 0xDEADBEEF && d.num === 2 && d.name === 'hummingbird' && d.services === 0x17);
  check('2b WHO round trip', R.decodeSns(R.encodeWho('toshiba')).name === 'toshiba');
  check('2c BYE', R.decodeSns(R.encodeBye()).op === 'BYE');
  check('2d bad name refused', !R.decodeSns([2, 65, 66, 0]).ok); // uppercase not allowed
  check('2e display names', R.displayName({ named: false, kind: 2, name: 'hummingbird', num: 2 }) === 'hb2' && R.displayName({ named: true, kind: 1, name: 'toshiba', num: 2 }) === 'toshiba2' && R.displayName({ named: false, kind: 3, name: 'triton', num: 0 }) === 'triton');
}

// ---------------------------------------------------------------- 3. naming (§3.4), simulated broadcast
function NameNet() {
  const nodes = [];
  return {
    nodes,
    join(n, t) { const a = new R.NameAgent(n); a.joinedAt = t; a.alive = true; a.deaf = new Set(n.deafTo || []); nodes.push(a); return a; },
    leave(node) { nodes.find((a) => a.me.node === node).alive = false; },
    /** One HELLO round at time t: every live agent updates from what it can hear. */
    round(t) {
      const snap = nodes.filter((a) => a.alive).map((a) => ({ node: a.me.node, kind: a.me.kind, age: Math.floor(t - a.joinedAt), token: a.me.token, named: a.me.named, num: a.num, name: a.me.name }));
      for (const a of nodes.filter((x) => x.alive)) a.update(snap.filter((p) => !a.deaf.has(p.node)), Math.floor(t - a.joinedAt));
    },
    names() { return Object.fromEntries(nodes.filter((a) => a.alive).map((a) => [a.me.node.toString(16), a.display])); },
    settle(t, rounds = 4) { for (let i = 0; i < rounds; i++) this.round(t + i * 0.001); }
  };
}
{
  const N = NameNet();
  N.join({ node: 0x0201, kind: 2, token: 50 }, 0); N.settle(1);
  check('3a lone core keeps plain name', N.names()['201'] === 'hummingbird');
  N.join({ node: 0x0202, kind: 2, token: 10 }, 5); N.settle(8);
  N.join({ node: 0x0203, kind: 2, token: 99 }, 9); N.settle(12);
  const n = N.names();
  check('3b three in join order -> hb1 hb2 hb3', n['201'] === 'hb1' && n['202'] === 'hb2' && n['203'] === 'hb3', JSON.stringify(n));
  N.leave(0x0201); N.settle(20);
  check('3c numbers do not shift when hb1 leaves', N.names()['202'] === 'hb2' && N.names()['203'] === 'hb3', JSON.stringify(N.names()));
  N.join({ node: 0x0204, kind: 2, token: 7 }, 30); N.settle(31);
  check('3d newcomer takes lowest free (hb1)', N.names()['204'] === 'hb1', JSON.stringify(N.names()));
  const peers = N.nodes.filter((a) => a.alive).map((a) => ({ node: a.me.node, kind: a.me.kind, named: false, num: a.num, name: a.me.name }));
  check('3e base name resolves to lowest number', R.resolveName('hummingbird', peers) === 0x0204 && R.resolveName('hb3', peers) === 0x0203 && R.resolveName('0x0202', peers) === 0x0202);
}
{
  // Simultaneous join: equal age, deaf to each other during the listen window -> both claim; token decides.
  const N = NameNet();
  N.join({ node: 0x0301, kind: 3, token: 900 }, 0); N.join({ node: 0x0302, kind: 3, token: 100 }, 0);
  N.settle(3, 6);
  const n = N.names();
  check('3f tie (same age) -> lower token is tri1', n['302'] === 'tri1' && n['301'] === 'tri2', JSON.stringify(n));
  // Positive control: if the agents ignored token (ordering by node only), the result must differ.
  const saved = R.senior; let alt;
  { const M = NameNet(); const orig = M.round; M.join({ node: 0x0301, kind: 3, token: 900 }, 0); M.join({ node: 0x0302, kind: 3, token: 100 }, 0);
    M.nodes.forEach((a) => { a.me.token = 0; }); M.settle(3, 6); alt = M.names(); }
  check('3g control: without tokens the tie resolves differently', alt['301'] === 'tri1', JSON.stringify(alt));
}
{
  // Two bridged LANs that each have an hb1 merge: the older keeps it.
  const N = NameNet();
  N.join({ node: 0x0201, kind: 2, token: 5, deafTo: [0x0211, 0x0212] }, 0);
  N.join({ node: 0x0202, kind: 2, token: 6, deafTo: [0x0211, 0x0212] }, 2);
  N.join({ node: 0x0211, kind: 2, token: 1, deafTo: [0x0201, 0x0202] }, 10);
  N.join({ node: 0x0212, kind: 2, token: 2, deafTo: [0x0201, 0x0202] }, 11);
  N.settle(20);
  const before = N.names();
  N.nodes.forEach((a) => a.deaf.clear()); N.settle(40, 6);
  const after = N.names();
  const vals = Object.values(after);
  check('3h LAN merge: older hb1 keeps it, no duplicates', after['201'] === 'hb1' && new Set(vals).size === vals.length && before['211'] === 'hb1', JSON.stringify({ before, after }));
}
{
  // Chosen-name clash -> name2.
  const N = NameNet();
  N.join({ node: 0x0101, kind: 1, token: 3, named: true, name: 'toshiba' }, 0);
  N.join({ node: 0x0201, kind: 2, token: 1, named: true, name: 'toshiba' }, 4);
  N.settle(6);
  const n = N.names();
  check('3i chosen-name clash -> older keeps it, other gets toshiba2', n['101'] === 'toshiba' && n['201'] === 'toshiba2', JSON.stringify(n));
}

// ---------------------------------------------------------------- 4. SRRP heads
{
  const m = R.encodeMessage({ request: true, method: 'PUT', path: '/inbox/note.txt', headers: { Encoding: 'bytes' }, body: [1, 2, 3] });
  const d = R.decodeMessage(m);
  check('4a request round trip', d.ok && d.method === 'PUT' && d.path === '/inbox/note.txt' && d.headers.Size === '3' && d.body.length === 3);
  const r = R.decodeMessage(R.encodeMessage({ request: false, status: 404, reason: 'NOT FOUND' }));
  check('4b response round trip', r.ok && r.status === 404 && r.reason === 'NOT FOUND');
  check('4c legacy "GET /" detected', R.decodeMessage(Array.from('GET /index', (c) => c.charCodeAt(0))).legacy === true);
  const bad = R.encodeMessage({ request: true, method: 'GET', path: '/x', body: [1, 2] }); bad[bad.length - 1] = 0; const cut = bad.slice(0, -1);
  check('4d Size mismatch refused', R.decodeMessage(cut).error === 'Size mismatch');
  const t = [-9841, -1, 0, 1, 9841, 1234];
  check('4e trytes16 round trip', JSON.stringify(R.trytes16Decode(R.trytes16Encode(t))) === JSON.stringify(t));
  check('4f unsafe names refused', !R.safeFileName('../x') && !R.safeFileName('a/b') && !R.safeFileName('..') && R.safeFileName('note.txt'));
  check('4g POST form submit parses', R.decodeMessage(R.encodeMessage({ request: true, method: 'POST', path: '/chat', body: Array.from('q=hi', (c) => c.charCodeAt(0)) })).method === 'POST');
}

// ---------------------------------------------------------------- 5. transfer over a lossy, reordering link
function transfer(size, opt) {
  const r = rng(opt.seed);
  const msg = new Uint8Array(size).map((_, i) => (i * 7 + 3) & 255);
  const s = new R.Sender({ src: 0x0101, dst: 0x00FD, sport: 49152, dport: 80, message: msg, startSeq: opt.startSeq || 65000, rto: 50 });
  const rx = new R.Receiver({ me: 0x00FD, window: opt.window || 8, maxSize: 1 << 20 });
  if (opt.breakSack) s.onAck = ((orig) => function (f, now) { const g = Object.assign({}, f, { payload: new Uint8Array([0, 0, f.payload[2]]) }); return orig.call(this, g, now); })(s.onAck);
  let wire = []; let t = 0; let delivered = 0, dropped = 0, dups = 0;
  const put = (frames, dir) => { for (const fr of frames) {
    if (r() < (opt.drop || 0)) { dropped++; continue; }
    wire.push({ fr, dir, at: t + 1 + Math.floor(r() * (opt.jitter || 0)) });
    if (r() < (opt.dup || 0)) { wire.push({ fr, dir, at: t + 2 }); dups++; } } };
  for (t = 0; t < 200000 && s.state === 'sending'; t++) {
    put(s.poll(t), 'fwd');
    const now = wire.filter((w) => w.at <= t); wire = wire.filter((w) => w.at > t);
    for (const w of now) {
      const f = R.decodeFrame(w.fr);
      if (w.dir === 'fwd') { delivered++; put(rx.onData(f), 'back'); } else put(s.onAck(f, t), 'fwd');
    }
  }
  const same = rx.message && rx.message.length === msg.length && rx.message.every((v, i) => v === msg[i]);
  return { ok: s.state === 'done' && same, s, rx, dropped, dups, time: t };
}
{
  const a = transfer(65536, { seed: 1 });
  check('5a 64 KB clean link', a.ok, `frames sent ${a.s.stats.sent}, resent ${a.s.stats.resent}, max window ${a.s.stats.maxCwnd}, seq wrapped through 65535`);
  const b = transfer(65536, { seed: 2, drop: 0.05, jitter: 6, dup: 0.03 });
  check('5b 64 KB with 5% drop, 3% duplicates, reordering', b.ok, `dropped ${b.dropped}, dups ${b.dups}, resent ${b.s.stats.resent}, timeouts ${b.s.stats.timeouts}, rx duplicates ${b.rx.stats.duplicates}`);
  const c = transfer(3000, { seed: 3, drop: 0.2, jitter: 4 });
  check('5c 3 KB with 20% drop', c.ok, `resent ${c.s.stats.resent}`);
  const one = transfer(10, { seed: 4 });
  check('5d one-frame message (SYN|PSH|FIN)', one.ok && one.s.chunks.length === 1);
  // SACK efficiency: with SACK, resends should be close to drops; positive control without SACK must resend more.
  const withS = transfer(65536, { seed: 7, drop: 0.05, jitter: 6 });
  const noS = transfer(65536, { seed: 7, drop: 0.05, jitter: 6, breakSack: true });
  check('5e SACK cuts resends (control: SACK bitmap zeroed)', withS.ok && noS.ok && withS.s.stats.resent < noS.s.stats.resent, `with SACK ${withS.s.stats.resent} resends (${withS.dropped} drops); without ${noS.s.stats.resent}`);
  // Timeout halves the window.
  const h = new R.Sender({ src: 1, dst: 2, sport: 1, dport: 2, message: new Uint8Array(5000), rto: 10 });
  h.cwnd = 8; h.peerWindow = 8; h.poll(0); h.poll(10);
  check('5f timeout halves window', h.cwnd === 4, `cwnd ${h.cwnd}`);
  // Total failure after max tries.
  const f = new R.Sender({ src: 1, dst: 2, sport: 1, dport: 2, message: new Uint8Array(100), rto: 10, maxTries: 5 });
  for (let t = 0; t <= 100; t++) f.poll(t);
  check('5g gives up after 5 timeouts without progress', f.state === 'failed');
  // Size refusal before the body.
  const rx = new R.Receiver({ me: 2, maxSize: 1000 });
  const big = R.encodeMessage({ request: true, method: 'PUT', path: '/inbox/big', body: new Uint8Array(5000) });
  const fr = R.decodeFrame(R.encodeFrame({ dst: 2, src: 1, proto: 3, flags: R.FLAG.SYN | R.FLAG.PSH, sport: 49152, dport: 80, seq: 1, payload: big.slice(0, 480) }));
  rx.onData(fr);
  check('5h oversize PUT refused at the first frame (413)', rx.state === 'refused' && rx.stats.received === 0);
}

// ---------------------------------------------------------------- 6. bridge envelope
{
  const frame = R.encodeFrame({ dst: 0xFFFF, src: 0x0101, proto: 2, flags: 4, sport: 4200, dport: 4200, payload: [104, 105, 0] });
  const env = R.wrapBridge(frame, 0xA1B2C3D4, 0);
  const u = R.unwrapBridge(env, 0x11111111);
  check('6a envelope round trip', u.ok && u.frame.length === frame.length && u.origin === 0xA1B2C3D4);
  const bad = Uint8Array.from(env); bad[20] ^= 1;
  check('6b corrupted frame dropped by CRC (positive control)', R.unwrapBridge(bad, 0x11111111).error === 'crc');
  check('6c own origin dropped (loop guard)', R.unwrapBridge(env, 0xA1B2C3D4).error === 'own origin (loop)');
  check('6d hop limit', R.unwrapBridge(R.wrapBridge(frame, 1, 4), 2).error === 'hop limit');
  check('6e CRC-32 known answer ("123456789" = 0xCBF43926)', R.crc32(Array.from('123456789', (c) => c.charCodeAt(0))) === 0xCBF43926);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
