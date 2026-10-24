'use client';

import { isLocalTournament, type LocalTournament } from '../../core/privateTournament.ts';

const DB = 'tournament-os-private-v1';
const STORE = 'events';
const channelName = (id: string) => 'tournament-os-private:' + id;

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    const timer = window.setTimeout(() => reject(new Error('ブラウザ内の保存場所を開けませんでした。')), 3_000);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => { window.clearTimeout(timer); resolve(request.result); };
    request.onerror = () => { window.clearTimeout(timer); reject(request.error); };
    request.onblocked = () => { window.clearTimeout(timer); reject(new Error('別の画面が保存場所の更新を止めています。')); };
  });
}

export async function readPrivateEvent(eventId: string): Promise<LocalTournament | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(eventId);
    request.onsuccess = () => {
      if (request.result && !isLocalTournament(request.result)) reject(new Error('保存データを読めません。データは消さず、「コピーのファイル」を確認してください。'));
      else resolve((request.result as LocalTournament | undefined) ?? null);
    };
    request.onerror = () => reject(request.error);
    request.transaction!.oncomplete = () => db.close();
  });
}

export class PrivateSaveConflict extends Error {
  constructor() {
    super('別の画面で大会が変更されました。古い内容では上書きしていません。');
    this.name = 'PrivateSaveConflict';
  }
}

export function preparePrivateEventSave(value: LocalTournament, saved: unknown, now = Date.now()): LocalTournament {
  if (!isLocalTournament(value)) throw new Error('保存するデータを確認してください。今あるデータは変えていません。');
  if (saved !== undefined && saved !== null) {
    if (!isLocalTournament(saved)) throw new Error('保存データを読めません。元のデータは変えていません。');
    if (saved.eventId !== value.eventId || saved.updatedAt !== value.updatedAt) throw new PrivateSaveConflict();
  }
  return { ...value, updatedAt: Math.max(now, value.updatedAt + 1) };
}

export async function writePrivateEvent(value: LocalTournament): Promise<LocalTournament> {
  if (!isLocalTournament(value)) throw new Error('保存するデータを確認してください。今あるデータは変えていません。');
  const db = await database();
  const next = await new Promise<LocalTournament>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    let persisted: LocalTournament;
    let failure: unknown;
    // Check and write in one transaction, so another tab cannot save between them.
    const current = store.get(value.eventId);
    current.onsuccess = () => {
      try {
        persisted = preparePrivateEventSave(value, current.result);
        store.put(persisted, value.eventId);
      } catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => { db.close(); resolve(persisted); };
    transaction.onabort = () => { db.close(); reject(failure || transaction.error || new Error('保存できませんでした。ブラウザの空き容量を確認してください。')); };
  });
  announceChange(value.eventId, next.updatedAt);
  return next;
}

/**
 * 同じ大会を開いているほかの画面に「変わりました」と知らせる。保存したときは、その保存番号（updatedAt）も入れる
 * （受け取った画面は、自分がもう持っている番号なら、読み直さなくてよい）。消したときは、番号なし（前と同じ知らせ）。
 */
function announceChange(eventId: string, updatedAt?: number): void {
  if (!('BroadcastChannel' in window)) return;
  const channel = new BroadcastChannel(channelName(eventId));
  channel.postMessage(updatedAt === undefined ? { type: 'changed' } : { type: 'changed', updatedAt });
  channel.close();
}

/** 知らせの中の保存番号。数でないとき・無いとき（消したとき・前の版の画面からの知らせ）は undefined */
export function changedAtOf(message: unknown): number | undefined {
  const at = message && typeof message === 'object' ? (message as { updatedAt?: unknown }).updatedAt : undefined;
  return typeof at === 'number' && Number.isFinite(at) ? at : undefined;
}

/**
 * ほかの画面が、この大会を保存した・消したときに、callback を呼ぶ。保存の知らせなら、その保存番号（updatedAt）を渡す。
 * 番号の無い知らせ（消したとき・前の版の画面から）でも、今までどおり呼ぶ（番号は undefined。読み直す）。
 */
export function watchPrivateEvent(eventId: string, callback: (updatedAt?: number) => void): () => void {
  if (!('BroadcastChannel' in window)) return () => undefined;
  const channel = new BroadcastChannel(channelName(eventId));
  channel.onmessage = (event: MessageEvent) => callback(changedAtOf(event.data));
  return () => channel.close();
}

/** 一度に文字にするバイトの数（String.fromCharCode に一度に渡せる数より、じゅうぶん小さい） */
const BASE64_CHUNK = 0x8000;

