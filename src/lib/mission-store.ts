import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { MatchLayer } from './match';
import type { LatLon } from './geo';
import type { Scenario, MissionData, DossierItem, DossierStage, FieldAccessResult } from '@/types/mission';
import type { FinderInput } from './finder';
import { CURIOSITY, type RoverSpec } from './hardware';

/** A traverse proposed by the Analog Finder, used by Stage 03 instead of the default waypoints. */
export interface CustomRoute {
  scenario: Scenario;
  site: string;
  points: { coords: LatLon; label: string }[];
}

interface MissionState {
  scenario: Scenario;
  selectedSite: string | null;
  missionData: MissionData | null;
  benchmarkAdded: boolean;
  auditAdded: boolean;
  routeStats: { lengthKm: number; maxSlopeDeg: number } | null;
  safetyResult: FieldAccessResult | null;
  month: number;
  landing: LatLon | null;
  route: LatLon[] | null;
  marsMode: boolean;
  heatLimit: number;
  slopeLimit: number;
  layer: MatchLayer;
  opacity: number;
  showAnomalies: boolean;
  dossierItems: DossierItem[];
  language: 'en' | 'fr';
  demoModeActive: boolean;
  apiStatus: 'offline' | 'live';
  dossierOpen: boolean;
  finderInput: FinderInput | null;
  customRoute: CustomRoute | null;
  roverSpec: RoverSpec;
  insideKPa: number;
  setRoverSpec: (r: RoverSpec) => void;
  setInsideKPa: (p: number) => void;
  setFinderInput: (input: FinderInput) => void;
  setCustomRoute: (route: CustomRoute | null) => void;
  setScenario: (scenario: Scenario) => void;
  setLanguage: (language: 'en' | 'fr') => void;
  setLanding: (landing: LatLon | null) => void;
  setMarsMode: (marsMode: boolean) => void;
  setHeatLimit: (heatLimit: number) => void;
  setSlopeLimit: (slopeLimit: number) => void;
  setMonth: (month: number) => void;
  setLayer: (layer: MatchLayer) => void;
  setOpacity: (opacity: number) => void;
  setShowAnomalies: (show: boolean) => void;
  setDossierOpen: (open: boolean) => void;
  /** Ajoute une ligne au dossier ; si l'id existe déjà, elle est remplacée (pas de doublon). */
  addDossierItem: (item: DossierItem) => void;
  clearDossier: () => void;
  /** Remplace toutes les lignes d'une étape (utile quand on change de cible). */
  setStageItems: (stage: DossierStage, items: DossierItem[]) => void;
}
export const useMissionStore = create<MissionState>()(
  persist(
    (set) => ({
      scenario: 'mars_water',
      selectedSite: null,
      missionData: null,
      benchmarkAdded: false,
      auditAdded: false,
      routeStats: null,
      safetyResult: null,
      month: 1,
      landing: null,
      route: null,
      marsMode: true,
      heatLimit: 40,
      slopeLimit: 15,
      layer: 'l_band',
      opacity: 0.8,
      showAnomalies: true,
      dossierItems: [],
      language: 'en',
      demoModeActive: false,
      apiStatus: 'offline',
      dossierOpen: false,
      finderInput: null,
      customRoute: null,
      roverSpec: CURIOSITY,
      insideKPa: 101.3,
      setRoverSpec: (roverSpec) => set({ roverSpec }),
      setInsideKPa: (insideKPa) => set({ insideKPa }),
      setFinderInput: (finderInput) => set({ finderInput }),
      setCustomRoute: (customRoute) => set({ customRoute, landing: null }),
      setScenario: (scenario) => set({ scenario, landing: null }),
      setLanguage: (language) => set({ language }),
      setLanding: (landing) => set({ landing }),
      setMarsMode: (marsMode) => set({ marsMode }),
      setHeatLimit: (heatLimit) => set({ heatLimit }),
      setSlopeLimit: (slopeLimit) => set({ slopeLimit }),
      setMonth: (month) => set({ month }),
      setLayer: (layer) => set({ layer }),
      setOpacity: (opacity) => set({ opacity }),
      setShowAnomalies: (showAnomalies) => set({ showAnomalies }),
      setDossierOpen: (dossierOpen) => set({ dossierOpen }),
      addDossierItem: (item) =>
        set((st) => ({
          dossierItems: st.dossierItems.some((i) => i.id === item.id)
            ? st.dossierItems.map((i) => (i.id === item.id ? item : i))
            : [...st.dossierItems, item],
        })),
      clearDossier: () => set({ dossierItems: [] }),
      setStageItems: (stage, items) =>
        set((st) => ({ dossierItems: [...st.dossierItems.filter((i) => i.stage !== stage), ...items] })),
    }),
    {
      name: 'abe-mission',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: ({ dossierItems, language }) => ({ dossierItems, language }),
    },
  ),
);
