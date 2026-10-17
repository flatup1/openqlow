import type { NextConfig } from 'next';

/**
 * 画面は「静的な書き出し」にする。
 *
 * 理由: 大会当日に、サーバー側のレンダリングが落ちて画面が真っ白になる、
 * という壊れ方を最初から無くすため。Cloudflare Pages にただ置くだけで動く。
 * 状態は全部 Worker(+Durable Object) 側にあるので、画面は静的で足りる。
 */
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
