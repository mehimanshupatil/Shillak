/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  // DEV-only convenience: local PIN autofill on PinScreen. Never read in production
  // builds. Set in a git-ignored .env.local, never commit a real PIN.
  readonly VITE_DEV_PIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
