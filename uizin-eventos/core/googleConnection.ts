import { isAppsScriptUrl } from './publicEntry.ts';

export const GOOGLE_PROTOCOL = 2;
export const GOOGLE_RECEPTION_BUILD = '2.20261002.4';
const REQUEST_WINDOW_MS = 5 * 60_000;
const REPORT_WINDOW_MS = 15 * 60_000;
export type GoogleConnectionRequest = {
  payload: string; signature: string; endpoint: string; nonce: string; issuedAt: number;
};
export type GoogleConnection = {
  protocol: number; eventId: string; owner: string; endpoint: string;
  sheetPrivate: boolean; folderPrivate: boolean; testComplete: boolean; accepting: boolean;
  entryKey: string; testKey: string; issuedAt: number;
  policy: string;
  build?: string; challenge?: string; checkedVia?: string;
  deploymentVerified?: boolean;
};

class ConnectionVerificationError extends Error {}

export function deadlineIso(value: string): string {
  const match = value.trim().match(/^(\d{4})(?:年|-|\/)(\d{1,2})(?:月|-|\/)(\d{1,2})日?(?:[（(][^）)]*[）)])?$/);
  if (!match) return '';
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export async function createGoogleConnectionRequest(endpoint: string, setupKey: string, eventId: string): Promise<GoogleConnectionRequest> {
  endpoint = endpoint.trim();
  if (!isAppsScriptUrl(endpoint)) throw new Error('Googleの「ウェブアプリ URL」をコピーして貼ってください。最後が /exec のURLです。「デプロイID」や /dev のURLではありません。');
  if (!/^[\w-]{32,100}$/.test(setupKey) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(eventId)) throw new Error('この大会の最初の設定を確認してください。');
  const nonce = crypto.randomUUID(), issuedAt = Date.now();
  const payload = JSON.stringify({eventId, endpoint, nonce, issuedAt});
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(setupKey), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  return {payload, signature, endpoint, nonce, issuedAt};
}

export function googleConnectionFresh(connection: GoogleConnection | null, now = Date.now()): boolean {
  return Boolean(connection?.deploymentVerified && connection.build === GOOGLE_RECEPTION_BUILD && Number.isFinite(connection.issuedAt) && connection.issuedAt <= now + 30_000 && now - connection.issuedAt <= REPORT_WINDOW_MS);
}

export async function verifyGoogleConnection(code: string, setupKey: string, eventId: string, owner: string, policy: string, request?: GoogleConnectionRequest | null): Promise<GoogleConnection> {
  const encoded = code.trim().replace(/^接続確認コード[：:]\s*/, '');
  if (!encoded.startsWith('TOS2.')) throw new Error('「Googleの接続を確かめる」を押し、別の画面に出た白い欄の文字をすべてコピーして貼ってください。');
  try {
    const envelope = JSON.parse(encoded.slice(5)) as { payload: string; signature: string };
    if (typeof envelope.payload !== 'string' || envelope.payload.length > 10_000 || typeof envelope.signature !== 'string') throw new Error();
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(setupKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    if (!/^[a-f0-9]{64}$/.test(envelope.signature)) throw new Error();
    const signature = Uint8Array.from(envelope.signature.match(/../g)!, (pair) => parseInt(pair, 16));
    if (!await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(envelope.payload))) throw new ConnectionVerificationError('この設定画面とGoogleの確認用の設定が一致していません。古い設定画面や別のGoogleプログラムの可能性があります。データを消さず、AIに確認部分の照合を依頼してください。');
    const result = JSON.parse(envelope.payload) as GoogleConnection;
    if (result.eventId !== eventId) throw new ConnectionVerificationError('確認コードの大会が違います。この大会のGoogleプログラムで確認してください。');
    if (result.owner !== owner.trim().toLowerCase()) throw new ConnectionVerificationError('確認コードの主催者が違います。主催者本人のGoogleになっているか確認してください。');
    if (result.policy !== policy) throw new ConnectionVerificationError('大会名・申込締切・申込項目がGoogleの設定と一致していません。データを消さず、設定内容を確認してください。');
    if (result.protocol !== GOOGLE_PROTOCOL || !isAppsScriptUrl(result.endpoint) || !result.sheetPrivate || !result.folderPrivate || !/^[\w-]{32,100}$/.test(result.entryKey) || !/^[\w-]{32,100}$/.test(result.testKey) || typeof result.testComplete !== 'boolean' || typeof result.accepting !== 'boolean' || !Number.isFinite(result.issuedAt)) throw new Error();
    if (request) {
      if (result.endpoint !== request.endpoint || result.challenge !== request.nonce || result.checkedVia !== 'web-app') throw new ConnectionVerificationError('今開いたGoogle受付の確認コードではありません。「Googleの接続を確かめる」を押して、新しく出たコードを貼ってください。');
      if (result.build !== GOOGLE_RECEPTION_BUILD) throw new ConnectionVerificationError('Googleの公開プログラムが古い版です。保存だけでは更新されません。「デプロイを管理」で「新バージョン」に更新してから、もう一度確認してください。');
      const now=Date.now();
      if (result.issuedAt < request.issuedAt - 5_000 || result.issuedAt > now + 30_000 || now-result.issuedAt>REPORT_WINDOW_MS || result.issuedAt-request.issuedAt>REQUEST_WINDOW_MS) throw new ConnectionVerificationError('確認コードの時間が過ぎました。データは消さず、「Googleの接続を確かめる」を押して確認し直してください。');
    }
    // Google編集画面のコードだけでは、公開済みの受付が動く証拠にはしない。
    return {...result, deploymentVerified:Boolean(request)};
  } catch (error) {
    if (error instanceof ConnectionVerificationError) throw error;
    throw new Error('確認コードを正しく読み取れません。「Googleの接続を確かめる」で開いた画面の白い欄の文字を、すべてコピーし直してください。');
  }
}
