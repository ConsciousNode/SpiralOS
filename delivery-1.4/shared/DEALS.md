# CNSW shared card deals (SpiralOS 1.4 and TritOS 1.1.2)

The same seed must give the same deal on every studio machine, including the balanced-ternary Triton, which has no binary XOR or shift. So every generator here uses **integer arithmetic only** (`*`, `/`, `mod`, `+`, `-`). Every intermediate stays below 2^31 · 2^18, well inside a 27-trit word (±3.8 × 10^12). `deals-ref.js` is the reference: run it, and match it.

- **Card id** = `suit*13 + (rank-1)`. Suits are 0 clubs, 1 diamonds, 2 hearts, 3 spades; rank 1 = A … 13 = K.
- **Random source (MINSTD):** `x ← 48271·x mod (2^31−1)`, computed with Schrage's method (`Q = 44488`, `R = 3399`) so it never overflows. A seed of 0 maps to `2^31−2`. Check value: from seed 1, the 10,000th output is **399268537**.
- **CNSW deal v1:** start from cards `0..n−1` (`n = 52`; Spider uses 104 = two decks, card id `i mod 52`). For `i = n−1 … 1`: `j = next() mod (i+1)`, then swap `deck[i]` and `deck[j]`. The deck is then dealt in the game's standard layout order, documented in each game's help screen.
  - Klondike and Spider: shown as `seed`, entered as `0..2,147,483,646`.
- **FreeCell:** uses **Microsoft deal numbers 1..32000**, generated with the public MS algorithm. That's `seed ← (214013·seed + 2531011) mod 2^31`, `rand = seed div 65536`, computed in 16-bit halves as in `deals-ref.js`. Known answers: deal #1 starts `JD 2D 9H JC 5D 7H 7C 5H`; deal #11982 is the famous unsolvable one.
- **Self-check:** `node deals-ref.js` prints three lines, and each OS must reproduce them.
