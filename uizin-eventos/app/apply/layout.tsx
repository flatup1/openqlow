import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NoScriptLight } from '../lib/NoScriptLight';

// JS が動く前の画面と、LINE のリンクのプレビューに出る名前。大会名はリンクの # のあとにあり、サーバーには届かないので、ここには入れない。
// 検索に出さない設定（robots）は、大元の layout から引き継ぐ
export const metadata: Metadata = {
  title: '大会の申し込み',
  description: '選手の申し込みページです。',
};

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}<NoScriptLight /></>;
}
