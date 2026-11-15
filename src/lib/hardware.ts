// Hardware lab: which materials and sensors a mission needs, and what our Sahara sites can (and cannot) test.
// Target values come from cited sources (Reference). Site values come from our pipeline (Measured).
// Every calculation is a plain formula, shown in the app.
import type { Candidate, DossierItem, Tag } from '@/types/mission';

export type Body = 'mars' | 'moon';
export type TestHere = 'field' | 'field_lab' | 'lab';

export const G_EARTH = 9.81;
/** Surface gravity, m/s² (NASA NSSDC fact sheets). */
export const GRAVITY: Record<Body, number> = { mars: 3.73, moon: 1.62 };

/** Target environment (NASA NSSDC fact sheets). Pressure in kPa, temperatures in °C. */
export const TARGET_ENV: Record<Body, { pressureKPa: number; pressureText: string; tMin: number; tMax: number; tempText: string; source: string }> = {
  mars: {
    pressureKPa: 0.636,
    pressureText: '0.64 kPa on average (0.40 to 0.87 kPa with the seasons)',
    tMin: -89,
    tMax: -31,
    tempText: '-89 to -31 °C in one day (Viking 1 site)',
    source: 'nssdc_mars',
  },
  moon: {
    pressureKPa: 3e-13,
    pressureText: 'about 3 × 10⁻¹³ kPa at night: a vacuum',
    tMin: -178,
    tMax: 117,
    tempText: '-178 to +117 °C at the equator',
    source: 'nssdc_moon',
  },
};

/** Air pressure from elevation, standard atmosphere (kPa). An estimate: weather moves it by a few kPa. */
export function isaPressureKPa(elevationM: number): number {
  return 101.325 * Math.pow(1 - 2.25577e-5 * elevationM, 5.25588);
}

const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/* ------------------------------- wheels and ground pressure ------------------------------- */

export interface RoverSpec {
  massKg: number;
  wheels: number;
  wheelWidthM: number;
  /** Length of the wheel's footprint on the ground. A team assumption: it depends on how much the wheel sinks. */
  contactLengthM: number;
}
/** Curiosity: about 900 kg (JPL), six wheels 40 cm wide (JPL). Contact length is our assumption. */
export const CURIOSITY: RoverSpec = { massKg: 900, wheels: 6, wheelWidthM: 0.4, contactLengthM: 0.1 };

/** Pressure under one wheel (kPa) for a rover on a body with gravity g. */
export function groundPressureKPa(r: RoverSpec, g: number): number {
  const area = r.wheels * r.wheelWidthM * r.contactLengthM;
  return area > 0 ? (r.massKg * g) / area / 1000 : 0;
}
/** Mass of an Earth test rover that presses the ground as hard as the real rover does on the target
 *  (the method JPL used with its lighter "Scarecrow" rover). */
export function earthTestMassKg(massKg: number, body: Body): number {
  return (massKg * GRAVITY[body]) / G_EARTH;
}

/* ----------------------------------- habitat pressure ----------------------------------- */

export interface HabitatLoad {
  dpTargetKPa: number;
  dpSiteKPa: number;
  /** Force on a 1 m² hatch, kN (1 kPa on 1 m² = 1 kN). */
  forceTargetKN: number;
  forceSiteKN: number;
  /** Share of the target load the site reproduces with the same inside pressure. */
  share: number;
  /** Inside pressure needed at the site to reproduce the target wall load (uncrewed proof test). */
  proofInsideKPa: number;
}
export function habitatLoad(insideKPa: number, targetKPa: number, siteKPa: number): HabitatLoad {
  const dpT = insideKPa - targetKPa;
  const dpS = insideKPa - siteKPa;
  return {
    dpTargetKPa: round(dpT),
    dpSiteKPa: round(dpS),
    forceTargetKN: round(dpT),
    forceSiteKN: round(dpS),
    share: dpT > 0 ? Math.max(0, dpS / dpT) : 0,
    proofInsideKPa: round(siteKPa + dpT),
  };
}

/* ------------------------------------ environment gap ------------------------------------ */

