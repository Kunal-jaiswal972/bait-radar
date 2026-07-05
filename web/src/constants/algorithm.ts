// Content for the /algorithm explainer page. The worked-example numbers are
// illustrative — the video below run through the BaitRadar pipeline. Formulas
// mirror src/domain/clickbait.ts and the pillar services one-to-one.

export interface Paper {
  title: string
  href: string
  note: string
}

export interface Signal {
  label: string
  detail: string
}

// ── The worked example (real pipeline output) ──────────────────────────────────
export const EXAMPLE = {
  videoId: "iYlODtkyw_I",
  title: "Survive 30 Days Chained To A Stranger, Win $250,000",
  channelTitle: "MrBeast",
  duration: "35m 05s",
  views: 58_327_701,
  likes: 1_311_798,
  commentCount: 67_022,

  elements: {
    title: "Survive 30 Days Chained To A Stranger, Win $250,000",
    descriptionPreview: "imagine being chained to a random stranger for 30 days lol … SUBSCRIBE OR I TAKE YOUR DOG",
    transcriptSegments: 2812,
    commentsAnalyzed: 100,
  },

  packaging: {
    capsSignal: 0.08,
    absoluteSignal: 0.1,
    punctSignal: 0.0,
    heuristic: 0.18,
    llm: 0.6,
    llmSource: "gemini-2.5-flash-lite",
    score: 0.47,
  },
  mismatch: { available: true, score: 0.0, source: "gemini" },
  betrayal: { flagged: 0, total: 100, rate: 0.0, score: 0.0 },

  weights: { packaging: 0.4, mismatch: 0.4, betrayal: 0.2 },
  percentage: 19,
  likelihood: "Least Likely",
} as const

// ── Formula code blocks (mirror the implementation exactly) ─────────────────────
export const FORMULAS = {
  packagingHeuristic: `# Pillar 1 — Packaging  ·  rule-based heuristic (0..1)
# src/domain/clickbait.ts → heuristicScore()  ·  title + description text only

capsSignal     = min( allCapsRatio(title)  * 0.5 , 0.35 )
absoluteSignal = min( sensationalWordHits  * 0.10 , 0.35 )   # data/clickbait-words.txt
punctSignal    = min( count("!" , "?")     * 0.05 , 0.15 )

heuristic = clamp01(capsSignal + absoluteSignal + punctSignal)`,

  packagingMerge: `# Pillar 1 — Packaging  ·  merge heuristic + multimodal LLM
# The thumbnail IMAGE is sent straight to Gemini (temperature 0), which reads it
# directly — overlay text, shocked faces, arrows, red circles — so no separate
# Vision OCR/tags/objects pass is needed.
# Gemini model cascade: 2.0-flash → 2.5-flash → 2.0-flash-lite → 2.5-flash-lite
# (first model that answers wins; all fail ⇒ llm = heuristic, source "heuristic_fallback")

packaging = round2( clamp01( 0.3 * heuristic  +  0.7 * llm ) )`,

  mismatch: `# Pillar 2 — Promise–payoff mismatch (0..1, higher = bigger gap)
# src/services/mismatchService.ts  ·  needs a transcript, else "unavailable"

# The transcript is condensed three ways, then a Gemini judge rates delivery:
condensed = headExcerpt(1500 chars)
          + Azure ExtractiveSummarization(8 salient sentences)
          + Azure KeyPhraseExtraction(topics sampled across the whole video)

mismatch  = Gemini judge(title, condensed)   # 0 = delivers, 1 = pure bait
# fallback (Gemini down): 1 − (titleWordsPresentInTranscript / titleWords)`,

  betrayal: `# Pillar 3 — Audience betrayal (0..1)
# src/domain/clickbait.ts → betrayalFromComments()

isBetrayed(comment) = betrayalPhraseMatch(comment.text)        # data/betrayal-phrases.txt
                    OR negativeOpinionAbout("thumbnail"|"title"|"intro")  # Azure Opinion Mining

rate   = flaggedComments / totalComments
score  = clamp01( rate / 0.20 )        # a 20% betrayal rate saturates the pillar to 1.0`,

  blend: `# Final blend → clickbait_percentage → likelihood
# src/domain/clickbait.ts → aggregateClickbait() / likelihoodLabel()

weights = { packaging: 0.4, mismatch: 0.4, betrayal: 0.2 }
# if mismatch is unavailable (no transcript) its weight is dropped and the
# remaining two are renormalized so they still sum to 1.

raw        = wPackaging·packaging + wMismatch·mismatch + wBetrayal·betrayal
percentage = round( clamp01(raw) * 100 )

likelihood =  <20 Least · 20–40 Less · 40–60 Normal · 60–80 Highly · 80–100 Most  Likely`,

  channel: `# Channel rollup — clickbait propensity across a channel's videos
# src/domain/clickbait.ts → aggregateChannel()  ·  src/services/channelService.ts

propensity = recencyWeightedMean(videoPercentages)   # newest upload weighs most
flagged_pct = share of videos with percentage ≥ 60
trend       = mean(newerHalf) − mean(olderHalf)       # needs ≥ 4 videos
            = >+5 rising · <−5 falling · else stable`,
} as const

