import { clearAuthToken, getAuthToken } from './authStorage';

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * fetch() with Bearer token. On 401 (except the login page), clears token and redirects to login.
 * Aborts after `timeoutMs` (default 20s) so the app never hangs on a stuck API.
 */
export async function apiFetch(
  input: string | Request,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { timeoutMs: _omit, ...restInit } = init ?? {};
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(restInit?.headers);
  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  try {
    const res = await fetch(input, { ...restInit, headers, signal: controller.signal });
    if (res.status === 401) {
      const path = window.location.pathname;
      if (!path.startsWith('/login')) {
        clearAuthToken();
        window.location.assign('/login');
      }
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}
