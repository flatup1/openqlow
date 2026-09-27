'use client';

/**
 * 操作者の書き込み口。読み取り専用画面はこのファイルを使わない。
 * 権限の判定はサーバー（Worker）側で必ず行う。ここは入口にすぎない。
 */

import type { Command, EventState, MusicReport, Program } from '../../core/types.ts';
import type { EntrySiteConfig } from '../../core/entry.ts';
import { apiUrl, getApiBase, getOperatorKey } from './config.ts';

export type CommandResponse = {
  ok: boolean;
  reason?: string;
  label?: string;
  serverNow?: number;
  state?: EventState;
  program?: Program;
  musicReport?: MusicReport;
  uncertain?: boolean;
};

async function post(path: string, body?: unknown): Promise<CommandResponse> {
  const base = getApiBase();
  const key = getOperatorKey();
  try {
    const res = await fetch(apiUrl(base, path), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-operator-key': key },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(path === '/api/music/check' ? 120_000 : 15_000),
    });
    const data = (await res.json().catch(() => ({}))) as CommandResponse;
    if (!res.ok) {
      return { ok: false, reason: data.reason ?? 'サーバーが応答しませんでした（HTTP ' + res.status + '）' };
    }
    return data;
  } catch {
    return { ok: false, uncertain: true, reason: '結果を確認できません。処理済みの可能性があります。再送せず最新状態を確認してください。' };
  }
}

export function sendCommand(command: Command, expectedVersion: number): Promise<CommandResponse> {
  return post('/api/command', { command, expectedVersion });
}

export function sendUndo(expectedVersion: number): Promise<CommandResponse> {
  return post('/api/undo', { expectedVersion });
}

export function reloadProgram(sheetId?: string): Promise<CommandResponse> {
  return post('/api/program/reload', sheetId ? { sheetId } : {});
}

export function uploadProgram(csv: { event: string; matches: string; music: string }): Promise<CommandResponse> {
  return post('/api/program/upload', csv);
}

export function checkMusic(): Promise<CommandResponse> {
  return post('/api/music/check');
}

export async function saveEntryConfig(config: EntrySiteConfig): Promise<{ ok: boolean; reason?: string }> {
  const base = getApiBase();
  try {
    const res = await fetch(apiUrl(base, '/api/entry-config'), {
      method: 'PUT', headers: { 'content-type': 'application/json', 'x-operator-key': getOperatorKey() },
      body: JSON.stringify(config), signal: AbortSignal.timeout(15_000),
    });
    return await res.json() as { ok: boolean; reason?: string };
  } catch { return { ok: false, reason: '保存結果を確認できません。再送前に画面を読み込み直してください。' }; }
}
