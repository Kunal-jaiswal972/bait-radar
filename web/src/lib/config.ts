// Centralized runtime config. The API base URL is read once here so no other
// module touches import.meta.env directly.
//
// Default is the RELATIVE "/api" path: in dev, Vite proxies it to the local
// Functions host (see vite.config.ts); in prod, it resolves same-origin (e.g.
// Azure Static Web Apps' linked API). Override with VITE_API_BASE_URL at build
// time to point at an absolute URL such as APIM.
const DEFAULT_API_BASE_URL = "/api"

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL
