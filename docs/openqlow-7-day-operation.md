# OPENQLOW 7日運用固定メモ

## 目的

OPENQLOWを、まず7日間だけ「毎朝聞く、答える、Obsidianに残す、今日の3つに絞る」運用に固定する。

この7日間は新機能を増やさない。Hermes、CodeGraph、YouTube切り抜き、完全自動投稿は触らない。

## 現在の役割

- AIKA: お客様向けの守り。返信案まで。重要判断と送信は人間。
- OPENQLOW: オーナー向けの攻め。毎日の聞き取り、記録、追客漏れ防止、今日のタスク整理。
- Obsidian: 記憶と正本。
- GitHub: 履歴と共有。

## 稼働中の仕組み

- VPS: `162.43.41.182`
- webhook: `openqlow-webhook.service`
- 毎朝ヒアリング: `openqlow-daily-check.timer`
- 毎朝ヒアリング時刻: 08:00 JST
- Jinが返すコマンド: `/昨日の記録`
- お客様への自動送信: 禁止

## 毎日の流れ

1. 08:00にOPENQLOWからLINEが届く。
2. JinがLINEで `/昨日の記録` と返す。
3. OPENQLOWの質問に短く答える。
4. OPENQLOWが回答を整理してObsidianへ保存する。
5. 今日やること3つ、要確認、フォロー候補を返す。
6. Jinが必要なものだけ人間判断で実行する。

## 7日間チェックリスト

毎日、以下だけ確認する。

- [ ] 08:00のLINE通知が届いた
- [ ] `/昨日の記録` で会話が始まった
- [ ] 体験、入会、返信漏れ、口コミ候補、退会リスクを答えられた
- [ ] Obsidianに日次ログが残った
- [ ] 今日やること3つが返ってきた
- [ ] お客様へ自動送信されていない
- [ ] 秘密情報や個人情報が余計に出ていない

## 止める条件

以下が起きたら、機能追加を止めて原因確認を優先する。

- お客様へ勝手にLINEを送った
- Jin以外へ管理者向けメッセージを送った
- APIキー、トークン、パスワードを表示した
- Obsidian保存先が想定外だった
- 同じ通知が連続で大量送信された
- `openqlow-webhook.service` が落ちた

## VPS確認コマンド

Mac localで実行する。

```bash
ssh -i ~/.ssh/openqlow_vps root@162.43.41.182 'systemctl status openqlow-daily-check.timer --no-pager'
```

```bash
ssh -i ~/.ssh/openqlow_vps root@162.43.41.182 'journalctl -u openqlow-daily-check.service -n 50 --no-pager'
```

手動で朝の通知を再送する場合だけ使う。

```bash
ssh -i ~/.ssh/openqlow_vps root@162.43.41.182 'systemctl start openqlow-daily-check.service'
```

## 7日後に見る数字

- 通知成功: 7/7
- `/昨日の記録` 完走: 5/7以上
- Obsidian保存成功: 5/7以上
- 自動誤送信: 0
- 秘密情報漏洩: 0
- Jinの所要時間: 1日3分以内

## 7日間はやらないこと

- Hermes本番導入
- CodeGraph本番導入
- YouTube切り抜き
- SNS完全自動投稿
- お客様への自動LINE送信
- GitHub Issues/ProjectsのLINEからの自動変更

## セキュリティ注意

GitHub PATなどのトークンがスクリーンショットやチャットに出た場合は漏洩扱いにする。

漏れた可能性があるトークンは、GitHubで即時revokeして再発行する。iPhoneショートカット側も新しいトークンに差し替える。
