import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Eye, EyeOff, Flame, House, LoaderCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEMO_ACCOUNTS,
  ROLE_HOME,
  ROLE_LABEL,
  useAuth,
  type DemoUser,
  type Role,
} from "@/lib/demo-auth";
import { PLACES } from "@/lib/public-info";
import { FIRE_STATIONS } from "@/lib/sensors";

type Mode = "signin" | "signup";

interface AuthSearch {
  mode?: Mode;
  role?: Role;
  next?: string;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    ...(search["mode"] === "signup" || search["mode"] === "signin"
      ? { mode: search["mode"] as Mode }
      : {}),
    ...(search["role"] === "firefighter" || search["role"] === "citizen"
      ? { role: search["role"] as Role }
      : {}),
    ...(typeof search["next"] === "string" && search["next"].startsWith("/")
      ? { next: search["next"] }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: "Sign In | WildGuard" },
      {
        name: "description",
        content: "Sign in or create a WildGuard account for firefighters and citizens.",
      },
      { property: "og:title", content: "Sign In | WildGuard" },
      { property: "og:description", content: "Sign in or create a WildGuard account for firefighters and citizens." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const FIREFIGHTER_PAGES = ["/console", "/alerts", "/intel", "/resources", "/readings", "/devices"];

/** Send the user back where they were going, if their role may see it. */
function destination(user: DemoUser, next?: string) {
  if (next) {
    const ffPage = FIREFIGHTER_PAGES.some((p) => next.startsWith(p));
    if (user.role === "firefighter" || !ffPage) return next;
  }
  return ROLE_HOME[user.role];
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { ready, user, signIn, signUp, signOut } = useAuth();
  const [mode, setMode] = useState<Mode>(search.mode ?? "signin");
  const [role, setRole] = useState<Role>(search.role ?? "citizen");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    homePlace: "Bellevue",
    badgeId: "",
    station: FIRE_STATIONS.find((s) => s.city === "Bellevue")?.name ?? FIRE_STATIONS[0]?.name ?? "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(u: DemoUser) {
    await navigate({ to: destination(u, search.next) });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u =
        mode === "signin"
          ? signIn(form.email, form.password)
          : signUp({
              role,
              name: form.name,
              email: form.email,
              password: form.password,
              homePlace: form.homePlace,
              ...(role === "firefighter" ? { badgeId: form.badgeId, station: form.station } : {}),
            });
      await go(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  async function signInDemo(r: Role) {
    setError(null);
    try {
      await go(signIn(DEMO_ACCOUNTS[r].email, DEMO_ACCOUNTS[r].password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo sign-in failed.");
    }
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <main className="terrain-grid relative min-h-screen overflow-hidden bg-background px-4 py-8 sm:px-6 lg:py-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-primary/60" />
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <header className="mb-7 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full border border-primary/50 bg-primary/10 shadow-ember">
            <Flame className="size-7 text-primary" aria-hidden />
          </div>
          <h1 className="font-display text-5xl leading-none font-semibold text-foreground">
            WildGuard
          </h1>
          <p className="mt-3 font-mono text-[0.64rem] font-medium tracking-[0.16em] text-primary uppercase sm:text-xs">
            Wildfire prevention • Early detection • Smart response
          </p>
        </header>

        {ready && user ? (
          <section className="rounded-lg border border-border bg-surface/95 p-6 text-center shadow-panel">
            <p className="text-sm text-muted-foreground">You're signed in as</p>
            <p className="mt-1 text-xl">
              {user.name} · {ROLE_LABEL[user.role]}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button type="button" onClick={() => go(user)}>
                Continue
              </Button>
              <Button type="button" variant="outline" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </section>
        ) : (
          <section
            className="rounded-lg border border-border bg-surface/95 p-5 shadow-panel backdrop-blur-sm sm:p-7"
            aria-labelledby="auth-heading"
          >
            <div className="mb-5">
              <p className="label-eyebrow flex items-center gap-2">
                <Shield className="size-3.5 text-accent" aria-hidden /> Demo accounts · stored in
                this browser only
              </p>
              <h2 id="auth-heading" className="mt-2 text-3xl font-semibold text-foreground">
                {mode === "signin" ? "Sign in" : "Create account"}
              </h2>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="I am a">
              <RoleButton
                active={role === "firefighter"}
                onClick={() => setRole("firefighter")}
                icon={<Flame className="size-4" aria-hidden />}
                title="Firefighter"
                note="Command center"
              />
              <RoleButton
                active={role === "citizen"}
                onClick={() => setRole("citizen")}
                icon={<House className="size-4" aria-hidden />}
                title="Citizen"
                note="My area & alerts"
              />
            </div>

            <form className="space-y-4" onSubmit={submit}>
              {mode === "signup" && (
                <Field label="Full name">
                  <Input
                    value={form.name}
                    onChange={set("name")}
                    autoComplete="name"
                    required
                    maxLength={60}
                    placeholder={role === "firefighter" ? "Captain Alex Rivera" : "Jordan Lee"}
                    className="h-11 bg-auth-field"
                  />
                </Field>
              )}
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  autoComplete="email"
                  required
                  placeholder={role === "firefighter" ? "crew@department.gov" : "you@example.com"}
                  className="h-11 bg-auth-field"
                />
              </Field>
              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="block font-mono text-xs text-muted-foreground uppercase"
                >
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={set("password")}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    required
                    minLength={6}
                    placeholder="At least 6 characters"
                    className="h-11 bg-auth-field pr-11"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute top-1 right-1 size-9 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                  </Button>
                </div>
              </div>

              {mode === "signup" && (
                <>
                  <Field label={role === "firefighter" ? "Home base town" : "Where you live"}>
                    <select
                      value={form.homePlace}
                      onChange={set("homePlace")}
                      className="h-11 w-full rounded-md border border-input bg-auth-field px-3 text-sm"
                    >
                      {PLACES.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}, WA
                        </option>
                      ))}
                    </select>
                  </Field>
                  {role === "firefighter" && (
                    <>
                      <Field label="Badge / employee ID">
                        <Input
                          value={form.badgeId}
                          onChange={set("badgeId")}
                          required
                          maxLength={20}
                          placeholder="BFD-2417"
                          className="h-11 bg-auth-field"
                        />
                      </Field>
                      <Field label="Station">
                        <select
                          value={form.station}
                          onChange={set("station")}
                          className="h-11 w-full rounded-md border border-input bg-auth-field px-3 text-sm"
                        >
                          {FIRE_STATIONS.map((s) => (
                            <option key={s.id} value={s.name}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </>
                  )}
                </>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={busy || !ready}
                className="h-11 w-full font-display text-base tracking-[0.08em] uppercase"
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" aria-hidden />
                ) : (
                  <Flame aria-hidden />
                )}
                {mode === "signin"
                  ? `Sign in as ${ROLE_LABEL[role].toLowerCase()}`
                  : `Create ${ROLE_LABEL[role].toLowerCase()} account`}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                onClick={() => {
                  setMode((m) => (m === "signin" ? "signup" : "signin"));
                  setError(null);
                }}
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </Button>
            </p>
          </section>
        )}

        {!(ready && user) && (
          <section
            className="mt-4 rounded-lg border border-border bg-surface/70 p-4 backdrop-blur-sm"
            aria-labelledby="demo-heading"
          >
            <h2 id="demo-heading" className="label-eyebrow text-foreground">
              Quick demo access
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Ready-made accounts for judges. Firefighter: {DEMO_ACCOUNTS.firefighter.email} /{" "}
              {DEMO_ACCOUNTS.firefighter.password}. Citizen: {DEMO_ACCOUNTS.citizen.email} /{" "}
              {DEMO_ACCOUNTS.citizen.password}.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                disabled={!ready}
                onClick={() => signInDemo("firefighter")}
                className="h-10 border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
              >
                <Flame aria-hidden /> Demo firefighter
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!ready}
                onClick={() => signInDemo("citizen")}
                className="h-10 border-accent/50 bg-accent/10 text-accent hover:bg-accent/20 hover:text-accent"
              >
                <House aria-hidden /> Demo citizen
              </Button>
            </div>
          </section>
        )}

        <Link
          to="/"
          className="mx-auto mt-5 inline-flex items-center gap-1.5 font-mono text-[0.65rem] text-muted-foreground uppercase transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3" aria-hidden /> Back to public wildfire info
        </Link>
      </div>
    </main>
  );
}

function RoleButton({
  active,
  onClick,
  icon,
  title,
  note,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  note: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition-colors ${
        active
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className="flex items-center gap-2 font-display text-lg tracking-wide">
        {icon}
        {title}
      </span>
      <span className="mt-0.5 block text-xs">{note}</span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="block font-mono text-xs text-muted-foreground uppercase">{label}</span>
      {children}
    </label>
  );
}
