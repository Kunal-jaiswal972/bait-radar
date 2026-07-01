import { env } from "../config/env";
import type { TranscriptSegment } from "../types";

const DEFAULT_TIMEOUT_MS = 60_000;

/** Permanent: transcript is disabled or none exists. */
export class TranscriptUnavailableError extends Error {}
/** Transient: retry later (-> transcript_status = failed_retryable). */
export class TranscriptFetchError extends Error {}

interface TranscriptResponse {
  segments: TranscriptSegment[];
}

async function bodyText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "";
  }
}

/**
 * Fetches a transcript from the Python transcript Function App over HTTP.
 * Transcripts can't be fetched from Node (YouTube gates the timedtext endpoint
 * behind a session PoToken), so youtube-transcript-api runs in a sibling Python
 * Function App. It returns 404 when the transcript is permanently unavailable
 * and 5xx on transient failures, which we surface as TranscriptUnavailableError
 * vs TranscriptFetchError respectively (the ingestion worker's retry contract).
 */
export async function fetchTranscript(
  videoId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<TranscriptSegment[]> {
  const { TRANSCRIPT_FUNCTION_URL, TRANSCRIPT_FUNCTION_KEY } = env();
  if (!TRANSCRIPT_FUNCTION_URL) {
    throw new TranscriptFetchError("TRANSCRIPT_FUNCTION_URL is not configured");
  }

  const url = new URL(TRANSCRIPT_FUNCTION_URL);
  url.searchParams.set("videoId", videoId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: TRANSCRIPT_FUNCTION_KEY ? { "x-functions-key": TRANSCRIPT_FUNCTION_KEY } : {},
      signal: controller.signal,
    });

    // 404 -> permanently unavailable; any other non-2xx -> retryable.
    if (res.status === 404) {
      throw new TranscriptUnavailableError((await bodyText(res)) || "transcript unavailable");
    }
    if (!res.ok) {
      throw new TranscriptFetchError(`transcript function ${res.status}: ${await bodyText(res)}`);
    }

    const data = (await res.json()) as TranscriptResponse;
    return data.segments ?? [];
  } catch (err) {
    if (err instanceof TranscriptUnavailableError || err instanceof TranscriptFetchError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new TranscriptFetchError(`Transcript fetch timed out after ${timeoutMs}ms`);
    }
    throw new TranscriptFetchError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}
