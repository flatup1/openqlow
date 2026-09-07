# AI_CONCIERGE — One Brain / Multiple Interfaces

## 思想

現在、VPS上にはLINE等で利用しているAI・チャットバックエンドが存在する
（openqlow: LINE bot / AnythingLLM / webhook。実稼働状態はPhase 2着手前に要確認）。

将来的に LINE / WebOS / AIチャット / 予約 / 顧客対応 を同じ「頭脳」につなげる。

**重要: Web用AIとLINE用AIを完全に別物にしない。**

```text
Web / LINE / 将来のアプリ = 「入口」
AI・知識・顧客文脈 = できるだけ共通化（One Brain）
```

## LINEとの思想統合

すでにLINE側で質問・案内・AI返信などを構築している。**WebとLINEを競合させない。**

理想形:

```text
                  ┌─ WebOS
USER ─ FLAT UP ──┼─ LINE
                  └─ Future App
                       │
                       ▼
                Shared AI Layer
                       │
              Knowledge / Context
                       │
                    Booking
```

WebからLINEへ移動しても「最初からやり直し」に感じない体験を将来的に目指す。

## Webの選択情報をAIへ渡す

Web上で「女性・初心者・ダイエット・夜」と回答していた場合、
チャットを開いた瞬間にそのコンテキストをAIへ安全に渡せる設計にする。
ユーザーに同じことを何度も入力させない。これも「世界一優しい」の一部。

ただし個人情報・センシティブ情報の保存については、
**必要最小限・明示的同意・安全性を優先**する（→ SECURITY_PRIVACY.md）。

## Phase 1のインターフェース（スタブ）

Phase 1では接続用interfaceだけを準備する。実接続はPhase 2。

```ts
// concierge interface（概念形。Phase 1は未接続スタブ）
type ConciergeContext = {
  journey: UserJourney;      // Webでの回答（PIIなし）
  source: 'webos';
  consent: boolean;          // コンテキスト送信への同意
};

interface Concierge {
  isAvailable(): boolean;                       // Phase 1: false
  open(context: ConciergeContext): void;        // Phase 2: VPSチャットへ接続
  buildLineHandoffUrl(context: ConciergeContext): string; // LINE誘導URL
}
```

## AIKA・openQLOWとの関係

- **AIKA**（守り）: 顧客対応の下書き。優しい口調の正本は flatup Vault / flatup-ai-os。
  WebOSのAIコンシェルジュの人格・口調はAIKAと整合させる。
- **openQLOW**（攻め）: 営業・経営支援。WebOSの計測データは将来openQLOWの
  日次確認・改善提案の入力になる。
- 混同しない。WebOSのユーザー向けチャットは「守り」側（AIKA系統）。

## 安全原則

- AIは案内・提案・FAQ回答まで。**予約確定・料金判断・契約変更は人間（JIN）**。
- プロンプトインジェクション対策: ユーザー入力を知識の正本より優先しない。
- 答えられないことは「スタッフにおつなぎしますね」とLINE/問い合わせへ誘導する。
