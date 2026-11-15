import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { computeFieldAccess } from "@/lib/api";
import { fmt } from "@/lib/format";
import { currentSite, useMissionStore } from "@/lib/mission-store";
import {
  COLD_C,
  CREW_CHECKLIST,
  delayPlan,
  fmtClock,
  loadGrid,
  monthRanges,
  planRoute,
  slopeAt,
  workableMonths,
  type GridFile,
} from "@/lib/stage3";
import type { CheckState, LatLon } from "@/types/mission";
import { DataGate, useMissionData } from "./MissionShell";
import { TagChip } from "./TagChip";
import { ValidateMap } from "./ValidateMap";
import { SensorPanel } from "./SensorPanel";
import "./mission-extras.css";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
interface LogEntry {
  id: number;
  clock: string;
  text: string;
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const checkText = (c: CheckState) =>
  c === "ok" ? "OK" : c === "fail" ? "NOT OK" : c === "warn" ? "CAUTION" : "TBD";

/** Step 4: A* route through the most target-like spots, driven with the real signal delay, and a crew-access check. */
export function Rehearse() {
  const { data, error } = useMissionData();
  const target = useMissionStore((s) => s.target);
  const chosen = useMissionStore((s) => s.site);
  const landingStore = useMissionStore((s) => s.landing);
  const customRoute = useMissionStore((s) => s.customRoute);
  const delayMode = useMissionStore((s) => s.delayMode);
  const slopeLimit = useMissionStore((s) => s.slopeLimit);
  const heatLimit = useMissionStore((s) => s.heatLimit);
  const month = useMissionStore((s) => s.month);
  const store = useMissionStore.getState();
  const [grid, setGrid] = useState<GridFile | "missing" | null>(null);
  const [rover, setRover] = useState<LatLon | null>(null);
  const [driving, setDriving] = useState(false);
  const [signal, setSignal] = useState<number | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pickMsg, setPickMsg] = useState(false);
  const run = useRef(0);

  const t = data?.targets[target];
  const sid = data ? currentSite(data, target, chosen) : null;
  const site = data && sid ? data.sites[sid] : null;
  const rv = t && sid ? t.sites[sid].rover : null;
  const delay = t
    ? delayPlan(t.delay)
    : delayPlan({ one_way_s: 660, label: "", tag: "Measured", source: "astropy" });
  const gridUrl = rv?.grid ?? null;

  const custom =
    customRoute && sid && customRoute.site === sid && customRoute.target === target
      ? customRoute
      : null;
  useEffect(() => {
    // a drive planned on the Plan page keeps the user's slope limit
    if (rv && !custom) useMissionStore.getState().setSlopeLimit(rv.slope_limit_deg);
  }, [rv, custom]);
  useEffect(() => {
    if (!gridUrl) return;
    let cancelled = false;
    void loadGrid(gridUrl).then((g) => !cancelled && setGrid(g));
    return () => {
      cancelled = true;
    };
  }, [gridUrl]);
  useEffect(
    () => () => {
      run.current += 1;
    },
    [],
  );

  const landing: LatLon | null = landingStore ?? custom?.landing ?? rv?.landing ?? null;
  const wps = useMemo(() => custom?.waypoints ?? rv?.waypoints ?? [], [custom, rv]);
  const plan = useMemo(
    () =>
      grid && grid !== "missing" && landing
        ? planRoute(
            grid,
            slopeLimit,
            landing,
            wps.map((w) => w.coords),
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grid, slopeLimit, landing?.[0], landing?.[1], wps],
  );
  useEffect(() => {
    run.current += 1;
    setRover(null);
    setDriving(false);
    setSignal(null);
    setLog([]);
  }, [plan]);

