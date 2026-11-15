import { lazy, Suspense } from "react";
import { useHydrated } from "@tanstack/react-router";
import type { GridFile } from "@/lib/stage3";
import type { Bounds, LatLon, Waypoint } from "@/types/mission";

// Leaflet n'existe que dans le navigateur : chargement à la demande, jamais sur le serveur.
const Inner = lazy(() => import("./ValidateMapInner"));

export function ValidateMap(props: {
  bounds: Bounds;
  grid: GridFile;
  limit: number;
  start: LatLon;
  waypoints: Waypoint[];
  route: LatLon[];
  rover: LatLon | null;
  onPick: (p: LatLon) => void;
}) {
  const hydrated = useHydrated();
  const wait = <div className="match-map match-map-wait">…</div>;
  if (!hydrated) return wait;
  return (
    <Suspense fallback={wait}>
      <Inner {...props} />
    </Suspense>
  );
}
