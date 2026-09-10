// 状態ファイルの読み書きを、1件ずつ順番に行わせる。
//
// なぜ必要か:
//   保留リストや処理済み台帳は「読む → 足す → 書く」で更新する。
//   問い合わせが同時に届くと、この3手順が互い違いに実行され、
//   後から書いた方が先の追加を消してしまう。
//
//   実際に5件同時で試すと、保留に積まれたのは2件だけだった。
//   下書きは保存されているのに、JINへの通知が3件消える。
//
// 直し方:
//   openQLOW は1つのプロセスで動くので、プロセス内で順番待ちさせれば足りる。
//   ファイルロックのような重い仕組みは要らない。
//
// 使い方:
//   await withStateLock("pending", async () => { ...読んで書く... });

/** 鍵ごとの「順番待ちの列」。前の処理が終わってから次が動く。 */
const chains = new Map<string, Promise<unknown>>();

/**
 * 同じ鍵の処理を、重ならないように順番に実行する。
 *
 * 前の処理が失敗しても列は止めない（1件の失敗で以降が全部詰まる方が危ない）。
 */
export function withStateLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  // 失敗を飲み込んだものを列に積む。そうしないと次の待ち手まで巻き添えで失敗する。
  chains.set(
    key,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}
