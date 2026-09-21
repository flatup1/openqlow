/** Fail closed: cached/stale state must never authorize a command. */
export function canOperate(connection: string, hasKey: boolean, lastMessageAt: number, now: number): boolean {
  return hasKey && (connection === 'live' || connection === 'polling') &&
    lastMessageAt > 0 && now >= lastMessageAt && now - lastMessageAt < 12_000;
}

/** Synchronous lock also covers two events in the same React render. */
export function createOperationGate() {
  let pending = false;
  let availableAt = 0;
  return {
    acquire(now: number): boolean {
      if (pending || now < availableAt) return false;
      pending = true;
      return true;
    },
    release(now: number) { pending = false; availableAt = now + 800; },
  };
}

export function shortcut(code: string, repeat: boolean, interactive: boolean, held: boolean): 'next' | 'hold' | null {
  if (repeat || interactive) return null;
  if (code === 'Escape') return held ? null : 'hold';
  if (code === 'Space') return held ? null : 'next';
  return null;
}
