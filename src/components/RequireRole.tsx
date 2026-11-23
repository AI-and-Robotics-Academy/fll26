import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ROLE_HOME, ROLE_LABEL, useAuth, type Role } from "@/lib/demo-auth";

/**
 * Demo access control: shows children only to signed-in users with one of
 * `roles`. Signed-out visitors are sent to /auth and brought back after.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { ready, user } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Remember the page the visitor asked for before we redirect away from it.
  const [wanted] = useState(pathname);
  const firstRole = roles[0]!;

  useEffect(() => {
    if (ready && !user) {
      void navigate({ to: "/auth", search: { mode: "signin", role: firstRole, next: wanted } });
    }
  }, [ready, user, navigate, wanted, firstRole]);

  if (!ready || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Checking sign-in…
      </main>
    );
  }

  if (!roles.includes(user.role)) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="panel max-w-md p-6 text-center">
          <ShieldAlert className="mx-auto size-8 text-risk-high" aria-hidden />
          <h1 className="mt-3 text-2xl">{roles.map((r) => ROLE_LABEL[r]).join(" / ")} only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page has crew-only details such as exact sensor locations, crew routes and
            fire-line plans. You're signed in as a {ROLE_LABEL[user.role].toLowerCase()}.
          </p>
          <Link
            to={ROLE_HOME[user.role]}
            className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Go to my page
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
