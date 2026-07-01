import type { Likelihood, Sentiment, Trend } from "@/data/types"

// Plain-language explanations for the metric labels shown on badges. Surfaced via
// tooltips so "Less Likely" / "stable" / "Neutral" actually tell the user what
// they mean (and, for likelihood, the bait-score band they map to).

export const LIKELIHOOD_INFO: Record<Likelihood, { range: string; blurb: string }> = {
  "Least Likely": { range: "0–20%", blurb: "Packaging, content and audience reaction all read as honest." },
  "Less Likely": { range: "20–40%", blurb: "Mostly straight — only mild sensational packaging." },
  Normal: { range: "40–60%", blurb: "Typical promo packaging: some hype, but the payoff broadly lands." },
  "Highly Likely": { range: "60–80%", blurb: "A clear promise–payoff gap or noticeable audience pushback." },
  "Most Likely": { range: "80–100%", blurb: "Sensational packaging the content and comments don't back up." },
}

export const TREND_INFO: Record<Trend, string> = {
  rising: "This channel's recent uploads score baitier than its older ones.",
  falling: "This channel is trending less baity over time.",
  stable: "No clear change in bait level across recent uploads.",
}

export const SENTIMENT_INFO: Record<Sentiment, string> = {
  Positive: "Most comments express positive sentiment.",
  Negative: "Most comments express negative sentiment.",
  Neutral: "Comments are mostly neutral or factual.",
  Mixed: "Comments are split between positive and negative.",
}
