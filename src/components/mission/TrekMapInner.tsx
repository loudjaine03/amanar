import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import type { PlanetTarget } from '@/types/mission';

/** Les tuiles NASA Trek sont sur une grille lat/lon (EPSG:4326), pas en Web Mercator.
 *  Leaflet EPSG4326 au zoom 0 = 2 tuiles x 1 pour le globe, exactement comme le niveau 0 de Trek.
 *  Vérifié dans le navigateur par l'équipe (Mars Trek, CRS EPSG4326) : 0 est la bonne valeur. Moon Trek suit la même grille. */
export const TREK_ZOOM_OFFSET = 0;

/** Chargé uniquement dans le navigateur (Leaflet a besoin de `window`). */
export default function TrekMapInner({ target, onFail }: { target: PlanetTarget; onFail: () => void }) {
  const loaded = useRef(0);
  const errors = useRef(0);
  useEffect(() => {
    // Si aucune tuile ne s'est affichée après 9 s, on bascule sur la carte schématique.
    const timer = setTimeout(() => {
      if (loaded.current === 0) onFail();
    }, 9000);
    return () => clearTimeout(timer);
  }, [onFail]);
  return (
    <MapContainer
      crs={L.CRS.EPSG4326}
      center={target.center}
      zoom={target.zoom}
      minZoom={1}
      maxZoom={8}
      className="trek-map"
      attributionControl={false}
      scrollWheelZoom={false}
    >
      <TileLayer
        url={target.tiles ?? ''}
        zoomOffset={TREK_ZOOM_OFFSET}
        maxNativeZoom={7}
        eventHandlers={{
          tileload: () => {
            loaded.current += 1;
          },
          tileerror: () => {
            errors.current += 1;
            if (errors.current >= 4 && loaded.current === 0) onFail();
          },
        }}
      />
      <CircleMarker center={target.center} radius={9} pathOptions={{ color: '#2dd4bf', weight: 2, fillOpacity: 0.3 }}>
        <Tooltip permanent direction="top">
          {target.name}
        </Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
