import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, Crosshair, FileText, Layers, Moon, Orbit, Route as RouteIcon, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMissionData } from '@/lib/api';
import { fmt } from '@/lib/format';
import {
  cellAt,
  cellLatLon,
  contributionText,
  finderItems,
  MATERIALS_WEIGHT,
  runFinder,
  similarCells,
  TOP_N_PER_SITE,
  type FinderInput,
  type SiteOps,
} from '@/lib/finder';
import { useMl } from '@/lib/ml-data';
import { useMissionStore } from '@/lib/mission-store';
import { loadGrid, planRoute } from '@/lib/stage3';
import { SCENARIO_META } from '@/lib/scenarios';
import { SCENARIOS, type LatLon, type Scenario } from '@/types/mission';
import { FinderMap } from './FinderMap';
import type { FinderMarker } from './FinderMapInner';
import { useMissionTranslation } from './MissionShell';
import { TagChip } from './TagChip';
import './mission-extras.css';

const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
} as const;

const TEXT = {
  en: {
    eyebrow: 'STEP 02 / FIND (AI)', title: 'Find', advanced: 'More options: rover, season, distance, priority', more: (n: number) => `Show all ${n} spots`, less: 'Show fewer', next: 'Step 03: Compare the sites',
    sub: 'Tell us the mission. The model ranks 7,500 cells of about 400 m in our three Algerian study boxes and explains every pick.',
    loading: 'Loading the model…', missing: 'Model files not found. Run pipeline/build_all.py, which writes public/ml/cells.json and model.json.',
    q1: '1. Destination', q2: '2. What do you want to test?', q3: '3. Where?', q4: '4. Constraints', q5: '5. Priority',
    all: 'All three study boxes', exactly: 'Exactly where: click a cell on the map, then find places like it.',
    drive: 'Spots must be drivable by the rover', slope: 'Rover slope limit', month: 'Field month', heat: 'Heat limit', hub: 'Max distance to a logistics hub',
    science: 'Science match', ops: 'Ease of operations', reset: 'Reset to the objective’s defaults',
    ranking: 'Site ranking', best: 'BEST MATCH', close: 'CLOSE SECOND', weaker: 'WEAKER', none: 'NO CELL PASSES',
    meanOf: `mean of its ${TOP_N_PER_SITE} best cells`, pass: 'of the box passes', heatOk: 'heat OK', heatFail: 'too hot: robot-only that month', hubKm: 'to hub',
    map: 'Score map', legend: 'Colour = score (yellow is best). Grey = filtered out by your constraints. Orange = top spots. Click to pick a reference spot.',
    spots: 'Top spots', why: 'Why', unit: 'Terrain unit', score: 'Score', noSpots: 'No cell passes these constraints. Relax the slope limit, the hub distance or the area.',
    ref: 'Reference spot', similar: 'Places like this one', similarNote: 'Nearest neighbours in feature space (percentiles of the 10 Finder features), across all three boxes.',
    findSimilar: 'Find places like this', clearRef: 'Clear', pickHint: 'Click the map to pick a spot.',
    addDossier: 'Add the result to the Dossier', added: 'Added to the Dossier', traverse: (s: string) => `Drive a rover through the top spots of ${s}`, compare: 'Open Stage 02 for this site',
    how: 'How this works (and its limits)',
    how1: 'Radar surprise: a gradient-boosting model learns to predict L-band radar from what the surface shows (optical, C-band, slope, roughness, relief). Where L-band is brighter than predicted, something the surface does not explain is there.',
    how2: 'Terrain units: a Gaussian mixture groups the cells of the three sites into units with similar slope, brightness and radar response.',
    how3: 'This Finder: transparent weighted percentiles for your destination and objective, plus your operations weight. Nothing is hidden: every pick lists the features that made it.',
    r2: 'Prediction quality (R², spatial-block cross-validation, per site)', loso: 'Leave-one-site-out R² (a site the model never saw)',
    losoNote: 'Ahnet’s dark sand sheet is unlike anything in Tassili and Hoggar, so a model trained without it fails there (negative R²). That is why hotspots are compared within each site, never across sites.',
    importance: 'What the model relies on most', limits: 'Limits: weights are team judgements, only our three 20 km boxes are covered, and a high score means "worth a field check", not a confirmed analog.',
    moon: 'Moon', mars: 'Mars', rock: 'rock type (team judgement)', otherSites: 'Look in the other sites only',
    noRoute: 'No top spot of this site can be reached from the landing point at this slope limit. Raise the limit or pick another site.',
    how4: `Rock type cannot be read reliably from our pixels, so the team's materials score for each site (Stage 02) counts for ${Math.round(MATERIALS_WEIGHT * 100)} % of the science match.`,
  },
  fr: {
    eyebrow: 'ÉTAPE 02 / TROUVER (IA)', title: 'Trouver', advanced: 'Plus d’options : rover, saison, distance, priorité', more: (n: number) => `Voir les ${n} points`, less: 'Voir moins', next: 'Étape 03 : Comparer les sites',
    sub: 'Décris la mission. Le modèle classe 7 500 cellules d’environ 400 m dans nos trois zones d’étude algériennes et explique chaque choix.',
    loading: 'Chargement du modèle…', missing: 'Fichiers du modèle introuvables. Lance pipeline/build_all.py, qui écrit public/ml/cells.json et model.json.',
    q1: '1. Destination', q2: '2. Que veux-tu tester ?', q3: '3. Où ?', q4: '4. Contraintes', q5: '5. Priorité',
    all: 'Les trois zones d’étude', exactly: 'Exactement où : clique une cellule sur la carte, puis trouve des endroits similaires.',
    drive: 'Les points doivent être praticables par le rover', slope: 'Limite de pente du rover', month: 'Mois sur le terrain', heat: 'Limite de chaleur', hub: 'Distance max à une base logistique',
    science: 'Ressemblance scientifique', ops: 'Facilité des opérations', reset: 'Revenir aux réglages de l’objectif',
    ranking: 'Classement des sites', best: 'MEILLEUR CHOIX', close: 'TRÈS PROCHE', weaker: 'MOINS BON', none: 'AUCUNE CELLULE',
    meanOf: `moyenne de ses ${TOP_N_PER_SITE} meilleures cellules`, pass: 'de la zone passe', heatOk: 'chaleur OK', heatFail: 'trop chaud : robot seulement ce mois-là', hubKm: 'de la base',
    map: 'Carte des scores', legend: 'Couleur = score (jaune = meilleur). Gris = exclu par tes contraintes. Orange = meilleurs points. Clique pour choisir un point de référence.',
    spots: 'Meilleurs points', why: 'Pourquoi', unit: 'Unité de terrain', score: 'Score', noSpots: 'Aucune cellule ne passe ces contraintes. Assouplis la pente, la distance ou la zone.',
    ref: 'Point de référence', similar: 'Endroits similaires', similarNote: 'Plus proches voisins dans l’espace des caractéristiques (percentiles des 10 caractéristiques), dans les trois zones.',
    findSimilar: 'Trouver des endroits similaires', clearRef: 'Effacer', pickHint: 'Clique sur la carte pour choisir un point.',
    addDossier: 'Ajouter le résultat au Dossier', added: 'Ajouté au Dossier', traverse: (s: string) => `Faire rouler un rover par les meilleurs points de ${s}`, compare: 'Ouvrir l’étape 02 pour ce site',
    how: 'Comment ça marche (et ses limites)',
    how1: 'Surprise radar : un modèle de gradient boosting apprend à prédire le radar bande L à partir de ce que montre la surface (optique, bande C, pente, rugosité, relief). Là où la bande L est plus brillante que prévu, quelque chose que la surface n’explique pas est présent.',
    how2: 'Unités de terrain : un mélange gaussien regroupe les cellules des trois sites en unités de pente, luminosité et réponse radar semblables.',
    how3: 'Ce Finder : des percentiles pondérés et transparents pour ta destination et ton objectif, plus ton poids sur les opérations. Rien n’est caché : chaque choix liste les caractéristiques qui l’ont produit.',
    r2: 'Qualité de prédiction (R², validation croisée par blocs spatiaux, par site)', loso: 'R² en laissant un site de côté (site jamais vu par le modèle)',
    losoNote: 'Le voile de sable sombre d’Ahnet ne ressemble à rien à Tassili ni au Hoggar : un modèle entraîné sans lui échoue (R² négatif). C’est pourquoi les points chauds sont comparés dans chaque site, jamais entre sites.',
    importance: 'Ce sur quoi le modèle s’appuie le plus', limits: 'Limites : les poids sont des jugements d’équipe, seules nos trois zones de 20 km sont couvertes, et un score élevé signifie « à vérifier sur le terrain », pas un analogue confirmé.',
    moon: 'Lune', mars: 'Mars', rock: 'type de roche (jugement d’équipe)', otherSites: 'Chercher seulement dans les autres sites',
    noRoute: 'Aucun meilleur point de ce site n’est atteignable depuis le point d’atterrissage avec cette limite de pente. Augmente la limite ou choisis un autre site.',
    how4: `Le type de roche ne se lit pas de façon fiable dans nos pixels : le score « matériaux » de l’équipe pour chaque site (étape 02) compte pour ${Math.round(MATERIALS_WEIGHT * 100)} % de la ressemblance scientifique.`,
  },
} as const;

