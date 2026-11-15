// Géographie. Coordonnées toujours [lat, lon]. Bornes b = [[sud, ouest], [nord, est]].

export type LatLon = [number, number];
export type Bounds = [[number, number], [number, number]];

/** rasterio donne (west, south, east, north) ; Leaflet veut [[south, west], [north, east]].
 *  À utiliser PARTOUT pour éviter le bug classique. */
export const rasterioToLeaflet = (west: number, south: number, east: number, north: number): Bounds => [
  [south, west],
  [north, east],
];

/** Centre d'une cellule (row, col) de la grille, en [lat, lon]. Ligne 0 = nord. */
export const cellToLatLon = (
  b: Bounds,
  grid: { rows: number; cols: number },
  [r, c]: [number, number],
): LatLon => [
  b[1][0] - ((r + 0.5) * (b[1][0] - b[0][0])) / grid.rows,
  b[0][1] + ((c + 0.5) * (b[1][1] - b[0][1])) / grid.cols,
];

/** Inverse : [lat, lon] -> cellule [row, col] (bornée à la grille). */
export const latLonToCell = (
  b: Bounds,
  grid: { rows: number; cols: number },
  [lat, lon]: LatLon,
): [number, number] => {
  const r = Math.floor(((b[1][0] - lat) / (b[1][0] - b[0][0])) * grid.rows);
  const c = Math.floor(((lon - b[0][1]) / (b[1][1] - b[0][1])) * grid.cols);
  return [Math.min(grid.rows - 1, Math.max(0, r)), Math.min(grid.cols - 1, Math.max(0, c))];
};

/** Longueur d'un trajet en km (distance grand cercle), jamais un nombre de cases. */
export function routeKm(pts: LatLon[]): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  let km = 0;
  for (let i = 1; i < pts.length; i++) {
    const [p1, p2] = [pts[i - 1] as LatLon, pts[i] as LatLon];
    const [a1, o1] = [rad(p1[0]), rad(p1[1])];
    const [a2, o2] = [rad(p2[0]), rad(p2[1])];
    km +=
      2 * 6371 *
      Math.asin(
        Math.sqrt(
          Math.sin((a2 - a1) / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin((o2 - o1) / 2) ** 2,
        ),
      );
  }
  return km;
}
