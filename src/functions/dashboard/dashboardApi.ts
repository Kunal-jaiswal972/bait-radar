import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { getVideoDetail, listChannels, listVideos } from "../../services/dashboardService";
import { refreshVideo } from "../../services/videoActionService";

// Thin controllers for the dashboard SPA: validate inputs, delegate to the
// services, return JSON. No data access or business logic here.

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

const paginationSchema = z.object({
  channelId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

function queryToObject(request: HttpRequest): Record<string, string> {
  return Object.fromEntries(request.query.entries());
}

/** GET /api/dashboard/channels — channel summaries with rollups. */
export async function listChannelsHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const channels = await listChannels(context);
    return { status: 200, jsonBody: channels };
  } catch (err) {
    context.error("dashboard: listChannels failed", err);
    return { status: 500, jsonBody: { error: "Failed to load channels" } };
  }
}

/** GET /api/dashboard/videos — recent video cards (optional ?channelId, limit, offset). */
export async function listVideosHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const parsed = paginationSchema.safeParse(queryToObject(request));
  if (!parsed.success) {
    return { status: 400, jsonBody: { error: "Invalid query parameters" } };
  }
  try {
    const videos = await listVideos(parsed.data, context);
    return { status: 200, jsonBody: videos };
  } catch (err) {
    context.error("dashboard: listVideos failed", err);
    return { status: 500, jsonBody: { error: "Failed to load videos" } };
  }
}

/** GET /api/dashboard/channels/{channelId}/videos — video cards for one channel. */
export async function listChannelVideosHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const channelId = request.params.channelId;
  if (!channelId) {
    return { status: 400, jsonBody: { error: "Missing channelId" } };
  }
  const parsed = paginationSchema.safeParse({ ...queryToObject(request), channelId });
  if (!parsed.success) {
    return { status: 400, jsonBody: { error: "Invalid query parameters" } };
  }
  try {
    const videos = await listVideos(parsed.data, context);
    return { status: 200, jsonBody: videos };
  } catch (err) {
    context.error("dashboard: listChannelVideos failed", err);
    return { status: 500, jsonBody: { error: "Failed to load videos" } };
  }
}

/** GET /api/dashboard/videos/{videoId} — full per-video detail. */
export async function getVideoDetailHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const videoId = request.params.videoId;
  if (!videoId) {
    return { status: 400, jsonBody: { error: "Missing videoId" } };
  }
  try {
    const detail = await getVideoDetail(videoId, context);
    if (!detail) {
      return { status: 404, jsonBody: { error: "Video not found" } };
    }
    return { status: 200, jsonBody: detail };
  } catch (err) {
    context.error("dashboard: getVideoDetail failed", err);
    return { status: 500, jsonBody: { error: "Failed to load video" } };
  }
}

/** POST /api/dashboard/videos/{videoId}/refresh — re-run extraction + AI on demand. */
export async function refreshVideoHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const videoId = request.params.videoId;
  if (!videoId) {
    return { status: 400, jsonBody: { error: "Missing videoId" } };
  }
  try {
    const queued = await refreshVideo(videoId, context);
    if (!queued) {
      return { status: 404, jsonBody: { error: "Video not found" } };
    }
    return { status: 202, jsonBody: { status: "queued", videoId } };
  } catch (err) {
    context.error("dashboard: refreshVideo failed", err);
    return { status: 500, jsonBody: { error: "Failed to queue refresh" } };
  }
}

app.http("dashboardChannels", {
  route: "dashboard/channels",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: listChannelsHandler,
});

app.http("dashboardVideos", {
  route: "dashboard/videos",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: listVideosHandler,
});

app.http("dashboardChannelVideos", {
  route: "dashboard/channels/{channelId}/videos",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: listChannelVideosHandler,
});

app.http("dashboardVideoDetail", {
  route: "dashboard/videos/{videoId}",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: getVideoDetailHandler,
});

app.http("dashboardVideoRefresh", {
  route: "dashboard/videos/{videoId}/refresh",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: refreshVideoHandler,
});
