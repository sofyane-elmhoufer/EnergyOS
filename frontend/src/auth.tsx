// Session de l'utilisateur et profils (client, commercial, technicien, administrateur ; invité = sans compte).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getJSON, getToken, postJSON, setToken, UNAUTHORIZED_EVENT } from "./api";
import type { Role, User } from "./roles";

export type { Role, User } from "./roles";

type Session = { token: string; user: User };
export type RegisterInput = { email: string; name: string; password: string; phone?: string; company?: string };

type AuthState = {
  user: User | null;
  role: Role;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  setSession: (session: Session) => void;
  setUser: (user: User) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(() => !getToken());

  const setSession = useCallback((session: Session) => {
    setToken(session.token);
    setUser(session.user);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    getJSON<User>("/api/auth/me")
      .then(setUser)
      .catch(() => { setToken(null); setUser(null); })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => { setToken(null); setUser(null); };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const value = useMemo<AuthState>(() => ({
    user,
    role: user?.role ?? "guest",
    ready,
    setSession,
    setUser,
    login: async (email, password) => setSession(await postJSON<Session>("/api/auth/login", { email, password })),
    register: async (input) => setSession(await postJSON<Session>("/api/auth/register", input)),
    logout: async () => {
      try { await postJSON("/api/auth/logout", {}); } catch { /* déjà déconnecté côté serveur */ }
      setToken(null);
      setUser(null);
    },
  }), [user, ready, setSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth doit être utilisé dans <AuthProvider>.");
  return context;
}
