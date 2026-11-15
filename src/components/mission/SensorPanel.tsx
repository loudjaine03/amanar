import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Gauge } from "lucide-react";
import { TagChip } from "./TagChip";
import { DEFAULT_ROVER, type Rover } from "@/lib/materials";
import {
  elevGridFor,
  readings,
  routeProfile,
  targetKPaFor,
  type ProfilePoint,
} from "@/lib/sensors";
import { loadTwinModel, type TwinModel } from "@/lib/twins";
import type { GridFile } from "@/lib/stage3";
import type { LatLon } from "@/lib/geo";
import type { MissionData, SiteId, TargetId } from "@/types/mission";

const W = 600;
const H = 120;
const PAD = 6;

/** One small line chart: one measure along the route (one axis only). */
function Profile({
  pts,
  pick,
  unit,
  label,
  limit,
  cursor,
  onCursor,
}: {
  pts: ProfilePoint[];
  pick: (p: ProfilePoint) => number;
  unit: string;
  label: string;
  limit?: number;
  cursor: number | null;
  onCursor: (i: number | null) => void;
}) {
  const vals = pts.map(pick);
  const maxKm = pts[pts.length - 1]?.km || 1;
  let lo = Math.min(...vals, limit ?? Infinity);
  let hi = Math.max(...vals, limit ?? -Infinity);
  if (hi - lo < 1) {
    hi += 0.5;
    lo -= 0.5;
  }
  const x = (km: number) => PAD + ((W - 2 * PAD) * km) / maxKm;
  const y = (v: number) => H - PAD - ((H - 2 * PAD) * (v - lo)) / (hi - lo);
  const d = pts
    .map((p, i) => `${i ? "L" : "M"}${x(p.km).toFixed(1)},${y(vals[i]!).toFixed(1)}`)
    .join("");
  const move = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const km = ((e.clientX - r.left) / r.width) * maxKm;
    let best = 0;
    for (let i = 1; i < pts.length; i++)
      if (Math.abs(pts[i]!.km - km) < Math.abs(pts[best]!.km - km)) best = i;
    onCursor(best);
  };
  const c = cursor !== null ? pts[cursor] : null;
  return (
    <figure className="profile">
      <figcaption>
        <b>{label}</b>
        <span>
          {Math.round(lo * 10) / 10} to {Math.round(hi * 10) / 10} {unit}
        </span>
      </figcaption>
      <div className="profile-plot" onMouseMove={move} onMouseLeave={() => onCursor(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} className="profile-grid" />
          ))}
          {limit !== undefined && (
            <line x1={0} x2={W} y1={y(limit)} y2={y(limit)} className="profile-limit" />
          )}
          <path d={d} className="profile-line" />
          {c && <line x1={x(c.km)} x2={x(c.km)} y1={0} y2={H} className="profile-cursor" />}
        </svg>
        {c && (
          <span
            className="profile-dot"
            style={{ left: `${(100 * x(c.km)) / W}%`, top: `${(100 * y(pick(c))) / H}%` }}
          />
        )}
        {c && (
          <span className="profile-tip" style={{ left: `${Math.min(80, (100 * x(c.km)) / W)}%` }}>
            {c.km.toFixed(2)} km · {Math.round(pick(c) * 10) / 10} {unit}
          </span>
        )}
      </div>
    </figure>
  );
}

