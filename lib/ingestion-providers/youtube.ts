import type { IngestionProvider, SearchResult } from "./types";
import {
  fetchYouTubeSearch,
  fetchVideoDetails,
  fetchChannelDetails,
  buildEnrichedVideos,
} from "@/lib/youtube-ingest";

const QUOTA_SEARCH = 100;
const QUOTA_VIDEOS = 1;
const QUOTA_CHANNELS = 1;
export const YOUTUBE_QUOTA_PER_SEARCH =
  QUOTA_SEARCH + QUOTA_VIDEOS + QUOTA_CHANNELS;

const DEFAULT_MAX_RESULTS = 15;

export function createYouTubeProvider(
  apiKey: string,
  maxResults: number = DEFAULT_MAX_RESULTS
): IngestionProvider {
  return {
    name: "youtube",
    async searchAndEnrich(query: string): Promise<SearchResult> {
      const { videoIds, channelIds } = await fetchYouTubeSearch(
        apiKey,
        query,
        maxResults
      );
      if (videoIds.length === 0) {
        return { videos: [], quotaUnitsUsed: YOUTUBE_QUOTA_PER_SEARCH };
      }
      const videoItems = await fetchVideoDetails(apiKey, videoIds);
      const channelMap = await fetchChannelDetails(apiKey, channelIds);
      const videos = buildEnrichedVideos(videoItems, channelMap);
      return {
        videos,
        quotaUnitsUsed: YOUTUBE_QUOTA_PER_SEARCH,
      };
    },
  };
}
