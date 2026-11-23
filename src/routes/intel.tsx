import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { RequireRole } from "@/components/RequireRole";
import { useServerFn } from "@tanstack/react-start";
import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Check,
  ClipboardCopy,
  CloudSun,
  Compass,
  Flame,
  LoaderCircle,
  Mountain,
  Navigation,
  Plane,
  Radar,
  Search,
  ShieldAlert,
  Trees,
  Truck,
} from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { RiskBadge } from "@/components/RiskBadge";
import { UnitToggle } from "@/components/UnitToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFieldData } from "@/lib/field-data";
import { predictSpread, type FireLine } from "@/lib/fire-spread";
import { assessArea, type AreaAssessment } from "@/lib/intel.functions";
import {
  FIRE_STATIONS,
  assessRisk,
  compassPoint,
  type RiskLevel,
  type SensorReading,
} from "@/lib/sensors";
import { formatDistanceFromKm, formatWind, useUnits } from "@/lib/units";

const LeafletMap = lazy(() => import("@/components/LeafletMap"));

export const Route = createFileRoute("/intel")({
  head: () => ({
    meta: [
      { title: "Area Intelligence — WildGuard" },
      {
        name: "description",
        content:
          "Fire spread prediction, terrain, and recommended fire-line positions with truck, drone and helicopter GPS.",
      },
    ],
  }),
  component: GuardedIntelPage,
});

interface Origin {
  label: string;
  lat: number;
  lng: number;
  sensorId?: string;
}

interface Conditions {
  windMph: number;
  windFromDeg: number;
  humidityPct: number;
  soilMoisturePct: number;
  temperatureF: number;
}

function conditionsFrom(s: SensorReading, fallback: SensorReading[]): Conditions {
  // Borrow wind from the nearest node that measures it if this one doesn't.
  const windy = s.windMph !== undefined ? s : fallback.find((x) => x.windMph !== undefined);
  return {
    windMph: Math.round(windy?.windMph ?? 12),
    windFromDeg: (Math.round((windy?.windDirDeg ?? 270) / 22.5) * 22.5) % 360,
    humidityPct: s.humidityPct ?? 25,
    soilMoisturePct: s.soilMoisturePct ?? 20,
    temperatureF: Math.round(s.temperatureF),
  };
}

