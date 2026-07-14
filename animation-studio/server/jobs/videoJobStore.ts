import { existsSync, rmSync } from 'node:fs';
import { nanoid } from 'nanoid';
import type { GenerationRequest, Job, JobStatus } from '../types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/** 有効な状態遷移(不正な遷移を弾く)。 */
const ALLOWED: Record<JobStatus, JobStatus[]> = {
  queued: ['processing', 'failed'],
  processing: ['completed', 'failed'],
  completed: [],
  failed: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return ALLOWED[from].includes(to);
}

/** メモリ上のジョブ管理。初期版はインメモリ。本番ではRedis/DB等に置き換え可能な最小I/F。 */
class VideoJobStore {
  private readonly jobs = new Map<string, Job>();

  create(request: GenerationRequest, demo: boolean): Job {
    const job: Job = {
      id: nanoid(),
      status: 'queued',
      request,
      demo,
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  update(id: string, patch: Partial<Omit<Job, 'id'>>): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (patch.status && patch.status !== job.status && !canTransition(job.status, patch.status)) {
      logger.warn('invalid job transition', { id, from: job.status, to: patch.status });
      return job;
    }
    const next = { ...job, ...patch };
    this.jobs.set(id, next);
    return next;
  }

  delete(id: string): boolean {
    const job = this.jobs.get(id);
    if (job?.videoPath && existsSync(job.videoPath)) {
      try {
        rmSync(job.videoPath, { force: true });
      } catch (err) {
        logger.warn('failed to remove artifact', { id, err: String(err) });
      }
    }
    return this.jobs.delete(id);
  }

  /** TTLを過ぎたジョブと生成物を掃除する。 */
  cleanupExpired(now = Date.now()): number {
    const ttlMs = config.artifactTtlMinutes * 60_000;
    let removed = 0;
    for (const [id, job] of this.jobs) {
      const age = now - new Date(job.createdAt).getTime();
      if (age > ttlMs) {
        this.delete(id);
        removed += 1;
      }
    }
    if (removed > 0) logger.info('cleaned expired jobs', { removed });
    return removed;
  }
}

export const jobStore = new VideoJobStore();
