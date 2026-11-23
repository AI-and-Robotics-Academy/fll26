import { createServerFn } from "@tanstack/react-start";
import { callOpenAI, parseJson } from "@/lib/openai.server";

// Area Intelligence (Viren's Wildfire Watch): an AI assessment of any named
// area using live web context — risk, active fires, fuels, weather, terrain.
// Needs OPENAI_API_KEY. The fire-spread math itself runs in the browser
// (src/lib/fire-spread.ts) so it works offline too.

export interface TerrainFeature {
  type: "canyon" | "ridge" | "slope" | "valley" | "flat";
  name: string;
  description: string;
}

export interface AreaAssessment {
  place: string;
  lat: number;
  lng: number;
  overallRisk: "Low" | "Moderate" | "High" | "Extreme";
  summary: string;
  activeFires: string[];
  vegetation: string;
  weather: string;
  windMph: number;
  windFromDeg: number;
  humidityPct: number;
  temperatureF: number;
  terrain: TerrainFeature[];
  preparedness: string[];
}

export type AreaResult =
  { ok: true; assessment: AreaAssessment; checkedAt: string } | { ok: false; notice: string };

const SCHEMA = {
  name: "area_assessment",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "place",
      "lat",
      "lng",
      "overallRisk",
      "summary",
      "activeFires",
      "vegetation",
      "weather",
      "windMph",
      "windFromDeg",
      "humidityPct",
      "temperatureF",
      "terrain",
      "preparedness",
    ],
    properties: {
      place: { type: "string" },
      lat: { type: "number" },
      lng: { type: "number" },
      overallRisk: { type: "string", enum: ["Low", "Moderate", "High", "Extreme"] },
      summary: { type: "string" },
      activeFires: { type: "array", items: { type: "string" } },
      vegetation: { type: "string" },
      weather: { type: "string" },
      windMph: { type: "number" },
      windFromDeg: { type: "number" },
      humidityPct: { type: "number" },
      temperatureF: { type: "number" },
      terrain: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "name", "description"],
          properties: {
            type: { type: "string", enum: ["canyon", "ridge", "slope", "valley", "flat"] },
            name: { type: "string" },
            description: { type: "string" },
          },
        },
      },
      preparedness: { type: "array", items: { type: "string" } },
    },
  },
};

export const assessArea = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) => {
    const query = String(input?.query ?? "")
      .trim()
      .slice(0, 200);
    if (!query)
      throw new Error("Type an area to search, e.g. “Sequoia National Forest, California”.");
    return { query };
  })
  .handler(async ({ data }): Promise<AreaResult> => {
    const result = await callOpenAI({
      instructions:
        "You are a wildfire analyst helping a FIRST LEGO League team. Search the web for CURRENT " +
        "conditions in the area the user names: active fires and incidents, today's weather " +
        "(temperature °F, relative humidity %, wind speed mph and the direction it blows FROM in " +
        "degrees), vegetation / fuel load, and terrain. Give the area's center coordinates. " +
        "terrain: 2-5 named features (canyons, ridges, slopes, valleys, flats) with one-sentence " +
        "fire-behaviour notes. preparedness: 3-5 actions for residents and crews. activeFires: " +
        "name, size and containment if known, or an empty list. Keep every string under 40 words. " +
        "Never invent incidents; say when data is unavailable.",
      input: data.query,
      schema: SCHEMA,
      webSearch: true,
    });
    if (!result.ok) return { ok: false, notice: result.notice };
    const assessment = parseJson<AreaAssessment>(result.text);
    if (
      !assessment ||
      !Number.isFinite(assessment.lat) ||
      !Number.isFinite(assessment.lng) ||
      Math.abs(assessment.lat) > 90 ||
      Math.abs(assessment.lng) > 180
    ) {
      return { ok: false, notice: "The AI couldn't locate that area. Try a more specific name." };
    }
    return { ok: true, assessment, checkedAt: new Date().toISOString() };
  });
