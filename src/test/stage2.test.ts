import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeVerdicts, radarData, siteScore, stage2Items } from '@/lib/match';
import { useMissionStore } from '@/lib/mission-store';
import type { Candidate, MissionData } from '@/types/mission';

const data = JSON.parse(readFileSync('public/mission_data.json', 'utf8')) as MissionData;
const real = data.scenarios.mars_water.candidates;
/** Same sites with every score emptied (what the app sees before the pipeline has run). */
const base: Candidate[] = real.map((c) => ({
  ...c,
  verdict: null,
  fingerprint: c.fingerprint.map((f) => ({ ...f, site: null })),
  metrics: c.metrics.map((m) => ({ ...m, value: null })),
}));
const scored = (scores: number[]): Candidate[] =>
  base.map((c, i) => ({ ...c, fingerprint: c.fingerprint.map((f) => ({ ...f, site: scores[i] as number })) }));

describe('verdicts calculés depuis les scores', () => {
  it('scores null : aucun badge (jamais inventé)', () => {
    const v = computeVerdicts(base);
    expect(Object.values(v).every((x) => x.verdict === null)).toBe(true);
  });
  it('le total le plus haut = STRONGEST, ≥ 50 % = PARTIAL, sinon WEAK', () => {
    const v = computeVerdicts(scored([3, 2, 1])); // totaux pondérés 24, 16, 8 sur 24
    expect(v['ahnet']?.verdict).toBe('STRONGEST');
    expect(v['tassili']?.verdict).toBe('PARTIAL');
    expect(v['hoggar']?.verdict).toBe('WEAK');
  });
  it('égalité en tête : les deux sont STRONGEST', () => {
    const v = computeVerdicts(scored([2, 2, 0]));
    expect(v['ahnet']?.verdict).toBe('STRONGEST');
    expect(v['tassili']?.verdict).toBe('STRONGEST');
    expect(v['hoggar']?.verdict).toBe('WEAK');
  });
  it('un seul site non noté : personne n’a de badge', () => {
    const c = scored([3, 2, 1]);
    c[2] = base[2] as Candidate;
    expect(Object.values(computeVerdicts(c)).every((x) => x.verdict === null)).toBe(true);
  });
  it('siteScore : total null tant qu’un axe est null ; terrain et matériaux comptent double (max = 24)', () => {
    expect(siteScore(base[0] as Candidate)).toEqual({ total: null, max: 24 });
    expect(siteScore(scored([2, 2, 2])[0] as Candidate).total).toBe(16);
  });
  it('les badges calculés par l’app = ceux écrits par le pipeline Python, pour les 3 scénarios', () => {
    for (const sc of ['mars_water', 'mars_layers', 'moon_volcanic'] as const) {
      const cands = data.scenarios[sc].candidates;
      const v = computeVerdicts(cands);
      for (const c of cands) expect(v[c.id]?.verdict).toBe(c.verdict);
    }
  });
  it('chaque destination a son meilleur site : Jezero > Ahnet, Gale > Tassili, Lune > Hoggar', () => {
    const top = (sc: 'mars_water' | 'mars_layers' | 'moon_volcanic') =>
      data.scenarios[sc].candidates.filter((c) => computeVerdicts(data.scenarios[sc].candidates)[c.id]?.verdict === 'STRONGEST').map((c) => c.id);
    expect(top('mars_water')).toEqual(['ahnet']);
    expect(top('mars_layers')).toEqual(['tassili']);
    expect(top('moon_volcanic')).toEqual(['hoggar']);
  });
  it('radarData garde null pour un site non noté', () => {
    expect(radarData(base[0] as Candidate).every((r) => r.site === null)).toBe(true);
  });
});

describe('stage2Items (dossier)', () => {
  beforeEach(() => useMissionStore.getState().clearDossier());
  it('site, pourquoi, mesures, empreinte, audit : tag et source partout, TBD pour null', () => {
    const c = base[0] as Candidate;
    const items = stage2Items(c, computeVerdicts(base)['ahnet']!);
    expect(items[0]).toMatchObject({ stage: 2, title: 'Site chosen for Stage 03', value: 'Ahnet Basin' });
    expect(stage2Items(real[0] as Candidate, computeVerdicts(real)['ahnet']!).find((i) => i.id === 's2-fp-0')?.value).toContain('counts x2');
    expect(items.find((i) => i.id === 's2-metric-mean_slope')?.value).toBe('TBD');
    expect(items.filter((i) => i.id.startsWith('s2-fp-'))).toHaveLength(6);
    expect(items.filter((i) => i.title === 'Where it breaks')).toHaveLength(c.breaks.length);
    expect(items.every((i) => i.tag && i.source && i.stage === 2)).toBe(true);
  });
  it('anomalies toujours taguées Interpreted', () => {
    const c: Candidate = { ...(base[0] as Candidate), anomalies: [{ id: 'A1', coords: [26.18, 2.29], note: 'x', tag: 'Hypothesis' }] };
    const a = stage2Items(c, { verdict: null, reason: '' }).find((i) => i.id === 's2-anomaly-A1');
    expect(a?.tag).toBe('Interpreted');
  });
  it('relancer remplace la ligne : pas de doublons dans le dossier', () => {
    const s = useMissionStore.getState();
    const c = base[0] as Candidate;
    s.setStageItems(2, stage2Items(c, { verdict: null, reason: '' }));
    s.setStageItems(2, stage2Items(c, { verdict: null, reason: '' }));
    const n = useMissionStore.getState().dossierItems.filter((i) => i.stage === 2).length;
    expect(n).toBe(stage2Items(c, { verdict: null, reason: '' }).length);
  });
});
