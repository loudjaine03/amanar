import { createFileRoute } from '@tanstack/react-router';
import { Stage1Benchmark } from '@/components/mission/Stage1Benchmark';
import { missionHead } from '@/lib/mission-head';
export const Route = createFileRoute('/mission/benchmark')({
  head: () =>
    missionHead('01 Benchmark', 'Choose a Mars or Moon reference target and see what the mission needs from an Earth analog.'),
  component: Stage1Benchmark,
});
