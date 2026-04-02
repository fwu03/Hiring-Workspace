const KEY = 'hiring_auth_token';

export function getAuthToken(): string | null {
  return localStorage.getItem(KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(KEY);
}
