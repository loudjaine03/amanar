import { Download, FileText, FolderOpen, Printer } from 'lucide-react';
import { useHydrated } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useMissionStore } from '@/lib/mission-store';
import { buildDossierMarkdown, downloadMarkdown, sourceName, STAGE_ORDER, STAGE_TITLES } from '@/lib/dossier';
import { TagChip } from './TagChip';
import './mission-extras.css';

const TEXT = {
  en: { title: 'Mission Dossier', empty: 'Your mission dossier is empty.', emptyBody: 'Entries appear here as you complete each stage.', none: 'Nothing logged yet.', md: 'Download .md', print: 'Print / Save as PDF', note: 'Team-built experimental indicators. Not an official NASA assessment.', mock: 'MOCK DATA: placeholders, not final results.', source: 'Source' },
  fr: { title: 'Dossier de mission', empty: 'Votre dossier de mission est vide.', emptyBody: 'Les entrées apparaissent ici au fil des étapes.', none: 'Rien d’enregistré pour l’instant.', md: 'Télécharger .md', print: 'Imprimer / Enregistrer en PDF', note: 'Indicateurs expérimentaux conçus par l’équipe, pas une évaluation officielle de la NASA.', mock: 'DONNÉES MOCK : valeurs provisoires, pas des résultats finaux.', source: 'Source' },
} as const;

/** Contenu du tiroir « Mission Dossier » : liste par étape, export .md, impression PDF. */
export function DossierSheetContent() {
  const items = useMissionStore((s) => s.dossierItems);
  const meta = useMissionStore((s) => s.missionData?.meta);
  const language = useMissionStore((s) => s.language);
  const hydrated = useHydrated();
  const t = TEXT[hydrated && language === 'fr' ? 'fr' : 'en'];
  const today = new Date().toISOString().slice(0, 10);
  return (
    <SheetContent className="dossier-sheet w-full sm:max-w-md">
      <SheetTitle className="flex items-center gap-2">
        <FileText className="size-5 text-radar" />
        {t.title}
      </SheetTitle>
      <SheetDescription className="mt-3">{t.note}</SheetDescription>
      <div className="dossier-print-head">
        <strong>Amanar · Algeria Beyond Earth · Team Hoggar · {today}</strong>
        {meta?.mock && <p>{t.mock}</p>}
      </div>
      {items.length === 0 ? (
        <div className="empty-state">
          <FolderOpen />
          <h2>{t.empty}</h2>
          <p>{t.emptyBody}</p>
        </div>
      ) : (
        <div className="dossier-body">
          {STAGE_ORDER.map((stage) => {
            const rows = items.filter((i) => i.stage === stage);
            return (
              <section className="dossier-group" key={stage}>
                <h3>{STAGE_TITLES[stage]}</h3>
                {rows.length === 0 ? (
                  <p className="dossier-none">{t.none}</p>
                ) : (
                  <ul>
                    {rows.map((r) => (
                      <li className="dossier-entry" key={r.id}>
                        <div className="dossier-entry-top">
                          <strong>{r.title}</strong>
                          <TagChip tag={r.tag} source={r.source} />
                        </div>
                        <p>{r.value}</p>
                        <small>
                          {t.source}: {sourceName(meta, r.source)}
                        </small>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
      <div className="dossier-actions no-print">
        <Button variant="mission" disabled={items.length === 0} onClick={() => downloadMarkdown(buildDossierMarkdown(items, meta, today))}>
          <Download />
          {t.md}
        </Button>
        <Button variant="instrument" disabled={items.length === 0} onClick={() => window.print()}>
          <Printer />
          {t.print}
        </Button>
      </div>
    </SheetContent>
  );
}
