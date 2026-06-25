---
type: wiki
title: "Obsidian Vault としての置き場所"
tags: [second-brain, obsidian, tooling]
created: 2026-06-24
updated: 2026-06-24
sources:
  - "[[../sources/20260624-karpathy-second-brain-tweet]]"
---

# Obsidian Vault としての置き場所

## 要点
[[second-brain]] のファイル群は **Obsidian の Vault** として開ける。
Markdown + `[[ウィキリンク]]` なので、グラフ表示・バックリンク・全文検索がそのまま効く。

## 詳細
- 元のアイデアでは「Obsidian をインストール → Vault を作成 → Claude Code で開く」。
- 本リポジトリでは `knowledge/` フォルダ自体が Vault。
  Obsidian で `File → Open folder as vault` から `knowledge/` を選べばよい。
- Obsidian は必須ではない（ただの Markdown なので任意のエディタでも読める）が、
  リンクのグラフ可視化が知識の“つながり”を見るのに役立つ。

## 関連
- [[second-brain]]
- [[wiki-three-structures]]

## 出典
- [[../sources/20260624-karpathy-second-brain-tweet]]
