import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, FileText, FlaskConical, Gauge, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMissionData } from '@/lib/api';
import {
  CURIOSITY,
  earthTestMassKg,
  envRows,
  G_EARTH,
  GRAVITY,
  groundPressureKPa,
  habitatLoad,
  hardwareItems,
  MATERIALS,
  SENSORS,
  siteEnv,
  TARGET_ENV,
  type TestHere,
} from '@/lib/hardware';
import { useMissionStore } from '@/lib/mission-store';
import { useMissionTranslation } from './MissionShell';
import { TagChip } from './TagChip';
import './mission-extras.css';

const TEXT = {
  en: {
    eyebrow: 'STEP 04 / HARDWARE', title: 'Hardware', sub: (t: string, s: string) => `What must the equipment survive on ${t}, and what can ${s} test?`,
    loading: 'Loading mission data…', site: 'Test site', gap: 'The environment gap', factor: 'Factor', target: 'Target', here: 'Test here?',
    tabs: { materials: 'Materials', pressure: 'Pressure', sensors: 'Sensor kit' },
    threat: 'Threat', onSite: 'Here', lab: 'Lab',
    verdict: { field: 'TEST HERE', field_lab: 'HERE + LAB', lab: 'LAB ONLY' } as Record<TestHere, string>,
    air: 'Air pressure', airNote: (r: number) => `The site has about ${r.toLocaleString('en')} times more air pressure. Low pressure can only be tested in a chamber.`, airMoon: 'The Moon is a vacuum: no field site can test that.',
    habitat: 'Habitat wall load', inside: 'Pressure inside the habitat', onTarget: 'Load on 1 m² of wall, on the target', atSite: 'Load on 1 m² of wall, at this site', share: 'The site reproduces', proof: 'Uncrewed proof test: pump the test habitat to',
    proofNote: 'Same pressure difference, same wall load: the site can test the structure, never with people inside at that pressure.',
    wheel: 'Wheel ground pressure', mass: 'Rover mass (kg)', wheels: 'Wheels', width: 'Wheel width (cm)', foot: 'Footprint length (cm, assumption)', preset: 'Curiosity values',
    pTarget: 'Ground pressure on the target', pEarth: 'Same rover on Earth', testMass: 'Earth test rover mass for the same pressure',
    scarecrow: 'JPL did exactly this: its "Scarecrow" test rover weighs about 340 kg, like Curiosity on Mars.',
    formula: 'Pressure = mass × gravity ÷ (wheels × width × footprint).',
    sensorsNote: 'These sensors feed the simulated sensor panel in step 05.', sensor: 'Sensor', measures: 'Measures', why: 'Why',
    add: 'Add the hardware plan to the Dossier', added: 'Added to the Dossier', next: 'Step 05: Rehearse', contentLang: '',
  },
  fr: {
    eyebrow: 'ÉTAPE 04 / MATÉRIEL', title: 'Matériel', sub: (t: string, s: string) => `Que doit supporter l’équipement sur ${t}, et que peut tester ${s} ?`,
    loading: 'Chargement des données de mission…', site: 'Site d’essai', gap: 'L’écart d’environnement', factor: 'Facteur', target: 'Cible', here: 'Testable ici ?',
    tabs: { materials: 'Matériaux', pressure: 'Pression', sensors: 'Capteurs' },
    threat: 'Menace', onSite: 'Ici', lab: 'Labo',
    verdict: { field: 'ICI', field_lab: 'ICI + LABO', lab: 'LABO SEULEMENT' } as Record<TestHere, string>,
    air: 'Pression de l’air', airNote: (r: number) => `Le site a environ ${r.toLocaleString('fr')} fois plus de pression. La basse pression ne se teste qu’en chambre.`, airMoon: 'La Lune est un vide : aucun site de terrain ne peut le tester.',
    habitat: 'Charge sur la paroi d’un habitat', inside: 'Pression à l’intérieur de l’habitat', onTarget: 'Charge sur 1 m² de paroi, sur la cible', atSite: 'Charge sur 1 m² de paroi, sur ce site', share: 'Le site reproduit', proof: 'Essai de résistance sans équipage : gonfler l’habitat d’essai à',
    proofNote: 'Même différence de pression, même charge sur la paroi : le site peut tester la structure, jamais avec des personnes à cette pression.',
    wheel: 'Pression au sol des roues', mass: 'Masse du rover (kg)', wheels: 'Roues', width: 'Largeur de roue (cm)', foot: 'Longueur d’appui (cm, hypothèse)', preset: 'Valeurs de Curiosity',
    pTarget: 'Pression au sol sur la cible', pEarth: 'Même rover sur Terre', testMass: 'Masse du rover d’essai sur Terre pour la même pression',
    scarecrow: 'Le JPL a fait exactement ça : son rover d’essai « Scarecrow » pèse environ 340 kg, comme Curiosity sur Mars.',
    formula: 'Pression = masse × gravité ÷ (roues × largeur × appui).',
    sensorsNote: 'Ces capteurs alimentent le panneau de capteurs simulés de l’étape 05.', sensor: 'Capteur', measures: 'Mesure', why: 'Pourquoi',
    add: 'Ajouter le plan matériel au Dossier', added: 'Ajouté au Dossier', next: 'Étape 05 : Répéter', contentLang: 'Les fiches techniques sont en anglais.',
  },
} as const;

