import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// 準備の画面（/private/）のタブ名を、この画面には引き継がない。ブラウザのタブにも、日本語の名前を出す
export const metadata: Metadata = { title: '試合当日の画面' };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
