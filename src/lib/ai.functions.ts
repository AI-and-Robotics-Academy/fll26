import { createServerFn } from "@tanstack/react-start";

// FireWatch AI — ported from Luke's Flask /api/chat. Uses OpenAI when
// OPENAI_API_KEY is set on the server (FIREWATCH_AI_MODEL picks the model).
// Without a key, or if OpenAI can't be reached, it answers from the live
// readings with simple rules, so the demo never shows a dead button.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface SensorBrief {
  id: string;
  name: string;
  zone: string;
  temperatureF: number;
  humidityPct: number;
  trendFPerHr: number;
  risk: number;
  riskLabel: string;
  online: boolean;
  live: boolean;
}

export interface ChatInput {
  message: string;
  history: ChatTurn[];
  sensors: SensorBrief[];
  openAlerts: number;
  availableResources: string[];
}

export interface ChatReply {
  reply: string;
  mode: "ai" | "offline";
  notice?: string;
}

const MAX_TEXT = 1500;

const clean = (value: unknown, max = MAX_TEXT) => String(value ?? "").slice(0, max);

export const askFireWatchAI = createServerFn({ method: "POST" })
  .inputValidator((input: ChatInput): ChatInput => {
    const message = clean(input?.message).trim();
    if (!message) throw new Error("Ask one question with up to 1,500 characters.");
    const history = (Array.isArray(input?.history) ? input.history : [])
      .slice(-8)
      .filter((t) => t && (t.role === "user" || t.role === "assistant"))
      .map((t) => ({ role: t.role, content: clean(t.content) }));
    const sensors = (Array.isArray(input?.sensors) ? input.sensors : []).slice(0, 40).map((s) => ({
      id: clean(s.id, 32),
      name: clean(s.name, 80),
      zone: clean(s.zone, 80),
      temperatureF: Number(s.temperatureF) || 0,
      humidityPct: Number(s.humidityPct) || 0,
      trendFPerHr: Number(s.trendFPerHr) || 0,
      risk: Number(s.risk) || 0,
      riskLabel: clean(s.riskLabel, 16),
      online: Boolean(s.online),
      live: Boolean(s.live),
    }));
    const availableResources = (
      Array.isArray(input?.availableResources) ? input.availableResources : []
    )
      .slice(0, 20)
      .map((r) => clean(r, 80));
    return {
      message,
      history,
      sensors,
      openAlerts: Number(input?.openAlerts) || 0,
      availableResources,
    };
  })
  .handler(async ({ data }): Promise<ChatReply> => {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      return {
        reply: offlineAnswer(data),
        mode: "offline",
        notice: "Offline mode — add OPENAI_API_KEY on the server for full AI answers.",
      };
    }

    const sensorSummary = data.sensors
      .map(
        (s) =>
          `${s.id} ${s.name} (${s.zone})${s.live ? " [LIVE Pi]" : ""}: ${
            s.online
              ? `${s.temperatureF}°F, humidity ${s.humidityPct}%, rising ${s.trendFPerHr}°F/h, risk ${s.risk} ${s.riskLabel}`
              : "offline"
          }`,
      )
      .join("; ");
    const instructions =
      "You are FireWatch AI, a friendly wildfire-prevention helper inside the WildGuard dashboard " +
      "built by a FIRST LEGO League team. Use the live readings below when relevant. Explain in " +
      "short, clear language a fifth grader can follow. Never claim a sensor reading proves a fire " +
      "or guarantees safety. For an immediate fire or danger, tell the user to call 911. " +
      `Open alerts: ${data.openAlerts}. Available resources: ${data.availableResources.join(", ") || "none listed"}. ` +
      `Live readings: ${sensorSummary || "no sensors reporting"}`;

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env["FIREWATCH_AI_MODEL"] || "gpt-5-mini",
          instructions,
          input: [...data.history, { role: "user", content: data.message }],
          store: false,
        }),
      });
      if (!response.ok) {
        console.error(`FireWatch AI request failed [${response.status}]: ${await response.text()}`);
        return {
          reply: offlineAnswer(data),
          mode: "offline",
          notice: statusNotice(response.status),
        };
      }
      const json = (await response.json()) as {
        output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
      };
      const reply = (json.output ?? [])
        .flatMap((item) => item.content ?? [])
        .filter((part) => part.type === "output_text" && part.text)
        .map((part) => part.text)
        .join("\n")
        .trim();
      return reply ? { reply, mode: "ai" } : { reply: offlineAnswer(data), mode: "offline" };
    } catch (error) {
      console.error("FireWatch AI request failed", error);
      return {
        reply: offlineAnswer(data),
        mode: "offline",
        notice: "FireWatch cannot reach OpenAI right now. Check the internet connection.",
      };
    }
  });

/** Luke's kid-friendly error messages, keyed by OpenAI status code. */
function statusNotice(status: number): string {
  if (status === 401)
    return "OpenAI did not accept this API key. Check you copied the whole key, then restart.";
  if (status === 429)
    return "OpenAI needs billing credits or hit its usage limit. Ask an adult to check billing.";
  return `OpenAI could not run the FireWatch AI model (status ${status}).`;
}

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
  const byRisk = [...online].sort((a, b) => b.risk - a.risk);
  const worst = byRisk[0]!;
  const driest = [...online].sort((a, b) => a.humidityPct - b.humidityPct)[0]!;
  const hottest = [...online].sort((a, b) => b.temperatureF - a.temperatureF)[0]!;
  const live = online.filter((s) => s.live);

  if (/\b(live|pi|raspberry|our sensor|my sensor)\b/.test(q)) {
    if (!live.length)
      return "No live Raspberry Pi is reporting yet. Open the Devices page to connect one or send a test reading.";
    return live
      .map(
        (s) =>
          `${s.name} (${s.id}) reads ${s.temperatureF}°F and ${s.humidityPct}% humidity — risk ${s.risk}, ${s.riskLabel}.`,
      )
      .join(" ");
  }
  if (/\b(humid|dry|moisture)\b/.test(q)) {
    return `${driest.name} is the driest spot at ${driest.humidityPct}% humidity. Below 20% means grass and brush can catch fire easily.`;
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
  parts.push("Ask me about humidity, temperature, live Pi sensors, or resources.");
  return parts.join(" ");
}
