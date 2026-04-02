/**
 * LLM scoring configuration (OpenAI, Azure OpenAI, mock).
 * Values come from Vite env (.env / .env.local). See `frontend/.env.example`.
 */

export type LlmProvider = 'openai' | 'azure-openai' | 'mock';

export interface AzureOpenAiClientConfig {
  /** When true, POST to same-origin `/__proxy/azure-openai/...` (Vite dev server adds api-key). */
  useProxy: boolean;
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
}

export interface OpenAiClientConfig {
  /** When true, POST to `/__proxy/openai/...` (Vite dev server adds Authorization). */
  useProxy: boolean;
  apiKey: string;
  model: string;
}

export interface LlmConfig {
  provider: LlmProvider;
  azure: AzureOpenAiClientConfig;
  openai: OpenAiClientConfig;
}

function normalizeProvider(raw: string | undefined): LlmProvider {
  const v = (raw ?? 'mock').toLowerCase().trim();
  if (v === 'openai') return 'openai';
  if (v === 'azure-openai' || v === 'azure' || v === 'azure_openai') return 'azure-openai';
  return 'mock';
}

export function getLlmConfig(): LlmConfig {
  const azureUseProxy = import.meta.env.VITE_AZURE_OPENAI_USE_PROXY === 'true';
  const openaiUseProxy = import.meta.env.VITE_OPENAI_USE_PROXY === 'true';
  return {
    provider: normalizeProvider(import.meta.env.VITE_LLM_PROVIDER),
    azure: {
      useProxy: azureUseProxy,
      endpoint: (import.meta.env.VITE_AZURE_OPENAI_ENDPOINT ?? '').replace(/\/$/, ''),
      apiKey: import.meta.env.VITE_AZURE_OPENAI_API_KEY ?? '',
      deployment: import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT ?? '',
      apiVersion: import.meta.env.VITE_AZURE_OPENAI_API_VERSION ?? '2024-02-15-preview',
    },
    openai: {
      useProxy: openaiUseProxy,
      apiKey: import.meta.env.VITE_OPENAI_API_KEY ?? '',
      model: (import.meta.env.VITE_OPENAI_MODEL ?? 'gpt-4o-mini').trim() || 'gpt-4o-mini',
    },
  };
}

/** When set (e.g. http://localhost:8000), resume scoring uses the Python FastAPI backend. */
export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
}

export function usePythonBackendForScoring(): boolean {
  return Boolean(getApiBaseUrl());
}

/**
 * Client-side Azure is ready (direct mode with all VITE_* vars, or dev proxy mode).
 * Proxy mode only works with `npm run dev`; production builds must use direct mode or a backend.
 */
export function isAzureOpenAiReady(config: LlmConfig = getLlmConfig()): boolean {
  if (config.provider !== 'azure-openai') return false;
  const { azure } = config;
  if (!azure.apiVersion) return false;
  if (azure.useProxy) {
    if (import.meta.env.PROD) return false;
    return true;
  }
  return Boolean(azure.endpoint && azure.apiKey && azure.deployment);
}

/** Browser-side OpenAI scoring: proxy (dev) or direct API key in env. */
export function isOpenAiReady(config: LlmConfig = getLlmConfig()): boolean {
  if (config.provider !== 'openai') return false;
  if (config.openai.useProxy) {
    if (import.meta.env.PROD) return false;
    return true;
  }
  return Boolean(config.openai.apiKey?.trim());
}

/** True when the scoring button can run (mock, OpenAI or Azure from browser, or Python API URL set). */
export function isResumeScoringAvailable(config: LlmConfig = getLlmConfig()): boolean {
  if (usePythonBackendForScoring()) return true;
  if (config.provider === 'mock') return true;
  if (config.provider === 'openai') return isOpenAiReady(config);
  if (config.provider === 'azure-openai') return isAzureOpenAiReady(config);
  return false;
}

export function azureOpenAiChatCompletionsPath(config: LlmConfig = getLlmConfig()): string {
  const { deployment, apiVersion } = config.azure;
  const q = new URLSearchParams({ 'api-version': apiVersion }).toString();
  if (config.azure.useProxy) {
    return `/__proxy/azure-openai/chat/completions?${q}`;
  }
  return `${config.azure.endpoint}/openai/deployments/${deployment}/chat/completions?${q}`;
}

export function openAiChatCompletionsPath(config: LlmConfig = getLlmConfig()): string {
  if (config.openai.useProxy) {
    return '/__proxy/openai/v1/chat/completions';
  }
  return 'https://api.openai.com/v1/chat/completions';
}
