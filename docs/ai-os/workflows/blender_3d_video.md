# Blender MCP 3D動画ワークフロー

結論: 長いプロンプトではなく「仮置き → スクショ → 一言修正」を繰り返す。Skill: `flatup-blender-video`。

## 準備（初回のみ・人間承認あり）
1. 作業用フォルダでClaude Codeに依頼: 「Blenderと公式Blender MCP（Blender Lab版, Blender 5.1以上）を入れて接続。Server is runningを確認して」
2. `Online access must be enabled` なら Blender の Edit > Preferences > System > Network > Allow Online Access をオン。
3. Claude Code再起動 → blenderサーバー使用を承認。
4. 動作確認: 「シーンの中身を教えて。立方体を1つ置いてスクショを出して」。立方体1つでゴール。

## 安全
- 公式MCPはAI生成Pythonを保護なしで実行する（削除・外部送信もあり得る）。
- `.claude/settings.json` の `ask` に `mcp__blender__execute_blender_code` / `mcp__blender__execute_blender_code_for_cli` を設定済み → 毎回コードを確認して承認。
- フォルダ分けは約束事。本当の歯止めは毎回承認。より安全にするなら専用macOSユーザーかVM。

## 制作ループ
| 段階 | 指示例 |
|---|---|
| 置く | 「立方体で仮置きして、カメラとライトを置いて。スクショ見せて」 |
| 見る | 「回転の速さと最初の動きだけ確認したい。スクショ」 |
| 直す | 「回転を半分の速さに。他は触らないで」 |
| 画風 | 「色は2色まで、光は1つ。簡単な案を3つ」 |
| 書き出し | 「MP4(H.264)、1920×1080・30fps、10秒を renders/ に」 |

## 公開
- 完成MP4は `flatup-content-qc` を通し、投稿はオーナー承認後。
