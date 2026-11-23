// Browser-safe sensor domain model + simulated Raspberry Pi telemetry.
// No module-scope randomness (Worker global scope forbids it) — call the
// factories lazily from render/effects.

export type RiskLevel = "low" | "moderate" | "high" | "extreme";

export interface SensorReading {
  id: string;
  name: string;
  zone: string;
  lat: number;
  lng: number;
  elevationM: number;
  temperatureF: number;
  /** Relative air humidity. Optional: Viren's soil-probe units don't measure it. */
  humidityPct?: number;
  /** Degrees F change over the last hour — feeds the composite score. */
  tempTrendFPerHr: number;
  batteryPct: number;
  online: boolean;
  lastSeenSecondsAgo: number;
  /** "sim" = simulated demo mesh, "live" = real Raspberry Pi telemetry. */
  source?: "sim" | "live";
  /** Second humidity probe (Luke's air-moisture sensor), when the Pi sends one. */
  airHumidityPct?: number;
  /** Viren's Wildfire Watch inputs — optional, used by the risk engine when present. */
  windMph?: number;
  /** Direction the wind blows FROM, degrees clockwise from north. */
  windDirDeg?: number;
  soilMoisturePct?: number;
}

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  label: string;
  drivers: { label: string; contribution: number }[];
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export const toFahrenheit = (c: number) => Math.round((c * 9) / 5 + 32);

/**
 * Composite fire-risk score (0-100).
 *
 * Smarna's original engine used heat, air dryness and rate of change; Viren's
 * Wildfire Watch added wind and soil moisture. Each factor has a weight; when
 * a node doesn't report wind or soil, the remaining weights are scaled up so
 * every node is still scored out of 100.
 */
export function assessRisk(reading: SensorReading): RiskAssessment {
  const factors: { label: string; weight: number; value: number }[] = [
    // 14°C ≈ 57°F baseline; 30°C span ≈ 54°F span.
    { label: "Heat", weight: 35, value: clamp01((reading.temperatureF - 57) / 54) },
    // 5°C/hr ≈ 9°F/hr.
    { label: "Rate of change", weight: 15, value: clamp01(reading.tempTrendFPerHr / 9) },
  ];
  if (reading.humidityPct !== undefined) {
    factors.push({ label: "Dry air", weight: 25, value: clamp01((62 - reading.humidityPct) / 50) });
  }
  if (reading.windMph !== undefined) {
    // Fire spread climbs steeply with wind; 30 mph+ is red-flag territory.
    factors.push({ label: "Wind", weight: 15, value: clamp01(reading.windMph / 30) });
  }
  if (reading.soilMoisturePct !== undefined) {
    factors.push({
      label: "Dry soil",
      weight: 10,
      value: clamp01((40 - reading.soilMoisturePct) / 35),
    });
  }

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const drivers = factors.map((f) => ({
    label: f.label,
    contribution: Math.round((f.value * f.weight * 100) / totalWeight),
  }));

  const score = Math.min(
    100,
    drivers.reduce((sum, d) => sum + d.contribution, 0),
  );
  const level: RiskLevel =
    score >= 75 ? "extreme" : score >= 50 ? "high" : score >= 25 ? "moderate" : "low";

  return {
    score,
    level,
    label: { low: "Low", moderate: "Moderate", high: "High", extreme: "Extreme" }[level],
    drivers,
  };
}

const COMPASS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

/** 0-360° → 16-point compass label (e.g. 225 → "SW"). */
export function compassPoint(deg: number): string {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]!;
}

/** Accepts degrees or a compass label ("SW"); returns degrees or undefined. */
export function parseWindDirection(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return ((value % 360) + 360) % 360;
  if (typeof value === "string") {
    const index = COMPASS.indexOf(value.trim().toUpperCase());
    if (index >= 0) return index * 22.5;
    const n = Number(value);
    if (Number.isFinite(n)) return ((n % 360) + 360) % 360;
  }
  return undefined;
}

