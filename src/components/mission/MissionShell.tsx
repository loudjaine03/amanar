import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useHydrated } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, FileText, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Logo } from './Logo';
import { MockBanner } from './MockBanner';
import { DossierSheetContent } from './DossierDrawer';
import { useMissionStore } from '@/lib/mission-store';
import { missionI18n } from '@/lib/mission-i18n';
import { getMissionData } from '@/lib/api';
import { SCENARIO_META } from '@/lib/scenarios';
import { SCENARIOS } from '@/types/mission';
export const missionSteps = [
  { path: '/mission/benchmark', key: 'benchmark', number: '01' },
  { path: '/finder', key: 'finder', number: '02' },
  { path: '/mission/match', key: 'match', number: '03' },
  { path: '/mission/hardware', key: 'hardware', number: '04' },
  { path: '/mission/validate', key: 'validate', number: '05' },
] as const;
export function useMissionTranslation() {
  const storedLanguage = useMissionStore((s) => s.language);
  const hydrated = useHydrated();
  const language = hydrated ? storedLanguage : 'en';
  return { ...useTranslation('translation', { i18n: missionI18n, lng: language }), language };
}
export function MissionShell({ children }: { children: ReactNode }) {
  const { t } = useMissionTranslation();
  const state = useMissionStore();
  const pathname = useLocation({ select: (l) => l.pathname });
  const [demoNotice, setDemoNotice] = useState(false);
  useEffect(() => {
    void useMissionStore.persist.rehydrate();
    useMissionStore.setState({ month: new Date().getMonth() + 1 });
    void getMissionData().then((missionData) => useMissionStore.setState({ missionData })).catch(() => {});
    const show = () => setDemoNotice(true);
    window.addEventListener('abe-demo', show);
    return () => window.removeEventListener('abe-demo', show);
  }, []);
  useEffect(() => { void missionI18n.changeLanguage(state.language); document.documentElement.lang = state.language; }, [state.language]);
  return <div className="mission-app" data-scenario={state.scenario}>
    <header className="mission-header"><div className="header-inner">
      <Link to="/" aria-label="AMANAR, Algeria Beyond Earth"><Logo /></Link>
      <nav className="stepper" aria-label={t('workflow')}>
        {missionSteps.map((step, i) => <span key={step.key} className="flex items-center gap-3"><Link className="step-link" to={step.path} data-active={pathname === step.path} aria-current={pathname === step.path ? 'step' : undefined}><span className="step-number">{step.number}</span>{t(step.key)}</Link>{i < missionSteps.length - 1 && <span className="step-connector"/>}</span>)}
      </nav>
      <div className="header-tools">
        <div className="scenario-switch" aria-label={t('targetLabel')}>
          {SCENARIOS.map((sc) => (
            <Button key={sc} variant="ghost" size="sm" className={state.scenario === sc ? 'selected' : ''} onClick={() => state.setScenario(sc)} aria-pressed={state.scenario === sc} title={SCENARIO_META[sc].title[state.language]}>
              {SCENARIO_META[sc].short[state.language]}
            </Button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => state.setLanguage(state.language === 'en' ? 'fr' : 'en')} aria-label={state.language === 'en' ? 'Passer en français' : 'Switch to English'} className="font-mono text-xs">{state.language.toUpperCase()}</Button>
        <Button variant="ghost" size="sm" onClick={() => setDemoNotice(true)} title={t('demo')} aria-label={t('demo')}><Play/><span className="demo-label">{t('demo')}</span></Button>
        <Button variant="instrument" size="sm" onClick={() => state.setDossierOpen(true)} aria-label={t('dossier')}><FileText/><span className="dossier-label">{t('dossier')}</span><span className="font-mono text-radar text-xs">{state.dossierItems.length}</span></Button>
      </div>
    </div></header>
    <div className="disclaimer"><AlertTriangle/>{t('disclaimer')}{pathname === '/' && <span> {t('demoDisclaimer')}</span>}</div>
    <MockBanner/>
    <main>{children}</main>
    <footer className="mission-footer"><div className="footer-sources"><span>{t('credits')}</span>JAXA ALOS-2 PALSAR-2 · Copernicus Sentinel-1/2 & DEM · NASA POWER & Trek · Esri World Imagery</div><Link to="/method" className="flex items-center gap-2 hover:text-radar">{t('method')}<ArrowRight className="size-3"/></Link><span>{t('team')}</span></footer>
    <Sheet open={state.dossierOpen} onOpenChange={state.setDossierOpen}><DossierSheetContent/></Sheet>
    <Sheet open={demoNotice} onOpenChange={setDemoNotice}><SheetContent className="w-full sm:max-w-md"><SheetTitle>{t('tourTitle')}</SheetTitle><SheetDescription className="mt-3">{t('tourBody')}</SheetDescription>
      <ol className="tour-list">
        {([['/mission/benchmark', 'tour1'], ['/finder', 'tour2'], ['/mission/match', 'tour3'], ['/mission/hardware', 'tour5'], ['/mission/validate', 'tour4']] as const).map(([to, key], i) => (
          <li key={key}><span className="tour-n">{i + 1}</span><div><strong>{t(`${key}t`)}</strong><p>{t(`${key}b`)}</p><Link to={to} className="tour-link" onClick={() => setDemoNotice(false)}>{t('tourGo')}<ArrowRight className="size-3"/></Link></div></li>
        ))}
      </ol>
      <Button className="mt-6" variant="mission" onClick={() => setDemoNotice(false)}>{t('close')}</Button></SheetContent></Sheet>
  </div>;
}