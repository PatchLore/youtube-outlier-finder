import type { Channel } from "@/lib/db";

/**
 * Returns true if the channel should be refreshed (re-fetched from YouTube).
 * Refresh when: last_updated_at is missing, or when >30 days old AND the channel
 * has high priority (e.g. appeared in a recent search).
 *
 * In the ingest loop, before processing videos:
 *   if (shouldRefreshChannel(channel)) {
 *     await refreshChannelData(channel.youtube_channel_id);
 *     channel.update_priority = 0; // Reset after refresh
 *   }
 */
export function shouldRefreshChannel(channel: Channel): boolean {
  if (!channel.last_updated_at) return true;
  const daysSinceUpdate = Math.floor(
    (Date.now() - new Date(channel.last_updated_at).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  return daysSinceUpdate > 30 && (channel.update_priority ?? 0) > 0;
}
