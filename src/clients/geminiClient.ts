import { GenerativeModel, GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";

/** Thrown when Gemini is unusable (no key / timeout / API failure) so callers can degrade gracefully. */
export class LlmUnavailableError extends Error {}

// Models tried in order until one responds: the full "flash" models first (best
// quality), then the lighter/cheaper "lite" models as a cheaper fallback. If every
// model fails (quota, 503, timeout), callers fall back to their non-LLM heuristic.
export const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash-lite",
] as const;

/** Returns the configured API key, or throws LlmUnavailableError if it's unset/placeholder. */
export function getGeminiApiKey(): string {
  const key = env().GEMINI_API_KEY;
  if (!key || key.startsWith("<")) {
    throw new LlmUnavailableError("GEMINI_API_KEY is not configured");
  }
  return key;
}

/** Returns a configured JSON-mode model for the given model id. */
export function getGeminiModel(systemInstruction: string, model: string): GenerativeModel {
  const genAI = new GoogleGenerativeAI(getGeminiApiKey());
  return genAI.getGenerativeModel({
    model,
    systemInstruction,
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  });
}
