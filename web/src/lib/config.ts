// Centralized runtime config. The API base URL is read once here so no other
// module touches import.meta.env directly. Override via VITE_API_BASE_URL at
// build time (e.g. the APIM URL in production); defaults to the local host.
const DEFAULT_API_BASE_URL = "http://localhost:7071/api"

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL
