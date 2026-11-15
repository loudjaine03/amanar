import type { DossierItem, DossierStage, Meta, Tag } from '@/types/mission';

export const STAGE_TITLES: Record<DossierStage, string> = {
  1: '01 Target',
  4: '02 Find (AI)',
  2: '03 Compare',
  5: '04 Hardware',
  3: '05 Rehearse',
};
/** Display order = the app's five steps (internal stage numbers kept for old dossiers). */
export const STAGE_ORDER: DossierStage[] = [1, 4, 2, 5, 3];

export const TAG_MEANING: Record<Tag, string> = {
  Measured: 'Computed by our scripts from an identified dataset',
  Interpreted: 'Our reading of a pattern, or our judgement',
  Hypothesis: 'Must be checked in the field',
  Reference: 'Established fact from a cited source, not computed by us',
};

/** Remplace l'identifiant d'une source (ex. "cop_dem") par son nom lisible. */
export function sourceName(meta: Meta | null | undefined, id: string): string {
  return meta?.sources.find((s) => s.id === id)?.name ?? id;
}

/** Construit le dossier en Markdown (anglais : c'est le document lu par les juges). */
export function buildDossierMarkdown(items: DossierItem[], meta: Meta | null | undefined, date: string): string {
  const out: string[] = [];
  out.push('# Mission Dossier: Amanar · Algeria Beyond Earth (Team Hoggar)', '', `Generated: ${date}`, '');
  if (meta?.mock) {
    out.push('> **MOCK DATA.** Values below are layout placeholders or still being computed, not final results.', '');
  }
  out.push('> Team-built experimental indicators. Not an official NASA assessment.', '');
  for (const stage of STAGE_ORDER) {
    out.push(`## ${STAGE_TITLES[stage]}`, '');
    const rows = items.filter((i) => i.stage === stage);
    if (!rows.length) out.push('_Nothing logged yet._', '');
    for (const r of rows) {
      out.push(`- **${r.title}:** ${r.value} \u2014 *${r.tag}* \u00b7 Source: ${sourceName(meta, r.source)}`);
    }
    if (rows.length) out.push('');
  }
  out.push('## Tags', '');
  for (const tag of Object.keys(TAG_MEANING) as Tag[]) out.push(`- **${tag}:** ${TAG_MEANING[tag]}`);
  out.push('');
  if (meta?.sources.length) {
    out.push('## Data sources', '');
    for (const s of meta.sources) out.push(s.url ? `- ${s.name}: ${s.url}` : `- ${s.name}`);
    out.push('');
  }
  return out.join('\n');
}

/** Enregistre un texte dans un fichier téléchargeable (Blob). Navigateur uniquement. */
export function downloadMarkdown(markdown: string, filename = 'mission-dossier.md') {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
