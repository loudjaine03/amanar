import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseGrid } from "@/lib/stage3";
import { validateMissionData } from "@/lib/api";
import { SITES, TARGETS, type MissionData } from "@/types/mission";

const data = JSON.parse(readFileSync("public/mission_data.json", "utf8")) as MissionData;
const pub = (url: string) => `public${url}`;
const BANDS = data.meta.match_bands;
const bandOf = (s: number) => BANDS.find((b) => s >= b.min)!.name;

describe("public/mission_data.json (pipeline/compare.py) follows the version-2 contract", () => {
  it("passes the same validation the app runs", () => {
    expect(validateMissionData(data)).toBeNull();
    expect(data.meta.mock).toBe(false);
  });
  it("every source id used anywhere exists in meta.sources", () => {
    const ids = new Set(data.meta.sources.map((s) => s.id));
    const used = JSON.stringify(data).match(/"source":\s*"([a-z0-9_]+)"/g) ?? [];
    expect(used.length).toBeGreaterThan(10);
    for (const u of used) expect(ids.has(u.split('"')[3] as string)).toBe(true);
  });
  it("every image and grid the app shows exists on disk", () => {
    for (const s of SITES) {
      const site = data.sites[s];
      for (const url of [
        site.layers.optical,
        site.layers.l_band,
        site.layers.slope_color,
        site.layers.anomalies,
        site.grid,
        ...Object.values(site.layers.like),
      ])
        expect(existsSync(pub(url)), url).toBe(true);
      expect(parseGrid(JSON.parse(readFileSync(pub(site.grid), "utf8")))).not.toBeNull();
    }
    for (const t of TARGETS) expect(existsSync(pub(data.targets[t].dem.slope_image))).toBe(true);
  });
  it("bounds are [[south, west], [north, east]]", () => {
    for (const s of SITES) {
      const b = data.sites[s].bounds;
      expect(b[0][0]).toBeLessThan(b[1][0]);
      expect(b[0][1]).toBeLessThan(b[1][1]);
    }
  });
});