/**
 * バイトを base64 の文字にする。0x8000 バイトずつ、まとめて文字にする（1バイトずつつなぐと、写真の多い大会のコピーのファイルで十数秒止まる）。
 * 出てくる文字は、前の作り方と1字も変わらない（前に作ったコピーのファイルも、そのまま戻せる）。
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  // apply は、Uint8Array をそのまま数の並びとして受け取る（型の上だけ、数の配列として渡す）
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_CHUNK) as unknown as number[]));
  return btoa(parts.join(''));
}

/** base64 の文字を、バイトに戻す（1字ずつ関数を呼ばない、ふつうのくり返し）。答えは、前の作り方と同じ */
export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** 新しく作るコピーのファイルの、パスワードから鍵を作るくり返しの回数（PBKDF2・SHA-256。今のすすめの数）。回数はファイルに書いておく */
export const BACKUP_ITERATIONS = 600_000;
/** 回数が書いていない、前の版のファイルの回数。前の版のファイルも、この回数で、そのまま戻せる */
export const OLD_BACKUP_ITERATIONS = 250_000;
/** ファイルに書いてある回数として受け取る、いちばん大きい数（こわれた・書きかえられた数で、画面が長く止まらないように） */
const MAX_BACKUP_ITERATIONS = 10_000_000;

async function keyFromPassword(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytesToArrayBuffer(salt), iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptBackup(value: LocalTournament, password: string): Promise<string> {
  if (password.length < 10) throw new Error('パスワードは10文字以上にしてください。');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromPassword(password, salt, BACKUP_ITERATIONS);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return JSON.stringify({ format: 'tournament-os-private-1', iterations: BACKUP_ITERATIONS, salt: bytesToBase64(salt), iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) });
}

export async function decryptBackup(text: string, password: string): Promise<LocalTournament> {
  const payload = JSON.parse(text) as { format: string; iterations?: unknown; salt: string; iv: string; data: string };
  if (payload.format !== 'tournament-os-private-1') throw new Error('Tournament OSのバックアップではありません。');
  // 回数が書いていないのは、前の版のファイル（250,000回）。書いてあるときは、その回数（おかしな数のファイルは、こわれたファイルとして読まない）
  const iterations = payload.iterations === undefined ? OLD_BACKUP_ITERATIONS : payload.iterations;
  if (typeof iterations !== 'number' || !Number.isInteger(iterations) || iterations < OLD_BACKUP_ITERATIONS || iterations > MAX_BACKUP_ITERATIONS) throw new Error('バックアップの中身を読み取れません。元のデータは残しています。');
  const key = await keyFromPassword(password, base64ToBytes(payload.salt), iterations);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytesToArrayBuffer(base64ToBytes(payload.iv)) }, key, bytesToArrayBuffer(base64ToBytes(payload.data)));
  const value: unknown = JSON.parse(new TextDecoder().decode(plain));
  if (!isLocalTournament(value)) throw new Error('バックアップの中身を読み取れません。元のデータは残しています。');
  return value;
}

export async function photoToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選んでください。');
  if (file.size > 20 * 1024 * 1024) throw new Error('写真が大きすぎます。20MB以下の写真を選んでください。');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  // 使い終わったら、描く場所の大きさを0にもどす（名簿ZIPで何百枚も続けて作るとき、メモリが積み上がらないように。失敗したときも）
  try {
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('写真を加工できませんでした。別のブラウザで試してください。');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    if (!dataUrl.startsWith('data:image/jpeg;base64,') || dataUrl.length > 1_800_100) throw new Error('写真を小さくできませんでした。別の写真を選んでください。');
    return dataUrl;
  } finally {
    bitmap.close();
    canvas.width = 0; canvas.height = 0;
  }
}

export type PrivateEventSummary = { eventId: string; title: string; date: string; updatedAt: number; fighters: number; bouts: number };

/**
 * このパソコンに保存してある大会の一覧（新しい順、10件まで）。読むだけで、何も書かない。
 * 写真は持たず、人数と試合数だけに潰す。
 */
export async function listPrivateEvents(): Promise<PrivateEventSummary[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const found: PrivateEventSummary[] = [];
    const transaction = db.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const value: unknown = cursor.value;
      if (isLocalTournament(value)) found.push({ eventId: value.eventId, title: value.title, date: value.date, updatedAt: value.updatedAt, fighters: value.fighters.length, bouts: value.bouts.length });
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => { db.close(); resolve(found.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10)); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('保存してある大会を読めませんでした。')); };
  });
}

/**
 * この大会を、このパソコンの保存場所から消す（ほかの大会は消さない）。取り消せない。
 * 画面は、消す前に「コピーのファイル」があるか確かめてから、これを呼ぶ。
 */
export async function deletePrivateEvent(eventId: string): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete(eventId);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('消せませんでした。')); };
  });
  announceChange(eventId);
}
