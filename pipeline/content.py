"""
content.py  --  Team Hoggar / Amanar

Everything a PERSON decided lives here: target descriptions, the geology checks (each with a source),
what transfers and what does not, test definitions, and the plain-language labels.
The NUMBERS come from data (build_all.py for Earth, compare.py for Mars/Moon). Never edit the
generated JSON by hand: edit this file and rerun  python pipeline/compare.py

Tags:  Measured    = computed by our scripts from an identified dataset
       Reference   = established fact from a cited source, not computed by us
       Judgement   = our reading, decision or threshold (shown as such in the app)
       Hypothesis  = must be checked in the field
"""

SITES = {
    # id: name, nearest logistics hub [lat, lon]
    "ahnet":   {"name": "Ahnet Basin",     "hub": ("In Salah",    [27.19, 2.48])},
    "tassili": {"name": "Tassili n'Ajjer", "hub": ("Djanet",      [24.55, 9.48])},
    "hoggar":  {"name": "Hoggar (Atakor)", "hub": ("Tamanrasset", [22.79, 5.52])},
}
SITE_ORDER = ["ahnet", "tassili", "hoggar"]

TAGS = {
    "Measured": "Computed by our scripts from an identified dataset",
    "Reference": "Established fact from a cited source, not computed by us",
    "Judgement": "Our reading, decision or threshold",
    "Hypothesis": "Must be checked in the field",
}

