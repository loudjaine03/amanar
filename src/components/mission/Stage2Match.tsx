import { useEffect, useMemo, useState } from 'react';
import { Link, useHydrated } from '@tanstack/react-router';
import { ArrowRight, ImageOff, Sparkles } from 'lucide-react';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Legend } from 'recharts';
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';
import { Button } from '@/components/ui/button';
import { getMissionData } from '@/lib/api';
import { fmt } from '@/lib/format';
import { computeVerdicts, PARTIAL_SHARE, radarData, siteScore, stage2Items, type MatchLayer } from '@/lib/match';
import { useModel } from '@/lib/ml-data';
import { useMissionStore } from '@/lib/mission-store';
import type { Candidate, Verdict } from '@/types/mission';
import { useMissionTranslation } from './MissionShell';
import { MatchMap } from './MatchMap';
import { TagChip } from './TagChip';
import { useImageStatus } from './useImageStatus';
import './mission-extras.css';

const TEXT = {
  en: {
    eyebrow: 'STEP 03 / COMPARE', title: 'Compare', sub: 'Which Algerian site fits best, and what is under the sand?',
    tabs: { map: 'Map', score: 'Score', limits: 'Limits' }, next: 'Step 04: Hardware', totals: 'All three sites',
    loading: 'Loading mission data…', error: 'Mission data could not be loaded.',
    caseStudy: 'best match', notScored: 'not scored yet', box: '20 km site box',
    layers: { optical: 'Satellite photo', c_band: 'C-band', l_band: 'L-band radar', classes: 'Terrain types (AI)', surprise: 'Radar surprise (AI)' },
    anomalies: 'Radar-surprise hotspots', opacity: 'Opacity', noImage: 'Image not available yet', noImageSub: 'Run pipeline/build_all.py to make this layer.',
    swipe: 'Optical vs L-band radar', optical: 'Optical', lband: 'L-band radar', drag: 'Drag to compare', radarSees: 'What radar sees',
    swipeMissing: 'The swipe needs both the optical and the L-band image. Not available yet.',
    fingerprint: 'Analogy Fingerprint', target: 'Target', site: 'This site', scoresTbd: 'Scores TBD: no site shape drawn yet.',
    audit: 'Analogy audit', transfers: 'What transfers', breaks: 'Where it breaks', auditNote: 'Every line carries a tag.',
    rule: (p: number) => `Badges are computed from the six scores (0 to 3 each). Highest total = STRONGEST. Others with at least ${p}% of the target total = PARTIAL, below = WEAK. Team assumption.`,
    rules: 'How each axis is scored', x2: 'counts x2',
    anomalyList: 'Radar-surprise hotspots (candidate areas, not confirmed structures)', noAnomalies: 'None above the threshold.',
    log: 'Add this site to the Dossier', logged: 'Logged in the Dossier', use: 'Use this site for Stage 03', finder: 'Find the best spots inside this site',
    metrics: { mean_slope: 'slope', relief: 'relief', anomalies: 'hotspots' },
    surpriseLegend: 'Warm: L-band brighter than the surface predicts (candidate buried structure). Cool: darker. Clear: as expected.',
    unitsLegend: 'Terrain units found by a Gaussian mixture on all 7,500 cells of the three sites (names are our reading).',
  },
  fr: {
    eyebrow: 'ÉTAPE 03 / COMPARER', title: 'Comparer', sub: 'Quel site algérien convient le mieux, et que cache le sable ?',
    tabs: { map: 'Carte', score: 'Score', limits: 'Limites' }, next: 'Étape 04 : Matériel', totals: 'Les trois sites',
    loading: 'Chargement des données de mission…', error: 'Impossible de charger les données de mission.',
    caseStudy: 'meilleur choix', notScored: 'pas encore noté', box: 'zone de 20 km',
    layers: { optical: 'Photo satellite', c_band: 'Bande C', l_band: 'Radar bande L', classes: 'Types de terrain (IA)', surprise: 'Surprise radar (IA)' },
    anomalies: 'Points chauds de surprise radar', opacity: 'Opacité', noImage: 'Image pas encore disponible', noImageSub: 'Lance pipeline/build_all.py pour produire cette couche.',
    swipe: 'Optique vs radar bande L', optical: 'Optique', lband: 'Radar bande L', drag: 'Glisse pour comparer', radarSees: 'Ce que voit le radar',
    swipeMissing: 'Le curseur a besoin des deux images (optique et bande L). Pas encore disponibles.',
    fingerprint: 'Empreinte d’analogie', target: 'Cible', site: 'Ce site', scoresTbd: 'Scores TBD : pas encore de forme pour le site.',
    audit: 'Audit de l’analogie', transfers: 'Ce qui se transfère', breaks: 'Où l’analogie casse', auditNote: 'Chaque ligne porte un tag.',
    rule: (p: number) => `Les badges sont calculés à partir des six scores (0 à 3). Total le plus haut = STRONGEST. Les autres avec au moins ${p} % du total de la cible = PARTIAL, en dessous = WEAK. Hypothèse d’équipe.`,
    rules: 'Comment chaque axe est noté', x2: 'compte double',
    anomalyList: 'Points chauds de surprise radar (zones candidates, pas des structures confirmées)', noAnomalies: 'Aucun au-dessus du seuil.',
    log: 'Ajouter ce site au Dossier', logged: 'Ajouté au Dossier', use: 'Utiliser ce site pour l’étape 03', finder: 'Trouver les meilleurs points dans ce site',
    metrics: { mean_slope: 'pente', relief: 'relief', anomalies: 'points chauds' },
    surpriseLegend: 'Chaud : bande L plus brillante que ce que prédit la surface (structure enfouie candidate). Froid : plus sombre. Transparent : comme prévu.',
    unitsLegend: 'Unités de terrain trouvées par un mélange gaussien sur les 7 500 cellules des trois sites (les noms sont notre lecture).',
  },
} as const;

