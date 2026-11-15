"""
build_all.py  --  Team Hoggar / Algeria Beyond Earth

ONE command that turns the three Earth Engine stacks into everything the website reads:

    python pipeline/build_all.py

Inputs (pipeline/):  <site>_stack.tif   7 bands: 1 L_HH, 2 L_HV, 3 C_VV, 4 B4, 5 B3, 6 B2, 7 DEM (EPSG:4326, 25 m)
                     power_<site>.json  NASA POWER climatology (T2M_MAX, T2M_MIN, PRECTOTCORR)
                     content.py         the human decisions (texts, targets, rules, objectives)
Outputs (public/):   overlays/<site>_{optical,lband,cband,slope,anomalies,classes,surprise}.png
                     grids/<site>_slope.json            160 x 160 rover grid (90th percentile slope per block)
                     ml/cells.json, ml/model.json       Analog Finder data (7,500 cells of ~400 m)
                     mission_data.json                  3 scenarios x 3 sites, scores, verdicts, waypoints
                     pipeline/out/report.txt            model validation and checks

Machine learning (all offline, scikit-learn):
  1. Radar surprise (self-supervised regression). A gradient-boosting model learns to predict L-band
     backscatter from what the surface shows (optical, C-band, slope, roughness, relief). Where L-band is
     much brighter than predicted, something the surface does not explain is there: a candidate buried
     structure (SIR-A style). Predictions are out-of-fold (spatial blocks) so a pixel never predicts itself.
     Validated by spatial-block cross-validation and leave-one-site-out.
  2. Terrain units (unsupervised). A Gaussian mixture groups all cells of the three sites into units.
  3. Analog Finder (in the browser). Ranks cells for a destination + objective with transparent weighted
     percentiles, and finds look-alike cells (nearest neighbours). Waypoints below come from it.
Nothing here is labelled ground truth: hotspots and units are Interpreted, waypoints are Hypotheses.
"""
import json
import math
import sys
from datetime import datetime, timezone
from heapq import heappop, heappush
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import numpy as np  # noqa: E402
import rasterio  # noqa: E402
from PIL import Image  # noqa: E402
from scipy import ndimage as ndi  # noqa: E402
from scipy.stats import rankdata  # noqa: E402
from sklearn.ensemble import HistGradientBoostingRegressor  # noqa: E402
from sklearn.inspection import permutation_importance  # noqa: E402
from sklearn.metrics import r2_score  # noqa: E402
from sklearn.mixture import GaussianMixture  # noqa: E402

import content as C  # noqa: E402

ROOT = HERE.parent
PUB = ROOT / "public"
OUT_OV, OUT_GRID, OUT_ML, OUT_REP = PUB / "overlays", PUB / "grids", PUB / "ml", HERE / "out"
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


def local_std(x, size):
    m = ndi.uniform_filter(x, size)
    m2 = ndi.uniform_filter(x * x, size)
    return np.sqrt(np.maximum(m2 - m * m, 0))


def stretch(a, lo=2, hi=98):
    p1, p2 = np.nanpercentile(a, [lo, hi])
    return (np.clip((a - p1) / max(p2 - p1, 1e-6), 0, 1) * 255).astype("uint8")


def fill(a):
    a = a.copy()
    bad = ~np.isfinite(a)
    if bad.any():
        a[bad] = np.nanmedian(a)
    return a


def edges(n, k):
    return np.linspace(0, n, k + 1).round().astype(int)


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
    path = HERE / f"{site}_stack.tif"
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
        "r2_block_cv": round(r2_block, 3),
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
    pct = {k: np.round((rankdata(vals[k]) - 1) / (len(rows) - 1) * 100).astype(int) for k in C.FINDER_FEATURES}
    return vals, pct, site_of


UNIT_FEATURES = ["slope_mean", "relief", "rough", "bright", "red", "lhh", "cvv", "lmc", "surprise"]
UNIT_COLOURS = [(29, 158, 117), (239, 159, 39), (127, 119, 221), (226, 75, 74), (56, 189, 248), (240, 220, 90), (180, 120, 80)]


