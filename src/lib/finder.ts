// Analog Finder: ranks the 7,500 cells (about 400 m) of the three study boxes for a destination and an
// objective, and finds look-alike cells. Same formula as pipeline/build_all.py (science_scores).
// The ML outputs (radar surprise, terrain units) are computed offline; this file only ranks them.
import type { CheckState, DossierItem, LatLon, Scenario } from '@/types/mission';
import { cellToLatLon } from './geo';

export type Want = 'low' | 'high' | [number, number];
export interface Pref {
  f: string;
  want: Want;
  w: number;
}
export interface Objective {
  label: string;
  label_fr: string;
  prefs: Pref[];
  rover: boolean;
  alpha: number;
}
export interface FeatureInfo {
  label: string;
  unit: string;
  source: string;
  desc: string;
}
export interface Unit {
  id: number;
  name: string;
  color: string;
  share: Record<string, number>;
  centroid: Record<string, number>;
}
export interface ModelData {
  generated: string;
  cell_size_m: number;
  features: Record<string, FeatureInfo>;
  finder_features: string[];
  objectives: Record<string, Objective>;
  destinations: Record<Scenario, Pref[]>;
  surprise_model: {
    type: string;
    target: string;
    predictors: string[];
    predictor_labels: Record<string, string>;
    samples: number;
    r2_block_cv: number;
    r2_block_cv_by_site: Record<string, number>;
    r2_leave_one_site_out: Record<string, number>;
    importance: { f: string; v: number }[];
    residual_scale_db: number;
    hotspot_z: number;
    how: string;
  };
  units: Unit[];
  units_model: { type: string; k: number; features: string[]; bic: Record<string, number> };
}
export interface CellSite {
  id: string;
  name: string;
  bounds: [[number, number], [number, number]];
  start: number;
}
export interface CellsData {
  rows: number;
  cols: number;
  sites: CellSite[];
  values: Record<string, number[]>;
  pct: Record<string, number[]>;
  unit: number[];
}

export interface FinderInput {
  scenario: Scenario;
  objective: string;
  /** 'all' or a site id */
  region: string;
  slopeLimit: number;
  mustDrive: boolean;
  month: number; // 1..12
  heatLimit: number;
  hubLimit: number;
  /** 0 = science match only, 1 = ease of operations only */
  alpha: number;
}
export interface SiteOps {
  id: string;
  hubKm: number | null;
  tmaxByMonth: (number | null)[];
  /** Team judgement of rock type per scenario, 0..3 (the "Surface materials" axis). Optional. */
  materials?: Partial<Record<Scenario, number | null>>;
}
/** Rock type cannot be read from our pixels, so the team's materials score (0..3) enters the science
 *  score with this weight. Shown in every explanation. */
export const MATERIALS_WEIGHT = 0.3;
export interface Contribution {
  f: string;
  want: Want;
  w: number;
  pct: number;
  score: number;
}
export interface Spot {
  index: number;
  site: string;
  coords: LatLon;
  total: number; // 0..100
  science: number; // 0..100
  ops: number; // 0..100
  unit: number;
  /** Team materials judgement for this site and destination (0..3), null if not used. */
  materials: number | null;
  why: Contribution[];
}
export interface SiteRank {
  id: string;
  name: string;
  score: number | null; // 0..100, null = no eligible cell
  science: number | null;
  eligibleShare: number; // % of the site's cells that pass the constraints
  heat: CheckState;
  hub: CheckState;
  tmax: number | null;
  hubKm: number | null;
  label: 'best' | 'close' | 'weaker' | 'none';
}
export interface FinderResult {
  input: FinderInput;
  prefs: Pref[];
  total: Float64Array; // per cell, 0..1 (NaN = not eligible)
  sites: SiteRank[];
  top: Spot[];
}

/** Score of one percentile (0..100) for one preference. */
export function prefScore(p: number, want: Want): number {
  if (want === 'low') return 1 - p / 100;
  if (want === 'high') return p / 100;
  const [lo, hi] = want;
  if (p >= lo && p <= hi) return 1;
  const d = p < lo ? lo - p : p - hi;
  return Math.max(0, 1 - d / 50);
}

