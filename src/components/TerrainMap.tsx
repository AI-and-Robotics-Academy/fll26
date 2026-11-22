/// <reference types="google.maps" />
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { FIRE_STATIONS, assessRisk } from "@/lib/sensors";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  resourceSvg,
  sensorColor,
  sensorRadiusMeters,
  sensorSvg,
  stationSvg,
  svgUrl,
  type MapProps,
} from "@/components/map-shared";

const LeafletMap = lazy(() => import("@/components/LeafletMap"));

declare global {
  interface Window {
    google?: typeof google;
    __wildguardMapReady?: () => void;
    gm_authFailure?: () => void;
  }
}

const SCRIPT_ID = "wildguard-google-maps";

interface MapsLibs {
  maps: google.maps.MapsLibrary;
  core: google.maps.CoreLibrary;
  marker: google.maps.MarkerLibrary;
  geometry: google.maps.GeometryLibrary;
}

let libsPromise: Promise<MapsLibs> | null = null;

/** Loads the JS API and resolves the concrete library constructors. */
function loadMapsApi(): Promise<MapsLibs> {
  libsPromise ??= (async () => {
    await loadScript();
    const g = window.google!;
    const [maps, core, marker, geometry] = await Promise.all([
      g.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
      g.maps.importLibrary("core") as Promise<google.maps.CoreLibrary>,
      g.maps.importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
      g.maps.importLibrary("geometry") as Promise<google.maps.GeometryLibrary>,
    ]);
    return { maps, core, marker, geometry };
  })();
  return libsPromise;
}

