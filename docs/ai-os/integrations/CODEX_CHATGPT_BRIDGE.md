# Claude と ChatGPT の二人体制（自動委任ブリッジ）

結論から。

- **できる**: Claude Code に書いた依頼を、自動で「考える係＝ChatGPT」と「手を動かす係＝Claude」に振り分ける。
- **できる**: ChatGPT 側は Codex CLI を ChatGPT アカウントで動かすので、**API キー課金のトークンを使わない**。
- **できない**: トークンをゼロにすること。ChatGPT の定額枠は減る。Claude 側も会話の分は減る。
- **できない**: Codex のブラウザ画面（chatgpt.com）を自動操作して回答を抜くこと。壊れやすく、規約上も勧められない。だから同じ結果を **Codex CLI の非対話モード**で作る。

## 1. 役割分担

| 係 | 何をするか | 例 |
| --- | --- | --- |
| ChatGPT（考える係） | 計画・設計・レビュー・説明・文章 | 「この設計をレビューして」「台本を書いて」 |
| Claude Code（手を動かす係） | ファイル変更・テスト・実行・差分確認 | 「テストを緑にして」「差分を見せて」 |

判定は `src/delegate/classify.ts` が決める。同じ文からは必ず同じ答えが出る。

分からない依頼は **Claude 側に残す**。勝手に外へ出さない。

## 2. 準備（1回だけ・あなたのPCで）

```bash
# 1. Codex CLI を入れる
npm install -g @openai/codex

# 2. ChatGPT アカウントでサインインする（APIキーではなく、定額プランを使う）
codex login

# 3. 入ったか確認する
codex exec "1+1は？"
```

`codex login` はブラウザが開く。ここで出る URL やコードは**誰にも渡さない**。

## 3. 使い方

```bash
# 判定だけ見る（外部へは送らない。既定はこれ）
npm run ask -- "この設計をレビューして"

# 実際に ChatGPT へ渡す
npm run ask -- --send "この設計をレビューして"

# 今の差分を添えて渡す（リポジトリ全体は送らない）
npm run ask -- --send --diff "この差分をレビューして"

# 特定ファイルだけ添える
npm run ask -- --send --file src/delegate/classify.ts "ここを説明して"

# 失敗したコマンドの出力を添える
npm run test > /tmp/err.log 2>&1
npm run ask -- --send --errors-file /tmp/err.log "直し方を教えて"

# トークンの記録を見る
npm run ask -- --summary
```

**既定で送らない**のは、外部送信を人間承認の後ろに置く決まりがあるため（`docs/ai-os/canon/approval_matrix.md`）。

## 4. 自動化（意識しなくても振り分ける）

`.claude/hooks/auto-delegate.sh` が、あなたが Claude Code に書いた依頼を見て自動で振り分ける。

既定では**何もしない**。使うときだけ、端末で許可する。

```bash
export FLATUP_AUTO_DELEGATE=1   # フックを有効にする
export FLATUP_DELEGATE_SEND=1   # 外部送信を許可する
```

フックの登録は**あなたの手で1回だけ**行う（設定ファイルの自動書き換えはしない決まりのため）。
`.claude/settings.json` の `"hooks"` の中に、次を足す。

```json
"UserPromptSubmit": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "/bin/bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/auto-delegate.sh\"",
        "timeout": 240,
        "statusMessage": "ChatGPT（考える係）へ委任できるか判定中"
      }
    ]
  }
]
```

足したあとも、上の2つの環境変数を設定しない限り黙って通過する（何も起きない）。

動きはこうなる。

1. あなたが普通に質問を書く
2. フックが「考える仕事」か判定する
3. 考える仕事なら ChatGPT（Codex CLI）へ先に渡す
4. ChatGPT の答えが Claude への参考意見として差し込まれる
5. Claude がその答えを使ってファイル変更やテストを実行する

やめたいときは `unset FLATUP_AUTO_DELEGATE` だけ。

## 5. 安全のしくみ

送る前に3段で守る（`src/delegate/redact.ts`）。

1. 鍵・トークン・メール・電話・LINE userId を `[REDACTED:種類]` に置き換える
2. 既存ガード（`src/shared/secret_guard.ts` / `src/shared/pii_guard.ts`）で消えたか確認する
3. 消し切れていなければ **送らない**（結果は `blocked`）

環境変数は**名前だけ残して値を消す**。「何の設定の話か」は伝わり、中身は出ない。

送信・公開・料金・返金・退会・休会・本番反映・commit・push・PR の語が出た依頼は、`requires_human_approval` が立つ。下書きと分析は進むが、実行はあなたの承認後。

## 6. トークンの見方（測れるもの／測れないもの）

`npm run ask -- --summary` が出す数字。

- **測れる**: ChatGPT 側へ渡した文字量（概算）、答えの文字量（概算）、委任に回った割合
- **測れない**: Claude 側が実際に課金されたトークン数

