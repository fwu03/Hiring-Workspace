import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as authApi from './authApi';
import type { AuthUser } from './authApi';
import { getAuthToken } from './authStorage';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (name: string, email: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  canManageBatches: boolean;
  canManageUsers: boolean;
  canEditInterview: boolean;
  isHiringManager: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    const t = getAuthToken();
    if (!t) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await authApi.fetchMe();
      setUser(me);
    } catch {
      setUser(null);
      authApi.logout();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const login = useCallback(async (name: string, email: string) => {
    const { user: u } = await authApi.login(name, email);
    setUser(u);
    setLoading(false);
  }, []);

  const logout = useCallback(() => {
    authApi.logout();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      logout,
      refreshAuth,
      isHiringManager: user?.role === 'hiring_manager',
      canManageBatches: user?.role === 'hiring_manager',
      canManageUsers: user?.role === 'hiring_manager',
      canEditInterview: Boolean(user),
    }),
    [user, loading, login, logout, refreshAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
