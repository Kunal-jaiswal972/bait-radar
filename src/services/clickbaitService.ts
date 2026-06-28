// Clickbait scoring: heuristic + Gemini LLM, merged into the ClickbaitInsights
// block. On any LLM failure it degrades to the heuristic score.

import { z } from "zod";
import {
  getGeminiModel,
  geminiModelName,
  LlmUnavailableError,
} from "../clients/geminiClient";
import {
  CLICKBAIT_THRESHOLD,
  clickbaitLabel,
  heuristicScore,
  mergeScores,
} from "../domain/clickbait";
import type { ClickbaitInsights, ClickbaitSignals, Logger } from "../types";

const TIMEOUT_MS = 15_000;

const SYSTEM_PROMPT = `You are a strict clickbait detector for YouTube videos.
You are given a video's title, description, visual tags and detected objects
from its thumbnail, and the text overlays printed ON the thumbnail (read via
OCR). Rate how clickbait the video is on a scale from 0.0 to 1.0, where:
  0.0 = accurate, informative, no exaggeration
  0.5 = mild sensationalism or curiosity gap
  1.0 = extreme clickbait: misleading, exaggerated, curiosity-gap, shock-driven
The thumbnail text overlays are a strong signal: ALL CAPS, sensational/absolute
words ("NEVER", "SHOCKING", "GONE WRONG"), and curiosity gaps printed on the
thumbnail should raise the score. Also consider exaggeration, emotional
manipulation, and mismatch between the title/thumbnail and likely content.
Respond with ONLY a JSON object: {"score": <float 0.0-1.0>, "reason": "<short>"}.
Do not include markdown fences or any other text.`;

const geminiResponseSchema = z.object({
  score: z.number(),
  reason: z.string().optional(),
});

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new LlmUnavailableError(`Gemini timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// Parses the model's JSON reply (tolerates markdown fences) into a 0..1 score.
function parseScore(raw: string): number {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  const parsed = geminiResponseSchema.safeParse(JSON.parse(match ? match[0] : cleaned));
  if (!parsed.success) throw new Error(`Unexpected LLM output: ${raw}`);
  return Math.max(0, Math.min(1, parsed.data.score));
}

// Returns a 0..1 clickbait score from Gemini.
async function geminiClickbaitScore(signals: ClickbaitSignals): Promise<number> {
  const model = getGeminiModel(SYSTEM_PROMPT);
  const userPayload = JSON.stringify({
    title: signals.title,
    description: signals.description.slice(0, 2000),
    visual_tags: signals.tags,
    visual_objects: signals.objects,
    thumbnail_text_overlays: signals.thumbnailText,
  });

  try {
    const result = await withTimeout(model.generateContent(userPayload), TIMEOUT_MS);
    return parseScore(result.response.text());
  } catch (err) {
    if (err instanceof LlmUnavailableError) throw err;
    throw new LlmUnavailableError(`Gemini request failed: ${(err as Error).message}`);
  }
}

// Full clickbait insights: heuristic + LLM (degrades to heuristic) + labels.
export async function scoreClickbait(
  signals: ClickbaitSignals,
  logger: Logger
): Promise<ClickbaitInsights> {
  const heuristic = heuristicScore(signals);

  let llm = heuristic;
  let llmSource = "heuristic_fallback";
  try {
    llm = await geminiClickbaitScore(signals);
    llmSource = geminiModelName();
  } catch (err) {
    logger.warn("Gemini clickbait scoring failed (degrading to heuristic)", err);
  }

  const merged = mergeScores(heuristic, llm);
  return {
    heuristic_score: merged.heuristic_score,
    heuristic_label: clickbaitLabel(merged.heuristic_score),
    llm_score: merged.llm_score,
    llm_label: clickbaitLabel(merged.llm_score),
    llm_source: llmSource,
    weighted_score: merged.weighted_score,
    max_score: merged.max_score,
    max_label: clickbaitLabel(merged.max_score),
    verdict: clickbaitLabel(merged.weighted_score),
    is_clickbait: merged.weighted_score >= CLICKBAIT_THRESHOLD,
  };
}
