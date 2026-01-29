import { NextResponse } from "next/server";
import { getPool, query } from "@/lib/db";
import {
  createYouTubeProvider,
  createScraperProvider,
  isScraperConfigured,
  YOUTUBE_QUOTA_PER_SEARCH,
} from "@/lib/ingestion-providers";
import type { EnrichedVideo } from "@/lib/ingestion-providers";

export const runtime = "nodejs";
export const maxDuration = 60;

const KEYWORDS_LIMIT = 3;
const MAX_RESULTS_PER_QUERY = 15;
const DEFAULT_DAILY_QUOTA_LIMIT = 10_000;

async function getTodayQuotaUsed(): Promise<number> {
  const { rows } = await query<{ total: string }>(
    `SELECT COALESCE(SUM(quota_units_used), 0)::text AS total
     FROM ingestion_jobs
     WHERE completed_at::date = CURRENT_DATE`
  );
  return parseInt(rows[0]?.total ?? "0", 10);
}

function assertCron(req: Request): void {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    throw new Error("Unauthorized");
  }
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /quota|403|429|exceeded/i.test(msg);
}

async function persistEnriched(
  enriched: EnrichedVideo[],
  keywordId: number
): Promise<number> {
  const channelIdByYoutubeId: Record<string, number> = {};

  for (const v of enriched) {
    const { rows: chRows } = await query<{ id: number }>(
      `INSERT INTO channels (youtube_channel_id, title, subscriber_count, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (youtube_channel_id) DO UPDATE SET
         title = EXCLUDED.title,
         subscriber_count = EXCLUDED.subscriber_count,
         updated_at = NOW()
       RETURNING id`,
      [v.youtube_channel_id, v.channel_title, v.subscribers]
    );
    const channelInternalId = chRows[0]?.id;
    if (channelInternalId == null) continue;
    channelIdByYoutubeId[v.youtube_channel_id] = channelInternalId;
  }

  for (const v of enriched) {
    const channelInternalId = channelIdByYoutubeId[v.youtube_channel_id];
    if (channelInternalId == null) continue;

    await query(
      `INSERT INTO videos (
        youtube_video_id, channel_id, title, thumbnail_url, views,
        published_at, multiplier, views_per_day, like_ratio, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9, NOW())
      ON CONFLICT (youtube_video_id) DO UPDATE SET
        channel_id = EXCLUDED.channel_id,
        title = EXCLUDED.title,
        thumbnail_url = EXCLUDED.thumbnail_url,
        views = EXCLUDED.views,
        published_at = EXCLUDED.published_at,
        multiplier = EXCLUDED.multiplier,
        views_per_day = EXCLUDED.views_per_day,
        like_ratio = EXCLUDED.like_ratio,
        updated_at = NOW()`,
      [
        v.youtube_video_id,
        channelInternalId,
        v.title,
        v.thumbnail_url,
        v.views,
        v.published_at,
        v.multiplier,
        v.views_per_day,
        v.like_ratio,
      ]
    );
  }

  const { rows: videoIdRows } = await query<{ id: number }>(
    `SELECT id FROM videos WHERE youtube_video_id = ANY($1::text[])`,
    [enriched.map((e) => e.youtube_video_id)]
  );

  for (const row of videoIdRows) {
    await query(
      `INSERT INTO video_keywords (video_id, keyword_id)
       VALUES ($1, $2)
       ON CONFLICT (video_id, keyword_id) DO NOTHING`,
      [row.id, keywordId]
    );
  }

  return enriched.length;
}


