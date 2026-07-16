/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALLOW_INSECURE_CLIENT_LLM?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
