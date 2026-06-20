import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { api, type SessionView, type Role } from "../api";

interface AuthCtx {
  session: SessionView | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (min: Role) => boolean;
}
const RANK: Record<Role, number> = { viewer: 1, analyst: 2, manager: 3, owner: 4 };
const Ctx = createContext<AuthCtx>({ session: null, loading: true, login: async () => {}, logout: async () => {}, can: () => false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<SessionView>("/auth/me").then(setSession).catch(() => setSession(null)).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const s = await api.post<SessionView>("/auth/login", { email, password });
    setSession(s);
  }, []);
  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => {});
    setSession(null);
  }, []);
  const can = useCallback((min: Role) => !!session && RANK[session.role] >= RANK[min], [session]);

  return <Ctx.Provider value={{ session, loading, login, logout, can }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