def terrain_units(vals, site_of, site_ids):
    X = np.stack([vals[k] for k in UNIT_FEATURES], 1)
    mu, sd = X.mean(0), X.std(0) + 1e-9
    Z = (X - mu) / sd
    bics = {}
    fits = {}
    for k in range(3, 8):
        gm = GaussianMixture(k, covariance_type="full", n_init=3, random_state=SEED).fit(Z)
        bics[k] = gm.bic(Z)
        fits[k] = gm
    # BIC keeps falling with k on 7,500 cells; we stop where the gain becomes small (< 2 %): readable units
    ks = sorted(bics)
    k_best = ks[-1]
    for a, b in zip(ks, ks[1:]):
        if (bics[a] - bics[b]) / abs(bics[a]) < 0.02:
            k_best = a
            break
    k_best = min(k_best, 6)
    gm = fits[k_best]
    lab = gm.predict(Z)
    # order units by mean slope so colours are stable
    order = np.argsort([X[lab == u, 0].mean() for u in range(k_best)])
    remap = {int(old): new for new, old in enumerate(order)}
    lab = np.array([remap[int(u)] for u in lab])
    units = []
    base_names = []
    for u in range(k_best):
        zf = dict(zip(UNIT_FEATURES, Z[lab == u].mean(0)))
        terrain = "Flat" if zf["slope_mean"] < -0.5 else "Steep" if zf["slope_mean"] > 0.8 else "Sloping"
        surface = "bright" if zf["bright"] > 0.5 else "dark" if zf["bright"] < -0.5 else "mid-tone"
        radar = "radar-bright" if zf["lhh"] > 0.6 else "radar-dark" if zf["lhh"] < -0.6 else "radar-moderate"
        base_names.append(f"{terrain}, {surface}, {radar}")
    EXTRA = {"red": ("redder", "paler"), "rough": ("rougher", "smoother"), "surprise": ("more radar surprise", "less radar surprise"),
             "lmc": ("L-band over C-band", "C-band over L-band"), "relief": ("more relief", "less relief"),
             "bright": ("brighter", "darker"), "cvv": ("C-band brighter", "C-band darker")}
    names = []
    for u in range(k_best):
        same = [v for v in range(k_best) if base_names[v] == base_names[u]]
        name = base_names[u]
        if len(same) > 1:
            zu = Z[lab == u].mean(0)
            zg = np.mean([Z[lab == v].mean(0) for v in same], 0)
            diff = {k: zu[j] - zg[j] for j, k in enumerate(UNIT_FEATURES) if k in EXTRA}
            k = max(diff, key=lambda q: abs(diff[q]))
            name += ", " + EXTRA[k][0 if diff[k] > 0 else 1]
        while name in names:
            name += "*"
        names.append(name)
        share = {sid: round(float((lab[site_of == i] == u).mean() * 100), 1) for i, sid in enumerate(site_ids)}
        cent = {k: round(float(X[lab == u, j].mean()), 3) for j, k in enumerate(UNIT_FEATURES)}
        units.append({"id": u, "name": name, "color": "#%02x%02x%02x" % UNIT_COLOURS[u], "share": share, "centroid": cent})
    log(f"[units] BIC by k: " + ", ".join(f"{k}:{bics[k]:.0f}" for k in ks) + f"  -> k = {k_best}")
    for un in units:
        log(f"[units] {un['id']} {un['name']:40s} share {un['share']}")
    return lab, units, {"k": k_best, "bic": {str(k): round(float(v), 1) for k, v in bics.items()}, "features": UNIT_FEATURES}


# ------------------------------------------------------------------------------------------------
# 4. Analog Finder scoring (same formula as src/lib/finder.ts)
# ------------------------------------------------------------------------------------------------
def pref_score(p, want):
    if want == "low":
        return 1 - p / 100
    if want == "high":
        return p / 100
    lo, hi = want
    if lo <= p <= hi:
        return 1.0
    d = lo - p if p < lo else p - hi
    return max(0.0, 1 - d / 50)


def science_scores(pct, prefs):
    tot = sum(pr["w"] for pr in prefs)
    out = np.zeros(len(next(iter(pct.values()))))
    for pr in prefs:
        p = pct[pr["f"]].astype(float)
        if pr["want"] == "low":
            s = 1 - p / 100
        elif pr["want"] == "high":
            s = p / 100
        else:
            lo, hi = pr["want"]
            d = np.where(p < lo, lo - p, np.where(p > hi, p - hi, 0))
            s = np.clip(1 - d / 50, 0, 1)
        out += pr["w"] * s
    return out / tot


