// YouTube video metadata + top comments via the Data API.

import { buildYoutubeUrl } from "../clients/youtubeClient";

export interface VideoDetails {
  title: string;
  description: string;
  thumbnailUrl: string;
  videoUrl: string;
  publishedAt: string;
  viewCount: number;
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

// Fetches snippet + statistics. Returns null if the video is missing
// (deleted/private) so the caller can skip cleanly.
export async function getVideoDetails(videoId: string): Promise<VideoDetails | null> {
  const url = buildYoutubeUrl("videos", { part: "snippet,statistics", id: videoId });

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`videos.list failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    items?: Array<{
      snippet?: {
        title?: string;
        description?: string;
        publishedAt?: string;
        thumbnails?: Record<string, YtThumbnail>;
      };
      statistics?: { viewCount?: string };
    }>;
  };

  const item = data.items?.[0];
  if (!item) return null;

  const snippet = item.snippet ?? {};
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
    thumbnailUrl,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    publishedAt: snippet.publishedAt ?? new Date().toISOString(),
    viewCount: Number(item.statistics?.viewCount ?? 0),
  };
}

// Fetches up to `max` relevance-ordered top-level comments. Returns [] when
// comments are disabled (permanent); throws on transient errors.
export async function getTopComments(videoId: string, max = 100): Promise<RawComment[]> {
  const url = buildYoutubeUrl("commentThreads", {
    part: "snippet",
    videoId,
    order: "relevance",
    maxResults: String(Math.min(max, 100)),
    textFormat: "plainText",
  });

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403 && body.includes("commentsDisabled")) {
      return [];
    }
    throw new Error(`commentThreads.list failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
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
  };

  return (data.items ?? []).slice(0, max).map((item) => {
    const c = item.snippet?.topLevelComment?.snippet ?? {};
    return {
      id: item.id,
      author: c.authorDisplayName ?? "unknown",
      text: c.textOriginal ?? "",
      timestamp: c.publishedAt ?? new Date().toISOString(),
    };
  });
}
