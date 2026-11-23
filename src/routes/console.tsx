import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { RequireRole } from "@/components/RequireRole";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  Droplets,
  Sprout,
  Wind,
  Flame,
  Navigation,
  Radio,
  Satellite,
  Thermometer,
  Truck,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getResponseRoute, type ResponseRoute } from "@/lib/response-route.functions";
import { RiskBadge } from "@/components/RiskBadge";
import { RiskGauge } from "@/components/RiskGauge";
import { SituationBriefing } from "@/components/SituationBriefing";
import { SensorRow } from "@/components/SensorRow";
import { TrendChart } from "@/components/TrendChart";
import { RateOfRiseChart } from "@/components/RateOfRiseChart";
import {
  HEAT_BANDS,
  assessRisk,
  compassPoint,
  distanceKm,
  evaluateAlerts,
  generateRateOfRise,
  generateTrend,
  nearestStation,
  type FireStation,
  type RorPoint,
  type SensorReading,
  type TrendPoint,
} from "@/lib/sensors";
import { AppNav } from "@/components/AppNav";
import {
  feedLabel,
  nearestAvailableResources,
  resourceLabel,
  useFieldData,
  type Resource,
} from "@/lib/field-data";
import { UnitToggle } from "@/components/UnitToggle";
import { ZoneCard } from "@/components/ZoneCard";
import { Button } from "@/components/ui/button";
import {
  formatDistanceFromKm,
  formatElevation,
  formatRate,
  formatPct,
  formatTemp,
  formatWind,
  rateUnit,
  rateValue,
  tempUnit,
  tempValue,
  useUnits,
  type UnitSystem,
} from "@/lib/units";

const TerrainMap = lazy(() => import("@/components/TerrainMap"));

