// 画面の配信と、命令の受付（Node 標準の http だけ）。
//  - 同じ Mac のブラウザ（localhost）以外は、大会ごとの合言葉（トークン）が無いと何もできない。
//  - 運営/管理の操作は PIN が必要。PIN を何度も間違えると、しばらく受け付けない。
//  - 他のサイトから命令を送らせない（Origin の確認、JSON だけ受け付け）。
// 仕様: docs/uizin-event-os/ARCHITECTURE.md §10・§11

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";

const LOCAL = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
};
const MAX_BODY = 2 * 1024 * 1024;
const PIN_FAIL_LIMIT = 5;
const PIN_LOCK_MS = 5 * 60 * 1000;

function sameSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function securityHeaders(type) {
  return {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:",
  };
}

export function createHttpServer({ app, uiDir, token, pins, now = Date.now }) {
  const failures = new Map();
  const sseClients = new Set();

  const isLocal = req => LOCAL.has(req.socket.remoteAddress);
  const hasAccess = (req, url) => isLocal(req) || sameSecret(req.headers["x-eos-token"] ?? url.searchParams.get("t") ?? "", token);
  const device = req => String(req.headers["x-eos-device"] ?? "").replace(/[^\w-]/g, "").slice(0, 32) || "unknown";

  function json(res, status, body) {
    res.writeHead(status, securityHeaders("application/json; charset=utf-8"));
    res.end(JSON.stringify(body));
  }

  function locked(req) {
    const entry = failures.get(req.socket.remoteAddress);
    return entry && entry.count >= PIN_FAIL_LIMIT && now() - entry.at < PIN_LOCK_MS;
  }

  // PIN から役割を決める。PIN 無し＝かんたん。間違い＝null。
  function roleFor(req) {
    const pin = req.headers["x-eos-pin"];
    if (pin === undefined || pin === "") return "easy";
    if (locked(req)) return null;
    if (sameSecret(String(pin), pins.admin)) return "admin";
    if (sameSecret(String(pin), pins.operator)) return "operator";
    const key = req.socket.remoteAddress;
    const entry = failures.get(key);
    failures.set(key, { count: entry && now() - entry.at < PIN_LOCK_MS ? entry.count + 1 : 1, at: now() });
    return null;
  }

  function sameOrigin(req) {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}`) return false;
    const site = req.headers["sec-fetch-site"];
    if (site && site !== "same-origin" && site !== "none") return false;
    return true;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on("data", chunk => {
        size += chunk.length;
        if (size > MAX_BODY) {
          reject(new Error("too_large"));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  }

  app.on("change", () => {
    for (const res of sseClients) res.write(`event: change\ndata: ${JSON.stringify({ at: now() })}\n\n`);
  });
  const heartbeat = setInterval(() => {
    for (const res of sseClients) res.write(": ping\n\n");
  }, 15_000);

  const server = createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, "http://local");
    } catch {
      json(res, 400, { ok: false, message: "URLが読めません" });
      return;
    }

    if (req.method === "GET" && STATIC[url.pathname]) {
      const [file, type] = STATIC[url.pathname];
      try {
        res.writeHead(200, securityHeaders(type));
        res.end(readFileSync(join(uiDir, file)));
      } catch {
        json(res, 500, { ok: false, message: "画面のファイルがありません" });
      }
      return;
    }

    if (!url.pathname.startsWith("/api/")) {
      json(res, 404, { ok: false, message: "ありません" });
      return;
    }
    if (!hasAccess(req, url)) {
      json(res, 401, { ok: false, message: "この端末はまだ登録されていません。Macの画面に出ているURLで開いてください" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, { ...securityHeaders("text/event-stream; charset=utf-8"), Connection: "keep-alive" });
      res.write(`event: change\ndata: {}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/view") {
      const role = roleFor(req);
      if (!role) {
        json(res, 403, { ok: false, message: locked(req) ? "PINを何度も間違えたため、しばらく使えません" : "PINが違います" });
        return;
      }
      json(res, 200, { ok: true, view: app.view(role) });
      return;
    }

    if (req.method === "POST" && (url.pathname === "/api/command" || url.pathname === "/api/login")) {
      if (!sameOrigin(req)) {
        json(res, 403, { ok: false, message: "ほかのページからの操作は受け付けません" });
        return;
      }
      if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {
        json(res, 415, { ok: false, message: "JSONだけ受け付けます" });
        return;
      }
      const role = roleFor(req);
      if (!role) {
        json(res, 403, { ok: false, message: locked(req) ? "PINを何度も間違えたため、しばらく使えません" : "PINが違います" });
        return;
      }
      if (url.pathname === "/api/login") {
        json(res, 200, { ok: true, role });
        return;
      }
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch (error) {
        json(res, error.message === "too_large" ? 413 : 400, { ok: false, message: "送られた内容が読めません" });
        return;
      }
      try {
        const result = await app.handle(body, { role, device: device(req) });
        json(res, 200, result);
      } catch (error) {
        json(res, 500, { ok: false, message: `うまくいきませんでした：${error.message}` });
      }
      return;
    }

    json(res, 404, { ok: false, message: "ありません" });
  });

  server.on("close", () => clearInterval(heartbeat));
  return server;
}
