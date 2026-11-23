// Keyless fallback map engine: Leaflet + OpenTopoMap contour tiles.
// Leaflet 1.9.4 is vendored in public/vendor/leaflet (BSD-2, see LICENSE there)
// and loaded at runtime, so it needs no npm dependency or CDN.

import { useEffect, useRef, useState } from "react";
import { FIRE_STATIONS } from "@/lib/sensors";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  decodePolyline,
  resourceSvg,
  sensorColor,
  sensorRadiusMeters,
  sensorSvg,
  stationSvg,
  type MapProps,
} from "@/components/map-shared";

const LEAFLET_CSS = "/vendor/leaflet/leaflet.css";
const LEAFLET_JS = "/vendor/leaflet/leaflet.js";

type LatLng = { lat: number; lng: number } | [number, number];

// Minimal typings for the slice of Leaflet we use.
interface LLayer {
  addTo(map: LMap): this;
  remove(): this;
  on(event: string, fn: () => void): this;
}
interface LMarker extends LLayer {
  setLatLng(p: LatLng): this;
  setIcon(icon: unknown): this;
  setZIndexOffset(z: number): this;
  bindTooltip(text: string): this;
  setTooltipContent(text: string): this;
}
interface LCircle extends LLayer {
  setLatLng(p: LatLng): this;
  setRadius(r: number): this;
  setStyle(style: Record<string, unknown>): this;
}
interface LPolyline extends LLayer {
  setLatLngs(p: LatLng[]): this;
  setStyle(style: Record<string, unknown>): this;
}
interface LMap {
  setView(center: LatLng, zoom: number): this;
  fitBounds(points: LatLng[], opts?: Record<string, unknown>): this;
  panTo(p: LatLng): this;
  invalidateSize(): this;
  remove(): void;
}
interface LLayerGroup extends LLayer {
  clearLayers(): this;
  addLayer(layer: LLayer): this;
}
interface LeafletNS {
  layerGroup(): LLayerGroup;
  map(el: HTMLElement, opts?: Record<string, unknown>): LMap;
  tileLayer(url: string, opts?: Record<string, unknown>): LLayer;
  marker(p: LatLng, opts?: Record<string, unknown>): LMarker;
  circle(p: LatLng, opts?: Record<string, unknown>): LCircle;
  polyline(p: LatLng[], opts?: Record<string, unknown>): LPolyline;
  divIcon(opts: Record<string, unknown>): unknown;
}

declare global {
  interface Window {
    L?: LeafletNS;
  }
}

let leafletPromise: Promise<LeafletNS> | null = null;

