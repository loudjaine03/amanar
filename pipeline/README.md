# Data pipeline (runs on a laptop, never deployed)

The website only reads files. Two scripts make them.

```
pip install -r pipeline/requirements.txt
python pipeline/build_all.py     # step 1, Earth side: needs the three Earth Engine stacks
python pipeline/compare.py       # step 2, comparison with Mars and the Moon: runs offline in seconds
```

## Step 1: `build_all.py` (Earth)

Inputs, not committed (about 20 MB each): `pipeline/{ahnet,tassili,hoggar}_stack.tif` from `01_export_stack.js`
(Earth Engine Code Editor: set `SITE`, Run, start the task; 7 bands L_HH, L_HV, C_VV, B4, B3, B2, DEM; EPSG:4326, 25 m),
and `power_<site>.json` (NASA POWER climatology, T2M_MAX, T2M_MIN, PRECTOTCORR).

Writes `public/overlays/<site>_{optical,lband,cband,slope,anomalies,surprise}.png`, `public/grids/<site>_slope.json`
(160 x 160 rover grid), `public/ml/cells.json` (7,500 cells of ~400 m) and `pipeline/sites.json` (metrics, climate, hub,
radar-model validation with R² inside each site).

## Step 2: `compare.py` (Mars and Moon)

Reads `sites.json`, `cells.json`, the overlays and grids, and the Mars/Moon windows in `pipeline/planetary/*.npz`.
Writes `public/mission_data.json`, `public/ml/lookalike.json`, `public/ml/twins.json` (the kNN twin model the browser
runs), `public/overlays/target_*_{slope,zones,twins}.png`, `*_slopec.png`, `*_like_<target>.png` and
`pipeline/out/compare_report.txt`.

- Terrain measures: `terrain.py`, the same code for Earth cells and Mars/Moon cells.
- Twin model: k-nearest neighbours (k = 15, scikit-learn) trained on the 7,500 Earth cells, applied to every Mars/Moon
  cell; 'no twin' beyond 1.5 x the 99th percentile of Earth nearest distances; checked with 4 km spatial cross-validation
  and three measure sets. Exported with standardised measures so `src/lib/twins.ts` can run it live.
- Terrain match = average overlap of the six distributions; re-run 11 ways to report how stable the ranking is.
- Look-alike map: how typical each Earth cell is of the target; top spots and the best 4 km area, outside an 800 m border.
- Radar hotspots: four checks (box edge, visible boundary, image alignment, smooth flat cover).
- Site tests: slopes, wheel wear, relief, radar, heating and cooling, computed per site and target.
- Rover: A* through the three most target-like reachable cells (same algorithm as the app).

## The Mars and Moon windows: `planetary/prepare_targets.py`

Already done; the small `.npz` windows and `targets.json` (sources, checksums, checks) are committed.

| Target | Product | Window | Check |
| --- | --- | --- | --- |
| Jezero | USGS/NASA Mars 2020 TRN CTX DTM, 20 m | 20 x 20 km on the Perseverance landing site | vs MOLA MEGDR: r = 0.995, 28 m RMS |
| Gale | NASA-AMMOS MMGIS reference DEM, 20 m | 8 x 16 km, lower Mount Sharp | NASA/JPL repository |
| Moon south pole | NASA ADC lunar data file, LRO LOLA, 40 m | 20 x 20 km, Peak near Shackleton | Shackleton wall 31° vs published ~30° |

## What a person decides

`content.py`: target texts, the cited geology check per site, what transfers and what breaks, thresholds (match bands,
hotspot checks). Change it there and rerun `compare.py`; never edit the generated JSON by hand.

## Smoke test without the real stacks

`AMANAR_STACKS`, `AMANAR_PUBLIC`, `AMANAR_SITES` and `AMANAR_REPORT` redirect inputs and outputs, so both scripts can be
run end to end on synthetic stacks in a temporary folder without touching `public/`.

`legacy/` holds the earliest scripts, kept for reference only.
