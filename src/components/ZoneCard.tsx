import { CircleDot, Droplets, Radio, Thermometer } from "lucide-react";
import { assessRisk, type SensorReading } from "@/lib/sensors";
import { formatTemp, useUnits, formatPct } from "@/lib/units";
import { cn } from "@/lib/utils";

type ZoneRisk = "high" | "medium" | "low";

const RISK_STYLE: Record<ZoneRisk, { label: string; card: string; badge: string; metric: string }> = {
  high: {
    label: "High",
    card: "border-risk-extreme/70 bg-risk-extreme/10",
    badge: "border-risk-extreme/60 bg-risk-extreme/20 text-risk-extreme",
    metric: "text-risk-extreme",
  },
  medium: {
    label: "Medium",
    card: "border-risk-high/70 bg-risk-high/10",
    badge: "border-risk-high/60 bg-risk-high/20 text-risk-high",
    metric: "text-risk-high",
  },
  low: {
    label: "Low",
    card: "border-risk-low/70 bg-risk-low/10",
    badge: "border-risk-low/60 bg-risk-low/20 text-risk-low",
    metric: "text-risk-low",
  },
};

function zoneRisk(score: number): ZoneRisk {
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export function ZoneCard({ sensor }: { sensor: SensorReading }) {
  const { system } = useUnits();
  const risk = assessRisk(sensor);
  const level = zoneRisk(risk.score);
  const style = RISK_STYLE[level];

  return (
    <article className={cn("rounded-lg border p-4", style.card)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-xl font-semibold">{sensor.name}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{sensor.zone}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-1 font-display text-xs uppercase",
            style.badge,
          )}
        >
          {style.label}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between border-y border-border/70 py-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <Radio className="size-3.5" aria-hidden />
          {sensor.id}
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <CircleDot className="size-3.5" aria-hidden />
          1 mi radius
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Thermometer className="size-3.5 text-temp" aria-hidden /> Temperature
          </dt>
          <dd className="mt-1 font-mono text-lg tabular-nums text-temp">
            {formatTemp(sensor.temperatureF, system)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Droplets className="size-3.5 text-humidity" aria-hidden /> Moisture
          </dt>
          <dd className="mt-1 font-mono text-lg tabular-nums text-humidity">
            {formatPct(sensor.humidityPct ?? sensor.soilMoisturePct)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3">
        <span className="label-eyebrow">Wildfire risk score</span>
        <span className={cn("font-mono text-xl font-semibold tabular-nums", style.metric)}>
          {risk.score}
        </span>
      </div>
    </article>
  );
}