# ------------------------------------------------------------------------------------------------
# 5. rover waypoints (Hypotheses picked by the Finder) + A* check (same algorithm as src/lib/astar.ts)
# ------------------------------------------------------------------------------------------------
def astar(grid, limit, start, goal):
    rows, cols = grid.shape

    def ok(r, c):
        return 0 <= r < rows and 0 <= c < cols and grid[r, c] <= limit
    if not ok(*start) or not ok(*goal):
        return []
    g = {start: 0.0}
    came = {}
    h = lambda r, c: math.hypot(r - goal[0], c - goal[1])  # noqa: E731
    open_ = [(h(*start), start)]
    while open_:
        f, cur = heappop(open_)
        if cur == goal:
            break
        if f - h(*cur) > g[cur] + 1e-9:
            continue
        r, c = cur
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            nr, nc = r + dr, c + dc
            if not ok(nr, nc) or (dr and dc and (not ok(r + dr, c) or not ok(r, c + dc))):
                continue
            ng = g[cur] + math.hypot(dr, dc) * (1 + grid[nr, nc] / 5)
            if ng < g.get((nr, nc), math.inf):
                g[(nr, nc)] = ng
                came[(nr, nc)] = cur
                heappush(open_, (ng + h(nr, nc), (nr, nc)))
    if start != goal and goal not in came:
        return []
    path, k = [goal], goal
    while k != start:
        k = came[k]
        path.append(k)
    return path[::-1]


ADJ = {
    "surprise": ("radar-surprise", "radar-quiet"), "lmc": ("L-band-bright", "L-band-dark"),
    "slope_mean": ("steep", "flat"), "steep": ("steep", "gentle"), "bright": ("bright", "dark"),
    "relief": ("high-relief", "low-relief"), "rough": ("rough", "smooth"), "red": ("reddish", "pale"),
    "cvv": ("C-band-bright", "C-band-dark"),
}
TITLE = {
    "surprise": ("Radar-surprise hotspot", "Radar-quiet patch"),
    "lmc": ("L-band brighter than C-band", "L-band darker than C-band"),
    "slope_mean": ("Steeper ground", "Flat ground"),
    "steep": ("Steep patch", "Gentle ground"),
    "bright": ("Bright surface", "Dark surface"),
    "relief": ("High-relief ground", "Low-relief ground"),
    "rough": ("Rough surface", "Smooth surface"),
    "red": ("Reddish surface", "Pale surface"),
    "cvv": ("C-band bright, rough at small scale", "C-band dark, smooth at small scale"),
}
INSPECT = {
    "mars_water": ["Are the sediments here rounded and sorted, as flowing water leaves them?",
                   "Is there coarse or layered material under the sand where L-band is bright?",
                   "Can a short core show fine, lake-like layers?"],
    "mars_layers": ["Which layer is at the bottom here, and does it change upslope?",
                    "What is each layer made of?",
                    "Is there a fine-grained, lake-like layer worth drilling?"],
    "moon_volcanic": ["Can the rover cross this volcanic relief safely?",
                      "Does radar show a void or a buried flow front under this spot?",
                      "Is the dark rock basalt, and how weathered is it?"],
}


def merged(prefs):
    """Destination and objective can both ask for the same feature: merge them (weights add)."""
    out = {}
    for pr in prefs:
        key = (pr["f"], json.dumps(pr["want"]))
        out.setdefault(key, {"f": pr["f"], "want": pr["want"], "w": 0})["w"] += pr["w"]
    return list(out.values())


def fact(f, want, v):
    lab = C.FEATURES[f][0].lower()
    if want == "high":
        return f"{lab} in the top 1 % of cells" if v >= 99 else f"{lab} higher than {v} % of cells"
    if want == "low":
        return f"{lab} in the lowest 1 % of cells" if v <= 1 else f"{lab} lower than {100 - v} % of cells"
    return f"{lab} in the middle range (percentile {v})"


