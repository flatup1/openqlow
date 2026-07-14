import type { ErrorRequestHandler, RequestHandler } from 'express';
import { config } from '../config.js';
import { AppError } from '../utils/apiErrors.js';
import { logger } from '../utils/logger.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'ページが見つかりませんでした。', retryable: false } });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({ error: { code: err.code, message: err.message, retryable: err.retryable } });
    return;
  }
  // multer のサイズ超過など
  if (err && typeof err === 'object' && 'code' in err && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      error: { code: 'FILE_TOO_LARGE', message: '画像のサイズが大きすぎます。10MB以下にしてください。', retryable: false },
    });
    return;
  }
  logger.error('unhandled error', { path: req.path, err: String(err) });
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'サーバーで問題が発生しました。時間をおいてお試しください。',
      retryable: true,
      ...(config.isProd ? {} : { detail: String(err) }),
    },
  });
};