export interface SiteEnv {
  name: string;
  elevationM: number | null;
  pressureKPa: number | null;
  tMin: number | null; // coldest monthly minimum (NASA POWER)
  tMax: number | null; // hottest monthly maximum (NASA POWER)
  roughnessM: number | null;
}
export function siteEnv(c: Candidate): SiteEnv {
  const f = c.earth_field_safety;
  const nums = (a: (number | null)[] | undefined) => (a ?? []).filter((v): v is number => typeof v === 'number');
  const tmin = nums(f.monthly_tmin_c);
  const tmax = nums(f.monthly_tmax_c);
  const elev = f.elevation_m ?? c.metrics.find((m) => m.key === 'elevation')?.value ?? null;
  return {
    name: c.name,
    elevationM: elev,
    pressureKPa: f.air_pressure_kpa ?? (elev === null ? null : round(isaPressureKPa(elev))),
    tMin: tmin.length ? Math.min(...tmin) : null,
    tMax: tmax.length ? Math.max(...tmax) : null,
    roughnessM: c.metrics.find((m) => m.key === 'roughness')?.value ?? null,
  };
}

export interface EnvRow {
  key: 'temperature' | 'pressure' | 'gravity' | 'dust' | 'rock';
  label: string;
  target: string;
  site: string;
  verdict: TestHere;
  how: string;
  tag: Tag;
  source: string;
}

/** The five things hardware must survive, target vs site, and whether the site can test them. */
/** Below this terrain roughness a box is too smooth for meaningful wheel-damage tests (team assumption). */
export const ROUGH_MIN_M = 2;

export function envRows(body: Body, s: SiteEnv, roughest?: { name: string; roughnessM: number | null }): EnvRow[] {
  const smooth = s.roughnessM !== null && s.roughnessM < ROUGH_MIN_M;
  const elsewhere = roughest && roughest.name !== s.name ? ` Run wheel tests at ${roughest.name} (roughness ${roughest.roughnessM} m) instead.` : '';
  const t = TARGET_ENV[body];
  const ratio = s.pressureKPa !== null ? s.pressureKPa / t.pressureKPa : null;
  const moon = body === 'moon';
  return [
    {
      key: 'temperature',
      label: 'Temperature',
      target: t.tempText,
      site: s.tMin === null || s.tMax === null ? 'TBD' : `${s.tMin} to ${s.tMax} °C over the year (monthly extremes)`,
      verdict: 'field_lab',
      how: moon
        ? 'Heat and daily cycling can be tested here; the lunar night cold needs a thermal chamber.'
        : 'Heat and daily cycling can be tested here; Martian night cold needs a thermal chamber.',
      tag: 'Measured',
      source: 'nasa_power',
    },
    {
      key: 'pressure',
      label: 'Air pressure',
      target: t.pressureText,
      site:
        s.pressureKPa === null
          ? 'TBD'
          : `${s.pressureKPa} kPa at ${s.elevationM} m${moon ? '' : ratio ? `, ${Math.round(ratio)} times Mars` : ''}`,
      verdict: 'lab',
      how: 'No place on Earth’s surface has this. Low pressure or vacuum needs a chamber; the site can still test how a pressurised habitat or suit behaves in heat, dust and wind.',
      tag: 'Interpreted',
      source: 'isa',
    },
    {
      key: 'gravity',
      label: 'Gravity',
      target: moon ? '1.62 m/s² (0.17 g)' : '3.73 m/s² (0.38 g)',
      site: '9.81 m/s² (1 g)',
      verdict: 'field_lab',
      how: 'Use a lighter test rover so its wheels press the ground as hard as on the target (see Pressure). Human movement in low gravity cannot be reproduced here.',
      tag: 'Reference',
      source: moon ? 'nssdc_moon' : 'nssdc_mars',
    },
    {
      key: 'dust',
      label: 'Dust and sand',
      target: moon ? 'Sharp, electrostatic regolith that scratched visors and made suit seals leak in Apollo' : 'Fine dust that settles on solar panels (it ended InSight)',
      site: 'Wind-blown quartz sand and dust',
      verdict: moon ? 'field_lab' : 'field',
      how: moon
        ? 'Sand-blasting and dust ingress can be tested here, but Earth grains are rounded by wind and water; lunar grains stay sharp, so use a simulant in the lab too.'
        : 'Dust deposition, cleaning and sand abrasion can be tested here, in real wind.',
      tag: 'Reference',
      source: moon ? 'lunar_dust' : 'insight_dust',
    },
    {
      key: 'rock',
      label: 'Rough, rocky ground',
      target: moon ? 'Blocky lava flows and boulders around the domes' : 'Sharp embedded rocks punched holes in Curiosity’s aluminium wheels',
      site: s.roughnessM === null ? 'TBD' : `terrain roughness ${s.roughnessM} m (125 m window)`,
      verdict: smooth ? 'field_lab' : 'field',
      how: smooth
        ? `This box is smooth (under ${ROUGH_MIN_M} m of roughness), good for traction and navigation but not for wheel damage.${elsewhere}`
        : 'Wheel wear and puncture tests belong on rough ground like this. Whether the rocks are sharp has to be checked on site.',
      tag: moon ? 'Reference' : 'Reference',
      source: moon ? 'lroc_marius' : 'msl_wheels',
    },
  ];
}

