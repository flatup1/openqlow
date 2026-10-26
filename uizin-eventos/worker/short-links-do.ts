/**
 * ShortLinks — 短い申込URLの「行き先」だけを置く、小さな保管庫（Durable Object）。
 *
 * 大会の状態（EventRoom）とは別の箱にしてあるので、大会当日の画面の動きには触れない。
 *   slot（大会ID:モード）→ コード … 一度決めたら変えない（同じ大会・同じモードの短いURLは、ずっと同じ）
 *   code（コード）→ 行き先（申込ページのURL） … 入れ直せる（同じ短いURLが、新しい行き先に変わる）
 * 枠の名前（大会ID:モード）は、行き先のリンクの中身から決めたものだけ受け取る（core/shortLink.ts の shortLinkSlot）。
 * 箱に入る行き先は、URLとして整えた形（途中の改行・タブが取れた形）だけ。
 * 古い長いURLは、ここを通らない。だから、もう配ってあるURLは何も変わらない。
 */

import { isShortLinkTarget, SHORT_CODE_LENGTH, SHORT_CODE_PATTERN, SHORT_LINK_SLOT_PATTERN, shortCodeChars, shortLinkSlot } from '../core/shortLink.ts';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function newCode(): string {
  let code = '';
  while (code.length < SHORT_CODE_LENGTH) code += shortCodeChars(crypto.getRandomValues(new Uint8Array(16)));
  return code.slice(0, SHORT_CODE_LENGTH);
}

export class ShortLinks {
  private ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, _env: unknown) {
    this.ctx = ctx;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'PUT' && url.pathname === '/slot') {
      const body = (await request.json().catch(() => null)) as { slot?: unknown; target?: unknown } | null;
      const slot = typeof body?.slot === 'string' ? body.slot : '';
      const target = typeof body?.target === 'string' ? body.target : '';
      // 枠の名前は、行き先のリンクの中身（大会ID:モード）と同じものだけ。Worker が決めた枠でも、ここでもう一度、同じ決まりで確かめる
      const derived = shortLinkSlot(target);
      if (!SHORT_LINK_SLOT_PATTERN.test(slot) || !derived.ok || derived.slot !== slot) return json({ ok: false, reason: 'bad input' }, 400);
      // 大会・モードのコードは、初めてのときだけ作る。作り直しても、同じコードのまま行き先だけ変わる
      const code = (await this.ctx.storage.get<string>('slot:' + slot)) ?? (await this.freeCode());
      await this.ctx.storage.put({ ['slot:' + slot]: code, ['code:' + code]: derived.href });
      return json({ ok: true, code });
    }

    if (request.method === 'GET' && url.pathname.startsWith('/code/')) {
      const code = url.pathname.slice('/code/'.length);
      const target = SHORT_CODE_PATTERN.test(code) ? await this.ctx.storage.get<string>('code:' + code) : undefined;
      return typeof target === 'string' && isShortLinkTarget(target)
        ? json({ ok: true, target: new URL(target).href })
        : json({ ok: false, reason: 'not found' }, 404);
    }

    return json({ ok: false, reason: 'not found' }, 404);
  }

  /** まだ使われていないコード。同じ字が既にあれば作り直す（めったに起きない） */
  private async freeCode(): Promise<string> {
    let code = newCode();
    while ((await this.ctx.storage.get('code:' + code)) !== undefined) code = newCode();
    return code;
  }
}
