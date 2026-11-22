import { createFileRoute } from "@tanstack/react-router";
import { listLiveDevices } from "@/lib/telemetry.server";

// GET /api/devices — every live Raspberry Pi that has reported (Luke's API).
export const Route = createFileRoute("/api/devices/")({
  server: {
    handlers: {
      GET: () => Response.json(listLiveDevices(), { headers: { "cache-control": "no-store" } }),
    },
  },
});
