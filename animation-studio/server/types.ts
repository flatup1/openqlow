export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type AspectRatio = '1:1' | '9:16' | '16:9';
export type MotionStrength = 'low' | 'medium' | 'high';
export type CameraMotion = 'static' | 'push-in' | 'pull-out' | 'pan' | 'orbit';

export interface GenerationRequest {
  prompt: string;
  duration: number;
  aspectRatio: AspectRatio;
  motionStrength: MotionStrength;
  cameraMotion: CameraMotion;
  loop: boolean;
  templateId?: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  stage?: string;
  request: GenerationRequest;
  demo: boolean;
  createdAt: string;
  completedAt?: string;
  videoPath?: string;
  error?: { code: string; message: string };
  /** 実API利用時のプロバイダ側オペレーション名。 */
  providerOperation?: string;
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
