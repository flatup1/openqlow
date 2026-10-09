import { isLocalTournament, type LocalTournament } from './privateTournament.ts';

export const CLOUD_MAX_BYTES = 8 * 1024 * 1024;
const CHUNK_BYTES = 48 * 1024;
export class CloudConflict extends Error {}
export interface AtomicStore {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  transaction<T>(callback: (store: AtomicStore) => Promise<T>): Promise<T>;
}
type Manifest = { eventId: string; revision: number; chunks: number };
export function validCloudDocument(value: unknown, eventId: string): value is LocalTournament {
  if (!isLocalTournament(value) || value.eventId !== eventId || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0) return false;
  if (value.entryConfig && Object.keys(value.entryConfig).some(key=>!['music','grade','age','comment'].includes(key))) return false;
  if (value.schedule && value.schedule.some(row=>Object.keys(row).some(key=>!['no','rounds','roundSeconds','breakSeconds'].includes(key)))) return false;
  const keys = ['schema','eventId','title','venue','date','updatedAt','currentBout','fighters','bouts','entryConfig','schedule','recruitment','timer','audience'];
  if (Object.keys(value).some(key => !keys.includes(key))) return false;
  const fighterKeys = ['id','gym','name','grade','age','height','weight','record','comment','musicUrl','photoDataUrl'];
  return value.fighters.every(f => Object.keys(f).every(key => fighterKeys.includes(key))) && value.bouts.every(b => Object.keys(b).every(key => ['id','redId','blueId','className','rule'].includes(key)));
}
export async function readCloudTournament(store: AtomicStore, eventId: string): Promise<LocalTournament | null> {
  const manifest = await store.get<Manifest>('private:current');
  if (!manifest) return null;
  if (manifest.eventId !== eventId || !Number.isInteger(manifest.chunks) || manifest.chunks < 1 || manifest.chunks > 500 || !Number.isSafeInteger(manifest.revision)) throw new Error('クラウドの保存情報を確認してください。');
  const parts: Uint8Array[] = [];
  let totalBytes=0;
  for (let i=0;i<manifest.chunks;i++) {
    const part=await store.get<Uint8Array>(`private:${manifest.revision}:${i}`);
    if (!part || part.length > CHUNK_BYTES || totalBytes + part.length > CLOUD_MAX_BYTES) throw new Error('クラウドの保存データが不足しています。');
    parts.push(part);totalBytes+=part.length;
  }
  const bytes=new Uint8Array(totalBytes);let offset=0;
  for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!validCloudDocument(value,eventId) || value.updatedAt !== manifest.revision) throw new Error('クラウドの保存データを確認してください。');
  return value;
}
export async function saveCloudTournament(store: AtomicStore, eventId: string, input: unknown, now=Date.now()): Promise<LocalTournament> {
  if (!validCloudDocument(input,eventId)) throw new Error('保存する大会の内容を確認してください。');
  return store.transaction(async tx => {
    const old=await tx.get<Manifest>('private:current');
    if (old && (old.eventId !== eventId || old.revision !== input.updatedAt)) throw new CloudConflict('別の画面で大会が更新されました。入力を残して、最新状態を確認してください。');
    const value={...input,updatedAt:Math.max(now,input.updatedAt+1)};
    const bytes=new TextEncoder().encode(JSON.stringify(value));
    if (bytes.length>CLOUD_MAX_BYTES) throw new Error('写真を含む保存データが8MBを超えています。写真を小さくして保存してください。');
    const chunks=Math.ceil(bytes.length/CHUNK_BYTES);
    for(let i=0;i<chunks;i++) await tx.put(`private:${value.updatedAt}:${i}`,bytes.slice(i*CHUNK_BYTES,(i+1)*CHUNK_BYTES));
    await tx.put('private:current',{eventId,revision:value.updatedAt,chunks});
    return value;
  });
}
