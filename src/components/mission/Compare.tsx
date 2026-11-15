import { Link } from "@tanstack/react-router";
import { ArrowRight, Download, ExternalLink, Gem, Mountain, Radar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataGate, useMissionData } from "./MissionShell";
import { TagChip } from "./TagChip";
import { useMissionStore } from "@/lib/mission-store";
import { BAND_WORD, buildReport, fmtNum, GEO_WORD, LABEL_HINT, sourceName } from "@/lib/report";
import type { SiteId } from "@/types/mission";

const SLOPE_LEGEND = [0, 3, 8, 15, 25, 35];

export function Compare() {
  const { data, error } = useMissionData();
  const target = useMissionStore((s) => s.target);
  const setSite = useMissionStore((s) => s.setSite);
  if (!data) {
    return (
      <div className="foundation-page">
        <div className="eyebrow">STEP 2 · COMPARE</div>
        <h1>Compare</h1>
        <DataGate error={error} />
      </div>
    );
  }
  const t = data.targets[target];
  const name = (id: SiteId) => data.sites[id].name;
  const winner = t.ranking[0]!;
  const z = t.robustness.zones;
  const tw = t.twins;
  const download = () => {
    const blob = new Blob([buildReport(data, target)], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `amanar-${target}-report.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const demCheck = t.dem.check_vs_mola
    ? `Checked against NASA's MOLA laser altimeter: correlation ${t.dem.check_vs_mola.correlation}, ${t.dem.check_vs_mola.rms_m} m RMS.`
    : t.dem.check_slope
      ? `Checked: Shackleton's inner wall comes out at ${t.dem.check_slope.shackleton_inner_wall_deg}° in our slopes, as published (~${t.dem.check_slope.published_wall_deg}°).`
      : "";
  return (
    <div className="foundation-page page-wide">
      <div className="eyebrow">STEP 2 · COMPARE</div>
      <h1>{t.title} vs three Algerian sites</h1>
      <p className="page-sub">
        {t.mission}. {t.goal}
      </p>

      <div className="headline-box">
        <strong>{t.headline}</strong>
        <span>
          Terrain is <TagChip tag="Measured" source={t.dem.source} /> from real{" "}
          {t.body === "moon" ? "Moon" : "Mars"} elevation data; geology is{" "}
          <TagChip tag="Reference" /> a team reading of published studies (processes and setting,
          not rock chemistry).
        </span>
      </div>

      <h2 className="block-title">Best site for each kind of test</h2>
      <div className="pick-grid">
        <div className="pick">
          <Mountain />
          <small>Driving and navigation</small>
          <b>{name(t.picks.driving.site)}</b>
          <p>{t.picks.driving.why}</p>
        </div>
        <div className="pick">
          <Gem />
          <small>Geology (literature)</small>
          <b>{name(t.picks.rocks.site)}</b>
          <p>{t.picks.rocks.why}</p>
        </div>
        <div className="pick">
          <Radar />
          <small>Radar under dry cover</small>
          <b>{t.picks.radar.site ? name(t.picks.radar.site) : "None yet"}</b>
          <p>{t.picks.radar.why}</p>
        </div>
      </div>

      <h2 className="block-title">Ranking by terrain overlap score</h2>
      <p className="note">
        A morphometric score: how much the spread of six elevation-derived measures at each site
        overlaps the target&apos;s (0 = nothing in common, 100 = identical). It is not a percentage
        of overall or geological similarity, and it compares each measure&apos;s spread, not how the
        terrain is arranged.{" "}
        {t.ranking.every((id) => t.sites[id].score < 65)
          ? "None of the three reaches the close band (65): all are moderate or poor, so read the first place as the highest-scoring of three candidates, not a close analog."
          : ""}
      </p>
      <div className="rank-list">
        {t.ranking.map((id, i) => {
          const r = t.sites[id];
          return (
            <div key={id} className="rank-row instrument" data-first={i === 0}>
              <span className="rank-pos">{i + 1}</span>
              <div className="rank-name">
                <b>{name(id)}</b>
                <span className={`label-chip label-${r.label.split(" ")[0]!.toLowerCase()}`}>
                  {r.label}
                </span>
                <small>{LABEL_HINT[r.label]}</small>
              </div>
              <div className="rank-score-box">
                <div className="score-line">
                  <b>{r.score}</b>
                  <small>/100 · {BAND_WORD[r.band]}</small>
                  <TagChip tag="Measured" source={t.dem.source} />
                </div>
                <div className="score-bar">
                  <i style={{ width: `${r.score}%` }} />
                </div>
              </div>
              <div className="rank-geo">
                <span className={`geo-chip geo-${r.geology.level}`}>
                  {GEO_WORD[r.geology.level]}
                </span>
                <small>{r.geology.text}</small>
              </div>
              <Button variant="instrument" size="sm" asChild>
                <Link to="/site" onClick={() => setSite(id)}>
                  Open site <ArrowRight />
                </Link>
              </Button>
            </div>
          );
        })}
      </div>
      <div className="note">
        This ranking is for the main {t.dem.size_km[0]} × {t.dem.size_km[1]} km window. Changing the
        measure does not change it: <b>{name(winner)}</b> is first in{" "}
        <b>
          {t.robustness.wins[winner]} of {t.robustness.n}
        </b>{" "}
        variants (other measures, another distance, coarser histograms). Changing the{" "}
        <b>part of {t.title}</b> can change it: see the twin map below.{" "}
        <details className="inline-details">
          <summary>Show the variants</summary>
          <table className="data-table">
            <thead>
              <tr>
                <th>Variant</th>
                {data.site_order.map((s) => (
                  <th key={s}>{name(s)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.robustness.variants.map((v) => (
                <tr key={v.name}>
                  <td>{v.name}</td>
                  {data.site_order.map((s) => (
                    <td key={s} data-win={v.winner === s}>
                      {v.scores[s]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      <h2 className="block-title">Machine-learning twin map: which site matches each part?</h2>
      <p className="note">
        A nearest-neighbour terrain-twin model (k = {tw.k}) learns the six terrain measures of every
        400 m cell of the three Algerian boxes, labelled by site. It then looks at each cell of the
        whole {t.body === "moon" ? "Moon" : "Mars"} map ({tw.area_km[0]} × {tw.area_km[1]} km) and
        finds its {tw.k} closest Earth cells <TagChip tag="Measured" source={t.dem.source} />: the
        site that owns most of them colours the cell. It can only choose among these three sites.
        Cells farther than a heuristic cutoff from every Earth cell stay dark (&ldquo;no close
        twin&rdquo;) <TagChip tag="Judgement" />.
      </p>
      <div className="zone-wrap">
        <figure className="zone-fig">
          <img
            src={tw.image}
            alt={`Twin map of ${t.title}: colour = Algerian site holding the closest terrain twins`}
          />
          <figcaption>
            Colour = site with the closest twins for each 400 m cell. Dark = no close twin on Earth.
            White frame = the main window ranked above.
          </figcaption>
        </figure>
        <div className="zone-side">
          <ul className="zone-legend">
            {t.ranking.map((id) => (
              <li key={id}>
                <i style={{ background: tw.colors[id] }} />
                <b>{name(id)}</b>
                <span>{tw.share[id]}% of the map</span>
              </li>
            ))}
            <li>
              <i className="zone-none" />
              <b>No close twin</b>
              <span>{tw.share.none}%</span>
            </li>
          </ul>
          {tw.parts.length > 1 ? (
            <div className="zone-parts">
              <small>Read the map as</small>
              {tw.parts.map((p) => (
                <p key={p.site}>
                  <span style={{ color: tw.colors[p.site] }}>●</span> <b>{p.ground}</b> →{" "}
                  {name(p.site)} ({p.share}%)
                </p>
              ))}
            </div>
          ) : (
            <p className="panel-text">One site holds most of the twins over the whole map.</p>
          )}
          <div className="model-checks">
            <small>How far to trust it</small>
            <p>
              <b>{tw.site_recognition}%</b> of Earth test blocks are given back to the right site
              when the model is trained without them (4 km spatial cross-validation). This checks
              that it can tell the three sites apart; it is not an accuracy for Mars or Moon
              analogues, which have no ground truth.
            </p>
            <p>
              Shares move by <b>at most {tw.max_change} points</b> when we train on other sets of
              measures ({tw.stability.map((v) => v.measures).join("; ")}).
            </p>
            <p>
              Second check, 8 km zones scored by histogram overlap:{" "}
              {t.ranking.map((id) => `${name(id)} ${z.wins[id]}`).join(", ")}, none {z.none} of{" "}
              {z.n} zones.
            </p>
          </div>
          <p className="map-caption">
            Terrain classes are ordered by the slope of the cells each site owns; they are not
            detected geological units <TagChip tag="Judgement" />. {t.zone_context}
          </p>
        </div>
      </div>

      <h2 className="block-title">Same colours, same steepness</h2>
      <p className="note">
        Slope maps at the same colour scale. Left: {t.title} from {t.dem.product}. Right: our three
        20 km boxes from the Copernicus DEM.
      </p>
      <div className="slope-strip">
        <figure className="slope-fig target-fig">
          <img src={t.dem.slope_image} alt={`Slope of ${t.title}`} />
          <figcaption>
            <b>{t.title}</b> · {t.dem.size_km[0]} × {t.dem.size_km[1]} km
          </figcaption>
        </figure>
        {t.ranking.map((id) => (
          <figure key={id} className="slope-fig">
            <img src={data.sites[id].layers.slope_color} alt={`Slope of ${name(id)}`} />
            <figcaption>
              <b>{name(id)}</b> · 20 × 20 km · {t.sites[id].score}/100
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="slope-legend">
        {SLOPE_LEGEND.map((d) => (
          <span key={d} data-deg={d}>
            {d}°{d === 35 ? "+" : ""}
          </span>
        ))}
      </div>

      <h2 className="block-title">The six measures, side by side</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Measure (median of 400 m cells)</th>
              <th className="col-target">{t.title}</th>
              {t.ranking.map((id) => (
                <th key={id}>{name(id)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.meta.features.map((f) => (
              <tr key={f.key}>
                <td>
                  {f.label}
                  <small className="unit">
                    {" "}
                    {f.scale === "landscape" ? "landscape scale" : "fine scale"}
                  </small>
                </td>
                <td className="col-target">{fmtNum(t.stats[f.key]?.median, f.unit)}</td>
                {t.ranking.map((id) => (
                  <td key={id}>
                    {fmtNum(t.sites[id].features[f.key]?.median, f.unit)}
                    <small className="overlap">
                      {" "}
                      {t.sites[id].features[f.key]?.overlap}% overlap
                    </small>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Terrain overlap score = the average overlap of the six distributions (0 = nothing in common,
        100 = identical). The six measures are weighted equally: four fine-scale, two
        landscape-scale; several are correlated because they come from the same elevation data.
        Bands: 65+ close, 45–64 moderate, under 45 poor, set by the team, not an external standard{" "}
        <TagChip tag="Judgement" />. Fine-scale measures come from DEMs of 20, 25–30 and 40 m, so
        the 400 m landscape measures compare most directly.
      </p>

      <div className="two-col">
        <section className="match-panel">
          <div className="panel-title">The {t.body === "moon" ? "Moon" : "Mars"} data</div>
          <p className="panel-text">
            <b>{t.dem.product}</b>. {t.dem.where}. {t.dem.size_km[0]} × {t.dem.size_km[1]} km at{" "}
            {t.dem.res_m} m per pixel, heights {fmtNum(t.dem.elev_min_m, "m", 0)} to{" "}
            {fmtNum(t.dem.elev_max_m, "m", 0)}. {demCheck}
          </p>
          <p className="panel-text">
            Geology there: {t.rocks.text} <TagChip tag="Reference" source={t.rocks.source} />
          </p>
          <p className="panel-links">
            <a href={t.dem.product_url} target="_blank" rel="noreferrer">
              Original product <ExternalLink />
            </a>
            <a href={t.dem.copy_url} target="_blank" rel="noreferrer">
              Copy we used <ExternalLink />
            </a>
          </p>
        </section>
        <section className="match-panel">
          <div className="panel-title">Where the analogy breaks</div>
          <ul className="plain-list">
            {t.breaks.map((b) => (
              <li key={b.text}>
                {b.text} <TagChip tag={b.tag} source={b.source} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="bench-actions">
        <Button variant="mission" asChild>
          <Link to="/site" onClick={() => setSite(winner)}>
            Step 3: open {name(winner)} <ArrowRight />
          </Link>
        </Button>
        <Button variant="instrument" asChild>
          <Link to="/report">
            <FileText /> Results report (PDF)
          </Link>
        </Button>
        <Button variant="instrument" onClick={download}>
          <Download /> Download report (Markdown)
        </Button>
        <span className="map-caption">
          Sources: {sourceName(data, t.dem.source)}; Copernicus DEM GLO-30.
        </span>
      </div>
    </div>
  );
}
