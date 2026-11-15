# Amanar · Algeria Beyond Earth (Team Hoggar)

*Amanar* is the Tuareg name for Orion, "the guide" of desert nights.

NASA Space Apps Challenge 2026, Boumerdes. Challenge: *Identify Earth locations that analog the permanent Moon base locations and Mars.*

You choose a destination: **Jezero** (Mars, ancient river delta), **Gale** (Mars, layered rocks of Mount Sharp) or the **Marius Hills** (Moon, volcanic domes and a lava-tube pit). The app then shows which of three Algerian Sahara sites is the best place on Earth to rehearse that mission, explains why, and shows where the analogy breaks.

| Destination | Best Algerian analog (our scores) | Why |
| --- | --- | --- |
| Mars · Jezero | **Ahnet Basin** 22/24 | flat, hyper-arid sedimentary basin with alluvial and evaporite deposits; most radar-surprise hotspots |
| Mars · Gale | **Tassili n'Ajjer** 19/24 | thick sandstone layers exposed in cliffs and buttes, moderate relief a rover can climb |
| Moon · Marius Hills | **Hoggar (Atakor)** 15/24 | basaltic lava flows and phonolite domes, high volcanic relief |

## The five steps

1. **Target**: the destination on NASA Mars Trek / Moon Trek, four tagged specs, the signal delay.
2. **Find (AI)** (`/finder`): a form (destination, what you want to test, where; more options for rover slope, month, heat, distance, priority). It ranks 7,500 cells of about 400 m, explains every pick, finds look-alike places, and sends the best reachable spots to the rover.
3. **Compare**: the three sites in three tabs. *Map*: satellite photo, L-band radar, AI radar surprise, AI terrain types, optical/radar swipe, hotspots. *Score*: the six-axis Analogy Fingerprint. *Limits*: what transfers and where it breaks.
4. **Hardware** (jury suggestion: materials and pressure):
   - *Environment gap*: temperature, air pressure, gravity, dust, rough rock, target vs site, each marked TEST HERE, HERE + LAB or LAB ONLY.
   - *Materials*: wheels, structure, seals, solar panels and optics, thermal blankets, mechanisms, habitat shell: candidate materials, the threat on the target (Curiosity's wheel damage, InSight's dust, Apollo's seal leaks), what the site can test and what needs a lab.
   - *Pressure*: site air pressure vs target; habitat wall load and the uncrewed over-pressure test that reproduces it on Earth; wheel ground pressure and the lighter Earth test rover that matches it (900 kg on Mars ≈ 342 kg on Earth, like JPL's Scarecrow).
   - *Sensor kit*: wheel load cells, cone penetrometer, barometer, habitat pressure transducer, dust sensor.
5. **Rehearse**: A* rover traverse with the real signal delay (11 min Mars, compressed; 1.3 s Moon, real time), a **simulated sensor panel** (elevation, air pressure, slope, wheel load and ground pressure along the route) and **crew safety**: route slope, heat and night cold for the chosen month, distance to help, the workable season (months under the heat limit) and a crew checklist (water and shade, communications, evacuation, sandstorms and wadi floods, first aid, permits).

Everything you log goes to the **Mission Dossier** (Markdown or PDF).

## Machine learning (honest version)

All models run offline in `pipeline/build_all.py` (scikit-learn). The website only reads the results.

- **Radar surprise** (self-supervised regression): a gradient-boosting model predicts L-band backscatter from what the surface shows (optical, C-band, slope, roughness, relief). Predictions are out-of-fold on 2.5 km spatial blocks. Where L-band is much brighter than predicted (z > 2), something the surface does not explain is there: a *candidate* buried structure. R² per site: Ahnet 0.63, Tassili 0.74, Hoggar 0.53. Leave-one-site-out fails on Ahnet (R² < 0) because its sand sheet is unlike the rocky sites, so hotspots are only compared inside each site.
- **Terrain units** (unsupervised): Gaussian mixture on the 7,500 cells, number of units chosen with BIC (6).
- **Analog Finder**: transparent weighted percentiles for destination + objective, the team's materials judgement (30 %), and the operations weight you choose; nearest neighbours for "find places like this". No labelled analog database exists, so nothing is claimed to be "trained to find analogs".

## Evidence tags

Every number carries one: **Measured** (computed by our scripts from an identified dataset), **Interpreted** (our reading or judgement), **Hypothesis** (must be checked in the field), **Reference** (fact from a cited source). Values nobody computed show `TBD`, and a MOCK DATA banner appears if the data file is incomplete.

## Scoring (team assumptions, shown in the app)

Six axes, 0 to 3: terrain, materials, dryness, subsurface, temperature, access. Terrain and materials count double (max 24). Top total = STRONGEST, at least 50 % = PARTIAL, else WEAK. The terrain rule depends on the destination (flat for Jezero, moderate relief for Gale, high relief for Marius Hills). Full rules: Stage 02 > "How each axis is scored", and `pipeline/content.py`.

## Run it

```sh
npm install
npm run dev        # http://localhost:8080
npm test           # 91 unit tests (data contract, scoring, A*, Finder, hardware physics, dossier)
npm run build      # production build
```

On Windows PowerShell use `npm.cmd` if scripts are blocked.

## Rebuild the data (only if you change a stack or a rule)

```sh
pip install -r pipeline/requirements.txt
python pipeline/build_all.py
```

Inputs: `pipeline/{ahnet,tassili,hoggar}_stack.tif` (Earth Engine export, see `pipeline/01_export_stack.js`), `pipeline/power_*.json` (NASA POWER), `pipeline/content.py` (texts, targets, rules). Outputs: `public/mission_data.json`, `public/ml/`, `public/overlays/`, `public/grids/`, `pipeline/out/report.txt`. Never edit the generated JSON by hand: edit `content.py` and rerun.

## Limits

Gravity, atmosphere, radiation, materials and instruments differ (listed for every site). Hotspots are candidates, waypoints are hypotheses, straight-line distance is not road access, climate averages are not a forecast. Team-built experimental indicators, not an official NASA assessment.

## Data and acknowledgements

- JAXA: ALOS-2 PALSAR-2 yearly mosaic (L-band). JAXA owns the PALSAR-2 data.
- ESA / Copernicus: Sentinel-1, Sentinel-2, Copernicus DEM GLO-30.
- NASA: POWER climatology, Mars Trek, Moon Trek, NSSDC Mars and Moon fact sheets; JPL (Curiosity, Scarecrow), LROC (Marius Hills), NASA Science (Perseverance), NASA TM-2010-216781 (lunar dust); ASME on the NASA Glenn shape-memory tyre.
- Caddeo et al. 2025 (EPSC-DPS2025-1671) on the Ahnet Basin; Azzouni-Sekkal et al. 2007 (GSA SP 418) on the Atakor.
- Esri World Imagery (basemap).

AI use: code assistance and drafting with AI tools; all data processing runs in our own scripts, and every number is traceable to a dataset or a cited source.

Team Hoggar: _names here_ · App: _link here_ · Demo video: _link here_