const SHOWN_LAYERS: MatchLayer[] = ['optical', 'l_band', 'surprise', 'classes'];
const BADGE_CLASS: Record<Verdict, string> = { STRONGEST: 'badge-strong', PARTIAL: 'badge-partial', WEAK: 'badge-weak' };
const shortMetric = (c: Candidate, key: string) => c.metrics.find((m) => m.key === key);

/** Stage 02: compare the 3 Algerian sites for the active scenario (maps, layers, swipe, fingerprint, audit). */
export function Stage2Match() {
  const { language } = useMissionTranslation();
  const t = TEXT[language];
  const hydrated = useHydrated();
  const scenario = useMissionStore((s) => s.scenario);
  const data = useMissionStore((s) => s.missionData);
  const layer = useMissionStore((s) => s.layer);
  const opacity = useMissionStore((s) => s.opacity);
  const showAnomalies = useMissionStore((s) => s.showAnomalies);
  const selectedSite = useMissionStore((s) => s.selectedSite);
  const ml = useModel();
  const [failed, setFailed] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);
  const [tab, setTab] = useState<'map' | 'score' | 'limits'>('map');

  useEffect(() => {
    if (data) return;
    getMissionData()
      .then((missionData) => useMissionStore.setState({ missionData }))
      .catch(() => setFailed(true));
  }, [data]);

  const sc = data?.scenarios[scenario];
  const candidates = useMemo(() => sc?.candidates ?? [], [sc]);
  const verdicts = useMemo(() => computeVerdicts(candidates), [candidates]);
  const site =
    candidates.find((c) => c.id === (viewId ?? selectedSite)) ?? candidates.find((c) => c.role.includes('case study')) ?? candidates[0];

  const layerStatus = useImageStatus(site?.layers[layer]);
  const anomStatus = useImageStatus(site?.layers.anomalies);
  const opticalStatus = useImageStatus(site?.layers.optical);
  const lbandStatus = useImageStatus(site?.layers.l_band);

  if (!data || !sc || !site) {
    return (
      <div className="foundation-page">
        <div className="eyebrow">{t.eyebrow}</div>
        <h1>{t.title}</h1>
        <div className="empty-state"><p>{failed ? t.error : t.loading}</p></div>
      </div>
    );
  }

  const verdict = verdicts[site.id] ?? { verdict: null, reason: '' };
  const score = siteScore(site);
  const hasSiteShape = site.fingerprint.length > 0 && site.fingerprint.every((f) => f.site !== null);
  const chosen = selectedSite === site.id;
  const choose = (id: string) => () => { setViewId(id); setLogged(false); };
  const log = (andGo: boolean) => () => {
    const st = useMissionStore.getState();
    st.setStageItems(2, stage2Items(site, verdict));
    useMissionStore.setState({ auditAdded: true });
    if (andGo) useMissionStore.setState({ selectedSite: site.id, customRoute: null, landing: null });
    setLogged(true);
  };
  const toFinder = () => {
    const st = useMissionStore.getState();
    const prev = st.finderInput;
    st.setFinderInput({
      scenario, objective: sc.default_objective, region: site.id, slopeLimit: prev?.slopeLimit ?? 15, mustDrive: prev?.mustDrive ?? true,
      month: st.month, heatLimit: st.heatLimit, hubLimit: prev?.hubLimit ?? 250, alpha: prev?.alpha ?? 0.25,
    });
  };
  const layerUrl = site.layers[layer] ?? null;
  const layerOk = layerStatus === 'ok';
  const anomOk = showAnomalies && anomStatus === 'ok';

  return (
    <div className="foundation-page match-page">
      <div className="eyebrow">{t.eyebrow}</div>
      <h1>{t.title}</h1>
      <p className="bench-sub">{t.sub}</p>
      <p className="bench-question">{sc.question}</p>

      <div className="site-cards" role="radiogroup" aria-label="Sites">
        {candidates.map((c) => {
          const v = verdicts[c.id];
          const s = siteScore(c);
          const slope = shortMetric(c, 'mean_slope');
          const relief = shortMetric(c, 'relief');
          const an = shortMetric(c, 'anomalies');
          return (
            <button key={c.id} type="button" role="radio" aria-checked={c.id === site.id} data-selected={c.id === site.id} className="site-card" onClick={choose(c.id)}>
              <div className="site-card-top">
                <strong>{c.name}</strong>
                {c.role.includes('case study') && <span className="pill">{t.caseStudy}</span>}
              </div>
              <div className="site-card-metrics">
                {t.metrics.mean_slope} {fmt(slope?.value, '°')} · {t.metrics.relief} {fmt(relief?.value, 'm', 0)} · {t.metrics.anomalies} {fmt(an?.value, '%', 2)}
              </div>
              <div className="site-card-bottom">
                {v?.verdict ? (
                  <span className={`verdict-badge ${BADGE_CLASS[v.verdict]}`}>{v.verdict}</span>
                ) : (
                  <span className="verdict-badge badge-none">{t.notScored}</span>
                )}
                {s.total !== null && <span className="map-caption">{s.total}/{s.max}</span>}
              </div>
            </button>
          );
        })}
      </div>
      <div className="tab-row" role="tablist">
        {(['map', 'score', 'limits'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} data-active={tab === k} className="tab-btn" onClick={() => setTab(k)}>{t.tabs[k]}</button>
        ))}
      </div>

      {tab === 'map' && (<>
      <div className="match-grid">
        <section className="match-panel">
          <div className="layer-row" role="group" aria-label="Layer">
            {SHOWN_LAYERS.map((l: MatchLayer) => (
              <button key={l} type="button" className="layer-btn" data-active={layer === l} aria-pressed={layer === l} onClick={() => useMissionStore.getState().setLayer(l)}>
                {t.layers[l]}
              </button>
            ))}
          </div>
          <div className="match-map-box">
            <MatchMap
              bounds={site.bounds}
              layerUrl={layerOk ? layerUrl : null}
              opacity={opacity}
              anomaliesUrl={anomOk ? site.layers.anomalies : null}
              anomalies={showAnomalies ? site.anomalies : null}
            />
            {layerStatus === 'missing' && (
              <div className="img-missing"><ImageOff /><strong>{t.noImage}</strong><span>{t.noImageSub}</span></div>
            )}
          </div>
          {layer === 'surprise' && (
            <div className="legend-row"><span className="legend-ramp" aria-hidden="true" /><span className="map-caption">{t.surpriseLegend}</span> <TagChip tag="Interpreted" source="ml" /></div>
          )}
          {layer === 'classes' && ml.status === 'ok' && (
            <div className="legend-units">
              {ml.model.units.map((u) => (
                <span key={u.id} className="unit-chip"><i style={{ background: u.color }} />{u.name}</span>
              ))}
              <p className="map-caption">{t.unitsLegend} <TagChip tag="Interpreted" source="ml" /></p>
            </div>
          )}
          <div className="match-controls">
            <label className="check-row">
              <input type="checkbox" checked={showAnomalies} onChange={(e) => useMissionStore.getState().setShowAnomalies(e.target.checked)} />
              {t.anomalies}
            </label>
            <span className="map-caption">{t.box}</span>
          </div>
          <label className="slider-row">
            {t.opacity} {Math.round(opacity * 100)}%
            <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => useMissionStore.getState().setOpacity(Number(e.target.value))} />
          </label>
        </section>

        <section className="match-panel">
          <div className="panel-title">{t.swipe}</div>
          {hydrated && opticalStatus === 'ok' && lbandStatus === 'ok' ? (
            <div className="swipe-box">
              <ReactCompareSlider
                itemOne={<ReactCompareSliderImage src={site.layers.optical} alt={t.optical} />}
                itemTwo={<ReactCompareSliderImage src={site.layers.l_band} alt={t.lband} />}
              />
              <span className="swipe-label left">{t.optical}</span>
              <span className="swipe-label right">{t.lband}</span>
            </div>
          ) : (
            <div className="swipe-box swipe-missing">
              <ImageOff />
              <strong>{opticalStatus === 'loading' || lbandStatus === 'loading' ? '…' : t.noImage}</strong>
              <span>{t.swipeMissing}</span>
            </div>
          )}
          <p className="map-caption">{t.drag} · “{t.radarSees}”</p>
        </section>
      </div>

      <details className="match-panel anomaly-panel">
        <summary className="panel-title">{t.anomalyList} ({site.anomalies.length})</summary>
        {site.anomalies.length === 0 ? (
          <p className="map-caption">{t.noAnomalies}</p>
        ) : (
          <ul className="audit-list">
            {site.anomalies.map((a) => (
              <li key={a.id}><TagChip tag="Interpreted" source="ml" /> <span><strong>{a.id}</strong> ({a.coords[0]}, {a.coords[1]}): {a.note}</span></li>
            ))}
          </ul>
        )}
      </details>
      </>)}

      {tab === 'score' && (
      <div className="match-grid">
        <section className="match-panel">
          <div className="panel-title">
            {t.fingerprint} {score.total !== null && <span className="map-caption">{score.total}/{score.max}</span>}
          </div>
          <div className="radar-box">
            {hydrated && (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData(site)} outerRadius="62%">
                  <PolarGrid stroke="#475569" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <PolarRadiusAxis domain={[0, 3]} tickCount={4} tick={false} axisLine={false} />
                  <Radar name={t.target} dataKey="target" stroke="#94a3b8" strokeDasharray="4 3" fill="#94a3b8" fillOpacity={0.08} />
                  {hasSiteShape && <Radar name={t.site} dataKey="site" stroke="#2dd4bf" fill="#2dd4bf" fillOpacity={0.3} />}
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
          {!hasSiteShape && <p className="map-caption">{t.scoresTbd}</p>}
          <ul className="fp-list fp-detail">
            {site.fingerprint.map((f) => (
              <li key={f.axis}>
                <span>
                  <span className="fp-name">{f.axis}{(f.weight ?? 1) > 1 && <em className="fp-weight"> · {t.x2}</em>}</span>
                  {f.basis && <small className="fp-basis">{f.basis}</small>}
                </span>
                <span>{f.site === null ? 'TBD' : `${f.site}/3`}</span>
                <TagChip tag={f.tag} source={f.source ?? 'team'} />
              </li>
            ))}
          </ul>
          <p className="map-caption">{verdict.verdict ? `${site.name}: ${verdict.reason}` : ''}</p>
          <details className="rules-box">
            <summary>{t.rules}</summary>
            <ul>
              {Object.entries(sc.rules).map(([axis, rule]) => (
                <li key={axis}><strong>{axis}:</strong> {rule}</li>
              ))}
            </ul>
          </details>
        </section>
        <section className="match-panel score-side">
          <div className="panel-title">{t.totals}</div>
          <div className="p-bars">
            {candidates.map((c) => {
              const s2 = siteScore(c);
              return (
                <div className="p-bar" key={c.id} data-selected={c.id === site.id}>
                  <span>{c.name}</span><i style={{ width: `${s2.total === null ? 0 : (s2.total / s2.max) * 100}%` }} /><b>{s2.total ?? 'TBD'}/{s2.max}</b>
                </div>
              );
            })}
          </div>
          <p className="map-caption">{t.rule(PARTIAL_SHARE * 100)} {sc.weighting}</p>
        </section>
      </div>
      )}

      {tab === 'limits' && (
      <div className="match-grid one">
        <section className="match-panel">
          <div className="panel-title">{t.audit}</div>
          <div className="audit-cols">
            <div>
              <h3 className="audit-h good">{t.transfers}</h3>
              <ul className="audit-list">
                {site.transfers.map((l, i) => <li key={i}><TagChip tag={l.tag} source={l.source} /> <span>{l.text}</span></li>)}
              </ul>
            </div>
            <div>
              <h3 className="audit-h bad">{t.breaks}</h3>
              <ul className="audit-list">
                {site.breaks.map((l, i) => <li key={i}><TagChip tag={l.tag} source={l.source} /> <span>{l.text}</span></li>)}
              </ul>
            </div>
          </div>
          <p className="map-caption">{t.auditNote}</p>
        </section>
      </div>
      )}

      <div className="bench-actions">
        <Button variant="instrument" onClick={log(false)}>{t.log}</Button>
        <Button variant="instrument" asChild>
          <Link to="/finder" onClick={toFinder}><Sparkles />{t.finder}</Link>
        </Button>
        <Button variant="mission" asChild>
          <Link to="/mission/hardware" onClick={log(true)}>{t.next}<ArrowRight /></Link>
        </Button>
        {(logged || chosen) && <span className="map-caption">{t.logged}</span>}
      </div>
    </div>
  );
}
