// Gemini (Google Generative AI) model factory.

import { GenerativeModel, GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";

// Thrown when Gemini is unusable (no key / timeout / API failure) so callers
// can degrade to the heuristic score.
export class LlmUnavailableError extends Error {}

export function geminiModelName(): string {
  return env().GEMINI_MODEL;
}

// Returns a configured model. Throws LlmUnavailableError if no key is set.
export function getGeminiModel(systemInstruction: string): GenerativeModel {
  const key = env().GEMINI_API_KEY;
  if (!key || key.startsWith("<")) {
    throw new LlmUnavailableError("GEMINI_API_KEY is not configured");
  }
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: env().GEMINI_MODEL,
    systemInstruction,
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  });
}