/* --------------------------------------- materials --------------------------------------- */

export interface MaterialItem {
  id: string;
  component: string;
  options: string;
  threat: Record<Body, string>;
  here: string;
  lab: Record<Body, string>;
  verdict: Record<Body, TestHere>;
  tag: Tag;
  source: string;
}

export const MATERIALS: MaterialItem[] = [
  {
    id: 'wheels',
    component: 'Wheels',
    options: 'Milled aluminium (like Curiosity) vs nickel-titanium shape-memory mesh tyre (NASA Glenn)',
    threat: {
      mars: 'Sharp embedded rocks: Curiosity’s thin aluminium skin got dents, holes and tears.',
      moon: 'Abrasive regolith and blocky rock; no repair possible.',
    },
    here: 'Drive both wheel types over the roughest ground and loose sand, count punctures and measure traction.',
    lab: { mars: 'Cold-temperature behaviour of the alloy.', moon: 'Cold and vacuum behaviour of the alloy.' },
    verdict: { mars: 'field', moon: 'field_lab' },
    tag: 'Reference',
    source: 'glenn_tire',
  },
  {
    id: 'structure',
    component: 'Chassis and structure',
    options: 'Aluminium alloy, titanium alloy, carbon-fibre composite',
    threat: { mars: 'Daily thermal cycling fatigues joints and bonded parts.', moon: 'Swings of nearly 300 °C between day and night.' },
    here: 'Months of daily heat cycles plus vibration on rough tracks: check joints, bolts and bonds.',
    lab: { mars: 'Full Martian temperature range.', moon: 'Full lunar temperature range in vacuum.' },
    verdict: { mars: 'field_lab', moon: 'field_lab' },
    tag: 'Interpreted',
    source: 'team',
  },
  {
    id: 'seals',
    component: 'Seals, gaskets and suit joints',
    options: 'Silicone or fluorocarbon elastomers, metal seals, dust covers',
    threat: { mars: 'Fine dust in the joints, stiffening in the cold.', moon: 'Apollo: abrasive dust caused suit pressure-seal leaks.' },
    here: 'Open and close seals hundreds of times in wind-blown dust; measure leaks with a pressure sensor.',
    lab: { mars: 'Cold and low pressure.', moon: 'Vacuum and lunar dust simulant.' },
    verdict: { mars: 'field_lab', moon: 'field_lab' },
    tag: 'Reference',
    source: 'lunar_dust',
  },
  {
    id: 'solar',
    component: 'Solar panels, windows and camera optics',
    options: 'Cover glass with anti-dust coating, active cleaning (vibration, electrostatic)',
    threat: { mars: 'Dust build-up cut InSight’s power until the mission ended.', moon: 'Clinging, scratching dust on lenses and panels.' },
    here: 'Measure power loss from dust day by day and compare cleaning methods, in real desert wind.',
    lab: { mars: 'Nothing essential: the field test is the main one.', moon: 'Electrostatic dust in vacuum.' },
    verdict: { mars: 'field', moon: 'field_lab' },
    tag: 'Reference',
    source: 'insight_dust',
  },
  {
    id: 'thermal',
    component: 'Thermal blankets and films',
    options: 'Polyimide film, multilayer insulation, white or reflective coatings',
    threat: { mars: 'UV and abrasion of the outer layer; insulation works worse with gas around it.', moon: 'UV, micrometeorites and abrasion.' },
    here: 'Outer-layer wear from sun, sand and wind; colour and reflectivity change over weeks.',
    lab: { mars: 'Insulation performance at Martian pressure.', moon: 'Insulation performance in vacuum.' },
    verdict: { mars: 'field_lab', moon: 'field_lab' },
    tag: 'Interpreted',
    source: 'team',
  },
  {
    id: 'mechanisms',
    component: 'Bearings, motors and lubricants',
    options: 'Dry lubricant (molybdenum disulfide) vs liquid grease, sealed bearings',
    threat: { mars: 'Dust gets into moving parts; grease thickens in the cold.', moon: 'Apollo dust clogged mechanisms; liquids evaporate in vacuum.' },
    here: 'Long drives in dust: track motor current and temperature as a sign of wear.',
    lab: { mars: 'Cold start of the motors.', moon: 'Vacuum and cold.' },
    verdict: { mars: 'field_lab', moon: 'field_lab' },
    tag: 'Interpreted',
    source: 'team',
  },
  {
    id: 'habitat',
    component: 'Habitat shell and pressure structure',
    options: 'Rigid aluminium module or inflatable layered fabric (high-strength fibres)',
    threat: { mars: 'About 100 kPa inside against 0.6 kPa outside: every square metre carries about 10 tonnes.', moon: 'Full inside pressure against vacuum.' },
    here: 'UV, sand, wind and heat on the outer layers; an uncrewed over-pressure test can reproduce the wall load (see Pressure).',
    lab: { mars: 'Leak rate at low outside pressure.', moon: 'Leak rate in vacuum.' },
    verdict: { mars: 'field_lab', moon: 'field_lab' },
    tag: 'Interpreted',
    source: 'team',
  },
];

