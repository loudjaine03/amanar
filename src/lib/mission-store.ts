import { create } from "zustand";
import type { LatLon } from "./geo";
import type { MissionData, SiteId, TargetId, Waypoint } from "@/types/mission";
import type { Goal } from "./plan";

export type AreaKind = "all" | "window" | "spot";
/** A drive planned on the Plan page: used by Rehearse instead of the default route. */
export interface CustomRoute {
  target: TargetId;
  site: SiteId;
  landing: LatLon;
  waypoints: Waypoint[];
}

export type SiteLayer = "like" | "satellite" | "l_band" | "slope";

interface MissionState {
  target: TargetId;
  /** Site chosen by the user; null = the best terrain match for the current target. */
  site: SiteId | null;
  missionData: MissionData | null;
  loadError: string | null;
  layer: SiteLayer;
  showHotspots: boolean;
  month: number;
  heatLimit: number;
  slopeLimit: number;
  landing: LatLon | null;
  delayMode: boolean;
  goal: Goal;
  areaKind: AreaKind;
  /** Clicked cell [row, col] on the target map, per target. */
  spot: Partial<Record<TargetId, [number, number]>>;
  hubLimit: number;
  customRoute: CustomRoute | null;
  setGoal: (g: Goal) => void;
  setAreaKind: (a: AreaKind) => void;
  setSpot: (t: TargetId, rc: [number, number]) => void;
  setHubLimit: (km: number) => void;
  setCustomRoute: (r: CustomRoute | null) => void;
  setTarget: (t: TargetId) => void;
  setSite: (s: SiteId | null) => void;
  setLayer: (l: SiteLayer) => void;
  setShowHotspots: (b: boolean) => void;
  setMonth: (m: number) => void;
  setHeatLimit: (h: number) => void;
  setSlopeLimit: (s: number) => void;
  setLanding: (p: LatLon | null) => void;
  setDelayMode: (b: boolean) => void;
}

export const useMissionStore = create<MissionState>()((set) => ({
  target: "jezero",
  site: null,
  missionData: null,
  loadError: null,
  layer: "like",
  showHotspots: true,
  month: 1,
  heatLimit: 40,
  slopeLimit: 15,
  landing: null,
  delayMode: true,
  goal: "drive",
  areaKind: "window",
  spot: {},
  hubLimit: 250,
  customRoute: null,
  setGoal: (goal) => set({ goal }),
  setAreaKind: (areaKind) => set({ areaKind }),
  setSpot: (t, rc) => set((s) => ({ spot: { ...s.spot, [t]: rc }, areaKind: "spot" })),
  setHubLimit: (hubLimit) => set({ hubLimit }),
  setCustomRoute: (customRoute) => set({ customRoute, landing: null }),
  setTarget: (target) => set({ target, site: null, landing: null }),
  setSite: (site) => set({ site, landing: null }),
  setLayer: (layer) => set({ layer }),
  setShowHotspots: (showHotspots) => set({ showHotspots }),
  setMonth: (month) => set({ month }),
  setHeatLimit: (heatLimit) => set({ heatLimit }),
  setSlopeLimit: (slopeLimit) => set({ slopeLimit }),
  setLanding: (landing) => set({ landing }),
  setDelayMode: (delayMode) => set({ delayMode }),
}));

/** The site shown on the Site and Rehearse pages: the user's choice, else the best terrain match. */
export function currentSite(
  data: MissionData | null,
  target: TargetId,
  site: SiteId | null,
): SiteId | null {
  if (!data) return null;
  return site ?? data.targets[target]?.ranking[0] ?? null;
}
