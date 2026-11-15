# Amanar · Algeria Beyond Earth (Team Hoggar)

NASA Space Apps Challenge 2026, Boumerdes. Challenge: *Identify Earth locations that analog the permanent Moon base locations and Mars.*

*Amanar* is the Tuareg name for Orion, "the guide" of desert nights.

**Which Algerian desert site is the best place on Earth to rehearse a Mars or Moon mission?** We measure it: the same six terrain measures are computed on **real Mars and Moon elevation data** and on three Sahara sites, then the rocks are checked against published geology, and an L-band radar model looks for what may be under the sand.

## Result

| Destination | Real elevation data used | Terrain match, landing area (/100) | ML twin map, whole map (share of cells) | Rocks |
| --- | --- | --- | --- | --- |
| **Mars · Jezero** (Perseverance) | USGS/NASA Mars 2020 CTX DTM, 20 m | Tassili 59 · Ahnet 35 · Hoggar 34 | Tassili 39% (delta, rougher floor) · Hoggar 34% (rim, inlet canyon) · Ahnet 24% (smooth floor) | Ahnet matches |
| **Mars · Gale** (Curiosity) | NASA-AMMOS MMGIS DEM, 20 m | Tassili 59 · Hoggar 52 · Ahnet 31 | Hoggar 53% (steeper mound) · Ahnet 23% (floor plains) · Tassili 13% · no twin 11% | Tassili matches |
| **Moon · south pole** (Artemis region, Chang'e-7) | NASA LRO LOLA heights, 40 m | Hoggar 59 · Tassili 45 · Ahnet 11 | Hoggar 67% · Tassili 9% · no twin on Earth 24% | none fully; Hoggar closest |

No single site does everything: the answer depends on the target, on the part of the target, and on what you want to test. That is why the app starts with your choices.

## The four steps in the app

1. **Plan**: choose the destination, what to test (driving, rock science, radar under sand, crew training), which part of the target (landing area, whole map or a spot you click), your rover's slope limit, the month, a heat limit and the distance from town. The kNN twin model runs live in your browser on the Earth ground you allow and ranks the three sites, with the reasons, the best spots on a map, and the model's vote for the spot you clicked.
2. **Compare**: ranking by measured terrain match, the ML twin map of the whole target, the rocks check, the best site for each kind of test, same-colour slope maps, the six measures side by side, the stability checks, and where the analogy breaks. A Markdown report can be downloaded.
3. **Site**: the look-alike map, target-like spots, what this site can test (slopes, wheel wear, relief, radar, heating), **materials** (what threatens each rover/habitat part on the target and whether this site can test it, from measured ratios), **crew safety** by month (heat, water, cold, falls, flash floods, time to help), radar hotspots with their four checks, and field conditions.
4. **Rehearse**: an A* rover route through the Plan's spots (or the default ones), driven with the real signal delay (11 min for Mars, compressed; 1.3 s for the Moon, real time), **simulated pressure sensors** along the route (barometer, tilt, wheel load cells, ground pressure, with elevation and slope profiles and an Earth twin rover from the target's gravity), and a crew-access check by month.

## How the comparison works

