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
import type { EnrichedVideo } from "@/lib/ingestion-providers";

export const runtime = "nodejs";
export const maxDuration = 60;

const KEYWORDS_LIMIT = 3;
const MAX_RESULTS_PER_KEYWORD = 50;
const KV_QUOTA_CAP = 9500;

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

  const { rows: videoIdRows } = await query<Pick<Video, "id">>(
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

    const { rows: keywordRows } = await query<Pick<Keyword, "id" | "keyword">>(
      `SELECT id, keyword FROM keywords
       WHERE last_ingested_at IS NULL OR last_ingested_at < NOW() - INTERVAL '24 hours'
       ORDER BY priority DESC NULLS LAST, last_ingested_at ASC NULLS FIRST
       LIMIT $1`,
      [KEYWORDS_LIMIT]
    );

    if (keywordRows.length === 0) {
      await query(
        `UPDATE ingestion_jobs SET status = 'completed', completed_at = NOW(), quota_units_used = 0, metadata = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify({ message: "No keywords due for ingest (24h cooldown)" }), jobId]
      );
      logCronInfo("no_keywords", { job_id: jobId });
      return NextResponse.json({ ok: true, message: "No keywords to ingest" });
    }

    logCronInfo("start", { job_id: jobId, keywords: keywordRows.length, kv_quota_before: kvQuotaUsed });

    let totalVideos = 0;
    const errors: string[] = [];
    let stoppedForQuota = false;

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
        const { videoIds, channelIds } = await fetchYouTubeSearch(
          apiKey,
          kw.keyword,
          MAX_RESULTS_PER_KEYWORD
        );

        if (videoIds.length === 0) {
          await query(
            `UPDATE keywords SET last_ingested_at = NOW() WHERE id = $1`,
            [kw.id]
          );
          logCronInfo("keyword_no_results", { keyword: kw.keyword });
          continue;
        }

        const videoItems = await fetchVideoDetails(apiKey, videoIds);
        const channelMap = await fetchChannelDetails(apiKey, channelIds);
        const enriched = buildEnrichedVideos(videoItems, channelMap) as EnrichedVideoWithScore[];

        for (const v of enriched) {
          v.outlier_score = calculateOutlierScore(
            v.views,
            v.subscribers,
            v.published_at
          );
        }

        const persisted = await persistEnriched(enriched, kw.id);
        totalVideos += persisted;

        const unitsThisKeyword =
          QUOTA_SEARCH +
          videoIds.length * QUOTA_VIDEOS_PER_ITEM +
          channelIds.length * QUOTA_CHANNELS_PER_ITEM;
        jobQuotaUsed += unitsThisKeyword;
        await addKvQuotaUsed(unitsThisKeyword);

        await query(
          `UPDATE keywords SET last_ingested_at = NOW() WHERE id = $1`,
          [kw.id]
        );

        logCronInfo("keyword_done", {
          keyword: kw.keyword,
          videos: persisted,
          units: unitsThisKeyword,
          kv_quota_after: await getKvQuotaUsed(),
        });
      } catch (err) {
        logCronError(`keyword "${kw.keyword}"`, err);
        if (isDbUnavailableError(err)) {
          throw err;
        }
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`"${kw.keyword}": ${msg}`);
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
          kv_quota_cap: KV_QUOTA_CAP,
          stopped_for_quota: stoppedForQuota,
          errors: errors.length > 0 ? errors : undefined,
        }),
        jobId,
      ]
    );

    logCronInfo("complete", { job_id: jobId, videos_ingested: totalVideos, quota_units_used: jobQuotaUsed });

    return NextResponse.json({
      ok: true,
      job_id: jobId,
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
        `UPDATE ingestion_jobs SET status = 'failed', completed_at = NOW(), error_message = $1, quota_units_used = $2, metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb, updated_at = NOW() WHERE id = $4`,
        [
          msg.slice(0, 2000),
          jobQuotaUsed,
          JSON.stringify({ quota_units_used: jobQuotaUsed }),
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
