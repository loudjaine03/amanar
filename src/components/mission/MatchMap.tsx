import { lazy, Suspense } from 'react';
import { useHydrated } from '@tanstack/react-router';
import type { Anomaly, Bounds } from '@/types/mission';

// Leaflet n'existe que dans le navigateur : chargement à la demande, jamais sur le serveur.
const Inner = lazy(() => import('./MatchMapInner'));

export function MatchMap(props: {
  bounds: Bounds;
  layerUrl: string | null;
  opacity: number;
  anomaliesUrl: string | null;
  anomalies: Anomaly[] | null;
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
