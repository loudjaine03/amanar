import { lazy, Suspense, useCallback, useState } from 'react';
import { useHydrated } from '@tanstack/react-router';
import type { PlanetTarget } from '@/types/mission';
import { TrekFallback } from './TrekFallback';

// Leaflet n'existe que dans le navigateur : on le charge à la demande, jamais sur le serveur.
const Inner = lazy(() => import('./TrekMapInner'));

/** Carte NASA Trek de la cible, avec repli automatique sur une carte schématique. */
export function TrekMap({ target }: { target: PlanetTarget }) {
  const hydrated = useHydrated();
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);
  if (!target.tiles) return <TrekFallback target={target} reason="no-tiles" />;
  if (failed) return <TrekFallback target={target} reason="failed" />;
  if (!hydrated) return <TrekFallback target={target} reason="loading" />;
  return (
    <Suspense fallback={<TrekFallback target={target} reason="loading" />}>
      <Inner target={target} onFail={onFail} />
    </Suspense>
  );
}
