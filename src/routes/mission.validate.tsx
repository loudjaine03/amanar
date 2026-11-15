import { createFileRoute } from '@tanstack/react-router';
import { Stage3Validate } from '@/components/mission/Stage3Validate';
import { missionHead } from '@/lib/mission-head';
export const Route = createFileRoute('/mission/validate')({
  head: () =>
    missionHead('03 Validate', 'Rehearse a rover traverse with the Earth-Mars signal delay and check preliminary field accessibility.'),
  component: Stage3Validate,
});
