# G8 手順書: branded固定HTTPS URLをopenQLOWへ接続

> 対象: インフラ（Cloudflare / DNS / reverse-proxy）
> 担当: 人間（Cloudflare操作）
> 重要: トークン・アカウント秘密値をIssueやチャット・コミットへ書かないこと。

中学生にもわかるように一言で言うと:
**「今は毎回変わる仮の住所で家（openQLOW）が建っている。LINEに登録する住所は変わらない“表札付きの固定住所”にしたい。だから固定の住所（line.flatupnarita.jp/openqlow/health）を正しい家に向ける」** という作業です。

## なぜ必要か（採点 -2点の理由）
- 期待する固定URL `https://line.flatupnarita.jp/openqlow/health` が現在 **404**。
- 今は「アカウントレスのquick tunnel」で毎回URLが変わるため、LINEのwebhook先として不安定。
- DNSの向き先（`162.43.90.71`）とopenQLOW VPS（`162.43.41.182`）が食い違っている。
- フォールバックのHTTPは200（＝アプリ自体は動作している）。問題は**経路と固定URL**だけ。

## 現状（機械可読・値は公開情報のみ）
```yaml
expected_host: line.flatupnarita.jp
expected_path: /openqlow/health
current_http_status: 404
current_dns_target: 162.43.90.71
openqlow_vps: 162.43.41.182
fallback_http_status: 200
tunnel_type: accountless_quick_tunnel
```

---

## 選択肢（どちらか一方）

### 案A（推奨）: Cloudflare named tunnel
毎回変わらない固定URLを作れる。openQLOW側の設定と最も相性が良い。
1. Cloudflareアカウントにログインし、`cloudflared` を **named tunnel** として作成。
   - `cloudflared tunnel login`（ブラウザ認証）
   - `cloudflared tunnel create openqlow`
2. トンネルの認証情報ファイル（JSON）はVPSローカルにのみ保存。**リポジトリにコミットしない**。
3. DNSルートを作成: `cloudflared tunnel route dns openqlow line.flatupnarita.jp`
4. `config.yml` でingressを設定（openQLOWのhealthポートへ向ける）。
   - `hostname: line.flatupnarita.jp` → `service: http://localhost:<healthポート>`
5. `cloudflared` をsystemdサービスとして常駐化（既存のcloudflared運用に合わせる）。

### 案B: DNS + reverse-proxy 直結
1. DNSのAレコード `line.flatupnarita.jp` を **openQLOW VPS（162.43.41.182）** に向ける。
   - 現在の `162.43.90.71` から変更。
2. VPS上のreverse-proxy（nginx/caddy）で `/openqlow/health` をopenQLOWのhealthポートへ転送。
3. TLS証明書を取得（Let's Encrypt等）。HTTPSで応答するようにする。

---

## ステップ共通: 検証
1. `curl -i https://line.flatupnarita.jp/openqlow/health` が **200** を返すことを確認。
2. HTTPSの証明書が有効（自己署名でない）ことを確認。
3. 数時間おいて再度確認し、URLが変わらない（固定である）ことを確認。

## ステップ最後（人間確認必須）: LINE側のwebhook更新
1. LINE Developers Console → 該当チャネル → Messaging API設定。
2. Webhook URLを新しい固定HTTPS URLへ **人間が手動で** 変更。
3. 「検証」ボタンで疎通を確認。
4. 実際のLINE受信 → AIKA応答が正常に動くことを1件テスト（本番顧客ではなく自分のアカウントで）。

> **自動でwebhook URLを書き換えない。** 誤設定は全顧客の受付停止に直結するため必ず人間が確認。

---

## 完了の定義（Doneチェックリスト）
- [ ] `https://line.flatupnarita.jp/openqlow/health` が固定URLで200
- [ ] TLS証明書が有効
- [ ] DNS向き先がopenQLOW VPSと整合（または named tunnel経由で到達）
- [ ] LINE Webhook URLを人間が更新し、疎通「検証」成功
- [ ] `STATUS_AND_GAPS.md` のG8を `done` に更新（採点 +2 → 網羅10/10）

## やってはいけないこと
- Cloudflare/LINEのトークンをIssue/PR/チャット/コミットへ貼る。
- webhook URLの自動書き換え（人間確認をスキップ）。
- openQLOWをPython/Flask化する（依存ゼロTSの原則を維持）。
