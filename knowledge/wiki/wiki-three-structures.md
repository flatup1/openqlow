---
type: wiki
title: "3つの構造（ソース / ウィキ / CLAUDE.md）"
tags: [second-brain, structure, claude-code]
created: 2026-06-24
updated: 2026-06-24
sources:
  - "[[../sources/20260624-karpathy-second-brain-tweet]]"
---

# 3つの構造（ソース / ウィキ / CLAUDE.md）

## 要点
[[second-brain]] を成立させる最小構成は次の3つ。

1. **生のソース用フォルダ** (`sources/`) — 取り込んだ原本をそのまま置く（不可侵）。
2. **ウィキページ用フォルダ** (`wiki/`) — AIが整理して作る1概念1ページの成果物。
3. **CLAUDE.md** — 全体を管理する司令塔。取り込み・整理・想起のルールを定義する。

## 詳細
- ソースとウィキを**分ける**のが肝。原本を汚さず、加工結果だけを育てられる。
- `CLAUDE.md` が「[[claude-code-as-librarian|司書としての振る舞い]]」を固定するので、
  毎回指示し直さなくても一貫した整理がされる。
- 本リポジトリの実体: `knowledge/sources/`・`knowledge/wiki/`・`knowledge/CLAUDE.md`。

## 関連
- [[second-brain]] — 上位の考え方
- [[claude-code-as-librarian]] — CLAUDE.md が定義する運用
- [[obsidian-vault]] — このフォルダの置き場所

## 出典
- [[../sources/20260624-karpathy-second-brain-tweet]]
