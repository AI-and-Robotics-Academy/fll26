import { createServerFn } from "@tanstack/react-start";
import { callOpenAI, parseJson } from "@/lib/openai.server";
import { assessRisk, compassPoint, evaluateAlerts, type SensorReading } from "@/lib/sensors";

// FireWatch AI.
// - Chat helper: ported from Luke's Flask /api/chat.
// - Situation briefing: Viren's Wildfire Watch crew briefing.
// Both use OpenAI when OPENAI_API_KEY is set and fall back to rule-based
// answers from the live readings otherwise, so the demo never shows a dead button.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface SensorBrief {
  id: string;
  name: string;
  zone: string;
  temperatureF: number;
  humidityPct: number | null;
  soilMoisturePct: number | null;
  windMph: number | null;
  windDir: string | null;
  trendFPerHr: number;
  risk: number;
  riskLabel: string;
  drivers: string;
  online: boolean;
  live: boolean;
}

export interface FieldContext {
  sensors: SensorBrief[];
  openAlerts: number;
  availableResources: string[];
}

export interface ChatInput extends FieldContext {
  message: string;
  history: ChatTurn[];
}

export interface ChatReply {
  reply: string;
  mode: "ai" | "offline";
  notice?: string;
}

export interface SituationBriefing {
  headline: string;
  level: "Low" | "Moderate" | "High" | "Extreme";
  drivers: string[];
  watchAreas: string[];
  actions: string[];
}

export interface BriefingReply {
  briefing: SituationBriefing;
  mode: "ai" | "offline";
  notice?: string;
  generatedAt: string;
}

/** Client helper: compact, AI-friendly summary of one sensor. */
export function briefSensor(s: SensorReading): SensorBrief {
  const risk = assessRisk(s);
  return {
    id: s.id,
    name: s.name,
    zone: s.zone,
    temperatureF: s.temperatureF,
    humidityPct: s.humidityPct ?? null,
    soilMoisturePct: s.soilMoisturePct ?? null,
    windMph: s.windMph ?? null,
    windDir: s.windDirDeg !== undefined ? compassPoint(s.windDirDeg) : null,
    trendFPerHr: s.tempTrendFPerHr,
    risk: risk.score,
    riskLabel: risk.label,
    drivers: [...risk.drivers]
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 2)
      .map((d) => d.label.toLowerCase())
      .join(", "),
    online: s.online,
    live: s.source === "live",
  };
}

/** Client helper: everything the AI needs to know about the field right now. */
export function buildFieldContext(
  sensors: SensorReading[],
  resources: { id: string; type: string; status: string }[],
): FieldContext {
  return {
    sensors: sensors.map(briefSensor),
    openAlerts: evaluateAlerts(sensors).length,
    availableResources: resources
      .filter((r) => r.status === "Available")
      .map((r) => `${r.type.replace(/_/g, " ")} ${r.id}`),
  };
}

const MAX_TEXT = 1500;
const clean = (value: unknown, max = MAX_TEXT) => String(value ?? "").slice(0, max);
const numOrNull = (v: unknown) =>
  v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);

function cleanContext(input: Partial<FieldContext> | undefined): FieldContext {
  const sensors = (Array.isArray(input?.sensors) ? input.sensors : []).slice(0, 40).map((s) => ({
    id: clean(s.id, 32),
    name: clean(s.name, 80),
    zone: clean(s.zone, 80),
    temperatureF: Number(s.temperatureF) || 0,
    humidityPct: numOrNull(s.humidityPct),
    soilMoisturePct: numOrNull(s.soilMoisturePct),
    windMph: numOrNull(s.windMph),
    windDir: s.windDir ? clean(s.windDir, 4) : null,
    trendFPerHr: Number(s.trendFPerHr) || 0,
    risk: Number(s.risk) || 0,
    riskLabel: clean(s.riskLabel, 16),
    drivers: clean(s.drivers, 60),
    online: Boolean(s.online),
    live: Boolean(s.live),
  }));
  const availableResources = (
    Array.isArray(input?.availableResources) ? input.availableResources : []
  )
    .slice(0, 20)
    .map((r) => clean(r, 80));
  return { sensors, openAlerts: Number(input?.openAlerts) || 0, availableResources };
}

