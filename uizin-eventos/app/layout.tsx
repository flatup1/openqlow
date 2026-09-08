import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'UIZIN EventOS',
  description: '大会を止めないための進行システム（v1.0）',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#07090d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-full bg-[#07090d] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
