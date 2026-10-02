import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tournament OS',
  description: '格闘技大会を簡単・安全に進行する汎用システム',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#07090d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-full bg-[#07090d] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
