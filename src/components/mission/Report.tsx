import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataGate, useMissionData } from "./MissionShell";
import { useMissionStore } from "@/lib/mission-store";
import { GOALS, reachableSpots, runPlan, type PlanInput } from "@/lib/plan";
import { loadTwinModel, type TwinModel } from "@/lib/twins";
import { loadGrid, type GridFile } from "@/lib/stage3";
import { crewSafety, materialRows } from "@/lib/materials";
import { BAND_WORD, buildReport, GEO_WORD, TEST_WORD } from "@/lib/report";
import { fmt } from "@/lib/format";
import type { GeoLevel } from "@/types/mission";

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
const AREA_WORD = { window: "Landing area", all: "Whole map", spot: "A clicked spot (1.2 km)" };
const ROCK_SHORT: Record<GeoLevel, string> = { match: "Match", partial: "Partly", no: "No match" };
const RISK_WORD = { ok: "Low", warn: "Plan for it", fail: "Too high" };

/** Printable results: the user's plan, the comparison, materials and safety, sources.
 *  "Save as PDF" uses the browser's print dialog (choose "Save as PDF"). */
export function Report() {
  const { data, error } = useMissionData();
  const s = useMissionStore();
  const [model, setModel] = useState<TwinModel | null | "error">(null);
  const [grid, setGrid] = useState<GridFile | null | "missing">(null);
  useEffect(() => {
    let alive = true;
    void loadTwinModel().then((m) => alive && setModel(m ?? "error"));
    return () => {
      alive = false;
    };
  }, []);

  const tm = model && model !== "error" ? model.file.targets[s.target] : null;
  const input: PlanInput | null = useMemo(() => {
    if (!tm) return null;
    const [wr, wc, wh, ww] = tm.window;
    const spot = s.spot[s.target] ?? [wr + Math.floor(wh / 2), wc + Math.floor(ww / 2)];
    return {
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
    };
  }, [tm, s.target, s.areaKind, s.spot, s.goal, s.slopeLimit, s.month, s.heatLimit, s.hubLimit]);
  const result = useMemo(
    () => (model && model !== "error" && data && input ? runPlan(model, data, input) : null),
    [model, data, input],
  );
  const top = result?.sites[0] && !result.sites[0].excluded ? result.sites[0] : null;
  const gridUrl = top && data ? data.sites[top.id].grid : null;
  useEffect(() => {
    if (!gridUrl) return;
    let alive = true;
    setGrid(null);
    void loadGrid(gridUrl).then((g) => alive && setGrid(g));
    return () => {
      alive = false;
    };
  }, [gridUrl]);
  const reach = useMemo(
    () =>
      model && model !== "error" && data && result
        ? reachableSpots(model, data, result, grid && grid !== "missing" ? grid : null)
        : null,
    [model, data, result, grid],
  );

  if (!data) return <DataGate error={error} />;
  const t = data.targets[s.target];
  const name = (id: string) => data.sites[id as keyof typeof data.sites].name;
  const detail = top?.id ?? t.ranking[0]!;
  const mats = materialRows(data, s.target, detail);
  const safety = crewSafety(data, detail, s.month, s.heatLimit);
  const today = new Date().toISOString().slice(0, 10);
  const feat = Object.fromEntries(data.meta.features.map((f) => [f.key, f]));
  const usedSources = data.meta.sources.filter((x) => x.url);

  const downloadMd = () => {
    const blob = new Blob([buildReport(data, s.target)], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `amanar-${s.target}-report.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="foundation-page report-wrap">
      <div className="report-toolbar no-print">
        <Button variant="instrument" asChild>
          <Link to="/plan">
            <ArrowLeft /> Back to Plan
          </Link>
        </Button>
        <Button variant="mission" onClick={() => window.print()} disabled={!result}>
          <Printer /> Save as PDF
        </Button>
        <Button variant="instrument" onClick={downloadMd}>
          <Download /> Download Markdown
        </Button>
        <span className="map-caption">
          In the print window, choose &ldquo;Save as PDF&rdquo; as the printer.
        </span>
      </div>

      <article className="report-paper">
        <header className="rp-head">
          <small>Amanar · Algeria Beyond Earth · Team Hoggar · NASA Space Apps 2026</small>
          <h1>Results report: {t.title}</h1>
          <p>{today} · Team-built experimental indicators, not an official NASA assessment.</p>
        </header>

        <section>
          <h2>1. Your plan</h2>
          <table>
            <tbody>
              <tr>
                <th>Destination</th>
                <td>
                  {t.title} ({t.mission})
                </td>
                <th>Test</th>
                <td>{GOALS[s.goal].label}</td>
              </tr>
              <tr>
                <th>Part of the target</th>
                <td>{AREA_WORD[s.areaKind]}</td>
                <th>Slope limit</th>
                <td>{s.slopeLimit}°</td>
              </tr>
              <tr>
                <th>Month</th>
                <td>{MONTHS[s.month - 1]}</td>
                <th>Heat limit · distance limit</th>
                <td>
                  {s.heatLimit}°C · {s.hubLimit} km
                </td>
              </tr>
            </tbody>
          </table>
          {!result ? (
            <p>Running the model…</p>
          ) : (
            <>
              <p className="rp-answer">
                Recommended site: <b>{top ? top.name : "none fits these limits"}</b>
              </p>
              {top && (
                <ul>
                  {top.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                  {result.noTwin >= 10 && (
                    <li>
                      {result.noTwin}% of the chosen part has no close twin on the Earth ground
                      allowed.
                    </li>
                  )}
                </ul>
              )}
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Site</th>
                    <th>Twin share</th>
                    <th>Usable ground</th>
                    <th>Geology (lit.)</th>
                    <th>Radar anomalies</th>
                    <th>Hottest days</th>
                    <th>Town</th>
                  </tr>
                </thead>
                <tbody>
                  {result.sites.map((o, i) => (
                    <tr key={o.id}>
                      <td>{i + 1}</td>
                      <td>
                        {o.name}
                        {o.excluded ? ` (left out: ${o.excluded})` : ""}
                      </td>
                      <td>{o.twinShare}%</td>
                      <td>{o.usable}%</td>
                      <td>{ROCK_SHORT[o.geology]}</td>
                      <td>{o.radarKm2 >= 0.1 ? `${o.radarKm2} km²` : "none"}</td>
                      <td>{o.tmax === null ? "n/a" : `${o.tmax}°C`}</td>
                      <td>{Math.round(o.hubKm)} km</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="rp-note">
                Ordering rule: {GOALS[s.goal].rule} Model: k-nearest neighbours (k ={" "}
                {model && model !== "error" ? model.file.k : 15}) on six terrain measures,{" "}
                {result.sampled} target cells matched with Earth cells under {s.slopeLimit}° at the
                sites in reach. No close twin: {result.noTwin}% of the chosen cells.
              </p>
              {top && reach && (
                <>
                  <h3>Spots to visit at {top.name}</h3>
                  {reach.spots.length ? (
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Latitude, longitude</th>
                          <th>Picked as a twin</th>
                          <th>Slope (90th pct)</th>
                          <th>Radar hotspot</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reach.spots.map((sp, i) => (
                          <tr key={sp.cell}>
                            <td>{i + 1}</td>
                            <td>
                              {sp.coords[0].toFixed(4)}°N, {sp.coords[1].toFixed(4)}°E
                            </td>
                            <td>{sp.fallback ? "closest at this site" : `${sp.hits} times`}</td>
                            <td>{fmt(sp.slope)}°</td>
                            <td>{sp.radar ? "yes" : "no"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p>No twin spot can be reached under {s.slopeLimit}°.</p>
                  )}
                  <p className="rp-note">
                    {reach.checked
                      ? `Only spots a rover can reach without crossing ground steeper than ${s.slopeLimit}° (125 m slope grid).`
                      : "Reachability not checked (slope grid not loaded)."}
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Measure</th>
                        <th>{t.title} (chosen part)</th>
                        <th>Its twins at {top.name}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.measures.map((m) => (
                        <tr key={m.key}>
                          <td>
                            {feat[m.key]?.label} ({feat[m.key]?.unit})
                          </td>
                          <td>{fmt(m.target)}</td>
                          <td>{m.earth === null ? "–" : fmt(m.earth)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </section>

        <section className="rp-break">
          <h2>2. Comparison for {t.title}</h2>
          <p className="rp-answer">{t.headline}</p>
          <table>
            <thead>
              <tr>
                <th>Site</th>
                <th>Terrain overlap score (main window)</th>
                <th>Band</th>
                <th>Geology (literature)</th>
                <th>Label</th>
              </tr>
            </thead>
            <tbody>
              {t.ranking.map((id) => {
                const r = t.sites[id];
                return (
                  <tr key={id}>
                    <td>{name(id)}</td>
                    <td>{r.score}/100</td>
                    <td>{BAND_WORD[r.band]}</td>
                    <td>{GEO_WORD[r.geology.level]}</td>
                    <td>{r.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="rp-note">
            Stability: {name(t.ranking[0]!)} leads in {t.robustness.wins[t.ranking[0]!]} of{" "}
            {t.robustness.n} re-runs with other measures and distances.
          </p>
          <h3>Machine-learning twin map (whole map)</h3>
          <div className="rp-twin">
            <img src={t.twins.image} alt={`Twin map of ${t.title}`} />
            <div>
              <ul>
                {t.ranking.map((id) => (
                  <li key={id}>
                    <i style={{ background: t.twins.colors[id] }} /> {name(id)}: {t.twins.share[id]}
                    % of the map
                  </li>
                ))}
                <li>
                  <i className="rp-none" /> No close twin: {t.twins.share.none}%
                </li>
              </ul>
              {t.twins.parts.length > 1 && (
                <p>{t.twins.parts.map((p) => `${p.ground} → ${name(p.site)}`).join("; ")}.</p>
              )}
              <p className="rp-note">
                k = {t.twins.k}; right site on {t.twins.site_recognition}% of unseen 4 km Earth
                blocks; shares move by at most {t.twins.max_change} points with other measure sets.
              </p>
            </div>
          </div>
          <h3>Best site for each kind of test</h3>
          <table>
            <tbody>
              {(
                [
                  ["Driving and navigation", t.picks.driving],
                  ["Rock science", t.picks.rocks],
                  ["Radar under sand", t.picks.radar],
                ] as const
              ).map(([label, p]) => (
                <tr key={label}>
                  <th>{label}</th>
                  <td>
                    <b>{p.site ? name(p.site) : "No site"}</b>: {p.why}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rp-break">
          <h2>3. Materials and crew planning indicators at {name(detail)}</h2>
          <table>
            <thead>
              <tr>
                <th>Part</th>
                <th>Level</th>
                <th>Threat on {t.title}</th>
                <th>Here</th>
                <th>Basis</th>
              </tr>
            </thead>
            <tbody>
              {mats.map((m) => (
                <tr key={m.id}>
                  <td>{m.component}</td>
                  <td>{TEST_WORD[m.level]}</td>
                  <td>{m.threat}</td>
                  <td>{m.here}</td>
                  <td>{m.basis === "data" ? "Computed ratio" : "Team judgement"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>
            Crew planning indicators in {MONTHS[s.month - 1]} (screening, not a safety assessment)
          </h3>
          <table>
            <thead>
              <tr>
                <th>Hazard</th>
                <th>Value</th>
                <th>Risk</th>
                <th>What to do</th>
              </tr>
            </thead>
            <tbody>
              {safety.map((x) => (
                <tr key={x.id}>
                  <td>{x.hazard}</td>
                  <td>{x.value}</td>
                  <td>{RISK_WORD[x.risk]}</td>
                  <td>{x.advice}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rp-break">
          <h2>4. Data and limits</h2>
          <p>
            <b>Elevation data for {t.title}:</b> {t.dem.product}, {t.dem.res_m} m.{" "}
            {t.dem.check_vs_mola
              ? `Checked against MOLA: correlation ${t.dem.check_vs_mola.correlation}, RMS ${t.dem.check_vs_mola.rms_m} m.`
              : ""}
          </p>
          <p>
            <b>Where the analogy breaks:</b>
          </p>
          <ul>
            {t.breaks.map((b) => (
              <li key={b.text}>{b.text}</li>
            ))}
          </ul>
          <p className="rp-note">
            Three pre-selected Algerian pilot areas; six elevation-derived measures and a
            literature-based geology reading, no mineral or soil data; the twin model only chooses
            among the three sites and its no-twin cutoff is a heuristic; radar anomalies and spots
            are unverified; sensor values are formulas; straight-line distances; climate averages,
            not a forecast. Team-built experimental indicators, not an official NASA assessment.
          </p>
          <h3>Sources</h3>
          <ol className="rp-sources">
            {usedSources.map((x) => (
              <li key={x.id}>
                {x.name} — {x.url}
              </li>
            ))}
          </ol>
        </section>
      </article>
    </div>
  );
}
