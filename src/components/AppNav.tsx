import { Link } from "@tanstack/react-router";
import { BellRing, Cpu, LayoutDashboard, Radar, ScrollText, Truck } from "lucide-react";
import { useMemo } from "react";
import { useFieldData } from "@/lib/field-data";
import { evaluateAlerts } from "@/lib/sensors";

const ITEMS = [
  { to: "/", label: "Console", icon: LayoutDashboard },
  { to: "/alerts", label: "Alerts", icon: BellRing },
  { to: "/intel", label: "Area Intel", icon: Radar },
  { to: "/resources", label: "Resources", icon: Truck },
  { to: "/readings", label: "Readings", icon: ScrollText },
  { to: "/devices", label: "Devices", icon: Cpu },
] as const;

const base =
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-xs tracking-[0.14em] uppercase transition-colors";

/** Shared top navigation for every WildGuard module. */
export function AppNav() {
  const { sensors, liveSensors } = useFieldData();
  const alertCount = useMemo(() => evaluateAlerts(sensors).length, [sensors]);
  const liveOnline = liveSensors.filter((s) => s.online).length;

  return (
    <nav className="mt-4 flex flex-wrap gap-2" aria-label="WildGuard modules">
      {ITEMS.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact: true }}
          className={base}
          inactiveProps={{
            className: "border border-border text-muted-foreground hover:text-foreground",
          }}
          activeProps={{ className: "border border-primary bg-primary text-primary-foreground" }}
        >
          <Icon className="size-3" aria-hidden />
          {label}
          {to === "/alerts" && alertCount > 0 && (
            <span className="rounded-full bg-risk-extreme px-1.5 font-mono text-[0.65rem] text-background">
              {alertCount}
            </span>
          )}
          {to === "/devices" && liveOnline > 0 && (
            <span className="rounded-full bg-risk-low px-1.5 font-mono text-[0.65rem] text-background">
              {liveOnline} live
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
