import { createFileRoute } from '@tanstack/react-router';
import { AnalogFinder } from '@/components/mission/AnalogFinder';
import { missionHead } from '@/lib/mission-head';
export const Route = createFileRoute('/finder')({
  head: () =>
    missionHead('AI Analog Finder', 'Say what you want to test on Mars or the Moon and where: a model ranks 7,500 cells of the Algerian Sahara and explains each pick.'),
  component: AnalogFinder,
});
