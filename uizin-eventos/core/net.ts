/**
 * 「必ず時間で諦める通信」を1か所にまとめたもの。
 *
 * なぜ必要か。
 *   `AbortSignal.timeout()` は Safari 16（2022年秋）以降にしか無い。
 *   会場の Mac や iPad がそれより古いと、この1行だけで TypeError になり、
 *   /api/state も /api/command も全部失敗する。つまり進行画面が一度も動かない。
 *   当日の端末が何かは前日まで分からないので、「あれば使う・無ければ自前で止める」。
 *
 * もう1つの事故も同時に塞ぐ。
 *   AbortController ごと無い環境では、通信が固まったまま返ってこないことがある。
 *   呼び出し側（ポーリングの輪）は1回の待ちが返らないと次を予約しないので、
 *   画面がそこで永久に止まる。止まった画面は担当者には直せない。
 *   だから「約束そのもの」にも時間切れを付け、必ず一定時間で失敗にする。
 *
 * ここはネットワークを知らない純粋な関数だけにしてある（テストできるように）。
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * この端末が持っている中断の仕組み。
 * テストから「古い Safari のつもり」で渡せるように、引数1つにまとめてある。
 * 省略時だけ本物のブラウザ／Node を見に行く（undefined を渡すと「無い」扱いになる）。
 */
export type AbortEnv = {
  AbortSignal?: typeof AbortSignal;
  AbortController?: typeof AbortController;
};

/** 時間切れで通信を打ち切るための signal。作れない古い環境では undefined を返す。 */
export function timeoutSignal(ms: number, env?: AbortEnv): AbortSignal | undefined {
  const source: AbortEnv = env ?? { AbortSignal: globalThis.AbortSignal, AbortController: globalThis.AbortController };
  const signalCtor = source.AbortSignal;
  if (signalCtor && typeof signalCtor.timeout === 'function') {
    try {
      return signalCtor.timeout(ms);
    } catch {
      // 実装があっても投げる環境が実在する。黙って次の手に進む。
    }
  }
  const controllerCtor = source.AbortController;
  if (!controllerCtor) return undefined;
  try {
    const controller = new controllerCtor();
    // タイマーは1本だけ。通信が先に終わっても、余分な abort は無害。
    setTimeout(() => {
      try {
        controller.abort();
      } catch {
        // 中断できない環境では、下の deadline 側が責任を持つ。
      }
    }, ms);
    return controller.signal;
  } catch {
    return undefined;
  }
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super('通信が ' + ms + 'ms で終わりませんでした。');
    this.name = 'TimeoutError';
  }
}

/**
 * どんな環境でも ms 以内に必ず決着する fetch。
 *
 * signal で止められる環境ではそれで止め、止められない環境でも
 * 呼び出し側には TimeoutError を返して、輪が回り続けるようにする。
 */
export function fetchWithDeadline(
  fetchImpl: FetchLike,
  url: string,
  ms: number,
  init: RequestInit = {},
): Promise<Response> {
  const signal = init.signal ?? timeoutSignal(ms);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  const request = (async () => {
    try {
      return await fetchImpl(url, signal ? { ...init, signal } : init);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  })();
  return Promise.race([request, deadline]);
}
