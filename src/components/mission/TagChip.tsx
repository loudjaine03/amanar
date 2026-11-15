import type { Tag } from "@/types/mission";
import { useMissionStore } from "@/lib/mission-store";
import { sourceName } from "@/lib/report";
import "./mission-extras.css";

const MEANING: Record<Tag, string> = {
  Measured: "Computed by our scripts from an identified dataset",
  Reference: "Established fact from a cited source, not computed by us",
  Judgement: "Our reading, decision or threshold",
  Hypothesis: "Must be checked in the field",
};

/** Small label on every number: Measured (green), Reference (blue), Judgement (amber), Hypothesis (grey). Source on hover. */
export function TagChip({ tag, source }: { tag: Tag; source?: string | undefined }) {
  const data = useMissionStore((s) => s.missionData);
  const src = source ? ` Source: ${sourceName(data, source)}` : "";
  const title = `${tag}: ${MEANING[tag]}.${src}`;
  return (
    <span
      tabIndex={0}
      title={title}
      aria-label={title}
      className={`tag-chip tag-${tag.toLowerCase()}`}
    >
      {tag}
    </span>
  );
}
