"""
prepare_targets.py  --  Team Hoggar / Amanar

Cuts one elevation window per planetary target from real NASA / USGS elevation products and
saves it as a small file the comparison script reads (pipeline/planetary/<target>.npz).
Run it once; the .npz files are committed so the rest of the pipeline runs offline.

    python pipeline/planetary/prepare_targets.py --jezero <heightmap.f32> --gale <missionDEM_20m_COG.tif> \
        --moon <lunar_data.csv> [--mola <jezero_mola_40km.png>]

Sources (see targets.json for checksums):
  Jezero  USGS Astrogeology, Mars 2020 Terrain Relative Navigation CTX DTM
          (JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m, Fergason et al. 2020), 20 m/pixel.
          Copy used: float32 grid in github.com/RoshTzsche/MarsWalk (public/data/jezero_test/heightmap.f32).
          Checked against the MOLA MEGDR (PDS, MEGT44N000HB) around the landing site.
  Gale    NASA-AMMOS MMGIS reference mission DEM (JPL, Apache-2.0), 20 m/pixel, lower Mount Sharp,
          blueprints/Missions/Reference-Mission-Mars/Data/DEMs/missionDEM_20m_COG.tif.
  Moon    NASA App Development Challenge 2022 "Lunar Data File": LRO LOLA heights on a 40 m polar
          stereographic grid around Shackleton crater (latitude, longitude, height, slope).
          Copy used: lunar_data.csv in github.com/1piyalib/rover_pathfinder (lunar_data.zip).
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
R_MOON = 1737400.0
WINDOW_M = 20000.0


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def save(tid, dem, res, meta, full=None, window=None):
    """Saves the WHOLE grid we have (for the zone-by-zone comparison) plus the main window's position.
    Heights as int16 decimetres (0.1 m steps) to keep the files small."""
    full = dem if full is None else full
    window = window or (0, 0, dem.shape[0], dem.shape[1])
    np.savez_compressed(HERE / f"{tid}.npz", dem_dm=np.round(full * 10).astype("int16"), res=np.float32(res),
                        window=np.array(window, "int32"))
    meta.update({"full_shape": list(full.shape),
                 "full_size_km": [round(full.shape[1] * res / 1000, 1), round(full.shape[0] * res / 1000, 1)],
                 "window_px": list(window)})
    meta.update({"shape": list(dem.shape), "res_m": res,
                 "size_km": [round(dem.shape[1] * res / 1000, 1), round(dem.shape[0] * res / 1000, 1)],
                 "elev_min_m": round(float(np.nanmin(dem)), 1), "elev_max_m": round(float(np.nanmax(dem)), 1)})
    print(f"[{tid}] {meta['size_km']} km at {res} m, elevation {meta['elev_min_m']} to {meta['elev_max_m']} m")
    return meta


def jezero(path, mola_png=None):
    a = np.fromfile(path, "<f4").reshape(1512, 1596)          # row 0 = north (TIFF strip order), 20 m
    res = 20.0
    n = int(WINDOW_M / res)
    land_rc = (a.shape[0] / 2, a.shape[1] / 2)
    meta = {"source_sha256": sha256(path)}
    if mola_png:
        # independent check: the full CTX grid block-averaged to 460 m vs the MOLA MEGDR (PDS) heightmap.
        from PIL import Image
        m = np.asarray(Image.open(mola_png)).astype("float64") * 0.1 - 2718.0   # 87 x 87, 460 m, centred on 18.44 N 77.45 E
        k = 23                                                                   # 23 x 20 m = 460 m
        rows, cols = a.shape[0] // k, a.shape[1] // k
        blk = a[:rows * k, :cols * k].reshape(rows, k, cols, k).mean((1, 3))
        # the CTX grid centre lies about 1.45 km south and 2.2 km east of the landing site
        best = None
        for dr in range(-8, 9):
            for dc in range(-8, 9):
                rr0 = 43 - rows // 2 + dr
                cc0 = 43 - cols // 2 + dc
                if rr0 < 0 or cc0 < 0 or rr0 + rows > 87 or cc0 + cols > 87:
                    continue
                d = blk - m[rr0:rr0 + rows, cc0:cc0 + cols]
                rms = float(np.sqrt(np.mean((d - d.mean()) ** 2)))
                if best is None or rms < best[0]:
                    best = (rms, float(d.mean()), dr, dc, float(np.corrcoef(blk.ravel(), m[rr0:rr0 + rows, cc0:cc0 + cols].ravel())[0, 1]))
        meta["check_vs_mola"] = {"rms_m": round(best[0], 1), "mean_offset_m": round(best[1], 1),
                                 "correlation": round(best[4], 3), "shift_px": [best[2], best[3]],
                                 "mola_sha256": sha256(mola_png)}
        print(f"[jezero] CTX vs MOLA (460 m): r = {best[4]:.3f}, RMS {best[0]:.1f} m after removing a {best[1]:.1f} m offset")
        # the MOLA grid is centred on the Perseverance landing site: locate it in the CTX grid
        rr0 = 43 - rows // 2 + best[2]
        cc0 = 43 - cols // 2 + best[3]
        land_rc = ((43.5 - rr0) * k, (43.5 - cc0) * k)
    # 20 x 20 km centred on the landing site (Octavia E. Butler, 18.4447 N 77.4508 E):
    # crater floor, the delta front and part of the western rim that Perseverance has climbed
    r0 = int(round(min(max(land_rc[0] - n / 2, 0), a.shape[0] - n)))
    c0 = int(round(min(max(land_rc[1] - n / 2, 0), a.shape[1] - n)))
    win = a[r0:r0 + n, c0:c0 + n]
    meta["landing_pixel"] = [round(land_rc[0]), round(land_rc[1])]
    meta.update({
        "id": "jezero", "body": "mars", "name": "Jezero Crater",
        "where": "20 km around the Perseverance landing site: crater floor, delta front and part of the western rim",
        "center": [18.4447, 77.4508],
        "product": "USGS Mars 2020 TRN CTX DTM (JEZ_ctx_B_soc_008, 20 m)",
        "product_url": "https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_ctx_dtm_mosaic",
        "copy_url": "https://github.com/RoshTzsche/MarsWalk/tree/main/public/data/jezero_test",
    })
    return save("jezero", win, res, meta, full=a, window=(r0, c0, n, n))


def gale(path):
    import rasterio
    with rasterio.open(path) as ds:
        a = ds.read(1).astype("float32")
        if ds.nodata is not None:
            a[a == ds.nodata] = np.nan
        b = ds.bounds
        r = 3396190.0
        lon = [math.degrees(b.left / r), math.degrees(b.right / r)]
        lat = [math.degrees(b.bottom / r), math.degrees(b.top / r)]
        res = float(ds.res[0])
    meta = {"source_sha256": sha256(path),
            "id": "gale", "body": "mars", "name": "Gale Crater", "where": "Lower Mount Sharp, along Curiosity's climb",
            "center": [round(sum(lat) / 2, 3), round(sum(lon) / 2, 3)],
            "bounds_deg": [[round(lat[0], 3), round(lon[0], 3)], [round(lat[1], 3), round(lon[1], 3)]],
            "product": "NASA-AMMOS MMGIS Mars reference mission DEM (20 m)",
            "product_url": "https://github.com/NASA-AMMOS/MMGIS/tree/development/blueprints/Missions/Reference-Mission-Mars",
            "copy_url": "https://github.com/NASA-AMMOS/MMGIS"}
    return save("gale", a, res, meta)


def moon(path):
    d = np.loadtxt(path, delimiter=",")
    lat, lon, h, s = d.T
    k = 2 * R_MOON * np.tan(np.radians(90 + lat) / 2)              # south polar stereographic, true scale at the pole
    x = k * np.sin(np.radians(lon))
    y = k * np.cos(np.radians(lon))
    res = 40.0
    col = np.round((x - x.min()) / res).astype(int)
    row = np.round((y.max() - y) / res).astype(int)
    n = col.max() + 1
    grid = np.full((row.max() + 1, n), np.nan, "float32")
    grid[row, col] = h
    sgrid = np.full_like(grid, np.nan)
    sgrid[row, col] = s
    # window: 20 x 20 km on the Peak near Shackleton region (Artemis III candidate region, 2022 list),
    # kept inside the data and outside the floor of Shackleton crater
    lat0, lon0 = -88.811, 123.69
    k0 = 2 * R_MOON * math.tan(math.radians(90 + lat0) / 2)
    cx = min(k0 * math.sin(math.radians(lon0)), x.max() - WINDOW_M / 2)
    cy = max(k0 * math.cos(math.radians(lon0)), y.min() + WINDOW_M / 2)
    c0 = int(round((cx - WINDOW_M / 2 - x.min()) / res))
    r0 = int(round((y.max() - (cy + WINDOW_M / 2)) / res))
    m = int(WINDOW_M / res)
    win = grid[r0:r0 + m, c0:c0 + m]
    swin = sgrid[r0:r0 + m, c0:c0 + m]
    # consistency checks. (1) our slope (40 m) vs the slope column supplied with the file: same pattern
    # (r ~ 0.99) but the supplied values are about twice as steep in tangent, as if computed for 20 m
    # spacing. (2) Shackleton's inner wall from our slopes vs the published ~30 deg (Zuber et al. 2012, Nature):
    # ours matches, so we compute every slope from the heights and do not use the supplied column.
    gy, gx = np.gradient(win.astype("float64"), res)
    ours = np.degrees(np.arctan(np.hypot(gx, gy)))
    ok = np.isfinite(ours) & np.isfinite(swin)
    r = float(np.corrcoef(ours[ok], swin[ok])[0, 1])
    ratio = float(np.median(np.tan(np.radians(swin[ok & (ours > 1)])) / np.tan(np.radians(ours[ok & (ours > 1)]))))
    fy, fx = np.gradient(grid.astype("float64"), res)
    full = np.degrees(np.arctan(np.hypot(fx, fy)))
    gxs = x.min() + np.arange(grid.shape[1]) * res
    gys = y.max() - np.arange(grid.shape[0]) * res
    XX, YY = np.meshgrid(gxs, gys)
    kc = 2 * R_MOON * math.tan(math.radians(90 - 89.67) / 2)          # Shackleton centre 89.67 S, 129.78 E
    dist = np.hypot(XX - kc * math.sin(math.radians(129.78)), YY - kc * math.cos(math.radians(129.78)))
    wall = float(np.nanmedian(full[(dist > 5000) & (dist < 9000)]))
    print(f"[moon] our slope vs supplied slope column: r = {r:.3f}, tangent ratio {ratio:.2f}; "
          f"Shackleton inner wall {wall:.1f} deg (published ~30 deg)")
    clat = -90 + 2 * math.degrees(math.atan(math.hypot(cx, cy) / (2 * R_MOON)))
    clon = math.degrees(math.atan2(cx, cy))
    meta = {"source_sha256": sha256(path),
            "id": "moon_south", "body": "moon", "name": "Lunar south pole",
            "where": "Peak near Shackleton region, outside the floor of Shackleton crater",
            "center": [round(clat, 3), round(clon, 2)],
            "check_slope": {"correlation_with_supplied_slope": round(r, 3), "supplied_tangent_ratio": round(ratio, 2),
                            "shackleton_inner_wall_deg": round(wall, 1), "published_wall_deg": 30,
                            "note": "Slopes are computed from the heights; the supplied slope column is about 2x steeper "
                                    "in tangent and disagrees with the published ~30 deg wall of Shackleton."},
            "product": "NASA App Development Challenge 2022 lunar data file (LRO LOLA, 40 m)",
            "product_url": "https://www.nasa.gov/learning-resources/app-development-challenge/",
            "copy_url": "https://github.com/1piyalib/rover_pathfinder"}
    return save("moon_south", win, res, meta, full=grid, window=(r0, c0, m, m))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jezero", required=True)
    ap.add_argument("--gale", required=True)
    ap.add_argument("--moon", required=True)
    ap.add_argument("--mola")
    a = ap.parse_args()
    out = {"jezero": jezero(a.jezero, a.mola), "gale": gale(a.gale), "moon_south": moon(a.moon)}
    (HERE / "targets.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print("Wrote", HERE / "targets.json")


if __name__ == "__main__":
    main()
