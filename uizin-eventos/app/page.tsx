'use client';

/**
 * 入口。5画面へのリンクだけ。
 * 初見のスタッフに渡すのはこのURL1つでよい、という形にしてある。
 */

import { useEffect, useState } from 'react';
import { getApiBase } from './lib/config.ts';
import { useEventState } from './lib/useEventState.ts';
import { ConnectionBadge } from './components/TimerBar.tsx';

const SCREENS = [
  {
    href: './op/',
    title: 'ダッシュボード',
    role: '操作者（あなただけ）',
    body: '現在の試合・次の試合・意気込み・「次へ」・「停止」。ここだけが操作できます。',
    tone: 'border-emerald-600 bg-emerald-950/30',
  },
  {
    href: './mc/',
    title: 'MC画面',
    role: 'MC（見るだけ）',
    body: '読み上げる文章だけを大きく表示します。ボタンはありません。',
    tone: 'border-white/15 bg-white/5',
  },
  {
    href: './screen/',
    title: '表示画面',
    role: '大型モニター（見るだけ）',
    body: '対戦カードと意気込みだけ。会場のスクリーンに映します。',
    tone: 'border-white/15 bg-white/5',
  },
  {
    href: './mix/',
    title: 'Event Mix',
    role: '音響（見るだけ）',
    body: '今の曲・次の曲・あと何秒。再生は人が外部サービスで押します。',
    tone: 'border-white/15 bg-white/5',
  },
  {
    href: './check/',
    title: '音源チェック',
    role: '前日準備',
    body: '赤がゼロになるまで大会を開始しない、を確認する画面です。',
    tone: 'border-white/15 bg-white/5',
  },
];

export default function HomePage() {
  const store = useEventState();
  const [api, setApi] = useState('');

  useEffect(() => {
    setApi(getApiBase());
  }, []);

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-4xl font-black text-white">UIZIN EventOS</h1>
        <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-slate-300">v1.0</span>
        <div className="ml-auto">
          <ConnectionBadge connection={store.connection} />
        </div>
      </div>
      <p className="mt-3 text-lg text-slate-300">
        {store.snapshot ? store.snapshot.program.meta.title : '大会を止めないための進行システム'}
        {store.snapshot?.program.meta.venue ? '　/　' + store.snapshot.program.meta.venue : ''}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {SCREENS.map((s) => (
          <a key={s.href} href={s.href} className={'rounded-2xl border p-6 transition hover:brightness-125 ' + s.tone}>
            <p className="text-xs font-bold tracking-widest text-slate-400">{s.role}</p>
            <p className="mt-1 text-2xl font-black text-white">{s.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{s.body}</p>
          </a>
        ))}
      </div>

      <section className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
        <p className="font-bold text-white">5分で分かる使い方</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>前日: 音源チェックで赤をゼロにする。</li>
          <li>当日: ダッシュボードで「番組表を取り込み直す」を1回押す。</li>
          <li>進行中はダッシュボードの「次へ」だけを押す（スペースキーでも押せます）。</li>
          <li>何かあったら「停止」。全画面が待機表示になります。直したら「再開」。</li>
          <li>押し間違えたら「元に戻す」。戻せるのは直前の一手だけです。</li>
        </ol>
        <p className="mt-4 text-slate-400">
          接続先: <code className="rounded bg-black/40 px-1">{api || '(未設定)'}</code>
          　接続先を変えるときは、URLの末尾に <code className="rounded bg-black/40 px-1">?api=https://…</code> を付けます。
        </p>
      </section>
    </main>
  );
}
