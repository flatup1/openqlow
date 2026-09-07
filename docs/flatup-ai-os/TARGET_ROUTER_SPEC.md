# Target Router Specification

Version: 1.2.0-design

## 1. Goal

一行入力からTarget、Objective、Content Mode、Emotional Goal、Platform、Knowledge Tags、Quality Profile、CTA Policyを決める。カメラやNegative等をユーザーへ質問しない。

## 2. Input Priority

1. explicit structured hint
2. explicit words in raw text
3. asset metadata
4. active campaign or event context
5. target-specific defaults
6. global safe defaults

低優先の推定が高優先の明示を上書きしない。

尺はRouteDecision.requested_duration_secondsへ型付きで保持する。structured duration hintを最優先し、次にraw textの明示値を使う。媒体が未指定でも捨てない。

## 2.1 Phrase Lexicon and Scoring

- phrase ruleはtarget、intent、objective、platform等のcategory別に一か所で宣言する。
- 各ruleはvalue、phrases、weight、word-boundary要否を持つ。
- 一致したweightをvalue単位で合計し、最大scoreを選ぶ。同点は宣言順で決め、同一入力の結果を固定する。
- 正規化はUnicode NFKC、lowercase、空白畳み、句読点整理を一度行う。日本語の長音符「ー」をASCII dashへ変換しない。
- `line`が`online`へ部分一致するようなfalse positiveをword boundaryで防ぐ。
- 「ではなく」「じゃない」「not」「instead of」等で否定されたphraseはscoreへ加えない。
- explicit hint > explicit phrase > asset metadata > safe defaultの優先順位はscoreより上位である。
- lexiconにない表現は安全な既定値へ落とし、推定したことをassumptionsへ残す。外部LLMやnetworkへ自動送信しない。

## 3. Intent Classification

| Signal | Intent |
| --- | --- |
| 作って、動画に | create |
| 動かして、アニメに | animate |
| 別尺、TikTokにも | repurpose |
| 告知、大会、イベント | announce |
| 結果、なぜ伸びた | analyze |
| A/B、試したい | experiment |

## 4. Target Classification

| Signal | Primary target |
| --- | --- |
| 子ども、キッズ | kids |
| 親子、ママと子、保護者も | kids_parents |
| 女性、レディース、30代女性 | women_beginners or women_30_40 |
| 男性初心者 | men_beginners |
| 運動不足の男性 | inactive_men |
| シニア | senior |
| 家族 | family |
| 保護者へ | parents |
| 試合、スパー、格闘技好き | sparring_fans |
| 大会、勝負 | competition |
| 先生、コーチ | instructor |
| ジム内、施設 | general_beginner with facility content tag |

人物属性だけでTargetを推測しすぎない。画像に女性が写るだけで女性向けに固定せず、raw textとobjectiveを優先する。

## 5. Objective Classification

| Signal | Objective |
| --- | --- |
| 体験、来てもらう | trial |
| LINE、相談 | line_add |
| 入会 | enrollment |
| 知ってほしい | awareness |
| 安心してほしい、紹介 | trust |
| プロフィールへ | profile_visit |
| 大会告知 | event |

Defaultはtrust。再生数はobjectiveにしない。

## 6. Content Mode

- 参照写真 + 動かす: image_to_video
- アニメ + character reference: animation
- 素材なし + scene generation: text_to_video
- 元動画 + 別尺: edit_only / repurpose
- 実写希望: live_action

## 7. Emotional Defaults

| Target / Objective | Default |
| --- | --- |
| women beginners / trial | safety |
| kids / awareness | fun |
| kids parents / trust | trust |
| men beginners / trial | permission |
| senior / trust | confidence |
| competition / awareness | aspiration |
| family / trust | belonging |
| member story | empathy |

Userが感情を明示した場合は優先。ただし恐怖、罪悪感等は禁止へ変換する。

## 8. Platform Defaults

| Platform | Aspect | Duration |
| --- | --- | --- |
| Instagram Reel | 9:16 | 15 or 30 |
| TikTok | 9:16 | 15 or 30 |
| YouTube Shorts | 9:16 | 30 or 60 |
| Website Hero | responsive master | 6 to 15 loop-safe |
| LINE | 9:16 or 1:1 | 10 to 30 |
| Advertising | platform-specific | 6, 15 or 30 |

Provider capabilitiesがdurationを制約する場合、Adapter前にcompatibility planを返す。

Duration rules:

- 1〜120秒の整数を受け付ける。「15秒」「30s」「30 sec」と単純な整数分を扱う。
- platformがある場合、明示尺をPlatformPlan.duration_secondsへ反映する。
- platformがない場合もrequested_duration_secondsへ保持し、platformsはnullのままでよい。
- 尺未指定時はrequested_duration_secondsをnullとし、Platform既定尺と区別する。
- 0、上限外、小数、複合表記など安全に解釈できない値はnullとし、assumptionsへ理由を残す。質問は増やさない。

## 9. Knowledge Tags

Routerは次のtag familiesを返す。

- brand
- target
- story
- mode
- motion
- platform
- objective
- provider
- learning

Example:

    brand:constitution
    brand:dictionary:safety
    target:women_beginners
    story:first_step
    mode:image_to_video
    platform:instagram_reel
    objective:trial
    learning:women_beginners:approved

## 10. Quality Profile

- standard_creative
- people_i2v
- minor_i2v
- original_character
- combat
- facility
- event_facts

Profileは必要なblockerとNegative categoriesを決める。

## 11. CTA Policy

- objective awareness / trust and story emphasis: pure_brand
- objective profile_visit / line_add: soft_conversion
- objective trial / enrollment: explicit_trial pending approval
- event: soft_conversion with verified facts

Routerはcta_approval_requiredも返す。pending approvalのCTAはtrueとし、Human Approval前に承認済み扱いしない。

## 12. Confidence

各fieldを0〜1で返す。

- 0.90以上: explicit
- 0.70〜0.89: strong inference
- 0.50〜0.69: default with assumption
- 0.50未満: clarification候補

confidenceが低いだけでは質問しない。誤りが安全、費用、権利、外部事実へ影響する場合だけ質問する。

## 13. Clarification

Required:

- minor consent
- event date/source
- which person to animate
- medical/legal claim
- paid batch budget at execution

Not required:

- camera
- lighting
- music
- lens
- Negative Prompt
- platform ratio
- default duration

## 14. AGENTS Routing

AGENTS.mdは巨大Knowledgeを含めず、作業種別から読むDesign fileを選ぶrouting tableだけを持つ。実行時のContent RouterはTypeScript pure functionsとし、AGENTS.mdの文章判断だけに依存しない。

## 15. Determinism

- 同一input、同一asset metadata、同一router versionで同一decision
- LLM補助を追加してもrule baselineを上書きせず、proposalとして比較
- test fixturesはclock、randomness、external dataを固定
