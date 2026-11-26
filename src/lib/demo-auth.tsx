// DEMO-ONLY sign-in for the FLL presentation.
//
// Accounts live in this browser's localStorage — no server, no email, no
// real security. Passwords are hashed so they aren't stored as plain text,
// but anyone with the laptop can read or reset them. Do not reuse real
// passwords here. (Smarna's original Supabase sign-in is not used.)

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Role = "firefighter" | "citizen";

export interface DemoUser {
  id: string;
  role: Role;
  name: string;
  email: string;
  /** Town the user lives in / is based at (a key of PLACES). */
  homePlace: string;
  /** Firefighters only. */
  badgeId?: string;
  station?: string;
}

interface StoredUser extends DemoUser {
  passwordHash: string;
}

export const ROLE_LABEL: Record<Role, string> = {
  firefighter: "Firefighter",
  citizen: "Citizen",
};

/** Where each role lands after signing in. */
export const ROLE_HOME: Record<Role, "/console" | "/community"> = {
  firefighter: "/console",
  citizen: "/community",
};

/** Pre-made accounts so judges can try both views in one click. */
export const DEMO_ACCOUNTS: Record<Role, { email: string; password: string }> = {
  firefighter: { email: "firefighter@wildguard.demo", password: "firefighter" },
  citizen: { email: "citizen@wildguard.demo", password: "citizen" },
};

const USERS_KEY = "wildguard.demo.users";
const SESSION_KEY = "wildguard.demo.session";

/** Small, dependency-free string hash (FNV-1a, 2 rounds). Demo only. */
function hashPassword(email: string, password: string): string {
  let out = "";
  for (const seed of [0x811c9dc5, 0x01000193]) {
    let h = seed;
    for (const ch of `${email.toLowerCase()}:${password}`) {
      h ^= (ch.codePointAt(0) ?? 0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += h.toString(16).padStart(8, "0");
  }
  return out;
}

const SEED: StoredUser[] = [
  {
    id: "demo-ff",
    role: "firefighter",
    name: "Captain Rivera",
    email: DEMO_ACCOUNTS.firefighter.email,
    homePlace: "Bellevue",
    badgeId: "BFD-2417",
    station: "Bellevue Fire Station 1",
    passwordHash: hashPassword(DEMO_ACCOUNTS.firefighter.email, DEMO_ACCOUNTS.firefighter.password),
  },
  {
    id: "demo-citizen",
    role: "citizen",
    name: "Jordan Lee",
    email: DEMO_ACCOUNTS.citizen.email,
    homePlace: "Issaquah",
    passwordHash: hashPassword(DEMO_ACCOUNTS.citizen.email, DEMO_ACCOUNTS.citizen.password),
  },
];

function readUsers(): StoredUser[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(USERS_KEY) ?? "null") as unknown;
    if (Array.isArray(parsed)) {
      // Make sure the demo accounts always exist, even after a reset.
      const users = parsed as StoredUser[];
      for (const seed of SEED) {
        if (!users.some((u) => u.email === seed.email)) users.push(seed);
      }
      return users;
    }
  } catch {
    /* corrupted storage — fall back to seeds */
  }
  return [...SEED];
}

function writeUsers(users: StoredUser[]) {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

const publicUser = ({ passwordHash: _hash, ...user }: StoredUser): DemoUser => user;

export interface SignUpInput {
  role: Role;
  name: string;
  email: string;
  password: string;
  homePlace: string;
  badgeId?: string;
  station?: string;
}

interface AuthValue {
  /** False until the browser has read storage — don't redirect before this. */
  ready: boolean;
  user: DemoUser | null;
  signIn: (email: string, password: string) => DemoUser;
  signUp: (input: SignUpInput) => DemoUser;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<DemoUser | null>(null);

  useEffect(() => {
    const users = readUsers();
    writeUsers(users);
    const sessionId = window.localStorage.getItem(SESSION_KEY);
    const found = users.find((u) => u.id === sessionId);
    setUser(found ? publicUser(found) : null);
    setReady(true);
  }, []);

  const start = useCallback((stored: StoredUser) => {
    window.localStorage.setItem(SESSION_KEY, stored.id);
    const u = publicUser(stored);
    setUser(u);
    return u;
  }, []);

  const signIn = useCallback(
    (email: string, password: string) => {
      const users = readUsers();
      const found = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!found || found.passwordHash !== hashPassword(found.email, password)) {
        throw new Error("Email or password is incorrect.");
      }
      return start(found);
    },
    [start],
  );

  const signUp = useCallback(
    (input: SignUpInput) => {
      const email = input.email.trim().toLowerCase();
      const name = input.name.trim();
      if (!name) throw new Error("Enter your name.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email.");
      if (input.password.length < 6) throw new Error("Password must be at least 6 characters.");
      if (input.role === "firefighter" && !input.badgeId?.trim()) {
        throw new Error("Firefighters need a badge or employee ID.");
      }
      const users = readUsers();
      if (users.some((u) => u.email === email)) {
        throw new Error("An account with that email already exists. Sign in instead.");
      }
      const stored: StoredUser = {
        id: `u-${Date.now().toString(36)}`,
        role: input.role,
        name: name.slice(0, 60),
        email,
        homePlace: input.homePlace,
        ...(input.role === "firefighter"
          ? {
              badgeId: (input.badgeId ?? "").trim().slice(0, 20),
              station: (input.station ?? "").trim().slice(0, 60),
            }
          : {}),
        passwordHash: hashPassword(email, input.password),
      };
      writeUsers([...users, stored]);
      return start(stored);
    },
    [start],
  );

  const signOut = useCallback(() => {
    window.localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ ready, user, signIn, signUp, signOut }),
    [ready, user, signIn, signUp, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <DemoAuthProvider>");
  return ctx;
}
