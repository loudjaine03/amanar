// Plan: the user's choices in, a ranked list of Algerian sites out.
// The terrain part is the twin model (src/lib/twins.ts) run live, only on the Earth ground the user's
// rover or crew can actually use. The ordering rule for each goal is written out in GOALS and shown in the
// app, so every result can be traced back to a number.
import type { GeoLevel, MissionData, SiteId, TargetId } from "@/types/mission";
import {
  areaCells,
  earthCellLatLon,
  insideBorder,
  predictCell,
  rawMeasures,
  siteIndexOf,
  type Area,
  type TwinModel,
} from "./twins";
import type { LatLon } from "./geo";

export type Goal = "drive" | "rocks" | "radar" | "crew";

export const GOALS: Record<Goal, { label: string; short: string; rule: string }> = {
  drive: {
    label: "Rover driving and navigation",
    short: "Driving",
    rule: "Sites are ordered by how much of your chosen area finds its closest terrain twins there.",
  },
  rocks: {
    label: "Rock and soil science",
    short: "Rocks",
    rule: "Sites are ordered by how well their rocks match the target (published geology), then by terrain twins.",
  },
  radar: {
    label: "Radar under dry cover",
    short: "Radar",
    rule: "Sites are ordered by the area of radar hotspots that passed all four checks, then by terrain twins.",
  },
  crew: {
    label: "Crew training (people on the ground)",
    short: "Crew",
    rule: "Sites a crew can work at in your month (hottest days under your heat limit) come first, then terrain twins.",
  },
};

export interface PlanInput {
  target: TargetId;
  area: Area;
  goal: Goal;
  /** Rover (or walking) slope limit: Earth cells whose 90th-percentile slope is above it are left out. */
  slopeLimit: number;
  month: number;
  heatLimit: number;
  /** Max road distance to the nearest town or base, km. */
  hubLimit: number;
}

export interface Spot {
  /** True when no cell of this site was among the overall closest twins: these are its own closest cells. */
  fallback: boolean;
  cell: number;
  coords: LatLon;
  hits: number;
  slope: number;
  radar: boolean;
}

export interface SiteOutcome {
  id: SiteId;
  name: string;
  /** Share of the chosen target cells whose twins are mostly here (0-100). */
  twinShare: number;
  /** Median distance to the nearest twin, in standard deviations (smaller = closer). */
  closeness: number | null;
  /** Share of the site's cells (inside the border) that pass the slope limit. */
  usable: number;
  geology: GeoLevel;
  geologyText: string;
  radarKm2: number;
  tmax: number | null;
  tmin: number | null;
  monthOk: boolean | null;
  hubKm: number;
  hubOk: boolean;
  excluded: string | null;
  spots: Spot[];
  reasons: string[];
}

export interface PlanResult {
  input: PlanInput;
  queried: number;
  sampled: number;
  noTwin: number;
  sites: SiteOutcome[];
  /** Mean measures (own units) of the chosen target cells vs the twins found at the first site. */
  measures: { key: string; target: number; earth: number | null }[];
  /** How often each Earth cell was picked as a twin (for re-picking spots with extra rules). */
  hits: Float64Array;
  /** Per site (site_order): spots come from the site's own closest cells, not the overall twins. */
  fallback: boolean[];
  ms: number;
}

const GEO_RANK: Record<GeoLevel, number> = { match: 2, partial: 1, no: 0 };
export const MAX_QUERY = 1200;
/** Spots at least this many cells apart (5 cells = 2 km). */
export const SPOT_GAP = 5;

/** Earth cells the user can use: inside the border, under the slope limit, at a site within reach. */
export function allowedMask(m: TwinModel, slopeLimit: number, siteOk: boolean[]): Uint8Array {
  const a = new Uint8Array(m.nEarth);
  const s90 = m.file.earth.slope_p90;
  for (let i = 0; i < m.nEarth; i++)
    a[i] = siteOk[siteIndexOf(m, i)] && insideBorder(m, i) && (s90[i] ?? 90) <= slopeLimit ? 1 : 0;
  return a;
}

/** Best cells of one site by twin picks, at least SPOT_GAP cells apart; `accept` can require more
 *  (the Plan page keeps only cells a rover can reach). */
