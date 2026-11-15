// Plain-language helpers and the downloadable Markdown report. No React here, so it is unit-tested.
import type { Band, GeoLevel, MissionData, SiteLabel, TargetId, TestLevel } from "@/types/mission";

export const BAND_WORD: Record<Band, string> = {
  close: "Close match",
  moderate: "Moderate match",
  poor: "Poor match",
};
export const GEO_WORD: Record<GeoLevel, string> = {
  match: "Rocks match",
  partial: "Rocks partly match",
  no: "Rocks do not match",
};
export const TEST_WORD: Record<TestLevel, string> = {
  field: "TEST HERE",
  partial: "PARTLY HERE",
  no: "NOT HERE",
  lab: "LAB ONLY",
};
export const LABEL_HINT: Record<SiteLabel, string> = {
  "Strong analog": "Close terrain and matching rocks.",
  "Partial analog": "Terrain and rocks both help, neither fully.",
  "Terrain only": "Good for driving and navigation tests, not for rock science.",
  "Rocks only": "Good for rock science, not for driving tests.",
  "Weak analog": "Neither the terrain nor the rocks are close.",
};

/** Name of a source id, for tooltips and the report. */
export function sourceName(data: MissionData | null, id: string | undefined): string {
  if (!id) return "";
  return data?.meta.sources.find((s) => s.id === id)?.name ?? id;
}

export function fmtNum(v: number | null | undefined, unit = "", digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "TBD";
  const s =
    Math.abs(v) >= 100
      ? Math.round(v).toLocaleString("en-US")
      : v.toFixed(digits).replace(/\.0$/, "");
  return unit ? `${s}${unit.startsWith("%") || unit === "°" ? "" : " "}${unit}` : s;
}

/** The whole comparison for one target, as Markdown (what the "Download report" button saves). */
export function buildReport(data: MissionData, target: TargetId): string {
  const t = data.targets[target];
  const name = (id: string) => data.sites[id as keyof typeof data.sites]?.name ?? id;
  const L: string[] = [];
  L.push(`# Amanar report: ${t.title} vs three Algerian sites`, "");
  L.push(
    `Generated ${data.meta.generated}. Team-built experimental indicators, not an official NASA assessment.`,
    "",
  );
  L.push(`## Result`, "", t.headline, "");
  L.push(
    `| Site | Terrain match (Measured) | Rocks (Reference) | Label |`,
    `| --- | --- | --- | --- |`,
  );
  for (const id of t.ranking) {
    const r = t.sites[id];
    L.push(
      `| ${name(id)} | ${r.score}/100 (${r.band}) | ${GEO_WORD[r.geology.level]} | ${r.label} |`,
    );
  }
  const z = t.robustness.zones;
  L.push(
    "",
    `Ranking stability: over the main window, ${name(t.ranking[0]!)} is first in ${t.robustness.wins[t.ranking[0]!]} of ${t.robustness.n} variants of the measure.`,
    `Machine-learning twin model (kNN, k = ${t.twins.k}, whole map ${t.twins.area_km[0]} x ${t.twins.area_km[1]} km): ${t.ranking.map((id) => `${name(id)} ${t.twins.share[id]}%`).join(", ")}, no close twin ${t.twins.share.none}%. Site recognition on unseen 4 km blocks: ${t.twins.site_recognition}%. Shares change by at most ${t.twins.max_change} points with other measure sets.`,
    ...t.twins.parts.map((p) => `- ${p.ground} -> ${name(p.site)} (${p.share}%)`),
    `Second check, zone by zone (${z.n} zones of ${z.tile_km} km): ${t.ranking.map((id) => `${name(id)} best in ${z.wins[id]}`).join(", ")}, no good match in ${z.none}.`,
    "",
  );
  L.push(`## Best site for each use`, "");
  L.push(
    `- Driving and navigation tests: **${name(t.picks.driving.site)}**. ${t.picks.driving.why}`,
  );
  L.push(`- Rock science: **${name(t.picks.rocks.site)}**. ${t.picks.rocks.why}`);
  L.push(
    `- Radar under dry cover: **${t.picks.radar.site ? name(t.picks.radar.site) : "none"}**. ${t.picks.radar.why}`,
    "",
  );
  L.push(`## Target terrain (measured from ${t.dem.product})`, "");
  L.push(`${t.dem.where}; ${t.dem.size_km[0]} x ${t.dem.size_km[1]} km at ${t.dem.res_m} m.`, "");
  L.push(
    `| Measure | ${t.title} | ${t.ranking.map(name).join(" | ")} |`,
    `| --- | --- | ${t.ranking.map(() => "---").join(" | ")} |`,
  );
  for (const f of data.meta.features) {
    L.push(
      `| ${f.label} (median) | ${fmtNum(t.stats[f.key]?.median, f.unit)} | ${t.ranking.map((id) => fmtNum(t.sites[id].features[f.key]?.median, f.unit)).join(" | ")} |`,
    );
  }
  L.push(
    "",
    `## Rocks`,
    "",
    `${t.title}: ${t.rocks.text} (${sourceName(data, t.rocks.source)}).`,
    "",
  );
  for (const id of t.ranking)
    L.push(
      `- ${name(id)}: ${GEO_WORD[t.sites[id].geology.level]}. ${t.sites[id].geology.text} (${sourceName(data, t.sites[id].geology.source)})`,
    );
  L.push("", `## What each site can test`, "");
  for (const id of t.ranking) {
    L.push(`### ${name(id)}`, "");
    for (const x of t.sites[id].tests) L.push(`- ${TEST_WORD[x.level]}: ${x.name}. ${x.text}`);
    L.push("");
  }
  L.push(`At any Earth site:`, "");
  for (const x of t.lab_tests) L.push(`- ${TEST_WORD[x.level]}: ${x.name}. ${x.text}`);
  L.push("", `## Where the analogy breaks`, "");
  for (const b of t.breaks) L.push(`- ${b.text}`);
  L.push("", `## Sources`, "");
  for (const s of data.meta.sources) L.push(`- ${s.name}${s.url ? `: ${s.url}` : ""}`);
  return L.join("\n") + "\n";
}
