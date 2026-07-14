# FLATUPGYM ブランドキット

千葉県成田市のキックボクシングジム **FLATUPGYM**（「女性オーナーが作った世界一優しい格闘技ジム」）のデザインシステム。このキットで作るデザインは、優しく・温かく・威圧しないこと。

## セットアップ

追加のプロバイダやラッパーは不要。`styles.css` が読み込まれていれば、`body` にフォント（Zen Maru Gothic, 同梱・400/700のみ）・墨色テキスト・クリーム背景が適用される。コンテンツは `max-width: var(--fu-content-width)` で中央寄せするのが標準。

## スタイリングの流儀

**CSSカスタムプロパティ（`--fu-*` トークン）＋ 少数の `.fu-*` クラス。** 独自の色・角丸・影を発明しない — 必ずトークンを参照する。

| 用途 | 使うもの |
|---|---|
| ページ背景 / カード面 | `--fu-bg` / `--fu-surface` / `--fu-surface-warm` |
| テキスト | `--fu-ink`（本文）/ `--fu-ink-soft`（補足）/ 真っ黒 #000 は禁止 |
| 主役の色 | `--fu-primary`（塗り）/ `--fu-primary-strong`（リンク・小さい文字）/ `--fu-primary-soft`（淡い面） |
| 補助色 | `--fu-support`（ティール=安心）/ `--fu-accent`（琥珀=キッズ・装飾のみ、文字は `--fu-accent-text`） |
| 余白 | `--fu-space-1`〜`--fu-space-8`（4/8/12/16/24/32/48/64px） |
| 角丸 | `--fu-radius-sm/md/lg/full` — 直角は使わない。ボタンは必ず `full`（ピル型） |
| 影 | `--fu-shadow-sm/md/lg`（墨色ベースの柔らかい影のみ） |
| 文字 | `--fu-font`, `--fu-text-display/h1/h2/h3/body/small/caption`, weightは400/700のみ |

用意済みクラス: `.fu-btn`（`--primary` / `--ghost` / `--support` / `--small`）、`.fu-card`（`--warm`）、`.fu-badge`（`--kids` / `--ladies` / `--general`）、`.fu-input` + `.fu-label`、`.fu-note`。これで足りないレイアウトは自前のCSSで組んでよいが、色・余白・角丸は必ず `var(--fu-*)` を参照する。

## 真実の在り処

- トークン定義: `tokens/colors.css` / `tokens/typography.css` / `tokens/layout.css`
- コンポーネントクラス: `styles.css`
- 文言のトーン・禁止表現・料金等の正本: `guidelines/brand.md` — **デザイン内に事実（料金・営業時間）を書くときは必ずここを引く**

## 組み方の例

```html
<div class="fu-card" style="max-width: var(--fu-content-narrow)">
  <span class="fu-badge fu-badge--ladies">レディースクラス</span>
  <h2 style="margin-top: var(--fu-space-3)">はじめてでも、大丈夫。</h2>
  <p style="color: var(--fu-ink-soft)">
    痛くない・怖くないから始めるキックボクシング。まずは気軽に体験から。
  </p>
  <a class="fu-btn fu-btn--primary" href="#">500円で体験してみる</a>
  <a class="fu-btn fu-btn--ghost fu-btn--small" href="#">スケジュールを見る</a>
</div>
```

## 文言の鉄則

コピーは「共感 → 安心材料 → 次の小さな一歩を1つ」。威圧・誇大・体型否定・恐怖煽りは禁止。詳細は `guidelines/brand.md`。
