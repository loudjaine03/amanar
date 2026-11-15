import { astar, type Cell, type SlopeGrid } from "./astar";
import { cellToLatLon, latLonToCell, routeKm, type Bounds, type LatLon } from "./geo";
import type { Delay } from "@/types/mission";

/** Délai Terre-Mars à sens unique : environ 11 minutes (197,5 millions de km le 14 nov. 2026, calculé avec astropy).
 *  À l'écran : 1 minute réelle = 1 seconde. */
export const MARS_DELAY_MIN = 11;
export const SEC_PER_SIM_MIN = 1;
export const MARS_DELAY_SOURCE = "astropy";
export const MARS_DELAY: Delay = {
  one_way_s: MARS_DELAY_MIN * 60,
  label: "about 11 min one way (197.5 million km on 14 Nov 2026)",
  tag: "Measured",
  source: MARS_DELAY_SOURCE,
};

/** How the delay is played on screen. A minute-long delay is compressed (1 min = 1 s);
 *  a delay of a few seconds (the Moon) is played in real time. */
export function delayPlan(delay: Delay) {
  const compressed = delay.one_way_s >= 60;
  return {
    compressed,
    ticks: compressed ? Math.max(1, Math.round(delay.one_way_s / 60)) : 1,
    tickMs: compressed ? 1000 * SEC_PER_SIM_MIN : Math.round(delay.one_way_s * 1000),
    simMinutes: delay.one_way_s / 60,
    short: compressed ? `${Math.round(delay.one_way_s / 60)} min` : `${delay.one_way_s} s`,
  };
}

/** Fichier public/grids/ahnet_slope.json (contrat du PDF). `mock: true` = grille de test, pas une mesure. */
export interface GridFile extends SlopeGrid {
  bounds: Bounds;
  mock?: boolean;
}

/** Vérifie qu'un JSON respecte le contrat de la grille. Retourne null s'il est invalide (jamais de plantage). */
export function parseGrid(raw: unknown): GridFile | null {
  const g = raw as Partial<GridFile> | null;
  if (!g || typeof g !== "object") return null;
  const { cols, rows, slope, bounds } = g;
  if (
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    !Array.isArray(slope) ||
    !Array.isArray(bounds)
  )
    return null;
  if (
    (cols as number) < 2 ||
    (rows as number) < 2 ||
    slope.length !== (cols as number) * (rows as number)
  )
    return null;
  if (!slope.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  return g as GridFile;
}

/** Charge la grille. 'missing' si le fichier n'existe pas ou n'est pas conforme. */
export async function loadGrid(url: string): Promise<GridFile | "missing"> {
  try {
    const res = await fetch(url);
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return "missing";
    return parseGrid(await res.json()) ?? "missing";
  } catch {
    return "missing";
  }
}

export interface RoutePlan {
  ok: boolean;
  /** Numéro du tronçon impossible (0 = départ > WP-01, 1 = WP-01 > WP-02, ...), sinon null. */
  failedLeg: number | null;
  cells: Cell[];
  points: LatLon[];
  /** Indice, dans `points`, de l'arrivée à chaque waypoint (même ordre que les waypoints). */
  wpIndex: number[];
  km: number;
  maxSlopeDeg: number | null;
}

const EMPTY: RoutePlan = {
  ok: false,
  failedLeg: null,
  cells: [],
  points: [],
  wpIndex: [],
  km: 0,
  maxSlopeDeg: null,
};

/** Route départ > WP-01 > WP-02 > WP-03 : un A* par tronçon, mis bout à bout.
 *  Longueur = distance grand cercle entre les points (routeKm), jamais un nombre de cases. */
export function planRoute(
  grid: GridFile,
  limitDeg: number,
  start: LatLon,
  waypoints: LatLon[],
): RoutePlan {
  const g: SlopeGrid = { cols: grid.cols, rows: grid.rows, slope: grid.slope, maxSlope: limitDeg };
  const stops: Cell[] = [start, ...waypoints].map((p) => latLonToCell(grid.bounds, grid, p));
  const cells: Cell[] = [];
  const wpIndex: number[] = [];
  for (let i = 1; i < stops.length; i++) {
    const leg = astar(g, stops[i - 1] as Cell, stops[i] as Cell);
    if (!leg.length) return { ...EMPTY, failedLeg: i - 1 };
    cells.push(...(i === 1 ? leg : leg.slice(1)));
    wpIndex.push(cells.length - 1);
  }
  if (!cells.length) cells.push(stops[0] as Cell);
  const points = cells.map((cell) => cellToLatLon(grid.bounds, grid, cell));
  const maxSlopeDeg = Math.max(...cells.map(([r, c]) => grid.slope[r * grid.cols + c] as number));
  return { ok: true, failedLeg: null, cells, points, wpIndex, km: routeKm(points), maxSlopeDeg };
}

/** Cells a rover can reach from `start` without crossing ground steeper than `limitDeg`
 *  (flood fill, 8 neighbours without corner cutting: the same rule as the A* planner). Empty if the start is too steep. */
export function reachableFrom(grid: GridFile, limitDeg: number, start: LatLon): Uint8Array {
  const n = grid.rows * grid.cols;
  const seen = new Uint8Array(n);
  const [r0, c0] = latLonToCell(grid.bounds, grid, start);
  const ok = (i: number) => (grid.slope[i] as number) <= limitDeg;
  const i0 = r0 * grid.cols + c0;
  if (!ok(i0)) return seen;
  const stack = [i0];
  seen[i0] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const r = Math.floor(i / grid.cols);
    const c = i % grid.cols;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr,
          cc = c + dc;
        if ((!dr && !dc) || rr < 0 || cc < 0 || rr >= grid.rows || cc >= grid.cols) continue;
        const j = rr * grid.cols + cc;
        // no corner cutting, as in the A* planner
        if (dr && dc && (!ok(r * grid.cols + cc) || !ok(rr * grid.cols + c))) continue;
        if (!seen[j] && ok(j)) {
          seen[j] = 1;
          stack.push(j);
        }
      }
  }
  return seen;
}