export function pickSpots(
  m: TwinModel,
  hits: Float64Array,
  site: number,
  fallback: boolean,
  n = 3,
  accept: (cell: number, coords: LatLon) => boolean = () => true,
): Spot[] {
  const e = m.file.earth;
  const per = e.rows * e.cols;
  const cand: number[] = [];
  for (let i = site * per; i < (site + 1) * per; i++) if (hits[i]! > 0) cand.push(i);
  cand.sort((a, b) => hits[b]! - hits[a]!);
  const out: Spot[] = [];
  for (const i of cand) {
    const r = Math.floor((i % per) / e.cols);
    const c = i % e.cols;
    const far = out.every((s) => {
      const r2 = Math.floor((s.cell % per) / e.cols);
      const c2 = s.cell % e.cols;
      return Math.max(Math.abs(r - r2), Math.abs(c - c2)) >= SPOT_GAP;
    });
    if (!far) continue;
    const coords = earthCellLatLon(m, i);
    if (!accept(i, coords)) continue;
    out.push({
      fallback,
      cell: i,
      coords,
      hits: hits[i]!,
      slope: e.slope_p90[i] ?? 0,
      radar: (e.radar[i] ?? 0) === 1,
    });
    if (out.length >= n) break;
  }
  return out;
}

const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)]!;
};

