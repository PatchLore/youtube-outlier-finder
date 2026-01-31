import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { getPool, query, type Channel, type Keyword, type Video, type IngestionJob } from "@/lib/db";
import {
  fetchYouTubeSearch,
  fetchVideoDetails,
  fetchChannelDetails,
  buildEnrichedVideos,
} from "@/lib/youtube-ingest";
import { calculateOutlierScore } from "@/lib/outlier";
import { shouldRefreshChannel } from "@/lib/channel";
import type { EnrichedVideo } from "@/lib/ingestion-providers";

export const runtime = "nodejs";
export const maxDuration = 60;

const KEYWORDS_LIMIT = 3;
const MAX_RESULTS_PER_KEYWORD = 50;
const KV_QUOTA_CAP = 9500;
const PRIORITY_QUEUE_LIMIT = 5;
const CHANNEL_REFRESH_MAX_PER_RUN = 50;
const CHANNEL_REFRESH_QUOTA_THRESHOLD = 1000;

const QUOTA_SEARCH = 100;
const QUOTA_VIDEOS_PER_ITEM = 1;
const QUOTA_CHANNELS_PER_ITEM = 1;
/** Approximate units per keyword: search + 50 videos + 50 channels */
const QUOTA_PER_KEYWORD =
  QUOTA_SEARCH + MAX_RESULTS_PER_KEYWORD * (QUOTA_VIDEOS_PER_ITEM + QUOTA_CHANNELS_PER_ITEM);

/** Log full error and stack server-side only; never send stack to client. */
function logCronError(context: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : undefined;
  console.error("[Cron Ingest Error]", context, { message: msg, code });
  if (stack) console.error("[Cron Ingest Error] stack:", stack);
}

const DB_OFFLINE_BODY = { error: "Database temporarily unavailable", type: "DB_OFFLINE" } as const;

function dbOfflineResponse() {
  return NextResponse.json(DB_OFFLINE_BODY, { status: 503 });
}

function logCronInfo(context: string, data: Record<string, unknown>): void {
  console.log("[Cron Ingest]", { context, ...data });
}

function getKvQuotaKey(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `cron:youtube:quota:${today}`;
}

async function getKvQuotaUsed(): Promise<number> {
  try {
    const key = getKvQuotaKey();
    const val = await kv.get<number>(key);
    return typeof val === "number" && Number.isFinite(val) ? val : 0;
  } catch (err) {
    logCronError("getKvQuotaUsed", err);
    return 0;
  }
}

async function addKvQuotaUsed(units: number): Promise<void> {
  if (units <= 0) return;
  try {
    const key = getKvQuotaKey();
    const current = await getKvQuotaUsed();
    await kv.set(key, current + units);
  } catch (err) {
    logCronError("addKvQuotaUsed", err);
  }
}

/** Increment ingestion_jobs.api_calls and quota_cost after each YouTube API call. */
async function incrementJobQuota(
  jobId: number,
  deltaApiCalls: number,
  deltaQuotaCost: number
): Promise<void> {
  if (jobId == null || (deltaApiCalls <= 0 && deltaQuotaCost <= 0)) return;
  try {
    await query(
      `UPDATE ingestion_jobs SET api_calls = api_calls + $1, quota_cost = quota_cost + $2, updated_at = NOW() WHERE id = $3`,
      [deltaApiCalls, deltaQuotaCost, jobId]
    );
  } catch (err) {
    logCronError("incrementJobQuota", err);
  }
}

function assertCron(req: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret || typeof secret !== "string" || secret.trim() === "") {
    throw new Error("CRON_SECRET not configured");
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    throw new Error("Unauthorized");
  }
}

/** True if the error is likely DB connection / unavailable (return 503). */
function isDbUnavailableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
  const lower = (msg + " " + code).toLowerCase();
  return (
    /DATABASE_URL|connection refused|ECONNREFUSED|ETIMEDOUT|connection terminated|connect ECONNREFUSED|connect ETIMEDOUT|timeout|does not exist|relation .* does not exist|no such table/i.test(lower) ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "57P01" ||
    code === "57P03"
  );
}

