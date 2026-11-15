import { createFileRoute } from "@tanstack/react-router";
import { SitePage } from "@/components/mission/SitePage";
import { missionHead } from "@/lib/mission-head";

export const Route = createFileRoute("/site")({
  head: () =>
    missionHead(
      "3 Site",
      "Where inside an Algerian site the terrain looks most like Mars or the Moon, what can be tested there, and checked radar hotspots.",
    ),
  component: SitePage,
});
