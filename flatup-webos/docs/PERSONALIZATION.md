# PERSONALIZATION — パーソナライズ設計

## 最重要仕様

単に最後におすすめを表示する「診断サイト」にはしない。
回答内容によって **ページ内容そのもの** を変える。

回答によって切り替えられる対象:

- 表示する文章 / 写真 / 動画 / 口コミ / FAQ / クラス案内 /
  インストラクター情報 / CTA / 体験案内 / **AIチャットの初期コンテキスト**

### 例: 女性 × 初心者 × ダイエット × 夜

- 初心者向けメッセージ
- 女性会員向けコンテンツ
- 女性インストラクター
- 怖くない練習風景
- ダイエット関連コンテンツ
- 夜に通える情報
- 該当する口コミ
- 最適な体験予約導線

そのユーザーに関係のない情報は、原則として前面に表示しない。

## データモデル（概念設計）

UIコンポーネントとロジックを密結合させない。以下を分離する。

```ts
// ユーザーの回答（入力側）
type UserProfile = {
  audience?: Audience;        // 誰のため（self / kids / family / consult）
  gender?: string;            // 任意。スキップ可。必須にしない
  goal?: string[];            // 目的（複数可）
  experience?: Experience;    // 経験
  availability?: string[];    // 通える時間帯
  answers: Answer[];          // 生の回答履歴（質問ID + 選択値）
  currentStep: number;
};

type Audience   = 'self' | 'kids' | 'family' | 'consult';
type Experience = 'first' | 'some' | 'experienced' | 'active';
type Answer     = { questionId: string; value: string | string[] };

// パーソナライズ結果（出力側）
type RecommendedContent = {
  headline: string;           // 「あなたには、こんな始め方が合いそうです。」
  messages: string[];         // 表示する文章群
  media: string[];            // 写真・動画の参照
  reviews: string[];          // 該当する口コミ
  faq: string[];              // 該当FAQ
  classes: string[];          // クラス案内（正本 canon 参照）
  instructors: string[];      // インストラクター
};

type RecommendedCTA = {
  primary: 'trial_booking' | 'line' | 'contact';
  label: string;              // 心理的負担の少ない文言
};
```

実装時に最適な型へ改善してよい。ただし「入力（回答）」「変換ロジック」「出力（表示）」の
3層分離は守る。

## ルール駆動の切替

パーソナライズは「回答の組み合わせ → コンテンツ集合」のルールとして記述する。
if文の山にしない。将来的に質問追加・順番変更が簡単であること。

```jsonc
// イメージ: ルール定義（データ）
{
  "when": { "audience": "self", "experience": "first" },
  "show": ["beginner_message", "gentle_gym_photos", "first_timer_faq"],
  "cta": "trial_booking"
}
```

## AIチャットへのコンテキスト引き継ぎ

Webで「女性・初心者・ダイエット・夜」と回答済みなら、
チャットを開いた瞬間にそのコンテキストをAIへ安全に渡す（→ AI_CONCIERGE.md）。
ユーザーに同じことを何度も入力させない。これも「世界一優しい」の一部。

ただし個人情報・センシティブ情報の保存は、必要最小限・明示的同意・安全性を優先する
（→ SECURITY_PRIVACY.md）。

## トーンのルール

- 「あなたには、こんな始め方が合いそうです。」のように優しく提案する。
- 断定しない。「あなたは○○タイプです！」という押し付けは禁止。
