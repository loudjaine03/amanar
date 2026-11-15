import { describe, it, expect } from "vitest";
import { astar, astarVia, type SlopeGrid } from "@/lib/astar";
import { cellToLatLon, latLonToCell, routeKm, rasterioToLeaflet, type Bounds } from "@/lib/geo";

const flat = (n: number, v = 1): SlopeGrid => ({
  cols: n,
  rows: n,
  slope: Array(n * n).fill(v),
  maxSlope: 15,
});

describe("astar", () => {
  it("trouve un chemin sur terrain plat", () => {
    const p = astar(flat(10), [0, 0], [9, 9]);
    expect(p[0]).toEqual([0, 0]);
    expect(p[p.length - 1]).toEqual([9, 9]);
  });
  it("contourne un mur de cases trop raides par l’ouverture", () => {
    const g = flat(10);
    for (let r = 0; r < 9; r++) g.slope[r * 10 + 5] = 30; // mur colonne 5, ouverture en bas
    const p = astar(g, [0, 0], [0, 9]);
    expect(p.length).toBeGreaterThan(0);
    expect(p.some(([r]) => r === 9)).toBe(true);
    expect(p.every(([r, c]) => (g.slope[r * 10 + c] ?? 99) <= 15)).toBe(true);
  });
  it("retourne [] quand aucune route sûre n’existe", () => {
    const g = flat(10);
    for (let r = 0; r < 10; r++) g.slope[r * 10 + 5] = 30; // mur complet
    expect(astar(g, [0, 0], [0, 9])).toEqual([]);
  });
  it("retourne [] si départ ou arrivée est trop raide", () => {
    const g = flat(5);
    g.slope[0] = 40;
    expect(astar(g, [0, 0], [4, 4])).toEqual([]);
  });
  it("ne coupe pas un coin entre deux murs", () => {
    const g = flat(3);
    g.slope[1] = 30; // (0,1)
    g.slope[3] = 30; // (1,0)
    expect(astar(g, [0, 0], [1, 1])).toEqual([]);
  });
  it("astarVia enchaîne les waypoints dans l’ordre", () => {
    const p = astarVia(flat(10), [
      [0, 0],
      [5, 5],
      [9, 9],
    ]);
    expect(p).toContainEqual([5, 5]);
    expect(p[p.length - 1]).toEqual([9, 9]);
  });
});

describe("geo", () => {
  const b: Bounds = [
    [26.1, 2.2],
    [26.28, 2.4],
  ];
  it("ligne 0 = bord nord, colonne 0 = bord ouest", () => {
    const [lat, lon] = cellToLatLon(b, { rows: 160, cols: 160 }, [0, 0]);
    expect(lat).toBeGreaterThan(26.27);
    expect(lon).toBeLessThan(2.21);
  });
  it("cellToLatLon puis latLonToCell redonne la même cellule", () => {
    const grid = { rows: 160, cols: 160 };
    expect(latLonToCell(b, grid, cellToLatLon(b, grid, [80, 40]))).toEqual([80, 40]);
  });
  it("routeKm : 1° de latitude ≈ 111,2 km", () => {
    expect(
      routeKm([
        [26, 2],
        [27, 2],
      ]),
    ).toBeCloseTo(111.19, 1);
  });
  it("rasterioToLeaflet convertit (W,S,E,N) en [[S,W],[N,E]]", () => {
    expect(rasterioToLeaflet(2.2, 26.1, 2.4, 26.28)).toEqual([
      [26.1, 2.2],
      [26.28, 2.4],
    ]);
  });
});
