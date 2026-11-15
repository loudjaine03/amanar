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
          <h2>1. Terrain overlap score: the same ruler on Earth, Mars and the Moon</h2>
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
            The terrain overlap score is the average overlap of the six distributions (log scale, 30
            bins): 0 means nothing in common, 100 means identical. It is <TagChip tag="Measured" />,
            and it is a morphometric score, not a percentage of overall or geological similarity:
            the six measures are weighted equally (four fine-scale, two landscape-scale), several
            are correlated because they come from the same elevation data, and it compares each
            measure&apos;s spread, not how the terrain is arranged. Fine scales use DEMs of 20,
            25–30 and 40 m, so the 400 m measures compare most directly. All three first places
            score 59, in the moderate band: none reaches the close band. To check that the ranking
            does not depend on our choices, it is recomputed {data.targets[target].robustness.n}{" "}
            ways: each measure left out in turn, fine-scale only, landscape-scale only, a quantile
            (Wasserstein) distance and coarser histograms. The &ldquo;close / moderate / poor&rdquo;
            bands (65 and 45) are team-defined interpretation bands, not an external standard{" "}
            <TagChip tag="Judgement" />.
          </p>
          <p>
            The ranking above uses one window per target (20 km around Perseverance&apos;s landing
            site, Curiosity&apos;s climb, Peak near Shackleton). Because that window is our choice,
            two checks look at the <b>whole</b> Mars/Moon map we have: the machine-learning twin
            model (section 2) and a zone-by-zone ranking (8 km zones every 4 km). When no site holds
            at least 60% of the twins, the headline says &ldquo;it depends on the part of the
            target&rdquo; and names which site matches which terrain class (gentle, intermediate,
            steep). These classes come from slope only: they are not detected geological units such
            as a delta or a rim, although the app notes the known geography they overlap.
          </p>
          <p>
            Inside each site we also search the best 4 × 4 km area and rank every cell by how
            typical it is of the target (the &ldquo;looks like&rdquo; map). The outer{" "}
            {data.meta.border_cells * 400} m of each box are excluded from spot picks, because 1 km
            windows and the radar model are unreliable at the edge.
          </p>
        </section>

        <section>
          <h2>2. Machine learning: the nearest-neighbour terrain-twin model</h2>
          <p>
            A k-nearest-neighbour model (k = {data.targets[target].twins.k}) is trained on the six
            measures of all 7,500 Algerian cells, each labelled with its site. For every 400 m cell
            of the Mars/Moon map it finds the {data.targets[target].twins.k} closest Earth cells
            (Euclidean distance on standardised, log-scaled measures) and predicts the site that
            holds most of them. If even the nearest Earth cell is farther than 1.5 × the 99th
            percentile of Earth-to-Earth nearest distances, the cell gets &ldquo;no twin on
            Earth&rdquo;: this cutoff is a heuristic <TagChip tag="Judgement" />. No weight is set
            by hand. The model is not trained on confirmed Mars or Moon analogues: it assigns each
            target cell the closest of three Algerian terrain profiles.
          </p>
          <p>
            Checks: the model recognises the right Algerian site on{" "}
            {data.targets[target].twins.site_recognition}% of 4 km blocks it never saw (5-fold
            spatial cross-validation; chance 33%). That validates telling the three sites apart, not
            an accuracy for Mars or Moon analogues, which have no ground truth. The shares move by
            at most {Math.max(...data.target_order.map((id) => data.targets[id].twins.max_change))}{" "}
            points when it is trained on other sets of measures, other values of k (5 to 50) or
            distance-weighted votes; the no-twin share depends on the cutoff (Moon 5% to 55% for
            cutoffs of 3 to 1 times the 99th percentile), the leading site does not. Whole-map
            shares:{" "}
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
            south-polar terrain near Peak Near Shackleton: one of NASA&apos;s 13 Artemis III
            candidate regions in 2022 (not in the updated list of nine from October 2024) and next
            to the preferred Chang&apos;e-7 area on the Shackleton rim, whose final landing site is
            not announced. This is a terrain-rehearsal comparison, not a lunar base-site assessment:
            no sunlight, communication, water-ice or polar-temperature analysis. Earth slopes use
            the Copernicus 30 m DEM; the Moon window is a 40 m grid, so its fine-scale slopes are
            slightly smoothed. The two landscape-scale measures do not depend on this.
          </p>
        </section>

        <section>
          <h2>4. Geological correspondence (literature-based): kept out of the score</h2>
          <p>
            For every target and site, the team wrote one sentence from a published source saying
            whether the geology matches, partly matches or does not match{" "}
            <TagChip tag="Reference" />. It compares depositional processes and setting relevant to
            a field task, not rock composition: the app does not classify rock chemistry. Example:
            Ahnet shares Jezero&apos;s river, fan and evaporite processes but not its clays,
            carbonates or igneous floor; Tassili&apos;s sandstone cliffs are good for practising
            layered-outcrop mapping but differ from Gale&apos;s lake mudstones and sulfates, so it
            is &ldquo;partial&rdquo;. Geology never changes the terrain number. It only sets the
            label: <b>Strong analog</b> (close terrain + matching geology), <b>Partial analog</b>,{" "}
            <b>Terrain only</b> (good for driving tests), <b>Rocks only</b> (good for geology
            training) and <b>Weak analog</b>.
          </p>
        </section>

        <section>
          <h2>5. Radar anomaly screening</h2>
          <p>
            A gradient-boosting model ({m.type}) predicts {m.target} from what the surface shows (
            {Object.values(m.predictors).join(", ")}). Where L-band is much brighter than predicted
            (z &gt; {m.hotspot_z}), the response is anomalous: something the surface does not
            explain may be there, as the shuttle radar SIR-A showed with buried river channels in
            the eastern Sahara. The model only identifies anomalous L-band responses; it does not
            tell what causes them.
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
            <li>
              radar images aligned around it (local L-band vs C-band shift under 1.5 px in a 256 px
              window; this is the rejection test, while the whole-box offsets reported per site are
              all under 1 px);
            </li>
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
            strata of Ahnet). The checks reduce artefacts but do not establish the physical origin
            of an anomaly: every candidate is an unverified target for subsurface investigation, and
            the field test is a ground-penetrating-radar line across them.
          </p>
        </section>

        <section>
          <h2>6. Materials, crew safety and simulated sensors</h2>
          <p>
            <b>Materials</b> (Site page): for wheels, seals, solar panels, structure, thermal
            blankets, mechanisms and the habitat shell we cite what threatens them on the target{" "}
            <TagChip tag="Reference" />. Two levels are computed: wheels from rough ground (90th
            percentile) and the chassis from the daily temperature swing, site divided by target
            (50% or more = test here, 25 to 50% = partly) <TagChip tag="Measured" />. The other five
            (seals, solar panels, thermal blankets, mechanisms, habitat shell) have no site
            measurement yet, so their level is our judgement and is tagged{" "}
            <TagChip tag="Judgement" /> on the page. Habitat wall loads use the pressure difference
            (1 kPa on 1 m² = 1 kN); the habitat&apos;s &ldquo;partly&rdquo; level is our judgement.
            These are candidate field tests, not demonstrated material performance.
          </p>
          <p>
            <b>Crew planning indicators</b> (a preliminary field-conditions and logistics screening,
            not a safety assessment): monthly climate averages of daily maximum and minimum
            temperature from NASA POWER (not a forecast), drinking water from the NIOSH heat-stress
            advice (1 cup every 15 to 20 minutes), falls from the share of ground steeper than 15°,
            yearly rain as context (flash-flood risk is not modelled), and an illustrative
            travel-time proxy from the straight-line distance to the nearest town at an assumed 40
            km/h, not a verified evacuation route <TagChip tag="Judgement" />.
          </p>
          <p>
            <b>Simulated pressure sensors</b> (Rehearse page): along the planned route the barometer
            follows elevation (standard atmosphere on Earth; NSSDC mean pressure and 11.1 km scale
            height on Mars), the tilt sensor follows the slope grid, and each wheel load cell reads
            m · g · cos(slope) / wheels for a lighter Earth twin rover (mass × g<sub>target</sub> /
            9.81, JPL&apos;s Scarecrow method). Ground pressure assumes a wheel footprint you can
            change. These are formulas, not recorded sensor data: they show what the field test
            should log and check. Assumptions: the load is split equally between wheels; the 10 cm
            footprint is ours; ground pressure is not the soil&apos;s bearing capacity; a lighter
            twin rover reproduces the static load, not low-gravity dynamics; Mars and Moon pressures
            are theoretical estimates. The A* route is a slope-constrained planning demonstration,
            not a verified safe traverse or a model of traction and slip. The 11-minute Mars delay
            is the light time on 14 Nov 2026; it varies from about 3 to 22 minutes.
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
              The Marius Hills target, compared only with typed-in specs. Replaced by a south-polar
              terrain window near Peak Near Shackleton, with real LOLA heights.
            </li>
          </ul>
        </section>

        <section>
          <h2>8. Scope and limits</h2>
          <p>
            Amanar evaluates three selected Algerian pilot environments to demonstrate a
            reproducible workflow that can later be extended to larger areas and more terrestrial
            candidates. It did not search the whole Sahara, and it does not claim to have found
            Ahnet&apos;s relevance: Ahnet was already discussed as a Mars analogue in published 2025
            research (Caddeo et al. 2025). Our contribution is the comparative, data-driven
            mission-planning workflow.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Area</th>
                <th>What the prototype establishes</th>
                <th>What is missing</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Coverage</td>
                <td>Three 20 × 20 km pilot areas</td>
                <td>An automated search across the Sahara or Earth</td>
              </tr>
              <tr>
                <td>Geology</td>
                <td>Literature-based reading of processes and setting</td>
                <td>Mineral and chemical comparison (spectra, samples)</td>
              </tr>
              <tr>
                <td>Terrain</td>
                <td>Six elevation-derived measures</td>
                <td>Soil and rock properties, grain size, regolith</td>
              </tr>
              <tr>
                <td>Twin model</td>
                <td>Closest of three site terrain profiles</td>
                <td>A validated set of confirmed terrestrial analogues</td>
              </tr>
              <tr>
                <td>Radar</td>
                <td>Screened L-band anomaly candidates</td>
                <td>Ground truth (GPR lines, trenches)</td>
              </tr>
              <tr>
                <td>Lunar comparison</td>
                <td>Terrain near Shackleton</td>
                <td>Illumination, communication, water ice, polar temperatures</td>
              </tr>
              <tr>
                <td>Rover</td>
                <td>Slope-constrained A* traverse</td>
                <td>Wheel-soil interaction, traction, slip, obstacles</td>
              </tr>
              <tr>
                <td>Sensors</td>
                <td>Formula-based simulated readings</td>
                <td>Real sensor measurements</td>
              </tr>
              <tr>
                <td>Crew planning</td>
                <td>Preliminary climate and terrain indicators</td>
                <td>Verified road access, emergency procedures, operational safety</td>
              </tr>
            </tbody>
          </table>
          <p>
            Gravity, air pressure, radiation and polar light cannot be reproduced at any Earth site
            (each target lists them). Team-built experimental indicators, not an official NASA
            assessment.
          </p>
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
