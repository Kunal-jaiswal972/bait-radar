// POST /api/channels — registers a YouTube channel and subscribes to its feed.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { registerChannel } from "../services/channelService";

const bodySchema = z.object({
  channel: z.string().optional(),
  url: z.string().optional(),
  channelId: z.string().optional(),
});

export async function registerChannelHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }

  const input = parsed.data.channel ?? parsed.data.url ?? parsed.data.channelId;
  if (!input) {
    return {
      status: 400,
      jsonBody: { error: "Provide a channel URL or id via 'channel', 'url', or 'channelId'." },
    };
  }

  try {
    const result = await registerChannel(input, context);
    return { status: 201, jsonBody: result };
  } catch (err) {
    context.error("Channel registration failed", err);
    return { status: 422, jsonBody: { error: (err as Error).message } };
  }
}

app.http("registerChannel", {
  route: "channels",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: registerChannelHandler,
});
