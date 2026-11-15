# What changed

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
