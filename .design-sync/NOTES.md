# design-sync メモ

- 2026-07-09: 初回同期。openqlow リポジトリには React 等の UI コンポーネント・Storybook・デザイントークンが存在しない（LINE bot / SNS 下書き生成のバックエンド）。ユーザーの希望により **FLATUP GYM のブランドキット**（カラー・タイポグラフィ・余白トークン、基本UIクラス、ブランドガイドライン、プレビューカード3枚）を `ds-bundle/` に手組みで作成し、claude.ai/design の「Design System」プロジェクト（4a51ce1e-d533-453b-91d9-690c66569a81）へアップロードした。
- カラーは「おまかせ」指定 → コーラルピンク主体・墨色・琥珀・ティールの温かいパレットを設計（トーン&マナー: 優しい・温かい）。小さいピンク文字は `--fu-primary-strong`（AA 5.0:1）を使う規則。
- フォント: Zen Maru Gothic 400/700 を Google Fonts からセルフホスト（`ds-bundle/fonts/`、242 woff2 サブセット + CSS）。
- 公式サイト flat-up.jp / flatupnarita.jp はこの実行環境のネットワーク制限（プロキシ403）で取得不可。実際のロゴ・正確なブランドカラーコードは未反映 — 次回、オーナーからカラーコードやロゴ画像をもらえたら `tokens/colors.css` を差し替えるだけでよい。
- 事実情報（料金・営業時間・住所）は `knowledge/wiki/flatup-canonical-faq.md` を正本として `ds-bundle/guidelines/brand.md` に転記。正本FAQが更新されたら guidelines も更新すること。
- 検証: Playwright + 同梱 Chromium でプレビュー3枚をスクリーンショット確認（フォント読込・コンソールエラー0・目視OK）。
