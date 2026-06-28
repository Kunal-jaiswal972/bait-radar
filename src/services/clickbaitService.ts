import type { Part } from "@google/generative-ai";
import { geminiModelName } from "../clients/geminiClient";
import { generateScore, imageUrlToPart } from "./geminiService";
import { heuristicScore, packagingScore } from "../domain/clickbait";
import type { ClickbaitSignals, Logger, PackagingPillar } from "../types";

const SYSTEM_PROMPT = `You are a strict clickbait detector for YouTube video packaging.
You are given a video's title, description, its thumbnail image, the visual tags and
detected objects in that thumbnail, and the text overlays printed ON it (OCR).
Rate how clickbait the PACKAGING is from 0.0 to 1.0, where:
  0.0 = accurate, informative, no exaggeration
  0.5 = mild sensationalism or curiosity gap
  1.0 = extreme clickbait: misleading, exaggerated, curiosity-gap, shock-driven
Strong signals: ALL CAPS and sensational/absolute words ("NEVER", "SHOCKING",
"GONE WRONG"), curiosity gaps, shocked faces / arrows / circles / red highlights in
the thumbnail, and exaggeration or emotional manipulation in the title.
Respond with ONLY a JSON object: {"score": <float 0.0-1.0>, "reason": "<short>"}.
Do not include markdown fences or any other text.`;

async function geminiPackagingScore(signals: ClickbaitSignals): Promise<number> {
  const payload = JSON.stringify({
    title: signals.title,
    description: signals.description.slice(0, 2000),
    visual_tags: signals.tags,
    visual_objects: signals.objects,
    thumbnail_text_overlays: signals.thumbnailText,
  });

  const parts: Array<string | Part> = [payload];
  const image = await imageUrlToPart(signals.thumbnailUrl);
  if (image) parts.push(image);

  return generateScore(SYSTEM_PROMPT, parts);
}

/**
 * Packaging pillar: heuristic + multimodal Gemini on the same evidence, merged.
 * Degrades to the heuristic score (llm_source = "heuristic_fallback") on any LLM failure.
 */
export async function scorePackaging(
  signals: ClickbaitSignals,
  logger: Logger
): Promise<PackagingPillar> {
  const heuristic = heuristicScore(signals);

  let llm = heuristic;
  let llmSource = "heuristic_fallback";
  try {
    llm = await geminiPackagingScore(signals);
    llmSource = geminiModelName();
  } catch (err) {
    logger.warn("Gemini packaging scoring failed (degrading to heuristic)", err);
  }

  return {
    heuristic_score: heuristic,
    llm_score: llm,
    llm_source: llmSource,
    score: packagingScore(heuristic, llm),
  };
}
