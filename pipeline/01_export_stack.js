// Google Earth Engine Code Editor (https://code.earthengine.google.com). Coller, changer SITE, Run, puis onglet Tasks > Run.
// Produit UN GeoTIFF par site avec 7 bandes sur la même grille de 25 m (rien à aligner ensuite).
// Ordre des bandes (le script Python en dépend) : 1 L_HH, 2 L_HV, 3 C_VV, 4 B4, 5 B3, 6 B2, 7 DEM

var SITE = 'ahnet';   // 'ahnet' | 'tassili' | 'hoggar'
var BOXES = {         // [west, south, east, north] : les boîtes réellement exportées (voir public/mission_data.json)
  ahnet:   [2.20, 26.10, 2.40, 26.28],
  tassili: [9.07, 24.92, 9.27, 25.10],
  hoggar:  [5.50, 23.21, 5.70, 23.39]
};
var box = ee.Geometry.Rectangle(BOXES[SITE]);

// L-band : JAXA PALSAR-2, mosaïque annuelle 25 m. DN -> gamma0 dB = 10*log10(DN^2) - 83
var pal = ee.ImageCollection('JAXA/ALOS/PALSAR/YEARLY/SAR_EPOCH')
  .filterDate('2022-01-01', '2023-01-01').filterBounds(box).mosaic();
var hh = pal.select('HH').pow(2).log10().multiply(10).subtract(83).rename('L_HH');
var hv = pal.select('HV').pow(2).log10().multiply(10).subtract(83).rename('L_HV');

// C-band : Sentinel-1 (déjà en dB)
var s1 = ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(box)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filterDate('2024-01-01', '2025-12-31').select(['VV']).median().rename('C_VV');

// Optique : Sentinel-2, médiane peu nuageuse
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(box)
  .filterDate('2024-01-01', '2025-12-31')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
  .median().select(['B4', 'B3', 'B2']);

// Altitude : Copernicus DEM 30 m
var dem = ee.ImageCollection('COPERNICUS/DEM/GLO30').filterBounds(box).select('DEM').mosaic();

var stack = hh.addBands(hv).addBands(s1).addBands(s2).addBands(dem).toFloat();
Map.centerObject(box, 12);
Map.addLayer(hh, {min: -25, max: 0}, 'L-band HH');   // REGARDER avant d'exporter ; si trop bruité, essayer 2021 ou 2023

Export.image.toDrive({
  image: stack, description: SITE + '_stack', folder: 'abe',
  region: box, crs: 'EPSG:4326', scale: 25, maxPixels: 1e9
});
