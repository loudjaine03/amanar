// Contract of public/mission_data.json (version 2), written by pipeline/compare.py.
import type { Bounds, LatLon } from "@/lib/geo";
export type { Bounds, LatLon };

export type Tag = "Measured" | "Reference" | "Judgement" | "Hypothesis";
export type TargetId = "jezero" | "gale" | "moon_south";
export type SiteId = "ahnet" | "tassili" | "hoggar";
export type Body = "mars" | "moon";
export type Band = "close" | "moderate" | "poor";
export type GeoLevel = "match" | "partial" | "no";
export type SiteLabel =
  "Strong analog" | "Partial analog" | "Terrain only" | "Rocks only" | "Weak analog";
export type TestLevel = "field" | "partial" | "no" | "lab";

export const TARGETS: TargetId[] = ["jezero", "gale", "moon_south"];
export const SITES: SiteId[] = ["ahnet", "tassili", "hoggar"];

export interface Source {
  id: string;
  name: string;
  url: string | null;
}
export interface Delay {
  one_way_s: number;
  label: string;
  tag: Tag;
  source: string;
}
export interface FeatureMeta {
  key: string;
  label: string;
  unit: string;
  scale: "fine" | "landscape";
}
export interface Stat {
  median: number;
  p10: number;
  p90: number;
}

export interface Waypoint {
  id: string;
  coords: LatLon;
  title: string;
  inspect: string;
  tool: string;
  tag: Tag;
  why?: string;
}
export interface RoverPlan {
  grid: string;
  slope_limit_deg: number;
  landing: LatLon;
  waypoints: Waypoint[];
  route_km_default: number;
}
export interface Spot {
  id: string;
  coords: LatLon;
  score: number;
  why: string;
}
export interface TestRow {
  name: string;
  level: TestLevel;
  text: string;
  tag: Tag;
}
export interface Note {
  text: string;
  tag: Tag;
  source?: string;
}

export interface SiteResult {
  score: number;
  band: Band;
  features: Record<string, { overlap: number; median: number; p90: number }>;
  geology: { level: GeoLevel; text: string; source: string };
  label: SiteLabel;
  best_area: { score: number; bounds: Bounds };
  spots: Spot[];
  tests: TestRow[];
  rover: RoverPlan | null;
}

/** Zone-by-zone comparison over the whole Mars/Moon grid (8 km zones every 4 km). */
export interface Zones {
  tile_km: number;
  step_km: number;
  n: number;
  wins: Record<SiteId, number>;
  none: number;
  parts: { site: SiteId; ground: string; zones: number }[];
  image: string;
  area_km: [number, number];
  colors: Record<SiteId, string>;
}

/** kNN "twin" model: for every 400 m cell of the target, which Earth site holds its closest twins. */
export interface Twins {
  share: Record<SiteId | "none", number>;
  parts: { site: SiteId; ground: string; share: number }[];
  image: string;
  k: number;
  stability: { measures: string; share: Record<SiteId | "none", number> }[];
  max_change: number;
  site_recognition: number;
  colors: Record<SiteId, string>;
  area_km: [number, number];
}

export interface Variant {
  name: string;
  scores: Record<SiteId, number>;
  winner: SiteId;
}

export interface Target {
  id: TargetId;
  title: string;
  short: string;
  body: Body;
  mission: string;
  goal: string;
  why: string;
  rocks: { text: string; source: string };
  tiles: string;
  map_center: LatLon;
  zoom: number;
  delay: Delay;
  dem: {
    product: string;
    product_url: string;
    copy_url: string;
    res_m: number;
    size_km: [number, number];
    center: LatLon;
    where: string;
    elev_min_m: number;
    elev_max_m: number;
    slope_image: string;
    source: string;
    check_vs_mola?: { rms_m: number; correlation: number } | null;
    check_slope?: {
      shackleton_inner_wall_deg: number;
      published_wall_deg: number;
      note: string;
    } | null;
  };
  stats: Record<string, Stat>;
  ranking: SiteId[];
  robustness: {
    variants: Variant[];
    wins: Record<SiteId, number>;
    n: number;
    zones: Zones;
  };
  twins: Twins;
  sites: Record<SiteId, SiteResult>;
  picks: {
    driving: { site: SiteId; why: string };
    rocks: { site: SiteId; why: string };
    radar: { site: SiteId | null; why: string };
  };
  headline: string;
  breaks: Note[];
  lab_tests: TestRow[];
  tools: string[];
}

export interface Hotspot {
  id: string;
  coords: LatLon;
  area_km2: number;
  z_mean: number;
  checks: {
    away_from_edge: boolean;
    not_on_boundary: boolean;
    images_aligned: boolean;
    smooth_flat_cover: boolean;
  };
  verdict: "candidate" | "doubtful";
  reasons: string[];
}

export interface Site {
  id: SiteId;
  name: string;
  bounds: Bounds;
  layers: {
    optical: string;
    c_band: string;
    l_band: string;
    slope: string;
    slope_color: string;
    surprise: string;
    anomalies: string;
    like: Record<TargetId, string>;
  };
  metrics: {
    mean_slope: number;
    relief: number;
    steep_share: number;
    rough: number;
    elev: number;
    hot_share: number;
  };
  conditions: {
    monthly_tmax_c: (number | null)[];
    monthly_tmin_c: (number | null)[];
    rain_mm_year: number | null;
    daily_range_c: number | null;
    elevation_m: number;
    air_pressure_kpa: number;
    hub: { name: string; coords: LatLon; distance_km: number };
    assumptions: { heat_c: number; slope_deg: number; hub_km: number };
    source: string;
  };
  radar: {
    hotspots: Hotspot[];
    candidates: number;
    total: number;
    candidate_km2: number;
    boundary_base: number;
    coreg: { l_vs_c_px: [number, number]; l_vs_optical_px: [number, number]; pixel_m: number };
  };
  grid: string;
}

export interface MissionData {
  meta: {
    version: 2;
    mock: boolean;
    generated: string;
    sources: Source[];
    tags: Record<Tag, string>;
    cell_size_m: number;
    border_cells: number;
    features: FeatureMeta[];
    match_bands: { min: number; name: Band }[];
    radar_model: {
      type: string;
      target: string;
      predictors: Record<string, string>;
      r2_by_site: Record<SiteId, number>;
      r2_leave_one_site_out: Record<SiteId, number>;
      importance: { f: string; v: number }[];
      residual_scale_db: number;
      hotspot_z: number;
      note: string;
    };
    hotspot_rules: Record<string, number>;
    env: Record<
      Body,
      { pressure_kpa: number; day_swing_c: number; t_text: string; gravity: number; source: string }
    >;
  };
  targets: Record<TargetId, Target>;
  target_order: TargetId[];
  sites: Record<SiteId, Site>;
  site_order: SiteId[];
}

export type CheckState = "ok" | "fail" | "tbd" | "warn";
export interface FieldAccessResult {
  slope: CheckState;
  heat: CheckState;
  logistics: CheckState;
  verdict: "meets" | "outside" | "tbd";
}
