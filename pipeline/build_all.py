"""
build_all.py  --  Team Hoggar / Amanar  (step 1 of 2)

Turns the three Earth Engine stacks into the Earth-side files:

    python pipeline/build_all.py          (needs pipeline/<site>_stack.tif, about 30 s)
    python pipeline/compare.py            (step 2: compares with Mars / Moon, writes mission_data.json)

Inputs (pipeline/):  <site>_stack.tif   7 bands: 1 L_HH, 2 L_HV, 3 C_VV, 4 B4, 5 B3, 6 B2, 7 DEM (EPSG:4326, 25 m)
                     power_<site>.json  NASA POWER climatology (T2M_MAX, T2M_MIN, PRECTOTCORR)
Outputs:             public/overlays/<site>_{optical,lband,cband,slope,anomalies,surprise}.png
                     public/grids/<site>_slope.json      160 x 160 rover grid (90th percentile slope per block)
                     public/ml/cells.json                7,500 cells of ~400 m (terrain, optical and radar measures)
                     pipeline/sites.json                 site metrics, climate, hub, radar-model validation
                     pipeline/out/report.txt

Radar surprise (self-supervised regression, scikit-learn): a gradient-boosting model learns to predict L-band
backscatter from what the surface shows (optical, C-band, slope, roughness, relief). Where L-band is much brighter
than predicted, something the surface does not explain may be there (SIR-A style). Predictions are out-of-fold on
2.5 km spatial blocks. R2 is reported INSIDE each site; a pooled R2 is inflated by the differences between sites and
is not used. compare.py then checks every hotspot for known artefacts.

The terrain measures use the same definitions as pipeline/terrain.py (also used for Mars and the Moon).
Set AMANAR_PUBLIC=<dir> to write the public files somewhere else (used by the smoke test).
"""
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import numpy as np  # noqa: E402
import rasterio  # noqa: E402
from PIL import Image  # noqa: E402
from scipy import ndimage as ndi  # noqa: E402
from sklearn.ensemble import HistGradientBoostingRegressor  # noqa: E402
from sklearn.inspection import permutation_importance  # noqa: E402
from sklearn.metrics import r2_score  # noqa: E402

import content as C  # noqa: E402
from terrain import edges, local_std  # noqa: E402,F401  (same helpers as the Mars/Moon side)

ROOT = HERE.parent
PUB = Path(os.environ.get("AMANAR_PUBLIC", ROOT / "public"))
OUT_OV, OUT_GRID, OUT_ML = PUB / "overlays", PUB / "grids", PUB / "ml"
OUT_REP = Path(os.environ.get("AMANAR_REPORT", HERE / "out"))
SITES_JSON = Path(os.environ.get("AMANAR_SITES", HERE / "sites.json"))
STEEP = 15.0      # team assumption, same as the app's default rover slope limit
GRID = 160        # rover grid cells per side
CELLS = 50        # Analog Finder cells per side (about 400 m)
HOT_Z = 2.0       # radar surprise threshold for a hotspot
SEED = 0
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
REPORT = []


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s)
    REPORT.append(s)


# ------------------------------------------------------------------------------------------------
# helpers
# ------------------------------------------------------------------------------------------------
def haversine_km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))




def stretch(a, lo=2, hi=98):
    p1, p2 = np.nanpercentile(a, [lo, hi])
    return (np.clip((a - p1) / max(p2 - p1, 1e-6), 0, 1) * 255).astype("uint8")


def fill(a):
    a = a.copy()
    bad = ~np.isfinite(a)
    if bad.any():
        a[bad] = np.nanmedian(a)
    return a




def cell_center(bounds, rows, cols, r, c):
    (s, w), (n, e) = bounds
    return [round(n - (r + 0.5) * (n - s) / rows, 5), round(w + (c + 0.5) * (e - w) / cols, 5)]


def latlon_to_cell(bounds, rows, cols, p):
    (s, w), (n, e) = bounds
    r = int((n - p[0]) / (n - s) * rows)
    c = int((p[1] - w) / (e - w) * cols)
    return min(rows - 1, max(0, r)), min(cols - 1, max(0, c))


