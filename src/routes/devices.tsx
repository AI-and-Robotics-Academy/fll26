import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Check,
  ClipboardCopy,
  Cpu,
  MapPinPlus,
  PlugZap,
  Send,
  Terminal,
  Trash2,
} from "lucide-react";
import bridgeScript from "../../hardware/raspberry-pi/wildguard_bridge.py?raw";
import { AppNav } from "@/components/AppNav";
import { RiskBadge } from "@/components/RiskBadge";
import { UnitToggle } from "@/components/UnitToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  getRegistry,
  registerFieldUnit,
  removeDevice,
  sendTestReading,
} from "@/lib/devices.functions";
import { useFieldData } from "@/lib/field-data";
import { assessRisk, compassPoint } from "@/lib/sensors";
import type { RegistryEntry } from "@/lib/telemetry.server";
import { formatPct, formatTemp, formatWind, useUnits } from "@/lib/units";

export const Route = createFileRoute("/devices")({
  head: () => ({
    meta: [
      { title: "Devices — WildGuard" },
      {
        name: "description",
        content: "Register, connect and manage the team's Raspberry Pi wildfire sensor units.",
      },
    ],
  }),
  component: DevicesPage,
});

// Default test-bench location: Bellevue, WA (the team's home base).
const BENCH = { lat: 47.6101, lng: -122.2015 };
const STATUS_STYLE: Record<RegistryEntry["status"], string> = {
  online: "text-risk-low",
  offline: "text-muted-foreground",
  waiting: "text-risk-moderate",
};

