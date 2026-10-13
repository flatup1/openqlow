import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// ブラウザのタブに出る名前。画面の中の文（「一番上の『選手の受付をつくる』のタブを押す」）と同じにする。
// 画面の中で名前を付け替えるだけだと、読み込みのあとに上の階層の名前で上書きされてしまう。
export const metadata: Metadata = { title: '選手の受付をつくる' };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
