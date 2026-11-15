# Data pipeline (runs on a laptop, never deployed)

The website only reads files. One script makes all of them.

## Setup (once)

```
pip install -r pipeline/requirements.txt
```

## 1. Export one stack per site (Earth Engine)

Open https://code.earthengine.google.com, paste `01_export_stack.js`, set `SITE`, Run, then start the task in the Tasks tab.
Put the three files here as `ahnet_stack.tif`, `tassili_stack.tif`, `hoggar_stack.tif`
(7 bands: L_HH, L_HV, C_VV, B4, B3, B2, DEM; EPSG:4326, 25 m).

## 2. Climate (NASA POWER)

`power_ahnet.json`, `power_tassili.json`, `power_hoggar.json`: the climatology response for the box centre
(parameters T2M_MAX, T2M_MIN, PRECTOTCORR), saved as-is.

## 3. Build everything

```
python pipeline/build_all.py
```

About 30 seconds. Writes:

| File | What |
| --- | --- |
| `public/mission_data.json` | 3 scenarios x 3 sites: metrics, scores, verdicts, hotspots, audit, rover waypoints, climate |
| `public/ml/cells.json`, `model.json` | Analog Finder data: 7,500 cells, percentiles, terrain units, model validation |
| `public/overlays/<site>_<layer>.png` | optical, lband, cband, slope, anomalies (hotspots), classes (terrain units), surprise |
| `public/grids/<site>_slope.json` | 160 x 160 rover slope grid (90th percentile per cell, row 0 = north) |
| `pipeline/out/report.txt` | R², feature importance, units, waypoints, route lengths, missing inputs |

`meta.mock` becomes `false` only when nothing is missing.

## What a person decides

`content.py`: planetary targets and specs, sources, materials judgements, scoring rules and weights,
"what transfers / where it breaks", Analog Finder objectives and weights, waypoint instruments.
Change it there and rerun; never edit the generated JSON by hand.

## What is Measured and what is Interpreted

- Slope, relief, steep share, temperatures, rain, hub distance: **Measured**.
- Radar-surprise share: **Measured** (computed), but each hotspot is **Interpreted** (a candidate, never "a buried river").
- Terrain unit names, materials scores, Finder weights: **Interpreted**.
- Waypoints and Finder spots: **Hypothesis**.

`legacy/` holds the earlier scripts (`compute_site_numbers.py`, `score_and_merge.py`, ...), kept for reference only.
Do not commit the `.tif` stacks (about 20 MB each).
