/**
 * EventRoom — イベントステートを持つ唯一の場所（Durable Object）。
 *
 * ここが「唯一の真実」。画面同士は直接つながらない。
 *   操作者 → HTTP POST /command → ここが書き換える → 全画面へ WebSocket で配る
 *
 * 保存は全部ここが自動でやる。保存ボタンは無い。
 * ブラウザを再読み込みしても、ここから同じ状態が返るので完全に復元される。
 */

import type {
  Command,
  EventState,
  LinkCheck,
  LogEntry,
  MusicReport,
  Program,
  ServerMessage,
  Snapshot,
} from '../core/types.ts';
import { EMPTY_PROGRAM, applyProgram, initialState, reduce } from '../core/state.ts';
import { LOG_LIMIT, commit, newHistory, undo } from '../core/history.ts';
import type { History } from '../core/history.ts';
import { parseProgram } from '../core/sheet.ts';
import type { SheetCsv } from '../core/sheet.ts';
import { summarizeMusic } from '../core/music.ts';

type StoredHistory = {
  current: EventState;
  previous: EventState | null;
  log: LogEntry[];
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export class EventRoom {
  private ctx: DurableObjectState;
  private program: Program = EMPTY_PROGRAM;
  private history: History = newHistory(initialState(0, EMPTY_PROGRAM));
  private musicReport: MusicReport | null = null;
  private loaded = false;

  constructor(ctx: DurableObjectState, _env: unknown) {
    this.ctx = ctx;
    this.ctx.blockConcurrencyWhile(async () => {
      await this.load();
    });
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    const stored = await this.ctx.storage.get<{
      program: Program;
      history: StoredHistory;
      musicReport: MusicReport | null;
    }>('room');
    if (stored) {
      this.program = stored.program ?? EMPTY_PROGRAM;
      this.history = {
        current: stored.history.current,
        previous: stored.history.previous,
        log: stored.history.log ?? [],
      };
      this.musicReport = stored.musicReport ?? null;
    } else {
      this.program = EMPTY_PROGRAM;
      this.history = newHistory(initialState(Date.now(), EMPTY_PROGRAM));
    }
    this.loaded = true;
  }

  /** 変更のたびに必ず保存する（自動保存。保存ボタンは置かない） */
  private async persist(): Promise<void> {
    await this.ctx.storage.put('room', {
      program: this.program,
      history: this.history,
      musicReport: this.musicReport,
    });
  }

  private snapshot(): Snapshot {
    return {
      serverNow: Date.now(),
      state: this.history.current,
      program: this.program,
      musicReport: this.musicReport,
    };
  }

  private broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // 切れている端末は無視する。大会は止めない。
      }
    }
  }

  private broadcastState(): void {
    this.broadcast({ t: 'state', serverNow: Date.now(), state: this.history.current });
  }

  // -------------------------------------------------------------------------
  // WebSocket（配信専用。ここからは状態を書き換えられない）
  // -------------------------------------------------------------------------

  webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): void {
    if (typeof raw !== 'string') return;
    // 受け付けるのは生存確認だけ。書き換えは HTTP の /command からしかできない。
    if (raw === 'ping' || raw === '{"t":"ping"}') {
      ws.send(JSON.stringify({ t: 'pong', serverNow: Date.now() }));
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code === 1006 ? 1000 : code, reason);
    } catch {
      // すでに閉じている
    }
  }

  webSocketError(): void {
    // 何もしない（再接続は画面側の責任）
  }

  // -------------------------------------------------------------------------
  // HTTP
  // -------------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    await this.load();
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/ws') {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ t: 'sync', ...this.snapshot() }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (path === '/snapshot') {
      return json(this.snapshot());
    }

    if (path === '/log') {
      return json({ serverNow: Date.now(), log: this.history.log });
    }

    if (path === '/command' && request.method === 'POST') {
      const body = (await request.json()) as { command?: Command };
      const command = body.command;
      if (!command || typeof command.type !== 'string') {
        return json({ ok: false, reason: '操作の中身がありません。' }, 400);
      }
      const now = Date.now();
      const result = reduce(this.history.current, this.program, command, now);
      if (!result.changed) {
        return json({ ok: false, reason: result.reason, serverNow: now, state: this.history.current }, 409);
      }
      this.history = commit(this.history, result.state);
      await this.persist();
      this.broadcastState();
      return json({ ok: true, label: result.label, serverNow: now, state: this.history.current });
    }

    if (path === '/undo' && request.method === 'POST') {
      const now = Date.now();
      const result = undo(this.history, now);
      if (!result.changed) {
        return json({ ok: false, reason: result.reason, serverNow: now, state: this.history.current }, 409);
      }
      this.history = result.history;
      await this.persist();
      this.broadcastState();
      return json({ ok: true, serverNow: now, state: this.history.current });
    }

    if (path === '/program' && request.method === 'POST') {
      const csv = (await request.json()) as SheetCsv;
      const now = Date.now();
      const next = parseProgram(csv, now);
      const previous = this.program;

      // 進行中に「試合0件の番組表」で上書きしない。
      // シートの消し間違い・SHEET_IDの入れ違い・読み取り失敗のどれであっても、
      // 走っている大会から対戦カードが消えるのは、最も避けたい壊れ方。
      if (
        next.matches.length === 0 &&
        previous.matches.length > 0 &&
        this.history.current.phase !== 'before'
      ) {
        return json(
          {
            ok: false,
            kept: true,
            reason:
              '取り込んだ番組表に試合が1件もありません。大会が進行中のため、今の番組表を残しました。シートを確認してください。',
            serverNow: now,
            state: this.history.current,
          },
          409,
        );
      }
      this.program = next;
      const entry: LogEntry = {
        type: 'program_reload',
        at: now,
        label: '番組表を取り込み（revision ' + next.revision + '）',
        version: this.history.current.version + 1,
      };
      this.history = {
        current: applyProgram(this.history.current, next, previous, now),
        previous: this.history.current,
        log: [entry, ...this.history.log].slice(0, LOG_LIMIT),
      };
      // 取り込み直しで、前回の到達確認は無効にする（古い赤/緑を残さない）
      if (this.musicReport && this.musicReport.programRevision !== next.revision) {
        this.musicReport = null;
      }
      await this.persist();
      this.broadcast({ t: 'program', serverNow: now, program: next, state: this.history.current });
      return json({ ok: true, serverNow: now, program: next, state: this.history.current });
    }

    if (path === '/music-report' && request.method === 'POST') {
      const body = (await request.json()) as { links: LinkCheck[] };
      const now = Date.now();
      const links = Array.isArray(body.links) ? body.links : [];
      const report: MusicReport = {
        checkedAt: now,
        programRevision: this.program.revision,
        summary: summarizeMusic(this.program.cues, links),
        links,
      };
      this.musicReport = report;
      await this.persist();
      this.broadcast({ t: 'music', serverNow: now, musicReport: report });
      return json({ ok: true, serverNow: now, musicReport: report });
    }

    if (path === '/cues') {
      return json({ cues: this.program.cues, revision: this.program.revision });
    }

    return json({ ok: false, reason: 'not found: ' + path }, 404);
  }
}
