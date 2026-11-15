import { useMemo, useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CircleMarker, ImageOverlay, MapContainer, Rectangle, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { Bounds, LatLon } from '@/types/mission';

/** Colour ramp for a 0..1 score: dark blue -> teal -> yellow. */
function ramp(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [30, 41, 99]],
    [0.5, [32, 178, 170]],
    [1, [250, 222, 70]],
  ];
  const k = t <= 0.5 ? 0 : 1;
  const [a, ca] = stops[k] as [number, [number, number, number]];
  const [b, cb] = stops[k + 1] as [number, [number, number, number]];
  const u = (t - a) / (b - a);
  return [0, 1, 2].map((j) => Math.round(ca[j]! + (cb[j]! - ca[j]!) * u)) as [number, number, number];
}

/** Draws the site's cell scores as an image (transparent grey = filtered out by the constraints). */
function scoreImage(scores: number[], rows: number, cols: number, lo: number, hi: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(cols, rows);
  scores.forEach((v, i) => {
    const o = i * 4;
    if (Number.isNaN(v)) img.data.set([100, 116, 139, 70], o);
    else {
      const [r, g, b] = ramp(Math.min(1, Math.max(0, (v - lo) / Math.max(hi - lo, 1e-6))));
      img.data.set([r, g, b, 175], o);
    }
  });
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

function ClickToPick({ onPick }: { onPick: (p: LatLon) => void }) {
  useMapEvents({ click: (e) => onPick([e.latlng.lat, e.latlng.lng]) });
  return null;
}

export interface FinderMarker {
  coords: LatLon;
  label: string;
  kind: 'top' | 'ref' | 'similar';
}

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

/** Browser only. Bounds = [[south, west], [north, east]]. */
export default function FinderMapInner({
  bounds,
  scores,
  rows,
  cols,
  range,
  markers,
  onPick,
}: {
  bounds: Bounds;
  scores: number[];
  rows: number;
  cols: number;
  range: [number, number];
  markers: FinderMarker[];
  onPick: (p: LatLon) => void;
}) {
  const url = useMemo(() => scoreImage(scores, rows, cols, range[0], range[1]), [scores, rows, cols, range]);
  const colour = { top: '#f97316', ref: '#ffffff', similar: '#a78bfa' } as const;
  return (
    <MapContainer
      key={bounds.flat().join(',')}
      bounds={L.latLngBounds(bounds)}
      boundsOptions={{ padding: [16, 16] }}
      className="match-map"
      scrollWheelZoom={false}
      maxZoom={15}
      zoomSnap={0.25}
    >
      <FitBounds bounds={bounds} padding={16} />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Esri, Maxar, Earthstar Geographics"
        maxNativeZoom={13}
        maxZoom={15}
      />
      {url && <ImageOverlay url={url} bounds={bounds} opacity={0.8} />}
      <Rectangle bounds={bounds} pathOptions={{ color: '#2dd4bf', weight: 1.5, dashArray: '6 5', fill: false }} />
      <ClickToPick onPick={onPick} />
      {markers.map((m, i) => (
        <CircleMarker
          key={`${m.kind}-${i}`}
          center={m.coords}
          radius={m.kind === 'ref' ? 10 : 8}
          pathOptions={{ color: colour[m.kind], weight: m.kind === 'ref' ? 3 : 2, fillColor: colour[m.kind], fillOpacity: m.kind === 'ref' ? 0.1 : 0.55 }}
        >
          <Tooltip permanent={m.kind !== 'similar'} direction="top">{m.label}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