export const RISK_TOKEN: Record<RiskLevel, string> = {
  low: "risk-low",
  moderate: "risk-moderate",
  high: "risk-high",
  extreme: "risk-extreme",
};

/** Hex values used for map markers (canvas/SVG can't read CSS tokens). */
export const RISK_HEX: Record<RiskLevel, string> = {
  low: "#3ec7a1",
  moderate: "#f2c14b",
  high: "#f2842b",
  extreme: "#e3452f",
};

/** Temperature bands used by the color-coded heat layer (°F). */
export interface HeatBand {
  min: number;
  label: string;
  hex: string;
}

export const HEAT_BANDS: HeatBand[] = [
  { min: 105, label: "105°F+", hex: "#b21807" },
  { min: 98, label: "98–105°F", hex: "#e3452f" },
  { min: 91, label: "91–98°F", hex: "#f2842b" },
  { min: 84, label: "84–91°F", hex: "#f2c14b" },
  { min: 75, label: "75–84°F", hex: "#a8c94a" },
  { min: -100, label: "Below 75°F", hex: "#3ec7a1" },
];

export function heatBand(temperatureF: number): HeatBand {
  return HEAT_BANDS.find((b) => temperatureF >= b.min) ?? HEAT_BANDS[HEAT_BANDS.length - 1]!;
}

export const heatColor = (temperatureF: number) => heatBand(temperatureF).hex;

interface SensorSeed {
  id: string;
  name: string;
  zone: string;
  lat: number;
  lng: number;
  elevationM: number;
  baseTemp: number;
  baseHumidity: number;
  baseWindMph: number;
  windFromDeg: number;
  baseSoilPct: number;
}

const SEEDS: SensorSeed[] = [
  {
    id: "PI-01",
    name: "Chelan Butte",
    zone: "Okanogan-Wenatchee NF — North",
    lat: 47.8213,
    lng: -120.0559,
    elevationM: 1093,
    baseTemp: 96,
    baseHumidity: 16,
    baseWindMph: 14,
    windFromDeg: 300,
    baseSoilPct: 12,
  },
  {
    id: "PI-02",
    name: "Swauk Ridge",
    zone: "Okanogan-Wenatchee NF — Cle Elum",
    lat: 47.3122,
    lng: -120.6483,
    elevationM: 1204,
    baseTemp: 91,
    baseHumidity: 23,
    baseWindMph: 11,
    windFromDeg: 270,
    baseSoilPct: 18,
  },
  {
    id: "PI-03",
    name: "Methow Valley",
    zone: "Methow Ranger District",
    lat: 48.4739,
    lng: -120.1256,
    elevationM: 631,
    baseTemp: 94,
    baseHumidity: 18,
    baseWindMph: 16,
    windFromDeg: 315,
    baseSoilPct: 10,
  },
  {
    id: "PI-04",
    name: "Mission Peak Relay",
    zone: "Summit Relay — Wenatchee",
    lat: 47.3625,
    lng: -120.4001,
    elevationM: 2020,
    baseTemp: 79,
    baseHumidity: 35,
    baseWindMph: 22,
    windFromDeg: 250,
    baseSoilPct: 26,
  },
  {
    id: "PI-05",
    name: "Yakima Rim",
    zone: "Yakima Training Corridor",
    lat: 46.7231,
    lng: -120.3853,
    elevationM: 902,
    baseTemp: 100,
    baseHumidity: 11,
    baseWindMph: 18,
    windFromDeg: 290,
    baseSoilPct: 7,
  },
  {
    id: "PI-06",
    name: "Colville Ridge",
    zone: "Colville NF — Northeast",
    lat: 48.5461,
    lng: -117.9021,
    elevationM: 1150,
    baseTemp: 88,
    baseHumidity: 27,
    baseWindMph: 9,
    windFromDeg: 225,
    baseSoilPct: 22,
  },
  {
    id: "PI-07",
    name: "Spokane Scablands",
    zone: "Eastern Shrub-Steppe",
    lat: 47.4791,
    lng: -117.9412,
    elevationM: 715,
    baseTemp: 93,
    baseHumidity: 19,
    baseWindMph: 20,
    windFromDeg: 240,
    baseSoilPct: 9,
  },
  {
    id: "PI-08",
    name: "Gifford Pinchot South",
    zone: "Gifford Pinchot NF — Cowlitz",
    lat: 46.1439,
    lng: -121.7412,
    elevationM: 1180,
    baseTemp: 77,
    baseHumidity: 46,
    baseWindMph: 7,
    windFromDeg: 200,
    baseSoilPct: 38,
  },
];