const ICONS = { mars_water: Orbit, mars_layers: Layers, moon_volcanic: Moon } as const;
const DEFAULT_OBJECTIVE: Record<Scenario, string> = { mars_water: 'water', mars_layers: 'layers', moon_volcanic: 'volcanic' };

export function AnalogFinder() {
  const { language } = useMissionTranslation();
  const t = TEXT[language];
  const fr = language === 'fr';
  const ml = useMl();
  const data = useMissionStore((s) => s.missionData);
  const storeScenario = useMissionStore((s) => s.scenario);
  const stored = useMissionStore((s) => s.finderInput);
  const storeMonth = useMissionStore((s) => s.month);
  const storeHeat = useMissionStore((s) => s.heatLimit);
  const [input, setInput] = useState<FinderInput>(
    () =>
      stored ?? {
        scenario: storeScenario, objective: DEFAULT_OBJECTIVE[storeScenario], region: 'all', slopeLimit: 15, mustDrive: true,
        month: storeMonth, heatLimit: storeHeat, hubLimit: 250, alpha: 0.25,
      },
  );
  const [mapSite, setMapSite] = useState<string | null>(null);
  const [ref, setRef] = useState<number | null>(null);
  const [showSimilar, setShowSimilar] = useState(false);
  const [added, setAdded] = useState(false);
  const [otherSites, setOtherSites] = useState(false);
  const [allSpots, setAllSpots] = useState(false);
  const [routeMsg, setRouteMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (data) return;
    getMissionData().then((missionData) => useMissionStore.setState({ missionData })).catch(() => {});
  }, [data]);
  // keep the store in sync so Stage 02/03 and a return visit see the same question
  useEffect(() => {
    useMissionStore.getState().setFinderInput(input);
    setAdded(false);
  }, [input]);

  const ops: SiteOps[] = useMemo(
    () =>
      (data?.scenarios.mars_water.candidates ?? []).map((c) => ({
        id: c.id,
        hubKm: c.earth_field_safety.nearest_hub.distance_km,
        tmaxByMonth: c.earth_field_safety.monthly_tmax_c,
        materials: Object.fromEntries(
          SCENARIOS.map((sc) => [sc, data?.scenarios[sc].candidates.find((x) => x.id === c.id)?.fingerprint.find((f) => f.axis === 'Surface materials')?.site ?? null]),
        ),
      })),
    [data],
  );
  const result = useMemo(
    () => (ml.status === 'ok' && ops.length ? runFinder(ml.cells, ml.model, input, ops) : null),
    [ml, input, ops],
  );
  const similar = useMemo(
    () => (ml.status === 'ok' && ref !== null && showSimilar ? similarCells(ml.cells, ml.model.finder_features, ref, 8, 'all', otherSites) : []),
    [ml, ref, showSimilar, otherSites],
  );

  const set = <K extends keyof FinderInput>(k: K, v: FinderInput[K]) => setInput((p) => ({ ...p, [k]: v }));
  const setObjective = (objective: string) => {
    const o = ml.status === 'ok' ? ml.model.objectives[objective] : undefined;
    setInput((p) => ({ ...p, objective, mustDrive: o?.rover ?? p.mustDrive, alpha: o?.alpha ?? p.alpha }));
  };
  const setScenario = (scenario: Scenario) => {
    useMissionStore.getState().setScenario(scenario);
    const objective = DEFAULT_OBJECTIVE[scenario];
    const o = ml.status === 'ok' ? ml.model.objectives[objective] : undefined;
    setInput((p) => ({ ...p, scenario, objective, mustDrive: o?.rover ?? p.mustDrive, alpha: o?.alpha ?? p.alpha }));
  };

  if (ml.status !== 'ok' || !data) {
    return (
      <div className="foundation-page">
        <div className="eyebrow">{t.eyebrow}</div>
        <h1>{t.title}</h1>
        <div className="empty-state"><p>{ml.status === 'missing' ? t.missing : t.loading}</p></div>
      </div>
    );
  }

  const { cells, model } = ml;
  const featLabel = (f: string) => model.features[f]?.label ?? f;
  const bestSite = result?.sites.find((s) => s.score !== null)?.id ?? cells.sites[0]?.id ?? 'ahnet';
  const shownSite = cells.sites.find((s) => s.id === (input.region !== 'all' ? input.region : mapSite ?? bestSite)) ?? cells.sites[0]!;
  const nCell = cells.rows * cells.cols;
  const siteScores = result ? Array.from(result.total.slice(shownSite.start, shownSite.start + nCell)) : [];
  const finite = result ? Array.from(result.total).filter((v) => !Number.isNaN(v)) : [];
  const range: [number, number] = finite.length ? [Math.min(...finite), Math.max(...finite)] : [0, 1];
  const scName = data.scenarios[input.scenario]?.title ?? input.scenario;
  const siteName = (id: string) => cells.sites.find((s) => s.id === id)?.name ?? id;

  const markers: FinderMarker[] = [
    ...(result?.top ?? []).map((s, k) => ({ coords: s.coords, label: `${k + 1}`, kind: 'top' as const })).filter((m, k) => result?.top[k]?.site === shownSite.id),
    ...similar.filter((s) => s.site === shownSite.id).map((s) => ({ coords: s.coords, label: `${s.similarity} %`, kind: 'similar' as const })),
    ...(ref !== null && refSite() === shownSite.id ? [{ coords: cellLatLon(cells, ref), label: t.ref, kind: 'ref' as const }] : []),
  ];
  function refSite() {
    if (ref === null) return null;
    return cells.sites.find((s) => ref >= s.start && ref < s.start + nCell)?.id ?? null;
  }
  const onPick = (p: LatLon) => {
    const i = cellAt(cells, p);
    if (i === null) return;
    setRef(i);
    setShowSimilar(false);
  };

  // traverse through the best spots of the shown site that the rover can actually reach (checked with the same A*)
  const planTraverse = async () => {
    setRouteMsg(null);
    const site = data.scenarios[input.scenario]?.candidates.find((c) => c.id === shownSite.id);
    if (!site?.rover) return;
    const limit = input.mustDrive ? input.slopeLimit : site.rover.slope_limit_deg;
    const grid = await loadGrid(site.rover.grid);
    const r = runFinder(cells, model, { ...input, region: shownSite.id, mustDrive: true, slopeLimit: limit }, ops, 40);
    const landing = site.rover.landing;
    const picked: LatLon[] = [];
    for (const spot of r.top) {
      if (grid !== 'missing' && !planRoute(grid, limit, landing, [spot.coords]).ok) continue; // unreachable island
      picked.push(spot.coords);
      if (picked.length === 3) break;
    }
    if (!picked.length) {
      setRouteMsg(t.noRoute);
      return;
    }
    let cur: LatLon = landing;
    const rest = [...picked];
    const ordered: LatLon[] = [];
    while (rest.length) {
      rest.sort((a, b) => Math.hypot(a[0] - cur[0], a[1] - cur[1]) - Math.hypot(b[0] - cur[0], b[1] - cur[1]));
      cur = rest.shift() as LatLon;
      ordered.push(cur);
    }
    const st = useMissionStore.getState();
    st.setScenario(input.scenario);
    st.setCustomRoute({ scenario: input.scenario, site: shownSite.id, points: ordered.map((c, k) => ({ coords: c, label: `Finder spot ${k + 1}` })) });
    useMissionStore.setState({ selectedSite: shownSite.id, slopeLimit: limit });
    void navigate({ to: '/mission/validate' });
  };
  const addToDossier = () => {
    if (!result) return;
    useMissionStore.getState().setStageItems(4, finderItems(result, model, scName));
    setAdded(true);
  };
  const sm = model.surprise_model;
  const labelOf = { best: t.best, close: t.close, weaker: t.weaker, none: t.none } as const;

  return (
    <div className="foundation-page match-page finder-page">
      <div className="eyebrow"><Sparkles className="inline-icon" /> {t.eyebrow}</div>
      <h1>{t.title}</h1>
      <p className="bench-sub">{t.sub}</p>

      <div className="finder-grid">
        {/* ---------------- form ---------------- */}
        <form className="match-panel finder-form" onSubmit={(e) => e.preventDefault()}>
          <fieldset>
            <legend>{t.q1}</legend>
            <div className="dest-grid" role="radiogroup">
              {SCENARIOS.map((id) => {
                const Icon = ICONS[id];
                return (
                  <button key={id} type="button" role="radio" aria-checked={input.scenario === id} data-selected={input.scenario === id} className="dest-btn" onClick={() => setScenario(id)}>
                    <Icon />
                    <strong>{SCENARIO_META[id].body === 'moon' ? t.moon : t.mars}</strong>
                    <span>{SCENARIO_META[id].target[language]}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend>{t.q2}</legend>
            <select value={input.objective} onChange={(e) => setObjective(e.target.value)} aria-label={t.q2}>
              {Object.entries(model.objectives).map(([k, o]) => (
                <option key={k} value={k}>{fr ? o.label_fr : o.label}</option>
              ))}
            </select>
          </fieldset>

          <fieldset>
            <legend>{t.q3}</legend>
            <select value={input.region} onChange={(e) => { set('region', e.target.value); setMapSite(null); }} aria-label={t.q3}>
              <option value="all">{t.all}</option>
              {cells.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <p className="map-caption">{t.exactly}</p>
          </fieldset>

          <details className="advanced-box">
          <summary>{t.advanced}</summary>
          <fieldset>
            <legend>{t.q4}</legend>
            <label className="check-row">
              <input type="checkbox" checked={input.mustDrive} onChange={(e) => set('mustDrive', e.target.checked)} />
              {t.drive}
            </label>
            <label className="slider-row">{t.slope}: {input.slopeLimit}°
              <input type="range" min={5} max={30} step={1} value={input.slopeLimit} disabled={!input.mustDrive} onChange={(e) => set('slopeLimit', Number(e.target.value))} />
            </label>
            <label className="slider-row">{t.month}
              <select value={input.month} onChange={(e) => set('month', Number(e.target.value))}>
                {MONTHS[language].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
            <label className="slider-row">{t.heat}: {input.heatLimit}°C
              <input type="range" min={25} max={50} step={1} value={input.heatLimit} onChange={(e) => set('heatLimit', Number(e.target.value))} />
            </label>
            <label className="slider-row">{t.hub}: {input.hubLimit} km
              <input type="range" min={50} max={400} step={10} value={input.hubLimit} onChange={(e) => set('hubLimit', Number(e.target.value))} />
            </label>
          </fieldset>

          <fieldset>
            <legend>{t.q5}</legend>
            <label className="slider-row priority-row">
              <span>{t.science} {Math.round((1 - input.alpha) * 100)} %</span>
              <input type="range" min={0} max={1} step={0.05} value={input.alpha} onChange={(e) => set('alpha', Number(e.target.value))} aria-label={`${t.science} / ${t.ops}`} />
              <span>{t.ops} {Math.round(input.alpha * 100)} %</span>
            </label>
            <button type="button" className="link-btn" onClick={() => setObjective(input.objective)}>{t.reset}</button>
          </fieldset>
          </details>
        </form>

        {/* ---------------- results ---------------- */}
        <div className="finder-results">
          <section className="match-panel">
            <div className="panel-title">{t.ranking} <TagChip tag="Interpreted" source="ml" /></div>
            <div className="rank-cards">
              {result?.sites.map((s, k) => (
                <button key={s.id} type="button" className="rank-card" data-label={s.label} data-selected={s.id === shownSite.id}
                  onClick={() => { if (input.region === 'all') setMapSite(s.id); }}>
                  <div className="rank-top"><span className="rank-n">{k + 1}</span><strong>{s.name}</strong><span className={`rank-badge rank-${s.label}`}>{labelOf[s.label]}</span></div>
                  <div className="rank-score" title={`${t.meanOf} · ${s.eligibleShare} % ${t.pass}`}>{s.score === null ? '—' : s.score}<small>/100</small></div>
                  <div className="rank-bar"><i style={{ width: `${s.score ?? 0}%` }} /></div>
                  <p className="map-caption">
                    <span className={`chk chk-${s.heat}`}>{s.heat === 'ok' ? t.heatOk : s.heat === 'fail' ? t.heatFail : 'TBD'}</span>{' '}
                    {fmt(s.tmax, '°C', 0)} · {fmt(s.hubKm, 'km', 0)} {t.hubKm}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <section className="match-panel">
            <div className="panel-title">{t.map} · {shownSite.name}</div>
            <div className="layer-row" role="group">
              {cells.sites.map((s) => (
                <button key={s.id} type="button" className="layer-btn" data-active={s.id === shownSite.id} disabled={input.region !== 'all' && input.region !== s.id}
                  onClick={() => setMapSite(s.id)}>{s.name}</button>
              ))}
            </div>
            <div className="match-map-box">
              <FinderMap bounds={shownSite.bounds} scores={siteScores} rows={cells.rows} cols={cells.cols} range={range} markers={markers} onPick={onPick} />
            </div>
            <div className="legend-row"><span className="legend-ramp finder-ramp" aria-hidden="true" /><span className="map-caption">{t.legend}</span></div>
            <div className="ref-row">
              {ref === null ? (
                <span className="map-caption"><Crosshair className="inline-icon" /> {t.pickHint}</span>
              ) : (
                <>
                  <span className="map-caption"><strong>{t.ref}:</strong> {siteName(refSite() ?? '')} ({cellLatLon(cells, ref).join(', ')}) · {t.unit}: {model.units[cells.unit[ref] ?? 0]?.name}</span>
                  <Button size="sm" variant="instrument" type="button" onClick={() => setShowSimilar(true)}>{t.findSimilar}</Button>
                  <button type="button" className="link-btn" onClick={() => { setRef(null); setShowSimilar(false); }}>{t.clearRef}</button>
                </>
              )}
            </div>
          </section>

          {showSimilar && similar.length > 0 && (
            <section className="match-panel">
              <div className="panel-title">{t.similar} <TagChip tag="Interpreted" source="ml" /></div>
              <p className="map-caption">{t.similarNote}</p>
              <label className="check-row"><input type="checkbox" checked={otherSites} onChange={(e) => setOtherSites(e.target.checked)} />{t.otherSites}</label>
              <ol className="spot-list">
                {similar.map((s) => (
                  <li key={s.index}>
                    <button type="button" className="spot-btn" onClick={() => { if (input.region === 'all') setMapSite(s.site); }}>
                      <strong>{s.similarity} %</strong> {siteName(s.site)} ({s.coords[0]}, {s.coords[1]}) · {model.units[cells.unit[s.index] ?? 0]?.name}
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="match-panel">
            <div className="panel-title">{t.spots} <TagChip tag="Hypothesis" source="ml" /></div>
            {!result || result.top.length === 0 ? (
              <p className="map-caption">{t.noSpots}</p>
            ) : (
              <ol className="spot-list">
                {result.top.slice(0, allSpots ? undefined : 4).map((s, k) => (
                  <li key={s.index}>
                    <button type="button" className="spot-btn" onClick={() => { if (input.region === 'all') setMapSite(s.site); }}>
                      <span className="spot-n">{k + 1}</span>
                      <span>
                        <strong>{siteName(s.site)}</strong> ({s.coords[0]}, {s.coords[1]}) · {t.score} <strong>{s.total}</strong>/100
                        <small>{t.why}: {s.why.slice(0, 2).map((c) => contributionText(c, featLabel(c.f), fr)).join('; ')}</small>
                        <small>{t.unit}: {model.units[s.unit]?.name ?? '—'}{s.materials !== null && ` · ${t.rock}: ${s.materials}/3`}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {result && result.top.length > 4 && (
              <button type="button" className="link-btn" onClick={() => setAllSpots((v) => !v)}>{allSpots ? t.less : t.more(result.top.length)}</button>
            )}
            {routeMsg && <p className="map-caption mock-note">{routeMsg}</p>}
            <div className="bench-actions">
              <Button variant="instrument" type="button" onClick={addToDossier} disabled={!result}><FileText />{added ? t.added : t.addDossier}</Button>
              <Button variant="mission" type="button" onClick={() => void planTraverse()}><RouteIcon />{t.traverse(shownSite.name)}<ArrowRight /></Button>
              <Button variant="ghost" asChild>
                <Link to="/mission/match" onClick={() => useMissionStore.setState({ selectedSite: shownSite.id })}>{t.next}<ArrowRight /></Link>
              </Button>
            </div>
          </section>

          <details className="match-panel how-box">
            <summary>{t.how}</summary>
            <p>{t.how1} <TagChip tag="Measured" source="ml" /></p>
            <ul className="fp-list">
              <li><span>{t.r2}</span><span>{Object.entries(sm.r2_block_cv_by_site).map(([k, v]) => `${siteName(k).split(' ')[0]} ${v}`).join(' · ')}</span></li>
              <li><span>{t.loso}</span><span>{Object.entries(sm.r2_leave_one_site_out).map(([k, v]) => `${siteName(k).split(' ')[0]} ${v}`).join(' · ')}</span></li>
              <li><span>{t.importance}</span><span>{sm.importance.slice(0, 3).map((i) => sm.predictor_labels[i.f] ?? i.f).join(', ')}</span></li>
            </ul>
            <p className="map-caption">{t.losoNote}</p>
            <p>{t.how2} ({model.units_model.k} units)</p>
            <p>{t.how3}</p>
            <p>{t.how4} <TagChip tag="Interpreted" source="team" /></p>
            <p className="map-caption">{t.limits}</p>
          </details>
        </div>
      </div>
    </div>
  );
}
