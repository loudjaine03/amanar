import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { stage1Items, specText } from '@/lib/stage1';
import { TrekFallback } from '@/components/mission/TrekFallback';
import { useMissionStore } from '@/lib/mission-store';
import type { MissionData } from '@/types/mission';

const data = JSON.parse(readFileSync('public/mission_data.json', 'utf8')) as MissionData;

describe('stage1Items', () => {
  it('Mars : la cible, la question, le délai + les 4 caractéristiques, tag et source sur chaque ligne', () => {
    const items = stage1Items('mars_water', data);
    expect(items).toHaveLength(7);
    expect(items[0]).toMatchObject({ stage: 1, title: 'Target' });
    expect(items[0]?.value).toContain('Jezero Crater, western delta');
    expect(items.slice(3).map((i) => i.id)).toEqual(['s1-spec-slope', 's1-spec-landform', 's1-spec-cover', 's1-spec-dryness']);
    expect(items.every((i) => i.tag && i.source)).toBe(true);
  });
  it('une valeur inconnue (null) devient "TBD", jamais inventée', () => {
    const d = structuredClone(data);
    d.scenarios.moon_volcanic.planet_target.specs[0]!.value = null;
    expect(stage1Items('moon_volcanic', d).find((i) => i.id === 's1-spec-slope')?.value).toBe('TBD');
  });
  it('Lune : le délai du signal est d’environ 1,3 s (pas 11 min)', () => {
    expect(stage1Items('moon_volcanic', data).find((i) => i.id === 's1-delay')?.value).toContain('1.3 s');
  });
  it('specText affiche TBD pour null', () => {
    expect(specText({ key: 'slope', label: 'Slope', value: null, tag: 'Measured', source: 'trek' })).toBe('TBD');
  });
  it('les trois cibles ont exactement 4 caractéristiques et des tuiles NASA Trek', () => {
    for (const sc of ['mars_water', 'mars_layers', 'moon_volcanic'] as const) {
      expect(data.scenarios[sc].planet_target.specs).toHaveLength(4);
      expect(data.scenarios[sc].planet_target.tiles).toMatch(/^https:\/\/trek\.nasa\.gov\/tiles\/(Mars|Moon)\//);
    }
  });
});

describe('setStageItems', () => {
  beforeEach(() => useMissionStore.getState().clearDossier());
  it('remplace seulement l’étape visée', () => {
    const s = useMissionStore.getState();
    s.addDossierItem({ id: 'x2', stage: 2, title: 'Site', value: 'Ahnet', tag: 'Interpreted', source: 'team' });
    s.setStageItems(1, stage1Items('mars_water', data));
    s.setStageItems(1, stage1Items('moon_volcanic', data)); // on change de cible : pas de doublons
    const items = useMissionStore.getState().dossierItems;
    expect(items.filter((i) => i.stage === 1)).toHaveLength(7);
    expect(items.find((i) => i.stage === 1 && i.title === 'Target')?.value).toContain('Marius Hills');
    expect(items.filter((i) => i.stage === 2)).toHaveLength(1);
  });
});

describe('TrekFallback', () => {
  it('affiche le nom de la cible et prévient que c’est schématique', () => {
    render(createElement(TrekFallback, { target: data.scenarios.mars_water.planet_target, reason: 'failed' }));
    expect(screen.getByText('Jezero Crater, western delta')).toBeInTheDocument();
    expect(screen.getByText(/Schematic location only/)).toBeInTheDocument();
  });
});
