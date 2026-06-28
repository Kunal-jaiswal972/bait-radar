import { env } from "../config/env";

const API_BASE = "https://www.googleapis.com/youtube/v3";

/** Builds a YouTube Data API v3 URL with the given params and API key attached. */
export function buildYoutubeUrl(path: string, params: Record<string, string>): URL {
  const url = new URL(`${API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("key", env().YOUTUBE_API_KEY);
  return url;
}
