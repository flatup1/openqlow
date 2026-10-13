import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NoScriptLight } from '../lib/NoScriptLight';

// ブラウザのタブに出る名前。「● 」や大会名は、画面の中で付け足す
export const metadata: Metadata = { title: '試合の準備' };

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}<NoScriptLight /></>;
}
