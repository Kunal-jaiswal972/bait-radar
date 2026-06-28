import { AzureKeyCredential, TextAnalysisClient } from "@azure/ai-language-text";
import { env } from "../config/env";

let client: TextAnalysisClient | undefined;

/** Azure AI Language (Text Analysis) client singleton. */
export function getLanguageClient(): TextAnalysisClient {
  if (!client) {
    const e = env();
    if (!e.LANGUAGE_ENDPOINT || !e.LANGUAGE_KEY) {
      throw new Error("LANGUAGE_ENDPOINT / LANGUAGE_KEY are not configured");
    }
    client = new TextAnalysisClient(e.LANGUAGE_ENDPOINT, new AzureKeyCredential(e.LANGUAGE_KEY));
  }
  return client;
}
