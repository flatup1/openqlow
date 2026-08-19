# 引き継ぎ指示書 — FLAT UP WebOS ＋ WebOS→LINE引き継ぎ（2026-08-19）

> このファイルは**そのままAIに貼って使える**引き継ぎ文です。
> 受け取ったAIは「§0 → §1 → §3」の順に読み、**§3「いま止まっている場所」から着手**してください。
> 元セッション: https://claude.ai/code/session_01UDPpF9zqoWZ41d6hhMLizq

---

## §0 30秒サマリー（結論ファースト）

- **コードは全部書き終わっている。テストもCI（7ジョブ）も全部グリーン。**
- 止まっているのは **人間（JIN）の承認と、公開作業（XServer / VPS）だけ**。
- 次の一手は3つ。**① PR #101 をレビュー→マージ ② XServerへ `app/` を上げる ③ VPSへ `git pull` して再起動**。
- AIが勝手にやってはいけないこと：マージ、公開、本番反映、顧客への送信。**全部JINの承認後**。

---

## §1 いまの状態（1枚図）

```text
                 ┌──────────────────────────────┐
  スマホの人 ───▶│  FLAT UP WebOS（XServer）      │  ← 静的サイト。ビルド不要
                 │  質問に答える → 結果 → CTA    │
                 └───────────────┬──────────────┘
                                 │ POST /journey（回答カテゴリのみ・PIIなし）
                                 ▼
                 ┌──────────────────────────────┐
                 │  VPS: openqlow webhook        │  ← J-コード発行・LINEと紐づけ
                 │  src/line_bot/journey_intake  │
                 └───────────────┬──────────────┘
                    ┌────────────┴────────────┐
                    ▼                         ▼
          ユーザーへ固定文面（reply）     JINへ日本語要約（push）
          「Webの内容は引き継いでいます」  「対象/性別/経験/目的/希望時間」
```

| 場所 | 状態 |
|---|---|
| `flatup-webos/`（Phase 0思想＋Phase 1 MVP） | ✅ main にマージ済み（PR #100） |
| ようこそ画面の文言・写真枠・UIの「心」・キャッシュ対策 | 🟡 PR #101（**draft・未マージ**） |
| WebOS→LINE 引き継ぎ（journey_id）v1 | 🟡 PR #101 に同梱（**未マージ・未反映**） |
| XServer への公開 | ⛔ 未実施（JINの作業） |
| VPS への反映 | ⛔ 未実施（JINのMacからのみ可能） |
| GA4 / GTM 接続 | ⛔ 未実施（IDはJIN管理・**リポジトリに入れない**） |

---

## §2 今回やったこと（PR #101 / 5コミット）

| # | コミット | 中身 |
|---|---|---|
| 1 | `37e592a` | ようこそ画面の文言を優しく変更（「冒険を始める」→「自分に合う始め方を見つける」）＋写真枠 `hero.jpg` 追加。**写真が無くてもレイアウトは壊れない**（onerrorで自動非表示） |
| 2 | `cb11d9f` | UIに「心」を入れる。温かいアイボリー配色、hero主役化、180msのマイクロアニメ（`prefers-reduced-motion` 対応）、結果画面に「大丈夫。最初はみんな初心者です。」 |
| 3 | `b5a8c24` | キャッシュ対策。JS/CSSのURLに `?v=` を付与。**今後の更新は `index.html` の数字を上げるだけ**で全端末に反映される |
| 4 | `9fe9bc1` | hero写真に焼き込まれた文言との二重表示を解消（`?v=4`） |
| 5 | `9ec3286` | **WebOS→LINE 引き継ぎ v1**。`src/line_bot/journey_intake.ts` 新設、`POST /journey` 受け口、テスト8本追加、WebOS側は結果CTAを引き継ぎリンクへ差し替え（`?v=5`） |

**機能ロジック（質問・分岐・State・料金/時間の正本参照）は変えていません。**

