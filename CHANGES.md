# What changed

## Choices, real ML, materials, safety, sensors (15 Nov, evening)
- **Plan page is back (step 1)**: you choose the destination, what to test (driving, rock science, radar under sand, crew training), which part of the target (landing area, whole map, or a spot you click), your rover's slope limit, the month, a heat limit and the farthest distance from town.
- **Real machine learning, run live**: a k-nearest-neighbour "twin" model is trained on the 7,500 Algerian cells and applied to every 400 m cell of the real Mars/Moon maps. On the Plan page the same model runs in your browser, only on Earth ground your rover or crew can use. No hand-set weights; each goal's ordering rule is written on the page. A test checks that the browser gives back the pipeline's (scikit-learn) predictions. Model check: 87% of unseen 4 km Earth blocks are given back to the right site; shares move by at most 2 points with other measure sets.
- **Twin map on Compare**: which Algerian site holds the closest terrain twins of each part of Jezero, Gale and the lunar south pole; the "it depends on the part" headline now follows it (zones kept as a second check).
- **Materials (Site page)**: wheels, seals, solar panels, structure, thermal blankets, mechanisms, habitat shell: threat on the target (cited) and whether the site can test it, from measured site/target ratios (roughness, daily temperature swing) and pressure physics.
- **Crew safety (Site page)**: heat, drinking water (NIOSH), cold nights, falls on steep ground, flash floods, time to help, per month.
- **Simulated pressure sensors (Rehearse)**: barometer, tilt, wheel load cells and ground pressure along the planned route, with elevation and slope profiles; rover mass, wheels and footprint can be changed; Earth twin rover mass from the target's gravity (JPL Scarecrow method).
- "Rehearse a drive through these spots" sends the Plan's spots to the Rehearse page. 62 tests.

## Review fixes (15 Nov, afternoon)
- **Real Mars and Moon data in the comparison**: Jezero (USGS/NASA CTX DTM 20 m, checked against MOLA), Gale (NASA-AMMOS MMGIS DEM 20 m), lunar south pole (NASA LOLA heights 40 m, checked against Shackleton's published wall slope). Same six terrain measures on Earth and on the target (`pipeline/terrain.py`).
- **Challenge fit**: the lunar target is now the south pole (permanent-base region: Peak near Shackleton, Artemis 2022 candidate, Chang'e-7 target) instead of the equatorial Marius Hills.
- **Not decided by design**: ranking by measured terrain match only; geology is a separate cited check that sets the label; the double-weighted hand "materials" axis, and the temperature and dryness axes that did not separate the sites, are gone. Stability over 11 variants is shown. Result: no site wins everything (Jezero: Tassili for driving, Ahnet for rocks).
- **ML honesty**: R² inside each site only (pooled 0.93 removed); clustering terrain types removed (they mostly re-found the sites); radar hotspots checked for box edge, visible boundaries, image alignment and smooth flat cover; spot picks keep out of the 800 m border.
- **Scale**: equal windows compared cell by cell; best 4 km area searched inside each box.
- **Hardware**: tests computed per site and target (slopes, wheel wear, relief, radar, heating and cooling), shown on the Site page; generic lab-only items listed separately.
- **Interface**: four steps (Destination, Compare, Site, Rehearse), English only, larger text, downloadable Markdown report. 42 tests.

## Jury round (15 Nov)
- **Name**: Amanar (Tuareg name for Orion, "the guide"), with Algeria Beyond Earth as subtitle.
- **Simpler interface**: one 5-step bar (Target, Find, Compare, Hardware, Rehearse); Compare split into Map / Score / Limits tabs; Finder shows 3 questions, the rest under "More options"; fewer captions; status chip removed.
- **Materials** (new step 04): environment gap table, 7 hardware components with candidate materials, threat, field test, lab test and a TEST HERE / HERE + LAB / LAB ONLY badge. Wheel tests point to the roughest site.
- **Pressure** (step 04): air pressure gap, habitat wall load and over-pressure proof test, wheel ground pressure and gravity-offload test mass (checked against JPL's Scarecrow), sensor kit.
- **Pressure sensors** (step 05): simulated sensor panel during the drive (elevation, air pressure, slope, wheel load, ground pressure).
- **Crew safety** (step 05): night-cold caution, workable season per site, steep-ground share, crew checklist; logged to the Dossier.
- Pipeline adds night temperatures, elevation, air pressure and terrain roughness per site. 91 tests.

## Final build (14-15 Nov 2026)

**Fixed**
- `mission_data.json` was half-merged: Tassili's hub distance was computed for an old box (150.9 km, real: 60 km), hotspot lists were empty, the "Reference" tag broke the type and tests, verdict rule differed between Python (70 %) and the app (50 %). Now one script generates everything and the app re-checks the verdicts (test).
- Overlays and grids were never copied to `public/`, so Stage 02 showed "image not available" and Stage 03 only had a mock Ahnet grid. Now generated straight into `public/`.
- `01_export_stack.js` listed boxes that were not the ones exported. Updated.
- Leaflet maps rendered the site box tiny; Trek max zoom; old NISAR credits; "TEAM NAME TO BE PROVIDED"; "demo not built yet".
- 8 failing tests rewritten for the real data; 81 tests pass; `npm run build` passes.

**Added**
- Two more destinations: Gale (Mars, layered rocks) and Marius Hills (Moon, lava tubes), each with its own terrain rule, materials judgements, audit, waypoints and signal delay (Moon 1.3 s, real time).
- ML in `pipeline/build_all.py`: radar-surprise model (gradient boosting, spatial-block validation), terrain units (Gaussian mixture), 7,500-cell feature table.
- AI Analog Finder page (`/finder`) with the form (destination, objective, where, constraints, priority), site ranking, score map, explained top spots, look-alike search, Dossier export, and "drive a rover through the top spots" (reachability checked with A*).
- Stage 02: ML layers with legends, scoring basis on every axis, scoring rules panel. Stage 03: site switch, Finder traverses, waypoint reasons.
- Weighted fingerprint: terrain and materials count double (max 24). Result: Jezero > Ahnet, Gale > Tassili, Moon > Hoggar.

Superseded scripts are in `pipeline/legacy/`.
