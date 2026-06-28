import { BETRAYAL_PHRASES, CLICKBAIT_WORDS } from "./lexicons";
import type { ClickbaitSignals, Likelihood, Opinion } from "../types";

// Default pillar weights for the merged index (renormalized if a pillar is missing).
export const PILLAR_WEIGHTS = { packaging: 0.4, mismatch: 0.4, betrayal: 0.2 } as const;

// A betrayal_rate this high (or above) saturates the betrayal pillar to 1.0.
const BETRAYAL_SATURATION = 0.2;

// Opinion-mining targets that, when criticized, signal packaging betrayal.
const PACKAGING_TARGETS = ["thumbnail", "title", "clickbait", "bait", "intro"];

const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean)
  );
}

// A lexicon entry matches if: a multi-word phrase appears as a substring, or a
// single word appears as a whole token (so "ever" doesn't match "every").
function entryMatches(entry: string, lowerText: string, tokens: Set<string>): boolean {
  return entry.includes(" ") ? lowerText.includes(entry) : tokens.has(entry);
}

// Count of distinct lexicon entries present in the text.
function countLexiconHits(text: string, lexicon: string[]): number {
  const lowerText = text.toLowerCase();
  const tokens = tokenize(text);
  return lexicon.reduce((n, entry) => (entryMatches(entry, lowerText, tokens) ? n + 1 : n), 0);
}

function containsLexicon(text: string, lexicon: string[]): boolean {
  const lowerText = text.toLowerCase();
  const tokens = tokenize(text);
  return lexicon.some((entry) => entryMatches(entry, lowerText, tokens));
}

// True when a comment carries a betrayal phrase, or an opinion-mining target about
// the packaging (thumbnail/title/...) that the viewer rated negatively.
function isBetrayalComment(comment: BetrayalComment): boolean {
  if (containsLexicon(comment.text, BETRAYAL_PHRASES)) return true;
  return (comment.opinions ?? []).some(
    (o) =>
      o.sentiment === "Negative" &&
      PACKAGING_TARGETS.some((t) => o.target.toLowerCase().includes(t))
  );
}

// Fraction of words (len>=3) that are fully upper-case.
function allCapsRatio(text: string): number {
  const words = text.split(/\s+/).filter((w) => /[A-Za-z]/.test(w) && w.length >= 3);
  if (words.length === 0) return 0;
  const caps = words.filter((w) => w === w.toUpperCase()).length;
  return caps / words.length;
}

/** Maps a 0..100 clickbait percentage to the 5-level likelihood label. */
export function likelihoodLabel(percentage: number): Likelihood {
  if (percentage >= 80) return "Most Likely";
  if (percentage >= 60) return "Highly Likely";
  if (percentage >= 40) return "Normal";
  if (percentage >= 20) return "Less Likely";
  return "Least Likely";
}

/**
 * Packaging heuristic (0..1) from the same signals the LLM sees: overlay
 * presence, ALL CAPS ratio, absolute words, and punctuation intensity (capped).
 */
export function heuristicScore(signals: ClickbaitSignals): number {
  const { title, description, tags, objects, thumbnailText } = signals;
  const overlay = thumbnailText.join(" ");
  const headline = `${title} ${overlay}`.trim();
  const textCorpus = `${title} ${overlay} ${description}`.trim();
  const visualConcepts = [...tags, ...objects].map((s) => s.toLowerCase());

  const overlaySignal = thumbnailText.length > 0 || visualConcepts.includes("text") ? 0.25 : 0;
  const capsSignal = Math.min(allCapsRatio(headline) * 0.5, 0.3);
  const absoluteSignal = Math.min(countLexiconHits(textCorpus, CLICKBAIT_WORDS) * 0.1, 0.3);
  const exclaims = (headline.match(/[!?]/g) ?? []).length;
  const punctSignal = Math.min(exclaims * 0.05, 0.15);

  return round2(clamp01(overlaySignal + capsSignal + absoluteSignal + punctSignal));
}

/** Merged packaging score: 0.3*heuristic + 0.7*llm. */
export function packagingScore(heuristic: number, llm: number): number {
  return round2(clamp01(0.3 * clamp01(heuristic) + 0.7 * clamp01(llm)));
}

export interface BetrayalResult {
  score: number;
  betrayal_rate: number;
  flagged_count: number;
  total_comments: number;
}

