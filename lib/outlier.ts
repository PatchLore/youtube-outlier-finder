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
 * Determines the velocity threshold for the top 10-15% of videos in a search set
 * Uses relative comparison to identify accelerating videos
 * 
 * @param viewsPerDayArray Array of viewsPerDay values from the current search set (can include nulls)
 * @param percentile Percentile to use for threshold (default: 0.125 = 12.5%, middle of 10-15% range)
 * @returns The threshold value, or null if insufficient data
 */
export function calculateVelocityThreshold(
  viewsPerDayArray: (number | null)[],
  percentile: number = 0.125
): number | null {
  // Filter out null values and invalid numbers
  const validVelocities = viewsPerDayArray
    .filter((v): v is number => v !== null && !isNaN(v) && v > 0)
    .sort((a, b) => b - a); // Sort descending

  // Need at least 10 videos to calculate meaningful percentile
  if (validVelocities.length < 10) {
    return null;
  }

  // Calculate index for top percentile (e.g., top 12.5% = index at 12.5% from top)
  const thresholdIndex = Math.floor(validVelocities.length * percentile);
  const clampedIndex = Math.max(0, Math.min(thresholdIndex, validVelocities.length - 1));
  
  return validVelocities[clampedIndex];
}

/**
 * Determines if a video is "accelerating" based on relative velocity comparison
 * A video is accelerating if its viewsPerDay is in the top 10-15% for the current search set
 * 
 * @param viewsPerDay Views per day for the video (can be null)
 * @param velocityThreshold Threshold value from calculateVelocityThreshold (can be null)
 * @returns true if video is accelerating, false otherwise
 */
export function isAccelerating(
  viewsPerDay: number | null,
  velocityThreshold: number | null
): boolean {
  // Safe handling: if either value is missing, return false
  if (viewsPerDay === null || velocityThreshold === null) {
    return false;
  }

  // Video is accelerating if its velocity is at or above the threshold
  return viewsPerDay >= velocityThreshold;
}

/**
 * Calculates the average like ratio from a search set
 * Used for relative engagement comparison
 * 
 * @param likeRatios Array of like ratios from the search set (can include nulls)
 * @returns The average like ratio, or null if insufficient data
 */
export function calculateAverageLikeRatio(
  likeRatios: (number | null)[]
): number | null {
  // Filter out null values and invalid numbers
  const validRatios = likeRatios.filter(
    (r): r is number => r !== null && !isNaN(r) && r >= 0 && r <= 1
  );

  // Need at least 5 videos with valid like ratios for meaningful average
  if (validRatios.length < 5) {
    return null;
  }

  const sum = validRatios.reduce((acc, ratio) => acc + ratio, 0);
  return sum / validRatios.length;
}

/**
 * Calculates the average multiplier for the top results of a search set
 * Used for niche-relative outlier detection
 * 
 * @param multipliers Array of multipliers from the search set (can include nulls/invalid)
 * @param topN Number of top results to use for average (default: 10)
 * @returns The average multiplier of top results, or null if insufficient data
 */
export function calculateNicheAverageMultiplier(
  multipliers: (number | null)[],
  topN: number = 10
): number | null {
  // Filter out null values and invalid numbers
  const validMultipliers = multipliers.filter(
    (m): m is number => m !== null && !isNaN(m) && m > 0
  );

  // Need at least 5 videos with valid multipliers for meaningful average
  if (validMultipliers.length < 5) {
    return null;
  }

  // Sort descending and take top N
  const sorted = [...validMultipliers].sort((a, b) => b - a);
  const topResults = sorted.slice(0, Math.min(topN, sorted.length));
  
  const sum = topResults.reduce((acc, mult) => acc + mult, 0);
  return sum / topResults.length;
}

/**
 * Composite outlier score for a video. Uses base multiplier, log10 confidence,
 * time-decay (freshness), and channel-size penalty.
 *
 * @param views - View count (must be > 0; otherwise returns 0).
 * @param subscribers - Channel subscriber count (hidden/missing treated as 0; denominator uses max(subscribers, 1)).
 * @param publishedAt - Publish date (ISO string, Date, or ms). Optional; if missing, freshness = 1.0.
 * @returns Score as a non-negative float; 0 for invalid/edge cases.
 *
 * @remarks
 * **1. Base multiplier**
 *   `base = views / max(subscribers, 1)`
 *   Measures "views per subscriber" (virality). Small channels with many views get a high base.
 *
 * **2. Log10 confidence**
 *   `confidence = log10(views)` when views >= 1, else 0.
 *   Down-weights very low view counts (e.g. 10 views → 1, 1000 → 3) so scores reflect both
 *   virality and scale. Prevents tiny channels with one viral hit from dominating.
 *
 * **3. Time-decay (freshness)**
 *   Days since publish → multiplier:
 *   - &lt; 7 days:  1.5x (recent content boosted)
 *   - &lt; 30 days: 1.2x
 *   - ≤ 90 days:  1.0x
 *   - &gt; 90 days: 0.7x (older content discounted)
 *   Missing/invalid publishedAt → 1.0x.
 *
 * **4. Channel penalty**
 *   Large channels are penalized so small-channel breakouts rank higher:
 *   - &gt; 1M subs: 0.5x
 *   - &gt; 100k:    0.7x
 *   - else:        1.0x
 *
 * **Final formula**
 *   `score = base × confidence × freshness × channelPenalty`
 */
