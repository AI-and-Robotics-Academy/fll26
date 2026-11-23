import {
  Droplets,
  Sprout,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Wind,
  WifiOff,
} from "lucide-react";
import { RiskBadge } from "@/components/RiskBadge";
import { assessRisk, compassPoint, type SensorReading } from "@/lib/sensors";
import { formatPct, formatRate, formatTemp, formatWind, useUnits } from "@/lib/units";
import { cn } from "@/lib/utils";

export function SensorRow({
  sensor,
  selected,
  onSelect,
}: {
  sensor: SensorReading;
  selected: boolean;
  onSelect: () => void;
}) {
  const { system } = useUnits();
  const risk = assessRisk(sensor);
  const Trend = sensor.tempTrendFPerHr >= 0 ? TrendingUp : TrendingDown;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-lg border border-border bg-surface-raised/50 p-3 text-left transition-colors hover:bg-surface-raised",
        selected && "border-primary/60 bg-surface-raised",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-base tracking-wide">
            <span className="text-muted-foreground">{sensor.id}</span> {sensor.name}
            {sensor.source === "live" && (
              <span className="ml-2 rounded-full bg-risk-low/20 px-1.5 py-0.5 align-middle font-mono text-[0.6rem] tracking-normal text-risk-low">
                LIVE
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">{sensor.zone}</p>
        </div>
        {sensor.online ? (
          <RiskBadge level={risk.level} label={risk.label} />
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
            <WifiOff className="size-3" /> Offline
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-sm tabular-nums">
        <span className="inline-flex items-center gap-1.5 text-temp">
          <Thermometer className="size-3.5" />
          {formatTemp(sensor.temperatureF, system)}
        </span>
        {sensor.humidityPct !== undefined ? (
          <span className="inline-flex items-center gap-1.5 text-humidity" title="Air humidity">
            <Droplets className="size-3.5" />
            {formatPct(sensor.humidityPct)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-humidity" title="Soil moisture">
            <Sprout className="size-3.5" />
            {formatPct(sensor.soilMoisturePct)}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Trend className="size-3.5" />
          {formatRate(sensor.tempTrendFPerHr, system)}
        </span>
      </div>
      {(sensor.windMph !== undefined || sensor.soilMoisturePct !== undefined) && (
        <div className="mt-1.5 flex gap-4 font-mono text-xs tabular-nums text-muted-foreground">
          {sensor.windMph !== undefined && (
            <span className="inline-flex items-center gap-1.5" title="Wind">
              <Wind className="size-3" />
              {formatWind(sensor.windMph, system)}
              {sensor.windDirDeg !== undefined && ` ${compassPoint(sensor.windDirDeg)}`}
            </span>
          )}
          {sensor.soilMoisturePct !== undefined && sensor.humidityPct !== undefined && (
            <span className="inline-flex items-center gap-1.5" title="Soil moisture">
              <Sprout className="size-3" />
              soil {formatPct(sensor.soilMoisturePct)}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
