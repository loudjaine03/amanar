import { createFileRoute } from "@tanstack/react-router";
import { Rehearse } from "@/components/mission/Rehearse";
import { missionHead } from "@/lib/mission-head";

export const Route = createFileRoute("/rehearse")({
  head: () =>
    missionHead(
      "4 Rehearse",
      "Drive a rover through the most Mars- or Moon-like spots of an Algerian site with the real signal delay.",
    ),
  component: Rehearse,
});
