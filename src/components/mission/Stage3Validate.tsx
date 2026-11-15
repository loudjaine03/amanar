import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { computeFieldAccess, getMissionData } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useMissionStore } from '@/lib/mission-store';
import { useMl } from '@/lib/ml-data';
import { cellAt } from '@/lib/finder';
import { earthTestMassKg, G_EARTH, groundPressureKPa, isaPressureKPa, TARGET_ENV } from '@/lib/hardware';
import { COLD_C, CREW_CHECKLIST, delayPlan, fmtClock, loadGrid, monthRanges, planRoute, slopeAt, stage3Items, workableMonths, type GridFile } from '@/lib/stage3';
import type { CheckState, LatLon, Waypoint } from '@/types/mission';
import { useMissionTranslation } from './MissionShell';
import { TagChip } from './TagChip';
import { ValidateMap } from './ValidateMap';
import './mission-extras.css';

const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
} as const;

const TEXT = {
  en: {
    eyebrow: 'STEP 05 / REHEARSE', title: 'Rehearse', sub: 'Can a rover drive it, and can humans test there?',
    sensors: 'Simulated sensors', sensorsNote: 'Computed from our elevation model and your Hardware settings (step 04). Not real sensor readings.',
    elev: 'Elevation', baro: 'Air pressure', target: 'target', slopeNow: 'Slope under the wheels', wheelLoad: 'Load per wheel (test rover)', groundP: 'Ground pressure', details: 'details',
    loading: 'Loading mission data…', error: 'Mission data could not be loaded.', noSite: 'No site with a rover grid', toMatch: 'Go to Stage 02',
    noGrid: 'Slope grid not available yet', noGridSub: 'Run pipeline/build_all.py to make the grids.', mockGrid: 'MOCK SLOPE GRID: test terrain, not a measurement.',
    finderRoute: 'Traverse proposed by the Analog Finder (its top spots in this site).', defaultRoute: 'Use the default waypoints', sites: 'Site',
    click: 'Click the map to set the start point (default: landing point).', steep: 'That spot is steeper than the slope limit. Pick flatter ground.',
    plan: 'Plan route', drive: 'Drive', driving: 'Driving…', resetStart: 'Reset start',
    marsMode: (d: string, compressed: boolean, moon: boolean) => `${moon ? 'Moon' : 'Mars'} mode: ${d} signal delay${compressed ? ' (1 min = 1 s)' : ' (real time)'}`,
    slopeLimit: 'Slope limit', route: 'Route', length: 'Length', maxSlope: 'Max slope', noRoute: 'No safe route at this slope limit.',
    cantReach: (wp: string, lim: number) => `Cannot reach ${wp} with a ${lim}° limit. Raise the limit or move the start point.`,
    legend: 'Green to yellow: drivable. Red: steeper than the limit (wall).',
    waypoints: 'Waypoints', rehearses: 'Rehearses',
    log: 'Command log', logEmpty: 'Press Drive to send the first command.', signal: (s: number) => `Signal travelling… ${s} s left`,
    sent: (wp: string) => `sent "drive to ${wp}"`, arrived: (d: string) => `arrived (${d}) -> executing`, executing: 'executing', reached: (wp: string, tool: string) => `${wp} reached (${tool})`,
    done: 'traverse complete', autonomy: 'The rover must act on its own between commands: that is why Mars rovers are autonomous.',
    autonomyMoon: 'With about 1.3 s each way, the Moon can be driven from Earth almost live. Mars cannot.',
    access: 'Crew safety and access, preliminary', month: 'Month', heat: 'Heat limit', slopeRow: 'Route slope', heatRow: 'Heat (monthly max)', hubRow: 'Help: hub',
    coldRow: 'Night cold (monthly min)', caution: 'CAUTION', coldNote: 'Freezing nights: cold-weather shelter and sleep gear.', workable: 'Months a crew can work here (under the heat limit)', steepRow: 'Box steeper than 15°: keep crews on the route', checklist: 'Crew checklist (to plan on site)', words: { all: 'all year', none: 'none', to: 'to' },
    meets: 'MEETS OUR PLANNING ASSUMPTIONS', outside: 'OUTSIDE OUR ASSUMPTIONS: robot-only, or another season', tbd: 'NOT COMPUTED YET (TBD)',
    assumptions: (h: number, s: number, hub: number) => `Team assumptions: heat < ${h}°C, route slope < ${s}°, hub < ${hub} km.`,
    caveat: 'Straight-line distance is not road access, and climate averages are not a forecast.',
    warn1: 'Planning path on a 30 m elevation model, not a certified rover route.', warn2: 'A real deployment needs on-site assessment and further safety checks.',
    log2: 'Add to the Dossier', logged: 'Logged in the Dossier',
  },
  fr: {
    eyebrow: 'ÉTAPE 05 / RÉPÉTER', title: 'Répéter', sub: 'Un rover peut-il rouler ici, et des humains peuvent-ils tester sur place ?',
    sensors: 'Capteurs simulés', sensorsNote: 'Calculés à partir de notre modèle d’élévation et de tes réglages Matériel (étape 04). Pas de vraies mesures de capteurs.',
    elev: 'Altitude', baro: 'Pression de l’air', target: 'cible', slopeNow: 'Pente sous les roues', wheelLoad: 'Charge par roue (rover d’essai)', groundP: 'Pression au sol', details: 'détails',
    loading: 'Chargement des données de mission…', error: 'Impossible de charger les données de mission.', noSite: 'Aucun site avec une grille rover', toMatch: 'Aller à l’étape 02',
    noGrid: 'Grille de pente pas encore disponible', noGridSub: 'Lance pipeline/build_all.py pour produire les grilles.', mockGrid: 'GRILLE DE PENTE MOCK : terrain de test, pas une mesure.',
    finderRoute: 'Parcours proposé par l’Analog Finder (ses meilleurs points dans ce site).', defaultRoute: 'Revenir aux points par défaut', sites: 'Site',
    click: 'Clique sur la carte pour choisir le départ (par défaut : point d’atterrissage).', steep: 'Cet endroit est plus raide que la limite de pente. Choisis un sol plus plat.',
    plan: 'Planifier la route', drive: 'Rouler', driving: 'En route…', resetStart: 'Départ par défaut',
    marsMode: (d: string, compressed: boolean, moon: boolean) => `Mode ${moon ? 'Lune' : 'Mars'} : délai du signal de ${d}${compressed ? ' (1 min = 1 s)' : ' (temps réel)'}`,
    slopeLimit: 'Limite de pente', route: 'Route', length: 'Longueur', maxSlope: 'Pente max', noRoute: 'Aucune route sûre avec cette limite de pente.',
    cantReach: (wp: string, lim: number) => `Impossible d’atteindre ${wp} avec une limite de ${lim}°. Augmente la limite ou déplace le départ.`,
    legend: 'Vert à jaune : praticable. Rouge : plus raide que la limite (mur).',
    waypoints: 'Points de passage', rehearses: 'Répète',
    log: 'Journal de commandes', logEmpty: 'Appuie sur Rouler pour envoyer la première commande.', signal: (s: number) => `Signal en route… ${s} s restantes`,
    sent: (wp: string) => `envoyé « rouler vers ${wp} »`, arrived: (d: string) => `arrivé (${d}) -> exécution`, executing: 'exécution', reached: (wp: string, tool: string) => `${wp} atteint (${tool})`,
    done: 'parcours terminé', autonomy: 'Le rover doit agir seul entre deux commandes : c’est pourquoi les rovers martiens sont autonomes.',
    autonomyMoon: 'Avec environ 1,3 s dans chaque sens, la Lune peut être pilotée depuis la Terre presque en direct. Pas Mars.',
    access: 'Sécurité de l’équipe et accès, préliminaire', month: 'Mois', heat: 'Limite de chaleur', slopeRow: 'Pente de la route', heatRow: 'Chaleur (max mensuel)', hubRow: 'Secours : base',
    coldRow: 'Froid nocturne (min mensuel)', caution: 'ATTENTION', coldNote: 'Nuits sous zéro : abri et matériel de couchage pour le froid.', workable: 'Mois où une équipe peut travailler ici (sous la limite de chaleur)', steepRow: 'Zone plus raide que 15° : garder l’équipe sur la route', checklist: 'Liste de contrôle de l’équipe (à préparer sur place)', words: { all: 'toute l’année', none: 'aucun', to: 'à' },
    meets: 'RESPECTE NOS HYPOTHÈSES DE PLANIFICATION', outside: 'HORS DE NOS HYPOTHÈSES : robot seulement, ou autre saison', tbd: 'PAS ENCORE CALCULÉ (TBD)',
    assumptions: (h: number, s: number, hub: number) => `Hypothèses d’équipe : chaleur < ${h}°C, pente de la route < ${s}°, base < ${hub} km.`,
    caveat: 'La distance à vol d’oiseau n’est pas un accès routier, et les moyennes climatiques ne sont pas une prévision.',
    warn1: 'Chemin planifié sur un modèle d’élévation de 30 m, pas une route de rover certifiée.', warn2: 'Un vrai déploiement exige une évaluation sur place et d’autres contrôles de sécurité.',
    log2: 'Ajouter au Dossier', logged: 'Ajouté au Dossier',
  },
} as const;

