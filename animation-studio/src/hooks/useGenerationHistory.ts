import { useCallback, useEffect, useState } from 'react';
import type { HistoryItem } from '../types/animation';

const KEY = 'flatup-animation-history';
const MAX_ITEMS = 12;

function load(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

/** 直近の生成履歴を localStorage に保存する。 */
export function useGenerationHistory() {
  const [items, setItems] = useState<HistoryItem[]>(() => load());

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* 保存に失敗しても致命的ではない */
    }
  }, [items]);

  const add = useCallback((item: HistoryItem) => {
    setItems((prev) => [item, ...prev.filter((p) => p.jobId !== item.jobId)].slice(0, MAX_ITEMS));
  }, []);

  const remove = useCallback((jobId: string) => {
    setItems((prev) => prev.filter((p) => p.jobId !== jobId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return { items, add, remove, clear };
}
