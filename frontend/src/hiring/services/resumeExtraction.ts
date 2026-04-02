import { apiFetch } from '../../auth/http';
import { getApiBaseUrl } from '../../config/llm.config';

/** Fields produced by the Python LLM extraction endpoint (see backend `POST /api/v1/extract-resume`). */
export interface ExtractResumeFieldsResult {
  name?: string | null;
  yearsOfExperience?: number | null;
  school?: string | null;
  degree?: string | null;
}

/**
 * Server-side extraction of name, YoE, school, degree from raw resume text.
 * Requires `VITE_API_BASE_URL` — extraction is an LLM task separate from scoring.
 */
export async function extractResumeFields(
  resumeText: string,
  candidateNameHint?: string,
): Promise<ExtractResumeFieldsResult> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new Error('Set VITE_API_BASE_URL to use LLM extraction from the Python backend.');
  }
  const res = await apiFetch(`${base}/api/v1/extract-resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resumeText,
      candidateNameHint: candidateNameHint ?? null,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText);
    throw new Error(`Extraction API ${res.status}: ${t.slice(0, 500)}`);
  }
  return res.json() as Promise<ExtractResumeFieldsResult>;
}
