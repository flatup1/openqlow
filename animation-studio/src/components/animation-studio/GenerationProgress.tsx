import { useEffect, useState } from 'react';
import type { GenerationState } from '../../types/animation';

interface Props {
  state: GenerationState;
  onCancel: () => void;
}

const STAGES = ['アップロード中', '生成リクエスト送信中', 'AIが動画を生成中', '仕上げ処理中'];

export function GenerationProgress({ state, onCancel }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const active = state.status === 'uploading' || state.status === 'queued' || state.status === 'processing';

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;

  const currentStage =
    state.status === 'uploading'
      ? STAGES[0]
      : state.status === 'queued'
        ? STAGES[1]
        : state.stage ?? STAGES[2];

  return (
    <div className="rounded-2xl bg-panel2 border border-white/10 p-5" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="h-4 w-4 rounded-full border-2 border-accent border-t-transparent animate-spin" aria-hidden />
        <p className="text-sm font-bold">{currentStage}…</p>
      </div>
      <ol className="mt-3 space-y-1 text-xs text-muted">
        {STAGES.map((s) => (
          <li key={s} className={s === currentStage ? 'text-white font-bold' : ''}>
            ・{s}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>経過 {elapsed} 秒(数十秒〜数分かかることがあります)</span>
        <button type="button" onClick={onCancel} className="text-accent font-bold">
          キャンセル
        </button>
      </div>
    </div>
  );
}
