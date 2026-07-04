import { getLanguageClient } from "../clients/languageClient";
import { STOPWORDS } from "../domain/lexicons";
import { generateScore } from "./geminiService";
import type { Logger, MismatchPillar, TranscriptSegment } from "../types";

const MAX_DOC_CHARS = 5000;
const MAX_KEYPHRASE_DOCS = 10; // Azure key-phrase batch limit; ~50k chars of coverage
const HEAD_EXCERPT_CHARS = 1500;
const MAX_SUMMARY_CHARS = 120_000; // Azure summarization per-document limit
const SUMMARY_SENTENCES = 8;

const SYSTEM_PROMPT = `You judge whether a YouTube video DELIVERS what its title and
thumbnail promise. You are given the title, the thumbnail text overlays, and a
compact representation of the actual spoken content (an opening excerpt, an
extractive summary of the whole video, and the key topics from the transcript).
Rate the PROMISE–PAYOFF MISMATCH
from 0.0 to 1.0, where:
  0.0 = the content fully delivers what the title/thumbnail promised
  0.5 = partially delivers, or buries the payoff
  1.0 = the content does not deliver the promise at all (pure bait)
Judge delivery of the promise, not production quality or tone.
Respond with ONLY a JSON object: {"score": <float 0.0-1.0>, "reason": "<short>"}.
Do not include markdown fences or any other text.`;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Splits text into MAX_DOC_CHARS windows, then evenly samples up to MAX_KEYPHRASE_DOCS
// of them across the whole span — so a long transcript's middle and end are
// represented, not just the first ~50k chars.
function sampleTranscriptWindows(fullText: string): string[] {
  const windows: string[] = [];
  for (let i = 0; i < fullText.length; i += MAX_DOC_CHARS) {
    windows.push(fullText.slice(i, i + MAX_DOC_CHARS));
  }
  if (windows.length <= MAX_KEYPHRASE_DOCS) return windows;

  const sampled: string[] = [];
  for (let k = 0; k < MAX_KEYPHRASE_DOCS; k++) {
    const idx = Math.round((k * (windows.length - 1)) / (MAX_KEYPHRASE_DOCS - 1));
    sampled.push(windows[idx]);
  }
  return sampled;
}

// Azure AI Language Key Phrase Extraction over windows sampled across the whole
// transcript. Returns [] on failure so the Gemini call can still use the excerpt.
async function extractKeyPhrases(fullText: string, logger: Logger): Promise<string[]> {
  try {
    const docs = sampleTranscriptWindows(fullText);
    const phrases = new Set<string>();
    for (const group of chunk(docs, MAX_KEYPHRASE_DOCS)) {
      const results = await getLanguageClient().analyze("KeyPhraseExtraction", group, "en");
      for (const res of results) {
        if (!res.error) res.keyPhrases.forEach((p) => phrases.add(p));
      }
    }
    return [...phrases];
  } catch (err) {
    logger.warn("Key phrase extraction failed (continuing with excerpt only)", err);
    return [];
  }
}

// Azure AI Language Extractive Summarization — pulls the most salient sentences
// from the transcript (region-gated; returns [] on failure so the judge can still
// run on key phrases + excerpt).
async function extractSummary(fullText: string, logger: Logger): Promise<string[]> {
  try {
    const poller = await getLanguageClient().beginAnalyzeBatch(
      [{ kind: "ExtractiveSummarization", maxSentenceCount: SUMMARY_SENTENCES }],
      [fullText.slice(0, MAX_SUMMARY_CHARS)],
      "en"
    );
    const sentences: string[] = [];
    for await (const actionResult of await poller.pollUntilDone()) {
      if (actionResult.kind === "ExtractiveSummarization" && !actionResult.error) {
        for (const doc of actionResult.results) {
          if (!doc.error) doc.sentences.forEach((s) => sentences.push(s.text));
        }
      }
    }
    return sentences;
  } catch (err) {
    logger.warn("Extractive summarization failed (continuing without summary)", err);
    return [];
  }
}

async function geminiMismatchScore(
  title: string,
  thumbnailText: string[],
  headExcerpt: string,
  summary: string[],
  keyPhrases: string[]
): Promise<number> {
  const payload = JSON.stringify({
    title,
    thumbnail_text_overlays: thumbnailText,
    content_opening_excerpt: headExcerpt,
    content_summary: summary,
    content_key_topics: keyPhrases.slice(0, 60),
  });
  const { score } = await generateScore(SYSTEM_PROMPT, [payload]);
  return score;
}

// Deterministic fallback: fraction of the title's content words (stopwords removed)
// that appear in the transcript. Low presence -> high mismatch. Used when Gemini is down.
function lexicalMismatch(title: string, fullText: string): number {
  const words = title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  if (words.length === 0) return 0;

  const haystack = fullText.toLowerCase();
  const present = words.filter((w) => haystack.includes(w)).length;
  return Math.round((1 - present / words.length) * 100) / 100;
}

/**
 * Promise–payoff mismatch pillar. Condenses the transcript two ways — Azure
 * Extractive Summarization (salient sentences) and Key Phrase Extraction (topics
 * sampled across the whole video) — and asks Gemini whether the content delivers
 * the title/thumbnail promise. Falls back to lexical title-presence when Gemini is
 * down; unavailable when there's no transcript.
 */
export async function scoreMismatch(
  input: { title: string; thumbnailText: string[]; transcript: TranscriptSegment[] },
  logger: Logger
): Promise<MismatchPillar> {
  const fullText = input.transcript.map((s) => s.text).join(" ").trim();
  if (!fullText) {
    return { available: false, score: 0, source: "unavailable" };
  }

  const [keyPhrases, summary] = await Promise.all([
    extractKeyPhrases(fullText, logger),
    extractSummary(fullText, logger),
  ]);
  const headExcerpt = fullText.slice(0, HEAD_EXCERPT_CHARS);

  try {
    const score = await geminiMismatchScore(
      input.title,
      input.thumbnailText,
      headExcerpt,
      summary,
      keyPhrases
    );
    return { available: true, score, source: "gemini" };
  } catch (err) {
    logger.warn("Gemini mismatch judge failed (falling back to lexical overlap)", err);
    return { available: true, score: lexicalMismatch(input.title, fullText), source: "lexical_fallback" };
  }
}
