"""
content.py  --  Team Hoggar / Algeria Beyond Earth

Everything a PERSON decided lives here: the science texts, the planetary targets, the
materials judgements, the scoring rules, the Analog Finder objectives. build_all.py reads this
file and adds every number from the data. Edit this file, never the generated JSON.

Tags:  Measured    = computed by our scripts from an identified dataset
       Interpreted = our reading of a pattern, or our judgement
       Hypothesis  = must be checked in the field
       Reference   = established fact from a cited source, not computed by us
"""

SITES = {
    # id: name, role, nearest logistics hub [lat, lon]
    "ahnet":   {"name": "Ahnet Basin",           "hub": ("In Salah",    [27.19, 2.48])},
    "tassili": {"name": "Tassili n'Ajjer",       "hub": ("Djanet",      [24.55, 9.48])},
    "hoggar":  {"name": "Hoggar (Atakor)",       "hub": ("Tamanrasset", [22.79, 5.52])},
}
SITE_ORDER = ["ahnet", "tassili", "hoggar"]

SOURCES = [
    {"id": "cop_dem", "name": "Copernicus DEM GLO-30 (ESA)", "url": "https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_DEM_GLO30"},
    {"id": "palsar2", "name": "JAXA ALOS-2 PALSAR-2 yearly mosaic (L-band)", "url": "https://developers.google.com/earth-engine/datasets/catalog/JAXA_ALOS_PALSAR_YEARLY_SAR_EPOCH"},
    {"id": "sentinel1", "name": "ESA Sentinel-1 GRD (C-band)", "url": "https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S1_GRD"},
    {"id": "sentinel2", "name": "ESA Sentinel-2 SR (optical)", "url": "https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED"},
    {"id": "nasa_power", "name": "NASA POWER climatology (T2M_MAX, T2M_MIN, PRECTOTCORR)", "url": "https://power.larc.nasa.gov/docs/services/api/temporal/climatology/"},
    {"id": "trek", "name": "NASA Mars Trek and Moon Trek", "url": "https://trek.nasa.gov/"},
    {"id": "mars2020", "name": "NASA Science: Perseverance view of the delta in Jezero Crater", "url": "https://science.nasa.gov/resource/perseverance-view-of-the-delta-in-jezero-crater/"},
    {"id": "msl_lakes", "name": "NASA JPL: Curiosity rover team confirms ancient lakes on Mars (2015)", "url": "https://www.jpl.nasa.gov/news/nasas-curiosity-rover-team-confirms-ancient-lakes-on-mars/"},
    {"id": "msl_sharp", "name": "NASA JPL: Curiosity finds clues to how water helped shape Martian landscape (2014)", "url": "https://www.jpl.nasa.gov/news/nasas-curiosity-rover-finds-clues-to-how-water-helped-shape-martian-landscape/"},
    {"id": "lroc_pit", "name": "LROC (NASA/GSFC/ASU): Marius Hills pit, lava tube skylight?", "url": "https://lroc.im-ldi.com/images/202"},
    {"id": "lroc_marius", "name": "LROC (NASA/GSFC/ASU): Diversity of basaltic lunar volcanism, Marius Hills", "url": "https://lroc.im-ldi.com/images/702"},
    {"id": "ahnet_epsc", "name": "Caddeo et al. (2025), Water in the Ahnet Basin as a Mars analog, EPSC-DPS2025-1671", "url": "https://meetingorganizer.copernicus.org/EPSC-DPS2025/EPSC-DPS2025-1671.html"},
    {"id": "atakor", "name": "Azzouni-Sekkal et al. (2007), Cenozoic alkaline volcanism of the Atakor massif, GSA Special Paper 418", "url": "https://www.africamuseum.be/publication_docs/Azzouni-Sekkal-2007-GSASP-Atakor-volcanism.pdf"},
    {"id": "sir_a", "name": "Radar penetration of dry sand: SIR-A buried channels (Smithsonian repository)", "url": "https://repository.si.edu/server/api/core/bitstreams/108399f3-14f6-4c8d-950f-8f83cbcd7bd3/content"},
    {"id": "ice_mapper", "name": "International Mars Ice Mapper concept (EGU24 abstract)", "url": "https://meetingorganizer.copernicus.org/EGU24/EGU24-10754.html"},
    {"id": "astropy", "name": "Earth-Mars distance on 14 Nov 2026, computed with astropy", "url": "https://www.astropy.org/"},
    {"id": "moon_facts", "name": "NASA NSSDC Moon fact sheet (mean Earth-Moon distance)", "url": "https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html"},
    {"id": "nssdc_mars", "name": "NASA NSSDC Mars fact sheet (pressure, temperature, gravity)", "url": "https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html"},
    {"id": "nssdc_moon", "name": "NASA NSSDC Moon fact sheet (pressure, temperature, gravity)", "url": "https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html"},
    {"id": "msl_wheels", "name": "NASA JPL: Curiosity wheel wear status (wheels 50 cm diameter, 40 cm wide, milled aluminium)", "url": "https://www.jpl.nasa.gov/images/pia20334-routine-inspection-of-rover-wheel-wear-and-tear/"},
    {"id": "scarecrow", "name": "NASA JPL: Mojave Desert tests with the Scarecrow rover (2012)", "url": "https://www.jpl.nasa.gov/news/mojave-desert-tests-prepare-for-nasa-mars-roving/"},
    {"id": "glenn_tire", "name": "ASME: NASA Glenn superelastic nickel-titanium tire", "url": "https://www.asme.org/topics-resources/content/nasas-alien-tire"},
    {"id": "insight_dust", "name": "Space.com: InSight mission ends after dust covers its solar panels (2022)", "url": "https://www.space.com/nasa-mars-insight-lander-mission-ends"},
    {"id": "lunar_dust", "name": "NASA TM-2010-216781: abrasion testing with lunar dust simulants (Apollo visor scratches, suit seal leaks)", "url": "https://ntrs.nasa.gov/citations/20100033103"},
    {"id": "isa", "name": "Air pressure estimated from elevation with the standard atmosphere formula", "url": None},
    {"id": "ml", "name": "Team Hoggar models (pipeline/build_all.py, scikit-learn)", "url": None},
    {"id": "team", "name": "Team Hoggar planning assumption", "url": None},
]

