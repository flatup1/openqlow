#!/usr/bin/env node
// openQLOW LINEリッチメニュー登録スクリプト
// トーク画面下に常設ボタン（GitHubへ送る / 使い方 / 日報）を出す。
// 使い方（VPS上で、LINE_CHANNEL_ACCESS_TOKEN を読み込んでから）:
//   set -a; . /etc/openqlow/openqlow.env; set +a
//   node scripts/setup-rich-menu.mjs
// 同名の古いメニューは削除してから登録し直すので、何度実行してもよい。

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RICH_MENU_NAME = "openqlow-memo";
export const RICH_MENU_IMAGE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..", "deploy", "richmenu", "richmenu-memo-2500x843.png",
);

const API = "https://api.line.me/v2/bot";
const DATA_API = "https://api-data.line.me/v2/bot";

export function buildRichMenuPayload() {
  const height = 843;
  return {
    size: { width: 2500, height },
    selected: true,
    name: `${RICH_MENU_NAME}-v1`,
    chatBarText: "メニュー",
    areas: [
      {
        bounds: { x: 0, y: 0, width: 833, height },
        action: { type: "message", text: "push" },
      },
      {
        bounds: { x: 833, y: 0, width: 833, height },
        action: { type: "message", text: "ヘルプ" },
      },
      {
        bounds: { x: 1666, y: 0, width: 834, height },
        action: { type: "message", text: "日報" },
      },
    ],
  };
}

async function api(token, method, url, body, contentType = "application/json") {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": contentType } : {}),
    },
    body: body
      ? (contentType === "application/json" ? JSON.stringify(body) : body)
      : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${url} failed: ${res.status} ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export async function setupRichMenu(token) {
  // 1) 古い openqlow-memo メニューを削除（再実行しても増殖しない）
  const { richmenus = [] } = await api(token, "GET", `${API}/richmenu/list`);
  for (const menu of richmenus) {
    if (menu.name?.startsWith(RICH_MENU_NAME)) {
      await api(token, "DELETE", `${API}/richmenu/${menu.richMenuId}`);
      console.log(`deleted old rich menu: ${menu.richMenuId} (${menu.name})`);
    }
  }

  // 2) 作成
  const { richMenuId } = await api(token, "POST", `${API}/richmenu`, buildRichMenuPayload());
  console.log(`created rich menu: ${richMenuId}`);

  // 3) 画像アップロード
  const image = await readFile(RICH_MENU_IMAGE);
  await api(token, "POST", `${DATA_API}/richmenu/${richMenuId}/content`, image, "image/png");
  console.log(`uploaded image: ${RICH_MENU_IMAGE}`);

  // 4) 全ユーザーのデフォルトに設定
  await api(token, "POST", `${API}/user/all/richmenu/${richMenuId}`);
  console.log("set as default rich menu for all users");

  return richMenuId;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  if (!token) {
    console.error("LINE_CHANNEL_ACCESS_TOKEN が未設定です。VPSで次を実行してから再実行してください:");
    console.error("  set -a; . /etc/openqlow/openqlow.env; set +a");
    process.exit(1);
  }
  setupRichMenu(token)
    .then(id => console.log(`完了。LINEのトーク画面を開き直すとメニューが出ます (${id})`))
    .catch(err => {
      console.error(err.message ?? err);
      process.exit(1);
    });
}