export function calculateOutlierScore(
  views: number,
  subscribers: number,
  publishedAt?: string | Date | number | null
): number {
  const v = Number(views);
  const subs =
    subscribers === null || subscribers === undefined || !Number.isFinite(Number(subscribers))
      ? 0
      : Math.max(0, Number(subscribers));

  if (!Number.isFinite(v) || v <= 0) {
    return 0;
  }

  const base = v / Math.max(subs, 1);

  let confidence: number;
  if (v >= 1) {
    confidence = Math.log10(v);
    if (!Number.isFinite(confidence) || confidence < 0) confidence = 0;
  } else {
    confidence = 0;
  }

  let freshness = 1.0;
  if (publishedAt != null && publishedAt !== "") {
    const date =
      typeof publishedAt === "number"
        ? new Date(publishedAt)
        : new Date(String(publishedAt));
    if (Number.isFinite(date.getTime())) {
      const now = Date.now();
      const daysAgo = (now - date.getTime()) / (1000 * 60 * 60 * 24);
      if (daysAgo < 7) freshness = 1.5;
      else if (daysAgo < 30) freshness = 1.2;
      else if (daysAgo <= 90) freshness = 1.0;
      else freshness = 0.7;
    }
  }

  let channelPenalty = 1.0;
  if (subs > 1_000_000) channelPenalty = 0.5;
  else if (subs > 100_000) channelPenalty = 0.7;

  const score = base * confidence * freshness * channelPenalty;
  return Number.isFinite(score) && score >= 0 ? score : 0;
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
 * Tier classifications for outlier videos
 * Tiers are additive - a video can have multiple tiers
 */
export type OutlierTier = "breakout" | "emerging" | "high_signal" | "niche_outlier";

/**
 * Options for classifying outlier tiers
 */
export interface ClassifyOutlierOptions {
  views: number;
  subscribers: number;
  viewsPerDay: number | null;
  likeRatio: number | null; // likes / views ratio (0-1)
  nicheAverageMultiplier: number | null; // Average multiplier for top results in the search set
  nicheAverageLikeRatio: number | null; // Average like ratio for all videos in the search set
  breakoutCount: number; // Number of breakouts in the current search set (0 means no breakouts)
  isFresh: boolean; // Whether video is considered "fresh" (e.g., within 30 days)
}

/**
 * Classifies an outlier video into one or more tiers
 * Tiers are additive - a video can qualify for multiple tiers
 * 
 * @param options Classification options
 * @returns Array of tiers the video qualifies for
 */
export function classifyOutlier(options: ClassifyOutlierOptions): OutlierTier[] {
  const { views, subscribers, viewsPerDay, likeRatio, nicheAverageMultiplier, nicheAverageLikeRatio, breakoutCount, isFresh } = options;
  const tiers: OutlierTier[] = [];

  // Calculate multiplier for tier checks
  const multiplier = calculateViralityMultiplier(views, subscribers);

  // 1. Breakout tier: existing 3× logic (unchanged)
  if (multiplier >= 3 && views >= 1_000) {
    tiers.push("breakout");
  }

  // 2. Emerging tier: high views/day relative to channel size
  // Criteria: views/day > 500 AND views/day > (subscribers * 0.1)
  // This identifies videos with high velocity relative to channel size
  if (viewsPerDay !== null && viewsPerDay > 500) {
    const safeSubscribers = subscribers === 0 || subscribers == null ? 100 : subscribers;
    const relativeVelocity = viewsPerDay / safeSubscribers;
    if (relativeVelocity > 0.1) {
      tiers.push("emerging");
    }
  }

  // 3. High signal tier: high engagement efficiency (likes/views)
  // Criteria: like ratio significantly above average for search set AND views >= 1,000
  // Uses relative comparison, not absolute thresholds
  if (likeRatio !== null && nicheAverageLikeRatio !== null && views >= 1_000) {
    // Video is high signal if its like ratio is at least 1.5x the average
    // This identifies videos with unusually strong engagement relative to the search set
    if (likeRatio > (nicheAverageLikeRatio * 1.5)) {
      tiers.push("high_signal");
    }
  }

  // 4. Niche outlier tier: fallback when no breakouts exist
  // Criteria: multiplier >= (nicheAverage * 3.0) AND multiplier >= 2.0 AND breakoutCount === 0
  // Only applies when no 3× breakouts exist in the search set
  // This surfaces videos that significantly outperform their niche (≥200% above average)
  // when no true breakouts are found
  if (nicheAverageMultiplier !== null && multiplier >= 2.0 && options.breakoutCount === 0) {
    // Video must exceed niche average by at least 200% (3x the average)
    const isAboveNicheAverage = multiplier >= (nicheAverageMultiplier * 3.0);
    const isNotBreakout = !tiers.includes("breakout");
    if (isAboveNicheAverage && isNotBreakout) {
      tiers.push("niche_outlier");
    }
  }

  return tiers;
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