TAGS = {
    "Measured": "Computed by our scripts from an identified dataset",
    "Interpreted": "Our reading of a pattern, or our judgement",
    "Hypothesis": "Must be checked in the field",
    "Reference": "Established fact from a cited source, not computed by us",
}

MARS_TILES = "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw/1.0.0/default/default028mm/{z}/{y}/{x}.jpg"
MOON_TILES = "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg"

# The six fingerprint axes. Every scenario uses the same axes, with its own scoring rule.
AXES = ["Terrain & slope", "Surface materials", "Dryness", "Subsurface structures",
        "Temperature extremes", "Access for operations"]

# Terrain and materials define the analogy, so they count double in the total (max 24).
# The other four axes support it. Team judgement, shown in the app next to the badges.
WEIGHTING = "Terrain & slope and Surface materials count double (they define the analogy); the other four axes count once. Maximum 24."

COMMON_RULES = {
    "Dryness": "Annual rain (NASA POWER): under 20 mm = 3, under 50 = 2, under 100 = 1, else 0.",
    "Subsurface structures": "Share of the box where L-band is brighter than the surface predicts (radar surprise z > 2, our ML model). Best site = 3, others scaled.",
    "Temperature extremes": "Average monthly swing (T2M_MAX - T2M_MIN) of 15 °C or more = 2, else 1. Capped at 2: no Earth site reaches Mars or Moon extremes.",
    "Access for operations": "Hub under 250 km straight-line, then share of box under 15°: over 90 % = 3, over 75 % = 2, else 1. Hub 250 km or more = 0.",
}