const jitter = (spread: number) => (Math.random() - 0.5) * spread;

/** Simulated telemetry snapshot from the Pi mesh. */
export function generateReadings(): SensorReading[] {
  return SEEDS.map((seed, i) => {
    const online = !(i === 5 && Math.random() < 0.25);
    return {
      id: seed.id,
      name: seed.name,
      zone: seed.zone,
      lat: seed.lat,
      lng: seed.lng,
      elevationM: seed.elevationM,
      temperatureF: Math.round((seed.baseTemp + jitter(5)) * 10) / 10,
      humidityPct: Math.max(4, Math.round(seed.baseHumidity + jitter(6))),
      tempTrendFPerHr: Math.round((jitter(7) + (seed.baseTemp > 93 ? 4 : 0.7)) * 10) / 10,
      batteryPct: 62 + Math.round(jitter(30)) + 15,
      online,
      lastSeenSecondsAgo: online ? Math.round(Math.random() * 45) : 1420,
      source: "sim" as const,
      windMph: Math.max(0, Math.round(seed.baseWindMph + jitter(6))),
      windDirDeg: Math.round((seed.windFromDeg + jitter(30) + 360) % 360),
      soilMoisturePct: Math.max(2, Math.round(seed.baseSoilPct + jitter(4))),
    };
  });
}

export interface TrendPoint {
  time: string;
  temperatureF: number;
  humidityPct: number;
  /** Network-average soil moisture (Viren's probe). */
  soilPct: number;
  risk: number;
}

/** 24h rolling history for the network average. */
export function generateTrend(): TrendPoint[] {
  return Array.from({ length: 24 }, (_, h) => {
    const hour = (h + 1) % 24;
    const diurnal = Math.sin(((hour - 4) / 24) * Math.PI * 2);
    // 26°C ≈ 79°F baseline; 9°C range ≈ 16°F range.
    const temperatureF = Math.round((79 + diurnal * 16 + jitter(3)) * 10) / 10;
    const humidityPct = Math.max(6, Math.round(32 - diurnal * 16 + jitter(4)));
    // Soil dries slowly through the afternoon and recovers a little overnight.
    const soilPct = Math.max(4, Math.round(20 - diurnal * 5 + jitter(2)));
    const risk = assessRisk({
      ...SEEDS[0]!,
      temperatureF,
      humidityPct,
      soilMoisturePct: soilPct,
      windMph: Math.max(0, 10 + diurnal * 6),
      tempTrendFPerHr: diurnal * 5.4,
      batteryPct: 90,
      online: true,
      lastSeenSecondsAgo: 5,
    } as SensorReading).score;
    return {
      time: `${String(hour).padStart(2, "0")}:00`,
      temperatureF,
      humidityPct,
      soilPct,
      risk,
    };
  });
}

export interface FireStation {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
}

