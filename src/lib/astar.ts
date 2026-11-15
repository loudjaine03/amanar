// A* sur grille de pente. Basé sur le plan PDF (Team Hoggar).
// grid.slope = tableau de cols*rows nombres (degrés), ligne 0 = bord nord.

export interface SlopeGrid {
  cols: number;
  rows: number;
  slope: number[];
  maxSlope: number;
}
export type Cell = [number, number]; // [row, col]

type HeapItem = [number, number]; // [f, cellId]

class Heap {
  private a: HeapItem[] = [];
  get size() {
    return this.a.length;
  }
  private f(i: number): number {
    return (this.a[i] as HeapItem)[0];
  }
  private swap(i: number, j: number) {
    const x = this.a[i] as HeapItem;
    this.a[i] = this.a[j] as HeapItem;
    this.a[j] = x;
  }
  push(x: HeapItem) {
    this.a.push(x);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f(p) <= this.f(i)) break;
      this.swap(p, i);
      i = p;
    }
  }
  pop(): HeapItem {
    const top = this.a[0] as HeapItem;
    const last = this.a.pop() as HeapItem;
    if (this.a.length) {
      this.a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.a.length && this.f(l) < this.f(m)) m = l;
        if (r < this.a.length && this.f(r) < this.f(m)) m = r;
        if (m === i) break;
        this.swap(m, i);
        i = m;
      }
    }
    return top;
  }
}

/** Retourne le chemin [[row, col], ...] ou [] s'il n'existe pas de route sûre. */
export function astar(grid: SlopeGrid, start: Cell, goal: Cell): Cell[] {
  const { cols, rows, slope, maxSlope } = grid;
  const id = (r: number, c: number) => r * cols + c;
  const ok = (r: number, c: number) =>
    r >= 0 && c >= 0 && r < rows && c < cols && (slope[id(r, c)] ?? Infinity) <= maxSlope;
  if (!ok(start[0], start[1]) || !ok(goal[0], goal[1])) return [];

  const g = new Float64Array(rows * cols).fill(Infinity);
  const came = new Int32Array(rows * cols).fill(-1);
  const h = (r: number, c: number) => Math.hypot(r - goal[0], c - goal[1]);
  const s = id(start[0], start[1]);
  const t = id(goal[0], goal[1]);
  const open = new Heap();
  g[s] = 0;
  open.push([h(start[0], start[1]), s]);

  const moves: Cell[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  while (open.size) {
    const [f, cur] = open.pop();
    if (cur === t) break;
    const r = Math.floor(cur / cols);
    const c = cur % cols;
    if (f - h(r, c) > (g[cur] ?? Infinity) + 1e-9) continue; // entrée périmée
    for (const [dr, dc] of moves) {
      const nr = r + dr;
      const nc = c + dc;
      if (!ok(nr, nc)) continue; // hors grille ou trop raide
      if (dr && dc && (!ok(r + dr, c) || !ok(r, c + dc))) continue; // pas de coupe de coin
      const k = id(nr, nc);
      const ng = (g[cur] ?? Infinity) + Math.hypot(dr, dc) * (1 + (slope[k] ?? 0) / 5);
      if (ng < (g[k] ?? Infinity)) {
        g[k] = ng;
        came[k] = cur;
        open.push([ng + h(nr, nc), k]);
      }
    }
  }

  if (s !== t && came[t] === -1) return []; // aucune route sûre
  const path: Cell[] = [];
  for (let k = t; k !== -1; k = came[k] ?? -1) path.unshift([Math.floor(k / cols), k % cols]);
  return path;
}

/** Enchaîne plusieurs A* : départ -> WP1 -> WP2 -> ... Retourne [] si un tronçon est impossible. */
export function astarVia(grid: SlopeGrid, points: Cell[]): Cell[] {
  const full: Cell[] = [];
  for (let i = 1; i < points.length; i++) {
    const leg = astar(grid, points[i - 1] as Cell, points[i] as Cell);
    if (!leg.length) return [];
    full.push(...(i === 1 ? leg : leg.slice(1)));
  }
  return full;
}
