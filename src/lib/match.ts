import type { Candidate, DossierItem, FingerprintAxis, Verdict } from '@/types/mission';
import { fmt } from './format';

/** The layer buttons (JSON keys). 'classes' = ML terrain units, 'surprise' = ML radar surprise. */
export type MatchLayer = 'optical' | 'c_band' | 'l_band' | 'classes' | 'surprise';
export const MATCH_LAYERS: MatchLayer[] = ['optical', 'c_band', 'l_band', 'classes', 'surprise'];

export interface SiteScore {
  /** Weighted sum of the 6 scores, or null while any score is missing. */
  total: number | null;
  /** Weighted sum of the target scores (3 on every axis; terrain and materials count double = 24). */
  max: number;
}

const weight = (f: FingerprintAxis) => f.weight ?? 1;

export function siteScore(c: Candidate): SiteScore {
  const max = c.fingerprint.reduce((a, f) => a + weight(f) * f.target, 0);
  const scored = c.fingerprint.length > 0 && c.fingerprint.every((f) => f.site !== null);
  const total = scored ? c.fingerprint.reduce((a, f) => a + weight(f) * (f.site ?? 0), 0) : null;
  return { total, max };
}

export interface SiteVerdict {
  verdict: Verdict | null;
  reason: string;
}

/** Seuil d'équipe : un site non-premier avec au moins 50 % du total de la cible = PARTIAL, sinon WEAK. */
export const PARTIAL_SHARE = 0.5;

/** Badges calculés À PARTIR DES SCORES (jamais écrits à la main).
 *  Tant que les 3 sites ne sont pas tous notés : aucun badge (verdict = null). */
export function computeVerdicts(candidates: Candidate[]): Record<string, SiteVerdict> {
  const scores = candidates.map((c) => ({ id: c.id, ...siteScore(c) }));
  const out: Record<string, SiteVerdict> = {};
  if (scores.length === 0 || scores.some((s) => s.total === null)) {
    for (const s of scores) out[s.id] = { verdict: null, reason: 'Not scored yet (TBD)' };
    return out;
  }
  const best = Math.max(...scores.map((s) => s.total as number));
  const nBest = scores.filter((s) => s.total === best).length;
  for (const s of scores) {
    const total = s.total as number;
    const text = `${total}/${s.max}`;
    if (total === best) {
      out[s.id] = {
        verdict: 'STRONGEST',
        reason: `Scored ${text}: ${nBest > 1 ? 'joint highest' : 'highest'} of the ${scores.length} sites.`,
      };
    } else if (s.max > 0 && total / s.max >= PARTIAL_SHARE) {
      out[s.id] = { verdict: 'PARTIAL', reason: `Scored ${text}: at least ${PARTIAL_SHARE * 100}% of the target, but not the highest.` };
    } else {
      out[s.id] = { verdict: 'WEAK', reason: `Scored ${text}: below ${PARTIAL_SHARE * 100}% of the target.` };
    }
  }
  return out;
}

/** Données du radar : cible + site. Un score null reste null (pas de forme "site" tant que non noté). */
export function radarData(c: Candidate) {
  return c.fingerprint.map((f) => ({ axis: f.axis, target: f.target, site: f.site }));
}

/** Ce que l'étape 02 écrit dans le dossier : le site choisi et pourquoi, ses mesures, les scores,
 *  les anomalies de contraste (Interpreted), l'audit. Chaque ligne a un tag et une source. */
export function stage2Items(c: Candidate, verdict: SiteVerdict): DossierItem[] {
  const items: DossierItem[] = [
    { id: 's2-site', stage: 2, title: 'Site chosen for Stage 03', value: c.name, tag: 'Interpreted', source: 'team' },
    {
      id: 's2-why',
      stage: 2,
      title: 'Why',
      value: verdict.verdict
        ? `${verdict.verdict}. ${verdict.reason}`
        : `${c.role} (fingerprint scores are TBD, so no verdict yet)`,
      tag: 'Interpreted',
      source: 'team',
    },
  ];
  for (const m of c.metrics) {
    items.push({ id: `s2-metric-${m.key}`, stage: 2, title: m.label, value: fmt(m.value, m.unit), tag: m.tag, source: m.source });
  }
  c.fingerprint.forEach((f, i) => {
    items.push({
      id: `s2-fp-${i}`,
      stage: 2,
      title: `Fingerprint: ${f.axis}`,
      value:
        (f.site === null ? `TBD (target ${f.target}/3)` : `${f.site}/3 (target ${f.target}/3)`) +
        (weight(f) > 1 ? `, counts x${weight(f)}` : '') +
        (f.basis ? `. Based on: ${f.basis}` : ''),
      tag: f.tag,
      source: f.source ?? 'team',
    });
  });
  for (const a of c.anomalies) {
    items.push({
      id: `s2-anomaly-${a.id}`,
      stage: 2,
      title: `Radar-surprise hotspot ${a.id} (${a.coords[0]}, ${a.coords[1]})`,
      value: a.note,
      tag: 'Interpreted',
      source: 'ml',
    });
  }
  c.transfers.forEach((l, i) =>
    items.push({ id: `s2-transfer-${i}`, stage: 2, title: 'What transfers', value: l.text, tag: l.tag, source: l.source ?? 'team' }),
  );
  c.breaks.forEach((l, i) =>
    items.push({ id: `s2-break-${i}`, stage: 2, title: 'Where it breaks', value: l.text, tag: l.tag, source: l.source ?? 'team' }),
  );
  return items;
}