function loadLeaflet(): Promise<LeafletNS> {
  leafletPromise ??= new Promise<LeafletNS>((resolve, reject) => {
    if (window.L) return resolve(window.L);
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = LEAFLET_CSS;
      document.head.appendChild(css);
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => (window.L ? resolve(window.L) : reject(new Error("Leaflet missing")));
    script.onerror = () => reject(new Error("Leaflet failed to load"));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

const icon = (L: LeafletNS, svg: string, size: number) =>
  L.divIcon({ className: "", html: svg, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });

export default function LeafletMap({
  sensors,
  selectedId,
  onSelect,
  layer = "heat",
  routePolyline = null,
  dispatchStation = null,
  showStations = true,
  resources = [],
  selectedResourceId = null,
  onSelectResource,
  fitTo,
  spread = null,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LMap | null>(null);
  const LRef = useRef<LeafletNS | null>(null);
  const sensorMarkers = useRef<Map<string, { marker: LMarker; circle: LCircle }>>(new Map());
  const stationMarkers = useRef<Map<string, LMarker>>(new Map());
  const resourceMarkers = useRef<Map<string, LMarker>>(new Map());
  const routeLine = useRef<LPolyline | null>(null);
  const spreadLayer = useRef<LLayerGroup | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const selectResourceRef = useRef(onSelectResource);
  selectResourceRef.current = onSelectResource;
  const fitRef = useRef(fitTo);
  fitRef.current = fitTo;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        LRef.current = L;
        const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
          DEFAULT_CENTER,
          DEFAULT_ZOOM,
        );
        L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
          maxZoom: 17,
          subdomains: "abc",
          attribution:
            'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
        }).addTo(map);
        const points = fitRef.current;
        if (points && points.length) map.fitBounds(points, { padding: [40, 40] });
        mapRef.current = map;
        setReady(true);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Sensor nodes + coverage circles.
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!ready || !map || !L) return;
    const seen = new Set<string>();
    for (const sensor of sensors) {
      seen.add(sensor.id);
      const color = sensorColor(sensor, layer);
      const active = sensor.id === selectedId;
      const position = { lat: sensor.lat, lng: sensor.lng };
      let entry = sensorMarkers.current.get(sensor.id);
      if (!entry) {
        const circle = L.circle(position, { interactive: false, weight: 1 }).addTo(map);
        const marker = L.marker(position)
          .addTo(map)
          .bindTooltip(sensor.id)
          .on("click", () => selectRef.current(sensor.id));
        entry = { marker, circle };
        sensorMarkers.current.set(sensor.id, entry);
      }
      entry.marker
        .setLatLng(position)
        .setIcon(icon(L, sensorSvg(color, active, sensor.source === "live"), 34))
        .setZIndexOffset(active ? 1000 : 0)
        .setTooltipContent(`${sensor.id} · ${sensor.name}`);
      entry.circle
        .setLatLng(position)
        .setRadius(sensorRadiusMeters(sensor, layer))
        .setStyle({
          color,
          fillColor: color,
          opacity: 0.5,
          fillOpacity: layer === "heat" ? (sensor.online ? 0.3 : 0.1) : 0.16,
        });
    }
    for (const [id, entry] of sensorMarkers.current) {
      if (seen.has(id)) continue;
      entry.marker.remove();
      entry.circle.remove();
      sensorMarkers.current.delete(id);
    }
  }, [ready, sensors, selectedId, layer]);

  // Fire stations.
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!ready || !map || !L) return;
    for (const station of FIRE_STATIONS) {
      let marker = stationMarkers.current.get(station.id);
      if (!marker) {
        marker = L.marker(station, { zIndexOffset: 500 }).bindTooltip(
          `${station.name} · ${station.city}`,
        );
        stationMarkers.current.set(station.id, marker);
      }
      marker.setIcon(icon(L, stationSvg(station.id === dispatchStation?.id), 30));
      if (showStations) marker.addTo(map);
      else marker.remove();
    }
  }, [ready, showStations, dispatchStation]);

  // Resources (Shivi).
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!ready || !map || !L) return;
    const seen = new Set<string>();
    for (const resource of resources) {
      seen.add(resource.id);
      let marker = resourceMarkers.current.get(resource.id);
      if (!marker) {
        marker = L.marker(resource.location, { zIndexOffset: 600 })
          .addTo(map)
          .bindTooltip(resource.id)
          .on("click", () => selectResourceRef.current?.(resource.id));
        resourceMarkers.current.set(resource.id, marker);
      }
      marker
        .setLatLng(resource.location)
        .setIcon(icon(L, resourceSvg(resource, resource.id === selectedResourceId), 28))
        .setTooltipContent(`${resource.id} · ${resource.status}`);
    }
    for (const [id, marker] of resourceMarkers.current) {
      if (seen.has(id)) continue;
      marker.remove();
      resourceMarkers.current.delete(id);
    }
  }, [ready, resources, selectedResourceId]);

  // Area Intelligence overlay: origin, projected run, impact circle, fire lines, routes.
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!ready || !map || !L) return;
    spreadLayer.current ??= L.layerGroup().addTo(map);
    const group = spreadLayer.current;
    group.clearLayers();
    if (!spread) return;
    const add = <T extends LLayer>(layer: T) => {
      group.addLayer(layer);
      return layer;
    };
    add(
      L.circle(spread.impactCenter, {
        radius: spread.impactRadiusKm * 1000,
        color: "#e3452f",
        fillColor: "#e3452f",
        fillOpacity: 0.15,
        weight: 1,
        interactive: false,
      }),
    );
    add(
      L.polyline([spread.origin, spread.head], {
        color: "#e3452f",
        weight: 4,
        dashArray: "2 8",
        interactive: false,
      }),
    );
    for (const line of spread.fireLines) {
      add(
        L.polyline([line.station, line.position], {
          color: "#2f7fd4",
          weight: 2,
          opacity: 0.8,
          dashArray: "6 6",
          interactive: false,
        }),
      );
      add(
        L.marker(line.position, {
          icon: icon(L, fireLineSvg(line.id === "anchor"), 26),
          zIndexOffset: 800,
        }).bindTooltip(`${line.name} · ${line.position.lat}, ${line.position.lng}`),
      );
    }
    add(
      L.marker(spread.origin, { icon: icon(L, originSvg(), 34), zIndexOffset: 900 }).bindTooltip(
        `Fire origin · spreading ${spread.headingLabel}`,
      ),
    );
    map.fitBounds([spread.origin, spread.head, ...spread.fireLines.map((l) => l.position)], {
      padding: [50, 50],
      maxZoom: 14,
    });
  }, [ready, spread]);

  // Dispatch route.
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!ready || !map || !L) return;
    const sensor = sensors.find((s) => s.id === selectedId) ?? null;
    const path = routePolyline
      ? decodePolyline(routePolyline)
      : sensor && dispatchStation
        ? [dispatchStation, sensor].map((p) => ({ lat: p.lat, lng: p.lng }))
        : [];
    if (!path.length) {
      routeLine.current?.remove();
      routeLine.current = null;
      return;
    }
    routeLine.current ??= L.polyline(path, { interactive: false }).addTo(map);
    routeLine.current.setLatLngs(path).setStyle({
      color: "#2f7fd4",
      weight: 4,
      opacity: 0.95,
      dashArray: routePolyline ? null : "6 8",
    });
  }, [ready, routePolyline, dispatchStation, selectedId, sensors]);

  useEffect(() => {
    const sensor = sensors.find((s) => s.id === selectedId);
    if (sensor) mapRef.current?.panTo({ lat: sensor.lat, lng: sensor.lng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, ready]);

  useEffect(() => {
    const resource = resources.find((r) => r.id === selectedResourceId);
    if (resource) mapRef.current?.panTo(resource.location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResourceId, ready]);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Map tiles need an internet connection. Sensor data is still live in the lists.
      </div>
    );
  }
  return (
    <div
      ref={containerRef}
      className="relative z-0 h-full w-full"
      aria-label="Live topography map (OpenTopoMap)"
    />
  );
}

function originSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
    <circle cx="17" cy="17" r="15" fill="#e3452f" fill-opacity="0.25"/>
    <path d="M17 6c2 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-6 0 2 1 3 2 3 0-3-1-5 1-8z" fill="#e3452f" stroke="#12100e" stroke-width="1.2"/>
  </svg>`;
}

function fireLineSvg(anchor: boolean) {
  const color = anchor ? "#3ec7a1" : "#f2c14b";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
    <rect x="4" y="4" width="18" height="18" rx="9" fill="${color}" stroke="#12100e" stroke-width="1.5"/>
    <path d="M8 13h10" stroke="#12100e" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;
}
