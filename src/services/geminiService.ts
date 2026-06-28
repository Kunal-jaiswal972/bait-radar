import type { Part } from "@google/generative-ai";
import { z } from "zod";
import { getGeminiModel, LlmUnavailableError } from "../clients/geminiClient";

const DEFAULT_TIMEOUT_MS = 15_000;

const scoreResponseSchema = z.object({
  score: z.number(),
  reason: z.string().optional(),
});

// Rejects with LlmUnavailableError if the wrapped promise doesn't settle within `ms`.
function raceWithTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new LlmUnavailableError(`Gemini timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// Parses a `{ "score": 0..1 }` reply (tolerates markdown fences), clamped to 0..1.
function parseJsonScore(raw: string): number {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  const parsed = scoreResponseSchema.safeParse(JSON.parse(match ? match[0] : cleaned));
  if (!parsed.success) throw new Error(`Unexpected LLM output: ${raw}`);
  return Math.max(0, Math.min(1, parsed.data.score));
}

/** Fetches an image URL as an inline Gemini image part, or null on failure (so the call degrades to text-only). */
export async function imageUrlToPart(url: string): Promise<Part | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") ?? "image/jpeg";
    if (!mimeType.startsWith("image/")) return null;
    const data = Buffer.from(await res.arrayBuffer()).toString("base64");
    return { inlineData: { mimeType, data } };
  } catch {
    return null;
  }
}

/**
 * Runs a JSON-score prompt (text + optional image parts) through Gemini with a
 * timeout and returns a 0..1 score. Always throws LlmUnavailableError on failure,
 * so callers can degrade in a single catch.
 */
export async function generateScore(
  systemPrompt: string,
  parts: Array<string | Part>,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<number> {
  const model = getGeminiModel(systemPrompt);
  try {
    const result = await raceWithTimeout(model.generateContent(parts), timeoutMs);
    return parseJsonScore(result.response.text());
  } catch (err) {
    if (err instanceof LlmUnavailableError) throw err;
    throw new LlmUnavailableError(`Gemini request failed: ${(err as Error).message}`);
  }
}