/** Run the plan. Pure: same input, same output. */
export function runPlan(m: TwinModel, data: MissionData, input: PlanInput): PlanResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  const order = m.file.site_order;
  const tg = data.targets[input.target];
  const hubOk = order.map((sid) => data.sites[sid].conditions.hub.distance_km <= input.hubLimit);
  const allowed = allowedMask(m, input.slopeLimit, hubOk);

  // cells of the target to look at; large areas are sampled on a regular grid (same answer, faster)
  const cells = areaCells(m, input.target, input.area);
  const stride = Math.max(1, Math.ceil(cells.length / MAX_QUERY));
  const q = cells.filter((_, i) => i % stride === 0);

  const wins = order.map(() => 0);
  const near: number[][] = order.map(() => []);
  const hits = new Float64Array(m.nEarth);
  let none = 0;
  const anyAllowed = allowed.some((v) => v === 1);
  for (const cell of q) {
    if (!anyAllowed) {
      none++;
      continue;
    }
    const p = predictCell(m, input.target, cell, allowed);
    if (p.site < 0) {
      none++;
      continue;
    }
    wins[p.site]! += 1;
    near[p.site]!.push(p.dist[0]!);
    for (const i of p.idx) if (i >= 0) hits[i]! += 1;
  }

  const per = m.file.earth.rows * m.file.earth.cols;
  // a site that holds none of the overall twins still gets its own closest cells as spots
  const fallback = order.map(() => false);
  order.forEach((_, s) => {
    let any = false;
    for (let i = s * per; i < (s + 1) * per && !any; i++) any = hits[i]! > 0;
    if (any || !hubOk[s]) return;
    const only = new Uint8Array(m.nEarth);
    for (let i = s * per; i < (s + 1) * per; i++) only[i] = allowed[i]!;
    if (!only.some((v) => v === 1)) return;
    fallback[s] = true;
    for (const cell of q) {
      const p = predictCell(m, input.target, cell, only);
      for (const i of p.idx) if (i >= 0) hits[i]! += 1;
    }
  });
  const sites: SiteOutcome[] = order.map((sid, s) => {
    const site = data.sites[sid];
    const res = tg.sites[sid];
    const c = site.conditions;
    let inside = 0,
      ok = 0;
    for (let i = s * per; i < (s + 1) * per; i++) {
      if (!insideBorder(m, i)) continue;
      inside++;
      if ((m.file.earth.slope_p90[i] ?? 90) <= input.slopeLimit) ok++;
    }
    const tmax = c.monthly_tmax_c[input.month - 1] ?? null;
    const tmin = c.monthly_tmin_c[input.month - 1] ?? null;
    const monthOk = tmax === null ? null : tmax <= input.heatLimit;
    const usable = inside ? Math.round((100 * ok) / inside) : 0;
    const excluded = !hubOk[s]
      ? `${Math.round(c.hub.distance_km)} km from ${c.hub.name}, beyond your ${input.hubLimit} km limit`
      : ok === 0
        ? `no ground under ${input.slopeLimit}°`
        : null;
    return {
      id: sid,
      name: site.name,
      twinShare: q.length ? Math.round((100 * wins[s]!) / q.length) : 0,
      closeness: median(near[s]!),
      usable,
      geology: res.geology.level,
      geologyText: res.geology.text,
      radarKm2: site.radar.candidate_km2 ?? 0,
      tmax,
      tmin,
      monthOk,
      hubKm: c.hub.distance_km,
      hubOk: hubOk[s]!,
      excluded,
      spots: excluded ? [] : pickSpots(m, hits, s, fallback[s]!),
      reasons: [],
    };
  });

  for (const o of sites) o.reasons = reasonsFor(o, input, tg.title);
  const key = (o: SiteOutcome): number[] => {
    const base = [o.excluded ? 0 : 1];
    if (input.goal === "rocks") return [...base, GEO_RANK[o.geology], o.twinShare];
    if (input.goal === "radar") return [...base, o.radarKm2 >= 0.1 ? o.radarKm2 : 0, o.twinShare];
    if (input.goal === "crew") return [...base, o.monthOk ? 1 : 0, o.twinShare];
    return [...base, o.twinShare, -(o.closeness ?? 99)];
  };
  sites.sort((a, b) => {
    const ka = key(a),
      kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i]! - ka[i]!;
    return 0;
  });

  // what the chosen area looks like, next to the best Earth spot
  const z = m.targetZ[input.target];
  const mean = m.file.features.map(() => 0);
  for (const cell of q)
    rawMeasures(m, z, cell * m.nf).forEach((v, f) => (mean[f]! += v / q.length));
  // the twins found at the first site, weighted by how often each was picked
  const s0 = sites[0] && !sites[0].excluded ? order.indexOf(sites[0].id) : -1;
  let earth: number[] | null = null;
  if (s0 >= 0) {
    const acc = m.file.features.map(() => 0);
    let w = 0;
    for (let i = s0 * per; i < (s0 + 1) * per; i++) {
      if (!hits[i]) continue;
      rawMeasures(m, m.earthZ, i * m.nf).forEach((v, f) => (acc[f]! += v * hits[i]!));
      w += hits[i]!;
    }
    earth = w ? acc.map((v) => v / w) : null;
  }
  const measures = m.file.features.map((key, f) => ({
    key,
    target: mean[f]!,
    earth: earth ? earth[f]! : null,
  }));

  return {
    input,
    queried: cells.length,
    sampled: q.length,
    noTwin: q.length ? Math.round((100 * none) / q.length) : 0,
    sites,
    measures,
    hits,
    fallback,
    ms: Math.round((typeof performance !== "undefined" ? performance.now() : 0) - t0),
  };
}

function reasonsFor(o: SiteOutcome, input: PlanInput, title: string): string[] {
  const r: string[] = [];
  if (o.excluded) return [`Left out: ${o.excluded}.`];
  r.push(`${o.twinShare}% of the chosen part of ${title} finds its closest terrain twins here.`);
  r.push(`${o.usable}% of the site is under your ${input.slopeLimit}° slope limit.`);
  if (input.goal === "rocks")
    r.push(
      o.geology === "match"
        ? "Rocks match the target (published geology)."
        : o.geology === "partial"
          ? "Rocks partly match the target (published geology)."
          : "Rocks do not match the target (published geology).",
    );
  if (input.goal === "radar")
    r.push(
      o.radarKm2 >= 0.1
        ? `${o.radarKm2} km² of radar hotspots passed all four checks.`
        : "No radar hotspot large enough passed all four checks.",
    );
  if (input.goal === "crew" || o.monthOk === false)
    r.push(
      o.tmax === null
        ? "No temperature data for this month."
        : o.monthOk
          ? `Hottest days in month ${input.month} reach ${o.tmax}°C: under your ${input.heatLimit}°C limit.`
          : `Hottest days in month ${input.month} reach ${o.tmax}°C: above your ${input.heatLimit}°C limit.`,
    );
  return r;
}