### 引き継ぎ v1 の安全設計（要点）

- 保存するのは**選択カテゴリだけ**。氏名・連絡先は最初から入らない。未知のキー・値は黙って捨てる。
- 受け口はCORS許可オリジン限定・4KB制限・IP毎30回/分。
- J-コードは**使い捨て・推測不能**。別ユーザーが同じコードを送っても紐づけ直さない（混線防止）。
- 未連携のjourneyは**7日で自動削除**。連携済みはLeadとして保持。
- 通知が失敗してもLeadは消えない（`notify_status: "failed"` を記録して再送判断できる）。
- ユーザーへは**固定文面のreplyのみ**。顧客への能動pushはしない（openQLOWの原則どおり）。
- 回答値（female / diet 等）は**URLにもanalyticsにも出さない**。

---

## §3 いま止まっている場所（次のAIはここから）

**リポジトリ側の作業は完了。人間の承認と公開の手前で止まっている。**

| 順 | やること | 誰が | 目安 |
|---|---|---|---|
| 1 | PR #101 を読んで問題なければ **Ready for review → マージ** | JIN | 5分 |
| 2 | `flatup-webos/app/` の中身をXServerへアップロード（§4-A） | JIN | 10分 |
| 3 | VPSへ反映して `/journey` を疎通確認（§4-B） | JIN | 10分 |
| 4 | iPhone実機で1周チェック（§4-C） | JIN | 5分 |
| 5 | 本物のジム写真を `hero.jpg` として差し替え | JIN | 5分 |
| 6 | GTMスニペットを `index.html` の `<head>` に貼ってGA4接続 | JIN | 10分 |
| 7 | 実データを見て Phase 2（質問の要否・パーソナライズ強化）を判断 | AI＋JIN | 後日 |

> ⚠️ VPS反映は**JINのMacからしかできない**。SSH鍵 `/Users/jin/.ssh/flatup_vps` はMacの中にあり、
> クラウドのAI実行環境は外部SSHが遮断されている。**これは安全のための設計。回避しない。**

---

## §4 JINが打つコマンド（1つずつ、出力を見ながら）

### §4-A XServer（WebOSの公開）

1. PR #101 をマージして、mainの `flatup-webos/app/` を手元に用意する。
2. XServerのファイルマネージャーで**新しいサブディレクトリ**を作る（例 `public_html/webos/`）。
   **既存サイトのファイルは触らない・上書きしない・消さない。**
3. `app/` の中身（`index.html` / `styles.css` / `js/` / `hero.jpg`）をアップロード。
4. `https://<ドメイン>/webos/` をiPhone実機Safariで開く。
5. 問題があれば**そのディレクトリを消すだけで元どおり**（既存サイトは無傷）。

### §4-B VPS（引き継ぎ受け口の反映）

```
cd /opt/openqlow
```
```
git pull
```
```
npm run build
```
```
sudo systemctl restart openqlow-webhook
```
```
curl -s https://aika.flatupnarita.jp/openqlow/health
```

nginxに `/journey` の中継が無ければ1ブロック追加：

```nginx
location = /journey {
    proxy_pass http://127.0.0.1:8787/journey;
    proxy_set_header X-Forwarded-For $remote_addr;
}
```

疎通確認：

```
curl -s -X POST https://aika.flatupnarita.jp/journey -H 'content-type: application/json' -H 'origin: https://flatupnarita.jp' -d '{"answers":{"audience":"self","goal":["diet"],"experience":"first"}}'
```

`{"ok":true,"journey_id":"J-..."}` が返ればOK。

### §4-C 公開後チェック（合格ライン）

| 見るところ | 合格 |
|---|---|
| ようこそ画面 | iPhone 390×844 で1画面に収まる／写真が出る（無くても崩れない） |
| 成人ルート | Q1→最後→結果→CTAでLINEが開く |
| キッズ／相談ルート | 同じく最後まで進める |
| 戻る・答えずに進む・やり直す | 全部動く |
| ダークモード | 文字が読める |
| LINEボタン | 引き継ぎリンクになっている（**URLに回答値が出ていないこと**） |
| LINE送信後 | ユーザーに固定文面が返り、JINに日本語要約が届く |

