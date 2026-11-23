import { useServerFn } from "@tanstack/react-start";
import { FileText, LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { RiskBadge } from "@/components/RiskBadge";
import { Button } from "@/components/ui/button";
import { buildFieldContext, getSituationBriefing, type BriefingReply } from "@/lib/ai.functions";
import { useFieldData } from "@/lib/field-data";
import type { RiskLevel } from "@/lib/sensors";

/** Viren's one-click crew briefing: headline, drivers, watch areas, actions. */
export function SituationBriefing() {
  const { sensors, resources } = useFieldData();
  const generate = useServerFn(getSituationBriefing);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BriefingReply | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await generate({ data: buildFieldContext(sensors, resources) }));
    } catch {
      setError("Could not generate a briefing. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const b = result?.briefing;
  return (
    <section className="mt-6 panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl">
            <FileText className="size-4 text-accent" aria-hidden />
            Situation briefing
          </h2>
          <p className="text-xs text-muted-foreground">
            One-click crew briefing from the current readings, alerts and resources.
          </p>
        </div>
        <Button type="button" onClick={run} disabled={busy || sensors.length === 0}>
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {b ? "Refresh briefing" : "Generate briefing"}
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-risk-high">{error}</p>}

      {b && result && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <RiskBadge level={b.level.toLowerCase() as RiskLevel} label={b.level} />
            <p className="text-lg">{b.headline}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <BriefingList title="What's driving the risk" items={b.drivers} />
            <BriefingList
              title="Watch areas"
              items={b.watchAreas}
              empty="No zones above moderate."
            />
            <BriefingList title="Recommended actions" items={b.actions} />
          </div>
          <p className="text-xs text-muted-foreground">
            {result.mode === "ai" ? "AI briefing" : "Rule-based briefing"} · generated{" "}
            {new Date(result.generatedAt).toLocaleTimeString()}
            {result.notice ? ` · ${result.notice}` : ""}
          </p>
        </div>
      )}
    </section>
  );
}

function BriefingList({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised/50 p-3">
      <p className="label-eyebrow">{title}</p>
      {items.length ? (
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{empty ?? "—"}</p>
      )}
    </div>
  );
}
