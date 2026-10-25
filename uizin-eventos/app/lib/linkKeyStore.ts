/**
 * 申し込みのリンクに署名する鍵を、このパソコンのブラウザの中（IndexedDB）にしまう。
 * 秘密の鍵は取り出せない形（CryptoKey）のまま しまうので、ファイルにも、ほかのパソコンにも出せない。
 * ブラウザの「閲覧データを消す」で消えたときは、鍵を作り直して、公開用の文字を登録しなおす。
 */
import { createLinkKey } from '../../core/linkSign.ts';

const DB = 'tournament-os-link-key';
const STORE = 'keys';
const ID = 'sign';

export type StoredLinkKey = { privateKey: CryptoKey; publicText: string; createdAt: number };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('blocked'));
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(request.result as T); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  }));
}

/** しまってある鍵。無い・読めないときは null */
export async function loadLinkKey(): Promise<StoredLinkKey | null> {
  try {
    const value = await run<StoredLinkKey | undefined>('readonly', (store) => store.get(ID));
    return value && value.privateKey && typeof value.publicText === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** 新しい鍵を作って しまう（前の鍵は、上書きされる）。しまえなかったときは投げる */
export async function makeLinkKey(): Promise<StoredLinkKey> {
  const made = await createLinkKey();
  const value: StoredLinkKey = { ...made, createdAt: Date.now() };
  await run('readwrite', (store) => store.put(value, ID));
  const back = await loadLinkKey();
  if (!back || back.publicText !== value.publicText) throw new Error('鍵をしまえませんでした。');
  return back;
}
