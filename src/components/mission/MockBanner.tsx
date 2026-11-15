import { AlertTriangle } from 'lucide-react';
import { useHydrated } from '@tanstack/react-router';
import { useMissionStore } from '@/lib/mission-store';
import './mission-extras.css';

/** Visible tant que mission_data.json a "mock": true. */
export function MockBanner() {
  const mock = useMissionStore((s) => s.missionData?.meta.mock);
  const language = useMissionStore((s) => s.language);
  const hydrated = useHydrated();
  if (!mock) return null;
  const fr = hydrated && language === 'fr';
  return (
    <div className="mock-banner no-print" role="status">
      <AlertTriangle />
      {fr
        ? 'DONNÉES MOCK : valeurs provisoires, pas des résultats finaux (TBD = pas encore calculé)'
        : 'MOCK DATA: placeholders, not final results (TBD = not computed yet)'}
    </div>
  );
}
