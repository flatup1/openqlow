import { readDraft, saveDraft } from '../core/setupDraft.ts';
/**
 * EventRoom — イベントステートを持つ唯一の場所（Durable Object）。
 *
 * ここが「唯一の真実」。画面同士は直接つながらない。
 *   操作者 → HTTP POST /command → ここが書き換える → 全画面へ WebSocket で配る
 *
 * 保存は全部ここが自動でやる。保存ボタンは無い。
 * ブラウザを再読み込みしても、ここから同じ状態が返るので完全に復元される。
 */

import { CloudConflict, readCloudTournament, saveCloudTournament, type AtomicStore } from '../core/cloudTournament.ts';
import { acceptingEntries, entrySubmission, publicRecruitment } from '../core/cloudEntry.ts';
import { timerCommand, type TimerAction } from '../core/privateTimer.ts';
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
import { EMPTY_PROGRAM, applyProgram, currentMatch, initialState, reduce } from '../core/state.ts';
import { LOG_LIMIT, commit, newHistory, undo } from '../core/history.ts';
import type { History } from '../core/history.ts';
import { parseProgram } from '../core/sheet.ts';
import type { SheetCsv } from '../core/sheet.ts';
import { summarizeMusic } from '../core/music.ts';
import type { EntryRecord, EntrySiteConfig } from '../core/entry.ts';
import { EMPTY_ENTRY_CONFIG, normalizeEntryConfig } from '../core/entry.ts';

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
  private entryConfig: EntrySiteConfig = EMPTY_ENTRY_CONFIG;
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
      entryConfig?: EntrySiteConfig;
    }>('room');
    if (stored) {
      this.program = stored.program ?? EMPTY_PROGRAM;
      this.history = {
        current: stored.history.current,
        previous: stored.history.previous,
        log: stored.history.log ?? [],
      };
      this.musicReport = stored.musicReport ?? null;
      this.entryConfig = stored.entryConfig ? normalizeEntryConfig(stored.entryConfig) : EMPTY_ENTRY_CONFIG;
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
      entryConfig: this.entryConfig,
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

    if (path === '/private-catalog') {
      if(request.method==='GET') {
        const ids=await this.ctx.storage.get<string[]>('private:catalog')||[];
        const events=await Promise.all(ids.map(id=>this.ctx.storage.get('private:catalog:'+id)));
        return json({ok:true,events:events.filter(Boolean)});
      }
      if(request.method==='PUT') {
        const entry=await request.json() as {eventId:string;title:string;date:string;updatedAt:number};
        if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.eventId)||typeof entry.title!=='string'||entry.title.length>5000||typeof entry.date!=='string'||entry.date.length>5000||!Number.isSafeInteger(entry.updatedAt))return json({ok:false},400);
        const catalogSaved=await this.ctx.storage.transaction(async tx=>{
          const ids=await tx.get<string[]>('private:catalog')||[];
          const key='private:catalog:'+entry.eventId;
          const old=await tx.get<typeof entry>(key);
          if(old&&old.updatedAt>entry.updatedAt)return true;
          if(!ids.includes(entry.eventId)&&ids.length>=1000)return false;
          await tx.put(key,{eventId:entry.eventId,title:entry.title,date:entry.date,updatedAt:entry.updatedAt});
          await tx.put('private:catalog',[entry.eventId,...ids.filter(id=>id!==entry.eventId)]);
          return true;
        });
        return json({ok:catalogSaved},catalogSaved?200:409);
      }
      return json({ok:false},405);
    }

    if(path==='/cloud-entry-index') {
      const code=url.searchParams.get('code')||'';
      if(!/^[a-f0-9]{64}$/.test(code))return json({ok:false},400);
      if(request.method==='GET')return json({room:await this.ctx.storage.get('entry-address:'+code)||null});
      if(request.method==='PUT'){const body=await request.json() as {room:string};if(typeof body.room!=='string'||!body.room.startsWith('private:')||body.room.length>200)return json({ok:false},400);await this.ctx.storage.put('entry-address:'+code,body.room);return json({ok:true});}
      return json({ok:false},405);
    }
    if(path==='/cloud-view'&&request.method==='GET') {
      const data=await readCloudTournament(this.ctx.storage as unknown as AtomicStore,url.searchParams.get('event')||'');
      if(!data?.audience?.open)return json({ok:false,reason:'観客向け画面は開いていません。'},404);
      const bout=data.bouts[data.currentBout];
      const side=(id:string|undefined)=>{const fighter=data.fighters.find(f=>f.id===id);return fighter?{name:fighter.name,gym:fighter.gym,weight:fighter.weight}:null;};
      return json({ok:true,view:{title:data.title,boutNo:data.currentBout+1,totalBouts:data.bouts.length,red:side(bout?.redId),blue:side(bout?.blueId)}});
    }
    if(path==='/cloud-entry') {
      const eventId=url.searchParams.get('event')||'',store=this.ctx.storage as unknown as AtomicStore;
      try {
        const body=request.method==='POST'?await request.json():null;
        if(!['GET','POST'].includes(request.method))return json({ok:false},405);
        for(let attempt=0;attempt<4;attempt++) {
          const data=await readCloudTournament(store,eventId);
          if(!data||!data.recruitment?.open)return json({ok:false,reason:'この大会の受付は開いていません。'},404);
          if(request.method==='GET')return json({ok:true,recruitment:publicRecruitment(data)});
          const {fighter}=entrySubmission(body,data);
          const previous=data.fighters.find(f=>f.id===fighter.id);
          // Retry after a lost response returns the same receipt, even after the deadline.
          if(previous){if(JSON.stringify(previous)!==JSON.stringify(fighter))return json({ok:false,reason:'この受付番号は保存済みです。内容を変えず確認してください。'},409);return json({ok:true,receipt:fighter.id});}
          if(!acceptingEntries(data))return json({ok:false,reason:'申し込みの締切を過ぎています。'},409);
          if(data.fighters.length>=3000)return json({ok:false,reason:'受付人数の上限です。主催者へ確認してください。'},409);
          try {await saveCloudTournament(store,eventId,{...data,fighters:[...data.fighters,fighter]});return json({ok:true,receipt:fighter.id});}
          catch(error){if(error instanceof CloudConflict&&attempt<3)continue;throw error;}
        }
      }catch(error){return json({ok:false,reason:error instanceof Error?error.message:'保存結果を確認できません。'},error instanceof CloudConflict?409:400);}
    }
    if(path==='/private-timer'&&request.method==='POST') {
      const eventId=url.searchParams.get('event')||'',store=this.ctx.storage as unknown as AtomicStore;
      try {
        const command=await request.json() as {action:TimerAction;updatedAt:number};
        const data=await readCloudTournament(store,eventId);
        if(!data)return json({ok:false,reason:'大会を保存してください。'},404);
        if(command.updatedAt!==data.updatedAt)throw new CloudConflict('別の画面で更新されました。最新の試合を確認してください。');
        const serverNow=Date.now();
        return json({ok:true,event:await saveCloudTournament(store,eventId,timerCommand(data,command.action,serverNow)),serverNow});
      }catch(error){return json({ok:false,reason:error instanceof Error?error.message:'時計を操作できません。'},error instanceof CloudConflict?409:400);}
    }
    if(path==='/private-draft' && ['GET','PUT'].includes(request.method)) {
      const eventId=url.searchParams.get('event')||'',store=this.ctx.storage as unknown as AtomicStore;
      try{return json({ok:true,draft:request.method==='GET'?await readDraft(store,eventId):await saveDraft(store,eventId,await request.json())});}
      catch(error){return json({ok:false,reason:error instanceof Error?error.message:'途中保存できません。'},error instanceof CloudConflict?409:400);}
    }
    if (path === '/private-event' && ['GET','PUT'].includes(request.method)) {
      const eventId = url.searchParams.get('event') || '';
      try {
        if (request.method === 'GET') return json({ok:true,event:await readCloudTournament(this.ctx.storage as unknown as AtomicStore,eventId),serverNow:Date.now()});
        const value = await request.json();
        return json({ok:true,event:await saveCloudTournament(this.ctx.storage as unknown as AtomicStore,eventId,value)});
      } catch(error) {
        return json({ok:false,reason:error instanceof Error ? error.message : '保存を確認できませんでした。'},error instanceof CloudConflict ? 409 : 400);
      }
    }

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

    if (path === '/entry-config' && request.method === 'GET') {
      return json({ ok: true, config: this.entryConfig });
    }

    if (path === '/entry-config' && request.method === 'PUT') {
      this.entryConfig = await request.json() as EntrySiteConfig;
      await this.persist();
      return json({ ok: true, config: this.entryConfig });
    }

    if (path === '/entries' && request.method === 'POST') {
      const body = await request.json() as { entry?: EntryRecord; requestKey?: string };
      const entry = body.entry;
      if (!entry?.receiptNo) return json({ ok: false, reason: '申込内容がありません。' }, 400);
      const requestKey = typeof body.requestKey === 'string' ? body.requestKey.slice(0, 64) : '';
      if (requestKey) {
        const rateKey = 'entry-rate:' + requestKey;
        const current = await this.ctx.storage.get<{ startedAt: number; count: number }>(rateKey);
        const now = Date.now();
        const rate = current && now - current.startedAt < 60 * 60 * 1000 ? current : { startedAt: now, count: 0 };
        if (rate.count >= 5) return json({ ok: false, reason: '短時間に送信回数が多すぎます。1時間後にお試しください。' }, 429);
        await this.ctx.storage.put(rateKey, { startedAt: rate.startedAt, count: rate.count + 1 });
      }
      await this.ctx.storage.put('entry:' + entry.receiptNo, entry);
      const index = await this.ctx.storage.get<string[]>('entry:index') ?? [];
      if (!index.includes(entry.receiptNo)) await this.ctx.storage.put('entry:index', [entry.receiptNo, ...index]);
      return json({ ok: true, receiptNo: entry.receiptNo });
    }

    if (path === '/entries' && request.method === 'GET') {
      const index = await this.ctx.storage.get<string[]>('entry:index') ?? [];
      const records = (await Promise.all(index.map((id) => this.ctx.storage.get<EntryRecord>('entry:' + id)))).filter(Boolean);
      return json({ ok: true, entries: records });
    }

    const photoMatch = path.match(/^\/photos\/([A-Z0-9-]+)$/i);
    if (photoMatch && request.method === 'GET') {
      const key = 'photo:' + photoMatch[1].toUpperCase();
      const stored = await this.ctx.storage.get<{ bytes: ArrayBuffer; contentType: string }>(key);
      if (!stored) return json({ ok: false, reason: '写真がありません。' }, 404);
      return new Response(stored.bytes, {
        headers: {
          'content-type': stored.contentType,
          'cache-control': 'public, max-age=3600',
          'x-content-type-options': 'nosniff',
        },
      });
    }

    if (photoMatch && request.method === 'PUT') {
      const bytes = await request.arrayBuffer();
      const contentType = request.headers.get('content-type') ?? 'image/jpeg';
      const key = 'photo:' + photoMatch[1].toUpperCase();
      await this.ctx.storage.put(key, { bytes, contentType });
      return json({ ok: true, receiptNo: photoMatch[1].toUpperCase(), size: bytes.byteLength });
    }

    if (path === '/command' && request.method === 'POST') {
      const body = (await request.json()) as { command?: Command; expectedVersion?: number };
      const command = body.command;
      if (!command || typeof command.type !== 'string') {
        return json({ ok: false, reason: '操作の中身がありません。' }, 400);
      }
      // Emergency hold remains available even to an old client. All progression
      // requires the exact state the operator saw; two tabs cannot advance it twice.
      if (command.type !== 'hold' && body.expectedVersion !== this.history.current.version) {
        return json({ ok: false, reason: '別の操作で状態が更新されています。画面を読み込み直してから操作してください。', state: this.history.current }, 409);
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
      if (this.history.current.hold.active) {
        return json({ ok: false, reason: '停止中は元に戻せません。安全確認後に再開してください。' }, 409);
      }
      const body = await request.json().catch(() => ({})) as { expectedVersion?: number };
      if (body.expectedVersion !== this.history.current.version) {
        return json({ ok: false, reason: '最新状態を確認してから元に戻してください。', state: this.history.current }, 409);
      }
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
        previous.matches.length > 0
      ) {
        return json(
          {
            ok: false,
            kept: true,
            reason:
              '取り込んだ番組表に試合が1件もありません。今の番組表を残しました。シートを確認してください。',
            serverNow: now,
            state: this.history.current,
          },
          409,
        );
      }
      const activeMatch = currentMatch(previous, this.history.current);
      if (this.history.current.phase !== 'before' && this.history.current.phase !== 'finished' && activeMatch &&
        !next.matches.some(m => m.no === activeMatch.no)) {
        return json({ ok: false, kept: true, reason: '現在の試合が更新データにありません。今の番組表を残しました。試合番号を確認してください。' }, 409);
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
        // A state-only Undo cannot restore the previous program. Prevent mismatched revisions.
        previous: null,
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