- **Terrain match (Measured).** For every 400 m cell: mean slope, share steeper than 15°, roughness (125 m), relief within 1 km, slope over 400 m and relief within 4 km (`pipeline/terrain.py`, identical for Earth, Mars and the Moon). The score is the average overlap of the six distributions (0 to 100).
- **Mars/Moon data checks.** The Jezero DTM matches NASA's MOLA altimeter (r = 0.995, 28 m RMS). Our lunar slopes give Shackleton's inner wall 31°, as published (~30°, Zuber et al. 2012); the slope column shipped with that file is about twice too steep and is not used.
- **Machine learning: the twin model (Measured).** A k-nearest-neighbour model (k = 15) is trained on the six measures of the 7,500 Algerian cells, labelled by site, and applied to every 400 m cell of the Mars/Moon maps; a cell with no Earth cell close enough gets "no twin". It recognises the right site on 87% of unseen 4 km Earth blocks (spatial cross-validation) and its shares move by at most 2 points with other measure sets. The same model runs in the browser on the Plan page (`src/lib/twins.ts`; a test checks it reproduces the scikit-learn predictions).
- **Rocks (Reference).** One cited sentence per target and site: match, partial or no. Geology never changes the terrain number; it sets the label (Strong analog, Partial analog, Terrain only, Rocks only, Weak analog).
- **Radar surprise (Measured, then checked).** A gradient-boosting model predicts JAXA PALSAR-2 L-band from optical, C-band and terrain. R² inside each site (spatial-block CV): Ahnet 0.63, Tassili 0.74, Hoggar 0.53; it fails on an unseen site (Ahnet −2.9), so hotspots are compared inside each site only. Every hotspot is then checked: away from the box edge, not tracing a visible boundary, radar images aligned (whole-box offsets under 1 pixel), and on a smooth flat cover where L-band can see below. Ahnet 21 of 155, Tassili 11 of 47, Hoggar 1 of 31 pass. Many of the rest follow exposed rock layers. Nothing is confirmed until a ground-penetrating-radar line is driven.

## What changed after the review (15 Nov)

- Your choices are back (Plan page), and the ranking for them comes from a real ML model run live, not from hand-set weights.
- Materials, crew safety and simulated pressure sensors are back, computed from each site's data.

- Real Mars and Moon elevation data in the comparison (they were typed-in specs before).
- The lunar target is now the **south pole**, where permanent bases are planned (it was the equatorial Marius Hills).
- The ranking is measured; the hand-scored "materials" axis that counted double is gone, and so are the temperature and dryness axes that gave every site the same score.
- R² is reported inside each site (the pooled 0.93 was inflated by the differences between sites).
- The clustering "terrain types" (which mostly re-discovered the sites) are replaced by the look-alike map.
- Radar hotspots go through four artefact checks; spot picks stay out of the 800 m box border.
- Hardware tests are now computed for each site and target, inside the Site page.
- Simpler interface: four steps instead of five, English only, larger text.

## Run it

```sh
npm install
npm run dev        # http://localhost:8080
npm test           # 62 tests: data contract, browser ML = pipeline ML, plan rules, materials, pressure physics, A*, report
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

Three 20 km boxes chosen by the team (other places may match better). Terrain shape and published geology only: no mineral spectra or regolith properties. Gravity, air pressure, radiation and polar light cannot be reproduced on Earth. Hotspots are candidates, spots and waypoints are hypotheses, straight-line distance is not road access, climate averages are not a forecast. Team-built experimental indicators, not an official NASA assessment.

## Data and acknowledgements

- **Mars**: USGS Astrogeology / NASA Mars 2020 Terrain Relative Navigation CTX DTM (Fergason et al. 2020); NASA MGS MOLA MEGDR (PDS); NASA-AMMOS MMGIS (JPL) reference DEM of Gale crater; NASA Mars Trek.
- **Moon**: NASA LRO LOLA heights from the NASA App Development Challenge lunar data file; NASA Moon Trek.
- **Earth**: JAXA ALOS-2 PALSAR-2 (JAXA owns the PALSAR-2 data); ESA/Copernicus Sentinel-1, Sentinel-2 and DEM GLO-30; NASA POWER; Esri World Imagery.
- **Literature**: Farley et al. 2022 (Jezero floor); NASA JPL (Curiosity lakes); Zuber et al. 2012 (Shackleton); NASA Artemis III candidate regions (2022, 2024); Caddeo et al. 2025 (Ahnet); UNESCO WHC (Tassili); Azzouni-Sekkal et al. 2007 (Atakor). Full list in the app (Method page).
- Copies used for the planetary windows: the Jezero DTM grid from github.com/RoshTzsche/MarsWalk and the lunar data file from github.com/1piyalib/rover_pathfinder; checksums in `pipeline/planetary/targets.json`.

**AI use**: the app was scaffolded with Lovable, and code, analysis scripts and text were written and reviewed with AI assistants (including Claude by Anthropic). All numbers come from our scripts and the cited datasets.

Team Hoggar: _names here_ · App: _link here_ · Demo video: _link here_
