import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataGate, useMissionData } from "./MissionShell";
import { SiteMap } from "./SiteMap";
import { TagChip } from "./TagChip";
import { currentSite, useMissionStore, type SiteLayer } from "@/lib/mission-store";
import { BAND_WORD, fmtNum, GEO_WORD, LABEL_HINT, TEST_WORD } from "@/lib/report";
import { crewSafety, materialRows, SAFETY, type Risk } from "@/lib/materials";
import type { Hotspot } from "@/types/mission";

const RISK_WORD: Record<Risk, string> = { ok: "LOW", warn: "PLAN FOR IT", fail: "TOO HIGH" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CHECKS: { key: keyof Hotspot["checks"]; label: string; why: string }[] = [
  {
    key: "away_from_edge",
    label: "Away from the box edge",
    why: "Filters and the model are least reliable within 500 m of the edge.",
  },
  {
    key: "not_on_boundary",
    label: "Not tracing a visible boundary",
    why: "A hotspot that follows a sharp line in the photo is usually a surface contact, not something buried.",
  },
  {
    key: "images_aligned",
    label: "Radar images aligned here",
    why: "L-band and C-band offset by more than 1.5 px (37 m) would create fake differences.",
  },
  {
    key: "smooth_flat_cover",
    label: "On a smooth, flat cover",
    why: "L-band only sees below a dry, flat cover that is dark to C-band and shows no layered rock.",
  },
];

export function SitePage() {
  const { data, error } = useMissionData();
  const target = useMissionStore((s) => s.target);
  const chosen = useMissionStore((s) => s.site);
  const layer = useMissionStore((s) => s.layer);
  const showHot = useMissionStore((s) => s.showHotspots);
  const month = useMissionStore((s) => s.month);
  const heatLimit = useMissionStore((s) => s.heatLimit);
  const { setSite, setLayer, setShowHotspots, setMonth } = useMissionStore.getState();
  if (!data) {
    return (
      <div className="foundation-page">
        <div className="eyebrow">STEP 3 · SITE</div>
        <h1>Site</h1>
        <DataGate error={error} />
      </div>
    );
  }
  const t = data.targets[target];
  const sid = currentSite(data, target, chosen)!;
  const site = data.sites[sid];
  const r = t.sites[sid];
  const overlays: Record<SiteLayer, string | null> = {
    like: site.layers.like[target],
    satellite: null,
    l_band: site.layers.l_band,
    slope: site.layers.slope_color,
  };
  const layerNames: Record<SiteLayer, string> = {
    like: `Looks like ${t.title}`,
    satellite: "Satellite only",
    l_band: "L-band radar",
    slope: "Slope",
  };
  const radar = site.radar;
  const shown = [
    ...radar.hotspots.filter((h) => h.verdict === "candidate").slice(0, 5),
    ...radar.hotspots.filter((h) => h.verdict !== "candidate").slice(0, 4),
  ];
  const c = site.conditions;
  const tmax = c.monthly_tmax_c.filter((v): v is number => v !== null);
  const tmin = c.monthly_tmin_c.filter((v): v is number => v !== null);
  const hottest = tmax.length ? MONTHS[c.monthly_tmax_c.indexOf(Math.max(...tmax))] : "";
  const coldest = tmin.length ? MONTHS[c.monthly_tmin_c.indexOf(Math.min(...tmin))] : "";
  const r2 = data.meta.radar_model.r2_by_site[sid];
  const mats = materialRows(data, target, sid);
  const safety = crewSafety(data, sid, month, heatLimit);
  return (
    <div className="foundation-page page-wide">
      <div className="eyebrow">STEP 3 · SITE</div>
      <div className="site-switch-row" role="group" aria-label="Site">
        {t.ranking.map((id) => (
          <button
            key={id}
            type="button"
            className="layer-btn big"
            data-active={id === sid}
            aria-pressed={id === sid}
            onClick={() => setSite(id)}
          >
            {data.sites[id].name} · {t.sites[id].score}/100
          </button>
        ))}
      </div>
      <h1>
        {site.name} <span className="h1-sub">for {t.title}</span>
      </h1>
      <div className="summary-chips">
        <span className={`label-chip label-${r.label.split(" ")[0]!.toLowerCase()}`}>
          {r.label}
        </span>
        <span>
          Terrain match <b>{r.score}/100</b> ({BAND_WORD[r.band].toLowerCase()}){" "}
          <TagChip tag="Measured" source={t.dem.source} />
        </span>
        <span className={`geo-chip geo-${r.geology.level}`}>{GEO_WORD[r.geology.level]}</span>
        <span className="map-caption">{LABEL_HINT[r.label]}</span>
      </div>

      <div className="site-grid">
        <section className="match-panel">
          <div className="layer-row">
            {(Object.keys(overlays) as SiteLayer[]).map((l) => (
              <button
                key={l}
                type="button"
                className="layer-btn"
                data-active={layer === l}
                aria-pressed={layer === l}
                onClick={() => setLayer(l)}
              >
                {layerNames[l]}
              </button>
            ))}
          </div>
          <div className="match-map-box site-map">
            <SiteMap
              bounds={site.bounds}
              overlay={overlays[layer]}
              opacity={layer === "like" ? 0.85 : 0.75}
              bestArea={r.best_area.bounds}
              spots={r.spots}
              hotspots={showHot ? radar.hotspots : []}
            />
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={showHot}
              onChange={(e) => setShowHotspots(e.target.checked)}
            />
            Radar hotspots: <span className="dot dot-green" /> pass all 4 checks ·{" "}
            <span className="dot dot-red" /> doubtful
          </label>
          <p className="map-caption">
            {layer === "like"
              ? `Teal = 400 m cells whose six terrain measures are typical of ${t.title}. Orange 1–5 = the most ${t.title}-like spots. Yellow box = the best 4 km area. The outer 800 m is left out (edge effects).`
              : layer === "l_band"
                ? "JAXA PALSAR-2 L-band (24 cm wavelength): it sees through a thin, very dry cover."
                : layer === "slope"
                  ? "Slope from the Copernicus DEM, same colours as the Mars/Moon maps on the Compare page."
                  : "Esri World Imagery basemap; the dashed line is our 20 km study box."}
          </p>
        </section>

        <aside className="site-side">
          <section className="match-panel">
            <div className="panel-title">Most {t.title}-like spots</div>
            <ol className="spot-ol">
              {r.spots.map((s, i) => (
                <li key={s.id}>
                  <span className="spot-n">{i + 1}</span>
                  <div>
                    <b>{s.score}/100</b>{" "}
                    <span className="map-caption">
                      ({s.coords[0]}, {s.coords[1]})
                    </span>
                    <small>{s.why}</small>
                  </div>
                </li>
              ))}
            </ol>
            <p className="panel-text">
              Best 4 km area inside this box: <b>{r.best_area.score}/100</b> (whole box {r.score}
              /100). <TagChip tag="Measured" />
            </p>
          </section>
          <section className="match-panel">
            <div className="panel-title">Rocks</div>
            <p className="panel-text">
              <span className={`geo-chip geo-${r.geology.level}`}>{GEO_WORD[r.geology.level]}</span>{" "}
              {r.geology.text} <TagChip tag="Reference" source={r.geology.source} />
            </p>
            <p className="panel-text muted">
              {t.title}: {t.rocks.text}.
            </p>
          </section>
        </aside>
      </div>

      <h2 className="block-title">What you can test here for {t.title}</h2>
      <div className="test-list">
        {r.tests.map((x) => (
          <div key={x.name} className="test-row">
            <span className={`test-badge test-${x.level}`}>{TEST_WORD[x.level]}</span>
            <div>
              <b>{x.name}</b> <TagChip tag={x.tag} />
              <p>{x.text}</p>
            </div>
          </div>
        ))}
      </div>
      <details className="rules-box">
        <summary>At any Earth site (needs a lab or a lighter twin rover)</summary>
        <div className="test-list">
          {t.lab_tests.map((x) => (
            <div key={x.name} className="test-row">
              <span className={`test-badge test-${x.level}`}>{TEST_WORD[x.level]}</span>
              <div>
                <b>{x.name}</b>
                <p>{x.text}</p>
              </div>
            </div>
          ))}
        </div>
      </details>

      <h2 className="block-title">Materials: what this site can test for {t.title}</h2>
      <p className="note">
        Each part of a rover or habitat, what threatens it on {t.title}, and whether {site.name} can
        test it. Levels come from the site&apos;s numbers divided by the target&apos;s (50% or more
        = test here, 25 to 50% = partly).
      </p>
      <div className="test-list">
        {mats.map((m) => (
          <div key={m.id} className="test-row mat-row">
            <span className={`test-badge test-${m.level}`}>{TEST_WORD[m.level]}</span>
            <div>
              <b>{m.component}</b> <TagChip tag={m.tag} source={m.source} />
              <p>
                <i>On {t.title}:</i> {m.threat}
              </p>
              <p>
                <i>Here:</i> {m.here}
              </p>
              <p className="mat-meta">
                Options to compare: {m.options}. Still needs a lab: {m.lab}
              </p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="block-title">Crew safety at {site.name}</h2>
      <div className="safety-head">
        <label className="slider-row inline">
          <span>Month</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <span className="map-caption">
          Heat limit {heatLimit}°C (change it on the Plan page). Assumes {SAFETY.workHours} h of
          work a day.
        </span>
      </div>
      <div className="safety-grid">
        {safety.map((x) => (
          <div key={x.id} className="safety-card" data-risk={x.risk}>
            <div className="safety-top">
              <b>{x.hazard}</b>
              <span className="safety-risk">{RISK_WORD[x.risk]}</span>
            </div>
            <strong>{x.value}</strong>
            <p>{x.advice}</p>
            <TagChip tag={x.tag} source={x.source} />
          </div>
        ))}
      </div>

      <h2 className="block-title">What may be under the sand</h2>
      <div className="two-col">
        <section className="match-panel">
          <div className="panel-title">Radar evidence</div>
          <p className="panel-text big-line">
            <b>{radar.total}</b> radar hotspots found, <b className="good">{radar.candidates}</b>{" "}
            pass all four checks ({fmtNum(radar.candidate_km2, "km²", 2)}).{" "}
            <TagChip tag="Measured" source="ml" />
          </p>
          <ul className="check-list">
            {CHECKS.map((k) => {
              const failed = radar.hotspots.filter((h) => !h.checks[k.key]).length;
              return (
                <li key={k.key}>
                  <b>{k.label}</b> <span className="map-caption">fails for {failed}</span>
                  <small>{k.why}</small>
                </li>
              );
            })}
          </ul>
          <p className="panel-text muted">
            Whole-box alignment: L-band vs C-band offset ({radar.coreg.l_vs_c_px.join(", ")}) px,
            L-band vs optical ({radar.coreg.l_vs_optical_px.join(", ")}) px, with{" "}
            {radar.coreg.pixel_m} m pixels: misalignment is not a general cause. Model accuracy
            inside this site: R² = {r2} (spatial-block cross-validation).
          </p>
        </section>
        <section className="match-panel">
          <div className="panel-title">Hotspots (candidates first)</div>
          <ul className="hot-list">
            {shown.map((h) => (
              <li key={h.id}>
                <span className={`hot-v hot-${h.verdict}`}>
                  {h.verdict === "candidate" ? <Check /> : <X />}
                </span>
                <div>
                  <b>{h.id}</b> {fmtNum(h.area_km2, "km²", 2)} · z ≈ {h.z_mean}
                  {h.z_mean >= 3 ? "+" : ""}{" "}
                  <TagChip tag={h.verdict === "candidate" ? "Hypothesis" : "Measured"} />
                  <small>
                    {h.verdict === "candidate"
                      ? "Passes all four checks: worth a ground-penetrating radar transect."
                      : h.reasons.join("; ")}
                  </small>
                </div>
              </li>
            ))}
          </ul>
          {radar.total > shown.length && (
            <p className="map-caption">
              + {radar.total - shown.length} more hotspots ({Math.max(0, radar.candidates - 5)}{" "}
              candidates, the rest doubtful), all on the map.
            </p>
          )}
          <p className="map-caption">
            Nothing here is confirmed: no ground truth exists yet. The field test is a GPR line
            across the candidates.
          </p>
        </section>
      </div>

      <h2 className="block-title">Field conditions for an Earth test team</h2>
      <div className="cond-grid">
        <div>
          <small>Hottest month (avg. max)</small>
          <b>
            {fmtNum(Math.max(...tmax), "°C", 0)} <em>{hottest}</em>
          </b>
        </div>
        <div>
          <small>Coldest night (avg. min)</small>
          <b>
            {fmtNum(Math.min(...tmin), "°C", 0)} <em>{coldest}</em>
          </b>
        </div>
        <div>
          <small>Rain per year</small>
          <b>{fmtNum(c.rain_mm_year, "mm", 0)}</b>
        </div>
        <div>
          <small>Daily swing</small>
          <b>{fmtNum(c.daily_range_c, "°C", 0)}</b>
        </div>
        <div>
          <small>Nearest hub (straight line)</small>
          <b>
            {fmtNum(c.hub.distance_km, "km", 0)} <em>{c.hub.name}</em>
          </b>
        </div>
        <div>
          <small>Elevation · air pressure</small>
          <b>
            {fmtNum(c.elevation_m, "m", 0)} · {fmtNum(c.air_pressure_kpa, "kPa")}
          </b>
        </div>
      </div>
      <p className="map-caption">
        NASA POWER climatology <TagChip tag="Measured" source="nasa_power" /> · pressure from
        elevation (standard atmosphere). Climate averages are not a forecast.
      </p>

      <div className="bench-actions">
        <Button variant="mission" asChild>
          <Link to="/rehearse">
            Step 4: drive a rover here <ArrowRight />
          </Link>
        </Button>
        <Button variant="instrument" asChild>
          <Link to="/compare">Back to the comparison</Link>
        </Button>
      </div>
    </div>
  );
}
