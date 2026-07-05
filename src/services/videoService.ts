import { buildYoutubeUrl } from "../clients/youtubeClient";

export interface VideoDetails {
  title: string;
  description: string;
  channelTitle: string;
  thumbnailUrl: string;
  videoUrl: string;
  publishedAt: string;
  duration: string; // ISO 8601, e.g. "PT10M30S"
  durationSeconds: number; // parsed from duration; used to filter Shorts
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

// Parses an ISO 8601 duration ("PT1H2M3S") into total seconds.
function parseIsoDurationSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, h, min, s] = m;
  return Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
}

export interface RawComment {
  id: string;
  author: string;
  text: string;
  timestamp: string;
}

interface YtThumbnail {
  url: string;
}

/** Fetches snippet + statistics + contentDetails. Returns null if the video is missing (deleted/private). */
export async function getVideoDetails(videoId: string): Promise<VideoDetails | null> {
  const url = buildYoutubeUrl("videos", { part: "snippet,statistics,contentDetails", id: videoId });

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`videos.list failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    items?: Array<{
      snippet?: {
        title?: string;
        description?: string;
        channelTitle?: string;
        publishedAt?: string;
        thumbnails?: Record<string, YtThumbnail>;
      };
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails?: { duration?: string };
    }>;
  };

  const item = data.items?.[0];
  if (!item) return null;

  const snippet = item.snippet ?? {};
  const stats = item.statistics ?? {};
  const thumbnails = snippet.thumbnails ?? {};
  // Prefer maxresdefault, falling back through the standard sizes.
  const thumbnailUrl =
    thumbnails.maxres?.url ??
    thumbnails.standard?.url ??
    thumbnails.high?.url ??
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

  return {
    title: snippet.title ?? "",
    description: snippet.description ?? "",
    channelTitle: snippet.channelTitle ?? "",
    thumbnailUrl,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    publishedAt: snippet.publishedAt ?? new Date().toISOString(),
    duration: item.contentDetails?.duration ?? "",
    durationSeconds: parseIsoDurationSeconds(item.contentDetails?.duration ?? ""),
    // likeCount/commentCount are absent when disabled; dislikeCount is no longer public.
    viewCount: Number(stats.viewCount ?? 0),
    likeCount: Number(stats.likeCount ?? 0),
    commentCount: Number(stats.commentCount ?? 0),
  };
}

/**
 * Returns the `max` most recent upload video ids for a channel via its uploads
 * playlist (channel id "UC…" maps to playlist "UU…"). Used by the backfill
 * script to seed analysis data without waiting for new uploads.
 */
export async function getRecentUploads(channelId: string, max = 3): Promise<string[]> {
  const uploadsPlaylistId = `UU${channelId.slice(2)}`;
  const url = buildYoutubeUrl("playlistItems", {
    part: "contentDetails",
    playlistId: uploadsPlaylistId,
    maxResults: String(Math.min(max, 50)),
  });

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`playlistItems.list failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    items?: Array<{ contentDetails?: { videoId?: string } }>;
  };

  return (data.items ?? [])
    .map((i) => i.contentDetails?.videoId)
    .filter((v): v is string => Boolean(v))
    .slice(0, max);
}

interface CommentThreadsResponse {
  items?: Array<{
    id: string;
    snippet?: {
      topLevelComment?: {
        snippet?: {
          authorDisplayName?: string;
          textOriginal?: string;
          publishedAt?: string;
        };
      };
    };
  }>;
  nextPageToken?: string;
}

export interface GetCommentsOptions {
  max?: number; // total comments to fetch (default 100)
  order?: "time" | "relevance"; // "relevance" = YouTube's top comments (default)
}

/**
 * Fetches up to `max` top-level comments, paginating in pages of 100 (the API
 * per-page cap). Defaults to the top 100 by relevance — the comments most likely
 * to reflect the audience's verdict, which is what the betrayal pillar and
 * sentiment summary score. Returns [] when comments are disabled (permanent);
 * throws on transient errors.
 */
export async function getRecentComments(
  videoId: string,
  options: GetCommentsOptions = {}
): Promise<RawComment[]> {
  const max = options.max ?? 100;
  const order = options.order ?? "relevance";
  const out: RawComment[] = [];
  let pageToken: string | undefined;

  while (out.length < max) {
    const params: Record<string, string> = {
      part: "snippet",
      videoId,
      order,
      maxResults: String(Math.min(100, max - out.length)),
      textFormat: "plainText",
    };
    if (pageToken) params.pageToken = pageToken;

    const res = await fetch(buildYoutubeUrl("commentThreads", params));
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 403 && body.includes("commentsDisabled")) return out;
      throw new Error(`commentThreads.list failed: ${res.status} ${body}`);
    }

    const data = (await res.json()) as CommentThreadsResponse;
    for (const item of data.items ?? []) {
      const c = item.snippet?.topLevelComment?.snippet ?? {};
      out.push({
        id: item.id,
        author: c.authorDisplayName ?? "unknown",
        text: c.textOriginal ?? "",
        timestamp: c.publishedAt ?? new Date().toISOString(),
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return out.slice(0, max);
}
