import { createFileRoute } from '@tanstack/react-router';
import { Stage2Match } from '@/components/mission/Stage2Match';
import { missionHead } from '@/lib/mission-head';
export const Route = createFileRoute('/mission/match')({
  head: () =>
    missionHead('02 Match', 'Compare Algerian Sahara candidate sites with radar and see where each analogy holds and where it breaks.'),
  component: Stage2Match,
});
