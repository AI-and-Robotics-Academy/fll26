import { createFileRoute } from "@tanstack/react-router";
import { TelemetryError, ingestTelemetry, ingestToken } from "@/lib/telemetry.server";

// POST /api/devices/<device-id>/telemetry — Raspberry Pi ingest endpoint.
// Same contract as Luke's FireWatch Flask app, so existing Pi scripts keep working.
export const Route = createFileRoute("/api/devices/$deviceId/telemetry")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const token = ingestToken();
        if (token && request.headers.get("x-firewatch-token") !== token) {
          return Response.json({ error: "Invalid ingest token" }, { status: 401 });
        }
        let data: unknown;
        try {
          data = await request.json();
        } catch {
          return Response.json({ error: "Send a JSON telemetry object" }, { status: 400 });
        }
        try {
          const device = ingestTelemetry(params.deviceId, data);
          return Response.json({ message: "Telemetry received", device });
        } catch (error) {
          if (error instanceof TelemetryError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          throw error;
        }
      },
    },
  },
});
