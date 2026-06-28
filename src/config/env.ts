import { z } from "zod";

const envSchema = z.object({
  // Required for the core pipeline.
  COSMOS_CONNECTION_STRING: z.string().min(1),
  EVENTHUB_CONNECTION_STRING: z.string().min(1),
  YOUTUBE_API_KEY: z.string().min(1),

  // Have sensible defaults.
  COSMOS_DATABASE: z.string().default("ytanalytics"),
  EVENTHUB_NAME: z.string().default("video-ingestion-hub"),
  PUBSUBHUBBUB_HUB_URL: z.string().default("https://pubsubhubbub.appspot.com/subscribe"),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  PYTHON_BIN: z.string().default("python"),
  MIN_VIDEO_SECONDS_THRESHOLD: z.coerce.number().default(60), // videos shorter than this are treated as Shorts and skipped

  // Optional: features degrade or are environment-specific.
  PUBSUBHUBBUB_CALLBACK_URL: z.string().optional(),
  PUBSUBHUBBUB_VERIFY_TOKEN: z.string().optional(),
  PUBSUBHUBBUB_LEASE_SECONDS: z.coerce.number().optional(),
  GEMINI_API_KEY: z.string().optional(),
  VISION_ENDPOINT: z.string().optional(),
  VISION_KEY: z.string().optional(),
  LANGUAGE_ENDPOINT: z.string().optional(),
  LANGUAGE_KEY: z.string().optional(),
  SCRIPTS_DIR: z.string().optional(),
  LEXICON_DIR: z.string().optional(), // dir holding the clickbait/betrayal/stopword .txt files
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Returns the validated environment (parsed once, then cached). Core services
 * fail fast with a clear error if required vars are missing; feature vars (AI
 * keys, pubsub) are optional and guarded where used.
 */
export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(`Invalid environment configuration: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
