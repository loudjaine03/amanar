// Materials and crew safety. What each part of a rover or habitat must survive on the target (cited),
// and whether THIS site can test it, decided from the site's measured numbers, not by hand.
// Also the pressure physics used by the sensor simulation (Rehearse).
import type { Body, MissionData, SiteId, Tag, TargetId, TestLevel } from "@/types/mission";

export const G_EARTH = 9.81;

/** Air pressure from elevation, International Standard Atmosphere (kPa). Weather moves it by ~1-2 kPa. */
export function isaPressureKPa(elevationM: number): number {
  return 101.325 * Math.pow(1 - 2.25577e-5 * elevationM, 5.25588);
}
/** Mars surface pressure at an elevation above the datum: NSSDC mean 0.636 kPa, scale height 11.1 km.
 *  An estimate: the real value swings about ±30% with the seasons. */
export const MARS_SCALE_HEIGHT_M = 11_100;
export function marsPressureKPa(elevationM: number, datumKPa = 0.636): number {
  return datumKPa * Math.exp(-elevationM / MARS_SCALE_HEIGHT_M);
}
export function targetPressureKPa(body: Body, elevationM: number, datumKPa: number): number {
  return body === "mars" ? marsPressureKPa(elevationM, datumKPa) : datumKPa;
}

export interface Rover {
  /** Mass on the target, kg. */
  massKg: number;
  wheels: number;
  wheelWidthM: number;
  /** Footprint length of one wheel. A team assumption: it depends on how much the wheel sinks. */
  contactLengthM: number;
}
/** Default: a 1,025 kg rover (Perseverance class) on six wheels 40 cm wide (Curiosity's published width,
 *  msl_wheels), with a 10 cm footprint per wheel (team assumption). */
export const DEFAULT_ROVER: Rover = {
  massKg: 1025,
  wheels: 6,
  wheelWidthM: 0.4,
  contactLengthM: 0.1,
};

/** Mass of an Earth test rover that presses each wheel as hard as the real one on the target (Scarecrow). */
export const twinMassKg = (massKg: number, g: number) => (massKg * g) / G_EARTH;

export interface WheelLoad {
  /** Force pressing one wheel on the ground, N. */
  normalN: number;
  /** Whole-rover pull down the slope, N (brakes and motors must hold it). */
  downslopeN: number;
  /** Ground pressure under one wheel, kPa. */
  groundKPa: number;
}
export function wheelLoad(r: Rover, massKg: number, g: number, slopeDeg: number): WheelLoad {
  const th = (slopeDeg * Math.PI) / 180;
  const w = massKg * g;
  const normalN = (w * Math.cos(th)) / r.wheels;
  return {
    normalN,
    downslopeN: w * Math.sin(th),
    groundKPa: normalN / (r.wheelWidthM * r.contactLengthM) / 1000,
  };
}

/** Habitat wall load: pressure difference across the wall (kPa = kN per m²). */
export function habitatLoad(insideKPa: number, outsideTargetKPa: number, outsideSiteKPa: number) {
  const dpT = insideKPa - outsideTargetKPa;
  const dpS = insideKPa - outsideSiteKPa;
  return {
    targetKN: dpT,
    siteKN: dpS,
    share: dpT > 0 ? Math.max(0, dpS / dpT) : 0,
    /** Inside pressure needed at the site for the same wall load (uncrewed proof test). */
    proofInsideKPa: outsideSiteKPa + dpT,
  };
}

/* ----------------------------------------- materials ----------------------------------------- */

export interface MaterialRow {
  id: string;
  component: string;
  options: string;
  threat: string;
  /** What the site gives, with its numbers. */
  here: string;
  level: TestLevel;
  lab: string;
  tag: Tag;
  source: string;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);
const levelOf = (share: number): TestLevel =>
  share >= 50 ? "field" : share >= 25 ? "partial" : "no";

