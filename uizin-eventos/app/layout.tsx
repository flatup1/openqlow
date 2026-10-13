import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tournament OS',
  description: '格闘技大会を簡単・安全に進行する汎用システム',
  // 検索に出さない（選手・大会の画面は、リンクを知っている人だけが使う）
  robots: { index: false, follow: false },
  // ファイルを探しにいかないための空のアイコン（アドレスバーの「見つからない」の赤い行を出さない）
  icons: { icon: 'data:,' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#07090d',
};

/**
 * 最初の一瞬と、動かないブラウザのための、ごく小さな補助（外へは何も送らない。古いブラウザでも動くよう ES5 で書く）。
 * 1) 申し込みページ（/apply/）と、会長の画面（/private/…）は、読み込みの前から明るい色にする（黒い画面が一瞬ちらつくのを防ぐ）。
 * 2) 10秒たっても「よみこみ中」のままなら、黄色の ⚠ で「古いブラウザかもしれません」と知らせる。
 */
const BOOT_SCRIPT = `(function(){try{
var d=document,h=d.documentElement;
if(/^\\/(apply|private)(\\/|$)/.test(location.pathname)){h.setAttribute('data-theme','light');h.setAttribute('data-theme-boot','1');var m=d.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','#eef2f8');}
setTimeout(function(){
if(!d.querySelector('[data-tos-loading]'))return;
var b=d.createElement('div');b.setAttribute('role','alert');
b.style.cssText='background:#fef08a;color:#1c1917;border:3px solid #a16207;border-radius:10px;padding:12px 14px;margin:12px;font-size:18px;font-weight:700;line-height:1.6';
b.textContent='\\u26A0 ページが、なかなか開きません。ブラウザが古いかもしれません。Chrome か、新しい Safari で、開き直してください。';
d.body.insertBefore(b,d.body.firstChild);
},10000);
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="min-h-full bg-[#07090d] text-slate-100 antialiased">
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        <noscript>
          <div role="alert" style={{ background: '#fef08a', color: '#1c1917', border: '3px solid #a16207', borderRadius: 10, padding: '12px 14px', margin: 12, fontSize: 18, fontWeight: 700, lineHeight: 1.6 }}>
            ⚠ このページは、JavaScript（ジャバスクリプト）を使います。ブラウザの設定で、JavaScript を「オン」にしてください。または、Chrome か Safari で、開き直してください。
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}
