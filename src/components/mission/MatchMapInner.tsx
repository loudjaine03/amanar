import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CircleMarker, ImageOverlay, MapContainer, Rectangle, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { Anomaly, Bounds } from '@/types/mission';

/** Leaflet measures its container once; if layout was not final yet, the box ends up tiny. Re-measure and refit. */
function FitBounds({ bounds, padding }: { bounds: Bounds; padding: number }) {
  const map = useMap();
  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(bounds), { padding: [padding, padding] });
    };
    const t = setTimeout(fit, 120);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize()) : null;
    ro?.observe(map.getContainer());
    return () => {
      clearTimeout(t);
      ro?.disconnect();
    };
  }, [map, bounds, padding]);
  return null;
}

/** Chargé uniquement dans le navigateur. Fond satellite Esri + cadre de 20 km + PNG sur les bornes exactes.
 *  Bornes = [[sud, ouest], [nord, est]] (format Leaflet). */
export default function MatchMapInner({
  bounds,
  layerUrl,
  opacity,
  anomaliesUrl,
  anomalies,
}: {
  bounds: Bounds;
  layerUrl: string | null; // null = image pas encore disponible
  opacity: number;
  anomaliesUrl: string | null; // null = case décochée ou image absente
  anomalies: Anomaly[] | null; // null = case décochée
}) {
  const box = L.latLngBounds(bounds);
  return (
    <MapContainer
      key={bounds.flat().join(',')}
      bounds={box}
      boundsOptions={{ padding: [24, 24] }}
      className="match-map"
      scrollWheelZoom={false}
      maxZoom={15}
      zoomSnap={0.25}
    >
      <FitBounds bounds={bounds} padding={24} />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Esri, Maxar, Earthstar Geographics"
        maxNativeZoom={13}
        maxZoom={15}
      />
      {layerUrl && <ImageOverlay key={layerUrl} url={layerUrl} bounds={bounds} opacity={opacity} />}
      {anomaliesUrl && <ImageOverlay key={anomaliesUrl} url={anomaliesUrl} bounds={bounds} opacity={1} />}
      <Rectangle bounds={bounds} pathOptions={{ color: '#2dd4bf', weight: 1.5, dashArray: '6 5', fill: false }} />
      {anomalies?.map((a) => (
        <CircleMarker key={a.id} center={a.coords} radius={7} pathOptions={{ color: '#ef4444', weight: 2, fillOpacity: 0.25 }}>
          <Tooltip direction="top">{a.id}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
