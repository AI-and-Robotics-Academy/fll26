import { createFileRoute } from "@tanstack/react-router";
import { RequireRole } from "@/components/RequireRole";
import { useServerFn } from "@tanstack/react-start";
import { Megaphone } from "lucide-react";
import { ackReport, getReports } from "@/lib/reports.functions";
import type { CitizenReport } from "@/lib/reports.server";
import { useEffect, useMemo, useState } from "react";
import { BellRing, Check, Flame, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { RateOfRiseChart } from "@/components/RateOfRiseChart";
import {
  DEFAULT_THRESHOLDS,
  SEVERITY_STYLE,
  evaluateAlerts,
  generateRateOfRise,
  nearestStation,
  type AlertThresholds,
  type RorPoint,
  type SensorAlert,
  type SensorReading,
} from "@/lib/sensors";
import { UnitToggle } from "@/components/UnitToggle";
import { AppNav } from "@/components/AppNav";
import { feedLabel, useFieldData } from "@/lib/field-data";
import {
  formatRate,
  formatTemp,
  rateUnit,
  rateValue,
  tempUnit,
  tempValue,
  useUnits,
  type UnitSystem,
} from "@/lib/units";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alert System — WildGuard Washington Sensor Mesh" },
      {
        name: "description",
        content:
          "Threshold-driven wildfire alerts for Washington State crews: alarms trigger only when sensor temperature, humidity, rate of rise or composite risk parameters are breached.",
      },
      { property: "og:title", content: "Alert System — WildGuard Washington Sensor Mesh" },
      {
        property: "og:description",
        content:
          "Live alarm console showing which Raspberry Pi nodes have breached dispatch thresholds, with rate-of-rise trending.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GuardedAlertsPage,
});

