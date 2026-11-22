// One shared, app-wide feed so every page (console, alerts, resources,
// devices, FireWatch AI) sees the same sensors and resources.
//
// Sensors = simulated Washington mesh (Smarna's WildGuard console)
//         + live Raspberry Pi nodes polled from /api/devices (Luke).
// Resources = Shivi's emergency asset tracker with its 10-second live simulation.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import resourcesSeed from "@/data/resources.json";
import { distanceKm, generateReadings, type SensorReading } from "@/lib/sensors";

const SENSOR_POLL_MS = 5000;
const RESOURCE_TICK_MS = 10000;
const DEMO_MESH_KEY = "wildguard.demoMesh";

// ---------------------------------------------------------------------------
// Resources (Shivi)
// ---------------------------------------------------------------------------

export const RESOURCE_STATUSES = [
  "Available",
  "In Use",
  "Low Supply",
  "Needs Maintenance",
  "Offline",
] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export interface Resource {
  id: string;
  type: string;
  location: { lat: number; lng: number };
  status: ResourceStatus;
  capacity: Record<string, number>;
  lastUpdated: string;
}

export const RESOURCE_STATUS_HEX: Record<ResourceStatus, string> = {
  Available: "#3ec7a1",
  "In Use": "#f2842b",
  "Low Supply": "#f2c14b",
  "Needs Maintenance": "#b48a4a",
  Offline: "#7a736c",
};

export const resourceLabel = (value: string) => value.replace(/_/g, " ");

function randomizeResource(resource: Resource): Resource {
  const clone = structuredClone(resource);
  if (Math.random() > 0.5) {
    clone.location.lat = Number((clone.location.lat + (Math.random() - 0.5) * 0.012).toFixed(6));
    clone.location.lng = Number((clone.location.lng + (Math.random() - 0.5) * 0.012).toFixed(6));
  } else {
    clone.status = RESOURCE_STATUSES[Math.floor(Math.random() * RESOURCE_STATUSES.length)]!;
  }
  clone.lastUpdated = new Date().toISOString();
  return clone;
}

/** Closest resources to a point that are ready to deploy. */
export function nearestAvailableResources(
  point: { lat: number; lng: number },
  resources: Resource[],
  limit = 3,
) {
  return resources
    .filter((r) => r.status === "Available" || r.status === "Low Supply")
    .map((r) => ({ resource: r, km: distanceKm(point, r.location) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface FieldData {
  sensors: SensorReading[];
  liveSensors: SensorReading[];
  resources: Resource[];
  updatedAt: string;
  /** Whether the simulated statewide mesh is shown alongside live Pi nodes. */
  demoMesh: boolean;
  setDemoMesh: (on: boolean) => void;
  liveError: boolean;
  refreshLive: () => Promise<void>;
}

const FieldDataContext = createContext<FieldData | null>(null);

export function FieldDataProvider({ children }: { children: ReactNode }) {
  const [simSensors, setSimSensors] = useState<SensorReading[]>([]);
  const [liveSensors, setLiveSensors] = useState<SensorReading[]>([]);
  const [liveError, setLiveError] = useState(false);
  const [resources, setResources] = useState<Resource[]>(resourcesSeed as Resource[]);
  const [updatedAt, setUpdatedAt] = useState("");
  const [demoMesh, setDemoMeshState] = useState(true);

  useEffect(() => {
    if (window.localStorage.getItem(DEMO_MESH_KEY) === "off") setDemoMeshState(false);
  }, []);

  const setDemoMesh = useCallback((on: boolean) => {
    setDemoMeshState(on);
    try {
      window.localStorage.setItem(DEMO_MESH_KEY, on ? "on" : "off");
    } catch {
      /* storage unavailable — keep in memory only */
    }
  }, []);

  const refreshLive = useCallback(async () => {
    try {
      const response = await fetch("/api/devices", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      setLiveSensors((await response.json()) as SensorReading[]);
      setLiveError(false);
    } catch {
      setLiveError(true);
    }
  }, []);

  // Sensors: regenerate the simulated mesh and poll live Pi nodes together.
  useEffect(() => {
    const tick = () => {
      setSimSensors(generateReadings());
      void refreshLive();
      setUpdatedAt(new Date().toLocaleTimeString());
    };
    tick();
    const id = window.setInterval(tick, SENSOR_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshLive]);

  // Resources: Shivi's live simulation — one asset moves or changes status every 10s.
  useEffect(() => {
    const id = window.setInterval(() => {
      setResources((prev) => {
        if (!prev.length) return prev;
        const copy = [...prev];
        const index = Math.floor(Math.random() * copy.length);
        copy[index] = randomizeResource(copy[index]!);
        return copy;
      });
    }, RESOURCE_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const sensors = useMemo(() => {
    const liveIds = new Set(liveSensors.map((s) => s.id));
    const sim = demoMesh ? simSensors.filter((s) => !liveIds.has(s.id)) : [];
    return [...liveSensors, ...sim];
  }, [simSensors, liveSensors, demoMesh]);

  const value = useMemo<FieldData>(
    () => ({
      sensors,
      liveSensors,
      resources,
      updatedAt,
      demoMesh,
      setDemoMesh,
      liveError,
      refreshLive,
    }),
    [sensors, liveSensors, resources, updatedAt, demoMesh, setDemoMesh, liveError, refreshLive],
  );

  return <FieldDataContext.Provider value={value}>{children}</FieldDataContext.Provider>;
}

export function useFieldData(): FieldData {
  const ctx = useContext(FieldDataContext);
  if (!ctx) throw new Error("useFieldData must be used inside <FieldDataProvider>");
  return ctx;
}

/** Header eyebrow text describing where the data comes from right now. */
export function feedLabel(live: number, demoMesh: boolean) {
  if (live && demoMesh) return `${live} live Pi node${live === 1 ? "" : "s"} + simulated mesh`;
  if (live) return `${live} live Pi node${live === 1 ? "" : "s"}`;
  return demoMesh ? "Simulated feed" : "Waiting for Raspberry Pi telemetry";
}