/** Every row's level comes from a ratio of measured numbers (site vs target) or from physics. */
export function materialRows(data: MissionData, target: TargetId, sid: SiteId): MaterialRow[] {
  const t = data.targets[target];
  const site = data.sites[sid];
  const env = data.meta.env[t.body];
  const moon = t.body === "moon";
  const c = site.conditions;
  const roughSite = t.sites[sid].features["rough"]?.p90 ?? site.metrics.rough;
  const roughTarget = t.stats["rough"]?.p90 ?? 0;
  const roughShare = pct(roughSite, roughTarget);
  const swing = c.daily_range_c ?? 0;
  const swingShare = pct(swing, env.day_swing_c);
  const hab = habitatLoad(70, env.pressure_kpa, c.air_pressure_kpa);
  return [
    {
      id: "wheels",
      component: "Wheels",
      options: "Milled aluminium (Curiosity) or nickel-titanium mesh tyre (NASA Glenn)",
      threat: moon
        ? "Abrasive regolith and blocky crater rims; no repair possible."
        : "Sharp embedded rocks punched holes in Curiosity's thin aluminium wheels.",
      here: `Rough ground (90th percentile) ${roughSite} m here vs ${roughTarget} m on ${t.title}: ${roughShare}% of the target's roughness.`,
      level: levelOf(roughShare),
      lab: "Cold behaviour of the metal" + (moon ? " in vacuum." : "."),
      tag: "Measured",
      source: moon ? "glenn_tire" : "msl_wheels",
    },
    {
      id: "seals",
      component: "Seals, gaskets, suit joints",
      options: "Silicone or fluorocarbon elastomers, metal seals, dust covers",
      threat: moon
        ? "Apollo: abrasive dust made suit pressure seals leak."
        : "Fine dust in joints; rubber stiffens in the cold.",
      here: "Wind-blown sand and dust at every site: open and close seals hundreds of times and log leaks with a pressure sensor.",
      level: "field",
      lab: moon ? "Vacuum with lunar dust simulant." : `Cold at ${env.pressure_kpa} kPa outside.`,
      tag: "Reference",
      source: "lunar_dust",
    },
    {
      id: "solar",
      component: "Solar panels, windows, camera lenses",
      options: "Cover glass with anti-dust coating; vibration or electrostatic cleaning",
      threat: moon
        ? "Clinging, scratching dust; the Sun stays low on the horizon at the pole."
        : "Dust build-up cut InSight's power until the mission ended.",
      here: `Real desert wind and dust: measure power lost per day and compare cleaning methods. ${c.rain_mm_year ?? "?"} mm of rain a year rarely washes panels.`,
      level: moon ? "partial" : "field",
      lab: moon ? "Electrostatic dust in vacuum." : "Nothing essential.",
      tag: "Reference",
      source: "insight_dust",
    },
    {
      id: "structure",
      component: "Chassis, joints, bonded parts",
      options: "Aluminium or titanium alloy, carbon-fibre composite",
      threat: `Daily temperature swing fatigues joints: about ${env.day_swing_c}°C on ${moon ? "the Moon" : "Mars"}.`,
      here: `${swing}°C daily swing here: ${swingShare}% of the target's. Months of cycles plus vibration on rough tracks.`,
      level: levelOf(swingShare),
      lab: "The full temperature range in a thermal chamber.",
      tag: "Measured",
      source: env.source,
    },
    {
      id: "thermal",
      component: "Thermal blankets, films, coatings",
      options: "Polyimide film, multilayer insulation, white or reflective paint",
      threat: moon
        ? "UV, micrometeorites and abrasion."
        : "UV and sand abrasion of the outer layer.",
      here: "Strong desert sun, sand and wind: outer-layer wear and colour change over weeks.",
      level: "partial",
      lab: moon
        ? "Insulation works differently in vacuum: test it there."
        : `Insulation at ${env.pressure_kpa} kPa.`,
      tag: "Judgement",
      source: "team",
    },
    {
      id: "mechanisms",
      component: "Bearings, motors, lubricants",
      options: "Dry lubricant (molybdenum disulfide) or grease; sealed bearings",
      threat: moon
        ? "Dust clogs mechanisms; liquids boil off in vacuum."
        : "Dust in moving parts; grease thickens in the cold.",
      here: `Long dusty drives: log motor current and temperature. Coldest nights here ${Math.min(...c.monthly_tmin_c.filter((v): v is number => v !== null))}°C.`,
      level: "partial",
      lab: moon ? "Vacuum and deep cold." : "Cold start of the motors.",
      tag: "Judgement",
      source: "team",
    },
    {
      id: "habitat",
      component: "Habitat shell (70 kPa inside, our assumption)",
      options: "Rigid aluminium module or inflatable layered fabric",
      threat: `${Math.round(hab.targetKN)} kN on every m² of wall on ${moon ? "the Moon" : "Mars"} (about ${Math.round(hab.targetKN / 9.81)} tonnes).`,
      here:
        hab.siteKN <= 0
          ? `Outside air here is ${c.air_pressure_kpa} kPa, more than 70 kPa inside: the wall would be pushed inward. Pressurise an uncrewed test module to ${Math.round(hab.proofInsideKPa)} kPa to get the target's outward load.`
          : `Same inside pressure gives only ${Math.round(hab.siteKN * 10) / 10} kN/m² here (${Math.round(hab.share * 100)}%). An uncrewed proof test at ${Math.round(hab.proofInsideKPa)} kPa inside gives the target load.`,
      level: "partial",
      lab: "Leak rate with near-vacuum outside.",
      tag: "Measured",
      source: "isa",
    },
  ];
}

