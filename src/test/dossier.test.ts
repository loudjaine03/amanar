import { describe, it, expect, beforeEach } from 'vitest';
import { buildDossierMarkdown, sourceName } from '@/lib/dossier';
import { fmt } from '@/lib/format';
import { useMissionStore } from '@/lib/mission-store';
import type { DossierItem, Meta } from '@/types/mission';

const meta: Meta = {
  mock: true,
  generated: '2026-11-14T18:00Z',
  sources: [{ id: 'cop_dem', name: 'Copernicus DEM GLO-30 (ESA)', url: 'https://example.org/dem' }],
};
const item = (id: string, stage: 1 | 2 | 3, over: Partial<DossierItem> = {}): DossierItem => ({
  id, stage, title: 'Mean slope', value: '2.4°', tag: 'Measured', source: 'cop_dem', ...over,
});

describe('buildDossierMarkdown', () => {
  it('range les lignes par étape, avec tag et nom de source', () => {
    const md = buildDossierMarkdown([item('a', 2)], meta, '2026-11-14');
    expect(md).toContain('## 03 Compare');
    expect(md).toContain('**Mean slope:** 2.4° \u2014 *Measured* \u00b7 Source: Copernicus DEM GLO-30 (ESA)');
  });
  it('indique "Nothing logged yet" pour une étape vide', () => {
    const md = buildDossierMarkdown([item('a', 2)], meta, '2026-11-14');
    expect(md.match(/Nothing logged yet/g)).toHaveLength(4);
    expect(md).toContain('## 02 Find (AI)');
  });
  it('affiche l’avertissement MOCK seulement si meta.mock est vrai', () => {
    expect(buildDossierMarkdown([], meta, 'd')).toContain('MOCK DATA');
    expect(buildDossierMarkdown([], { ...meta, mock: false }, 'd')).not.toContain('MOCK DATA');
  });
  it('liste les sources et la définition des 3 tags', () => {
    const md = buildDossierMarkdown([], meta, 'd');
    expect(md).toContain('https://example.org/dem');
    for (const t of ['Measured', 'Interpreted', 'Hypothesis', 'Reference']) expect(md).toContain(`**${t}:**`);
  });
  it('garde l’identifiant brut si la source est inconnue', () => {
    expect(sourceName(meta, 'mola')).toBe('mola');
  });
});

describe('fmt (TBD)', () => {
  it('null et undefined donnent TBD, jamais 0', () => {
    expect(fmt(null, '°')).toBe('TBD');
    expect(fmt(undefined)).toBe('TBD');
    expect(fmt(NaN)).toBe('TBD');
  });
  it('arrondit et ajoute l’unité', () => {
    expect(fmt(2.449, '°')).toBe('2.4 °');
    expect(fmt(0, 'm')).toBe('0 m');
  });
});

describe('store du dossier', () => {
  beforeEach(() => useMissionStore.getState().clearDossier());
  it('ajoute une ligne', () => {
    useMissionStore.getState().addDossierItem(item('a', 1));
    expect(useMissionStore.getState().dossierItems).toHaveLength(1);
  });
  it('remplace une ligne de même id au lieu de la dupliquer', () => {
    const s = useMissionStore.getState();
    s.addDossierItem(item('a', 1));
    s.addDossierItem(item('a', 1, { value: '3.0°' }));
    const items = useMissionStore.getState().dossierItems;
    expect(items).toHaveLength(1);
    expect(items[0]?.value).toBe('3.0°');
  });
  it('clearDossier vide la liste', () => {
    useMissionStore.getState().addDossierItem(item('a', 1));
    useMissionStore.getState().clearDossier();
    expect(useMissionStore.getState().dossierItems).toHaveLength(0);
  });
});
