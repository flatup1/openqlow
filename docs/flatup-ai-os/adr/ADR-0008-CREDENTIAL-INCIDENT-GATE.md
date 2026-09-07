# ADR-0008: Credential Incident Gate

Status: Accepted as security gate; remediation pending
Date: 2026-08-14

## Context

監査でGit管理外の旧ブリーフィングに本番相当の資格情報が平文記載されていることを確認した。

## Decision

- 該当sourceをquarantine
- affected credentialsをrotate
- Production Integrationをrotation完了まで禁止
- scannerは値を表示せずpathとtypeだけ報告
- archiveとhistoryも検査

## Alternatives

- Git外なので無視
- ファイル削除だけ
- 実装完了後に対応

## Consequences

- Phase開始前の追加作業が必要。
- 削除だけでは漏洩済みcredentialを無効化できない。
- Design Packへ値を転記しない。
