import { SCENARIOS, type MissionData, type DossierItem, type FieldAccessResult, type CheckState } from '@/types/mission';
import { useMissionStore } from './mission-store';

async function live<T>(path: string, payload?: unknown): Promise<T> {
  const base = import.meta.env['VITE_API_BASE'];
  if (!base) throw new Error('API not configured');
  const response = await fetch(`${base.replace(/\/$/, '')}/api/${path}`, {
    signal: AbortSignal.timeout(5000),
    ...(payload === undefined
      ? {}
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  });
  if (!response.ok) throw new Error('API unavailable');
  const result = (await response.json()) as T;
  useMissionStore.setState({ apiStatus: 'live' });
  return result;
}
function offline() {
  useMissionStore.setState({ apiStatus: 'offline' });
}

/** Lit mission_data.json (API optionnelle, sinon fichier statique). N'invente jamais de données. */
export async function getMissionData(): Promise<MissionData> {
  try {
    return await live<MissionData>('mission-data');
  } catch {
    offline();
  }
  const response = await fetch('/mission_data.json');
  if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json'))
    throw new Error('MISSION_DATA_NOT_SUPPLIED');
  const data = (await response.json()) as MissionData;
  if (typeof data?.meta?.mock !== 'boolean' || !SCENARIOS.every((s) => Array.isArray(data?.scenarios?.[s]?.candidates)))
    throw new Error('MISSION_DATA_INVALID');
  return data;
}

const below = (value: number | null, limit: number): CheckState =>
  value === null || !Number.isFinite(value) ? 'tbd' : value < limit ? 'ok' : 'fail';

/** Vérification préliminaire d'accès terrain (PDF, "Key logic" n°7).
 *  Les 3 seuils sont des hypothèses d'équipe, affichées à l'écran. Un seuil est "strictement inférieur à".
 *  Une valeur inconnue (null) donne "tbd", jamais "ok". */
export function computeFieldAccess(input: {
  maxSlopeDeg: number | null;
  slopeLimitDeg: number;
  tmaxC: number | null;
  heatLimitC: number;
  hubKm: number | null;
  hubLimitKm: number;
}): FieldAccessResult {
  const slope = below(input.maxSlopeDeg, input.slopeLimitDeg);
  const heat = below(input.tmaxC, input.heatLimitC);
  const logistics = below(input.hubKm, input.hubLimitKm);
  const all = [slope, heat, logistics];
  const verdict = all.includes('fail') ? 'outside' : all.includes('tbd') ? 'tbd' : 'meets';
  return { slope, heat, logistics, verdict, tag: 'Interpreted' };
}

export async function saveDossier(payload: DossierItem[]) {
  try {
    return await live('dossier', payload);
  } catch {
    offline();
    return { saved: false, mode: 'offline', items: payload };
  }
}
