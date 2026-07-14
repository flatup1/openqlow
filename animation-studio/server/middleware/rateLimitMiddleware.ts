import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

/** 生成エンドポイント用のレート制限。 */
export const generateRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'リクエストが多すぎます。少し時間をおいてからお試しください。',
      retryable: true,
    },
  },
});
