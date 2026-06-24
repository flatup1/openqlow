---
type: wiki
title: "Claudeを司書として運用する（取り込み→整理→想起）"
tags: [second-brain, workflow, claude-code]
created: 2026-06-24
updated: 2026-06-24
sources:
  - "[[../sources/20260624-karpathy-second-brain-tweet]]"
---

# Claudeを司書として運用する

## 要点
[[second-brain]] では Claude を「コードを書く人」ではなく**知識の司書**として使う。
基本サイクルは **取り込み → 整理 → 想起** の3つ。

## 詳細
- **取り込み（Ingest）**: ソースを `sources/` に置く／貼る → 「これを分析して整理して」。
  Claude が原本を保存し、概念を抽出し、`wiki/` にページを作り、`[[リンク]]` で繋ぎ、目次を更新する。
- **想起（Recall）**: 「〇〇について保存した情報を教えて」と聞くと、保存済み知識から
  根拠リンク付きで答える。すべてが繋がって検索可能。
- **手入れ（Maintain）**: 重複統合・孤立ページの接続・古い記述の更新。

詳細な規約は [[../CLAUDE|knowledge/CLAUDE.md]] に固定されている。

## 関連
- [[second-brain]]
- [[wiki-three-structures]] — このワークフローを支える構造

## 出典
- [[../sources/20260624-karpathy-second-brain-tweet]]
