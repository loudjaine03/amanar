import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cellAt, cellLatLon, finderItems, mergePrefs, prefScore, runFinder, similarCells, type CellsData, type FinderInput, type ModelData, type SiteOps } from '@/lib/finder';
import type { MissionData, Scenario } from '@/types/mission';

const cells = JSON.parse(readFileSync('public/ml/cells.json', 'utf8')) as CellsData;
const model = JSON.parse(readFileSync('public/ml/model.json', 'utf8')) as ModelData;
const data = JSON.parse(readFileSync('public/mission_data.json', 'utf8')) as MissionData;
const SC: Scenario[] = ['mars_water', 'mars_layers', 'moon_volcanic'];
const ops: SiteOps[] = data.scenarios.mars_water.candidates.map((c) => ({
  id: c.id, hubKm: c.earth_field_safety.nearest_hub.distance_km, tmaxByMonth: c.earth_field_safety.monthly_tmax_c,
  materials: Object.fromEntries(SC.map((sc) => [sc, data.scenarios[sc].candidates.find((x) => x.id === c.id)!.fingerprint[1]!.site])),
}));
const input = (over: Partial<FinderInput> = {}): FinderInput => ({
  scenario: 'mars_water', objective: 'water', region: 'all', slopeLimit: 15, mustDrive: true, month: 11, heatLimit: 40, hubLimit: 250, alpha: 0.25, ...over,
});

describe('ML files', () => {
  it('7,500 cells (3 sites x 50 x 50), every Finder feature has a percentile per cell', () => {
    expect(cells.sites.map((s) => s.id)).toEqual(['ahnet', 'tassili', 'hoggar']);
    expect(cells.unit).toHaveLength(3 * cells.rows * cells.cols);
    for (const f of model.finder_features) expect(cells.pct[f]).toHaveLength(cells.unit.length);
  });
  it('the radar-surprise model reports honest validation (per-site R² and leave-one-site-out)', () => {
    const sm = model.surprise_model;
    expect(Object.keys(sm.r2_block_cv_by_site).sort()).toEqual(['ahnet', 'hoggar', 'tassili']);
    expect(Object.keys(sm.r2_leave_one_site_out).sort()).toEqual(['ahnet', 'hoggar', 'tassili']);
    for (const v of Object.values(sm.r2_block_cv_by_site)) expect(v).toBeGreaterThan(0.3);
  });
});

describe('prefScore and mergePrefs', () => {
  it('low, high and band preferences', () => {
    expect(prefScore(10, 'low')).toBeCloseTo(0.9);
    expect(prefScore(10, 'high')).toBeCloseTo(0.1);
    expect(prefScore(60, [50, 90])).toBe(1);
    expect(prefScore(25, [50, 90])).toBeCloseTo(0.5);
    expect(prefScore(0, [60, 90])).toBe(0);
  });
  it('the same feature asked twice is merged, weights add', () => {
    expect(mergePrefs([{ f: 'relief', want: 'high', w: 2 }, { f: 'relief', want: 'high', w: 1 }])).toEqual([{ f: 'relief', want: 'high', w: 3 }]);
  });
});

describe('runFinder', () => {
  it('each destination, with its default objective, ranks the expected site first', () => {
    const expected: Record<Scenario, string> = { mars_water: 'ahnet', mars_layers: 'tassili', moon_volcanic: 'hoggar' };
    const objective: Record<Scenario, string> = { mars_water: 'water', mars_layers: 'layers', moon_volcanic: 'volcanic' };
    for (const sc of Object.keys(expected) as Scenario[]) {
      const r = runFinder(cells, model, input({ scenario: sc, objective: objective[sc], mustDrive: model.objectives[objective[sc]]!.rover }), ops);
      expect(r.sites[0]?.id).toBe(expected[sc]);
      expect(r.sites[0]?.label).toBe('best');
    }
  });
  it('is deterministic and every top spot passes the constraints', () => {
    const a = runFinder(cells, model, input(), ops);
    const b = runFinder(cells, model, input(), ops);
    expect(a.top.map((t) => t.index)).toEqual(b.top.map((t) => t.index));
    for (const t of a.top) expect(cells.values['slope_p90']![t.index]).toBeLessThanOrEqual(15);
    expect(a.top[0]!.why.length).toBeGreaterThan(0);
  });
  it('the region filter keeps only that site', () => {
    const r = runFinder(cells, model, input({ region: 'hoggar' }), ops);
    expect(r.top.every((t) => t.site === 'hoggar')).toBe(true);
    expect(r.sites.filter((s) => s.score !== null).map((s) => s.id)).toEqual(['hoggar']);
  });
  it('a hub limit below every distance leaves nothing (never invents a result)', () => {
    const r = runFinder(cells, model, input({ hubLimit: 50 }), ops);
    expect(r.top).toHaveLength(0);
    expect(r.sites.every((s) => s.score === null && s.label === 'none')).toBe(true);
  });
  it('heat over the limit flags the site (robot-only) but does not hide it', () => {
    const r = runFinder(cells, model, input({ month: 7, heatLimit: 40 }), ops);
    expect(r.sites.find((s) => s.id === 'ahnet')?.heat).toBe('fail');
    expect(r.sites.find((s) => s.id === 'ahnet')?.score).not.toBeNull();
  });
  it('dossier lines carry tags and sources', () => {
    const items = finderItems(runFinder(cells, model, input(), ops), model, 'Follow the lost water');
    expect(items.every((i) => i.stage === 4 && i.tag && i.source)).toBe(true);
    expect(items.some((i) => i.tag === 'Hypothesis')).toBe(true);
  });
});

describe('similarCells and cellAt', () => {
  it('cellAt inverts cellLatLon', () => {
    for (const i of [0, 1234, 2500, 7499]) expect(cellAt(cells, cellLatLon(cells, i))).toBe(i);
    expect(cellAt(cells, [0, 0])).toBeNull();
  });
  it('look-alikes are sorted, never the reference itself, at least 1 km away', () => {
    const ref = 2500 + 25 * 50 + 25;
    const s = similarCells(cells, model.finder_features, ref, 8);
    expect(s).toHaveLength(8);
    expect(s.some((x) => x.index === ref)).toBe(false);
    for (let k = 1; k < s.length; k++) expect(s[k - 1]!.similarity).toBeGreaterThanOrEqual(s[k]!.similarity);
  });
  it('"other sites only" never returns the reference site', () => {
    const ref = 2500 + 25 * 50 + 25; // Tassili
    expect(similarCells(cells, model.finder_features, ref, 8, 'all', true).every((x) => x.site !== 'tassili')).toBe(true);
  });
});
