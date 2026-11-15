import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computeFieldAccess } from "@/lib/api";
import {
  delayPlan,
  fmtClock,
  MARS_DELAY_MIN,
  monthRanges,
  parseGrid,
  planRoute,
  slopeAt,
  workableMonths,
  type GridFile,
} from "@/lib/stage3";
import type { MissionData } from "@/types/mission";

const data = JSON.parse(readFileSync("public/mission_data.json", "utf8")) as MissionData;
const ahnet = data.sites.ahnet;
const rover = data.targets.jezero.sites.ahnet.rover!;
const grid = parseGrid(
  JSON.parse(readFileSync("public/grids/ahnet_slope.json", "utf8")),
) as GridFile;
const wps = rover.waypoints.map((w) => w.coords);

describe("slope grid (contract)", () => {
  it("the supplied file is a 160 x 160 grid on the site bounds", () => {
    expect(grid).not.toBeNull();
    expect(grid.cols * grid.rows).toBe(grid.slope.length);
    expect(grid.bounds).toEqual(ahnet.bounds);
  });
  it("parseGrid rejects invalid JSON without crashing", () => {
    expect(parseGrid(null)).toBeNull();
    expect(
      parseGrid({
        cols: 2,
        rows: 2,
        bounds: [
          [0, 0],
          [1, 1],
        ],
        slope: [1, 2, 3],
      }),
    ).toBeNull();
    expect(
      parseGrid({
        cols: 2,
        rows: 2,
        bounds: [
          [0, 0],
          [1, 1],
        ],
        slope: [1, 2, 3, "x"],
      }),
    ).toBeNull();
  });
});

describe("planRoute (same A* as the pipeline)", () => {
  it("default route: start > WP-01 > WP-02 > WP-03, length in km, max slope under the limit", () => {
    const p = planRoute(grid, 15, rover.landing, wps);
    expect(p.ok).toBe(true);
    expect(p.wpIndex).toHaveLength(wps.length);
    expect(p.km).toBeGreaterThan(rover.route_km_default * 0.7);
    expect(p.km).toBeLessThan(rover.route_km_default * 1.3);
    expect(p.maxSlopeDeg).toBeLessThanOrEqual(15);
    expect(p.points).toHaveLength(p.cells.length);
  });
  it("every target and site route is drivable at the default limit", () => {
    for (const t of data.target_order)
      for (const s of data.site_order) {
        const rv = data.targets[t].sites[s].rover!;
        const g = parseGrid(JSON.parse(readFileSync(`public${rv.grid}`, "utf8"))) as GridFile;
        expect(
          planRoute(
            g,
            rv.slope_limit_deg,
            rv.landing,
            rv.waypoints.map((w) => w.coords),
          ).ok,
          `${t}/${s}`,
        ).toBe(true);
      }
  });
  it("lowering the limit never shortens the route (it goes around or fails)", () => {
    const a = planRoute(grid, 25, rover.landing, wps);
    const b = planRoute(grid, 15, rover.landing, wps);
    expect(a.ok && b.ok).toBe(true);
    expect(b.km).toBeGreaterThanOrEqual(a.km - 1e-6);
  });
  it("slopeAt reads the slope under a point", () => {
    expect(slopeAt(grid, rover.landing)).toBeLessThan(15);
  });
});

describe("signal delay and simulated clock", () => {
  it("Mars delay is about 11 minutes, shown compressed; the Moon is played in real time", () => {
    expect(MARS_DELAY_MIN).toBe(11);
    expect(delayPlan(data.targets.jezero.delay).compressed).toBe(true);
    const moon = delayPlan(data.targets.moon_south.delay);
    expect(moon.compressed).toBe(false);
    expect(moon.tickMs).toBe(1300);
  });
  it("fmtClock adds simulated minutes", () => {
    const t0 = new Date(2026, 10, 14, 10, 2);
    expect(fmtClock(t0, 0)).toBe("10:02");
    expect(fmtClock(t0, MARS_DELAY_MIN)).toBe("10:13");
  });
});

describe("crew access", () => {
  const EN = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  it("Ahnet is workable only November to February at a 40 °C heat limit", () => {
    const w = workableMonths(ahnet.conditions.monthly_tmax_c, 40);
    expect(w).toEqual([1, 2, 11, 12]);
    expect(monthRanges(w, EN)).toBe("November to February");
  });
  it("Hoggar is workable all year; an unknown month is never counted as workable", () => {
    expect(monthRanges(workableMonths(data.sites.hoggar.conditions.monthly_tmax_c, 40), EN)).toBe(
      "all year",
    );
    expect(workableMonths([null, 30, null], 40)).toEqual([2]);
    expect(monthRanges([], EN)).toBe("none");
    expect(monthRanges([3, 4, 5, 9], EN)).toBe("March to May, September");
  });
  it('unknown temperature gives TBD, never "meets"; too hot gives "outside"', () => {
    const base = {
      maxSlopeDeg: 10,
      slopeLimitDeg: 15,
      heatLimitC: 40,
      hubKm: 112,
      hubLimitKm: 250,
    };
    expect(computeFieldAccess({ ...base, tmaxC: 31 }).verdict).toBe("meets");
    expect(computeFieldAccess({ ...base, tmaxC: null }).verdict).toBe("tbd");
    expect(computeFieldAccess({ ...base, tmaxC: 45 }).verdict).toBe("outside");
  });
});

describe("reachableFrom (spots kept on the Plan page)", () => {
  it("agrees with the A* planner on real grids", async () => {
    const { readFileSync } = await import("node:fs");
    const { parseGrid, planRoute, reachableFrom, isReachable } = await import("@/lib/stage3");
    const { cellToLatLon } = await import("@/lib/geo");
    for (const site of ["ahnet", "tassili", "hoggar"]) {
      const g = parseGrid(JSON.parse(readFileSync(`public/grids/${site}_slope.json`, "utf8")))!;
      const limit = 12;
      let start: [number, number] | null = null;
      for (let i = 0; i < g.slope.length && !start; i += 997)
        if ((g.slope[i] as number) <= limit)
          start = cellToLatLon(g.bounds, g, [Math.floor(i / g.cols), i % g.cols]);
      const mask = reachableFrom(g, limit, start!);
      for (let i = 13; i < g.slope.length; i += 1531) {
        const p = cellToLatLon(g.bounds, g, [Math.floor(i / g.cols), i % g.cols]);
        expect(planRoute(g, limit, start!, [p]).ok).toBe(isReachable(g, mask, p));
      }
    }
  });
});
