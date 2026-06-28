import { getLanguageClient } from "../clients/languageClient";
import type { Sentiment, SentimentScores } from "../types";

const MAX_DOCS_PER_REQUEST = 10; // Azure AI Language sentiment batch limit
const MAX_DOC_CHARS = 5000; // under the 5120 service limit

export interface SentimentResult {
  sentiment: Sentiment;
  confidence: SentimentScores;
}

const NEUTRAL_RESULT: SentimentResult = {
  sentiment: "Neutral",
  confidence: { positive: 0, neutral: 1, negative: 0 },
};

function toSentiment(label: string | undefined): Sentiment {
  switch (label) {
    case "positive": return "Positive";
    case "negative": return "Negative";
    case "mixed": return "Mixed";
    default: return "Neutral";
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Sentiment + confidence per text, aligned to input order. Empty inputs map to
 * Neutral without consuming a service call slot.
 */
export async function analyzeSentiments(texts: string[]): Promise<SentimentResult[]> {
  const results: SentimentResult[] = texts.map(() => ({ ...NEUTRAL_RESULT }));

  const indexed = texts
    .map((text, index) => ({ index, text: text.trim().slice(0, MAX_DOC_CHARS) }))
    .filter((d) => d.text.length > 0);

  for (const group of chunk(indexed, MAX_DOCS_PER_REQUEST)) {
    const analysis = await getLanguageClient().analyze(
      "SentimentAnalysis",
      group.map((d) => d.text),
      "en"
    );
    analysis.forEach((res, i) => {
      if (!res.error) {
        results[group[i].index] = {
          sentiment: toSentiment(res.sentiment),
          confidence: {
            positive: res.confidenceScores.positive,
            neutral: res.confidenceScores.neutral,
            negative: res.confidenceScores.negative,
          },
        };
      }
    });
  }

  return results;
}

/** Sentiment of a single string (e.g. the transcript hook). */
export async function analyzeSingleSentiment(text: string): Promise<SentimentResult> {
  const trimmed = text.trim().slice(0, MAX_DOC_CHARS);
  if (!trimmed) return { ...NEUTRAL_RESULT };
  const [res] = await getLanguageClient().analyze("SentimentAnalysis", [trimmed], "en");
  if (res.error) return { ...NEUTRAL_RESULT };
  return {
    sentiment: toSentiment(res.sentiment),
    confidence: {
      positive: res.confidenceScores.positive,
      neutral: res.confidenceScores.neutral,
      negative: res.confidenceScores.negative,
    },
  };
}
