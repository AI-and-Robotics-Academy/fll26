import { createFileRoute } from "@tanstack/react-router";
import { listReadings, listRegistry } from "@/lib/telemetry.server";

// GET /api/readings — last 100 live readings, newest first, plus device status
// (Viren's Readings Log).
export const Route = createFileRoute("/api/readings/")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          { readings: listReadings(), devices: listRegistry() },
          { headers: { "cache-control": "no-store" } },
        ),
    },
  },
});