SOURCES = [
    {"id": "cop_dem", "name": "Copernicus DEM GLO-30 (ESA), Earth elevation", "url": "https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_DEM_GLO30"},
    {"id": "palsar2", "name": "JAXA ALOS-2 PALSAR-2 yearly mosaic (L-band radar)", "url": "https://developers.google.com/earth-engine/datasets/catalog/JAXA_ALOS_PALSAR_YEARLY_SAR_EPOCH"},
    {"id": "sentinel1", "name": "ESA Sentinel-1 GRD (C-band radar)", "url": "https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S1_GRD"},
    {"id": "sentinel2", "name": "ESA Sentinel-2 SR (optical)", "url": "https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED"},
    {"id": "nasa_power", "name": "NASA POWER climatology (T2M_MAX, T2M_MIN, PRECTOTCORR)", "url": "https://power.larc.nasa.gov/docs/services/api/temporal/climatology/"},
    {"id": "ctx_jezero", "name": "USGS / NASA Mars 2020 Terrain Relative Navigation CTX DTM, 20 m (Fergason et al. 2020)", "url": "https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_ctx_dtm_mosaic"},
    {"id": "mola", "name": "NASA MGS MOLA MEGDR 128 pixels/degree (PDS), used to check the Jezero DTM", "url": "https://pds-geosciences.wustl.edu/missions/mgs/megdr.html"},
    {"id": "mmgis_gale", "name": "NASA-AMMOS MMGIS Mars reference mission DEM, Gale crater, 20 m (JPL)", "url": "https://github.com/NASA-AMMOS/MMGIS"},
    {"id": "lola_adc", "name": "NASA App Development Challenge lunar data file: LRO LOLA heights, 40 m grid around Shackleton", "url": "https://www.nasa.gov/learning-resources/app-development-challenge/"},
    {"id": "trek", "name": "NASA Mars Trek and Moon Trek (basemaps)", "url": "https://trek.nasa.gov/"},
    {"id": "jezero_floor", "name": "Farley et al. (2022), Aqueously altered igneous rocks sampled on the floor of Jezero crater, Science 377", "url": "https://doi.org/10.1126/science.abo2196"},
    {"id": "mars2020", "name": "NASA Science: Perseverance view of the delta in Jezero Crater", "url": "https://science.nasa.gov/resource/perseverance-view-of-the-delta-in-jezero-crater/"},
    {"id": "msl_lakes", "name": "NASA JPL: Curiosity rover team confirms ancient lakes on Mars (2015)", "url": "https://www.jpl.nasa.gov/news/nasas-curiosity-rover-team-confirms-ancient-lakes-on-mars/"},
    {"id": "msl_sharp", "name": "NASA JPL: Curiosity finds clues to how water helped shape Martian landscape (2014)", "url": "https://www.jpl.nasa.gov/news/nasas-curiosity-rover-finds-clues-to-how-water-helped-shape-martian-landscape/"},
    {"id": "artemis9", "name": "NASA (Oct 2024): nine candidate Artemis landing regions near the lunar south pole", "url": "https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/"},
    {"id": "artemis13", "name": "NASA App Development Challenge 2023: the 13 Artemis III candidate regions of 2022, including Peak Near Shackleton", "url": "https://www.nasa.gov/learning-resources/app-development-challenge/2023-handbook-and-coding-components"},
    {"id": "change7", "name": "The Planetary Society: Chang'e-7, preferred landing site on the rim of Shackleton crater", "url": "https://www.planetary.org/space-missions/change-7"},
    {"id": "shackleton", "name": "Zuber et al. (2012), Constraints on the volatile distribution within Shackleton crater, Nature 486", "url": "https://doi.org/10.1038/nature11216"},
    {"id": "ahnet_epsc", "name": "Caddeo et al. (2025), Water in the Ahnet Basin as a Mars analog, EPSC-DPS2025-1671", "url": "https://meetingorganizer.copernicus.org/EPSC-DPS2025/EPSC-DPS2025-1671.html"},
    {"id": "tassili_whc", "name": "UNESCO World Heritage Centre: Tassili n'Ajjer (sandstone successions, criterion viii)", "url": "https://whc.unesco.org/en/list/179"},
    {"id": "atakor", "name": "Azzouni-Sekkal et al. (2007), Cenozoic alkaline volcanism of the Atakor massif, GSA Special Paper 418", "url": "https://www.africamuseum.be/publication_docs/Azzouni-Sekkal-2007-GSASP-Atakor-volcanism.pdf"},
    {"id": "sir_a", "name": "Radar penetration of dry sand: SIR-A buried channels (Smithsonian repository)", "url": "https://repository.si.edu/server/api/core/bitstreams/108399f3-14f6-4c8d-950f-8f83cbcd7bd3/content"},
    {"id": "nssdc_mars", "name": "NASA NSSDC Mars fact sheet (pressure, temperature, gravity)", "url": "https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html"},
    {"id": "nssdc_moon", "name": "NASA NSSDC Moon fact sheet (pressure, temperature, gravity, distance)", "url": "https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html"},
    {"id": "astropy", "name": "Earth-Mars distance on 14 Nov 2026, computed with astropy", "url": "https://www.astropy.org/"},
    {"id": "scarecrow", "name": "NASA JPL: Mojave Desert tests with the Scarecrow rover (2012)", "url": "https://www.jpl.nasa.gov/news/mojave-desert-tests-prepare-for-nasa-mars-roving/"},
    {"id": "ml", "name": "Team Hoggar models (pipeline/build_all.py, scikit-learn)", "url": None},
    {"id": "msl_wheels", "name": "NASA JPL: Curiosity wheel wear (milled aluminium wheels, 50 cm diameter, 40 cm wide)", "url": "https://www.jpl.nasa.gov/images/pia20334-routine-inspection-of-rover-wheel-wear-and-tear/"},
    {"id": "glenn_tire", "name": "ASME: NASA Glenn superelastic nickel-titanium tire", "url": "https://www.asme.org/topics-resources/content/nasas-alien-tire"},
    {"id": "insight_dust", "name": "Space.com: InSight mission ends after dust covers its solar panels (2022)", "url": "https://www.space.com/nasa-mars-insight-lander-mission-ends"},
    {"id": "lunar_dust", "name": "NASA TM-2010-216781: abrasion tests with lunar dust simulants (Apollo visor scratches, suit seal leaks)", "url": "https://ntrs.nasa.gov/citations/20100033103"},
    {"id": "isa", "name": "Air pressure from elevation, International Standard Atmosphere formula", "url": None},
    {"id": "niosh_heat", "name": "NIOSH (CDC): heat stress workplace recommendations (water, acclimatisation, buddy system)", "url": "https://www.cdc.gov/niosh/heat-stress/recommendations/index.html"},
    {"id": "team", "name": "Team Hoggar judgement", "url": None},
]

MARS_TILES = "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw/1.0.0/default/default028mm/{z}/{y}/{x}.jpg"
MOON_TILES = "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg"

# Target environment (Reference). Pressure kPa, temperature range of a typical day, gravity m/s2.
ENV = {
    "mars": {"pressure_kpa": 0.636, "day_swing_c": 58, "t_text": "-89 to -31 °C in one day (Viking 1 site)",
             "gravity": 3.73, "source": "nssdc_mars"},
    "moon": {"pressure_kpa": 3e-13, "day_swing_c": 295, "t_text": "-178 to +117 °C at the equator; far colder in polar shadow",
             "gravity": 1.62, "source": "nssdc_moon"},
}

