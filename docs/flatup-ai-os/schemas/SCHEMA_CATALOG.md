# Schema Catalog

Version: 1.3.0-design
Purpose: Claude Codeが実装する論理Schema。言語やstorageへ依存しない。

## 1. General Rules

- 全recordにschema_version、id、created_at、created_byを持たせる。
- timestampはUTC ISO 8601。表示時だけAsia/Tokyoへ変換する。
- recordは原則append-only。修正はsupersedes_idで新recordを作る。
- raw metric、AI prediction、human decisionを同じfieldへ入れない。
- unknownと0を区別する。
- moneyはcurrencyとminor unitまたはdecimal stringを持つ。
- IDへ氏名、LINE user ID、電話番号を入れない。

ID prefix:

| Entity | Prefix |
| --- | --- |
| request | req_ |
| content | cnt_ |
| asset | ast_ |
| brief | brf_ |
| prompt | prm_ |
| batch | bat_ |
| attempt | gen_ |
| publication | pub_ |
| metric snapshot | met_ |
| experiment | exp_ |
| learning | lrn_ |
| approval | apr_ |
| report | rpt_ |

## 2. CreativeInput

Required:

- request_id
- raw_text
- input_channel: cli, web, owner_line, api, fixture
- assets
- requested_at

Optional hints:

- target_hint
- objective_hint
- platform_hint
- duration_hint_seconds
- aspect_ratio_hint
- content_mode_hint
- budget_limit

AssetRef:

- asset_id
- uri
- sha256
- media_type
- source_type
- contains_person
- contains_minor
- consent_status: confirmed, missing, not_required, unknown
- consent_reference
- retention_class

Invariant: contains_minorがtrueでconsent_statusがconfirmed以外なら、人物を生成Providerへ渡せない。

## 3. RouteDecision

- route_id
- request_id
- intent: create, animate, repurpose, announce, analyze, experiment
- target_primary
- target_secondary
- objective: awareness, trust, profile_visit, line_add, trial, enrollment, event, retention
- content_mode: live_action, image_to_video, animation, text_to_video, edit_only
- platforms
- requested_duration_seconds: integer or null
- emotional_goal
- required_knowledge_tags
- quality_profile
- cta_policy
- cta_approval_required: boolean
- confidence_by_field
- assumptions
- clarification_required
- clarification_reasons
- router_version

Duration invariants:

- explicit structured duration hint > explicit duration in raw text > null
- supported explicit duration is an integer from 1 through 120 seconds; a simple whole-minute value may be converted to seconds
- platform未指定でも、明示された尺はrequested_duration_secondsへ型付きで保持する
- requested_duration_secondsがnon-nullでPlatformPlanがある場合、各planのduration_secondsと一致させる
- 0、上限外、小数、複合表記等を安全に解釈できない場合は例外を出さずnullとし、元の表記と理由をassumptionsへ残す
- 未指定時のPlatform既定尺をrequested_duration_secondsへ書き戻さない

CTA invariant: cta_policyがHuman Approval待ちならcta_approval_requiredはtrue。承認済みと誤認させない。

Target enum begins with:

- kids
- kids_parents
- women_beginners
- women_30_40
- men_beginners
- inactive_men
- senior
- parents
- family
- sparring_fans
- competition
- event
- facility
- instructor
- member_story
- general_beginner

Invariant: target_primaryは必須。明示がなければgeneral_beginnerではなく、入力と素材から最も妥当なtargetを選びconfidenceを残す。

## 4. KnowledgeEntry

- knowledge_id
- title
- category: constitution, dictionary, target, creative, provider, learning, policy, canon_reference
- tags
- authority: owner_canon, machine_canon, approved_policy, validated_learning, approved_reference, draft, historical
- repository
- source_path
- source_hash
- version
- status: active, review_due, conflicted, missing, deprecated, quarantined
- valid_from
- reviewed_at
- review_due_at
- owner
- contains_pii
- contains_secrets
- prompt_priority
- token_budget_hint
- conflicts_with
- supersedes

Invariant:

