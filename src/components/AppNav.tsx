import { Link, useNavigate } from "@tanstack/react-router";
import {
  BellRing,
  Cpu,
  Home,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Radar,
  ScrollText,
  Truck,
} from "lucide-react";
import { useMemo } from "react";
import { ROLE_LABEL, useAuth } from "@/lib/demo-auth";
import { useFieldData } from "@/lib/field-data";
import { evaluateAlerts } from "@/lib/sensors";

const FIREFIGHTER_ITEMS = [
  { to: "/console", label: "Console", icon: LayoutDashboard },
  { to: "/alerts", label: "Alerts", icon: BellRing },
  { to: "/intel", label: "Area Intel", icon: Radar },
  { to: "/resources", label: "Resources", icon: Truck },
  { to: "/readings", label: "Readings", icon: ScrollText },
  { to: "/devices", label: "Devices", icon: Cpu },
] as const;

const CITIZEN_ITEMS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/community", label: "My area", icon: MapPinned },
] as const;

const base =
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-xs tracking-[0.14em] uppercase transition-colors";

/** Shared top navigation; shows the modules the signed-in role can use. */
export function AppNav() {
  const { sensors, liveSensors } = useFieldData();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const alertCount = useMemo(() => evaluateAlerts(sensors).length, [sensors]);
  const liveOnline = liveSensors.filter((s) => s.online).length;
  const items = user?.role === "citizen" ? CITIZEN_ITEMS : FIREFIGHTER_ITEMS;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <nav className="flex flex-wrap gap-2" aria-label="WildGuard modules">
        {items.map(({ to, label, icon: Icon }) => (
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
      {user && (
        <span className="ml-1 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          <span className="text-foreground">{user.name}</span>
          <span className="font-display tracking-[0.14em] uppercase">{ROLE_LABEL[user.role]}</span>
          <button
            type="button"
            onClick={async () => {
              // Leave the protected page first so the guard doesn't bounce to sign-in.
              await navigate({ to: "/" });
              signOut();
            }}
            className="inline-flex items-center gap-1 hover:text-foreground"
            aria-label="Sign out"
          >
            <LogOut className="size-3" aria-hidden /> Sign out
          </button>
        </span>
      )}
    </div>
  );
}
