# test

MVPのブラウザ・スモークテスト。アプリ本体は依存ゼロのまま（Playwrightはテスト実行時のみ必要）。

```bash
# Playwright と Chromium がある環境で
node flatup-webos/test/smoke.cjs
```

確認内容: 成人/キッズ/相談ルートの全遷移・戻る・スキップ・結果画面の文言切替・CTAリンク・計測イベント・コンソールエラーなし。
