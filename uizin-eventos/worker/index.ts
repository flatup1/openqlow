/**
 * UIZIN EventOS — Cloudflare Worker（バックエンド）
 *
 * 役割は3つだけ。
 *   1. 操作者かどうかを見分ける（書き込みは操作者だけ）
 *   2. Google スプレッドシート（v1唯一のCMS）から番組表を取ってくる
 *   3. あとは全部 Durable Object（EventRoom）に渡す
 *
 * 状態はここには置かない。唯一の真実は EventRoom の中だけ。
 */

import { looksLikeHtml, sheetCsvUrl } from '../core/sheet.ts';
import { isAppleMusicUrl, isYouTubeUrl } from '../core/music.ts';
import type { LinkCheck, MusicCue } from '../core/types.ts';
import { normalizeEventId } from '../core/eventId.ts';
import { normalizeEntryConfig, normalizeEntryInput, validateEntry, validateEntryConfig } from '../core/entry.ts';

export { EventRoom } from './event-do.ts';

export type Env = {
  EVENT_ROOM: DurableObjectNamespace;
  /** 操作者だけが持つ合言葉。未設定なら書き込みを一切受け付けない */
  OPERATOR_KEY?: string;
  /** Google スプレッドシートのID */
  SHEET_ID?: string;
  /** シート名（既定: event / matches / music） */
  SHEET_EVENT?: string;
  SHEET_MATCHES?: string;
  SHEET_MUSIC?: string;
  /** 大会ごとの部屋名。大会を分けたいときだけ変える */
  EVENT_ID?: string;
  /** 画面を置くオリジン。カンマ区切り。* は全許可 */
  ALLOWED_ORIGINS?: string;
  /** 顔写真登録専用キー。通常の操作キーとは分離する */
  PHOTO_UPLOAD_KEY?: string;
};

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean);
  const allowAll = allowed.includes('*');
  const allowOrigin = allowAll ? (origin || '*') : allowed.includes(origin) ? origin : '';
  if (!allowOrigin) return {};
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type,x-operator-key,x-photo-upload-key',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(request, env))) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isOperator(request: Request, env: Env): boolean {
  const key = env.OPERATOR_KEY ?? '';
  if (key === '') return false;
  const given = request.headers.get('x-operator-key') ?? new URL(request.url).searchParams.get('key') ?? '';
  if (given.length !== key.length) return false;
  // 長さが同じときだけ、時間差の出ない比較をする
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

function eventId(request: Request, env: Env): string {
  return normalizeEventId(new URL(request.url).searchParams.get('event'), normalizeEventId(env.EVENT_ID));
}

function room(env: Env, request: Request): DurableObjectStub {
  const id = env.EVENT_ROOM.idFromName(eventId(request, env));
  return env.EVENT_ROOM.get(id);
}

function forward(env: Env, request: Request, path: string, init?: RequestInit): Promise<Response> {
  return room(env, request).fetch(new Request('https://event-room' + path, init));
}

/** タイムアウト付きの取得。大会当日にここで固まらないことが最優先 */
async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

function validSheetId(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{20,100}$/.test(trimmed) ? trimmed : '';
}

function receiptNo(): string {
  return 'ENT-' + crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
}

async function anonymousRequestKey(request: Request, event: string): Promise<string> {
  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'local';
  const bytes = new TextEncoder().encode(event + ':' + ip);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).slice(0, 12).map((n) => n.toString(16).padStart(2, '0')).join('');
}