export const Route = createFileRoute("/console")({
  head: () => ({
    meta: [
      { title: "WildGuard — Washington Wildfire Sensor Console" },
      {
        name: "description",
        content:
          "Live Raspberry Pi telemetry for Washington State wildfire crews: temperature, humidity, composite fire-risk scoring and terrain mapping across Cascade and eastern Washington zones.",
      },
      { property: "og:title", content: "WildGuard — Washington Wildfire Sensor Console" },
      {
        property: "og:description",
        content:
          "Monitor temperature, humidity and composite fire risk from Raspberry Pi sensors across Washington State on a live topography map.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GuardedDashboard,
});

function Dashboard() {
  // Shared feed: simulated mesh + live Raspberry Pi nodes + Shivi's resources.
  const { sensors, liveSensors, resources, updatedAt, demoMesh } = useFieldData();
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [ror, setRor] = useState<RorPoint[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layer, setLayer] = useState<"heat" | "risk" | "zones">("heat");
  const [showStations, setShowStations] = useState(true);
  const [showResources, setShowResources] = useState(true);
  const [route, setRoute] = useState<ResponseRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const fetchRoute = useServerFn(getResponseRoute);
  const { system } = useUnits();

  // Generated after mount to avoid SSR hydration mismatch from random data.
  useEffect(() => {
    setTrend(generateTrend());
    setRor(generateRateOfRise());
  }, []);

  const online = sensors.filter((s) => s.online);
  const network = useMemo(() => {
    if (online.length === 0) return null;
    const avg = (values: (number | undefined)[]) => {
      const present = values.filter((v): v is number => v !== undefined);
      return present.length ? present.reduce((a, v) => a + v, 0) / present.length : undefined;
    };
    const avgTemp = online.reduce((a, s) => a + s.temperatureF, 0) / online.length;
    const avgHum = avg(online.map((s) => s.humidityPct));
    const avgSoil = avg(online.map((s) => s.soilMoisturePct));
    const windy = online.filter((s) => s.windMph !== undefined);
    const avgWind = avg(windy.map((s) => s.windMph));
    // Prevailing direction: vector average of wind-from bearings.
    const dirs = windy.filter((s) => s.windDirDeg !== undefined);
    const prevailing = dirs.length
      ? compassPoint(
          (Math.atan2(
            dirs.reduce((a, s) => a + Math.sin((s.windDirDeg! * Math.PI) / 180), 0),
            dirs.reduce((a, s) => a + Math.cos((s.windDirDeg! * Math.PI) / 180), 0),
          ) *
            180) /
            Math.PI,
        )
      : null;
    const avgRor = online.reduce((a, s) => a + s.tempTrendFPerHr, 0) / online.length;
    const scores = online.map((s) => assessRisk(s));
    const worst = scores.reduce((a, b) => (b.score > a.score ? b : a));
    return { avgTemp, avgHum, avgSoil, avgWind, prevailing, avgRor, worst, peak: worst.score };
  }, [online]);

  const selected = sensors.find((s) => s.id === selectedId) ?? null;
  const station: FireStation | null = selected ? nearestStation(selected) : null;

  // One routing request per selected node; cached by node id for the session.
  const routeCache = useRef<Map<string, ResponseRoute>>(new Map());
  useEffect(() => {
    if (!selectedId || !selected || !station) {
      setRoute(null);
      return;
    }
    const cached = routeCache.current.get(selectedId);
    if (cached) {
      setRoute(cached);
      return;
    }
    let cancelled = false;
    setRouteLoading(true);
    fetchRoute({
      data: {
        originLat: station.lat,
        originLng: station.lng,
        destLat: selected.lat,
        destLng: selected.lng,
      },
    })
      .then((result) => {
        routeCache.current.set(selectedId, result);
        if (!cancelled) setRoute(result);
      })
      .catch(() => {
        if (!cancelled)
          setRoute({
            polyline: null,
            distanceMeters: null,
            durationSeconds: null,
            error: "Routing unavailable",
          });
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Only re-run when the selected node changes, not on every telemetry tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);
  const ranked = [...sensors].sort((a, b) => assessRisk(b).score - assessRisk(a).score);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-eyebrow flex items-center gap-2">
            <span className="live-dot" /> Live sensor mesh ·{" "}
            {feedLabel(liveSensors.length, demoMesh)}
          </p>
          <h1 className="mt-2 flex items-center gap-3 text-4xl font-semibold md:text-5xl">
            <Flame className="size-8 text-primary" aria-hidden />
            WildGuard
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Wildfire prevention and early detection for Washington State crews — Raspberry Pi
            temperature and humidity nodes across the Cascades and eastern shrub-steppe, composite
            risk scoring, and live topography.
          </p>
          <AppNav />
        </div>
        <div className="flex flex-col items-end gap-3">
          <UnitToggle />
          <div className="panel px-4 py-3 text-right">
            <p className="label-eyebrow">Last packet</p>
            <p className="font-mono text-sm tabular-nums">{updatedAt || "syncing…"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {online.length}/{sensors.length} nodes reporting
            </p>
          </div>
        </div>
      </header>

      <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(240px,1fr)_3fr]">
        <div className="panel flex flex-col items-center justify-center p-5">
          <p className="label-eyebrow mb-2 self-start">Current fire risk</p>
          <RiskGauge
            score={network ? network.peak : null}
            level={network ? network.worst.level : null}
            caption={
              network
                ? `Highest node · driven by ${[...network.worst.drivers]
                    .sort((a, b) => b.contribution - a.contribution)[0]!
                    .label.toLowerCase()}`
                : "Awaiting telemetry"
            }
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            icon={<Thermometer className="size-4" />}
            label="Avg temperature"
            value={network ? formatTemp(network.avgTemp, system) : "—"}
            accent="text-temp"
            note="Across reporting nodes"
          />
          <StatCard
            icon={<Droplets className="size-4" />}
            label="Avg humidity"
            value={formatPct(network?.avgHum)}
            accent="text-humidity"
            note="Relative air humidity"
          />
          <StatCard
            icon={<Sprout className="size-4" />}
            label="Soil moisture"
            value={formatPct(network?.avgSoil)}
            accent="text-risk-low"
            note="Dry soil means dry fuel"
          />
          <StatCard
            icon={<Wind className="size-4" />}
            label="Wind"
            value={network?.avgWind !== undefined ? formatWind(network.avgWind, system) : "—"}
            accent="text-accent"
            note={network?.prevailing ? `Mostly from the ${network.prevailing}` : "No wind sensors"}
          />
          <StatCard
            icon={<Radio className="size-4" />}
            label="Reporting units"
            value={`${online.length} / ${sensors.length}`}
            accent="text-risk-low"
            note={`${liveSensors.filter((s) => s.online).length} live Pi · ${sensors.length - online.length} offline`}
          />
          <StatCard
            icon={<Flame className="size-4" />}
            label="Open alerts"
            value={String(evaluateAlerts(sensors).length)}
            accent="text-risk-extreme"
            note="Thresholds breached"
          />
        </div>
      </section>

      <SituationBriefing />

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
            <h2 className="flex items-center gap-2 text-xl">
              <Satellite className="size-4 text-accent" aria-hidden />
              Live topography
            </h2>
            <div
              className="flex items-center gap-1 rounded-full border border-border bg-surface-raised p-1"
              role="tablist"
              aria-label="Map view"
            >
              {(["heat", "risk", "zones"] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  onClick={() => setLayer(mode)}
                  aria-pressed={layer === mode}
                  role="tab"
                  variant="ghost"
                  size="sm"
                  className={`h-7 rounded-full px-3 font-display text-xs uppercase ${
                    layer === mode
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode === "heat" ? "Heat" : mode === "risk" ? "Risk" : "Zones"}
                </Button>
              ))}
            </div>
            {layer !== "zones" && (
              <Button
                type="button"
                onClick={() => setShowStations((v) => !v)}
                aria-pressed={showStations}
                variant="outline"
                size="sm"
                className={
                  showStations ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                }
              >
                <Navigation className="size-3" aria-hidden />
                Stations
              </Button>
            )}
            {layer !== "zones" && (
              <Button
                type="button"
                onClick={() => setShowResources((v) => !v)}
                aria-pressed={showResources}
                variant="outline"
                size="sm"
                className={
                  showResources ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                }
              >
                <Truck className="size-3" aria-hidden />
                Resources
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2">
            {layer === "heat" ? (
              <>
                <span className="label-eyebrow mr-1">Surface temperature</span>
                {HEAT_BANDS.slice()
                  .reverse()
                  .map((band) => (
                    <span
                      key={band.label}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 font-mono text-[0.7rem] tabular-nums"
                    >
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: band.hex }}
                        aria-hidden
                      />
                      {bandLabel(band, system)}
                    </span>
                  ))}
              </>
            ) : layer === "risk" ? (
              <>
                <span className="label-eyebrow mr-1">Composite risk</span>
                {(["low", "moderate", "high", "extreme"] as const).map((level) => (
                  <RiskBadge
                    key={level}
                    level={level}
                    label={`${level} · ${online.filter((x) => assessRisk(x).level === level).length}`}
                  />
                ))}
              </>
            ) : (
              <>
                <span className="label-eyebrow mr-1">One-mile monitoring zones</span>
                <RiskBadge level="extreme" label="High" />
                <RiskBadge level="high" label="Medium" />
                <RiskBadge level="low" label="Low" />
              </>
            )}
          </div>
          <div className="h-[460px] w-full bg-surface-raised">
            {layer === "zones" ? (
              <div className="h-full overflow-y-auto p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {ranked.map((sensor) => (
                    <ZoneCard key={sensor.id} sensor={sensor} />
                  ))}
                </div>
              </div>
            ) : (
              <ClientOnly fallback={<MapSkeleton />}>
                <Suspense fallback={<MapSkeleton />}>
                  <TerrainMap
                    sensors={sensors}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    layer={layer}
                    routePolyline={route?.polyline ?? null}
                    dispatchStation={station}
                    showStations={showStations}
                    resources={showResources ? resources : []}
                  />
                </Suspense>
              </ClientOnly>
            )}
          </div>
        </div>

        <div className="panel flex max-h-[529px] flex-col overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-xl">Nodes by risk</h2>
            <p className="text-xs text-muted-foreground">Tap a node to center the map</p>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {ranked.map((sensor) => (
              <SensorRow
                key={sensor.id}
                sensor={sensor}
                selected={sensor.id === selectedId}
                onSelect={() => setSelectedId(sensor.id)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 panel p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl">Rate of rise — fire risk momentum</h2>
            <p className="text-xs text-muted-foreground">
              {tempUnit(system)} gained per hour across the mesh. Sustained fast rise is the
              earliest ignition signal; crossing the dashed lines escalates a node to warning or
              critical.
            </p>
          </div>
          <p className="font-mono text-sm tabular-nums">
            <span className="label-eyebrow mr-2">Now</span>
            {network
              ? `${rateValue(network.avgRor, system).toFixed(1)} ${rateUnit(system)} avg`
              : "—"}
          </p>
        </div>
        <div className="mt-3">
          <RateOfRiseChart data={ror} />
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="panel p-5">
          <h2 className="text-xl">24-hour network trend</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Temperature, humidity, soil moisture and composite risk (dashed) over the last day
          </p>
          <TrendChart data={trend} />
        </div>

        <div className="panel p-5">
          <h2 className="text-xl">
            {selected ? `${selected.id} · ${selected.name}` : "Node detail"}
          </h2>
          {selected ? (
            <>
              <SensorDetail sensor={selected} />
              <DispatchPanel
                sensor={selected}
                station={station}
                route={route}
                loading={routeLoading}
                resources={resources}
              />
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Select a node from the map or list to inspect its readings and risk drivers.
            </p>
          )}
        </div>
      </section>

      <footer className="mt-8 text-xs text-muted-foreground">
        Statewide mesh readings are simulated for demonstration. Nodes ringed in white are live
        Raspberry Pi units streaming real telemetry — connect one from the Devices page.
      </footer>
    </main>
  );
}

/** Heat legend label rendered in the active measurement system. */
function bandLabel(band: (typeof HEAT_BANDS)[number], system: UnitSystem) {
  const i = HEAT_BANDS.indexOf(band);
  const unit = tempUnit(system);
  const v = (f: number) => Math.round(tempValue(f, system));
  if (i === 0) return `${v(band.min)}${unit}+`;
  if (i === HEAT_BANDS.length - 1) return `Below ${v(HEAT_BANDS[i - 1]!.min)}${unit}`;
  return `${v(band.min)}–${v(HEAT_BANDS[i - 1]!.min)}${unit}`;
}

function SensorDetail({ sensor }: { sensor: SensorReading }) {
  const { system } = useUnits();
  const risk = assessRisk(sensor);
  return (
    <div className="mt-3 space-y-4">
      <div className="flex items-center justify-between">
        <span className="metric-value text-primary">{risk.score}</span>
        <RiskBadge level={risk.level} label={risk.label} />
      </div>
      <dl className="grid grid-cols-2 gap-3 font-mono text-sm tabular-nums">
        <Detail label="Temperature" value={formatTemp(sensor.temperatureF, system)} />
        <Detail label="Humidity" value={formatPct(sensor.humidityPct)} />
        {sensor.soilMoisturePct !== undefined && (
          <Detail label="Soil moisture" value={formatPct(sensor.soilMoisturePct)} />
        )}
        {sensor.windMph !== undefined && (
          <Detail
            label="Wind"
            value={`${formatWind(sensor.windMph, system)}${
              sensor.windDirDeg !== undefined ? ` ${compassPoint(sensor.windDirDeg)}` : ""
            }`}
          />
        )}
        <Detail label="Elevation" value={formatElevation(sensor.elevationM, system)} />
        <Detail label="Battery" value={`${Math.min(100, sensor.batteryPct)} %`} />
        <Detail label="Trend" value={formatRate(sensor.tempTrendFPerHr, system)} />
        <Detail label="Last seen" value={`${sensor.lastSeenSecondsAgo}s ago`} />
        {sensor.airHumidityPct !== undefined && (
          <Detail label="Air humidity" value={`${sensor.airHumidityPct} %`} />
        )}
        <Detail label="Source" value={sensor.source === "live" ? "Live Pi" : "Simulated"} />
      </dl>
      <div className="space-y-2">
        <p className="label-eyebrow">Risk drivers</p>
        {risk.drivers.map((d) => (
          <div key={d.label}>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{d.label}</span>
              <span className="font-mono">{d.contribution}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, d.contribution * 2.2)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DispatchPanel({
  sensor,
  station,
  route,
  loading,
  resources,
}: {
  sensor: SensorReading;
  station: FireStation | null;
  route: ResponseRoute | null;
  loading: boolean;
  resources: Resource[];
}) {
  const { system } = useUnits();
  if (!station) return null;
  const straightKm = distanceKm(sensor, station);
  const km = route?.distanceMeters ? route.distanceMeters / 1000 : straightKm;
  const eta = route?.durationSeconds ? Math.round(route.durationSeconds / 60) : null;

  return (
    <div className="mt-5 border-t border-border pt-4">
      <p className="label-eyebrow flex items-center gap-2 text-accent">
        <Navigation className="size-3.5" aria-hidden />
        Nearest response unit
      </p>
      <p className="mt-2 text-sm">{station.name}</p>
      <p className="text-xs text-muted-foreground">{station.city}, WA</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 font-mono text-sm tabular-nums">
        <Detail
          label={route?.distanceMeters ? "Road distance" : "Direct distance"}
          value={formatDistanceFromKm(km, system)}
        />
        <Detail label="Drive ETA" value={eta ? `${eta} min` : loading ? "…" : "—"} />
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        {loading
          ? "Calculating response route…"
          : route?.polyline
            ? "Blue line shows the fastest road route to this node."
            : `Straight-line bearing shown${route?.error ? ` — ${route.error}` : ""}.`}
      </p>
      <NearestResources sensor={sensor} resources={resources} />
    </div>
  );
}

/** Shivi's resource tracker feeding dispatch: closest assets ready to roll. */
function NearestResources({ sensor, resources }: { sensor: SensorReading; resources: Resource[] }) {
  const { system } = useUnits();
  const nearest = nearestAvailableResources(sensor, resources);
  return (
    <div className="mt-4">
      <p className="label-eyebrow flex items-center gap-2 text-accent">
        <Truck className="size-3.5" aria-hidden />
        Closest ready resources
      </p>
      {nearest.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No available resources right now.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {nearest.map(({ resource, km }) => (
            <li key={resource.id} className="flex items-center justify-between gap-2">
              <span className="truncate capitalize">
                {resourceLabel(resource.type)}{" "}
                <span className="font-mono text-xs text-muted-foreground">{resource.id}</span>
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {formatDistanceFromKm(km, system)} · {resource.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised/50 px-3 py-2">
      <dt className="text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  note,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  accent: string;
}) {
  return (
    <div className="panel p-5">
      <p className={`label-eyebrow flex items-center gap-2 ${accent}`}>
        {icon}
        {label}
      </p>
      <p className={`metric-value mt-3 ${accent}`}>{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
      Loading terrain…
    </div>
  );
}

function GuardedDashboard() {
  return (
    <RequireRole roles={["firefighter"]}>
      <Dashboard />
    </RequireRole>
  );
}
