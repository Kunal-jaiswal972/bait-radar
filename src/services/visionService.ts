// Thumbnail analysis: OCR, tags, and objects via Azure AI Vision.

import { isUnexpected } from "@azure-rest/ai-vision-image-analysis";
import { getVisionClient } from "../clients/visionClient";

export interface VisionResult {
  ocrLines: string[]; // text overlays read off the thumbnail
  tags: string[]; // visual concept tags (may be empty if region-unsupported)
  objects: string[]; // detected object names (may be empty if region-unsupported)
}

async function analyze(imageUrl: string, features: string[]): Promise<VisionResult> {
  const result = await getVisionClient()
    .path("/imageanalysis:analyze")
    .post({
      queryParameters: { features },
      contentType: "application/json",
      body: { url: imageUrl },
    });

  if (isUnexpected(result)) {
    throw new Error(`Image analysis failed: ${result.status} ${JSON.stringify(result.body)}`);
  }

  const body = result.body;
  const ocrLines =
    body.readResult?.blocks?.flatMap((b) => b.lines?.map((l) => l.text) ?? []) ?? [];
  const tags = body.tagsResult?.values?.map((t) => t.name) ?? [];
  // Each detected object exposes a ranked tag list; take the top tag name.
  const objects =
    body.objectsResult?.values
      ?.map((o) => o.tags?.[0]?.name)
      .filter((n): n is string => Boolean(n)) ?? [];
  return { ocrLines, tags, objects };
}

// Analyzes a thumbnail. Tags/Objects are region-limited, so on failure we retry
// with Read-only; OCR is what the rest of the pipeline relies on.
export async function analyzeThumbnail(imageUrl: string): Promise<VisionResult> {
  try {
    return await analyze(imageUrl, ["Read", "Tags", "Objects"]);
  } catch (err) {
    try {
      return await analyze(imageUrl, ["Read"]);
    } catch {
      throw err;
    }
  }
}
