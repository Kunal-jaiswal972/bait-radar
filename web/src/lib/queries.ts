import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  fetchChannels,
  fetchVideoDetail,
  fetchVideos,
  refreshVideo,
  registerChannel,
  type FetchVideosParams,
  type VideoActionResult,
} from "@/lib/api"
import type {
  Channel,
  RegisterChannelResult,
  VideoCard,
  VideoDetail,
} from "@/data/types"

// Query key factory keeps cache keys consistent across reads and invalidation.
export const queryKeys = {
  channels: ["channels"] as const,
  videos: (params: FetchVideosParams) => ["videos", params] as const,
  videoDetail: (videoId: string) => ["video", videoId] as const,
}

export function useChannels() {
  return useQuery<Channel[]>({
    queryKey: queryKeys.channels,
    queryFn: fetchChannels,
  })
}

export function useVideos(params: FetchVideosParams = {}) {
  return useQuery<VideoCard[]>({
    queryKey: queryKeys.videos(params),
    queryFn: () => fetchVideos(params),
  })
}

export function useVideoDetail(videoId: string | undefined) {
  return useQuery<VideoDetail>({
    queryKey: queryKeys.videoDetail(videoId ?? ""),
    queryFn: () => fetchVideoDetail(videoId ?? ""),
    enabled: Boolean(videoId),
  })
}

export function useRegisterChannel() {
  const client = useQueryClient()
  return useMutation<RegisterChannelResult, Error, string>({
    mutationFn: registerChannel,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.channels })
    },
  })
}

/** Queues an on-demand re-run of a video's extraction + AI (Phase 6). */
export function useRefreshVideo(videoId: string) {
  return useMutation<VideoActionResult, Error, void>({
    mutationFn: () => refreshVideo(videoId),
  })
}
