import type { AppError, GenerationParams, JobPublic } from '../types/animation';

export interface GenerateResponse {
  jobId: string;
  status: 'queued' | 'processing';
  demo: boolean;
}

function toAppError(body: unknown, fallback: string): AppError {
  if (body && typeof body === 'object' && 'error' in body) {
    const e = (body as { error?: Partial<AppError> }).error;
    if (e && typeof e.message === 'string') {
      return { code: e.code ?? 'UNKNOWN', message: e.message, retryable: Boolean(e.retryable) };
    }
  }
  return { code: 'NETWORK', message: fallback, retryable: true };
}

export async function fetchHealth(): Promise<{ demoMode: boolean; model: string }> {
  const res = await fetch('/api/health');
  if (!res.ok) return { demoMode: true, model: 'unknown' };
  return (await res.json()) as { demoMode: boolean; model: string };
}

export async function requestGeneration(
  image: File,
  params: GenerationParams,
  signal?: AbortSignal,
): Promise<GenerateResponse> {
  const form = new FormData();
  form.append('image', image);
  form.append('prompt', params.prompt);
  form.append('duration', String(params.duration));
  form.append('aspectRatio', params.aspectRatio);
  form.append('motionStrength', params.motionStrength);
  form.append('cameraMotion', params.cameraMotion);
  form.append('loop', String(params.loop));
  if (params.templateId) form.append('templateId', params.templateId);

  let res: Response;
  try {
    res = await fetch('/api/generate-video', { method: 'POST', body: form, signal });
  } catch {
    throw { code: 'NETWORK', message: 'サーバーに接続できませんでした。通信環境を確認してください。', retryable: true } as AppError;
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw toAppError(body, '生成リクエストに失敗しました。');
  return body as GenerateResponse;
}

export async function fetchStatus(jobId: string, signal?: AbortSignal): Promise<JobPublic> {
  const res = await fetch(`/api/video-status/${encodeURIComponent(jobId)}`, { signal });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw toAppError(body, '生成状況を取得できませんでした。');
  return body as JobPublic;
}

export function downloadUrl(jobId: string): string {
  return `/api/video-download/${encodeURIComponent(jobId)}`;
}

export async function deleteJob(jobId: string): Promise<void> {
  await fetch(`/api/video-job/${encodeURIComponent(jobId)}`, { method: 'DELETE' }).catch(() => undefined);
}
