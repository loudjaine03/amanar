import type { DossierItem, MissionData, Scenario, Spec } from '@/types/mission';

/** Une valeur pas encore connue (null) s'affiche "TBD". */
export const specText = (spec: Spec): string => spec.value ?? 'TBD';

/** Ce que l'étape 01 écrit dans le dossier : la cible + ses 4 caractéristiques (avec tag et source). */
export function stage1Items(scenario: Scenario, data: MissionData): DossierItem[] {
  const sc = data.scenarios[scenario];
  const target = sc?.planet_target;
  if (!target) return [];
  return [
    { id: 's1-target', stage: 1, title: 'Target', value: `${target.name} (${sc.title})`, tag: 'Interpreted', source: 'team' },
    { id: 's1-question', stage: 1, title: 'Question', value: sc.question, tag: 'Interpreted', source: 'team' },
    { id: 's1-delay', stage: 1, title: 'Signal delay', value: sc.delay.label, tag: sc.delay.tag, source: sc.delay.source },
    ...target.specs.map(
      (s): DossierItem => ({
        id: `s1-spec-${s.key}`,
        stage: 1,
        title: s.label,
        value: specText(s),
        tag: s.tag,
        source: s.source,
      }),
    ),
  ];
}
