/*
 * deals-ref.js — CNSW shared card deals (reference for SpiralOS and TritOS)
 * ConsciousNode SoftWorks · MIT · Kehai Interim, 2026-11-13
 * Arithmetic only (no XOR/shift), so a balanced-ternary machine can run it exactly.
 * Card id = suit*13 + (rank-1); suits 0 clubs, 1 diamonds, 2 hearts, 3 spades; rank 1=A..13=K.
 */
'use strict';
const SUITS = 'CDHS', RANKS = 'A23456789TJQK';
const name = (c) => RANKS[c % 13] + SUITS[Math.floor(c / 13)];

// MINSTD (Park–Miller, multiplier 48271, modulus 2^31-1) with Schrage's method: every
// intermediate stays below 2^31, so it fits a 27-trit word without overflow.
function minstd(seed) {
  const M = 2147483647, A = 48271, Q = 44488, R = 3399; // Q = M div A, R = M mod A
  let x = seed % M; if (x <= 0) x += M - 1;
  return () => { const hi = Math.floor(x / Q), lo = x % Q; x = A * lo - R * hi; if (x <= 0) x += M; return x; };
}
/** CNSW deal v1: Fisher–Yates over cards 0..n-1 (n = 52 or 104 for Spider 2-deck), j = r mod (i+1). */
function cnswShuffle(seed, n) {
  const deck = Array.from({ length: n }, (_, i) => i % 52), rnd = minstd(seed);
  for (let i = n - 1; i >= 1; i--) { const j = rnd() % (i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}
/** Microsoft FreeCell deal #n (public algorithm), returned as 8 columns. Split multiply keeps < 2^31·2^18. */
function msFreeCell(n) {
  let seed = n;
  const rand = () => {
    // seed = (seed*214013 + 2531011) mod 2^31, computed as (seed*(214013 mod 2^31)) with 16-bit halves
    const lo = seed % 65536, hi = Math.floor(seed / 65536);
    const p = (lo * 214013 + ((hi * 214013) % 32768) * 65536 + 2531011) % 2147483648;
    seed = p; return Math.floor(seed / 65536); // 0..32767
  };
  // MS deck order: A..K, each rank in suit order C D H S -> card index 4*(rank-1)+suit
  let deck = Array.from({ length: 52 }, (_, i) => i);
  const out = [];
  for (let left = 52; left > 0; left--) { const j = rand() % left; out.push(deck[j]); deck[j] = deck[left - 1]; deck.length = left - 1; }
  const cols = Array.from({ length: 8 }, () => []);
  out.forEach((c, i) => cols[i % 8].push(RANKS[Math.floor(c / 4)] + SUITS[c % 4]));
  return cols;
}
module.exports = { name, minstd, cnswShuffle, msFreeCell };
if (require.main === module) {
  const c1 = msFreeCell(1);
  const row1 = c1.map((c) => c[0]).join(' ');
  console.log('MS #1 first row:', row1, row1 === 'JD 2D 9H JC 5D 7H 7C 5H' ? '(matches the published deal)' : '(MISMATCH)');
  const r = minstd(1); let v; for (let i = 0; i < 10000; i++) v = r();
  console.log('MINSTD(48271) 10,000th value from seed 1:', v, v === 399268537 ? '(matches the published check value)' : '(MISMATCH)');
  console.log('CNSW deal v1 seed 1222, first 8 cards:', cnswShuffle(1222, 52).slice(0, 8).map(name).join(' '));
}
