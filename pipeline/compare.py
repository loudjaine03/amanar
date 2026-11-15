"""
compare.py  --  Team Hoggar / Amanar

Compares the three Algerian sites with REAL Mars and Moon terrain and writes everything the website reads.

    python pipeline/compare.py          (about 1 minute, runs offline)

Inputs
  pipeline/sites.json              site metrics, climate, radar model info   (written by build_all.py)
  public/ml/cells.json             7,500 Earth cells of ~400 m               (written by build_all.py)
  public/grids/<site>_slope.json   160 x 160 rover slope grids                (written by build_all.py)
  public/overlays/<site>_*.png     optical, radar, slope, radar-surprise      (written by build_all.py)
  pipeline/planetary/*.npz         Mars / Moon elevation windows              (prepare_targets.py)
  pipeline/content.py              human decisions: geology checks, texts, thresholds
Outputs
  public/mission_data.json, public/ml/lookalike.json, public/overlays/target_*.png, *_slopec.png, *_like_*.png
  pipeline/out/compare_report.txt

What is measured and what is judged
  Terrain match (0-100): MEASURED. The same six terrain measures (terrain.py) are computed for every
    400 m cell of the Earth sites and of the Mars/Moon windows; the score is the average overlap of the
    two distributions. It is re-run 12 ways (other measures, other distance) to show how stable the
    ranking is.
  Geology (match / partial / no): REFERENCE + JUDGEMENT, one cited sentence per site and target.
    It never changes the terrain score; it changes the label ("Strong", "Terrain only", ...).
  Radar hotspots: MEASURED by the radar-surprise model, then checked for four known artefacts.
"""
import json
import math
import os
import sys
from datetime import datetime, timezone
from heapq import heappop, heappush
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import content as C  # noqa: E402
import terrain as T  # noqa: E402

ROOT = HERE.parent
PUB = Path(os.environ.get("AMANAR_PUBLIC", ROOT / "public"))
SITES_JSON = Path(os.environ.get("AMANAR_SITES", HERE / "sites.json"))
OV = PUB / "overlays"
REPORT = []
CELLS = 50
BORDER = 2           # cells (800 m) excluded from spot picks: 1 km windows and the radar model are unreliable at the box edge
ROVER_LIMIT = 15.0   # deg, default rover slope limit (same as the rover grid)


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s)
    REPORT.append(s)


def r1(x, d=1):
    return None if x is None else round(float(x), d)


def haversine_km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def cell_center(bounds, rows, cols, r, c):
    (s, w), (n, e) = bounds
    return [round(n - (r + 0.5) * (n - s) / rows, 5), round(w + (c + 0.5) * (e - w) / cols, 5)]


def latlon_to_cell(bounds, rows, cols, p):
    (s, w), (n, e) = bounds
    r = int((n - p[0]) / (n - s) * rows)
    c = int((p[1] - w) / (e - w) * cols)
    return min(rows - 1, max(0, r)), min(cols - 1, max(0, c))


# ------------------------------------------------------------------------------------------------
# images
# ------------------------------------------------------------------------------------------------
SLOPE_STOPS = [(0, (12, 32, 44)), (3, (26, 84, 98)), (8, (40, 150, 120)), (15, (205, 214, 92)),
               (25, (240, 160, 58)), (35, (226, 72, 60))]


def slope_rgb(deg):
    deg = np.asarray(deg, "float64")
    out = np.zeros(deg.shape + (3,), "uint8")
    xs = [s[0] for s in SLOPE_STOPS]
    for ch in range(3):
        out[..., ch] = np.interp(deg, xs, [s[1][ch] for s in SLOPE_STOPS]).astype("uint8")
    return out


def save_png(arr, name, mode=None, colors=None):
    OV.mkdir(parents=True, exist_ok=True)
    img = Image.fromarray(arr, mode)
    if colors:   # slope maps use a colour ramp: a small palette keeps them light for the web
        img = img.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    img.save(OV / name, optimize=True)


# ------------------------------------------------------------------------------------------------
# A* (same algorithm as src/lib/astar.ts)
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


# ------------------------------------------------------------------------------------------------
# 1. load
# ------------------------------------------------------------------------------------------------
def load_earth():
    sj = json.loads(SITES_JSON.read_text(encoding="utf-8"))
    cj = json.loads((PUB / "ml" / "cells.json").read_text(encoding="utf-8"))
    sites = {}
    for s in sj["sites"]:
        meta = next(x for x in cj["sites"] if x["id"] == s["id"])
        st = meta["start"]
        cells = {k: np.array(cj["values"][k][st:st + CELLS * CELLS], "float64").reshape(CELLS, CELLS)
                 for k in ("slope_mean", "slope_p90", "steep", "rough", "relief", "elev", "bright", "surprise")}
        T.add_landscape(cells)
        s["cells"] = cells
        g = json.loads((PUB / s["grid"].lstrip("/")).read_text(encoding="utf-8"))
        s["grid_arr"] = np.array(g["slope"], "float64").reshape(g["rows"], g["cols"])
        sites[s["id"]] = s
    return sj, cj, sites


def load_targets():
    """Each target: the WHOLE grid we have (for zones) and the main window (for the headline ranking).
    Cells are computed once on the whole grid, aligned so the main window falls on whole cells."""
    meta = json.loads((HERE / "planetary" / "targets.json").read_text(encoding="utf-8"))
    out = {}
    for tid in C.TARGET_ORDER:
        z = np.load(HERE / "planetary" / f"{tid}.npz")
        full, res = z["dem_dm"].astype("float64") / 10, float(z["res"])
        r0, c0, h, w = (int(v) for v in z["window"])
        cp = int(round(T.CELL_M / res))                       # pixels per 400 m cell
        o_r, o_c = r0 % cp, c0 % cp                           # crop origin so the window is cell-aligned
        rows, cols = (full.shape[0] - o_r) // cp, (full.shape[1] - o_c) // cp
        grid = full[o_r:o_r + rows * cp, o_c:o_c + cols * cp]
        allcells, slope = T.cells_from_dem(grid, res)
        wr, wc, wh, ww = (r0 - o_r) // cp, (c0 - o_c) // cp, h // cp, w // cp
        cells = {k: v[wr:wr + wh, wc:wc + ww] for k, v in allcells.items()}
        win_slope = slope[(r0 - o_r):(r0 - o_r) + h, (c0 - o_c):(c0 - o_c) + w]
        out[tid] = {"meta": meta[tid], "res": res, "cells": cells, "slope": win_slope,
                    "all": allcells, "all_slope": slope, "win_cells": (wr, wc, wh, ww)}
        log(f"[target] {tid}: whole grid {cols}x{rows} cells, main window {ww}x{wh} cells at ({wr}, {wc})")
    return out


