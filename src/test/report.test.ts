import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildReport, fmtNum, sourceName } from "@/lib/report";
import { validateMissionData } from "@/lib/api";
import { TARGETS, type MissionData } from "@/types/mission";

const data = JSON.parse(readFileSync("public/mission_data.json", "utf8")) as MissionData;

describe("downloadable report", () => {
  it("contains the headline, the three sites, the picks and every source", () => {
    for (const t of TARGETS) {
      const md = buildReport(data, t);
      expect(md).toContain(data.targets[t].headline);
      for (const s of data.site_order) expect(md).toContain(data.sites[s].name);
      expect(md).toContain("Driving and navigation tests");
      expect(md).toContain("Where the analogy breaks");
      for (const src of data.meta.sources) expect(md).toContain(src.name);
    }
  });
});

describe("small helpers", () => {
  it("fmtNum never prints NaN and says TBD for unknown values", () => {
    expect(fmtNum(null)).toBe("TBD");
    expect(fmtNum(Number.NaN, "m")).toBe("TBD");
    expect(fmtNum(12.34, "m")).toBe("12.3 m");
    expect(fmtNum(3.0, "°")).toBe("3°");
    expect(fmtNum(1234.5, "m")).toBe("1,235 m");
  });
  it("sourceName falls back to the id", () => {
    expect(sourceName(data, "cop_dem")).toContain("Copernicus");
    expect(sourceName(data, "nope")).toBe("nope");
    expect(sourceName(null, undefined)).toBe("");
  });
  it("validateMissionData rejects an old or broken file", () => {
    expect(validateMissionData(null)).not.toBeNull();
    expect(validateMissionData({ meta: { mock: false }, scenarios: {} })).toBe(
      "meta.version must be 2",
    );
  });
});
