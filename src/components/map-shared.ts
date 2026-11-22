// Shared bits for the two map engines: Google Maps (TerrainMap) and the
// keyless OpenTopoMap fallback (LeafletMap).

import { RESOURCE_STATUS_HEX, type Resource } from "@/lib/field-data";
import {
  RISK_HEX,
  assessRisk,
  heatColor,
  type FireStation,
  type SensorReading,
} from "@/lib/sensors";

export interface MapProps {
  sensors: SensorReading[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** "heat" colors nodes by raw temperature; "risk" by composite score. */
  layer?: "risk" | "heat";
  /** Encoded polyline of the dispatch route to the selected node. */
  routePolyline?: string | null;
  /** Station dispatching to the selected node (highlighted + straight-line fallback). */
  dispatchStation?: FireStation | null;
  showStations?: boolean;
  /** Shivi's emergency resources, drawn as square markers. */
  resources?: Resource[];
  selectedResourceId?: string | null;
  onSelectResource?: (id: string) => void;
  /** Fit the view to these points once the map loads (default: statewide view). */
  fitTo?: { lat: number; lng: number }[];
}

export const DEFAULT_CENTER = { lat: 47.4, lng: -120.2 };
export const DEFAULT_ZOOM = 7;

export function sensorColor(sensor: SensorReading, layer: "risk" | "heat") {
  if (!sensor.online) return "#7a736c";
  return layer === "heat" ? heatColor(sensor.temperatureF) : RISK_HEX[assessRisk(sensor).level];
}

export function sensorRadiusMeters(sensor: SensorReading, layer: "risk" | "heat") {
  return layer === "heat"
    ? 2600 + Math.max(0, sensor.temperatureF - 70) * 460
    : 1200 + assessRisk(sensor).score * 55;
}

/** Live Pi nodes get a white outer ring so judges can spot real hardware. */
export function sensorSvg(color: string, active: boolean, live: boolean) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
    <circle cx="17" cy="17" r="12" fill="${color}" fill-opacity="0.22"${
      live ? ' stroke="#ffffff" stroke-width="2"' : ""
    }/>
    <circle cx="17" cy="17" r="7" fill="${color}" stroke="#12100e" stroke-width="${active ? 3 : 1.5}"/>
  </svg>`;
}

export function stationSvg(active: boolean) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <rect x="6" y="6" width="18" height="18" rx="4" fill="#2f7fd4" stroke="#12100e" stroke-width="${active ? 3 : 1.5}"/>
    <path d="M15 10l3.4 4.2h-2.2v4.6h-2.4v-4.6h-2.2z" fill="#f4f1ec"/>
  </svg>`;
}

const RESOURCE_GLYPH: Record<string, string> = {
  water_tanker: "W",
  firetruck: "F",
  ambulance: "A",
  evacuation_bus: "B",
  generator: "G",
  first_aid_kit: "+",
  shelter_supply: "S",
};

export function resourceSvg(resource: Resource, active: boolean) {
  const color = RESOURCE_STATUS_HEX[resource.status];
  const glyph = RESOURCE_GLYPH[resource.type] ?? "R";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <rect x="3" y="3" width="22" height="22" rx="3" fill="${color}" stroke="${active ? "#ffffff" : "#12100e"}" stroke-width="${active ? 3 : 1.5}" transform="rotate(45 14 14)"/>
    <text x="14" y="18.5" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="12" font-weight="700" fill="#12100e">${glyph}</text>
  </svg>`;
}

export const svgUrl = (svg: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

/** Decodes a Google encoded polyline (for the Leaflet engine). */
export function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}
