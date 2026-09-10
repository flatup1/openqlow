# WebOS → LINE 引き継ぎ（journey）運用ガイド

> **2026-08-21 現物確認済みの正本:** 本番受け口はAIKA VPS `162.43.90.71` の
> `https://aika.flatupnarita.jp/journey`。実装は `flatup1/flatup` のPython、
> 保存先はAIKA SQLiteです。openQLOW VPS `162.43.41.182` へjourneyを反映・公開しません。

目的: WebOSで答えた内容をLINEで二度聞かず、オーナーが前提条件を一目で把握できるようにする。

## 仕組み（1枚図）

```text
WebOS回答完了 ─ POST /journey ─▶ AIKA VPS: SQLite に保存（カテゴリのみ・PIIなし）
      │                             journey_id（例 J-3f8a12bc9d01）を返す
      ▼
「LINEで相談」ボタン ─▶ line.me/R/oaMessage/@jfl0054o/?J-…（コード入力済みでトークが開く。末尾は英字o）
      ▼
ユーザーが送信1タップ ─▶ webhook が userId + journey_id を受信して紐づけ
      ├─▶ ユーザーへ固定文面「Webで教えていただいた内容は引き継いでいます…」（replyのみ・pushしない）
      └─▶ Jin へ日本語要約 push ＋ Lead レコードに通知結果を記録
```

- journey_id は使い捨て・推測不能。**別ユーザーが同じコードを送っても紐づけ直さない**（混線防止）
- 未連携の journey は **7日で自動削除**。連携済みは Lead として保持
- 通知が失敗しても Lead は残る（`notify_status: "failed"` を記録 → 再送判断が可能）
- URL・analytics に回答値（female / diet 等）は一切出さない

## AIKA VPSへの反映手順（Jin）

AIKAリポジトリ `flatup1/flatup` の専用スクリプトだけを使う。
openQLOWの `npm run deploy` はjourney反映には使わない。

```bash
bash 6_システム/code/ops/deploy_aika_release.sh --dry-run
```

テストと反映内容を確認し、JINが本番反映を承認した後だけ実行する。

```bash
bash 6_システム/code/ops/deploy_aika_release.sh --apply
```

副作用のない疎通確認:

```bash
curl -i -X OPTIONS https://aika.flatupnarita.jp/journey \
  -H 'Origin: https://flatupnarita.jp' \
  -H 'Access-Control-Request-Method: POST'
```

HTTP 204と `Access-Control-Allow-Origin: https://flatupnarita.jp` が返れば受け口は稼働中。

## 「本当にできてる？」を確かめる（Jin）

反映が終わったか不安なときは、**見るだけ・何も変えない**健康診断を1コマンドで回す。

```bash
npm run check
```

4つを順に見て、ダメなものだけ「次の一手」を出す。全部通れば終了コード0。

| 見るもの | 合格 | 不合格のとき |
| --- | --- | --- |
| 本番のコード（`deployed-version.txt`） | GitHubのmainと同じSHA | 反映をやり直す |
| LINE自動応答（`openqlow-webhook`） | `active` | `journalctl` でログ確認 |
| 引き継ぎコードの受け口 `/journey` | **405**（POST専用の正しい反応） | 未反映 or nginx未設定 |
| WebOSページ `/webos/` | 200 かつ `?v=` が手元と同じ | XServerへ上げ直す |

つながらない時（`000`）は「本番が落ちた」ではなく「回線の問題」と表示する。
鍵の無い端末で公開側だけ見たいときは `npm run check -- --public`。

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

- Lead: AIKA SQLite `/var/lib/flatup-aika/state/aika_state.sqlite3` の `webos_journeys`
- LINE連携済み: `linked=1`、JIN通知成功: `notify_status='sent'`
- 環境変数: `WEBOS_ALLOWED_ORIGINS`（既定 `https://flatupnarita.jp,https://www.flatupnarita.jp`）

## 安全設計（要点）

- 受け口はLINE署名の外側だが、CORS許可オリジン限定・4KB制限・IP毎30回/分の制限つき
- 保存は選択カテゴリのみ。未知のキー・未知の値は黙って捨てる（氏名等は最初から入らない）
- ユーザーへの文面は固定テンプレートのみ。顧客への能動pushはしない
- J-コードは承認・CRM・退会の各経路に到達する前に処理され、コマンドとして解釈されない

## 2台を混ぜないための禁止事項

- `aika.flatupnarita.jp` をopenQLOW VPSへ向けない。
- openQLOW nginxへ `/journey` の中継を追加しない。
- `OPENQLOW_ENABLE_WEBOS_JOURNEY=true` を通常運用で設定しない。
- AIKAのファイルをopenQLOWのデプロイスクリプトで送らない。