- draft、historical、quarantinedはfactsとしてPromptへ入れない。
- contains_secretsがtrueなら取得不可。
- conflict解消前は両方を注入せず、人間確認へ回す。
- source_hashがnull、またはsource verification未完了ならactiveにしない。
- content、body、text、secret等のsource本文fieldをKnowledgeEntryへ持たせない。

KnowledgeQueryResult:

- selected: metadata only
- withheld: metadata + reason
- missing_required
- warnings
- conflicts
- blocked
- blocked_reason
- owner_approval_required
- token_total
- registry_version

## 5. CreativeBrief

- brief_id
- request_id
- route_id
- target
- objective
- person_context
  - fear
  - frustration
  - desire
  - barrier
- emotional_goal_one
- emotional_arc
- story_role_of_flatup
- story_beats
- hero_moment
- visual_mode
- shot_plan
- audio_intent
- cta_policy
- CTA draft
- reuse_plan
- experiment_hypothesis
- assumptions
- knowledge_references
- predicted_emotional_score
- version_bundle

Invariant:

- `KnowledgeQueryResult.blocked`がtrue、またはBrand Constitutionが利用不能なら作成しない。
- emotional_goal_oneは1つ。
- hero_momentは1つ。
- targetとobjectiveは必須。
- FLATUPを主人公にしない。
- kids系はchild_surfaceとparent_deep_layerを両方持つ。

## 6. PredictedEmotionalScore

- model_or_rule_version
- scored_at
- confidence
- axes
  - safety
  - joy
  - empathy
  - hope
  - brand_fit
  - memorability
  - action_motivation
  - child_retention
  - parent_trust
  - trial_intent
- total_100
- reasons
- warnings

Invariant: measured_metricsへcopyしない。名前にpredictedを残す。

## 7. PromptIR

- prompt_id
- brief_id
- mode
- target
- objective
- emotional_goal
- story
- hero_moment
- subject_preservation
- action
- body_mechanics
- camera
- lens
- composition
- lighting
- atmosphere
- color
- speed
- sound
- music
- continuity
- negative_categories
- duration_seconds
- aspect_ratio
- cta_editing_note
- provider_constraints
- learned_rule_references
- knowledge_references
- version_bundle

Negative categories:

- identity
- anatomy
- motion
- temporal
- environment
- brand

Invariant:

- blocked Knowledgeから作成しない。
- Provider command syntaxを含めない。
- 特定の作家、制作会社、スタジオ名を含めない。
- 参照したLearning IDを追跡する。

## 8. VersionBundle

- constitution_version
- dictionary_version
- router_version
- knowledge_registry_version
- target_knowledge_version
- prompt_engine_version
- prompt_template_version
- negative_rules_version
- metrics_schema_version
- provider_adapter_id
- provider_adapter_version
- learning_policy_version

Invariant: generation attempt作成後はimmutable。

## 9. GenerationBatch

- batch_id
- content_id
- prompt_id
- provider_id
- adapter_version
- requested_count
- budget_limit
- estimated_cost
- approval_id
- status: proposed, approved, running, partial, completed, cancelled, failed
- attempts

Invariant:

- Demo以外はapproval_id必須。
- budget_limitを超える追加attemptは再承認。

## 10. GenerationAttempt

- attempt_id
- batch_id
- provider_id
- provider_model
- provider_operation_reference
- provider_request_hash
- started_at
- completed_at
- status
- provider_cost
- currency
- output_asset_id
- technical_metadata
- error_category
- error_retryable
- quality_assessment_id
- usability: unknown, usable, rejected
- rejection_reasons

Error categories:

- auth
- balance
- rate_limit
- timeout
- provider_validation
- provider_failure
- unsafe_output
- corrupted_output
- cancelled
- unknown

Invariant: retryは新attempt。元attemptを上書きしない。

## 11. QualityAssessment

- assessment_id
- asset_id
- assessed_by: human, automated, hybrid
- blocking_checks
  - consent
  - identity
  - anatomy
  - temporal
  - environment
  - secret_or_pii
  - brand
- scored_checks
  - motion
  - technical
  - story_readability
  - emotional_goal
  - hero_moment
- passed
- rejection_reasons
- notes
- human_reviewer
- assessed_at

Invariant: blocking checkが1つでもfailならpassed=false。

