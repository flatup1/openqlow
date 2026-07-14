import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, canUseRealApi } from './config.js';
import { videoRouter } from './routes/videoRoutes.js';
import { notFoundHandler, errorHandler } from './middleware/errorMiddleware.js';
import { jobStore } from './jobs/videoJobStore.js';
import { logger } from './utils/logger.js';

const here = dirname(fileURLToPath(import.meta.url));

export function createApp(): express.Express {
  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // リクエストID(ログ用)
  app.use((_req, res, next) => {
    const id = Math.random().toString(36).slice(2, 10);
    res.setHeader('X-Request-Id', id);
    next();
  });

  // 動作モードをフロントへ伝える(APIキーそのものは絶対に返さない)
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, demoMode: config.demoMode || !canUseRealApi(), model: config.videoModel });
  });

  app.use('/api', videoRouter);

  // 本番: ビルド済みフロントを配信
  const clientDir = join(here, '..', 'dist');
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(clientDir, 'index.html')));
  }

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}

// 直接起動されたときだけサーバーを立ち上げる(テストでは import だけ可能)
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const app = createApp();
  app.listen(config.port, () => {
    logger.info('animation-studio server started', {
      port: config.port,
      demoMode: config.demoMode || !canUseRealApi(),
      model: config.videoModel,
    });
  });
  // 期限切れジョブ・生成物の定期掃除
  setInterval(() => jobStore.cleanupExpired(), 5 * 60_000).unref();
}
