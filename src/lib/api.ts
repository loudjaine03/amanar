import {
  SITES,
  TARGETS,
  type CheckState,
  type FieldAccessResult,
  type MissionData,
} from "@/types/mission";

/** Checks that a parsed JSON follows the version-2 contract. Returns an error message, or null when valid. */
export function validateMissionData(data: unknown): string | null {
  const d = data as Partial<MissionData> | null;
  if (!d || typeof d !== "object") return "not an object";
  if (d.meta?.version !== 2) return "meta.version must be 2";
  if (typeof d.meta.mock !== "boolean") return "meta.mock missing";
  for (const t of TARGETS) {
    const tg = d.targets?.[t];
    if (!tg) return `target ${t} missing`;
    for (const s of SITES) if (!tg.sites?.[s]) return `target ${t} has no result for ${s}`;
  }
  for (const s of SITES) if (!d.sites?.[s]) return `site ${s} missing`;
  return null;
}

/** Reads public/mission_data.json. Never invents data: throws when the file is missing or invalid. */
export async function getMissionData(): Promise<MissionData> {
  const response = await fetch("/mission_data.json");
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json"))
    throw new Error("MISSION_DATA_NOT_SUPPLIED");
  const data = (await response.json()) as MissionData;
  const err = validateMissionData(data);
  if (err) throw new Error(`MISSION_DATA_INVALID: ${err}`);
  return data;
}

const below = (value: number | null, limit: number): CheckState =>
  value === null || !Number.isFinite(value) ? "tbd" : value < limit ? "ok" : "fail";

/** Preliminary field-access check for an Earth test team. The three limits are team assumptions shown on screen.
 *  An unknown value gives "tbd", never "ok". */
export function computeFieldAccess(input: {
  maxSlopeDeg: number | null;
  slopeLimitDeg: number;
  tmaxC: number | null;
  heatLimitC: number;
  hubKm: number | null;
  hubLimitKm: number;
}): FieldAccessResult {
  // the route is planned with slope <= limit, so a route exactly at the limit is fine
  const slope = below(input.maxSlopeDeg, input.slopeLimitDeg + 1e-9);
  const heat = below(input.tmaxC, input.heatLimitC);
  const logistics = below(input.hubKm, input.hubLimitKm);
  const all = [slope, heat, logistics];
  const verdict = all.includes("fail") ? "outside" : all.includes("tbd") ? "tbd" : "meets";
  return { slope, heat, logistics, verdict };
}