SCENARIOS = {
    "mars_water": {
        "title": "Follow the lost water",
        "short": "Mars · Jezero",
        "body": "mars",
        "question": "Which Algerian setting can help investigate an ancient river-to-lake system like Jezero's?",
        "default_objective": "water",
        "delay": {"one_way_s": 660, "label": "about 11 min one way (197.5 million km on 14 Nov 2026)", "tag": "Measured", "source": "astropy"},
        "planet_target": {
            "name": "Jezero Crater, western delta", "body": "mars", "tiles": MARS_TILES,
            "center": [18.44, 77.45], "zoom": 6,
            "specs": [
                {"key": "slope", "label": "Slope", "value": "< 5° on the basin floor", "tag": "Interpreted", "source": "trek"},
                {"key": "landform", "label": "Landform", "value": "Delta fan with a feeder channel", "tag": "Interpreted", "source": "mars2020"},
                {"key": "cover", "label": "Surface cover", "value": "Layered fine sediment", "tag": "Interpreted", "source": "mars2020"},
                {"key": "dryness", "label": "Dryness", "value": "Hyper-arid", "tag": "Interpreted", "source": "mars2020"},
            ],
        },
        "terrain_rule": "Mean slope: 5° or less = 3, 10° or less = 2, 15° or less = 1, else 0.",
        "materials_rule": "River, lake or evaporite sediments = 3, water-carved sandstone = 2, volcanic or crystalline rock = 0.",
        "materials": {
            "ahnet":   (3, "Alluvial, evaporitic and aeolian deposits linked to a former valley network", "ahnet_epsc"),
            "tassili": (2, "Sandstone plateau cut by dry valleys: water-carved, but rock rather than lake sediment", "team"),
            "hoggar":  (0, "Volcanic and crystalline rock: not a river-lake sediment setting", "atakor"),
        },
        "transfers": [
            {"text": "L-band radar sees through thin, very dry cover", "tag": "Reference", "source": "sir_a"},
            {"text": "Slope-aware rover routing on low-gradient ground", "tag": "Interpreted"},
        ],
        "site_transfers": {
            "ahnet": [{"text": "Alluvial fans, valley networks and sabkha deposits from a wet-to-arid transition, already proposed as a Mars analog", "tag": "Reference", "source": "ahnet_epsc"}],
            "tassili": [{"text": "Dry valleys cut by former flowing water", "tag": "Interpreted"}],
            "hoggar": [],
        },
        "breaks": [
            {"text": "Earth gravity 1 g vs Mars 0.38 g", "tag": "Reference"},
            {"text": "Thick Earth atmosphere vs thin Martian atmosphere", "tag": "Reference"},
            {"text": "Different radiation environment (Earth's magnetic field and atmosphere shield the surface)", "tag": "Reference"},
            {"text": "Quartz sand on Earth vs basaltic material on Mars", "tag": "Interpreted"},
            {"text": "Instrument gap: our L-band images are not what a Mars orbiter would measure", "tag": "Reference", "source": "ice_mapper"},
        ],
        "tools": ["Camera (like Mastcam-Z)", "Ground-penetrating radar (like RIMFAX)", "Sampling drill (like Perseverance's corer)"],
    },
    "mars_layers": {
        "title": "Read the layered rocks",
        "short": "Mars · Gale",
        "body": "mars",
        "question": "Which Algerian setting can rehearse a rover climbing through layered sedimentary rock, like Curiosity at Mount Sharp?",
        "default_objective": "layers",
        "delay": {"one_way_s": 660, "label": "about 11 min one way (197.5 million km on 14 Nov 2026)", "tag": "Measured", "source": "astropy"},
        "planet_target": {
            "name": "Gale Crater, base of Mount Sharp", "body": "mars", "tiles": MARS_TILES,
            "center": [-4.7, 137.4], "zoom": 6,
            "specs": [
                {"key": "slope", "label": "Slope", "value": "Gentle crater floor rising onto the mound's lower slopes", "tag": "Interpreted", "source": "trek"},
                {"key": "landform", "label": "Landform", "value": "A mound about 5 km high whose flanks expose hundreds of rock layers", "tag": "Reference", "source": "msl_sharp"},
                {"key": "cover", "label": "Surface cover", "value": "Finely laminated mudstones laid down in ancient lakes", "tag": "Reference", "source": "msl_lakes"},
                {"key": "dryness", "label": "Dryness", "value": "Hyper-arid today; the rocks record long-lived lakes", "tag": "Reference", "source": "msl_lakes"},
            ],
        },
        "terrain_rule": "One point each for: relief 100 to 600 m, mean slope 3 to 12°, under 25 % of the box steeper than 15°.",
        "materials_rule": "Thick layered sedimentary rock exposed = 3, layered sediments with little exposure = 2, volcanic or crystalline = 0.",
        "materials": {
            "ahnet":   (2, "Folded sedimentary layers well exposed from above, but with little relief to climb", "ahnet_epsc"),
            "tassili": (3, "Thick sandstone layers exposed in cliffs and buttes", "team"),
            "hoggar":  (0, "Volcanic and crystalline rock, not sedimentary layers", "atakor"),
        },
        "transfers": [
            {"text": "Reading a stack of layers on a slope, bottom to top, the way Curiosity climbs Mount Sharp", "tag": "Interpreted", "source": "msl_sharp"},
            {"text": "Rover driving between outcrops on moderate slopes", "tag": "Interpreted"},
        ],
        "site_transfers": {"ahnet": [], "tassili": [{"text": "Sandstone buttes and cliffs expose layers over hundreds of metres of relief", "tag": "Interpreted"}], "hoggar": []},
        "breaks": [
            {"text": "Earth gravity 1 g vs Mars 0.38 g", "tag": "Reference"},
            {"text": "Thick Earth atmosphere vs thin Martian atmosphere", "tag": "Reference"},
            {"text": "Different radiation environment (Earth's magnetic field and atmosphere shield the surface)", "tag": "Reference"},
            {"text": "Quartz-rich sandstone on Earth vs clay- and sulfate-bearing mudstone in Gale", "tag": "Interpreted", "source": "msl_lakes"},
            {"text": "Instrument gap: our L-band images are not what a Mars orbiter would measure", "tag": "Reference", "source": "ice_mapper"},
        ],
        "tools": ["Camera (like Mastcam)", "Laser spectrometer (like ChemCam)", "Drill and mineral lab (like CheMin)"],
    },
    "moon_volcanic": {
        "title": "Volcanic domes and lava tubes",
        "short": "Moon · Marius Hills",
        "body": "moon",
        "question": "Which Algerian setting can rehearse work on volcanic domes and a lava-tube skylight, like the Marius Hills?",
        "default_objective": "volcanic",
        "delay": {"one_way_s": 1.3, "label": "about 1.3 s one way (mean distance 384,400 km)", "tag": "Reference", "source": "moon_facts"},
        "planet_target": {
            "name": "Marius Hills pit", "body": "moon", "tiles": MOON_TILES,
            "center": [14.09, -56.77], "zoom": 6,
            "specs": [
                {"key": "slope", "label": "Slope", "value": "Steep-sided shields and cones above flat mare plains", "tag": "Interpreted", "source": "lroc_marius"},
                {"key": "landform", "label": "Landform", "value": "A pit about 58 × 49 m and 40 m deep in a sinuous rille, likely a lava-tube skylight", "tag": "Reference", "source": "lroc_pit"},
                {"key": "cover", "label": "Surface cover", "value": "Regolith over blocky basaltic lava flows", "tag": "Reference", "source": "lroc_marius"},
                {"key": "dryness", "label": "Dryness", "value": "Airless, no liquid water", "tag": "Interpreted", "source": "team"},
            ],
        },
        "terrain_rule": "Relief: 300 m or more = 3, 150 m or more = 2, 50 m or more = 1, else 0.",
        "materials_rule": "Basaltic lava and volcanic domes = 3, other volcanic rock = 2, no volcanic rock = 0.",
        "materials": {
            "ahnet":   (0, "Sedimentary basin: no volcanic rock in this box", "ahnet_epsc"),
            "tassili": (0, "Sandstone plateau: no volcanic rock in this box", "team"),
            "hoggar":  (3, "Alkali basalts (about 80 % of Atakor lavas) plus phonolite and trachyte domes", "atakor"),
        },
        "transfers": [
            {"text": "Steep volcanic relief for mobility and navigation tests", "tag": "Interpreted"},
            {"text": "Short signal delay: near-real-time driving from Earth can be rehearsed", "tag": "Interpreted", "source": "moon_facts"},
        ],
        "site_transfers": {"ahnet": [], "tassili": [], "hoggar": [{"text": "Basalt flows, cones and phonolite domes of the Atakor volcanic field", "tag": "Reference", "source": "atakor"}]},
        "breaks": [
            {"text": "Earth gravity 1 g vs Moon 0.17 g", "tag": "Reference"},
            {"text": "Earth atmosphere vs almost no atmosphere on the Moon", "tag": "Reference"},
            {"text": "Different radiation environment (no global magnetic field or atmosphere on the Moon)", "tag": "Reference"},
            {"text": "Weathered rock and wind-blown sand on Earth vs impact-made regolith on the Moon", "tag": "Interpreted"},
            {"text": "Instrument gap: no lava-tube void has been found in our boxes; L-band hotspots are candidates only", "tag": "Interpreted"},
        ],
        "tools": ["Stereo navigation camera", "Ground-penetrating radar (like Yutu-2's)", "Spectrometer and sample bag"],
    },
}
SCENARIO_ORDER = ["mars_water", "mars_layers", "moon_volcanic"]

