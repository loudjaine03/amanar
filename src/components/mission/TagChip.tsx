import { useHydrated } from '@tanstack/react-router';
import type { Tag } from '@/types/mission';
import { useMissionStore } from '@/lib/mission-store';
import { sourceName, TAG_MEANING } from '@/lib/dossier';
import './mission-extras.css';

const FR: Record<Tag, string> = {
  Measured: 'Calculé par nos scripts à partir d’un jeu de données identifié',
  Interpreted: 'Notre lecture d’un motif, ou notre jugement',
  Hypothesis: 'À vérifier sur le terrain',
  Reference: 'Fait établi par une source citée, pas calculé par nous',
};

/** Petite étiquette collée à chaque chiffre : Measured (vert), Interpreted (ambre), Hypothesis (gris), Reference (bleu).
 *  La source s'affiche au survol. */
export function TagChip({ tag, source }: { tag: Tag; source?: string | undefined }) {
  const meta = useMissionStore((s) => s.missionData?.meta);
  const language = useMissionStore((s) => s.language);
  const hydrated = useHydrated();
  const fr = hydrated && language === 'fr';
  const meaning = fr ? FR[tag] : TAG_MEANING[tag];
  const src = source ? `${fr ? 'Source' : 'Source'}: ${sourceName(meta, source)}` : '';
  const title = src ? `${tag}. ${meaning}. ${src}` : `${tag}. ${meaning}`;
  return (
    <span tabIndex={0} title={title} aria-label={title} className={`tag-chip tag-${tag.toLowerCase()}`}>
      {tag}
    </span>
  );
}
