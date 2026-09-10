'use client';

import type { Connection } from '../lib/useEventState.ts';

export function Loading({ connection, error }: { connection: Connection; error: string | null }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-2xl font-bold text-slate-200">イベント情報を読み込んでいます…</p>
      <p className="text-sm text-slate-400">
        つながらないときは、URLの末尾に <code className="rounded bg-white/10 px-1">?api=https://…</code> を付けて
        接続先をやり直せます。
      </p>
      {connection === 'offline' ? (
        <p className="rounded-lg bg-rose-950 px-4 py-2 text-sm font-semibold text-rose-200">
          サーバーに届いていません{error ? '（' + error + '）' : ''}
        </p>
      ) : null}
    </main>
  );
}
