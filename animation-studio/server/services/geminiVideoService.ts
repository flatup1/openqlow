import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { AppError, Errors } from '../utils/apiErrors.js';
import type { GenerationRequest } from '../types.js';

/**
 * Veo が対応する尺は限られる場合がある。ユーザー入力(2〜10秒)を
 * 対応可能な近い値へ安全に丸める。実際の対応値は公式仕様で要確認。
 */
export function clampDurationToSupported(seconds: number): number {
  const supported = [2, 4, 6, 8, 10];
  return supported.reduce((best, v) => (Math.abs(v - seconds) < Math.abs(best - seconds) ? v : best), supported[0]);
}

/** 参照画像とリクエストから、キャラクター一貫性を重視したプロンプトを組み立てる。 */
export function buildProviderPrompt(req: GenerationRequest): string {
  const camera: Record<GenerationRequest['cameraMotion'], string> = {
    static: 'fixed camera, stable framing',
    'push-in': 'very slow gentle push-in',
    'pull-out': 'very slow gentle pull-out',
    pan: 'slow subtle horizontal pan',
    orbit: 'slow subtle orbit around the character',
  };
  const strength: Record<GenerationRequest['motionStrength'], string> = {
    low: 'subtle, gentle motion',
    medium: 'natural, smooth motion',
    high: 'dynamic but clean motion',
  };
  return [
    req.prompt,
    'Preserve the exact same character identity, face, hairstyle, ponytail, outfit, gloves, body proportions and colors from the reference image.',
    'Warm, cute, family-friendly 3D animated style. Smooth natural motion, no flickering, stable background.',
    `Motion: ${strength[req.motionStrength]}. Camera: ${camera[req.cameraMotion]}.`,
    'Avoid: different character, different face, extra limbs, deformed hands, warped background, watermark, scary expression, blood.',
  ].join(' ');
}

export interface GeneratedVideo {
  /** MP4 のバイト列。 */
  data: Buffer;
}

export interface VideoProvider {
  readonly demo: boolean;
  generate(image: { buffer: Buffer; mimeType: string }, req: GenerationRequest): Promise<GeneratedVideo>;
}

/** 最小限に型付けした Veo(@google/genai)の呼び出し面。SDKの版差でも自分の型で守る。 */
interface GenAiLike {
  models: {
    generateVideos(args: unknown): Promise<GenAiOperation>;
  };
  operations: {
    getVideosOperation(args: { operation: GenAiOperation }): Promise<GenAiOperation>;
  };
  files: {
    download(args: { file: unknown; downloadPath?: string }): Promise<unknown>;
  };
}

interface GenAiOperation {
  done?: boolean;
  error?: { message?: string };
  response?: {
    generatedVideos?: Array<{ video?: { videoBytes?: string; uri?: string } }>;
  };
}

/**
 * 実 Veo アダプタ。APIキーが必要で、この環境では実行検証していない。
 * モデル名・エンドポイント・レスポンス構造は公式仕様で必ず確認すること。
 */
class RealVeoProvider implements VideoProvider {
  readonly demo = false;

  async generate(image: { buffer: Buffer; mimeType: string }, req: GenerationRequest): Promise<GeneratedVideo> {
    if (!config.apiKey) throw Errors.noApiKey();
    const mod = (await import('@google/genai')) as unknown as {
      GoogleGenAI: new (opts: { apiKey: string }) => GenAiLike;
    };
    const ai = new mod.GoogleGenAI({ apiKey: config.apiKey });

    try {
      let operation = await ai.models.generateVideos({
        model: config.videoModel,
        prompt: buildProviderPrompt(req),
        image: { imageBytes: image.buffer.toString('base64'), mimeType: image.mimeType },
        config: {
          numberOfVideos: 1,
          durationSeconds: clampDurationToSupported(req.duration),
          aspectRatio: req.aspectRatio,
        },
      });

      // 完了までポーリング(サーバー側)。上限を設けてタイムアウト。
      const deadline = Date.now() + 5 * 60_000;
      while (!operation.done) {
        if (Date.now() > deadline) throw Errors.timeout();
        await new Promise((r) => setTimeout(r, 8000));
        operation = await ai.operations.getVideosOperation({ operation });
      }
      if (operation.error) {
        logger.error('veo operation error', { message: operation.error.message });
        throw Errors.providerFailed(true);
      }
      const video = operation.response?.generatedVideos?.[0]?.video;
      const bytes = video?.videoBytes;
      if (!bytes) {
        logger.error('veo returned no video bytes');
        throw Errors.providerFailed(false);
      }
      return { data: Buffer.from(bytes, 'base64') };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error('veo request failed', { err: String(err) });
      throw Errors.providerFailed(true);
    }
  }
}

/** デモアダプタ。サンプル動画を返す(APIキー不要)。UI/E2E確認用。 */
class DemoVideoProvider implements VideoProvider {
  readonly demo = true;
  constructor(private readonly sampleLoader: () => Promise<Buffer>) {}

  async generate(_image: { buffer: Buffer; mimeType: string }, _req: GenerationRequest): Promise<GeneratedVideo> {
    // 実生成の待ち時間を軽く模して段階遷移を見せる。
    await new Promise((r) => setTimeout(r, 400));
    return { data: await this.sampleLoader() };
  }
}

export function createVideoProvider(sampleLoader: () => Promise<Buffer>): VideoProvider {
  if (!config.demoMode && config.apiKey) return new RealVeoProvider();
  return new DemoVideoProvider(sampleLoader);
}
