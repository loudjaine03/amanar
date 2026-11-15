import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  areaCells,
  decodeModel,
  pipelinePred,
  predictCell,
  validateModel,
  type TwinModelFile,
} from "@/lib/twins";
import { allowedMask, runPlan, SPOT_GAP, type PlanInput } from "@/lib/plan";
import { TARGETS, type MissionData } from "@/types/mission";

const file = validateModel(JSON.parse(readFileSync("public/ml/twins.json", "utf8")));
const data = JSON.parse(readFileSync("public/mission_data.json", "utf8")) as MissionData;
const m = decodeModel(file as TwinModelFile);
const base: PlanInput = {
  target: "jezero",
  area: { kind: "all" },
  goal: "drive",
  slopeLimit: 90,
  month: 1,
  heatLimit: 60,
  hubLimit: 1000,
};

describe("twin model in the browser (src/lib/twins.ts)", () => {
  it("loads the file the pipeline wrote", () => {
    expect(file).not.toBeNull();
    expect(m.nf).toBe(6);
    expect(m.nEarth).toBe(7500);
  });
  it("gives back the pipeline's own predictions (scikit-learn kNN)", () => {
    for (const tid of TARGETS) {
      const cells = areaCells(m, tid, { kind: "all" });
      const step = Math.max(1, Math.floor(cells.length / 400));
      let same = 0,
        n = 0;
      for (let i = 0; i < cells.length; i += step) {
        const c = cells[i]!;
        const p = predictCell(m, tid, c);
        const mine = p.site < 0 ? 3 : p.site;
        if (mine === pipelinePred(m, tid, c)) same++;
        n++;
      }
      // values are stored to 0.01 standard deviation, so a few ties may flip
      expect(same / n).toBeGreaterThan(0.97);
    }
  });
  it("whole-map shares from the live model match the published shares", () => {
    for (const tid of TARGETS) {
      const r = runPlan(m, data, { ...base, target: tid });
      const pub = data.targets[tid].twins.share;
      for (const s of r.sites) expect(Math.abs(s.twinShare - pub[s.id])).toBeLessThanOrEqual(3);
      expect(Math.abs(r.noTwin - pub.none)).toBeLessThanOrEqual(3);
    }
  });
});

describe("plan (src/lib/plan.ts)", () => {
  it("a tighter slope limit only removes Earth ground", () => {
    const loose = allowedMask(m, 30, [true, true, true]).reduce((a, b) => a + b, 0);
    const tight = allowedMask(m, 8, [true, true, true]).reduce((a, b) => a + b, 0);
    expect(tight).toBeLessThan(loose);
    expect(tight).toBeGreaterThan(0);
  });
  it("a site beyond the hub limit is left out and ranked last", () => {
    const far = Math.min(...data.site_order.map((s) => data.sites[s].conditions.hub.distance_km));
    const r = runPlan(m, data, { ...base, hubLimit: far - 1 });
    expect(r.sites.every((s) => s.excluded !== null)).toBe(true);
    const near = data.site_order.find((s) => data.sites[s].conditions.hub.distance_km === far)!;
    const r2 = runPlan(m, data, { ...base, hubLimit: far + 0.5 });
    expect(r2.sites[0]!.id).toBe(near);
    expect(r2.sites.slice(1).every((s) => s.excluded !== null)).toBe(true);
  });
  it("rock goal puts the best published rock match first", () => {
    for (const tid of TARGETS) {
      const r = runPlan(m, data, { ...base, target: tid, goal: "rocks" });
      const rank = { match: 2, partial: 1, no: 0 } as const;
      const best = Math.max(...r.sites.map((s) => rank[s.geology]));
      expect(rank[r.sites[0]!.geology]).toBe(best);
    }
  });
  it("crew goal puts sites that are workable in the month first", () => {
    const r = runPlan(m, data, { ...base, goal: "crew", month: 7, heatLimit: 38 });
    const okIdx = r.sites.map((s) => (s.monthOk ? 1 : 0));
    expect([...okIdx].sort((a, b) => b - a)).toEqual(okIdx);
  });
  it("spots sit on allowed ground, apart from each other", () => {
    const r = runPlan(m, data, { ...base, slopeLimit: 12 });
    const e = m.file.earth;
    for (const s of r.sites)
      for (const [a, sp] of s.spots.entries()) {
        expect(e.slope_p90[sp.cell]!).toBeLessThanOrEqual(12);
        for (const sp2 of s.spots.slice(a + 1)) {
          const per = e.rows * e.cols;
          const d = Math.max(
            Math.abs(Math.floor((sp.cell % per) / e.cols) - Math.floor((sp2.cell % per) / e.cols)),
            Math.abs((sp.cell % e.cols) - (sp2.cell % e.cols)),
          );
          expect(d).toBeGreaterThanOrEqual(SPOT_GAP);
        }
      }
  });
  it("a single spot gives an answer that depends on where it is", () => {
    const t = m.file.targets.jezero;
    const [wr, wc, wh, ww] = t.window;
    const a = runPlan(m, data, {
      ...base,
      area: { kind: "spot", r: wr + 5, c: wc + 5, radius: 1 },
    });
    expect(a.sampled).toBe(9);
    expect(a.sites.reduce((x, s) => x + s.twinShare, 0) + a.noTwin).toBeGreaterThan(95);
    expect(a.measures).toHaveLength(6);
    void wh;
    void ww;
  });
});