function IntelPage() {
  const { sensors } = useFieldData();
  const { system } = useUnits();
  const assess = useServerFn(assessArea);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [ai, setAi] = useState<{ assessment: AreaAssessment; checkedAt: string } | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [conditions, setConditions] = useState<Conditions | null>(null);

  const ranked = useMemo(
    () =>
      [...sensors]
        .filter((s) => s.online)
        .sort((a, b) => assessRisk(b).score - assessRisk(a).score),
    [sensors],
  );

  // Start on the riskiest node so the page is never empty in a demo.
  useEffect(() => {
    if (origin || !ranked.length) return;
    pickSensor(ranked[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked.length]);

  function pickSensor(s: SensorReading) {
    setOrigin({ label: `${s.id} · ${s.name}`, lat: s.lat, lng: s.lng, sensorId: s.id });
    setConditions(conditionsFrom(s, ranked));
    setAi(null);
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setNotice(null);

    // "47.6, -122.2" → use directly.
    const coords = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coords) {
      const lat = Number(coords[1]);
      const lng = Number(coords[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        setOrigin({ label: `${lat}, ${lng}`, lat, lng });
        setConditions(
          (c) =>
            c ?? {
              windMph: 12,
              windFromDeg: 270,
              humidityPct: 25,
              soilMoisturePct: 20,
              temperatureF: 85,
            },
        );
        setAi(null);
        return;
      }
    }

    setBusy(true);
    try {
      const result = await assess({ data: { query: q } });
      if (result.ok) {
        const a = result.assessment;
        setAi(result);
        setOrigin({ label: a.place, lat: a.lat, lng: a.lng });
        setConditions({
          windMph: Math.round(a.windMph),
          windFromDeg: (Math.round(a.windFromDeg / 22.5) * 22.5) % 360,
          humidityPct: Math.round(a.humidityPct),
          soilMoisturePct: 20,
          temperatureF: Math.round(a.temperatureF),
        });
        return;
      }
      // Offline: match a sensor, station or town we already know.
      const needle = q.toLowerCase();
      const sensor = sensors.find(
        (s) =>
          s.name.toLowerCase().includes(needle) ||
          s.zone.toLowerCase().includes(needle) ||
          s.id.toLowerCase() === needle,
      );
      if (sensor) {
        pickSensor(sensor);
        setNotice(`${result.notice} Showing the matching sensor instead.`);
        return;
      }
      const station = FIRE_STATIONS.find(
        (s) => s.city.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle),
      );
      if (station) {
        setOrigin({ label: `${station.city} area`, lat: station.lat, lng: station.lng });
        setConditions(
          (c) =>
            c ?? {
              windMph: 12,
              windFromDeg: 270,
              humidityPct: 25,
              soilMoisturePct: 20,
              temperatureF: 85,
            },
        );
        setAi(null);
        setNotice(`${result.notice} Showing ${station.city} from the station list instead.`);
        return;
      }
      setNotice(
        `${result.notice} Offline, search by sensor name, a station town, or coordinates like "47.53, -122.03".`,
      );
    } catch {
      setNotice("Search failed. Try again or pick a sensor below.");
    } finally {
      setBusy(false);
    }
  }

  const spread = useMemo(
    () =>
      origin && conditions
        ? predictSpread({ lat: origin.lat, lng: origin.lng, ...conditions })
        : null,
    [origin, conditions],
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-eyebrow flex items-center gap-2">
            <span className="live-dot" /> Fire spread · fire lines · air &amp; ground routing
          </p>
          <h1 className="mt-2 flex items-center gap-3 text-4xl font-semibold md:text-5xl">
            <Radar className="size-8 text-primary" aria-hidden />
            Area intelligence
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Pick a sensor or search any area. WildGuard predicts where a fire would run in the next
            hour and where crews, drones and helicopters should go to cut it off.
          </p>
          <AppNav />
        </div>
        <UnitToggle />
      </header>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <form onSubmit={search} className="panel space-y-3 p-5">
          <p className="label-eyebrow">Search an area</p>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sequoia National Forest, California — or 47.53, -122.03"
              aria-label="Area to assess"
              maxLength={200}
            />
            <Button type="submit" disabled={busy || !query.trim()}>
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              Assess
            </Button>
          </div>
          {notice && <p className="text-xs text-risk-moderate">{notice}</p>}
          <p className="label-eyebrow pt-2">Or start from a sensor</p>
          <div className="flex flex-wrap gap-2">
            {ranked.slice(0, 8).map((s) => {
              const r = assessRisk(s);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickSensor(s)}
                  aria-pressed={origin?.sensorId === s.id}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    origin?.sensorId === s.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.name} · {r.score}
                </button>
              );
            })}
          </div>
        </form>

        {conditions && (
          <div className="panel space-y-3 p-5">
            <p className="label-eyebrow">Conditions (drag to test “what if”)</p>
            <Slider
              label={`Wind ${formatWind(conditions.windMph, system)}`}
              min={0}
              max={50}
              value={conditions.windMph}
              onChange={(v) => setConditions({ ...conditions, windMph: v })}
            />
            <Slider
              label={`Wind from ${compassPoint(conditions.windFromDeg)} (${conditions.windFromDeg}°)`}
              min={0}
              max={337.5}
              step={22.5}
              value={conditions.windFromDeg}
              onChange={(v) => setConditions({ ...conditions, windFromDeg: v })}
            />
            <Slider
              label={`Humidity ${conditions.humidityPct}%`}
              min={2}
              max={90}
              value={conditions.humidityPct}
              onChange={(v) => setConditions({ ...conditions, humidityPct: v })}
            />
            <Slider
              label={`Soil moisture ${conditions.soilMoisturePct}%`}
              min={0}
              max={80}
              value={conditions.soilMoisturePct}
              onChange={(v) => setConditions({ ...conditions, soilMoisturePct: v })}
            />
          </div>
        )}
      </section>

      {ai && <AiSummary assessment={ai.assessment} checkedAt={ai.checkedAt} />}

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="flex items-center gap-2 text-xl">
              <Mountain className="size-4 text-accent" aria-hidden />
              Terrain map
            </h2>
            <span className="text-xs text-muted-foreground">
              {origin?.label ?? "No origin yet"}
            </span>
          </div>
          <div className="h-[520px] w-full bg-surface-raised">
            <ClientOnly fallback={<MapNote text="Loading map…" />}>
              <Suspense fallback={<MapNote text="Loading map…" />}>
                <LeafletMap
                  sensors={sensors}
                  selectedId={null}
                  onSelect={() => {}}
                  layer="risk"
                  showStations
                  spread={spread}
                />
              </Suspense>
            </ClientOnly>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-border px-5 py-2 text-xs text-muted-foreground">
            <Legend color="#e3452f" label="Origin, 1-hour run & impact area" />
            <Legend color="#f2c14b" label="Fire line" />
            <Legend color="#3ec7a1" label="Anchor point" />
            <Legend color="#2f7fd4" label="Route from nearest station" />
          </div>
        </div>

        {spread && (
          <div className="panel space-y-4 p-5">
            <h2 className="flex items-center gap-2 text-xl">
              <Flame className="size-4 text-primary" aria-hidden />
              Fire spread prediction
            </h2>
            <dl className="grid grid-cols-2 gap-3 font-mono text-sm tabular-nums">
              <Cell
                label="Direction of travel"
                value={`${spread.headingLabel} (${spread.headingDeg}°)`}
              />
              <Cell label="Wind source" value={`from ${spread.windFromLabel}`} />
              <Cell label="Spread speed" value={<Speed kmh={spread.speedKmh} />} />
              <Cell label="1-hour reach" value={<Dist km={spread.oneHourReachKm} />} />
            </dl>
            <div>
              <p className="label-eyebrow">Why</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
                {spread.reasoning.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              A classroom model, not an operational forecast. Real incidents follow incident
              command.
            </p>
          </div>
        )}
      </section>

      {ai && ai.assessment.terrain.length > 0 && (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-xl">
            <Mountain className="size-4 text-accent" aria-hidden />
            Terrain &amp; topography
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ai.assessment.terrain.map((t) => (
              <div key={t.name} className="panel p-4">
                <p className="label-eyebrow capitalize">{t.type}</p>
                <p className="mt-1 font-display text-lg">{t.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {spread && (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-xl">
            <Navigation className="size-4 text-accent" aria-hidden />
            Recommended fire-line positions
          </h2>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {spread.fireLines.map((line) => (
              <FireLineCard key={line.id} line={line} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function AiSummary({
  assessment: a,
  checkedAt,
}: {
  assessment: AreaAssessment;
  checkedAt: string;
}) {
  return (
    <section className="mt-6 panel space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <RiskBadge
          level={a.overallRisk.toLowerCase() as RiskLevel}
          label={`${a.overallRisk} risk`}
        />
        <h2 className="text-xl">{a.place}</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          AI web assessment · {new Date(checkedAt).toLocaleTimeString()}
        </span>
      </div>
      <p className="text-sm">{a.summary}</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Info icon={<Flame className="size-4" />} title="Active fires">
          {a.activeFires.length ? (
            <ul className="list-disc space-y-1 pl-4">
              {a.activeFires.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : (
            "None reported."
          )}
        </Info>
        <Info icon={<Trees className="size-4" />} title="Vegetation & fuel">
          {a.vegetation}
        </Info>
        <Info icon={<CloudSun className="size-4" />} title="Weather">
          {a.weather}
        </Info>
        <Info icon={<ShieldAlert className="size-4" />} title="Preparedness">
          <ul className="list-disc space-y-1 pl-4">
            {a.preparedness.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Info>
      </div>
    </section>
  );
}

function FireLineCard({ line }: { line: FireLine }) {
  const gps = `${line.position.lat}, ${line.position.lng}`;
  return (
    <article className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl tracking-wide">{line.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{line.purpose}</p>
        </div>
        <CopyButton text={gps} label="Copy GPS" />
      </div>
      <p className="mt-2 font-mono text-sm">{gps}</p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Unit icon={<Truck className="size-4" />} title="Firetruck">
          <p className="text-xs text-muted-foreground">From {line.station.name}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <LinkButton href={line.truck.googleMaps}>Google Maps</LinkButton>
            <LinkButton href={line.truck.waze}>Waze</LinkButton>
          </div>
        </Unit>
        <Unit icon={<Compass className="size-4" />} title="Fire drone">
          <AirFacts line={line} />
          <div className="mt-2 flex flex-wrap gap-2">
            <LinkButton href={line.air.satellite}>Satellite view</LinkButton>
          </div>
        </Unit>
        <Unit icon={<Plane className="size-4" />} title="Helicopter">
          <AirFacts line={line} />
          <p className="mt-2 text-xs text-muted-foreground">
            Crewed ops: confirm altitude and landing zone with air attack before the drop.
          </p>
        </Unit>
      </div>

      <div className="mt-3 rounded-lg border border-risk-moderate/50 bg-risk-moderate/10 p-3 text-xs">
        <p className="font-display tracking-[0.14em] text-risk-moderate uppercase">
          NOTAM / TFR alert
        </p>
        <p className="mt-1 text-muted-foreground">
          Assume a Temporary Flight Restriction over the fire. Drones: stay at or below 400 ft AGL,
          keep visual line of sight, and land immediately if crewed aircraft appear. Monitor the
          incident's air traffic frequency. If you fly, they can't.
        </p>
      </div>
    </article>
  );
}

function AirFacts({ line }: { line: FireLine }) {
  const { system } = useUnits();
  return (
    <dl className="space-y-0.5 font-mono text-xs tabular-nums">
      <div className="flex justify-between gap-2">
        <dt className="text-muted-foreground">Heading</dt>
        <dd>
          {line.air.headingDeg}° {line.air.headingLabel}
        </dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt className="text-muted-foreground">Distance</dt>
        <dd>
          {formatDistanceFromKm(line.air.distanceKm, system)} · {line.air.distanceNm} nm
        </dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt className="text-muted-foreground">From</dt>
        <dd className="truncate">{line.station.city}</dd>
      </div>
    </dl>
  );
}

function Speed({ kmh }: { kmh: number }) {
  const { system } = useUnits();
  return <>{system === "metric" ? `${kmh} km/h` : formatWind(kmh / 1.609344, system)}</>;
}

function Dist({ km }: { km: number }) {
  const { system } = useUnits();
  return <>{formatDistanceFromKm(km, system, 2)}</>;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:bg-surface-raised"
    >
      {children} ↗
    </a>
  );
}

function Unit({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised/50 p-3">
      <p className="label-eyebrow flex items-center gap-1.5 text-accent">
        {icon}
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Info({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised/50 p-3 text-sm">
      <p className="label-eyebrow flex items-center gap-1.5">
        {icon}
        {title}
      </p>
      <div className="mt-2 text-muted-foreground">{children}</div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised/50 px-3 py-2">
      <dt className="text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--color-primary)]"
      />
    </label>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {label}
    </span>
  );
}

function MapNote({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function GuardedIntelPage() {
  return (
    <RequireRole roles={["firefighter"]}>
      <IntelPage />
    </RequireRole>
  );
}
