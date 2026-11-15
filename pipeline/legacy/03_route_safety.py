"""03_route_safety.py : grille de pente du rover + climat NASA POWER + distance au hub, pour UN site.

Usage (depuis la racine du projet, après 02_metrics.py) :
    python pipeline/03_route_safety.py ahnet
    python pipeline/03_route_safety.py ahnet --skip-power      # sans internet : seulement la grille

Sorties :
    public/grids/{site}_slope.json     (160 x 160, degrés, ligne 0 = bord nord ; PAS de champ "mock")
    pipeline/out/{site}_climate.json   (Tmax par mois, pluie par an, distance au hub)
"""
import json
import sys
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "pipeline" / "out"
GRID_DIR = ROOT / "public" / "grids"
N = 160
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def make_grid(slope: np.ndarray) -> np.ndarray:
    """Découpe en blocs et garde le 90e percentile de chaque bloc (prudent) -> 160 x 160 cellules."""
    block = min(slope.shape) // N
    if block < 1:
        raise SystemExit(f"Pente trop petite ({slope.shape}) pour une grille {N}x{N}")
    s = slope[: N * block, : N * block]
    g = np.nanpercentile(s.reshape(N, block, N, block), 90, axis=(1, 3))
    return np.where(np.isfinite(g), g, 90.0)  # pas de donnée = infranchissable


def km(a, b):
    la1, lo1, la2, lo2 = map(radians, (*a, *b))
    return 2 * 6371 * asin(sqrt(sin((la2 - la1) / 2) ** 2 + cos(la1) * cos(la2) * sin((lo2 - lo1) / 2) ** 2))


def fetch_power(lat, lon):
    """NASA POWER, climatologie mensuelle (pas de clé). Lève une erreur si une valeur manque."""
    import requests

    url = ("https://power.larc.nasa.gov/api/temporal/climatology/point"
           f"?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR&community=RE&longitude={lon}&latitude={lat}&format=JSON")
    p = requests.get(url, timeout=60).json()["properties"]["parameter"]
    tmax = [p["T2M_MAX"][m] for m in MONTHS]
    tmin = [p["T2M_MIN"][m] for m in MONTHS]
    rain = p["PRECTOTCORR"]["ANN"] * 365  # PRECTOTCORR est en mm/jour
    if any(v is None or v <= -900 for v in tmax + tmin + [rain]):
        raise ValueError("NASA POWER a renvoyé des valeurs manquantes (-999)")
    return {"tmax_c": [round(v, 1) for v in tmax], "tmin_c": [round(v, 1) for v in tmin], "rain_mm_year": round(rain, 1)}


def process(site: str, skip_power=False, root=ROOT):
    out_json, grid_dir = root / "pipeline" / "out", root / "public" / "grids"
    metrics = json.loads((out_json / f"{site}_metrics.json").read_text())
    (south, west), (north, east) = metrics["bounds"]
    grid = make_grid(np.load(out_json / f"{site}_slope.npy"))
    grid_dir.mkdir(parents=True, exist_ok=True)
    (grid_dir / f"{site}_slope.json").write_text(json.dumps({
        "cols": N, "rows": N, "bounds": metrics["bounds"], "maxSlope": 15,
        "slope": [round(float(v), 1) for v in grid.ravel()],
    }))
    centre = ((south + north) / 2, (west + east) / 2)
    data = json.loads((root / "public" / "mission_data.json").read_text())
    cand = next(c for c in data["scenarios"]["mars_water"]["candidates"] if c["id"] == site)
    hub = cand["earth_field_safety"]["nearest_hub"]
    climate = {"site": site, "centre": [round(centre[0], 4), round(centre[1], 4)], "hub": hub["name"], "hub_coords": hub["coords"],
               "hub_distance_km": round(km(centre, hub["coords"]), 1), "hub_note": "great-circle, approximate; not road access"}
    if not skip_power:
        climate.update(fetch_power(*centre))
    out_json.mkdir(parents=True, exist_ok=True)
    (out_json / f"{site}_climate.json").write_text(json.dumps(climate, indent=2))
    return grid, climate


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    g, c = process(sys.argv[1], skip_power="--skip-power" in sys.argv)
    print(f"Grille {N}x{N}: pente moyenne {g.mean():.1f}°, max {g.max():.1f}°, {(g > 15).mean() * 100:.1f}% des cellules > 15°")
    print(json.dumps(c, indent=2))
