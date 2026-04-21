/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_DEBUG_SEARCH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
