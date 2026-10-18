import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// 準備の画面（/private/）のタブ名を、この画面には引き継がない（これまでどおりの名前のまま）
export const metadata: Metadata = { title: 'Google受付をつなぐ' };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
