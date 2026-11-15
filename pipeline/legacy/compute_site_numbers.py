"""
compute_site_numbers.py  --  Team Hoggar / Algeria Beyond Earth

Input : one Earth Engine stack per site, named <site>_stack.tif, in the same folder.
        Band order (from the Earth Engine export script):
        1 L_HH  2 L_HV  3 C_VV  4 B4(red)  5 B3(green)  6 B2(blue)  7 DEM
Output: site_numbers.json            -> the 4 numbers per site for score_and_merge.py
        overlays/<site>_<layer>.png  -> optical, lband, cband, slope, anomalies, classes
        grids/<site>_slope.json      -> 160 x 160 slope grid for the rover (A* in the browser)

Run   : pip install rasterio numpy scipy scikit-learn pillow
        python compute_site_numbers.py            (all sites found in the folder)
        python compute_site_numbers.py ahnet      (one site)
"""
import json, sys, glob, os
import numpy as np
import rasterio
from scipy import ndimage as ndi
from PIL import Image

STEEP_DEG = 15          # team assumption, same as the app's default slope limit
GRID = 160              # rover grid size (cells per side)


def stretch(a, lo=2, hi=98):
    """2-98 percentile stretch to 0..255 (same rule for every site)."""
    a = a.astype("float32")
    valid = np.isfinite(a)
    if not valid.any():
        return np.zeros(a.shape, "uint8")
    p1, p2 = np.nanpercentile(a[valid], [lo, hi])
    out = np.clip((a - p1) / max(p2 - p1, 1e-6), 0, 1)
    out[~valid] = 0
    return (out * 255).astype("uint8")


def edges(a):
    a = ndi.gaussian_filter(np.nan_to_num(a.astype("float32")), 1.5)
    return np.hypot(ndi.sobel(a, 0), ndi.sobel(a, 1))


def process(site):
    with rasterio.open(f"{site}_stack.tif") as src:
        bands = [src.read(i).astype("float32") for i in range(1, 8)]
        L, LHV, C, R, G, B, dem = bands
        west, south, east, north = src.bounds
        deg_x, deg_y = src.res
        nodata = src.nodata
    if nodata is not None:
        for b in bands:
            b[b == nodata] = np.nan

    # --- terrain (Measured, Copernicus DEM) ---------------------------------
    lat = np.radians((south + north) / 2)
    dy, dx = deg_y * 110540, deg_x * 111320 * np.cos(lat)        # metres per pixel
    gy, gx = np.gradient(np.nan_to_num(dem, nan=np.nanmean(dem)), dy, dx)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    slope[~np.isfinite(dem)] = np.nan
    mean_slope = float(np.nanmean(slope))
    relief = float(np.nanpercentile(dem, 95) - np.nanpercentile(dem, 5))
    steep_share = float(np.nanmean(slope > STEEP_DEG) * 100)

    # --- radar-optical contrast anomalies (Measured %, Interpreted meaning) --
    eL, eO = edges(L), edges((R + G + B) / 3)
    anom = (eL > np.nanpercentile(eL, 90)) & (eO < np.nanmedian(eO))
    lab, n = ndi.label(anom)
    if n:
        sizes = ndi.sum(anom, lab, range(1, n + 1))
        anom = np.isin(lab, 1 + np.flatnonzero(sizes >= 20))
    anomalies = float(anom.mean() * 100)

    # --- PNG overlays (EPSG:4326, exact bounds of the stack) -----------------
    os.makedirs("overlays", exist_ok=True)
    rgb = np.dstack([stretch(R), stretch(G), stretch(B)])
    Image.fromarray(rgb).save(f"overlays/{site}_optical.png")
    Image.fromarray(stretch(L)).save(f"overlays/{site}_lband.png")
    Image.fromarray(stretch(C)).save(f"overlays/{site}_cband.png")
    s8 = (np.clip(np.nan_to_num(slope) / 30, 0, 1) * 255).astype("uint8")   # 0..30 deg
    Image.fromarray(s8).save(f"overlays/{site}_slope.png")
    rgba = np.zeros(anom.shape + (4,), "uint8")
    rgba[anom] = (226, 75, 74, 230)                                          # red, transparent elsewhere
    Image.fromarray(rgba, "RGBA").save(f"overlays/{site}_anomalies.png")

    # --- optional terrain classes (K-Means, names stay neutral) --------------
    try:
        from sklearn.cluster import KMeans
        feats = np.stack([np.nan_to_num(x) for x in (slope, L, C, (R + G + B) / 3)], -1).reshape(-1, 4)
        feats = (feats - feats.mean(0)) / (feats.std(0) + 1e-6)
        rng = np.random.default_rng(0)
        sample = feats[rng.choice(len(feats), min(50000, len(feats)), replace=False)]
        km = KMeans(n_clusters=3, n_init=5, random_state=0).fit(sample)
        cls = km.predict(feats).reshape(slope.shape)
        colours = np.array([(29, 158, 117, 170), (239, 159, 39, 170), (127, 119, 221, 170)], "uint8")
        Image.fromarray(colours[cls], "RGBA").save(f"overlays/{site}_classes.png")
    except Exception as e:                                                   # never block the numbers
        print(f"  [{site}] classes skipped: {e}")

    # --- rover slope grid (90th percentile per block, conservative) ----------
    os.makedirs("grids", exist_ok=True)
    h, w = slope.shape
    bh, bw = h // GRID, w // GRID
    if bh >= 1 and bw >= 1:
        cut = np.nan_to_num(slope[: bh * GRID, : bw * GRID], nan=90.0)
        grid = np.percentile(cut.reshape(GRID, bh, GRID, bw), 90, axis=(1, 3))
        json.dump({"cols": GRID, "rows": GRID,
                   "bounds": [[round(south, 5), round(west, 5)], [round(north, 5), round(east, 5)]],
                   "maxSlope": STEEP_DEG,
                   "slope": [round(float(v), 1) for v in grid.ravel()]},
                  open(f"grids/{site}_slope.json", "w"))

    return {"mean_slope": round(mean_slope, 2), "relief": round(relief, 1),
            "steep_share": round(steep_share, 2), "anomalies": round(anomalies, 2),
            "bounds": [[round(south, 5), round(west, 5)], [round(north, 5), round(east, 5)]]}


if __name__ == "__main__":
    sites = sys.argv[1:] or sorted(p[:-len("_stack.tif")] for p in glob.glob("*_stack.tif"))
    if not sites:
        sys.exit("No <site>_stack.tif files found in this folder.")
    out = {}
    for s in sites:
        print(f"Processing {s} ...")
        out[s] = process(s)
        print("  ", out[s])
    json.dump(out, open("site_numbers.json", "w"), indent=2)
    print("\nWrote site_numbers.json, overlays/*.png, grids/*_slope.json")
    print("Check: open each PNG on the map and make sure it lines up before handing it over.")