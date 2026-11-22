import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { Cpu, PlugZap, Send, Trash2 } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { RiskBadge } from "@/components/RiskBadge";
import { UnitToggle } from "@/components/UnitToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { removeDevice, sendTestReading } from "@/lib/devices.functions";
import { useFieldData } from "@/lib/field-data";
import { assessRisk } from "@/lib/sensors";
import { formatTemp, useUnits } from "@/lib/units";

export const Route = createFileRoute("/devices")({
  head: () => ({
    meta: [
      { title: "Devices — WildGuard" },
      {
        name: "description",
        content: "Connect and manage the team's Raspberry Pi wildfire sensor nodes.",
      },
    ],
  }),
  component: DevicesPage,
});

// Default test-bench location: Bellevue, WA (the team's home base).
const BENCH = { lat: 47.6101, lng: -122.2015 };

function DevicesPage() {
  const { liveSensors, demoMesh, setDemoMesh, liveError, refreshLive } = useFieldData();
  const { system } = useUnits();
  const sendTest = useServerFn(sendTestReading);
  const remove = useServerFn(removeDevice);
  const [origin, setOrigin] = useState("http://<laptop-ip>:8080");
  const [form, setForm] = useState({
    deviceId: "FW-TEST",
    name: "Test bench",
    temperatureC: 38,
    humidityPct: 14,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // A Pi can't reach "localhost" — show a placeholder for the laptop's Wi-Fi IP instead.
    const { hostname, port, protocol, origin: here } = window.location;
    const local = hostname === "localhost" || hostname === "127.0.0.1";
    setOrigin(local ? `${protocol}//<laptop-ip>:${port || "8080"}` : here);
  }, []);

  async function submitTest(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await sendTest({ data: { ...form, ...BENCH } });
      await refreshLive();
      setMessage(`Reading sent as ${form.deviceId}. It now shows on the console and alerts pages.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send the test reading.");
    } finally {
      setBusy(false);
    }
  }

  async function removeOne(deviceId: string) {
    await remove({ data: { deviceId } });
    await refreshLive();
  }

  const endpoint = `${origin}/api/devices/<device-id>/telemetry`;

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
            Every Raspberry Pi that reports in shows up here, on the console map, and in the alert
            system — no setup beyond pointing it at this app.
          </p>
          <AppNav />
        </div>
        <UnitToggle />
      </header>

      <section className="mt-8 panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="text-xl">Live Raspberry Pi nodes</h2>
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
        {liveSensors.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            No Raspberry Pi has reported yet. Follow the steps below, or send a test reading.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase">
                <tr className="border-b border-border">
                  <th className="px-5 py-2 font-normal">Device</th>
                  <th className="px-3 py-2 font-normal">Status</th>
                  <th className="px-3 py-2 font-normal">Temp</th>
                  <th className="px-3 py-2 font-normal">Humidity</th>
                  <th className="px-3 py-2 font-normal">Air hum.</th>
                  <th className="px-3 py-2 font-normal">Battery</th>
                  <th className="px-3 py-2 font-normal">Last seen</th>
                  <th className="px-3 py-2 font-normal">Risk</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {liveSensors.map((s) => {
                  const risk = assessRisk(s);
                  return (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3">
                        <p>{s.id}</p>
                        <p className="font-sans text-xs text-muted-foreground">
                          {s.name} · {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <span className={s.online ? "text-risk-low" : "text-muted-foreground"}>
                          {s.online ? "online" : "offline"}
                        </span>
                      </td>
                      <td className="px-3 py-3">{formatTemp(s.temperatureF, system)}</td>
                      <td className="px-3 py-3">{s.humidityPct}%</td>
                      <td className="px-3 py-3">
                        {s.airHumidityPct !== undefined ? `${s.airHumidityPct}%` : "—"}
                      </td>
                      <td className="px-3 py-3">{s.batteryPct}%</td>
                      <td className="px-3 py-3">{s.lastSeenSecondsAgo}s ago</td>
                      <td className="px-3 py-3">
                        <RiskBadge level={risk.level} label={String(risk.score)} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeOne(s.id)}
                          aria-label={`Remove ${s.id}`}
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
        <form onSubmit={submitTest} className="panel space-y-4 p-5">
          <h2 className="flex items-center gap-2 text-xl">
            <Send className="size-4 text-accent" aria-hidden />
            Send a test reading
          </h2>
          <p className="text-xs text-muted-foreground">
            No hardware handy? This sends the same packet a Pi would. Try 38 °C and 14 % humidity to
            watch alerts fire.
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
            <Field label={`Temperature ${form.temperatureC} °C`}>
              <input
                type="range"
                min={0}
                max={55}
                value={form.temperatureC}
                onChange={(e) => setForm({ ...form, temperatureC: Number(e.target.value) })}
                className="w-full accent-[var(--color-primary)]"
              />
            </Field>
            <Field label={`Humidity ${form.humidityPct} %`}>
              <input
                type="range"
                min={2}
                max={90}
                value={form.humidityPct}
                onChange={(e) => setForm({ ...form, humidityPct: Number(e.target.value) })}
                className="w-full accent-[var(--color-primary)]"
              />
            </Field>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send reading"}
          </Button>
          {message && <p className="text-xs text-muted-foreground">{message}</p>}
        </form>

        <div className="panel space-y-3 p-5 text-sm">
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
              Copy <code className="text-foreground">hardware/raspberry-pi/</code> to the Pi and set
              the laptop address:
              <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-surface-raised p-2 text-xs text-foreground">
                FIREWATCH_URL={origin} python3 raspberry_pi_sender.py
              </pre>
            </li>
            <li>
              Or test from any terminal:
              <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-surface-raised p-2 text-xs text-foreground">
                {`curl -X POST ${origin}/api/devices/FW-01/telemetry \\
  -H 'Content-Type: application/json' \\
  -d '{"temperature":31,"humidity":18,"lat":47.61,"lng":-122.20}'`}
              </pre>
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Endpoint: <code>{endpoint}</code>. On shared Wi-Fi, set the same{" "}
            <code>FIREWATCH_INGEST_TOKEN</code> on the laptop and the Pi.
          </p>
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="label-eyebrow">{label}</Label>
      {children}
    </div>
  );
}