# ---------------------------------------------------------------------------------------------
# Analog Finder. Preferences on cell features, pooled percentiles (0 = lowest of all 7,500 cells,
# 100 = highest). want: "low" | "high" | [lo, hi] band. The weights are team judgements (Interpreted).
# ---------------------------------------------------------------------------------------------
DESTINATION_PROFILES = {
    "mars_water":    [{"f": "slope_mean", "want": "low", "w": 2}, {"f": "rough", "want": "low", "w": 1},
                      {"f": "bright", "want": "high", "w": 1}],
    "mars_layers":   [{"f": "relief", "want": [50, 90], "w": 2}, {"f": "slope_mean", "want": [40, 80], "w": 1},
                      {"f": "red", "want": "high", "w": 1}],
    "moon_volcanic": [{"f": "bright", "want": "low", "w": 2}, {"f": "relief", "want": "high", "w": 2},
                      {"f": "rough", "want": "high", "w": 1}],
}

OBJECTIVES = {
    "mobility": {"label": "Rover driving and navigation", "label_fr": "Conduite et navigation du rover",
                 "prefs": [{"f": "slope_mean", "want": "low", "w": 3}, {"f": "steep", "want": "low", "w": 2},
                           {"f": "rough", "want": "low", "w": 1}], "rover": True, "alpha": 0.25},
    "water": {"label": "Ancient water and sediments", "label_fr": "Eau ancienne et sédiments",
              "prefs": [{"f": "surprise", "want": "high", "w": 2}, {"f": "lmc", "want": "high", "w": 1},
                        {"f": "slope_mean", "want": "low", "w": 1}, {"f": "bright", "want": "high", "w": 1}],
              "rover": True, "alpha": 0.25},
    "subsurface": {"label": "Ground-penetrating radar (what is under the sand)", "label_fr": "Radar de sol (ce qu'il y a sous le sable)",
                   "prefs": [{"f": "surprise", "want": "high", "w": 3}, {"f": "lmc", "want": "high", "w": 2},
                             {"f": "rough", "want": "low", "w": 1}], "rover": True, "alpha": 0.25},
    "layers": {"label": "Layered rock and outcrop science", "label_fr": "Roches en couches et affleurements",
               "prefs": [{"f": "relief", "want": [50, 90], "w": 2}, {"f": "slope_mean", "want": [40, 80], "w": 1},
                         {"f": "red", "want": "high", "w": 1}, {"f": "rough", "want": [30, 80], "w": 1}],
               "rover": False, "alpha": 0.25},
    "volcanic": {"label": "Volcanic terrain and lava-tube scouting", "label_fr": "Terrain volcanique et repérage de tubes de lave",
                 "prefs": [{"f": "bright", "want": "low", "w": 2}, {"f": "relief", "want": "high", "w": 2},
                           {"f": "rough", "want": "high", "w": 1}, {"f": "cvv", "want": "high", "w": 1}],
                 "rover": False, "alpha": 0.25},
    "crew": {"label": "Human crew field training", "label_fr": "Entraînement d'équipe humaine sur le terrain",
             "prefs": [{"f": "slope_mean", "want": "low", "w": 1}, {"f": "steep", "want": "low", "w": 1}],
             "rover": False, "alpha": 0.6},
}

