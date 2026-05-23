# OPENQLOW Same-VPS Deployment

既存のFLATUP LINE BotとOPENQLOWを、1つのVPS内で分離して同居させるための手順です。

## 方針

```text
1つのVPS
├─ 既存FLATUP LINE BOT
│  ├─ 既存ディレクトリ
│  ├─ 既存systemd
│  └─ /line/webhook
│
└─ OPENQLOW
   ├─ /opt/openqlow
   ├─ openqlow-webhook.service
   ├─ openqlow-daily.timer
   ├─ openqlow-monitor.timer
   └─ /openqlow/webhook
```

既存BOTのコード、`.env`、systemd、LINE公式アカウントには触りません。

## 分離ルール

| 項目 | 既存BOT | OPENQLOW |
|---|---|---|
| 役割 | 顧客対応・体験予約 | Jin承認・SNS下書き |
| LINE公式 | FLATUP公式LINE | OPENQLOW専用LINE |
| URL | `/line/webhook` | `/openqlow/webhook` |
| ポート例 | `8000` | `8787` |
| systemd | 既存名 | `openqlow-*` |
| env | 既存BOT用 | `/etc/openqlow/openqlow.env` |

OPENQLOW側のsystemd unitには、既存BOTを巻き込まないためのリソース制限を必ず入れます。

```ini
MemoryMax=512M
CPUQuota=50%
TasksMax=128
OOMPolicy=stop
```

これはプロセス分離だけでなく、メモリリークや暴走時にVPS全体を落とさないための最低ラインです。

## VPSへコピー

Mac側から:

```bash
rsync -av --exclude node_modules \
  --exclude state --exclude drafts --exclude logs \
  "/Users/jin/Desktop/OPENQLOW HelMES/openqlow/" \
  root@YOUR_VPS:/opt/openqlow/
```

`state/`、`drafts/`、`logs/` はVPS上の運用データなので、再デプロイ時にMac側で上書きしないでください。

VPS側:

```bash
cd /opt/openqlow
npm ci
npm run test
```

## 環境変数

```bash
sudo mkdir -p /etc/openqlow
sudo cp /opt/openqlow/deploy/openqlow.vps.env.example /etc/openqlow/openqlow.env
sudo chmod 640 /etc/openqlow/openqlow.env
sudo nano /etc/openqlow/openqlow.env
```

最低限設定するもの:

```dotenv
OPENQLOW_ROOT=/opt/openqlow
OPENQLOW_LINE_PORT=8787
OPENQLOW_DRY_RUN=true
LINE_CHANNEL_SECRET=OPENQLOW専用LINEの値
LINE_CHANNEL_ACCESS_TOKEN=OPENQLOW専用LINEの値
JIN_LINE_USER_ID=JinのLINE userId
BACKUP_APPROVER_LINE_USER_ID=副承認者のLINE userId（任意）
```

本番Pushするまでは `OPENQLOW_DRY_RUN=true` のままでよいです。
Phase 1ではSNS公開ランタイムそのものを使わないため、`OPENQLOW_ENABLE_PUBLIC_POSTING=true` は設定しません。

## systemd

```bash
sudo bash /opt/openqlow/deploy/scripts/install-openqlow-vps.sh
sudo systemctl start openqlow-webhook.service
sudo systemctl start openqlow-daily.timer
sudo systemctl start openqlow-monitor.timer
sudo systemctl status openqlow-webhook.service
sudo systemctl list-timers 'openqlow-*'
```

ログ確認:

```bash
journalctl -u openqlow-webhook.service -f
journalctl -u openqlow-daily.service -n 100
journalctl -u openqlow-monitor.service -n 100
```

## nginx

`deploy/nginx/openqlow-same-vps.conf` を既存nginx設定に合わせて取り込みます。

重要:

```nginx
location = /line/webhook {
    proxy_pass http://127.0.0.1:8000/line/webhook;
}

location = /openqlow/webhook {
    proxy_pass http://127.0.0.1:8787/openqlow/webhook;
}
```

反映:

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -i https://YOUR_DOMAIN/openqlow/health
```

## LINE Developers

OPENQLOW専用LINE公式アカウントのMessaging APIで:

```text
Webhook URL: https://YOUR_DOMAIN/openqlow/webhook
Webhook: ON
応答メッセージ: OFF
あいさつメッセージ: OFF
```

既存FLATUP公式LINEのWebhook URLは変更しません。

## 動作確認

VPS上:

```bash
cd /opt/openqlow
npm run daily
npm run dev -- approve FG-YYYYMMDD-001 "OK FG-YYYYMMDD-001"
```

Webhook疑似テスト:

```bash
curl -X POST https://YOUR_DOMAIN/openqlow/webhook --data 'OK FG-YYYYMMDD-001'
```

## 安全確認

- OPENQLOWはSNSへ直接投稿しない
- Typefully schedule APIを呼ばない
- `level_3_scheduled` / `level_4_publish` のdraftは承認時に物理ロックで拒否する
- `OPENQLOW_ENABLE_PUBLIC_POSTING=true` はPhase 1では起動時に拒否する
- 既存BOTの `.env` とOPENQLOWの `.env` を混ぜない
- 既存BOTのsystemd/nginx locationを変更しない
- 最初は `OPENQLOW_DRY_RUN=true`
- Phase 1の推論はOpenRouter等の公式API従量課金に寄せる
- ChatGPT Plus OAuthは開発補助に限定し、24h本番自動化の前提にしない
- Ollama / AnythingLLM を同居させる場合は `docs/vps_ollama_anythingllm_line.md` を正本にする
- Ollama `11434` と AnythingLLM `3001` は原則 localhost 限定で、外部へ裸で公開しない

## 残存運用リスク

ローンチ前に設計書ではなく運用SOPとして残すもの:

- Jinが24時間承認できない場合の副承認者
- APIキー、LINE secret、VPS root権限の保管場所
- 1Password等の緊急アクセス設定
- 既存BOT停止時の連絡先
- OPENQLOW停止時の切り戻し担当

## 切り戻し

```bash
sudo systemctl stop openqlow-webhook.service openqlow-daily.timer openqlow-monitor.timer
sudo systemctl disable openqlow-webhook.service openqlow-daily.timer openqlow-monitor.timer
```

nginxから `/openqlow/webhook` location を外してreloadすれば、既存BOTには影響せず停止できます。
