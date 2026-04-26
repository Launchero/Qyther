/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_LOG_LEVEL?: string;
  readonly VITE_DEBUG_SEARCH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
