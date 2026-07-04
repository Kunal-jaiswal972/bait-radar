import { API_BASE_URL } from "@/lib/config"
import type {
  Channel,
  RegisterChannelResult,
  VideoCard,
  VideoDetail,
} from "@/data/types"

// Typed client for the read-only dashboard API + channel registration.
// Each call validates the HTTP status and surfaces the server's error message.

interface ErrorBody {
  error?: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ErrorBody | null
    throw new Error(body?.error ?? `Request failed (${res.status})`)
  }
  return (await res.json()) as T
}

export function fetchChannels(): Promise<Channel[]> {
  return request<Channel[]>("/dashboard/channels")
}

export interface FetchVideosParams {
  channelId?: string
  limit?: number
  offset?: number
}

export function fetchVideos(params: FetchVideosParams = {}): Promise<VideoCard[]> {
  const search = new URLSearchParams()
  if (params.channelId) search.set("channelId", params.channelId)
  if (params.limit !== undefined) search.set("limit", String(params.limit))
  if (params.offset !== undefined) search.set("offset", String(params.offset))
  const qs = search.toString()
  return request<VideoCard[]>(`/dashboard/videos${qs ? `?${qs}` : ""}`)
}

export function fetchVideoDetail(videoId: string): Promise<VideoDetail> {
  return request<VideoDetail>(`/dashboard/videos/${encodeURIComponent(videoId)}`)
}

export function registerChannel(channel: string): Promise<RegisterChannelResult> {
  return request<RegisterChannelResult>("/channels", {
    method: "POST",
    body: JSON.stringify({ channel }),
  })
}

export interface VideoActionResult {
  status: string
  videoId: string
}

/** Re-run extraction + AI for a video on demand (Phase 6 write-back). */
export function refreshVideo(videoId: string): Promise<VideoActionResult> {
  return request<VideoActionResult>(
    `/dashboard/videos/${encodeURIComponent(videoId)}/refresh`,
    { method: "POST" },
  )
}
