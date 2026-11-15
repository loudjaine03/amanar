import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Mountain, Gem, Radar, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Starfield } from "@/components/mission/Starfield";
import { DataGate, useMissionData } from "@/components/mission/MissionShell";
import { useMissionStore } from "@/lib/mission-store";
import { missionHead } from "@/lib/mission-head";
import { TARGETS, type TargetId } from "@/types/mission";

export const Route = createFileRoute("/")({
  head: () =>
    missionHead(
      "Algeria Beyond Earth",
      "Which Algerian desert site is the best place on Earth to rehearse a Mars or Moon mission? Measured with real Mars and Moon elevation data.",
    ),
  component: Index,
});

function Index() {
  const { data, error } = useMissionData();
  const setTarget = useMissionStore((s) => s.setTarget);
  const target = useMissionStore((s) => s.target);
  const navigate = useNavigate();
  const go = (t: TargetId) => {
    setTarget(t);
    void navigate({ to: "/plan" });
  };
  return (
    <>
      <section className="hero hero-short">
        <Starfield />
        <div className="hero-grid" />
        <div className="hero-content">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            NASA Space Apps 2026 · Earth terrain analogs for Mars and the lunar south pole
          </div>
          <h1>
            AMANAR<span>ALGERIA BEYOND EARTH</span>
          </h1>
          <p className="hero-lead">
            Which Algerian desert is the best place on Earth to rehearse a <b>Mars</b> or{" "}
            <b>Moon</b> mission? We measure it: the same terrain measures on real Mars and Moon
            elevation data and on our three Sahara sites.
          </p>
          <p className="hero-amanar">
            Amanar is the Tuareg name for Orion, &ldquo;the guide&rdquo; of desert nights.
          </p>
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <div className="section-label">STEP 1 · CHOOSE A DESTINATION</div>
            <h2>Where is the mission going?</h2>
          </div>
        </div>
        {!data ? (
          <DataGate error={error} />
        ) : (
          <div className="dest-cards">
            {TARGETS.map((id) => {
              const t = data.targets[id];
              const best = t.ranking[0]!;
              return (
                <button
                  key={id}
                  type="button"
                  className="instrument dest-card"
                  onClick={() => go(id)}
                >
                  <div className="dest-img">
                    <img
                      src={t.dem.slope_image}
                      alt={`Slope map of ${t.title} from ${t.dem.product}`}
                    />
                    <span>
                      {t.dem.size_km[0]} × {t.dem.size_km[1]} km · real elevation data
                    </span>
                  </div>
                  <div className="dest-body">
                    <span className="dest-kicker">{t.short}</span>
                    <strong>{t.title}</strong>
                    <p>{t.goal}</p>
                    <p className="dest-mission">{t.mission}</p>
                    <div className="dest-result">
                      <small>Closest Algerian terrain</small>
                      <b>{data.sites[best].name}</b>
                      <em>{t.sites[best].score}/100</em>
                      <small className="dest-zones">
                        {t.twins.parts.length > 1
                          ? `ML twin map: ${t.twins.parts.map((p) => `${data.sites[p.site].name.split(" ")[0]} ${p.share}%`).join(" · ")}`
                          : `ML twin map: ${data.sites[t.twins.parts[0]?.site ?? best].name.split(" ")[0]} ${t.twins.share[t.twins.parts[0]?.site ?? best]}% of the map`}
                      </small>
                    </div>
                    <span className="dest-go">
                      Plan a test here <ArrowRight />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="content-section how-section">
        <div className="section-heading">
          <div>
            <div className="section-label">HOW IT WORKS</div>
            <h2>Three questions, kept separate.</h2>
          </div>
        </div>
        <div className="how-grid">
          <div>
            <Mountain />
            <h3>Is the ground shaped the same?</h3>
            <p>
              Six terrain measures (slope, steep ground, roughness, relief) computed the same way on
              NASA/USGS elevation data of Mars and the Moon and on the Copernicus elevation data of
              our sites. The score is how much they overlap.
            </p>
          </div>
          <div>
            <Gem />
            <h3>Is the geology alike?</h3>
            <p>
              A team reading of published geology, one cited sentence per site: processes and
              setting, not rock chemistry. It never changes the terrain score: it changes the label
              (&ldquo;Partial&rdquo;, &ldquo;Terrain only&rdquo;, &hellip;).
            </p>
          </div>
          <div>
            <Radar />
            <h3>Radar anomaly screening</h3>
            <p>
              A model predicts L-band radar from the surface and flags where it is brighter than
              expected. Four checks remove the usual artefacts. Unverified candidates for a
              subsurface survey, not discoveries.
            </p>
          </div>
        </div>
        <div className="honest-strip">
          <ShieldAlert />
          <p>
            <b>What no Earth site can give:</b> Mars or Moon gravity, near-vacuum, radiation, and
            the polar Sun on the horizon. Each site page lists what to test here and what needs a
            lab.
          </p>
          <Button variant="mission" asChild>
            <Link to="/plan">
              Plan a test for {data ? data.targets[target].title : "Jezero"} <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
