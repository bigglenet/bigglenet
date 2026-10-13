// A small QR code maker, for setting up two-factor sign-in (the otpauth:// link an authenticator
// app scans). Byte mode, error correction level M, versions 1–10 (up to 213 bytes): enough for
// that, and no dependency. Returns the modules as rows of booleans (true = dark).

// Per version (index 1–10), level M: error correction codewords per block, and the blocks as
// [count, data codewords] groups.
const BLOCKS: [number, [number, number][]][] = [
  [0, []],
  [10, [[1, 16]]],
  [16, [[1, 28]]],
  [26, [[1, 44]]],
  [18, [[2, 32]]],
  [24, [[2, 43]]],
  [16, [[4, 27]]],
  [18, [[4, 31]]],
  [22, [[2, 38], [2, 39]]],
  [22, [[3, 36], [2, 37]]],
  [26, [[4, 43], [1, 44]]],
];
const ALIGN: number[][] = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const REMAINDER = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

// --- Reed–Solomon over GF(256) ---
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function generator(degree: number): number[] {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

function errorCodes(data: number[], degree: number): number[] {
  const g = generator(degree);
  const out = [...data, ...new Array(degree).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = out[i];
    if (!factor) continue;
    for (let j = 0; j < g.length; j++) out[i + j] ^= mul(g[j], factor);
  }
  return out.slice(data.length);
}

// --- Bits ---
function bch(value: number, poly: number, bits: number): number {
  let v = value << bits;
  const top = Math.floor(Math.log2(poly));
  for (let i = Math.floor(Math.log2(v)); i >= top; i--) if (v & (1 << i)) v ^= poly << (i - top);
  return (value << bits) | v;
}

export function qr(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const version = BLOCKS.findIndex(([, groups], v) => v > 0 && groups.reduce((n, [c, d]) => n + c * d, 0) >= bytes.length + 3);
  if (version < 1) throw new Error('Too long for a QR code here.');
  const [ecPerBlock, groups] = BLOCKS[version];
  const dataCodewords = groups.reduce((n, [c, d]) => n + c * d, 0);

  // Mode (byte), length, the bytes, a terminator, then padding.
  const bits: number[] = [];
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, dataCodewords * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < dataCodewords; pad ^= 0xec ^ 0x11) data.push(pad);

  // Split into blocks, add error correction, and interleave.
  const blocks: { data: number[]; ec: number[] }[] = [];
  let at = 0;
  for (const [count, size] of groups) {
    for (let i = 0; i < count; i++) {
      const d = data.slice(at, at + size);
      at += size;
      blocks.push({ data: d, ec: errorCodes(d, ecPerBlock) });
    }
  }
  const codewords: number[] = [];
  const longest = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.data.length) codewords.push(b.data[i]);
  for (let i = 0; i < ecPerBlock; i++) for (const b of blocks) codewords.push(b.ec[i]);
  const stream: number[] = [];
  for (const c of codewords) for (let i = 7; i >= 0; i--) stream.push((c >>> i) & 1);
  for (let i = 0; i < REMAINDER[version]; i++) stream.push(0);

  // The grid, with its fixed patterns. `fixed` marks what data mustn't go over.
  const size = 17 + 4 * version;
  const grid = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (r: number, c: number, dark: boolean) => {
    grid[r][c] = dark;
    fixed[r][c] = true;
  };
  for (const [r0, c0] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        set(rr, cc, r >= 0 && r <= 6 && c >= 0 && c <= 6 && ring !== 2);
      }
    }
  }
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const centres = ALIGN[version];
  for (const r of centres) {
    for (const c of centres) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }
  set(size - 8, 8, true);
  // Reserve the format areas (filled in after masking) and the version blocks.
  for (const [a, b] of formatSpots(size)) {
    fixed[a[0]][a[1]] = true;
    fixed[b[0]][b[1]] = true;
  }
  if (version >= 7) {
    const info = bch(version, 0x1f25, 12);
    for (let i = 0; i < 18; i++) {
      const dark = ((info >>> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      set(a, b, dark);
      set(b, a, dark);
    }
  }

  // The data, up and down in pairs of columns from the bottom right.
  let bit = 0;
  for (let right = size - 1, upward = true; right > 0; right -= 2, upward = !upward) {
    if (right === 6) right--;
    for (let i = 0; i < size; i++) {
      const r = upward ? size - 1 - i : i;
      for (const c of [right, right - 1]) {
        if (fixed[r][c]) continue;
        grid[r][c] = stream[bit++] === 1;
      }
    }
  }

  // Try each mask; keep the one that's easiest to scan.
  const MASKS: ((r: number, c: number) => boolean)[] = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];
  let best: boolean[][] = grid;
  let bestScore = Infinity;
  MASKS.forEach((mask, m) => {
    const g = grid.map((row, r) => row.map((dark, c) => (fixed[r][c] ? dark : dark !== mask(r, c))));
    // Format: level M (00) and the mask, error-corrected and masked, in both places.
    const format = bch((0b00 << 3) | m, 0x537, 10) ^ 0x5412;
    formatSpots(size).forEach(([a, b], i) => {
      const dark = ((format >>> i) & 1) === 1;
      g[a[0]][a[1]] = dark;
      g[b[0]][b[1]] = dark;
    });
    const score = penalty(g);
    if (score < bestScore) {
      bestScore = score;
      best = g;
    }
  });
  return best;
}

/** Where each of the 15 format bits goes: [row, column] next to the top-left finder, and its copy. */
function formatSpots(size: number): [number, number][][] {
  return Array.from({ length: 15 }, (_, i) => {
    const first: [number, number] = i < 6 ? [i, 8] : i === 6 ? [7, 8] : i === 7 ? [8, 8] : i === 8 ? [8, 7] : [8, 14 - i];
    const second: [number, number] = i < 8 ? [8, size - 1 - i] : [size - 15 + i, 8];
    return [first, second];
  });
}

/** The standard penalty: runs, blocks, finder-like patterns and imbalance. */
function penalty(g: boolean[][]): number {
  const n = g.length;
  let score = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b < n; b++) {
        const here = pass ? g[b][a] : g[a][b];
        const before = pass ? g[b - 1][a] : g[a][b - 1];
        if (here === before) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
    }
  }
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) if (g[r][c] === g[r + 1][c] && g[r][c] === g[r][c + 1] && g[r][c] === g[r + 1][c + 1]) score += 3;
  const pattern = [true, false, true, true, true, false, true, false, false, false, false];
  const reversed = [...pattern].reverse();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c <= n - 11; c++) {
      for (const p of [pattern, reversed]) {
        if (p.every((v, i) => g[r][c + i] === v)) score += 40;
        if (p.every((v, i) => g[c + i][r] === v)) score += 40;
      }
    }
  }
  const dark = g.reduce((s, row) => s + row.filter(Boolean).length, 0);
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return score;
}

/** The code as an SVG (with the quiet zone around it). */
export function qrSvg(text: string): string {
  const g = qr(text);
  const n = g.length + 8;
  let path = '';
  g.forEach((row, r) => row.forEach((dark, c) => dark && (path += `M${c + 4} ${r + 4}h1v1h-1z`)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
