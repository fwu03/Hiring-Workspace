/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LLM_PROVIDER?: string;
  readonly VITE_OPENAI_USE_PROXY?: string;
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_OPENAI_MODEL?: string;
  readonly VITE_AZURE_OPENAI_USE_PROXY?: string;
  readonly VITE_AZURE_OPENAI_ENDPOINT?: string;
  readonly VITE_AZURE_OPENAI_API_KEY?: string;
  readonly VITE_AZURE_OPENAI_DEPLOYMENT?: string;
  readonly VITE_AZURE_OPENAI_API_VERSION?: string;
  /** Python FastAPI base URL (no trailing slash), e.g. http://localhost:8000 */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