---

## §5 触ってはいけない・守ること

- `src/shared/canon.ts` が料金・時間・クラスの**唯一の正本**。他は全部コピー。**2か所に書かない。**
- 送信・予約確定・料金判断・返金・退会・休会・公開・課金・本番反映・commit・push・PRは**人間承認後**。
- secrets（LINEトークン・GA4/GTM ID・SSH鍵）は**絶対にコミットしない**。
- 既存実装・未コミット差分・原本を**削除しない・全面上書きしない**。
- 推測で「これは入っている／入っていない」と言わない。**必ず現物を grep して確かめる。**
- 一度に全部作らない。**設計 → 最小実装 → テスト → 採点 → 改善 → 次のPhase**。

---

## §6 JIN確認待ち事項

| # | 内容 |
|---|---|
| 1 | PR #101 をマージしてよいか（ようこそ画面の文言・配色・引き継ぎ機能） |
| 2 | WebOSを置く公開URL（`/webos/` でよいか、独立ドメインにするか） |
| 3 | `hero.jpg` に使う本物の写真（文言を焼き込むか、Web側で重ねるか） |
| 4 | GTM/GA4 を接続するか（接続しない間、計測はブラウザ内に貯まるだけでサーバー送信ゼロ） |
| 5 | `WEBOS_ALLOWED_ORIGINS` の値（既定 `https://flatupnarita.jp,https://www.flatupnarita.jp`） |

---

## §7 検証状況（事実）

| 項目 | 結果 |
|---|---|
| PR #101 のCI（`typecheck and validate` ＋ `test` 6ジョブ） | ✅ 全部 success（2026-08-19 10:16 UTC） |
| `mergeable_state` | `clean`（コンフリクトなし）／ただし **draft** |
| `./scripts/validate-ai-os.sh` | ✅ `AI OS validation passed` |
| `node flatup-webos/test/smoke.cjs` | ⚠️ ローカルでは `playwright` 未インストールだと動かない。先に `npm install` が必要（CIでは実行済み・合格） |

---

## §8 他に開いているPR（今回の作業とは別）

| PR | 内容 | 状態 |
|---|---|---|
| #101 | flatup-webos ようこそ画面＋LINE引き継ぎ | draft・CI緑・**マージ待ち（今回の本命）** |
| #99 | FLAT UP GYM モバイルHPの方向性4案（design） | draft・JINの方向性選択待ち |
| #85 | Phase 4 — Quality Guardian and Growth Metadata | draft・長期停滞 |
| #94 | `@types/node` 22.19.19 → 26.2.0（dependabot） | メジャー更新。要確認 |
| #92 | `typescript` 5.9.3 → 7.0.2（dependabot） | メジャー更新。要確認 |

---

## §9 関連ドキュメント

| ファイル | 内容 |
|---|---|
| `AGENTS.md` / `COORDINATION.md` | 担当領域と承認境界（**最初に読む**） |
| `src/shared/canon.ts` | 料金・時間・クラスの正本 |
| `flatup-webos/README.md` | WebOS全体像とPhase構成 |
| `flatup-webos/docs/ROADMAP.md` | Phase 0〜4の詳細と各Phase終了時の義務 |
| `flatup-webos/docs/DEPLOY.md` | XServer公開手順と公開後チェックリスト |
| `docs/webos_line_journey.md` | 引き継ぎ機能の運用ガイド（**PR #101 に含まれる**） |
| `docs/HANDOFF_20260817_JIN→AI_aika-bot-canon-sync.md` | 前回の引き継ぎ（AIKA正本同期・VPS反映） |
| `OPENQLOW_HANDOFF.md` | JINの発言の完全記録（思想の正本） |
