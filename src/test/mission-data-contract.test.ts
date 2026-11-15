import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseGrid } from '@/lib/stage3';
import { SCENARIOS, TAGS, type MissionData } from '@/types/mission';

const data = JSON.parse(readFileSync('public/mission_data.json', 'utf8')) as MissionData;
const pub = (url: string) => `public${url}`;

describe('public/mission_data.json (made by pipeline/build_all.py) follows the contract', () => {
  it('has meta.mock, sources and the four tag definitions', () => {
    expect(typeof data.meta.mock).toBe('boolean');
    expect(data.meta.sources.length).toBeGreaterThan(5);
    for (const t of TAGS) expect(data.meta.tags?.[t]).toBeTruthy();
  });
  it('has the three scenarios, each with the three sites in order', () => {
    expect(Object.keys(data.scenarios).sort()).toEqual([...SCENARIOS].sort());
    for (const sc of SCENARIOS) expect(data.scenarios[sc].candidates.map((c) => c.id)).toEqual(['ahnet', 'tassili', 'hoggar']);
  });
  it('every source id used somewhere exists in meta.sources', () => {
    const ids = new Set(data.meta.sources.map((s) => s.id));
    const used = JSON.stringify(data).match(/"source":\s*"([a-z0-9_]+)"/g) ?? [];
    for (const u of used) expect(ids.has(u.split('"')[3] as string)).toBe(true);
  });
  it('bounds are [[south, west], [north, east]] and identical across scenarios', () => {
    for (const sc of SCENARIOS)
      for (const c of data.scenarios[sc].candidates) {
        expect(c.bounds[0][0]).toBeLessThan(c.bounds[1][0]);
        expect(c.bounds[0][1]).toBeLessThan(c.bounds[1][1]);
        expect(c.bounds).toEqual(data.scenarios.mars_water.candidates.find((x) => x.id === c.id)?.bounds);
      }
  });
  it('6 fingerprint axes, target 3, terrain and materials weighted x2, 12 monthly temperatures', () => {
    for (const sc of SCENARIOS)
      for (const c of data.scenarios[sc].candidates) {
        expect(c.fingerprint).toHaveLength(6);
        expect(c.fingerprint.every((a) => a.target === 3)).toBe(true);
        expect(c.fingerprint.slice(0, 2).every((a) => a.weight === 2)).toBe(true);
        expect(c.earth_field_safety.monthly_tmax_c).toHaveLength(12);
      }
  });
  it('"where it breaks" names gravity, atmosphere, radiation and the instrument gap', () => {
    for (const sc of SCENARIOS)
      for (const c of data.scenarios[sc].candidates) {
        const all = c.breaks.map((b) => b.text).join(' ');
        for (const word of ['gravity', 'atmosphere', 'radiation', 'Instrument gap']) expect(all).toContain(word);
      }
  });
  it('every tag is one of the four', () => {
    for (const sc of SCENARIOS)
      for (const c of data.scenarios[sc].candidates)
        for (const x of [...c.transfers, ...c.breaks, ...c.metrics, ...c.fingerprint, ...c.anomalies]) expect(TAGS).toContain(x.tag);
  });
  it('real data: when mock is false, no metric or score is missing', () => {
    if (data.meta.mock) return;
    for (const sc of SCENARIOS)
      for (const c of data.scenarios[sc].candidates) {
        expect(c.metrics.every((m) => m.value !== null)).toBe(true);
        expect(c.fingerprint.every((a) => a.site !== null)).toBe(true);
        expect(c.verdict).not.toBeNull();
      }
  });
  it('waypoints are Hypotheses with an instrument, and each rover grid exists and matches the site box', () => {
    for (const sc of SCENARIOS)
      for (const c of data.scenarios[sc].candidates) {
        const r = c.rover!;
        expect(r.waypoints.map((w) => w.id)).toEqual(['WP-01', 'WP-02', 'WP-03']);
        expect(r.waypoints.every((w) => w.tag === 'Hypothesis' && w.tool.length > 0)).toBe(true);
        const grid = parseGrid(JSON.parse(readFileSync(pub(r.grid), 'utf8')));
        expect(grid).not.toBeNull();
        expect(grid!.bounds).toEqual(c.bounds);
      }
  });
  it('every overlay PNG listed in layers exists on disk', () => {
    for (const c of data.scenarios.mars_water.candidates)
      for (const url of Object.values(c.layers)) expect(existsSync(pub(url as string))).toBe(true);
  });
});