function describeSensor(s: SensorBrief): string {
  if (!s.online) return `${s.id} ${s.name} (${s.zone}): offline`;
  const parts = [`${s.temperatureF}°F`];
  if (s.humidityPct !== null) parts.push(`humidity ${s.humidityPct}%`);
  if (s.soilMoisturePct !== null) parts.push(`soil moisture ${s.soilMoisturePct}%`);
  if (s.windMph !== null)
    parts.push(`wind ${s.windMph} mph${s.windDir ? ` from ${s.windDir}` : ""}`);
  parts.push(
    `rising ${s.trendFPerHr}°F/h`,
    `risk ${s.risk} ${s.riskLabel} (driven by ${s.drivers})`,
  );
  return `${s.id} ${s.name} (${s.zone})${s.live ? " [LIVE Pi]" : ""}: ${parts.join(", ")}`;
}

function contextText(ctx: FieldContext): string {
  return (
    `Open alerts: ${ctx.openAlerts}. Available resources: ${ctx.availableResources.join(", ") || "none listed"}. ` +
    `Live readings: ${ctx.sensors.map(describeSensor).join("; ") || "no sensors reporting"}`
  );
}

const SAFETY =
  "Never claim a sensor reading proves a fire or guarantees safety. For an immediate fire or danger, tell people to call 911.";

// ---------------------------------------------------------------------------
// Chat (Luke)
// ---------------------------------------------------------------------------

export const askFireWatchAI = createServerFn({ method: "POST" })
  .inputValidator((input: ChatInput): ChatInput => {
    const message = clean(input?.message).trim();
    if (!message) throw new Error("Ask one question with up to 1,500 characters.");
    const history = (Array.isArray(input?.history) ? input.history : [])
      .slice(-8)
      .filter((t) => t && (t.role === "user" || t.role === "assistant"))
      .map((t) => ({ role: t.role, content: clean(t.content) }));
    return { message, history, ...cleanContext(input) };
  })
  .handler(async ({ data }): Promise<ChatReply> => {
    const result = await callOpenAI({
      instructions:
        "You are FireWatch AI, a friendly wildfire-prevention helper inside the WildGuard dashboard " +
        "built by a FIRST LEGO League team. Use the live readings below when relevant. Explain in " +
        `short, clear language a fifth grader can follow. ${SAFETY} ${contextText(data)}`,
      input: [...data.history, { role: "user", content: data.message }],
    });
    if (result.ok) return { reply: result.text, mode: "ai" };
    return { reply: offlineAnswer(data), mode: "offline", notice: result.notice };
  });

