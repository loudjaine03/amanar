import { useHydrated } from '@tanstack/react-router';
import { useMissionStore } from '@/lib/mission-store';
import type { PlanetTarget } from '@/types/mission';
import './mission-extras.css';

const TEXT = {
  en: { loading: 'Loading map…', failed: 'NASA Trek tiles did not load. Schematic location only.', 'no-tiles': 'No tile URL for this body yet. Schematic location only.', lon: 'lon', lat: 'lat' },
  fr: { loading: 'Chargement de la carte…', failed: 'Les tuiles NASA Trek ne se sont pas chargées. Position schématique seulement.', 'no-tiles': 'Pas encore d’URL de tuiles pour ce corps. Position schématique seulement.', lon: 'lon', lat: 'lat' },
} as const;

/** Carte schématique (grille lat/lon + repère) quand les tuiles Trek ne sont pas disponibles.
 *  Ce n'est PAS une image satellite : elle l'indique. */
export function TrekFallback({ target, reason }: { target: PlanetTarget; reason: 'loading' | 'failed' | 'no-tiles' }) {
  const language = useMissionStore((s) => s.language);
  const hydrated = useHydrated();
  const t = TEXT[hydrated && language === 'fr' ? 'fr' : 'en'];
  const [lat, lon] = target.center;
  const x = lon + 180;
  const y = 90 - lat;
  return (
    <div className="trek-fallback" role="img" aria-label={`${target.name}: ${lat.toFixed(2)}, ${lon.toFixed(2)}`}>
      <svg viewBox="0 0 360 180" preserveAspectRatio="xMidYMid meet">
        {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((v) => (
          <line key={`m${v}`} x1={v + 180} y1="0" x2={v + 180} y2="180" className="grid-line" />
        ))}
        {[-60, -30, 0, 30, 60].map((v) => (
          <line key={`p${v}`} x1="0" y1={90 - v} x2="360" y2={90 - v} className="grid-line" />
        ))}
        <line x1="0" y1="90" x2="360" y2="90" className="grid-line equator" />
        <circle cx={x} cy={y} r="9" className="marker-ring" />
        <circle cx={x} cy={y} r="2.6" className="marker-dot" />
        <text x={Math.min(x + 12, 250)} y={y - 8} className="marker-label">{target.name}</text>
        <text x={Math.min(x + 12, 250)} y={y + 2} className="marker-coords">{`${t.lat} ${lat.toFixed(2)}°, ${t.lon} ${lon.toFixed(2)}°`}</text>
      </svg>
      <p>{t[reason]}</p>
    </div>
  );
}