function loadScript(): Promise<void> {
  if (window.google?.maps) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("maps load failed")));
      return;
    }
    const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"];
    const channel = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"];
    if (!key || import.meta.env["VITE_WILDGUARD_MAP"] === "osm") {
      reject(new Error("Google Maps browser key is not configured"));
      return;
    }
    window.__wildguardMapReady = () => resolve();
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__wildguardMapReady${
      channel ? `&channel=${channel}` : ""
    }`;
    script.onerror = () => reject(new Error("maps load failed"));
    document.head.appendChild(script);
  });
}

const GOOGLE_TIMEOUT_MS = 10000;

function icon(libs: MapsLibs, svg: string, size: number) {
  return {
    url: svgUrl(svg),
    scaledSize: new libs.core.Size(size, size),
    anchor: new libs.core.Point(size / 2, size / 2),
  };
}

/**
 * Live topography map. Uses Google Maps terrain when the browser key works;
 * if the key is missing, rejected (e.g. referrer-restricted on a laptop at
 * the venue) or too slow, it switches to the keyless OpenTopoMap engine.
 */
export default function TerrainMap(props: MapProps) {
  const [fallback, setFallback] = useState(false);
  if (fallback) {
    return (
      <Suspense fallback={null}>
        <LeafletMap {...props} />
      </Suspense>
    );
  }
  return <GoogleTerrainMap {...props} onFail={() => setFallback(true)} />;
}

function GoogleTerrainMap({
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
  onFail,
}: MapProps & { onFail: () => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const libsRef = useRef<MapsLibs | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const circlesRef = useRef<Map<string, google.maps.Circle>>(new Map());
  const stationMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const resourceMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const routeLineRef = useRef<google.maps.Polyline | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const selectResourceRef = useRef(onSelectResource);
  selectResourceRef.current = onSelectResource;
  const failRef = useRef(onFail);
  failRef.current = onFail;
  const fitRef = useRef(fitTo);
  fitRef.current = fitTo;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loaded = false;
    const fail = () => {
      if (!cancelled && !loaded) failRef.current();
    };
    // Google calls this global when the key is invalid or referrer-blocked.
    window.gm_authFailure = () => {
      if (!cancelled) failRef.current();
    };
    const timer = window.setTimeout(fail, GOOGLE_TIMEOUT_MS);
    loadMapsApi()
      .then((libs) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        loaded = true;
        window.clearTimeout(timer);
        libsRef.current = libs;
        const map = new libs.maps.Map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          mapTypeId: "terrain",
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: true,
          mapTypeControlOptions: {
            mapTypeIds: ["terrain", "satellite", "hybrid"],
          },
        });
        const points = fitRef.current;
        if (points && points.length) {
          const bounds = new libs.core.LatLngBounds();
          points.forEach((p) => bounds.extend(p));
          map.fitBounds(bounds, 40);
        }
        mapRef.current = map;
        setReady(true);
      })
      .catch((err) => {
        console.warn("Google Maps unavailable — using OpenTopoMap", err);
        window.clearTimeout(timer);
        fail();
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!ready || !map || !libs) return;

    const seen = new Set<string>();
    for (const sensor of sensors) {
      seen.add(sensor.id);
      const heat = layer === "heat";
      const color = sensorColor(sensor, layer);
      const active = sensor.id === selectedId;
      const position = { lat: sensor.lat, lng: sensor.lng };

      let marker = markersRef.current.get(sensor.id);
      if (!marker) {
        marker = new libs.marker.Marker({ position, map, title: `${sensor.id} · ${sensor.name}` });
        marker.addListener("click", () => selectRef.current(sensor.id));
        markersRef.current.set(sensor.id, marker);
      }
      marker.setPosition(position);
      marker.setIcon(icon(libs, sensorSvg(color, active, sensor.source === "live"), 34));
      marker.setZIndex(
        active ? 999 : Math.round(heat ? sensor.temperatureF : assessRisk(sensor).score),
      );

      let circle = circlesRef.current.get(sensor.id);
      if (!circle) {
        circle = new libs.maps.Circle({
          map,
          center: position,
          strokeWeight: 1,
          strokeOpacity: 0.5,
          clickable: false,
        });
        circlesRef.current.set(sensor.id, circle);
      }
      circle.setOptions({
        center: position,
        radius: sensorRadiusMeters(sensor, layer),
        strokeColor: color,
        fillColor: color,
        fillOpacity: heat ? (sensor.online ? 0.3 : 0.1) : 0.16,
      });
    }

    // Drop nodes that left the feed (demo mesh switched off, Pi removed).
    for (const [id, marker] of markersRef.current) {
      if (seen.has(id)) continue;
      marker.setMap(null);
      markersRef.current.delete(id);
      circlesRef.current.get(id)?.setMap(null);
      circlesRef.current.delete(id);
    }
  }, [sensors, selectedId, ready, layer]);

  // Fire station markers.
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!ready || !map || !libs) return;
    for (const station of FIRE_STATIONS) {
      let marker = stationMarkersRef.current.get(station.id);
      if (!marker) {
        marker = new libs.marker.Marker({
          position: { lat: station.lat, lng: station.lng },
          map,
          title: `${station.name} · ${station.city}`,
          zIndex: 500,
        });
        stationMarkersRef.current.set(station.id, marker);
      }
      marker.setMap(showStations ? map : null);
      marker.setIcon(icon(libs, stationSvg(station.id === dispatchStation?.id), 30));
    }
  }, [ready, showStations, dispatchStation]);

  // Resource markers (Shivi's tracker).
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!ready || !map || !libs) return;
    const seen = new Set<string>();
    for (const resource of resources) {
      seen.add(resource.id);
      let marker = resourceMarkersRef.current.get(resource.id);
      if (!marker) {
        marker = new libs.marker.Marker({ map, title: resource.id, zIndex: 600 });
        marker.addListener("click", () => selectResourceRef.current?.(resource.id));
        resourceMarkersRef.current.set(resource.id, marker);
      }
      marker.setPosition(resource.location);
      marker.setTitle(`${resource.id} · ${resource.status}`);
      marker.setIcon(icon(libs, resourceSvg(resource, resource.id === selectedResourceId), 28));
    }
    for (const [id, marker] of resourceMarkersRef.current) {
      if (seen.has(id)) continue;
      marker.setMap(null);
      resourceMarkersRef.current.delete(id);
    }
  }, [ready, resources, selectedResourceId]);

  // Dispatch route line: real road path when available, straight line otherwise.
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!ready || !map || !libs) return;
    const sensor = sensors.find((s) => s.id === selectedId) ?? null;

    let path: google.maps.LatLngLiteral[] = [];
    if (routePolyline) {
      path = libs.geometry.encoding
        .decodePath(routePolyline)
        .map((p) => ({ lat: p.lat(), lng: p.lng() }));
    } else if (sensor && dispatchStation) {
      path = [
        { lat: dispatchStation.lat, lng: dispatchStation.lng },
        { lat: sensor.lat, lng: sensor.lng },
      ];
    }

    if (path.length === 0) {
      routeLineRef.current?.setMap(null);
      return;
    }
    if (!routeLineRef.current) {
      routeLineRef.current = new libs.maps.Polyline({ clickable: false, zIndex: 400 });
    }
    routeLineRef.current.setOptions({
      map,
      path,
      strokeColor: "#2f7fd4",
      strokeOpacity: routePolyline ? 0.95 : 0,
      strokeWeight: 4,
      icons: routePolyline
        ? null
        : [
            {
              icon: { path: "M 0,-1 0,1", strokeOpacity: 0.9, scale: 3 },
              offset: "0",
              repeat: "14px",
            },
          ],
    });
  }, [ready, routePolyline, dispatchStation, selectedId, sensors]);

  useEffect(() => {
    const map = mapRef.current;
    const sensor = sensors.find((s) => s.id === selectedId);
    if (map && sensor) map.panTo({ lat: sensor.lat, lng: sensor.lng });
    // Pan only when the selection changes, not on every telemetry tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const resource = resources.find((r) => r.id === selectedResourceId);
    if (map && resource) map.panTo(resource.location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResourceId, ready]);

  return <div ref={containerRef} className="h-full w-full" aria-label="Live topography map" />;
}
