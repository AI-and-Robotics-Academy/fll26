// Fire spread prediction + fire-line planning (Viren's Area Intelligence).
//
// A deliberately simple, explainable model a 5th–8th grader can defend to
// judges. It is NOT an operational fire-behaviour model (like Rothermel /
// FARSITE); real crews follow incident command.
//
//   direction  = downwind (wind blows FROM windFromDeg, fire runs the other way)
//   speed      = base + wind push, scaled by how dry the air and soil are
//   1-hour run = speed × 1 h
// Fire lines go ahead of the head and along both flanks; an anchor point sits
// upwind, behind the fire, where crews start a line safely.

import { compassPoint, distanceKm, nearestStation, type FireStation } from "./sensors";

export interface SpreadInput {
  lat: number;
  lng: number;
  windMph: number;
  /** Direction the wind comes FROM, degrees. */
  windFromDeg: number;
  humidityPct?: number;
  soilMoisturePct?: number;
  temperatureF?: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface FireLine {
  id: string;
  name: string;
  purpose: string;
  position: LatLng;
  /** Line runs across this bearing (perpendicular to the fire's path for the head line). */
  station: FireStation;
  truck: { googleMaps: string; waze: string };
  air: {
    headingDeg: number;
    headingLabel: string;
    distanceKm: number;
    distanceNm: number;
    satellite: string;
  };
}

export interface SpreadPrediction {
  origin: LatLng;
  headingDeg: number;
  headingLabel: string;
  windFromLabel: string;
  speedKmh: number;
  oneHourReachKm: number;
  head: LatLng;
  impactCenter: LatLng;
  impactRadiusKm: number;
  dryness: number;
  reasoning: string[];
  fireLines: FireLine[];
}

const R_EARTH_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Point reached from `from` after `km` on `bearingDeg`. */
export function destination(from: LatLng, bearingDeg: number, km: number): LatLng {
  const dist = km / R_EARTH_KM;
  const theta = toRad(bearingDeg);
  const lat1 = toRad(from.lat);
  const lng1 = toRad(from.lng);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dist) + Math.cos(lat1) * Math.sin(dist) * Math.cos(theta),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(dist) * Math.cos(lat1),
      Math.cos(dist) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: round(toDeg(lat2), 5), lng: round(((toDeg(lng2) + 540) % 360) - 180, 5) };
}

/** Initial compass bearing from a to b. */
export function bearing(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const fmt = (p: LatLng) => `${p.lat},${p.lng}`;

function linksFor(position: LatLng, station: FireStation): Pick<FireLine, "truck" | "air"> {
  const headingDeg = Math.round(bearing(station, position));
  const km = distanceKm(station, position);
  return {
    truck: {
      googleMaps: `https://www.google.com/maps/dir/?api=1&origin=${fmt(station)}&destination=${fmt(position)}&travelmode=driving`,
      waze: `https://waze.com/ul?ll=${fmt(position)}&navigate=yes`,
    },
    air: {
      headingDeg,
      headingLabel: compassPoint(headingDeg),
      distanceKm: round(km, 1),
      distanceNm: round(km / 1.852, 1),
      satellite: `https://www.google.com/maps/@?api=1&map_action=map&center=${fmt(position)}&zoom=17&basemap=satellite`,
    },
  };
}

export function predictSpread(input: SpreadInput): SpreadPrediction {
  const origin = { lat: input.lat, lng: input.lng };
  const windMph = clamp(input.windMph, 0, 80);
  const headingDeg = (input.windFromDeg + 180) % 360;

  // Dryness 0 (wet) → 1 (very dry), from whatever the sensors measure.
  const parts: number[] = [];
  if (input.humidityPct !== undefined) parts.push(clamp((60 - input.humidityPct) / 50, 0, 1));
  if (input.soilMoisturePct !== undefined)
    parts.push(clamp((40 - input.soilMoisturePct) / 35, 0, 1));
  if (input.temperatureF !== undefined) parts.push(clamp((input.temperatureF - 60) / 45, 0, 1));
  const dryness = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0.5;

  // km/h: a calm, damp fire creeps (~0.1); a dry fire in 30 mph wind runs ~4-5.
  const speedKmh = round((0.1 + 0.12 * windMph) * (0.35 + 1.1 * dryness), 2);
  const oneHourReachKm = round(Math.max(0.1, speedKmh), 2);
  const head = destination(origin, headingDeg, oneHourReachKm);
  const impactCenter = destination(origin, headingDeg, oneHourReachKm * 0.5);
  const impactRadiusKm = round(Math.max(0.15, oneHourReachKm * 0.6), 2);

  const reasoning = [
    `Wind from the ${compassPoint(input.windFromDeg)} at ${Math.round(windMph)} mph pushes the fire toward the ${compassPoint(headingDeg)}.`,
    `Fuels are ${dryness > 0.66 ? "very dry" : dryness > 0.33 ? "moderately dry" : "fairly moist"} (dryness ${Math.round(dryness * 100)}%) from ${
      [
        input.humidityPct !== undefined ? `${input.humidityPct}% humidity` : null,
        input.soilMoisturePct !== undefined ? `${input.soilMoisturePct}% soil moisture` : null,
        input.temperatureF !== undefined ? `${Math.round(input.temperatureF)}°F` : null,
      ]
        .filter(Boolean)
        .join(", ") || "no moisture readings (assumed average)"
    }.`,
    `Estimated head speed ${speedKmh} km/h, so it could travel about ${oneHourReachKm} km in one hour.`,
    "Fires also run faster uphill and through grass than through damp timber — check the terrain before committing crews.",
  ];

  const perpendicular = (headingDeg + 90) % 360;
  const flankOffset = Math.max(0.2, oneHourReachKm * 0.6);
  const lines: Omit<FireLine, "truck" | "air" | "station">[] = [
    {
      id: "head",
      name: "Head line",
      purpose: `Across the fire's path, ${round(oneHourReachKm * 1.5, 1)} km downwind — gives crews about 90 minutes before the head arrives.`,
      position: destination(origin, headingDeg, oneHourReachKm * 1.5),
    },
    {
      id: "left",
      name: "Left flank",
      purpose: "Along the left side of the fire to stop it widening.",
      position: destination(
        destination(origin, headingDeg, oneHourReachKm * 0.5),
        (perpendicular + 180) % 360,
        flankOffset,
      ),
    },
    {
      id: "right",
      name: "Right flank",
      purpose: "Along the right side of the fire to stop it widening.",
      position: destination(
        destination(origin, headingDeg, oneHourReachKm * 0.5),
        perpendicular,
        flankOffset,
      ),
    },
    {
      id: "anchor",
      name: "Anchor point",
      purpose:
        "Upwind, behind the fire in already-burned or safe ground — where crews start the line.",
      position: destination(origin, input.windFromDeg, Math.max(0.3, oneHourReachKm * 0.25)),
    },
  ];
  const fireLines = lines.map((line) => {
    const station = nearestStation(line.position);
    return { ...line, station, ...linksFor(line.position, station) };
  });

  return {
    origin,
    headingDeg: Math.round(headingDeg),
    headingLabel: compassPoint(headingDeg),
    windFromLabel: compassPoint(input.windFromDeg),
    speedKmh,
    oneHourReachKm,
    head,
    impactCenter,
    impactRadiusKm,
    dryness: round(dryness, 2),
    reasoning,
    fireLines,
  };
}
