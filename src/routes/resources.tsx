import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { RequireRole } from "@/components/RequireRole";
import { Suspense, lazy, useMemo, useState } from "react";
import { MapPin, Truck } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { RiskBadge } from "@/components/RiskBadge";
import { UnitToggle } from "@/components/UnitToggle";
import {
  RESOURCE_STATUSES,
  RESOURCE_STATUS_HEX,
  resourceLabel,
  useFieldData,
  type Resource,
  type ResourceStatus,
} from "@/lib/field-data";
import { assessRisk, distanceKm, nearestStation, type SensorReading } from "@/lib/sensors";
import { formatDistanceFromKm, useUnits } from "@/lib/units";

const TerrainMap = lazy(() => import("@/components/TerrainMap"));

export const Route = createFileRoute("/resources")({
  head: () => ({
    meta: [
      { title: "Resource Tracker — WildGuard" },
      {
        name: "description",
        content:
          "Track water tankers, fire trucks, ambulances, evacuation buses and supplies in real time alongside wildfire sensor risk.",
      },
      { property: "og:title", content: "Resource Tracker — WildGuard" },
      {
        property: "og:description",
        content: "Live emergency resource status and location for wildfire response crews.",
      },
    ],
  }),
  component: GuardedResourcesPage,
});

function ResourcesPage() {
  const { resources, sensors, updatedAt } = useFieldData();
  const [selectedId, setSelectedId] = useState<string | null>(resources[0]?.id ?? null);
  const [filter, setFilter] = useState<ResourceStatus | "All">("All");

  const visible = useMemo(
    () => (filter === "All" ? resources : resources.filter((r) => r.status === filter)),
    [resources, filter],
  );
  const counts = useMemo(() => {
    const out = Object.fromEntries(RESOURCE_STATUSES.map((s) => [s, 0])) as Record<
      ResourceStatus,
      number
    >;
    resources.forEach((r) => (out[r.status] += 1));
    return out;
  }, [resources]);
  const selected = resources.find((r) => r.id === selectedId) ?? null;
  // Fit the map to the resources once; they drift slightly as the simulation runs.
  const [fitTo] = useState(() => resources.map((r) => r.location));

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-eyebrow flex items-center gap-2">
            <span className="live-dot" /> Live updates every 10s
          </p>
          <h1 className="mt-2 flex items-center gap-3 text-4xl font-semibold md:text-5xl">
            <Truck className="size-8 text-primary" aria-hidden />
            Resource tracker
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Water tankers, engines, ambulances, evacuation buses and supplies — where they are,
            whether they are ready, and how close they sit to the riskiest sensor zones.
          </p>
          <AppNav />
        </div>
        <div className="flex flex-col items-end gap-3">
          <UnitToggle />
          <div className="panel px-4 py-3 text-right">
            <p className="label-eyebrow">Ready to deploy</p>
            <p className="metric-value text-risk-low">{counts.Available}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              of {resources.length} tracked · {updatedAt || "syncing…"}
            </p>
          </div>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {(["All", ...RESOURCE_STATUSES] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            aria-pressed={filter === status}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-display text-xs tracking-[0.14em] uppercase transition-colors ${
              filter === status
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {status !== "All" && (
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: RESOURCE_STATUS_HEX[status] }}
                aria-hidden
              />
            )}
            {status}
            <span className="font-mono">
              {status === "All" ? resources.length : counts[status]}
            </span>
          </button>
        ))}
      </div>

      <section className="mt-4 grid gap-6 lg:grid-cols-[1fr_1.6fr_1fr]">
        <div className="panel flex max-h-[520px] flex-col overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-xl">Resource list</h2>
          </div>
          <ul className="flex-1 space-y-2 overflow-y-auto p-3">
            {visible.map((resource) => (
              <li key={resource.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(resource.id)}
                  aria-pressed={resource.id === selectedId}
                  className={`w-full rounded-lg border bg-surface-raised/50 p-3 text-left transition-colors hover:bg-surface-raised ${
                    resource.id === selectedId ? "border-primary/60" : "border-border"
                  }`}
                >
                  <p className="font-mono text-sm">{resource.id}</p>
                  <p className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <span className="capitalize text-muted-foreground">
                      {resourceLabel(resource.type)}
                    </span>
                    <StatusPill status={resource.status} />
                  </p>
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="p-3 text-sm text-muted-foreground">No resources with this status.</li>
            )}
          </ul>
        </div>

        <div className="panel overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <h2 className="flex items-center gap-2 text-xl">
              <MapPin className="size-4 text-accent" aria-hidden />
              Field map
            </h2>
          </div>
          <div className="h-[468px] w-full bg-surface-raised">
            <ClientOnly fallback={<MapSkeleton />}>
              <Suspense fallback={<MapSkeleton />}>
                <TerrainMap
                  sensors={sensors}
                  selectedId={null}
                  onSelect={() => {}}
                  layer="risk"
                  showStations
                  resources={visible}
                  selectedResourceId={selectedId}
                  onSelectResource={setSelectedId}
                  fitTo={fitTo}
                />
              </Suspense>
            </ClientOnly>
          </div>
        </div>

        <aside className="panel p-5" aria-live="polite">
          {selected ? (
            <ResourceDetail resource={selected} sensors={sensors} />
          ) : (
            <p className="text-sm text-muted-foreground">Select a resource to view details.</p>
          )}
        </aside>
      </section>
    </main>
  );
}

