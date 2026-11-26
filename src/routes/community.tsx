import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BellRing,
  CheckCircle2,
  Flame,
  House,
  LocateFixed,
  MapPinned,
  Megaphone,
  Phone,
  Tent,
} from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { RequireRole } from "@/components/RequireRole";
import { RiskGauge } from "@/components/RiskGauge";
import { UnitToggle } from "@/components/UnitToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/demo-auth";
import { useFieldData } from "@/lib/field-data";
import { PLACES, findPlace, summarizeArea } from "@/lib/public-info";
import { getReports, submitReport } from "@/lib/reports.functions";
import type { CitizenReport } from "@/lib/reports.server";
import { distanceKm } from "@/lib/sensors";
import { formatDistanceFromKm, formatPct, formatTemp, formatWind, useUnits } from "@/lib/units";

export const Route = createFileRoute("/community")({
  head: () => ({
    meta: [
      { title: "My area — WildGuard" },
      {
        name: "description",
        content: "Wildfire danger, readiness and smoke reporting for your home area.",
      },
      { property: "og:title", content: "My area — WildGuard" },
      { property: "og:description", content: "Wildfire danger, readiness and smoke reporting for your home area." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireRole roles={["citizen", "firefighter"]}>
      <CommunityPage />
    </RequireRole>
  ),
});

const CHECKLIST = [
  "Pack a go-bag: water, food, meds, chargers, flashlight",
  "Copy important documents (IDs, insurance) to a USB or cloud",
  "Make a family meeting place and contact plan",
  "Plan for pets and anyone who needs help moving",
  "Clear leaves and needles from roof, gutters and 5 ft around the house",
  "Keep N95 masks for smoky days",
  "Sign up for your county's emergency alerts",
  "Practice leaving the house in 10 minutes",
];

function CommunityPage() {
  const { user } = useAuth();
  const { sensors, resources } = useFieldData();
  const { system } = useUnits();
  const [placeName, setPlaceName] = useState(user?.homePlace ?? "Bellevue");
  const place = findPlace(placeName);
  const area = useMemo(() => summarizeArea(place, sensors), [place, sensors]);

  // Shelters are public; other resource positions stay crew-only.
  const shelter = useMemo(
    () =>
      resources
        .filter((r) => r.type === "shelter_supply" && r.status !== "Offline")
        .map((r) => ({ r, km: distanceKm(place, r.location) }))
        .sort((a, b) => a.km - b.km)[0] ?? null,
    [resources, place],
  );

  const dangerous = area.level === "high" || area.level === "extreme";

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-eyebrow flex items-center gap-2">
            <span className="live-dot" /> Citizen view
          </p>
          <h1 className="mt-2 flex items-center gap-3 text-4xl font-semibold md:text-5xl">
            <MapPinned className="size-8 text-accent" aria-hidden />
            My area
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Hi {user?.name.split(" ")[0]} — here's wildfire danger around your home and what to do
            about it.
          </p>
          <AppNav />
        </div>
        <div className="flex flex-col items-end gap-3">
          <UnitToggle />
          <label className="flex items-center gap-2 text-sm">
            <House className="size-4 text-muted-foreground" aria-hidden />
            <select
              value={place.name}
              onChange={(e) => setPlaceName(e.target.value)}
              className="h-9 rounded-md border border-input bg-surface-raised px-3 text-sm"
              aria-label="Home town"
            >
              {PLACES.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}, WA
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {dangerous && (
        <section
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-lg border border-risk-extreme/60 bg-risk-extreme/15 p-4"
        >
          <BellRing className="mt-0.5 size-5 shrink-0 text-risk-extreme" aria-hidden />
          <div>
            <p className="font-display text-lg tracking-wide text-risk-extreme uppercase">
              {area.levelLabel} fire danger near {place.name}
            </p>
            <p className="text-sm">
              {area.readiness.headline}. Follow official evacuation orders right away.
            </p>
          </div>
        </section>
      )}

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="panel flex flex-col items-center p-5">
          <p className="label-eyebrow mb-2 self-start">Fire danger at home</p>
          <RiskGauge
            score={area.score}
            level={area.level}
            caption={`${area.alerts.total} active warning${area.alerts.total === 1 ? "" : "s"} near ${place.name}`}
          />
          <dl className="mt-4 grid w-full grid-cols-2 gap-2 font-mono text-sm tabular-nums">
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
        </div>

        <div className="panel space-y-4 p-5">
          <div>
            <p className="label-eyebrow flex items-center gap-2 text-accent">
              <Tent className="size-3.5" aria-hidden /> Nearest shelter supplies
            </p>
            {shelter ? (
              <p className="mt-2 text-sm">
                {shelter.r.capacity["blankets"] ?? "—"} blankets ·{" "}
                {shelter.r.capacity["meal_packs"] ?? "—"} meal packs —{" "}
                {formatDistanceFromKm(shelter.km, system, 0)} away ({shelter.r.status})
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No shelter listed nearby.</p>
            )}
          </div>
          <div>
            <p className="label-eyebrow flex items-center gap-2 text-accent">
              <Phone className="size-3.5" aria-hidden /> Nearest fire station
            </p>
            <p className="mt-2 text-sm">
              {area.nearestStation.name} — {formatDistanceFromKm(area.nearestStation.km, system, 0)}
            </p>
          </div>
          <div className="rounded-md border border-border bg-surface-raised/60 p-3 text-sm">
            <p className="label-eyebrow">Outdoor burning</p>
            <p className="mt-1">{area.burnAdvice}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Emergency? <strong className="text-foreground">Call 911.</strong> WildGuard is a school
            project and doesn't replace official alerts.
          </p>
        </div>

        <ReportForm place={place} reporter={user?.name ?? "Citizen"} />
      </section>

      <Checklist userId={user?.id ?? "guest"} />
    </main>
  );
}

function Checklist({ userId }: { userId: string }) {
  const key = `wildguard.checklist.${userId}`;
  const [done, setDone] = useState<boolean[]>(() => CHECKLIST.map(() => false));

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(key) ?? "[]") as boolean[];
      if (Array.isArray(saved)) setDone(CHECKLIST.map((_, i) => Boolean(saved[i])));
    } catch {
      /* ignore */
    }
  }, [key]);

  function toggle(i: number) {
    const next = done.map((v, j) => (j === i ? !v : v));
    setDone(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  const count = done.filter(Boolean).length;
  return (
    <section className="mt-6 panel p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl">
          <CheckCircle2 className="size-4 text-risk-low" aria-hidden />
          My readiness checklist
        </h2>
        <span className="font-mono text-sm text-muted-foreground">
          {count} / {CHECKLIST.length} done
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-risk-low transition-all"
          style={{ width: `${(count / CHECKLIST.length) * 100}%` }}
        />
      </div>
      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {CHECKLIST.map((item, i) => (
          <li key={item}>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface-raised/40 p-3 text-sm hover:bg-surface-raised">
              <input
                type="checkbox"
                checked={done[i]}
                onChange={() => toggle(i)}
                className="mt-0.5 size-4 accent-[var(--color-risk-low)]"
              />
              <span className={done[i] ? "text-muted-foreground line-through" : ""}>{item}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReportForm({
  place,
  reporter,
}: {
  place: { name: string; lat: number; lng: number };
  reporter: string;
}) {
  const send = useServerFn(submitReport);
  const list = useServerFn(getReports);
  const [kind, setKind] = useState<"smoke" | "flames" | "other">("smoke");
  const [note, setNote] = useState("");
  const [where, setWhere] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mine, setMine] = useState<CitizenReport[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const all = await list();
        if (!cancelled) setMine(all.filter((r) => r.reporter === reporter).slice(0, 3));
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
  }, [list, reporter]);

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (pos) =>
        setWhere({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
          label: "my current location",
        }),
      () => setMessage("Couldn't get your location — the report will use your home town."),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const at = where ?? { lat: place.lat, lng: place.lng, label: place.name };
      await send({ data: { reporter, place: at.label, lat: at.lat, lng: at.lng, kind, note } });
      setNote("");
      setMessage("Sent to WildGuard crews. If it's an emergency, call 911 now.");
      const all = await list();
      setMine(all.filter((r) => r.reporter === reporter).slice(0, 3));
    } catch {
      setMessage("Couldn't send the report. Call 911 if there is a fire.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel space-y-3 p-5">
      <p className="label-eyebrow flex items-center gap-2 text-risk-high">
        <Megaphone className="size-3.5" aria-hidden /> Report smoke or fire
      </p>
      <p className="rounded-md border border-risk-extreme/50 bg-risk-extreme/10 p-2 text-xs">
        <Flame className="mr-1 inline size-3 text-risk-extreme" aria-hidden />
        Danger right now? <strong>Call 911 first.</strong> Then tell WildGuard crews here.
      </p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="What do you see?">
        {(["smoke", "flames", "other"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-md border px-2 py-1.5 text-sm capitalize ${
              kind === k ? "border-primary bg-primary/15" : "border-border text-muted-foreground"
            }`}
          >
            {k}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-xs text-muted-foreground">What do you see? (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
          rows={2}
          placeholder="Grey smoke over the ridge east of the trailhead"
          className="mt-1 w-full rounded-md border border-input bg-surface-raised p-2 text-sm"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        Location: {where?.label ?? `${place.name} (home)`}
        <Button type="button" variant="ghost" size="sm" onClick={locate}>
          <LocateFixed className="size-3.5" /> Use my location
        </Button>
      </div>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Sending…" : "Send report to crews"}
      </Button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
      {mine.length > 0 && (
        <ul className="space-y-1 border-t border-border pt-2 text-xs">
          {mine.map((r) => (
            <li key={r.id} className="flex justify-between gap-2">
              <span className="capitalize">
                {r.kind} · {r.place}
              </span>
              <span className={r.acknowledged ? "text-risk-low" : "text-muted-foreground"}>
                {r.acknowledged ? "Seen by crews ✓" : "Sent"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </form>
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