/** Simulated pressure sensors (barometer, wheel load cells, tilt) along the planned route. */
export function SensorPanel({
  data,
  target,
  sid,
  grid,
  points,
  rover,
  slopeLimit,
}: {
  data: MissionData;
  target: TargetId;
  sid: SiteId;
  grid: GridFile;
  points: LatLon[];
  rover: LatLon | null;
  slopeLimit: number;
}) {
  const [model, setModel] = useState<TwinModel | null>(null);
  const [spec, setSpec] = useState<Rover>(DEFAULT_ROVER);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void loadTwinModel().then((m) => alive && setModel(m));
    return () => {
      alive = false;
    };
  }, []);
  const t = data.targets[target];
  const env = data.meta.env[t.body];
  const eg = useMemo(() => (model ? elevGridFor(model, sid) : null), [model, sid]);
  const pts = useMemo(
    () => (eg && points.length > 1 ? routeProfile(points, grid, eg) : []),
    [eg, points, grid],
  );
  if (!pts.length) return null;
  const roverIdx = rover ? points.findIndex((p) => p[0] === rover[0] && p[1] === rover[1]) : -1;
  const idx = hover ?? (roverIdx >= 0 ? roverIdx : 0);
  const p = pts[idx]!;
  const tKPa = targetKPaFor(t, env, t.body);
  const r = readings(p, spec, env.gravity, tKPa);
  const where = t.body === "moon" ? "the Moon" : "Mars";
  const set = (k: keyof Rover) => (e: { target: { value: string } }) =>
    setSpec((s) => ({ ...s, [k]: Number(e.target.value) }));
  const tgtText = t.body === "moon" ? "≈ 0 kPa (vacuum)" : `${tKPa.toFixed(2)} kPa`;

  return (
    <section className="match-panel sensor-panel">
      <div className="panel-title">
        <Gauge className="inline-icon" /> Simulated pressure sensors on the rover{" "}
        <TagChip tag="Judgement" source="isa" />
      </div>
      <p className="map-caption">
        {hover !== null
          ? "Readings where your pointer is on the profile."
          : rover
            ? "Live readings at the rover while it drives."
            : "Readings at the start. Press Drive to see them change along the route."}{" "}
        Computed from elevation, slope and your rover settings: what the real sensors should read in
        the field.
      </p>
      <div className="sensor-grid2">
        <div className="sensor-card">
          <small>Barometer</small>
          <b>{r.earthKPa.toFixed(1)} kPa</b>
          <span>
            at {Math.round(p.elev)} m here · on {t.title}: {tgtText}
          </span>
          <span className="sensor-note">
            {t.body === "moon"
              ? "No air at all: seals and suits need a vacuum chamber."
              : `${Math.round(r.earthKPa / r.targetKPa)}× more air than on ${where}: seals and suits need a chamber.`}
          </span>
        </div>
        <div className="sensor-card">
          <small>Tilt (IMU)</small>
          <b>{r.tiltDeg.toFixed(1)}°</b>
          <span>slope under the rover · your limit {slopeLimit}°</span>
          <span className="sensor-note">
            Downhill pull on the whole rover: {Math.round(r.downslopeN)} N (brakes must hold it).
          </span>
        </div>
        <div className="sensor-card">
          <small>Wheel load cell (each wheel)</small>
          <b>{Math.round(r.wheelN)} N</b>
          <span>
            Earth twin rover of {Math.round(r.twinMassKg)} kg = the {spec.massKg} kg rover on{" "}
            {where}
          </span>
          <span className="sensor-note">
            The full {spec.massKg} kg rover would press {Math.round(r.fullMassWheelN)} N here (
            {(r.fullMassWheelN / r.wheelN).toFixed(1)}× too much): that is why JPL tested a lighter
            twin (Scarecrow).
          </span>
        </div>
        <div className="sensor-card">
          <small>Ground pressure under a wheel</small>
          <b>{r.groundKPa.toFixed(1)} kPa</b>
          <span>
            {spec.wheelWidthM * 100} cm wide × {spec.contactLengthM * 100} cm footprint (our
            assumption)
          </span>
          <span className="sensor-note">
            Compare with a cone penetrometer at each stop: if the ground is weaker, wheels sink{" "}
            <TagChip tag="Hypothesis" />
          </span>
        </div>
      </div>

      <div className="profile-row">
        <Profile
          pts={pts}
          pick={(q) => q.elev}
          unit="m"
          label="Elevation along the route (barometer follows it)"
          cursor={hover ?? (roverIdx >= 0 ? roverIdx : null)}
          onCursor={setHover}
        />
        <Profile
          pts={pts}
          pick={(q) => q.slope}
          unit="°"
          label="Slope along the route (dashed: your limit)"
          limit={slopeLimit}
          cursor={hover ?? (roverIdx >= 0 ? roverIdx : null)}
          onCursor={setHover}
        />
      </div>

      <details className="rules-box">
        <summary>Rover settings (change them)</summary>
        <div className="rover-form">
          <label className="slider-row">
            <span>
              Rover mass on {where}: <b>{spec.massKg} kg</b>
            </span>
            <input
              type="range"
              min={100}
              max={1500}
              step={25}
              value={spec.massKg}
              onChange={set("massKg")}
            />
          </label>
          <label className="slider-row">
            <span>
              Wheels: <b>{spec.wheels}</b>
            </span>
            <input
              type="range"
              min={4}
              max={8}
              step={2}
              value={spec.wheels}
              onChange={set("wheels")}
            />
          </label>
          <label className="slider-row">
            <span>
              Wheel width: <b>{Math.round(spec.wheelWidthM * 100)} cm</b>
            </span>
            <input
              type="range"
              min={0.15}
              max={0.6}
              step={0.05}
              value={spec.wheelWidthM}
              onChange={set("wheelWidthM")}
            />
          </label>
          <label className="slider-row">
            <span>
              Footprint length: <b>{Math.round(spec.contactLengthM * 100)} cm</b>
            </span>
            <input
              type="range"
              min={0.05}
              max={0.25}
              step={0.01}
              value={spec.contactLengthM}
              onChange={set("contactLengthM")}
            />
          </label>
        </div>
        <p className="map-caption">
          Default: 1,025 kg rover (Perseverance class), six wheels 40 cm wide like Curiosity&apos;s,
          10 cm footprint (assumption). Gravity {env.gravity} m/s² on {where}{" "}
          <TagChip tag="Reference" source={env.source} />. Elevation: 400 m Copernicus DEM cells,
          interpolated; air pressure: standard atmosphere on Earth, NSSDC mean pressure and 11.1 km
          scale height on Mars, at the middle of the {t.title} elevation range.
        </p>
      </details>
    </section>
  );
}