def describe(pct_row, prefs, used_titles):
    contrib = sorted(merged(prefs), key=lambda pr: -pr["w"] * pref_score(pct_row[pr["f"]], pr["want"]))
    adjs, feats = [], []
    for pr in contrib:
        if isinstance(pr["want"], list):
            a = "moderate-relief" if pr["f"] == "relief" else "moderate-slope" if pr["f"] == "slope_mean" else ADJ[pr["f"]][0]
        else:
            a = ADJ[pr["f"]][0 if pr["want"] == "high" else 1]
        if a not in adjs:
            adjs.append(a)
            feats.append(pr["f"])
        if len(adjs) == 2:
            break
    order = ["slope_mean", "steep", "relief", "rough", "bright", "red", "surprise", "lmc", "cvv"]
    adjs = [a for _, a in sorted(zip(feats, adjs), key=lambda t: order.index(t[0]))]
    if all(a.startswith("moderate") for a in adjs):
        title = "Mid-slope outcrop zone"
    else:
        title = (", ".join(adjs) + " ground").capitalize()
    seen, facts = set(), []
    for pr in contrib:
        if pr["f"] in seen:
            continue
        seen.add(pr["f"])
        facts.append(fact(pr["f"], pr["want"], pct_row[pr["f"]]))
        if len(facts) == 2:
            break
    return title, "; ".join(facts)


def make_waypoints(sc_id, site, grid, cells_idx, vals, pct, bounds):
    sc = C.SCENARIOS[sc_id]
    prefs = C.DESTINATION_PROFILES[sc_id] + C.OBJECTIVES[sc["default_objective"]]["prefs"]
    passable = grid <= STEEP
    lab, n = ndi.label(passable)                           # 4-connected = reachable without corner cutting
    if n == 0:
        return None
    main = 1 + int(np.argmax(ndi.sum(passable, lab, range(1, n + 1))))
    scores = science_scores({k: v[cells_idx] for k, v in pct.items()}, prefs)
    order = np.argsort(-scores)
    picked = []
    for min_km in (3.0, 1.5):
        picked = []
        for j in order:
            r, c = divmod(int(j), CELLS)
            ll = cell_center(bounds, CELLS, CELLS, r, c)
            gr, gc = latlon_to_cell(bounds, GRID, GRID, ll)
            if lab[gr, gc] != main:
                continue
            if all(haversine_km(ll, q["ll"]) >= min_km for q in picked):
                picked.append({"j": int(j), "ll": ll, "g": (gr, gc), "score": float(scores[j])})
            if len(picked) == 3:
                break
        if len(picked) == 3:
            break
    # landing: flat ground in the same connected area, at least 1.5 km from every waypoint, close to the first one
    local = ndi.uniform_filter(np.where(passable, grid, 90.0), 3)
    best, best_cost = None, math.inf
    for gr in range(1, GRID - 1, 2):
        for gc in range(1, GRID - 1, 2):
            if lab[gr, gc] != main or local[gr, gc] > 6:
                continue
            ll = cell_center(bounds, GRID, GRID, gr, gc)
            d = [haversine_km(ll, q["ll"]) for q in picked]
            if min(d) < 1.5:
                continue
            cost = local[gr, gc] + 0.4 * min(d)
            if cost < best_cost:
                best, best_cost = (gr, gc, ll), cost
    if best is None:
        return None
    landing = best[2]
    # visit order: greedy nearest neighbour from the landing point
    route, cur, rest = [], landing, picked[:]
    while rest:
        nxt = min(rest, key=lambda q: haversine_km(cur, q["ll"]))
        route.append(nxt)
        rest.remove(nxt)
        cur = nxt["ll"]
    # check with the same A* as the app, at the default slope limit
    stops = [(best[0], best[1])] + [q["g"] for q in route]
    km = 0.0
    for a, b in zip(stops, stops[1:]):
        path = astar(grid, STEEP, a, b)
        if not path:
            log(f"[waypoints] {sc_id}/{site}: no A* route {a}->{b} (should not happen)")
            return None
        pts = [cell_center(bounds, GRID, GRID, r, c) for r, c in path]
        km += sum(haversine_km(p, q) for p, q in zip(pts, pts[1:]))
    wps, used = [], []
    for i, q in enumerate(route):
        row = {k: int(v[cells_idx[q["j"]]]) for k, v in pct.items()}
        title, why = describe(row, prefs, used)
        used.append(title)
        wps.append({"id": f"WP-0{i + 1}", "coords": q["ll"], "title": title + " candidate",
                    "inspect": INSPECT[sc_id][i], "tool": sc["tools"][i], "tag": "Hypothesis",
                    "why": f"Picked by the Analog Finder ({C.OBJECTIVES[sc['default_objective']]['label'].lower()}): {why}."})
    log(f"[waypoints] {sc_id:13s} {site:8s} landing {landing}  route {km:.1f} km at {STEEP:.0f}°")
    return {"grid": f"/grids/{site}_slope.json", "slope_limit_deg": STEEP, "landing": landing,
            "waypoints": wps, "route_km_default": round(km, 1)}