export interface BetrayalComment {
  text: string;
  opinions?: Opinion[];
}

/**
 * Fraction of comments signalling betrayal (lexicon match or a negative opinion
 * about the packaging), scaled into a 0..1 pillar score.
 */
export function betrayalFromComments(comments: BetrayalComment[]): BetrayalResult {
  const total = comments.length;
  if (total === 0) {
    return { score: 0, betrayal_rate: 0, flagged_count: 0, total_comments: 0 };
  }
  const flagged = comments.reduce((n, c) => (isBetrayalComment(c) ? n + 1 : n), 0);
  const rate = flagged / total;
  return {
    score: round2(clamp01(rate / BETRAYAL_SATURATION)),
    betrayal_rate: round2(rate),
    flagged_count: flagged,
    total_comments: total,
  };
}

// At/above this video percentage a video counts as "clickbait" for the channel's flagged ratio.
const CHANNEL_FLAG_THRESHOLD = 60;

export interface ChannelVideoStat {
  clickbait_percentage: number;
  publishedAt: string;
  betrayal_rate: number;
}

export interface ChannelRollup {
  propensity_percentage: number;
  likelihood: Likelihood;
  flagged_pct: number;
  video_count: number;
  avg_betrayal_rate: number;
  trend: "rising" | "falling" | "stable";
}

/**
 * Aggregates a channel's videos into a clickbait propensity. The propensity is a
 * recency-weighted mean (newer uploads weigh more, since channels drift); trend
 * compares the newer half of uploads to the older half.
 */
export function aggregateChannel(videos: ChannelVideoStat[]): ChannelRollup {
  const n = videos.length;
  const sorted = [...videos].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  // Recency-weighted mean: most-recent upload gets weight n, oldest gets weight 1.
  let weightedSum = 0;
  let weight = 0;
  sorted.forEach((v, i) => {
    const w = n - i;
    weightedSum += w * v.clickbait_percentage;
    weight += w;
  });
  const propensity = Math.round(weightedSum / (weight || 1));

  const flagged = videos.filter((v) => v.clickbait_percentage >= CHANNEL_FLAG_THRESHOLD).length;
  const avgBetrayal = round2(videos.reduce((s, v) => s + v.betrayal_rate, 0) / (n || 1));

  let trend: ChannelRollup["trend"] = "stable";
  if (n >= 4) {
    const half = Math.floor(n / 2);
    const mean = (arr: ChannelVideoStat[]) =>
      arr.reduce((s, v) => s + v.clickbait_percentage, 0) / (arr.length || 1);
    const diff = mean(sorted.slice(0, half)) - mean(sorted.slice(n - half));
    trend = diff > 5 ? "rising" : diff < -5 ? "falling" : "stable";
  }

  return {
    propensity_percentage: propensity,
    likelihood: likelihoodLabel(propensity),
    flagged_pct: round2(flagged / (n || 1)),
    video_count: n,
    avg_betrayal_rate: avgBetrayal,
    trend,
  };
}

export interface PillarScores {
  packaging: number;
  mismatch: number | null; // null = unavailable (no transcript)
  betrayal: number;
}

export interface ClickbaitAggregate {
  percentage: number; // 0..100
  weights: { packaging: number; mismatch: number; betrayal: number };
}

/**
 * Weighted blend of available pillars into a 0..100 percentage. When mismatch is
 * unavailable its weight is dropped and the remaining weights are renormalized.
 */
export function aggregateClickbait(p: PillarScores): ClickbaitAggregate {
  const base = PILLAR_WEIGHTS;
  let weights: ClickbaitAggregate["weights"];

  if (p.mismatch === null) {
    const denom = base.packaging + base.betrayal;
    weights = { packaging: base.packaging / denom, mismatch: 0, betrayal: base.betrayal / denom };
  } else {
    weights = { packaging: base.packaging, mismatch: base.mismatch, betrayal: base.betrayal };
  }

  const score =
    weights.packaging * p.packaging +
    weights.mismatch * (p.mismatch ?? 0) +
    weights.betrayal * p.betrayal;

  return {
    percentage: Math.round(clamp01(score) * 100),
    weights: {
      packaging: round2(weights.packaging),
      mismatch: round2(weights.mismatch),
      betrayal: round2(weights.betrayal),
    },
  };
}
