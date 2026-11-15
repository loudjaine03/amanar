# Amanar · Algeria Beyond Earth (Team Hoggar)

NASA Space Apps Challenge 2026, Boumerdes. Challenge: _Identify Earth locations that analog the permanent Moon base locations and Mars._

_Amanar_ is the Tuareg name for Orion, "the guide" of desert nights.

**Which of three Algerian desert sites is the best place on Earth to rehearse a given Mars or Moon mission task?** We measure terrain: the same six elevation-derived measures are computed on **real Mars and Moon elevation data** and on three Sahara pilot sites; a nearest-neighbour **terrain-twin model** finds which site holds the closest terrain profile for each part of the target; the geology is compared from published studies; and an L-band radar model screens for anomalies worth a subsurface survey.

Amanar evaluates three selected Algerian pilot environments to demonstrate a reproducible workflow that can later be extended to larger areas and more terrestrial candidates. It compares terrain for mission rehearsal; it is not a lunar base-site selection tool.

## Result

| Destination                                             | Real elevation data used          | Terrain overlap score, main window (/100) | Twin model, whole map (share of cells)                                                       | Geology (literature-based)                                                           |
| ------------------------------------------------------- | --------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Mars · Jezero** (Perseverance)                        | USGS/NASA Mars 2020 CTX DTM, 20 m | Tassili 59 · Ahnet 35 · Hoggar 34         | Tassili 39% (intermediate terrain) · Hoggar 34% (steep terrain) · Ahnet 24% (gentle terrain) | Ahnet: same depositional processes (river, fan, evaporite), not the same composition |
| **Mars · Gale** (Curiosity)                             | NASA-AMMOS MMGIS DEM, 20 m        | Tassili 59 · Hoggar 52 · Ahnet 31         | Hoggar 53% (steep terrain) · Ahnet 23% (gentle terrain) · Tassili 13% · no twin 11%          | No full match; Tassili closest (layered outcrops, but sandstone, not lake mudstone)  |
| **Moon · south-polar window** near Peak Near Shackleton | NASA LRO LOLA heights, 40 m       | Hoggar 59 · Tassili 45 · Ahnet 11         | Hoggar 67% · Tassili 9% · no twin on Earth 24%                                               | No full match; Hoggar closest (igneous, no impact regolith)                          |

All three first places score 59/100, in the moderate band: none reaches the close band (65). Read them as the highest-scoring of three candidates, not as close copies. No single Algerian site reproduces a whole planetary environment; the most useful site depends on the question. For Jezero, sedimentary-process work favours Ahnet while terrain-morphology work favours Tassili.

The lunar window lies near Peak Near Shackleton, one of NASA's 13 Artemis III candidate regions in 2022 (it is not in the updated list of nine from October 2024), next to the preferred Chang'e-7 area on the Shackleton rim (final landing site not announced; launch moved to 2027). We compare terrain only: no sunlight, communication, water-ice or polar-temperature analysis.

## The four steps in the app

1. **Plan**: choose the destination, what to test (driving, geology, radar under sand, crew training), which part of the target (landing area, whole map or a spot you click), your rover's slope limit, the month, a heat limit and the distance from town. The twin model runs live in your browser on the Earth ground you allow and ranks the three sites, with the reasons, the best spots a rover can reach under your slope limit, and the model's vote for the spot you clicked.
2. **Compare**: ranking by terrain overlap score, the twin map of the whole target, the literature-based geology check, the best site for each kind of test, same-colour slope maps, the six measures side by side, the stability checks, and where the analogy breaks.
3. **Site**: the look-alike map, target-like spots, what this site can test (slopes, wheel wear, relief, radar, heating), **materials** (what threatens each rover/habitat part on the target and whether this site can host a candidate field test: wheels and chassis from measured site/target ratios, the other five marked as team judgement), **crew planning indicators** by month (a screening, not a safety assessment), radar anomaly screening with its four checks, and field conditions.
4. **Rehearse**: a digital traverse rehearsal: an A* route through the Plan's spots (or the default ones) with slope-constrained path planning, driven with the signal delay (Mars: the light time on 14 Nov 2026, about 11 min, compressed; it varies from about 3 to 22 min. Moon: 1.3 s, real time), **simulated pressure sensors** along the route (barometer, tilt, wheel load cells, ground pressure, with elevation and slope profiles and an Earth twin rover from the target's gravity), and a crew-access check by month.

**Results report (PDF):** from the Plan or Compare page, _Export results (PDF)_ opens a printable report (your plan and ranked sites, reachable spots with coordinates, the comparison and twin map, materials, crew planning indicators, data, limits, sources). _Save as PDF_ uses the browser's print dialog; a Markdown version can also be downloaded.

