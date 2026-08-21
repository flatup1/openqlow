# WebOS → LINE 引き継ぎ（journey）運用ガイド

目的: WebOSで答えた内容をLINEで二度聞かず、オーナーが前提条件を一目で把握できるようにする。

## 仕組み（1枚図）

```text
WebOS回答完了 ─ POST /journey ─▶ VPS: data/journeys.json に保存（カテゴリのみ・PIIなし）
      │                             journey_id（例 J-3f8a12bc9d01）を返す
      ▼
「LINEで相談」ボタン ─▶ line.me/R/oaMessage/@jfl00540/?J-…（コード入力済みでトークが開く）
      ▼
ユーザーが送信1タップ ─▶ webhook が userId + journey_id を受信して紐づけ
      ├─▶ ユーザーへ固定文面「Webで教えていただいた内容は引き継いでいます…」（replyのみ・pushしない）
      └─▶ Jin へ日本語要約 push ＋ Lead レコードに通知結果を記録
```

- journey_id は使い捨て・推測不能。**別ユーザーが同じコードを送っても紐づけ直さない**（混線防止）
- 未連携の journey は **7日で自動削除**。連携済みは Lead として保持
- 通知が失敗しても Lead は残る（`notify_status: "failed"` を記録 → 再送判断が可能）
- URL・analytics に回答値（female / diet 等）は一切出さない

## VPSへの反映手順（Jin）

**Macで1コマンド。** VPSに入って `git pull` してはいけない（VPSの `/opt/openqlow` は
rsyncで配られる場所で、`.git` は送っていない。VPS上の git は古いまま止まっている）。

```bash
cd ~/openqlow
git switch main && git pull --ff-only origin main
npm run deploy
```

`npm run deploy` が中で全部やる（GitHub取り込み → VPSへ同期 → `npm ci` → build →
webhook再起動 → 起動確認）。最後に出る「本番で動いているコード」が、送ったコミットと
同じであることを必ず確認する。

## 「本当にできてる？」を確かめる（Jin）

反映が終わったか不安なときは、**見るだけ・何も変えない**健康診断を1コマンドで回す。

```bash
npm run check
```

4つを順に見て、ダメなものだけ「次の一手」を出す。

| 見るもの | 合格 | 不合格のとき |
| --- | --- | --- |
| 本番のコード（`deployed-version.txt`） | GitHubのmainと同じSHA | `npm run deploy` |
| LINE自動応答（`openqlow-webhook`） | `active` | `journalctl` でログ確認 |
| 引き継ぎコードの受け口 `/journey` | **405**（POST専用の正しい反応） | 未反映 or nginx未設定 |
| WebOSページ `/webos/` | 200 かつ `?v=` が手元と同じ | XServerへ上げ直す |

鍵の無い端末で公開側だけ見たいときは `npm run check -- --public`。

確認（VPSの中から。公開URLはAIKAが応答するため404になる）:

```bash
ssh -i ~/.ssh/openqlow_vps root@162.43.41.182 'curl -s http://127.0.0.1:8787/openqlow/health'
```

nginx（またはトンネル）に `/journey` の中継が無い場合は1ブロック追加:

```nginx
location = /journey {
    proxy_pass http://127.0.0.1:8787/journey;
    proxy_set_header X-Forwarded-For $remote_addr;
}
```

反映確認（VPS上またはMacから）:

```bash
curl -s -X POST https://aika.flatupnarita.jp/journey \
  -H 'content-type: application/json' \
  -H 'origin: https://flatupnarita.jp' \
  -d '{"answers":{"audience":"self","goal":["diet"],"experience":"first"}}'
# → {"ok":true,"journey_id":"J-..."} が返ればOK
```

最後にWebOS側の最新 `app/` 一式（js含む）をXServerへ上書きすれば、結果画面のLINEボタンが自動で引き継ぎリンクになる。

## Jin に届く通知の例

```text
【WebOSから新規相談】

対象: 本人
性別: 女性
経験: 完全に初めて
目的: ダイエット
希望時間: 平日の夜
経路: FLAT UP WebOS
状態: LINE連携済み

この方はWebOSで上記を回答済みです。同じ内容の再質問は不要です。
```

## データの見方

- Lead 一覧: `data/journeys.json`（`linked: true` が連携済み見込み客）
- 通知失敗の確認: `notify_status` が `"failed"` の行（`notify_error` に理由）
- 環境変数: `WEBOS_ALLOWED_ORIGINS`（既定 `https://flatupnarita.jp,https://www.flatupnarita.jp`）

## 安全設計（要点）

- 受け口はLINE署名の外側だが、CORS許可オリジン限定・4KB制限・IP毎30回/分の制限つき
- 保存は選択カテゴリのみ。未知のキー・未知の値は黙って捨てる（氏名等は最初から入らない）
- ユーザーへの文面は固定テンプレートのみ。顧客への能動pushはしない（openQLOWの原則どおり）
- J-コードは承認・CRM・退会の各経路に到達する前に処理され、コマンドとして解釈されない