/* ----------------------------------------- sensors ---------------------------------------- */

export interface SensorItem {
  id: string;
  sensor: string;
  measures: string;
  why: string;
}
export const SENSORS: SensorItem[] = [
  { id: 'wheel_load', sensor: 'Load cells on each wheel', measures: 'force on each wheel (N), so ground pressure', why: 'Checks the test rover really presses the ground as hard as on the target.' },
  { id: 'penetrometer', sensor: 'Cone penetrometer', measures: 'how strong the ground is (kPa) at each waypoint', why: 'If ground pressure is higher than ground strength, the wheels sink.' },
  { id: 'barometer', sensor: 'Barometer and temperature logger', measures: 'air pressure (kPa) and temperature (°C) every minute', why: 'Logs the real test environment, so results can be compared with the target.' },
  { id: 'habitat_p', sensor: 'Pressure transducer in the habitat or suit test volume', measures: 'inside pressure over time (kPa)', why: 'A falling pressure means a leak: seals and joints are failing.' },
  { id: 'dust', sensor: 'Dust sensor on a solar panel', measures: 'power lost to dust per day (%)', why: 'The failure that ended InSight, measured before launch.' },
];

/* ----------------------------------------- dossier ---------------------------------------- */

const VERDICT_TEXT: Record<TestHere, string> = { field: 'Test here', field_lab: 'Test here + in a lab', lab: 'Lab only' };
export const verdictText = (v: TestHere) => VERDICT_TEXT[v];

export function hardwareItems(input: {
  body: Body;
  site: SiteEnv;
  rover: RoverSpec;
  insideKPa: number;
  roughest?: { name: string; roughnessM: number | null };
}): DossierItem[] {
  const { body, site, rover } = input;
  const items: DossierItem[] = [];
  for (const r of envRows(body, site, input.roughest))
    items.push({ id: `s5-env-${r.key}`, stage: 5, title: `${r.label}: ${verdictText(r.verdict)}`, value: `Target: ${r.target}. ${site.name}: ${r.site}. ${r.how}`, tag: r.tag, source: r.source });
  for (const m of MATERIALS)
    items.push({ id: `s5-mat-${m.id}`, stage: 5, title: `${m.component}: ${verdictText(m.verdict[body])}`, value: `${m.options}. Threat: ${m.threat[body]} Here: ${m.here} Lab: ${m.lab[body]}`, tag: m.tag, source: m.source });
  const testMass = earthTestMassKg(rover.massKg, body);
  items.push({
    id: 's5-wheel',
    stage: 5,
    title: 'Ground pressure (gravity offload)',
    value: `${rover.massKg} kg rover, ${rover.wheels} wheels ${rover.wheelWidthM * 100} cm wide, ${rover.contactLengthM * 100} cm footprint (assumption): ${round(groundPressureKPa(rover, GRAVITY[body]))} kPa on the target. An Earth test rover of ${Math.round(testMass)} kg gives the same pressure.`,
    tag: 'Interpreted',
    source: 'scarecrow',
  });
  if (site.pressureKPa !== null) {
    const h = habitatLoad(input.insideKPa, TARGET_ENV[body].pressureKPa, site.pressureKPa);
    items.push({
      id: 's5-habitat',
      stage: 5,
      title: 'Habitat wall load',
      value: `Inside ${input.insideKPa} kPa: ${h.forceTargetKN} kN per m² on the target, ${h.forceSiteKN} kN at ${site.name}. Uncrewed proof test at ${h.proofInsideKPa} kPa inside reproduces the target load.`,
      tag: 'Interpreted',
      source: 'isa',
    });
  }
  items.push({ id: 's5-sensors', stage: 5, title: 'Sensor kit', value: SENSORS.map((s) => s.sensor).join('; '), tag: 'Hypothesis', source: 'team' });
  return items;
}
