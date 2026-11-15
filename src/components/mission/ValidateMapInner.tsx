import { useMemo, useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  CircleMarker,
  ImageOverlay,
  MapContainer,
  Polyline,
  Rectangle,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { GridFile } from "@/lib/stage3";
import type { Bounds, LatLon, Waypoint } from "@/types/mission";

/** Dessine la grille de pente en image : vert/jaune = praticable, rouge = plus raide que la limite (mur). */
function slopeImage(grid: GridFile, limit: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = grid.cols;
  canvas.height = grid.rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(grid.cols, grid.rows);
  grid.slope.forEach((s, i) => {
    const o = i * 4;
    if (s > limit) {
      img.data.set([239, 68, 68, 150], o);
    } else {
      const t = Math.min(s / limit, 1);
      img.data.set(
        [
          Math.round(34 + 216 * t),
          Math.round(197 + 7 * t),
          Math.round(94 - 73 * t),
          Math.round(55 + 70 * t),
        ],
        o,
      );
    }
  });
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

function ClickToPick({ onPick }: { onPick: (p: LatLon) => void }) {
  useMapEvents({ click: (e) => onPick([e.latlng.lat, e.latlng.lng]) });
  return null;
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
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => map.invalidateSize()) : null;
    ro?.observe(map.getContainer());
    return () => {
      clearTimeout(t);
      ro?.disconnect();
    };
  }, [map, bounds, padding]);
  return null;
}

/** Chargé uniquement dans le navigateur. Bornes = [[sud, ouest], [nord, est]]. */
export default function ValidateMapInner({
  bounds,
  grid,
  limit,
  start,
  waypoints,
  route,
  rover,
  onPick,
}: {
  bounds: Bounds;
  grid: GridFile;
  limit: number;
  start: LatLon;
  waypoints: Waypoint[];
  route: LatLon[];
  rover: LatLon | null;
  onPick: (p: LatLon) => void;
}) {
  const url = useMemo(() => slopeImage(grid, limit), [grid, limit]);
  return (
    <MapContainer
      key={bounds.flat().join(",")}
      bounds={L.latLngBounds(bounds)}
      boundsOptions={{ padding: [10, 10] }}
      className="match-map"
      scrollWheelZoom={false}
      maxZoom={15}
      zoomSnap={0.25}
    >
      <FitBounds bounds={bounds} padding={10} />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Esri, Maxar, Earthstar Geographics"
        maxNativeZoom={13}
        maxZoom={15}
      />
      {url && <ImageOverlay url={url} bounds={bounds} opacity={0.7} />}
      <Rectangle
        bounds={bounds}
        pathOptions={{ color: "#2dd4bf", weight: 1.5, dashArray: "6 5", fill: false }}
      />
      <ClickToPick onPick={onPick} />
      {route.length > 1 && (
        <Polyline
          positions={route}
          pathOptions={{ color: "#ffffff", weight: 3, dashArray: "2 7", lineCap: "round" }}
        />
      )}
      <CircleMarker
        center={start}
        radius={7}
        pathOptions={{ color: "#22c55e", weight: 2, fillOpacity: 0.9 }}
      >
        <Tooltip direction="top">Start</Tooltip>
      </CircleMarker>
      {waypoints.map((w) => (
        <CircleMarker
          key={w.id}
          center={w.coords}
          radius={6}
          pathOptions={{ color: "#38bdf8", weight: 2, fillOpacity: 0.8 }}
        >
          <Tooltip permanent direction="right">
            {w.id}
          </Tooltip>
        </CircleMarker>
      ))}
      {rover && (
        <CircleMarker
          center={rover}
          radius={9}
          pathOptions={{ color: "#f97316", weight: 3, fillColor: "#fdba74", fillOpacity: 1 }}
        >
          <Tooltip direction="top">Rover</Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
