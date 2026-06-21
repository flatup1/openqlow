# HANDOFF 2026-06-20 claude → codex

## ✅ Codex がやることチェックリスト（最優先順）

```text
□ A. pre-push フックを有効化する（最優先）
    cd <openqlow repo>
    bash scripts/hooks/install.sh
    # → .git/hooks/ に pre-commit / commit-msg / pre-push が symlink される
    # 確認: ls -la .git/hooks/ | grep pre-push

□ B. organize-posts.mjs の spaces バグを正式コミットする（Codex 領域）
    # 下記「修正」を適用 → claude プレフィックスではなく codex: で commit
    # codex: fix(scripts): organize-posts isMain breaks on paths with spaces

□ C. 適用後に検証（下記「検証手順」）
```

> A は **各 clone / 各環境で1回ずつ**必要（フックは git clone ローカルにしか入らない）。
> Codex が別環境で動くなら、その環境でも `bash scripts/hooks/install.sh` を実行すること。

---

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

## Claude 側の後始末（完了済み）
1. ~~stale ブランチ `origin/claude/organize-posts-spacefix`~~ → **削除済み**（JIN承認A1で実行）。
2. ローカル作業ツリーの fix は revert 済み（Codex の正式コミットを正とする）。
   ※ それまで local launchd の自動振り分けは無効。手動 `node scripts/organize-posts.mjs` も
     spaces バグのため動かないので、Codex の B 適用が完了するまで inbox は手で整理。

## pre-push フックについて（co-ai 実装済み・2026-06-20）
- `scripts/hooks/pre-push` を追加済み（コミット `1af2ad5`、ブランチ `claude/coord-safety-rules`）
- origin/main より 25 コミット以上遅れ / 2000 行以上削除する push を自動ブロック
- 上記チェックリスト A の `install.sh` を実行すると有効化される

## 関連
- 調査結果: `docs/handoff_120points_findings.md`（松元仁志 bot = flatup-ai-os の別 openQLOW）
- ルール: `COORDINATION.md` §0 rule6/7 + §0.1 事故防止チェックリスト