Claude 側の実数は会話の履歴全体を含むので、この記録からは出せない。実数は Claude Code の `/cost` で見る。

だから報告では次の3つを分けて書く。

1. Claude 側のトークン使用量（`/cost` で実測）
2. ChatGPT 側の利用量（ChatGPT の使用状況画面で確認）
3. 委任で渡したデータ量（`--summary` の概算）

**「トークンゼロ」とは書かない。**

## 7. トークンを減らすためにしていること

1. リポジトリ全体を渡さない（差分・指定ファイル・エラーだけ）
2. 予算（既定 2000 トークン概算）を超えたら優先度の低い方から落とす
3. ファイル抜粋は既定 80 行で切る
4. 前置きの指示文は毎回同じ文にする（同じ前置きはキャッシュが効きやすい）
5. 考える仕事を ChatGPT の定額枠へ寄せる
6. 実行とテストは Claude 側で行う（外部へ送る必要がない）

## 8. 他のセッションでも使えるか

| もの | 引き継がれるか |
| --- | --- |
| この仕組み（コード・フック・設定） | **される**（リポジトリに入っているため） |
| Codex CLI のサインイン状態 | **その PC の中だけ**（`~/.codex` に保存される。別PC・クラウドセッションでは再ログインが必要） |
| 会話履歴・開いているタブ・作業中の文脈 | **されない** |
| OAuth URL・ペアリングコード・アクセストークン | **引き継がない**（引き継いではいけない） |

クラウド上のセッションには `codex` が入っていないことがある。その場合は `dry_run` になり、送る本文と概算トークンだけ表示する（失敗にはしない）。

## 9. うまくいかないとき

| 表示 | 意味 | 直し方 |
| --- | --- | --- |
| `dry_run` + 「codex が見つかりません」 | Codex CLI が未導入 | `npm install -g @openai/codex` |
| `failed` + 「サインインしていません」 | ログイン切れ | `codex login` をやり直す |
| `failed` + 「利用枠に達しました」 | ChatGPT 側の上限 | 時間をおく。または Claude 側で進める |
| `failed` + 「引数が合っていません」 | Codex CLI の版が違う | `codex exec --help` を見て `FLATUP_CODEX_ARGS` を合わせる |
| `blocked` | 秘密情報が消し切れない | 該当箇所を外して再実行 |
| 答えが空 | サインインか引数の問題 | 上の2つを確認 |

## 10. 設定できる環境変数

| 名前 | 既定 | 意味 |
| --- | --- | --- |
| `FLATUP_AUTO_DELEGATE` | 未設定 | `1` で自動委任フックを有効にする |
| `FLATUP_DELEGATE_SEND` | 未設定 | `1` で外部送信を許可する |
| `FLATUP_DELEGATE_DRY_RUN` | 未設定 | `1` で絶対に送らない（確認用） |
| `FLATUP_CODEX_BIN` | `codex` | 実行ファイル名 |
| `FLATUP_CODEX_ARGS` | `exec --sandbox read-only` | Codex CLI へ渡す引数 |
| `FLATUP_DELEGATE_TIMEOUT_MS` | `180000` | 打ち切り時間 |
| `OPENQLOW_DATA_DIR` | `./data` | トークン記録の置き場所 |

## 11. 元の構想（`XiaoDuoYa/codex-with-chatgpt`）との違い

あの仕組みは **MCP ブリッジ方式**。ローカルに読み取り専用のサーバを立て、ChatGPT の画面側からリポジトリを読ませる。

- 長所: ChatGPT の画面をそのまま使える
- 短所: **質問を貼るのは人間**。Cloudflare トンネルや OAuth の用意が要る。全自動にはならない

こちらは **Codex CLI 方式**。

- 長所: 全自動にできる。トンネル不要。ChatGPT の定額枠で動く
- 短所: ChatGPT の画面は見えない（答えは文字で返る）

「毎回の質問を自動で ChatGPT に回したい」という目的には、Codex CLI 方式が合う。

## 12. 関係するファイル

| ファイル | 役割 |
| --- | --- |
| `src/delegate/contracts.ts` | 型と対応表 |
| `src/delegate/classify.ts` | どちらに渡すかの判定 |
| `src/delegate/redact.ts` | 秘密情報・個人情報を消す／概算トークン |
| `src/delegate/context_pack.ts` | 渡す本文を最小限で組み立てる |
| `src/delegate/codex_bridge.ts` | Codex CLI を呼ぶ |
| `src/delegate/ledger.ts` | トークン記録と集計 |
| `src/delegate/ask_cli.ts` | `npm run ask` の入口 |
| `src/delegate/route_cli.ts` | 判定だけを JSON で返す（フック用） |
| `.claude/hooks/auto-delegate.sh` | 自動委任フック |
