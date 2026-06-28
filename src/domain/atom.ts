// Pure helpers for YouTube's Atom feed: topic URL + upload-notification parsing.

import { parseStringPromise } from "xml2js";

const FEED_BASE = "https://www.youtube.com/xml/feeds/videos.xml?channel_id=";

// The feed URL used as the hub topic for a channel.
export function topicUrlForChannel(channelId: string): string {
  return `${FEED_BASE}${channelId}`;
}

export interface ParsedUpload {
  videoId: string;
  channelId: string;
  publishedAt?: string;
}

// Parses the Atom upload feed. Returns null for non-upload payloads
// (e.g. deletion tombstones).
export async function parseAtomUpload(xml: string): Promise<ParsedUpload | null> {
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  const entry = parsed?.feed?.entry;
  if (!entry) return null;

  const videoId = entry["yt:videoId"];
  const channelId = entry["yt:channelId"];
  if (!videoId || !channelId) return null;

  return { videoId, channelId, publishedAt: entry.published };
}
