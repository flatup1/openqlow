import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// ブラウザのタブに出る名前（準備の画面の名前は引き継がない）。印刷のPDFの名前は、画面の中で大会名を足す
export const metadata: Metadata = { title: '対戦一覧表（A3）' };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
