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
 * Calculates views per day for a video
 * Useful for identifying videos with high velocity (accelerating growth)
 */
export function calculateViewsPerDay(
  views: number,
  publishedAt: string | Date | null | undefined
): number | null {
  if (!publishedAt) return null;

  const publishedDate = typeof publishedAt === "string" 
    ? new Date(publishedAt) 
    : publishedAt;
  
  if (isNaN(publishedDate.getTime())) return null;

  const now = new Date();
  const daysSincePublished = (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSincePublished <= 0) return null;
  
  return views / daysSincePublished;
}

/**
 * Options for outlier detection with freshness/velocity support
 */
export interface OutlierOptions {
  /**
   * Filter by published date (last N days)
   * If specified, only videos published within this window are considered
   */
  maxDaysOld?: number; // 30, 60, or 90
  
  /**
   * Enable views-per-day weighting for recent videos
   * When true, recent videos with high velocity get a boost
   */
  useVelocityWeighting?: boolean;
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
  subscribers: number,
  publishedAt?: string | Date | null,
  options?: OutlierOptions
): boolean {
  // Require a minimum absolute performance level
  if (views < 1_000) return false;

  // Apply date filter if specified
  if (options?.maxDaysOld) {
    if (!publishedAt) return false;
    
    const publishedDate = typeof publishedAt === "string" 
      ? new Date(publishedAt) 
      : publishedAt;
    
    if (isNaN(publishedDate.getTime())) return false;
    
    const now = new Date();
    const daysSincePublished = (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSincePublished > options.maxDaysOld) return false;
  }

  const multiplier = calculateViralityMultiplier(views, subscribers);

  // Base outlier check: multiplier >= 3
  let isOutlier = multiplier >= 3;

  // Apply velocity weighting for recent videos if enabled
  if (options?.useVelocityWeighting && publishedAt) {
    const viewsPerDay = calculateViewsPerDay(views, publishedAt);
    if (viewsPerDay !== null) {
      // Boost threshold for high-velocity videos (views/day > 1000)
      // This helps surface videos that are accelerating quickly
      if (viewsPerDay > 1000 && multiplier >= 2) {
        isOutlier = true;
      }
    }
  }

  return isOutlier;
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