# ---------------------------------------------------------------------------------------------
# Targets. Terrain numbers are MEASURED from the elevation windows (planetary/*.npz).
# Geology is REFERENCE (cited) and judged per site: "match" / "partial" / "no".
# ---------------------------------------------------------------------------------------------
TARGETS = {
    "jezero": {
        "title": "Jezero Crater", "in_text": "Jezero", "short": "Mars · Jezero", "body": "mars",
        "mission": "Perseverance (landed 2021)",
        "goal": "An ancient river delta and lake, and the igneous crater floor below them.",
        "why": "Perseverance is collecting samples here for return to Earth.",
        "tiles": MARS_TILES, "map_center": [18.4447, 77.4508], "zoom": 9,
        "delay": {"one_way_s": 660, "label": "about 11 min one way (197.5 million km on 14 Nov 2026)", "tag": "Measured", "source": "astropy"},
        "rocks": {"text": "River-delta and lake sediments over igneous rocks (olivine-rich Séítah, basaltic Máaz)", "source": "jezero_floor"},
        "geology": {
            "ahnet":   ("match",   "River, alluvial-fan and evaporite deposits of a former valley network: the same family of rocks as Jezero's delta and lake beds.", "ahnet_epsc"),
            "tassili": ("partial", "Sandstone cut by old river valleys: shaped by water, but rock rather than delta or lake sediment.", "tassili_whc"),
            "hoggar":  ("partial", "Basalt lava flows, comparable to the igneous rocks of Jezero's floor, but no river or lake deposits.", "jezero_floor"),
        },
        "zone_words": {"all": "the whole map", "gentle": "smooth crater floor", "middle": "delta and rougher floor",
                       "steep": "crater rim and inlet canyon"},
        "tools": ["Camera (like Mastcam-Z)", "Ground-penetrating radar (like RIMFAX)", "Sampling drill (like Perseverance's corer)"],
        "questions": ["Are the sediments here rounded and sorted, as flowing water leaves them?",
                      "Is there coarse or layered material under the surface?",
                      "Can a short core show fine, lake-like layers?"],
    },
    "gale": {
        "title": "Gale Crater", "in_text": "Gale", "short": "Mars · Gale", "body": "mars",
        "mission": "Curiosity (landed 2012)",
        "goal": "Climbing a 5 km mound of layered rock that records a long-lived lake.",
        "why": "Curiosity has been reading these layers bottom to top for more than a decade.",
        "tiles": MARS_TILES, "map_center": [-4.707, 137.387], "zoom": 9,
        "delay": {"one_way_s": 660, "label": "about 11 min one way (197.5 million km on 14 Nov 2026)", "tag": "Measured", "source": "astropy"},
        "rocks": {"text": "Finely layered lake mudstones and sulfate-bearing layers", "source": "msl_lakes"},
        "geology": {
            "ahnet":   ("partial", "Folded sedimentary layers, well exposed from above, but with little height to climb through.", "ahnet_epsc"),
            "tassili": ("match",   "Thick sandstone successions exposed in cliffs and buttes: a stack of layers to read bottom to top.", "tassili_whc"),
            "hoggar":  ("no",      "Volcanic and crystalline rock, not sedimentary layers.", "atakor"),
        },
        "zone_words": {"all": "the whole map", "gentle": "crater-floor plains", "middle": "lower slopes of Mount Sharp",
                       "steep": "steeper mound"},
        "tools": ["Camera (like Mastcam)", "Laser spectrometer (like ChemCam)", "Drill and mineral lab (like CheMin)"],
        "questions": ["Which layer is at the bottom here, and does it change upslope?",
                      "What is each layer made of?",
                      "Is there a fine-grained layer worth drilling?"],
    },
    "moon_south": {
        "title": "Lunar south pole", "in_text": "the lunar south pole", "short": "Moon · South pole", "body": "moon",
        "mission": "Artemis base region; planned Chang'e-7 landing area (2027)",
        "goal": "A permanent base on sunlit crater rims next to permanently shadowed, icy craters.",
        "why": "Peak near Shackleton was on NASA's 2022 list of Artemis candidate regions; China's Chang'e-7 targets the same rim.",
        "tiles": MOON_TILES, "map_center": [-88.838, 124.57], "zoom": 6,
        "delay": {"one_way_s": 1.3, "label": "about 1.3 s one way (mean distance 384,400 km)", "tag": "Reference", "source": "nssdc_moon"},
        "rocks": {"text": "Impact-churned highland regolith (feldspar-rich), boulders, and icy cold traps in permanent shadow", "source": "shackleton"},
        "geology": {
            "ahnet":   ("no",      "Sedimentary basin: nothing like impact-churned highland rock.", "ahnet_epsc"),
            "tassili": ("no",      "Sandstone plateau: sedimentary, not igneous or impact rock.", "tassili_whc"),
            "hoggar":  ("partial", "Igneous and crystalline rock with rugged volcanic relief, but basalt and phonolite rather than lunar highland rock, and no impact regolith.", "atakor"),
        },
        "zone_words": {"all": "the whole map", "gentle": "gentler ground between craters", "middle": "rolling crater rims",
                       "steep": "crater walls and ridges"},
        "tools": ["Stereo navigation camera", "Ground-penetrating radar", "Neutron spectrometer (hydrogen / ice)"],
        "questions": ["Can the rover hold a slope this steep on loose ground?",
                      "Where would shadows fall at a low Sun angle?",
                      "Is there a safe, flat pad for a lander near the ridge?"],
    },
}
TARGET_ORDER = ["jezero", "gale", "moon_south"]

