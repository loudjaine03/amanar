import { describe, it, expect, vi } from 'vitest';
import { computeFieldAccess, getMissionData } from '@/lib/api';

const base = { slopeLimitDeg: 15, heatLimitC: 40, hubLimitKm: 250 };

describe('Vérification préliminaire d’accès terrain (hypothèses d’équipe)', () => {
  it('tout OK -> "meets"', () => {
    const r = computeFieldAccess({ ...base, maxSlopeDeg: 9, tmaxC: 31, hubKm: 180 });
    expect(r.verdict).toBe('meets');
    expect(r.tag).toBe('Interpreted');
  });
  it('la pente doit être strictement sous la limite', () => {
    expect(computeFieldAccess({ ...base, maxSlopeDeg: 15, tmaxC: 20, hubKm: 100 }).slope).toBe('fail');
    expect(computeFieldAccess({ ...base, maxSlopeDeg: 14.99, tmaxC: 20, hubKm: 100 }).slope).toBe('ok');
  });
  it('le hub doit être strictement sous 250 km', () => {
    expect(computeFieldAccess({ ...base, maxSlopeDeg: 5, tmaxC: 20, hubKm: 250 }).logistics).toBe('fail');
    expect(computeFieldAccess({ ...base, maxSlopeDeg: 5, tmaxC: 20, hubKm: 249.9 }).logistics).toBe('ok');
  });
  it('la chaleur doit être sous le seuil réglable', () => {
    expect(computeFieldAccess({ ...base, maxSlopeDeg: 5, tmaxC: 41, hubKm: 100 }).verdict).toBe('outside');
    expect(computeFieldAccess({ ...base, heatLimitC: 45, maxSlopeDeg: 5, tmaxC: 41, hubKm: 100 }).verdict).toBe('meets');
  });
  it('une valeur inconnue (null) donne "tbd", jamais "ok"', () => {
    const r = computeFieldAccess({ ...base, maxSlopeDeg: 5, tmaxC: null, hubKm: 100 });
    expect(r.heat).toBe('tbd');
    expect(r.verdict).toBe('tbd');
  });
  it('un test raté l’emporte sur un "tbd"', () => {
    expect(computeFieldAccess({ ...base, maxSlopeDeg: 20, tmaxC: null, hubKm: 100 }).verdict).toBe('outside');
  });
});

describe('Chargement de mission_data.json', () => {
  it('n’invente rien quand le fichier est absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, headers: new Headers() }));
    await expect(getMissionData()).rejects.toThrow('MISSION_DATA_NOT_SUPPLIED');
    vi.unstubAllGlobals();
  });
  it('refuse un fichier qui ne suit pas le contrat', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ sites: [] }),
      }),
    );
    await expect(getMissionData()).rejects.toThrow('MISSION_DATA_INVALID');
    vi.unstubAllGlobals();
  });
});
