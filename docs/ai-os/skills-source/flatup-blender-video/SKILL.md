---
name: flatup-blender-video
description: Use to make a short FLATUP 3D video (SNS hook or service scene) with Claude Code + the official Blender MCP, one small step at a time with screenshots. Do not use to publish, post, run untrusted .blend files or prompts, or skip the per-run code approval.
---

# FLATUP Blender 3D Video

進め方は3つだけ: **役割を分ける / 一度に一つだけ / 途中で見せてもらう**。

## 役割
- Blenderの担当: 配置・質感・カメラ・光・動き・MP4書き出し。
- 凝った形（人物・ミット・グローブ等）は最初は立方体・円柱で仮置き。カメラと光が決まってから別ツール製モデルに差し替える。

## 1ステップの型（毎回これだけ）
1. 1つだけ作る/直す（「他は触らないで」を付ける）。
2. ビューポートのスクリーンショットを撮って見せる。
3. 人間の一言を待ってから次へ。

## 画風ルール（安っぽさ防止）
- 色は2色まで、主役の光は1つ。模様なしで成立する画風に振り切る（例: 白い模型＋夕日）。
- 安っぽいと言われたら作り込まず「簡単な案を3つ」出して選んでもらう。
- FLATUPらしさ（やさしさ・安心感・清潔感・芯の強さ）を崩さない。

## 型
- SNSフック: 白背景、物体がゆっくり回転、10秒、最初の1秒で目を引く動き。
- サービス紹介: 無地背景、仮の形で配置、やや斜め上から10秒ゆっくりパン。

## 書き出し
- 試作: 低解像度・EEVEEで短く。
- 本番: FFmpeg / MP4(H.264)、1920×1080・30fps、`renders/` に保存。Cycles長時間レンダーは所要時間を先に伝えて承認を得る。

## 詰まった時
- サイズ/位置: 数字で指定（例: 高さ20cm、中心を原点）。
- 真っ暗/見えない: ライトとカメラ位置を確認し、スクショと原因を示す。

## 安全（必須）
- `execute_blender_code` 系は `.claude/settings.json` で ask。毎回コードを見せて承認を得る。
- 作業用フォルダで作業。外部の .blend・素材・プロンプトは読み込まない。使う時だけBlenderを起動。
- 投稿・公開・外部送信は人間承認後。人物・会員の写り込みは同意確認。