/** Rule-based answer from the current readings. */
function offlineAnswer(data: ChatInput): string {
  const q = data.message.toLowerCase();
  const online = data.sensors.filter((s) => s.online);
  const offline = data.sensors.filter((s) => !s.online);
  if (/\b(fire|smoke|flames?|burning)\b/.test(q) && /\b(see|saw|now|here|near)\b/.test(q)) {
    return "If you see fire or smoke right now, move to safety and call 911. Sensors help warn early, but a person reporting a fire is always faster.";
  }
  if (online.length === 0) {
    return "No sensors are reporting right now, so I can't judge fire risk. Check the Devices page to connect a Raspberry Pi.";
  }
  const worst = [...online].sort((a, b) => b.risk - a.risk)[0]!;
  const hottest = [...online].sort((a, b) => b.temperatureF - a.temperatureF)[0]!;
  const humid = online.filter((s) => s.humidityPct !== null);
  const driest = [...humid].sort((a, b) => a.humidityPct! - b.humidityPct!)[0];
  const soil = online.filter((s) => s.soilMoisturePct !== null);
  const driestSoil = [...soil].sort((a, b) => a.soilMoisturePct! - b.soilMoisturePct!)[0];
  const windy = online.filter((s) => s.windMph !== null);
  const windiest = [...windy].sort((a, b) => b.windMph! - a.windMph!)[0];
  const live = online.filter((s) => s.live);

  if (/\b(live|pi|raspberry|our sensor|my sensor)\b/.test(q)) {
    if (!live.length)
      return "No live Raspberry Pi is reporting yet. Open the Devices page to connect one or send a test reading.";
    return live.map((s) => `${describeSensor(s)}.`).join(" ");
  }
  if (/\b(soil|ground)\b/.test(q) && driestSoil) {
    return `${driestSoil.name} has the driest soil at ${driestSoil.soilMoisturePct}%. Dry soil means dry roots and dead fuel that burns easily.`;
  }
  if (/\b(wind|gust|blow)\b/.test(q) && windiest) {
    return `${windiest.name} is the windiest at ${windiest.windMph} mph${windiest.windDir ? ` from the ${windiest.windDir}` : ""}. Wind pushes fire faster and carries embers ahead of it.`;
  }
  if (/\b(humid|dry|moisture)\b/.test(q) && (driest || driestSoil)) {
    return driest
      ? `${driest.name} is the driest spot at ${driest.humidityPct}% humidity. Below 20% means grass and brush can catch fire easily.`
      : `${driestSoil!.name} has the driest soil at ${driestSoil!.soilMoisturePct}%.`;
  }
  if (/\b(hot|temp|temperature|heat)\b/.test(q)) {
    return `${hottest.name} is the hottest at ${hottest.temperatureF}°F. Heat dries out plants, which raises fire risk.`;
  }
  if (/\b(resource|truck|tanker|send|dispatch)\b/.test(q)) {
    return data.availableResources.length
      ? `Ready to deploy: ${data.availableResources.slice(0, 4).join(", ")}. Check the Resources page for locations.`
      : "No resources are marked available right now. Check the Resources page.";
  }
  const parts = [
    `The highest risk is at ${worst.name} with a score of ${worst.risk} (${worst.riskLabel}).`,
    `${data.openAlerts} alert${data.openAlerts === 1 ? " is" : "s are"} open.`,
  ];
  if (offline.length)
    parts.push(`${offline.length} sensor${offline.length === 1 ? " is" : "s are"} offline.`);
  parts.push("Ask me about temperature, humidity, soil, wind, live Pi sensors, or resources.");
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Situation briefing (Viren)
// ---------------------------------------------------------------------------

const BRIEFING_SCHEMA = {
  name: "situation_briefing",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["headline", "level", "drivers", "watchAreas", "actions"],
    properties: {
      headline: { type: "string" },
      level: { type: "string", enum: ["Low", "Moderate", "High", "Extreme"] },
      drivers: { type: "array", items: { type: "string" } },
      watchAreas: { type: "array", items: { type: "string" } },
      actions: { type: "array", items: { type: "string" } },
    },
  },
};

export const getSituationBriefing = createServerFn({ method: "POST" })
  .inputValidator((input: FieldContext) => cleanContext(input))
  .handler(async ({ data }): Promise<BriefingReply> => {
    const generatedAt = new Date().toISOString();
    const result = await callOpenAI({
      instructions:
        "You are a wildfire incident meteorologist writing a short crew briefing for firefighters " +
        "from a FIRST LEGO League team's sensor network. Be specific: name sensors and numbers. " +
        "headline: one sentence. drivers: 2-4 conditions driving the risk. watchAreas: 2-4 named " +
        "sensor zones to watch and why. actions: 3-5 concrete recommended actions for crews, " +
        `including which available resources to stage where. Keep each item under 25 words. ${SAFETY}`,
      input: contextText(data),
      schema: BRIEFING_SCHEMA,
    });
    if (result.ok) {
      const briefing = parseJson<SituationBriefing>(result.text);
      if (briefing) return { briefing, mode: "ai", generatedAt };
    }
    return {
      briefing: offlineBriefing(data),
      mode: "offline",
      generatedAt,
      ...(result.ok ? {} : { notice: result.notice }),
    };
  });