/* ---------------------------------------- crew safety ---------------------------------------- */

export type Risk = "ok" | "warn" | "fail";
export interface SafetyRow {
  id: string;
  hazard: string;
  value: string;
  risk: Risk;
  advice: string;
  tag: Tag;
  source: string;
}

/** Team assumptions, shown in the app. */
export const SAFETY = {
  workHours: 6,
  /** NIOSH: 1 cup (240 ml) every 15-20 minutes in moderate work in the heat. */
  waterLPerHour: [0.72, 0.96] as [number, number],
  campWaterL: 3,
  offroadKmH: 40,
  steepShareWarn: 15,
  coldC: 0,
  rainWarnMm: 50,
};

export function crewSafety(
  data: MissionData,
  sid: SiteId,
  month: number,
  heatLimit: number,
): SafetyRow[] {
  const site = data.sites[sid];
  const c = site.conditions;
  const tmax = c.monthly_tmax_c[month - 1] ?? null;
  const tmin = c.monthly_tmin_c[month - 1] ?? null;
  const [lo, hi] = SAFETY.waterLPerHour;
  const water = [lo, hi].map((v) => Math.round(v * SAFETY.workHours + SAFETY.campWaterL));
  const evacH = c.hub.distance_km / SAFETY.offroadKmH;
  const steep = site.metrics.steep_share;
  const rain = c.rain_mm_year ?? 0;
  return [
    {
      id: "heat",
      hazard: "Heat",
      value: tmax === null ? "no data" : `${tmax}°C average hottest days`,
      risk:
        tmax === null ? "warn" : tmax > heatLimit ? "fail" : tmax > heatLimit - 3 ? "warn" : "ok",
      advice:
        "Work early morning; build up time in the heat over 7 to 14 days; buddy system; shade for every break.",
      tag: "Measured",
      source: "nasa_power",
    },
    {
      id: "water",
      hazard: "Drinking water",
      value: `${water[0]}-${water[1]} L per person per day`,
      risk: "warn",
      advice: `About 1 cup every 15-20 minutes during ${SAFETY.workHours} h of work, plus ${SAFETY.campWaterL} L in camp. No water on site: bring it all.`,
      tag: "Reference",
      source: "niosh_heat",
    },
    {
      id: "cold",
      hazard: "Cold nights",
      value: tmin === null ? "no data" : `${tmin}°C average coldest nights`,
      risk: tmin === null ? "warn" : tmin < SAFETY.coldC ? "warn" : "ok",
      advice:
        "Winter sleeping bags and layers; cold mornings also slow batteries and stiffen seals.",
      tag: "Measured",
      source: "nasa_power",
    },
    {
      id: "steep",
      hazard: "Falls on steep ground",
      value: `${Math.round(steep)}% of the box steeper than 15°`,
      risk: steep > SAFETY.steepShareWarn ? "warn" : "ok",
      advice:
        steep > SAFETY.steepShareWarn
          ? "Helmets, ropes and boots on crater walls and cliffs; plan walking routes on the slope map."
          : "Mostly gentle ground: walking is easy; watch loose sand.",
      tag: "Measured",
      source: "cop_dem",
    },
    {
      id: "flood",
      hazard: "Flash floods in dry valleys",
      value: `${Math.round(rain)} mm of rain a year`,
      risk: rain > SAFETY.rainWarnMm ? "warn" : "ok",
      advice: "Rare, but sudden after storms: never camp in a wadi bed; check the forecast daily.",
      tag: "Judgement",
      source: "nasa_power",
    },
    {
      id: "help",
      hazard: "Distance to help",
      value: `${Math.round(c.hub.distance_km)} km (straight line) to ${c.hub.name}, ≈${evacH.toFixed(1)} h at ${SAFETY.offroadKmH} km/h`,
      risk: evacH > 2 ? "warn" : "ok",
      advice:
        "Satellite phone, first-aid kit with a trained member, two vehicles, and a local guide.",
      tag: "Judgement",
      source: "team",
    },
  ];
}
