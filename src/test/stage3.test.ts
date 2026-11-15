import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeFieldAccess } from '@/lib/api';
import { fmtClock, MARS_DELAY_MIN, monthRanges, parseGrid, planRoute, slopeAt, stage3Items, workableMonths, type GridFile } from '@/lib/stage3';
import type { Candidate, MissionData } from '@/types/mission';

const data = JSON.parse(readFileSync('public/mission_data.json', 'utf8')) as MissionData;
const ahnet = data.scenarios.mars_water.candidates[0] as Candidate;
const rover = ahnet.rover!;
const grid = parseGrid(JSON.parse(readFileSync('public/grids/ahnet_slope.json', 'utf8'))) as GridFile;
const wps = rover.waypoints.map((w) => w.coords);

describe('grille de pente (contrat)', () => {
  it('le fichier fourni respecte le contrat 160x160', () => {
    expect(grid).not.toBeNull();
    expect(grid.cols * grid.rows).toBe(grid.slope.length);
    expect(grid.bounds).toEqual(ahnet.bounds);
  });
  it('parseGrid refuse un JSON invalide sans planter', () => {
    expect(parseGrid(null)).toBeNull();
    expect(parseGrid({ cols: 2, rows: 2, bounds: [[0, 0], [1, 1]], slope: [1, 2, 3] })).toBeNull();
    expect(parseGrid({ cols: 2, rows: 2, bounds: [[0, 0], [1, 1]], slope: [1, 2, 3, 'x'] })).toBeNull();
  });
});

describe('planRoute', () => {
  it('route par défaut : départ > WP-01 > WP-02 > WP-03, longueur en km, pente max sous la limite', () => {
    const p = planRoute(grid, 15, rover.landing, wps);
    expect(p.ok).toBe(true);
    expect(p.wpIndex).toHaveLength(3);
    expect(p.km).toBeGreaterThan(10); // diagonale d'environ 20 km : jamais un nombre de cases
    expect(p.km).toBeLessThan(60);
    expect(p.maxSlopeDeg).toBeLessThanOrEqual(15);
    expect(p.points).toHaveLength(p.cells.length);
  });
  it('limite trop basse : pas de route, avec le numéro du tronçon qui échoue', () => {
    const p = planRoute(grid, 3, rover.landing, wps);
    expect(p.ok).toBe(false);
    expect(p.failedLeg).not.toBeNull();
    expect(p.km).toBe(0);
  });
  it('baisser la limite ne raccourcit jamais la route (elle contourne ou échoue)', () => {
    const a = planRoute(grid, 25, rover.landing, wps);
    const b = planRoute(grid, 15, rover.landing, wps);
    expect(a.ok && b.ok).toBe(true);
    expect(b.km).toBeGreaterThanOrEqual(a.km - 1e-6);
  });
  it('slopeAt lit la pente sous un point', () => {
    expect(slopeAt(grid, rover.landing)).toBeLessThan(15);
  });
});

describe('délai Mars et heure simulée', () => {
  it('le délai est d’environ 11 minutes', () => expect(MARS_DELAY_MIN).toBe(11));
  it('fmtClock ajoute les minutes simulées', () => {
    const t0 = new Date(2026, 10, 14, 10, 2);
    expect(fmtClock(t0, 0)).toBe('10:02');
    expect(fmtClock(t0, MARS_DELAY_MIN)).toBe('10:13');
  });
});

describe('stage3Items (dossier)', () => {
  const plan = planRoute(grid, 15, rover.landing, wps);
  const mk = (tmax: number | null) =>
    stage3Items({
      site: ahnet, plan, slopeLimit: 15, heatLimit: 40, month: 11, monthName: 'November', tmaxC: tmax, marsMode: true,
      access: computeFieldAccess({ maxSlopeDeg: plan.maxSlopeDeg, slopeLimitDeg: 15, tmaxC: tmax, heatLimitC: 40, hubKm: ahnet.earth_field_safety.nearest_hub.distance_km, hubLimitKm: 250 }),
    });
  it('route, pente max, limite, 3 waypoints, accès et hypothèses : tag et source partout', () => {
    const items = mk(31);
    expect(items.every((i) => i.stage === 3 && i.tag && i.source)).toBe(true);
    expect(items.filter((i) => i.id.startsWith('s3-wp-'))).toHaveLength(3);
    expect(items.find((i) => i.id === 's3-slope-limit')?.value).toContain('15');
    expect(items.find((i) => i.id === 's3-access')?.value).toBe('Meets our planning assumptions');
  });
  it('température inconnue (null) : verdict TBD, jamais « meets »', () => {
    expect(mk(null).find((i) => i.id === 's3-access')?.value).toBe('Not computed yet (TBD)');
  });
  it('trop chaud : hors de nos hypothèses', () => {
    expect(mk(45).find((i) => i.id === 's3-access')?.value).toMatch(/^Outside our assumptions/);
  });
});

describe('crew safety', () => {
  const EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  it('Ahnet is workable only November to February at a 40 °C heat limit', () => {
    const w = workableMonths(ahnet.earth_field_safety.monthly_tmax_c, 40);
    expect(w).toEqual([1, 2, 11, 12]);
    expect(monthRanges(w, EN)).toBe('November to February');
  });
  it('Hoggar is workable all year; an unknown month is never counted as workable', () => {
    const hoggar = data.scenarios.mars_water.candidates.find((c) => c.id === 'hoggar')!;
    expect(monthRanges(workableMonths(hoggar.earth_field_safety.monthly_tmax_c, 40), EN)).toBe('all year');
    expect(workableMonths([null, 30, null], 40)).toEqual([2]);
    expect(monthRanges([], EN)).toBe('none');
    expect(monthRanges([3, 4, 5, 9], EN)).toBe('March to May, September');
  });
  it('the dossier gets night cold, workable months and the crew checklist', () => {
    const plan = planRoute(grid, 15, rover.landing, wps);
    const access = computeFieldAccess({ maxSlopeDeg: plan.maxSlopeDeg, slopeLimitDeg: 15, tmaxC: 33, heatLimitC: 40, hubKm: 112, hubLimitKm: 250 });
    const items = stage3Items({ site: ahnet, plan, slopeLimit: 15, heatLimit: 40, month: 12, monthName: 'December', tmaxC: 33, access, marsMode: true, tminC: 0.5, workable: 'November to February' });
    expect(items.find((i) => i.id === 's3-crew-months')?.value).toBe('November to February');
    expect(items.find((i) => i.id === 's3-crew-checklist')?.tag).toBe('Hypothesis');
    expect(items.find((i) => i.id === 's3-crew-cold')?.value).not.toContain('freezing');
  });
});
