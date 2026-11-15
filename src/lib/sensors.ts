// Simulated sensors along the rover route. Each reading is a formula on measured terrain:
// elevation from the 400 m Copernicus cells (twins.json), slope from the 125 m route grid,
// pressure from elevation (standard atmosphere on Earth, NSSDC scale height on Mars), wheel loads from
// the rover settings. These are not real sensor data; they show what a field test should log.
import type { Body, SiteId, Target } from "@/types/mission";
import type { LatLon } from "./geo";
import type { GridFile } from "./stage3";
import { slopeAt } from "./stage3";
import type { TwinModel } from "./twins";
import {
  G_EARTH,
  isaPressureKPa,
  targetPressureKPa,
  twinMassKg,
  wheelLoad,
  type Rover,
} from "./materials";

export interface ElevGrid {
  rows: number;
  cols: number;
  bounds: [[number, number], [number, number]];
  elev: number[];
}

export function elevGridFor(m: TwinModel, sid: SiteId): ElevGrid | null {
  const e = m.file.earth;
  const s = e.sites.find((x) => x.id === sid);
  if (!s) return null;
  const n = e.rows * e.cols;
  return { rows: e.rows, cols: e.cols, bounds: s.bounds, elev: e.elev.slice(s.start, s.start + n) };
}

/** Bilinear interpolation between cell centres (clamped at the edges). */
export function elevAt(g: ElevGrid, [lat, lon]: LatLon): number {
  const [[s, w], [n, e]] = g.bounds;
  const fr = Math.min(g.rows - 1, Math.max(0, ((n - lat) / (n - s)) * g.rows - 0.5));
  const fc = Math.min(g.cols - 1, Math.max(0, ((lon - w) / (e - w)) * g.cols - 0.5));
  const r0 = Math.floor(fr),
    c0 = Math.floor(fc);
  const r1 = Math.min(g.rows - 1, r0 + 1),
    c1 = Math.min(g.cols - 1, c0 + 1);
  const dr = fr - r0,
    dc = fc - c0;
  const v = (r: number, c: number) => g.elev[r * g.cols + c] ?? 0;
  return (
    v(r0, c0) * (1 - dr) * (1 - dc) +
    v(r0, c1) * (1 - dr) * dc +
    v(r1, c0) * dr * (1 - dc) +
    v(r1, c1) * dr * dc
  );
}

function haversineKm(a: LatLon, b: LatLon): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin((rad(b[0]) - rad(a[0])) / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin((rad(b[1]) - rad(a[1])) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export interface ProfilePoint {
  km: number;
  elev: number;
  slope: number;
  earthKPa: number;
}

export function routeProfile(points: LatLon[], grid: GridFile, eg: ElevGrid): ProfilePoint[] {
  let km = 0;
  return points.map((p, i) => {
    if (i > 0) km += haversineKm(points[i - 1]!, p);
    const elev = elevAt(eg, p);
    return { km, elev, slope: slopeAt(grid, p), earthKPa: isaPressureKPa(elev) };
  });
}

export interface Readings {
  earthKPa: number;
  targetKPa: number;
  tiltDeg: number;
  twinMassKg: number;
  /** Per wheel, N: the light Earth twin rover (= the real rover on the target). */
  wheelN: number;
  /** Per wheel, N: the full-mass rover if it were driven on Earth. */
  fullMassWheelN: number;
  downslopeN: number;
  groundKPa: number;
}

/** Target pressure at the middle of the target DEM's elevation range. */
export function targetKPaFor(t: Target, env: { pressure_kpa: number }, body: Body): number {
  const mid = (t.dem.elev_min_m + t.dem.elev_max_m) / 2;
  return targetPressureKPa(body, mid, env.pressure_kpa);
}

export function readings(p: ProfilePoint, rover: Rover, g: number, targetKPa: number): Readings {
  const twin = twinMassKg(rover.massKg, g);
  const onEarth = wheelLoad(rover, twin, G_EARTH, p.slope);
  const full = wheelLoad(rover, rover.massKg, G_EARTH, p.slope);
  return {
    earthKPa: p.earthKPa,
    targetKPa,
    tiltDeg: p.slope,
    twinMassKg: twin,
    wheelN: onEarth.normalN,
    fullMassWheelN: full.normalN,
    downslopeN: onEarth.downslopeN,
    groundKPa: onEarth.groundKPa,
  };
}
