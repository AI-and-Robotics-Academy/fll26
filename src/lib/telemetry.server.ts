// Live Raspberry Pi telemetry store (server only).
//
// Ported from Luke's FireWatch Flask API (feature/luke-pi-telemetry), extended
// with Viren's Wildfire Watch device registry, readings log and inputs.
// POST JSON to /api/devices/<device-id>/telemetry with:
//   temperature (°C)                         required
//   humidity (%) and/or soil_moisture (%)    at least one required
//   lat, lng                                 required unless the device was
//                                            registered with coordinates
//   optional: name, location, air_humidity, battery, elevation_m,
//             wind_mph | wind_kph, wind_dir (degrees or "SW")
// and, when FIREWATCH_INGEST_TOKEN is set, the header X-FireWatch-Token.
//
// Everything lives in server memory: right for a laptop running `npm run dev`
// at competition, but it resets on restart and is not shared between
// serverless instances.

import { parseWindDirection, type SensorReading } from "./sensors";

/** Viren's rule: a unit is online if it reported in the last 15 minutes. */
export const LIVE_OFFLINE_AFTER_SECONDS = 15 * 60;
const HISTORY_WINDOW_MS = 60 * 60 * 1000;
const MIN_TREND_SPAN_MS = 5 * 60 * 1000;
const READINGS_LOG_SIZE = 100;

interface HistoryPoint {
  t: number;
  temperatureF: number;
}

interface Device {
  id: string;
  name: string;
  location: string;
  notes: string;
  lat: number | null;
  lng: number | null;
  elevationM: number;
  temperatureF: number | null;
  humidityPct?: number;
  airHumidityPct?: number;
  soilMoisturePct?: number;
  windMph?: number;
  windDirDeg?: number;
  batteryPct: number;
  registeredAt: number;
  firstSeen: number | null;
  lastSeen: number | null;
  packets: number;
  history: HistoryPoint[];
}

/** A device that has reported at least once, shaped for the sensor feed. */
export interface LiveDeviceSummary extends SensorReading {
  location: string;
  firstSeen: string;
  lastSeen: string;
  packets: number;
}

/** Registry row: every registered or reporting device, even before its first packet. */
export interface RegistryEntry {
  id: string;
  name: string;
  location: string;
  notes: string;
  lat: number | null;
  lng: number | null;
  status: "online" | "offline" | "waiting";
  lastSeen: string | null;
  packets: number;
}

/** One row in the readings log. */
export interface LoggedReading {
  deviceId: string;
  deviceName: string;
  location: string;
  recordedAt: string;
  temperatureF: number;
  humidityPct?: number;
  soilMoisturePct?: number;
  windMph?: number;
  windDirDeg?: number;
  lat: number;
  lng: number;
}

interface Store {
  devices: Map<string, Device>;
  log: LoggedReading[];
}
const globalStore = globalThis as typeof globalThis & { __wildguardStore?: Store };
// Kept on globalThis so Vite hot reloads don't wipe connected devices.
const store: Store = (globalStore.__wildguardStore ??= { devices: new Map(), log: [] });

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
const text = (value: unknown, fallback: string, max = 80) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
const pct = (n: number) => Math.round(Math.min(100, Math.max(0, n)));

function checkId(deviceId: string) {
  if (!DEVICE_ID.test(deviceId)) {
    throw new TelemetryError("Device id must be 1-32 letters, numbers, - or _");
  }
}

function checkLatLng(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new TelemetryError("Invalid latitude or longitude");
  }
}

function blankDevice(id: string, now: number): Device {
  return {
    id,
    name: id,
    location: "Raspberry Pi sensor",
    notes: "",
    lat: null,
    lng: null,
    elevationM: 0,
    temperatureF: null,
    batteryPct: 0,
    registeredAt: now,
    firstSeen: null,
    lastSeen: null,
    packets: 0,
    history: [],
  };
}

/** Viren's Sensor Setup: add a field unit to the registry before it reports. */
export function registerDevice(input: {
  deviceId: string;
  name: string;
  location: string;
  lat?: number | null;
  lng?: number | null;
  notes?: string;
}): RegistryEntry {
  checkId(input.deviceId);
  const now = Date.now();
  const device = store.devices.get(input.deviceId) ?? blankDevice(input.deviceId, now);
  device.name = text(input.name, device.name);
  device.location = text(input.location, device.location);
  device.notes = text(input.notes, device.notes, 200);
  if (input.lat != null && input.lng != null) {
    checkLatLng(input.lat, input.lng);
    device.lat = input.lat;
    device.lng = input.lng;
  }
  store.devices.set(device.id, device);
  return registryEntry(device, now);
}

