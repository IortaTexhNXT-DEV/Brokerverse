import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from './api';
import type { UserView } from '@brokerverse/shared';

interface AuthState { user: UserView | null; loading: boolean; login: (u: string, p: string) => Promise<void>; logout: () => void; has: (...modules: string[]) => boolean }
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children, initialUser = null }: { children: ReactNode; initialUser?: UserView | null }) {
  const [user, setUser] = useState<UserView | null>(initialUser);
  const [loading, setLoading] = useState(!initialUser && !!getToken());

  useEffect(() => {
    if (initialUser || !getToken()) return;
    api('/api/auth/me').then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setLoading(false));
  }, [initialUser]);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('bv:logout', onLogout);
    return () => window.removeEventListener('bv:logout', onLogout);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api('/api/auth/login', { method: 'POST', body: { username, password } });
    setToken(r.token); setUser(r.user);
  }, []);
  const logout = useCallback(() => { setToken(null); setUser(null); }, []);
  const has = useCallback((...modules: string[]) => !!user && modules.some((m) => user.modules.includes(m)), [user]);

  const value = useMemo(() => ({ user, loading, login, logout, has }), [user, loading, login, logout, has]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