/** Washington State wildfire response bases / district stations. */
export const FIRE_STATIONS: FireStation[] = [
  {
    id: "ST-WEN",
    name: "Wenatchee Valley Fire Dept.",
    city: "Wenatchee",
    lat: 47.4235,
    lng: -120.3103,
  },
  {
    id: "ST-CHE",
    name: "Chelan Co. Fire District 7",
    city: "Chelan",
    lat: 47.8409,
    lng: -120.0166,
  },
  { id: "ST-TWI", name: "Okanogan Co. District 6", city: "Twisp", lat: 48.3665, lng: -120.1198 },
  {
    id: "ST-CLE",
    name: "Kittitas Valley Fire & Rescue",
    city: "Cle Elum",
    lat: 47.1954,
    lng: -120.9392,
  },
  {
    id: "ST-YAK",
    name: "Yakima Fire Dept. Station 5",
    city: "Yakima",
    lat: 46.6021,
    lng: -120.5059,
  },
  { id: "ST-COL", name: "Colville Fire Dept.", city: "Colville", lat: 48.5457, lng: -117.9052 },
  {
    id: "ST-SPO",
    name: "Spokane Valley Fire District 8",
    city: "Spokane Valley",
    lat: 47.6588,
    lng: -117.2394,
  },
  { id: "ST-RAN", name: "Cowlitz 2 Fire & Rescue", city: "Randle", lat: 46.5321, lng: -122.0053 },
  // Eastside stations near the team's live Raspberry Pi nodes (approximate locations).
  { id: "ST-BEL", name: "Bellevue Fire Station 1", city: "Bellevue", lat: 47.6087, lng: -122.2007 },
  { id: "ST-RED", name: "Redmond Fire Station 11", city: "Redmond", lat: 47.6762, lng: -122.1213 },
];

const R_EARTH_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(h));
}

/** Closest staffed station to a sensor node. */
export function nearestStation(point: { lat: number; lng: number }): FireStation {
  return FIRE_STATIONS.reduce((best, s) =>
    distanceKm(point, s) < distanceKm(point, best) ? s : best,
  );
}

// ---------------------------------------------------------------------------
// Rate of rise (ROR) — how fast temperature is climbing, the earliest signal
// of an ignition event. Firefighting convention: sustained fast rise matters
// more than absolute heat.
// ---------------------------------------------------------------------------

export interface RorPoint {
  time: string;
  /** Network average rate of rise, °F per hour. */
  rorFPerHr: number;
  /** Fastest-rising single node at that hour, °F per hour. */
  peakFPerHr: number;
}

/** Rate-of-rise thresholds in °F/hr used for banding and alerting. */
export const ROR_THRESHOLDS = {
  watch: 3,
  warning: 6,
  critical: 9,
} as const;

export function rorLevel(rorFPerHr: number): RiskLevel {
  if (rorFPerHr >= ROR_THRESHOLDS.critical) return "extreme";
  if (rorFPerHr >= ROR_THRESHOLDS.warning) return "high";
  if (rorFPerHr >= ROR_THRESHOLDS.watch) return "moderate";
  return "low";
}

/** 12-hour rolling rate-of-rise history for the mesh. */
export function generateRateOfRise(): RorPoint[] {
  return Array.from({ length: 12 }, (_, i) => {
    const hour = (new Date().getHours() - 11 + i + 24) % 24;
    const diurnal = Math.sin(((hour - 5) / 24) * Math.PI * 2);
    const ror = Math.round((2.4 + diurnal * 3.6 + jitter(1.6)) * 10) / 10;
    const peak = Math.round((ror + 2.2 + Math.abs(jitter(3.4))) * 10) / 10;
    return {
      time: `${String(hour).padStart(2, "0")}:00`,
      rorFPerHr: Math.max(0, ror),
      peakFPerHr: Math.max(0, peak),
    };
  });
}

// ---------------------------------------------------------------------------
// Alert system — alerts fire ONLY when a sensor breaches a defined parameter.
// ---------------------------------------------------------------------------

export type AlertSeverity = "watch" | "warning" | "critical";

export interface AlertThresholds {
  temperatureF: number;
  humidityPct: number;
  rorFPerHr: number;
  riskScore: number;
}