type EnrichedVideoWithScore = EnrichedVideo & { outlier_score: number };

/** Mutable state shared across keyword processing (channel refresh cap). */
type IngestRunState = {
  channelsRefreshedThisRun: number;
};

/**
 * Process a single keyword: search, optional channel refresh (if quota < 1000, max 50/run),
 * video details, channel details, persist. Updates job quota and KV quota; does not update keyword last_ingested_at.
 */
async function processOneKeyword(
  apiKey: string,
  keyword: string,
  keywordId: number,
  jobId: number,
  state: IngestRunState
): Promise<{ persisted: number; unitsUsed: number }> {
  let unitsUsed = 0;
  const { videoIds, channelIds } = await fetchYouTubeSearch(
    apiKey,
    keyword,
    MAX_RESULTS_PER_KEYWORD
  );
  if (jobId != null) await incrementJobQuota(jobId, 1, QUOTA_SEARCH);
  unitsUsed += QUOTA_SEARCH;

  if (videoIds.length === 0) {
    return { persisted: 0, unitsUsed };
  }

  const currentKv = await getKvQuotaUsed();
  if (
    currentKv < CHANNEL_REFRESH_QUOTA_THRESHOLD &&
    state.channelsRefreshedThisRun < CHANNEL_REFRESH_MAX_PER_RUN &&
    channelIds.length > 0
  ) {
    const { rows: channelRows } = await query<{
      id: number;
      youtube_channel_id: string;
      title: string | null;
      subscriber_count: number;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, youtube_channel_id, title, subscriber_count, created_at, updated_at FROM channels WHERE youtube_channel_id = ANY($1::text[])`,
      [channelIds]
    );
    const toRefresh: string[] = [];
    for (const row of channelRows) {
      const ch: Channel = {
        ...row,
        title: row.title ?? "",
        last_updated_at: row.updated_at,
        update_priority: 1,
      };
      if (shouldRefreshChannel(ch) && toRefresh.length + state.channelsRefreshedThisRun < CHANNEL_REFRESH_MAX_PER_RUN) {
        toRefresh.push(row.youtube_channel_id);
      }
    }
    if (toRefresh.length > 0) {
      const refreshCount = Math.min(toRefresh.length, CHANNEL_REFRESH_MAX_PER_RUN - state.channelsRefreshedThisRun);
      const idsToRefresh = toRefresh.slice(0, refreshCount);
      const channelMap = await fetchChannelDetails(apiKey, idsToRefresh);
      if (jobId != null) await incrementJobQuota(jobId, 1, idsToRefresh.length);
      unitsUsed += idsToRefresh.length;
      state.channelsRefreshedThisRun += idsToRefresh.length;
      for (const ytId of idsToRefresh) {
        const subCount = channelMap[ytId];
        if (subCount !== undefined) {
          await query(
            `UPDATE channels SET subscriber_count = $1, updated_at = NOW() WHERE youtube_channel_id = $2`,
            [subCount, ytId]
          );
        }
      }
    }
  }

  const videoItems = await fetchVideoDetails(apiKey, videoIds);
  if (jobId != null) await incrementJobQuota(jobId, 1, videoIds.length * QUOTA_VIDEOS_PER_ITEM);
  unitsUsed += videoIds.length * QUOTA_VIDEOS_PER_ITEM;

  const channelMap = await fetchChannelDetails(apiKey, channelIds);
  if (jobId != null) await incrementJobQuota(jobId, 1, channelIds.length * QUOTA_CHANNELS_PER_ITEM);
  unitsUsed += channelIds.length * QUOTA_CHANNELS_PER_ITEM;

  const enriched = buildEnrichedVideos(videoItems, channelMap) as EnrichedVideoWithScore[];
  for (const v of enriched) {
    v.outlier_score = calculateOutlierScore(
      { views: v.views, published_at: v.published_at },
      { subscriber_count: v.subscribers }
    );
  }
  const persisted = await persistEnriched(enriched, keywordId);
  await addKvQuotaUsed(unitsUsed);
  return { persisted, unitsUsed };
}

async function persistEnriched(
  enriched: EnrichedVideoWithScore[],
  keywordId: number
): Promise<number> {
  const channelIdByYoutubeId: Record<string, number> = {};

  for (const v of enriched) {
    const { rows: chRows } = await query<Pick<Channel, "id">>(
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

    const outlierScore = typeof v.outlier_score === "number" && Number.isFinite(v.outlier_score) ? v.outlier_score : null;

    await query(
      `INSERT INTO videos (
        youtube_video_id, channel_id, title, thumbnail_url, views,
        published_at, multiplier, views_per_day, like_ratio, outlier_score, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9, $10, NOW())
      ON CONFLICT (youtube_video_id) DO UPDATE SET
        channel_id = EXCLUDED.channel_id,
        title = EXCLUDED.title,
        thumbnail_url = EXCLUDED.thumbnail_url,
        views = EXCLUDED.views,
        published_at = EXCLUDED.published_at,
        multiplier = EXCLUDED.multiplier,
        views_per_day = EXCLUDED.views_per_day,
        like_ratio = EXCLUDED.like_ratio,
        outlier_score = EXCLUDED.outlier_score,
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
        outlierScore,
      ]
    );
  }

  const { rows: videoIdRows } = await query<Pick<Video, "id"> & { youtube_video_id: string }>(
    `SELECT id, youtube_video_id FROM videos WHERE youtube_video_id = ANY($1::text[])`,
    [enriched.map((e) => e.youtube_video_id)]
  );

  const videoIdByYoutubeId = new Map<string, number>(
    videoIdRows.map((r) => [r.youtube_video_id, r.id])
  );

  for (const row of videoIdRows) {
    await query(
      `INSERT INTO video_keywords (video_id, keyword_id)
       VALUES ($1, $2)
       ON CONFLICT (video_id, keyword_id) DO NOTHING`,
      [row.id, keywordId]
    );
  }

  for (const v of enriched) {
    const videoId: number | undefined = videoIdByYoutubeId.get(v.youtube_video_id);
    if (videoId == null) continue;
    const daysSincePublished =
      v.published_at != null && v.published_at !== ""
        ? Math.floor(
            (Date.now() - new Date(v.published_at).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 0;
    /** video_stats.video_id is videos.id (integer); ensure number type. */
    const videoStatsParams: [number, number, number | null, number] = [
      videoId,
      v.views,
      v.likes ?? null,
      Math.max(0, daysSincePublished),
    ];
    try {
      await query(
        `INSERT INTO video_stats (video_id, views, likes, days_since_publish)
         VALUES ($1, $2, $3, $4)`,
        videoStatsParams
      );
    } catch {
      // video_stats table may not exist yet; ignore
    }
  }

  return enriched.length;
}


export async function GET(req: Request) {
  try {
    assertCron(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "CRON_SECRET not configured") {
      logCronError("config", err);
      return NextResponse.json(
        { error: "Cron secret not configured" },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    logCronInfo("config", { error: "YOUTUBE_API_KEY not set" });
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY not set" },
      { status: 500 }
    );
  }

  if (!getPool()) {
    return dbOfflineResponse();
  }

  let jobId: number | null = null;
  let jobQuotaUsed = 0;

  try {
    const kvQuotaUsed = await getKvQuotaUsed();
    if (kvQuotaUsed >= KV_QUOTA_CAP) {
      logCronInfo("quota_skip", { kv_quota_used: kvQuotaUsed, kv_quota_cap: KV_QUOTA_CAP });
      return NextResponse.json({
        ok: true,
        message: "Daily quota cap reached (KV), skipping ingest",
        kv_quota_used: kvQuotaUsed,
        kv_quota_cap: KV_QUOTA_CAP,
      });
    }

    const { rows: jobRows } = await query<Pick<IngestionJob, "id">>(
      `INSERT INTO ingestion_jobs (status, job_type, query, started_at, updated_at)
       VALUES ('running', 'youtube_keyword_ingest', 'cron', NOW(), NOW())
       RETURNING id`
    );
    jobId = jobRows[0]?.id ?? null;
    if (jobId == null) {
      logCronError("job_create", new Error("Failed to create ingestion_jobs row"));
      return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
    }

    const { rows: queueRows } = await query<{ id: number; keyword: string }>(
      `SELECT id, keyword FROM priority_ingestion_queue WHERE status = 'pending' ORDER BY requested_at ASC LIMIT $1`,
      [PRIORITY_QUEUE_LIMIT]
    );

    const { rows: keywordRows } = await query<Pick<Keyword, "id" | "keyword">>(
      `SELECT id, keyword FROM keywords
       WHERE last_ingested_at IS NULL OR last_ingested_at < NOW() - INTERVAL '24 hours'
       ORDER BY priority DESC NULLS LAST, last_ingested_at ASC NULLS FIRST
       LIMIT $1`,
      [KEYWORDS_LIMIT]
    );

    if (queueRows.length === 0 && keywordRows.length === 0) {
      await query(
        `UPDATE ingestion_jobs SET status = 'completed', completed_at = NOW(), quota_units_used = 0, metadata = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify({ message: "No keywords or queue items due for ingest" }), jobId]
      );
      logCronInfo("no_work", { job_id: jobId });
      return NextResponse.json({ ok: true, message: "No keywords or queue items to ingest" });
    }

    logCronInfo("start", {
      job_id: jobId,
      queue_count: queueRows.length,
      keywords_count: keywordRows.length,
      kv_quota_before: kvQuotaUsed,
    });

    let totalVideos = 0;
    const errors: string[] = [];
    let stoppedForQuota = false;
    const state: IngestRunState = { channelsRefreshedThisRun: 0 };
    let queueProcessed = 0;
    let queueFailed = 0;

    for (const row of queueRows) {
      const currentKv = await getKvQuotaUsed();
      if (currentKv >= KV_QUOTA_CAP) {
        stoppedForQuota = true;
        errors.push(`Stopped: KV quota >= ${KV_QUOTA_CAP} before queue item "${row.keyword}"`);
        break;
      }
      try {
        await query(
          `UPDATE priority_ingestion_queue SET status = 'processing' WHERE id = $1`,
          [row.id]
        );
        let keywordId: number;
        const { rows: kwRows } = await query<Pick<Keyword, "id">>(
          `SELECT id FROM keywords WHERE keyword = $1 LIMIT 1`,
          [row.keyword.trim()]
        );
        if (kwRows.length > 0) {
          keywordId = kwRows[0].id;
        } else {
          const { rows: ins } = await query<Pick<Keyword, "id">>(
            `INSERT INTO keywords (keyword, niche, priority) VALUES ($1, 'general', 1) ON CONFLICT (keyword, niche) DO NOTHING RETURNING id`,
            [row.keyword.trim()]
          );
          if (ins.length > 0) {
            keywordId = ins[0].id;
          } else {
            const { rows: sel } = await query<Pick<Keyword, "id">>(`SELECT id FROM keywords WHERE keyword = $1`, [row.keyword.trim()]);
            keywordId = sel[0]?.id ?? 0;
          }
        }
        if (!keywordId) {
          throw new Error("Could not get or create keyword id");
        }
        const result = await processOneKeyword(apiKey, row.keyword, keywordId, jobId!, state);
        jobQuotaUsed += result.unitsUsed;
        totalVideos += result.persisted;
        queueProcessed += 1;
        await query(
          `UPDATE priority_ingestion_queue SET status = 'completed', processed_at = NOW() WHERE id = $1`,
          [row.id]
        );
        logCronInfo("queue_done", { keyword: row.keyword, videos: result.persisted });
      } catch (err) {
        logCronError(`queue "${row.keyword}"`, err);
        queueFailed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`[queue "${row.keyword}"]: ${msg}`);
        try {
          await query(
            `UPDATE priority_ingestion_queue SET status = 'failed', processed_at = NOW() WHERE id = $1`,
            [row.id]
          );
        } catch {
          // ignore
        }
        if (isDbUnavailableError(err)) throw err;
      }
    }

    for (const kw of keywordRows) {
      const currentKv = await getKvQuotaUsed();
      if (currentKv >= KV_QUOTA_CAP) {
        stoppedForQuota = true;
        logCronInfo("quota_stop", { keyword: kw.keyword, kv_quota_used: currentKv });
        errors.push(`Stopped: KV quota >= ${KV_QUOTA_CAP} (${currentKv})`);
        break;
      }
      if (currentKv + QUOTA_PER_KEYWORD > KV_QUOTA_CAP) {
        stoppedForQuota = true;
        logCronInfo("quota_skip_keyword", { keyword: kw.keyword, would_exceed: currentKv + QUOTA_PER_KEYWORD });
        errors.push(`Skipped "${kw.keyword}": would exceed ${KV_QUOTA_CAP}`);
        continue;
      }
      try {
        const result = await processOneKeyword(apiKey, kw.keyword, kw.id, jobId!, state);
        jobQuotaUsed += result.unitsUsed;
        totalVideos += result.persisted;
        await query(
          `UPDATE keywords SET last_ingested_at = NOW() WHERE id = $1`,
          [kw.id]
        );
        logCronInfo("keyword_done", {
          keyword: kw.keyword,
          videos: result.persisted,
          units: result.unitsUsed,
          kv_quota_after: await getKvQuotaUsed(),
        });
      } catch (err) {
        logCronError(`keyword "${kw.keyword}"`, err);
        if (isDbUnavailableError(err)) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`"${kw.keyword}": ${msg}`);
      }
    }

    const metadata = {
      queue_processed: queueProcessed,
      queue_failed: queueFailed,
      keywords_processed: keywordRows.length,
      videos_ingested: totalVideos,
      quota_units_used: jobQuotaUsed,
      kv_quota_cap: KV_QUOTA_CAP,
      stopped_for_quota: stoppedForQuota,
      channels_refreshed: state.channelsRefreshedThisRun,
      errors: errors.length > 0 ? errors : undefined,
    };
    await query(
      `UPDATE ingestion_jobs SET status = 'completed', completed_at = NOW(), quota_units_used = $1, metadata = $2, updated_at = NOW() WHERE id = $3`,
      [jobQuotaUsed, JSON.stringify(metadata), jobId]
    );

    logCronInfo("complete", { job_id: jobId, videos_ingested: totalVideos, quota_units_used: jobQuotaUsed, quota_cost: jobQuotaUsed });

    return NextResponse.json({
      ok: true,
      job_id: jobId,
      queue_processed: queueProcessed,
      queue_failed: queueFailed,
      keywords_processed: keywordRows.length,
      videos_ingested: totalVideos,
      quota_units_used: jobQuotaUsed,
      stopped_for_quota: stoppedForQuota,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    logCronError("ingest failed", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (jobId != null) {
      await query(
        `UPDATE ingestion_jobs SET status = 'failed', completed_at = NOW(), error_message = $1, quota_units_used = $2, metadata = $3, updated_at = NOW() WHERE id = $4`,
        [
          msg.slice(0, 2000),
          jobQuotaUsed,
          JSON.stringify({ quota_units_used: jobQuotaUsed, error: msg }),
          jobId,
        ]
      ).catch((updateErr) => {
        logCronError("failed to update job status", updateErr);
      });
    }
    if (isDbUnavailableError(err)) {
      return NextResponse.json(DB_OFFLINE_BODY, { status: 503 });
    }
    return NextResponse.json(
      { error: "Ingestion failed. Please try again later." },
      { status: 500 }
    );
  }
}
