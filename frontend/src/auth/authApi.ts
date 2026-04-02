import { getApiBaseUrl } from '../config/llm.config';
import { apiFetch } from './http';
import { clearAuthToken, setAuthToken } from './authStorage';

export type UserRole = 'hiring_manager' | 'interviewer';

export interface AuthUser {
  id: string;
  email: string;
  /** Display name — must match at sign-in together with email. */
  name: string;
  role: UserRole;
}

async function parseJsonError(res: Response): Promise<string> {
  const t = await res.text();
  try {
    const j = JSON.parse(t) as { detail?: unknown };
    if (typeof j.detail === 'string') return j.detail;
    if (Array.isArray(j.detail)) return JSON.stringify(j.detail);
  } catch {
    /* ignore */
  }
  return t || res.statusText;
}

function mapNetworkError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof TypeError || msg === 'Failed to fetch' || msg.includes('Load failed')) {
    return new Error(
      'Could not reach the API. Check that the backend server is running and VITE_API_BASE_URL is correct.',
    );
  }
  if (e instanceof Error && e.name === 'AbortError') {
    return new Error('Request timed out.');
  }
  return e instanceof Error ? e : new Error(String(e));
}

export async function login(name: string, email: string): Promise<{ access_token: string; user: AuthUser }> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('VITE_API_BASE_URL is not set');
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email }),
  });
  if (!res.ok) throw new Error(await parseJsonError(res));
  const data = (await res.json()) as { access_token: string; user: AuthUser };
  setAuthToken(data.access_token);
  return data;
}

export async function fetchMe(): Promise<AuthUser> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('VITE_API_BASE_URL is not set');
  const res = await apiFetch(`${base}/api/v1/auth/me`);
  if (!res.ok) throw new Error('Session expired');
  return res.json() as Promise<AuthUser>;
}

export function logout(): void {
  clearAuthToken();
}

/** Hiring manager creates another user (Bearer required). */
export async function registerUser(body: {
  name: string;
  email: string;
  role: UserRole;
}): Promise<AuthUser> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('VITE_API_BASE_URL is not set');
  let res: Response;
  try {
    res = await apiFetch(`${base}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw mapNetworkError(e);
  }
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json() as Promise<AuthUser>;
}

export async function listUsers(): Promise<AuthUser[]> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('VITE_API_BASE_URL is not set');
  const res = await apiFetch(`${base}/api/v1/auth/users`);
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json() as Promise<AuthUser[]>;
}

export async function patchUser(
  userId: string,
  patch: { role?: UserRole; name?: string },
): Promise<AuthUser> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('VITE_API_BASE_URL is not set');
  const res = await apiFetch(`${base}/api/v1/auth/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json() as Promise<AuthUser>;
}