// ── Research grounding ──────────────────────────────────────────────────────────
export const PAPERS: Paper[] = [
  {
    title: "ThumbnailTruth — Multi-Modal LLM detection of misleading YouTube thumbnails (arXiv 2025)",
    href: "https://arxiv.org/html/2509.04714v1",
    note: "Backs Pillar 1: sending the thumbnail image itself to a multimodal LLM to judge packaging.",
  },
  {
    title: "BaitRadar — Multi-model clickbait detection using title, thumbnail, transcript, comments, tags, stats",
    href: "https://arxiv.org/html/2505.17448v1",
    note: "The blueprint for the whole model: fuse many weak signals rather than trust any one.",
  },
  {
    title: "Multimodal Clickbait Detection by De-confounding Biases via Causal Inference",
    href: "https://arxiv.org/html/2410.07673v1",
    note: "The bias we do NOT yet correct — engagement/popularity confounds (see weaknesses).",
  },
  {
    title: "YouTube Ranking Factors 2026 — \"Quality CTR\" & retention",
    href: "https://rankxdigital.com/blog/youtube-ranking-factors/",
    note: "Why promise–payoff matters: retention, not raw CTR, is what YouTube rewards.",
  },
  {
    title: "YouTube Satisfaction Signals — dismissive comments as a suppression signal",
    href: "https://marketingagent.blog/2025/11/04/youtubes-recommendation-algorithm-satisfaction-signals-what-you-can-control/",
    note: "Backs Pillar 3: the audience calling out bait is a real dissatisfaction signal.",
  },
]

export const STRENGTHS: Signal[] = [
  {
    label: "Promise–payoff framing, not just hype detection",
    detail:
      "The model separates sensational packaging from actual deception. This example scores 0.47 on packaging yet only 19% overall — because the content delivers and viewers don't feel betrayed.",
  },
  {
    label: "Multimodal & multi-signal",
    detail:
      "Packaging sends the thumbnail image itself to a multimodal LLM alongside the title + description; mismatch reads the transcript; betrayal reads the audience. No single signal can dominate.",
  },
  {
    label: "Degrades, never blocks",
    detail:
      "Every external dependency (Gemini, Azure Language, transcripts) has a fallback. A missing pillar is dropped and the weights renormalize instead of failing the whole score.",
  },
  {
    label: "Quota-resilient LLM",
    detail:
      "Gemini calls walk a 4-model cascade (flash → lite), so a per-model 429/503 falls through to the next model before any heuristic fallback fires.",
  },
  {
    label: "Auditable & tunable",
    detail:
      "The heuristic is deterministic, every sub-score is stored, and the sensational/betrayal word lists are plain editable data files — grow them without touching code.",
  },
]

export const WEAKNESSES: Signal[] = [
  {
    label: "The defining pillar is fragile in production",
    detail:
      "Promise–payoff mismatch needs a transcript, but YouTube IP-blocks the scraper from datacenter IPs. When it's unavailable the index rests on packaging (promise only) + betrayal (lagging) — the strongest deception signal is exactly the one most often missing.",
  },
  {
    label: "Betrayal is shallow and lagging",
    detail:
      "It matches an English phrase list + opinion mining over the top 100 comments by relevance, analyzed once about 6h after upload. It's blind to non-English audiences and a 0 score means \"no signal\", not \"innocent\".",
  },
  {
    label: "Engagement bias is not de-confounded",
    detail:
      "Fan-dominated comment sections rarely cry clickbait, so huge creators can score low despite heavy packaging (this run: betrayal 0/100). The causal-inference paper addresses exactly this — we don't correct for it yet.",
  },
  {
    label: "The heuristic is crude",
    detail:
      "ALL-CAPS ratio, punctuation and a word list can't read the image and can flag sensational-but-honest titles. It's only 30% of the packaging pillar, but it still nudges the score.",
  },
  {
    label: "Arbitrary constants & single-judge LLM",
    detail:
      "The 0.20 betrayal saturation, the 0.3/0.7 heuristic-vs-LLM split, the 0.4/0.4/0.2 weights and the 100-comment cap are hand-tuned, not learned. The LLM pillars use a single judge with no ensemble or calibration.",
  },
]
