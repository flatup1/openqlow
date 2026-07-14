import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GenerationRequest, Job } from '../types.js';
import { jobStore } from '../jobs/videoJobStore.js';
import { createVideoProvider, type VideoProvider } from './geminiVideoService.js';
import { AppError } from '../utils/apiErrors.js';
import { logger } from '../utils/logger.js';

const here = dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = join(here, '..', '..', 'storage');
const SAMPLE_PATH = join(here, '..', '..', 'public', 'sample', 'flatup_combo_smooth_24fps.mp4');

let sampleCache: Buffer | null = null;
async function loadSample(): Promise<Buffer> {
  if (!sampleCache) sampleCache = readFileSync(SAMPLE_PATH);
  return sampleCache;
}

const provider: VideoProvider = createVideoProvider(loadSample);

export function artifactPath(jobId: string): string {
  return join(STORAGE_DIR, `${jobId}.mp4`);
}

/** ジョブを作り、非同期で生成を進める(HTTPは即応答)。 */
export function startGeneration(
  request: GenerationRequest,
  image: { buffer: Buffer; mimeType: string },
): Job {
  const job = jobStore.create(request, provider.demo);
  void runJob(job.id, image, request);
  return job;
}

async function runJob(
  jobId: string,
  image: { buffer: Buffer; mimeType: string },
  request: GenerationRequest,
): Promise<void> {
  jobStore.update(jobId, { status: 'processing', stage: 'AIが動画を生成中' });
  try {
    const { data } = await provider.generate(image, request);
    mkdirSync(STORAGE_DIR, { recursive: true });
    const path = artifactPath(jobId);
    writeFileSync(path, data);
    jobStore.update(jobId, {
      status: 'completed',
      stage: '完了',
      completedAt: new Date().toISOString(),
      videoPath: path,
    });
    logger.info('job completed', { jobId, demo: provider.demo });
  } catch (err) {
    const e = err instanceof AppError ? err : null;
    jobStore.update(jobId, {
      status: 'failed',
      error: {
        code: e?.code ?? 'INTERNAL',
        message: e?.message ?? 'サーバーで問題が発生しました。時間をおいてお試しください。',
      },
    });
    logger.error('job failed', { jobId, err: String(err) });
  }
}
