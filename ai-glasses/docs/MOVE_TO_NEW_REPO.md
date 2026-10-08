# 新しいリポジトリへ移す手順（B案）

JINさんが「別リポジトリで」と決めたので、この `ai-glasses/` を単独のリポジトリへ移します。

**私（Claude Code）にはGitHubでリポジトリを新規作成する権限がありませんでした。**
実際に試したところ `403 Resource not accessible by integration` で断られました。
そこで、**作るところだけJINさんにお願いします**。あとは私がやります。

---

## JINさんがやること（30秒・1回だけ）

1. https://github.com/new を開く
2. 次のように入れる

| 項目 | 入れる値 |
|---|---|
| Owner | `flatup1` |
| Repository name | `ai-glasses` |
| 説明 | AIスマートグラス用コンパニオンアプリ |
| 公開範囲 | **Private（非公開）** を選ぶ |
| Add a README file | **チェックを外す**（空のまま作る） |
| .gitignore / license | **どちらも None** |

3. 「Create repository」を押す
4. 私に「作った」と教える

> **空のまま作るのが大事です。** READMEを入れて作ると、中身を移すときにぶつかります。

---

## そのあと私がやること（2コマンド）

参考までに、実際に実行する内容です。JINさんが打つ必要はありません。

```bash
# 1. ai-glasses フォルダだけを、履歴つきで切り出す
git subtree split --prefix=ai-glasses -b ai-glasses-only

# 2. 新しいリポジトリへ送る
git push git@github.com:flatup1/ai-glasses.git ai-glasses-only:main
```

`git subtree split` は「フォルダ1つだけを、これまでの変更履歴ごと取り出す」コマンドです。
**作った記録が消えません。**

---

## 移したあと、openqlow 側をどうするか

移し終わったら、openqlow から `ai-glasses/` を消して元どおりきれいにします。

- `ai-glasses/` フォルダを削除
- `COORDINATION.md` に足した1行を削除
- 現在のPR（[#124](https://github.com/flatup1/openqlow/pull/124)）を閉じる

**openqlow本体のコード（`src/` など）には最初から一切触っていません**ので、
消すだけで完全に元の状態に戻ります。

---

## もし今のままでもよい場合

「別リポジトリにするのが面倒」「あとで考えたい」ということであれば、
**このまま openqlow の中で開発を続けても問題ありません。**
`ai-glasses/` は完全に独立しているので、いつ切り出しても同じ結果になります。

急ぐ必要はありません。開発は今のままでも止まりません。
