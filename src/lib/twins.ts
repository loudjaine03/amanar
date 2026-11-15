// The "twin" model, run live in the browser.
// pipeline/compare.py trains a k-nearest-neighbour model on the six terrain measures of the 7,500
// Algerian cells (400 m) and writes public/ml/twins.json: the standardised measures of every Earth cell
// and every Mars/Moon cell. This file runs the same model on whatever the user asks for: a part of the
// target, a rover slope limit, the sites they can reach. A test checks it gives back the pipeline's
// predictions. Nothing here is a hand-set weight: the answer comes from distances between measured cells.
import { cellToLatLon, type LatLon } from "./geo";
import type { SiteId, TargetId } from "@/types/mission";

export interface TwinSiteInfo {
  id: SiteId;
  bounds: [[number, number], [number, number]];
  start: number;
}
export interface TwinTarget {
  rows: number;
  cols: number;
  cell_px: number;
  px: [number, number];
  window: [number, number, number, number];
  image: string;
  z: number[];
  pred: number[];
}
export interface TwinModelFile {
  version: 1;
  k: number;
  features: string[];
  scale: number;
  trim: number;
  mu: number[];
  sd: number[];
  threshold: number;
  site_order: SiteId[];
  site_recognition: number;
  earth: {
    rows: number;
    cols: number;
    border: number;
    cell_m: number;
    sites: TwinSiteInfo[];
    z: number[];
    slope_p90: number[];
    rough: number[];
    elev: number[];
    radar: number[];
  };
  targets: Record<TargetId, TwinTarget>;
}

/** Decoded model: measures as Float32Array, one row of `nf` values per cell. */
export interface TwinModel {
  file: TwinModelFile;
  nf: number;
  earthZ: Float32Array;
  targetZ: Record<TargetId, Float32Array>;
  nEarth: number;
}

export function decodeModel(file: TwinModelFile): TwinModel {
  const nf = file.features.length;
  const dec = (a: number[]) => Float32Array.from(a, (v) => v / file.scale);
  const targetZ = {} as Record<TargetId, Float32Array>;
  for (const [tid, t] of Object.entries(file.targets) as [TargetId, TwinTarget][])
    targetZ[tid] = dec(t.z);
  return { file, nf, earthZ: dec(file.earth.z), targetZ, nEarth: file.earth.z.length / nf };
}

export function validateModel(raw: unknown): TwinModelFile | null {
  const f = raw as Partial<TwinModelFile> | null;
  if (!f || f.version !== 1 || !f.earth || !f.targets || !Array.isArray(f.features)) return null;
  if (!Array.isArray(f.earth.z) || f.earth.z.length % f.features.length !== 0) return null;
  return f as TwinModelFile;
}

let cache: Promise<TwinModel | null> | null = null;
export function loadTwinModel(url = "/ml/twins.json"): Promise<TwinModel | null> {
  cache ??= fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const f = validateModel(j);
      return f ? decodeModel(f) : null;
    })
    .catch(() => null);
  return cache;
}

/* ------------------------------------------- core ------------------------------------------- */

export function siteIndexOf(m: TwinModel, i: number): number {
  const per = m.file.earth.rows * m.file.earth.cols;
  return Math.min(m.file.site_order.length - 1, Math.floor(i / per));
}

/** k nearest Earth cells (Euclidean distance on standardised measures), among `allowed` cells only. */
export function nearest(
  m: TwinModel,
  q: Float32Array,
  qOff: number,
  allowed: Uint8Array | null,
  k: number,
): { idx: Int32Array; dist: Float64Array } {
  const idx = new Int32Array(k).fill(-1);
  const d2 = new Float64Array(k).fill(Infinity);
  const { nf, earthZ, nEarth } = m;
  for (let i = 0; i < nEarth; i++) {
    if (allowed && !allowed[i]) continue;
    let s = 0;
    const o = i * nf;
    for (let f = 0; f < nf; f++) {
      const d = earthZ[o + f]! - q[qOff + f]!;
      s += d * d;
    }
    if (s >= d2[k - 1]!) continue;
    let j = k - 1;
    while (j > 0 && d2[j - 1]! > s) {
      d2[j] = d2[j - 1]!;
      idx[j] = idx[j - 1]!;
      j--;
    }
    d2[j] = s;
    idx[j] = i;
  }
  return { idx, dist: d2.map(Math.sqrt) };
}

