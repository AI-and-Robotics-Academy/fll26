import { createServerFn } from "@tanstack/react-start";
import { ingestTelemetry, removeLiveDevice } from "@/lib/telemetry.server";

// Admin actions for the Devices page. Server functions are same-origin and
// CSRF-protected, so they don't need the Pi ingest token.

interface TestReadingInput {
  deviceId: string;
  name: string;
  lat: number;
  lng: number;
  temperatureC: number;
  humidityPct: number;
}

/** Sends a pretend Pi packet — lets the team demo the live path without hardware. */
export const sendTestReading = createServerFn({ method: "POST" })
  .inputValidator((input: TestReadingInput) => input)
  .handler(async ({ data }) =>
    ingestTelemetry(data.deviceId, {
      name: data.name,
      location: "Test bench",
      temperature: data.temperatureC,
      humidity: data.humidityPct,
      air_humidity: data.humidityPct,
      battery: 100,
      lat: data.lat,
      lng: data.lng,
    }),
  );

export const removeDevice = createServerFn({ method: "POST" })
  .inputValidator((input: { deviceId: string }) => {
    if (typeof input?.deviceId !== "string") throw new Error("deviceId required");
    return input;
  })
  .handler(async ({ data }) => ({ removed: removeLiveDevice(data.deviceId) }));