function AlertsPage() {
  const { sensors, liveSensors, updatedAt, demoMesh } = useFieldData();
  const [ror, setRor] = useState<RorPoint[]>([]);
  const [thresholds, setThresholds] = useState<AlertThresholds>(DEFAULT_THRESHOLDS);
  const [armed, setArmed] = useState(true);
  // Luke's acknowledge flow: crews mark an alarm as seen; it stays listed until cleared.
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const { system } = useUnits();

  useEffect(() => {
    setRor(generateRateOfRise());
  }, []);

  const alerts = useMemo(
    () => (armed ? evaluateAlerts(sensors, thresholds) : []),
    [sensors, thresholds, armed],
  );
  const counts = useMemo(
    () => ({
      critical: alerts.filter((a) => a.severity === "critical").length,
      warning: alerts.filter((a) => a.severity === "warning").length,
      watch: alerts.filter((a) => a.severity === "watch").length,
    }),
    [alerts],
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-eyebrow flex items-center gap-2">
            <span className="live-dot" /> Threshold monitor · {feedLabel(liveSensors.length, demoMesh)}
          </p>
          <h1 className="mt-2 flex items-center gap-3 text-4xl font-semibold md:text-5xl">
            <BellRing className="size-8 text-primary" aria-hidden />
            Alert system
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Nothing sounds until a node breaches a parameter. Alarms are raised the moment
            temperature, humidity, rate of rise or composite risk crosses the values set below.
          </p>
          <AppNav />
        </div>
        <div className="flex flex-col items-end gap-3">
          <UnitToggle />
          <div className="panel px-4 py-3 text-right">
            <p className="label-eyebrow">Last evaluation</p>
            <p className="font-mono text-sm tabular-nums">{updatedAt || "syncing…"}</p>
            <button
              type="button"
              onClick={() => setArmed((v) => !v)}
              aria-pressed={armed}
              className={`mt-2 rounded-full px-3 py-1 font-display text-xs tracking-[0.14em] uppercase transition-colors ${
                armed
                  ? "bg-risk-low/20 text-risk-low"
                  : "border border-border text-muted-foreground"
              }`}
            >
              {armed ? "Armed" : "Silenced"}
            </button>
          </div>
        </div>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <Tally label="Critical" value={counts.critical} accent="text-risk-extreme" />
        <Tally label="Warning" value={counts.warning} accent="text-risk-high" />
        <Tally label="Watch" value={counts.watch} accent="text-risk-moderate" />
      </section>

      <CitizenReports />

      <section className="mt-6 panel p-5">
        <h2 className="flex items-center gap-2 text-xl">
          <Flame className="size-4 text-primary" aria-hidden />
          Rate of rise — fire risk momentum
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          {tempUnit(system)} gained per hour over the last 12 hours. Crossing the dashed lines is
          what escalates a node from watch to warning to critical.
        </p>
        <RateOfRiseChart data={ror} />
      </section>

      <section className="mt-6 panel p-5">
        <h2 className="flex items-center gap-2 text-xl">
          <SlidersHorizontal className="size-4 text-accent" aria-hidden />
          Trigger parameters
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Tune the dispatch thresholds — alerts re-evaluate instantly.
        </p>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Slider
            label="Temperature at or above"
            display={formatTemp(thresholds.temperatureF, system, 0)}
            min={70}
            max={120}
            value={thresholds.temperatureF}
            onChange={(temperatureF) => setThresholds((t) => ({ ...t, temperatureF }))}
          />
          <Slider
            label="Humidity at or below"
            display={`${thresholds.humidityPct} %`}
            min={5}
            max={50}
            value={thresholds.humidityPct}
            onChange={(humidityPct) => setThresholds((t) => ({ ...t, humidityPct }))}
          />
          <Slider
            label="Rate of rise at or above"
            display={`${rateValue(thresholds.rorFPerHr, system).toFixed(1)} ${rateUnit(system)}`}
            min={1}
            max={15}
            value={thresholds.rorFPerHr}
            onChange={(rorFPerHr) => setThresholds((t) => ({ ...t, rorFPerHr }))}
          />
          <Slider
            label="Composite risk at or above"
            display={`${thresholds.riskScore} pts`}
            min={20}
            max={100}
            value={thresholds.riskScore}
            onChange={(riskScore) => setThresholds((t) => ({ ...t, riskScore }))}
          />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-xl">Active alarms</h2>
        {alerts.length === 0 ? (
          <div className="panel mt-3 flex items-center gap-3 p-6">
            <ShieldCheck className="size-6 text-risk-low" aria-hidden />
            <div>
              <p className="text-sm">
                {armed
                  ? "All nodes within parameters — no alarms raised."
                  : "Alerting is silenced. Re-arm to resume monitoring."}
              </p>
              <p className="text-xs text-muted-foreground">
                Alerts appear here only when a threshold above is met.
              </p>
            </div>
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                sensors={sensors}
                thresholds={thresholds}
                acknowledged={acknowledged.has(alert.id)}
                onAcknowledge={() => setAcknowledged((prev) => new Set(prev).add(alert.id))}
              />
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-8 text-xs text-muted-foreground">
        Statewide mesh readings are simulated for demonstration. Live Raspberry Pi nodes alarm on
        real telemetry against the same thresholds.
      </footer>
    </main>
  );
}

/** Re-renders a breach reading/threshold in the active measurement system. */
function alertValues(
  alert: SensorAlert,
  sensor: SensorReading | undefined,
  thresholds: AlertThresholds,
  system: UnitSystem,
) {
  if (alert.parameter === "Temperature" && sensor) {
    return {
      reading: formatTemp(sensor.temperatureF, system),
      threshold: `≥ ${formatTemp(thresholds.temperatureF, system, 0)}`,
    };
  }
  if (alert.parameter === "Rate of rise" && sensor) {
    return {
      reading: formatRate(sensor.tempTrendFPerHr, system),
      threshold: `≥ ${rateValue(thresholds.rorFPerHr, system).toFixed(1)} ${rateUnit(system)}`,
    };
  }
  return { reading: alert.reading, threshold: alert.threshold };
}

function AlertCard({
  alert,
  sensors,
  thresholds,
  acknowledged,
  onAcknowledge,
}: {
  alert: SensorAlert;
  sensors: SensorReading[];
  thresholds: AlertThresholds;
  acknowledged: boolean;
  onAcknowledge: () => void;
}) {
  const { system } = useUnits();
  const sensor = sensors.find((s) => s.id === alert.sensorId);
  const station = sensor ? nearestStation(sensor) : null;
  const style = SEVERITY_STYLE[alert.severity];
  const values = alertValues(alert, sensor, thresholds, system);

  return (
    <li
      className={`panel p-4 ${acknowledged ? "opacity-60" : ""}`}
      style={{ borderLeft: `3px solid var(--color-${style.token})` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-lg tracking-wide">
          <span className="text-muted-foreground">{alert.sensorId}</span> {alert.sensorName}
        </p>
        <span
          className={`rounded-full px-2.5 py-0.5 font-display text-xs tracking-[0.14em] uppercase text-${style.token}`}
          style={{ border: `1px solid var(--color-${style.token})` }}
        >
          {style.label} · {alert.parameter}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{alert.zone}</p>
      <p className="mt-2 text-sm">{alert.message}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 font-mono text-sm tabular-nums sm:grid-cols-4">
        <Cell label="Reading" value={values.reading} />
        <Cell label="Threshold" value={values.threshold} />
        <Cell label="Risk score" value={String(alert.riskScore)} />
        <Cell label="Nearest unit" value={station ? station.city : "—"} />
      </dl>
      <div className="mt-3 flex justify-end">
        {acknowledged ? (
          <span className="inline-flex items-center gap-1 font-display text-xs tracking-[0.14em] text-muted-foreground uppercase">
            <Check className="size-3" aria-hidden /> Acknowledged
          </span>
        ) : (
          <button
            type="button"
            onClick={onAcknowledge}
            className="rounded-full border border-border px-3 py-1 font-display text-xs tracking-[0.14em] uppercase transition-colors hover:bg-surface-raised"
          >
            Acknowledge
          </button>
        )}
      </div>
    </li>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised/50 px-3 py-2">
      <dt className="text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function Tally({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="panel p-5">
      <p className={`label-eyebrow ${accent}`}>{label}</p>
      <p className={`metric-value mt-3 ${accent}`}>{value}</p>
    </div>
  );
}

function Slider({
  label,
  display,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  display: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="label-eyebrow">{label}</span>
      <span className="mt-1 block font-mono text-lg tabular-nums">{display}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--color-primary)]"
      />
    </label>
  );
}

function GuardedAlertsPage() {
  return (
    <RequireRole roles={["firefighter"]}>
      <AlertsPage />
    </RequireRole>
  );
}

/** Smoke and fire reports sent by citizens from "My area". */
function CitizenReports() {
  const list = useServerFn(getReports);
  const ack = useServerFn(ackReport);
  const [reports, setReports] = useState<CitizenReport[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const all = await list();
        if (!cancelled) setReports(all);
      } catch {
        /* offline */
      }
    };
    void load();
    const id = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [list]);

  const open = reports.filter((r) => !r.acknowledged).length;
  return (
    <section className="mt-6 panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl">
          <Megaphone className="size-4 text-risk-high" aria-hidden />
          Citizen reports
        </h2>
        <span className="text-xs text-muted-foreground">
          {reports.length ? `${open} new · ${reports.length} total` : "None yet"}
        </span>
      </div>
      {reports.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Smoke and fire reports from citizens' "My area" page appear here.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {reports.slice(0, 8).map((r) => (
            <li
              key={r.id}
              className={`flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm ${r.acknowledged ? "opacity-60" : ""}`}
              style={{ borderLeft: `3px solid var(--color-${r.kind === "flames" ? "risk-extreme" : "risk-high"})` }}
            >
              <span className="font-display tracking-[0.14em] uppercase">{r.kind}</span>
              <span>
                {r.place} · <span className="font-mono text-xs">{r.lat}, {r.lng}</span>
              </span>
              {r.note && <span className="text-muted-foreground">“{r.note}”</span>}
              <span className="text-xs text-muted-foreground">
                {r.reporter} · {new Date(r.createdAt).toLocaleTimeString()}
              </span>
              <span className="ml-auto">
                {r.acknowledged ? (
                  <span className="text-xs text-risk-low">Acknowledged</span>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      await ack({ data: { id: r.id } });
                      setReports(await list());
                    }}
                    className="rounded-full border border-border px-3 py-1 font-display text-xs tracking-[0.14em] uppercase hover:bg-surface-raised"
                  >
                    Acknowledge
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