# ------------------------------------------------------------------------------------------------
# 2. terrain match
# ------------------------------------------------------------------------------------------------
def feature_ranges(sites, targets):
    rng = {}
    for k in T.KEYS:
        v = np.concatenate([T.tf(np.ravel(s["cells"][k])) for s in sites.values()] +
                           [T.tf(np.ravel(t.get("all", t["cells"])[k])) for t in targets.values()])
        rng[k] = (float(v.min()), float(v.max()) + 1e-9, float(v.std()))
    return rng


def match_score(ec, tc, keys, rng, method="overlap", bins=30):
    if method == "overlap":
        per = {k: T.overlap(np.ravel(ec[k]), np.ravel(tc[k]), rng[k][0], rng[k][1], bins) for k in keys}
    else:
        per = {k: T.wasserstein_match(np.ravel(ec[k]), np.ravel(tc[k]), rng[k][2]) for k in keys}
    return 100 * float(np.mean(list(per.values()))), per


VARIANTS = [("All six measures", T.KEYS, "overlap", 30)] + \
    [(f"Without '{lab}'", [k for k in T.KEYS if k != key], "overlap", 30) for key, lab, _, _ in T.FEATURES] + \
    [("Fine scale only (25-40 m measures)", [f[0] for f in T.FEATURES if f[3] == "fine"], "overlap", 30),
     ("Landscape scale only (400 m measures)", [f[0] for f in T.FEATURES if f[3] == "landscape"] + ["relief"], "overlap", 30),
     ("Other distance (quantile / Wasserstein)", T.KEYS, "wasserstein", 30),
     ("Coarser histograms (15 bins)", T.KEYS, "overlap", 15)]


def best_subarea(ec, tc, rng, size=10, step=2):
    """Best 4 km x 4 km area inside the site (10 x 10 cells), away from the border."""
    best = None
    for r in range(1, CELLS - size, step):
        for c in range(1, CELLS - size, step):
            sub = {k: ec[k][r:r + size, c:c + size] for k in T.KEYS}
            s, _ = match_score(sub, tc, T.KEYS, rng)
            if best is None or s > best[0]:
                best = (s, r, c)
    return best


def band(score):
    for lim, name in C.MATCH_BANDS:
        if score >= lim:
            return name
    return "poor"


def label(b, geo):
    if b == "close" and geo == "match":
        return "Strong analog"
    if b in ("close", "moderate") and geo in ("match", "partial"):
        return "Partial analog"
    if b in ("close", "moderate"):
        return "Terrain only"
    if geo == "match":
        return "Rocks only"
    return "Weak analog"


ZONE_TILE = 20      # cells: 8 km zones ...
ZONE_STEP = 10      # ... every 4 km
SITE_RGB = {"ahnet": (245, 166, 35), "tassili": (34, 211, 238), "hoggar": (192, 132, 252)}


def zone_analysis(tid, t, sites, rng):
    """Ranks the three sites on every 8 km zone of the whole Mars/Moon grid (overlapping, every 4 km).
    A 4 km block takes the average scores of the zones that contain it. Zones whose best score is 'poor'
    (< 45) count as 'no good match'."""
    al = t["all"]
    R, Cc = al["elev"].shape
    zr = list(range(0, max(R - ZONE_TILE, 0) + 1, ZONE_STEP)) or [0]
    zc = list(range(0, max(Cc - ZONE_TILE, 0) + 1, ZONE_STEP)) or [0]
    poor = C.MATCH_BANDS[-2][0]
    zones = []
    for r in zr:
        for c in zc:
            sub = {k: v[r:r + ZONE_TILE, c:c + ZONE_TILE] for k, v in al.items()}
            sc = {sid: match_score(s["cells"], sub, T.KEYS, rng)[0] for sid, s in sites.items()}
            win = max(sc, key=sc.get)
            zones.append({"r": r, "c": c, "scores": {k: round(v) for k, v in sc.items()},
                          "winner": win if sc[win] >= poor else None,
                          "slope400": float(np.median(sub["slope400"]))})
    wins = {sid: sum(1 for z in zones if z["winner"] == sid) for sid in C.SITE_ORDER}
    none = sum(1 for z in zones if z["winner"] is None)
    # 4 km blocks for the map
    br, bc = (zr[-1] + ZONE_TILE) // ZONE_STEP, (zc[-1] + ZONE_TILE) // ZONE_STEP
    block = np.full((br, bc), -1, int)
    for i in range(br):
        for j in range(bc):
            cover = [z for z in zones if z["r"] <= i * ZONE_STEP < z["r"] + ZONE_TILE and z["c"] <= j * ZONE_STEP < z["c"] + ZONE_TILE]
            if not cover:
                continue
            mean = {sid: np.mean([z["scores"][sid] for z in cover]) for sid in C.SITE_ORDER}
            best = max(mean, key=mean.get)
            block[i, j] = C.SITE_ORDER.index(best) if mean[best] >= poor else 3
    # image: slope of the whole grid + coloured 4 km blocks + the main window
    cp = int(round(T.CELL_M / t["res"]))
    grey = 35 + np.clip(t["all_slope"] / 35, 0, 1) * 190          # slope in grey, so the site colours stand out
    rgb = np.dstack([grey, grey, grey]).astype("float64")
    H, W = rgb.shape[:2]
    bpx = ZONE_STEP * cp
    for i in range(br):
        for j in range(bc):
            if block[i, j] < 0:
                continue
            sl = (slice(i * bpx, min((i + 1) * bpx, H)), slice(j * bpx, min((j + 1) * bpx, W)))
            if block[i, j] == 3:          # no good match: darken
                rgb[sl] = rgb[sl] * 0.35
            else:
                col = np.array(SITE_RGB[C.SITE_ORDER[block[i, j]]], "float64")
                rgb[sl] = rgb[sl] * 0.5 + col * 0.5
            rgb[sl[0].start, sl[1]] = rgb[sl[0], sl[1].start] = (15, 20, 30)
    wr, wc, wh, ww = t["win_cells"]
    y0, x0, y1, x1 = wr * cp, wc * cp, min((wr + wh) * cp, H) - 1, min((wc + ww) * cp, W) - 1
    for k in range(3):
        rgb[y0 + k, x0:x1] = rgb[y1 - k, x0:x1] = rgb[y0:y1, x0 + k] = rgb[y0:y1, x1 - k] = (255, 255, 255)
    img = Image.fromarray(rgb.astype("uint8"))
    if max(H, W) > 1000:
        img = img.resize((int(W * 1000 / max(H, W)), int(H * 1000 / max(H, W))), Image.LANCZOS)
    OV.mkdir(parents=True, exist_ok=True)
    img.quantize(colors=96, method=Image.Quantize.MEDIANCUT).save(OV / f"target_{tid}_zones.png", optimize=True)
    # which kind of ground each winning site matches (by the median slope of the zones it wins)
    words = C.TARGETS[tid]["zone_words"]
    winners = sorted([sid for sid in C.SITE_ORDER if wins[sid]],
                     key=lambda sid: np.mean([z["slope400"] for z in zones if z["winner"] == sid]))
    phrase_keys = {1: ["all"], 2: ["gentle", "steep"], 3: ["gentle", "middle", "steep"]}.get(len(winners), [])
    parts = [{"site": sid, "ground": words.get(k, words["all"]), "zones": wins[sid]} for sid, k in zip(winners, phrase_keys)]
    log(f"[zones] {tid}: {len(zones)} zones of 8 km -> wins {wins}, no good match {none}; " +
        "; ".join(f"{p['ground']} -> {p['site']}" for p in parts))
    return {"tile_km": ZONE_TILE * T.CELL_M / 1000, "step_km": ZONE_STEP * T.CELL_M / 1000, "n": len(zones),
            "wins": wins, "none": none, "parts": parts, "image": f"/overlays/target_{tid}_zones.png",
            "area_km": [round(W * t["res"] / 1000, 1), round(H * t["res"] / 1000, 1)],
            "colors": {k: "#%02x%02x%02x" % v for k, v in SITE_RGB.items()}}


