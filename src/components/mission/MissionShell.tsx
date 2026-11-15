import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Logo } from "./Logo";
import { useMissionStore } from "@/lib/mission-store";
import { getMissionData } from "@/lib/api";
import { TARGETS, type TargetId } from "@/types/mission";
import "./app.css";

export const missionSteps = [
  { path: "/plan", key: "plan", label: "Plan", number: "1" },
  { path: "/compare", key: "compare", label: "Compare", number: "2" },
  { path: "/site", key: "site", label: "Site", number: "3" },
  { path: "/rehearse", key: "rehearse", label: "Rehearse", number: "4" },
] as const;

export const TARGET_SHORT: Record<TargetId, string> = {
  jezero: "Jezero",
  gale: "Gale",
  moon_south: "Moon pole",
};

/** Loads mission_data.json once for the whole app. */
export function useMissionData() {
  const data = useMissionStore((s) => s.missionData);
  const error = useMissionStore((s) => s.loadError);
  useEffect(() => {
    if (data || error) return;
    getMissionData()
      .then((missionData) => useMissionStore.setState({ missionData }))
      .catch((e: Error) => useMissionStore.setState({ loadError: e.message }));
  }, [data, error]);
  return { data, error };
}

export function MissionShell({ children }: { children: ReactNode }) {
  useMissionData();
  const target = useMissionStore((s) => s.target);
  const setTarget = useMissionStore((s) => s.setTarget);
  const pathname = useLocation({ select: (l) => l.pathname });
  useEffect(() => {
    useMissionStore.setState({ month: new Date().getMonth() + 1 });
  }, []);
  const body = target === "moon_south" ? "moon" : "mars";
  return (
    <div className="mission-app" data-body={body}>
      <header className="mission-header">
        <div className="header-inner">
          <Link to="/" aria-label="Amanar, Algeria Beyond Earth">
            <Logo />
          </Link>
          <nav className="stepper" aria-label="Steps">
            {missionSteps.map((step, i) => (
              <span key={step.key} className="flex items-center gap-3">
                <Link
                  className="step-link"
                  to={step.path}
                  data-active={pathname === step.path}
                  aria-current={pathname === step.path ? "step" : undefined}
                >
                  <span className="step-number">{step.number}</span>
                  {step.label}
                </Link>
                {i < missionSteps.length - 1 && <span className="step-connector" />}
              </span>
            ))}
          </nav>
          <div className="target-switch" role="group" aria-label="Destination">
            {TARGETS.map((t) => (
              <button
                key={t}
                type="button"
                data-selected={target === t}
                aria-pressed={target === t}
                onClick={() => setTarget(t)}
              >
                {TARGET_SHORT[t]}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="disclaimer">
        <AlertTriangle />
        Team-built experimental indicators, not an official NASA assessment. Every number carries a
        tag that says where it comes from.
      </div>
      <main>{children}</main>
      <footer className="mission-footer">
        <div className="footer-sources">
          <span>DATA</span>
          Mars: USGS/NASA CTX DTM (Jezero), NASA-AMMOS MMGIS (Gale), MOLA · Moon: LRO LOLA (NASA) ·
          Earth: JAXA PALSAR-2, Copernicus Sentinel-1/2 & DEM, NASA POWER · Basemap: Esri
        </div>
        <Link to="/method" className="flex items-center gap-2 hover:text-radar">
          Method & limits
          <ArrowRight className="size-3" />
        </Link>
        <span>TEAM HOGGAR · NASA SPACE APPS 2026 · BOUMERDES</span>
      </footer>
    </div>
  );
}

/** Shared loading / error block for the pages. */
export function DataGate({ error }: { error: string | null }) {
  return (
    <div className="empty-state">
      <p>{error ? `Mission data could not be loaded (${error}).` : "Loading mission data…"}</p>
    </div>
  );
}
