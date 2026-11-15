import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  crewSafety,
  DEFAULT_ROVER,
  G_EARTH,
  habitatLoad,
  isaPressureKPa,
  marsPressureKPa,
  materialRows,
  twinMassKg,
  wheelLoad,
} from "@/lib/materials";
import { SITES, TARGETS, type MissionData } from "@/types/mission";
import { elevAt, elevGridFor } from "@/lib/sensors";
import { decodeModel, validateModel, type TwinModelFile } from "@/lib/twins";

const data = JSON.parse(readFileSync("public/mission_data.json", "utf8")) as MissionData;
const ids = new Set(data.meta.sources.map((s) => s.id));

describe("materials and crew safety (src/lib/materials.ts)", () => {
  it("every row cites a source that exists", () => {
    for (const t of TARGETS)
      for (const s of SITES) {
        for (const r of materialRows(data, t, s)) {
          expect(ids.has(r.source)).toBe(true);
          if (r.threatSource) expect(ids.has(r.threatSource)).toBe(true);
        }
        for (const r of crewSafety(data, s, 7, 40)) expect(ids.has(r.source)).toBe(true);
      }
  });
  it("wheel level follows the measured roughness ratio", () => {
    for (const t of TARGETS)
      for (const s of SITES) {
        const row = materialRows(data, t, s).find((r) => r.id === "wheels")!;
        const share =
          (100 * data.targets[t].sites[s].features["rough"]!.p90) /
          data.targets[t].stats["rough"]!.p90;
        const want = share >= 50 ? "field" : share >= 25 ? "partial" : "no";
        expect(row.level).toBe(want);
      }
  });
  it("only wheels and chassis levels are computed; the rest are tagged as judgement", () => {
    for (const t of TARGETS)
      for (const s of SITES)
        for (const r of materialRows(data, t, s)) {
          const computed = r.id === "wheels" || r.id === "structure";
          expect(r.basis).toBe(computed ? "data" : "judgement");
          expect(r.tag).toBe(computed ? "Measured" : "Judgement");
          if (!computed) expect(r.source).toBe("team");
        }
  });
  it("chassis level follows the measured temperature-swing ratio", () => {
    for (const t of TARGETS)
      for (const s of SITES) {
        const row = materialRows(data, t, s).find((r) => r.id === "structure")!;
        const share =
          (100 * (data.sites[s].conditions.daily_range_c ?? 0)) /
          data.meta.env[data.targets[t].body].day_swing_c;
        expect(row.level).toBe(share >= 50 ? "field" : share >= 25 ? "partial" : "no");
      }
  });
  it("heat risk changes with the month and the limit", () => {
    const hot = crewSafety(data, "ahnet", 7, 40).find((r) => r.id === "heat")!;
    const mild = crewSafety(data, "ahnet", 1, 40).find((r) => r.id === "heat")!;
    expect(hot.risk).toBe("fail");
    expect(mild.risk).toBe("ok");
  });
});

describe("pressure physics", () => {
  it("standard atmosphere: 101.3 kPa at sea level, about 79.5 kPa at 2,000 m", () => {
    expect(isaPressureKPa(0)).toBeCloseTo(101.325, 2);
    expect(isaPressureKPa(2000)).toBeCloseTo(79.5, 0);
  });
  it("Mars: 0.636 kPa at the datum, higher in deep craters", () => {
    expect(marsPressureKPa(0)).toBeCloseTo(0.636, 3);
    expect(marsPressureKPa(-4500)).toBeGreaterThan(0.9);
  });
  it("a lighter twin rover loads each wheel like the real rover on Mars", () => {
    const m = twinMassKg(DEFAULT_ROVER.massKg, 3.73);
    const mars = wheelLoad(DEFAULT_ROVER, DEFAULT_ROVER.massKg, 3.73, 10);
    const earth = wheelLoad(DEFAULT_ROVER, m, G_EARTH, 10);
    expect(earth.normalN).toBeCloseTo(mars.normalN, 6);
    expect(earth.groundKPa).toBeCloseTo(mars.groundKPa, 6);
  });
  it("habitat proof pressure reproduces the target wall load", () => {
    const h = habitatLoad(70, 0.636, 83);
    expect(h.proofInsideKPa - 83).toBeCloseTo(70 - 0.636, 6);
    expect(h.siteKN).toBeLessThan(0);
  });
});

describe("sensor simulation inputs (src/lib/sensors.ts)", () => {
  const m = decodeModel(
    validateModel(JSON.parse(readFileSync("public/ml/twins.json", "utf8"))) as TwinModelFile,
  );
  it("elevation at a cell centre is that cell's elevation", () => {
    for (const s of SITES) {
      const g = elevGridFor(m, s)!;
      const [[south, west], [north, east]] = g.bounds;
      const r = 20,
        c = 31;
      const lat = north - ((r + 0.5) * (north - south)) / g.rows;
      const lon = west + ((c + 0.5) * (east - west)) / g.cols;
      expect(elevAt(g, [lat, lon])).toBeCloseTo(g.elev[r * g.cols + c]!, 6);
    }
  });
  it("site elevations agree with the site metrics", () => {
    for (const s of SITES) {
      const g = elevGridFor(m, s)!;
      const mean = g.elev.reduce((a, b) => a + b, 0) / g.elev.length;
      expect(Math.abs(mean - data.sites[s].metrics.elev)).toBeLessThan(60);
    }
  });
});