## How the comparison works

- **Terrain overlap score (Measured).** For every 400 m cell: mean slope, share steeper than 15°, roughness (125 m), relief within 1 km, slope over 400 m and relief within 4 km (`pipeline/terrain.py`, identical for Earth, Mars and the Moon). The score is the average overlap of the six distributions (0 to 100), re-run 11 ways to check the leader holds. It is a morphometric score, not a percentage of overall or geological similarity: the six measures are weighted equally (four fine-scale, two landscape-scale), several are correlated because they come from the same elevation data, and it compares each measure's spread, not how the terrain is arranged. Fine-scale measures come from DEMs of 20, 25–30 and 40 m, so the 400 m measures compare most directly. The 65/45 bands are team-defined interpretation bands.
- **Mars/Moon data checks.** The Jezero DTM matches NASA's MOLA altimeter (r = 0.995, 28 m RMS). Our lunar slopes give Shackleton's inner wall 31°, as published (~30°, Zuber et al. 2012); the slope column shipped with that file is about twice too steep and is not used.
- **Machine learning: the nearest-neighbour terrain-twin model.** A k-nearest-neighbour model (k = 15) is trained on the six measures of the 7,500 Algerian cells, labelled by site, and assigns every 400 m cell of the Mars/Moon maps to the closest of the three site profiles; a cell farther than a heuristic cutoff from every Earth cell gets "no twin". It is not trained on confirmed Mars analogues. It gives the right site for 87% of held-out 4 km Earth blocks (spatial cross-validation): this validates telling the three sites apart, not an accuracy for Mars or Moon analogues. Its shares move by at most 2 points with other measure sets, other values of k (5 to 50) or distance-weighted votes; the no-twin share depends on the cutoff (Moon 5% to 55%), the leading site does not. The same model runs in the browser on the Plan page (`src/lib/twins.ts`; a test checks it reproduces the scikit-learn predictions, 99.5 to 100% of cells). The terrain classes on the twin map (gentle, intermediate, steep) come from slope only; they are not detected geological units.
- **Geological correspondence (Reference, literature-based).** The team wrote one cited sentence per target and site: match, partial or no. It compares depositional processes and setting for a field task, not rock composition; the app does not classify rock chemistry. Geology never changes the terrain number; it sets the label (Strong analog, Partial analog, Terrain only, Rocks only, Weak analog).
- **Radar anomaly screening (Measured, then checked).** A gradient-boosting model predicts JAXA PALSAR-2 L-band from optical, C-band and terrain and flags anomalous L-band responses. R² inside each site (spatial-block CV): Ahnet 0.63, Tassili 0.74, Hoggar 0.53; it fails on an unseen site (Ahnet −2.9), so anomalies are compared inside each site only. Every anomaly is then checked: away from the box edge, not tracing a visible boundary, radar images aligned (the rejection test is a local L-band/C-band shift over 1.5 pixels in a 256-pixel window; the whole-box offsets reported per site are all under 1 pixel), and on a smooth flat cover where L-band can see below. Ahnet 21 of 155, Tassili 11 of 47, Hoggar 1 of 31 pass. The checks reduce artefacts but do not establish what causes an anomaly: candidates are unverified targets for a ground-penetrating-radar line.
- **Materials, crew planning, sensors.** The materials module combines two data-derived environmental proxies (wheels: roughness ratio; chassis: temperature-swing ratio) with five preliminary, judgement-based test recommendations; pressure calculations are physics under stated assumptions; none of the test levels is experimentally validated. Crew planning indicators come from NASA POWER monthly climate averages (not a forecast), the slope map, yearly rain (flash-flood risk is not modelled) and an illustrative travel-time proxy from straight-line distance at an assumed 40 km/h (not a verified evacuation route), with NIOSH heat-stress advice for water. Sensor readings are physics on measured terrain (standard atmosphere, Mars scale height, wheel load = m·g·cos θ / wheels with an equal split, a 10 cm footprint assumption), not recorded data; a lighter twin rover reproduces the static load only, and ground pressure is not the soil's bearing capacity.

## What changed after the review (15 Nov)

