'use client';

import type { LocalTournament } from '../../core/privateTournament.ts';

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
    request.onsuccess = () => resolve((request.result as LocalTournament | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function writePrivateEvent(value: LocalTournament): Promise<void> {
  const next = { ...value, updatedAt: Date.now() };
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(next, value.eventId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(channelName(value.eventId));
    channel.postMessage({ type: 'changed' });
    channel.close();
  }
}

export function watchPrivateEvent(eventId: string, callback: () => void): () => void {
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

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function keyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: arrayBuffer(salt), iterations: 250_000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptBackup(value: LocalTournament, password: string): Promise<string> {
  if (password.length < 10) throw new Error('パスワードは10文字以上にしてください。');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromPassword(password, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return JSON.stringify({ format: 'tournament-os-private-1', salt: bytesToBase64(salt), iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) });
}

export async function decryptBackup(text: string, password: string): Promise<LocalTournament> {
  const payload = JSON.parse(text) as { format: string; salt: string; iv: string; data: string };
  if (payload.format !== 'tournament-os-private-1') throw new Error('Tournament OSのバックアップではありません。');
  const key = await keyFromPassword(password, base64ToBytes(payload.salt));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: arrayBuffer(base64ToBytes(payload.iv)) }, key, arrayBuffer(base64ToBytes(payload.data)));
  return JSON.parse(new TextDecoder().decode(plain)) as LocalTournament;
}

export async function photoToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選んでください。');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.78);
}
