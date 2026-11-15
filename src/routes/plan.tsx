import { createFileRoute } from "@tanstack/react-router";
import { Plan } from "@/components/mission/Plan";
import { missionHead } from "@/lib/mission-head";

export const Route = createFileRoute("/plan")({
  head: () =>
    missionHead(
      "1 Plan",
      "Choose a destination, a test and your limits: a machine-learning model ranks three Algerian sites live from real Mars and Moon terrain.",
    ),
  component: Plan,
});
