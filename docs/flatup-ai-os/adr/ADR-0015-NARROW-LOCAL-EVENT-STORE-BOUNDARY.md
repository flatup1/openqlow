# ADR-0015: Narrow Local Event Store Boundary

Status: Accepted
Date: 2026-08-29
Codex Review: 2026-08-29 = Approved

## Context

Phase 1〜3の`src/brand_growth/`は純関数だけで成立し、境界試験は「node組み込みを使わない、外部importをしない、環境を読まない」を全ファイル一律で禁止していた。

Phase 4は品質判定と成長メタデータを扱うため、CLAUDE_CODE_IMPLEMENTATION_SPEC §11とIMPLEMENTATION_BOOK §6が「configurable root」「default local runtime directory outside tracked source」「atomic append」「PII and secret guard」「schema_version」を要求する。追記だけのローカル記録には、どうしてもファイルI/Oが要る。

ここで境界を「storage/以下は自由」と広げると、後から足したファイルがファイルI/Oや環境依存を自動的に手に入れ、純粋性の保証が静かに失われる。逆に禁止のままではPhase 4の受入条件を満たせない。またAGENTS.mdの「`src/brand_growth/`は純関数のみ」という記述と、実装のstorage層が文面上矛盾していた。

初期実装では`storage/config.ts`が`process.env`と暗黙の`process.cwd()`を読んでいたため、保存先が実行環境に依存し、同じ入力でも結果が変わり得た。これはPhase 1〜3から守ってきた決定論性と相容れない。

## Decision

`src/brand_growth/`の境界を、ファイル単位の完全一致で最小限だけ開ける。

- domain logic（router / knowledge / director / prompts / quality / growth / contracts）はpureのままとする。時計、乱数、環境、I/Oを持たない。
- local fs I/Oを持ってよいのは`src/brand_growth/storage/event_store.ts`だけとする。追記専用で、書き換えと削除の関数を持たない。
- `src/brand_growth/storage/config.ts`はcaller-injectedでpureとする。基準ディレクトリ（cwd / repositoryRoot）と環境変数の束は呼び出し側が明示的に渡し、module自身は実行環境を読まない。envの既定は空、優先順位は明示root > 注入env > 渡されたcwd配下の`runtime/brand_growth`、絶対rootもcwdも無ければ`StoreConfigError`でfail closedにする。追跡対象ディレクトリ（src / port / docs / scripts / deploy / knowledge / .git）とリポジトリ直下への保存は拒否する。
- shared PII/secret guardはSSOTを再利用する。`src/shared/secret_guard.ts`と`src/shared/pii_guard.ts`だけを外部importとして許可し、brand_growth内へ検出パターンを複製しない。
- network、provider、publish、AIKA、canonical（`src/shared/canon.ts`）、safetyへは依存しない。`node:http` / `node:https` / `node:net` / `node:child_process` / `fetch(` / `XMLHttpRequest`、および`process.env`と`process.cwd(`は全ファイルで禁止する。
- 未呼出し時はOFFとする。呼ばれない限りディレクトリもファイルも作らず、1バイトも書かない。
- 許可はexact file allowlistでのみ与える。storageに新しいsiblingを足しても権限は継承されない。この不継承は`src/brand_growth/router/router.test.ts`の恒久的なnegative testで固定する。
- 将来の本番integration callerは、`resolveStoreRoot`へ**absolute cwd / repositoryRootを必須で渡す**。追跡領域保護（forbidden path検証）は基準ディレクトリが与えられて初めて効くため、これを運用条件とする。absolute rootのみでcwdを渡さない呼び出しは、Phase 4の管理者向け経路に限る。

## Alternatives

- 純関数の禁止を維持し、Phase 4の記録保存を実装しない。受入条件AT-017〜AT-022を満たせない。
- `storage/`ディレクトリ全体にファイルI/Oと環境読み取りを許可する。新しいファイルが権限を自動継承し、境界が形骸化する。
- 保存を既存の`src/state/`やLINE/publish側の仕組みへ寄せる。Codex担当領域と責務が重なり、AI協業の分担とCONFLICT_MATRIXに反する。
- SQLiteやDB migrationを導入する。SPEC §11の「least complex compatible store」に反し、依存とrollback手順が増える。
- PII/secret検出パターンをbrand_growth内へ複製する。正本が二重化し、`src/shared/`側の更新にbrand_growthだけ追随できなくなる。
- `storage/config.ts`が環境変数と作業ディレクトリを直接読む初期案を維持する。保存先が実行環境に依存し、決定論性とテストの再現性が失われる。

## Codex Review

2026-08-29、Codexの最終設計レビューで **Approved**。

- **absolute rootのみ・cwd無しの経路**: 現Phase 4では受容する。根拠は、機能がOFFであること（未呼出しなら1バイトも書かない）、呼び出し元が未接続であること、明示rootが管理側の信頼済み入力であることの3点。
  ただし**将来の本番integration callerは、追跡領域保護を必ず効かせるためabsolute cwd / repositoryRootを必須で渡す**ことを運用条件とする（Decision末尾に明記）。
- **部分文字列による境界検査**: 保守的なfail-closedとして承認する。コメント中の記述でも落ちる誤検知寄りの挙動は、見逃しより安全側であるため意図どおりとみなす。

この承認により、Phase 4のCodex側レビュー事項はクローズした。残る承認はJINによるpush / PR / merge / deployと実データ投入の判断のみ。

## Consequences

- Phase 4の記録保存が、純粋性の保証を壊さずに成立する。domain logicは引き続き同じ入力から同じ出力を返す。
- 保存先の決定は明示入力だけで決まるため、テストと本番で同じ関数を使え、原因追跡が容易になる。基準が無い場合は黙って既定へ落ちず停止する。
- 呼び出し側は基準ディレクトリを自分で決める責任を負う。追跡領域の保護を効かせるにはcwdを渡す必要がある。
- 境界を広げるにはallowlistへの追記が要り、その追記自体がテストで検知される。無自覚な拡張ができない。
- 秘密情報と個人情報の検知は`src/shared/`の正本に追随する。正本側の変更がbrand_growthの保存判定へそのまま効く。
- ファイルI/Oは`event_store.ts`の1ファイルに閉じるため、監査対象が小さいままになる。原子的追記はPOSIXの`O_APPEND`に依存し、ネットワークFSでは保証されない。
- AGENTS.mdの「pure」は、storage adapterのexact例外を伴う形へ更新する。network / API / payment / publishの禁止は変更しない。
