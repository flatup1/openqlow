import type { HistoryItem } from '../../types/animation';
import { downloadUrl } from '../../services/animationApi';

interface Props {
  items: HistoryItem[];
  onRemove: (jobId: string) => void;
  onClear: () => void;
}

export function GenerationHistory({ items, onRemove, onClear }: Props) {
  if (items.length === 0) {
    return <p className="text-xs text-muted">まだ履歴はありません。生成すると、ここに直近の動画が並びます。</p>;
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted">直近 {items.length} 件</span>
        <button type="button" onClick={onClear} className="text-xs text-accent font-bold">
          すべて消す
        </button>
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.jobId} className="rounded-xl bg-white/5 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold">{new Date(it.createdAt).toLocaleString('ja-JP')}</span>
              <span className="text-muted">{it.durationSeconds}秒</span>
            </div>
            <p className="mt-1 text-muted line-clamp-2">{it.prompt}</p>
            <div className="mt-2 flex gap-3">
              <a href={downloadUrl(it.jobId)} className="text-accent font-bold" target="_blank" rel="noreferrer">
                動画を開く
              </a>
              <button type="button" onClick={() => onRemove(it.jobId)} className="text-muted hover:text-white">
                削除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
