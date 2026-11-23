import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { RiskBadge } from "@/components/RiskBadge";
import { UnitToggle } from "@/components/UnitToggle";
import { assessRisk, compassPoint } from "@/lib/sensors";
import type { LoggedReading, RegistryEntry } from "@/lib/telemetry.server";
import { formatPct, formatTemp, formatWind, useUnits } from "@/lib/units";

export const Route = createFileRoute("/readings")({
  head: () => ({
    meta: [
      { title: "Readings Log — WildGuard" },
      {
        name: "description",
        content: "The last 100 live sensor readings with risk scores and device status.",
      },
    ],
  }),
  component: ReadingsPage,
});

const POLL_MS = 5000;

function ReadingsPage() {
  const { system } = useUnits();
  const [readings, setReadings] = useState<LoggedReading[]>([]);
  const [devices, setDevices] = useState<RegistryEntry[]>([]);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/readings", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const json = (await response.json()) as {
          readings: LoggedReading[];
          devices: RegistryEntry[];
        };
        if (cancelled) return;
        setReadings(json.readings);
        setDevices(json.devices);
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const status = new Map(devices.map((d) => [d.id, d.status]));

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-eyebrow flex items-center gap-2">
            <span className="live-dot" /> Live · refreshes every 5s
          </p>
          <h1 className="mt-2 flex items-center gap-3 text-4xl font-semibold md:text-5xl">
            <ScrollText className="size-8 text-primary" aria-hidden />
            Readings log
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Every packet from the field, newest first. A unit counts as online if it reported in the
            last 15 minutes.
          </p>
          <AppNav />
        </div>
        <UnitToggle />
      </header>

      <section className="mt-8 panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-xl">Last {readings.length} readings</h2>
          {error && <span className="text-xs text-risk-high">Can't reach the server</span>}
        </div>
        {readings.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            {loaded
              ? "No live readings yet. Connect a Raspberry Pi or send a test reading from the Devices page."
              : "Loading…"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase">
                <tr className="border-b border-border">
                  <th className="px-5 py-2 font-normal">Device</th>
                  <th className="px-3 py-2 font-normal">Temp</th>
                  <th className="px-3 py-2 font-normal">Humidity</th>
                  <th className="px-3 py-2 font-normal">Soil</th>
                  <th className="px-3 py-2 font-normal">Wind</th>
                  <th className="px-3 py-2 font-normal">Risk</th>
                  <th className="px-3 py-2 font-normal">Recorded</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {readings.map((r) => {
                  const risk = assessRisk({
                    id: r.deviceId,
                    name: r.deviceName,
                    zone: r.location,
                    lat: r.lat,
                    lng: r.lng,
                    elevationM: 0,
                    temperatureF: r.temperatureF,
                    ...(r.humidityPct !== undefined ? { humidityPct: r.humidityPct } : {}),
                    ...(r.soilMoisturePct !== undefined
                      ? { soilMoisturePct: r.soilMoisturePct }
                      : {}),
                    ...(r.windMph !== undefined ? { windMph: r.windMph } : {}),
                    tempTrendFPerHr: 0,
                    batteryPct: 0,
                    online: true,
                    lastSeenSecondsAgo: 0,
                  });
                  const state = status.get(r.deviceId) ?? "offline";
                  return (
                    <tr
                      key={`${r.deviceId}-${r.recordedAt}`}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-5 py-2.5">
                        <span className="flex items-center gap-2">
                          <span
                            className={`size-2 rounded-full ${state === "online" ? "bg-risk-low" : "bg-muted-foreground"}`}
                            aria-label={state}
                            title={state}
                          />
                          {r.deviceId}
                        </span>
                        <span className="block pl-4 font-sans text-xs text-muted-foreground">
                          {r.deviceName} · {r.location}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{formatTemp(r.temperatureF, system)}</td>
                      <td className="px-3 py-2.5">{formatPct(r.humidityPct)}</td>
                      <td className="px-3 py-2.5">{formatPct(r.soilMoisturePct)}</td>
                      <td className="px-3 py-2.5">
                        {r.windMph !== undefined
                          ? `${formatWind(r.windMph, system)}${r.windDirDeg !== undefined ? ` ${compassPoint(r.windDirDeg)}` : ""}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <RiskBadge level={risk.level} label={`${risk.label} ${risk.score}`} />
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {new Date(r.recordedAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="mt-3 text-xs text-muted-foreground">
        Risk per reading uses the same engine as the console; rate of rise is left out because a
        single packet has no trend.
      </p>
    </main>
  );
}