function ResourceDetail({ resource, sensors }: { resource: Resource; sensors: SensorReading[] }) {
  const { system } = useUnits();
  const online = sensors.filter((s) => s.online);
  // Sensor-aware context: which monitored zone is this asset closest to?
  const nearestSensor = online.reduce<{ sensor: SensorReading; km: number } | null>((best, s) => {
    const km = distanceKm(resource.location, s);
    return !best || km < best.km ? { sensor: s, km } : best;
  }, null);
  const risk = nearestSensor ? assessRisk(nearestSensor.sensor) : null;
  const station = nearestStation(resource.location);

  return (
    <div className="space-y-4">
      <div>
        <p className="label-eyebrow capitalize">{resourceLabel(resource.type)}</p>
        <h2 className="mt-1 font-mono text-xl">{resource.id}</h2>
        <div className="mt-2">
          <StatusPill status={resource.status} />
        </div>
      </div>
      <p className="font-mono text-xs text-muted-foreground tabular-nums">
        Lat {resource.location.lat.toFixed(3)}, Lng {resource.location.lng.toFixed(3)}
      </p>
      <div>
        <p className="label-eyebrow">Capacity</p>
        <dl className="mt-2 grid grid-cols-2 gap-2 font-mono text-sm tabular-nums">
          {Object.entries(resource.capacity).map(([key, value]) => (
            <div
              key={key}
              className="rounded-lg border border-border bg-surface-raised/50 px-3 py-2"
            >
              <dt className="text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase">
                {resourceLabel(key)}
              </dt>
              <dd className="mt-0.5">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {nearestSensor && risk && (
        <div className="border-t border-border pt-4">
          <p className="label-eyebrow">Nearest sensor zone</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-sm">
              {nearestSensor.sensor.id} · {nearestSensor.sensor.name}
            </p>
            <RiskBadge level={risk.level} label={risk.label} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDistanceFromKm(nearestSensor.km, system)} away · risk score {risk.score}
          </p>
        </div>
      )}
      <div className="border-t border-border pt-4">
        <p className="label-eyebrow">Home station</p>
        <p className="mt-1 text-sm">{station.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatDistanceFromKm(distanceKm(resource.location, station), system)} away
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Last updated {resource.lastUpdated.replace("T", " ").slice(0, 19)} UTC
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: ResourceStatus }) {
  const color = RESOURCE_STATUS_HEX[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-display text-[0.7rem] tracking-[0.1em] uppercase"
      style={{ border: `1px solid ${color}`, color }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {status}
    </span>
  );
}

function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
      Loading map…
    </div>
  );
}

function GuardedResourcesPage() {
  return (
    <RequireRole roles={["firefighter"]}>
      <ResourcesPage />
    </RequireRole>
  );
}
