/**
 * Calculates the virality multiplier for a video
 * This represents how many views per subscriber the video has
 * Higher multiplier = more viral (relative to subscriber count)
 */
export function calculateViralityMultiplier(
  views: number,
  subscribers: number
): number {
  // Treat missing or zero subscribers as a small baseline audience
  // so that small channels can still show meaningful virality
  const safeSubscribers =
    subscribers === 0 || subscribers == null ? 100 : subscribers;

  return views / safeSubscribers;
}

/**
 * Determines if a video is an outlier based on its performance
 * An outlier is a video that performs significantly better than expected
 * based on the channel's subscriber count
 *
 * Criteria (tuned for realistic small-channel breakouts):
 * - Minimum views: 1,000 (filters out low-signal videos)
 * - Virality multiplier threshold: 3 (views >= 3x subscriber count,
 *   or >= 3x the 100-subscriber baseline if subs are 0 / missing)
 */
export function isOutlierVideo(
  views: number,
  subscribers: number
): boolean {
  // Require a minimum absolute performance level
  if (views < 1_000) return false;

  const multiplier = calculateViralityMultiplier(views, subscribers);

  // Consider it an outlier if the video is performing at least 3x
  // relative to the channel's subscriber base (or baseline)
  return multiplier >= 3;
}
