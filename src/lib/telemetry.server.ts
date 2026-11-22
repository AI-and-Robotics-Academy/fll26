// Live Raspberry Pi telemetry store (server only).
//
// Ported from Luke's FireWatch Flask API (feature/luke-pi-telemetry). The Pi
// contract is unchanged, so hardware/raspberry-pi/raspberry_pi_sender.py works
// as-is: POST JSON to /api/devices/<device-id>/telemetry with
//   { temperature (°C), humidity (%), air_humidity (%), lat, lng,
//     name?, location?, battery?, elevation_m? }
// and, when FIREWATCH_INGEST_TOKEN is set, the header X-FireWatch-Token.
//
// Readings live in server memory: perfect for a laptop running `npm run dev`
// at competition, but they reset on restart and are not shared between
// serverless instances.

import type { SensorReading } from "./sensors";

export const LIVE_OFFLINE_AFTER_SECONDS = 180;
const HISTORY_WINDOW_MS = 60 * 60 * 1000;
const MIN_TREND_SPAN_MS = 5 * 60 * 1000;

interface HistoryPoint {
  t: number;
  temperatureF: number;
}

export interface LiveDevice {
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  elevationM: number;
  temperatureF: number;
  humidityPct: number;
  airHumidityPct: number;
  batteryPct: number;
  firstSeen: number;
  lastSeen: number;
  packets: number;
  history: HistoryPoint[];
}

export interface LiveDeviceSummary extends SensorReading {
  location: string;
  firstSeen: string;
  lastSeen: string;
  packets: number;
}

type Store = Map<string, LiveDevice>;
const globalStore = globalThis as typeof globalThis & { __wildguardLive?: Store };
// Kept on globalThis so Vite hot reloads don't wipe connected devices.
const store: Store = (globalStore.__wildguardLive ??= new Map());

export function ingestToken(): string {
  return process.env["FIREWATCH_INGEST_TOKEN"] ?? "";
}

export class TelemetryError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const DEVICE_ID = /^[A-Za-z0-9_-]{1,32}$/;
const text = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;

/** Validates a Pi payload and updates the device. Throws TelemetryError on bad input. */
export function ingestTelemetry(deviceId: string, data: unknown): LiveDeviceSummary {
  if (!DEVICE_ID.test(deviceId)) {
    throw new TelemetryError("Device id must be 1-32 letters, numbers, - or _");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TelemetryError("Send a JSON telemetry object");
  }
  const body = data as Record<string, unknown>;
  const required = ["temperature", "humidity", "lat", "lng"] as const;
  const missing = required.filter((field) => body[field] === undefined);
  if (missing.length) throw new TelemetryError(`Missing fields: ${missing.join(", ")}`);

  const num = (field: string) => {
    const value = Number(body[field]);
    if (!Number.isFinite(value)) throw new TelemetryError("Telemetry values must be numbers");
    return value;
  };
  const temperatureC = num("temperature");
  const humidity = num("humidity");
  const lat = num("lat");
  const lng = num("lng");
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new TelemetryError("Invalid latitude or longitude");
  }
  if (temperatureC < -60 || temperatureC > 150) {
    throw new TelemetryError("Temperature must be in °C between -60 and 150");
  }
  if (humidity < 0 || humidity > 100) throw new TelemetryError("Humidity must be 0-100 %");
  const airHumidity = body["air_humidity"] === undefined ? humidity : num("air_humidity");
  const battery = body["battery"] === undefined ? null : num("battery");
  const elevation = body["elevation_m"] === undefined ? null : num("elevation_m");

  const now = Date.now();
  const temperatureF = Math.round(((temperatureC * 9) / 5 + 32) * 10) / 10;
  const existing = store.get(deviceId);
  const device: LiveDevice = existing ?? {
    id: deviceId,
    name: deviceId,
    location: "Raspberry Pi sensor",
    lat,
    lng,
    elevationM: 0,
    temperatureF,
    humidityPct: humidity,
    airHumidityPct: airHumidity,
    batteryPct: 0,
    firstSeen: now,
    lastSeen: now,
    packets: 0,
    history: [],
  };

  device.name = text(body["name"], device.name);
  device.location = text(body["location"], device.location);
  device.lat = lat;
  device.lng = lng;
  device.temperatureF = temperatureF;
  device.humidityPct = Math.round(humidity);
  device.airHumidityPct = Math.round(Math.min(100, Math.max(0, airHumidity)));
  if (battery !== null) device.batteryPct = Math.round(Math.min(100, Math.max(0, battery)));
  if (elevation !== null) device.elevationM = Math.round(elevation);
  device.lastSeen = now;
  device.packets += 1;
  device.history = [...device.history, { t: now, temperatureF }].filter(
    (point) => now - point.t <= HISTORY_WINDOW_MS,
  );

  store.set(deviceId, device);
  return summarize(device, now);
}

/** °F per hour over the last hour; 0 until five minutes of data exist. */
function trendFPerHr(device: LiveDevice, now: number): number {
  const recent = device.history.filter((point) => now - point.t <= HISTORY_WINDOW_MS);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last || last.t - first.t < MIN_TREND_SPAN_MS) return 0;
  const hours = (last.t - first.t) / 3_600_000;
  return Math.round(((last.temperatureF - first.temperatureF) / hours) * 10) / 10;
}

function summarize(device: LiveDevice, now = Date.now()): LiveDeviceSummary {
  const lastSeenSecondsAgo = Math.max(0, Math.round((now - device.lastSeen) / 1000));
  return {
    id: device.id,
    name: device.name,
    zone: `${device.location} · live Pi`,
    location: device.location,
    lat: device.lat,
    lng: device.lng,
    elevationM: device.elevationM,
    temperatureF: device.temperatureF,
    humidityPct: device.humidityPct,
    airHumidityPct: device.airHumidityPct,
    tempTrendFPerHr: trendFPerHr(device, now),
    batteryPct: device.batteryPct,
    online: lastSeenSecondsAgo <= LIVE_OFFLINE_AFTER_SECONDS,
    lastSeenSecondsAgo,
    source: "live",
    firstSeen: new Date(device.firstSeen).toISOString(),
    lastSeen: new Date(device.lastSeen).toISOString(),
    packets: device.packets,
  };
}

export function listLiveDevices(): LiveDeviceSummary[] {
  const now = Date.now();
  return [...store.values()].map((device) => summarize(device, now));
}

export function removeLiveDevice(deviceId: string): boolean {
  return store.delete(deviceId);
}