/** Default dispatch parameters — nothing alerts until one of these is met. */
export const DEFAULT_THRESHOLDS: AlertThresholds = {
  temperatureF: 95,
  humidityPct: 20,
  rorFPerHr: ROR_THRESHOLDS.warning,
  riskScore: 70,
};

export interface SensorAlert {
  id: string;
  sensorId: string;
  sensorName: string;
  zone: string;
  severity: AlertSeverity;
  parameter: string;
  message: string;
  reading: string;
  threshold: string;
  riskScore: number;
}

/** Returns one alert per breached parameter; empty when all nodes are nominal. */
export function evaluateAlerts(
  sensors: SensorReading[],
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS,
): SensorAlert[] {
  const alerts: SensorAlert[] = [];

  for (const s of sensors) {
    const risk = assessRisk(s);

    if (!s.online) {
      alerts.push({
        id: `${s.id}-offline`,
        sensorId: s.id,
        sensorName: s.name,
        zone: s.zone,
        severity: "watch",
        parameter: "Link loss",
        message: "Node stopped reporting — coverage gap in this zone.",
        reading: `${Math.round(s.lastSeenSecondsAgo / 60)} min since last packet`,
        threshold: "Expected < 2 min",
        riskScore: risk.score,
      });
      continue;
    }

    if (s.temperatureF >= thresholds.temperatureF) {
      alerts.push({
        id: `${s.id}-temp`,
        sensorId: s.id,
        sensorName: s.name,
        zone: s.zone,
        severity: s.temperatureF >= thresholds.temperatureF + 8 ? "critical" : "warning",
        parameter: "Temperature",
        message: "Surface temperature above dispatch threshold.",
        reading: `${s.temperatureF.toFixed(1)} °F`,
        threshold: `≥ ${thresholds.temperatureF} °F`,
        riskScore: risk.score,
      });
    }

    if (s.humidityPct !== undefined && s.humidityPct <= thresholds.humidityPct) {
      alerts.push({
        id: `${s.id}-hum`,
        sensorId: s.id,
        sensorName: s.name,
        zone: s.zone,
        severity: s.humidityPct <= thresholds.humidityPct - 8 ? "critical" : "warning",
        parameter: "Humidity",
        message: "Relative humidity critically dry — fuels readily ignitable.",
        reading: `${s.humidityPct} %`,
        threshold: `≤ ${thresholds.humidityPct} %`,
        riskScore: risk.score,
      });
    }

    if (s.tempTrendFPerHr >= thresholds.rorFPerHr) {
      alerts.push({
        id: `${s.id}-ror`,
        sensorId: s.id,
        sensorName: s.name,
        zone: s.zone,
        severity: s.tempTrendFPerHr >= ROR_THRESHOLDS.critical ? "critical" : "warning",
        parameter: "Rate of rise",
        message: "Temperature climbing fast — possible active ignition.",
        reading: `${s.tempTrendFPerHr.toFixed(1)} °F/h`,
        threshold: `≥ ${thresholds.rorFPerHr} °F/h`,
        riskScore: risk.score,
      });
    }

    if (risk.score >= thresholds.riskScore) {
      alerts.push({
        id: `${s.id}-risk`,
        sensorId: s.id,
        sensorName: s.name,
        zone: s.zone,
        severity: risk.score >= 85 ? "critical" : "warning",
        parameter: "Composite risk",
        message: `Composite fire risk at ${risk.label.toLowerCase()} level.`,
        reading: String(risk.score),
        threshold: `≥ ${thresholds.riskScore}`,
        riskScore: risk.score,
      });
    }
  }

  const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, watch: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity] || b.riskScore - a.riskScore);
}

export const SEVERITY_STYLE: Record<AlertSeverity, { label: string; token: string }> = {
  critical: { label: "Critical", token: "risk-extreme" },
  warning: { label: "Warning", token: "risk-high" },
  watch: { label: "Watch", token: "risk-moderate" },
};
