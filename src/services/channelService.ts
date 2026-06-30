import { buildYoutubeUrl } from "../clients/youtubeClient";
import { env } from "../config/env";
import { topicUrlForChannel } from "../domain/atom";
import { aggregateChannel } from "../domain/clickbait";
import { channelRepository, videoInsightsRepository } from "../db/repositories";
import type { Channel, ChannelClickbait, Logger } from "../types";

/**
 * Resolves a canonical channel id from a raw id, a /channel/UC... URL, or a
 * handle/custom URL (the latter requires a YouTube Data API lookup).
 */
export async function resolveChannelId(input: string): Promise<string> {
  const value = input.trim();

  if (/^UC[\w-]{22}$/.test(value)) return value;

  const channelMatch = value.match(/channel\/(UC[\w-]{22})/);
  if (channelMatch) return channelMatch[1];

  const handle = extractHandle(value);
  if (!handle) {
    throw new Error(`Could not derive a channel id from input: "${input}"`);
  }
  return lookupChannelIdByHandle(handle);
}

// Pulls a handle from "@name", ".../@name", ".../c/name", ".../user/name", or a bare token.
function extractHandle(value: string): string | undefined {
  const atMatch = value.match(/@([\w.-]+)/);
  if (atMatch) return atMatch[1];

  const customMatch = value.match(/\/(?:c|user)\/([\w.-]+)/);
  if (customMatch) return customMatch[1];

  if (/^[\w.-]+$/.test(value)) return value;
  return undefined;
}

async function lookupChannelIdByHandle(handle: string): Promise<string> {
  const url = buildYoutubeUrl("channels", { part: "id", forHandle: handle.replace(/^@/, "") });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube channel lookup failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { items?: Array<{ id: string }> };
  const id = data.items?.[0]?.id;
  if (!id) throw new Error(`No channel found for handle "${handle}"`);
  return id;
}

// Fires an async subscribe request; the hub confirms via a GET challenge to the
// callback (handled by the webhook function).
async function sendSubscriptionRequest(channelId: string): Promise<void> {
  const e = env();
  if (!e.PUBSUBHUBBUB_CALLBACK_URL) {
    throw new Error("PUBSUBHUBBUB_CALLBACK_URL is not configured");
  }

  const form = new URLSearchParams();
  form.set("hub.callback", e.PUBSUBHUBBUB_CALLBACK_URL);
  form.set("hub.topic", topicUrlForChannel(channelId));
  form.set("hub.verify", "async");
  form.set("hub.mode", "subscribe");
  if (e.PUBSUBHUBBUB_VERIFY_TOKEN) form.set("hub.verify_token", e.PUBSUBHUBBUB_VERIFY_TOKEN);
  if (e.PUBSUBHUBBUB_LEASE_SECONDS) form.set("hub.lease_seconds", String(e.PUBSUBHUBBUB_LEASE_SECONDS));

  const res = await fetch(e.PUBSUBHUBBUB_HUB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (res.status !== 202 && res.status !== 204) {
    throw new Error(`Hub subscription failed: ${res.status} ${await res.text()}`);
  }
}

export interface RegisterChannelResult {
  channelId: string;
  hubSubscriptionStatus: Channel["hubSubscriptionStatus"];
  subscriptionRequested: boolean;
}

/**
 * Resolves + persists the channel, then fires the subscription request. The
 * channel is always saved; a subscription failure is non-fatal.
 */
export async function registerChannel(
  input: string,
  logger: Logger
): Promise<RegisterChannelResult> {
  const channelId = await resolveChannelId(input);
  const now = new Date().toISOString();

  const existing = await channelRepository.read(channelId, channelId, logger);
  const doc: Channel = {
    id: channelId,
    channelId,
    url: input.startsWith("http") ? input : undefined,
    topicUrl: topicUrlForChannel(channelId),
    hubSubscriptionStatus: "pending",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await channelRepository.upsert(doc);

  let subscriptionRequested = true;
  try {
    await sendSubscriptionRequest(channelId);
  } catch (err) {
    subscriptionRequested = false;
    logger.warn("Subscription request failed (channel still saved)", err);
  }

  return { channelId, hubSubscriptionStatus: doc.hubSubscriptionStatus, subscriptionRequested };
}

interface VideoStatRow {
  publishedAt: string;
  pct: number;
  betrayal: number;
  channelTitle: string;
}

/** First non-empty channel title across the projected video rows, if any. */
function deriveChannelTitle(rows: VideoStatRow[]): string | undefined {
  return rows.find((r) => r.channelTitle?.trim())?.channelTitle?.trim();
}

/**
 * Recomputes the channel's clickbait propensity from its analyzed videos and
 * persists it onto the Channels doc. Uses a projected query (just the three
 * numbers it needs) rather than loading full video documents.
 */
export async function updateChannelClickbait(
  channelId: string,
  logger?: Logger
): Promise<ChannelClickbait | undefined> {
  const rows = await videoInsightsRepository.queryProjection<VideoStatRow>({
    query:
      "SELECT c.publishedAt AS publishedAt, " +
      "c.insights.clickbait.clickbait_percentage AS pct, " +
      "c.insights.clickbait.betrayal.betrayal_rate AS betrayal, " +
      "c.metadata.channelTitle AS channelTitle " +
      "FROM c WHERE c.channelId = @c",
    parameters: [{ name: "@c", value: channelId }],
  });
  if (rows.length === 0) return undefined;

  const rollup = aggregateChannel(
    rows.map((r) => ({
      clickbait_percentage: r.pct ?? 0,
      publishedAt: r.publishedAt,
      betrayal_rate: r.betrayal ?? 0,
    }))
  );

  const channel = await channelRepository.read(channelId, channelId, logger);
  if (!channel) return undefined;
  const clickbait: ChannelClickbait = { ...rollup, updated_at: new Date().toISOString() };
  channel.clickbait = clickbait;
  // Backfill the display title from the channel's videos (the registration flow
  // doesn't know it; only the Data API responses on ingestion carry it).
  if (!channel.title?.trim()) channel.title = deriveChannelTitle(rows);
  channel.updatedAt = new Date().toISOString();
  await channelRepository.upsert(channel);
  return clickbait;
}

/** Marks a channel's subscription verified (called from the webhook handshake). */
export async function markSubscriptionVerified(
  channelId: string,
  logger?: Logger
): Promise<void> {
  const channel = await channelRepository.read(channelId, channelId, logger);
  if (!channel) return;
  channel.hubSubscriptionStatus = "verified";
  channel.updatedAt = new Date().toISOString();
  await channelRepository.upsert(channel);
}
