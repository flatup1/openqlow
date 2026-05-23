# OPENQLOW VPS + Ollama + Gemma + AnythingLLM + LINE

OPENQLOW を Mac 依存から外し、VPS 上で日次生成・LINE承認・ローカルLLM知識参照を動かす構成です。

## 結論

最初の完成形はこれです。

```text
VPS
├─ nginx / cloudflared
│  └─ https://YOUR_DOMAIN/openqlow/webhook
├─ OPENQLOW
│  ├─ /opt/openqlow
│  ├─ openqlow-webhook.service
│  ├─ openqlow-daily.timer
│  └─ openqlow-monitor.timer
├─ Ollama
│  ├─ localhost:11434
│  └─ gemma系モデル
└─ AnythingLLM
   ├─ Docker
   ├─ localhost:3001
   └─ Ollama 接続先: http://host.docker.internal:11434
```

OPENQLOW は外部SNSへ直接投稿しません。LINEで Jin が承認したものだけ下書き保存します。

## 推奨VPS

CPUのみで Gemma 系を回すなら、最小でも:

```text
4 vCPU / 16GB RAM / 80GB SSD
```

快適にするなら:

```text
8 vCPU / 32GB RAM / 160GB SSD
```

GPUなしのVPSでは、大きいモデルは遅くなります。最初は `gemma3:4b` のような軽いモデルで始め、重いモデルはOpenRouter等の外部APIと併用します。

## 1. OPENQLOW を配置

Macから:

```bash
rsync -av --exclude node_modules \
  --exclude state --exclude drafts --exclude logs \
  "/Users/jin/Desktop/OPENQLOW HelMES/openqlow/" \
  root@YOUR_VPS:/opt/openqlow/
```

VPS上:

```bash
cd /opt/openqlow
npm ci
npm run test
```

## 2. Ollama を入れる

Ollama Linux公式手順では、インストールは次です。

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable ollama
sudo systemctl start ollama
```

疎通確認:

```bash
ollama -v
curl http://127.0.0.1:11434/api/tags
```

モデル取得:

```bash
ollama pull gemma3:4b
```

OPENQLOW 側の env:

```dotenv
OPENQLOW_LOCAL_LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:4b
OPENQLOW_CHECK_OLLAMA=true
```

注意:

- Ollama は原則 `127.0.0.1:11434` のままにする
- インターネットへ生公開しない
- 公開する場合は認証付きリバースプロキシかVPN必須

## 3. AnythingLLM を入れる

Docker:

```bash
sudo mkdir -p /opt/anythingllm/storage
sudo chown -R 1000:1000 /opt/anythingllm
cd /opt/openqlow
sudo docker compose -f deploy/anythingllm/docker-compose.yml up -d
```

AnythingLLM は `http://127.0.0.1:3001` で待ち受けます。外部へ直接公開しないでください。

ブラウザから使う場合は SSH tunnel:

```bash
ssh -L 3001:127.0.0.1:3001 root@YOUR_VPS
```

手元のブラウザ:

```text
http://127.0.0.1:3001
```

AnythingLLM の Ollama 接続先:

```text
http://host.docker.internal:11434
```

OPENQLOW 側の env:

```dotenv
ANYTHINGLLM_BASE_URL=http://127.0.0.1:3001
OPENQLOW_CHECK_ANYTHINGLLM=true
```

## 4. LINE webhook

OPENQLOW専用LINE公式アカウントだけを使います。既存FLATUP公式LINEと混ぜません。

`/etc/openqlow/openqlow.env`:

```dotenv
OPENQLOW_ROOT=/opt/openqlow
OPENQLOW_LINE_PORT=8787
OPENQLOW_DRY_RUN=true
OPENQLOW_LINE_DRY_RUN=false

LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
JIN_LINE_USER_ID=...
BACKUP_APPROVER_LINE_USER_ID=
```

systemd:

```bash
sudo bash /opt/openqlow/deploy/scripts/install-openqlow-vps.sh
sudo systemctl start openqlow-webhook.service
sudo systemctl start openqlow-daily.timer
sudo systemctl start openqlow-monitor.timer
```

LINE Developers:

```text
Webhook URL: https://YOUR_DOMAIN/openqlow/webhook
Webhook: ON
応答メッセージ: OFF
あいさつメッセージ: OFF
```

LINE webhook は署名検証を必須にします。LINE公式ドキュメントも、受信したWebhookがLINEから来たもので改ざんされていないことを確認するため `x-line-signature` の検証を推奨しています。

## 5. nginx

既存BOTと同居するなら:

```nginx
location = /line/webhook {
    proxy_pass http://127.0.0.1:8000/line/webhook;
}

location = /openqlow/webhook {
    proxy_pass http://127.0.0.1:8787/openqlow/webhook;
    proxy_set_header X-Line-Signature $http_x_line_signature;
}
```

既存BOTの `/line/webhook` は触りません。

## 6. 監視

`OPENQLOW_CHECK_OLLAMA=true` と `OPENQLOW_CHECK_ANYTHINGLLM=true` を入れると、`npm run monitor` が以下も見ます。

```text
openrouter
line_webhook
ngrok
launchd/system service
ollama
anythingllm
```

VPSでは ngrok を使わないなら、後で `checkNgrok` を cloudflared/nginx HTTPS check に置き換えるのが良いです。

## 7. 運用順序

1. OPENQLOWだけVPSで動かす
2. LINE webhookの検証を通す
3. LINE PushでJinに承認依頼が届くことを確認する
4. Ollamaを入れて `gemma3:4b` をpullする
5. AnythingLLMをlocalhost限定で起動する
6. Vault/正本をAnythingLLMに入れて検索できるようにする
7. OPENQLOWからAnythingLLM/Ollamaを使う機能をPhase 2として接続する

## 8. 参考

- Ollama Linux公式手順: `curl -fsSL https://ollama.com/install.sh | sh`
- Ollama API既定URL: `http://localhost:11434/api`
- AnythingLLM Dockerは `/app/server/storage` の永続化が必須
- AnythingLLM UIは既定で `http://localhost:3001`
- LINE webhookは署名検証が必須
