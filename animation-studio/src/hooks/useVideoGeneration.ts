import { useCallback, useRef, useState } from 'react';
import type { AppError, GenerationParams, GenerationState, JobPublic } from '../types/animation';
import { downloadUrl, fetchStatus, requestGeneration } from '../services/animationApi';

const POLL_BASE_MS = 2000;
const POLL_MAX_MS = 8000;
const POLL_TIMEOUT_MS = 6 * 60_000;

function isAppError(e: unknown): e is AppError {
  return Boolean(e && typeof e === 'object' && 'message' in e && 'code' in e);
}

/** 生成の一連の流れ(送信→ポーリング→完了)を state machine として管理する。 */
export function useVideoGeneration(onCompleted?: (job: JobPublic) => void) {
  const [state, setState] = useState<GenerationState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    stopPolling();
    setState({ status: 'idle' });
  }, [stopPolling]);

  const start = useCallback(
    async (image: File, params: GenerationParams) => {
      stopPolling();
      abortRef.current = new AbortController();
      setState({ status: 'uploading' });
      try {
        const { jobId } = await requestGeneration(image, params, abortRef.current.signal);
        setState({ status: 'queued', jobId });

        const startedAt = Date.now();
        let delay = POLL_BASE_MS;
        const poll = async () => {
          try {
            const job = await fetchStatus(jobId, abortRef.current?.signal);
            if (job.status === 'completed') {
              setState({ status: 'completed', jobId, videoUrl: downloadUrl(jobId), job });
              onCompleted?.(job);
              return;
            }
            if (job.status === 'failed') {
              setState({
                status: 'failed',
                error: job.error
                  ? { ...job.error, retryable: true }
                  : { code: 'FAILED', message: '生成に失敗しました。', retryable: true },
              });
              return;
            }
            setState({ status: 'processing', jobId, stage: job.stage });
            if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
              setState({
                status: 'failed',
                error: { code: 'TIMEOUT', message: '時間がかかりすぎています。もう一度お試しください。', retryable: true },
              });
              return;
            }
            delay = Math.min(Math.round(delay * 1.4), POLL_MAX_MS);
            pollTimer.current = setTimeout(poll, delay);
          } catch (e) {
            if (isAppError(e)) setState({ status: 'failed', error: e });
          }
        };
        pollTimer.current = setTimeout(poll, delay);
      } catch (e) {
        const err: AppError = isAppError(e)
          ? e
          : { code: 'UNKNOWN', message: '生成を開始できませんでした。', retryable: true };
        setState({ status: 'failed', error: err });
      }
    },
    [onCompleted, stopPolling],
  );

  const reset = useCallback(() => {
    stopPolling();
    setState({ status: 'idle' });
  }, [stopPolling]);

  return { state, start, cancel, reset };
}