FEATURES = {
    # key: label, unit, source, short description (shown in the app)
    "slope_mean": ("Mean slope", "°", "cop_dem", "average slope in the 400 m cell"),
    "slope_p90": ("Slope, 90th percentile", "°", "cop_dem", "steepest 10 % of the cell"),
    "steep": ("Steeper than 15°", "% of cell", "cop_dem", "share of the cell a rover could not climb"),
    "relief": ("Relief", "m", "cop_dem", "highest minus lowest point in a 1 km window"),
    "rough": ("Roughness", "m", "cop_dem", "local height variation (standard deviation, 125 m window)"),
    "bright": ("Optical brightness", "reflectance", "sentinel2", "mean of red, green, blue reflectance"),
    "red": ("Redness", "red/blue", "sentinel2", "red-to-blue reflectance ratio (iron oxide proxy)"),
    "lhh": ("L-band HH", "dB", "palsar2", "L-band radar backscatter"),
    "cvv": ("C-band VV", "dB", "sentinel1", "C-band radar backscatter"),
    "lmc": ("L minus C", "dB", "palsar2", "how much brighter L-band is than C-band"),
    "surprise": ("Radar surprise", "z", "ml", "L-band brighter (+) or darker (-) than the surface predicts"),
    "elev": ("Elevation", "m", "cop_dem", "mean height above sea level"),
}
FINDER_FEATURES = ["slope_mean", "steep", "relief", "rough", "bright", "red", "lhh", "cvv", "lmc", "surprise"]