async function loadSheets(env: Env, requestedSheetId = ''): Promise<{ event: string; matches: string; music: string }> {
  const sheetId = validSheetId(requestedSheetId) || validSheetId(env.SHEET_ID);
  if (sheetId === '') throw new Error('SHEET_ID が設定されていません。');
  const names = {
    event: env.SHEET_EVENT ?? 'event',
    matches: env.SHEET_MATCHES ?? 'matches',
    music: env.SHEET_MUSIC ?? 'music',
  };
  const [event, matches, music] = await Promise.all(
    [names.event, names.matches, names.music].map(async (name) => {
      const res = await fetchWithTimeout(sheetCsvUrl(sheetId, name), 10_000);
      if (!res.ok) {
        throw new Error(
          'シート「' + name + '」を読めませんでした（HTTP ' + res.status + '）。共有設定を「リンクを知っている全員／閲覧者」にしてください。',
        );
      }
      const text = await res.text();
      // 200が返ってきても、中身がログイン画面のHTMLなら「読めていない」。
      // これをCSVとして取り込むと、試合0件で上書きしてしまう。
      if (looksLikeHtml(text)) {
        throw new Error(
          'シート「' + name + '」が公開されていません（CSVではなくGoogleのログイン画面が返りました）。' +
            '共有設定を「リンクを知っている全員／閲覧者」にしてください。',
        );
      }
      return text;
    }),
  );
  return { event, matches, music };
}

