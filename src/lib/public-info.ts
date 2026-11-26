// Public, non-confidential wildfire info for the landing page and citizens.
//
// Citizens see area-level summaries only: a risk level, alert counts, average
// conditions and readiness advice within PUBLIC_RADIUS_KM of a town. They
// never see sensor IDs, exact sensor coordinates, crew/resource positions or
// fire-line plans — those stay behind the firefighter sign-in.

import {
  FIRE_STATIONS,
  assessRisk,
  compassPoint,
  distanceKm,
  evaluateAlerts,
  type RiskLevel,
  type SensorReading,
} from "./sensors";

export interface Place {
  name: string;
  lat: number;
  lng: number;
}

/** Towns near the team (Eastside) and the simulated statewide mesh. */
export const PLACES: Place[] = [
  { name: "Bellevue", lat: 47.6101, lng: -122.2015 },
  { name: "Issaquah", lat: 47.5301, lng: -122.0326 },
  { name: "Redmond", lat: 47.674, lng: -122.1215 },
  { name: "Seattle", lat: 47.6062, lng: -122.3321 },
  { name: "Cle Elum", lat: 47.1954, lng: -120.9392 },
  { name: "Wenatchee", lat: 47.4235, lng: -120.3103 },
  { name: "Chelan", lat: 47.8409, lng: -120.0166 },
  { name: "Twisp", lat: 48.3665, lng: -120.1198 },
  { name: "Yakima", lat: 46.6021, lng: -120.5059 },
  { name: "Spokane", lat: 47.6588, lng: -117.426 },
  { name: "Colville", lat: 48.5457, lng: -117.9052 },
  { name: "Randle", lat: 46.5321, lng: -122.0053 },
];

export const PUBLIC_RADIUS_KM = 80;

export const findPlace = (name: string) => PLACES.find((p) => p.name === name) ?? { name: "Bellevue", lat: 47.6101, lng: -122.2015 };

/** Closest listed town to a GPS point (used for "Use my location"). */
export function nearestPlace(point: { lat: number; lng: number }): Place {
  return PLACES.reduce((best, p) => (distanceKm(point, p) < distanceKm(point, best) ? p : best));
}

export interface PublicSummary {
  /** Number of online sensors within the radius. */
  coverage: number;
  level: RiskLevel | null;
  levelLabel: string;
  score: number | null;
  /** Distance to the nearest monitored area, km. */
  nearestKm: number | null;
  alerts: { total: number; byType: { label: string; count: number }[] };
  conditions: {
    temperatureF: number | null;
    humidityPct: number | null;
    windMph: number | null;
    windFrom: string | null;
    soilPct: number | null;
  };
  burnAdvice: string;
  readiness: { stage: "Ready" | "Set" | "Go"; headline: string; steps: string[] };
  nearestStation: { name: string; km: number };
}

const LEVEL_LABEL: Record<RiskLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  extreme: "Extreme",
};

const mean = (values: (number | undefined)[]) => {
  const v = values.filter((x): x is number => x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Area-level summary around a point. */
export function summarizeArea(
  point: { lat: number; lng: number },
  sensors: SensorReading[],
): PublicSummary {
  const nearby = sensors
    .filter((s) => s.online)
    .map((s) => ({ s, km: distanceKm(point, s) }))
    .sort((a, b) => a.km - b.km);
  const inRange = nearby.filter((n) => n.km <= PUBLIC_RADIUS_KM).map((n) => n.s);

  const worst = inRange.reduce<SensorReading | null>(
    (best, s) => (!best || assessRisk(s).score > assessRisk(best).score ? s : best),
    null,
  );
  const risk = worst ? assessRisk(worst) : null;

  const alerts = evaluateAlerts(inRange).filter((a) => a.parameter !== "Link loss");
  const types = new Map<string, number>();
  for (const a of alerts) {
    const label =
      a.parameter === "Temperature"
        ? "Extreme heat"
        : a.parameter === "Humidity"
          ? "Very dry air"
          : a.parameter === "Rate of rise"
            ? "Rapid warming"
            : "High fire risk";
    types.set(label, (types.get(label) ?? 0) + 1);
  }

  // Vector-average wind direction.
  const dirs = inRange.filter((s) => s.windDirDeg !== undefined);
  const windFrom = dirs.length
    ? compassPoint(
        (Math.atan2(
          dirs.reduce((a, s) => a + Math.sin(((s.windDirDeg ?? 0) * Math.PI) / 180), 0),
          dirs.reduce((a, s) => a + Math.cos(((s.windDirDeg ?? 0) * Math.PI) / 180), 0),
        ) *
          180) /
          Math.PI,
      )
    : null;

  const level = risk?.level ?? null;
  const burnAdvice =
    level === "extreme" || level === "high"
      ? "Do not burn. Avoid mowing dry grass, campfires and anything that sparks."
      : level === "moderate"
        ? "Burn only if your local fire district allows it, and keep water nearby."
        : level === "low"
          ? "Low danger — still follow local burn rules."
          : "No local readings — check your fire district before burning.";

  const readiness: PublicSummary["readiness"] =
    level === "extreme"
      ? {
          stage: "Set",
          headline: "Be set to leave quickly",
          steps: [
            "Pack your go-bag and put it in the car.",
            "Park facing the street; keep the gas tank half full.",
            "Know two ways out of your neighborhood.",
            "Leave right away if officials say GO — don't wait.",
          ],
        }
      : level === "high"
        ? {
            stage: "Set",
            headline: "Get ready in case you need to leave",
            steps: [
              "Pack a go-bag: water, meds, chargers, documents, masks.",
              "Clear dry leaves and branches 5 ft around your home.",
              "Plan where pets and family will meet.",
              "Sign up for local emergency alerts.",
            ],
          }
        : {
            stage: "Ready",
            headline: "Be ready before fire season",
            steps: [
              "Make a family evacuation plan and practice it.",
              "Keep gutters and roofs clear of needles and leaves.",
              "Save your county's emergency alert number.",
              "Report smoke by calling 911.",
            ],
          };

  const station = FIRE_STATIONS.reduce((best, s) =>
    distanceKm(point, s) < distanceKm(point, best) ? s : best,
  );

  return {
    coverage: inRange.length,
    level,
    levelLabel: level ? LEVEL_LABEL[level] : "No data nearby",
    score: risk?.score ?? null,
    nearestKm: nearby[0] ? nearby[0].km : null,
    alerts: {
      total: alerts.length,
      byType: [...types.entries()].map(([label, count]) => ({ label, count })),
    },
    conditions: {
      temperatureF: mean(inRange.map((s) => s.temperatureF)),
      humidityPct: mean(inRange.map((s) => s.humidityPct)),
      windMph: mean(inRange.map((s) => s.windMph)),
      windFrom,
      soilPct: mean(inRange.map((s) => s.soilMoisturePct)),
    },
    burnAdvice,
    readiness,
    nearestStation: { name: station.name, km: distanceKm(point, station) },
  };
}
