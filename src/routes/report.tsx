import { createFileRoute } from "@tanstack/react-router";
import { Report } from "@/components/mission/Report";
import { missionHead } from "@/lib/mission-head";

export const Route = createFileRoute("/report")({
  head: () =>
    missionHead(
      "Results report",
      "Printable results: your plan, the comparison, the twin map, materials, crew safety and sources. Save as PDF.",
    ),
  component: Report,
});