export interface CellPrediction {
  /** Votes of the k nearest Earth cells, per site. */
  votes: number[];
  /** Index in site_order, or -1 when no Earth cell is close enough ("no twin on Earth"). */
  site: number;
  idx: Int32Array;
  dist: Float64Array;
}

/** Predict one target cell: majority vote of its k nearest Earth cells (as scikit-learn does). */
export function predictCell(
  m: TwinModel,
  tid: TargetId,
  cell: number,
  allowed: Uint8Array | null = null,
): CellPrediction {
  const k = m.file.k;
  const { idx, dist } = nearest(m, m.targetZ[tid], cell * m.nf, allowed, k);
  const votes = m.file.site_order.map(() => 0);
  for (const i of idx) if (i >= 0) votes[siteIndexOf(m, i)]! += 1;
  let site = 0;
  for (let s = 1; s < votes.length; s++) if (votes[s]! > votes[site]!) site = s;
  if (!(dist[0]! <= m.file.threshold)) site = -1;
  return { votes, site, idx, dist };
}

/** Undo the scaling: the six measures of a cell in their own units (degrees, %, metres). */
export function rawMeasures(m: TwinModel, z: Float32Array, off: number): number[] {
  return m.file.features.map((_, f) => Math.expm1(z[off + f]! * m.file.sd[f]! + m.file.mu[f]!));
}

export function earthCellLatLon(m: TwinModel, i: number): LatLon {
  const e = m.file.earth;
  const s = e.sites[siteIndexOf(m, i)]!;
  const local = i - s.start;
  const [lat, lon] = cellToLatLon(s.bounds, e, [Math.floor(local / e.cols), local % e.cols]);
  return [Number(lat.toFixed(5)), Number(lon.toFixed(5))];
}

export function insideBorder(m: TwinModel, i: number): boolean {
  const e = m.file.earth;
  const local = i % (e.rows * e.cols);
  const r = Math.floor(local / e.cols);
  const c = local % e.cols;
  return r >= e.border && c >= e.border && r < e.rows - e.border && c < e.cols - e.border;
}

/** Cells of the target the user asks about. Edge cells (trim) are never used. */
export type Area =
  { kind: "all" } | { kind: "window" } | { kind: "spot"; r: number; c: number; radius: number };

export function areaCells(m: TwinModel, tid: TargetId, area: Area): number[] {
  const t = m.file.targets[tid];
  const tr = m.file.trim;
  const out: number[] = [];
  let r0 = tr,
    r1 = t.rows - tr,
    c0 = tr,
    c1 = t.cols - tr;
  if (area.kind === "window") {
    const [wr, wc, wh, ww] = t.window;
    r0 = Math.max(r0, wr);
    c0 = Math.max(c0, wc);
    r1 = Math.min(r1, wr + wh);
    c1 = Math.min(c1, wc + ww);
  } else if (area.kind === "spot") {
    r0 = Math.max(r0, area.r - area.radius);
    c0 = Math.max(c0, area.c - area.radius);
    r1 = Math.min(r1, area.r + area.radius + 1);
    c1 = Math.min(c1, area.c + area.radius + 1);
  }
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) out.push(r * t.cols + c);
  return out;
}

/** The model's own prediction for each cell, as written by the pipeline (-1 edge, 3 = no twin). */
export function pipelinePred(m: TwinModel, tid: TargetId, cell: number): number {
  return m.file.targets[tid].pred[cell] ?? -1;
}
