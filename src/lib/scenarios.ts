import type { Scenario } from '@/types/mission';

type L = { en: string; fr: string };
/** Labels for the three planetary scenarios (the science content itself is in mission_data.json). */
export const SCENARIO_META: Record<Scenario, { body: 'mars' | 'moon'; short: L; title: L; target: L }> = {
  mars_water: {
    body: 'mars',
    short: { en: 'Jezero', fr: 'Jezero' },
    title: { en: 'Mars · Follow the lost water', fr: 'Mars · Suivre l’eau perdue' },
    target: { en: 'Jezero Crater · Western delta', fr: 'Cratère Jezero · Delta occidental' },
  },
  mars_layers: {
    body: 'mars',
    short: { en: 'Gale', fr: 'Gale' },
    title: { en: 'Mars · Read the layered rocks', fr: 'Mars · Lire les roches en couches' },
    target: { en: 'Gale Crater · Mount Sharp', fr: 'Cratère Gale · Mont Sharp' },
  },
  moon_volcanic: {
    body: 'moon',
    short: { en: 'Moon', fr: 'Lune' },
    title: { en: 'Moon · Volcanic domes and lava tubes', fr: 'Lune · Dômes volcaniques et tubes de lave' },
    target: { en: 'Marius Hills · Lava-tube pit', fr: 'Marius Hills · Puits de tube de lave' },
  },
};
