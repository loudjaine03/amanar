"""02_metrics.py : stack GeoTIFF (7 bandes) -> PNG overlays + chiffres, pour UN site.

Usage (depuis la racine du projet) :
    python pipeline/02_metrics.py ahnet                       # lit pipeline/data/ahnet_stack.tif
    python pipeline/02_metrics.py ahnet chemin/vers/stack.tif

Sorties :
    public/overlays/{site}_{optical,lband,cband,slope,anomalies,classes}.png   (800 x 800, EPSG:4326, aux bornes du site)
    pipeline/out/{site}_metrics.json     (chiffres, légendes, candidats d'anomalies)
    pipeline/out/{site}_slope.npy        (pente en degrés, pour 03_route_safety.py)

Bandes : 1 L_HH, 2 L_HV, 3 C_VV, 4 B4 (rouge), 5 B3 (vert), 6 B2 (bleu), 7 DEM.
Les anomalies radar-optique sont des CANDIDATS (Interpreted), jamais "un fleuve enterré".
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from scipy import ndimage as ndi
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
OUT_PNG = ROOT / "public" / "overlays"
OUT_JSON = ROOT / "pipeline" / "out"
SIZE = 800
STEEP_DEG = 15.0
MIN_BLOB_PX = 20
CLASS_COLOURS = [(66, 135, 245), (245, 166, 35), (126, 211, 33)]  # class 1, 2, 3
ANOMALY_COLOUR = (220, 38, 38)


def to_leaflet_bounds(west, south, east, north):
    """rasterio donne (west, south, east, north) ; Leaflet veut [[south, west], [north, east]]. Convertir ICI, une seule fois."""
    return [[south, west], [north, east]]


def stretch(a, lo=2, hi=98):
    """Étire entre les percentiles 2 et 98 (même règle pour tous les sites). Retourne (0..1, masque valide, (p_lo, p_hi))."""
    valid = np.isfinite(a)
    p_lo, p_hi = np.percentile(a[valid], [lo, hi])
    out = np.clip((a - p_lo) / (p_hi - p_lo + 1e-9), 0, 1)
    return np.where(valid, out, 0.0), valid, (float(p_lo), float(p_hi))


def save_png(rgb, alpha, path, nearest=False):
    """rgb: (h,w,3) uint8 ; alpha: (h,w) bool (transparent là où il n'y a pas de donnée)."""
    img = Image.fromarray(np.dstack([rgb, alpha.astype(np.uint8) * 255]), "RGBA")
    if img.size != (SIZE, SIZE):
        img = img.resize((SIZE, SIZE), Image.NEAREST if nearest else Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def edges(a, valid):
    a = ndi.gaussian_filter(np.where(valid, a, 0.0), 1.5)
    return np.hypot(ndi.sobel(a, 0), ndi.sobel(a, 1))


def process(site: str, tif: Path, out_png=OUT_PNG, out_json=OUT_JSON):
    with rasterio.open(tif) as src:
        if src.count != 7:
            raise SystemExit(f"{tif}: attendu 7 bandes, trouvé {src.count} (voir 01_export_stack.js)")
        bands = [src.read(i, masked=True).astype("float32").filled(np.nan) for i in range(1, 8)]
        L, _hv, C, R, G, B, dem = bands
        west, south, east, north = src.bounds
        res_x, res_y = src.res
    rows, cols = dem.shape
    bounds = to_leaflet_bounds(west, south, east, north)
    lat0 = np.radians((south + north) / 2)
    m_per_px_y, m_per_px_x = res_y * 110540, res_x * 111320 * np.cos(lat0)

    # ---- Pente et chiffres du terrain (Copernicus DEM)
    gy, gx = np.gradient(dem, m_per_px_y, m_per_px_x)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    sv = np.isfinite(slope)
    valid_all = np.isfinite(dem) & np.isfinite(L) & np.isfinite(C) & np.isfinite(R + G + B)
    metrics = {
        "mean_slope_deg": float(np.nanmean(slope)),
        "relief_m": float(np.nanpercentile(dem, 95) - np.nanpercentile(dem, 5)),
        "steep_share_pct": float((slope[sv] > STEEP_DEG).mean() * 100),
        "slope_std_deg": float(np.nanstd(slope)),
    }

    # ---- Anomalies radar-optique : bords L-band forts (top 10 %) ET bords optiques faibles (< médiane)
    bright = (R + G + B) / 3
    eL, eO = edges(L, valid_all), edges(bright, valid_all)
    anom = (eL > np.percentile(eL[valid_all], 90)) & (eO < np.median(eO[valid_all])) & valid_all
    lab, n = ndi.label(anom)
    sizes = ndi.sum(anom, lab, range(1, n + 1)) if n else np.array([])
    keep = 1 + np.flatnonzero(sizes >= MIN_BLOB_PX)
    anom = np.isin(lab, keep)
    metrics["anomaly_pct"] = float(anom.mean() * 100)

    px_km2 = (m_per_px_y * m_per_px_x) / 1e6
    lab2, n2 = ndi.label(anom)
    blobs = []
    for k in range(1, n2 + 1):
        rr, cc = np.nonzero(lab2 == k)
        blobs.append((len(rr), float(rr.mean()), float(cc.mean())))
    blobs.sort(reverse=True)
    candidates = [
        {
            "id": f"A{i + 1}",
            "coords": [round(north - (r + 0.5) * (north - south) / rows, 5), round(west + (c + 0.5) * (east - west) / cols, 5)],
            "pixels": int(sz),
            "area_km2": round(sz * px_km2, 3),
            "tag": "Interpreted",
        }
        for i, (sz, r, c) in enumerate(blobs[:5])
    ]

    # ---- Classes de terrain : K-Means, 3 groupes, sur pente + L-band + C-band + luminosité optique
    feats = np.column_stack([slope[valid_all & sv], L[valid_all & sv], C[valid_all & sv], bright[valid_all & sv]])
    rng = np.random.default_rng(0)
    pick = rng.choice(len(feats), size=min(50_000, len(feats)), replace=False)
    scaler = StandardScaler().fit(feats[pick])  # les 4 grandeurs n'ont pas la même échelle
    km = KMeans(n_clusters=3, n_init=10, random_state=0).fit(scaler.transform(feats[pick]))
    order = np.argsort(km.cluster_centers_[:, 3])  # classes numérotées de façon stable (luminosité croissante)
    rank = np.empty(3, int)
    rank[order] = np.arange(3)
    labels = rank[km.predict(scaler.transform(feats))]
    cls = np.full((rows, cols), -1)
    cls[valid_all & sv] = labels

    # ---- PNG
    legends = {}
    gray_layers = {"lband": (L, "L-band HH backscatter (dB)"), "cband": (C, "C-band VV backscatter (dB)"), "slope": (slope, "Slope (degrees)")}
    for name, (arr, label) in gray_layers.items():
        s, ok, (p_lo, p_hi) = stretch(arr)
        g = (s * 255).astype(np.uint8)
        save_png(np.dstack([g, g, g]), ok, out_png / f"{site}_{name}.png")
        legends[name] = {"label": label, "black": round(p_lo, 2), "white": round(p_hi, 2), "stretch": "2nd-98th percentile"}
    rgb = np.dstack([stretch(x)[0] for x in (R, G, B)])
    save_png((rgb * 255).astype(np.uint8), np.isfinite(R + G + B), out_png / f"{site}_optical.png")
    legends["optical"] = {"label": "Sentinel-2 true colour (B4-B3-B2), cloud-filtered median", "stretch": "2nd-98th percentile per band"}

    red = np.zeros((rows, cols, 3), np.uint8)
    red[anom] = ANOMALY_COLOUR
    save_png(red, anom, out_png / f"{site}_anomalies.png", nearest=True)
    legends["anomalies"] = {"label": "Radar-optical contrast anomalies (candidate areas, not confirmed structures)", "red": "L-band edge in top 10% AND optical edge below median", "min_blob_pixels": MIN_BLOB_PX}

    colour = np.zeros((rows, cols, 3), np.uint8)
    for k in range(3):
        colour[cls == k] = CLASS_COLOURS[k]
    save_png(colour, cls >= 0, out_png / f"{site}_classes.png", nearest=True)
    class_info = []
    for k in range(3):
        sel = labels == k
        class_info.append({
            "name": f"class {k + 1}", "rgb": list(CLASS_COLOURS[k]), "share_pct": round(float(sel.mean() * 100), 1),
            "mean_slope_deg": round(float(feats[sel, 0].mean()), 2), "mean_lband_db": round(float(feats[sel, 1].mean()), 2),
            "mean_cband_db": round(float(feats[sel, 2].mean()), 2), "mean_optical_brightness": round(float(feats[sel, 3].mean()), 1),
        })
    legends["classes"] = {"label": "K-Means terrain classes (unnamed until interpreted; any later name is Interpreted)", "classes": class_info}

    result = {
        "site": site, "bounds": bounds, "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "source_file": tif.name, "grid_shape": [rows, cols],
        "metrics": {k: round(v, 3) for k, v in metrics.items()},
        "anomaly_candidates": candidates, "legends": legends,
        "note": "Measured = computed from the stack. Anomalies and classes are Interpreted: candidates, not confirmed structures.",
    }
    out_json.mkdir(parents=True, exist_ok=True)
    (out_json / f"{site}_metrics.json").write_text(json.dumps(result, indent=2))
    np.save(out_json / f"{site}_slope.npy", slope.astype("float32"))
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    site_arg = sys.argv[1]
    tif_arg = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "pipeline" / "data" / f"{site_arg}_stack.tif"
    r = process(site_arg, tif_arg)
    print(json.dumps({"site": site_arg, "bounds": r["bounds"], **r["metrics"], "anomaly_candidates": len(r["anomaly_candidates"])}, indent=2))
    print(f"PNG -> {OUT_PNG}   JSON -> {OUT_JSON}. Ouvre chaque PNG sur la carte avant de le livrer (position, orientation, légende).")
