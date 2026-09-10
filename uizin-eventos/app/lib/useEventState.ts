'use client';

/**
 * 全画面が使う唯一の購読口。
 *
 * 画面は「見るだけ」。ここから返ってくる snapshot 以外の真実を持たない。
 * つながり方は3段構え:
 *   1. WebSocket（通常。1秒未満で届く）
 *   2. 800ms ポーリング（WebSocketが張れないとき）
 *   3. 最後に受け取った状態を出したまま「未接続」と赤く出す（画面は消さない）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot, ServerMessage } from '../../core/types.ts';
import { getApiBase, wsUrl } from './config.ts';

export type Connection = 'connecting' | 'live' | 'polling' | 'offline';

export type EventStore = {
  snapshot: Snapshot | null;
  connection: Connection;
  /** サーバー時刻 - この端末の時刻（ms） */
  offsetMs: number;
  /** 最後にサーバーから何か受け取った端末時刻 */
  lastMessageAt: number;
  error: string | null;
  /** この端末で「今のサーバー時刻」を出す */
  serverNow: () => number;
  refresh: () => void;
};

const FAST_POLL_MS = 800;
const SLOW_POLL_MS = 5_000;
const OFFSET_INTERVAL_MS = 60_000;
const STALE_MS = 12_000;

export function useEventState(): EventStore {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [offsetMs, setOffsetMs] = useState(0);
  const [lastMessageAt, setLastMessageAt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const snapshotRef = useRef<Snapshot | null>(null);
  const offsetRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const closedRef = useRef(false);

  const applySnapshot = useCallback((next: Snapshot) => {
    const current = snapshotRef.current;
    // 古いメッセージが後から届いても、進んだ状態を巻き戻さない
    if (current && next.state.version < current.state.version) return;
    snapshotRef.current = next;
    setSnapshot(next);
    setLastMessageAt(Date.now());
  }, []);

  const patchState = useCallback(
    (message: ServerMessage) => {
      const current = snapshotRef.current;
      if (message.t === 'sync') {
        applySnapshot({
          serverNow: message.serverNow,
          state: message.state,
          program: message.program,
          musicReport: message.musicReport,
        });
        return;
      }
      if (!current) return;
      if (message.t === 'state') {
        applySnapshot({ ...current, serverNow: message.serverNow, state: message.state });
        return;
      }
      if (message.t === 'program') {
        applySnapshot({ ...current, serverNow: message.serverNow, program: message.program, state: message.state });
        return;
      }
      if (message.t === 'music') {
        applySnapshot({ ...current, serverNow: message.serverNow, musicReport: message.musicReport });
      }
    },
    [applySnapshot],
  );

  const measureOffset = useCallback(async () => {
    const base = getApiBase();
    try {
      const sentAt = Date.now();
      const res = await fetch(base + '/api/time', { cache: 'no-store' });
      const receivedAt = Date.now();
      const data = (await res.json()) as { serverNow: number };
      // 往復の真ん中をこの端末の「その瞬間」とみなす
      const offset = data.serverNow - (sentAt + receivedAt) / 2;
      offsetRef.current = offset;
      setOffsetMs(offset);
    } catch {
      // 測れなくても、ずれたまま動かす（止めない）
    }
  }, []);

  const pull = useCallback(async () => {
    const base = getApiBase();
    try {
      const res = await fetch(base + '/api/state', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = (await res.json()) as Snapshot;
      applySnapshot(data);
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [applySnapshot]);

  // --- WebSocket ------------------------------------------------------------
  useEffect(() => {
    closedRef.current = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closedRef.current) return;
      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl(getApiBase()));
      } catch {
        scheduleRetry();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        retryRef.current = 0;
        setConnection('live');
        setError(null);
      };
      socket.onmessage = (event) => {
        try {
          patchState(JSON.parse(String(event.data)) as ServerMessage);
          setConnection('live');
        } catch {
          // 壊れたメッセージは捨てる
        }
      };
      socket.onerror = () => {
        setConnection((c) => (c === 'live' ? 'polling' : c));
      };
      socket.onclose = () => {
        socketRef.current = null;
        if (closedRef.current) return;
        setConnection('polling');
        scheduleRetry();
      };
    };

    const scheduleRetry = () => {
      if (closedRef.current) return;
      retryRef.current = Math.min(retryRef.current + 1, 5);
      const wait = Math.min(1_000 * retryRef.current, 5_000);
      retryTimer = setTimeout(connect, wait);
    };

    connect();
    return () => {
      closedRef.current = true;
      if (retryTimer) clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [patchState]);

  // --- 初回の読み込みと時計合わせ --------------------------------------------
  useEffect(() => {
    void pull();
    void measureOffset();
    const timer = setInterval(() => void measureOffset(), OFFSET_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [pull, measureOffset]);

  // --- 保険のポーリング（WebSocketが死んでも画面が固まらない） -----------------
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const loop = async () => {
      if (stopped) return;
      const live = socketRef.current?.readyState === WebSocket.OPEN;
      if (!live) {
        const ok = await pull();
        if (!stopped) setConnection(ok ? 'polling' : 'offline');
      } else if (Date.now() - lastMessageAt > STALE_MS) {
        // つながっているはずなのに何も来ない → 念のため取りに行く
        await pull();
      }
      if (!stopped) timer = setTimeout(loop, live ? SLOW_POLL_MS : FAST_POLL_MS);
    };

    timer = setTimeout(loop, FAST_POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [pull, lastMessageAt]);

  // --- タブに戻ってきたら即座に追いつく ---------------------------------------
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void pull();
        void measureOffset();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [pull, measureOffset]);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);
  const refresh = useCallback(() => {
    void pull();
    void measureOffset();
  }, [pull, measureOffset]);

  return { snapshot, connection, offsetMs, lastMessageAt, error, serverNow, refresh };
}

/** 表示を進めるための刻み（既定 200ms = 秒表示には十分で、電池も食わない） */
export function useTick(intervalMs = 200): number {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return tick;
}