export async function GET(req: Request) {
  try {
    assertCron(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY not set" },
      { status: 500 }
    );
  }

  if (!getPool()) {
    return NextResponse.json(
      { error: "DATABASE_URL not set" },
      { status: 500 }
    );
  }

  const primary = createYouTubeProvider(apiKey, MAX_RESULTS_PER_QUERY);
  const secondary = isScraperConfigured() ? createScraperProvider() : null;

  let jobId: number | null = null;
  let jobQuotaUsed = 0;

  try {
    const { rows: jobRows } = await query<{ id: number }>(
      `INSERT INTO ingestion_jobs (status, job_type, query, started_at, updated_at)
       VALUES ('running', 'youtube_keyword_ingest', 'cron', NOW(), NOW())
       RETURNING id`
    );
    jobId = jobRows[0]?.id ?? null;
    if (jobId == null) {
      return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
    }

    const { rows: keywordRows } = await query<{ id: number; keyword: string }>(
      `SELECT id, keyword FROM keywords ORDER BY id LIMIT $1`,
      [KEYWORDS_LIMIT]
    );

    if (keywordRows.length === 0) {
      await query(
        `UPDATE ingestion_jobs SET status = 'completed', completed_at = NOW(), quota_units_used = 0, metadata = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify({ message: "No keywords in database" }), jobId]
      );
      return NextResponse.json({ ok: true, message: "No keywords to ingest" });
    }

    const dailyQuotaLimit = parseInt(
      process.env.QUOTA_DAILY_LIMIT ?? String(DEFAULT_DAILY_QUOTA_LIMIT),
      10
    );
    const todayUsed = await getTodayQuotaUsed();
    let totalVideos = 0;
    const errors: string[] = [];
    const providerPerKeyword: string[] = [];
    let stoppedForQuota = false;
    let useSecondaryOnly = false;

    for (const kw of keywordRows) {
      const wouldExceedQuota =
        !useSecondaryOnly &&
        todayUsed + jobQuotaUsed + YOUTUBE_QUOTA_PER_SEARCH > dailyQuotaLimit;

      if (wouldExceedQuota) {
        stoppedForQuota = true;
        if (secondary) {
          useSecondaryOnly = true;
        } else {
          errors.push(
            `Stopped: daily quota limit near (used ${todayUsed + jobQuotaUsed}, limit ${dailyQuotaLimit}); no secondary provider configured`
          );
          break;
        }
      }

      const provider = useSecondaryOnly && secondary ? secondary : primary;

      try {
        const result = await provider.searchAndEnrich(kw.keyword);
        if (result.videos.length === 0) {
          providerPerKeyword.push(provider.name);
          continue;
        }

        const persisted = await persistEnriched(result.videos, kw.id);
        totalVideos += persisted;
        jobQuotaUsed += result.quotaUnitsUsed;
        providerPerKeyword.push(provider.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const usedSecondary = useSecondaryOnly && secondary;

        if (
          !usedSecondary &&
          isQuotaError(err) &&
          secondary
        ) {
          useSecondaryOnly = true;
          try {
            const result = await secondary!.searchAndEnrich(kw.keyword);
            if (result.videos.length > 0) {
              const persisted = await persistEnriched(result.videos, kw.id);
              totalVideos += persisted;
              providerPerKeyword.push("scraper");
            } else {
              providerPerKeyword.push("scraper");
            }
          } catch (fallbackErr) {
            const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
            errors.push(`keyword "${kw.keyword}": YouTube ${msg}; scraper fallback failed: ${fallbackMsg}`);
            jobQuotaUsed += YOUTUBE_QUOTA_PER_SEARCH;
            providerPerKeyword.push("youtube");
          }
        } else {
          errors.push(`keyword "${kw.keyword}": ${msg}`);
          if (!usedSecondary) {
            jobQuotaUsed += YOUTUBE_QUOTA_PER_SEARCH;
          }
          providerPerKeyword.push(provider.name);
        }
      }
    }

    await query(
      `UPDATE ingestion_jobs SET status = 'completed', completed_at = NOW(), quota_units_used = $1, metadata = $2, updated_at = NOW() WHERE id = $3`,
      [
        jobQuotaUsed,
        JSON.stringify({
          keywords_processed: keywordRows.length,
          videos_ingested: totalVideos,
          quota_units_used: jobQuotaUsed,
          daily_quota_limit: dailyQuotaLimit,
          stopped_for_quota: stoppedForQuota,
          provider_per_keyword: providerPerKeyword,
          errors: errors.length > 0 ? errors : undefined,
        }),
        jobId,
      ]
    );

    return NextResponse.json({
      ok: true,
      job_id: jobId,
      keywords_processed: keywordRows.length,
      videos_ingested: totalVideos,
      quota_units_used: jobQuotaUsed,
      stopped_for_quota: stoppedForQuota,
      provider_per_keyword: providerPerKeyword,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (jobId != null) {
      await query(
        `UPDATE ingestion_jobs SET status = 'failed', completed_at = NOW(), error_message = $1, quota_units_used = $2, metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb, updated_at = NOW() WHERE id = $4`,
        [
          msg.slice(0, 2000),
          jobQuotaUsed,
          JSON.stringify({ quota_units_used: jobQuotaUsed }),
          jobId,
        ]
      ).catch(() => {});
    }
    return NextResponse.json(
      { error: "Ingestion failed", message: msg },
      { status: 500 }
    );
  }
}