function DevicesPage() {
  const { liveSensors, demoMesh, setDemoMesh, liveError, refreshLive } = useFieldData();
  const { system } = useUnits();
  const sendTest = useServerFn(sendTestReading);
  const register = useServerFn(registerFieldUnit);
  const fetchRegistry = useServerFn(getRegistry);
  const remove = useServerFn(removeDevice);
  const [origin, setOrigin] = useState("http://<laptop-ip>:8080");
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);

  const reload = useCallback(async () => {
    try {
      setRegistry(await fetchRegistry());
    } catch {
      /* liveError banner covers connectivity */
    }
    await refreshLive();
  }, [fetchRegistry, refreshLive]);

  useEffect(() => {
    // A Pi can't reach "localhost" — show a placeholder for the laptop's Wi-Fi IP instead.
    const { hostname, port, protocol, origin: here } = window.location;
    const local = hostname === "localhost" || hostname === "127.0.0.1";
    setOrigin(local ? `${protocol}//<laptop-ip>:${port || "8080"}` : here);
    void reload();
    const id = window.setInterval(reload, 5000);
    return () => window.clearInterval(id);
  }, [reload]);

  async function removeOne(deviceId: string) {
    await remove({ data: { deviceId } });
    await reload();
  }

  const live = new Map(liveSensors.map((s) => [s.id, s]));

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-eyebrow flex items-center gap-2">
            <span className="live-dot" /> Raspberry Pi network
          </p>
          <h1 className="mt-2 flex items-center gap-3 text-4xl font-semibold md:text-5xl">
            <Cpu className="size-8 text-primary" aria-hidden />
            Devices
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Register field units, connect Raspberry Pis, and watch them report. A unit is online if
            it reported in the last 15 minutes.
          </p>
          <AppNav />
        </div>
        <UnitToggle />
      </header>

      <section className="mt-8 panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="text-xl">Field units</h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={demoMesh}
              onCheckedChange={setDemoMesh}
              aria-label="Show simulated mesh"
            />
            Show simulated statewide mesh
          </label>
        </div>
        {liveError && (
          <p className="border-b border-border px-5 py-2 text-xs text-risk-high">
            Can't reach the device API — is the server running?
          </p>
        )}
        {registry.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            No units yet. Register one below, connect a Pi, or send a test reading.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase">
                <tr className="border-b border-border">
                  <th className="px-5 py-2 font-normal">Unit</th>
                  <th className="px-3 py-2 font-normal">Status</th>
                  <th className="px-3 py-2 font-normal">Temp</th>
                  <th className="px-3 py-2 font-normal">Humidity</th>
                  <th className="px-3 py-2 font-normal">Soil</th>
                  <th className="px-3 py-2 font-normal">Wind</th>
                  <th className="px-3 py-2 font-normal">Battery</th>
                  <th className="px-3 py-2 font-normal">Last seen</th>
                  <th className="px-3 py-2 font-normal">Risk</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {registry.map((d) => {
                  const s = live.get(d.id);
                  const risk = s ? assessRisk(s) : null;
                  return (
                    <tr key={d.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3">
                        <p>{d.id}</p>
                        <p className="font-sans text-xs text-muted-foreground">
                          {d.name} · {d.location}
                          {d.lat !== null && d.lng !== null
                            ? ` · ${d.lat.toFixed(4)}, ${d.lng.toFixed(4)}`
                            : " · no GPS yet"}
                        </p>
                      </td>
                      <td className={`px-3 py-3 ${STATUS_STYLE[d.status]}`}>
                        {d.status === "waiting" ? "waiting for data" : d.status}
                      </td>
                      <td className="px-3 py-3">{s ? formatTemp(s.temperatureF, system) : "—"}</td>
                      <td className="px-3 py-3">{formatPct(s?.humidityPct)}</td>
                      <td className="px-3 py-3">{formatPct(s?.soilMoisturePct)}</td>
                      <td className="px-3 py-3">
                        {s?.windMph !== undefined
                          ? `${formatWind(s.windMph, system)}${s.windDirDeg !== undefined ? ` ${compassPoint(s.windDirDeg)}` : ""}`
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {s && s.batteryPct > 0 ? `${s.batteryPct}%` : "—"}
                      </td>
                      <td className="px-3 py-3">{s ? agoLabel(s.lastSeenSecondsAgo) : "never"}</td>
                      <td className="px-3 py-3">
                        {risk ? <RiskBadge level={risk.level} label={String(risk.score)} /> : "—"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeOne(d.id)}
                          aria-label={`Remove ${d.id}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <RegisterForm
          onSubmit={async (data) => {
            await register({ data });
            await reload();
          }}
        />
        <TestReadingForm
          onSubmit={async (data) => {
            await sendTest({ data: { ...data, ...BENCH } });
            await reload();
          }}
        />
      </section>

      <section className="mt-6 panel space-y-3 p-5 text-sm">
        <h2 className="flex items-center gap-2 text-xl">
          <PlugZap className="size-4 text-accent" aria-hidden />
          Connect a Raspberry Pi
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>
            Start this app so the Pi can reach it:{" "}
            <code className="text-foreground">npm run dev -- --host 0.0.0.0</code>
          </li>
          <li>
            Copy <code className="text-foreground">hardware/raspberry-pi/</code> to the Pi. Then run
            Luke's humidity sender or Viren's temperature + soil bridge:
            <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-surface-raised p-2 text-xs text-foreground">
              {`FIREWATCH_URL=${origin} python3 raspberry_pi_sender.py
WILDGUARD_URL=${origin} WILDGUARD_DEVICE_ID=WW-01 STATUS_KEY=secret python3 wildguard_bridge.py`}
            </pre>
          </li>
          <li>
            Or test from any terminal:
            <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-surface-raised p-2 text-xs text-foreground">
              {`curl -X POST ${origin}/api/devices/FW-01/telemetry \\
  -H 'Content-Type: application/json' \\
  -d '{"temperature":31,"humidity":18,"soil_moisture":12,"wind_mph":14,"wind_dir":"SW","lat":47.61,"lng":-122.20}'`}
            </pre>
          </li>
        </ol>
        <p className="text-xs text-muted-foreground">
          Endpoint: <code>{`${origin}/api/devices/<device-id>/telemetry`}</code>. On shared Wi-Fi,
          set the same <code>FIREWATCH_INGEST_TOKEN</code> on the laptop and the Pi.
        </p>
        <BridgeScript />
      </section>
    </main>
  );
}

function agoLabel(seconds: number) {
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

function RegisterForm({
  onSubmit,
}: {
  onSubmit: (data: {
    deviceId: string;
    name: string;
    location: string;
    lat: number | null;
    lng: number | null;
    notes: string;
  }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    deviceId: "WW-01",
    name: "",
    location: "",
    lat: "",
    lng: "",
    notes: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const hasGps = form.lat.trim() !== "" && form.lng.trim() !== "";
      await onSubmit({
        deviceId: form.deviceId.trim(),
        name: form.name,
        location: form.location,
        lat: hasGps ? Number(form.lat) : null,
        lng: hasGps ? Number(form.lng) : null,
        notes: form.notes,
      });
      setMessage(`${form.deviceId} registered. It will show "waiting for data" until it reports.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not register the unit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel space-y-4 p-5">
      <h2 className="flex items-center gap-2 text-xl">
        <MapPinPlus className="size-4 text-accent" aria-hidden />
        Register a field unit
      </h2>
      <p className="text-xs text-muted-foreground">
        Add a unit before it's deployed. If you enter GPS here, the Pi doesn't need to send it.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unit id">
          <Input
            value={form.deviceId}
            onChange={(e) => setForm({ ...form, deviceId: e.target.value })}
            pattern="[A-Za-z0-9_\-]{1,32}"
            required
          />
        </Field>
        <Field label="Name">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={80}
            placeholder="Cougar Mountain ridge"
            required
          />
        </Field>
        <Field label="Location">
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            maxLength={80}
            placeholder="Issaquah, WA"
            required
          />
        </Field>
        <Field label="Notes">
          <Input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            maxLength={200}
            placeholder="Mounted 2 m up on fence post"
          />
        </Field>
        <Field label="Latitude (optional)">
          <Input
            value={form.lat}
            onChange={(e) => setForm({ ...form, lat: e.target.value })}
            inputMode="decimal"
            placeholder="47.53"
          />
        </Field>
        <Field label="Longitude (optional)">
          <Input
            value={form.lng}
            onChange={(e) => setForm({ ...form, lng: e.target.value })}
            inputMode="decimal"
            placeholder="-122.09"
          />
        </Field>
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Registering…" : "Register unit"}
      </Button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </form>
  );
}

function TestReadingForm({
  onSubmit,
}: {
  onSubmit: (data: {
    deviceId: string;
    name: string;
    temperatureC: number;
    humidityPct: number;
    soilMoisturePct: number;
    windMph: number;
    windDirDeg: number;
  }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    deviceId: "FW-TEST",
    name: "Test bench",
    temperatureC: 38,
    humidityPct: 14,
    soilMoisturePct: 10,
    windMph: 18,
    windDirDeg: 225,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await onSubmit(form);
      setMessage(`Reading sent as ${form.deviceId}. It now shows on every page.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send the test reading.");
    } finally {
      setBusy(false);
    }
  }

  const slider = (
    key: "temperatureC" | "humidityPct" | "soilMoisturePct" | "windMph" | "windDirDeg",
    label: string,
    min: number,
    max: number,
    step = 1,
  ) => (
    <Field label={label}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
        className="w-full accent-[var(--color-primary)]"
      />
    </Field>
  );

  return (
    <form onSubmit={submit} className="panel space-y-4 p-5">
      <h2 className="flex items-center gap-2 text-xl">
        <Send className="size-4 text-accent" aria-hidden />
        Send a test reading
      </h2>
      <p className="text-xs text-muted-foreground">
        No hardware handy? This sends the same packet a Pi would. The defaults are hot, dry and
        windy — watch the alerts fire.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Device id">
          <Input
            value={form.deviceId}
            onChange={(e) => setForm({ ...form, deviceId: e.target.value })}
            pattern="[A-Za-z0-9_\-]{1,32}"
            required
          />
        </Field>
        <Field label="Name">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={80}
          />
        </Field>
        {slider("temperatureC", `Temperature ${form.temperatureC} °C`, 0, 55)}
        {slider("humidityPct", `Humidity ${form.humidityPct} %`, 2, 90)}
        {slider("soilMoisturePct", `Soil moisture ${form.soilMoisturePct} %`, 0, 80)}
        {slider("windMph", `Wind ${form.windMph} mph`, 0, 50)}
        {slider(
          "windDirDeg",
          `Wind from ${compassPoint(form.windDirDeg)} (${form.windDirDeg}°)`,
          0,
          337.5,
          22.5,
        )}
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send reading"}
      </Button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </form>
  );
}

/** Viren's copy-ready Pi bridge script. */
function BridgeScript() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(bridgeScript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <details className="rounded-lg border border-border bg-surface-raised/50">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-display tracking-wide">
        <Terminal className="size-4 text-accent" aria-hidden />
        Pi bridge script — DS18B20 temperature + soil moisture
        <span className="ml-auto text-xs text-muted-foreground">wildguard_bridge.py</span>
      </summary>
      <div className="border-t border-border p-3">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
          {copied ? "Copied" : "Copy script"}
        </Button>
        <pre className="mt-3 max-h-96 overflow-auto rounded-md border border-border bg-background p-3 text-xs">
          {bridgeScript}
        </pre>
      </div>
    </details>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="label-eyebrow block">{label}</span>
      {children}
    </label>
  );
}
