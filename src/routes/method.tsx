import { createFileRoute } from "@tanstack/react-router";
import { DataGate, useMissionData } from "@/components/mission/MissionShell";
import { TagChip } from "@/components/mission/TagChip";
import { missionHead } from "@/lib/mission-head";
import { useMissionStore } from "@/lib/mission-store";

export const Route = createFileRoute("/method")({
  head: () =>
    missionHead(
      "Method & limits",
      "How Amanar compares Algerian sites with real Mars and Moon terrain, what is measured, what is judged, and the limits.",
    ),
  component: Method,
});

function Method() {
  const { data, error } = useMissionData();
  const target = useMissionStore((s) => s.target);
  if (!data) {
    return (
      <div className="foundation-page">
        <div className="eyebrow">METHOD</div>
        <h1>Method & limits</h1>
        <DataGate error={error} />
      </div>
    );
  }
  const m = data.meta.radar_model;
  const rules = data.meta.hotspot_rules;
  const name = (id: string) => data.sites[id as keyof typeof data.sites]?.name ?? id;
  return (
    <div className="foundation-page page-wide method-page">
      <div className="eyebrow">METHOD</div>
      <h1>Method & limits</h1>
      <p className="page-sub">What is measured, what is judged, and where Earth cannot help.</p>

      <div className="method-sections">
        <section>
          <h2>1. Terrain match: the same ruler on Earth, Mars and the Moon</h2>
          <p>
            Every 400 m cell of each Algerian box and of each Mars/Moon window gets the same six
            measures (<code>pipeline/terrain.py</code>):
          </p>
          <ul className="plain-list">
            {data.meta.features.map((f) => (
              <li key={f.key}>
                <b>{f.label}</b> ({f.unit}, {f.scale} scale)
              </li>
            ))}
          </ul>
          <p>
            The terrain match is the average overlap of the six distributions (log scale, 30 bins):
            0 means nothing in common, 100 means identical. It is <TagChip tag="Measured" />. To
            check that the ranking does not depend on our choices, it is recomputed{" "}
            {data.targets[target].robustness.n} ways: each measure left out in turn, fine-scale
            only, landscape-scale only, a quantile (Wasserstein) distance and coarser histograms.
            The &ldquo;close / moderate / poor&rdquo; bands (65 and 45) are our{" "}
            <TagChip tag="Judgement" />.
          </p>
          <p>
            The ranking above uses one window per target (20 km around Perseverance&apos;s landing
            site, Curiosity&apos;s climb, Peak near Shackleton). Because that window is our choice,
            two checks look at the <b>whole</b> Mars/Moon map we have: the machine-learning twin
            model (section 2) and a zone-by-zone ranking (8 km zones every 4 km). When no site holds
            at least 60% of the twins, the headline says &ldquo;it depends on the part of the
            target&rdquo; and names which site matches which kind of ground.
          </p>
          <p>
            Inside each site we also search the best 4 × 4 km area and rank every cell by how
            typical it is of the target (the &ldquo;looks like&rdquo; map). The outer{" "}
            {data.meta.border_cells * 400} m of each box are excluded from spot picks, because 1 km
            windows and the radar model are unreliable at the edge.
          </p>
        </section>

        <section>
          <h2>2. Machine learning: the twin model</h2>
          <p>
            A k-nearest-neighbour model (k = {data.targets[target].twins.k}) is trained on the six
            measures of all 7,500 Algerian cells, each labelled with its site. For every 400 m cell
            of the Mars/Moon map it finds the {data.targets[target].twins.k} closest Earth cells
            (Euclidean distance on standardised, log-scaled measures) and predicts the site that
            holds most of them. If even the nearest Earth cell is farther than 1.5 × the 99th
            percentile of Earth-to-Earth nearest distances, the cell gets &ldquo;no twin on
            Earth&rdquo;. No weight is set by hand <TagChip tag="Measured" />.
          </p>
          <p>
            Checks: the model recognises the right Algerian site on{" "}
            {data.targets[target].twins.site_recognition}% of 4 km blocks it never saw (5-fold
            spatial cross-validation; chance 33%), and the shares move by at most{" "}
            {Math.max(...data.target_order.map((id) => data.targets[id].twins.max_change))} points
            when it is trained on other sets of measures. Whole-map shares:{" "}
            {data.target_order
              .map((id) => {
                const sh = data.targets[id].twins.share;
                return `${data.targets[id].title}: ${data.site_order.map((x) => `${name(x)} ${sh[x]}%`).join(", ")}, no twin ${sh.none}%`;
              })
              .join(". ")}
            .
          </p>
          <p>
            The same model runs <b>live in your browser</b> on the Plan page (
            <code>src/lib/twins.ts</code>, checked by a test to give back the pipeline&apos;s
            predictions). There it only searches the Earth ground you can use: cells under your
            slope limit, inside the box border, at sites within your distance limit. The ordering
            rule for each goal (driving, rocks, radar, crew) is written on the page.
          </p>
        </section>

        <section>
          <h2>3. The Mars and Moon elevation data</h2>
          <ul className="plain-list">
            {data.target_order.map((id) => {
              const t = data.targets[id];
              return (
                <li key={id}>
                  <b>{t.title}</b>: {t.dem.product}. {t.dem.where}. {t.dem.size_km[0]} ×{" "}
                  {t.dem.size_km[1]} km at {t.dem.res_m} m.{" "}
                  {t.dem.check_vs_mola &&
                    `Checked against MOLA (PDS): r = ${t.dem.check_vs_mola.correlation}, RMS ${t.dem.check_vs_mola.rms_m} m. `}
                  {t.dem.check_slope &&
                    `${t.dem.check_slope.note} Shackleton's wall: ${t.dem.check_slope.shackleton_inner_wall_deg}° (published ~${t.dem.check_slope.published_wall_deg}°). `}
                  <a href={t.dem.product_url} target="_blank" rel="noreferrer">
                    product
                  </a>{" "}
                  ·{" "}
                  <a href={t.dem.copy_url} target="_blank" rel="noreferrer">
                    copy used
                  </a>
                </li>
              );
            })}
          </ul>
          <p>
            Each window is centred on the place the mission actually works: 20 km around
            Perseverance&apos;s landing site, Curiosity&apos;s climb on lower Mount Sharp, and the
            Peak-near-Shackleton region of the lunar south pole (on NASA&apos;s 2022 list of Artemis
            candidate regions and the planned Chang&apos;e-7 landing area). Earth slopes use the
            Copernicus 30 m DEM; the Moon window is a 40 m grid, so its fine-scale slopes are
            slightly smoothed. The two landscape-scale measures do not depend on this.
          </p>
        </section>

        <section>
          <h2>4. Rocks: kept out of the score</h2>
          <p>
            For every target and site, one sentence with a source says whether the rocks match,
            partly match, or do not match <TagChip tag="Reference" />. Geology never changes the
            terrain number. It only sets the label: <b>Strong analog</b> (close terrain + matching
            rocks), <b>Partial analog</b>, <b>Terrain only</b> (good for driving tests),{" "}
            <b>Rocks only</b> (good for rock science) and <b>Weak analog</b>.
          </p>
        </section>

        <section>
          <h2>5. Radar: what may be under the sand</h2>
          <p>
            A gradient-boosting model ({m.type}) predicts {m.target} from what the surface shows (
            {Object.values(m.predictors).join(", ")}). Where L-band is much brighter than predicted
            (z &gt; {m.hotspot_z}), something the surface does not explain may be there, as the
            shuttle radar SIR-A showed with buried river channels in the eastern Sahara.
          </p>
          <p>
            Accuracy inside each site (spatial-block cross-validation):{" "}
            {data.site_order.map((s) => `${name(s)} R² = ${m.r2_by_site[s]}`).join(", ")}. On a site
            the model has never seen it fails for Ahnet (R² = {m.r2_leave_one_site_out.ahnet}), so
            hotspots are compared inside each site only. A pooled R² over the three sites would look
            higher only because the sites differ so much; we do not use it.
          </p>
          <p>
            Every hotspot then goes through four checks <TagChip tag="Judgement" />:
          </p>
          <ul className="plain-list">
            <li>away from the box edge (more than {rules["edge_m"]} m);</li>
            <li>
              not tracing a sharp boundary of the optical image (at most{" "}
              {Math.round((rules["contact_share"] ?? 0) * 100)}% of it on strong edges, or under{" "}
              {rules["contact_ratio"]}× the site average);
            </li>
            <li>radar images aligned around it (local L-band vs C-band offset under 1.5 px);</li>
            <li>
              on a smooth, flat cover where L-band can see below: slope under{" "}
              {rules["flat_slope_deg"]}°, in the C-band-darkest{" "}
              {Math.round((rules["cband_pct"] ?? 0) * 100)}% of the site, and without visible
              layered rock (optical texture in the lower{" "}
              {Math.round((rules["texture_pct"] ?? 0) * 100)}%).
            </li>
          </ul>
          <p>
            Result:{" "}
            {data.site_order
              .map(
                (s) =>
                  `${name(s)} ${data.sites[s].radar.candidates} of ${data.sites[s].radar.total}`,
              )
              .join(", ")}{" "}
            hotspots pass. Many of the rest follow exposed rock layers (for example the folded
            strata of Ahnet). No hotspot is confirmed; the field test is a ground-penetrating-radar
            line across the candidates.
          </p>
        </section>

        <section>
          <h2>6. Materials, crew safety and simulated sensors</h2>
          <p>
            <b>Materials</b> (Site page): for wheels, seals, solar panels, structure, thermal
            blankets, mechanisms and the habitat shell we cite what threatens them on the target{" "}
            <TagChip tag="Reference" /> and decide whether the site can test it from a ratio of
            measured numbers: rough ground (90th percentile) and daily temperature swing, site
            divided by target. 50% or more = test here, 25 to 50% = partly. Habitat wall loads use
            the pressure difference (1 kPa on 1 m² = 1 kN).
          </p>
          <p>
            <b>Crew safety</b>: heat and cold from NASA POWER for the chosen month, drinking water
            from the NIOSH heat-stress advice (1 cup every 15 to 20 minutes), falls from the share
            of ground steeper than 15°, flash floods from yearly rain, and time to help from the
            straight-line distance to the nearest town at 40 km/h <TagChip tag="Judgement" />.
          </p>
          <p>
            <b>Simulated pressure sensors</b> (Rehearse page): along the planned route the barometer
            follows elevation (standard atmosphere on Earth; NSSDC mean pressure and 11.1 km scale
            height on Mars), the tilt sensor follows the slope grid, and each wheel load cell reads
            m · g · cos(slope) / wheels for a lighter Earth twin rover (mass × g<sub>target</sub> /
            9.81, JPL&apos;s Scarecrow method). Ground pressure assumes a wheel footprint you can
            change. These are formulas, not recorded sensor data: they show what the field test
            should log and check.
          </p>
        </section>

        <section>
          <h2>7. What we removed, and why</h2>
          <ul className="plain-list">
            <li>
              A hand-scored &ldquo;materials&rdquo; axis that counted double: it decided two of
              three results by itself. Rocks are now a separate, cited check.
            </li>
            <li>
              Temperature and dryness as score axes: they gave almost the same value to every site.
              They are now field conditions for the test team.
            </li>
            <li>
              A hand-weighted &ldquo;finder&rdquo; score (preferences set by us): replaced by the
              twin model run live on your choices.
            </li>
            <li>
              A pooled radar-model R² (0.93): high only because the three sites differ so much. We
              report R² inside each site.
            </li>
            <li>
              Six &ldquo;AI terrain types&rdquo; from clustering: most types existed at only one
              site, so they mostly told the sites apart. Replaced by the kNN twin model, trained on
              Earth and applied to real Mars/Moon cells.
            </li>
            <li>
              The Marius Hills target, compared only with typed-in specs. Replaced by the lunar
              south pole, where permanent bases are planned, with real LOLA heights.
            </li>
          </ul>
        </section>

        <section>
          <h2>8. Limits</h2>
          <ul className="plain-list">
            <li>
              Three 20 km boxes chosen by the team; other Algerian places may match better. The
              best-4-km search only looks inside these boxes.
            </li>
            <li>
              Terrain shape and published geology only: no mineral spectra, no grain size, no
              regolith properties.
            </li>
            <li>
              Gravity, air pressure, radiation and polar light cannot be reproduced at any Earth
              site (each target lists them).
            </li>
            <li>
              Radar hotspots are candidates, look-alike spots and rover stops are hypotheses,
              straight-line distance is not road access, climate averages are not a forecast.
            </li>
          </ul>
        </section>

        <section>
          <h2>9. Reproduce it</h2>
          <p>
            <code>python pipeline/planetary/prepare_targets.py …</code> cuts the Mars/Moon windows
            (already committed as small .npz files). <code>python pipeline/build_all.py</code> needs
            the three Earth Engine stacks (not in the repository, about 20 MB each).{" "}
            <code>python pipeline/compare.py</code> rebuilds everything the website reads in a few
            seconds, offline.
          </p>
          <p>
            AI use: the app was scaffolded with Lovable, and code, analysis scripts and text were
            written and reviewed with AI assistants (including Claude by Anthropic). All numbers
            come from our scripts and the cited datasets.
          </p>
        </section>

        <section>
          <h2>Sources</h2>
          <ul className="plain-list sources">
            {data.meta.sources.map((s) => (
              <li key={s.id}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.name}
                  </a>
                ) : (
                  s.name
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
