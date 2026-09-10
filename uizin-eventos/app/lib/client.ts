'use client';

/**
 * 操作者の書き込み口。読み取り専用画面はこのファイルを使わない。
 * 権限の判定はサーバー（Worker）側で必ず行う。ここは入口にすぎない。
 */

import type { Command, EventState, MusicReport, Program } from '../../core/types.ts';
import { getApiBase, getOperatorKey } from './config.ts';

export type CommandResponse = {
  ok: boolean;
  reason?: string;
  label?: string;
  serverNow?: number;
  state?: EventState;
  program?: Program;
  musicReport?: MusicReport;
};

async function post(path: string, body?: unknown): Promise<CommandResponse> {
  const base = getApiBase();
  const key = getOperatorKey();
  try {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-operator-key': key },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as CommandResponse;
    if (!res.ok) {
      return { ok: false, reason: data.reason ?? 'サーバーが応答しませんでした（HTTP ' + res.status + '）' };
    }
    return data;
  } catch {
    return { ok: false, reason: 'ネットワークにつながりません。電波を確認してください。' };
  }
}

export function sendCommand(command: Command): Promise<CommandResponse> {
  return post('/api/command', { command });
}

export function sendUndo(): Promise<CommandResponse> {
  return post('/api/undo');
}

export function reloadProgram(): Promise<CommandResponse> {
  return post('/api/program/reload');
}

export function checkMusic(): Promise<CommandResponse> {
  return post('/api/music/check');
}