/** 音源リンクの生死を確認する。確認できなかったものは「未確認」にして赤を増やさない */
async function verifyLinks(cues: MusicCue[]): Promise<LinkCheck[]> {
  const urls: string[] = [];
  for (const cue of cues) {
    const apple = cue.appleMusicUrl.trim();
    const youtube = cue.youtubeUrl.trim();
    if (isAppleMusicUrl(apple)) urls.push(apple);
    else if (isYouTubeUrl(youtube)) urls.push(youtube);
  }
  const unique = Array.from(new Set(urls));

  const results: LinkCheck[] = [];
  const CONCURRENCY = 6;
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    const checked = await Promise.all(
      batch.map(async (url): Promise<LinkCheck> => {
        const checkedAt = Date.now();
        try {
          const res = await fetchWithTimeout(url, 6_000, {
            method: 'GET',
            headers: { range: 'bytes=0-0', 'user-agent': 'UIZIN-EventOS/1.0 link-check' },
          });
          if (res.status === 404 || res.status === 410) {
            return { url, alive: false, httpStatus: res.status, checkedAt, note: 'ページが見つかりません' };
          }
          if (res.status >= 200 && res.status < 400) {
            return { url, alive: true, httpStatus: res.status, checkedAt, note: '' };
          }
          // 403/429 などは「先方が機械アクセスを断っただけ」。リンク切れとは断定しない。
          return { url, alive: null, httpStatus: res.status, checkedAt, note: '確認できませんでした（HTTP ' + res.status + '）' };
        } catch {
          return { url, alive: null, httpStatus: null, checkedAt, note: '確認できませんでした（通信エラー）' };
        }
      }),
    );
    results.push(...checked);
  }
  return results;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    // --- 全画面が見る（読み取り専用） -------------------------------------
    if (path === '/api/health') {
      return withCors(
        json({ ok: true, serverNow: Date.now(), eventId: eventId(request, env), hasSheet: Boolean(env.SHEET_ID) }),
        request,
        env,
      );
    }

    if (path === '/api/time') {
      return withCors(json({ serverNow: Date.now() }), request, env);
    }

    if (path === '/api/state') {
      return withCors(await forward(env, request, '/snapshot'), request, env);
    }

    if (path === '/api/log') {
      return withCors(await forward(env, request, '/log'), request, env);
    }

    if (path === '/api/entry-config' && request.method === 'GET') {
      return withCors(await forward(env, request, '/entry-config'), request, env);
    }

    if (path === '/api/entries' && request.method === 'POST') {
      const configRes = await forward(env, request, '/entry-config');
      const configBody = await configRes.json() as { config?: { published?: boolean; deadline?: string } };
      if (!configBody.config?.published) return withCors(json({ ok: false, reason: '現在は募集していません。' }, 403), request, env);
      const type = request.headers.get('content-type') ?? '';
      let raw: unknown = {};
      let photo: File | null = null;
      if (type.includes('multipart/form-data')) {
        const data = await request.formData().catch(() => null);
        raw = JSON.parse(String(data?.get('entry') ?? '{}')) as unknown;
        const supplied = data?.get('photo');
        photo = supplied instanceof File && supplied.size > 0 ? supplied : null;
      } else if (type.includes('application/json')) {
        raw = await request.json().catch(() => ({}));
      } else return withCors(json({ ok: false, reason: '送信形式が正しくありません。' }, 415), request, env);
      const input = normalizeEntryInput(raw);
      if (input.website) return withCors(json({ ok: true, receiptNo: 'RECEIVED' }), request, env);
      const errors = validateEntry(input);
      if (errors.length) return withCors(json({ ok: false, reason: errors[0], errors }, 400), request, env);
      if (photo && (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 2_000_000)) {
        return withCors(json({ ok: false, reason: '顔写真はJPEG・PNG・WebPの2MB以下にしてください。' }, 413), request, env);
      }
      const id = receiptNo();
      const record = { ...input, receiptNo: id, submittedAt: Date.now(), photoStatus: photo ? 'uploaded' as const : 'none' as const };
      const requestKey = await anonymousRequestKey(request, eventId(request, env));
      const saved = await forward(env, request, '/entries', { method: 'POST', body: JSON.stringify({ entry: record, requestKey }), headers: JSON_HEADERS });
      if (!saved.ok) return withCors(saved, request, env);
      if (photo) await forward(env, request, '/photos/' + id, { method: 'PUT', body: await photo.arrayBuffer(), headers: { 'content-type': photo.type } });
      return withCors(json({ ok: true, receiptNo: id }), request, env);
    }

    const photoMatch = path.match(/^\/api\/photos\/([A-Z0-9-]+)$/i);
    if (photoMatch && request.method === 'GET') {
      return withCors(await forward(env, request, '/photos/' + photoMatch[1].toUpperCase()), request, env);
    }

    if (photoMatch && request.method === 'PUT') {
      const supplied = request.headers.get('x-photo-upload-key') ?? '';
      if (!env.PHOTO_UPLOAD_KEY || supplied !== env.PHOTO_UPLOAD_KEY) {
        return withCors(json({ ok: false, reason: '写真登録キーが違います。' }, 401), request, env);
      }
      const contentType = request.headers.get('content-type') ?? '';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
        return withCors(json({ ok: false, reason: 'JPEG・PNG・WebPのみ登録できます。' }, 415), request, env);
      }
      const body = await request.arrayBuffer();
      if (body.byteLength === 0 || body.byteLength > 2_000_000) {
        return withCors(json({ ok: false, reason: '写真は1バイト以上2MB以下にしてください。' }, 413), request, env);
      }
      return withCors(
        await forward(env, request, '/photos/' + photoMatch[1].toUpperCase(), {
          method: 'PUT',
          body,
          headers: { 'content-type': contentType },
        }),
        request,
        env,
      );
    }

    if (path === '/ws' || path === '/api/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return withCors(json({ ok: false, reason: 'WebSocket でつないでください。' }, 426), request, env);
      }
      return room(env, request).fetch(new Request('https://event-room/ws', request));
    }

    // --- 操作者だけ（書き込み） -------------------------------------------
    const needsOperator =
      path === '/api/command' ||
      path === '/api/undo' ||
      path === '/api/program/reload' ||
      path === '/api/program/upload' ||
      path === '/api/music/check';

    const entryOperatorPath = path === '/api/entry-config' || path === '/api/entries/export';

    if (needsOperator || entryOperatorPath) {
      if ((!entryOperatorPath && request.method !== 'POST') || (entryOperatorPath && !['GET', 'PUT'].includes(request.method))) {
        return withCors(json({ ok: false, reason: '操作方法が正しくありません。' }, 405), request, env);
      }
      if (!isOperator(request, env)) {
        return withCors(
          json({ ok: false, reason: '操作キーが違います。この画面からは操作できません。' }, 401),
          request,
          env,
        );
      }
    }

    if (path === '/api/entry-config' && request.method === 'PUT') {
      const config = normalizeEntryConfig(await request.json().catch(() => ({})));
      const errors = validateEntryConfig(config);
      if (errors.length) return withCors(json({ ok: false, reason: errors[0], errors }, 400), request, env);
      return withCors(await forward(env, request, '/entry-config', { method: 'PUT', body: JSON.stringify(config), headers: JSON_HEADERS }), request, env);
    }

    if (path === '/api/entries/export' && request.method === 'GET') {
      const response = await forward(env, request, '/entries');
      const body = await response.json() as { entries?: Array<Record<string, unknown>> };
      const entries = body.entries ?? [];
      if (url.searchParams.get('view') === 'os') {
        const origin = url.origin;
        const publicRows = entries.map((entry) => ({
          receiptNo: entry.receiptNo, fighterName: entry.fighterName, fighterKana: entry.fighterKana,
          gym: entry.gym, gender: entry.gender, age: entry.age, category: entry.category, weight: entry.weight,
          experience: entry.experience, record: entry.record, canFightTwice: entry.canFightTwice,
          comment: entry.comment, musicUrl: entry.musicUrl,
          photoUrl: entry.photoStatus === 'uploaded' && entry.consentPublicity === true ? origin + '/api/photos/' + entry.receiptNo + '?event=' + encodeURIComponent(eventId(request, env)) : '',
          consentPublicity: entry.consentPublicity, submittedAt: entry.submittedAt,
        }));
        return withCors(json({ ok: true, entries: publicRows }), request, env);
      }
      return withCors(json({ ok: true, entries }), request, env);
    }

    if (path === '/api/command') {
      const body = await request.text();
      return withCors(
        await forward(env, request, '/command', { method: 'POST', body, headers: JSON_HEADERS }),
        request,
        env,
      );
    }

    if (path === '/api/undo') {
      return withCors(await forward(env, request, '/undo', { method: 'POST', body: await request.text(), headers: JSON_HEADERS }), request, env);
    }

    if (path === '/api/program/reload') {
      try {
        const body = (await request.json().catch(() => ({}))) as { sheetId?: unknown };
        const csv = await loadSheets(env, typeof body.sheetId === 'string' ? body.sheetId : '');
        return withCors(
          await forward(env, request, '/program', { method: 'POST', body: JSON.stringify(csv), headers: JSON_HEADERS }),
          request,
          env,
        );
      } catch (error) {
        // 取り込みに失敗しても、今動いている番組表はそのまま。大会は止めない。
        const reason = error instanceof Error ? error.message : String(error);
        return withCors(json({ ok: false, reason, kept: true }, 502), request, env);
      }
    }

    // スプレッドシートに届かない日でも大会を止めないための、手貼り取り込み口。
    // 3枚のCSVをそのまま貼れば、Google が落ちていても番組表を入れ替えられる。
    if (path === '/api/program/upload') {
      const body = (await request.json()) as Partial<{ event: string; matches: string; music: string }>;
      const csv = {
        event: typeof body.event === 'string' ? body.event : '',
        matches: typeof body.matches === 'string' ? body.matches : '',
        music: typeof body.music === 'string' ? body.music : '',
      };
      if (csv.matches.trim() === '') {
        return withCors(json({ ok: false, reason: 'matches のCSVが空です。' }, 400), request, env);
      }
      return withCors(
        await forward(env, request, '/program', { method: 'POST', body: JSON.stringify(csv), headers: JSON_HEADERS }),
        request,
        env,
      );
    }

    if (path === '/api/music/check') {
      const cuesRes = await forward(env, request, '/cues');
      const { cues } = (await cuesRes.json()) as { cues: MusicCue[] };
      const links = await verifyLinks(cues);
      return withCors(
        await forward(env, request, '/music-report', { method: 'POST', body: JSON.stringify({ links }), headers: JSON_HEADERS }),
        request,
        env,
      );
    }

    return withCors(json({ ok: false, reason: 'not found' }, 404), request, env);
  },
};
