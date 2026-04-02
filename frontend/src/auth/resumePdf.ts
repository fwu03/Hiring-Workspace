import { getApiBaseUrl } from '../config/llm.config';
import { getAuthToken } from './authStorage';

/** Load PDF with Bearer auth and return a temporary object URL for iframes (iframes cannot send Authorization). */
export async function fetchResumePdfObjectUrl(candidateId: string): Promise<string> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('VITE_API_BASE_URL is not set');
  const token = getAuthToken();
  const res = await fetch(`${base}/api/v1/candidates/${encodeURIComponent(candidateId)}/resume`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Could not load resume PDF');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
