import { createFileRoute } from "@tanstack/react-router";
import { Compare } from "@/components/mission/Compare";
import { missionHead } from "@/lib/mission-head";

export const Route = createFileRoute("/compare")({
  head: () =>
    missionHead(
      "2 Compare",
      "Measured terrain match between real Mars/Moon elevation data and three Algerian Sahara sites, with geology checks.",
    ),
  component: Compare,
});
