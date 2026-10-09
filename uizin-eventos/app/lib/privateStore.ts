'use client';

import { cloudRequest } from './cloudClient.ts';
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

export function cloudStorage(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('storage') === 'cloud';
}
export async function readPrivateEvent(eventId: string): Promise<LocalTournament | null> {
  if(cloudStorage())return cloudRequest(eventId);
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(eventId);
    request.onsuccess = () => {
      if (request.result && !isLocalTournament(request.result)) reject(new Error('保存データを読めません。データは消さず、暗号化バックアップを確認してください。'));
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
  if(cloudStorage()) {
    const saved=await cloudRequest(value.eventId,value);
    if(!saved)throw new Error('クラウドの保存結果を確認できません。');
    return saved;
  }
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
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(channelName(value.eventId));
    channel.postMessage({ type: 'changed' });
    channel.close();
  }
  return next;
}

export function watchPrivateEvent(eventId: string, callback: () => void): () => void {
  if(cloudStorage()) {
    const refresh=()=>{if(document.visibilityState==='visible')callback();};
    const timer=setInterval(refresh,5000);
    window.addEventListener('focus',refresh);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};
  }
  if (!('BroadcastChannel' in window)) return () => undefined;
  const channel = new BroadcastChannel(channelName(eventId));
  channel.onmessage = callback;
  return () => channel.close();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function keyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytesToArrayBuffer(salt), iterations: 250_000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptPayload(value: unknown, password: string): Promise<string> {
  if (password.length < 10) throw new Error('パスワードは10文字以上にしてください。');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromPassword(password, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return JSON.stringify({ format: 'tournament-os-private-1', salt: bytesToBase64(salt), iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) });
}

export async function decryptPayload(text: string, password: string): Promise<unknown> {
  const payload = JSON.parse(text) as { format: string; salt: string; iv: string; data: string };
  if (payload.format !== 'tournament-os-private-1') throw new Error('Tournament OSのバックアップではありません。');
  const key = await keyFromPassword(password, base64ToBytes(payload.salt));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytesToArrayBuffer(base64ToBytes(payload.iv)) }, key, bytesToArrayBuffer(base64ToBytes(payload.data)));
  const value: unknown = JSON.parse(new TextDecoder().decode(plain));
  return value;
}
export const encryptBackup = (value: LocalTournament, password: string) => encryptPayload(value,password);
export async function decryptBackup(text:string,password:string):Promise<LocalTournament> {
  const value=await decryptPayload(text,password);
  if(!isLocalTournament(value))throw new Error('バックアップの中身を読み取れません。元のデータは残しています。');
  return value;
}

export async function photoToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選んでください。');
  if (file.size > 20 * 1024 * 1024) throw new Error('写真が大きすぎます。20MB以下の写真を選んでください。');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); throw new Error('写真を加工できませんでした。別のブラウザで試してください。'); }
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
  if (!dataUrl.startsWith('data:image/jpeg;base64,') || dataUrl.length > 1_800_100) throw new Error('写真を小さくできませんでした。別の写真を選んでください。');
  return dataUrl;
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