# ------------------------------------------------------------------------------------------------
# 6. climate
# ------------------------------------------------------------------------------------------------
def load_power(site):
    path = HERE / f"power_{site}.json"
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


def overlays(s, hot, unit_grid, units):
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
    # terrain units at cell resolution
    col = np.array([tuple(int(u["color"][i:i + 2], 16) for i in (1, 3, 5)) + (165,) for u in units], "uint8")
    img = Image.fromarray(col[unit_grid], "RGBA").resize((CELLS * 10, CELLS * 10), Image.NEAREST)
    save(img, f"{sid}_classes.png")


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
# 8. scoring
# ------------------------------------------------------------------------------------------------
def score_terrain(sc_id, m):
    if sc_id == "mars_water":
        d = m["mean_slope"]
        return 3 if d <= 5 else 2 if d <= 10 else 1 if d <= 15 else 0, f"mean slope {m['mean_slope']}°"
    if sc_id == "mars_layers":
        pts = int(100 <= m["relief"] <= 600) + int(3 <= m["mean_slope"] <= 12) + int(m["steep_share"] < 25)
        return pts, f"relief {m['relief']} m, mean slope {m['mean_slope']}°, {m['steep_share']} % over 15°"
    r = m["relief"]
    return 3 if r >= 300 else 2 if r >= 150 else 1 if r >= 50 else 0, f"relief {m['relief']} m"


def score_dryness(rain):
    return 3 if rain < 20 else 2 if rain < 50 else 1 if rain < 100 else 0


def score_access(steep_share, hub_km):
    if hub_km >= 250:
        return 0
    flat = 100 - steep_share
    return 3 if flat > 90 else 2 if flat > 75 else 1


PARTIAL_SHARE = 0.5   # same constant as src/lib/match.ts