# ------------------------------------------------------------------------------------------------
# 1. per-site rasters
# ------------------------------------------------------------------------------------------------
def load_site(site):
    path = Path(os.environ.get("AMANAR_STACKS", HERE)) / f"{site}_stack.tif"
    if not path.exists():
        sys.exit(f"Missing {path.name}. Export it with 01_export_stack.js (Earth Engine) and put it in pipeline/.")
    with rasterio.open(path) as ds:
        a = ds.read().astype("float32")
        west, south, east, north = ds.bounds
        resx, resy = ds.res
        if ds.nodata is not None:
            a[a == ds.nodata] = np.nan
    lhh, lhv, cvv, b4, b3, b2, dem = (fill(x) for x in a)
    bounds = [[round(south, 5), round(west, 5)], [round(north, 5), round(east, 5)]]
    lat0 = math.radians((south + north) / 2)
    dy, dx = resy * 110540, resx * 111320 * math.cos(lat0)            # metres per pixel
    gy, gx = np.gradient(dem, dy, dx)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    px = 0.5 * (dx + dy)
    k_rough = max(3, int(round(125 / px)) | 1)                       # ~125 m window
    k_relief = max(5, int(round(1000 / px)) | 1)                     # ~1 km window
    f = {
        "slope": slope,
        "rough": local_std(dem, k_rough),
        "relief": ndi.maximum_filter(dem, k_relief) - ndi.minimum_filter(dem, k_relief),
        "bright": (b4 + b3 + b2) / 3 / 10000,
        "red": b4 / np.maximum(b2, 1),
        "b4": b4 / 10000, "b3": b3 / 10000, "b2": b2 / 10000,
        "tex": local_std((b4 + b3 + b2) / 3 / 10000, k_rough),
        "lhh": ndi.median_filter(lhh, 3),                            # light speckle filter
        "lhv": ndi.median_filter(lhv, 3),
        "cvv": ndi.median_filter(cvv, 3),
        "elev": dem,
    }
    f["lmc"] = f["lhh"] - f["cvv"]
    return {"id": site, "bounds": bounds, "f": f, "shape": slope.shape, "raw": (lhh, cvv, b4, b3, b2, dem)}


def slope_grid(slope):
    h, w = slope.shape
    re, ce = edges(h, GRID), edges(w, GRID)
    g = np.zeros((GRID, GRID), "float32")
    for r in range(GRID):
        for c in range(GRID):
            g[r, c] = np.percentile(slope[re[r]:re[r + 1], ce[c]:ce[c + 1]], 90)   # conservative
    return g


# ------------------------------------------------------------------------------------------------
# 2. radar surprise model
# ------------------------------------------------------------------------------------------------
PREDICTORS = ["b4", "b3", "b2", "red", "tex", "slope", "rough", "relief", "cvv"]
BLOCK = 100   # pixels (~2.5 km) per spatial block


