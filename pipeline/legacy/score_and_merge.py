"""
score_and_merge.py  --  Team Hoggar / Algeria Beyond Earth   (Member C)

Fills mission_data.json with REAL numbers, computes the 6 fingerprint scores
and the site verdicts. Never types a number by hand.

Inputs (all in the pipeline/ folder):
  site_numbers.json        <- written by compute_site_numbers.py (Duo 1)
  power_ahnet.json         <- NASA POWER page saved from the browser (Member D):
  power_tassili.json          open the link, Ctrl+A, Ctrl+C, paste into the file, save
  power_hoggar.json
  ../frontend/public/mission_data.json   (or pass another path as 1st argument)

Run:   python score_and_merge.py
       python score_and_merge.py path/to/mission_data.json
"""
import json, os, sys

JSON_PATH = sys.argv[1] if len(sys.argv) > 1 else "../public/mission_data.json"
if not os.path.exists(JSON_PATH) and os.path.exists("mission_data.json"):
    JSON_PATH = "mission_data.json"

MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

# Member C sets this one by hand: it is an interpretation, tagged "Interpreted".
# Rule: fluvial / lake / evaporite sediments = 3, sandstone = 2, basalt = 0 (water mission)
MATERIALS = {
    "ahnet":   (3, "Alluvial, evaporitic and aeolian deposits studied as a Mars analog (EPSC-DPS 2025)"),
    "tassili": (2, "Sandstone plateau cut by canyons"),
    "hoggar":  (0, "Basaltic volcanic field: not a water-sediment setting"),
}

# ---------- scoring rules (team assumptions, written in the dossier) --------
def score_slope(deg):
    return 3 if deg <= 5 else 2 if deg <= 10 else 1 if deg <= 15 else 0

def score_dryness(rain_mm_year):
    return 3 if rain_mm_year < 20 else 2 if rain_mm_year < 50 else 1 if rain_mm_year < 100 else 0

def score_access(steep_share_pct, hub_km):
    flat = 100 - steep_share_pct
    if hub_km >= 250:
        return 0
    return 3 if flat > 90 else 2 if flat > 75 else 1

def score_temperature(daily_range_c):
    return 2 if daily_range_c >= 15 else 1            # Earth never reaches Mars' range: max 2

def score_subsurface(pct, best):
    return 0 if best <= 0 else round(3 * pct / best)  # best site = 3, others scaled


# ---------- helpers ----------------------------------------------------------
def load_power(site):
    """Read a NASA POWER climatology response saved as power_<site>.json."""
    path = f"power_{site}.json"
    if not os.path.exists(path):
        return None
    raw = json.load(open(path, encoding="utf-8"))
    p = raw.get("properties", {}).get("parameter") or raw.get("parameter")
    if not p:
        raise ValueError(f"{path}: no 'properties.parameter' block - did you paste the whole page?")
    tmax = [p["T2M_MAX"][m] for m in MONTHS]
    tmin = [p["T2M_MIN"][m] for m in MONTHS]
    return {
        "monthly_tmax_c": [round(v, 1) for v in tmax],
        "daily_range_c": round(sum(a - b for a, b in zip(tmax, tmin)) / 12, 1),
        "rain_mm_year": round(p["PRECTOTCORR"]["ANN"] * 365, 1),   # PRECTOTCORR is mm/day
    }

def set_metric(cand, key, value):
    for m in cand["metrics"]:
        if m["key"] == key:
            m["value"] = value
            return
    raise KeyError(f"{cand['id']}: metric '{key}' not found in mission_data.json")

def set_axis(cand, axis, score):
    for a in cand["fingerprint"]:
        if a["axis"] == axis:
            a["site"] = score
            return
    raise KeyError(f"{cand['id']}: fingerprint axis '{axis}' not found")


# ---------- main -------------------------------------------------------------
data = json.load(open(JSON_PATH, encoding="utf-8"))
nums = json.load(open("site_numbers.json", encoding="utf-8")) if os.path.exists("site_numbers.json") else {}
cands = data["scenarios"]["mars_water"]["candidates"]
missing = []

best_anom = max((nums[c["id"]]["anomalies"] for c in cands if c["id"] in nums), default=0)

for c in cands:
    sid = c["id"]
    n = nums.get(sid)
    pw = load_power(sid)
    if not n:
        missing.append(f"{sid}: no entry in site_numbers.json")
    if not pw:
        missing.append(f"{sid}: power_{sid}.json not found")

    if n:
        c["bounds"] = n["bounds"]                       # the real exported box, so overlays line up
        if c.get("rover") and c["rover"].get("grid"):
            pass                                        # waypoints stay as Member D placed them
        set_metric(c, "mean_slope", n["mean_slope"])
        set_metric(c, "relief", n["relief"])
        set_metric(c, "steep_share", n["steep_share"])
        set_metric(c, "anomalies", n["anomalies"])

    if pw:
        efs = c["earth_field_safety"]
        efs["monthly_tmax_c"] = pw["monthly_tmax_c"]
        efs["rain_mm_year"] = pw["rain_mm_year"]
        efs["daily_range_c"] = pw["daily_range_c"]

    mat_score, mat_note = MATERIALS[sid]
    set_axis(c, "Surface materials", mat_score)
    c["materials_note"] = mat_note

    if n and pw:
        hub = c["earth_field_safety"]["nearest_hub"]["distance_km"]
        set_axis(c, "Terrain & slope", score_slope(n["mean_slope"]))
        set_axis(c, "Dryness", score_dryness(pw["rain_mm_year"]))
        set_axis(c, "Subsurface structures", score_subsurface(n["anomalies"], best_anom))
        set_axis(c, "Temperature extremes", score_temperature(pw["daily_range_c"]))
        set_axis(c, "Access for operations", score_access(n["steep_share"], hub))

# ---------- verdicts: only once every site is fully scored -------------------
scored = all(a["site"] is not None for c in cands for a in c["fingerprint"])
if scored:
    totals = {c["id"]: sum(a["site"] for a in c["fingerprint"]) for c in cands}
    top = max(totals.values())
    for c in cands:
        t = totals[c["id"]]
        c["verdict"] = "STRONGEST" if t == top else "PARTIAL" if t >= 0.7 * top else "WEAK"
        ranked = sorted(c["fingerprint"], key=lambda a: a["site"], reverse=True)
        c["verdict_reason"] = (f"{t}/18. Strongest: {ranked[0]['axis']}, {ranked[1]['axis']}. "
                               f"Weakest: {ranked[-1]['axis']}.")
        c["verdict_tag"] = "Interpreted"
else:
    missing.append("verdicts not set: some fingerprint scores are still empty")

# ---------- mock flag: only false when nothing is missing --------------------
def has_null(o):
    if o is None:
        return True
    if isinstance(o, dict):
        return any(has_null(v) for k, v in o.items() if k not in ("url", "tiles", "rover"))
    if isinstance(o, list):
        return any(has_null(v) for v in o)
    return False

complete = not missing and not has_null(cands)
data["meta"]["mock"] = not complete

json.dump(data, open(JSON_PATH, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

print(f"Updated {JSON_PATH}")
for c in cands:
    print(f"  {c['id']:8s} scores={[a['site'] for a in c['fingerprint']]}  verdict={c['verdict']}")
if complete:
    print("All real data in: meta.mock = false. Send the file to Person 1.")
else:
    print("Still mock (meta.mock = true). Missing:")
    for m in missing:
        print("  -", m)