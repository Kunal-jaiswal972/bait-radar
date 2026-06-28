// Pure clickbait logic: heuristic scoring, score merge, and verdict labels.

import type { ClickbaitLabel, ClickbaitSignals } from "../types";

export interface ScoreMerge {
  heuristic_score: number;
  llm_score: number;
  weighted_score: number;
  max_score: number;
}

// At/above this weighted score a video is flagged as clickbait.
export const CLICKBAIT_THRESHOLD = 0.5;

// Absolute / sensational words that correlate with clickbait.
const ABSOLUTE_WORDS = [
  "never", "always", "ever", "everyone", "everything", "nobody", "nothing",
  "ruined", "shocking", "shocked", "insane", "unbelievable", "won't believe",
  "gone wrong", "instantly", "secret", "secrets", "exposed", "destroyed",
  "forever", "worst", "best", "ultimate", "literally", "guaranteed",
  "you need to", "this is why", "what happened", "the truth", "anyone",
  "must", "stop", "warning", "shocking truth", "no one",
];

const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

// Fraction of words (len>=3) that are fully upper-case.
function allCapsRatio(text: string): number {
  const words = text.split(/\s+/).filter((w) => /[A-Za-z]/.test(w) && w.length >= 3);
  if (words.length === 0) return 0;
  const caps = words.filter((w) => w === w.toUpperCase()).length;
  return caps / words.length;
}

// Count of distinct absolute/sensational phrases present in the text.
function absoluteWordHits(text: string): number {
  const lower = text.toLowerCase();
  return ABSOLUTE_WORDS.reduce((n, w) => (lower.includes(w) ? n + 1 : n), 0);
}

// Maps any 0..1 clickbait score to a human-readable verdict.
export function clickbaitLabel(score: number): ClickbaitLabel {
  if (score >= 0.8) return "Highly Clickbait";
  if (score >= 0.6) return "Likely Clickbait";
  if (score >= 0.3) return "Mildly Clickbait";
  return "Not Clickbait";
}

// Rule-based 0..1 score from the same signals the LLM sees: overlay presence,
// ALL CAPS ratio, absolute words, and punctuation intensity (each capped).
export function heuristicScore(signals: ClickbaitSignals): number {
  const { title, description, tags, objects, thumbnailText } = signals;
  const overlay = thumbnailText.join(" ");
  const headline = `${title} ${overlay}`.trim();
  const textCorpus = `${title} ${overlay} ${description}`.trim();
  const visualConcepts = [...tags, ...objects].map((s) => s.toLowerCase());

  const overlaySignal = thumbnailText.length > 0 || visualConcepts.includes("text") ? 0.25 : 0;
  const capsSignal = Math.min(allCapsRatio(headline) * 0.5, 0.3);
  const absoluteSignal = Math.min(absoluteWordHits(textCorpus) * 0.12, 0.3);
  const exclaims = (headline.match(/[!?]/g) ?? []).length;
  const punctSignal = Math.min(exclaims * 0.05, 0.15);

  return round2(clamp01(overlaySignal + capsSignal + absoluteSignal + punctSignal));
}

// Combines the two scores: weighted = 0.3*heuristic + 0.7*llm; max = the higher.
export function mergeScores(heuristic: number, llm: number): ScoreMerge {
  const h = clamp01(heuristic);
  const l = clamp01(llm);
  return {
    heuristic_score: round2(h),
    llm_score: round2(l),
    weighted_score: round2(h * 0.3 + l * 0.7),
    max_score: round2(Math.max(h, l)),
  };
}