## 12. ContentRecord

- content_id
- request_id
- brief_id
- master_asset_ids
- variant_asset_ids
- target
- objective
- emotional_hypothesis
- hook
- story_type
- hero_moment
- source_asset_ids
- platforms
- lifecycle_status
- experiment_id
- version_bundle
- cost_summary
- created_at

CostSummary:

- provider_cost_total
- generation_count
- failure_count
- rejected_count
- usable_count
- effective_cost_per_usable
- currency

## 13. PublicationRecord

- publication_id
- content_id
- platform
- platform_content_reference
- variant_asset_id
- hook_variant
- cta_variant
- aspect_ratio
- duration_seconds
- approved_at
- approval_id
- scheduled_at
- posted_at
- attribution_tags
- status

Invariant: postedは外部確認またはimport証跡が必要。draft_savedをpostedとしない。

## 14. MetricSnapshot

- metric_snapshot_id
- publication_id
- captured_at
- window: 24h, 72h, 7d, 28d, custom
- source: manual, csv_import, platform_api, crm_aggregate
- source_reference
- completeness
- impressions
- views
- three_second_views
- average_watch_seconds
- completion_rate
- saves
- shares
- comments
- profile_visits
- web_visits
- line_adds
- trial_inquiries
- trial_bookings
- trial_attendance
- enrollments
- notes

Invariant:

- 未取得はnull。
- manual値は入力者と日時を持つ。
- capture windowが異なるsnapshotを直接比較しない。
- enrollments等の個人識別情報は持たない。

## 15. Experiment

- experiment_id
- hypothesis
- target
- primary_metric
- guardrail_metrics
- control_content_id
- treatment_content_ids
- changed_variable_one
- constants
- start_at
- end_condition
- minimum_sample_guidance
- status
- result
- limitations
- next_action

Result:

- metric_definition
- control_value
- treatment_value
- direction
- confidence_note
- causal_claim_allowed: false

Invariant: changed_variable_oneは原則1つ。複数の場合はexploratoryと明記しValidated Learning昇格に使わない。

## 16. LearningRecord

- learning_id
- type: observation, hypothesis, validated_learning, failed_hypothesis, best_practice, anti_pattern, prompt_performance, target_insight
- statement
- scope
- target
- platform
- evidence_experiment_ids
- evidence_metric_snapshot_ids
- independent_replications
- limitations
- confidence
- status: draft, candidate, pending_approval, approved, rejected, superseded, review_due
- owner_approval_id
- effective_from
- review_due_at
- supersedes

Invariant:

- validated_learningは独立再現とowner approvalが必要。
- 1回の成功はobservationまで。
- evidenceが削除・無効化されたらreview_dueへ戻す。

## 17. ApprovalEvent

- approval_id
- event_type
- requested_by
- requested_at
- subject_type
- subject_id
- summary
- risk
- cost
- decision: pending, approved, rejected, revision_requested, expired
- decided_by
- decided_at
- decision_note
- scope_hash

Invariant: 承認後に対象内容が変わりscope_hashが変わったら再承認。

## 18. WeeklyCoachReport

- report_id
- week_start
- week_end
- data_completeness
- best
- worst
- common_patterns
- emotional_patterns
- hook_patterns
- target_findings
- trial_relationship
- learnings
- next_hypothesis
- next_content_top3
- owner_questions
- source_snapshot_ids
- generated_at

Invariant: データ不足時は結論ではなく不足を最初に表示する。

## 19. ProviderCapabilities

- provider_id
- adapter_version
- modes
- duration_min
- duration_max
- duration_steps
- aspect_ratios
- max_input_bytes
- image_mime_types
- supports_negative_prompt
- supports_seed
- supports_cancel
- price_model
- known_limitations
- verified_at
- verification_status

Invariant: verification_statusがunverifiedならProduction defaultにできない。

## 20. Effective Cost

計算:

    total_cost = 全attemptのprovider_cost合計
    usable_count = humanまたはhybrid QAでusableの件数
    effective_cost_per_usable = total_cost / usable_count

usable_countが0の場合:

- valueはnull
- reasonはno_usable_output
- dashboardでは赤表示
- 0として平均しない