interface LogEntry { id: number; clock: string; text: string }
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Étape 03 : A* dans le navigateur, rover avec délai Terre-Mars, accès terrain préliminaire. */
export function Stage3Validate() {
  const { language } = useMissionTranslation();
  const t = TEXT[language];
  const data = useMissionStore((s) => s.missionData);
  const selectedSite = useMissionStore((s) => s.selectedSite);
  const landingStore = useMissionStore((s) => s.landing);
  const marsMode = useMissionStore((s) => s.marsMode);
  const slopeLimit = useMissionStore((s) => s.slopeLimit);
  const heatLimit = useMissionStore((s) => s.heatLimit);
  const month = useMissionStore((s) => s.month);
  const scenario = useMissionStore((s) => s.scenario);
  const customRoute = useMissionStore((s) => s.customRoute);
  const roverSpec = useMissionStore((s) => s.roverSpec);
  const ml = useMl();
  const [failed, setFailed] = useState(false);
  const [grid, setGrid] = useState<GridFile | 'missing' | null>(null);
  const [rover, setRover] = useState<LatLon | null>(null);
  const [driving, setDriving] = useState(false);
  const [signal, setSignal] = useState<number | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pickMsg, setPickMsg] = useState(false);
  const [logged, setLogged] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    if (data) return;
    getMissionData().then((missionData) => useMissionStore.setState({ missionData })).catch(() => setFailed(true));
  }, [data]);

  const sc = data?.scenarios[scenario];
  const candidates = sc?.candidates ?? [];
  const site =
    candidates.find((c) => c.id === selectedSite && c.rover) ??
    candidates.find((c) => c.role.includes('case study') && c.rover) ??
    candidates.find((c) => c.rover) ??
    null;
  const delay = sc ? delayPlan(sc.delay) : delayPlan({ one_way_s: 660, label: '', tag: 'Measured', source: 'astropy' });
  const isMoon = sc?.body === 'moon';
  const rv = site?.rover ?? null;
  const gridUrl = rv?.grid ?? null;
  const siteId = site?.id ?? null;
  const defaultLimit = rv?.slope_limit_deg ?? null;

  useEffect(() => {
    if (defaultLimit !== null) useMissionStore.getState().setSlopeLimit(defaultLimit);
  }, [siteId, defaultLimit]);
  useEffect(() => {
    if (!gridUrl) return;
    let cancelled = false;
    void loadGrid(gridUrl).then((g) => !cancelled && setGrid(g));
    return () => { cancelled = true; };
  }, [gridUrl]);
  useEffect(() => () => { run.current += 1; }, []);

  const landing: LatLon | null = landingStore ?? rv?.landing ?? null;
  const useCustom = !!(customRoute && site && customRoute.scenario === scenario && customRoute.site === site.id && customRoute.points.length);
  const wps: Waypoint[] = useMemo(
    () =>
      useCustom && customRoute
        ? customRoute.points.map((p, i) => ({ id: `F-0${i + 1}`, coords: p.coords, title: p.label, inspect: '', tool: 'Analog Finder spot', tag: 'Hypothesis' as const }))
        : (rv?.waypoints ?? []),
    [useCustom, customRoute, rv],
  );
  const plan = useMemo(
    () => (grid && grid !== 'missing' && landing ? planRoute(grid, slopeLimit, landing, wps.map((w) => w.coords)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grid, slopeLimit, landing?.[0], landing?.[1], wps],
  );

  // Une nouvelle route annule la conduite en cours.
  useEffect(() => {
    run.current += 1;
    setRover(null); setDriving(false); setSignal(null); setLog([]); setLogged(false);
    useMissionStore.setState({
      route: plan?.ok ? plan.points : null,
      routeStats: plan?.ok && plan.maxSlopeDeg !== null ? { lengthKm: plan.km, maxSlopeDeg: plan.maxSlopeDeg } : null,
    });
  }, [plan]);

  const onPick = useCallback(
    (p: LatLon) => {
      if (!grid || grid === 'missing') return;
      const [[s, w], [n, e]] = grid.bounds;
      if (p[0] < s || p[0] > n || p[1] < w || p[1] > e) return;
      if (slopeAt(grid, p) > slopeLimit) { setPickMsg(true); return; }
      setPickMsg(false);
      useMissionStore.getState().setLanding(p);
    },
    [grid, slopeLimit],
  );

  const drive = async () => {
    if (!plan?.ok || driving) return;
    const id = ++run.current;
    const alive = () => run.current === id;
    const t0 = new Date();
    let minutes = 0;
    const push = (text: string) => setLog((l) => [...l, { id: l.length, clock: fmtClock(t0, minutes, !delay.compressed), text }]);
    setLog([]); setDriving(true); setRover(plan.points[0] ?? null);
    let from = 0;
    for (let i = 0; i < wps.length; i++) {
      const wp = wps[i]!;
      push(t.sent(wp.id));
      if (marsMode) {
        for (let k = delay.ticks; k > 0; k--) {
          setSignal(delay.compressed ? k : Math.round((delay.tickMs / 1000) * 10) / 10);
          await sleep(delay.tickMs);
          if (!alive()) return;
        }
        setSignal(null);
        minutes += delay.simMinutes;
        push(t.arrived(delay.short));
      } else push(t.executing);
      const to = plan.wpIndex[i] ?? plan.points.length - 1;
      const seg = plan.points.slice(from, to + 1);
      const step = Math.max(1, Math.ceil(seg.length / 60));
      for (let k = 0; k < seg.length; k += step) {
        setRover(seg[k] as LatLon);
        await sleep(45);
        if (!alive()) return;
      }
      setRover(seg[seg.length - 1] as LatLon);
      push(t.reached(wp.id, wp.tool));
      from = to;
    }
    push(t.done);
    setDriving(false);
  };

  if (!data || !site || !rv || !landing) {
    return (
      <div className="foundation-page">
        <div className="eyebrow">{t.eyebrow}</div>
        <h1>{t.title}</h1>
        <div className="empty-state">
          {data && !site ? (<><p>{t.noSite}</p><Button variant="mission" asChild><Link to="/mission/match">{t.toMatch}<ArrowRight /></Link></Button></>) : <p>{failed ? t.error : t.loading}</p>}
        </div>
      </div>
    );
  }

  const safety = site.earth_field_safety;
  const tmax = safety.monthly_tmax_c[month - 1] ?? null;
  const access = computeFieldAccess({
    maxSlopeDeg: plan?.ok ? plan.maxSlopeDeg : null, slopeLimitDeg: slopeLimit,
    tmaxC: tmax, heatLimitC: heatLimit, hubKm: safety.nearest_hub.distance_km, hubLimitKm: safety.assumptions.hub_km,
  });
  const monthName = MONTHS[language][month - 1] ?? '';
  const tmin = safety.monthly_tmin_c?.[month - 1] ?? null;
  const coldState = tmin === null ? 'tbd' : tmin < COLD_C ? 'warn' : 'ok';
  const workable = workableMonths(safety.monthly_tmax_c, heatLimit);
  const workableText = monthRanges(workable, MONTHS[language], t.words);
  const workableEn = monthRanges(workable, MONTHS.en);
  const steepShare = site.metrics.find((m) => m.key === 'steep_share')?.value ?? null;
  const checkText = (c: CheckState) => (c === 'ok' ? 'OK' : c === 'fail' ? 'NOT OK' : 'TBD');
  const verdictText = access.verdict === 'meets' ? t.meets : access.verdict === 'outside' ? t.outside : t.tbd;
  const store = useMissionStore.getState();
  const addToDossier = () => {
    if (!plan) return;
    store.setStageItems(3, stage3Items({ site, plan, slopeLimit, heatLimit, month, monthName: MONTHS.en[month - 1] ?? '', tmaxC: tmax, access, marsMode, delay: sc?.delay, body: sc?.body, tminC: tmin, workable: workableEn }));
    setLogged(true);
  };
  const failedWp = plan && !plan.ok && plan.failedLeg !== null ? wps[plan.failedLeg]?.id ?? '' : '';
  // simulated sensor feed at the rover (or the start point)
  const here: LatLon = rover ?? landing;
  const cell = ml.status === 'ok' ? cellAt(ml.cells, here) : null;
  const elevHere = cell !== null && ml.status === 'ok' ? (ml.cells.values['elev']?.[cell] ?? null) : null;
  const slopeHere = grid && grid !== 'missing' ? slopeAt(grid, here) : null;
  const body = sc?.body ?? 'mars';
  const testMass = earthTestMassKg(roverSpec.massKg, body);
  const cosT = Math.cos(((slopeHere ?? 0) * Math.PI) / 180);
  const wheelN = (testMass * G_EARTH * cosT) / Math.max(1, roverSpec.wheels);
  const gp = groundPressureKPa({ ...roverSpec, massKg: testMass * cosT }, G_EARTH);

  return (
    <div className="foundation-page match-page">
      <div className="eyebrow">{t.eyebrow}</div>
      <h1>{t.title}</h1>
      <p className="bench-sub">{t.sub} · {site.name}</p>
      <div className="layer-row site-switch" role="group" aria-label={t.sites}>
        {candidates.filter((c) => c.rover).map((c) => (
          <button key={c.id} type="button" className="layer-btn" data-active={c.id === site.id} aria-pressed={c.id === site.id} disabled={driving}
            onClick={() => useMissionStore.setState({ selectedSite: c.id, landing: null })}>
            {c.name}{c.verdict ? ` · ${c.verdict}` : ''}
          </button>
        ))}
      </div>
      {useCustom && (
        <p className="map-caption finder-note">{t.finderRoute} <button type="button" className="link-btn" onClick={() => store.setCustomRoute(null)}>{t.defaultRoute}</button></p>
      )}

      <div className="match-grid val-grid">
        <section className="match-panel">
          {grid === 'missing' ? (
            <div className="swipe-box swipe-missing"><strong>{t.noGrid}</strong><span>{t.noGridSub}</span></div>
          ) : grid ? (
            <>
              <div className="match-map-box val-map">
                <ValidateMap bounds={grid.bounds} grid={grid} limit={slopeLimit} start={landing} waypoints={wps} route={plan?.ok ? plan.points : []} rover={rover} onPick={onPick} />
              </div>
              <p className="map-caption">{t.click} {t.legend}</p>
              {grid.mock && <p className="map-caption mock-note">{t.mockGrid}</p>}
              {pickMsg && <p className="map-caption mock-note">{t.steep}</p>}
              {plan && !plan.ok && <p className="map-caption mock-note">{failedWp ? t.cantReach(failedWp, slopeLimit) : t.noRoute}</p>}
            </>
          ) : (
            <div className="match-map match-map-wait">…</div>
          )}
          <div className="bench-actions val-actions">
            <Button variant="instrument" onClick={() => setLanding(null)} disabled={landingStore === null}>{t.resetStart}</Button>
            <Button variant="instrument" onClick={() => setPlanTick()}>{t.plan}</Button>
            <Button variant="mission" onClick={() => void drive()} disabled={!plan?.ok || driving}>{driving ? t.driving : t.drive}</Button>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={marsMode} onChange={(e) => store.setMarsMode(e.target.checked)} disabled={driving} />
            {t.marsMode(delay.short, delay.compressed, isMoon)}
          </label>
          <label className="slider-row">
            {t.slopeLimit}: {slopeLimit}°
            <input type="range" min={3} max={30} step={1} value={slopeLimit} disabled={driving} onChange={(e) => store.setSlopeLimit(Number(e.target.value))} />
          </label>
          <p className="map-caption">{t.warn1}</p>
        </section>

        <aside className="val-side">
          <section className="match-panel">
            <div className="panel-title">{t.route}</div>
            {plan?.ok ? (
              <ul className="fp-list">
                <li><span>{t.length}</span><span>{fmt(plan.km, 'km')}</span><TagChip tag={grid && grid !== 'missing' && grid.mock ? 'Hypothesis' : 'Interpreted'} source="cop_dem" /></li>
                <li><span>{t.maxSlope}</span><span>{fmt(plan.maxSlopeDeg, '°')}</span><TagChip tag={grid && grid !== 'missing' && grid.mock ? 'Hypothesis' : 'Measured'} source="cop_dem" /></li>
              </ul>
            ) : <p className="map-caption">{plan ? t.noRoute : '…'}</p>}
            <div className="panel-title wp-title">{t.waypoints}</div>
            <ul className="audit-list">
              {wps.map((w) => (
                <li key={w.id}>
                  <span><strong>{w.id}</strong> {w.title} <TagChip tag={w.tag} source="team" /></span>
                  <span className="map-caption">{t.rehearses}: {w.tool}</span>
                  {(w.inspect || w.why) && (
                    <details className="wp-details"><summary>{t.details}</summary>
                      {w.inspect && <span className="map-caption">{w.inspect}</span>}
                      {w.why && <span className="map-caption wp-why">{w.why}</span>}
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="match-panel sensor-panel">
            <div className="panel-title"><Radio className="inline-icon" /> {t.sensors} <TagChip tag="Interpreted" source="isa" /></div>
            <div className="sensor-grid">
              <div><small>{t.elev}</small><b>{elevHere === null ? 'TBD' : `${elevHere} m`}</b></div>
              <div><small>{t.baro}</small><b>{elevHere === null ? 'TBD' : `${isaPressureKPa(elevHere).toFixed(1)} kPa`}</b><em>{t.target} {body === 'moon' ? '≈ 0' : TARGET_ENV.mars.pressureKPa} kPa</em></div>
              <div><small>{t.slopeNow}</small><b>{fmt(slopeHere, '°')}</b></div>
              <div><small>{t.wheelLoad}</small><b>{Math.round(wheelN)} N</b><em>{Math.round(testMass)} kg rover</em></div>
              <div><small>{t.groundP}</small><b>{gp.toFixed(1)} kPa</b></div>
            </div>
            <p className="map-caption">{t.sensorsNote}</p>
          </section>

          <section className="match-panel">
            <div className="panel-title">{t.access}</div>
            <div className="access-controls">
              <label className="slider-row">{t.month}
                <select value={month} onChange={(e) => store.setMonth(Number(e.target.value))}>
                  {MONTHS[language].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </label>
              <label className="slider-row">{t.heat}: {heatLimit}°C
                <input type="range" min={25} max={50} step={1} value={heatLimit} onChange={(e) => store.setHeatLimit(Number(e.target.value))} />
              </label>
            </div>
            <ul className="fp-list access-list">
              <li><span>{t.slopeRow}: {fmt(plan?.ok ? plan.maxSlopeDeg : null, '°')} / {slopeLimit}°</span><span className={`chk chk-${access.slope}`}>{checkText(access.slope)}</span></li>
              <li><span>{t.heatRow}: {fmt(tmax, '°C', 0)} / {heatLimit}°C</span><span className={`chk chk-${access.heat}`}>{checkText(access.heat)}</span></li>
              <li><span>{t.hubRow} {safety.nearest_hub.name}: {fmt(safety.nearest_hub.distance_km, 'km', 0)} / {safety.assumptions.hub_km} km</span><span className={`chk chk-${access.logistics}`}>{checkText(access.logistics)}</span></li>
              <li><span>{t.coldRow}: {fmt(tmin, '°C', 0)}</span><span className={`chk chk-${coldState}`}>{coldState === 'warn' ? t.caution : checkText(coldState)}</span></li>
            </ul>
            <div className={`verdict-box verdict-${access.verdict}`}>{verdictText} <TagChip tag="Interpreted" source="team" /></div>
            {coldState === 'warn' && <p className="map-caption mock-note">{t.coldNote}</p>}
            <p className="crew-line"><small>{t.workable}</small><strong>{workableText}</strong></p>
            {steepShare !== null && <p className="crew-line"><small>{t.steepRow}</small><strong>{fmt(steepShare, '%')}</strong></p>}
            <details className="rules-box">
              <summary>{t.checklist}</summary>
              <ul>{CREW_CHECKLIST.map((c) => <li key={c}>{c}</li>)}</ul>
            </details>
            <p className="map-caption">{t.assumptions(heatLimit, slopeLimit, safety.assumptions.hub_km)}</p>
            <p className="map-caption">{t.caveat}</p>
            <p className="map-caption">{t.warn2}</p>
          </section>
        </aside>
      </div>

      <section className="match-panel anomaly-panel">
        <div className="panel-title"><Radio className="inline-icon" /> {t.log}</div>
        {signal !== null && <p className="map-caption signal-note">{t.signal(signal)}</p>}
        {log.length === 0 ? <p className="map-caption">{t.logEmpty}</p> : (
          <ul className="cmd-log">{log.map((l) => <li key={l.id}><span>{l.clock}</span> {l.text}</li>)}</ul>
        )}
        {marsMode && <p className="map-caption">{isMoon ? t.autonomyMoon : t.autonomy}</p>}
      </section>

      <div className="bench-actions">
        <Button variant="mission" onClick={addToDossier} disabled={!plan}>{t.log2}</Button>
        {logged && <span className="map-caption">{t.logged}</span>}
      </div>
    </div>
  );

  function setLanding(p: LatLon | null) { setPickMsg(false); store.setLanding(p); }
  function setPlanTick() {
    // « Plan route » : annule la conduite en cours, remet le rover au départ et vide le journal.
    run.current += 1;
    setRover(null); setDriving(false); setSignal(null); setLog([]);
  }
}