- Real Mars and Moon elevation data in the comparison (they were typed-in specs before).
- The lunar target is now a south-polar terrain window near Peak Near Shackleton (it was the equatorial Marius Hills), described as a 2022 Artemis III candidate region next to the preferred Chang'e-7 area, not a base site.
- The ranking is measured; the hand-scored "materials" axis that counted double is gone, and so are the temperature and dryness axes that gave every site the same score.
- Your choices are back (Plan page), and the ranking for them comes from a real ML model run live, not from hand-set weights.
- R² is reported inside each site (the pooled 0.93 was inflated by the differences between sites).
- The clustering "terrain types" (which mostly re-discovered the sites) are replaced by the kNN twin model, validated on held-out blocks.
- Radar anomalies go through four artefact checks; spot picks stay out of the 800 m box border and must be reachable by a rover.
- Materials, crew planning indicators and simulated pressure sensors are back; every level says whether it is computed or team judgement.
- The PDF export of the results is back, as a full printable report.
- Wording matched to what is measured: "terrain overlap score", literature-based geology (Tassili–Gale is now partial), slope-based terrain classes instead of geological names, radar "anomalies", crew "planning indicators".
- Simpler interface: four steps instead of five, English only, larger text.

## Run it

```sh
npm install
npm run dev        # http://localhost:8080
npm test           # 67 tests: data contract, browser ML = pipeline ML, plan rules, reachable spots, materials, pressure physics, A*, report
npm run build
```

## Rebuild the data

```sh
pip install -r pipeline/requirements.txt
python pipeline/compare.py                       # a few seconds, offline: everything the website reads
python pipeline/build_all.py                     # only if you have the Earth Engine stacks (see pipeline/README.md)
python pipeline/planetary/prepare_targets.py --jezero … --gale … --moon … --mola …   # only to re-cut the Mars/Moon windows
```

## Limits

| Area             | What the prototype establishes                    | What is missing                                                |
| ---------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| Coverage         | Three 20 × 20 km pilot areas chosen by the team   | An automated search across the Sahara or Earth                 |
| Geology          | Literature-based reading of processes and setting | Mineral and chemical comparison                                |
| Terrain          | Six elevation-derived measures                    | Soil and rock properties                                       |
| Twin model       | Closest of three site terrain profiles            | A validated set of confirmed terrestrial analogues             |
| Radar            | Screened L-band anomaly candidates                | Ground truth                                                   |
| Lunar comparison | Terrain near Shackleton                           | Illumination, communication, water ice, polar temperatures     |
| Rover            | Slope-constrained A* traverse                     | Wheel-soil interaction, traction, slip, obstacles              |
| Sensors          | Formula-based simulated readings                  | Real sensor measurements                                       |
| Crew planning    | Preliminary climate and terrain indicators        | Verified road access, emergency procedures, operational safety |

Gravity, air pressure, radiation and polar light cannot be reproduced on Earth. Ahnet was already proposed as a Mars analogue in published research (Caddeo et al. 2025); Amanar's contribution is the comparative, data-driven mission-planning workflow. Team-built experimental indicators, not an official NASA assessment.

## Data and acknowledgements

- **Mars**: USGS Astrogeology / NASA Mars 2020 Terrain Relative Navigation CTX DTM (Fergason et al. 2020); NASA MGS MOLA MEGDR (PDS); NASA-AMMOS MMGIS (JPL) reference DEM of Gale crater; NASA Mars Trek.
- **Moon**: NASA LRO LOLA heights from the NASA App Development Challenge lunar data file; NASA Moon Trek.
- **Earth**: JAXA ALOS-2 PALSAR-2 (JAXA owns the PALSAR-2 data); ESA/Copernicus Sentinel-1, Sentinel-2 and DEM GLO-30; NASA POWER; Esri World Imagery.
- **Literature**: Farley et al. 2022 (Jezero floor); NASA JPL (Curiosity lakes, wheel wear, Scarecrow rover); Zuber et al. 2012 (Shackleton); NASA Artemis III candidate regions (2022 list of 13, October 2024 list of nine); The Planetary Society and Scientific American (Chang'e-7); Caddeo et al. 2025 (Ahnet); UNESCO WHC (Tassili); Azzouni-Sekkal et al. 2007 (Atakor); NASA TM-2010-216781 (lunar dust); NIOSH heat-stress recommendations. Full list in the app (Method page and PDF report).
- Copies used for the planetary windows: the Jezero DTM grid from github.com/RoshTzsche/MarsWalk and the lunar data file from github.com/1piyalib/rover_pathfinder; checksums in `pipeline/planetary/targets.json`.

**AI use**: the app was scaffolded with Lovable, and code, analysis scripts and text were written and reviewed with AI assistants (including Claude by Anthropic). All numbers come from our scripts and the cited datasets.

Team Hoggar: _names here_ · App: _link here_ · Demo video: _link here_
