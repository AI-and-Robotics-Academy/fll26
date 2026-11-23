import { createServerFn } from "@tanstack/react-start";
import {
  TelemetryError,
  ingestTelemetry,
  listRegistry,
  registerDevice,
  removeLiveDevice,
} from "@/lib/telemetry.server";

// Admin actions for the Devices page. Server functions are same-origin and
// CSRF-protected, so they don't need the Pi ingest token.

interface TestReadingInput {
  deviceId: string;
  name: string;
  lat: number;
  lng: number;
  temperatureC: number;
  humidityPct: number;
  soilMoisturePct: number;
  windMph: number;
  windDirDeg: number;
}

/** Turns validation errors into a message the page can show. */
async function friendly<T>(fn: () => T): Promise<T> {
  try {
    return fn();
  } catch (error) {
    if (error instanceof TelemetryError) throw new Error(error.message);
    throw error;
  }
}

/** Sends a pretend Pi packet — lets the team demo the live path without hardware. */
export const sendTestReading = createServerFn({ method: "POST" })
  .inputValidator((input: TestReadingInput) => input)
  .handler(async ({ data }) =>
    friendly(() =>
      ingestTelemetry(data.deviceId, {
        name: data.name,
        location: "Test bench",
        temperature: data.temperatureC,
        humidity: data.humidityPct,
        soil_moisture: data.soilMoisturePct,
        wind_mph: data.windMph,
        wind_dir: data.windDirDeg,
        battery: 100,
        lat: data.lat,
        lng: data.lng,
      }),
    ),
  );

/** Viren's Sensor Setup: register a field unit (name + location) before it reports. */
export const registerFieldUnit = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      deviceId: string;
      name: string;
      location: string;
      lat: number | null;
      lng: number | null;
      notes: string;
    }) => input,
  )
  .handler(async ({ data }) => friendly(() => registerDevice(data)));

export const getRegistry = createServerFn({ method: "GET" }).handler(async () => listRegistry());

export const removeDevice = createServerFn({ method: "POST" })
  .inputValidator((input: { deviceId: string }) => {
    if (typeof input?.deviceId !== "string") throw new Error("deviceId required");
    return input;
  })
  .handler(async ({ data }) => ({ removed: removeLiveDevice(data.deviceId) }));
