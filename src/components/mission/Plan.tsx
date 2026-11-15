import { useDeferredValue, useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Brain,
  FileText,
  Gem,
  Globe2,
  MapPin,
  Mountain,
  Radar,
  Route as RouteIcon,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataGate, TARGET_SHORT, useMissionData } from "./MissionShell";
import { SiteMap } from "./SiteMap";
import { TagChip } from "./TagChip";
import { useMissionStore, type AreaKind } from "@/lib/mission-store";
import {
  GOALS,
  reachableSpots,
  runPlan,
  type Goal,
  type PlanInput,
  type SiteOutcome,
} from "@/lib/plan";
import { loadTwinModel, predictCell, type TwinModel } from "@/lib/twins";
import { loadGrid, type GridFile } from "@/lib/stage3";
import type { LatLon } from "@/lib/geo";
import { fmt } from "@/lib/format";
import { TARGETS, type GeoLevel, type Waypoint } from "@/types/mission";
import "./mission-extras.css";

const ROCK_WORD: Record<GeoLevel, string> = { match: "Match", partial: "Partly", no: "No match" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const GOAL_ICON: Record<Goal, typeof Mountain> = {
  drive: Mountain,
  rocks: Gem,
  radar: Radar,
  crew: Users,
};
const AREA_LABEL: Record<AreaKind, { label: string; hint: string; short: string }> = {
  window: {
    label: "Landing area",
    hint: "The 20 km box around the landing site (white frame)",
    short: "landing area",
  },
  all: { label: "Whole map", hint: "All the Mars/Moon elevation data we have", short: "whole map" },
  spot: { label: "A spot I click", hint: "A 1.2 km spot you click on the map", short: "your spot" },
};
const GOAL_TOOL: Record<Goal, string> = {
  drive: "navigation cameras and wheel odometry",
  rocks: "close-up camera and rock sampling kit",
  radar: "ground-penetrating radar pass",
  crew: "crew traverse with suit mock-up",
};

/** Step 1: the user's mission in, the twin model run live, a ranked list of sites out. */
export function Plan() {
  const { data, error } = useMissionData();
  const navigate = useNavigate();
  const s = useMissionStore();
  const [model, setModel] = useState<TwinModel | null | "error">(null);
  useEffect(() => {
    let alive = true;
    void loadTwinModel().then((m) => alive && setModel(m ?? "error"));
    return () => {
      alive = false;
    };
  }, []);

  const tm = model && model !== "error" ? model.file.targets[s.target] : null;
  const spot = useMemo<[number, number] | null>(() => {
    if (!tm) return null;
    const own = s.spot[s.target];
    if (own) return own;
    const [wr, wc, wh, ww] = tm.window;
    return [wr + Math.floor(wh / 2), wc + Math.floor(ww / 2)];
  }, [tm, s.spot, s.target]);

  const input: PlanInput | null = useMemo(
    () =>
      spot
        ? {
            target: s.target,
            area:
              s.areaKind === "spot"
                ? { kind: "spot", r: spot[0], c: spot[1], radius: 1 }
                : { kind: s.areaKind },
            goal: s.goal,
            slopeLimit: s.slopeLimit,
            month: s.month,
            heatLimit: s.heatLimit,
            hubLimit: s.hubLimit,
          }
        : null,
    [spot, s.target, s.areaKind, s.goal, s.slopeLimit, s.month, s.heatLimit, s.hubLimit],
  );
  const deferred = useDeferredValue(input);
  const result = useMemo(
    () => (model && model !== "error" && data && deferred ? runPlan(model, data, deferred) : null),
    [model, data, deferred],
  );
  const cellPred = useMemo(() => {
    if (!model || model === "error" || !tm || !spot || s.areaKind !== "spot") return null;
    return predictCell(model, s.target, spot[0] * tm.cols + spot[1]);
  }, [model, tm, spot, s.target, s.areaKind]);

  // keep only the spots a rover can actually reach on the 125 m slope grid (same rule as the A* planner)
  const top0 = result?.sites[0] && !result.sites[0].excluded ? result.sites[0] : null;
  const gridUrl = top0 && data ? data.sites[top0.id].grid : null;
  const [grids, setGrids] = useState<Record<string, GridFile | "missing">>({});
  useEffect(() => {
    if (!gridUrl || grids[gridUrl]) return;
    let alive = true;
    void loadGrid(gridUrl).then((g) => alive && setGrids((m) => ({ ...m, [gridUrl]: g })));
    return () => {
      alive = false;
    };
  }, [gridUrl, grids]);
  const reach = useMemo(() => {
    if (!data || !result || !model || model === "error") return null;
    const g = gridUrl ? grids[gridUrl] : undefined;
    if (g === undefined) return reachableSpots(model, data, result, null);
    return reachableSpots(model, data, result, g === "missing" ? null : g);
  }, [data, result, gridUrl, grids, model]);

  if (!data || model === null) {
    return (
      <div className="foundation-page">
        <div className="eyebrow">STEP 1 · PLAN</div>
        <h1>Plan your test</h1>
        <DataGate error={error} />
      </div>
    );
  }
  if (model === "error" || !tm || !spot) {
    return (
      <div className="foundation-page">
        <div className="eyebrow">STEP 1 · PLAN</div>
        <h1>Plan your test</h1>
        <div className="empty-state">
          <p>The terrain model (public/ml/twins.json) could not be loaded.</p>
        </div>
      </div>
    );
  }

  const t = data.targets[s.target];
  const name = (id: string) => data.sites[id as keyof typeof data.sites].name;
  const order = model.file.site_order;
  const top: SiteOutcome | null = result?.sites[0] ?? null;
  const usableTop = top && !top.excluded ? top : null;
  const shown = reach?.spots ?? [];
  const feat = Object.fromEntries(data.meta.features.map((f) => [f.key, f]));
  const [H, W] = tm.px;
  const cp = tm.cell_px;
  const box = (r: number, c: number, n: number) => ({
    top: `${(100 * (r * cp)) / H}%`,
    left: `${(100 * (c * cp)) / W}%`,
    height: `${(100 * n * cp) / H}%`,
    width: `${(100 * n * cp) / W}%`,
  });
  const onMap = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const tr = model.file.trim + 1;
    const r = Math.min(tm.rows - 1 - tr, Math.max(tr, Math.floor((fy * H) / cp)));
    const c = Math.min(tm.cols - 1 - tr, Math.max(tr, Math.floor((fx * W) / cp)));
    s.setSpot(s.target, [r, c]);
  };
  const rehearse = () => {
    if (!usableTop) return;
    // visit the spots in nearest-first order from the landing point
    if (!reach?.spots.length) return;
    const start = reach.landing ?? t.sites[usableTop.id].rover?.landing ?? reach.spots[0]!.coords;
    const left = [...reach.spots];
    const ordered: typeof left = [];
    let at = start;
    while (left.length) {
      let k = 0;
      left.forEach((sp, j) => {
        const d = (sp.coords[0] - at[0]) ** 2 + (sp.coords[1] - at[1]) ** 2;
        const dk = (left[k]!.coords[0] - at[0]) ** 2 + (left[k]!.coords[1] - at[1]) ** 2;
        if (d < dk) k = j;
      });
      const [next] = left.splice(k, 1);
      ordered.push(next!);
      at = next!.coords;
    }
    const wps: Waypoint[] = ordered.map((sp, i) => ({
      id: `WP-0${i + 1}`,
      coords: sp.coords,
      title: `Twin spot ${i + 1}`,
      inspect: sp.fallback
        ? `Closest ground at this site to the chosen part of ${t.title}`
        : `${sp.hits} picks as one of the ${model.file.k} closest twins of the chosen ${t.title} cells`,
      tool: GOAL_TOOL[s.goal],
      tag: "Measured",
      why: `Slope (90th percentile) ${fmt(sp.slope)}°${sp.radar ? "; radar hotspot that passed all four checks" : ""}`,
    }));
    s.setSite(usableTop.id);
    s.setCustomRoute({ target: s.target, site: usableTop.id, landing: start, waypoints: wps });
    void navigate({ to: "/rehearse" });
  };

  return (
    <div className="foundation-page page-wide">
      <div className="eyebrow">STEP 1 · PLAN</div>
      <h1>Plan your analog test</h1>
      <p className="page-sub">
        Tell us where the mission goes and what you want to test. A machine-learning model then
        compares real {t.body === "moon" ? "Moon" : "Mars"} terrain with our three Algerian sites,
        live, using only the ground your rover or crew can use.
      </p>

      <div className="finder-grid plan-grid">
        <form className="finder-form match-panel" onSubmit={(e) => e.preventDefault()}>
          <fieldset>
            <legend>1 · Destination</legend>
            <div className="dest-grid">
              {TARGETS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="dest-btn"
                  data-selected={s.target === id}
                  aria-pressed={s.target === id}
                  onClick={() => s.setTarget(id)}
                >
                  <Globe2 />
                  <strong>{TARGET_SHORT[id]}</strong>
                  <span>{data.targets[id].short}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>2 · What do you want to test?</legend>
            <div className="dest-grid">
              {(Object.keys(GOALS) as Goal[]).map((g) => {
                const Icon = GOAL_ICON[g];
                return (
                  <button
                    key={g}
                    type="button"
                    className="dest-btn goal-btn"
                    data-selected={s.goal === g}
                    aria-pressed={s.goal === g}
                    onClick={() => s.setGoal(g)}
                  >
                    <Icon />
                    <strong>{GOALS[g].label}</strong>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend>3 · Which part of {TARGET_SHORT[s.target]}?</legend>
            <div className="area-row" role="group">
              {(Object.keys(AREA_LABEL) as AreaKind[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  className="layer-btn big"
                  data-active={s.areaKind === a}
                  aria-pressed={s.areaKind === a}
                  onClick={() => s.setAreaKind(a)}
                >
                  {AREA_LABEL[a].label}
                </button>
              ))}
            </div>
            <div
              className="plan-map"
              data-picking={s.areaKind === "spot"}
              onClick={onMap}
              role="button"
              tabIndex={0}
              aria-label={`Click to choose a spot on ${t.title}`}
            >
              <img src={tm.image} alt={`Twin map of ${t.title}`} draggable={false} />
              {s.areaKind === "spot" && (
                <i className="plan-marker" style={box(spot[0] - 1, spot[1] - 1, 3)} />
              )}
            </div>
            <small className="map-caption">
              {AREA_LABEL[s.areaKind].hint}. Colours: closest twins with all Earth ground (
              {order.map((id) => (
                <span key={id} style={{ color: t.twins.colors[id] }}>
                  ● {name(id).split(" ")[0]}{" "}
                </span>
              ))}
              ). Click anywhere to pick a spot.
            </small>
          </fieldset>

          <fieldset>
            <legend>4 · Your limits</legend>
            <label className="slider-row">
              <span>
                Steepest slope your rover (or crew) can handle: <b>{s.slopeLimit}°</b>
              </span>
              <input
                type="range"
                min={5}
                max={30}
                step={1}
                value={s.slopeLimit}
                onChange={(e) => s.setSlopeLimit(Number(e.target.value))}
              />
            </label>
            <label className="slider-row">
              <span>Month of the field campaign</span>
              <select value={s.month} onChange={(e) => s.setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="slider-row">
              <span>
                Hottest day a crew can work in: <b>{s.heatLimit}°C</b>
              </span>
              <input
                type="range"
                min={30}
                max={50}
                step={1}
                value={s.heatLimit}
                onChange={(e) => s.setHeatLimit(Number(e.target.value))}
              />
            </label>
            <label className="slider-row">
              <span>
                Farthest from a town with an airport: <b>{s.hubLimit} km</b>
              </span>
              <input
                type="range"
                min={25}
                max={300}
                step={5}
                value={s.hubLimit}
                onChange={(e) => s.setHubLimit(Number(e.target.value))}
              />
            </label>
          </fieldset>
        </form>

        <div className="finder-results">
          {!result ? (
            <div className="empty-state">
              <p>Running the model…</p>
            </div>
          ) : (
            <>
              <section className="plan-answer" data-none={!usableTop}>
                <small>
                  Best site for {GOALS[s.goal].short.toLowerCase()} · {t.title},{" "}
                  {AREA_LABEL[s.areaKind].short}
                </small>
                {usableTop ? (
                  <>
                    <strong>{usableTop.name}</strong>
                    <ul>
                      {usableTop.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                      {result.noTwin >= 10 && (
                        <li>
                          {result.noTwin}% of the chosen part has no close twin on the Earth ground
                          you allow (too steep for your limit, or unlike all three sites).
                        </li>
                      )}
                    </ul>
                    <div className="plan-actions">
                      <Button variant="mission" onClick={rehearse} disabled={!shown.length}>
                        <RouteIcon /> Rehearse a drive through these spots
                      </Button>
                      <Button variant="instrument" asChild>
                        <Link to="/site" onClick={() => s.setSite(usableTop.id)}>
                          Materials, safety and tests at this site <ArrowRight />
                        </Link>
                      </Button>
                      <Button variant="instrument" asChild>
                        <Link to="/report">
                          <FileText /> Export results (PDF)
                        </Link>
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <strong>No site fits these limits</strong>
                    <p>
                      Every site is left out. Allow steeper ground or a longer distance from town.
                    </p>
                  </>
                )}
              </section>

              <div className="rank-cards">
                {result.sites.map((o, i) => (
                  <div
                    key={o.id}
                    className="rank-card"
                    data-selected={i === 0 && !o.excluded}
                    data-label={o.excluded ? "none" : undefined}
                  >
                    <div className="rank-top">
                      <span className="rank-n">{i + 1}</span>
                      <b>{o.name}</b>
                    </div>
                    <div className="rank-score">
                      {o.twinShare}
                      <small>% twins</small>
                    </div>
                    <div className="rank-bar">
                      <i style={{ width: `${o.twinShare}%`, background: t.twins.colors[o.id] }} />
                    </div>
                    <dl className="plan-facts">
                      <dt>Usable ground</dt>
                      <dd>{o.usable}%</dd>
                      <dt>Geology (lit.)</dt>
                      <dd>{ROCK_WORD[o.geology]}</dd>
                      <dt>Radar anomalies</dt>
                      <dd>{o.radarKm2 >= 0.1 ? `${o.radarKm2} km²` : "none"}</dd>
                      <dt>{MONTHS[s.month - 1]} heat</dt>
                      <dd data-bad={o.monthOk === false}>
                        {o.tmax === null ? "n/a" : `${o.tmax}°C`}
                      </dd>
                      <dt>Town</dt>
                      <dd data-bad={!o.hubOk}>{Math.round(o.hubKm)} km</dd>
                    </dl>
                    {o.excluded && <p className="plan-out">Left out: {o.excluded}</p>}
                  </div>
                ))}
              </div>

              <section className="match-panel how-model">
                <div className="panel-title">
                  <Brain className="inline-icon" /> How this was decided{" "}
                  <TagChip tag="Measured" source={t.dem.source} />
                </div>
                <p>
                  <b>Model:</b> k-nearest neighbours (k = {model.file.k}) on six terrain measures.{" "}
                  {result.sampled} {t.title} cells
                  {result.sampled < result.queried
                    ? ` (a regular sample of ${result.queried})`
                    : ""}{" "}
                  were each matched with their {model.file.k} closest Earth cells, among the{" "}
                  {result.sites.reduce((a, o) => a + (o.excluded ? 0 : 1), 0)} sites in reach and
                  only on ground under {s.slopeLimit}°. Computed in your browser in {result.ms} ms.
                </p>
                <p>
                  <b>Ordering rule for {GOALS[s.goal].short.toLowerCase()}:</b> {GOALS[s.goal].rule}
                </p>
                <p>
                  <b>No close twin on Earth:</b> {result.noTwin}% of the chosen cells (nearest Earth
                  cell farther than {model.file.threshold.toFixed(2)} standard deviations).
                </p>
                <p className="map-caption">
                  Model check: it recognises the right Algerian site on{" "}
                  {model.file.site_recognition}% of 4 km test blocks it never saw (chance: 33%).
                </p>
              </section>

              {cellPred && (
                <section className="match-panel">
                  <div className="panel-title">
                    <MapPin className="inline-icon" /> Model prediction for the clicked cell
                  </div>
                  <div className="p-bars">
                    {order.map((id, i) => (
                      <div key={id} className="p-bar" data-selected={cellPred.site === i}>
                        <span>{name(id)}</span>
                        <i
                          style={{
                            width: `${(100 * cellPred.votes[i]!) / model.file.k}%`,
                            background: t.twins.colors[id],
                          }}
                        />
                        <b>
                          {cellPred.votes[i]}/{model.file.k}
                        </b>
                      </div>
                    ))}
                  </div>
                  <p className="map-caption">
                    Votes of the {model.file.k} closest Earth cells, all Earth ground. Nearest twin
                    at {cellPred.dist[0]!.toFixed(2)} standard deviations
                    {cellPred.site < 0
                      ? ": too far, so no Earth twin for this cell."
                      : ` (limit ${model.file.threshold.toFixed(2)}).`}
                  </p>
                </section>
              )}

              {usableTop && (
                <section className="match-panel">
                  <div className="panel-title">
                    <MapPin className="inline-icon" /> Where to go at {usableTop.name}
                  </div>
                  <div className="plan-site-grid">
                    <SiteMap
                      bounds={data.sites[usableTop.id].bounds}
                      overlay={data.sites[usableTop.id].layers.like[s.target]}
                      opacity={0.45}
                      bestArea={null}
                      spots={shown.map((sp, i) => ({
                        id: `S${i + 1}`,
                        coords: sp.coords,
                        score: sp.hits,
                        why: "",
                      }))}
                      hotspots={
                        s.goal === "radar"
                          ? data.sites[usableTop.id].radar.hotspots.filter(
                              (h) => h.verdict === "candidate",
                            )
                          : []
                      }
                    />
                    <ul className="spot-list">
                      {reach?.checked && !shown.length && (
                        <li className="map-caption mock-note">
                          No twin spot here can be reached without crossing ground steeper than{" "}
                          {s.slopeLimit}°. Raise the slope limit or pick another site.
                        </li>
                      )}
                      {shown[0]?.fallback && (
                        <li className="map-caption">
                          None of this site&apos;s cells is among the overall closest twins (it is
                          first because of your goal), so these are its own closest cells.
                        </li>
                      )}
                      {shown.map((sp, i) => (
                        <li key={sp.cell}>
                          <div className="spot-btn">
                            <span className="spot-n">{i + 1}</span>
                            <span>
                              {sp.fallback
                                ? `Closest ground at this site (${sp.hits} picks)`
                                : `Picked as a twin ${sp.hits} times`}
                              <small>
                                {sp.coords[0].toFixed(4)}°N {sp.coords[1].toFixed(4)}°E · slope{" "}
                                {fmt(sp.slope)}°{sp.radar ? " · radar hotspot" : ""}
                              </small>
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <table className="data-table plan-measures">
                    <thead>
                      <tr>
                        <th>Measure</th>
                        <th>{t.title} (chosen part)</th>
                        <th>Its twins at {usableTop.name.split(" ")[0]}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.measures.map((m) => (
                        <tr key={m.key}>
                          <td>
                            {feat[m.key]?.label ?? m.key} <small>({feat[m.key]?.unit})</small>
                          </td>
                          <td>{fmt(m.target)}</td>
                          <td>{m.earth === null ? "–" : fmt(m.earth)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="map-caption">
                    Right column: average of the Earth cells the model picked as twins, weighted by
                    how often each was picked. Same measures, same method on both planets.
                  </p>
                </section>
              )}
              <div className="plan-actions">
                <Button variant="instrument" asChild>
                  <Link to="/compare">
                    See the full comparison for {t.title} <ArrowRight />
                  </Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