/** Destination and objective can ask for the same feature: merge (weights add). */
export function mergePrefs(prefs: Pref[]): Pref[] {
  const out = new Map<string, Pref>();
  for (const p of prefs) {
    const key = `${p.f}|${JSON.stringify(p.want)}`;
    const cur = out.get(key);
    if (cur) cur.w += p.w;
    else out.set(key, { ...p });
  }
  return [...out.values()];
}

export function prefsFor(model: ModelData, scenario: Scenario, objective: string): Pref[] {
  return mergePrefs([...(model.destinations[scenario] ?? []), ...(model.objectives[objective]?.prefs ?? [])]);
}

export function siteOfIndex(cells: CellsData, i: number): CellSite {
  const n = cells.rows * cells.cols;
  return cells.sites[Math.min(cells.sites.length - 1, Math.floor(i / n))] as CellSite;
}

export function cellLatLon(cells: CellsData, i: number): LatLon {
  const site = siteOfIndex(cells, i);
  const local = i - site.start;
  const r = Math.floor(local / cells.cols);
  const c = local % cells.cols;
  const [lat, lon] = cellToLatLon(site.bounds, cells, [r, c]);
  return [Number(lat.toFixed(5)), Number(lon.toFixed(5))];
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const pctOf = (cells: CellsData, f: string, i: number) => cells.pct[f]?.[i] ?? 50;

/** Ease of operations for one cell: hub distance, heat in the chosen month, and how drivable the cell is. */
function opsScore(hubKm: number | null, hubLimit: number, tmax: number | null, heatLimit: number, steepPct: number): number {
  const hubS = hubKm === null ? 0.5 : clamp01(1 - hubKm / hubLimit);
  const heatS = tmax === null ? 0.5 : tmax < heatLimit ? 1 : clamp01(1 - (tmax - heatLimit) / 10);
  return 0.4 * hubS + 0.3 * heatS + 0.3 * (1 - steepPct / 100);
}

function haversineKm(a: LatLon, b: LatLon): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin((rad(b[0]) - rad(a[0])) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin((rad(b[1]) - rad(a[1])) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const TOP_N_PER_SITE = 25;

/** Rank every cell and every site. Pure function: same input, same output. */
export function runFinder(cells: CellsData, model: ModelData, input: FinderInput, ops: SiteOps[], topN = 8): FinderResult {
  const prefs = prefsFor(model, input.scenario, input.objective);
  const wSum = prefs.reduce((a, p) => a + p.w, 0) || 1;
  const n = cells.unit.length;
  const total = new Float64Array(n).fill(Number.NaN);
  const sci = new Float64Array(n).fill(Number.NaN);
  const opsArr = new Float64Array(n).fill(Number.NaN);
  const opsById = new Map(ops.map((o) => [o.id, o]));
  const slopeP90 = cells.values['slope_p90'] ?? [];
  const steep = cells.values['steep'] ?? [];

  for (let i = 0; i < n; i++) {
    const site = siteOfIndex(cells, i);
    if (input.region !== 'all' && input.region !== site.id) continue;
    const o = opsById.get(site.id);
    const hubKm = o?.hubKm ?? null;
    if (hubKm !== null && hubKm >= input.hubLimit) continue; // logistics out of reach
    if (input.mustDrive && (slopeP90[i] ?? 90) > input.slopeLimit) continue;
    let s = 0;
    for (const p of prefs) s += p.w * prefScore(pctOf(cells, p.f, i), p.want);
    s /= wSum;
    const mat = o?.materials?.[input.scenario];
    if (mat !== undefined && mat !== null) s = (1 - MATERIALS_WEIGHT) * s + (MATERIALS_WEIGHT * mat) / 3;
    const tmax = o?.tmaxByMonth[input.month - 1] ?? null;
    const op = opsScore(hubKm, input.hubLimit, tmax, input.heatLimit, steep[i] ?? 0);
    sci[i] = s;
    opsArr[i] = op;
    total[i] = (1 - input.alpha) * s + input.alpha * op;
  }

  // sites: mean of their best cells
  const sites: SiteRank[] = cells.sites.map((site) => {
    const o = opsById.get(site.id);
    const tmax = o?.tmaxByMonth[input.month - 1] ?? null;
    const hubKm = o?.hubKm ?? null;
    const idx: number[] = [];
    const cellsPerSite = cells.rows * cells.cols;
    for (let i = site.start; i < site.start + cellsPerSite; i++) if (!Number.isNaN(total[i] as number)) idx.push(i);
    idx.sort((a, b) => (total[b] as number) - (total[a] as number));
    const best = idx.slice(0, TOP_N_PER_SITE);
    const mean = (arr: Float64Array) => (best.length ? best.reduce((a, i) => a + (arr[i] as number), 0) / best.length : null);
    const sc = mean(total);
    const ss = mean(sci);
    const inRegion = input.region === 'all' || input.region === site.id;
    return {
      id: site.id,
      name: site.name,
      score: inRegion && sc !== null ? Math.round(sc * 1000) / 10 : null,
      science: inRegion && ss !== null ? Math.round(ss * 1000) / 10 : null,
      eligibleShare: inRegion ? Math.round((idx.length / cellsPerSite) * 1000) / 10 : 0,
      heat: tmax === null ? 'tbd' : tmax < input.heatLimit ? 'ok' : 'fail',
      hub: hubKm === null ? 'tbd' : hubKm < input.hubLimit ? 'ok' : 'fail',
      tmax,
      hubKm,
      label: 'none',
    };
  });
  const scored = sites.filter((s) => s.score !== null).sort((a, b) => (b.score as number) - (a.score as number));
  const bestScore = scored[0]?.score ?? null;
  for (const s of sites) {
    if (s.score === null || bestScore === null) s.label = 'none';
    else if (s.score === bestScore) s.label = 'best';
    else if (bestScore - s.score <= 5) s.label = 'close';
    else s.label = 'weaker';
  }

  // top spots, spread out (at least 1.2 km apart)
  const order: number[] = [];
  for (let i = 0; i < n; i++) if (!Number.isNaN(total[i] as number)) order.push(i);
  order.sort((a, b) => (total[b] as number) - (total[a] as number));
  const top: Spot[] = [];
  for (const i of order) {
    const coords = cellLatLon(cells, i);
    if (top.some((t) => haversineKm(t.coords, coords) < 1.2)) continue;
    top.push({
      index: i,
      site: siteOfIndex(cells, i).id,
      coords,
      total: Math.round((total[i] as number) * 1000) / 10,
      science: Math.round((sci[i] as number) * 1000) / 10,
      ops: Math.round((opsArr[i] as number) * 1000) / 10,
      unit: cells.unit[i] ?? -1,
      materials: opsById.get(siteOfIndex(cells, i).id)?.materials?.[input.scenario] ?? null,
      why: explain(cells, prefs, i),
    });
    if (top.length >= topN) break;
  }
  return { input, prefs, total, sites: [...scored, ...sites.filter((s) => s.score === null)], top };
}

/** The preferences that helped this cell the most (largest weight x score first). */
export function explain(cells: CellsData, prefs: Pref[], i: number): Contribution[] {
  return prefs
    .map((p) => {
      const pct = pctOf(cells, p.f, i);
      return { f: p.f, want: p.want, w: p.w, pct, score: prefScore(pct, p.want) };
    })
    .sort((a, b) => b.w * b.score - a.w * a.score);
}

/** One contribution in words, e.g. "radar surprise higher than 97 % of cells". */
export function contributionText(c: Contribution, label: string, fr = false): string {
  const l = label.toLowerCase();
  if (c.want === 'high') return c.pct >= 99 ? (fr ? `${l} dans le top 1 %` : `${l} in the top 1 %`) : fr ? `${l} plus élevé que ${c.pct} % des cellules` : `${l} higher than ${c.pct} % of cells`;
  if (c.want === 'low') return c.pct <= 1 ? (fr ? `${l} parmi les 1 % les plus bas` : `${l} in the lowest 1 %`) : fr ? `${l} plus bas que ${100 - c.pct} % des cellules` : `${l} lower than ${100 - c.pct} % of cells`;
  return fr ? `${l} dans la plage moyenne (percentile ${c.pct})` : `${l} in the middle range (percentile ${c.pct})`;
}

export interface Similar {
  index: number;
  site: string;
  coords: LatLon;
  similarity: number; // 0..100
}

/** "Find places like this one": nearest neighbours in percentile space over the Finder features.
 *  Cells within 1 km of the reference are skipped (they are the same place). */
export function similarCells(cells: CellsData, features: string[], ref: number, k = 8, region = 'all', otherSitesOnly = false): Similar[] {
  const refLL = cellLatLon(cells, ref);
  const refSite = siteOfIndex(cells, ref).id;
  const n = cells.unit.length;
  const out: { i: number; d: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (i === ref) continue;
    const site = siteOfIndex(cells, i);
    if (region !== 'all' && region !== site.id) continue;
    if (otherSitesOnly && site.id === refSite) continue;
    let d2 = 0;
    for (const f of features) {
      const d = pctOf(cells, f, i) - pctOf(cells, f, ref);
      d2 += d * d;
    }
    out.push({ i, d: Math.sqrt(d2 / features.length) });
  }
  out.sort((a, b) => a.d - b.d);
  const res: Similar[] = [];
  for (const { i, d } of out) {
    const coords = cellLatLon(cells, i);
    if (haversineKm(coords, refLL) < 1) continue;
    if (res.some((r) => haversineKm(r.coords, coords) < 1)) continue;
    res.push({ index: i, site: siteOfIndex(cells, i).id, coords, similarity: Math.round(Math.max(0, 1 - d / 50) * 100) });
    if (res.length >= k) break;
  }
  return res;
}

/** Index of the cell under a point, or null if the point is outside every box. */
export function cellAt(cells: CellsData, p: LatLon): number | null {
  for (const s of cells.sites) {
    const [[south, west], [north, east]] = s.bounds;
    if (p[0] < south || p[0] > north || p[1] < west || p[1] > east) continue;
    const r = Math.min(cells.rows - 1, Math.floor(((north - p[0]) / (north - south)) * cells.rows));
    const c = Math.min(cells.cols - 1, Math.floor(((p[1] - west) / (east - west)) * cells.cols));
    return s.start + r * cells.cols + c;
  }
  return null;
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** What the Finder writes in the dossier (stage 4). */
export function finderItems(res: FinderResult, model: ModelData, scenarioTitle: string): DossierItem[] {
  const obj = model.objectives[res.input.objective];
  const label = (f: string) => model.features[f]?.label ?? f;
  const items: DossierItem[] = [
    {
      id: 's4-question',
      stage: 4,
      title: 'Question asked',
      value: `${scenarioTitle}; objective: ${obj?.label ?? res.input.objective}; area: ${res.input.region === 'all' ? 'all three study boxes' : res.input.region}; ${res.input.mustDrive ? `drivable under ${res.input.slopeLimit}°` : 'no drivability filter'}; ${MONTHS_EN[res.input.month - 1]}, heat limit ${res.input.heatLimit}°C, hub under ${res.input.hubLimit} km; weight on operations ${Math.round(res.input.alpha * 100)} %`,
      tag: 'Interpreted',
      source: 'team',
    },
  ];
  res.sites.forEach((s, k) =>
    items.push({
      id: `s4-site-${s.id}`,
      stage: 4,
      title: `Rank ${k + 1}: ${s.name}`,
      value:
        s.score === null
          ? 'No cell passes the constraints'
          : `${s.score}/100 (mean of its ${TOP_N_PER_SITE} best cells); ${s.eligibleShare} % of the box passes the constraints; heat ${s.heat === 'ok' ? 'OK' : s.heat === 'fail' ? 'over the limit: robot-only that month' : 'TBD'}`,
      tag: 'Interpreted',
      source: 'ml',
    }),
  );
  res.top.slice(0, 5).forEach((t, k) =>
    items.push({
      id: `s4-spot-${k + 1}`,
      stage: 4,
      title: `Spot ${k + 1} (${t.coords[0]}, ${t.coords[1]})`,
      value: `${t.site}, score ${t.total}/100: ${t.why
        .slice(0, 2)
        .map((c) => contributionText(c, label(c.f)))
        .join('; ')}`,
      tag: 'Hypothesis',
      source: 'ml',
    }),
  );
  items.push({
    id: 's4-caveat',
    stage: 4,
    title: 'Caveat',
    value: 'Weights are team judgements and the model only covers our three 20 km boxes. A high score means "worth a field check", not a confirmed analog.',
    tag: 'Interpreted',
    source: 'team',
  });
  return items;
}