  const onPick = useCallback(
    (p: LatLon) => {
      if (!grid || grid === "missing") return;
      const [[s, w], [n, e]] = grid.bounds;
      if (p[0] < s || p[0] > n || p[1] < w || p[1] > e) return;
      if (slopeAt(grid, p) > slopeLimit) {
        setPickMsg(true);
        return;
      }
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
    const push = (text: string) =>
      setLog((l) => [
        ...l,
        { id: l.length, clock: fmtClock(t0, minutes, !delay.compressed), text },
      ]);
    setLog([]);
    setDriving(true);
    setRover(plan.points[0] ?? null);
    let from = 0;
    for (let i = 0; i < wps.length; i++) {
      const wp = wps[i]!;
      push(`sent "drive to ${wp.id}"`);
      if (delayMode) {
        for (let k = delay.ticks; k > 0; k--) {
          setSignal(delay.compressed ? k : Math.round((delay.tickMs / 1000) * 10) / 10);
          await sleep(delay.tickMs);
          if (!alive()) return;
        }
        setSignal(null);
        minutes += delay.simMinutes;
        push(`command arrived after ${delay.short}: driving`);
      } else push("driving");
      const to = plan.wpIndex[i] ?? plan.points.length - 1;
      const seg = plan.points.slice(from, to + 1);
      const step = Math.max(1, Math.ceil(seg.length / 60));
      for (let k = 0; k < seg.length; k += step) {
        setRover(seg[k] as LatLon);
        await sleep(45);
        if (!alive()) return;
      }
      setRover(seg[seg.length - 1] as LatLon);
      push(`${wp.id} reached: ${wp.tool}`);
      from = to;
    }
    push("traverse complete");
    setDriving(false);
  };

  if (!data || !t || !site || !rv || !landing || !sid) {
    return (
      <div className="foundation-page">
        <div className="eyebrow">STEP 4 · REHEARSE</div>
        <h1>Rehearse</h1>
        {data && !rv ? (
          <div className="empty-state">
            <p>No rover route could be planned for this site and destination.</p>
            <Button variant="mission" asChild>
              <Link to="/site">Back to the site</Link>
            </Button>
          </div>
        ) : (
          <DataGate error={error} />
        )}
      </div>
    );
  }

  const c = site.conditions;
  const tmax = c.monthly_tmax_c[month - 1] ?? null;
  const tmin = c.monthly_tmin_c[month - 1] ?? null;
  const access = computeFieldAccess({
    maxSlopeDeg: plan?.ok ? plan.maxSlopeDeg : null,
    slopeLimitDeg: slopeLimit,
    tmaxC: tmax,
    heatLimitC: heatLimit,
    hubKm: c.hub.distance_km,
    hubLimitKm: c.assumptions.hub_km,
  });
  const coldState: CheckState = tmin === null ? "tbd" : tmin < COLD_C ? "warn" : "ok";
  const workable = monthRanges(workableMonths(c.monthly_tmax_c, heatLimit), MONTHS);
  const failedWp =
    plan && !plan.ok && plan.failedLeg !== null ? (wps[plan.failedLeg]?.id ?? "") : "";
  const isMoon = t.body === "moon";
  const verdict =
    access.verdict === "meets"
      ? "A crew can test here this month (our assumptions)"
      : access.verdict === "outside"
        ? "Robot only this month, or pick another season"
        : "Not computed yet";
  const reset = () => {
    run.current += 1;
    setRover(null);
    setDriving(false);
    setSignal(null);
    setLog([]);
  };

  return (
    <div className="foundation-page page-wide">
      <div className="eyebrow">STEP 4 · REHEARSE</div>
      <h1>
        Drive {site.name} <span className="h1-sub">like {t.title}</span>
      </h1>
      <p className="page-sub">
        {custom
          ? "The rover visits the twin spots you found on the Plan page"
          : `The rover visits the three most ${t.title}-like spots it can reach`}
        , with the real {isMoon ? "Earth–Moon" : "Earth–Mars"} signal delay.
      </p>
      <div className="site-switch-row" role="group" aria-label="Site">
        {t.ranking.map((id) => (
          <button
            key={id}
            type="button"
            className="layer-btn big"
            data-active={id === sid}
            aria-pressed={id === sid}
            disabled={driving}
            onClick={() => store.setSite(id)}
          >
            {data.sites[id].name}
          </button>
        ))}
      </div>

      <div className="match-grid val-grid">
        <section className="match-panel">
          {grid === "missing" ? (
            <div className="swipe-box swipe-missing">
              <strong>Slope grid not available</strong>
            </div>
          ) : grid ? (
            <>
              <div className="match-map-box val-map">
                <ValidateMap
                  bounds={grid.bounds}
                  grid={grid}
                  limit={slopeLimit}
                  start={landing}
                  waypoints={wps}
                  route={plan?.ok ? plan.points : []}
                  rover={rover}
                  onPick={onPick}
                />
              </div>
              <p className="map-caption">
                Click the map to move the start point. Green to yellow: drivable. Red: steeper than
                the limit.
              </p>
              {pickMsg && (
                <p className="map-caption mock-note">
                  That spot is steeper than the slope limit. Pick flatter ground.
                </p>
              )}
              {plan && !plan.ok && (
                <p className="map-caption mock-note">
                  {failedWp
                    ? `Cannot reach ${failedWp} with a ${slopeLimit}° limit. Raise the limit or move the start.`
                    : "No safe route at this slope limit."}
                </p>
              )}
            </>
          ) : (
            <div className="match-map match-map-wait">…</div>
          )}
          <div className="bench-actions val-actions">
            <Button
              variant="instrument"
              onClick={() => {
                setPickMsg(false);
                store.setLanding(null);
              }}
              disabled={landingStore === null}
            >
              Reset start
            </Button>
            <Button variant="instrument" onClick={reset}>
              Reset rover
            </Button>
            <Button variant="mission" onClick={() => void drive()} disabled={!plan?.ok || driving}>
              {driving ? "Driving…" : "Drive"}
            </Button>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={delayMode}
              onChange={(e) => store.setDelayMode(e.target.checked)}
              disabled={driving}
            />
            Signal delay: {delay.short} one way
            {delay.compressed ? " (shown as 1 min = 1 s)" : " (real time)"}{" "}
            <TagChip tag={t.delay.tag} source={t.delay.source} />
          </label>
          <label className="slider-row">
            Rover slope limit: {slopeLimit}°
            <input
              type="range"
              min={3}
              max={30}
              step={1}
              value={slopeLimit}
              disabled={driving}
              onChange={(e) => store.setSlopeLimit(Number(e.target.value))}
            />
          </label>
          <p className="map-caption">
            Planning path on a 30 m elevation model (125 m grid), not a certified rover route.
          </p>
        </section>

        <aside className="val-side">
          <section className="match-panel">
            <div className="panel-title">Route</div>
            {plan?.ok ? (
              <ul className="fp-list">
                <li>
                  <span>Length</span>
                  <span>{fmt(plan.km, "km")}</span>
                  <TagChip tag="Measured" source="cop_dem" />
                </li>
                <li>
                  <span>Steepest cell on the route</span>
                  <span>{fmt(plan.maxSlopeDeg, "°")}</span>
                  <TagChip tag="Measured" source="cop_dem" />
                </li>
              </ul>
            ) : (
              <p className="map-caption">{plan ? "No safe route at this slope limit." : "…"}</p>
            )}
            <div className="panel-title wp-title">Stops</div>
            <ul className="audit-list">
              {wps.map((w) => (
                <li key={w.id}>
                  <span>
                    <strong>{w.id}</strong> {w.title} <TagChip tag={w.tag} />
                  </span>
                  <span className="map-caption">Tool: {w.tool}</span>
                  <span className="map-caption">Question: {w.inspect}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="match-panel">
            <div className="panel-title">Can a human crew test here?</div>
            <div className="access-controls">
              <label className="slider-row">
                Month
                <select value={month} onChange={(e) => store.setMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="slider-row">
                Heat limit: {heatLimit}°C
                <input
                  type="range"
                  min={25}
                  max={50}
                  step={1}
                  value={heatLimit}
                  onChange={(e) => store.setHeatLimit(Number(e.target.value))}
                />
              </label>
            </div>
            <ul className="fp-list access-list">
              <li>
                <span>
                  Route slope {fmt(plan?.ok ? plan.maxSlopeDeg : null, "°")} / {slopeLimit}°
                </span>
                <span className={`chk chk-${access.slope}`}>{checkText(access.slope)}</span>
              </li>
              <li>
                <span>
                  Heat (avg. daily max) {fmt(tmax, "°C", 0)} / {heatLimit}°C
                </span>
                <span className={`chk chk-${access.heat}`}>{checkText(access.heat)}</span>
              </li>
              <li>
                <span>
                  Help: {c.hub.name} {fmt(c.hub.distance_km, "km", 0)} / {c.assumptions.hub_km} km
                </span>
                <span className={`chk chk-${access.logistics}`}>{checkText(access.logistics)}</span>
              </li>
              <li>
                <span>Night cold (avg. min) {fmt(tmin, "°C", 0)}</span>
                <span className={`chk chk-${coldState}`}>{checkText(coldState)}</span>
              </li>
            </ul>
            <div className={`verdict-box verdict-${access.verdict}`}>
              {verdict} <TagChip tag="Judgement" />
            </div>
            <p className="crew-line">
              <small>Months under the heat limit</small>
              <strong>{workable}</strong>
            </p>
            <details className="rules-box">
              <summary>Crew checklist</summary>
              <ul>
                {CREW_CHECKLIST.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </details>
            <p className="map-caption">
              Straight-line distance is not road access; climate averages are not a forecast.
            </p>
          </section>
        </aside>
      </div>

      {grid && grid !== "missing" && plan?.ok && (
        <SensorPanel
          data={data}
          target={target}
          sid={sid}
          grid={grid}
          points={plan.points}
          rover={rover}
          slopeLimit={slopeLimit}
        />
      )}

      <section className="match-panel anomaly-panel">
        <div className="panel-title">
          <Radio className="inline-icon" /> Command log
        </div>
        {signal !== null && (
          <p className="map-caption signal-note">Signal travelling… {signal} s left</p>
        )}
        {log.length === 0 ? (
          <p className="map-caption">Press Drive to send the first command.</p>
        ) : (
          <ul className="cmd-log">
            {log.map((l) => (
              <li key={l.id}>
                <span>{l.clock}</span> {l.text}
              </li>
            ))}
          </ul>
        )}
        {delayMode && (
          <p className="map-caption">
            {isMoon
              ? "About 1.3 s each way: the Moon can be driven from Earth almost live. Mars cannot."
              : "The rover must act on its own between commands: that is why Mars rovers are autonomous."}
          </p>
        )}
      </section>
    </div>
  );
}
