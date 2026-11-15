import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ArrowRight, ArrowDown, Play, Crosshair, Layers, Route as RouteIcon, ShieldCheck, ScanLine, BadgeCheck, Scale, Globe, Sparkles, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Starfield } from '@/components/mission/Starfield';
import { Logo } from '@/components/mission/Logo';
import { missionSteps, useMissionTranslation } from '@/components/mission/MissionShell';
import { missionHead } from '@/lib/mission-head';

export const Route = createFileRoute('/')({ head: () => missionHead('Sahara > Mars > Moon', 'An honest experimental framework for comparing Algerian Sahara terrain with Mars and Moon mission targets.'), component: Index });
function Counter({ number, label }: { number: number; label: string }) {
  const [value, setValue] = useState(number);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setValue(0); let frame = 0; const start = performance.now();
    const tick = (now: number) => { setValue(Math.min(number, Math.floor((now - start) / 650 * number))); if (now - start < 650) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [number]);
  return <div className="hero-stat"><div className="hero-stat-top"><strong>{value.toString().padStart(2, '0')}</strong></div><p>{label}</p></div>;
}
function Index() {
  const { t } = useMissionTranslation();
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const scroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setOffset(Math.min(window.scrollY, 700))); };
    window.addEventListener('scroll', scroll, { passive: true }); return () => { window.removeEventListener('scroll', scroll); cancelAnimationFrame(frame); };
  }, []);
  const icons = [Crosshair, Sparkles, Layers, Wrench, RouteIcon];
  const features = [{ icon: BadgeCheck, title: 'provenanceTitle', body: 'provenanceBody' }, { icon: ScanLine, title: 'radarTitle', body: 'radarBody' }, { icon: Scale, title: 'auditTitle', body: 'auditBody' }, { icon: ShieldCheck, title: 'safetyTitle', body: 'safetyBody' }];
  return <>
    <section className="hero"><Starfield/><div className="hero-grid"/>
      <div className="hero-content"><div className="eyebrow"><span className="eyebrow-dot"/>{t('eyebrow')}</div>
        <h1>AMANAR<span>ALGERIA BEYOND EARTH</span></h1>
        <div className="hero-tagline"><b>Sahara</b> &gt; Mars &gt; Moon. {t('tagline')}</div>
        <p className="hero-amanar">{t('amanar')}</p>
        <p className="hero-description">{t('problem')}</p>
        <div className="hero-actions"><Button variant="mission" asChild><Link to="/mission/benchmark"><Crosshair/>{t('start')}<ArrowRight/></Link></Button><Button variant="instrument" asChild><Link to="/finder"><Sparkles/>{t('finderCta')}</Link></Button><Button variant="ghost" onClick={() => window.dispatchEvent(new Event('abe-demo'))}><Play/>{t('watch')}</Button></div>
        <div className="hero-stats"><Counter number={3} label={t('sites')}/><Counter number={3} label={t('targets')}/><Counter number={4} label={t('sensors')}/></div>
      </div>
      <svg className="dune-landscape" viewBox="0 0 1440 300" preserveAspectRatio="none" aria-hidden="true">
        <g transform={`translate(0 ${offset * .045})`}><path className="dune-back" d="M0 144Q220 62 420 140T850 145Q1140 10 1440 110V300H0Z"/><path className="dune-ridge" d="M0 144Q220 62 420 140T850 145Q1140 10 1440 110"/></g>
        <g transform={`translate(0 ${offset * .09})`}><path className="dune-front" d="M0 190Q200 260 440 184T850 225Q1100 240 1440 157V300H0Z"/><path className="dune-ridge" d="M0 190Q200 260 440 184T850 225Q1100 240 1440 157"/>{[0, 1, 2, 3].map((i) => <path key={i} className="terrain-contour" d={`M0 ${220+i*17}Q200 ${282+i*8} 440 ${214+i*14}T850 ${255+i*12}Q1100 ${270+i*8} 1440 ${187+i*20}`}/>)}</g>
      </svg>
      <div className="terrain-marker"><span>{t('terrain')}</span>{t('illustration')}</div>
      <div className="hero-bottom"><span><Globe/>{t('ground')}</span><span><Logo variant="mark" animated/><span className="illustration-note">{t('explore')}</span><ArrowDown/></span></div>
    </section>
    <section className="content-section"><div className="section-heading"><div><div className="section-label">{t('workflow')}</div><h2>{t('workflowTitle')}</h2></div><span className="section-aside">{t('workflowAside')}</span></div>
      <div className="stage-grid">{missionSteps.map((stage, i) => { const Icon = icons[i]; return <Link className="instrument stage-card" to={stage.path} key={stage.key}><div className="stage-card-top">{Icon && <Icon/>}<span>{stage.number} / {t(stage.key)}</span></div><h3>{t(`stage${i+1}`)}</h3><p>{t(`stage${i+1}body`)}</p><div className="stage-card-bottom"><span>{t('openStage')} {stage.number}</span><ArrowRight/></div></Link>; })}</div>
    </section>
    <section className="content-section difference-section"><div className="section-heading"><div><div className="section-label">{t('difference')}</div><h2>{t('differenceTitle')}</h2></div></div><div className="difference-grid">{features.map(({ icon: Icon, title, body }) => <div className="difference-item" key={title}><Icon/><h3>{t(title)}</h3><p>{t(body)}</p></div>)}</div></section>
  </>;
}