# What every target shares (Reference) and where Earth cannot help.
BREAKS = {
    "mars": [
        {"text": "Gravity: Earth 9.81 m/s², Mars 3.73 m/s² (0.38 g)", "tag": "Reference", "source": "nssdc_mars"},
        {"text": "Air: about 0.64 kPa on Mars, 75 to 100 kPa at our sites", "tag": "Reference", "source": "nssdc_mars"},
        {"text": "Radiation: Earth's magnetic field and thick air shield our sites", "tag": "Reference"},
        {"text": "Rock chemistry: quartz sand and sandstone here, basaltic dust and clays on Mars", "tag": "Judgement"},
    ],
    "moon": [
        {"text": "Gravity: Earth 9.81 m/s², Moon 1.62 m/s² (0.17 g)", "tag": "Reference", "source": "nssdc_moon"},
        {"text": "Vacuum on the Moon; no wind, no weathering, very sharp regolith grains", "tag": "Reference", "source": "nssdc_moon"},
        {"text": "Light: at the pole the Sun stays within a few degrees of the horizon; long shadows all day", "tag": "Reference", "source": "shackleton"},
        {"text": "Cold traps colder than anywhere on Earth inside permanently shadowed craters", "tag": "Reference", "source": "shackleton"},
    ],
}

# Plain-language bands for the terrain match (Judgement: our thresholds, shown in the app).
MATCH_BANDS = [(65, "close"), (45, "moderate"), (0, "poor")]

# Radar-hotspot checks (Judgement: thresholds).
HOTSPOT_RULES = {
    "edge_m": 500,          # hotspot centre closer than this to the box edge: unreliable (filters and model border)
    "contact_ratio": 2.0,   # share of hotspot pixels on strong surface boundaries vs the site average
    "contact_share": 0.5,
    "flat_slope_deg": 5.0,  # L-band can only see under a dry, flat, smooth cover ...
    "cband_pct": 0.40,      # ... that is dark to C-band (smooth at 5.6 cm): lowest 40 % of the site
    "texture_pct": 0.50,    # ... and shows no layered or broken rock in the optical image: lower half of the site
}

# Cell features kept in public/ml/cells.json (build_all.py)
FEATURES = {
    "slope_mean": ("Mean slope", "°", "cop_dem", "average slope in the 400 m cell"),
    "slope_p90": ("Slope, 90th percentile", "°", "cop_dem", "steepest 10 % of the cell"),
    "steep": ("Steeper than 15°", "% of cell", "cop_dem", "share of the cell a rover could not climb"),
    "relief": ("Relief within 1 km", "m", "cop_dem", "highest minus lowest point in a 1 km window"),
    "rough": ("Roughness", "m", "cop_dem", "local height variation (standard deviation, 125 m window)"),
    "bright": ("Optical brightness", "reflectance", "sentinel2", "mean of red, green, blue reflectance"),
    "red": ("Redness", "red/blue", "sentinel2", "red-to-blue reflectance ratio"),
    "lhh": ("L-band HH", "dB", "palsar2", "L-band radar backscatter"),
    "cvv": ("C-band VV", "dB", "sentinel1", "C-band radar backscatter"),
    "lmc": ("L minus C", "dB", "palsar2", "how much brighter L-band is than C-band"),
    "surprise": ("Radar surprise", "z", "ml", "L-band brighter (+) or darker (-) than the surface predicts"),
    "elev": ("Elevation", "m", "cop_dem", "mean height above sea level"),
}
