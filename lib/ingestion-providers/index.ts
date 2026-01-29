/**
 * Ingestion providers: primary (YouTube Data API) and secondary (Scraper API).
 * Secondary is for background ingestion only — never used in user-facing /api/search.
 */

export type { EnrichedVideo, SearchResult, IngestionProvider, ProviderName } from "./types";
export { createYouTubeProvider, YOUTUBE_QUOTA_PER_SEARCH } from "./youtube";
export { createScraperProvider, isScraperConfigured } from "./scraper";
