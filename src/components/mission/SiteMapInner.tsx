import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  CircleMarker,
  ImageOverlay,
  MapContainer,
  Rectangle,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { Bounds, Hotspot, Spot } from "@/types/mission";

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

/** Browser only. Esri satellite basemap, the 20 km box, one overlay, the best 4 km area, look-alike spots and radar hotspots. */
export default function SiteMapInner({
  bounds,
  overlay,
  opacity,
  bestArea,
  spots,
  hotspots,
}: {
  bounds: Bounds;
  overlay: string | null;
  opacity: number;
  bestArea: Bounds | null;
  spots: Spot[];
  hotspots: Hotspot[];
}) {
  return (
    <MapContainer
      key={bounds.flat().join(",")}
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
      {overlay && <ImageOverlay key={overlay} url={overlay} bounds={bounds} opacity={opacity} />}
      <Rectangle
        bounds={bounds}
        pathOptions={{ color: "#2dd4bf", weight: 1.5, dashArray: "6 5", fill: false }}
      />
      {bestArea && (
        <Rectangle bounds={bestArea} pathOptions={{ color: "#facc15", weight: 2, fill: false }}>
          <Tooltip direction="top">Best 4 km area</Tooltip>
        </Rectangle>
      )}
      {hotspots.map((h) => (
        <CircleMarker
          key={h.id}
          center={h.coords}
          radius={h.verdict === "candidate" ? 7 : 4}
          pathOptions={
            h.verdict === "candidate"
              ? { color: "#22c55e", weight: 2, fillOpacity: 0.35 }
              : { color: "#f87171", weight: 1, fillOpacity: 0.15 }
          }
        >
          <Tooltip direction="top">
            {h.id}:{" "}
            {h.verdict === "candidate" ? "passes all 4 checks" : (h.reasons[0] ?? "doubtful")}
          </Tooltip>
        </CircleMarker>
      ))}
      {spots.map((s, i) => (
        <CircleMarker
          key={s.id}
          center={s.coords}
          radius={9}
          pathOptions={{ color: "#f97316", weight: 2, fillColor: "#f97316", fillOpacity: 0.85 }}
        >
          <Tooltip permanent direction="right" className="spot-tip">
            {i + 1}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
