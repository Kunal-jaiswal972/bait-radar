import { readFileSync } from "node:fs";
import path from "node:path";
import { env } from "../config/env";

function loadList(file: string, fallback: string[]): string[] {
  try {
    const dir = env().LEXICON_DIR ?? path.join(process.cwd(), "src", "data");
    const raw = readFileSync(path.join(dir, file), "utf-8");
    const items = raw
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    return items.length ? [...new Set(items)] : fallback;
  } catch {
    return fallback;
  }
}

export const CLICKBAIT_WORDS = loadList("clickbait-words.txt", [
  "never", "always", "shocking", "insane", "unbelievable", "gone wrong",
  "you won't believe", "secret", "exposed", "the truth", "must watch",
]);

export const BETRAYAL_PHRASES = loadList("betrayal-phrases.txt", [
  "clickbait", "click bait", "lied", "misleading", "scam", "fake",
  "where is the", "nothing happened", "waste of time", "doesn't deliver",
]);

export const STOPWORDS = new Set(
  loadList("stopwords.txt", [
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for",
    "with", "is", "are", "was", "be", "this", "that", "how", "why", "what",
  ])
);
