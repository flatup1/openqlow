// obs-websocket v5 の小さなクライアント（Node 22 標準の WebSocket だけで動く。npm install 不要）。
// 既存の obs-websocket-js は「応答待ちに時間切れが無い」「切断時に待ちが終わらない」ため（REFERENCES.md）、
// 時間切れと切断時の後始末を必ず行うこの最小実装を使う。手順は公式 protocol.md のとおり。
// パスワードはログにも例外の文にも出さない。

import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

export const OP = { Hello: 0, Identify: 1, Identified: 2, Reidentify: 3, Event: 5, Request: 6, RequestResponse: 7 };
export const CLOSE = { AUTH_FAILED: 4009, SESSION_INVALIDATED: 4011 };
export const STATUS = { NOT_READY: 207, OUTPUT_NOT_RUNNING: 501, RESOURCE_NOT_FOUND: 600, PROCESSING_FAILED: 702 };

export const EVENT_SUB = {
  General: 1 << 0,
  Scenes: 1 << 2,
  Inputs: 1 << 3,
  Outputs: 1 << 6,
  SceneItems: 1 << 7,
  Ui: 1 << 10,
  InputVolumeMeters: 1 << 16,
};

export const BASE_SUBSCRIPTIONS =
  EVENT_SUB.General | EVENT_SUB.Scenes | EVENT_SUB.Inputs | EVENT_SUB.Outputs | EVENT_SUB.SceneItems | EVENT_SUB.Ui;

// secret = base64(SHA256(password + salt))、auth = base64(SHA256(secret + challenge))
export function authString(password, salt, challenge) {
  const secret = createHash("sha256").update(password + salt).digest("base64");
  return createHash("sha256").update(secret + challenge).digest("base64");
}

export class ObsRequestError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ObsRequestError";
    this.code = code;
  }
}

export class ObsClient extends EventEmitter {
  constructor({ WebSocketImpl = globalThis.WebSocket, allowed, timeoutMs = 3000, connectTimeoutMs = 5000 } = {}) {
    super();
    if (typeof WebSocketImpl !== "function") throw new Error("WebSocket が使えません（Node.js 22 以上が必要です）");
    this.WebSocketImpl = WebSocketImpl;
    this.allowed = allowed ?? new Set();
    this.timeoutMs = timeoutMs;
    this.connectTimeoutMs = connectTimeoutMs;
    this.ws = null;
    this.identified = false;
    this.pending = new Map();
  }

  connect(url, password, eventSubscriptions = BASE_SUBSCRIPTIONS) {
    this.close();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const ws = new this.WebSocketImpl(url, "obswebsocket.json");
      this.ws = ws;
      const timer = setTimeout(() => {
        finish(reject, Object.assign(new Error("OBSの応答がありません（接続の時間切れ）"), { code: "timeout" }));
        try { ws.close(); } catch { /* 閉じられなくても続ける */ }
      }, this.connectTimeoutMs);

      ws.addEventListener("message", message => {
        let packet;
        try {
          packet = JSON.parse(typeof message.data === "string" ? message.data : String(message.data));
        } catch {
          return;
        }
        const d = packet.d ?? {};
        if (packet.op === OP.Hello) {
          const identify = { rpcVersion: 1, eventSubscriptions };
          if (d.authentication) {
            if (typeof password !== "string" || password === "") {
              finish(reject, Object.assign(new Error("OBSはパスワードを求めていますが、設定されていません"), { code: CLOSE.AUTH_FAILED }));
              try { ws.close(); } catch { /* 無視 */ }
              return;
            }
            identify.authentication = authString(password, d.authentication.salt, d.authentication.challenge);
          }
          this.hello = { obsWebSocketVersion: d.obsWebSocketVersion, rpcVersion: d.rpcVersion };
          ws.send(JSON.stringify({ op: OP.Identify, d: identify }));
        } else if (packet.op === OP.Identified) {
          this.identified = true;
          finish(resolve, { hello: this.hello, negotiatedRpcVersion: d.negotiatedRpcVersion });
        } else if (packet.op === OP.Event) {
          this.emit("event", d.eventType, d.eventData ?? {});
        } else if (packet.op === OP.RequestResponse) {
          const entry = this.pending.get(d.requestId);
          if (!entry) return;
          this.pending.delete(d.requestId);
          clearTimeout(entry.timer);
          if (d.requestStatus?.result) entry.resolve(d.responseData ?? {});
          else entry.reject(new ObsRequestError(d.requestStatus?.comment || `${d.requestType} に失敗しました`, d.requestStatus?.code));
        }
      });

      ws.addEventListener("close", event => {
        const code = event?.code ?? 1006;
        const reason = event?.reason ?? "";
        finish(reject, Object.assign(new Error(code === CLOSE.AUTH_FAILED ? "OBSのパスワードが違います" : "OBSにつながりません"), { code }));
        // 古い接続の close が後から届いても、新しい接続の状態は変えない。
        if (this.ws !== ws) return;
        const wasIdentified = this.identified;
        this.ws = null;
        this.identified = false;
        this.rejectPending("OBSとの接続が切れました", "closed");
        this.emit("close", { code, reason, wasIdentified });
      });

      ws.addEventListener("error", () => {
        // close が続けて来るので、そちらで後始末する。
      });
    });
  }

  request(requestType, requestData) {
    if (!this.allowed.has(requestType)) {
      return Promise.reject(new ObsRequestError(`許可されていない命令です: ${requestType}`, "not_allowed"));
    }
    if (!this.ws || !this.identified) {
      return Promise.reject(new ObsRequestError("OBSにつながっていません", "not_connected"));
    }
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new ObsRequestError(`OBSの応答がありません（${requestType}）`, "timeout"));
      }, this.timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ op: OP.Request, d: { requestType, requestId, requestData } }));
      } catch {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new ObsRequestError("OBSへ送れませんでした", "send_failed"));
      }
    });
  }

  reidentify(eventSubscriptions) {
    if (!this.ws || !this.identified) return false;
    this.ws.send(JSON.stringify({ op: OP.Reidentify, d: { eventSubscriptions } }));
    return true;
  }

  rejectPending(message, code) {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new ObsRequestError(message, code));
      this.pending.delete(id);
    }
  }

  // 閉じた時点で、待っている命令はすべて失敗として終わらせる（待ちっぱなしにしない）。
  close() {
    const ws = this.ws;
    this.ws = null;
    this.identified = false;
    this.rejectPending("OBSとの接続を閉じました", "closed");
    if (ws) {
      try { ws.close(); } catch { /* 無視 */ }
    }
  }
}
