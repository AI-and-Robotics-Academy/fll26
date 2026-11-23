import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BellRing,
  CloudSun,
  Flame,
  House,
  LocateFixed,
  LogIn,
  MapPin,
  Phone,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { RiskGauge } from "@/components/RiskGauge";
import { UnitToggle } from "@/components/UnitToggle";
import { Button } from "@/components/ui/button";
import { ROLE_HOME, ROLE_LABEL, useAuth, type Role } from "@/lib/demo-auth";
import { useFieldData } from "@/lib/field-data";
import {
  PLACES,
  PUBLIC_RADIUS_KM,
  findPlace,
  nearestPlace,
  summarizeArea,
} from "@/lib/public-info";
import { formatDistanceFromKm, formatPct, formatTemp, formatWind, useUnits } from "@/lib/units";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WildGuard — Wildfire danger near you" },
      {
        name: "description",
        content:
          "Free public wildfire information for Washington: fire danger, active alerts, conditions and readiness steps near you. Firefighters sign in for the command center.",
      },
      { property: "og:title", content: "WildGuard — Wildfire danger near you" },
      {
        property: "og:description",
        content: "Check wildfire danger, alerts and conditions near you — no account needed.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

const PLACE_KEY = "wildguard.publicPlace";

function Landing() {
  const { sensors, updatedAt } = useFieldData();
  const { user, ready } = useAuth();
  const { system } = useUnits();
  const [placeName, setPlaceName] = useState("Bellevue");
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);

  // Remember the visitor's town; signed-in users start at their home town.
  useEffect(() => {
    const saved = window.localStorage.getItem(PLACE_KEY);
    if (saved) setPlaceName(saved);
    else if (user) setPlaceName(user.homePlace);
  }, [user]);

  function choose(name: string) {
    setPlaceName(name);
    try {
      window.localStorage.setItem(PLACE_KEY, name);
    } catch {
      /* ignore */
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      setLocNote("Location isn't available in this browser — pick your town instead.");
      return;
    }
    setLocating(true);
    setLocNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = nearestPlace({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        choose(p.name);
        setLocNote(`Showing the closest listed town: ${p.name}.`);
        setLocating(false);
      },
      () => {
        setLocNote("Couldn't get your location — pick your town instead.");
        setLocating(false);
      },
      { timeout: 8000, maximumAge: 600000 },
    );
  }

  const place = findPlace(placeName);
  const area = useMemo(() => summarizeArea(place, sensors), [place, sensors]);
  const radius = formatDistanceFromKm(PUBLIC_RADIUS_KM, system, 0);

  return (
    <main className="terrain-grid min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label-eyebrow flex items-center gap-2">
              <span className="live-dot" /> Public wildfire information · no account needed
            </p>
            <h1 className="mt-2 flex items-center gap-3 text-4xl font-semibold md:text-6xl">
              <Flame className="size-9 text-primary" aria-hidden />
              WildGuard
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Wildfire danger, alerts and conditions near you, from our team's Raspberry Pi sensor
              network. Firefighters sign in for the command center.
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <UnitToggle />
            {ready && user ? (
              <Link
                to={ROLE_HOME[user.role]}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                {user.role === "firefighter" ? (
                  <Flame className="size-4" />
                ) : (
                  <House className="size-4" />
                )}
                Open {user.role === "firefighter" ? "command center" : "My area"} · {user.name}
              </Link>
            ) : (
              <Link
                to="/auth"
                search={{ mode: "signin" }}
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-surface-raised"
              >
                <LogIn className="size-4" /> Sign in
              </Link>
            )}
          </div>
        </header>

        <section className="mt-8 panel flex flex-wrap items-center gap-3 p-4">
          <MapPin className="size-5 text-accent" aria-hidden />
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Wildfire info near</span>
            <select
              value={place.name}
              onChange={(e) => choose(e.target.value)}
              className="h-9 rounded-md border border-input bg-surface-raised px-3 text-sm"
              aria-label="Your town"
            >
              {PLACES.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}, WA
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="outline" size="sm" onClick={locate} disabled={locating}>
            <LocateFixed className="size-4" aria-hidden />
            {locating ? "Locating…" : "Use my location"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Within {radius} · updated {updatedAt || "…"}
          </span>
          {locNote && <span className="w-full text-xs text-muted-foreground">{locNote}</span>}
        </section>

        <section
          className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          aria-label="Wildfire info near you"
        >
          <PublicCard
            icon={<Flame className="size-4" />}
            title="Fire danger near you"
            accent="text-primary"
          >
            <RiskGauge
              score={area.score}
              level={area.level}
              caption={
                area.coverage
                  ? `Highest reading from ${area.coverage} sensor${area.coverage > 1 ? "s" : ""} near ${place.name}`
                  : area.nearestKm !== null
                    ? `No sensors within ${radius}; nearest is ${formatDistanceFromKm(area.nearestKm, system, 0)} away`
                    : "No sensors reporting"
              }
            />
          </PublicCard>

          <PublicCard
            icon={<BellRing className="size-4" />}
            title="Active alerts"
            accent="text-risk-extreme"
          >
            <p className="metric-value text-risk-extreme">{area.alerts.total}</p>
            <p className="text-xs text-muted-foreground">
              {area.alerts.total
                ? `warning${area.alerts.total > 1 ? "s" : ""} near ${place.name}`
                : `No warnings near ${place.name}`}
            </p>
            {area.alerts.byType.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {area.alerts.byType.map((t) => (
                  <li key={t.label} className="flex justify-between gap-2">
                    <span>{t.label}</span>
                    <span className="font-mono text-muted-foreground">{t.count}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              See smoke or flames? <strong className="text-foreground">Call 911</strong> first.
            </p>
          </PublicCard>

          <PublicCard
            icon={<CloudSun className="size-4" />}
            title="Conditions now"
            accent="text-accent"
          >
            <dl className="grid grid-cols-2 gap-2 font-mono text-sm tabular-nums">
              <Stat
                label="Temp"
                value={
                  area.conditions.temperatureF !== null
                    ? formatTemp(area.conditions.temperatureF, system, 0)
                    : "—"
                }
              />
              <Stat label="Humidity" value={formatPct(area.conditions.humidityPct ?? undefined)} />
              <Stat
                label="Wind"
                value={
                  area.conditions.windMph !== null
                    ? `${formatWind(area.conditions.windMph, system)}${area.conditions.windFrom ? ` ${area.conditions.windFrom}` : ""}`
                    : "—"
                }
              />
              <Stat label="Soil" value={formatPct(area.conditions.soilPct ?? undefined)} />
            </dl>
            <p className="mt-3 rounded-md border border-border bg-surface-raised/60 p-2 text-xs">
              <span className="label-eyebrow block">Outdoor burning</span>
              {area.burnAdvice}
            </p>
          </PublicCard>

          <PublicCard
            icon={<ShieldCheck className="size-4" />}
            title="Ready · Set · Go"
            accent="text-risk-low"
          >
            <p className="text-sm font-medium">
              <span className="mr-2 rounded-full bg-risk-low/20 px-2 py-0.5 font-display text-xs tracking-[0.14em] text-risk-low uppercase">
                {area.readiness.stage}
              </span>
              {area.readiness.headline}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
              {area.readiness.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="size-3" aria-hidden /> Nearest station: {area.nearestStation.name} (
              {formatDistanceFromKm(area.nearestStation.km, system, 0)})
            </p>
          </PublicCard>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2" aria-label="Accounts">
          <RoleCta
            role="firefighter"
            icon={<Flame className="size-5" />}
            title="Firefighters"
            text="Live sensor map, threshold alarms, fire-spread prediction, fire-line GPS, resources and devices."
          />
          <RoleCta
            role="citizen"
            icon={<House className="size-5" />}
            title="Citizens"
            text="Your home area's danger and readiness checklist, nearest shelter, and one-tap smoke reports to crews."
          />
        </section>

        <footer className="mt-8 text-xs text-muted-foreground">
          This public view shows area-level information only. Exact sensor locations, crew and
          equipment positions, and fire-line plans are shared with signed-in firefighters. FLL demo:
          statewide readings are simulated; Eastside readings can come from live Raspberry Pi units.
        </footer>
      </div>
    </main>
  );
}

function RoleCta({
  role,
  icon,
  title,
  text,
}: {
  role: Role;
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="panel flex flex-col gap-3 p-5">
      <h2 className="flex items-center gap-2 text-2xl">
        <span className={role === "firefighter" ? "text-primary" : "text-accent"}>{icon}</span>
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{text}</p>
      <div className="mt-auto flex flex-wrap gap-2">
        <Link
          to="/auth"
          search={{ mode: "signin", role }}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <LogIn className="size-4" /> Sign in as {ROLE_LABEL[role].toLowerCase()}
        </Link>
        <Link
          to="/auth"
          search={{ mode: "signup", role }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm hover:bg-surface-raised"
        >
          <UserPlus className="size-4" /> Sign up
        </Link>
      </div>
    </div>
  );
}

function PublicCard({
  icon,
  title,
  accent,
  children,
}: {
  icon: ReactNode;
  title: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <article className="panel flex flex-col p-5">
      <h2 className={`label-eyebrow mb-3 flex items-center gap-2 ${accent}`}>
        {icon}
        {title}
      </h2>
      {children}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised/50 px-3 py-2">
      <dt className="text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
