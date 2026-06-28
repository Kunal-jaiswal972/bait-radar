import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { env } from "../config/env";
import { parseAtomUpload } from "../domain/atom";
import { markSubscriptionVerified } from "../services/channelService";
import { publishVideoIngestion } from "../services/ingestionService";

/**
 * /api/webhook/youtube
 *   GET  -> PubSubHubbub verification handshake (echo hub.challenge)
 *   POST -> parse Atom upload, publish to video-ingestion-hub, return 202
 */
export async function youtubeWebhookHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return request.method === "GET"
    ? handleVerification(request, context)
    : handleNotification(request, context);
}

function handleVerification(request: HttpRequest, context: InvocationContext): HttpResponseInit {
  const challenge = request.query.get("hub.challenge");
  const mode = request.query.get("hub.mode");
  const topic = request.query.get("hub.topic");
  const verifyToken = request.query.get("hub.verify_token");

  if (!challenge) return { status: 400, body: "Missing hub.challenge" };

  // Enforce the shared secret only if one is configured.
  const expectedToken = env().PUBSUBHUBBUB_VERIFY_TOKEN;
  if (expectedToken && verifyToken && verifyToken !== expectedToken) {
    context.warn("Webhook verification token mismatch");
    return { status: 404, body: "Verification token mismatch" };
  }

  if (mode === "subscribe" && topic) {
    const channelId = new URL(topic).searchParams.get("channel_id") ?? undefined;
    if (channelId) {
      // Best-effort; the challenge response must not wait on Cosmos.
      markSubscriptionVerified(channelId, context).catch((err) =>
        context.warn("Could not update subscription status", err)
      );
    }
  }

  context.log(`Verified hub ${mode} for topic ${topic}`);
  return { status: 200, headers: { "Content-Type": "text/plain" }, body: challenge };
}

async function handleNotification(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Always ack with 202; the hub retries on non-2xx, so we avoid heavy work and
  // never fail a bad payload back to it.
  try {
    const upload = await parseAtomUpload(await request.text());
    if (upload) {
      await publishVideoIngestion({
        videoId: upload.videoId,
        channelId: upload.channelId,
        publishedAt: upload.publishedAt,
        source: "webhook",
      });
      context.log(`Published ingestion for video ${upload.videoId}`);
    } else {
      context.log("Webhook payload contained no new-upload entry; ignoring");
    }
  } catch (err) {
    context.error("Failed to process webhook notification", err);
  }
  return { status: 202 };
}

app.http("youtubeWebhook", {
  route: "webhook/youtube",
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: youtubeWebhookHandler,
});