describe("the comparison is measured, not decided by hand", () => {
  it("every target uses real elevation data with provenance and a check", () => {
    for (const t of TARGETS) {
      const dem = data.targets[t].dem;
      expect(dem.product).toBeTruthy();
      expect(dem.product_url).toMatch(/^https:\/\//);
      expect(dem.copy_url).toMatch(/^https:\/\//);
      expect(dem.res_m).toBeLessThanOrEqual(40);
    }
    expect(data.targets.jezero.dem.check_vs_mola!.correlation).toBeGreaterThan(0.95);
    expect(
      Math.abs(data.targets.moon_south.dem.check_slope!.shackleton_inner_wall_deg - 30),
    ).toBeLessThan(5);
  });
  it("the lunar target is the south pole (permanent-base region), not the equator", () => {
    expect(data.targets.moon_south.body).toBe("moon");
    expect(data.targets.moon_south.dem.center[0]).toBeLessThan(-85);
  });
  it("ranking is sorted by the measured score, and the band follows the score", () => {
    for (const t of TARGETS) {
      const tg = data.targets[t];
      const scores = tg.ranking.map((s) => tg.sites[s].score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
      for (const s of SITES) {
        const r = tg.sites[s];
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
        expect(r.band).toBe(bandOf(r.score));
      }
    }
  });
  it("geology only sets the label, by the published rule", () => {
    for (const t of TARGETS)
      for (const s of SITES) {
        const r = data.targets[t].sites[s];
        const g = r.geology.level;
        const expected =
          r.band === "close" && g === "match"
            ? "Strong analog"
            : r.band !== "poor" && g !== "no"
              ? "Partial analog"
              : r.band !== "poor"
                ? "Terrain only"
                : g === "match"
                  ? "Rocks only"
                  : "Weak analog";
        expect(r.label).toBe(expected);
        expect(r.geology.text.length).toBeGreaterThan(20);
        expect(r.geology.source).toBeTruthy();
      }
  });
  it("a sedimentary basin is never called a strong or partial analog of the Moon", () => {
    expect(["Weak analog", "Terrain only"]).toContain(data.targets.moon_south.sites.ahnet.label);
  });
  it("robustness: the winner is reported with how often it wins", () => {
    for (const t of TARGETS) {
      const rb = data.targets[t].robustness;
      expect(rb.variants).toHaveLength(rb.n);
      expect(Object.values(rb.wins).reduce((a, b) => a + b, 0)).toBe(rb.n);
      expect(rb.variants[0]!.scores[data.targets[t].ranking[0]!]).toBe(
        data.targets[t].sites[data.targets[t].ranking[0]!].score,
      );
    }
  });
  it("zone by zone: every zone is counted once", () => {
    for (const t of TARGETS) {
      const z = data.targets[t].robustness.zones;
      expect(z.n).toBeGreaterThan(2);
      expect(Object.values(z.wins).reduce((a, b) => a + b, 0) + z.none).toBe(z.n);
      expect(existsSync(pub(z.image))).toBe(true);
      for (const p of z.parts) expect(z.wins[p.site]).toBeGreaterThan(0);
    }
  });
  it("twin model: shares add up, image exists, stable across measure sets, headline follows it", () => {
    for (const t of TARGETS) {
      const tg = data.targets[t];
      const tw = tg.twins;
      const sum = SITES.reduce((a, s) => a + tw.share[s], 0) + tw.share.none;
      expect(Math.abs(sum - 100)).toBeLessThanOrEqual(2);
      expect(existsSync(pub(tw.image))).toBe(true);
      expect(tw.stability.length).toBeGreaterThanOrEqual(3);
      expect(tw.max_change).toBeLessThanOrEqual(10);
      expect(tw.site_recognition).toBeGreaterThan(60);
      for (const p of tw.parts) expect(tw.share[p.site]).toBeGreaterThanOrEqual(15);
      const top = Math.max(...SITES.map((s) => tw.share[s]));
      const split = top < 60 && tw.parts.length > 1;
      expect(tg.headline.startsWith("It depends on the part of")).toBe(split);
      if (split) for (const p of tw.parts) expect(tg.headline).toContain(p.ground);
    }
  });
  it("wording stays within what is measured (review corrections)", () => {
    const moon = data.targets.moon_south;
    expect(moon.why).toContain("2022");
    expect(moon.why).toContain("October 2024");
    expect(`${moon.mission} ${moon.goal}`).not.toMatch(/base region|permanent base on/i);
    expect(moon.goal).toMatch(/not a base-site assessment/);
    // terrain classes come from slope only: no geological unit names
    for (const t of TARGETS)
      for (const p of data.targets[t].twins.parts)
        expect(p.ground).toMatch(/^(gentle|intermediate, rougher|steep) terrain$|^the whole map$/);
    // Tassili's sandstone is not Gale's lake mudstone
    expect(data.targets.gale.sites.tassili.geology.level).toBe("partial");
    expect(data.targets.jezero.sites.ahnet.geology.text).toMatch(/not the same composition/);
  });
  it("picks name the right sites", () => {
    for (const t of TARGETS) {
      const tg = data.targets[t];
      expect(tg.picks.driving.site).toBe(tg.ranking[0]);
      const rank = { match: 2, partial: 1, no: 0 } as const;
      const best = Math.max(...SITES.map((s) => rank[tg.sites[s].geology.level]));
      expect(rank[tg.sites[tg.picks.rocks.site].geology.level]).toBe(best);
    }
  });
});

describe("spots, tests and rover routes", () => {
  it("look-alike spots stay out of the 800 m border and are sorted by score", () => {
    for (const t of TARGETS)
      for (const s of SITES) {
        const [[so, we], [no, ea]] = data.sites[s].bounds;
        const mLat = ((no - so) / 50) * 2;
        const mLon = ((ea - we) / 50) * 2;
        const spots = data.targets[t].sites[s].spots;
        expect(spots.length).toBeGreaterThan(0);
        for (const sp of spots) {
          expect(sp.coords[0]).toBeGreaterThan(so + mLat * 0.99);
          expect(sp.coords[0]).toBeLessThan(no - mLat * 0.99);
          expect(sp.coords[1]).toBeGreaterThan(we + mLon * 0.99);
          expect(sp.coords[1]).toBeLessThan(ea - mLon * 0.99);
        }
        const sc = spots.map((x) => x.score);
        expect([...sc].sort((a, b) => b - a)).toEqual(sc);
      }
  });
  it("site tests differ between sites (they are computed, not generic)", () => {
    for (const t of TARGETS) {
      const sigs = SITES.map((s) => data.targets[t].sites[s].tests.map((x) => x.level).join(","));
      expect(new Set(sigs).size).toBeGreaterThan(1);
    }
  });
  it("every target and site has a rover route through its waypoints", () => {
    for (const t of TARGETS)
      for (const s of SITES) {
        const rv = data.targets[t].sites[s].rover;
        expect(rv).not.toBeNull();
        expect(rv!.waypoints.length).toBeGreaterThan(0);
        expect(rv!.route_km_default).toBeGreaterThan(0);
      }
  });
});

describe("radar hotspots and model honesty", () => {
  it("a hotspot is a candidate exactly when it passes all four checks", () => {
    for (const s of SITES) {
      const r = data.sites[s].radar;
      for (const h of r.hotspots) {
        const all = Object.values(h.checks).every(Boolean);
        expect(h.verdict === "candidate").toBe(all);
        expect(h.reasons.length === 0).toBe(all);
      }
      expect(r.candidates).toBe(r.hotspots.filter((h) => h.verdict === "candidate").length);
      expect(r.total).toBe(r.hotspots.length);
    }
  });
  it("the radar model is reported inside each site, with the leave-one-site-out failure", () => {
    const m = data.meta.radar_model;
    for (const s of SITES) expect(m.r2_by_site[s]).toBeLessThan(0.9);
    expect(m.r2_leave_one_site_out.ahnet).toBeLessThan(0);
    expect(JSON.stringify(data.meta)).not.toContain("0.93");
  });
});
