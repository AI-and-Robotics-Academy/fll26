import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type UnitSystem = "imperial" | "metric";

const STORAGE_KEY = "wildguard.units";

interface UnitsContextValue {
  system: UnitSystem;
  setSystem: (s: UnitSystem) => void;
  isMetric: boolean;
}

const UnitsContext = createContext<UnitsContextValue>({
  system: "imperial",
  setSystem: () => {},
  isMetric: false,
});

export function UnitsProvider({ children }: { children: ReactNode }) {
  // Start imperial on both server and client, then adopt the stored choice
  // after hydration to avoid SSR text mismatches.
  const [system, setSystemState] = useState<UnitSystem>("imperial");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "metric" || stored === "imperial") setSystemState(stored);
  }, []);

  const setSystem = useCallback((s: UnitSystem) => {
    setSystemState(s);
    try {
      window.localStorage.setItem(STORAGE_KEY, s);
    } catch {
      /* storage unavailable — session-only preference */
    }
  }, []);

  const value = useMemo(
    () => ({ system, setSystem, isMetric: system === "metric" }),
    [system, setSystem],
  );

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits() {
  return useContext(UnitsContext);
}

// --- pure conversions / formatters (display only) ---------------------------

export const fToC = (f: number) => ((f - 32) * 5) / 9;
export const fRateToC = (f: number) => (f * 5) / 9;
export const mToFt = (m: number) => m * 3.28084;
export const kmToMi = (km: number) => km * 0.621371;

export const tempUnit = (s: UnitSystem) => (s === "metric" ? "°C" : "°F");
export const rateUnit = (s: UnitSystem) => (s === "metric" ? "°C/h" : "°F/h");
export const distanceUnit = (s: UnitSystem) => (s === "metric" ? "km" : "mi");
export const elevationUnit = (s: UnitSystem) => (s === "metric" ? "m" : "ft");

export const tempValue = (f: number, s: UnitSystem) => (s === "metric" ? fToC(f) : f);
export const rateValue = (f: number, s: UnitSystem) => (s === "metric" ? fRateToC(f) : f);

export const formatTemp = (f: number, s: UnitSystem, digits = 1) =>
  `${tempValue(f, s).toFixed(digits)}${tempUnit(s)}`;

export const formatRate = (f: number, s: UnitSystem, digits = 1) => {
  const v = rateValue(f, s);
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}${s === "metric" ? "°C" : "°F"}/h`;
};

/** Distance from kilometres into the active system. */
export const formatDistanceFromKm = (km: number, s: UnitSystem, digits = 1) =>
  `${(s === "metric" ? km : kmToMi(km)).toFixed(digits)} ${distanceUnit(s)}`;

export const formatElevation = (m: number, s: UnitSystem) =>
  `${Math.round(s === "metric" ? m : mToFt(m))} ${elevationUnit(s)}`;

export const windUnit = (s: UnitSystem) => (s === "metric" ? "km/h" : "mph");
export const windValue = (mph: number, s: UnitSystem) => (s === "metric" ? mph * 1.609344 : mph);

/** Wind speed in the active system, e.g. "14 mph". */
export const formatWind = (mph: number, s: UnitSystem) =>
  `${Math.round(windValue(mph, s))} ${windUnit(s)}`;

/** "42%" or "—" when the sensor doesn't measure it. */
export const formatPct = (v: number | undefined) => (v === undefined ? "—" : `${Math.round(v)}%`);
