import { apiFetch } from '../../auth/http';
import {
  getApiBaseUrl,
  getLlmConfig,
  type LlmConfig,
} from '../../config/llm.config';
import { azureOpenAIChatCompletion } from './azureOpenAIScoring';
import { openAIChatCompletion } from './openAIScoring';

export interface ScoreResumeInput {
  candidateName: string;
  batchPrompt: string;
  resumeText: string;
}

export interface ScoreResumeResult {
  score: number;
  rationale?: string;
}

const SCORE_SYSTEM = `You are an expert technical recruiter. Score how well the candidate matches the hiring criteria.
Respond with a single JSON object only, no markdown, in this exact shape:
{"score": <integer from 0 to 100>, "rationale": "<one or two short sentences>"}`;

function buildUserMessage(input: ScoreResumeInput): string {
  return `Hiring criteria and instructions:
${input.batchPrompt}

Candidate name: ${input.candidateName}

Resume:
${input.resumeText.slice(0, 24_000)}`;
}

/** Deterministic pseudo-score for demos without API keys. */
function scoreResumeMock(input: ScoreResumeInput): ScoreResumeResult {
  const blob = `${input.batchPrompt}\n${input.resumeText}\n${input.candidateName}`;
  let h = 0;
  for (let i = 0; i < blob.length; i++) {
    h = (Math.imul(31, h) + blob.charCodeAt(i)) | 0;
  }
  const score = 55 + (Math.abs(h) % 41);
  return {
    score,
    rationale:
      'Mock provider (set VITE_LLM_PROVIDER=openai or azure-openai and matching env vars, or use the Python API).',
  };
}

function parseScoreJson(content: string): ScoreResumeResult {
  const trimmed = content.trim();
  const tryParse = (s: string) => {
    const parsed = JSON.parse(s) as { score?: unknown; rationale?: unknown };
    const score = Number(parsed.score);
    if (!Number.isFinite(score)) throw new Error('Invalid score');
    return {
      score: Math.min(100, Math.max(0, Math.round(score))),
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale : undefined,
    };
  };
  try {
    return tryParse(trimmed);
  } catch {
    const match = trimmed.match(/"score"\s*:\s*(\d+)/);
    if (match) {
      const score = Math.min(100, Math.max(0, parseInt(match[1], 10)));
      return { score, rationale: undefined };
    }
  }
  throw new Error('Could not parse model response as JSON with a score');
}

async function scoreResumeViaPythonBackend(input: ScoreResumeInput): Promise<ScoreResumeResult> {
  const base = getApiBaseUrl();
  const res = await apiFetch(`${base}/api/v1/score-resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      candidateName: input.candidateName,
      batchPrompt: input.batchPrompt,
      resumeText: input.resumeText,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = (await res.json()) as ScoreResumeResult;
  if (typeof data.score !== 'number' || !Number.isFinite(data.score)) {
    throw new Error('Invalid score from API');
  }
  return {
    score: Math.min(100, Math.max(0, Math.round(data.score))),
    rationale: typeof data.rationale === 'string' ? data.rationale : undefined,
  };
}

export async function scoreResumeWithLlm(
  input: ScoreResumeInput,
  config: LlmConfig = getLlmConfig(),
): Promise<ScoreResumeResult> {
  if (getApiBaseUrl()) {
    return scoreResumeViaPythonBackend(input);
  }
  if (config.provider === 'mock') {
    return scoreResumeMock(input);
  }
  if (config.provider === 'openai') {
    const raw = await openAIChatCompletion(
      {
        messages: [
          { role: 'system', content: SCORE_SYSTEM },
          { role: 'user', content: buildUserMessage(input) },
        ],
      },
      config,
    );
    return parseScoreJson(raw);
  }
  const raw = await azureOpenAIChatCompletion(
    {
      messages: [
        { role: 'system', content: SCORE_SYSTEM },
        { role: 'user', content: buildUserMessage(input) },
      ],
    },
    config,
  );
  return parseScoreJson(raw);
}
