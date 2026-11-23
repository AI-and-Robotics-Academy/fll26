import { createServerFn } from "@tanstack/react-start";
import { acknowledgeReport, addReport, listReports } from "@/lib/reports.server";

const KINDS = ["smoke", "flames", "other"] as const;

export const submitReport = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      reporter: string;
      place: string;
      lat: number;
      lng: number;
      kind: string;
      note: string;
    }) => {
      const lat = Number(input?.lat);
      const lng = Number(input?.lng);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180
      ) {
        throw new Error("Invalid location");
      }
      const kind = (KINDS as readonly string[]).includes(input.kind)
        ? (input.kind as (typeof KINDS)[number])
        : "other";
      return {
        reporter: String(input.reporter ?? "Citizen").slice(0, 60),
        place: String(input.place ?? "").slice(0, 60),
        lat,
        lng,
        kind,
        note: String(input.note ?? "").slice(0, 280),
      };
    },
  )
  .handler(async ({ data }) => addReport(data));

export const getReports = createServerFn({ method: "GET" }).handler(async () => listReports());

export const ackReport = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .handler(async ({ data }) => acknowledgeReport(data.id));
