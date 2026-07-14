# design-sync メモ

- 2026-07-09: 初回同期。openqlow リポジトリには React 等の UI コンポーネント・Storybook・デザイントークンが存在しない（LINE bot / SNS 下書き生成のバックエンド）。ユーザーの希望により **FLATUP GYM のブランドキット**（カラー・タイポグラフィ・余白トークン、基本UIクラス、ブランドガイドライン、プレビューカード3枚）を `ds-bundle/` に手組みで作成し、claude.ai/design の「Design System」プロジェクト（4a51ce1e-d533-453b-91d9-690c66569a81）へアップロードした。
- カラーは「おまかせ」指定 → コーラルピンク主体・墨色・琥珀・ティールの温かいパレットを設計（トーン&マナー: 優しい・温かい）。小さいピンク文字は `--fu-primary-strong`（AA 5.0:1）を使う規則。
- フォント: Zen Maru Gothic 400/700 を Google Fonts からセルフホスト（`ds-bundle/fonts/`、242 woff2 サブセット + CSS）。
- 公式サイト flat-up.jp / flatupnarita.jp はこの実行環境のネットワーク制限（プロキシ403）で取得不可。実際のロゴ・正確なブランドカラーコードは未反映 — 次回、オーナーからカラーコードやロゴ画像をもらえたら `tokens/colors.css` を差し替えるだけでよい。
- 事実情報（料金・営業時間・住所）は `knowledge/wiki/flatup-canonical-faq.md` を正本として `ds-bundle/guidelines/brand.md` に転記。正本FAQが更新されたら guidelines も更新すること。
- 検証: Playwright + 同梱 Chromium でプレビュー3枚をスクリーンショット確認（フォント読込・コンソールエラー0・目視OK）。
- 2026-07-13: 引き継ぎ書v3（FLATUPGYM 成田No.1）を受領。ルール7「FLATUPGYM 半角統一」に合わせ、ブランドキット全体の「FLATUP GYM」→「FLATUPGYM」を一括置換し再同期。guidelines/brand.md に正式連絡先（電話 070-9035-3465／LINE https://lin.ee/SRRBU94／Instagram flatup.narita／Facebook flatupgym）・住所の建物名（青柳ビル2F）・広告禁止事項（産後−25kg等の減量数値をCTA/広告見出しに使わない=Meta審査対策、メッセージは「怖くない/一人じゃない」の2つに絞る）を追記。
- 生成済みの体験LPテンプレ（templates/trial-lp/*、Claude Design のデザインAIが生成）は当方では編集しない領域。名称修正が必要な場合はデザインAIに依頼する（作り直せば修正済みブランドキットから正しく生成される）。
- ⚠️ 未解決: 営業時間がソース間で不一致。正本FAQ「平日10-12/18-20・土曜クラス制・日祝休み」 vs 本番サイト/引き継ぎ「平日10-12/18-21・土10-15・会員24時間利用可」。オーナー確認待ち。確定したら guidelines・サイトJSON-LD・正本FAQを統一すること。
- 別作業（進行中）: 本番サイト flatupnarita.jp（Xサーバー public_html）の修正。index.html は TASK A〜D 適用済みをユーザーへ納品（承認・アップロード待ち）。残り6ページ fighters/instructors/masaki/meltykira/sun-warriors/taiyo.html は未受領。*_bk0706 と index_backup_* はバックアップなので触らない。電話番号はサイトでは既に3465へ修正済みだった。
