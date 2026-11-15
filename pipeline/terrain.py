"""
terrain.py  --  shared terrain measures (Team Hoggar / Amanar)

The SAME definitions are used for the Earth sites (Copernicus DEM, in build_all.py) and for the
Mars / Moon elevation windows (compare.py), so the comparison is like for like.

Per 400 m cell:
  slope_mean  mean slope of the native-resolution DEM in the cell (deg)
  steep       share of the cell steeper than 15 deg (%)
  rough       local height variation: standard deviation of height in a ~125 m window (m)
  relief      highest minus lowest point in a ~1 km window (m)
  slope400    slope between neighbouring 400 m cells (deg): landscape scale, insensitive to DEM resolution
  relief4k    highest minus lowest 400 m cell in a 4 km window (m): landscape scale
"""
import numpy as np
from scipy import ndimage as ndi

STEEP = 15.0
CELL_M = 400.0
FEATURES = [
    # key, label, unit, scale
    ("slope_mean", "Mean slope", "°", "fine"),
    ("steep", "Ground steeper than 15°", "% of area", "fine"),
    ("rough", "Roughness (height variation over 125 m)", "m", "fine"),
    ("relief", "Relief within 1 km", "m", "fine"),
    ("slope400", "Slope over 400 m", "°", "landscape"),
    ("relief4k", "Relief within 4 km", "m", "landscape"),
]
KEYS = [f[0] for f in FEATURES]


def local_std(x, size):
    m = ndi.uniform_filter(x, size)
    m2 = ndi.uniform_filter(x * x, size)
    return np.sqrt(np.maximum(m2 - m * m, 0))


def edges(n, k):
    return np.linspace(0, n, k + 1).round().astype(int)


def cells_from_dem(dem, res_y, res_x=None):
    """Per-cell measures from a DEM (2-D array, row 0 = north) with pixel size in metres."""
    res_x = res_x or res_y
    dem = dem.astype("float64")
    if np.isnan(dem).any():
        dem = np.where(np.isnan(dem), np.nanmedian(dem), dem)
    gy, gx = np.gradient(dem, res_y, res_x)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    px = 0.5 * (res_x + res_y)
    rough = local_std(dem, max(3, int(round(125 / px)) | 1))
    k = max(5, int(round(1000 / px)) | 1)
    relief = ndi.maximum_filter(dem, k) - ndi.minimum_filter(dem, k)
    rows = max(1, int(round(dem.shape[0] * res_y / CELL_M)))
    cols = max(1, int(round(dem.shape[1] * res_x / CELL_M)))
    re, ce = edges(dem.shape[0], rows), edges(dem.shape[1], cols)
    out = {k: np.zeros((rows, cols)) for k in ("slope_mean", "slope_p90", "steep", "rough", "relief", "elev")}
    for r in range(rows):
        for c in range(cols):
            sl = (slice(re[r], re[r + 1]), slice(ce[c], ce[c + 1]))
            s = slope[sl]
            out["slope_mean"][r, c] = s.mean()
            out["slope_p90"][r, c] = np.percentile(s, 90)
            out["steep"][r, c] = (s > STEEP).mean() * 100
            out["rough"][r, c] = rough[sl].mean()
            out["relief"][r, c] = relief[sl].mean()
            out["elev"][r, c] = dem[sl].mean()
    add_landscape(out)
    return out, slope


def add_landscape(cells):
    """slope400 and relief4k from the 400 m cell elevations (same for Earth and planets)."""
    e = cells["elev"]
    gy, gx = np.gradient(e, CELL_M)
    cells["slope400"] = np.degrees(np.arctan(np.hypot(gx, gy)))
    cells["relief4k"] = ndi.maximum_filter(e, 10) - ndi.minimum_filter(e, 10)
    return cells


# ------------------------------------------------------------------------------------------------
# comparing two sets of cells
# ------------------------------------------------------------------------------------------------
def tf(x):
    return np.log1p(np.maximum(np.asarray(x, "float64"), 0))


def overlap(a, b, lo, hi, bins=30):
    """Share of two distributions that overlaps (0 = none, 1 = identical), on log1p values."""
    ha, _ = np.histogram(tf(a), bins=bins, range=(lo, hi))
    hb, _ = np.histogram(tf(b), bins=bins, range=(lo, hi))
    ha = ha / max(ha.sum(), 1)
    hb = hb / max(hb.sum(), 1)
    return float(np.minimum(ha, hb).sum())


def wasserstein_match(a, b, scale):
    qa = np.quantile(tf(a), np.linspace(0.01, 0.99, 99))
    qb = np.quantile(tf(b), np.linspace(0.01, 0.99, 99))
    return float(np.exp(-np.mean(np.abs(qa - qb)) / max(scale, 1e-9)))


def typicality(values, target_values):
    """How typical each value is of the target: 1 at the target's median, 0 outside its range."""
    t = np.sort(np.asarray(target_values, "float64").ravel())
    p = np.searchsorted(t, np.asarray(values, "float64"), side="right") / len(t)
    return 1 - np.abs(2 * p - 1)
