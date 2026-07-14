# FLATUP AI Animation Studio

**1枚の画像から、滑らかなアニメへ。**
キャラクターの静止画をアップロードし、動き・秒数を指定すると、AI(Google Veo / Gemini)が動画を生成し、ブラウザ上で確認・保存できるWebアプリです。

APIキーが無くても、**デモモード**でUIと一連の流れ(生成→進捗→再生→保存)をそのまま試せます。

---

## 主な機能

- 画像アップロード(ドラッグ＆ドロップ / クリック、PNG・JPG・WEBP、最大10MB、プレビュー・検証)
- 動きの指示(日本語、文字数カウント、例文)
- 動作テンプレート(ガード、ジャブ→ストレート、キックコンビ、勝利ポーズ など12種)
- 動画の長さスライダー(2〜10秒)
- 詳細設定(アスペクト比 1:1 / 9:16 / 16:9、カメラワーク、動きの強さ、ループ)
- 進捗表示(段階表示・経過時間・キャンセル・再試行)
- 動画プレビュー(再生・ループ・全画面)＋ MP4 ダウンロード
- 生成履歴(localStorage、直近12件)
- キャラクター一貫性を重視したプロンプト自動付与
- APIキーはサーバー側だけで扱い、フロントには出さない

## 技術構成

- フロントエンド: React 18 + TypeScript + Vite + Tailwind CSS + Framer Motion
- バックエンド: Node.js + Express + TypeScript(zod検証・helmet・レート制限・multer)
- AI動画生成: Google Gemini / Veo(`@google/genai`)。デモモードも同梱
- テスト: Vitest + Testing Library + supertest

## 必要環境

- Node.js 20 以上
- (実生成する場合)課金を有効にした Google Gemini / Veo の APIキー

---

## インストールと起動(かんたん3ステップ)

```bash
cd animation-studio
npm install                 # ① 部品を入れる
cp .env.example .env        # ② 設定ファイルを作る(最初はデモモードのまま)
npm run dev                 # ③ 開発サーバーを起動
```

ブラウザで **http://localhost:5173** を開くと使えます(APIサーバーは 8787 で自動起動)。
最初は `VIDEO_GENERATION_DEMO_MODE=true` なので、**APIキー無しでサンプル動画で動作確認**できます。

## 本番ビルドと起動

```bash
npm run build   # フロントとサーバーをビルド
npm start       # 8787番でサーバー起動(ビルド済みフロントも配信)
```

http://localhost:8787 を開きます。

---

## 実際にAIで生成する(Veo接続)

1. Google の Gemini / Veo APIキーを用意(**課金の有効化が必要**。1本ごとに費用が発生します)
2. `.env` を編集:
   ```
   GEMINI_API_KEY=あなたのキー
   VIDEO_GENERATION_DEMO_MODE=false
   VIDEO_MODEL=veo-3.1-lite-generate-preview
   ```
   ※ モデル名やAPI仕様は変わることがあります。**必ず公式ドキュメントで現在の値を確認**してください。
3. `npm run dev`(または `npm run build && npm start`)

> ⚠️ 本リポジトリでは実API接続は未検証です(検証にはキーと課金が必要なため)。デモモードでの一連の流れは検証済みです。実接続時にモデル名やレスポンス構造が異なる場合は `server/services/geminiVideoService.ts` を調整してください。

## 環境変数

| 変数 | 説明 | 既定 |
|---|---|---|
| `GEMINI_API_KEY` | Veo/Gemini APIキー(**サーバー側のみ**。フロントに出さない) | 空 |
| `VIDEO_MODEL` | 使用モデル名 | `veo-3.1-lite-generate-preview` |
| `VIDEO_GENERATION_DEMO_MODE` | デモモード。本番は `false` | `true` |
| `PORT` | サーバーのポート | `8787` |
| `RATE_LIMIT_MAX` | 15分あたりの生成上限/IP | `20` |
| `MAX_UPLOAD_BYTES` | 画像の最大サイズ | `10485760` |
| `ARTIFACT_TTL_MINUTES` | 生成物の保持時間(分) | `60` |

> `VITE_` や `NEXT_PUBLIC_` の接頭辞は付けないでください(フロントへ露出します)。

## デモモード

`VIDEO_GENERATION_DEMO_MODE=true` のとき、`public/sample/flatup_combo_smooth_24fps.mp4` を返します。
画面には「デモモード:サンプル動画を使用しています」と明示され、実生成と混同しません。**本番では必ず `false`** にしてください。

---

## テスト

```bash
npm run typecheck   # 型チェック
npm run lint        # ESLint
npm test            # Vitest(単体・API・コンポーネント)
```

## API仕様

| メソッド / パス | 説明 |
|---|---|
| `POST /api/generate-video` | multipart(image, prompt, duration, aspectRatio, motionStrength, cameraMotion, loop)。`{ jobId, status, demo }` を返す |
| `GET /api/video-status/:jobId` | ジョブ状態(`queued`/`processing`/`completed`/`failed`)を返す |
| `GET /api/video-download/:jobId` | 完成MP4を返す(`Content-Disposition: attachment`) |
| `DELETE /api/video-job/:jobId` | ジョブと生成物を削除 |
| `GET /api/health` | 動作モードとモデル名(キーは返さない) |

## ディレクトリ構成

```
animation-studio/
├── server/            バックエンド(Express + TS)
│   ├── routes/ services/ middleware/ jobs/ schemas/ utils/
│   └── index.ts
├── src/               フロントエンド(React + TS)
│   ├── components/ hooks/ services/ utils/ types/ pages/
│   └── main.tsx
├── public/sample/     デモ用サンプル動画
├── test/              テスト
└── README.md
```

## 既知の制限

- 実Veo接続は未検証(デモモードは検証済み)。モデル名・API仕様は要確認
- ジョブ管理はインメモリ(サーバー再起動で消える)。本番は Redis/DB 推奨
- 生成物はローカル `storage/` に保存し、TTLで自動削除

## トラブルシューティング

- **サーバーに接続できない**: `npm run dev` が起動しているか、8787番が空いているか確認
- **「APIキーが設定されていません」**: `.env` の `GEMINI_API_KEY` を設定し `VIDEO_GENERATION_DEMO_MODE=false` に
- **生成が失敗する**: 混雑や仕様変更の可能性。時間をおくか、モデル名を公式仕様と照合
- **画像が使えない**: PNG・JPG・WEBP・10MB以下か確認

## GitHubへのpush方法

```bash
git add animation-studio
git commit -m "feat(animation-studio): ..."
git push -u origin <ブランチ名>
```
