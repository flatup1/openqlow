import { z } from 'zod';

export const generationSchema = z.object({
  prompt: z.string().trim().min(1, 'プロンプトを入力してください。').max(2000, 'プロンプトが長すぎます。'),
  duration: z.coerce.number().int().min(2, '動画の長さは2秒以上にしてください。').max(10, '動画の長さは10秒以下にしてください。'),
  aspectRatio: z.enum(['1:1', '9:16', '16:9']).default('9:16'),
  motionStrength: z.enum(['low', 'medium', 'high']).default('medium'),
  cameraMotion: z.enum(['static', 'push-in', 'pull-out', 'pan', 'orbit']).default('static'),
  loop: z.coerce.boolean().default(false),
  templateId: z.string().max(60).optional(),
});

export type GenerationInput = z.infer<typeof generationSchema>;