export function isReachable(grid: GridFile, mask: Uint8Array, p: LatLon): boolean {
  const [r, c] = latLonToCell(grid.bounds, grid, p);
  return mask[r * grid.cols + c] === 1;
}

/** Pente (degrés) de la case sous un point [lat, lon]. */
export function slopeAt(grid: GridFile, p: LatLon): number {
  const [r, c] = latLonToCell(grid.bounds, grid, p);
  return grid.slope[r * grid.cols + c] as number;
}

/** Heure simulée "HH:MM" (ou "HH:MM:SS") = heure de départ + des minutes de mission. */
export function fmtClock(start: Date, addMinutes: number, withSeconds = false): string {
  const d = new Date(start.getTime() + addMinutes * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}${withSeconds ? `:${p(d.getSeconds())}` : ""}`;
}

/* ------------------------------- crew safety (Earth field test) ------------------------------- */

/** Below this night temperature the crew needs cold-weather shelter and sleep gear (team assumption). */
export const COLD_C = 0;

/** Months (1..12) whose NASA POWER monthly maximum is under the heat limit. */
export function workableMonths(tmaxByMonth: (number | null)[], heatLimit: number): number[] {
  const out: number[] = [];
  tmaxByMonth.forEach((t, i) => {
    if (t !== null && t < heatLimit) out.push(i + 1);
  });
  return out;
}

/** [1, 2, 11, 12] -> "November to February" (runs may wrap past December). */
export function monthRanges(
  months: number[],
  names: readonly string[],
  words = { all: "all year", none: "none", to: "to" },
): string {
  if (months.length === 12) return words.all;
  if (months.length === 0) return words.none;
  const on = new Set(months);
  const startIdx = months.find((m) => !on.has(m === 1 ? 12 : m - 1)) ?? months[0]!;
  const runs: [number, number][] = [];
  let m = startIdx;
  for (let k = 0; k < 12; k++) {
    if (on.has(m)) {
      const last = runs.at(-1);
      if (last && last[1] === (m === 1 ? 12 : m - 1)) last[1] = m;
      else runs.push([m, m]);
    }
    m = m === 12 ? 1 : m + 1;
  }
  const name = (x: number) => names.at(x - 1) ?? String(x);
  return runs.map(([a, b]) => (a === b ? name(a) : `${name(a)} ${words.to} ${name(b)}`)).join(", ");
}

/** What a field crew must plan whatever the numbers say (Hypothesis: to be checked on site). */
export const CREW_CHECKLIST = [
  "Water and shade for every person, and work hours moved away from the hottest part of the day",
  "Cold-weather shelter and sleep gear when nights fall below freezing",
  "Satellite phone or radio check-ins on a fixed schedule; nobody works alone",
  "An evacuation plan to the hub by road, with the drive time checked before the test",
  "Wind and sandstorm forecast each morning; no camp or route in a wadi bed (flash floods)",
  "First-aid kit and a trained first-aider on site",
  "Permits and contact with local authorities before entering the area",
] as const;
