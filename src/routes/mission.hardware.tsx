import { createFileRoute } from '@tanstack/react-router';
import { Stage4Hardware } from '@/components/mission/Stage4Hardware';
import { missionHead } from '@/lib/mission-head';
export const Route = createFileRoute('/mission/hardware')({
  head: () =>
    missionHead('04 Hardware', 'Which materials survive Mars or the Moon, what an Algerian test site can and cannot test, and the pressure numbers: habitat wall load and wheel ground pressure.'),
  component: Stage4Hardware,
});
