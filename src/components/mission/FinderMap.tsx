import { lazy, Suspense } from 'react';
import { useHydrated } from '@tanstack/react-router';
import type { Bounds, LatLon } from '@/types/mission';
import type { FinderMarker } from './FinderMapInner';

const Inner = lazy(() => import('./FinderMapInner'));

export function FinderMap(props: {
  bounds: Bounds;
  scores: number[];
  rows: number;
  cols: number;
  range: [number, number];
  markers: FinderMarker[];
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
