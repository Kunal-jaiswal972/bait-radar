// Azure AI Vision (Image Analysis 4.0) client singleton.

import createImageAnalysisClient, {
  type ImageAnalysisClient,
} from "@azure-rest/ai-vision-image-analysis";
import { AzureKeyCredential } from "@azure/core-auth";
import { env } from "../config/env";

let client: ImageAnalysisClient | undefined;

export function getVisionClient(): ImageAnalysisClient {
  if (!client) {
    const e = env();
    if (!e.VISION_ENDPOINT || !e.VISION_KEY) {
      throw new Error("VISION_ENDPOINT / VISION_KEY are not configured");
    }
    client = createImageAnalysisClient(e.VISION_ENDPOINT, new AzureKeyCredential(e.VISION_KEY));
  }
  return client;
}
