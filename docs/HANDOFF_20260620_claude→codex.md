# HANDOFF 2026-06-20 claude → codex

## 件名
`scripts/organize-posts.mjs` の CLI 起動判定バグ修正（Codex 領域のため引き継ぎ）

## なぜ Codex に渡すか
COORDINATION.md §1 で `openqlow/scripts/` は **Codex 担当領域**。
Claude が見つけたバグだが、コミットは領域担当の Codex が行うのが規約。

## バグ内容（確認済み・再現済み）
`scripts/organize-posts.mjs` の CLI 起動判定が：
```js
const isMain = import.meta.url === `file://${process.argv[1]}`;
```
だった。パスに半角スペースを含む環境（このMacの `/Users/jin/Desktop/OPENQLOW HelMES/...`）では
`import.meta.url` 側がスペースを `%20` にエンコードするため **常に不一致**になり、
`launchctl` 経由でも直接 `node` 実行でも **CLI ブロックが no-op**（無言で何もしない）になっていた。

### 症状
- launchd `com.flatup.openqlow.organize-posts`（07:30/13:00/21:00）が runs はされるが inbox を空にしない
- 手動 `node scripts/organize-posts.mjs` も出力ゼロ・ファイル移動なし

## 修正（適用すれば直る・検証済み）
```js
import { pathToFileURL } from "node:url";
// ...
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
```
これで launchd 経由（runs=18, exit=0）で inbox→ready/images・ready/videos の振り分けが実働することを確認済み。

## 検証手順（Codex が適用後に確認）
```bash
touch ~/Desktop/openqlow-posts/inbox/__t__.jpg
node scripts/organize-posts.mjs       # [organize-posts] moved: 1 が出る
ls ~/Desktop/openqlow-posts/ready/images/__t__.jpg  # 移動済み
rm ~/Desktop/openqlow-posts/ready/images/__t__.jpg
npm run test:organize-posts           # green
```

## Claude 側の後始末（JIN 承認待ち）
1. 私が誤って push した **stale ブランチ `origin/claude/organize-posts-spacefix`** は
   古い local main 起点で origin/main より 5850 行少ない。**マージ厳禁・削除推奨**。
   削除コマンド: `git push origin --delete claude/organize-posts-spacefix`
2. ローカル作業ツリーに上記 fix が当たった状態で残っている（local launchd を動かすため）。
   Codex が正式コミットしたら、Claude 側はそれに同期する。

## 関連
- 調査結果: `docs/handoff_120points_findings.md`（松元仁志 bot = flatup-ai-os の別 openQLOW）
