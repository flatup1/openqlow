export type AspectRatio = '1:1' | '9:16' | '16:9';
export type MotionStrength = 'low' | 'medium' | 'high';
export type CameraMotion = 'static' | 'push-in' | 'pull-out' | 'pan' | 'orbit';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface AdvancedSettings {
  aspectRatio: AspectRatio;
  motionStrength: MotionStrength;
  cameraMotion: CameraMotion;
  loop: boolean;
}

export interface GenerationParams extends AdvancedSettings {
  prompt: string;
  duration: number;
  templateId?: string;
}

export interface AppError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface JobPublic {
  jobId: string;
  status: JobStatus;
  stage?: string;
  demo: boolean;
  createdAt: string;
  completedAt?: string;
  durationSeconds: number;
  error?: { code: string; message: string };
}

/** 画面の生成状態(discriminated union)。 */
export type GenerationState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'queued'; jobId: string }
  | { status: 'processing'; jobId: string; stage?: string }
  | { status: 'completed'; jobId: string; videoUrl: string; job: JobPublic }
  | { status: 'failed'; error: AppError };

export interface HistoryItem {
  jobId: string;
  createdAt: string;
  durationSeconds: number;
  prompt: string;
  templateId?: string;
  demo: boolean;
  thumbnail?: string;
}