type Tab = 'materials' | 'pressure' | 'sensors';

export function Stage4Hardware() {
  const { language } = useMissionTranslation();
  const t = TEXT[language];
  const data = useMissionStore((s) => s.missionData);
  const scenario = useMissionStore((s) => s.scenario);
  const selectedSite = useMissionStore((s) => s.selectedSite);
  const rover = useMissionStore((s) => s.roverSpec);
  const insideKPa = useMissionStore((s) => s.insideKPa);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('materials');
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (data) return;
    getMissionData().then((missionData) => useMissionStore.setState({ missionData })).catch(() => {});
  }, [data]);

  const sc = data?.scenarios[scenario];
  const cands = useMemo(() => sc?.candidates ?? [], [sc]);
  const site =
    cands.find((c) => c.id === (siteId ?? selectedSite)) ?? cands.find((c) => c.role.includes('case study')) ?? cands[0];

  if (!sc || !site) {
    return (
      <div className="foundation-page">
        <div className="eyebrow">{t.eyebrow}</div>
        <h1>{t.title}</h1>
        <div className="empty-state"><p>{t.loading}</p></div>
      </div>
    );
  }

  const body = sc.body;
  const env = siteEnv(site);
  const roughSite = [...cands].sort((a, b) => (siteEnv(b).roughnessM ?? 0) - (siteEnv(a).roughnessM ?? 0))[0];
  const roughest = roughSite ? { name: roughSite.name, roughnessM: siteEnv(roughSite).roughnessM } : undefined;
  const rows = envRows(body, env, roughest);
  const target = TARGET_ENV[body];
  const g = GRAVITY[body];
  const load = env.pressureKPa !== null ? habitatLoad(insideKPa, target.pressureKPa, env.pressureKPa) : null;
  const ratio = env.pressureKPa !== null ? Math.round(env.pressureKPa / target.pressureKPa) : null;
  const setRover = (k: keyof typeof rover, v: number) => useMissionStore.getState().setRoverSpec({ ...rover, [k]: v });
  const log = () => {
    useMissionStore.getState().setStageItems(5, hardwareItems({ body, site: env, rover, insideKPa, ...(roughest ? { roughest } : {}) }));
    setAdded(true);
  };
  const logBar = (v: number) => Math.max(2, Math.min(100, ((Math.log10(v) + 13) / 15) * 100)); // 1e-13 .. 1e2 kPa

  return (
    <div className="foundation-page match-page hw-page">
      <div className="eyebrow">{t.eyebrow}</div>
      <h1>{t.title}</h1>
      <p className="bench-sub">{t.sub(sc.planet_target.name, site.name)}</p>

      <div className="layer-row site-switch" role="group" aria-label={t.site}>
        {cands.map((c) => (
          <button key={c.id} type="button" className="layer-btn" data-active={c.id === site.id} aria-pressed={c.id === site.id}
            onClick={() => { setSiteId(c.id); setAdded(false); }}>{c.name}</button>
        ))}
      </div>

      {/* ---- environment gap ---- */}
      <section className="match-panel hw-gap">
        <div className="panel-title">{t.gap}</div>
        <div className="gap-table" role="table">
          <div className="gap-row gap-head" role="row">
            <span role="columnheader">{t.factor}</span><span role="columnheader">{t.target}: {sc.planet_target.name}</span><span role="columnheader">{site.name}</span><span role="columnheader">{t.here}</span>
          </div>
          {rows.map((r) => (
            <div className="gap-row" role="row" key={r.key} title={r.how}>
              <span role="cell"><strong>{r.label}</strong></span>
              <span role="cell">{r.target}</span>
              <span role="cell">{r.site}</span>
              <span role="cell"><span className={`hw-badge hw-${r.verdict}`}>{t.verdict[r.verdict]}</span> <TagChip tag={r.tag} source={r.source} /></span>
              <small className="gap-how">{r.how}</small>
            </div>
          ))}
        </div>
      </section>

      {/* ---- tabs ---- */}
      <div className="tab-row" role="tablist">
        {(['materials', 'pressure', 'sensors'] as const).map((k) => {
          const Icon = k === 'materials' ? FlaskConical : k === 'pressure' ? Gauge : Radio;
          return (
            <button key={k} type="button" role="tab" aria-selected={tab === k} data-active={tab === k} className="tab-btn" onClick={() => setTab(k)}>
              <Icon className="size-4" />{t.tabs[k]}
            </button>
          );
        })}
      </div>

      {tab === 'materials' && (
        <section className="hw-cards">
          {t.contentLang && <p className="map-caption">{t.contentLang}</p>}
          {MATERIALS.map((m) => (
            <article className="match-panel hw-card" key={m.id}>
              <div className="hw-card-top">
                <h3>{m.component}</h3>
                <span className={`hw-badge hw-${m.verdict[body]}`}>{t.verdict[m.verdict[body]]}</span>
              </div>
              <p className="hw-options">{m.options}</p>
              <dl>
                <dt>{t.threat}</dt><dd>{m.threat[body]}</dd>
                <dt>{t.onSite}</dt><dd>{m.here}</dd>
                <dt>{t.lab}</dt><dd>{m.lab[body]}</dd>
              </dl>
              <TagChip tag={m.tag} source={m.source} />
            </article>
          ))}
        </section>
      )}

      {tab === 'pressure' && (
        <div className="hw-pressure">
          <section className="match-panel">
            <div className="panel-title">{t.air}</div>
            <div className="p-bars">
              <div className="p-bar"><span>{site.name}</span><i style={{ width: `${env.pressureKPa ? logBar(env.pressureKPa) : 0}%` }} /><b>{env.pressureKPa ?? 'TBD'} kPa</b></div>
              <div className="p-bar target"><span>{sc.planet_target.name}</span><i style={{ width: `${logBar(target.pressureKPa)}%` }} /><b>{body === 'moon' ? '3 × 10⁻¹³' : target.pressureKPa} kPa</b></div>
            </div>
            <p className="map-caption">{body === 'moon' ? t.airMoon : ratio ? t.airNote(ratio) : ''} <TagChip tag="Reference" source={target.source} /> <TagChip tag="Interpreted" source="isa" /></p>
          </section>

          <section className="match-panel">
            <div className="panel-title">{t.habitat}</div>
            <label className="slider-row">{t.inside}: {insideKPa} kPa
              <input type="range" min={30} max={110} step={0.1} value={insideKPa} onChange={(e) => useMissionStore.getState().setInsideKPa(Number(e.target.value))} />
            </label>
            {load && (
              <ul className="fp-list access-list">
                <li><span>{t.onTarget}</span><span>{load.forceTargetKN} kN</span></li>
                <li><span>{t.atSite}</span><span>{load.forceSiteKN} kN</span></li>
                <li><span>{t.share}</span><span>{Math.round(load.share * 100)} %</span></li>
                <li><span>{t.proof}</span><span><strong>{load.proofInsideKPa} kPa</strong></span></li>
              </ul>
            )}
            <p className="map-caption">{t.proofNote} <TagChip tag="Interpreted" source="team" /></p>
          </section>

          <section className="match-panel">
            <div className="panel-title">{t.wheel}</div>
            <div className="wheel-inputs">
              <label>{t.mass}<input type="number" min={10} max={5000} value={rover.massKg} onChange={(e) => setRover('massKg', Number(e.target.value) || 0)} /></label>
              <label>{t.wheels}<input type="number" min={2} max={12} value={rover.wheels} onChange={(e) => setRover('wheels', Number(e.target.value) || 1)} /></label>
              <label>{t.width}<input type="number" min={5} max={100} value={Math.round(rover.wheelWidthM * 100)} onChange={(e) => setRover('wheelWidthM', (Number(e.target.value) || 1) / 100)} /></label>
              <label>{t.foot}<input type="number" min={2} max={60} value={Math.round(rover.contactLengthM * 100)} onChange={(e) => setRover('contactLengthM', (Number(e.target.value) || 1) / 100)} /></label>
            </div>
            <button type="button" className="link-btn" onClick={() => useMissionStore.getState().setRoverSpec(CURIOSITY)}>{t.preset}</button> <TagChip tag="Reference" source="msl_wheels" />
            <ul className="fp-list access-list">
              <li><span>{t.pTarget} ({g} m/s²)</span><span>{groundPressureKPa(rover, g).toFixed(1)} kPa</span></li>
              <li><span>{t.pEarth} ({G_EARTH} m/s²)</span><span>{groundPressureKPa(rover, G_EARTH).toFixed(1)} kPa</span></li>
              <li><span>{t.testMass}</span><span><strong>{Math.round(earthTestMassKg(rover.massKg, body))} kg</strong></span></li>
            </ul>
            <p className="map-caption">{t.formula}</p>
            {body === 'mars' && <p className="map-caption">{t.scarecrow} <TagChip tag="Reference" source="scarecrow" /></p>}
          </section>
        </div>
      )}

      {tab === 'sensors' && (
        <section className="match-panel">
          <div className="gap-table sensor-table" role="table">
            <div className="gap-row gap-head" role="row"><span>{t.sensor}</span><span>{t.measures}</span><span>{t.why}</span></div>
            {SENSORS.map((s) => (
              <div className="gap-row" role="row" key={s.id}><span><strong>{s.sensor}</strong></span><span>{s.measures}</span><span>{s.why}</span></div>
            ))}
          </div>
          <p className="map-caption">{t.sensorsNote} <TagChip tag="Hypothesis" source="team" /></p>
        </section>
      )}

      <div className="bench-actions">
        <Button variant="instrument" onClick={log}><FileText />{added ? t.added : t.add}</Button>
        <Button variant="mission" asChild>
          <Link to="/mission/validate" onClick={() => useMissionStore.setState({ selectedSite: site.id })}>{t.next}<ArrowRight /></Link>
        </Button>
      </div>
    </div>
  );
}


