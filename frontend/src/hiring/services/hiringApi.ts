/**
 * Hiring REST API — all durable data is stored in the backend database.
 * Set VITE_API_BASE_URL (e.g. http://localhost:8000) in .env.local.
 * Requests include Bearer auth when logged in (see auth/http.ts).
 */
import { apiFetch } from '../../auth/http';
import { getApiBaseUrl } from '../../config/llm.config';
import type { HiringBatch, HiringCandidate } from '../data/hiringTypes';

export function hiringApiConfigured(): boolean {
  return Boolean(getApiBaseUrl());
}

async function parseError(res: Response): Promise<string> {
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

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export async function listBatches(): Promise<HiringBatch[]> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('VITE_API_BASE_URL is not set');
  return j(await apiFetch(`${base}/api/v1/batches`));
}

export interface BatchDetailResponse {
  batch: HiringBatch;
  candidates: HiringCandidate[];
}

export async function getBatchDetail(batchId: string): Promise<BatchDetailResponse> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('VITE_API_BASE_URL is not set');
  return j(await apiFetch(`${base}/api/v1/batches/${encodeURIComponent(batchId)}`));
}

export async function patchBatch(
  batchId: string,
  body: Partial<{
    tag: string;
    llmPrompt: string | null;
    status: HiringBatch['status'];
    uploadComplete: boolean;
  }>,
): Promise<HiringBatch> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('VITE_API_BASE_URL is not set');
  return j(
    await apiFetch(`${base}/api/v1/batches/${encodeURIComponent(batchId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteBatch(batchId: string): Promise<void> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('VITE_API_BASE_URL is not set');
  const res = await apiFetch(`${base}/api/v1/batches/${encodeURIComponent(batchId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function patchCandidate(
  candidateId: string,
  body: Partial<{
    name: string;
    email: string;
    phone: string;
    yearsOfExperience: number;
    school: string;
    degree: string;
    flags: HiringCandidate['flags'];
    llmScore: number | null;
    llmRationale?: string | null;
    status: HiringCandidate['status'];
    hmComment: string | null;
    resumeText: string;
    history: HiringCandidate['history'];
    interviewRounds: HiringCandidate['interviewRounds'];
    interviewWorkspace: Record<string, unknown> | null;
  }>,
): Promise<HiringCandidate> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('VITE_API_BASE_URL is not set');
  return j(
    await apiFetch(`${base}/api/v1/candidates/${encodeURIComponent(candidateId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function getCandidate(candidateId: string): Promise<HiringCandidate> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('VITE_API_BASE_URL is not set');
  return j(await apiFetch(`${base}/api/v1/candidates/${encodeURIComponent(candidateId)}`));
}

export async function createBatch(body: {
  tag: string;
  llmPrompt?: string | null;
  status?: HiringBatch['status'];
  uploadComplete?: boolean;
}): Promise<HiringBatch> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('VITE_API_BASE_URL is not set');
  return j(
    await apiFetch(`${base}/api/v1/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function createCandidate(
  batchId: string,
  body: {
    name: string;
    email?: string;
    phone?: string;
    yearsOfExperience?: number;
    school?: string;
    degree?: string;
    resumeText?: string;
  },
): Promise<HiringCandidate> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('VITE_API_BASE_URL is not set');
  return j(
    await apiFetch(`${base}/api/v1/batches/${encodeURIComponent(batchId)}/candidates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function uploadResumePdf(candidateId: string, file: File): Promise<HiringCandidate> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('VITE_API_BASE_URL is not set');
  const fd = new FormData();
  fd.append('file', file);
  const res = await apiFetch(`${base}/api/v1/candidates/${encodeURIComponent(candidateId)}/resume`, {
    method: 'POST',
    body: fd,
  });
  return j(res);
}
