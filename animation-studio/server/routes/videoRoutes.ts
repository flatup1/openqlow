import { Router, type Request, type Response } from 'express';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { generationSchema } from '../schemas/videoSchemas.js';
import { uploadImage, ALLOWED_MIME } from '../middleware/uploadMiddleware.js';
import { generateRateLimit } from '../middleware/rateLimitMiddleware.js';
import { Errors } from '../utils/apiErrors.js';
import { jobStore } from '../jobs/videoJobStore.js';
import { startGeneration } from '../services/videoGenerationService.js';
import type { GenerationRequest, Job, JobPublic } from '../types.js';

export const videoRouter = Router();

function toPublic(job: Job): JobPublic {
  return {
    jobId: job.id,
    status: job.status,
    stage: job.stage,
    demo: job.demo,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    durationSeconds: job.request.duration,
    error: job.error,
  };
}

// POST /api/generate-video  (multipart/form-data)
videoRouter.post('/generate-video', generateRateLimit, (req: Request, res: Response, next) => {
  uploadImage(req, res, (uploadErr: unknown) => {
    if (uploadErr) return next(uploadErr);
    try {
      if (!req.file) throw Errors.noImage();
      if (!ALLOWED_MIME.has(req.file.mimetype)) throw Errors.badMime();

      const parsed = generationSchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? '入力内容が正しくありません。';
        throw Errors.invalidInput(msg);
      }
      const request: GenerationRequest = parsed.data;
      const job = startGeneration(request, { buffer: req.file.buffer, mimeType: req.file.mimetype });
      res.status(202).json({ jobId: job.id, status: job.status, demo: job.demo });
    } catch (err) {
      next(err);
    }
  });
});

// GET /api/video-status/:jobId
videoRouter.get('/video-status/:jobId', (req: Request, res: Response, next) => {
  try {
    const job = jobStore.get(req.params.jobId);
    if (!job) throw Errors.jobNotFound();
    res.json(toPublic(job));
  } catch (err) {
    next(err);
  }
});

// GET /api/video-download/:jobId
videoRouter.get('/video-download/:jobId', (req: Request, res: Response, next) => {
  try {
    const job = jobStore.get(req.params.jobId);
    if (!job) throw Errors.jobNotFound();
    if (job.status !== 'completed' || !job.videoPath || !existsSync(job.videoPath)) throw Errors.notReady();

    const stamp = job.createdAt.replace(/[-:T]/g, '').slice(0, 14);
    const filename = `flatup-animation-${stamp}.mp4`;
    const size = statSync(job.videoPath).size;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', String(size));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    createReadStream(job.videoPath).pipe(res);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/video-job/:jobId
videoRouter.delete('/video-job/:jobId', (req: Request, res: Response, next) => {
  try {
    const ok = jobStore.delete(req.params.jobId);
    if (!ok) throw Errors.jobNotFound();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