/** Rule-based crew briefing from the readings. */
function offlineBriefing(ctx: FieldContext): SituationBriefing {
  const online = ctx.sensors.filter((s) => s.online);
  if (!online.length) {
    return {
      headline: "No sensors are reporting — risk cannot be assessed.",
      level: "Low",
      drivers: ["No live telemetry"],
      watchAreas: [],
      actions: [
        "Check power and Wi‑Fi on field units",
        "Open the Devices page to reconnect sensors",
      ],
    };
  }
  const ranked = [...online].sort((a, b) => b.risk - a.risk);
  const worst = ranked[0]!;
  const level = (
    worst.risk >= 75 ? "Extreme" : worst.risk >= 50 ? "High" : worst.risk >= 25 ? "Moderate" : "Low"
  ) as SituationBriefing["level"];
  const hot = online.filter((s) => s.temperatureF >= 95);
  const dryAir = online.filter((s) => s.humidityPct !== null && s.humidityPct <= 20);
  const drySoil = online.filter((s) => s.soilMoisturePct !== null && s.soilMoisturePct <= 15);
  const windy = online.filter((s) => s.windMph !== null && s.windMph >= 15);
  const rising = online.filter((s) => s.trendFPerHr >= 6);

  const drivers: string[] = [];
  if (hot.length)
    drivers.push(
      `Heat: ${hot.length} node${hot.length > 1 ? "s" : ""} at or above 95°F (peak ${Math.max(...hot.map((s) => s.temperatureF))}°F).`,
    );
  if (dryAir.length)
    drivers.push(
      `Dry air: humidity at or below 20% at ${dryAir
        .map((s) => s.name)
        .slice(0, 3)
        .join(", ")}.`,
    );
  if (drySoil.length)
    drivers.push(
      `Dry fuels: soil moisture at or below 15% at ${drySoil
        .map((s) => s.name)
        .slice(0, 3)
        .join(", ")}.`,
    );
  if (windy.length) {
    const top = [...windy].sort((a, b) => b.windMph! - a.windMph!)[0]!;
    drivers.push(
      `Wind: ${windy.length} node${windy.length > 1 ? "s" : ""} at 15 mph or more; strongest ${top.windMph} mph${top.windDir ? ` from ${top.windDir}` : ""} at ${top.name}.`,
    );
  }
  if (rising.length)
    drivers.push(
      `Fast warming at ${rising
        .map((s) => s.name)
        .slice(0, 3)
        .join(", ")} — possible ignition signal.`,
    );
  if (!drivers.length) drivers.push("Conditions are mild across the network.");

  const watchAreas = ranked
    .slice(0, 3)
    .filter((s) => s.risk >= 25)
    .map((s) => `${s.name} (${s.id}) — risk ${s.risk}, driven by ${s.drivers}.`);

  const actions: string[] = [];
  if (level === "Extreme" || level === "High") {
    actions.push(`Pre-position engines and a water tender near ${worst.name}.`);
    if (ctx.availableResources.length)
      actions.push(`Stage ready assets: ${ctx.availableResources.slice(0, 3).join(", ")}.`);
    actions.push("Restrict outdoor burning and equipment use in watch areas.");
    if (windy.length)
      actions.push(
        "Plan fire lines on the downwind side; check Area Intelligence for spread direction.",
      );
  } else {
    actions.push("Maintain normal patrols and keep sensors reporting.");
  }
  if (ctx.openAlerts)
    actions.push(
      `Review and acknowledge ${ctx.openAlerts} open alert${ctx.openAlerts > 1 ? "s" : ""}.`,
    );
  const offline = ctx.sensors.length - online.length;
  if (offline)
    actions.push(
      `Restore ${offline} offline sensor${offline > 1 ? "s" : ""} to close coverage gaps.`,
    );

  return {
    headline: `${level} fire risk — highest at ${worst.name} (score ${worst.risk}).`,
    level,
    drivers,
    watchAreas,
    actions,
  };
}