def surprise_model(sites):
    rng = np.random.default_rng(SEED)
    X, y, g, sidx = [], [], [], []
    for i, s in enumerate(sites):
        h, w = s["shape"]
        rr = rng.integers(20, h - 20, 40000)
        cc = rng.integers(20, w - 20, 40000)
        X.append(np.stack([s["f"][p][rr, cc] for p in PREDICTORS], 1))
        y.append(s["f"]["lhh"][rr, cc])
        g.append(i * 1000 + (rr // BLOCK) * 20 + cc // BLOCK)
        sidx.append(np.full(len(rr), i))
    X, y, g, sidx = map(np.concatenate, (X, y, g, sidx))

    def model():
        return HistGradientBoostingRegressor(max_iter=300, learning_rate=0.08, max_leaf_nodes=31,
                                             l2_regularization=1.0, random_state=SEED)

    # spatial-block 5-fold: blocks are shuffled into folds, a pixel is predicted by a model that never saw its block
    blocks = np.unique(g)
    fold_of_block = dict(zip(blocks, rng.permutation(len(blocks)) % 5))
    fold = np.array([fold_of_block[b] for b in g])
    oof = np.zeros_like(y)
    models = []
    for k in range(5):
        m = model().fit(X[fold != k], y[fold != k])
        oof[fold == k] = m.predict(X[fold == k])
        models.append(m)
    r2_block = float(r2_score(y, oof))
    r2_block_site = {sites[i]["id"]: round(float(r2_score(y[sidx == i], oof[sidx == i])), 3) for i in range(len(sites))}
    # leave-one-site-out: the hardest test (a site the model has never seen)
    loso = {}
    for i, s in enumerate(sites):
        m = model().fit(X[sidx != i], y[sidx != i])
        loso[s["id"]] = round(float(r2_score(y[sidx == i], m.predict(X[sidx == i]))), 3)
    # what the model relies on (permutation importance on held-out fold 0)
    pi = permutation_importance(models[0], X[fold == 0][:8000], y[fold == 0][:8000], n_repeats=4, random_state=SEED)
    imp = sorted(zip(PREDICTORS, pi.importances_mean), key=lambda t: -t[1])
    log(f"[surprise] block-CV R2 = {r2_block:.3f}  per site {r2_block_site}  leave-one-site-out R2 {loso}")
    log("[surprise] importance:", ", ".join(f"{p} {v:.3f}" for p, v in imp))

    # out-of-fold prediction for EVERY pixel
    resid_all = []
    for i, s in enumerate(sites):
        h, w = s["shape"]
        rr, cc = np.mgrid[0:h, 0:w]
        blk = i * 1000 + (rr // BLOCK) * 20 + cc // BLOCK
        Xp = np.stack([s["f"][p].ravel() for p in PREDICTORS], 1)
        pred = np.empty(h * w, "float32")
        kb = np.array([fold_of_block.get(b, -1) for b in blk.ravel()])
        unseen = kb < 0                         # border blocks never sampled: any model is out-of-sample there
        kb[unseen] = 0
        for k in range(5):
            sel = kb == k
            if sel.any():
                pred[sel] = models[k].predict(Xp[sel])
        resid = s["f"]["lhh"].ravel() - pred
        resid_all.append(resid.reshape(h, w))
    # centre per site (local anomaly), scale by pooled robust spread
    centred = [r - np.median(r) for r in resid_all]
    mad = float(np.median(np.abs(np.concatenate([c.ravel() for c in centred]))) * 1.4826)
    for s, c in zip(sites, centred):
        s["f"]["surprise"] = ndi.gaussian_filter(c / mad, 1.0)
    info = {
        "type": "HistGradientBoostingRegressor (scikit-learn)",
        "target": "L-band HH backscatter (dB), PALSAR-2",
        "predictors": PREDICTORS,
        "predictor_labels": {"b4": "red reflectance", "b3": "green reflectance", "b2": "blue reflectance",
                             "red": "redness", "tex": "optical texture", "slope": "slope", "rough": "roughness",
                             "relief": "relief (1 km)", "cvv": "C-band VV"},
        "samples": int(len(y)),
        "r2_pooled_not_used": round(r2_block, 3),   # inflated by between-site differences: never shown
        "r2_block_cv_by_site": r2_block_site,
        "r2_leave_one_site_out": loso,
        "importance": [{"f": p, "v": round(float(v), 4)} for p, v in imp],
        "residual_scale_db": round(mad, 3),
        "hotspot_z": HOT_Z,
        "how": "Out-of-fold predictions on 2.5 km spatial blocks (5 folds); residual centred per site, divided by the pooled robust spread (MAD), lightly smoothed.",
    }
    return info


# ------------------------------------------------------------------------------------------------
# 3. cells, terrain units, percentiles
# ------------------------------------------------------------------------------------------------
def build_cells(sites):
    rows = []
    for si, s in enumerate(sites):
        h, w = s["shape"]
        re, ce = edges(h, CELLS), edges(w, CELLS)
        f = s["f"]
        for r in range(CELLS):
            for c in range(CELLS):
                sl = (slice(re[r], re[r + 1]), slice(ce[c], ce[c + 1]))
                sp = f["slope"][sl]
                rows.append({
                    "site": si,
                    "slope_mean": float(sp.mean()), "slope_p90": float(np.percentile(sp, 90)),
                    "steep": float((sp > STEEP).mean() * 100), "relief": float(f["relief"][sl].mean()),
                    "rough": float(f["rough"][sl].mean()), "bright": float(f["bright"][sl].mean()),
                    "red": float(f["red"][sl].mean()), "lhh": float(f["lhh"][sl].mean()),
                    "cvv": float(f["cvv"][sl].mean()), "lmc": float(f["lmc"][sl].mean()),
                    "surprise": float(f["surprise"][sl].mean()), "elev": float(f["elev"][sl].mean()),
                })
    keys = list(C.FEATURES)
    vals = {k: np.array([row[k] for row in rows]) for k in keys}
    site_of = np.array([row["site"] for row in rows])
    return vals, site_of


# ------------------------------------------------------------------------------------------------
# 6. climate
# ------------------------------------------------------------------------------------------------
def load_power(site):
    path = Path(os.environ.get("AMANAR_STACKS", HERE)) / f"power_{site}.json"
    if not path.exists():
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    p = raw.get("properties", {}).get("parameter") or raw.get("parameter")
    tmax = [p["T2M_MAX"][m] for m in MONTHS]
    tmin = [p["T2M_MIN"][m] for m in MONTHS]
    rain = sum(p["PRECTOTCORR"][m] * d for m, d in zip(MONTHS, DAYS))   # mm/day x days
    return {"monthly_tmax_c": [round(v, 1) for v in tmax],
            "monthly_tmin_c": [round(v, 1) for v in tmin],
            "daily_range_c": round(sum(a - b for a, b in zip(tmax, tmin)) / 12, 1),
            "rain_mm_year": round(rain, 1)}


# ------------------------------------------------------------------------------------------------
# 7. overlays
# ------------------------------------------------------------------------------------------------
def save(img, name):
    OUT_OV.mkdir(parents=True, exist_ok=True)
    img.save(OUT_OV / name, optimize=True)


def overlays(s, hot):
    sid, f = s["id"], s["f"]
    lhh, cvv, b4, b3, b2, _ = s["raw"]
    save(Image.fromarray(np.dstack([stretch(b4), stretch(b3), stretch(b2)])), f"{sid}_optical.png")
    save(Image.fromarray(stretch(f["lhh"])), f"{sid}_lband.png")
    save(Image.fromarray(stretch(f["cvv"])), f"{sid}_cband.png")
    save(Image.fromarray((np.clip(f["slope"] / 30, 0, 1) * 255).astype("uint8")), f"{sid}_slope.png")
    # hotspots: red fill with a solid outline
    rgba = np.zeros(hot.shape + (4,), "uint8")
    rgba[hot] = (226, 75, 74, 120)
    rgba[hot & ~ndi.binary_erosion(hot, iterations=2)] = (255, 90, 80, 255)
    save(Image.fromarray(rgba, "RGBA"), f"{sid}_anomalies.png")
    # radar surprise: warm = L-band brighter than predicted, cool = darker; transparent near zero
    z = f["surprise"]
    a = np.clip((np.abs(z) - 1) / 2, 0, 1)
    rgba = np.zeros(z.shape + (4,), "uint8")
    pos = z > 0
    rgba[..., 0] = np.where(pos, 255, 60)
    rgba[..., 1] = np.where(pos, (170 - 120 * a).astype("uint8"), 140)
    rgba[..., 2] = np.where(pos, 40, 255)
    rgba[..., 3] = (a * np.where(pos, 230, 150)).astype("uint8")
    save(Image.fromarray(rgba, "RGBA"), f"{sid}_surprise.png")


def hotspots(s):
    z = s["f"]["surprise"]
    hot = z > HOT_Z
    lab, n = ndi.label(hot)
    out = []
    if n:
        sizes = ndi.sum(hot, lab, range(1, n + 1))
        keep = 1 + np.flatnonzero(sizes >= 30)
        hot = np.isin(lab, keep)
        h, w = z.shape
        (so, we), (no, ea) = s["bounds"]
        px_km2 = ((no - so) / h * 110.54) * ((ea - we) / w * 111.32 * math.cos(math.radians((so + no) / 2)))
        blobs = []
        for k in keep:
            m = lab == k
            rr, cc = np.nonzero(m)
            blobs.append((float(z[m].sum()), float(z[m].mean()), m.sum() * px_km2, rr.mean(), cc.mean()))
        for i, (_, zmean, area, r, c) in enumerate(sorted(blobs, reverse=True)[:5]):
            lat = no - (r + 0.5) * (no - so) / h
            lon = we + (c + 0.5) * (ea - we) / w
            out.append({"id": f"H{i + 1}", "coords": [round(lat, 4), round(lon, 4)],
                        "note": f"L-band brighter than the surface predicts (mean z = +{zmean:.1f}, about {area:.2f} km²). Candidate only.",
                        "tag": "Interpreted"})
    return hot, float(hot.mean() * 100), out


# ------------------------------------------------------------------------------------------------
# main
# ------------------------------------------------------------------------------------------------
def main():
    OUT_GRID.mkdir(parents=True, exist_ok=True)
    OUT_ML.mkdir(parents=True, exist_ok=True)
    OUT_REP.mkdir(parents=True, exist_ok=True)
    missing = []
    ids = C.SITE_ORDER
    log(f"build_all.py  {datetime.now(timezone.utc).isoformat(timespec='minutes')}")
    sites = []
    for sid in ids:
        s = load_site(sid)
        s["grid"] = np.round(slope_grid(s["f"]["slope"]), 1).astype(float)   # same values as the JSON the app reads
        sites.append(s)
        log(f"[load] {sid}: {s['shape'][1]} x {s['shape'][0]} px, bounds {s['bounds']}")

    model_info = surprise_model(sites)
    vals, site_of = build_cells(sites)

    out_sites = []
    for i, s in enumerate(sites):
        sid, f = s["id"], s["f"]
        hot, hot_pct, hs = hotspots(s)
        dem = f["elev"]
        metrics = {
            "mean_slope": round(float(f["slope"].mean()), 2),
            "relief": round(float(np.percentile(dem, 95) - np.percentile(dem, 5)), 1),
            "steep_share": round(float((f["slope"] > STEEP).mean() * 100), 2),
            "rough": round(float(f["rough"].mean()), 2),
            "elev": round(float(dem.mean()), 0),
            "hot_share": round(hot_pct, 2),
        }
        g = s["grid"]
        (OUT_GRID / f"{sid}_slope.json").write_text(json.dumps(
            {"cols": GRID, "rows": GRID, "bounds": s["bounds"], "maxSlope": STEEP,
             "slope": [round(float(v), 1) for v in g.ravel()]}, separators=(",", ":")))
        overlays(s, hot)
        pw = load_power(sid)
        if not pw:
            missing.append(f"power_{sid}.json")
            pw = {"monthly_tmax_c": [None] * 12, "monthly_tmin_c": [None] * 12, "rain_mm_year": None, "daily_range_c": None}
        (so, we), (no, ea) = s["bounds"]
        name, coords = C.SITES[sid]["hub"]
        hub = {"name": name, "coords": coords, "distance_km": round(haversine_km([(so + no) / 2, (we + ea) / 2], coords), 1)}
        out_sites.append({
            "id": sid, "name": C.SITES[sid]["name"], "bounds": s["bounds"],
            "layers": {"optical": f"/overlays/{sid}_optical.png", "c_band": f"/overlays/{sid}_cband.png",
                       "l_band": f"/overlays/{sid}_lband.png", "anomalies": f"/overlays/{sid}_anomalies.png",
                       "slope": f"/overlays/{sid}_slope.png", "surprise": f"/overlays/{sid}_surprise.png"},
            "metrics": metrics,
            "hotspots": [{"id": h["id"], "coords": h["coords"], "note": h["note"]} for h in hs],
            "climate": pw, "hub": hub,
            "air_pressure_kpa": round(101.325 * (1 - 2.25577e-5 * metrics["elev"]) ** 5.25588, 1),
            "grid": f"/grids/{sid}_slope.json",
        })
        log(f"[site] {sid}: {metrics}  hub {hub}  climate {pw}")

    dec = {"slope_mean": 1, "slope_p90": 1, "steep": 1, "relief": 0, "rough": 2, "bright": 4, "red": 3,
           "lhh": 1, "cvv": 1, "lmc": 1, "surprise": 2, "elev": 0}
    cells = {
        "rows": CELLS, "cols": CELLS,
        "sites": [{"id": s["id"], "name": C.SITES[s["id"]]["name"], "bounds": s["bounds"], "start": i * CELLS * CELLS}
                  for i, s in enumerate(sites)],
        "values": {k: [round(float(v), dec[k]) if dec[k] else int(round(float(v))) for v in vals[k]] for k in C.FEATURES},
    }
    (OUT_ML / "cells.json").write_text(json.dumps(cells, separators=(",", ":")))
    SITES_JSON.write_text(json.dumps({
        "generated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "note": "Written by pipeline/build_all.py (site rasters, radar model, overlays). Read by pipeline/compare.py.",
        "surprise_model": model_info, "sites": out_sites}, indent=1, ensure_ascii=False), encoding="utf-8")
    if missing:
        log("Missing inputs:", ", ".join(missing))
    (OUT_REP / "report.txt").write_text("\n".join(REPORT) + "\n", encoding="utf-8")
    log("Wrote overlays, grids, cells.json and pipeline/sites.json. Next: python pipeline/compare.py")


if __name__ == "__main__":
    main()
