import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CURIOSITY, earthTestMassKg, envRows, groundPressureKPa, habitatLoad, hardwareItems, isaPressureKPa, MATERIALS, siteEnv, TARGET_ENV } from '@/lib/hardware';
import type { MissionData } from '@/types/mission';

const data = JSON.parse(readFileSync('public/mission_data.json', 'utf8')) as MissionData;
const hoggar = data.scenarios.moon_volcanic.candidates.find((c) => c.id === 'hoggar')!;
const ids = new Set(data.meta.sources.map((s) => s.id));

describe('pressure physics', () => {
  it('standard atmosphere: 101.3 kPa at sea level, about 77-78 kPa at 2,200 m', () => {
    expect(isaPressureKPa(0)).toBeCloseTo(101.325, 2);
    expect(isaPressureKPa(2197)).toBeGreaterThan(77);
    expect(isaPressureKPa(2197)).toBeLessThan(78.5);
  });
  it('a 900 kg rover on Mars presses like a 342 kg rover on Earth (JPL Scarecrow: about 340 kg)', () => {
    expect(Math.round(earthTestMassKg(900, 'mars'))).toBe(342);
    expect(groundPressureKPa(CURIOSITY, 3.73)).toBeCloseTo(groundPressureKPa({ ...CURIOSITY, massKg: earthTestMassKg(900, 'mars') }, 9.81), 6);
  });
  it('habitat load: 1 kPa on 1 m² = 1 kN; proof pressure reproduces the target load', () => {
    const h = habitatLoad(101.3, TARGET_ENV.mars.pressureKPa, 77.6);
    expect(h.forceTargetKN).toBeCloseTo(100.7, 1);
    expect(h.forceSiteKN).toBeCloseTo(23.7, 1);
    expect(h.proofInsideKPa - 77.6).toBeCloseTo(h.dpTargetKPa, 1);
    expect(h.share).toBeLessThan(0.25);
  });
});

describe('environment gap and materials', () => {
  it('reads elevation, air pressure, temperatures and roughness from the pipeline output', () => {
    const e = siteEnv(hoggar);
    expect(e.elevationM).toBeGreaterThan(2000);
    expect(e.pressureKPa).toBeCloseTo(isaPressureKPa(e.elevationM!), 0);
    expect(e.tMin).toBeLessThan(e.tMax!);
    expect(e.roughnessM).toBeGreaterThan(0);
  });
  it('low pressure is never testable in the field; wheel damage only on rough ground', () => {
    const ahnet = data.scenarios.mars_water.candidates.find((c) => c.id === 'ahnet')!;
    for (const body of ['mars', 'moon'] as const) {
      const rows = envRows(body, siteEnv(hoggar));
      expect(rows.find((r) => r.key === 'pressure')?.verdict).toBe('lab');
      expect(rows.find((r) => r.key === 'rock')?.verdict).toBe('field');
    }
    const smooth = envRows('mars', siteEnv(ahnet), { name: hoggar.name, roughnessM: siteEnv(hoggar).roughnessM }).find((r) => r.key === 'rock')!;
    expect(smooth.verdict).toBe('field_lab');
    expect(smooth.how).toContain('Hoggar');
  });
  it('every material and environment row cites a source that exists', () => {
    for (const m of MATERIALS) expect(ids.has(m.source)).toBe(true);
    for (const r of envRows('mars', siteEnv(hoggar))) expect(ids.has(r.source)).toBe(true);
  });
  it('dossier lines (stage 5) carry tags and sources', () => {
    const items = hardwareItems({ body: 'moon', site: siteEnv(hoggar), rover: CURIOSITY, insideKPa: 101.3 });
    expect(items.length).toBeGreaterThan(10);
    expect(items.every((i) => i.stage === 5 && i.tag && ids.has(i.source))).toBe(true);
  });
});
