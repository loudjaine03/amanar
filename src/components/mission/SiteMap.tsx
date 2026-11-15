import { lazy, Suspense } from "react";
import { useHydrated } from "@tanstack/react-router";
import type { Bounds, Hotspot, Spot } from "@/types/mission";

// Leaflet only exists in the browser: load it on demand, never on the server.
const Inner = lazy(() => import("./SiteMapInner"));

export function SiteMap(props: {
  bounds: Bounds;
  overlay: string | null;
  opacity: number;
  bestArea: Bounds | null;
  spots: Spot[];
  hotspots: Hotspot[];
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
