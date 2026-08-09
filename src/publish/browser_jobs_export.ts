import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserPostJob } from "./browser_post_job.js";
import { resolvePublicMediaUrl, type PublicMediaEnv } from "./public_media.js";
import type { PublishDestination } from "./publisher_types.js";

type StoredStatus = BrowserPostJob["status"] | "published" | "failed";

interface StoredBrowserPostJob extends Omit<BrowserPostJob, "status"> {
  status: StoredStatus;
  externalId?: string;
  publishedAt?: string;
  error?: string;
}

interface StoredBrowserPostJobs {
  recordId: string;
  jobs: StoredBrowserPostJob[];
}

/**
 * ブラウザエージェント（CODEX等）が実際に投稿するために必要な情報だけを持つ形。
 * mediaFiles はVPSローカルのパスなのでブラウザからは開けない。
 * mediaUrls に公開HTTPS URLを解決して入れることで、別マシンのブラウザでも画像を取得できる。
 */
export interface ExportedBrowserJob {
  recordId: string;
  destination: PublishDestination;
  url: string;
  text: string;
  mediaUrls: string[];
  missingMediaCount: number;
  createdAt: string;
}

export interface ExportBrowserJobsResult {
  jobs: ExportedBrowserJob[];
  warnings: string[];
}

async function listJobFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  return entries.filter(name => name.endsWith(".json")).sort();
}

async function loadJobFile(file: string): Promise<StoredBrowserPostJobs | undefined> {
  const text = await readFile(file, "utf8").catch(() => undefined);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as StoredBrowserPostJobs;
  } catch {
    return undefined;
  }
}

export async function exportPendingBrowserJobs(
  root: string,
  env: PublicMediaEnv = process.env,
): Promise<ExportBrowserJobsResult> {
  const dir = path.join(root, "state", "browser_post_jobs");
  const files = await listJobFiles(dir);
  const jobs: ExportedBrowserJob[] = [];
  const warnings: string[] = [];

  for (const name of files) {
    const data = await loadJobFile(path.join(dir, name));
    if (!data) {
      warnings.push(`読めないジョブファイルを飛ばしました: ${name}`);
      continue;
    }

    for (const job of data.jobs ?? []) {
      if (job.status !== "queued_for_mac_browser") continue;

      const mediaUrls: string[] = [];
      let missingMediaCount = 0;
      for (const mediaFile of job.mediaFiles ?? []) {
        const url = await resolvePublicMediaUrl(mediaFile, env);
        if (url) mediaUrls.push(url);
        else missingMediaCount += 1;
      }

      if (missingMediaCount > 0) {
        warnings.push(
          `${job.recordId} / ${job.destination}: 画像${missingMediaCount}件が公開URLに解決できません（OPENQLOW_PUBLIC_MEDIA_DIR / OPENQLOW_PUBLIC_MEDIA_BASE_URL を確認）`,
        );
      }

      jobs.push({
        recordId: job.recordId,
        destination: job.destination,
        url: job.url,
        text: job.text,
        mediaUrls,
        missingMediaCount,
        createdAt: job.createdAt,
      });
    }
  }

  jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.destination.localeCompare(b.destination));
  return { jobs, warnings };
}