def verdicts(totals, max_total, n_sites):
    best = max(totals.values())
    n_best = sum(1 for t in totals.values() if t == best)
    out = {}
    for sid, t in totals.items():
        txt = f"{t}/{max_total}"
        if t == best:
            out[sid] = ("STRONGEST", f"Scored {txt}: {'joint highest' if n_best > 1 else 'highest'} of the {n_sites} sites.")
        elif t / max_total >= PARTIAL_SHARE:
            out[sid] = ("PARTIAL", f"Scored {txt}: at least {int(PARTIAL_SHARE * 100)}% of the target, but not the highest.")
        else:
            out[sid] = ("WEAK", f"Scored {txt}: below {int(PARTIAL_SHARE * 100)}% of the target.")
    return out


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
    vals, pct, site_of = build_cells(sites)
    unit_lab, units, unit_info = terrain_units(vals, site_of, ids)

    # per-site numbers, grids, overlays
    nums = {}
    for i, s in enumerate(sites):
        sid, f = s["id"], s["f"]
        hot, hot_pct, hs = hotspots(s)
        dem = f["elev"]
        nums[sid] = {
            "mean_slope": round(float(f["slope"].mean()), 2),
            "relief": round(float(np.percentile(dem, 95) - np.percentile(dem, 5)), 1),
            "steep_share": round(float((f["slope"] > STEEP).mean() * 100), 2),
            "anomalies": round(hot_pct, 2),
            "hotspots": hs,
            "rough": round(float(f["rough"].mean()), 2),
            "elev": round(float(dem.mean()), 0),
        }
        g = s["grid"]
        (OUT_GRID / f"{sid}_slope.json").write_text(json.dumps(
            {"cols": GRID, "rows": GRID, "bounds": s["bounds"], "maxSlope": STEEP,
             "slope": [round(float(v), 1) for v in g.ravel()]}, separators=(",", ":")))
        overlays(s, hot, unit_lab[site_of == i].reshape(CELLS, CELLS), units)
        log(f"[site] {sid}: {nums[sid] | {'hotspots': len(hs)}}")

    # cells.json (Analog Finder data)
    dec = {"slope_mean": 1, "slope_p90": 1, "steep": 1, "relief": 0, "rough": 2, "bright": 4, "red": 3,
           "lhh": 1, "cvv": 1, "lmc": 1, "surprise": 2, "elev": 0}
    cells = {
        "rows": CELLS, "cols": CELLS,
        "sites": [{"id": s["id"], "name": C.SITES[s["id"]]["name"], "bounds": s["bounds"], "start": i * CELLS * CELLS}
                  for i, s in enumerate(sites)],
        "values": {k: [round(float(v), dec[k]) if dec[k] else int(round(float(v))) for v in vals[k]] for k in C.FEATURES},
        "pct": {k: [int(v) for v in pct[k]] for k in C.FINDER_FEATURES},
        "unit": [int(u) for u in unit_lab],
    }
    (OUT_ML / "cells.json").write_text(json.dumps(cells, separators=(",", ":")))

    model = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "cell_size_m": 400,
        "features": {k: {"label": v[0], "unit": v[1], "source": v[2], "desc": v[3]} for k, v in C.FEATURES.items()},
        "finder_features": C.FINDER_FEATURES,
        "objectives": C.OBJECTIVES,
        "destinations": C.DESTINATION_PROFILES,
        "surprise_model": model_info,
        "units": units,
        "units_model": {"type": "GaussianMixture (scikit-learn, full covariance)", **unit_info},
    }
    (OUT_ML / "model.json").write_text(json.dumps(model, indent=1, ensure_ascii=False))

    # climate + hubs
    climate, hubs = {}, {}
    for s in sites:
        sid = s["id"]
        pw = load_power(sid)
        if not pw:
            missing.append(f"power_{sid}.json")
        climate[sid] = pw
        (so, we), (no, ea) = s["bounds"]
        name, coords = C.SITES[sid]["hub"]
        hubs[sid] = {"name": name, "coords": coords, "distance_km": round(haversine_km([(so + no) / 2, (we + ea) / 2], coords), 1)}
        log(f"[climate] {sid}: {pw}  hub {hubs[sid]}")

    best_hot = max(n["anomalies"] for n in nums.values())
    scenarios = {}
    for sc_id in C.SCENARIO_ORDER:
        sc = C.SCENARIOS[sc_id]
        cands, totals = [], {}
        for i, s in enumerate(sites):
            sid = s["id"]
            m = nums[sid]
            pw = climate[sid] or {"monthly_tmax_c": [None] * 12, "monthly_tmin_c": [None] * 12, "rain_mm_year": None, "daily_range_c": None}
            hub = hubs[sid]
            t_s, t_basis = score_terrain(sc_id, m)
            mat, mat_note, mat_src = sc["materials"][sid]
            fp = [
                {"axis": "Terrain & slope", "target": 3, "weight": 2, "site": t_s, "tag": "Measured", "basis": t_basis},
                {"axis": "Surface materials", "target": 3, "weight": 2, "site": mat, "tag": "Interpreted", "basis": mat_note, "source": mat_src},
                {"axis": "Dryness", "target": 3, "site": None if pw["rain_mm_year"] is None else score_dryness(pw["rain_mm_year"]),
                 "tag": "Measured", "basis": f"{pw['rain_mm_year']} mm of rain per year"},
                {"axis": "Subsurface structures", "target": 3, "site": 0 if best_hot <= 0 else round(3 * m["anomalies"] / best_hot),
                 "tag": "Measured", "basis": f"{m['anomalies']} % of the box are radar-surprise hotspots"},
                {"axis": "Temperature extremes", "target": 3, "site": None if pw["daily_range_c"] is None else (2 if pw["daily_range_c"] >= 15 else 1),
                 "tag": "Measured", "basis": f"average monthly swing {pw['daily_range_c']} °C"},
                {"axis": "Access for operations", "target": 3, "site": score_access(m["steep_share"], hub["distance_km"]),
                 "tag": "Measured", "basis": f"{hub['distance_km']} km to {hub['name']}, {round(100 - m['steep_share'], 1)} % under 15°"},
            ]
            if any(a["site"] is None for a in fp):
                missing.append(f"{sc_id}/{sid}: incomplete scores")
            else:
                for a in fp:
                    a.setdefault("weight", 1)
                totals[sid] = sum(a["weight"] * a["site"] for a in fp)
            cells_idx = np.flatnonzero(site_of == i)
            rover = make_waypoints(sc_id, sid, s["grid"], cells_idx, vals, pct, s["bounds"])
            if rover is None:
                missing.append(f"{sc_id}/{sid}: no rover route")
            cands.append({
                "id": sid, "name": C.SITES[sid]["name"], "role": "comparison site",
                "verdict": None, "verdict_reason": None,
                "bounds": s["bounds"],
                "layers": {k: f"/overlays/{sid}_{v}.png" for k, v in
                           [("optical", "optical"), ("c_band", "cband"), ("l_band", "lband"), ("classes", "classes"),
                            ("anomalies", "anomalies"), ("slope", "slope"), ("surprise", "surprise")]},
                "metrics": [
                    {"key": "mean_slope", "label": "Mean slope", "value": m["mean_slope"], "unit": "°", "tag": "Measured", "source": "cop_dem"},
                    {"key": "relief", "label": "Relief (5th to 95th percentile height)", "value": m["relief"], "unit": "m", "tag": "Measured", "source": "cop_dem"},
                    {"key": "steep_share", "label": "Share of box steeper than 15°", "value": m["steep_share"], "unit": "% of area", "tag": "Measured", "source": "cop_dem"},
                    {"key": "anomalies", "label": "Radar-surprise hotspots (z > 2)", "value": m["anomalies"], "unit": "% of area", "tag": "Measured", "source": "ml"},
                    {"key": "roughness", "label": "Rock roughness (height variation over 125 m)", "value": m["rough"], "unit": "m", "tag": "Measured", "source": "cop_dem"},
                    {"key": "elevation", "label": "Mean elevation", "value": m["elev"], "unit": "m", "tag": "Measured", "source": "cop_dem"},
                ],
                "fingerprint": fp,
                "anomalies": m["hotspots"],
                "transfers": sc["site_transfers"].get(sid, []) + sc["transfers"],
                "breaks": sc["breaks"],
                "rover": rover,
                "earth_field_safety": {
                    "label": "Preliminary Earth field accessibility assessment",
                    "nearest_hub": hub,
                    "monthly_tmax_c": pw["monthly_tmax_c"],
                    "monthly_tmin_c": pw["monthly_tmin_c"],
                    "elevation_m": m["elev"],
                    "air_pressure_kpa": round(101.325 * (1 - 2.25577e-5 * m["elev"]) ** 5.25588, 1),
                    "rain_mm_year": pw["rain_mm_year"],
                    "daily_range_c": pw["daily_range_c"],
                    "assumptions": {"heat_c": 40, "slope_deg": STEEP, "hub_km": 250},
                    "source": "nasa_power",
                },
            })
        if len(totals) == len(sites):
            max_total = sum(3 * a["weight"] for a in cands[0]["fingerprint"])
            v = verdicts(totals, max_total, len(sites))
            for c in cands:
                c["verdict"], c["verdict_reason"] = v[c["id"]]
                if c["verdict"] == "STRONGEST":
                    c["role"] = "case study"
        scenarios[sc_id] = {
            "id": sc_id, "title": sc["title"], "short": sc["short"], "body": sc["body"], "question": sc["question"],
            "default_objective": sc["default_objective"], "delay": sc["delay"], "planet_target": sc["planet_target"],
            "rules": {"Terrain & slope": sc["terrain_rule"], "Surface materials": sc["materials_rule"], **C.COMMON_RULES},
            "weighting": C.WEIGHTING,
            "candidates": cands,
        }
        log(f"[score] {sc_id:13s} " + "  ".join(f"{c['id']} {totals.get(c['id'])}/24 {c['verdict']}" for c in cands))

    data = {
        "meta": {
            "mock": bool(missing),
            "generated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
            "sources": C.SOURCES,
            "tags": C.TAGS,
            "ml": {"surprise_r2_block_cv": model_info["r2_block_cv"], "surprise_r2_leave_one_site_out": model_info["r2_leave_one_site_out"],
                   "units": unit_info["k"], "cells": int(len(site_of)), "cell_size_m": 400},
        },
        "scenarios": scenarios,
    }
    (PUB / "mission_data.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    log("")
    if missing:
        log("STILL MOCK (meta.mock = true). Missing:")
        for x in missing:
            log("  -", x)
    else:
        log("All real data in: meta.mock = false.")
    (OUT_REP / "report.txt").write_text("\n".join(REPORT) + "\n", encoding="utf-8")
    log("Wrote public/mission_data.json, public/ml/*.json, public/overlays/*.png, public/grids/*.json, pipeline/out/report.txt")


if __name__ == "__main__":
    main()
