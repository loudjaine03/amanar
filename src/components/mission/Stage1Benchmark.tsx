import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Layers, Moon, Orbit, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMissionData } from '@/lib/api';
import { useMissionStore } from '@/lib/mission-store';
import { specText, stage1Items } from '@/lib/stage1';
import { SCENARIO_META } from '@/lib/scenarios';
import { SCENARIOS, type Scenario } from '@/types/mission';
import { useMissionTranslation } from './MissionShell';
import { TagChip } from './TagChip';
import { TrekMap } from './TrekMap';
import './mission-extras.css';

const TEXT = {
  en: {
    eyebrow: 'STEP 01 / TARGET', title: 'Target', sub: 'Where are we going, and what does it look like?', mission: 'Mission',
    specs: 'What the target looks like', find: 'Step 02: Ask the AI where', ask: 'Skip to the comparison',
    loading: 'Loading mission data…', error: 'Mission data could not be loaded.', delay: 'Signal delay',
    caption: 'Map: NASA Trek (Mars/Moon), lat/lon grid. Marker = target.', tbd: 'TBD = not computed yet', best: 'Best Algerian analog by our scores',
  },
  fr: {
    eyebrow: 'ÉTAPE 01 / CIBLE', title: 'Cible', sub: 'Où allons-nous, et à quoi ça ressemble ?', mission: 'Mission',
    specs: 'À quoi ressemble la cible', find: 'Étape 02 : Demander à l’IA où', ask: 'Aller à la comparaison',
    loading: 'Chargement des données de mission…', error: 'Impossible de charger les données de mission.', delay: 'Délai du signal',
    caption: 'Carte : NASA Trek (Mars/Lune), grille lat/lon. Repère = cible.', tbd: 'TBD = pas encore calculé', best: 'Meilleur analogue algérien selon nos scores',
  },
} as const;

/** Étape 01 : choisir la cible (Mars/Lune), voir sa carte Trek et ses 4 caractéristiques. */
export function Stage1Benchmark() {
  const { language } = useMissionTranslation();
  const t = TEXT[language];
  const scenario = useMissionStore((s) => s.scenario);
  const setScenario = useMissionStore((s) => s.setScenario);
  const data = useMissionStore((s) => s.missionData);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (data) return;
    getMissionData()
      .then((missionData) => useMissionStore.setState({ missionData }))
      .catch(() => setFailed(true));
  }, [data]);

  const choose = (s: Scenario) => () => setScenario(s);
  const sc = data?.scenarios[scenario];
  const target = sc?.planet_target;
  const best = sc?.candidates.filter((c) => c.verdict === 'STRONGEST').map((c) => c.name).join(', ');
  const ICONS = { mars_water: Orbit, mars_layers: Layers, moon_volcanic: Moon } as const;

  const log = () => {
    if (!data) return;
    useMissionStore.getState().setStageItems(1, stage1Items(scenario, data));
    useMissionStore.setState({ benchmarkAdded: true });
  };

  return (
    <div className="foundation-page">
      <div className="eyebrow">{t.eyebrow}</div>
      <h1>{t.title}</h1>
      <p className="bench-sub">{t.sub}</p>

      <div className="target-grid three" role="radiogroup" aria-label={t.mission}>
        {SCENARIOS.map((id) => {
          const Icon = ICONS[id];
          return (
            <Button key={id} variant="instrument" className="target-choice" role="radio" aria-checked={scenario === id} data-selected={scenario === id} onClick={choose(id)}>
              <Icon />
              <strong>{SCENARIO_META[id].body === 'moon' ? (language === 'fr' ? 'Lune' : 'Moon') : 'Mars'}</strong>
              <span>{SCENARIO_META[id].title[language].split(' · ')[1]}</span>
              <span className="target-sub">{SCENARIO_META[id].target[language]}</span>
            </Button>
          );
        })}
      </div>

      {!data && <div className="empty-state"><p>{failed ? t.error : t.loading}</p></div>}

      {data && target && (
        <>
          <p className="bench-question">{sc?.question}</p>
          <div className="bench-layout">
            <div>
              <div className="trek-box">
                <TrekMap key={target.name} target={target} />
              </div>
            </div>
            <div>
              <h2 className="bench-target">{target.name}</h2>
              <div className="eyebrow bench-specs-label">{t.specs}</div>
              <ul className="spec-grid">
                {target.specs.map((s) => (
                  <li className="spec-card" key={s.key}>
                    <div className="spec-top">
                      <span>{s.label}</span>
                      <TagChip tag={s.tag} source={s.source} />
                    </div>
                    <strong data-tbd={s.value === null}>{specText(s)}</strong>
                  </li>
                ))}
              </ul>
              <p className="map-caption">
                {t.delay}: {sc?.delay.label} {sc && <TagChip tag={sc.delay.tag} source={sc.delay.source} />}
              </p>
              {best && <p className="map-caption">{t.best}: <strong>{best}</strong></p>}
            </div>
          </div>
          <div className="bench-actions">
            <Button variant="mission" asChild>
              <Link to="/finder" onClick={log}>
                <Sparkles />
                {t.find}
                <ArrowRight />
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/mission/match" onClick={log}>{t.ask}</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