TWIN_K = 15
TWIN_FEATURE_SETS = [("all six measures", T.KEYS),
                     ("without slope and steep ground", ["relief", "rough", "slope400", "relief4k"]),
                     ("landscape measures only", ["slope400", "relief4k", "relief"])]


def _feats(cells, keys, trim=0):
    R, Cc = cells["elev"].shape
    rr, cc = np.mgrid[0:R, 0:Cc]
    m = (rr >= trim) & (cc >= trim) & (rr < R - trim) & (cc < Cc - trim)
    return np.stack([T.tf(cells[k][m]) for k in keys], 1), m


def twin_model(targets, sites):
    """Machine learning, instance-based: a k-nearest-neighbour model (k = 15) learns the terrain of the 7,500
    Algerian cells. For every cell of the real Mars/Moon map it predicts which Algerian site holds its closest
    twins, or 'no twin' when even the nearest Algerian cell is farther than Algerian cells are from each other.
    No weights are set by hand. Checks: (1) the same predictions with other measure sets, (2) can the model tell
    the three Algerian sites apart on blocks it never saw (spatial cross-validation)?"""
    from sklearn.neighbors import KNeighborsClassifier, NearestNeighbors
    so = C.SITE_ORDER
    out = {tid: {"stability": []} for tid in targets}
    for set_i, (set_name, keys) in enumerate(TWIN_FEATURE_SETS):
        Xe = np.vstack([_feats(sites[sid]["cells"], keys)[0] for sid in so])
        ye = np.repeat(np.arange(len(so)), CELLS * CELLS)
        pool = np.vstack([Xe] + [_feats(t["all"], keys, 1)[0] for t in targets.values()])
        mu, sd = pool.mean(0), pool.std(0) + 1e-9
        Ze = (Xe - mu) / sd
        knn = KNeighborsClassifier(n_neighbors=TWIN_K).fit(Ze, ye)
        nn = NearestNeighbors(n_neighbors=TWIN_K).fit(Ze)
        d_ee = NearestNeighbors(n_neighbors=2).fit(Ze).kneighbors(Ze)[0][:, 1]
        thr = float(np.percentile(d_ee, 99) * 1.5)
        for tid, t in targets.items():
            Xt, m = _feats(t["all"], keys, 1)
            Zt = (Xt - mu) / sd
            pr = knn.predict_proba(Zt)
            lab = pr.argmax(1)
            dist, idx = nn.kneighbors(Zt)
            ok = dist[:, 0] <= thr
            share = {so[i]: round(100 * float(((lab == i) & ok).mean())) for i in range(len(so))}
            share["none"] = round(100 * float((~ok).mean()))
            out[tid]["stability"].append({"measures": set_name, "share": share})
            if set_i == 0:
                # what the browser needs to run the same model live (src/lib/twins.ts)
                out["_export"] = {"Ze": Ze, "mu": mu, "sd": sd, "thr": thr}
                Zall = (np.stack([T.tf(np.ravel(t["all"][k])) for k in keys], 1) - mu) / sd
                lab_exp = np.full(m.shape, -1, int)
                lab_exp[m] = np.where(ok, lab, 3)
                out[tid]["export"] = {"Z": Zall, "pred": lab_exp, "shape": m.shape}
                # per Earth cell: how many target cells pick it among their 15 nearest twins
                counts = np.bincount(idx[ok].ravel(), minlength=len(Xe)).astype("float64")
                score = 100 * counts / max(counts.max(), 1)
                lab_full = np.full(m.shape, -1, int)
                lab_full[m] = np.where(ok, lab, 3)
                out[tid].update({"share": share, "earth_score": score, "label_map": lab_full,
                                 "slope_of": {so[i]: float(np.median(t["all"]["slope400"][m][(lab == i) & ok]))
                                              if ((lab == i) & ok).any() else None for i in range(len(so))}})
                log(f"[twins] {tid}: {share}")
    # spatial-block cross-validation on Earth (4 km blocks): can the model recognise each site's terrain?
    Xe = np.vstack([_feats(sites[sid]["cells"], T.KEYS)[0] for sid in so])
    ye = np.repeat(np.arange(len(so)), CELLS * CELLS)
    rr, cc = np.mgrid[0:CELLS, 0:CELLS]
    blk = np.concatenate([i * 1000 + (rr // 10).ravel() * 10 + (cc // 10).ravel() for i in range(len(so))])
    rng_ = np.random.default_rng(0)
    ub = np.unique(blk)
    fold_of = dict(zip(ub, rng_.permutation(len(ub)) % 5))
    fold = np.array([fold_of[b] for b in blk])
    pred = np.zeros_like(ye)
    for k in range(5):
        tr = fold != k
        mu, sd = Xe[tr].mean(0), Xe[tr].std(0) + 1e-9
        knn = KNeighborsClassifier(n_neighbors=TWIN_K).fit((Xe[tr] - mu) / sd, ye[tr])
        pred[~tr] = knn.predict((Xe[~tr] - mu) / sd)
    acc = float((pred == ye).mean())
    log(f"[twins] site recognition on unseen 4 km blocks: {acc * 100:.0f}% (chance 33%)")
    for tid in targets:
        shares = [st["share"] for st in out[tid]["stability"]]
        if not shares:
            continue
        out[tid]["max_change"] = max(abs(a[k] - b[k]) for a in shares for b in shares for k in a)
    return out, acc


def twin_image(tid, t, lab_full):
    cp = int(round(T.CELL_M / t["res"]))
    grey = 35 + np.clip(t["all_slope"] / 35, 0, 1) * 190
    rgb = np.dstack([grey, grey, grey]).astype("float64")
    H, W = rgb.shape[:2]
    for i in range(lab_full.shape[0]):
        for j in range(lab_full.shape[1]):
            v = lab_full[i, j]
            if v < 0:
                continue
            sl = (slice(i * cp, min((i + 1) * cp, H)), slice(j * cp, min((j + 1) * cp, W)))
            if v == 3:
                rgb[sl] = rgb[sl] * 0.35
            else:
                rgb[sl] = rgb[sl] * 0.45 + np.array(SITE_RGB[C.SITE_ORDER[v]], "float64") * 0.55
    wr, wc, wh, ww = t["win_cells"]
    y0, x0, y1, x1 = wr * cp, wc * cp, min((wr + wh) * cp, H) - 1, min((wc + ww) * cp, W) - 1
    for k in range(3):
        rgb[y0 + k, x0:x1] = rgb[y1 - k, x0:x1] = rgb[y0:y1, x0 + k] = rgb[y0:y1, x1 - k] = (255, 255, 255)
    img = Image.fromarray(rgb.astype("uint8"))
    if max(H, W) > 1000:
        img = img.resize((int(W * 1000 / max(H, W)), int(H * 1000 / max(H, W))), Image.LANCZOS)
    img.quantize(colors=96, method=Image.Quantize.MEDIANCUT).save(OV / f"target_{tid}_twins.png", optimize=True)
    return f"/overlays/target_{tid}_twins.png"


# ------------------------------------------------------------------------------------------------
# 3. look-alike cells
# ------------------------------------------------------------------------------------------------
def lookalike(ec, tc):
    t = np.mean([T.typicality(ec[k], np.ravel(tc[k])) for k in T.KEYS], axis=0)
    return t * 100


def describe_spot(ec, tc, r, c):
    parts = []
    for k, lab, unit, _ in T.FEATURES:
        if k in ("slope_mean", "relief4k", "rough"):
            v = float(ec[k][r, c])
            med = float(np.median(tc[k]))
            sp = "" if unit in ("°", "%") or unit.startswith("%") else " "
            parts.append(f"{lab.split(' (')[0].lower()} {v:.0f}{sp}{unit} (target median {med:.0f}{sp}{unit})")
    return "; ".join(parts)


def pick_spots(score, bounds, n=5, min_km=1.5, mask=None):
    order = np.argsort(-score.ravel())
    picked = []
    for j in order:
        r, c = divmod(int(j), CELLS)
        if r < BORDER or c < BORDER or r >= CELLS - BORDER or c >= CELLS - BORDER:
            continue
        if mask is not None and not mask[r, c]:
            continue
        ll = cell_center(bounds, CELLS, CELLS, r, c)
        if all(haversine_km(ll, q["coords"]) >= min_km for q in picked):
            picked.append({"r": r, "c": c, "coords": ll, "score": round(float(score[r, c]))})
        if len(picked) == n:
            break
    return picked


# ------------------------------------------------------------------------------------------------
# 4. radar hotspot checks
# ------------------------------------------------------------------------------------------------
def phase_shift(a, b):
    """Sub-pixel translation between two images (phase correlation on gradient images)."""
    def prep(x):
        x = ndi.gaussian_filter(x.astype("float64"), 1.0)
        gy, gx = np.gradient(x)
        g = np.hypot(gx, gy)
        g = (g - g.mean()) / (g.std() + 1e-9)
        win = np.outer(np.hanning(g.shape[0]), np.hanning(g.shape[1]))
        return g * win
    A, B = np.fft.fft2(prep(a)), np.fft.fft2(prep(b))
    R = A * np.conj(B)
    R /= np.abs(R) + 1e-12
    corr = np.fft.ifft2(R).real
    py, px = np.unravel_index(np.argmax(corr), corr.shape)
    peak = float(corr[py, px] / (corr.std() + 1e-12))

    def sub(c, p, n, axis):
        m1 = corr[(p - 1) % n, px] if axis == 0 else corr[py, (p - 1) % n]
        m0 = corr[p, px] if axis == 0 else corr[py, p]
        p1 = corr[(p + 1) % n, px] if axis == 0 else corr[py, (p + 1) % n]
        d = m1 - 2 * m0 + p1
        off = 0.5 * (m1 - p1) / d if d != 0 else 0
        v = p + off
        return v - n if v > n / 2 else v
    dy = sub(corr, py, corr.shape[0], 0)
    dx = sub(corr, px, corr.shape[1], 1)
    return float(dy), float(dx), peak


def hotspot_checks(site):
    sid = site["id"]
    rules = C.HOTSPOT_RULES
    hot_rgba = np.asarray(Image.open(OV / f"{sid}_anomalies.png").convert("RGBA"))
    sur = np.asarray(Image.open(OV / f"{sid}_surprise.png").convert("RGBA")).astype("float64")
    opt = np.asarray(Image.open(OV / f"{sid}_optical.png").convert("RGB")).astype("float64").mean(2)
    lband = np.asarray(Image.open(OV / f"{sid}_lband.png").convert("L")).astype("float64")
    cband = np.asarray(Image.open(OV / f"{sid}_cband.png").convert("L")).astype("float64")
    slope = np.asarray(Image.open(OV / f"{sid}_slope.png").convert("L")).astype("float64") / 255 * 30
    hot = hot_rgba[..., 3] > 0
    h, w = hot.shape
    # z decoded from the overlay colour (saturates at |z| = 3, enough to read z > 2)
    z = np.where((sur[..., 0] == 255) & (sur[..., 3] > 0), 1 + 2 * sur[..., 3] / 230, 0)
    (so, we), (no, ea) = site["bounds"]
    px_m = 0.5 * ((no - so) / h * 110540 + (ea - we) / w * 111320 * math.cos(math.radians((so + no) / 2)))
    edge_px = rules["edge_m"] / px_m
    rr, cc = np.mgrid[0:h, 0:w]
    dist_edge = np.minimum.reduce([rr, cc, h - 1 - rr, w - 1 - cc])
    # strong surface boundaries: top 10 % of optical gradient, widened by 2 px (50 m)
    go = ndi.gaussian_gradient_magnitude(ndi.gaussian_filter(opt, 1), 1.5)
    strong = ndi.binary_dilation(go > np.percentile(go, 90), iterations=2)
    base = float(strong.mean())
    # smooth cover: C-band (5.6 cm) dark = smooth fine-grained surface; low optical texture = no exposed layered rock.
    # This is the setting where L-band (24 cm) can see below a dry cover (SIR-A buried channels).
    from scipy.stats import rankdata
    cbs = ndi.uniform_filter(cband, 5)
    tex = np.sqrt(np.maximum(ndi.uniform_filter(opt * opt, 5) - ndi.uniform_filter(opt, 5) ** 2, 0))
    c_pct = (rankdata(cbs.ravel()) / cbs.size).reshape(cbs.shape)
    t_pct = (rankdata(tex.ravel()) / tex.size).reshape(tex.shape)
    # co-registration of the three images over the whole box
    lc = phase_shift(lband, cband)
    lo = phase_shift(lband, opt)
    coreg = {"l_vs_c_px": [r1(lc[0], 2), r1(lc[1], 2)], "l_vs_optical_px": [r1(lo[0], 2), r1(lo[1], 2)],
             "pixel_m": r1(px_m, 1)}
    lab, n = ndi.label(hot)
    rough = site["cells"]["rough"]
    out = []
    for k in range(1, n + 1):
        m = lab == k
        if m.sum() < 30:
            continue
        ys, xs = np.nonzero(m)
        cy, cx = ys.mean(), xs.mean()
        lat = no - (cy + 0.5) * (no - so) / h
        lon = we + (cx + 0.5) * (ea - we) / w
        area = m.sum() * px_m * px_m / 1e6
        edge_share = float((dist_edge[m] < edge_px).mean())
        near_edge = edge_share > 0.3 or float(dist_edge[int(cy), int(cx)]) < edge_px
        contact = float(strong[m].mean())
        on_contact = contact >= rules["contact_share"] and contact / max(base, 1e-9) >= rules["contact_ratio"]
        # local co-registration around the hotspot (256 px = 6 km window; a 1.5 px = 37 m offset is flagged)
        y0, x0 = int(max(0, min(h - 256, cy - 128))), int(max(0, min(w - 256, cx - 128)))
        dy, dx, _ = phase_shift(lband[y0:y0 + 256, x0:x0 + 256], cband[y0:y0 + 256, x0:x0 + 256])
        shifted = math.hypot(dy, dx) > 1.5
        sl = float(np.median(slope[m]))
        cr, ccell = latlon_to_cell(site["bounds"], CELLS, CELLS, [lat, lon])
        rg = float(rough[cr, ccell])
        cp, tp = float(np.median(c_pct[m])), float(np.median(t_pct[m]))
        sandy = sl < rules["flat_slope_deg"] and cp < rules["cband_pct"] and tp < rules["texture_pct"]
        reasons = []
        if near_edge:
            reasons.append("at the edge of the box, where the filters and the model are least reliable")
        if on_contact:
            reasons.append(f"follows a sharp surface boundary ({contact * 100:.0f} % of it on strong edges vs {base * 100:.0f} % on average)")
        if shifted:
            reasons.append(f"L-band and C-band are offset by {math.hypot(dy, dx):.1f} px here")
        if not sandy:
            why = []
            if sl >= rules["flat_slope_deg"]:
                why.append(f"slope {sl:.0f}°")
            if cp >= rules["cband_pct"]:
                why.append("rough to C-band radar")
            if tp >= rules["texture_pct"]:
                why.append("visible layered or broken rock")
            reasons.append("not on a smooth, flat cover (" + ", ".join(why) + "): the brightness more likely comes from the surface")
        out.append({"coords": [round(lat, 4), round(lon, 4)], "area_km2": r1(area, 2),
                    "z_mean": r1(min(z[m].mean(), 3.0), 1), "edge_share": r1(edge_share, 2),
                    "contact_share": r1(contact, 2), "local_shift_px": r1(math.hypot(dy, dx), 2),
                    "slope_deg": r1(sl, 1), "rough_m": r1(rg, 2), "cband_pct": r1(cp, 2), "texture_pct": r1(tp, 2),
                    "checks": {"away_from_edge": not near_edge, "not_on_boundary": not on_contact,
                               "images_aligned": not shifted, "smooth_flat_cover": sandy},
                    "verdict": "candidate" if not reasons else "doubtful", "reasons": reasons})
    out.sort(key=lambda x: (x["verdict"] != "candidate", -x["area_km2"]))
    for i, x in enumerate(out):
        x["id"] = f"H{i + 1}"
    nc = sum(1 for x in out if x["verdict"] == "candidate")
    log(f"[radar] {sid}: {len(out)} hotspots, {nc} pass all checks; boundary share base {base:.2f}; "
        f"coreg L-C {coreg['l_vs_c_px']} px, L-opt {coreg['l_vs_optical_px']} px")
    for x in out:
        log(f"   {x['id']} {x['verdict']:9s} {x['area_km2']} km2 edge {x['edge_share']} contact {x['contact_share']} "
            f"shift {x['local_shift_px']} slope {x['slope_deg']} cband {x['cband_pct']} tex {x['texture_pct']}")
    return {"hotspots": out, "candidates": nc, "total": len(out), "coreg": coreg,
            "boundary_base": r1(base, 2),
            "candidate_km2": r1(sum(x["area_km2"] for x in out if x["verdict"] == "candidate"), 2)}


def radar_cells(sites, radar):
    """1 where a 400 m cell holds the centre of a radar hotspot that passed all four checks, else 0."""
    out = []
    for sid in C.SITE_ORDER:
        g = np.zeros((CELLS, CELLS), int)
        for h in radar[sid]["hotspots"]:
            if h["verdict"] == "candidate":
                r, c = latlon_to_cell(sites[sid]["bounds"], CELLS, CELLS, h["coords"])
                g[r, c] = 1
        out.extend(int(v) for v in g.ravel())
    return out


# ------------------------------------------------------------------------------------------------
# 5. tests that depend on the site and the target
# ------------------------------------------------------------------------------------------------
def tests_for(site, tgt, radar):
    ec, tc = site["cells"], tgt["cells"]
    body = C.TARGETS[tgt["id"]]["body"]
    env = C.ENV[body]
    out = []

    def ratio_test(name, key, q, unit, what):
        sv, tv = float(np.percentile(ec[key], q)), float(np.percentile(tc[key], q))
        rr = sv / max(tv, 1e-9)
        sp = "" if unit == "°" else " "
        unit = sp + unit
        if rr >= 0.8:
            lvl, txt = "field", f"Yes: {sv:.0f}{unit} here vs {tv:.0f}{unit} at the target."
        elif rr >= 0.4:
            lvl, txt = "partial", f"Partly: {sv:.0f}{unit} here vs {tv:.0f}{unit} at the target ({rr * 100:.0f} %)."
        else:
            lvl, txt = "no", f"No: {sv:.0f}{unit} here vs {tv:.0f}{unit} at the target. {what}"
        out.append({"name": name, "level": lvl, "text": txt, "tag": "Measured"})

    ratio_test("Climb slopes as steep as the target's", "slope_mean", 90, "°", "Too gentle to test climbing.")
    ratio_test("Wheel wear on rough ground", "rough", 90, "m", "Too smooth to wear wheels like the target.")
    ratio_test("Navigate across the target's relief", "relief4k", 50, "m", "Too flat to rehearse navigation over relief.")
    if radar["candidates"] and (radar["candidate_km2"] or 0) >= 0.1:
        out.append({"name": "Ground-penetrating radar under dry sand", "level": "field",
                    "text": f"Yes: {radar['candidates']} radar hotspot(s) pass all four checks ({radar['candidate_km2']} km²). Drive a GPR across them.",
                    "tag": "Measured"})
    elif radar["candidates"]:
        out.append({"name": "Ground-penetrating radar under dry sand", "level": "partial",
                    "text": f"Only {radar['candidates']} small hotspot(s) pass all checks ({radar['candidate_km2']} km²): little to aim at.",
                    "tag": "Measured"})
    else:
        out.append({"name": "Ground-penetrating radar under dry sand", "level": "partial" if radar["total"] else "no",
                    "text": "Radar works here, but no hotspot passed the checks: nothing to aim at yet.", "tag": "Measured"})
    swing = site["climate"]["daily_range_c"]
    rr = swing / env["day_swing_c"]
    out.append({"name": "Daily heating and cooling", "level": "partial" if rr >= 0.4 else "lab",
                "text": f"{swing:.0f} °C daily swing here vs about {env['day_swing_c']} °C on the target ({rr * 100:.0f} %): "
                        + ("start here, finish in a thermal chamber." if rr >= 0.4 else "needs a thermal-vacuum chamber."),
                "tag": "Measured"})
    return out


GENERIC_LAB = {
    "mars": [
        {"name": "Seals and habitat walls at 0.64 kPa", "level": "lab", "text": "No Earth site has Martian air pressure: test in a vacuum chamber.", "tag": "Reference"},
        {"name": "Wheel loads at 0.38 g", "level": "field", "text": "Use a lighter twin rover: 1,025 kg on Mars presses the ground like 390 kg on Earth (JPL's Scarecrow method).", "tag": "Reference"},
    ],
    "moon": [
        {"name": "Seals and electronics in vacuum", "level": "lab", "text": "Vacuum and lunar dust: test in a thermal-vacuum chamber with regolith simulant.", "tag": "Reference"},
        {"name": "Wheel loads at 0.17 g", "level": "field", "text": "Use a lighter twin rover: 1,025 kg on the Moon presses the ground like 169 kg on Earth.", "tag": "Reference"},
        {"name": "Driving with the Sun on the horizon", "level": "lab", "text": "Polar light (long shadows all day) can only be imitated: night drives with low lamps, or a lighting lab.", "tag": "Reference"},
    ],
}


# ------------------------------------------------------------------------------------------------
# 6. rover route through the best look-alike spots
# ------------------------------------------------------------------------------------------------
def rover_plan(site, tid, score):
    grid = site["grid_arr"]
    bounds = site["bounds"]
    passable = grid <= ROVER_LIMIT
    lab, n = ndi.label(passable)
    if n == 0:
        return None
    main = 1 + int(np.argmax(ndi.sum(passable, lab, range(1, n + 1))))
    mask = np.zeros((CELLS, CELLS), bool)
    for r in range(CELLS):
        for c in range(CELLS):
            gr, gc = latlon_to_cell(bounds, grid.shape[0], grid.shape[1], cell_center(bounds, CELLS, CELLS, r, c))
            mask[r, c] = lab[gr, gc] == main
    picked = []
    for min_km in (3.0, 1.5):
        picked = pick_spots(score, bounds, n=3, min_km=min_km, mask=mask)
        if len(picked) == 3:
            break
    if not picked:
        return None
    local = ndi.uniform_filter(np.where(passable, grid, 90.0), 3)
    best, best_cost = None, math.inf
    for gr in range(4, grid.shape[0] - 4, 2):
        for gc in range(4, grid.shape[1] - 4, 2):
            if lab[gr, gc] != main or local[gr, gc] > 6:
                continue
            ll = cell_center(bounds, grid.shape[0], grid.shape[1], gr, gc)
            d = [haversine_km(ll, q["coords"]) for q in picked]
            if min(d) < 1.5:
                continue
            cost = local[gr, gc] + 0.4 * min(d)
            if cost < best_cost:
                best, best_cost = (gr, gc, ll), cost
    if best is None:
        return None
    route, cur, rest = [], best[2], picked[:]
    while rest:
        nxt = min(rest, key=lambda q: haversine_km(cur, q["coords"]))
        route.append(nxt)
        rest.remove(nxt)
        cur = nxt["coords"]
    stops = [(best[0], best[1])] + [latlon_to_cell(bounds, grid.shape[0], grid.shape[1], q["coords"]) for q in route]
    km = 0.0
    for a, b in zip(stops, stops[1:]):
        path = astar(grid, ROVER_LIMIT, a, b)
        if not path:
            log(f"[rover] {tid}/{site['id']}: no route {a}->{b}")
            return None
        pts = [cell_center(bounds, grid.shape[0], grid.shape[1], r, c) for r, c in path]
        km += sum(haversine_km(p, q) for p, q in zip(pts, pts[1:]))
    tc = C.TARGETS[tid]
    wps = []
    for i, q in enumerate(route):
        wps.append({"id": f"WP-0{i + 1}", "coords": q["coords"], "title": f"Look-alike spot ({q['score']}/100)",
                    "inspect": tc["questions"][i], "tool": tc["tools"][i], "tag": "Hypothesis",
                    "why": f"One of the cells most like {tc['title']} that the rover can reach at ≤ {ROVER_LIMIT:.0f}°."})
    log(f"[rover] {tid:10s} {site['id']:8s} landing {best[2]}  route {km:.1f} km")
    return {"grid": site["grid"], "slope_limit_deg": ROVER_LIMIT, "landing": best[2], "waypoints": wps,
            "route_km_default": round(km, 1)}


# ------------------------------------------------------------------------------------------------
# main
# ------------------------------------------------------------------------------------------------
def main():
    OUT_REP = Path(os.environ.get("AMANAR_REPORT", HERE / "out"))
    OUT_REP.mkdir(exist_ok=True)
    log(f"compare.py  {datetime.now(timezone.utc).isoformat(timespec='minutes')}")
    sj, cj, sites = load_earth()
    targets = load_targets()
    for tid, t in targets.items():
        t["id"] = tid
    rng = feature_ranges(sites, targets)

    # radar checks (site level, used by every target)
    radar = {sid: hotspot_checks(s) for sid, s in sites.items()}

    # site images: slope in the shared colours
    for sid in sites:
        sl = np.asarray(Image.open(OV / f"{sid}_slope.png").convert("L")).astype("float64") / 255 * 30
        save_png(slope_rgb(sl), f"{sid}_slopec.png", colors=48)
    for tid, t in targets.items():
        save_png(slope_rgb(t["slope"]), f"target_{tid}_slope.png", colors=48)

    twins, twin_acc = twin_model(targets, sites)
    like_scores = {}
    ml_scores = {}
    out_targets = {}
    for tid in C.TARGET_ORDER:
        t, tc = targets[tid], C.TARGETS[tid]
        log(f"\n=== {tid}")
        stats = {k: {"median": r1(np.median(t["cells"][k])), "p10": r1(np.percentile(t["cells"][k], 10)),
                     "p90": r1(np.percentile(t["cells"][k], 90))} for k in T.KEYS}
        per_site = {}
        for sid, s in sites.items():
            score, per = match_score(s["cells"], t["cells"], T.KEYS, rng)
            per_site[sid] = {"score": round(score), "per": per}
        ranking = sorted(per_site, key=lambda k: -per_site[k]["score"])
        # robustness
        variants = []
        for name, keys, method, bins in VARIANTS:
            sc = {sid: round(match_score(s["cells"], t["cells"], keys, rng, method, bins)[0]) for sid, s in sites.items()}
            win = max(sc, key=sc.get)
            variants.append({"name": name, "scores": sc, "winner": win})
        wins = {sid: sum(1 for v in variants if v["winner"] == sid) for sid in sites}
        log("[match] " + "  ".join(f"{sid} {per_site[sid]['score']}" for sid in ranking)
            + f"   first place in variants: {wins}")
        zones = zone_analysis(tid, t, sites, rng)
        # look-alike maps + spots + best 4 km area + tests + rover
        sites_out = {}
        like_scores[tid] = []
        for sid in C.SITE_ORDER:
            s = sites[sid]
            lk = lookalike(s["cells"], t["cells"])
            like_scores[tid].extend(int(round(v)) for v in lk.ravel())
            a = np.clip((lk - 20) / 60, 0, 1)
            rgba = np.zeros((CELLS, CELLS, 4), "uint8")
            rgba[..., 0], rgba[..., 1], rgba[..., 2] = 72, 230, 214
            rgba[..., 3] = (a * 210).astype("uint8")
            rgba[:BORDER, :, 3] = rgba[-BORDER:, :, 3] = rgba[:, :BORDER, 3] = rgba[:, -BORDER:, 3] = 0
            save_png(np.asarray(Image.fromarray(rgba, "RGBA").resize((CELLS * 10, CELLS * 10), Image.NEAREST)),
                     f"{sid}_like_{tid}.png", "RGBA")
            spots = pick_spots(lk, s["bounds"])
            for i, sp in enumerate(spots):
                sp["id"] = f"S{i + 1}"
                sp["why"] = describe_spot(s["cells"], t["cells"], sp.pop("r"), sp.pop("c"))
            ba = best_subarea(s["cells"], t["cells"], rng)
            r0, c0 = ba[1], ba[2]
            (so, we), (no, ea) = s["bounds"]
            lat_hi = no - r0 * (no - so) / CELLS
            lat_lo = no - (r0 + 10) * (no - so) / CELLS
            lon_lo = we + c0 * (ea - we) / CELLS
            lon_hi = we + (c0 + 10) * (ea - we) / CELLS
            geo_level, geo_text, geo_src = tc["geology"][sid]
            b = band(per_site[sid]["score"])
            features = {}
            for k in T.KEYS:
                features[k] = {"overlap": round(per_site[sid]["per"][k] * 100),
                               "median": r1(np.median(s["cells"][k])), "p90": r1(np.percentile(s["cells"][k], 90))}
            sites_out[sid] = {
                "score": per_site[sid]["score"], "band": b, "features": features,
                "geology": {"level": geo_level, "text": geo_text, "source": geo_src},
                "label": label(b, geo_level),
                "best_area": {"score": round(ba[0]), "bounds": [[round(lat_lo, 4), round(lon_lo, 4)], [round(lat_hi, 4), round(lon_hi, 4)]]},
                "spots": spots,
                "tests": tests_for(s, t, radar[sid]),
                "rover": rover_plan(s, tid, lk),
            }
            log(f"   {sid:8s} score {per_site[sid]['score']:3d} ({b}), geology {geo_level:7s} -> {sites_out[sid]['label']}; "
                f"best 4 km area {round(ba[0])}; top spot {spots[0]['score'] if spots else '-'}")
        # picks per use
        driving = ranking[0]
        geo_rank = {"match": 2, "partial": 1, "no": 0}
        rocks = max(C.SITE_ORDER, key=lambda k: (geo_rank[tc["geology"][k][0]], per_site[k]["score"]))
        rocks_full = tc["geology"][rocks][0] == "match"
        rad = max(C.SITE_ORDER, key=lambda k: (radar[k]["candidate_km2"] or 0, radar[k]["candidates"]))
        tw = twins[tid]
        tw_img = twin_image(tid, t, tw["label_map"])
        ml_scores[tid] = [int(round(v)) for v in tw["earth_score"]]
        words = tc["zone_words"]
        present = sorted([sid for sid in C.SITE_ORDER if tw["share"][sid] >= 15],
                         key=lambda sid: tw["slope_of"][sid])
        keys_ = {1: ["all"], 2: ["gentle", "steep"], 3: ["gentle", "middle", "steep"]}[max(1, len(present))]
        tw_parts = [{"site": sid, "ground": words[k], "share": tw["share"][sid]} for sid, k in zip(present, keys_)]
        top_twin = max(C.SITE_ORDER, key=lambda sid: tw["share"][sid])
        split = tw["share"][top_twin] < 60 and len(tw_parts) > 1
        drive_why = (f"Highest terrain overlap score over the main {t['meta']['size_km'][0]:.0f} km window ({per_site[driving]['score']}/100); "
                     f"the twin model finds its closest twins for {tw['share'][driving]}% of the whole map.")
        if split:
            drive_why += " " + "; ".join(f"{C.SITES[p['site']]['name']} for {p['ground']}" for p in tw_parts) + "."
        picks = {
            "driving": {"site": driving, "why": drive_why},
            "rocks": {"site": rocks, "why": tc["geology"][rocks][1] + ("" if rocks_full else " (No site fully matches the target's geology.)")},
            "radar": {"site": rad if radar[rad]["candidates"] else None,
                      "why": (f"{radar[rad]['candidates']} radar anomalies pass all four checks ({radar[rad]['candidate_km2']} km²): unverified candidates for a GPR survey." if radar[rad]["candidates"]
                              else "No radar anomaly passed the checks at any site.")},
        }
        name = {k: C.SITES[k]["name"] for k in C.SITE_ORDER}
        if split:
            zone_txt = "; ".join(f"{p['ground']} → {name[p['site']]}" for p in tw_parts)
            rock_txt = (f" Geology (literature): {name[rocks]} matches the processes." if rocks_full
                        else f" Geology (literature): no full match; {name[rocks]} comes closest." if tc["geology"][rocks][0] == "partial"
                        else " Geology (literature): no site matches.")
            headline = f"It depends on the part of {tc['in_text']}: {zone_txt}.{rock_txt}"
        elif top_twin != driving:
            headline = (f"Highest terrain overlap: {name[driving]}; closest twins for most of the map: {name[top_twin]} "
                        f"({tw['share'][top_twin]}%).")
        elif driving == rocks and rocks_full:
            headline = f"Best of the three: {name[driving]}, with the highest terrain overlap and matching geology (literature)."
        elif rocks_full:
            headline = f"No single site does everything: drive at {name[driving]}, study geology at {name[rocks]}."
        elif tc["geology"][rocks][0] == "partial":
            headline = (f"Highest terrain overlap: {name[driving]}. No site fully matches the target's geology (literature); "
                        f"{name[rocks]} comes closest.")
        else:
            headline = f"Highest terrain overlap: {name[driving]}. None of our sites matches the target's geology, so this is a terrain-only analog."
        if not split and top_twin == driving:
            headline += f" The twin model agrees: {name[top_twin]} holds the closest twins for {tw['share'][top_twin]}% of the map."
        log("[picks] " + headline)
        out_targets[tid] = {
            "id": tid, "title": tc["title"], "short": tc["short"], "body": tc["body"], "mission": tc["mission"],
            "goal": tc["goal"], "why": tc["why"], "rocks": tc["rocks"], "tiles": tc["tiles"],
            "zone_context": tc.get("zone_context", ""),
            "map_center": tc["map_center"], "zoom": tc["zoom"], "delay": tc["delay"],
            "dem": {k: t["meta"].get(k) for k in ("product", "product_url", "copy_url", "res_m", "size_km", "center",
                                                     "where", "check_vs_mola", "check_slope", "elev_min_m", "elev_max_m",
                                                     "bounds_deg", "full_size_km")}
                   | {"slope_image": f"/overlays/target_{tid}_slope.png", "source": {"jezero": "ctx_jezero", "gale": "mmgis_gale",
                                                                                     "moon_south": "lola_adc"}[tid]},
            "stats": stats, "ranking": ranking,
            "robustness": {"variants": variants, "wins": wins, "n": len(variants), "zones": zones},
            "twins": {"share": tw["share"], "parts": tw_parts, "image": tw_img, "k": TWIN_K,
                      "stability": tw["stability"], "max_change": tw["max_change"],
                      "site_recognition": round(twin_acc * 100), "colors": {k: "#%02x%02x%02x" % v for k, v in SITE_RGB.items()},
                      "area_km": zones["area_km"]},
            "sites": sites_out, "picks": picks, "headline": headline,
            "breaks": C.BREAKS[tc["body"]], "lab_tests": GENERIC_LAB[tc["body"]],
            "tools": tc["tools"],
        }

    # sites block
    out_sites = {}
    for sid in C.SITE_ORDER:
        s = sites[sid]
        cl = s["climate"]
        layers = dict(s["layers"])
        layers["slope_color"] = f"/overlays/{sid}_slopec.png"
        layers["like"] = {tid: f"/overlays/{sid}_like_{tid}.png" for tid in C.TARGET_ORDER}
        out_sites[sid] = {
            "id": sid, "name": C.SITES[sid]["name"], "bounds": s["bounds"], "layers": layers,
            "metrics": s["metrics"],
            "conditions": {"monthly_tmax_c": cl["monthly_tmax_c"], "monthly_tmin_c": cl["monthly_tmin_c"],
                           "rain_mm_year": cl["rain_mm_year"], "daily_range_c": cl["daily_range_c"],
                           "elevation_m": s["metrics"]["elev"], "air_pressure_kpa": s["air_pressure_kpa"],
                           "hub": s["hub"], "assumptions": {"heat_c": 40, "slope_deg": ROVER_LIMIT, "hub_km": 250},
                           "source": "nasa_power"},
            "radar": radar[sid],
            "grid": s["grid"],
        }

    m = sj["surprise_model"]
    data = {
        "meta": {
            "version": 2, "mock": False, "generated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
            "sources": C.SOURCES, "tags": C.TAGS, "cell_size_m": 400, "border_cells": BORDER,
            "features": [{"key": k, "label": lab, "unit": u, "scale": sc} for k, lab, u, sc in T.FEATURES],
            "match_bands": [{"min": lim, "name": nm} for lim, nm in C.MATCH_BANDS],
            "radar_model": {
                "type": m["type"], "target": m["target"], "predictors": m["predictor_labels"],
                "r2_by_site": m["r2_block_cv_by_site"], "r2_leave_one_site_out": m["r2_leave_one_site_out"],
                "importance": m["importance"][:5], "residual_scale_db": m["residual_scale_db"], "hotspot_z": m["hotspot_z"],
                "note": "R² is reported inside each site (spatial-block cross-validation). A pooled R² over the three "
                        "sites is higher only because the sites differ so much; we do not use it. The model fails on an unseen "
                        "site (Ahnet), so hotspots are compared inside each site only.",
            },
            "hotspot_rules": C.HOTSPOT_RULES,
            "env": C.ENV,
        },
        "targets": out_targets, "target_order": C.TARGET_ORDER,
        "sites": out_sites, "site_order": C.SITE_ORDER,
    }
    (PUB / "mission_data.json").write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    (PUB / "ml" / "lookalike.json").write_text(json.dumps({
        "rows": CELLS, "cols": CELLS, "border": BORDER,
        "sites": [{"id": sid, "bounds": sites[sid]["bounds"], "start": i * CELLS * CELLS} for i, sid in enumerate(C.SITE_ORDER)],
        "scores": like_scores, "twins": ml_scores,
        "slope_p90": [round(float(v), 1) for sid in C.SITE_ORDER for v in sites[sid]["cells"]["slope_p90"].ravel()],
        "radar": radar_cells(sites, radar)}, separators=(",", ":")), encoding="utf-8")
    # the twin model, ready to run in the browser (src/lib/twins.ts reproduces the predictions; a test checks it)
    ex = twins["_export"]
    q = lambda Z: [int(v) for v in np.round(np.asarray(Z) * 100).astype(int).ravel()]
    ec = {sid: sites[sid]["cells"] for sid in C.SITE_ORDER}
    model = {
        "version": 1, "k": TWIN_K, "features": T.KEYS, "scale": 100, "trim": 1,
        "mu": [round(float(v), 6) for v in ex["mu"]], "sd": [round(float(v), 6) for v in ex["sd"]],
        "threshold": round(ex["thr"], 4), "site_order": C.SITE_ORDER, "site_recognition": round(twin_acc * 100),
        "earth": {
            "rows": CELLS, "cols": CELLS, "border": BORDER, "cell_m": T.CELL_M,
            "sites": [{"id": sid, "bounds": sites[sid]["bounds"], "start": i * CELLS * CELLS}
                      for i, sid in enumerate(C.SITE_ORDER)],
            "z": q(ex["Ze"]),
            "slope_p90": [round(float(v), 1) for sid in C.SITE_ORDER for v in ec[sid]["slope_p90"].ravel()],
            "rough": [round(float(v), 2) for sid in C.SITE_ORDER for v in ec[sid]["rough"].ravel()],
            "elev": [int(round(float(v))) for sid in C.SITE_ORDER for v in ec[sid]["elev"].ravel()],
            "radar": radar_cells(sites, radar),
        },
        "targets": {},
    }
    for tid, t in targets.items():
        e = twins[tid]["export"]
        R, Cc = e["shape"]
        cp = int(round(T.CELL_M / t["res"]))
        H, W = t["all_slope"].shape
        model["targets"][tid] = {
            "rows": int(R), "cols": int(Cc), "cell_px": cp, "px": [int(H), int(W)],
            "window": [int(v) for v in t["win_cells"]], "image": f"/overlays/target_{tid}_twins.png",
            "z": q(e["Z"]), "pred": [int(v) for v in e["pred"].ravel()],
        }
    (PUB / "ml" / "twins.json").write_text(json.dumps(model, separators=(",", ":")), encoding="utf-8")
    (OUT_REP / "compare_report.txt").write_text("\n".join(REPORT) + "\n", encoding="utf-8")
    log("\nWrote public/mission_data.json, public/ml/lookalike.json, overlays; report in pipeline/out/compare_report.txt")


if __name__ == "__main__":
    main()