/** Validates a Pi payload and updates the device. Throws TelemetryError on bad input. */
export function ingestTelemetry(deviceId: string, data: unknown): LiveDeviceSummary {
  checkId(deviceId);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TelemetryError("Send a JSON telemetry object");
  }
  const body = data as Record<string, unknown>;
  const has = (field: string) => body[field] !== undefined && body[field] !== null;
  const num = (field: string) => {
    const value = Number(body[field]);
    if (!Number.isFinite(value)) throw new TelemetryError(`${field} must be a number`);
    return value;
  };

  const existing = store.devices.get(deviceId);
  const missing: string[] = [];
  if (!has("temperature")) missing.push("temperature");
  if (!has("humidity") && !has("soil_moisture")) missing.push("humidity or soil_moisture");
  const knowsPlace = existing?.lat != null && existing.lng != null;
  if (!knowsPlace && (!has("lat") || !has("lng"))) missing.push("lat, lng");
  if (missing.length) throw new TelemetryError(`Missing fields: ${missing.join(", ")}`);

  const temperatureC = num("temperature");
  if (temperatureC < -60 || temperatureC > 150) {
    throw new TelemetryError("Temperature must be in °C between -60 and 150");
  }
  const humidity = has("humidity") ? num("humidity") : undefined;
  if (humidity !== undefined && (humidity < 0 || humidity > 100)) {
    throw new TelemetryError("Humidity must be 0-100 %");
  }
  const soil = has("soil_moisture") ? num("soil_moisture") : undefined;
  if (soil !== undefined && (soil < 0 || soil > 100)) {
    throw new TelemetryError("soil_moisture must be 0-100 %");
  }
  const windMph = has("wind_mph")
    ? num("wind_mph")
    : has("wind_kph")
      ? num("wind_kph") / 1.609344
      : undefined;
  if (windMph !== undefined && (windMph < 0 || windMph > 250)) {
    throw new TelemetryError("Wind speed out of range");
  }
  const windDir = has("wind_dir") ? parseWindDirection(body["wind_dir"]) : undefined;
  if (has("wind_dir") && windDir === undefined) {
    throw new TelemetryError('wind_dir must be degrees (0-360) or a compass point like "SW"');
  }
  if (has("lat") || has("lng")) checkLatLng(num("lat"), num("lng"));

  const now = Date.now();
  const temperatureF = Math.round(((temperatureC * 9) / 5 + 32) * 10) / 10;
  const device = existing ?? blankDevice(deviceId, now);

  device.name = text(body["name"], device.name);
  device.location = text(body["location"], device.location);
  if (has("lat") && has("lng")) {
    device.lat = num("lat");
    device.lng = num("lng");
  }
  device.temperatureF = temperatureF;
  if (humidity !== undefined) device.humidityPct = pct(humidity);
  if (has("air_humidity")) device.airHumidityPct = pct(num("air_humidity"));
  else if (humidity !== undefined) device.airHumidityPct = pct(humidity);
  if (soil !== undefined) device.soilMoisturePct = pct(soil);
  if (windMph !== undefined) device.windMph = Math.round(windMph * 10) / 10;
  if (windDir !== undefined) device.windDirDeg = Math.round(windDir);
  if (has("battery")) device.batteryPct = pct(num("battery"));
  if (has("elevation_m")) device.elevationM = Math.round(num("elevation_m"));
  device.firstSeen ??= now;
  device.lastSeen = now;
  device.packets += 1;
  device.history = [...device.history, { t: now, temperatureF }].filter(
    (point) => now - point.t <= HISTORY_WINDOW_MS,
  );
  store.devices.set(deviceId, device);

  store.log.unshift({
    deviceId,
    deviceName: device.name,
    location: device.location,
    recordedAt: new Date(now).toISOString(),
    temperatureF,
    ...(humidity !== undefined ? { humidityPct: pct(humidity) } : {}),
    ...(soil !== undefined ? { soilMoisturePct: pct(soil) } : {}),
    ...(windMph !== undefined ? { windMph: Math.round(windMph * 10) / 10 } : {}),
    ...(windDir !== undefined ? { windDirDeg: Math.round(windDir) } : {}),
    lat: device.lat!,
    lng: device.lng!,
  });
  store.log.length = Math.min(store.log.length, READINGS_LOG_SIZE);

  return summarize(device, now)!;
}

/** °F per hour over the last hour; 0 until five minutes of data exist. */
function trendFPerHr(device: Device, now: number): number {
  const recent = device.history.filter((point) => now - point.t <= HISTORY_WINDOW_MS);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last || last.t - first.t < MIN_TREND_SPAN_MS) return 0;
  const hours = (last.t - first.t) / 3_600_000;
  return Math.round(((last.temperatureF - first.temperatureF) / hours) * 10) / 10;
}

function summarize(device: Device, now = Date.now()): LiveDeviceSummary | null {
  if (
    device.lastSeen === null ||
    device.firstSeen === null ||
    device.temperatureF === null ||
    device.lat === null ||
    device.lng === null
  ) {
    return null;
  }
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
    ...(device.humidityPct !== undefined ? { humidityPct: device.humidityPct } : {}),
    ...(device.airHumidityPct !== undefined ? { airHumidityPct: device.airHumidityPct } : {}),
    ...(device.soilMoisturePct !== undefined ? { soilMoisturePct: device.soilMoisturePct } : {}),
    ...(device.windMph !== undefined ? { windMph: device.windMph } : {}),
    ...(device.windDirDeg !== undefined ? { windDirDeg: device.windDirDeg } : {}),
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

function registryEntry(device: Device, now: number): RegistryEntry {
  const status =
    device.lastSeen === null
      ? "waiting"
      : now - device.lastSeen <= LIVE_OFFLINE_AFTER_SECONDS * 1000
        ? "online"
        : "offline";
  return {
    id: device.id,
    name: device.name,
    location: device.location,
    notes: device.notes,
    lat: device.lat,
    lng: device.lng,
    status,
    lastSeen: device.lastSeen === null ? null : new Date(device.lastSeen).toISOString(),
    packets: device.packets,
  };
}

export function listLiveDevices(): LiveDeviceSummary[] {
  const now = Date.now();
  return [...store.devices.values()]
    .map((device) => summarize(device, now))
    .filter((d): d is LiveDeviceSummary => d !== null);
}

export function listRegistry(): RegistryEntry[] {
  const now = Date.now();
  return [...store.devices.values()]
    .sort((a, b) => a.registeredAt - b.registeredAt)
    .map((device) => registryEntry(device, now));
}

export function listReadings(): LoggedReading[] {
  return store.log;
}

export function removeLiveDevice(deviceId: string): boolean {
  return store.devices.delete(deviceId);
}
